# Phase 1: Critical Fixes -- Sprint Plan

**Duration:** 3 sprints (6 weeks)
**Goal:** Resolve all issues that block production deployment
**Team:** 1-2 developers

---

## Sprint 1: Security Hardening (Weeks 1-2)

**Sprint Goal:** Close all HIGH-severity security vulnerabilities identified in the security audit.

### Stories

#### S1-01: Implement proper CSRF token validation
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** Security Audit HIGH-01, Architecture Risk R1
- **Description:** The `requireCsrf()` guard checks for header presence but never validates the token value. The frontend API client sends no CSRF token at all. Every POST/PUT/PATCH/DELETE from the frontend will 403 in production.
- **Acceptance Criteria:**
  - [ ] Server generates CSRF tokens using HMAC-SHA256 with `CSRF_SECRET`, bound to session ID
  - [ ] `/api/auth/csrf` endpoint returns a signed token
  - [ ] `requireCsrf()` recomputes HMAC and validates on every mutating request
  - [ ] Frontend `api-client.ts` fetches CSRF token and includes `X-CSRF-Token` header on all POST/PUT/PATCH/DELETE
  - [ ] Integration test verifies: valid token passes, invalid token returns 403, missing token returns 403
- **Files:**
  - `packages/api/src/plugins/auth-better.ts` (lines 513-529)
  - `packages/web/app/lib/api-client.ts` (buildHeaders method)
  - New: CSRF integration test

#### S1-02: Implement account lockout after failed login attempts
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** Security Audit HIGH-03
- **Description:** Rate limiting is IP-based only. An attacker using multiple IPs can brute-force a single account indefinitely. The `ACCOUNT_LOCKED` error code exists but no lockout logic is implemented.
- **Acceptance Criteria:**
  - [ ] Track failed login attempts per account in database or Redis
  - [ ] Lock account after 10 consecutive failed attempts
  - [ ] Implement exponential backoff (increasing delay after 3 failures)
  - [ ] Send notification email to user on account lockout
  - [ ] Admin can unlock accounts via API
  - [ ] Auto-unlock after configurable timeout (default 30 minutes)
  - [ ] Integration test covers: lockout trigger, locked login rejection, admin unlock, auto-unlock
- **Files:**
  - `packages/api/src/lib/better-auth.ts`
  - `packages/api/src/plugins/rate-limit.ts`

#### S1-03: Enable email verification for production
- **Priority:** P0
- **Estimate:** 1 point (0.5 days)
- **Source:** Security Audit HIGH-02
- **Description:** `requireEmailVerification: false` allows registration with arbitrary email addresses, risking account impersonation in an enterprise HRIS.
- **Acceptance Criteria:**
  - [ ] Set `requireEmailVerification: true` in production config
  - [ ] Verification email flow works with time-limited tokens
  - [ ] Unverified users cannot access tenant-scoped data
  - [ ] Development mode can optionally bypass verification for DX
- **Files:**
  - `packages/api/src/lib/better-auth.ts` (line 250)

#### S1-04: Add request body size limit
- **Priority:** P1
- **Estimate:** 1 point (0.5 days)
- **Source:** Security Audit MEDIUM-01, Architecture Risk R28
- **Description:** No maximum request body size configured. Attackers can exhaust server memory with large payloads.
- **Acceptance Criteria:**
  - [ ] Global body size limit of 10MB configured in Elysia
  - [ ] File upload endpoints have appropriate higher limits if needed
  - [ ] Requests exceeding limit return 413 Payload Too Large
  - [ ] Test verifies oversized requests are rejected
- **Files:**
  - `packages/api/src/app.ts`

#### S1-05: Remove hardcoded development database password fallback
- **Priority:** P1
- **Estimate:** 1 point (0.5 days)
- **Source:** Security Audit MEDIUM-02, Architecture Risk R24
- **Description:** `hris_dev_password` is hardcoded as a fallback in multiple files. If production fails to set `DB_PASSWORD`, the app silently connects with the dev password.
- **Acceptance Criteria:**
  - [ ] Production mode crashes on startup if `DATABASE_URL` or `DB_PASSWORD` is not set
  - [ ] `validateSecrets()` extended to validate database credentials
  - [ ] Development mode still works with defaults for DX
  - [ ] No hardcoded password in `db.ts` production path
- **Files:**
  - `packages/api/src/config/database.ts`
  - `packages/api/src/plugins/db.ts` (line 67)
  - `packages/api/src/config/secrets.ts`

#### S1-06: Increase minimum password length to 12 characters
- **Priority:** P2
- **Estimate:** 1 point (0.5 days)
- **Source:** Security Audit MEDIUM-06
- **Description:** Current minimum is 8 characters. NIST recommends 15+ for enterprise. The `isStrongPassword()` utility exists but is not wired into Better Auth.
- **Acceptance Criteria:**
  - [ ] Minimum password length increased to 12
  - [ ] `isStrongPassword()` from shared package wired into Better Auth password validation
  - [ ] Existing users with shorter passwords prompted to change on next login (informational, not blocking)
- **Files:**
  - `packages/api/src/lib/better-auth.ts` (line 248)

**Sprint 1 Velocity Target:** 10 points

---

## Sprint 2: Architecture Fixes (Weeks 3-4)

**Sprint Goal:** Fix critical architecture risks that would cause production failures or data leaks.

### Stories

#### S2-01: Add graceful shutdown to API server
- **Priority:** P0
- **Estimate:** 2 points (1 day)
- **Source:** Architecture Risk R2 (CRITICAL)
- **Description:** The API server has no `SIGTERM`/`SIGINT` handlers. Deployments will terminate in-flight requests, leak DB connections, and may leave RLS context inconsistent. The worker process already implements this correctly.
- **Acceptance Criteria:**
  - [ ] `SIGTERM` and `SIGINT` handlers added to `app.ts`
  - [ ] Handlers drain in-flight requests with a configurable timeout (default 30s)
  - [ ] Database connection pool closed gracefully
  - [ ] Redis connections closed gracefully
  - [ ] `unhandledRejection` and `uncaughtException` handlers log error and exit safely
  - [ ] Pattern matches the existing worker implementation
- **Files:**
  - `packages/api/src/app.ts`

#### S2-02: Create hris_app runtime role for production RLS enforcement
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** Infrastructure Audit Issue #2 (CRITICAL), Architecture Risk (production RLS bypass)
- **Description:** The application connects as `hris` superuser in production, which bypasses RLS entirely. The `hris_app` role with `NOBYPASSRLS` exists only in test setup. Multi-tenant isolation is a fiction without this fix.
- **Acceptance Criteria:**
  - [ ] `docker/postgres/init.sql` creates `hris_app` role with `NOBYPASSRLS`
  - [ ] All necessary schema grants applied to `hris_app`
  - [ ] Docker compose configured to use `hris_app` for API and worker connections
  - [ ] `hris` role used only for migration runner
  - [ ] Separate `DATABASE_URL` variables for migration vs runtime connections
  - [ ] Verified: API queries return only current tenant's data
  - [ ] Verified: `withSystemContext()` still works for admin operations
- **Files:**
  - `docker/postgres/init.sql`
  - `docker/docker-compose.yml`
  - `docker/.env.example`
  - `packages/api/src/plugins/db.ts`
  - `packages/api/src/db/migrate.ts`

#### S2-03: Consolidate database connection pools
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** Architecture Risk R4 (HIGH)
- **Description:** Three independent connection pools compete for PostgreSQL connections: main API (20), Better Auth (10), scheduler (unlimited). Risk of connection exhaustion under load.
- **Acceptance Criteria:**
  - [ ] Better Auth configured to use postgres.js adapter instead of separate `pg` Pool
  - [ ] `pg` and `@types/pg` removed from dependencies
  - [ ] Scheduler connection pool limited and documented
  - [ ] Total pool size documented and aligned with PostgreSQL `max_connections`
  - [ ] Connection pool monitoring added to health check endpoint
- **Files:**
  - `packages/api/src/lib/better-auth.ts`
  - `packages/api/src/worker/scheduler.ts`
  - `packages/api/src/plugins/db.ts`
  - `packages/api/package.json`

#### S2-04: Reduce tenant cache TTL and fix suspension race window
- **Priority:** P1
- **Estimate:** 1 point (0.5 days)
- **Source:** Architecture Risk R9 (HIGH)
- **Description:** Tenant data cached for 5 minutes. Suspended tenants can continue operating for up to 5 minutes after suspension.
- **Acceptance Criteria:**
  - [ ] Tenant cache TTL reduced to 60 seconds
  - [ ] Tenant status change triggers immediate cache invalidation
  - [ ] Test verifies suspended tenant is blocked within seconds
- **Files:**
  - `packages/api/src/plugins/tenant.ts`

#### S2-05: Replace Redis KEYS command with SCAN
- **Priority:** P1
- **Estimate:** 1 point (0.5 days)
- **Source:** Architecture Risk R17 (MEDIUM)
- **Description:** `invalidateTenantCache()` uses `KEYS` command which blocks the Redis server and scans all keys. Will cause latency spikes in production.
- **Acceptance Criteria:**
  - [ ] `KEYS` replaced with iterative `SCAN` in `invalidateTenantCache()`
  - [ ] No `KEYS` usage remains in production code
  - [ ] Performance improvement verified with large key count
- **Files:**
  - `packages/api/src/plugins/cache.ts` (lines 397-409)

#### S2-06: Fix audit logging transaction atomicity
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** Architecture Risk R8 (HIGH)
- **Description:** `AuditService.log()` opens a separate transaction from the business write. If business succeeds but audit fails (or vice versa), data integrity is violated.
- **Acceptance Criteria:**
  - [ ] All mutation routes use `logInTransaction()` instead of `audit.log()`
  - [ ] Audit writes share the same transaction handle as business writes
  - [ ] Linting rule or code review checklist prevents out-of-transaction audit writes
  - [ ] Test verifies audit record rolled back when business write fails
- **Files:**
  - `packages/api/src/plugins/audit.ts`
  - All route files that call `audit.log()` after mutations

**Sprint 2 Velocity Target:** 12 points

---

## Sprint 3: Infrastructure Essentials (Weeks 5-6)

**Sprint Goal:** Establish the minimum deployment and monitoring infrastructure needed for production.

### Stories

#### S3-01: Create deployment pipeline (CI/CD)
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** Infrastructure Audit Gap #1 (CRITICAL)
- **Description:** No CD workflow exists. No staging or production deployment automation. Docker images are not built or pushed in CI.
- **Acceptance Criteria:**
  - [ ] GitHub Actions workflow builds Docker images for API, worker, and web
  - [ ] Images pushed to container registry (GHCR or ECR)
  - [ ] Staging deployment triggered automatically on merge to main
  - [ ] Production deployment gated behind manual approval
  - [ ] Rollback mechanism documented (previous image tag)
  - [ ] Environment-specific configuration via GitHub Environments
- **Files:**
  - New: `.github/workflows/deploy.yml`
  - `packages/api/Dockerfile`
  - `packages/web/Dockerfile`

#### S3-02: Add structured logging
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** Infrastructure Audit P1 #5
- **Description:** All services use `console.log`. No structured format, no correlation IDs across services, no log levels.
- **Acceptance Criteria:**
  - [ ] Pino logger integrated into API and worker
  - [ ] JSON output format with fields: timestamp, level, requestId, tenantId, userId, module
  - [ ] Request ID from `errorsPlugin` propagated through logger context
  - [ ] All `console.log` calls replaced with structured logger calls
  - [ ] Log level configurable via `LOG_LEVEL` env var
  - [ ] Sensitive data (passwords, tokens) never logged
- **Files:**
  - New: `packages/api/src/lib/logger.ts`
  - `packages/api/src/plugins/errors.ts`
  - All module files using `console.log`

#### S3-03: Add error tracking (Sentry)
- **Priority:** P1
- **Estimate:** 1 point (0.5 days)
- **Source:** Infrastructure Audit P1 #6
- **Description:** No error tracking service. Unhandled errors disappear into container logs with rotation.
- **Acceptance Criteria:**
  - [ ] Sentry SDK integrated into API server
  - [ ] `errorsPlugin` captures unhandled errors to Sentry
  - [ ] Source maps uploaded for meaningful stack traces
  - [ ] Environment, release, and user context attached to events
  - [ ] `SENTRY_DSN` env var configurable (optional -- disabled when absent)
- **Files:**
  - `packages/api/src/plugins/errors.ts`
  - `packages/api/src/app.ts`
  - `packages/api/package.json`

#### S3-04: Add security scanning to CI
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** Infrastructure Audit Gap #2 (HIGH)
- **Description:** No SAST, dependency audit, or container scanning in the CI pipeline.
- **Acceptance Criteria:**
  - [ ] CodeQL or Semgrep SAST action added to CI
  - [ ] Dependency audit step (npm audit / Snyk) added
  - [ ] Container image scanning (Trivy) after Docker build
  - [ ] High/critical findings fail the build
  - [ ] Results uploaded as SARIF for GitHub Security tab
- **Files:**
  - `.github/workflows/test.yml` or new `.github/workflows/security.yml`

#### S3-05: Add API metrics endpoint
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** Infrastructure Audit P1 #9, Architecture Risk R13
- **Description:** The worker has a `/metrics` endpoint but the API server has no metrics. No way to monitor request rates, latency, or error rates.
- **Acceptance Criteria:**
  - [ ] `/metrics` endpoint on API server exposing Prometheus-compatible metrics
  - [ ] Metrics include: request count, request duration histogram, error rate, active connections, DB pool stats
  - [ ] Metrics scoped by route pattern and status code
  - [ ] Endpoint excluded from auth/tenant plugins (publicly accessible like health checks)
- **Files:**
  - `packages/api/src/app.ts`
  - New: `packages/api/src/plugins/metrics.ts`

#### S3-06: Implement offsite backup storage
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** Infrastructure Audit P0 #3
- **Description:** Backups stored only in Docker volume on the same host. Host failure means total data loss.
- **Acceptance Criteria:**
  - [ ] Backup script pushes compressed dumps to S3 after each backup
  - [ ] S3 bucket, region, and credentials configurable via env vars
  - [ ] Backup verification: restore to temp database and run sanity query
  - [ ] Retention policy applies to both local and S3 copies
  - [ ] Alert on backup failure (email or webhook)
- **Files:**
  - `docker/scripts/backup-db.sh`
  - `docker/docker-compose.yml` (db-backup service)

#### S3-07: Pin Bun version in CI and fix Redis health check
- **Priority:** P2
- **Estimate:** 1 point (0.5 days)
- **Source:** Infrastructure Audit P2 #10, P1 #8
- **Acceptance Criteria:**
  - [ ] CI uses explicit Bun version matching `packageManager` field in `package.json`
  - [ ] Redis health check includes authentication: `redis-cli -a $REDIS_PASSWORD ping`
  - [ ] CI Redis service configured with password matching dev/prod config
- **Files:**
  - `.github/workflows/test.yml`
  - `docker/docker-compose.yml`

**Sprint 3 Velocity Target:** 16 points

---

## Phase 1 Exit Criteria

All of the following must be true before moving to Phase 2:

- [ ] All HIGH-severity security findings resolved (CSRF, email verification, account lockout)
- [ ] API server has graceful shutdown
- [ ] Production connects as `hris_app` role (RLS enforced)
- [ ] Database connection pools consolidated and bounded
- [ ] Deployment pipeline builds and pushes Docker images
- [ ] Structured logging operational
- [ ] Error tracking (Sentry) capturing unhandled errors
- [ ] Security scanning in CI
- [ ] Backups pushed to offsite storage
- [ ] All new features have integration tests

**Total Phase 1 Effort:** ~38 story points across 3 sprints
**Total Phase 1 Duration:** 6 weeks
