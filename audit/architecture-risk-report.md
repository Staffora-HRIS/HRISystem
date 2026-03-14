# Staffora HRIS Architecture Risk Assessment

**Date:** 2026-03-13
**Scope:** Full platform architecture review based on source code analysis
**Assessor:** Architecture Risk Agent (automated)

---

## Risk Level Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 8     |
| MEDIUM   | 12    |
| LOW      | 6     |
| **Total** | **29** |

---

## Architecture Risk Score: 52 / 100

*(100 = lowest risk. Score reflects an early-stage product with solid architectural foundations but significant operational and security gaps that must be addressed before production deployment.)*

---

## Risk Matrix (Probability x Impact)

```
                     Impact
                Low    Medium    High    Critical
            +--------+---------+--------+----------+
  Likely    |        | R18,R22 | R5,R8, | R1, R2   |
            |        |         | R10    |          |
            +--------+---------+--------+----------+
  Possible  | R24,   | R14,R16,| R4,R6, | R3       |
            | R25,R26| R17,R20,| R7,R9, |          |
            |        | R21     | R11    |          |
            +--------+---------+--------+----------+
  Unlikely  | R27,   | R23,R28 | R13,R15| R12      |
            | R29    |         | R19    |          |
            +--------+---------+--------+----------+
```

---

## Detailed Findings

---

### R1. CRITICAL: Frontend Does Not Send CSRF Tokens

**Severity:** CRITICAL | **Probability:** Likely | **Impact:** Critical

**Evidence:**
The backend requires CSRF tokens for all mutating requests via `requireCsrf()` in `packages/api/src/plugins/auth-better.ts` (line 513-529), which checks for the `X-CSRF-Token` header. However, the frontend API client at `packages/web/app/lib/api-client.ts` **never sends a CSRF token**. The `buildHeaders()` method (line 266-291) only injects `Content-Type`, `Accept`, and `X-Tenant-ID`. A grep for "csrf" or "CSRF" across the entire `packages/web/app` directory returns **zero results**.

This means every POST/PUT/PATCH/DELETE request from the frontend will receive a 403 CSRF error in production, rendering all mutations inoperable.

**Mitigation:**
1. Implement CSRF token fetching from the `/api/auth/csrf` endpoint on the frontend.
2. Add the `X-CSRF-Token` header to all mutating requests in the API client.
3. Add integration tests that verify CSRF tokens are validated end-to-end.

---

### R2. CRITICAL: No Graceful Shutdown for API Server

**Severity:** CRITICAL | **Probability:** Likely | **Impact:** Critical

**Evidence:**
The main API entry point at `packages/api/src/app.ts` has **no process signal handlers** -- no `SIGTERM`, `SIGINT`, or `unhandledRejection` handling. A grep for these terms in `app.ts` returns zero matches. This means:
- Deployments will terminate in-flight requests abruptly
- Database connections may leak
- Redis connections will not be cleanly closed
- Open transactions may leave RLS context in an inconsistent state

The worker process at `packages/api/src/worker.ts` (lines 223-246) **does** implement graceful shutdown correctly, proving the pattern is understood but was not applied to the API server.

**Mitigation:**
1. Add `SIGTERM`/`SIGINT` handlers to `app.ts` that drain connections and close DB/Redis.
2. Implement a request drain period before shutdown.
3. Handle `unhandledRejection` and `uncaughtException` with logging and safe exit.

---

### R3. CRITICAL: Single Points of Failure in Infrastructure

**Severity:** CRITICAL | **Probability:** Possible | **Impact:** Critical

**Evidence:**
From `docker/docker-compose.yml`:
- **PostgreSQL**: Single instance (`staffora-postgres`), no replication, no failover. Lines 18-52.
- **Redis**: Single instance (`staffora-redis`), no Sentinel, no cluster. Lines 57-87.
- **Worker**: Single instance (`staffora-worker`). Lines 146-202.
- **API**: Single instance (`staffora-api`), no horizontal scaling. Lines 92-141.

The nginx reverse proxy (lines 306-332) is only available under the `production` profile but provides no load balancing configuration -- it simply proxies to single upstream instances.

If PostgreSQL fails, the entire platform is down with no recovery mechanism other than restart. The backup service exists (lines 243-299) but only runs daily and stores to a local Docker volume (`db_backups`), meaning backups are lost if the host machine fails.

**Mitigation:**
1. Implement PostgreSQL streaming replication with automatic failover (Patroni or pg_auto_failover).
2. Deploy Redis Sentinel or Redis Cluster for HA.
3. Enable horizontal scaling for API servers with a load balancer.
4. Allow multiple worker instances (already supported by consumer groups in Redis Streams).
5. Ship database backups to offsite storage (S3, GCS).

---

### R4. HIGH: Database Connection Pool Too Small for Production

**Severity:** HIGH | **Probability:** Possible | **Impact:** High

**Evidence:**
From `packages/api/src/plugins/db.ts`, line 55: `maxConnections: Number(process.env["DB_MAX_CONNECTIONS"]) || 20`. The default pool size is 20 connections.

Additionally, Better Auth creates a **separate** pg Pool in `packages/api/src/lib/better-auth.ts` (line 93): `max: 10`. The scheduler in `packages/api/src/worker/scheduler.ts` (line 37) creates **yet another** connection via `postgres(DB_URL)` with no pool limit specified.

This means three independent connection pools compete for PostgreSQL connections:
- Main API: 20 connections (postgres.js)
- Better Auth: 10 connections (pg Pool)
- Scheduler: Unlimited (no max specified)

With PostgreSQL's default `max_connections = 100`, this leaves minimal headroom and risks connection exhaustion under load.

**Mitigation:**
1. Consolidate database connection pools or explicitly configure max connections across all pools.
2. Set PostgreSQL `max_connections` appropriately for the total pool sizes.
3. Add connection pool monitoring and alerting.

---

### R5. HIGH: Rate Limiting Disabled in Tests, No Production Verification

**Severity:** HIGH | **Probability:** Likely | **Impact:** High

**Evidence:**
From `packages/api/src/plugins/rate-limit.ts`, lines 88-96:
```typescript
const isTestRun =
  process.env["NODE_ENV"] === "test" ||
  process.env["BUN_TEST"] === "true" ||
  process.argv.includes("test");

const enabled =
  typeof options.enabled === "boolean"
    ? options.enabled
    : !isTestRun && process.env["FEATURE_RATE_LIMIT_ENABLED"] !== "false";
```

Rate limiting is completely disabled in tests and can be disabled via environment variable. Auth-specific rate limits (5 login attempts/minute) exist but:
- No global rate limit applies to unauthenticated API enumeration
- Generic rate limit key uses `tenantId ?? "public"` (line 165), meaning unauthenticated requests all share the same `"public"` bucket
- Rate limiting depends on Redis; if Redis is down, rate limiting silently fails (lines 158-159, 193-195)

**Mitigation:**
1. Implement IP-based rate limiting for unauthenticated endpoints.
2. Add a Redis fallback for rate limiting (in-memory LRU cache).
3. Create integration tests that verify rate limiting works in production mode.

---

### R6. HIGH: SELECT * Queries Across Multiple Repositories

**Severity:** HIGH | **Probability:** Possible | **Impact:** High

**Evidence:**
28 instances of `SELECT *` found across 9 repository files, including:
- `packages/api/src/modules/time/repository.ts`: 9 instances
- `packages/api/src/modules/absence/repository.ts`: 5 instances
- `packages/api/src/modules/talent/repository.ts`: 4 instances
- `packages/api/src/modules/competencies/repository.ts`: 3 instances

This creates multiple risks:
- Performance: fetching unnecessary columns, especially JSONB fields
- Fragility: schema changes can break query results silently
- Security: sensitive columns may be inadvertently exposed

The CLAUDE.md explicitly calls out "explicit column SELECTs" as a gold-standard pattern, meaning these violate the project's own conventions.

**Mitigation:**
1. Replace all `SELECT *` with explicit column lists.
2. Add a linting rule to prevent future `SELECT *` usage.

---

### R7. HIGH: N+1 Query Patterns in Loop-Based Inserts

**Severity:** HIGH | **Probability:** Possible | **Impact:** High

**Evidence:**
Multiple repositories execute queries inside loops within transactions:
- `packages/api/src/modules/onboarding/repository.ts` (lines 149-163): Inserts template tasks one at a time in a for loop
- `packages/api/src/modules/time/repository.ts` (lines 543-545): Inserts timesheet lines one at a time
- `packages/api/src/modules/lms/repository.ts` (lines 526-527): Inserts learning path courses one at a time

While these run within transactions (so they won't cause independent roundtrips), they still generate N separate SQL statements where a single batch insert would be more efficient.

**Mitigation:**
1. Refactor loop-based inserts to use batch INSERT with `VALUES` lists or `unnest()`.
2. For the onboarding repository, consider a single INSERT with multiple rows.

---

### R8. HIGH: Audit Logging Uses Separate Transaction from Business Writes

**Severity:** HIGH | **Probability:** Likely | **Impact:** High

**Evidence:**
The `AuditService.log()` method in `packages/api/src/plugins/audit.ts` (lines 161-182) uses `db.withSystemContext()` which opens a **new** transaction. This means audit writes happen in a separate transaction from the business operation they record.

If the business write succeeds but the audit write fails (or vice versa), data integrity is violated. The `logInTransaction()` method (lines 188-216) exists as the correct alternative but requires the caller to pass a transaction handle.

Many routes call `audit.log()` after the business operation, outside the transaction, meaning audit records can be lost on failure.

**Mitigation:**
1. Mandate use of `logInTransaction()` for all audit writes that accompany business mutations.
2. Add the audit write to the same transaction as the business write.
3. Create a linting rule or code review checklist item for audit atomicity.

---

### R9. HIGH: Tenant Cache Not Invalidated on Suspension (Race Window)

**Severity:** HIGH | **Probability:** Possible | **Impact:** High

**Evidence:**
In `packages/api/src/plugins/tenant.ts`, the `TenantService.getById()` method (lines 91-118) caches tenant data for `CacheTTL.SESSION` (300 seconds / 5 minutes). If a tenant is suspended, the cache is only invalidated when `validateTenant()` detects the suspended status and calls `cache.del()` (lines 177-183).

However, there's a 5-minute window where the cached "active" tenant data is still served. During this window, a suspended tenant's users can continue making authenticated, tenant-scoped requests. For an enterprise HRIS handling payroll and PII, this is a significant security gap.

**Mitigation:**
1. Reduce tenant cache TTL to 30-60 seconds.
2. Implement an event-driven cache invalidation on tenant status changes.
3. Consider a webhook or pub/sub notification when tenant status changes.

---

### R10. HIGH: Dashboard Module Has Inline SQL (No Service/Repository Layer)

**Severity:** HIGH | **Probability:** Likely | **Impact:** High

**Evidence:**
`packages/api/src/modules/dashboard/routes.ts` is only 71 lines and contains inline SQL directly in the route handler (lines 19-41). It lacks:
- A service layer
- A repository layer
- Proper error handling for individual subqueries
- Any caching for the expensive 6-subquery dashboard stats call

The CLAUDE.md explicitly marks this as a "Pattern violation" (line in Module Quality Tiers section). Each request to `/dashboard/admin/stats` runs 6 COUNT queries in a single transaction, which will become a performance bottleneck as data grows.

**Mitigation:**
1. Refactor into proper service/repository layers.
2. Add Redis caching with short TTL (30-60 seconds) for dashboard stats.
3. Consider materialized views or pre-aggregated counters for high-volume tables.

---

### R11. HIGH: `withSystemContext` Used in Module-Level Code

**Severity:** HIGH | **Probability:** Possible | **Impact:** High

**Evidence:**
Two module repositories use `withSystemContext` directly:
- `packages/api/src/modules/tenant/repository.ts`
- `packages/api/src/modules/security/repository.ts`

The `withSystemContext` function bypasses RLS entirely. While it's legitimate for tenant management and security operations, any bug or misuse in these paths could expose cross-tenant data. The CLAUDE.md warns: "Use with extreme caution - only for migrations, seeds, and system operations."

**Mitigation:**
1. Audit every `withSystemContext` call to ensure it's necessary.
2. Add logging/alerting for system context usage in production.
3. Consider a dedicated "admin" database role with limited system context capabilities.

---

### R12. HIGH: Dual User Tables Create Data Integrity Risk

**Severity:** HIGH | **Probability:** Unlikely | **Impact:** Critical

**Evidence:**
Better Auth creates and manages a `"user"` table (with camelCase columns like `"emailVerified"`, `"createdAt"`), while the application also has an `app.users` table (with snake_case columns). The `better-auth.ts` file (lines 162-241) uses database hooks to synchronize between them, with an `after` create hook that does an `INSERT ... ON CONFLICT DO UPDATE` into `app.users`.

This dual-table approach creates risks:
- The sync hooks could fail silently, leaving tables out of sync
- Schema changes to either table require updating the hooks
- The `update.after` hook (lines 213-240) syncs user updates, but if the sync fails, `app.users` has stale data while `"user"` has current data
- The RLS/RBAC system queries `app.users` while Better Auth queries `"user"`, meaning a sync failure could cause auth/RBAC mismatches

**Mitigation:**
1. Consolidate to a single user table or create a database view.
2. Add transaction wrapping around the sync operations.
3. Add a reconciliation job that detects and fixes drift between the tables.

---

### R13. MEDIUM: No Monitoring, Metrics, or Alerting Infrastructure

**Severity:** MEDIUM | **Probability:** Unlikely | **Impact:** High

**Evidence:**
The worker exposes Prometheus-style metrics at `/metrics` (worker.ts lines 119-147), but:
- The API server has no `/metrics` endpoint
- No Prometheus, Grafana, or alerting is configured in `docker-compose.yml`
- No application-level metrics (request duration, error rates, queue depths)
- No log aggregation (each container logs to `json-file` driver locally)
- No distributed tracing

The `json-file` logging driver with max 50MB/5 files means logs will rotate quickly under load and are not searchable.

**Mitigation:**
1. Add a `/metrics` endpoint to the API server.
2. Deploy Prometheus + Grafana in the Docker Compose stack.
3. Configure alerts for: high error rates, queue backlogs, connection pool exhaustion.
4. Add structured logging with a centralized log aggregator (Loki, ELK).

---

### R14. MEDIUM: Outbox Pattern Not Consistently Applied Across All Modules

**Severity:** MEDIUM | **Probability:** Possible | **Impact:** Medium

**Evidence:**
The outbox pattern (writing domain events atomically with business writes) is used in 14 modules as shown by the grep for `domain_outbox|write_outbox_event|emitEvent`. However, key observations:

Modules using outbox: hr, time, absence, lms, cases, benefits, competencies, onboarding, documents, succession, talent, workflows, recruitment.

The dashboard module has no outbox usage (expected -- read-only). But the `analytics` and `portal` modules perform writes without outbox events in some paths. The `security` module's `portal.service.ts` references outbox patterns but in a limited way.

Some services use `emitEvent()` in the service layer while others write directly to `domain_outbox` in the repository, creating inconsistent patterns.

**Mitigation:**
1. Standardize outbox event emission through the service layer using `TransactionManager.execute()`.
2. Audit every mutating endpoint to ensure outbox events are written atomically.
3. Create a test helper that verifies outbox entries exist for every mutation.

---

### R15. MEDIUM: Migration Renumbering History Creates Drift Risk

**Severity:** MEDIUM | **Probability:** Unlikely | **Impact:** High

**Evidence:**
The git status shows extensive migration file deletions and additions with renumbered filenames:
- Old: `0076_notifications.sql` through `0116_better_auth_organization.sql` (deleted)
- New: `0081_notifications.sql` through `0122_better_auth_organization.sql` (added)
- A special `fix_schema_migrations_filenames.sql` file exists

This renumbering means any existing database with the old migration numbers in `schema_migrations` will be out of sync with the new file numbering. The migration runner in `packages/api/src/db/migrate.ts` tracks by filename, so renamed files will be treated as new migrations and re-applied, potentially causing errors or data corruption.

**Mitigation:**
1. Ensure `fix_schema_migrations_filenames.sql` is applied to all existing databases before the new migrations.
2. Add a migration validation test that checks for numbering gaps and duplicates.
3. Document the renumbering in the migration README.

---

### R16. MEDIUM: No Down Migrations for Rollback

**Severity:** MEDIUM | **Probability:** Possible | **Impact:** Medium

**Evidence:**
The migration runner supports a `down` command (as seen in `packages/api/src/db/migrate.ts` line 6: `type Command = "up" | "down" | "create"`). Each migration file contains a `-- DOWN` section (117 occurrences across 116 files, confirmed by grep). However:
- The down migrations are minimal (mostly `DROP TABLE IF EXISTS`)
- No data migration reversal logic exists
- Seed data migrations (0112-0116, 0120-0121) have irreversible side effects
- The `0095_migrate_users_to_better_auth.sql` migration moves user data and has 2 rollback markers, suggesting a complex migration that cannot be cleanly reversed

**Mitigation:**
1. Test down migrations in CI for all non-seed migrations.
2. Mark irreversible migrations explicitly.
3. Implement a blue/green deployment strategy that doesn't rely on rollback.

---

### R17. MEDIUM: `invalidateTenantCache` Uses Redis KEYS Command

**Severity:** MEDIUM | **Probability:** Possible | **Impact:** Medium

**Evidence:**
In `packages/api/src/plugins/cache.ts`, the `invalidateTenantCache()` method (lines 397-409) uses `this.redis.keys(pattern)`:
```typescript
const pattern = `${this.config.keyPrefix}t:${tenantId}:*`;
const keys = await this.redis.keys(pattern);
```

The Redis `KEYS` command blocks the Redis server and scans all keys. In production with many tenants and cache entries, this will cause latency spikes or timeouts for all Redis operations. The Redis documentation explicitly warns against using `KEYS` in production.

**Mitigation:**
1. Replace `KEYS` with `SCAN` for iterative key matching.
2. Alternatively, track tenant-scoped cache keys in a Redis Set for efficient invalidation.
3. Consider using Redis hash tags to group tenant keys on the same slot.

---

### R18. MEDIUM: Debug Query Logging in Non-Production

**Severity:** MEDIUM | **Probability:** Likely | **Impact:** Medium

**Evidence:**
In `packages/api/src/plugins/db.ts`, the database debug callback (lines 140-147) logs all queries and parameters in non-production environments:
```typescript
debug: (_connection: number, query: string, params: unknown[]) => {
  if (!this.isProduction) {
    console.log(`[DB Query] ${query.substring(0, 200)}...`);
    if (params && params.length > 0) {
      console.log(`[DB Params] ${JSON.stringify(params).substring(0, 100)}`);
    }
  }
}
```

This logs query parameters which may include PII (names, emails, addresses). While it truncates at 100 characters, sensitive data could still be exposed in staging or development logs that are shared or persisted.

**Mitigation:**
1. Disable parameter logging or redact sensitive values.
2. Make debug logging opt-in via an explicit `DB_DEBUG=true` environment variable.
3. Ensure staging environments have the same log security as production.

---

### R19. MEDIUM: Distributed Lock Not Safe Under Clock Skew

**Severity:** MEDIUM | **Probability:** Unlikely | **Impact:** High

**Evidence:**
The `CacheClient.acquireLock()` method in `packages/api/src/plugins/cache.ts` (lines 483-505) uses a simple `SET NX EX` pattern:
```typescript
const lockValue = `${Date.now()}-${Math.random()}`;
const result = await this.redis.set(lockKey, lockValue, "EX", ttlSeconds, "NX");
```

The release check (lines 498-503) compares `currentValue === lockValue`, which is correct for single-Redis setups. However, with Redis Sentinel or Cluster (recommended in R3), this pattern is unsafe due to the redlock problem. A failover between `SET` and `DEL` could cause two processes to hold the same lock.

**Mitigation:**
1. Implement the Redlock algorithm if moving to Redis Cluster/Sentinel.
2. Use a purpose-built distributed lock library (e.g., `redlock` npm package).
3. Document the single-Redis limitation of the current lock implementation.

---

### R20. MEDIUM: Authentication Plugin Makes Internal HTTP Request Per Request

**Severity:** MEDIUM | **Probability:** Possible | **Impact:** Medium

**Evidence:**
In `packages/api/src/plugins/auth-better.ts`, the `authPlugin` (lines 327-383) resolves the session by creating a new `Request` object and calling `auth.handler()` for **every single incoming request**:
```typescript
const url = new URL(request.url);
url.pathname = "/api/auth/get-session";
const handlerRes = await auth.handler(new Request(url.toString(), { ... }));
```

This means every API request triggers an internal session resolution that likely queries the database (or cookie cache). Under high concurrency, this pattern doubles the effective request processing cost.

**Mitigation:**
1. Implement session caching in Redis with a short TTL (e.g., 60 seconds).
2. Use Better Auth's cookie cache feature more aggressively (currently set to 5 minutes).
3. Consider direct cookie/session token validation without the full handler roundtrip.

---

### R21. MEDIUM: Password Verification Fallback Logic May Bypass MFA

**Severity:** MEDIUM | **Probability:** Possible | **Impact:** Medium

**Evidence:**
In `packages/api/src/lib/better-auth.ts`, the `verifyPassword()` function (lines 32-44) handles bcrypt and scrypt differently:
```typescript
async function verifyPassword(data: { hash: string; password: string }): Promise<boolean> {
  if (isBcryptHash(hash)) {
    return bcrypt.compare(password, hash);
  }
  return false; // Let Better Auth's default verification handle scrypt
}
```

Returning `false` for scrypt hashes means Better Auth's fallback verification runs. This is functional but creates an implicit dependency on Better Auth's internal verification pipeline. If Better Auth changes its fallback behavior in a major version update, authentication could break silently.

**Mitigation:**
1. Implement explicit scrypt verification in the custom handler.
2. Add password hash format migration to convert all bcrypt hashes to scrypt.
3. Add integration tests covering both hash formats.

---

### R22. MEDIUM: Frontend API Client Has No Request Retry Logic

**Severity:** MEDIUM | **Probability:** Likely | **Impact:** Medium

**Evidence:**
The `ApiClient` in `packages/web/app/lib/api-client.ts` makes single fetch calls with a 30-second timeout (line 297) but has no retry logic for:
- Network failures (transient DNS, connection reset)
- 429 Too Many Requests (should back off and retry)
- 503 Service Unavailable (should retry after delay)
- 502 Bad Gateway (common during deployments)

The only error handling converts failures to `ApiError` and throws immediately.

**Mitigation:**
1. Add exponential backoff retry for retriable status codes (429, 502, 503).
2. Respect `Retry-After` headers from rate limiting responses.
3. Add circuit breaker pattern for cascading failure prevention.

---

### R23. MEDIUM: Idempotency Lock Timeout Hardcoded

**Severity:** MEDIUM | **Probability:** Unlikely | **Impact:** Medium

**Evidence:**
In `packages/api/src/plugins/idempotency.ts`, line 108:
```typescript
private readonly LOCK_TIMEOUT_MS = 30000; // 30 seconds
```

This hardcoded 30-second lock timeout means:
- Long-running operations (e.g., large report generation) that exceed 30 seconds will have their lock expired, allowing duplicate processing
- There's no way to configure per-route lock timeouts
- If a process crashes while holding a lock, it takes 30 seconds before another process can retry

**Mitigation:**
1. Make lock timeout configurable per-route or globally via environment variable.
2. Add lock heartbeat renewal for long-running operations.

---

### R24. LOW: Hardcoded Development Credentials in Source Code

**Severity:** LOW | **Probability:** Likely | **Impact:** Low

**Evidence:**
Default passwords are hardcoded in multiple files:
- `packages/api/src/plugins/db.ts`, line 67: `password: process.env["DB_PASSWORD"] || "hris_dev_password"`
- `packages/api/src/config/database.ts`, line 34: `export const DEFAULT_DB_PASSWORD = "hris_dev_password"`
- `docker/docker-compose.yml`, line 24: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-hris_dev_password}`

The `validateSecrets()` function in `packages/api/src/config/secrets.ts` correctly blocks these defaults in production (lines 100-106), but the defaults still exist in source code and Docker configs.

**Mitigation:**
1. Remove default passwords from source code; require explicit environment variables.
2. Fail fast in development if `.env` file is missing rather than using defaults.

---

### R25. LOW: No Bundle Size Analysis for Frontend

**Severity:** LOW | **Probability:** Likely | **Impact:** Low

**Evidence:**
The `packages/web/vite.config.ts` enables `sourcemap: true` in the build (line 17) but has no bundle analysis plugin. The `optimizeDeps.include` (line 49) pre-bundles `better-auth/react` and `better-auth/client/plugins`, suggesting awareness of bundle concerns, but there's no CI check or reporting for bundle size regression.

**Mitigation:**
1. Add `rollup-plugin-visualizer` for bundle analysis.
2. Set bundle size budgets in CI.

---

### R26. LOW: Test Infrastructure Quality Issues

**Severity:** LOW | **Probability:** Likely | **Impact:** Low

**Evidence:**
The CLAUDE.md explicitly documents (in "Known Pitfalls" section): "Most route tests, security tests, performance tests, chaos tests, and E2E tests assert local variables, not actual API calls." This means the test suite gives a false sense of coverage. The genuine integration tests are limited to: `rls.test.ts`, `idempotency.test.ts`, `outbox.test.ts`, `effective-dating.test.ts`, `state-machine.test.ts`, and 3 service unit tests.

**Mitigation:**
1. Rewrite hollow tests to use `TestApiClient` and make real API calls.
2. Add test quality metrics (mutation testing) to CI.
3. Prioritize rewriting security and E2E tests first.

---

### R27. LOW: Audit Plugin IP Extraction Trusts Proxy Headers

**Severity:** LOW | **Probability:** Unlikely | **Impact:** Low

**Evidence:**
In `packages/api/src/plugins/audit.ts`, the `extractClientIp()` function (lines 315-331) trusts `X-Forwarded-For` and `X-Real-IP` headers without checking trusted proxy configuration:
```typescript
const forwarded = request.headers.get("X-Forwarded-For");
if (forwarded) {
  const ips = forwarded.split(",").map((ip) => ip.trim());
  return ips[0] || null;
}
```

This is different from the rate limiting plugin which correctly validates trusted proxies (rate-limit.ts lines 44-75). A client can spoof their IP in audit logs by setting `X-Forwarded-For`.

Note: The rate limiting plugin correctly implements trusted proxy checking, making this inconsistency notable.

**Mitigation:**
1. Reuse the trusted proxy validation from the rate limiting plugin.
2. Create a shared `getClientIp()` utility used by both audit and rate limiting.

---

### R28. LOW: No Request Body Size Limits

**Severity:** LOW | **Probability:** Unlikely | **Impact:** Medium

**Evidence:**
No explicit request body size limit is configured in the Elysia app or nginx configuration. The `docker/docker-compose.yml` does not mount an nginx configuration, and the API server relies on Bun/Elysia defaults. Large request bodies could cause memory exhaustion.

**Mitigation:**
1. Configure `maxBodySize` in Elysia or add nginx `client_max_body_size`.
2. Set appropriate limits per endpoint (e.g., larger for file uploads).

---

### R29. LOW: Config Module Import Inconsistency

**Severity:** LOW | **Probability:** Unlikely | **Impact:** Low

**Evidence:**
The `packages/api/src/config/database.ts` was created to centralize database defaults, yet `packages/api/src/plugins/db.ts` still has its own inline defaults (lines 62-73) that duplicate the centralized config. The `loadDbConfig()` function in db.ts does not import from `database.ts`. This violates the stated goal of the config module ("IMPORTANT: All modules that need database connection defaults should import from this module").

**Mitigation:**
1. Refactor `loadDbConfig()` to import defaults from `database.ts`.
2. Remove duplicate default values from `db.ts`.

---

## Top 10 Risks to Address Immediately

| Priority | Risk ID | Title | Severity | Effort |
|----------|---------|-------|----------|--------|
| 1 | R1 | Frontend does not send CSRF tokens | CRITICAL | Low |
| 2 | R2 | No graceful shutdown for API server | CRITICAL | Low |
| 3 | R3 | Single points of failure in infrastructure | CRITICAL | High |
| 4 | R4 | Database connection pool exhaustion | HIGH | Medium |
| 5 | R5 | Rate limiting gaps for unauthenticated endpoints | HIGH | Medium |
| 6 | R8 | Audit logging outside transactions | HIGH | Medium |
| 7 | R12 | Dual user tables create data integrity risk | HIGH | High |
| 8 | R9 | Tenant cache suspension race window | HIGH | Low |
| 9 | R10 | Dashboard module inline SQL and no caching | HIGH | Low |
| 10 | R13 | No monitoring, metrics, or alerting | MEDIUM | Medium |

---

## Recommendations Summary

### Immediate (Week 1-2)
- **R1**: Add CSRF token support to frontend API client (~2 hours)
- **R2**: Add graceful shutdown handlers to API server (~1 hour)
- **R9**: Reduce tenant cache TTL to 60 seconds (~30 minutes)
- **R10**: Add Redis caching for dashboard stats (~2 hours)

### Short-term (Month 1)
- **R4**: Consolidate database connection pools and set limits
- **R5**: Implement IP-based rate limiting for public endpoints
- **R6**: Replace all SELECT * with explicit column lists
- **R8**: Move audit logging into business transactions
- **R13**: Deploy basic monitoring (Prometheus + Grafana)
- **R17**: Replace Redis KEYS with SCAN

### Medium-term (Quarter 1)
- **R3**: Implement database replication and Redis HA
- **R7**: Batch loop-based inserts
- **R12**: Plan user table consolidation
- **R14**: Standardize outbox pattern across all modules
- **R15**: Add migration validation tests
- **R20**: Optimize session resolution performance

### Long-term (Quarter 2+)
- **R19**: Implement Redlock for distributed locking
- **R22**: Add frontend retry logic with exponential backoff
- **R26**: Rewrite hollow tests with real API calls
