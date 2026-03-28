# Backend Development Guide

Last updated: 2026-03-28

This guide covers backend development patterns for the Staffora HRIS API built with Bun, Elysia.js, and PostgreSQL.

---

## Architecture Overview

The API lives in `packages/api/` and follows a modular plugin-based architecture:

```
packages/api/src/
  app.ts              -- Main entry point (Elysia app, plugin/route registration)
  worker.ts           -- Background job processor entry point
  plugins/            -- Elysia plugins (db, cache, auth, rbac, audit, etc.)
  modules/            -- Feature modules (120 modules)
  jobs/               -- Background workers (outbox, export, notification, pdf, analytics)
  worker/             -- Worker runtime (scheduler, outbox-processor)
  db/                 -- Migration runner (migrate.ts)
  config/             -- Configuration (database.ts)
  lib/                -- Shared utilities (better-auth, telemetry, feature-flags)
  types/              -- TypeScript type definitions
  test/               -- All test suites
```

---

## Module Anatomy

Every backend module follows a standard 5-file pattern. Files are created in this dependency order:

```
packages/api/src/modules/{module}/
  schemas.ts       -- TypeBox validation schemas (request/response shapes)
  repository.ts    -- Database queries (postgres.js tagged templates)
  service.ts       -- Business logic (orchestrates repository calls)
  routes.ts        -- Elysia route handlers (HTTP layer)
  index.ts         -- Public exports
```

### 1. schemas.ts -- Request/Response Validation

Defines TypeBox schemas for request bodies, query parameters, path parameters, and response shapes. Elysia uses these for automatic validation and Swagger documentation.

```typescript
// packages/api/src/modules/absence/schemas.ts
import { t, type Static } from "elysia";

// Enum schemas
export const LeaveRequestStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

// Request body schema
export const CreateLeaveTypeSchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 20 }),
  name: t.String({ minLength: 1, maxLength: 100 }),
  category: t.Optional(LeaveTypeCategorySchema),
  description: t.Optional(t.String({ maxLength: 500 })),
  isPaid: t.Optional(t.Boolean({ default: true })),
  requiresApproval: t.Optional(t.Boolean({ default: true })),
});
export type CreateLeaveType = Static<typeof CreateLeaveTypeSchema>;

// Path params
export const IdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

// Query params with cursor pagination
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
```

### 2. repository.ts -- Database Access

Handles all SQL queries using postgres.js tagged templates. Receives a `DatabaseClient` instance and uses `db.withTransaction()` for tenant-scoped queries with RLS.

```typescript
// packages/api/src/modules/absence/repository.ts
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export class AbsenceRepository {
  constructor(private db: DatabaseClient) {}

  async createLeaveType(ctx: TenantContext, data: Partial<LeaveTypeRow>): Promise<LeaveTypeRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<LeaveTypeRow[]>`
        INSERT INTO app.leave_types (
          id, tenant_id, code, name, is_paid, is_active
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.code}, ${data.name},
          ${data.isPaid ?? true}, true
        )
        RETURNING *
      `;

      // Write domain event to outbox in same transaction
      await this.writeOutbox(tx, ctx.tenantId, "leave_type", id,
        "absence.leave_type.created", { leaveTypeId: id });

      return row as LeaveTypeRow;
    });
  }

  async getLeaveTypes(ctx: TenantContext): Promise<LeaveTypeRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<LeaveTypeRow[]>`
        SELECT * FROM app.leave_types
        WHERE tenant_id = ${ctx.tenantId}::uuid AND is_active = true
        ORDER BY name
      `;
      return rows as LeaveTypeRow[];
    });
  }

  // Cursor-based pagination example
  async getLeaveRequests(ctx: TenantContext, filters: Filters): Promise<PaginatedResult<LeaveRequestRow>> {
    const limit = filters.limit || 20;
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<LeaveRequestRow[]>`
        SELECT * FROM app.leave_requests
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.status ? tx`AND status = ${filters.status}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : null;
    return { data, cursor, hasMore };
  }

  // Outbox helper -- always called within the same transaction as the business write
  private async writeOutbox(
    tx: TransactionSql, tenantId: string,
    aggregateType: string, aggregateId: string,
    eventType: string, payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${tenantId}::uuid,
        ${aggregateType}, ${aggregateId}::uuid, ${eventType},
        ${JSON.stringify(payload)}::jsonb
      )
    `;
  }
}
```

### 3. service.ts -- Business Logic

Orchestrates repository calls, applies business rules, and returns `ServiceResult<T>` objects (success/error envelope).

```typescript
// packages/api/src/modules/absence/service.ts
import { AbsenceRepository, type TenantContext } from "./repository";
import type { CreateLeaveType } from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

export class AbsenceService {
  constructor(private repo: AbsenceRepository) {}

  async createLeaveType(ctx: TenantContext, input: CreateLeaveType): Promise<ServiceResult<unknown>> {
    try {
      // Business rule: normalise code to uppercase
      const normalizedCode = input.code.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      if (!/^[A-Z][A-Z0-9_]*$/.test(normalizedCode)) {
        return {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Invalid code format" },
        };
      }

      const leaveType = await this.repo.createLeaveType(ctx, {
        code: normalizedCode,
        name: input.name,
        isPaid: input.isPaid,
      } as any);
      return { success: true, data: this.formatLeaveType(leaveType) };
    } catch (error) {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create leave type" } };
    }
  }

  private formatLeaveType(type: any) {
    return {
      id: type.id,
      tenantId: type.tenantId,
      code: type.code,
      name: type.name,
      // Convert Date objects to ISO strings for JSON response
      createdAt: type.createdAt instanceof Date ? type.createdAt.toISOString() : type.createdAt,
    };
  }
}
```

### 4. routes.ts -- HTTP Handlers

Defines Elysia routes with schema validation, permission guards, and Swagger tags. Instantiates the service via `.derive()`.

```typescript
// packages/api/src/modules/absence/routes.ts
import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AbsenceRepository } from "./repository";
import { AbsenceService } from "./service";
import { CreateLeaveTypeSchema, IdParamsSchema } from "./schemas";

export const absenceRoutes = new Elysia({ prefix: "/absence", name: "absence-routes" })
  // Instantiate service per request (uses db from plugin context)
  .derive((ctx) => {
    const { db } = ctx as any;
    const repo = new AbsenceRepository(db);
    const service = new AbsenceService(repo);
    return { absenceService: service };
  })

  .get("/leave-types", async (ctx) => {
    const { absenceService, tenantContext } = ctx as any;
    const result = await absenceService.getLeaveTypes(tenantContext);
    if (!result.success) throw new Error(result.error?.message);
    return { items: result.data, nextCursor: null, hasMore: false };
  }, {
    beforeHandle: [requirePermission("absence", "read")],
    detail: { tags: ["Absence"], summary: "List leave types" },
  })

  .post("/leave-types", async (ctx) => {
    const { absenceService, tenantContext, body } = ctx as any;
    const result = await absenceService.createLeaveType(tenantContext, body);
    if (!result.success) {
      ctx.set.status = 400;
      return { error: { code: result.error?.code, message: result.error?.message } };
    }
    return result.data;
  }, {
    beforeHandle: [requirePermission("absence", "write")],
    body: CreateLeaveTypeSchema,
    detail: { tags: ["Absence"], summary: "Create leave type" },
  });
```

### 5. index.ts -- Public Exports

Barrel file that re-exports the public API of the module:

```typescript
// packages/api/src/modules/absence/index.ts
export { absenceRoutes, type AbsenceRoutes } from "./routes";
export { AbsenceService, AbsenceErrorCodes } from "./service";
export { AbsenceRepository } from "./repository";
export * from "./schemas";
```

---

## Registering a New Module

After creating the 5-file module, register its routes in `packages/api/src/app.ts`:

```typescript
// 1. Import the routes
import { myModuleRoutes } from "./modules/my-module";

// 2. Add to the /api/v1 group
.group("/api/v1", (api: any) =>
  api
    // ... existing modules ...
    .use(myModuleRoutes)    // Add your module
)
```

All routes registered here are prefixed with `/api/v1/` plus whatever prefix you set in the Elysia constructor (e.g., `/api/v1/absence/leave-types`).

---

## Plugin System

Plugins are Elysia plugins registered in a specific order in `app.ts` due to dependencies. Each plugin decorates the request context with services.

### Registration Order (Critical)

```
1. CORS                  -- Cross-origin resource sharing
2. securityHeadersPlugin -- CSP, HSTS, X-Frame-Options
3. swagger               -- API documentation at /docs
4. errorsPlugin          -- Error handling, request ID generation
5. metricsPlugin         -- Prometheus metrics at /metrics
6. tracingPlugin         -- OpenTelemetry distributed tracing
7. dbPlugin              -- PostgreSQL connection pool (DatabaseClient)
8. cachePlugin           -- Redis client (CacheClient)
9. rateLimitPlugin       -- IP-based rate limiting (depends on cache)
10. ipAllowlistPlugin    -- Admin IP allowlist
11. betterAuthPlugin     -- Better Auth at /api/auth/*
12. authPlugin           -- Session/user resolution
13. tenantPlugin         -- Tenant resolution (depends on db, cache, auth)
14. rbacPlugin           -- Permission checks (depends on db, cache, auth, tenant)
15. featureFlagsPlugin   -- Feature flag evaluation
16. idempotencyPlugin    -- Request deduplication
17. auditPlugin          -- Audit logging
```

### What Plugins Provide to Context

After plugin registration, route handlers have access to:

| Context Property | Plugin | Type | Description |
|-----------------|--------|------|-------------|
| `db` | dbPlugin | `DatabaseClient` | Database queries and transactions |
| `cache` | cachePlugin | `CacheClient` | Redis operations |
| `auth` | authPlugin | `AuthContext` | Current user and session |
| `tenantContext` | tenantPlugin | `TenantContext` | `{ tenantId, userId }` for RLS |
| `tenant` | tenantPlugin | `Tenant` | Full tenant record |
| `requestId` | errorsPlugin | `string` | Unique request identifier |

---

## Database Queries

All database access uses **postgres.js tagged templates** (not Drizzle, not raw pg).

### Tagged Template Syntax

```typescript
// Simple query
const rows = await tx`SELECT * FROM app.employees WHERE id = ${id}`;

// Conditional fragments
const rows = await tx`
  SELECT * FROM app.leave_requests
  WHERE tenant_id = ${ctx.tenantId}::uuid
  ${status ? tx`AND status = ${status}` : tx``}
  ORDER BY created_at DESC
`;
```

### Transaction Handling

```typescript
// Tenant-scoped transaction (sets RLS context automatically)
const result = await db.withTransaction(ctx, async (tx) => {
  const [emp] = await tx`INSERT INTO employees (...) VALUES (...) RETURNING *`;
  await tx`INSERT INTO domain_outbox (...) VALUES (...)`;
  return emp;
});

// System context (bypasses RLS -- use sparingly)
const result = await db.withSystemContext(async (tx) => {
  return tx`SELECT * FROM tenants`;
});
```

### camelCase Transform

The database client auto-converts between `snake_case` (database) and `camelCase` (TypeScript):

```typescript
// DB column: employee_id, created_at, is_active
// TypeScript: employeeId, createdAt, isActive
```

This is configured via `postgres.toCamel` / `postgres.fromCamel` in the `DatabaseClient` constructor.

---

## Error Handling

Services return `ServiceResult<T>`:

```typescript
interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}
```

Routes translate these to HTTP responses:

```typescript
if (!result.success) {
  ctx.set.status = result.error?.code === "NOT_FOUND" ? 404 : 400;
  return { error: { code: result.error?.code, message: result.error?.message } };
}
```

Standard error codes are defined in `packages/api/src/plugins/errors.ts` and `packages/shared/src/errors/codes.ts`.

---

## Permission Guards

Use `requirePermission()` from the RBAC plugin in route `beforeHandle`:

```typescript
.get("/leave-types", handler, {
  beforeHandle: [requirePermission("absence", "read")],
})

.post("/leave-types", handler, {
  beforeHandle: [requirePermission("absence", "write")],
})

// Sub-resource permissions
.post("/requests/:id/approve", handler, {
  beforeHandle: [requirePermission("absence:approvals", "write")],
})
```

---

## Background Workers

The worker subsystem uses Redis Streams for reliable async processing:

- **Outbox Processor**: Polls `domain_outbox` table, publishes to Redis Streams
- **Notification Worker**: Emails (nodemailer/SMTP) and push (Firebase/VAPID)
- **Export Worker**: Excel/CSV generation, S3 upload
- **PDF Worker**: Certificates, letters, case bundles (pdf-lib)
- **Analytics Worker**: Aggregates analytics data
- **Scheduler**: Cron-based jobs for reminders and cleanup

Start the worker:

```bash
bun run dev:worker
```

---

## Testing

See the [Database Guide](./database-guide.md) for RLS testing patterns and the [Coding Patterns](./coding-patterns.md) for integration test examples.

```bash
# Run all API tests
bun run test:api

# Run a specific test file
bun test packages/api/src/test/integration/rls.test.ts

# Watch mode
bun test --watch
```

Tests connect as the `hris_app` role (non-superuser, `NOBYPASSRLS`) so RLS policies are enforced during testing.

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Coding Patterns](./coding-patterns.md) — RLS, outbox, idempotency, effective dating, and state machine patterns
- [Database Guide](./database-guide.md) — Database queries, migrations, RLS, and connection management
- [API Reference](../04-api/api-reference.md) — Full endpoint specifications for all modules
- [Error Codes](../04-api/ERROR_CODES.md) — Standard error codes and messages by module
- [Worker System](../02-architecture/WORKER_SYSTEM.md) — Background jobs, Redis Streams, and outbox processing
- [Authentication](../07-security/authentication.md) — Better Auth integration and session management
- [Testing Guide](../08-testing/testing-guide.md) — Integration test patterns for RLS, idempotency, and outbox
