---
name: backend-module-development
description: Create Elysia.js backend modules for Staffora. Use when building new API modules, routes, services, repositories, or TypeBox schemas in packages/api/src/modules/.
---

# Backend Module Development

## Module Structure
Every module in `packages/api/src/modules/` follows this pattern:

```
modules/<module-name>/
├── index.ts      # Module exports and route registration
├── routes.ts     # Elysia route definitions with TypeBox validation
├── service.ts    # Business logic layer
├── repository.ts # Database access layer (postgres.js tagged templates)
├── schemas.ts    # TypeBox schemas for request/response validation
```

## Creating a New Module

### 1. schemas.ts

Define TypeBox schemas for request validation and response typing:

```typescript
import { t } from "elysia";

// --- Input schemas ---

export const CreateEntitySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  code: t.String({ minLength: 1, maxLength: 50 }),
  effective_from: t.String({ format: "date" }),
});

export const UpdateEntitySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ maxLength: 2000 })),
});

// --- Response schemas ---

export const EntityResponseSchema = t.Object({
  id: t.String({ format: "uuid" }),
  tenantId: t.String({ format: "uuid" }),
  code: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  isActive: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
});

// --- Filter & pagination schemas ---

export const EntityFiltersSchema = t.Object({
  search: t.Optional(t.String()),
  is_active: t.Optional(t.Boolean()),
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// --- Param & header schemas ---

export const IdParamsSchema = t.Object({
  id: t.String({ format: "uuid" }),
});

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String(),
});

// --- Inferred types ---

export type CreateEntity = typeof CreateEntitySchema.static;
export type UpdateEntity = typeof UpdateEntitySchema.static;
export type EntityFilters = typeof EntityFiltersSchema.static;
export type PaginationQuery = typeof PaginationQuerySchema.static;
```

### 2. repository.ts

The repository uses the `DatabaseClient` wrapper from the db plugin. All tenant-scoped queries go through `db.withTransaction()`, which sets the RLS context automatically. Write queries receive a `TransactionSql` from the service layer so they participate in the same transaction.

```typescript
import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateEntity,
  UpdateEntity,
  EntityFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// --- Row types ---

export interface EntityRow extends Row {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// --- Repository ---

export class EntityRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List entities with filters and cursor-based pagination.
   * Reads use db.withTransaction to set RLS context.
   */
  async findAll(
    ctx: TenantContext,
    filters: EntityFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<EntityRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

    const result = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EntityRow[]>`
        SELECT id, tenant_id, code, name, description,
               is_active, created_at, updated_at
        FROM app.entities
        WHERE 1=1
          ${filters.is_active !== undefined ? tx`AND is_active = ${filters.is_active}` : tx``}
          ${filters.search ? tx`AND (name ILIKE ${"%" + filters.search + "%"} OR code ILIKE ${"%" + filters.search + "%"})` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY name, id
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single entity by ID.
   */
  async findById(ctx: TenantContext, id: string): Promise<EntityRow | null> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EntityRow[]>`
        SELECT id, tenant_id, code, name, description,
               is_active, created_at, updated_at
        FROM app.entities
        WHERE id = ${id}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Create entity within a caller-provided transaction.
   * The service passes `tx` so insert + outbox are atomic.
   */
  async create(
    tx: TransactionSql,
    ctx: TenantContext,
    data: CreateEntity,
    createdBy: string
  ): Promise<EntityRow> {
    const rows = await tx<EntityRow[]>`
      INSERT INTO app.entities (
        tenant_id, code, name, description, effective_from, created_by
      )
      VALUES (
        ${ctx.tenantId}::uuid,
        ${data.code},
        ${data.name},
        ${data.description || null},
        ${data.effective_from}::date,
        ${createdBy}::uuid
      )
      RETURNING id, tenant_id, code, name, description,
                is_active, created_at, updated_at
    `;
    return rows[0]!;
  }

  /**
   * Update entity within a caller-provided transaction.
   */
  async update(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: UpdateEntity
  ): Promise<EntityRow> {
    const rows = await tx<EntityRow[]>`
      UPDATE app.entities
      SET
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, code, name, description,
                is_active, created_at, updated_at
    `;
    return rows[0]!;
  }
}
```

**Key patterns in the repository:**
- Read queries use `this.db.withTransaction(ctx, async (tx) => { ... })` which sets the tenant RLS context automatically.
- Write queries accept a `TransactionSql` parameter (`tx`) from the service so they participate in the same transaction as the outbox insert.
- Conditional WHERE clauses use `tx\`AND ...\`` / `tx\`\`` pattern (postgres.js tagged template fragments).
- Cursor-based pagination fetches `limit + 1` rows to determine `hasMore`.
- Row types extend `Row` from postgres.js and use camelCase (the db plugin's `transform.column` converts snake_case automatically).

### 3. service.ts

The service orchestrates business logic, runs writes inside `db.withTransaction()`, and emits domain events to the outbox in the same transaction:

```typescript
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { EntityRepository, EntityRow } from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import type {
  CreateEntity,
  UpdateEntity,
  EntityFilters,
  PaginationQuery,
} from "./schemas";

// --- Response mapping type ---

interface EntityResponse {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Domain event types ---

type DomainEventType =
  | "module.entity.created"
  | "module.entity.updated"
  | "module.entity.deleted";

// --- Service ---

export class EntityService {
  constructor(
    private repository: EntityRepository,
    private db: DatabaseClient
  ) {}

  /**
   * Emit domain event to outbox (called inside a transaction)
   */
  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: ctx.userId })}::jsonb,
        now()
      )
    `;
  }

  /**
   * List entities (delegates to repository, maps response)
   */
  async list(
    ctx: TenantContext,
    filters: EntityFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EntityResponse>> {
    const result = await this.repository.findAll(ctx, filters, pagination);

    return {
      items: result.items.map(this.mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get entity by ID
   */
  async getById(ctx: TenantContext, id: string): Promise<ServiceResult<EntityResponse>> {
    const entity = await this.repository.findById(ctx, id);

    if (!entity) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: "Entity not found", details: { id } },
      };
    }

    return { success: true, data: this.mapToResponse(entity) };
  }

  /**
   * Create entity in a transaction with outbox event
   */
  async create(
    ctx: TenantContext,
    data: CreateEntity
  ): Promise<ServiceResult<EntityResponse>> {
    // --- Pre-transaction validation ---
    // (e.g., check for duplicate code, validate references)

    // --- Transactional write ---
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const entity = await this.repository.create(
        tx,
        ctx,
        data,
        ctx.userId || "system"
      );

      // Emit domain event in the same transaction
      await this.emitEvent(tx, ctx, "entity", entity.id, "module.entity.created", {
        entity: this.mapToResponse(entity),
      });

      return entity;
    });

    return { success: true, data: this.mapToResponse(result) };
  }

  // --- Row-to-response mapper ---

  private mapToResponse = (row: EntityRow): EntityResponse => ({
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
```

**Key patterns in the service:**
- Constructor receives both the repository and the `DatabaseClient`.
- Write operations use `this.db.withTransaction(ctx, async (tx) => { ... })` which sets the RLS context and provides a `TransactionSql` to the callback.
- The outbox insert happens inside the same transaction as the business write.
- Returns `ServiceResult<T>` (with `success`, `data`, `error`) or `PaginatedServiceResult<T>` (with `items`, `nextCursor`, `hasMore`).

### 4. routes.ts

Routes use `.derive()` to instantiate the service, then destructure `tenantContext` from the Elysia request context. The `tenantContext` is injected globally by the tenant plugin.

```typescript
import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { EntityRepository } from "./repository";
import { EntityService } from "./service";
import {
  CreateEntitySchema,
  UpdateEntitySchema,
  EntityResponseSchema,
  EntityFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/**
 * Module-specific error code to HTTP status mapping
 */
const entityErrorStatusMap: Record<string, number> = {
  DUPLICATE_CODE: 409,
  INVALID_REFERENCE: 400,
};

/**
 * Entity routes plugin
 */
export const entityRoutes = new Elysia({ prefix: "/entities", name: "entity-routes" })

  // Derive service from db plugin (db is decorated by dbPlugin)
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new EntityRepository(db);
    const service = new EntityService(repository, db);
    return { entityService: service };
  })

  // GET / - List entities
  .get(
    "/",
    async (ctx) => {
      const { entityService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await entityService.list(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("entities", "read")],
      query: t.Composite([
        t.Partial(EntityFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(EntityResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Entities"],
        summary: "List entities",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get entity by ID
  .get(
    "/:id",
    async (ctx) => {
      const { entityService, params, tenantContext, error } = ctx as any;
      const result = await entityService.getById(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", entityErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("entities", "read")],
      params: IdParamsSchema,
      response: {
        200: EntityResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Entities"],
        summary: "Get entity by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Create entity
  .post(
    "/",
    async (ctx) => {
      const { entityService, body, tenantContext, audit, requestId, error, set } = ctx as any;

      const result = await entityService.create(tenantContext, body);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", entityErrorStatusMap);
        return error(status, { error: result.error });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("entities", "write")],
      headers: IdempotencyHeaderSchema,
      body: CreateEntitySchema,
      response: {
        201: EntityResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Entities"],
        summary: "Create entity",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type EntityRoutes = typeof entityRoutes;
```

**Key patterns in routes:**
- `.derive()` instantiates the repository and service from the `db` plugin.
- Destructure `tenantContext` from `ctx as any` (injected by the tenant plugin globally).
- Use `mapErrorToStatus()` from `../../lib/route-helpers` with module-specific error maps.
- Mutating endpoints require `IdempotencyHeaderSchema` in headers.
- Permissions checked via `beforeHandle: [requirePermission("resource", "action")]`.
- Set `set.status = 201` for creation responses.

### 5. index.ts

Re-export the public API of the module:

```typescript
export { entityRoutes, type EntityRoutes } from "./routes";
export { EntityService } from "./service";
export { EntityRepository, type EntityRow, type PaginatedResult, type TenantContext } from "./repository";
export type { ServiceResult, PaginatedServiceResult } from "../../types/service-result";
```

### 6. Register in app.ts

Add the module inside the `/api/v1` route group:

```typescript
import { entityRoutes } from "./modules/entity";

app.group("/api/v1", (api) =>
  api
    // ... existing modules
    .use(entityRoutes)
);
```

## Key Patterns Summary

| Concern | Pattern |
|---|---|
| **Database access** | `postgres.js` tagged template literals via `DatabaseClient` wrapper |
| **Tenant RLS** | `db.withTransaction(ctx, async (tx) => { ... })` sets `app.current_tenant` automatically |
| **Request context** | `tenantContext` from tenant plugin: `{ tenantId: string; userId?: string }` |
| **Route context** | Destructure `{ db, tenantContext, tenant, user, audit, requestId }` from `ctx as any` |
| **Service instantiation** | `.derive()` in routes creates repository + service from `db` |
| **Transactions** | Service calls `db.withTransaction(ctx, callback)`, passes `tx` to repository writes |
| **Outbox events** | Insert into `app.domain_outbox` inside the same `tx` as the business write |
| **Pagination** | Cursor-based; fetch `limit + 1` rows, return `{ items, nextCursor, hasMore }` |
| **Idempotency** | All mutating endpoints require `Idempotency-Key` header |
| **Error handling** | Services return `ServiceResult<T>`; routes use `mapErrorToStatus()` |
| **Conditional SQL** | Use `tx\`AND col = ${val}\`` / `tx\`\`` for optional WHERE clauses |
| **Column naming** | DB uses snake_case; postgres.js `transform.column` converts to camelCase in TypeScript |
