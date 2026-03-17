# Staffora HRIS -- Top 20 Implementation Plans

**Generated:** 2026-03-13
**Inputs:** feature-validation-report.md, uk-compliance-audit.md, refactoring-plan.md, architecture-risk-report.md, security-audit.md
**Scope:** 20 highest-priority missing features and fixes across security, compliance, architecture, and quality

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| P0 | Security vulnerability or data integrity issue that blocks production |
| P1 | Legal/compliance requirement with penalty risk |
| P2 | Architectural gap that affects reliability or developer velocity |
| P3 | Quality improvement that strengthens the platform |

---

## Table of Contents

1. [CSRF Token Fix (Frontend + Backend)](#plan-1)
2. [Graceful API Shutdown](#plan-2)
3. [RLS Enforcement in Production (hris_app Role)](#plan-3)
4. [Account Lockout Mechanism](#plan-4)
5. [Frontend CSRF Integration](#plan-5)
6. [Right to Work Verification Module](#plan-6)
7. [SSP Calculation Engine](#plan-7)
8. [Holiday Entitlement Enforcement](#plan-8)
9. [GDPR DSAR Endpoint](#plan-9)
10. [Pension Auto-Enrolment Basics](#plan-10)
11. [Family Leave Calculations](#plan-11)
12. [Manager Hierarchy Leave Approval Fix](#plan-12)
13. [Shared Package Consolidation](#plan-13)
14. [Migration Rollback Support](#plan-14)
15. [Structured Logging](#plan-15)
16. [Monitoring & Observability Basics](#plan-16)
17. [Auth E2E Tests](#plan-17)
18. [Real HTTP Route Tests](#plan-18)
19. [Notification / Equipment / Geofence API Modules](#plan-19)
20. [Leave Approval Table Name Fix](#plan-20)

---

<a id="plan-1"></a>
## Plan 1: CSRF Token Fix (Backend Validation)

**Priority:** P0 -- CRITICAL
**Source:** security-audit.md HIGH-01, architecture-risk-report.md R1, refactoring-plan.md Proposal 5

### 1. Problem Statement

The `requireCsrf()` guard in `packages/api/src/plugins/auth-better.ts` (lines 513-529) checks that the `X-CSRF-Token` header is **present** but never validates the token value. Any non-empty string passes. The `CSRF_SECRET` environment variable is defined in `.env.example` and validated by `secrets.ts` but is never used to sign or verify tokens. This makes the CSRF protection purely theatrical -- an attacker who can send cross-origin requests (compromised subdomain, same-site attack) can supply any arbitrary value and bypass protection entirely.

### 2. Proposed Solution

Implement proper CSRF token validation using the Double Submit Cookie pattern:
- Server generates an HMAC-SHA256 token bound to the session ID using `CSRF_SECRET`
- Token is returned via `GET /api/auth/csrf` and set as a cookie
- Frontend reads the cookie and sends it as the `X-CSRF-Token` header
- Backend validates the header value matches the cookie value and the HMAC is valid

Better Auth already exposes `GET /api/auth/csrf` which returns `{ csrfToken: "..." }`. The backend guard should validate this token rather than just checking presence.

### 3. Database Changes

None.

### 4. Backend Changes

**File: `packages/api/src/plugins/auth-better.ts`**
- Replace the `requireCsrf()` function body
- Import `createHmac` from `crypto`
- Validate token format: session-bound HMAC using `CSRF_SECRET`
- For Better Auth's own `/api/auth/*` routes, rely on Better Auth's internal CSRF validation
- For application routes (`/api/v1/*`), verify the `X-CSRF-Token` header contains a valid token that was issued by the server

```typescript
export function requireCsrf() {
  const csrfSecret = process.env["CSRF_SECRET"];

  return new Elysia({ name: "require-csrf" })
    .derive(({ request, set }) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const csrfToken = request.headers.get("X-CSRF-Token");
        if (!csrfToken) {
          set.status = 403;
          throw new AuthError("CSRF_REQUIRED", "CSRF token is required", 403);
        }

        if (csrfSecret) {
          // Validate token structure: hash.sessionFragment
          const parts = csrfToken.split(".");
          if (parts.length !== 2) {
            set.status = 403;
            throw new AuthError("CSRF_INVALID", "Invalid CSRF token format", 403);
          }
          const [hash, sessionFragment] = parts;
          const expectedHash = createHmac("sha256", csrfSecret)
            .update(sessionFragment)
            .digest("hex");
          if (hash !== expectedHash) {
            set.status = 403;
            throw new AuthError("CSRF_INVALID", "CSRF token validation failed", 403);
          }
        }
      }
      return {};
    });
}
```

**File: `packages/api/src/app.ts`**
- Ensure `requireCsrf()` is applied globally after auth plugin, before route handlers
- Add route exemptions for health/readiness endpoints and Better Auth's own routes

### 5. Frontend Changes

See Plan 5 (Frontend CSRF Integration) -- separated because it is a distinct deliverable.

### 6. Test Plan

- Unit test: `requireCsrf()` rejects missing header with 403
- Unit test: `requireCsrf()` rejects invalid HMAC with 403
- Unit test: `requireCsrf()` accepts valid HMAC-signed token
- Integration test: POST to `/api/v1/hr/employees` without CSRF token returns 403
- Integration test: POST with valid CSRF token succeeds

### 7. Acceptance Criteria

- [ ] All mutating requests without a valid CSRF token return 403
- [ ] `CSRF_SECRET` is used to validate token HMAC
- [ ] Better Auth's `/api/auth/*` routes are exempt (handled internally)
- [ ] Health/readiness endpoints are exempt
- [ ] Existing integration tests pass (they must supply valid CSRF tokens)

### 8. Effort Estimate

0.5 days

### 9. Dependencies

None (can start immediately)

### 10. Risk Assessment

**Risk:** Test suite may break if tests don't supply CSRF tokens.
**Mitigation:** Disable CSRF validation when `NODE_ENV=test` (same pattern as rate limiting), or update TestApiClient to automatically fetch and include CSRF tokens.

---

<a id="plan-2"></a>
## Plan 2: Graceful API Shutdown

**Priority:** P0 -- CRITICAL
**Source:** architecture-risk-report.md R2, refactoring-plan.md Proposal 6

### 1. Problem Statement

`packages/api/src/app.ts` has no `SIGTERM`/`SIGINT` handlers. When Docker sends SIGTERM during deployment, in-flight requests are terminated abruptly, database connections leak, Redis connections are not closed, and open transactions may leave RLS context in an inconsistent state. The worker at `packages/api/src/worker.ts` (lines 223-246) implements graceful shutdown correctly, proving the pattern is understood but was not applied to the API server.

### 2. Proposed Solution

Add signal handlers to `app.ts` that:
1. Stop accepting new connections
2. Drain in-flight requests (10-second grace period)
3. Close database connection pool
4. Close Redis connection
5. Exit cleanly

Mirror the proven pattern from `worker.ts`.

### 3. Database Changes

None.

### 4. Backend Changes

**File: `packages/api/src/app.ts`**

Add after the `if (import.meta.main)` block, after `app.listen()`:

```typescript
let isShuttingDown = false;

const shutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[API] Received ${signal}, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  app.server?.stop();
  console.log("[API] Stopped accepting new connections");

  // 2. Drain timeout
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
  // Log but don't shutdown -- unhandled rejections are non-fatal
});
```

### 5. Frontend Changes

None.

### 6. Test Plan

- Manual test: Start API, send SIGTERM, verify clean shutdown logs
- Manual test: Start API, send request, then SIGTERM, verify request completes
- Verify no orphaned connections: `SELECT count(*) FROM pg_stat_activity WHERE datname = 'staffora'`

### 7. Acceptance Criteria

- [ ] SIGTERM triggers graceful shutdown with log output
- [ ] SIGINT triggers graceful shutdown (Ctrl+C in development)
- [ ] Database connections are closed before exit
- [ ] Redis connections are closed before exit
- [ ] In-flight requests have 10 seconds to complete
- [ ] Force exit after drain timeout

### 8. Effort Estimate

0.5 days

### 9. Dependencies

None.

### 10. Risk Assessment

Low risk. The pattern is proven in `worker.ts`. The only concern is ensuring `getDbClient()` and `getCacheClient()` are safely importable in the shutdown context.

---

<a id="plan-3"></a>
## Plan 3: RLS Enforcement in Production (hris_app Role)

**Priority:** P0 -- CRITICAL
**Source:** architecture-risk-report.md R4, architecture-risk-report.md R11

### 1. Problem Statement

The `hris_app` role with `NOBYPASSRLS` exists in `docker/postgres/init.sql` and is configured in `docker-compose.yml` via `DATABASE_APP_URL`. However, the `db.ts` plugin (line 45) prefers `DATABASE_APP_URL` but falls back to `DATABASE_URL` which may use the `hris` superuser role. If `DATABASE_APP_URL` is not set in production, the API connects as `hris` (superuser, `BYPASSRLS`), completely defeating RLS tenant isolation. Additionally, the Better Auth configuration in `better-auth.ts` creates a separate `pg` Pool that always uses `DATABASE_URL` (the superuser connection), and the scheduler in `worker/scheduler.ts` creates yet another unmanaged connection.

### 2. Proposed Solution

1. Make `DATABASE_APP_URL` **required** in production -- crash on startup if not set
2. Validate at startup that the connected role has `NOBYPASSRLS`
3. Eliminate the separate `pg` Pool in Better Auth (see also architecture-risk-report.md R4 and refactoring-plan.md Proposal 2)
4. Ensure the scheduler reuses the managed connection pool

### 3. Database Changes

None (the `hris_app` role already exists in `docker/postgres/init.sql`).

### 4. Backend Changes

**File: `packages/api/src/plugins/db.ts`**
- Add validation in `loadDbConfig()` that crashes if `DATABASE_APP_URL` is not set in production
- Add a startup check that verifies the connected role cannot bypass RLS:
  ```typescript
  const [{ rolbypassrls }] = await sql`
    SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user
  `;
  if (rolbypassrls && process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Connected as a role that can bypass RLS. Use DATABASE_APP_URL with the hris_app role.');
  }
  ```

**File: `packages/api/src/config/secrets.ts`**
- Add `DATABASE_APP_URL` to the list of required production secrets

**File: `packages/api/src/lib/better-auth.ts`**
- Replace the `pg` Pool with the existing postgres.js client from `db.ts`
- Remove `pg` and `@types/pg` from `packages/api/package.json`
- Update `databaseHooks` to use postgres.js tagged templates instead of `pool.query()`

**File: `packages/api/src/worker/scheduler.ts`**
- Replace the standalone `postgres(DB_URL)` call with the shared `getDbClient()` instance

### 5. Frontend Changes

None.

### 6. Test Plan

- Unit test: `loadDbConfig()` throws in production without `DATABASE_APP_URL`
- Integration test: Verify connected role is `hris_app` with `NOBYPASSRLS`
- Run existing RLS tests (`rls.test.ts`, `rls-comprehensive.test.ts`) to verify isolation still works
- Run auth tests to verify Better Auth still works after pg Pool removal

### 7. Acceptance Criteria

- [ ] API crashes on startup in production if `DATABASE_APP_URL` is not set
- [ ] Startup log confirms connected role is `hris_app` with `NOBYPASSRLS`
- [ ] Only one PostgreSQL driver (`postgres` / postgres.js) is used -- `pg` removed from dependencies
- [ ] All connections go through the managed connection pool
- [ ] RLS integration tests pass

### 8. Effort Estimate

2 days

### 9. Dependencies

None.

### 10. Risk Assessment

**Risk:** Removing the `pg` Pool may break Better Auth's internal queries if it depends on pg-specific features.
**Mitigation:** Better Auth v1.5+ supports postgres.js as a database adapter. If the adapter is not available, use Better Auth's URL-based configuration (`database: { type: "postgres", url: DATABASE_APP_URL }`) which creates its own internal connection using the app role.

---

<a id="plan-4"></a>
## Plan 4: Account Lockout Mechanism

**Priority:** P0 -- CRITICAL
**Source:** security-audit.md HIGH-03

### 1. Problem Statement

Rate limiting exists for auth endpoints (5 login attempts per 60 seconds per IP), but there is no **account-level** lockout. An attacker using multiple IPs (botnets, proxy rotation) can perform unlimited password attempts against a single account. The `ACCOUNT_LOCKED` error code is defined in `packages/shared/src/errors/messages.ts` but never used -- no code implements actual lockout logic.

### 2. Proposed Solution

Track failed login attempts per account in the database. After 10 consecutive failed attempts, lock the account for 30 minutes. After 20 consecutive failures, lock until admin unlock. Send notification to the user on lockout. Reset the failure counter on successful login.

### 3. Database Changes

**New migration: `migrations/0123_account_lockout.sql`**

```sql
-- Track failed login attempts for account lockout
CREATE TABLE IF NOT EXISTS app.login_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    ip_address inet,
    user_agent text,
    success boolean NOT NULL DEFAULT false,
    failure_reason text
);

CREATE INDEX idx_login_attempts_user_recent
    ON app.login_attempts (user_id, attempted_at DESC);

-- Add lockout fields to users table
ALTER TABLE app.users
    ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz,
    ADD COLUMN IF NOT EXISTS lock_reason text;

-- No RLS on login_attempts -- accessed via system context only
-- (auth operations happen before tenant context is established)
```

### 4. Backend Changes

**File: `packages/api/src/lib/better-auth.ts`**
- Add `databaseHooks.user.update.before` hook that checks lockout status before allowing login
- In the `emailAndPassword` section, add `onSignInAttempt` logic:
  - Query `failed_login_count` and `locked_until` for the user
  - If `locked_until > now()`, reject with `ACCOUNT_LOCKED` error
  - On failed login: increment `failed_login_count`, set `locked_until` if threshold reached
  - On successful login: reset `failed_login_count` and clear `locked_until`

**New file: `packages/api/src/lib/account-lockout.ts`**
- `checkAccountLockout(userId: string): Promise<{ locked: boolean; unlockAt?: Date }>`
- `recordFailedAttempt(userId: string, ip: string): Promise<{ locked: boolean; failedCount: number }>`
- `recordSuccessfulLogin(userId: string): Promise<void>`
- `adminUnlockAccount(userId: string): Promise<void>`
- Constants: `LOCKOUT_THRESHOLD = 10`, `LOCKOUT_DURATION_MINUTES = 30`, `PERMANENT_LOCKOUT_THRESHOLD = 20`

**File: `packages/api/src/modules/security/routes.ts`**
- Add `POST /api/v1/security/users/:id/unlock` endpoint (requires `security:admin` permission)

### 5. Frontend Changes

**File: `packages/web/app/routes/(auth)/login/route.tsx`**
- Handle `ACCOUNT_LOCKED` error code in login form
- Display lockout message with remaining duration

### 6. Test Plan

- Unit test: Account locks after 10 failed attempts
- Unit test: Locked account rejects login
- Unit test: Account unlocks after 30-minute timeout
- Unit test: Successful login resets failure counter
- Unit test: Admin unlock clears lockout
- Integration test: Rate limiting + account lockout work together

### 7. Acceptance Criteria

- [ ] Account locks after 10 consecutive failed login attempts
- [ ] Locked account returns `ACCOUNT_LOCKED` error with unlock time
- [ ] Auto-unlock after 30 minutes
- [ ] Permanent lock after 20 consecutive failures (requires admin unlock)
- [ ] Successful login resets failure counter
- [ ] Admin can unlock accounts via API
- [ ] Login form displays lockout message

### 8. Effort Estimate

2 days

### 9. Dependencies

None.

### 10. Risk Assessment

**Risk:** The lockout mechanism could be used for denial-of-service by intentionally locking out legitimate users.
**Mitigation:** Use a 30-minute auto-unlock window (not permanent on first threshold). Add CAPTCHA after 3 failed attempts as a future enhancement. Notify user via email when their account is locked so they can alert IT.

---

<a id="plan-5"></a>
## Plan 5: Frontend CSRF Integration

**Priority:** P0 -- CRITICAL
**Source:** architecture-risk-report.md R1, refactoring-plan.md Proposal 5

### 1. Problem Statement

The frontend API client at `packages/web/app/lib/api-client.ts` never sends an `X-CSRF-Token` header. The `buildHeaders()` method (lines 266-291) only injects `Content-Type`, `Accept`, and `X-Tenant-ID`. A grep for "csrf" across `packages/web/app/` returns zero results. Every POST/PUT/PATCH/DELETE request from the frontend will fail with 403 once backend CSRF validation is enforced (Plan 1).

### 2. Proposed Solution

Add CSRF token fetching and caching to the `ApiClient` class. On first mutating request, fetch the token from `GET /api/auth/csrf`. Cache it in memory. Include it as the `X-CSRF-Token` header on all mutating requests. Clear the cache on 403 responses (token may have expired) and on logout.

### 3. Database Changes

None.

### 4. Backend Changes

None (handled by Plan 1).

### 5. Frontend Changes

**File: `packages/web/app/lib/api-client.ts`**

Add to the `ApiClient` class:

```typescript
private csrfToken: string | null = null;

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

  // Fallback: generate a client-side token
  this.csrfToken = crypto.randomUUID();
  return this.csrfToken;
}

clearCsrfToken(): void {
  this.csrfToken = null;
}
```

Update `post()`, `put()`, `patch()`, `delete()` methods to include the CSRF header:

```typescript
async post<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<T> {
  const csrfToken = await this.getCsrfToken();
  const headers = new Headers(config?.headers);
  headers.set("X-CSRF-Token", csrfToken);
  headers.set("Idempotency-Key", this.generateIdempotencyKey());
  // ... rest of existing logic
}
```

Update the 403 error handler to clear the CSRF token cache so it is re-fetched:

```typescript
if (response.status === 403) {
  this.clearCsrfToken();
}
```

**File: `packages/web/app/lib/auth.ts`**
- On logout, call `api.clearCsrfToken()` to clear the cached token

### 6. Test Plan

- Unit test: `getCsrfToken()` fetches token on first call and caches it
- Unit test: `getCsrfToken()` returns cached token on subsequent calls
- Unit test: `clearCsrfToken()` forces re-fetch
- Unit test: `post()` includes `X-CSRF-Token` header
- Unit test: 403 response clears CSRF token cache

### 7. Acceptance Criteria

- [ ] All POST/PUT/PATCH/DELETE requests include `X-CSRF-Token` header
- [ ] CSRF token is fetched from `/api/auth/csrf` and cached
- [ ] 403 responses trigger token re-fetch on next request
- [ ] Logout clears CSRF token cache
- [ ] No CSRF header sent on GET requests

### 8. Effort Estimate

0.5 days

### 9. Dependencies

Plan 1 (Backend CSRF validation) should be implemented first or concurrently.

### 10. Risk Assessment

**Risk:** CSRF token fetch fails due to network issues, blocking all mutations.
**Mitigation:** Fallback to a generated UUID which will pass the presence check. Add retry logic for the CSRF token fetch.

---

<a id="plan-6"></a>
## Plan 6: Right to Work Verification Module

**Priority:** P1 -- CRITICAL COMPLIANCE
**Source:** uk-compliance-audit.md Section 1, feature-validation-report.md UKC-009

### 1. Problem Statement

UK employers must verify every employee's right to work before employment begins (Immigration, Asylum and Nationality Act 2006). Failure carries unlimited fines and up to 5 years imprisonment. The `employee_identifiers` table stores document types (`passport`, `national_id`) and the field registry defines `work_permit_number` and `work_permit_expiry`, but there is no verification status tracking, no document check workflow, no follow-up scheduling for time-limited permissions, and no integration with the Home Office online checking service.

Note: The feature validation report indicates a `right-to-work` module directory exists at `packages/api/src/modules/right-to-work/`. This plan covers completing any gaps.

### 2. Proposed Solution

Build a complete RTW verification module with:
- Check types: manual (List A/B documents), online (share code), IDVT
- Status workflow: pending -> verified -> expired -> failed
- Automated expiry alerts at 90/60/30 days
- Compliance dashboard showing verification status across all employees
- Block employee activation if RTW check is not verified

### 3. Database Changes

**New migration: `migrations/0123_right_to_work.sql`** (if not already present)

```sql
CREATE TYPE app.rtw_check_type AS ENUM ('manual_list_a', 'manual_list_b', 'online_share_code', 'idvt');
CREATE TYPE app.rtw_status AS ENUM ('pending', 'verified', 'expired', 'failed');

CREATE TABLE IF NOT EXISTS app.right_to_work_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    check_type app.rtw_check_type NOT NULL,
    check_date date NOT NULL,
    document_type text NOT NULL,
    document_reference text,
    share_code text,
    expiry_date date,
    status app.rtw_status NOT NULL DEFAULT 'pending',
    verified_by uuid REFERENCES app.users(id),
    verified_at timestamptz,
    next_check_date date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.right_to_work_checks ENABLE ROW LEVEL SECURITY;
-- Standard tenant isolation policies
```

### 4. Backend Changes

**Directory: `packages/api/src/modules/right-to-work/`**
- `schemas.ts`: TypeBox schemas for create/update check, query params
- `repository.ts`: CRUD operations, expiry queries, compliance summary
- `service.ts`: Business logic -- validate check type against document type, schedule next check, block employee activation without verified RTW
- `routes.ts`: REST endpoints:
  - `POST /api/v1/right-to-work/checks` -- Create check
  - `GET /api/v1/right-to-work/checks/:employeeId` -- Get checks for employee
  - `PATCH /api/v1/right-to-work/checks/:id/verify` -- Mark as verified
  - `GET /api/v1/right-to-work/expiring` -- Expiring checks (30/60/90 days)
  - `GET /api/v1/right-to-work/compliance-dashboard` -- Overall compliance stats

**File: `packages/api/src/modules/hr/service.ts`**
- In `transitionEmployeeStatus()`: Block `pending -> active` transition if no verified RTW check exists

**File: `packages/api/src/worker/scheduler.ts`**
- Add cron job for RTW expiry alerts: daily scan for checks expiring within 90 days
- Emit `rtw.check.expiring` domain event for notification worker

### 5. Frontend Changes

**New route: `packages/web/app/routes/(admin)/hr/right-to-work/route.tsx`**
- RTW compliance dashboard
- Employee RTW check list with filters by status
- Create/verify check forms

**File: `packages/web/app/routes/(admin)/hr/employees/[employeeId]/route.tsx`**
- Add RTW check tab to employee detail view

### 6. Test Plan

- Unit test: RTW check creation with validation
- Unit test: Block employee activation without verified RTW
- Unit test: Expiry detection at 30/60/90 days
- Integration test: RLS isolation for RTW checks
- Integration test: Employee activation blocked without RTW

### 7. Acceptance Criteria

- [ ] RTW checks can be created with type (manual List A/B, online, IDVT)
- [ ] Check status workflow: pending -> verified -> expired
- [ ] Employee cannot transition from `pending` to `active` without verified RTW
- [ ] Expiring checks appear in dashboard at 30/60/90 day thresholds
- [ ] Domain events emitted for expiry alerts
- [ ] RLS enforces tenant isolation on RTW data

### 8. Effort Estimate

3 days (2 backend, 1 frontend)

### 9. Dependencies

None (RTW module directory may already exist with partial implementation).

### 10. Risk Assessment

**Risk:** Blocking employee activation on RTW check may break existing workflows where RTW is not yet verified.
**Mitigation:** Make the activation block configurable per tenant (`settings.rtw_enforcement: boolean`). Default to warning-only mode initially.

---

<a id="plan-7"></a>
## Plan 7: SSP Calculation Engine

**Priority:** P1 -- CRITICAL COMPLIANCE
**Source:** uk-compliance-audit.md Section 3, feature-validation-report.md UKC-010

### 1. Problem Statement

UK employers must pay Statutory Sick Pay (SSP) for up to 28 weeks at the prescribed rate (currently GBP 116.75/week for 2024-25). The system has a `sick` leave category but no SSP calculation engine: no waiting day logic (first 3 qualifying days unpaid), no linking of Periods of Incapacity for Work (PIW) within 8 weeks, no lower earnings limit check, no 28-week maximum tracking, and no fit note tracking.

Note: The feature validation report indicates an `ssp` module directory exists at `packages/api/src/modules/ssp/`. This plan covers completing any gaps.

### 2. Proposed Solution

Build an SSP calculation engine as a dedicated module that integrates with the existing absence/leave system:
- Qualifying day determination from employee work pattern
- 3 waiting-day logic
- PIW linking (sickness within 8 weeks of previous PIW counts as continuation)
- LEL check against employee compensation
- 28-week maximum tracking per PIW
- Fit note tracking with 7-day self-certification threshold
- SSP1 form data generation when 28-week limit reached

### 3. Database Changes

**New migration: `migrations/0124_ssp_engine.sql`** (if not already present)

```sql
CREATE TABLE IF NOT EXISTS app.ssp_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    leave_request_id uuid REFERENCES app.leave_requests(id),
    piw_id uuid,  -- Links records in same Period of Incapacity for Work
    qualifying_days_per_week integer NOT NULL DEFAULT 5,
    waiting_days_served integer NOT NULL DEFAULT 0,
    ssp_days_paid integer NOT NULL DEFAULT 0,
    daily_rate numeric(10,2) NOT NULL,
    weekly_rate numeric(10,2) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    is_linked boolean NOT NULL DEFAULT false,
    linked_to_piw_id uuid,
    lel_qualified boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.fit_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    ssp_record_id uuid REFERENCES app.ssp_records(id),
    issue_date date NOT NULL,
    start_date date NOT NULL,
    end_date date,
    condition text,
    fit_for_some_work boolean NOT NULL DEFAULT false,
    adjustments text,
    doctor_name text,
    is_self_cert boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies for both tables
ALTER TABLE app.ssp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fit_notes ENABLE ROW LEVEL SECURITY;
-- Standard tenant isolation policies
```

### 4. Backend Changes

**Directory: `packages/api/src/modules/ssp/`**
- `schemas.ts`: TypeBox schemas
- `repository.ts`: SSP record CRUD, PIW queries, fit note management
- `service.ts`: SSP calculation engine:
  - `calculateSSPEntitlement(employeeId, sicknessPeriod)` -- core calculation
  - `checkLELQualification(employeeId)` -- lower earnings limit check
  - `linkPIW(employeeId, startDate)` -- check for PIW linking within 8 weeks
  - `calculateWaitingDays(piwStart, qualifyingDays)` -- 3 waiting-day logic
  - `trackSSPWeeks(piwId)` -- 28-week maximum tracking
  - `generateSSP1Data(employeeId)` -- SSP1 form data when limit reached
- `routes.ts`: REST endpoints
- SSP rate constants with version dating (rate changes annually)

**File: `packages/api/src/modules/absence/service.ts`**
- When a sick leave request is approved, trigger SSP calculation
- Link to SSP record

### 5. Frontend Changes

**New route: `packages/web/app/routes/(admin)/absence/ssp/route.tsx`**
- SSP dashboard showing current PIWs, waiting days, paid weeks
- Fit note management
- SSP1 form generation

### 6. Test Plan

- Unit test: 3 waiting days calculated correctly
- Unit test: PIW linking within 8 weeks
- Unit test: 28-week maximum enforced
- Unit test: LEL check against employee earnings
- Unit test: Fit note self-certification threshold (7 days)
- Unit test: SSP rate calculation (daily rate = weekly rate / qualifying days)
- Integration test: End-to-end sick leave -> SSP calculation

### 7. Acceptance Criteria

- [ ] SSP calculated automatically when sick leave is recorded
- [ ] 3 waiting days before SSP payment begins
- [ ] PIW linking for sickness within 8 weeks of previous PIW
- [ ] 28-week maximum SSP tracked per PIW
- [ ] LEL check prevents SSP for low-earning employees
- [ ] Fit notes tracked with self-cert vs medical cert distinction
- [ ] SSP rates configurable and version-dated

### 8. Effort Estimate

4 days

### 9. Dependencies

Absence/leave module must be functional (it is).

### 10. Risk Assessment

**Risk:** SSP rates change annually; hardcoded rates become stale.
**Mitigation:** Store rates in a database table with effective dates, or use a configuration file with version dating. Document the rate update process.

---

<a id="plan-8"></a>
## Plan 8: Holiday Entitlement Enforcement

**Priority:** P1 -- HIGH COMPLIANCE
**Source:** uk-compliance-audit.md Section 2, feature-validation-report.md ALM-001

### 1. Problem Statement

The Working Time Regulations 1998 require all UK workers receive at least 5.6 weeks (28 days for full-time) paid annual leave. The system has a robust leave management infrastructure (`leave_types`, `leave_policies`, `leave_balances`, `leave_accrual_rules`, `leave_balance_ledger`, pro-rata calculation function), but there is no enforcement that `default_balance >= 28` for UK workers, no automatic pro-rata calculation based on FTE, and no bank holiday treatment configuration.

### 2. Proposed Solution

Add UK-specific statutory minimum validation:
1. When creating/updating leave policies with `country_code = 'GBR'`, validate `default_balance >= 28` (or pro-rata equivalent)
2. Add a compliance check function that scans all UK employees for below-minimum entitlement
3. Add bank holiday treatment configuration (included in / additional to statutory entitlement)
4. Add pro-rata calculation linking FTE to statutory minimum

### 3. Database Changes

**New migration: `migrations/0125_holiday_compliance.sql`**

```sql
-- Add bank holiday treatment to leave_policies
ALTER TABLE app.leave_policies
    ADD COLUMN IF NOT EXISTS bank_holiday_treatment text
        CHECK (bank_holiday_treatment IN ('included', 'additional'))
        DEFAULT 'included';

-- Add statutory minimum flag
ALTER TABLE app.leave_policies
    ADD COLUMN IF NOT EXISTS is_statutory_minimum boolean NOT NULL DEFAULT false;
```

### 4. Backend Changes

**File: `packages/api/src/modules/absence/service.ts`**
- In `createLeavePolicy()` and `updateLeavePolicy()`:
  - If `country_code = 'GBR'` and category is `annual`, validate `default_balance >= 28` (or pro-rata based on FTE)
  - Emit warning if below statutory minimum but allow save (with override flag)
- Add `checkHolidayCompliance(tenantId)`:
  - Scan all UK employees
  - Compare their annual leave entitlement against statutory minimum (5.6 * contracted days per week, max 28)
  - Return compliance report with non-compliant employees

**File: `packages/api/src/modules/absence/routes.ts`**
- Add `GET /api/v1/absence/compliance/holiday-entitlement` endpoint
- Add query param for bank holiday treatment override

### 5. Frontend Changes

**File: `packages/web/app/routes/(admin)/leave/policies/route.tsx`**
- Add bank holiday treatment dropdown (included / additional) to policy form
- Show warning when policy balance is below statutory minimum for UK
- Add compliance check button linking to compliance report

### 6. Test Plan

- Unit test: Policy creation rejects balance < 28 for GBR
- Unit test: Pro-rata calculation: 3 days/week worker gets 16.8 days minimum
- Unit test: Bank holiday treatment toggle
- Unit test: Compliance scan identifies non-compliant employees
- Integration test: End-to-end policy creation with UK validation

### 7. Acceptance Criteria

- [ ] Leave policies for UK (`country_code = 'GBR'`) warn if balance < 28
- [ ] Pro-rata minimum calculated from employee FTE/contracted days
- [ ] Bank holiday treatment configurable per policy
- [ ] Compliance report shows all non-compliant UK employees
- [ ] Override flag allows saving below-minimum policies with explicit acknowledgement

### 8. Effort Estimate

2 days

### 9. Dependencies

Absence module must be functional (it is).

### 10. Risk Assessment

**Risk:** Existing tenants may have policies below 28 days. Strict enforcement would break existing configurations.
**Mitigation:** Implement as warnings (not blocking) by default. Add a `strict_uk_compliance` tenant setting that controls whether validation is a warning or error.

---

<a id="plan-9"></a>
## Plan 9: GDPR DSAR Endpoint

**Priority:** P1 -- HIGH COMPLIANCE
**Source:** security-audit.md MEDIUM-03, uk-compliance-audit.md Section 7.3, feature-validation-report.md UKC-002

### 1. Problem Statement

GDPR Article 15 requires that data subjects can request a copy of all their personal data within 30 days. The platform has no Data Subject Access Request (DSAR) workflow, no data compilation endpoint, and no response deadline management. For a UK HRIS handling employee PII, this is a significant compliance gap that could result in ICO enforcement and fines up to GBP 17.5 million.

### 2. Proposed Solution

Build a DSAR management system with:
- DSAR request creation and tracking with 30-day deadline
- Automated data compilation from all modules
- Identity verification step
- Data export as structured JSON
- Audit trail for all DSAR operations
- Extension tracking (up to 2 additional months for complex requests)

### 3. Database Changes

**New migration: `migrations/0126_dsar.sql`**

```sql
CREATE TYPE app.dsar_status AS ENUM (
    'received', 'identity_verification', 'in_progress',
    'review', 'completed', 'rejected', 'extended'
);

CREATE TABLE IF NOT EXISTS app.dsar_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    requested_by uuid NOT NULL REFERENCES app.users(id),
    status app.dsar_status NOT NULL DEFAULT 'received',
    request_date date NOT NULL DEFAULT CURRENT_DATE,
    deadline_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    extended_deadline_date date,
    extension_reason text,
    identity_verified boolean NOT NULL DEFAULT false,
    identity_verified_by uuid,
    identity_verified_at timestamptz,
    completed_at timestamptz,
    data_export_path text,
    rejection_reason text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.dsar_requests ENABLE ROW LEVEL SECURITY;
-- Standard tenant isolation policies
```

### 4. Backend Changes

**New directory: `packages/api/src/modules/gdpr/`**
- `schemas.ts`: TypeBox schemas for DSAR requests
- `repository.ts`: DSAR CRUD, deadline queries
- `service.ts`:
  - `createDSAR(employeeId)` -- Create request with 30-day deadline
  - `compilePersonalData(employeeId)` -- Aggregate data from all modules:
    - `employees` -- core record
    - `employee_personal` -- personal details
    - `employee_contacts` -- contact info
    - `employee_addresses` -- addresses
    - `employee_identifiers` -- ID documents
    - `employment_contracts` -- employment terms
    - `compensation_history` -- pay history
    - `leave_requests` -- leave history
    - `leave_balances` -- leave balances
    - `time_events` -- clock events
    - `case_comments` (where employee is subject)
    - `audit_log` (where user is the subject)
    - `notifications` -- notifications
    - `documents` (employee's documents)
  - `verifyIdentity(dsarId, verifiedBy)` -- Mark identity verified
  - `completeDSAR(dsarId, exportPath)` -- Mark complete with data export
  - `extendDeadline(dsarId, reason)` -- Extend by up to 2 months
- `routes.ts`:
  - `POST /api/v1/gdpr/dsar` -- Create DSAR request
  - `GET /api/v1/gdpr/dsar` -- List DSARs with status filter
  - `GET /api/v1/gdpr/dsar/:id` -- Get DSAR details
  - `POST /api/v1/gdpr/dsar/:id/verify-identity` -- Verify identity
  - `POST /api/v1/gdpr/dsar/:id/compile` -- Trigger data compilation
  - `POST /api/v1/gdpr/dsar/:id/complete` -- Mark complete
  - `POST /api/v1/gdpr/dsar/:id/extend` -- Extend deadline
  - `GET /api/v1/gdpr/dsar/:id/export` -- Download compiled data

**File: `packages/api/src/worker/scheduler.ts`**
- Add daily cron job to check for DSAR deadline breaches
- Emit `gdpr.dsar.deadline_approaching` event at 7 and 3 days before deadline

### 5. Frontend Changes

**New route: `packages/web/app/routes/(admin)/settings/gdpr/route.tsx`**
- DSAR management dashboard
- Request list with status, deadline, days remaining
- Detail view with compilation trigger and export download
- Identity verification workflow

### 6. Test Plan

- Unit test: DSAR creation sets 30-day deadline
- Unit test: Data compilation aggregates from all modules
- Unit test: Extension adds up to 2 months
- Unit test: Deadline breach detection
- Integration test: RLS ensures DSAR data is tenant-scoped
- Integration test: End-to-end DSAR flow

### 7. Acceptance Criteria

- [ ] DSAR requests can be created with automatic 30-day deadline
- [ ] Identity verification step before data compilation
- [ ] Data compiled from all employee-related tables
- [ ] Export as structured JSON
- [ ] Deadline extension up to 2 additional months with reason
- [ ] Approaching-deadline alerts at 7 and 3 days
- [ ] Audit trail for all DSAR operations

### 8. Effort Estimate

4 days

### 9. Dependencies

All employee data modules must be functional (they are).

### 10. Risk Assessment

**Risk:** Data compilation may be slow for employees with extensive history.
**Mitigation:** Run compilation as a background job via the export worker. Return a job ID and notify when complete.

---

<a id="plan-10"></a>
## Plan 10: Pension Auto-Enrolment Basics

**Priority:** P1 -- CRITICAL COMPLIANCE
**Source:** uk-compliance-audit.md Section 10, feature-validation-report.md UKC-014

### 1. Problem Statement

UK employers must automatically enrol eligible jobholders (aged 22 to state pension age, earning above GBP 10,000/year) into a qualifying workplace pension scheme. The benefits module has a `retirement` category and employee/employer contribution fields, but there is no automatic eligibility assessment, no auto-enrolment trigger, no opt-out window management, no qualifying earnings band calculation, no minimum contribution rate enforcement, and no re-enrolment processing. Failure to comply carries TPR fines and potential criminal prosecution.

### 2. Proposed Solution

Build a pension auto-enrolment engine that:
- Assesses employee eligibility based on age and earnings
- Automatically enrols eligible jobholders
- Tracks opt-out windows (1 month from enrolment)
- Calculates qualifying earnings band and minimum contributions
- Manages 3-yearly re-enrolment
- Stores assessment history for audit

### 3. Database Changes

**New migration: `migrations/0127_pension_auto_enrolment.sql`**

```sql
CREATE TYPE app.pension_worker_category AS ENUM (
    'eligible_jobholder',    -- Age 22-SPA, earning > GBP 10,000
    'non_eligible_jobholder', -- Age 16-74, earning > LEL but < trigger
    'entitled_worker'        -- Age 16-74, earning < LEL
);

CREATE TYPE app.pension_enrolment_status AS ENUM (
    'not_assessed', 'eligible', 'enrolled', 'opted_out',
    'opted_in', 'ceased', 're_enrolled'
);

CREATE TABLE IF NOT EXISTS app.pension_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    assessment_date date NOT NULL DEFAULT CURRENT_DATE,
    annual_earnings numeric(12,2) NOT NULL,
    age_at_assessment integer NOT NULL,
    worker_category app.pension_worker_category NOT NULL,
    enrolment_status app.pension_enrolment_status NOT NULL DEFAULT 'not_assessed',
    auto_enrolment_date date,
    opt_out_deadline date,
    opted_out_at timestamptz,
    re_enrolment_due date,
    employee_contribution_pct numeric(5,2) DEFAULT 5.0,
    employer_contribution_pct numeric(5,2) DEFAULT 3.0,
    qualifying_earnings_lower numeric(12,2),
    qualifying_earnings_upper numeric(12,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.pension_assessments ENABLE ROW LEVEL SECURITY;
-- Standard tenant isolation policies
```

### 4. Backend Changes

**New directory: `packages/api/src/modules/pension/`**
- `schemas.ts`: TypeBox schemas
- `repository.ts`: Assessment CRUD, eligibility queries
- `service.ts`:
  - `assessEligibility(employeeId)` -- Determine worker category
  - `autoEnrol(employeeId)` -- Trigger auto-enrolment with opt-out window
  - `processOptOut(employeeId)` -- Handle opt-out within window
  - `processOptIn(employeeId)` -- Handle non-eligible opt-in
  - `calculateContributions(employeeId, earnings)` -- Calculate based on qualifying earnings band
  - `checkReEnrolment(tenantId)` -- Scan for 3-yearly re-enrolment
  - Earnings thresholds as configurable constants (updated annually)
- `routes.ts`:
  - `GET /api/v1/pension/assessments` -- List assessments
  - `POST /api/v1/pension/assess/:employeeId` -- Assess individual
  - `POST /api/v1/pension/assess-all` -- Batch assessment
  - `POST /api/v1/pension/enrol/:employeeId` -- Manual enrolment
  - `POST /api/v1/pension/opt-out/:employeeId` -- Process opt-out
  - `GET /api/v1/pension/compliance-dashboard` -- Compliance stats

**File: `packages/api/src/worker/scheduler.ts`**
- Monthly cron for new employee eligibility assessment
- 3-yearly re-enrolment scan
- Opt-out window expiry notifications

### 5. Frontend Changes

**New route: `packages/web/app/routes/(admin)/benefits/pension/route.tsx`**
- Pension auto-enrolment dashboard
- Employee eligibility list with bulk assessment
- Opt-out tracking
- Contribution configuration

### 6. Test Plan

- Unit test: Eligibility assessment (eligible jobholder, non-eligible, entitled worker)
- Unit test: Age boundary cases (21 vs 22, SPA boundary)
- Unit test: Earnings threshold (below/above GBP 10,000)
- Unit test: Opt-out window calculation (1 month from enrolment)
- Unit test: Minimum contribution rates enforced (5% employee, 3% employer)
- Unit test: Qualifying earnings band calculation
- Integration test: Batch assessment across tenant employees

### 7. Acceptance Criteria

- [ ] Employees assessed and categorised correctly by age and earnings
- [ ] Eligible jobholders auto-enrolled with opt-out window
- [ ] Opt-out processed within 1-month window
- [ ] Minimum contributions enforced (8% total: 5% employee + 3% employer)
- [ ] Qualifying earnings band applied to contribution calculation
- [ ] 3-yearly re-enrolment scheduling
- [ ] Compliance dashboard shows enrolment status across workforce

### 8. Effort Estimate

5 days

### 9. Dependencies

Benefits module must be functional (it is). Compensation history needed for earnings assessment.

### 10. Risk Assessment

**Risk:** Earnings thresholds change annually. Tax year boundaries must be handled correctly.
**Mitigation:** Store thresholds in a database configuration table with effective dates. Document the annual update process.

---

<a id="plan-11"></a>
## Plan 11: Family Leave Calculations

**Priority:** P1 -- CRITICAL COMPLIANCE
**Source:** uk-compliance-audit.md Section 4, feature-validation-report.md UKC-011

### 1. Problem Statement

UK employers must provide statutory maternity (52 weeks, 39 paid), paternity (2 weeks), shared parental (up to 50 weeks), adoption, and parental bereavement leave with associated statutory pay calculations. The `leave_type_category` enum includes `parental` and `bereavement`, and a `statutory-leave` module directory exists, but the UK-specific calculations (SMP 6 weeks at 90% + 33 weeks at statutory rate, qualifying service checks, KIT days, etc.) are incomplete.

### 2. Proposed Solution

Extend the existing statutory-leave module with:
- Maternity: SMP calculation, 26-week qualifying service check, MATB1 tracking, KIT days (10 max), compulsory leave enforcement
- Paternity: SPP calculation, 2-week entitlement within 56 days of birth
- Shared Parental: SPL booking, curtailment notice, ShPP calculation
- Adoption: SAP mirroring maternity
- Parental Bereavement: 2-week entitlement, SPBP calculation

### 3. Database Changes

**New migration: `migrations/0128_family_leave.sql`**

```sql
CREATE TYPE app.family_leave_type AS ENUM (
    'maternity', 'paternity', 'shared_parental',
    'adoption', 'parental_bereavement'
);

CREATE TABLE IF NOT EXISTS app.family_leave_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES app.tenants(id),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    leave_type app.family_leave_type NOT NULL,
    expected_date date NOT NULL,     -- EWC for maternity, placement for adoption
    actual_date date,                -- Actual birth/placement date
    qualifying_service_weeks integer,
    qualifies_for_pay boolean NOT NULL DEFAULT false,
    pay_start_date date,
    pay_weeks_90pct integer DEFAULT 0,
    pay_weeks_statutory integer DEFAULT 0,
    statutory_weekly_rate numeric(10,2),
    kit_days_used integer DEFAULT 0,
    kit_days_max integer DEFAULT 10,
    compulsory_leave_end date,
    curtailment_date date,           -- For maternity curtailment (SPL)
    matb1_received boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.family_leave_entitlements ENABLE ROW LEVEL SECURITY;
-- Standard tenant isolation policies
```

### 4. Backend Changes

**File: `packages/api/src/modules/statutory-leave/service.ts`**
- `calculateSMP(employeeId, ewc)` -- 6 weeks at 90% + 33 weeks at statutory rate
- `calculateSPP(employeeId, birthDate)` -- 2 weeks at statutory rate
- `calculateShPP(employeeId, curtailmentDate)` -- Based on remaining SMP weeks
- `checkQualifyingService(employeeId, qualifyingWeek)` -- 26 weeks continuous service by 15th week before EWC
- `trackKITDays(entitlementId, days)` -- Max 10 KIT days
- `processMaternityLeave(employeeId, ewc)` -- Full workflow
- `processPaternityLeave(employeeId, birthDate)` -- Full workflow
- `processSPLBooking(employeeId, booking)` -- SPL notice and booking

**File: `packages/api/src/modules/statutory-leave/routes.ts`**
- `POST /api/v1/statutory-leave/maternity` -- Start maternity leave process
- `POST /api/v1/statutory-leave/paternity` -- Start paternity leave
- `POST /api/v1/statutory-leave/shared-parental` -- Book SPL
- `POST /api/v1/statutory-leave/:id/kit-day` -- Record KIT day
- `GET /api/v1/statutory-leave/:id/pay-calculation` -- Pay calculation

### 5. Frontend Changes

**New route: `packages/web/app/routes/(admin)/leave/family/route.tsx`**
- Family leave management dashboard
- Maternity/paternity/SPL application forms
- Pay calculation display
- KIT day tracker

### 6. Test Plan

- Unit test: SMP calculation (6 weeks at 90%, 33 at statutory, capped)
- Unit test: Qualifying service check (26 weeks by QW)
- Unit test: KIT day tracking (max 10)
- Unit test: Compulsory maternity leave (2 weeks)
- Unit test: Paternity leave within 56-day window
- Unit test: SPL calculation from maternity curtailment
- Integration test: End-to-end maternity leave flow

### 7. Acceptance Criteria

- [ ] SMP calculated correctly (6 weeks at 90% average earnings + 33 weeks at statutory rate)
- [ ] Qualifying service checked (26 weeks by 15th week before EWC)
- [ ] KIT days tracked (max 10)
- [ ] Compulsory maternity leave enforced (2 weeks minimum)
- [ ] Paternity leave constrained to 2 weeks within 56 days of birth
- [ ] SPL booking with curtailment notice tracking
- [ ] Pay calculations available for all family leave types

### 8. Effort Estimate

5 days

### 9. Dependencies

Absence module and compensation history must be functional (they are).

### 10. Risk Assessment

**Risk:** Statutory pay rates change annually. Complex qualifying service calculations may have edge cases.
**Mitigation:** Store rates in configuration with effective dates. Build extensive unit tests for edge cases (multiple employments, breaks in service, etc.).

---

<a id="plan-12"></a>
## Plan 12: Manager Hierarchy Leave Approval Fix

**Priority:** P2 -- HIGH
**Source:** feature-validation-report.md, architecture-risk-report.md

### 1. Problem Statement

The manager service in `packages/api/src/modules/security/manager.service.ts` uses `app.leave_approvals` table (lines 428, 499) which exists in `migrations/0053_leave_approvals.sql`. The approval logic joins on `app.manager_subordinates` to verify the approver is the employee's manager. However, the approval flow does not:
1. Support multi-level approval chains (e.g., HR must also approve leave > 5 days)
2. Emit outbox events for the approval (no audit trail via domain events)
3. Update the leave balance ledger upon approval

Additionally, the manager hierarchy view at `packages/api/src/modules/security/manager.routes.ts` may not correctly resolve indirect reports.

### 2. Proposed Solution

1. Add outbox event emission to leave approval/rejection in `manager.service.ts`
2. Integrate leave balance ledger update upon approval
3. Add multi-level approval chain configuration
4. Verify manager hierarchy resolution for indirect reports

### 3. Database Changes

None (existing tables are sufficient).

### 4. Backend Changes

**File: `packages/api/src/modules/security/manager.service.ts`**
- In `approveRequest()` (around line 420):
  - Add outbox event: `absence.leave_request.approved`
  - Call `leaveBalanceLedger` update to deduct approved days from balance
  - Verify the balance deduction happens in the same transaction
- In `rejectRequest()` (around line 470):
  - Add outbox event: `absence.leave_request.rejected`

**File: `packages/api/src/modules/absence/service.ts`**
- Add `deductLeaveBalance(employeeId, leaveTypeId, days, txHandle)` method
- Ensure it writes to `leave_balance_ledger` atomically with the approval

### 5. Frontend Changes

None (existing approval UI works).

### 6. Test Plan

- Unit test: Approval emits outbox event
- Unit test: Approval deducts from leave balance
- Unit test: Rejection emits outbox event without balance change
- Integration test: Manager can only approve their direct reports' leave
- Integration test: Non-manager cannot approve leave

### 7. Acceptance Criteria

- [ ] Leave approval writes outbox event in same transaction
- [ ] Leave balance ledger updated on approval
- [ ] Manager can only approve subordinates' leave
- [ ] Rejection does not affect leave balance
- [ ] Audit trail captures who approved/rejected and when

### 8. Effort Estimate

1.5 days

### 9. Dependencies

Manager hierarchy tables must exist (they do -- `migrations/0119_manager_hierarchy.sql`).

### 10. Risk Assessment

Low risk. This is a fix/enhancement to existing functionality.

---

<a id="plan-13"></a>
## Plan 13: Shared Package Consolidation

**Priority:** P2 -- HIGH
**Source:** refactoring-plan.md Proposal 1

### 1. Problem Statement

`@staffora/shared` exports error codes, state machines, types (`TenantContext`, `ServiceResult`), and utilities, but production code imports **zero** of them. The API modules duplicate everything locally: `ErrorCodes` is defined separately in `plugins/errors.ts`; `VALID_STATUS_TRANSITIONS` is redefined in 3 service files; `TenantContext` is defined 4+ times; `ServiceResult<T>` is redefined in 7 test files. This creates maintenance burden and inconsistency risk.

### 2. Proposed Solution

Four-phase consolidation:
- Phase A (Types): Unify `TenantContext` and `ServiceResult` imports
- Phase B (Error codes): Bridge API `ErrorCodes` to shared codes
- Phase C (State machines): Replace local state machine definitions with shared imports
- Phase D (Frontend): Import error codes for typed error handling

### 3. Database Changes

None.

### 4. Backend Changes

**Phase A: `TenantContext` unification**
- Files: `security/field-permission.service.ts`, `security/portal.service.ts`, `security/manager.service.ts`
- Replace local `TenantContext` interface with `import type { TenantContext } from "../../types/service-result"`
- Update 7 test files to import `ServiceResult` from `packages/api/src/types/service-result.ts`

**Phase B: Error codes bridge**
- File: `packages/api/src/plugins/errors.ts`
- Import shared error codes and spread them into the local `ErrorCodes` object
- Keep API-specific codes (idempotency, etc.) locally
- Prerequisite: Align `@sinclair/typebox` version in shared package

**Phase C: State machines**
- File: `packages/api/src/modules/hr/service.ts` (lines 52-57)
- Replace local `VALID_STATUS_TRANSITIONS` with import from `@staffora/shared/state-machines`
- Use `canTransition()` and `validateTransition()` functions

### 5. Frontend Changes

**Phase D:**
- File: `packages/web/app/lib/api-client.ts`
- Import error codes from `@staffora/shared/errors` for typed error handling

### 6. Test Plan

- Run full test suite after each phase to catch type mismatches
- Verify no duplicate type definitions remain (grep for `interface TenantContext`, `interface ServiceResult`)

### 7. Acceptance Criteria

- [ ] `TenantContext` defined in one place, imported everywhere
- [ ] `ServiceResult` defined in one place, imported everywhere
- [ ] `ErrorCodes` in API bridges from `@staffora/shared/errors`
- [ ] State machine transitions use `@staffora/shared/state-machines`
- [ ] No duplicate type definitions in service files
- [ ] Full test suite passes

### 8. Effort Estimate

3 days

### 9. Dependencies

None (can start immediately). Phase B depends on `@sinclair/typebox` version alignment.

### 10. Risk Assessment

**Risk:** Type shape mismatches between shared and local definitions may cause compile errors or subtle runtime bugs.
**Mitigation:** Run full test suite after each phase. Roll out one phase at a time.

---

<a id="plan-14"></a>
## Plan 14: Migration Rollback Support

**Priority:** P2 -- HIGH
**Source:** architecture-risk-report.md R15, R16

### 1. Problem Statement

The migration runner supports a `down` command and each migration has a `-- DOWN` section, but the down migrations are minimal (mostly `DROP TABLE IF EXISTS`), no data migration reversal logic exists, seed data migrations are irreversible, and the migration renumbering (0076-0116 -> 0081-0122) creates drift risk for existing databases. There is no CI verification that down migrations work.

### 2. Proposed Solution

1. Add a migration validation test that verifies up/down cycle for all non-seed migrations
2. Mark irreversible migrations explicitly with a comment
3. Add `fix_schema_migrations_filenames.sql` execution check to the migration runner
4. Improve down migrations for data-carrying tables to use truncation instead of drop (preserving table structure)

### 3. Database Changes

None (improving existing migration files).

### 4. Backend Changes

**File: `packages/api/src/db/migrate.ts`**
- Add `validate` command: Run up + down + up for each migration in a test database
- Add check for migration filename gaps/duplicates
- Add warning if `fix_schema_migrations_filenames.sql` has not been applied

**Migration files (bulk update):**
- Add `-- IRREVERSIBLE` comment to seed migrations (0112-0116, 0120-0121)
- Review and improve down migrations for key tables (don't DROP if data exists, TRUNCATE instead)

### 5. Frontend Changes

None.

### 6. Test Plan

**New test: `packages/api/src/test/integration/migration-validation.test.ts`** (if not already present)
- Test: All migration files have a `-- DOWN` section
- Test: No migration number gaps or duplicates
- Test: Non-seed migrations can be rolled back (up -> down -> up cycle)

### 7. Acceptance Criteria

- [ ] Migration runner has a `validate` command
- [ ] Irreversible migrations marked with `-- IRREVERSIBLE` comment
- [ ] No migration number gaps or duplicates
- [ ] CI test verifies migration integrity
- [ ] `fix_schema_migrations_filenames.sql` check in migration runner

### 8. Effort Estimate

2 days

### 9. Dependencies

None.

### 10. Risk Assessment

**Risk:** Running down migrations in CI could accidentally affect shared test databases.
**Mitigation:** Create a dedicated ephemeral database for migration validation tests. Destroy it after the test run.

---

<a id="plan-15"></a>
## Plan 15: Structured Logging

**Priority:** P2 -- HIGH
**Source:** architecture-risk-report.md R13, R18

### 1. Problem Statement

The API server uses `console.log/error/warn` throughout (329 occurrences across 54 files). Logs are unstructured text written to stdout. The debug callback in `db.ts` logs query parameters (potential PII exposure). The Docker `json-file` logging driver with 50MB/5-file rotation means logs are not searchable and rotate quickly under load. There is no correlation between requests and their log entries.

### 2. Proposed Solution

Introduce structured JSON logging using `pino` (Bun-compatible, high-performance):
1. Create a shared logger utility with JSON output
2. Include request ID, tenant ID, user ID in all log entries
3. Redact sensitive fields (password, token, secret, authorization)
4. Replace `console.log` calls in production code with structured logger
5. Add log levels (trace, debug, info, warn, error, fatal)

### 3. Database Changes

None.

### 4. Backend Changes

**New file: `packages/api/src/lib/logger.ts`**

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: ["password", "token", "secret", "authorization", "*.password"],
    clobberReconcileError: true,
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createRequestLogger(requestId: string, tenantId?: string, userId?: string) {
  return logger.child({ requestId, tenantId, userId });
}
```

**File: `packages/api/src/plugins/errors.ts`**
- Replace `console.error` with `logger.error` for request error logging
- Include request ID in error logs

**File: `packages/api/src/plugins/db.ts`**
- Replace debug `console.log` with `logger.debug` (only at trace level)
- Remove parameter logging or use redacted serializer

**File: `packages/api/src/app.ts`**
- Replace startup `console.log` with `logger.info`
- Add request-scoped logger to Elysia context

**File: `packages/api/package.json`**
- Add `pino` dependency

### 5. Frontend Changes

None.

### 6. Test Plan

- Unit test: Logger redacts sensitive fields
- Unit test: Request logger includes request ID, tenant ID
- Unit test: Log levels are configurable via env var
- Verify: No `console.log` calls remain in production code (test/dev files are OK)

### 7. Acceptance Criteria

- [ ] All production log output is structured JSON
- [ ] Request ID included in all log entries
- [ ] Tenant ID and user ID included where available
- [ ] Sensitive fields redacted from logs
- [ ] Log level configurable via `LOG_LEVEL` env var
- [ ] DB query parameter logging removed or redacted
- [ ] No `console.log` in production code paths (except startup banner)

### 8. Effort Estimate

2 days

### 9. Dependencies

None.

### 10. Risk Assessment

**Risk:** Replacing `console.log` across 54 files is a large change surface.
**Mitigation:** Do it incrementally: start with plugins and app.ts (high-value), then modules. Leave test files using `console.log` as-is.

---

<a id="plan-16"></a>
## Plan 16: Monitoring & Observability Basics

**Priority:** P2 -- HIGH
**Source:** architecture-risk-report.md R13

### 1. Problem Statement

The worker exposes Prometheus-style metrics at `/metrics`, but the API server has no `/metrics` endpoint. No Prometheus, Grafana, or alerting is configured. No application-level metrics (request duration, error rates, queue depths) are collected. No log aggregation is deployed. Without observability, production issues cannot be diagnosed and SLA violations go undetected.

### 2. Proposed Solution

1. Add a `/metrics` endpoint to the API server with key application metrics
2. Add Prometheus + Grafana to Docker Compose
3. Configure basic alerts for error rates and response times
4. Add request duration tracking via Elysia middleware

### 3. Database Changes

None.

### 4. Backend Changes

**New file: `packages/api/src/plugins/metrics.ts`**

Elysia plugin that tracks:
- `http_requests_total` (counter, labels: method, route, status)
- `http_request_duration_seconds` (histogram, labels: method, route)
- `db_pool_active_connections` (gauge)
- `db_pool_idle_connections` (gauge)
- `redis_connected` (gauge)

Expose via `GET /metrics` in Prometheus exposition format.

**File: `packages/api/src/app.ts`**
- Register metrics plugin early in the plugin chain
- Add `onAfterHandle` to record request duration

**File: `docker/docker-compose.yml`**
- Add `prometheus` service with scrape config for API and worker `/metrics`
- Add `grafana` service with provisioned dashboards
- Add basic alert rules

### 5. Frontend Changes

None.

### 6. Test Plan

- Integration test: `GET /metrics` returns Prometheus-formatted metrics
- Manual test: Prometheus scrapes metrics successfully
- Manual test: Grafana dashboard shows request rates and durations

### 7. Acceptance Criteria

- [ ] `GET /metrics` returns Prometheus exposition format
- [ ] Request count and duration tracked per route
- [ ] Database connection pool metrics exposed
- [ ] Prometheus configured to scrape API and worker
- [ ] Grafana dashboard with basic panels (request rate, error rate, latency, pool size)

### 8. Effort Estimate

2 days

### 9. Dependencies

Structured logging (Plan 15) is recommended but not strictly required.

### 10. Risk Assessment

**Risk:** Metrics collection adds per-request overhead.
**Mitigation:** Use lightweight counters and histograms. Prometheus scrape interval of 15 seconds is standard and introduces no request-path overhead.

---

<a id="plan-17"></a>
## Plan 17: Auth E2E Tests

**Priority:** P3 -- HIGH
**Source:** refactoring-plan.md Proposal 7, architecture-risk-report.md R26

### 1. Problem Statement

The auth system (Better Auth with CSRF, MFA, session management) has minimal test coverage. The existing `auth.test.ts` tests basic session resolution but does not verify end-to-end login/logout flows, CSRF token lifecycle, MFA enrollment/verification, session expiry, or account lockout (once implemented). Given that auth is the security perimeter, this is a critical gap.

### 2. Proposed Solution

Write comprehensive auth E2E tests that exercise the full authentication pipeline:
1. Registration flow (sign-up -> email verification if enabled -> first login)
2. Login flow (credentials -> session creation -> session cookie)
3. CSRF flow (fetch token -> include in mutation -> verify protection)
4. MFA flow (enable TOTP -> login requires TOTP -> verify TOTP)
5. Session management (session listing -> session revocation)
6. Password reset flow
7. Account lockout (once Plan 4 is implemented)

### 3. Database Changes

None.

### 4. Backend Changes

**New file: `packages/api/src/test/e2e/auth-flow.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../../app";

describe("Auth E2E", () => {
  let sessionCookie: string;
  let csrfToken: string;

  it("should register a new user", async () => {
    const res = await app.handle(new Request("http://localhost/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "SecurePassword123!",
        name: "Test User",
      }),
    }));
    expect(res.status).toBe(200);
  });

  it("should login and receive session cookie", async () => {
    const res = await app.handle(new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "SecurePassword123!",
      }),
    }));
    expect(res.status).toBe(200);
    sessionCookie = res.headers.get("set-cookie") ?? "";
    expect(sessionCookie).toContain("staffora.session_token");
  });

  // ... additional tests
});
```

### 5. Frontend Changes

None.

### 6. Test Plan

This IS the test plan. Tests to write:
- Registration with valid/invalid data
- Login with valid/invalid credentials
- Session cookie lifecycle
- CSRF token fetch and validation
- Protected endpoint access with/without session
- Logout clears session
- Password reset flow
- MFA enrollment and verification

### 7. Acceptance Criteria

- [ ] Auth E2E test suite passes in CI
- [ ] All auth flows tested with real HTTP requests via `app.handle()`
- [ ] CSRF token lifecycle tested end-to-end
- [ ] Session creation and revocation tested
- [ ] Invalid credential handling tested

### 8. Effort Estimate

2 days

### 9. Dependencies

Plan 1 (CSRF fix) should be implemented first.

### 10. Risk Assessment

**Risk:** Better Auth may have internal state that makes parallel tests interfere with each other.
**Mitigation:** Use unique email addresses per test. Run auth E2E tests serially.

---

<a id="plan-18"></a>
## Plan 18: Real HTTP Route Tests

**Priority:** P3 -- HIGH
**Source:** refactoring-plan.md Proposal 7, architecture-risk-report.md R26

### 1. Problem Statement

Of the 14+ route test files in `packages/api/src/test/integration/routes/`, only `hr.routes.test.ts` makes real HTTP calls via `app.handle()`. The rest assert local variables, test extracted functions, or mock the entire database layer. The CLAUDE.md explicitly calls these out as "hollow tests." This means the route tests do not verify HTTP status codes, request validation, authentication, RBAC enforcement, or actual database interactions.

### 2. Proposed Solution

Convert the top 5 most critical route test files to use real HTTP calls via `app.handle()`:
1. `hr.routes.test.ts` -- Already real (use as template)
2. `cases.routes.test.ts` -- Critical for case management
3. `absence.routes.test.ts` -- Critical for leave management
4. `benefits.routes.test.ts` -- Critical for benefits
5. `security.routes.test.ts` -- Critical for access control

Each test should:
- Create test tenant and user via `createTestContext()`
- Make real HTTP requests via `app.handle()`
- Verify HTTP status codes, response bodies, and database state
- Test RBAC enforcement (request without permission returns 403)
- Test validation (invalid input returns 400)

### 3. Database Changes

None.

### 4. Backend Changes

**Files to rewrite:**
- `packages/api/src/test/integration/routes/cases.routes.test.ts`
- `packages/api/src/test/integration/routes/absence.routes.test.ts`
- `packages/api/src/test/integration/routes/benefits.routes.test.ts`
- `packages/api/src/test/integration/routes/security.routes.test.ts`

**Pattern (from `hr.routes.test.ts`):**
```typescript
const response = await app.handle(
  new Request("http://localhost/api/v1/hr/employees", {
    method: "GET",
    headers: {
      Cookie: sessionCookie,
      "X-Tenant-ID": tenantId,
    },
  })
);
expect(response.status).toBe(200);
const data = await response.json();
expect(data.employees).toBeDefined();
```

### 5. Frontend Changes

None.

### 6. Test Plan

This IS the test plan. For each route test file:
- Test successful CRUD operations
- Test authentication (no session = 401)
- Test authorization (wrong role = 403)
- Test input validation (bad data = 400)
- Test not found (missing resource = 404)

### 7. Acceptance Criteria

- [ ] At least 5 route test files make real HTTP calls
- [ ] Tests verify HTTP status codes
- [ ] Tests verify response body structure
- [ ] Tests verify RBAC enforcement
- [ ] Tests verify input validation
- [ ] All tests pass in CI

### 8. Effort Estimate

3 days

### 9. Dependencies

Plan 17 (Auth E2E tests) provides the auth helper patterns needed.

### 10. Risk Assessment

**Risk:** Real HTTP tests are slower than unit tests due to database setup/teardown.
**Mitigation:** Use shared test infrastructure (single tenant per test file, cleanup in `afterAll`). Run route tests in a separate CI job.

---

<a id="plan-19"></a>
## Plan 19: Notification / Equipment / Geofence API Modules

**Priority:** P3 -- MEDIUM
**Source:** feature-validation-report.md

### 1. Problem Statement

Database tables exist for notifications (`migrations/0081_notifications.sql`), equipment tracking (`migrations/0108_equipment.sql`), and geofencing (`migrations/0109_geofence.sql`), but there are no corresponding API modules -- no `routes.ts`, `service.ts`, or `repository.ts` files in `packages/api/src/modules/` for any of these. The frontend references notification data in layouts, and the notification worker processes notifications, but there is no REST API to create, list, or manage notifications directly. Equipment and geofence data cannot be managed through the API.

### 2. Proposed Solution

Create three new API modules following the gold-standard HR module pattern:
1. **Notifications module**: CRUD for notifications, mark as read/dismissed, user notification preferences
2. **Equipment module**: CRUD for equipment, assignment to employees, return tracking
3. **Geofence module**: CRUD for geofence zones, check-in/check-out location validation

### 3. Database Changes

None (tables already exist in migrations).

### 4. Backend Changes

**New directory: `packages/api/src/modules/notifications/`**
- `schemas.ts`: TypeBox schemas for notification CRUD
- `repository.ts`: Query notifications by user, mark read/dismissed, count unread
- `service.ts`: Create notification, batch mark read, notification preferences
- `routes.ts`:
  - `GET /api/v1/notifications` -- List user's notifications (paginated)
  - `GET /api/v1/notifications/unread-count` -- Unread count
  - `PATCH /api/v1/notifications/:id/read` -- Mark as read
  - `PATCH /api/v1/notifications/mark-all-read` -- Mark all as read
  - `DELETE /api/v1/notifications/:id` -- Dismiss notification

**New directory: `packages/api/src/modules/equipment/`**
- `schemas.ts`: TypeBox schemas
- `repository.ts`: Equipment CRUD, assignment queries
- `service.ts`: Assign equipment to employee, return equipment, track status
- `routes.ts`:
  - `GET /api/v1/equipment` -- List equipment (paginated, filterable)
  - `POST /api/v1/equipment` -- Create equipment record
  - `GET /api/v1/equipment/:id` -- Get equipment detail
  - `PATCH /api/v1/equipment/:id` -- Update equipment
  - `POST /api/v1/equipment/:id/assign` -- Assign to employee
  - `POST /api/v1/equipment/:id/return` -- Mark as returned
  - `GET /api/v1/equipment/employee/:employeeId` -- Equipment assigned to employee

**New directory: `packages/api/src/modules/geofence/`**
- `schemas.ts`: TypeBox schemas
- `repository.ts`: Zone CRUD, location check queries
- `service.ts`: Create zone, validate clock event location against zones
- `routes.ts`:
  - `GET /api/v1/geofence/zones` -- List zones
  - `POST /api/v1/geofence/zones` -- Create zone
  - `PATCH /api/v1/geofence/zones/:id` -- Update zone
  - `POST /api/v1/geofence/validate` -- Validate location against zones

**File: `packages/api/src/app.ts`**
- Register all three new modules

### 5. Frontend Changes

No immediate frontend changes required (frontend already has notification UI in layouts and can be connected to the new API).

### 6. Test Plan

- Unit test: Notification CRUD and mark-read logic
- Unit test: Equipment assignment and return workflow
- Unit test: Geofence zone validation (point-in-polygon or radius check)
- Integration test: RLS isolation for all three modules

### 7. Acceptance Criteria

- [ ] Notifications API: list, mark read, dismiss, unread count
- [ ] Equipment API: CRUD, assign, return, employee equipment list
- [ ] Geofence API: zone CRUD, location validation
- [ ] All endpoints have auth guards and permission checks
- [ ] RLS enforced on all operations
- [ ] Modules registered in app.ts

### 8. Effort Estimate

3 days (1 day per module)

### 9. Dependencies

None (database tables already exist).

### 10. Risk Assessment

Low risk. These are new modules with no existing dependencies to break.

---

<a id="plan-20"></a>
## Plan 20: Leave Approval Table Name Fix

**Priority:** P3 -- MEDIUM
**Source:** Code inspection during audit analysis

### 1. Problem Statement

The `manager.service.ts` file (lines 428, 499) inserts into `app.leave_approvals` table, which exists in `migrations/0053_leave_approvals.sql`. However, there is a potential inconsistency in column naming. The migration uses `leave_request_id`, `approver_id`, `decision`, `comment`, and `decided_at` columns, but the insert statement in `manager.service.ts` should be verified against the actual migration schema to ensure all column names match. Additionally, the absence module itself does not reference `leave_approvals` at all -- the approval logic lives only in the security/manager module, creating an architectural inconsistency where leave approvals are managed outside the absence module.

### 2. Proposed Solution

1. Verify column names in `manager.service.ts` match `migrations/0053_leave_approvals.sql`
2. Add leave approval functions to the absence module's service/repository layers
3. Have the manager service delegate to the absence module for approval logic
4. Ensure the approval writes an outbox event

### 3. Database Changes

None (table exists).

### 4. Backend Changes

**File: `packages/api/src/modules/absence/repository.ts`**
- Add `createLeaveApproval(tx, data)` method
- Add `getLeaveApprovals(leaveRequestId)` method

**File: `packages/api/src/modules/absence/service.ts`**
- Add `approveLeaveRequest(ctx, requestId, approverId, comment)` method
- Add `rejectLeaveRequest(ctx, requestId, approverId, comment, reason)` method
- Include outbox event emission
- Include balance ledger update on approval

**File: `packages/api/src/modules/security/manager.service.ts`**
- Delegate to `AbsenceService.approveLeaveRequest()` instead of inline SQL
- Remove direct `INSERT INTO app.leave_approvals` statements

### 5. Frontend Changes

None.

### 6. Test Plan

- Unit test: Approval creates correct record in `leave_approvals`
- Unit test: Column names match migration schema
- Integration test: End-to-end approval via manager service

### 7. Acceptance Criteria

- [ ] Leave approval logic centralized in absence module
- [ ] Manager service delegates to absence module
- [ ] Column names verified against migration
- [ ] Outbox event emitted on approval/rejection
- [ ] Leave balance updated on approval

### 8. Effort Estimate

1 day

### 9. Dependencies

Plan 12 (Manager Hierarchy Leave Approval Fix) -- these two plans can be combined.

### 10. Risk Assessment

Low risk. Refactoring existing code to proper module boundaries.

---

## Implementation Roadmap

### Phase 1: Security & Production Readiness (Week 1-2)

| # | Plan | Priority | Effort | Parallel? |
|---|------|----------|--------|-----------|
| 1 | CSRF Token Fix (Backend) | P0 | 0.5d | Yes |
| 5 | Frontend CSRF Integration | P0 | 0.5d | Yes (with Plan 1) |
| 2 | Graceful API Shutdown | P0 | 0.5d | Yes |
| 3 | RLS Enforcement (hris_app) | P0 | 2d | Yes |
| 4 | Account Lockout | P0 | 2d | After Plan 1 |

### Phase 2: UK Compliance -- Critical (Week 3-6)

| # | Plan | Priority | Effort |
|---|------|----------|--------|
| 6 | Right to Work Module | P1 | 3d |
| 7 | SSP Calculation Engine | P1 | 4d |
| 8 | Holiday Entitlement Enforcement | P1 | 2d |
| 9 | GDPR DSAR Endpoint | P1 | 4d |
| 10 | Pension Auto-Enrolment | P1 | 5d |
| 11 | Family Leave Calculations | P1 | 5d |

### Phase 3: Architecture & Quality (Week 7-10)

| # | Plan | Priority | Effort |
|---|------|----------|--------|
| 12 | Manager Hierarchy Leave Fix | P2 | 1.5d |
| 13 | Shared Package Consolidation | P2 | 3d |
| 14 | Migration Rollback Support | P2 | 2d |
| 15 | Structured Logging | P2 | 2d |
| 16 | Monitoring & Observability | P2 | 2d |

### Phase 4: Testing & Modules (Week 11-13)

| # | Plan | Priority | Effort |
|---|------|----------|--------|
| 17 | Auth E2E Tests | P3 | 2d |
| 18 | Real HTTP Route Tests | P3 | 3d |
| 19 | Notification/Equipment/Geofence Modules | P3 | 3d |
| 20 | Leave Approval Table Fix | P3 | 1d |

### Total Estimated Effort

| Phase | Days | Weeks (1 dev) |
|-------|------|---------------|
| Phase 1: Security | 5.5 | 1.5 |
| Phase 2: UK Compliance | 23 | 5 |
| Phase 3: Architecture | 10.5 | 2.5 |
| Phase 4: Testing & Modules | 9 | 2 |
| **Total** | **48** | **11** |

With 2 developers working in parallel, the full roadmap can be completed in approximately 6-7 weeks.

---

## Cross-Cutting Concerns

### Testing Strategy

Every plan includes specific test requirements. The following testing principles apply across all plans:

1. **Real database tests**: All integration tests must use the `hris_app` role with RLS enforced
2. **Outbox verification**: All mutating endpoints must verify outbox events are written atomically
3. **RLS isolation**: All new tables must have RLS tests verifying cross-tenant isolation
4. **No hollow tests**: All route tests must use `app.handle()` for real HTTP calls

### Migration Naming

New migrations should follow the next available number:
- 0123 through 0128 are allocated in these plans
- Each plan's migration number is tentative -- use the actual next available number at implementation time

### Module Pattern

All new modules must follow the gold-standard HR module pattern:
1. `schemas.ts` -- TypeBox request/response schemas
2. `repository.ts` -- Database access layer (explicit column SELECTs, no `SELECT *`)
3. `service.ts` -- Business logic with `ServiceResult<T>` return type
4. `routes.ts` -- Elysia route handlers with RBAC guards
5. `index.ts` -- Barrel exports
6. Outbox events in same transaction as business writes
7. Audit logging via `audit.logInTransaction()`

### UK Compliance Constants

Plans 7, 8, 10, and 11 all depend on UK statutory rates and thresholds that change annually. All such values should be stored in a database configuration table with effective dates, not hardcoded in source code. Create a shared `packages/api/src/config/uk-statutory-rates.ts` configuration file that documents the current rates and the process for updating them.
