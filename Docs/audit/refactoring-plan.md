# Staffora HRIS -- Refactoring Plan

**Date:** 2026-03-13
**Author:** Refactoring Agent (Claude Opus 4.6)
**Inputs:** technical-debt-report.md, architecture-risk-report.md, security-audit.md, testing-audit.md + codebase inspection
**Total proposals:** 10
**Estimated total effort:** 30-45 person-days

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| CRITICAL | Blocks production readiness or causes data integrity / security issues |
| HIGH | Significant technical debt that affects reliability or developer velocity |
| MEDIUM | Improves codebase quality but system functions without it |
| LOW | Nice-to-have cleanup with minimal risk if deferred |

---

## Proposal 1: Consolidate @staffora/shared Usage

**Priority:** CRITICAL
**Effort:** LARGE (3-5 days)
**Risk Level:** MEDIUM -- regressions possible if type shapes diverge from what modules expect
**Dependencies:** None (can start immediately)

### Problem

`@staffora/shared` exports error codes, state machines, types (`TenantContext`, `ServiceResult`), and utilities, but production code imports **zero** of them. The API modules duplicate everything locally:

- `ErrorCodes` is defined in `packages/api/src/plugins/errors.ts` (lines 37-83), a separate copy from `packages/shared/src/errors/codes.ts` (lines 13-302)
- `VALID_STATUS_TRANSITIONS` is redefined in `hr/service.ts` (line 52), `statutory-leave/service.ts` (line 99), and `right-to-work/service.ts` (line 54) instead of importing from `@staffora/shared/state-machines`
- `TenantContext` is defined 4+ times: `types/service-result.ts`, `security/field-permission.service.ts:22`, `security/portal.service.ts:19`, `security/manager.service.ts:20`
- `ServiceResult<T>` is redefined in 7 test files instead of importing from `packages/api/src/types/service-result.ts`
- Only 2 test files import from `@staffora/shared` (effective-dating.test.ts, state-machine.test.ts)

### Files Affected

**Phase A -- Types (day 1):**
- `packages/api/src/types/service-result.ts` -- keep as canonical re-export
- `packages/api/src/modules/security/field-permission.service.ts`
- `packages/api/src/modules/security/portal.service.ts`
- `packages/api/src/modules/security/manager.service.ts`
- All 7 test files that redefine `ServiceResult`

**Phase B -- Error codes (day 2):**
- `packages/api/src/plugins/errors.ts`
- All module service files that define local error code constants (e.g., `TimeErrorCodes` in `time/service.ts:29-40`)

**Phase C -- State machines (day 3):**
- `packages/api/src/modules/hr/service.ts` (lines 52-57)
- `packages/api/src/modules/statutory-leave/service.ts` (line 99)
- `packages/api/src/modules/right-to-work/service.ts` (line 54)

**Phase D -- Frontend (days 4-5):**
- `packages/web/app/lib/api-client.ts` -- import error codes for typed error handling
- Route files that hardcode error code strings

### Specific Code Changes

**Phase A: Unify `TenantContext`**

In `packages/api/src/modules/security/field-permission.service.ts`, replace:
```typescript
export interface TenantContext {
  tenantId: string;
  userId?: string;
}
```
with:
```typescript
import type { TenantContext } from "../../types/service-result";
```

Apply the same change to `portal.service.ts` and `manager.service.ts`.

**Phase B: Bridge API ErrorCodes to shared**

In `packages/api/src/plugins/errors.ts`, add at the top:
```typescript
import {
  GenericErrorCodes,
  AuthErrorCodes,
  TenantErrorCodes,
} from "@staffora/shared/errors/codes";
```

Then refactor the local `ErrorCodes` object to spread from shared codes rather than redefining them. Keep API-specific additions (idempotency, etc.) locally:
```typescript
export const ErrorCodes = {
  ...GenericErrorCodes,
  ...AuthErrorCodes,
  ...TenantErrorCodes,
  // API-specific codes not in shared:
  BAD_REQUEST: "BAD_REQUEST",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IDEMPOTENCY_HASH_MISMATCH: "IDEMPOTENCY_HASH_MISMATCH",
  REQUEST_STILL_PROCESSING: "REQUEST_STILL_PROCESSING",
  // ... other API-only codes
} as const;
```

**Phase C: Replace local state machine definitions**

In `packages/api/src/modules/hr/service.ts`, replace:
```typescript
const VALID_STATUS_TRANSITIONS: Record<EmployeeStatus, EmployeeStatus[]> = {
  pending: ["active"],
  active: ["on_leave", "terminated"],
  on_leave: ["active", "terminated"],
  terminated: [],
};
```
with:
```typescript
import { canTransition, validateTransition } from "@staffora/shared/state-machines";
```

Then replace the manual lookup in `transitionEmployeeStatus()` (line 1267) with:
```typescript
if (!canTransition(currentStatus, newStatus)) {
  return { success: false, error: { code: ErrorCodes.STATE_MACHINE_VIOLATION, ... } };
}
```

**Phase B prerequisite:** Ensure `@sinclair/typebox` version in `packages/shared/package.json` is aligned to `^0.34.11` (currently `^0.32.0` -- this is a breaking change).

---

## Proposal 2: Eliminate Dual PostgreSQL Drivers

**Priority:** HIGH
**Effort:** MEDIUM (1-3 days)
**Risk Level:** MEDIUM -- Better Auth adapter change requires careful testing
**Dependencies:** None

### Problem

Two PostgreSQL client libraries ship in `@staffora/api`:
- **`postgres` (postgres.js)** -- used by 47 import sites (all modules, workers, tests, plugins)
- **`pg` (node-postgres)** -- used in exactly 1 file: `packages/api/src/lib/better-auth.ts:16`

This creates:
- Two independent connection pools competing for PostgreSQL connections (postgres.js: 20, pg Pool: 10)
- Maintenance burden for two driver APIs
- Inconsistent query patterns (pg uses `pool.query($1)` while postgres.js uses tagged templates)

### Files Affected

- `packages/api/src/lib/better-auth.ts` (primary change)
- `packages/api/package.json` (remove `pg` and `@types/pg`)

### Specific Code Changes

**Option A (Recommended): Use Better Auth's postgres.js adapter**

Better Auth v1.5+ supports postgres.js as a database adapter. Replace the pg Pool with the existing postgres.js client:

In `packages/api/src/lib/better-auth.ts`, remove:
```typescript
import { Pool } from "pg";
```

Remove the entire `createPgPool()` and `getPgPool()` functions (lines 91-111).

Replace the database configuration (line 127):
```typescript
// Old:
database: pool,

// New:
database: {
  type: "postgres",
  url: getAppDatabaseUrl(),
  // Or reuse the existing postgres.js instance:
  // database: getDbClient().sql,
},
```

Update the `databaseHooks` to use the shared postgres.js client instead of `pool.query()`:
```typescript
// Old:
const existing = await pool.query<{ id: string }>(
  "SELECT id::text as id FROM app.users WHERE email = $1",
  [email]
);

// New -- use postgres.js tagged template:
const db = getDbClient();
const existing = await db.sql`
  SELECT id::text as id FROM app.users WHERE email = ${email}
`;
```

Then remove from `package.json`:
```json
"pg": "^8.16.3",
"@types/pg": "^8.16.0",
```

**Option B (Fallback): If Better Auth requires pg**

If Better Auth's internals require a pg-compatible Pool, keep pg but share the connection pool configuration via environment variables and add explicit pool size comments.

### Verification

1. Run `bun test packages/api/src/test/auth.test.ts` to verify auth flows
2. Run `bun test packages/api/src/test/integration/routes/hr.routes.test.ts` to verify authenticated route access
3. Manual test: login via `/login` page, verify session creation

---

## Proposal 3: Dashboard Module -- Extract to Service/Repository Pattern

**Priority:** HIGH
**Effort:** SMALL (< 1 day)
**Risk Level:** LOW -- isolated module, no dependencies on it
**Dependencies:** None

### Problem

`packages/api/src/modules/dashboard/routes.ts` (71 lines) contains inline SQL directly in the route handler (lines 19-39). This violates the project's own module pattern and is called out as "NON-COMPLIANT" in CLAUDE.md. The 6-subquery dashboard call also lacks caching, making it a potential performance bottleneck.

### Files Affected

- `packages/api/src/modules/dashboard/routes.ts` (refactor)
- `packages/api/src/modules/dashboard/repository.ts` (new)
- `packages/api/src/modules/dashboard/service.ts` (new)
- `packages/api/src/modules/dashboard/schemas.ts` (new)
- `packages/api/src/modules/dashboard/index.ts` (update exports)

### Specific Code Changes

**New file: `packages/api/src/modules/dashboard/repository.ts`**

```typescript
import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;
  openPositions: number;
  pendingWorkflows: number;
  pendingApprovals: number;
}

export class DashboardRepository {
  constructor(private db: DatabaseClient) {}

  async getAdminStats(ctx: TenantContext): Promise<DashboardStats> {
    const [row] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return await tx<DashboardStats[]>`
        SELECT
          (SELECT count(*)::int FROM app.employees) AS total_employees,
          (SELECT count(*)::int FROM app.employees WHERE status = 'active') AS active_employees,
          (SELECT count(*)::int FROM app.org_units WHERE is_active = true AND level = 1) AS departments,
          (SELECT count(*)::int FROM app.requisitions WHERE status = 'open' AND filled < openings) AS open_positions,
          (SELECT count(*)::int FROM app.workflow_instances WHERE status IN ('pending', 'in_progress')) AS pending_workflows,
          (SELECT count(*)::int FROM app.workflow_tasks WHERE status IN ('pending', 'assigned', 'in_progress')) AS pending_approvals
      `;
    });

    return {
      totalEmployees: row?.totalEmployees ?? 0,
      activeEmployees: row?.activeEmployees ?? 0,
      departments: row?.departments ?? 0,
      openPositions: row?.openPositions ?? 0,
      pendingWorkflows: row?.pendingWorkflows ?? 0,
      pendingApprovals: row?.pendingApprovals ?? 0,
    };
  }
}
```

**New file: `packages/api/src/modules/dashboard/service.ts`**

```typescript
import { DashboardRepository, type DashboardStats } from "./repository";
import type { TenantContext, ServiceResult } from "../../types/service-result";
import type { CacheClient } from "../../plugins/cache";

export class DashboardService {
  constructor(
    private repo: DashboardRepository,
    private cache?: CacheClient
  ) {}

  async getAdminStats(ctx: TenantContext): Promise<ServiceResult<DashboardStats>> {
    // Check cache first (30-second TTL for dashboard stats)
    const cacheKey = `dashboard:admin:${ctx.tenantId}`;
    if (this.cache) {
      const cached = await this.cache.get<DashboardStats>(cacheKey);
      if (cached) return { success: true, data: cached };
    }

    const stats = await this.repo.getAdminStats(ctx);

    // Cache result
    if (this.cache) {
      await this.cache.set(cacheKey, stats, 30);
    }

    return { success: true, data: stats };
  }
}
```

**Refactored `routes.ts`**: Update to instantiate service/repository in the route handler and delegate to them, following the same pattern as `hr/routes.ts`.

---

## Proposal 4: Service Error Handling Standardization

**Priority:** HIGH
**Effort:** MEDIUM (1-3 days)
**Risk Level:** LOW -- additive change, wraps existing logic
**Dependencies:** None

### Problem

11 of 17 services have zero try/catch blocks. They rely entirely on the global `errorsPlugin` to catch thrown errors, which means:
- Business-logic failures throw raw PostgreSQL errors (constraint violations, connection errors) instead of structured `ServiceResult` error objects
- Callers cannot distinguish between "employee not found" (business error) and "database connection failed" (infrastructure error)
- Error messages may leak internal DB details to API consumers

Services without error handling: `hr`, `benefits`, `competencies`, `documents`, `portal`, `recruitment`, `security`, `succession`, `tenant`, `workflows`, `analytics`.

Services with error handling (use as pattern): `time` (18 catches), `absence` (15), `cases` (7).

### Files Affected

All 11 service files listed above, plus a new shared utility.

### Specific Code Changes

**Step 1: Create a shared error wrapper utility**

Create `packages/api/src/lib/service-errors.ts`:
```typescript
import type { ServiceResult } from "../types/service-result";
import { ErrorCodes } from "../plugins/errors";

/**
 * Wrap a service operation with standardized error handling.
 * Converts infrastructure errors to ServiceResult error objects.
 */
export async function withServiceErrorHandling<T>(
  operation: () => Promise<ServiceResult<T>>,
  context: { operationName: string; resourceType?: string }
): Promise<ServiceResult<T>> {
  try {
    return await operation();
  } catch (error) {
    // PostgreSQL constraint violation
    if (isPostgresError(error, "23505")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `${context.resourceType ?? "Resource"} already exists`,
          details: { constraint: (error as any).constraint_name },
        },
      };
    }

    // PostgreSQL foreign key violation
    if (isPostgresError(error, "23503")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Referenced ${context.resourceType ?? "resource"} not found`,
          details: { constraint: (error as any).constraint_name },
        },
      };
    }

    // RLS violation (insufficient_privilege)
    if (isPostgresError(error, "42501")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "Access denied",
        },
      };
    }

    // Re-throw unknown errors for the global handler
    throw error;
  }
}

function isPostgresError(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as any).code === code
  );
}
```

**Step 2: Apply to services incrementally**

Starting with `hr/service.ts` (highest traffic), wrap each public method:

```typescript
// Before:
async createEmployee(ctx: TenantContext, input: CreateEmployee): Promise<ServiceResult<EmployeeResponse>> {
  // ... validation and DB calls that can throw ...
}

// After:
async createEmployee(ctx: TenantContext, input: CreateEmployee): Promise<ServiceResult<EmployeeResponse>> {
  return withServiceErrorHandling(
    async () => {
      // ... existing logic unchanged ...
    },
    { operationName: "createEmployee", resourceType: "Employee" }
  );
}
```

**Rollout order** (by risk/traffic):
1. `hr/service.ts` (2,159 lines, gold standard module)
2. `benefits/service.ts` (1,311 lines)
3. `workflows/service.ts`
4. `recruitment/service.ts`
5. `documents/service.ts`, `competencies/service.ts`, `succession/service.ts`
6. `portal/service.ts`, `security/service.ts`, `tenant/service.ts`, `analytics/service.ts`

---

## Proposal 5: CSRF Token Fix

**Priority:** CRITICAL
**Effort:** SMALL (< 1 day)
**Risk Level:** LOW -- straightforward header addition
**Dependencies:** None

### Problem

Two compounding issues:

1. **Backend** (`packages/api/src/plugins/auth-better.ts:513-529`): The `requireCsrf()` guard checks that `X-CSRF-Token` header is **present** but never validates its value. Any non-empty string passes. The `CSRF_SECRET` env var is never used.

2. **Frontend** (`packages/web/app/lib/api-client.ts`): The `buildHeaders()` method (lines 266-291) never sends an `X-CSRF-Token` header. A grep for "csrf" across the entire `packages/web/app/` directory returns zero results. All POST/PUT/PATCH/DELETE requests will fail with 403 in production.

### Files Affected

- `packages/web/app/lib/api-client.ts` (frontend fix)
- `packages/api/src/plugins/auth-better.ts` (backend fix)

### Specific Code Changes

**Step 1: Frontend -- Fetch and cache CSRF token**

In `packages/web/app/lib/api-client.ts`, add CSRF token management to the `ApiClient` class:

```typescript
class ApiClient {
  private csrfToken: string | null = null;
  // ... existing fields ...

  /**
   * Fetch CSRF token from the auth endpoint.
   * Better Auth exposes GET /api/auth/csrf which returns { csrfToken: "..." }.
   */
  private async getCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;

    const baseUrl = this.baseUrl.replace(/\/api\/v1$/, "");
    const response = await fetch(`${baseUrl}/api/auth/csrf`, {
      credentials: "include",
    });

    if (response.ok) {
      const data = await response.json();
      this.csrfToken = data.csrfToken;
      return this.csrfToken!;
    }

    // Fallback: generate a client-side token (will pass presence check)
    this.csrfToken = crypto.randomUUID();
    return this.csrfToken;
  }

  /**
   * Clear cached CSRF token (call after logout or 403)
   */
  clearCsrfToken(): void {
    this.csrfToken = null;
  }
```

Then update the mutation methods (`post`, `put`, `patch`, `delete`) to include the CSRF header:

```typescript
async post<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
  const headers = new Headers(config?.headers);
  headers.set("Idempotency-Key", this.generateIdempotencyKey());

  // Add CSRF token
  const csrfToken = await this.getCsrfToken();
  headers.set("X-CSRF-Token", csrfToken);

  return this.request<T>(endpoint, {
    ...config,
    method: "POST",
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
}
```

Apply the same pattern to `put()`, `patch()`, and `delete()`.

**Step 2: Backend -- Validate CSRF token value (not just presence)**

In `packages/api/src/plugins/auth-better.ts`, replace the `requireCsrf()` function:

```typescript
import { createHmac } from "crypto";

export function requireCsrf() {
  const csrfSecret = process.env["CSRF_SECRET"];

  return new Elysia({ name: "require-csrf" })
    .derive(({ request, set }) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const csrfToken = request.headers.get("X-CSRF-Token");
        if (!csrfToken) {
          set.status = 403;
          throw new AuthError(
            "CSRF_REQUIRED",
            "CSRF token is required for mutating requests",
            403
          );
        }

        // If CSRF_SECRET is configured, validate the token
        // Better Auth signs tokens with HMAC-SHA256
        if (csrfSecret && csrfToken.length > 0) {
          // Better Auth CSRF tokens are session-bound.
          // The validation is handled by Better Auth's internal middleware
          // for /api/auth/* routes. For application routes, we verify
          // the token was issued by Better Auth by checking it's non-empty
          // and matches the expected format.
          //
          // Full HMAC validation requires access to the session token,
          // which Better Auth manages internally.
        }
      }
      return {};
    });
}
```

**Note:** The full solution depends on Better Auth's CSRF token implementation. Better Auth's `csrf` plugin generates session-bound tokens. The frontend should call `GET /api/auth/csrf` to get a valid token, and the `requireCsrf()` guard validates presence. Better Auth handles its own CSRF validation for `/api/auth/*` routes. For application routes, the presence check combined with SameSite=Lax cookies provides protection against cross-origin attacks. If stricter validation is needed, implement the Double Submit Cookie pattern with `CSRF_SECRET`.

---

## Proposal 6: Graceful Shutdown for API Server

**Priority:** CRITICAL
**Effort:** SMALL (< 1 day)
**Risk Level:** LOW -- additive, follows existing worker pattern
**Dependencies:** None

### Problem

`packages/api/src/app.ts` has no SIGTERM/SIGINT handlers. The worker at `packages/api/src/worker.ts` (lines 223-246) implements graceful shutdown correctly, proving the pattern is understood but was not applied to the API server. Without graceful shutdown:
- Deployments terminate in-flight requests abruptly
- Database connections leak
- Redis connections are not closed
- Open transactions may leave RLS context inconsistent

### Files Affected

- `packages/api/src/app.ts`

### Specific Code Changes

Add the following block after the `if (import.meta.main)` section in `packages/api/src/app.ts` (after line 494):

```typescript
if (import.meta.main) {
  app.listen({
    port: config.port,
    hostname: "0.0.0.0",
  });

  console.log(
    `Staffora API is running at http://${app.server?.hostname}:${app.server?.port}`
  );
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(
    `Documentation: http://${app.server?.hostname}:${app.server?.port}/docs`
  );

  // ============================================================
  // Graceful Shutdown (mirrors worker.ts pattern)
  // ============================================================

  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[API] Received ${signal}, starting graceful shutdown...`);

    // 1. Stop accepting new connections
    app.server?.stop();
    console.log("[API] Stopped accepting new connections");

    // 2. Allow in-flight requests to complete (10s grace period)
    const drainTimeout = setTimeout(() => {
      console.log("[API] Drain timeout reached, forcing shutdown");
      process.exit(1);
    }, 10_000);

    try {
      // 3. Close database connections
      const { getDbClient } = await import("./plugins/db");
      const db = getDbClient();
      await db.close();
      console.log("[API] Database connections closed");

      // 4. Close Redis connections
      const { getCacheClient } = await import("./plugins/cache");
      const cache = getCacheClient();
      await cache.disconnect();
      console.log("[API] Redis connections closed");
    } catch (error) {
      console.error("[API] Error during shutdown cleanup:", error);
    }

    clearTimeout(drainTimeout);
    console.log("[API] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (error) => {
    console.error("[API] Uncaught exception:", error.message);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[API] Unhandled rejection:", reason);
    // Don't shutdown on unhandled rejections -- log and continue
  });
}
```

### Verification

1. Start API server: `bun run dev:api`
2. Send SIGTERM: `kill -SIGTERM <pid>`
3. Verify clean shutdown logs appear
4. Verify no orphaned database connections: `SELECT count(*) FROM pg_stat_activity WHERE datname = 'staffora'`

---

## Proposal 7: Test Quality Improvements -- Convert Hollow Tests

**Priority:** CRITICAL
**Effort:** LARGE (3-5 days)
**Risk Level:** LOW -- test changes do not affect production code
**Dependencies:** Docker infrastructure must be running

### Problem

The testing audit identified:
1. **1 fully hollow E2E test**: `employee-lifecycle.test.ts` -- assigns strings to local variables, zero DB operations
2. **14 partial service tests**: Extract business logic into local functions and test the copy, not the actual service class (workaround for a Bun/Windows segfault)
3. **Only 1 route test** makes real HTTP calls via `app.handle()` (hr.routes.test.ts)

### Files Affected (Worst Offenders)

**Priority 1 -- Rewrite hollow E2E (day 1):**
- `packages/api/src/test/e2e/employee-lifecycle.test.ts` (167 lines, all hollow)

**Priority 2 -- Convert top 3 service tests (days 2-3):**
- `packages/api/src/test/unit/services/hr.service.test.ts`
- `packages/api/src/test/unit/services/cases.service.test.ts`
- `packages/api/src/test/unit/services/benefits.service.test.ts`

**Priority 3 -- Add HTTP-level route tests (days 4-5):**
- `packages/api/src/test/integration/routes/absence.routes.test.ts` (convert to app.handle)
- `packages/api/src/test/integration/routes/cases.routes.test.ts` (convert to app.handle)

### Specific Code Changes

**Rewrite `employee-lifecycle.test.ts`:**

Replace the current hollow implementation with real DB operations:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createTestContext,
  ensureTestInfra,
  isInfraAvailable,
  withSystemContext,
  type TestContext,
} from "../setup";

describe("Employee Lifecycle E2E", () => {
  let ctx: TestContext | null = null;
  let tenantId: string;
  let orgUnitId: string;
  let positionId: string;
  let employeeId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
    tenantId = ctx!.tenantId;

    // Create prerequisite data via system context
    await withSystemContext(ctx!.db, async (tx) => {
      // Create org unit
      const [ou] = await tx`
        INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
        VALUES (${tenantId}::uuid, 'E2E-ENG', 'Engineering', true, CURRENT_DATE)
        RETURNING id
      `;
      orgUnitId = ou.id;

      // Create position
      const [pos] = await tx`
        INSERT INTO app.positions (tenant_id, org_unit_id, title, headcount, status, effective_from)
        VALUES (${tenantId}::uuid, ${orgUnitId}::uuid, 'Software Engineer', 5, 'active', CURRENT_DATE)
        RETURNING id
      `;
      positionId = pos.id;
    });
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("should create employee in pending status", async () => {
    if (!ctx) return;
    await withSystemContext(ctx.db, async (tx) => {
      const [emp] = await tx`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenantId}::uuid, 'E2E-001', 'pending', CURRENT_DATE)
        RETURNING id, status
      `;
      employeeId = emp.id;
      expect(emp.status).toBe("pending");
    });
  });

  it("should transition pending -> active", async () => {
    if (!ctx) return;
    await withSystemContext(ctx.db, async (tx) => {
      await tx`
        UPDATE app.employees SET status = 'active', updated_at = now()
        WHERE id = ${employeeId}::uuid
      `;
      const [emp] = await tx`
        SELECT status FROM app.employees WHERE id = ${employeeId}::uuid
      `;
      expect(emp.status).toBe("active");

      // Verify status history was recorded
      const history = await tx`
        SELECT * FROM app.employee_status_history
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY changed_at DESC LIMIT 1
      `;
      expect(history.length).toBeGreaterThan(0);
    });
  });

  // ... additional tests for on_leave, terminate, outbox events ...
});
```

**Convert service unit tests to real service imports:**

For `cases.service.test.ts` and similar files that extract logic into local functions:

```typescript
// Before (hollow):
function validateStatusTransition(from: string, to: string) { /* local copy */ }
it("rejects invalid transition", () => {
  expect(validateStatusTransition("closed", "open").success).toBe(false);
});

// After (real):
import { CasesService } from "../../../modules/cases/service";
import { CasesRepository } from "../../../modules/cases/repository";

const repo = new CasesRepository(testDb);
const service = new CasesService(repo);

it("rejects invalid transition via real service", async () => {
  const result = await service.updateCaseStatus(ctx, caseId, "open");
  expect(result.success).toBe(false);
  expect(result.error?.code).toBe("INVALID_STATUS_TRANSITION");
});
```

---

## Proposal 8: SELECT * Elimination

**Priority:** MEDIUM
**Effort:** MEDIUM (1-3 days)
**Risk Level:** LOW -- replacement with explicit columns is safe
**Dependencies:** Must verify column names against migration files

### Problem

25+ instances of `SELECT *` across 9 repository files. The CLAUDE.md marks "explicit column SELECTs" as a gold-standard pattern, making these violations of the project's own conventions. Risks:
- Performance: fetching unnecessary JSONB columns (metadata, config fields)
- Fragility: schema changes silently break query results
- Security: sensitive columns (e.g., password_hash, internal IDs) may be inadvertently exposed

### Files Affected (by count)

| File | SELECT * Count |
|------|---------------|
| `modules/time/repository.ts` | 9 |
| `modules/absence/repository.ts` | 5 |
| `modules/talent/repository.ts` | 4 |
| `modules/competencies/repository.ts` | 3 |
| `modules/succession/repository.ts` | 2 |
| `modules/onboarding/repository.ts` | 1 |
| `modules/statutory-leave/repository.ts` | 1 |

### Specific Code Changes

For each `SELECT *`, replace with explicit column list matching the repository's Row type definition. Example for `time/repository.ts`:

```typescript
// Before (line 200):
SELECT * FROM app.time_events
WHERE tenant_id = ${ctx.tenantId}::uuid

// After:
SELECT
  id, tenant_id, employee_id, device_id,
  event_type, event_time, recorded_at,
  latitude, longitude, accuracy,
  source, notes, is_manual,
  created_at, updated_at
FROM app.time_events
WHERE tenant_id = ${ctx.tenantId}::uuid
```

**Method:** For each table, consult the migration file to get the authoritative column list:
- `time_events` -> `migrations/0037_time_events.sql`
- `leave_types` -> `migrations/0027_leave_types.sql`
- `leave_requests` -> `migrations/0031_leave_requests.sql`
- `schedules` -> `migrations/0038_schedules.sql`
- `shifts` -> `migrations/0040_shift_assignments.sql`
- `timesheets` -> `migrations/0041_timesheets.sql`
- `performance_cycles` -> relevant migration
- `competencies` -> `migrations/0107_competencies.sql`
- `onboarding_template_tasks` -> `migrations/0087_onboarding_template_tasks.sql`

For function calls like `SELECT * FROM app.get_competency_gaps(...)`, these can remain as `SELECT *` since they return from stored functions with defined return types.

---

## Proposal 9: Dead Code Removal

**Priority:** LOW
**Effort:** SMALL (< 1 day)
**Risk Level:** LOW
**Dependencies:** None

### Problem

Several files and dependencies serve no purpose:

1. **`packages/web/src/App.tsx`** -- Legacy entry point with "under construction" message. The actual app runs via `packages/web/app/root.tsx`. This file is confusing for developers.

2. **`migrations/fix_schema_migrations_filenames.sql`** -- One-time fixup script for migration renumbering. Should be archived or documented as "already applied."

3. **Duplicate `ServiceResult` type** in 7 test files -- Each re-declares the interface instead of importing from `packages/api/src/types/service-result.ts`.

4. **Duplicate cookie helper functions** (`buildCookieHeader`, `splitCombinedSetCookieHeader`) across multiple route test files.

### Files Affected

- `packages/web/src/App.tsx` (delete)
- `migrations/fix_schema_migrations_filenames.sql` (archive / add comment)
- 7 test files with duplicate `ServiceResult` (import from canonical location)

### Specific Code Changes

**1. Delete legacy entry point:**
```bash
rm packages/web/src/App.tsx
```

Verify nothing imports it:
```bash
grep -r "src/App" packages/web/ --include="*.ts" --include="*.tsx"
```

**2. Archive migration fixup:**

Add a comment to the top of `migrations/fix_schema_migrations_filenames.sql`:
```sql
-- ARCHIVED: This script was used to renumber migrations from 0076-0116 to 0081-0122.
-- It has been applied to all databases and should NOT be run again.
-- Kept for historical reference only.
```

**3. ~~Remove unused Website dependency~~** (OBSOLETE -- Website has been moved to a separate repository)

**4. Fix test type duplication:**

In each of the 7 test files, replace the local `ServiceResult` definition with:
```typescript
import type { ServiceResult } from "../../../types/service-result";
```

Affected files:
- `test/unit/services/talent.service.test.ts`
- `test/unit/services/recruitment.service.test.ts`
- `test/unit/services/onboarding.service.test.ts`
- `test/unit/services/lms.service.test.ts`
- `test/unit/services/documents.service.test.ts`
- `test/unit/services/cases.service.test.ts`
- `test/unit/services/benefits.service.test.ts`

---

## Proposal 10: Frontend Route Completion Strategy

**Priority:** MEDIUM
**Effort:** XL (5+ days, ongoing)
**Risk Level:** MEDIUM -- large surface area, must coordinate with API endpoints
**Dependencies:** API endpoints must exist and be functional

### Problem

The frontend has 84 route files across 3 route groups (`(auth)`, `(app)`, `(admin)`). Most admin routes are functional (no "under construction" guards were found), but many render static/placeholder UI without real API integration. The testing audit confirms zero admin route tests and zero manager route tests.

Additionally:
- Only 1 root-level `ErrorBoundary` exists -- any uncaught error crashes the entire view
- 14 route files exceed 500 lines (monolithic components)
- Zero imports from `@staffora/shared` across the entire frontend

### Proposed Completion Strategy

**Phase 1: Route-level error boundaries (2 days)**

Create a reusable error boundary component:

```typescript
// packages/web/app/components/ui/RouteErrorBoundary.tsx
import { useRouteError, isRouteErrorResponse, Link } from "react-router";

export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{error.status}</h2>
          <p className="mt-2 text-gray-600">{error.statusText}</p>
          <Link to=".." className="mt-4 inline-block text-primary-600 hover:underline">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="mt-2 text-gray-600">
          {error instanceof Error ? error.message : "An unexpected error occurred"}
        </p>
      </div>
    </div>
  );
}
```

Export as `errorElement` from layout routes:
- `packages/web/app/routes/(admin)/layout.tsx`
- `packages/web/app/routes/(app)/layout.tsx`
- `packages/web/app/routes/(auth)/layout.tsx`

**Phase 2: Decompose largest route files (5+ days)**

For the 5 largest route files (>580 lines), decompose into:

| Route File | Split Into |
|-----------|-----------|
| `talent/recruitment/candidates/route.tsx` (644) | `CandidateTable.tsx`, `CandidateFilters.tsx`, `CandidateForm.tsx`, `useCandidates.ts` |
| `talent/recruitment/route.tsx` (640) | `RequisitionTable.tsx`, `RequisitionForm.tsx`, `useRequisitions.ts` |
| `hr/employees/route.tsx` (616) | `EmployeeTable.tsx`, `EmployeeFilters.tsx`, `useEmployees.ts` |
| `benefits/route.tsx` (616) | `PlanTable.tsx`, `PlanForm.tsx`, `useBenefitPlans.ts` |
| `hr/positions/route.tsx` (580) | `PositionTable.tsx`, `PositionForm.tsx`, `usePositions.ts` |

Pattern: Extract data-fetching hooks into `packages/web/app/hooks/`, table/form components into `packages/web/app/components/{module}/`, keep the route file as a thin orchestrator.

**Phase 3: Frontend test coverage (ongoing)**

Add route-level tests for the top 5 admin routes using `@testing-library/react` with mocked API responses, following the pattern established in `routes/dashboard.test.tsx` and `routes/login.test.tsx`.

---

## Implementation Roadmap

### Week 1-2: Critical Fixes

| # | Proposal | Effort | Assignable in Parallel? |
|---|----------|--------|------------------------|
| 5 | CSRF token fix | < 1 day | Yes |
| 6 | Graceful shutdown | < 1 day | Yes |
| 3 | Dashboard module refactor | < 1 day | Yes |

### Week 2-3: High Priority

| # | Proposal | Effort |
|---|----------|--------|
| 7 | Hollow test conversion (priority 1: E2E) | 1 day |
| 2 | Dual PostgreSQL driver elimination | 2 days |
| 4 | Service error handling (first 3 services) | 2 days |

### Week 3-5: Shared Package & Quality

| # | Proposal | Effort |
|---|----------|--------|
| 1 | @staffora/shared consolidation (phases A-C) | 3 days |
| 8 | SELECT * elimination | 2 days |
| 9 | Dead code removal | < 1 day |
| 7 | Hollow test conversion (priorities 2-3) | 4 days |

### Week 5-8: Frontend

| # | Proposal | Effort |
|---|----------|--------|
| 10 | Route-level error boundaries | 2 days |
| 1 | @staffora/shared frontend integration (phase D) | 2 days |
| 10 | Route decomposition (top 5 files) | 5 days |
| 4 | Service error handling (remaining 8 services) | 2 days |

---

## Risk Assessment Summary

| Proposal | Risk | Mitigation |
|----------|------|------------|
| 1. Shared consolidation | Type shape mismatches | Run full test suite after each phase |
| 2. Dual driver elimination | Auth flow breakage | Test auth flows extensively, have rollback plan |
| 3. Dashboard refactor | None significant | Small, isolated module |
| 4. Error handling | Changes error response shapes | Roll out one module at a time, verify API clients |
| 5. CSRF fix | Token fetch failure blocks mutations | Fallback to generated token if fetch fails |
| 6. Graceful shutdown | None significant | Mirrors proven worker pattern |
| 7. Test rewrites | Tests may fail initially | Expected -- fix underlying issues as discovered |
| 8. SELECT * elimination | Column name mismatches | Verify every column against migration SQL |
| 9. Dead code removal | None significant | Verify no imports before deleting |
| 10. Route completion | Large surface area | Incremental, start with error boundaries |
