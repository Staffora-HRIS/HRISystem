# Infrastructure Audit

*Last updated: 2026-03-28*

**Project:** Staffora HRIS Platform
**Audit Date:** 2026-03-13
**Auditor:** Infrastructure Agent (Claude Opus 4.6)
**Scope:** Docker, CI/CD, database infrastructure, monitoring, environment management, build system, disaster recovery

---

## Infrastructure Overview

Staffora is a multi-tenant HRIS platform deployed as a set of Docker containers:

| Component | Technology | Container | Port |
|-----------|-----------|-----------|------|
| API Server | Bun + Elysia.js | staffora-api | 3000 |
| Background Worker | Bun (Redis Streams) | staffora-worker | 3001 (health) |
| Web Frontend | React Router v7 | staffora-web | 5173 |
| Database | PostgreSQL 16 | staffora-postgres | 5432 |
| Cache/Queue | Redis 7 | staffora-redis | 6379 |
| Reverse Proxy | Nginx (production profile) | staffora-nginx | 80/443 |
| DB Backup | PostgreSQL 16 (sidecar) | staffora-db-backup | N/A |

**Monorepo:** Bun workspaces with packages `@staffora/api`, `@staffora/web`, and `@staffora/shared`.

---

## Docker Assessment

### Compose Configuration (`docker/docker-compose.yml`)

**Strengths:**

- Well-structured with 7 services covering the full stack
- All core services (postgres, redis, api, worker) have health checks with `interval`, `timeout`, `retries`, and `start_period`
- Dependency ordering uses `condition: service_healthy` for api and worker, ensuring postgres/redis are ready before app starts
- Resource limits (`deploy.resources.limits/reservations`) set on all services with reasonable defaults (e.g., postgres 2 CPU / 2GB, API 2 CPU / 1GB)
- JSON-file logging driver with rotation (`max-size`, `max-file`) on all containers
- Custom bridge network (`staffora-network`) with explicit IPAM subnet (172.28.0.0/16)
- Named volumes for data persistence (`postgres_data`, `redis_data`, `worker_uploads`, `db_backups`)
- Production profile for nginx reverse proxy, keeping dev stack clean
- Automated daily database backup sidecar (`db-backup`) at 2 AM UTC with configurable retention

**Issues:**

1. **[Medium] Web container depends on `api` without health condition** -- Uses simple `depends_on: [api]` instead of `condition: service_healthy`, so web may start before api is ready.
2. **[Medium] No `hris_app` role creation in init or migrations** -- The `NOBYPASSRLS` application role (`hris_app`) documented in CLAUDE.md is only created dynamically by the test setup (`setup.ts`). Neither `docker/postgres/init.sql` nor any migration creates it. In production, the API connects as the `hris` superuser, which **bypasses RLS entirely** -- this is a critical security gap. The two-role model (admin `hris` for migrations, restricted `hris_app` for runtime) exists only in test code.
3. **[Low] Redis health check does not include auth** -- `redis-cli ping` will fail when `requirepass` is set. Should be `redis-cli -a $REDIS_PASSWORD ping` or use the `--no-auth-warning` flag.
4. **[Low] Nginx SSL directory does not exist** -- `docker/nginx/ssl/` referenced in the compose file is absent. Production nginx will fail to start without SSL certificates.
5. ~~**[Low] Backup container uses shell-based scheduler**~~ -- [RESOLVED] Replaced sleep loop with proper cron scheduling via `backup-entrypoint.sh`. Uses `/etc/cron.d/` with configurable `BACKUP_SCHEDULE` env var.

**Note:** An upstream `website_backend` reference in the nginx config (`docker/nginx/nginx.conf`) is now obsolete. The marketing site (`Website/`) has been moved to a separate repository. The nginx config reference should be cleaned up.

### Dockerfiles

**API Dockerfile (`packages/api/Dockerfile`):**
- Three-stage multi-stage build (deps -> builder -> runner) -- good for image size
- Non-root user (`staffora:1001`) created and used -- good security practice
- `curl` installed for health checks in final stage
- `.dockerignore` excludes test files, markdown, and env files
- Uses `bun build` to produce a compiled bundle
- **Issue [Medium]:** Build only compiles `src/app.ts`. The worker container re-uses this image but runs `src/worker.ts` via source (not compiled). Worker entry point may not be included in the `dist/` output.
- **Issue [Low]:** Base image pinned to `oven/bun:1.1.38-alpine` -- should use a more specific or regularly updated tag

**Web Dockerfile (`packages/web/Dockerfile`):**
- Two-stage build (builder -> production)
- Non-root user created (named `nodejs`/`nextjs` -- misnomer, should be renamed)
- Uses `wget` for health checks (not `curl`)
- **Issue [Medium]:** Build stage sets `NODE_ENV=development` which may include dev dependencies in the build; final stage correctly sets `NODE_ENV=production`
- **Issue [Low]:** Runs `react-router-serve` for production serving -- adequate but no static asset CDN integration

### Supporting Configuration

**PostgreSQL Init (`docker/postgres/init.sql`):**
- Creates `uuid-ossp` and `pgcrypto` extensions
- Creates `app` schema with search path
- Installs RLS context functions (`set_tenant_context`, `enable_system_context`, etc.)
- Grants privileges to `hris` role with default privilege inheritance
- Well-documented with comments
- **Missing:** No `hris_app` role creation (see issue above)

**Redis Config (`docker/redis/redis.conf`):**
- AOF persistence enabled with `everysec` fsync -- good durability
- RDB snapshots configured at multiple intervals
- Memory limit set to 256MB with `volatile-lru` eviction
- Slow log enabled (queries > 10ms)
- Stream settings configured for job queues
- Password authentication enabled (dev default)
- Dangerous commands not disabled (commented out for prod)

**Nginx Config (`docker/nginx/nginx.conf`):**
- TLS 1.2/1.3 with modern cipher suite
- HSTS enabled with preload
- Security headers (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection)
- Rate limiting zones: 100r/s for API, 10r/s for auth endpoints
- Connection limit per IP: 50
- Upstream keepalive connections
- Gzip compression for common content types
- Static asset caching (1 day)
- HTTP to HTTPS redirect
- Client body size limit: 50MB
- **Issue [Low]:** Upstream `website_backend` references `server website:5174` but the marketing site has been moved to a separate repository -- this upstream should be removed from the nginx config

---

## CI/CD Assessment

### GitHub Actions (`.github/workflows/test.yml`)

**Pipeline stages:**

| Stage | Job | Status |
|-------|-----|--------|
| Checkout | actions/checkout@v4 | Present |
| Runtime | oven-sh/setup-bun@v2 (latest) | Present |
| Install | `bun install --frozen-lockfile` | Present |
| Type Check | `bun run typecheck` | Present |
| Lint | `bun run lint` | Present |
| Build | `bun run build` | Present |
| Migrations | `bun run migrate:up` | Present |
| API Tests | `bun run test:api` | Present |
| Shared Tests | `bun test packages/shared` | Present |
| Frontend Tests | `bun run test:web -- --run --coverage` | Present (separate job) |
| Coverage Upload | `actions/upload-artifact@v4` | Present (frontend only) |

**Strengths:**
- Runs on push to `main` and PRs targeting `main`
- PostgreSQL 16 and Redis 7 service containers with health checks
- Frozen lockfile enforcement
- Frontend coverage uploaded as artifact (7-day retention)
- Proper test database credentials (`hris_app` role referenced in env vars)
- Permissions scoped to `contents: read` (principle of least privilege)

**Gaps:**

1. **[Critical] No deployment pipeline** -- No CD workflow exists. No staging or production deployment automation.
2. **[High] No security scanning** -- No SAST (CodeQL, Semgrep), no dependency audit (`bun audit` or Snyk), no container scanning (Trivy).
3. **[High] No Docker image build/push** -- CI does not build Docker images or push to a registry. No container-based testing.
4. **[Medium] Redis CI service has no password** -- The CI Redis service runs without `--requirepass`, which differs from the dev/prod configuration. This means auth-dependent Redis code paths are not tested in CI.
5. **[Medium] No E2E tests in CI** -- Only unit/integration tests run. No Playwright/Cypress browser tests.
6. **[Medium] No API coverage** -- Only frontend tests produce coverage reports. API test coverage is not measured.
7. **[Low] Bun version not pinned** -- Uses `bun-version: latest` which may cause non-reproducible builds.

---

## Database Infrastructure

### Migration System (`packages/api/src/db/migrate.ts`)

**Implementation:**
- Custom migration runner using postgres.js
- Tracks applied migrations in `public.schema_migrations` table (filename + applied_at)
- Files named `NNNN_description.sql`, sorted lexicographically
- Migrations run inside transactions using `tx.unsafe()`
- Handles duplicate object errors (42710) gracefully by marking as applied
- Supports `up` and `create` commands

**Migration count:** 123 SQL files (0001 through 0122, plus `fix_schema_migrations_filenames.sql`)
- Range: `0001_extensions.sql` to `0122_better_auth_organization.sql`
- A filename fix migration exists for renumbering after a numbering collision

**Issues:**

1. **[Critical] No rollback support** -- `migrate:down` throws an error: "Down migrations are not supported." Migration files include commented-down sections, but they cannot be executed. Any bad migration requires manual database intervention.
2. **[High] No migration dry-run or validation** -- No way to preview what a migration will do before applying it.
3. **[Medium] Filename renumbering fragility** -- The `fix_schema_migrations_filenames.sql` script exists because migrations were renumbered. This pattern is brittle and indicates the numbering scheme has been a source of errors.
4. **[Medium] No migration locking** -- Multiple instances running migrations simultaneously could cause conflicts. No advisory lock or similar mechanism.
5. **[Low] `tx.unsafe()` usage** -- Migrations use `unsafe()` to run raw SQL, which is expected but bypasses parameterized query protections.

### Database Configuration (`packages/api/src/config/database.ts`)

- Centralized configuration constants to prevent credential mismatches
- URL builder functions for various environments
- URL validation helper
- **Good practice:** Comments explicitly document sync requirements with docker-compose defaults

### Database Client (`packages/api/src/plugins/db.ts`)

- Connection pool with configurable max connections (default 20), idle timeout (30s), connect timeout (10s)
- SSL support (`require`/`prefer` modes)
- Search path set to `app,public`
- Automatic `snake_case` <-> `camelCase` column transform
- Transaction wrapper with RLS context (`set_tenant_context`)
- System context wrapper for administrative operations
- Health check method (`SELECT 1`)
- Graceful shutdown on Elysia stop
- Debug query logging in development (first 200 chars of each query)

### Backup & Restore

**Automated Backup (`docker-compose.yml` db-backup service):**
- Runs daily at 2 AM UTC via bash sleep loop
- `pg_dump` with `--no-owner --no-acl --clean --if-exists` flags
- Dumps `app` and `public` schemas
- Output compressed with gzip
- Configurable retention (`BACKUP_RETENTION_DAYS`, default 7)
- Stored in `db_backups` Docker volume

**Manual Backup (`docker/scripts/backup-db.sh`):**
- Shell script for ad-hoc backups
- Runs `pg_dump` inside the postgres container
- Validates backup is not empty
- Configurable output directory and retention
- Includes cron example in comments

**Manual Restore (`docker/scripts/restore-db.sh`):**
- Interactive confirmation prompt (safety)
- Pipes gzipped backup through `psql` with `ON_ERROR_STOP`
- Clear warning about data destruction

**Issues:**
1. **[High] Backups stored only in Docker volume** -- If the Docker host is lost, backups are lost. No offsite/S3 backup push.
2. **[Medium] No backup verification** -- No automated restore test or checksum validation.
3. **[Medium] No point-in-time recovery** -- Only full database dumps. No WAL archiving or continuous archiving configured.
4. **[Low] Backup sidecar uses same postgres:16 image** -- Pulls a full PostgreSQL image just to run `pg_dump`. A smaller image would suffice.

---

## Monitoring & Observability

### Health Check Endpoints

**API Server (`/health`, `/ready`, `/live`):**
- `/health` -- Returns status (`healthy`/`degraded`/`unhealthy`), checks database and Redis connectivity with latency measurements, includes uptime and version
- `/ready` -- Returns `ready` or `not_ready` based on database + Redis health
- `/live` -- Simple liveness probe (`{ status: "alive" }`)
- All three endpoints are placed before auth/tenant plugins (publicly accessible)

**Worker Health (`port 3001`):**
- `/health` -- Returns worker status, active/processed/failed job counts, Redis/database connection status, last poll time
- `/ready` -- Returns ready state based on health
- `/live` -- Simple liveness
- `/metrics` -- Prometheus-compatible text format with 6 metrics (active jobs, processed total, failed total, uptime, redis up, database up)

### Logging

- **Console-based logging only** -- All services use `console.log`/`console.error`/`console.warn`
- **No structured logging** -- No JSON log format, no log levels library (pino, winston, etc.)
- **Docker log rotation** -- Configured via `json-file` driver with max-size and max-file limits
- **Debug query logging** -- Database queries logged in development (first 200 chars + params)
- **Error logging** -- Request ID attached to unhandled errors via `errorsPlugin`
- **Nginx logging** -- Custom `main` log format with upstream timing metrics

### What Is Missing

| Capability | Status |
|-----------|--------|
| Structured logging (JSON) | **Missing** |
| Log aggregation (ELK, Loki) | **Missing** |
| Error tracking (Sentry, Bugsnag) | **Missing** |
| APM (Datadog, New Relic) | **Missing** |
| Distributed tracing (OpenTelemetry) | **Missing** |
| Uptime monitoring | **Missing** |
| Alerting (PagerDuty, OpsGenie) | **Missing** |
| Dashboard (Grafana) | **Missing** |
| API metrics (request rate, latency, error rate) | **Missing** (worker has basic Prometheus metrics) |

The worker's `/metrics` endpoint is the only observability surface beyond health checks. The API server has no metrics endpoint.

---

## Environment Management

### Environment Variables

**Configuration approach:** Environment variables with defaults, loaded from `docker/.env` (git-ignored) or `docker/.env.example` (committed).

**Variable categories:**

| Category | Variables | Status |
|----------|-----------|--------|
| Database | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` | Well-documented |
| Redis | `REDIS_URL`, `REDIS_PASSWORD`, `REDIS_PORT` | Well-documented |
| Auth Secrets | `BETTER_AUTH_SECRET`, `SESSION_SECRET`, `CSRF_SECRET` | Well-documented with generation instructions |
| CORS | `CORS_ORIGIN` | Supports comma-separated origins |
| Logging | `LOG_LEVEL` | debug/info/warn/error |
| Rate Limiting | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW` | Configurable |
| Storage | `STORAGE_TYPE`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Local + S3 backends |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Commented out in example |
| Feature Flags | `FEATURE_MFA_REQUIRED`, `FEATURE_AUDIT_ENABLED`, `FEATURE_RATE_LIMIT_ENABLED` | Present |

### Secret Management

**Strengths:**
- `docker/.env` is git-ignored; `.env.example` committed with placeholder values
- Startup secret validation (`src/config/secrets.ts`) checks for:
  - Missing required secrets
  - Minimum length (32 chars for auth secrets)
  - Known insecure default values
- In production, the app **crashes** if secrets are invalid
- In development, warnings are logged but startup continues
- `.gitignore` excludes `.pem`, `.key`, `.crt`, `credentials.json`, `secrets.json`

**Issues:**
1. **[High] No external secret store** -- All secrets are in environment variables. No integration with AWS Secrets Manager, HashiCorp Vault, or similar.
2. **[Medium] Default passwords in code** -- `hris_dev_password` and `staffora_redis_dev` are hardcoded as defaults in multiple files. If `.env` is not created, these defaults are used silently.
3. **[Medium] No secret rotation mechanism** -- No documentation or tooling for rotating database passwords, auth secrets, or API keys.
4. **[Low] `BETTER_AUTH_API_KEY` not validated** -- Only 3 of the auth secrets are validated at startup; the API key is passed through without checks.

---

## Build System

### Bun Workspaces (root `package.json`)

- **Package manager:** Bun 1.1.38 (pinned via `packageManager` field)
- **Workspaces:** `packages/*`
- **Scripts:** Comprehensive set of dev, build, test, lint, typecheck, migrate, docker commands
- **Filter pattern:** Uses `bun run --filter @staffora/...` for package-specific commands

### Package Build Tools

| Package | Build Tool | Test Runner | Notes |
|---------|-----------|-------------|-------|
| `@staffora/api` | `bun build` | `bun test` | Compiles to `dist/app.js` |
| `@staffora/web` | `react-router build` (Vite) | `vitest` | Source maps enabled |
| `@staffora/shared` | None (consumed as source) | `bun test` | TypeScript only |

### Dependency Highlights

- **Runtime:** Elysia.js, postgres.js, ioredis, better-auth, pdf-lib, exceljs, @aws-sdk/client-s3
- **Frontend:** React 18, React Router 7, TanStack Query 5, Tailwind CSS 3, Zod, Lucide icons
- **Dev:** TypeScript 5.7, ESLint 9, Vitest, Testing Library, Faker.js
- **No lockfile parity issue:** `bun.lock` is committed and used with `--frozen-lockfile` in CI

---

## Disaster Recovery

### Current Capabilities

| Capability | Status | Details |
|-----------|--------|---------|
| Automated backups | **Present** | Daily pg_dump at 2 AM UTC, 7-day retention |
| Manual backup script | **Present** | `docker/scripts/backup-db.sh` |
| Manual restore script | **Present** | `docker/scripts/restore-db.sh` with safety confirmation |
| Offsite backups | **Missing** | Backups stored only in Docker volume on same host |
| Point-in-time recovery | **Missing** | No WAL archiving |
| Migration rollback | **Missing** | Down migrations explicitly unsupported |
| Multi-region failover | **Missing** | Single-host deployment only |
| Database replication | **Missing** | No read replicas or streaming replication |
| Disaster recovery plan | **Missing** | No documented RTO/RPO targets |
| Backup restore testing | **Missing** | No automated restore verification |
| Redis backup | **Partial** | RDB + AOF persistence in Docker volume; no offsite |

### Recovery Time Estimates (Informal)

| Scenario | Estimated Recovery | Notes |
|----------|-------------------|-------|
| Application crash | < 1 minute | Docker `restart: unless-stopped` handles this |
| Single container failure | < 1 minute | Docker restart + health checks |
| Database corruption | 10-30 minutes | Manual restore from latest backup |
| Host failure | Hours | Requires new host, Docker setup, backup restore |
| Data loss (no backup) | **Unrecoverable** | No WAL archiving means data between backups is lost |

---

## Infrastructure Score

### Scoring Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Docker Setup | 20% | 78/100 | 15.6 |
| CI/CD Pipeline | 15% | 52/100 | 7.8 |
| Database Infrastructure | 20% | 55/100 | 11.0 |
| Monitoring & Observability | 15% | 25/100 | 3.8 |
| Environment Management | 10% | 68/100 | 6.8 |
| Build System | 10% | 82/100 | 8.2 |
| Disaster Recovery | 10% | 35/100 | 3.5 |

### Overall Infrastructure Score: 57/100

**Rating: Functional for Development, Not Production-Ready**

The Docker composition, build system, and environment management are solid for a development/staging environment. The critical gaps are in monitoring (nearly absent), disaster recovery (no offsite backups, no rollback), CI/CD (no deployment pipeline), and the `hris_app` role gap that means RLS is bypassed in production.

---

## Prioritized Improvements

### P0 -- Critical (Address Before Any Production Deployment)

1. **Create the `hris_app` runtime role in init.sql and production setup**
   - The application must connect as `hris_app` (NOBYPASSRLS) in production, not as the `hris` superuser
   - Without this, Row-Level Security is entirely bypassed, making multi-tenant isolation a fiction
   - Path: `docker/postgres/init.sql` -- add role creation and grants

2. **Implement migration rollback support**
   - At minimum, support executing the commented DOWN sections in migration files
   - Consider adopting a mature migration tool (e.g., `dbmate`, `golang-migrate`) that handles up/down natively
   - Path: `packages/api/src/db/migrate.ts`

3. **Implement offsite backup storage**
   - Push backups to S3 or equivalent after each dump
   - The backup sidecar already has the dump logic; add an S3 upload step
   - Add backup verification (restore to a test database and run a sanity query)

4. **Add a deployment pipeline**
   - Build and push Docker images to a container registry (ECR, GHCR) on merge to main
   - Deploy to staging automatically; gate production behind manual approval
   - Path: `.github/workflows/` -- add `deploy.yml`

### P1 -- High (Address Within First Sprint)

5. **Add structured logging**
   - Replace `console.log` with a structured logger (pino recommended for Bun/Node)
   - JSON output format with request ID, tenant ID, user ID correlation
   - Estimated effort: 1-2 days

6. **Add error tracking**
   - Integrate Sentry or similar for unhandled errors and performance monitoring
   - The `errorsPlugin` already has centralized error handling -- add Sentry capture there
   - Estimated effort: 0.5 days

7. **Add security scanning to CI**
   - Dependency audit: `bun audit` or Snyk in CI
   - SAST: CodeQL or Semgrep action
   - Container scanning: Trivy action after Docker build
   - Estimated effort: 0.5 days

8. **Fix Redis health check to include authentication**
   - Current: `redis-cli ping` (fails with requirepass)
   - Fix: `redis-cli -a $$REDIS_PASSWORD ping`

9. **Add API metrics endpoint**
   - Expose Prometheus metrics from the API server (request count, latency histogram, error rate)
   - The worker already has a `/metrics` endpoint as a template

### P2 -- Medium (Address Within First Month)

10. **Pin Bun version in CI** -- Replace `bun-version: latest` with explicit version matching `packageManager` field
11. **Add migration locking** -- Use PostgreSQL advisory locks to prevent concurrent migration runs
12. **Add password for Redis in CI** -- Match the dev/prod configuration
13. **Web container health dependency** -- Add `condition: service_healthy` for api dependency
14. **Add WAL archiving for point-in-time recovery** -- Configure `archive_mode` and `archive_command` in PostgreSQL
15. **Rename misleading user in web Dockerfile** -- `nextjs` -> `staffora` for consistency
16. **Create `docker/nginx/ssl/` placeholder** -- Add a README explaining cert provisioning (Let's Encrypt or manual)
17. **Add E2E tests to CI** -- Playwright or Cypress against the Docker-composed stack

### P3 -- Low (Nice to Have)

18. **Add Grafana + Prometheus stack** -- Docker compose profile for monitoring
19. **Implement secret rotation tooling** -- Scripts or documentation for rotating database/auth secrets
20. ~~**Replace backup sidecar bash loop with cron**~~ -- [DONE] Replaced with cron-based `backup-entrypoint.sh`
21. **Add database connection pooler (PgBouncer)** -- For production scale
22. **Document disaster recovery plan** -- Define RTO/RPO targets, runbook for various failure scenarios
23. **Add log aggregation** -- ELK stack or Grafana Loki for centralized log search

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with all scores
- [Deployment Guide](../05-development/DEPLOYMENT.md) — Docker Compose deployment instructions
- [DevOps Dashboard](../06-devops/devops-dashboard.md) — CI/CD pipeline architecture
- [DevOps Status Report](../06-devops/devops-status-report.md) — Pipeline health and configuration
- [DevOps Master Checklist](../06-devops/devops-master-checklist.md) — DevOps readiness checklist
- [Production Checklist](../11-operations/production-checklist.md) — Pre-launch infrastructure requirements
- [Architecture Map](../02-architecture/architecture-map.md) — Deployment architecture diagrams
- [Risk Register](../13-roadmap/risk-register.md) — Infrastructure risks and mitigations
