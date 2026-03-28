# Staffora Platform -- System Documentation

Comprehensive reference for the Staffora HRIS platform. Last generated: 2026-03-16.

*Last updated: 2026-03-17*

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [System Components](#2-system-components)
3. [Development Guide](#3-development-guide)
4. [Deployment Guide](#4-deployment-guide)
5. [API Overview](#5-api-overview)
6. [Security Architecture](#6-security-architecture)
7. [HR Module Inventory](#7-hr-module-inventory)
8. [Monitoring and Operations](#8-monitoring-and-operations)

---

## 1. Platform Overview

### Product

**Staffora** is a UK-only enterprise multi-tenant Human Resource Information System (HRIS). The platform is designed for UK employers and includes full support for UK employment law, GDPR compliance, statutory leave entitlements, pension auto-enrolment, and other UK-specific regulatory requirements.

- **URL**: https://staffora.co.uk
- **Staging**: https://staging.staffora.co.uk
- **API (production)**: https://api.staffora.co.uk
- **API (staging)**: https://staging-api.staffora.co.uk

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun 1.1+ |
| Backend framework | Elysia.js with TypeBox validation |
| Frontend framework | React 18 + React Router v7 (framework mode) |
| Data fetching | React Query (TanStack Query) |
| Styling | Tailwind CSS + shadcn/ui components |
| Authentication | BetterAuth (sessions, MFA, CSRF) |
| Database | PostgreSQL 16 with Row-Level Security (RLS) |
| Cache and queues | Redis 7 (sessions, caching, Streams for async jobs) |
| Infrastructure | Docker Compose |
| CI/CD | GitHub Actions |
| Container registry | GitHub Container Registry (ghcr.io) |
| Package manager | Bun workspaces (monorepo) |

### Key Architectural Decisions

1. **Multi-tenant via RLS**: Every tenant-owned table has a `tenant_id` column with PostgreSQL Row-Level Security policies. The application connects as a non-superuser role (`hris_app` with `NOBYPASSRLS`) so tenant isolation is enforced at the database level, not just the application layer.

2. **Effective dating for temporal HR data**: Records that change over time (compensation, positions, contracts) use `effective_from`/`effective_to` columns with overlap prevention validated under transaction.

3. **Transactional outbox pattern**: Domain events are written to a `domain_outbox` table in the same database transaction as the business write. A background poller publishes them to Redis Streams for async processing.

4. **Idempotency on all mutations**: Every POST/PUT/PATCH/DELETE endpoint requires an `Idempotency-Key` header, scoped to `(tenant_id, user_id, route_key)`, with a 24-72 hour TTL.

5. **State machines for lifecycle management**: Five state machines govern employee lifecycle, leave requests, case management, workflow/approvals, and performance cycles. Transitions are enforced in code and logged immutably for audit.

6. **Plugin-based architecture**: The Elysia.js backend uses an ordered plugin chain (11 plugins) that builds up context (database, cache, auth, tenant, RBAC, audit) for every request.

7. **All tables in `app` schema**: The database uses a dedicated `app` schema (not `public`). The search path is set to `app,public` so queries can use bare table names.

8. **UK-first compliance**: US-centric defaults (SSN, FLSA, etc.) have been removed. The platform includes modules for Right to Work, SSP, Statutory Leave, Pension, Working Time Regulations, Gender Pay Gap, NMW, and Health and Safety.

---

## 2. System Components

### 2.1 API Server (@staffora/api)

| Property | Value |
|----------|-------|
| Purpose | REST API backend serving all HRIS functionality |
| Technology | Bun + Elysia.js + TypeBox + postgres.js |
| Entry point | `packages/api/src/app.ts` |
| Worker entry point | `packages/api/src/worker.ts` |
| Port | 3000 (configurable via `PORT` env var) |
| Health endpoint | `GET /health` |
| Readiness endpoint | `GET /ready` |
| Liveness endpoint | `GET /live` |
| Swagger docs | `GET /docs` |
| Container name | `staffora-api` |

#### Plugin Chain (Registration Order)

Plugins have dependencies and must be registered in this exact order:

| Order | Plugin | Purpose | Dependencies |
|:-----:|--------|---------|-------------|
| 1 | CORS | Cross-origin request handling | None (must be first) |
| 2 | `securityHeadersPlugin` | CSP, HSTS, X-Frame-Options, Referrer-Policy | After CORS |
| 3 | Swagger | OpenAPI documentation at `/docs` | None |
| 4 | `errorsPlugin` | Structured error handling, request ID generation | None |
| 5 | `dbPlugin` | PostgreSQL connectivity (postgres.js) | None |
| 6 | `cachePlugin` | Redis caching | None |
| 7 | `rateLimitPlugin` | Per-IP and per-user request throttling | cache |
| 8 | `betterAuthPlugin` | BetterAuth route handler for `/api/auth/*` | db, cache |
| 9 | `authPlugin` | Session/user resolution | db, cache |
| 10 | `tenantPlugin` | Tenant resolution, sets `app.current_tenant` | db, cache, auth |
| 11 | `rbacPlugin` | Permission-based authorization | db, cache, auth, tenant |
| 12 | `idempotencyPlugin` | Request deduplication via `Idempotency-Key` header | db, cache, auth, tenant |
| 13 | `auditPlugin` | Audit logging of all mutations | db, auth, tenant |

Health, readiness, and liveness endpoints are registered between `betterAuthPlugin` and `authPlugin` so they are accessible without authentication.

#### Module System

The API has **105 feature modules** (with 15 additional internal/upcoming), each following the pattern:
```
modules/{name}/
  schemas.ts      -- TypeBox request/response schemas
  repository.ts   -- Database access layer (postgres.js tagged templates)
  service.ts      -- Business logic
  routes.ts       -- Elysia route definitions
  index.ts        -- Re-exports
```

All module routes are grouped under `/api/v1/` in `app.ts`.

#### Database Client Behavior

The `DatabaseClient` in `src/plugins/db.ts` configures postgres.js with:
- **Search path**: `app,public` -- queries use bare table names (e.g., `employees` not `app.employees`)
- **Column transform**: Auto-converts `snake_case` (DB) to `camelCase` (TypeScript) via `postgres.toCamel`/`postgres.fromCamel`
- **Tenant context**: `db.withTransaction(ctx, callback)` sets RLS context automatically via `app.set_tenant_context()`
- **System bypass**: `db.withSystemContext(callback)` wraps calls with `enable/disable_system_context()`

### 2.2 Background Worker

| Property | Value |
|----------|-------|
| Purpose | Async job processing, scheduled tasks, outbox polling |
| Technology | Bun + Redis Streams + postgres.js |
| Entry point | `packages/api/src/worker.ts` |
| Scheduler | `packages/api/src/worker/scheduler.ts` |
| Health port | 3001 (configurable via `WORKER_HEALTH_PORT`) |
| Health endpoint | `GET /health` (on port 3001) |
| Readiness endpoint | `GET /ready` |
| Liveness endpoint | `GET /live` |
| Metrics endpoint | `GET /metrics` (Prometheus format) |
| Container name | `staffora-worker` |

#### Redis Streams

| Stream Key | Processor | Purpose |
|-----------|----------|---------|
| `hris:events:domain` | Domain event handler | Route domain events to handlers |
| `hris:events:notifications` | Notification worker | Send emails (SMTP/nodemailer) and push (Firebase) |
| `hris:events:exports` | Export worker | Generate CSV/Excel files, upload to S3 |
| `hris:events:pdf` | PDF worker | Generate certificates, letters, case bundles (pdf-lib) |
| `hris:events:analytics` | Analytics worker | Aggregate analytics data |
| `hris:events:background` | General tasks | Miscellaneous background processing |

Each stream has a corresponding dead letter queue (DLQ) at `{stream_key}:dlq`.

#### Outbox Processor

- Polls the `domain_outbox` table for unprocessed events
- Publishes events to the appropriate Redis Stream
- Configurable batch size (default: 100) and poll interval (default: 1000ms)
- Runs independently alongside the main worker loop

#### Scheduled Jobs

| Job | Schedule | Purpose |
|-----|---------|---------|
| `leave-balance-accrual` | Daily at 01:00 | Accrue leave balances for all active employees |
| `session-cleanup` | Daily at 02:00 | Delete sessions expired more than 7 days ago |
| `outbox-cleanup` | Daily at 03:00 | Delete processed outbox events older than 30 days |
| `timesheet-reminder` | Fridays at 09:00 | Notify employees with missing timesheets |
| `review-cycle-check` | Mondays at 08:00 | Alert employees with approaching review deadlines |
| `wtr-compliance-check` | Mondays at 06:00 | Check Working Time Regulations compliance (48h weekly limit) |
| `birthday-notifications` | 1st of month at 08:00 | Notify HR admins of employee birthdays |
| `dlq-monitoring` | Hourly at :00 | Check DLQ lengths, warn if any exceed 1000 messages |
| `user-table-drift-detection` | Hourly at :30 | Detect and repair drift between BetterAuth and app.users |
| `workflow-auto-escalation` | Every 15 minutes | Escalate overdue workflow steps based on SLA config |
| `scheduled-report-runner` | Every 15 minutes | Execute due scheduled reports and notify recipients |

### 2.3 Web Frontend (@staffora/web)

| Property | Value |
|----------|-------|
| Purpose | HRIS application frontend for employees, managers, and admins |
| Technology | React 18 + React Router v7 (framework mode) + React Query + Tailwind CSS |
| Entry point | `packages/web/app/root.tsx` |
| Port | 5173 (configurable via `WEB_PORT`) |
| Test runner | vitest (not bun test) |
| Container name | `staffora-web` |

#### Route Groups

| Group | Path prefix | Purpose |
|-------|-----------|---------|
| `(auth)` | `/login`, `/register`, etc. | Authentication pages |
| `(app)` | `/me/*`, `/manager/*` | Employee self-service and manager views |
| `(admin)` | `/hr/*`, `/time/*`, `/leave/*`, `/talent/*`, etc. | Admin/HR management |

#### Key Libraries

- **React Query**: All API calls go through React Query hooks for caching, background refresh, and optimistic updates
- **API Client**: `~/lib/api-client` provides typed fetch wrapper
- **Permission hooks**: `useHasPermission()` from `~/hooks/use-permissions` guards UI features
- **Tenant hooks**: `useTenant()` from `~/hooks/use-tenant` for tenant context

### 2.4 Shared Package (@staffora/shared)

| Property | Value |
|----------|-------|
| Purpose | Shared types, schemas, error codes, state machines, and utility functions |
| Entry point | `packages/shared/src/index.ts` |

#### Export Paths

| Import Path | Contents |
|-------------|---------|
| `@staffora/shared` | Main entry point |
| `@staffora/shared/types` | TypeScript types for all modules |
| `@staffora/shared/constants` | Shared constants |
| `@staffora/shared/utils` | Utility functions (dates, crypto, validation, effective-dating) |
| `@staffora/shared/errors` | Error codes and messages organized by module |
| `@staffora/shared/schemas` | Shared TypeBox/Zod schemas |
| `@staffora/shared/state-machines` | Employee lifecycle, leave request, case, workflow, performance cycle |

### 2.6 Infrastructure

#### PostgreSQL 16

| Property | Value |
|----------|-------|
| Container | `staffora-postgres` |
| Image | `postgres:16` |
| Port | 5432 |
| Default database | `hris` |
| Schema | `app` (not `public`) |
| Admin role | `hris` (superuser, used for migrations) |
| Application role | `hris_app` (`NOBYPASSRLS`, used at runtime and in tests) |
| Data volume | `postgres_data` |
| Custom config | `docker/postgres/postgresql.conf` |
| Init script | `docker/postgres/init.sql` (creates schema, roles, RLS helpers) |
| Resource limits | 2 CPUs, 2 GB RAM |

#### Redis 7

| Property | Value |
|----------|-------|
| Container | `staffora-redis` |
| Image | `redis:7` |
| Port | 6379 |
| Usage | Sessions, caching, job queues (Streams), rate limiting |
| Custom config | `docker/redis/redis.conf` |
| Data volume | `redis_data` |
| Resource limits | 1 CPU, 1 GB RAM |

#### Nginx (Production Only)

| Property | Value |
|----------|-------|
| Container | `staffora-nginx` |
| Image | `nginx:alpine` |
| Ports | 80, 443 |
| Profile | `production` (not started in development) |
| Config | `docker/nginx/nginx.conf` |
| SSL certs | `docker/nginx/ssl/` |
| Resource limits | 0.5 CPUs, 256 MB RAM |

#### Docker Network

All containers communicate on a bridge network (`staffora-network`, subnet `172.28.0.0/16`).

#### Docker Volumes

| Volume | Purpose |
|--------|---------|
| `postgres_data` | PostgreSQL data persistence |
| `redis_data` | Redis data persistence |
| `worker_uploads` | Worker-generated files (exports, PDFs) |

---

## 3. Development Guide

### Prerequisites

- **Bun** 1.1+ (package manager and runtime)
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- **Git**

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/<org>/HRISystem.git
cd HRISystem

# 2. Install dependencies
bun install

# 3. Configure environment
cp docker/.env.example docker/.env
# Edit docker/.env and set required secrets (see below)

# 4. Start infrastructure (PostgreSQL + Redis)
bun run docker:up

# 5. Run database migrations
bun run migrate:up

# 6. Bootstrap root tenant and admin user (first time only)
bun run --filter @staffora/api bootstrap:root

# 7. Seed sample data (optional)
bun run db:seed

# 8. Start all development servers
bun run dev
```

After startup:
- **API**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/docs
- **Login page**: http://localhost:3000/login
- **Web frontend**: http://localhost:5173

### Environment Variables

#### Required Secrets (docker/.env)

| Variable | Description | Minimum Length |
|----------|------------|:--------------:|
| `POSTGRES_PASSWORD` | PostgreSQL password | -- |
| `SESSION_SECRET` | Session signing secret | 32 chars |
| `CSRF_SECRET` | CSRF token signing secret | 32 chars |
| `BETTER_AUTH_SECRET` | BetterAuth signing secret | 32 chars |

#### Optional Configuration

| Variable | Default | Description |
|----------|---------|------------|
| `POSTGRES_USER` | `hris` | PostgreSQL username |
| `POSTGRES_DB` | `hris` | PostgreSQL database name |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `REDIS_PASSWORD` | `staffora_redis_dev` | Redis password |
| `REDIS_PORT` | `6379` | Redis port |
| `API_PORT` | `3000` | API server port |
| `WEB_PORT` | `5173` | Web frontend port |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `LOG_LEVEL` | `info` | Logging level |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window in ms |
| `BETTER_AUTH_URL` | `http://localhost:3000` | BetterAuth base URL |
| `SMTP_HOST` | -- | SMTP server for email notifications |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_FROM` | `noreply@staffora.co.uk` | Email sender address |
| `STORAGE_TYPE` | `local` | File storage type (`local` or `s3`) |
| `STORAGE_PATH` | `/app/uploads` | Local file storage path |
| `S3_BUCKET` | -- | S3 bucket name (when STORAGE_TYPE=s3) |
| `S3_REGION` | -- | S3 region |

### Development Commands

```bash
# Start/stop infrastructure
bun run docker:up          # Start PostgreSQL + Redis
bun run docker:down        # Stop all containers
bun run docker:ps          # Container status
bun run docker:logs        # View logs

# Development servers
bun run dev                # All packages (API + web + worker)
bun run dev:api            # API only (with watch)
bun run dev:web            # Frontend only
bun run dev:worker         # Background worker only

# Database
bun run migrate            # Run pending migrations
bun run migrate:up         # Run pending migrations
bun run migrate:down       # Rollback last migration
bun run migrate:create <name>  # Create new migration file
bun run db:seed            # Seed database

# Testing
bun test                   # All packages (API + shared use bun test)
bun run test:api           # API tests only
bun run test:web           # Frontend tests (vitest)
bun test --watch           # Watch mode
bun test path/to/file.test.ts  # Single test file

# Code quality
bun run typecheck          # Type check all packages
bun run lint               # Lint all packages

# Build
bun run build              # Build all packages
bun run build:api          # API only
bun run build:web          # Frontend only

# Clean
bun run clean              # Remove node_modules and dist
```

### Database Migrations

Migrations live in `migrations/` and follow the naming convention `NNNN_description.sql` (4-digit zero-padded). The highest existing migration number at time of writing is `0187`. All tables must be created in the `app` schema.

Every tenant-owned table requires:
1. A `tenant_id uuid NOT NULL` column
2. RLS enabled: `ALTER TABLE app.{table} ENABLE ROW LEVEL SECURITY;`
3. A tenant isolation policy for reads/updates/deletes
4. A tenant isolation insert policy

Two database roles:
- **`hris`**: Superuser role used for running migrations. Bypasses RLS.
- **`hris_app`**: Application role with `NOBYPASSRLS`. Used at runtime and in tests so RLS is always enforced.

### Testing

Tests require Docker containers (PostgreSQL + Redis) to be running. The test setup will attempt to auto-start services if needed, but it is recommended to run `bun run docker:up && bun run migrate:up` first.

#### Test Structure (packages/api/src/test/)

| Directory | Purpose |
|-----------|---------|
| `integration/` | RLS, idempotency, outbox, effective-dating, state-machine tests |
| `integration/routes/` | Route-level tests for HR, cases, talent, LMS, onboarding, GDPR, payroll, UK compliance |
| `unit/` | Service, plugin, and job unit tests |
| `e2e/` | End-to-end flows (employee lifecycle) |
| `security/` | SQL injection, XSS prevention, CSRF protection, authentication tests |
| `performance/` | Query performance benchmarks |
| `chaos/` | Database failure scenarios |

#### Test Helpers

| File | Exports |
|------|---------|
| `setup.ts` | `ensureTestInfra()`, `createTestContext()`, `getTestDb()`, `getTestRedis()`, `withSystemContext()`, `setTenantContext()`, `expectRlsError()` |
| `helpers/factories.ts` | Test data factories for all entity types |
| `helpers/api-client.ts` | Test API client with cookie/CSRF management |
| `helpers/assertions.ts` | Custom assertions |
| `helpers/mocks.ts` | Mock utilities |

#### What Integration Tests Must Verify

- RLS blocks cross-tenant access
- Effective-date overlap validation (including concurrency)
- Idempotency prevents duplicate writes
- Outbox events are written atomically with business writes
- State machine transitions are enforced

**Important**: `packages/web` uses **vitest** (run with `bun run test:web`), while `packages/api` and `packages/shared` use Bun's built-in test runner (`bun test`).

---

## 4. Deployment Guide

### CI/CD Pipeline

The deployment pipeline is defined in `.github/workflows/deploy.yml` and consists of 3 stages:

```
push to main
     |
     v
  [1. Test]  -- Full test suite (typecheck, lint, build, migrations, tests)
     |
     v
  [2. Build] -- Build and push Docker images to GHCR (API + Web in parallel)
     |
     +----------+----------+
     |                     |
     v                     v
  [3a. Staging]        [3b. Production]
  (auto on push         (manual trigger
   to main)              with approval)
```

### GitHub Actions Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| Deploy | `deploy.yml` | Push to main / manual | Full CI/CD pipeline (test, build, deploy) |
| Test | `test.yml` | PR / push | Run test suite |
| PR Check | `pr-check.yml` | Pull request | Pre-merge validation |
| Migration Check | `migration-check.yml` | PR / push | Validate migration files |
| Security | `security.yml` | Scheduled / PR | Security scanning |
| CodeQL | `codeql.yml` | Scheduled / PR | Code analysis |
| Release | `release.yml` | Manual | Create releases |
| Stale | `stale.yml` | Scheduled | Close stale issues/PRs |

### Staging Deployment

- **Trigger**: Automatic on every push to `main`
- **URL**: https://staging.staffora.co.uk
- **API URL**: https://staging-api.staffora.co.uk
- **Process**:
  1. Test suite passes (typecheck, lint, build, migrations, API/web/shared tests)
  2. Docker images built and pushed to GHCR (tagged with commit SHA)
  3. SSH into staging server
  4. Pull new images, rolling restart API/worker/web
  5. Run database migrations
  6. Health check verification (5 attempts, 15s intervals)

### Production Deployment

- **Trigger**: Manual via `workflow_dispatch` with `environment: production`
- **URL**: https://staffora.co.uk
- **API URL**: https://api.staffora.co.uk
- **Approval gate**: GitHub Environment with required reviewers
- **Process**:
  1. Test suite passes
  2. Docker images built and pushed to GHCR
  3. Pre-deployment checks logged
  4. **Database backup** created before deployment (`pg_dump | gzip`)
  5. SSH into production server
  6. Pull new images
  7. Rolling restart: API first, wait 10s, run migrations, then worker, then web
  8. Health check verification (10 attempts, 15s intervals)
  9. **Automatic rollback** if health checks fail (containers restarted with previous config)
  10. Slack notification sent (success or failure)

### Rollback Procedure

**Automatic**: If the production health check fails after deployment, the pipeline automatically rolls back by stopping the new containers and restarting with the previous configuration.

**Manual**: If issues are detected after the automated health check passes:
1. SSH into the production server
2. `cd /opt/staffora`
3. `docker compose down api worker web`
4. Update image tags to the previous known-good SHA
5. `docker compose up -d api worker web`
6. If a migration needs reverting: `docker compose exec -T api bun run src/db/migrate.ts down`

### Docker Image Tags

Images are pushed to GHCR with multiple tags:
- `sha-{short_sha}` -- Commit-specific (used for deployments)
- `main` -- Latest main branch
- `latest` -- Latest default branch
- `{YYYYMMDD-HHmmss}` -- Timestamp

---

## 5. API Overview

### Authentication

The platform uses **BetterAuth** for authentication:
- **Email/password login**: `POST /api/v1/auth/login`
- **Session management**: Cookie-based (`hris_session`) with `SameSite=Strict`
- **MFA support**: TOTP-based multi-factor authentication
- **CSRF protection**: HMAC-SHA256 tokens required on mutating requests via `X-CSRF-Token` header
- **Session check**: `GET /api/v1/auth/me`
- **Logout**: `POST /api/v1/auth/logout`
- **BetterAuth routes**: `/api/auth/*` (handled by `betterAuthPlugin`)

### Authorization

Permission-based RBAC:
- **Permissions**: Granular permission strings (e.g., `hr.employees.read`, `hr.employees.create`)
- **Roles**: Named collections of permissions, scoped per tenant
- **Role assignments**: Users are assigned roles within a tenant
- **Route guards**: `requirePermission('permission.name')` in route definitions
- **Frontend guards**: `useHasPermission()` hook

### Multi-Tenancy

Every API request (after authentication) resolves a tenant context:
- Tenant ID can be provided via `X-Tenant-ID` header or resolved from the user's role assignments
- The `tenantPlugin` sets `app.current_tenant` in the PostgreSQL session via `SET LOCAL`
- All subsequent queries are filtered by RLS policies using this session variable
- Cross-tenant data access is blocked at the database level

### URL Structure

```
Base:       /api/v1
Auth:       /api/v1/auth/*
HR:         /api/v1/hr/*
Time:       /api/v1/time/*
Absence:    /api/v1/absence/*
Talent:     /api/v1/talent/*
LMS:        /api/v1/lms/*
Cases:      /api/v1/cases/*
Onboarding: /api/v1/onboarding/*
Benefits:   /api/v1/benefits/*
Documents:  /api/v1/documents/*
Succession: /api/v1/succession/*
Analytics:  /api/v1/analytics/*
...and 50+ more module prefixes
```

### Request Headers

| Header | Required | Purpose |
|--------|:--------:|---------|
| `Cookie: hris_session=...` | Yes | Session authentication |
| `X-CSRF-Token` | Mutations | CSRF protection |
| `Idempotency-Key` | Mutations | Request deduplication |
| `Content-Type: application/json` | With body | Request body format |
| `X-Tenant-ID` | Optional | Explicit tenant selection |
| `X-Request-ID` | Optional | Client-provided request correlation |

### Response Headers

| Header | Purpose |
|--------|---------|
| `X-Request-ID` | Server-generated or echoed request ID |
| `X-RateLimit-Limit` | Max requests in current window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Window` | Rate limit window duration |
| `Retry-After` | Seconds until rate limit resets (when limited) |

### Response Format

**Success (single item):**
```json
{
  "data": { ... }
}
```

**Success (list with pagination):**
```json
{
  "data": [ ... ],
  "pagination": {
    "nextCursor": "eyJpZCI6...",
    "hasMore": true
  }
}
```

**Error:**
```json
{
  "error": {
    "code": "HR_EMPLOYEE_NOT_FOUND",
    "message": "Employee not found",
    "details": { ... },
    "requestId": "req_abc123"
  }
}
```

### Pagination

All list endpoints use **cursor-based pagination** (not offset):
- `cursor` (string) -- Opaque cursor from previous response
- `limit` (number) -- Items per page (default 20, max 100)

### Endpoint Count by Module

| Module | Approximate Endpoints |
|--------|:--------------------:|
| HR (employees, org units, positions, compensation) | ~20 |
| Time and Attendance | 16 |
| Absence/Leave | 12 |
| Talent Management | 16 |
| LMS | 8 |
| Cases | 7 |
| Onboarding | 7 |
| Benefits | ~12 |
| Documents | 11 |
| Succession | 13 |
| Analytics | 13 |
| Competencies | 15 |
| Recruitment | 15 |
| Workflows | 13 |
| Security | 14 |
| Portal | 5 |
| Auth | 5 |
| UK Compliance (all sub-modules) | ~60+ |
| GDPR (all sub-modules) | ~30+ |
| Other (dashboard, system, tenant, payroll, etc.) | ~30+ |
| **Total** | **~300+** |

---

## 6. Security Architecture

### CSRF Protection

- **Method**: HMAC-SHA256 double-submit tokens
- **Header**: `X-CSRF-Token` required on all POST/PUT/PATCH/DELETE requests
- **Secret**: `CSRF_SECRET` environment variable (minimum 32 characters)
- **Enforcement**: Validated by the auth plugin before route handlers execute

### Session Management

- **Provider**: BetterAuth
- **Storage**: Database-backed sessions in `app.sessions` table
- **Cookie**: `hris_session` with `SameSite=Strict`, `HttpOnly`, `Secure` (in production)
- **Secret**: `BETTER_AUTH_SECRET` environment variable (minimum 32 characters)
- **Cleanup**: Expired sessions are automatically cleaned up daily at 02:00

### Row-Level Security (RLS)

Every tenant-owned table enforces RLS:

```sql
-- Enable RLS on the table
ALTER TABLE app.{table_name} ENABLE ROW LEVEL SECURITY;

-- Read/update/delete policy
CREATE POLICY tenant_isolation ON app.{table_name}
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Insert policy
CREATE POLICY tenant_isolation_insert ON app.{table_name}
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

The application connects as `hris_app` (with `NOBYPASSRLS`), so even if application code has a bug, PostgreSQL will prevent cross-tenant data access.

For administrative operations that need to bypass RLS:
```sql
SELECT app.enable_system_context();
-- ... privileged operations ...
SELECT app.disable_system_context();
```

### Rate Limiting

- **Strategy**: Per-IP and per-user rate limiting
- **Backend**: Redis-based counters
- **Default**: 100 requests per 60-second window
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Window`, `Retry-After`
- **Configuration**: `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW` environment variables

### Security Headers

Applied by `securityHeadersPlugin`:

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

### Idempotency

All mutating endpoints require an `Idempotency-Key` header:
- **Scope**: `(tenant_id, user_id, route_key)`
- **TTL**: 24-72 hours
- **Behavior**: If a duplicate request is received with the same key, the original response is returned without re-executing the operation

### Audit Logging

All significant operations are logged to the `audit_log` table (partitioned, append-only):
- **Who**: User ID, IP address
- **What**: Action type, entity type, entity ID
- **When**: Timestamp
- **Where**: Request ID, route
- **Changes**: Before/after diff of modified fields

### Secrets Summary

| Secret | Purpose | Minimum Length |
|--------|---------|:--------------:|
| `POSTGRES_PASSWORD` | Database access | -- |
| `SESSION_SECRET` | Session signing | 32 chars |
| `CSRF_SECRET` | CSRF token signing | 32 chars |
| `BETTER_AUTH_SECRET` | BetterAuth signing | 32 chars |
| `REDIS_PASSWORD` | Redis access | -- |
| `SMTP_PASSWORD` | Email sending | -- |
| `S3_SECRET_KEY` | File storage | -- |

---

## 7. HR Module Inventory

### Core HR

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Employees | `/api/v1/hr/employees` | employees, employee_personal, employee_employment | Active |
| Positions | `/api/v1/hr/positions` | positions, position_history | Active |
| Departments | `/api/v1/hr/departments` | org_units, org_unit_hierarchy | Active |
| Org Chart | `/api/v1/hr/org-chart` | Organizational hierarchy visualization | Active |
| Contracts | `/api/v1/hr/contracts` | employment_contracts | Active |
| Jobs | `/api/v1/jobs` | job_definitions, job_grades | Active |

### Time and Attendance

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Time Events | `/api/v1/time/events` | time_events (clock in/out) | Active |
| Schedules | `/api/v1/time/schedules` | schedules, schedule_patterns | Active |
| Timesheets | `/api/v1/time/timesheets` | timesheets, timesheet_entries | Active |
| Geofence | `/api/v1/geofence` | geofence_zones, geofence_checks | Active |

### Leave and Absence

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Leave Types | `/api/v1/absence/types` | leave_types | Active |
| Leave Requests | `/api/v1/absence/requests` | leave_requests | Active |
| Leave Balances | `/api/v1/absence/balances` | leave_balances | Active |
| Leave Policies | `/api/v1/absence/policies` | leave_policies | Active |

### Talent Management

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Performance | `/api/v1/talent/performance` | performance_cycles, reviews | Active |
| Goals | `/api/v1/talent/goals` | goals, goal_alignments | Active |
| Competencies | `/api/v1/competencies` | competencies, competency_assessments, gaps | Active |
| Assessments | `/api/v1/assessments` | assessment_templates, assessment_results | Active |

### Learning Management (LMS)

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Courses | `/api/v1/lms/courses` | courses, course_modules | Active |
| Enrollments | `/api/v1/lms/enrollments` | enrollments, progress | Active |
| Course Ratings | `/api/v1/course-ratings` | course_ratings | Active |
| CPD | `/api/v1/cpd` | cpd_records, cpd_categories | Active |
| Training Budgets | `/api/v1/training-budgets` | training_budgets, allocations | Active |

### Recruitment

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Requisitions | `/api/v1/recruitment/requisitions` | job_requisitions | Active |
| Candidates | `/api/v1/recruitment/candidates` | candidates, applications | Active |
| Reference Checks | `/api/v1/reference-checks` | reference_requests, reference_responses | Active |
| Agencies | `/api/v1/agencies` | recruitment_agencies, agency_agreements | Active |
| Headcount Planning | `/api/v1/headcount-planning` | headcount_plans, forecasts | Active |

### Benefits Administration

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Plans | `/api/v1/benefits/plans` | benefit_plans, carriers | Active |
| Enrollments | `/api/v1/benefits/enrollments` | benefit_enrollments, dependents | Active |

### Documents

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Documents | `/api/v1/documents` | documents, document_versions | Active |
| Letter Templates | `/api/v1/letter-templates` | letter_templates, generated_letters | Active |
| Contract Statements | `/api/v1/contract-statements` | contract_statements | Active |

### Onboarding

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Templates | `/api/v1/onboarding/templates` | onboarding_checklists | Active |
| Active Instances | `/api/v1/onboarding/instances` | onboarding_instances, tasks | Active |

### Cases

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Case Management | `/api/v1/cases` | cases, case_comments, case_documents | Active |

### Succession Planning

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Succession Plans | `/api/v1/succession` | succession_plans, succession_candidates | Active |

### Analytics and Reporting

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Analytics | `/api/v1/analytics` | dashboards, widgets, headcount, turnover | Active |
| Reports | `/api/v1/reports` | report_definitions, report_executions, report_schedules | Active |

### Workflows

| Module | API Prefix | Key Entities | Status |
|--------|-----------|-------------|:------:|
| Definitions | `/api/v1/workflows/definitions` | workflow_definitions, versions | Active |
| Instances | `/api/v1/workflows/instances` | workflow_instances, workflow_steps | Active |

### UK Compliance

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| Right to Work | `/api/v1/right-to-work` | Immigration status, work permit tracking | Active |
| SSP (Statutory Sick Pay) | `/api/v1/ssp` | SSP calculations and records | Active |
| Statutory Leave | `/api/v1/statutory-leave` | Maternity, paternity, adoption, shared parental | Active |
| Family Leave | `/api/v1/family-leave` | Extended family leave management | Active |
| Parental Leave | `/api/v1/parental-leave` | Parental leave entitlements | Active |
| Bereavement | `/api/v1/bereavement` | Bereavement leave (Jack's Law) | Active |
| Carers Leave | `/api/v1/carers-leave` | Carer's Leave Act 2023 | Active |
| Flexible Working | `/api/v1/flexible-working` | Flexible working requests (Employment Relations Act) | Active |
| Pension | `/api/v1/pension` | Auto-enrolment, contributions | Active |
| Warnings | `/api/v1/warnings` | Disciplinary warnings | Active |
| Probation | `/api/v1/probation` | Probationary period management | Active |
| Return to Work | `/api/v1/return-to-work` | RTW interviews | Active |
| Bank Holidays | `/api/v1/bank-holidays` | UK bank holiday calendar | Active |
| Contract Amendments | `/api/v1/contract-amendments` | Section 4 statement changes | Active |
| Gender Pay Gap | `/api/v1/gender-pay-gap` | GPG reporting | Active |
| NMW (National Minimum Wage) | `/api/v1/nmw` | NMW/NLW compliance | Active |
| WTR (Working Time Regulations) | `/api/v1/wtr` | 48h weekly limit, rest breaks, opt-outs | Active |
| Health and Safety | `/api/v1/health-safety` | Risk assessments, incidents, RIDDOR | Active |
| DBS Checks | `/api/v1/dbs-checks` | Disclosure and Barring Service checks | Active |

### GDPR and Data Privacy

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| DSAR | `/api/v1/dsar` | Data Subject Access Requests | Active |
| Data Erasure | `/api/v1/data-erasure` | Right to erasure (right to be forgotten) | Active |
| Data Breach | `/api/v1/data-breach` | Breach notification management (72h ICO reporting) | Active |
| Consent | `/api/v1/consent` | Consent management and records | Active |
| Privacy Notices | `/api/v1/privacy-notices` | Privacy notice versioning and acknowledgement | Active |
| Data Retention | `/api/v1/data-retention` | Retention policies and automated cleanup | Active |

### Payroll and Compensation

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| Payroll | `/api/v1/payroll` | Pay runs, calculations | Active |
| Payroll Config | `/api/v1/payroll-config` | Pay schedules, pay elements | Active |
| Payslips | `/api/v1/payslips` | Payslip generation and distribution | Active |
| Tax Codes | `/api/v1/tax-codes` | HMRC tax code management | Active |
| Deductions | `/api/v1/deductions` | Salary deductions (student loans, AEOs, etc.) | Active |

### Employee Data

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| Bank Details | `/api/v1/bank-details` | Employee bank account information | Active |
| Emergency Contacts | `/api/v1/emergency-contacts` | Emergency contact records | Active |
| Employee Photos | `/api/v1/employee-photos` | Profile photo management | Active |
| Diversity | `/api/v1/diversity` | Protected characteristics (voluntary, anonymized) | Active |
| Reasonable Adjustments | `/api/v1/reasonable-adjustments` | Disability adjustments (Equality Act 2010) | Active |
| Secondments | `/api/v1/secondments` | Employee secondment tracking | Active |

### Security and Administration

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| Roles and Permissions | `/api/v1/security/roles` | RBAC role and permission management | Active |
| Field Permissions | `/api/v1/security/field-permissions` | Field-level access control | Active |
| Portal Access | `/api/v1/security/portal` | Employee portal access configuration | Active |
| Manager Hierarchy | `/api/v1/security/manager` | Reporting line access enforcement | Active |
| Audit Log | `/api/v1/security/audit-log` | Audit trail query and export | Active |
| Delegations | `/api/v1/delegations` | Authority delegation (e.g., leave approval) | Active |
| Notifications | `/api/v1/notifications` | In-app notification management | Active |
| Equipment | `/api/v1/equipment` | IT equipment tracking and assignment | Active |

### Portal and Client

| Module | API Prefix | Purpose | Status |
|--------|-----------|---------|:------:|
| Employee Portal | `/api/v1/portal` | Self-service aggregations for employees | Active |
| Client Portal | `/api/v1/client-portal` | Customer-facing portal (staffora.co.uk) | Active |
| Dashboard | `/api/v1/dashboard` | Admin dashboard widgets | Active |
| System | `/api/v1/system` | System configuration and health | Active |
| Tenant | `/api/v1/tenant` | Tenant settings and management | Active |

---

## 8. Monitoring and Operations

### Health Check Endpoints

#### API Server (port 3000)

| Endpoint | Purpose | Response |
|----------|---------|---------|
| `GET /health` | Full health check (DB + Redis) | `{ status: "healthy"|"degraded"|"unhealthy", checks: { database, redis }, uptime, version }` |
| `GET /ready` | Readiness probe | `{ status: "ready" }` or `{ status: "not_ready", checks: {...} }` |
| `GET /live` | Liveness probe | `{ status: "alive" }` |

#### Worker (port 3001)

| Endpoint | Purpose | Response |
|----------|---------|---------|
| `GET /health` | Worker health | `{ status, uptime, activeJobs, processedJobs, failedJobs, connections: { redis, database } }` |
| `GET /ready` | Readiness probe | `{ ready: true }` or error |
| `GET /live` | Liveness probe | `{ alive: true }` |
| `GET /metrics` | Prometheus metrics | Text format with `staffora_worker_*` metrics |

#### Prometheus Metrics (Worker)

| Metric | Type | Description |
|--------|------|------------|
| `staffora_worker_active_jobs` | Gauge | Number of currently processing jobs |
| `staffora_worker_processed_jobs_total` | Counter | Total jobs processed |
| `staffora_worker_failed_jobs_total` | Counter | Total jobs failed |
| `staffora_worker_uptime_seconds` | Gauge | Worker uptime |
| `staffora_worker_redis_up` | Gauge | Redis connection status (0/1) |
| `staffora_worker_database_up` | Gauge | Database connection status (0/1) |

### Log Management

All containers use the Docker `json-file` logging driver with size limits:

| Container | Max Size | Max Files |
|-----------|:--------:|:---------:|
| PostgreSQL | 50 MB | 5 |
| Redis | 20 MB | 3 |
| API | 50 MB | 5 |
| Worker | 50 MB | 5 |
| Web | 20 MB | 3 |
| Nginx | 50 MB | 5 |

View logs with:
```bash
bun run docker:logs            # All containers
docker logs staffora-api       # API only
docker logs staffora-worker    # Worker only
docker logs -f staffora-api    # Follow API logs
```

### Container Resource Limits

| Container | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|-----------|:---------:|:------------:|:------------:|:---------------:|
| PostgreSQL | 2 | 2 GB | 0.5 | 512 MB |
| Redis | 1 | 1 GB | 0.25 | 256 MB |
| API | 2 | 1 GB | 0.5 | 256 MB |
| Worker | 1 | 1 GB | 0.25 | 256 MB |
| Web | 1 | 512 MB | 0.25 | 128 MB |
| Nginx | 0.5 | 256 MB | -- | -- |

### Database Backups

**Production deployment backup** (automatic):
The CI/CD pipeline creates a compressed database backup before every production deployment:
```bash
docker compose exec -T postgres pg_dump -U hris hris | gzip > backups/staffora_backup_YYYYMMDD_HHMMSS.sql.gz
```

**Manual backup**:
```bash
# SSH into production server
cd /opt/staffora
docker compose exec -T postgres pg_dump -U hris hris | gzip > backups/manual_backup_$(date +%Y%m%d).sql.gz
```

**Restore from backup**:
```bash
gunzip -c backups/staffora_backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U hris hris
```

### Automated Maintenance

The scheduler handles routine maintenance automatically:
- **Session cleanup**: Daily at 02:00 -- deletes sessions expired more than 7 days ago
- **Outbox cleanup**: Daily at 03:00 -- deletes processed outbox events older than 30 days
- **DLQ monitoring**: Hourly -- warns if any dead letter queue exceeds 1000 messages
- **User table drift**: Hourly -- detects and repairs drift between BetterAuth and app.users tables

### Deployment Notifications

Production deployments send Slack notifications (if `SLACK_WEBHOOK_URL` is configured):
- Success: Commit SHA and actor
- Failure: Commit SHA, actor, and rollback status

### Key Operational Procedures

#### Scaling the Worker

The worker uses Redis consumer groups. To scale horizontally:
1. Deploy additional worker instances with unique `CONSUMER_ID` values
2. All instances share the same `CONSUMER_GROUP` (default: `staffora-workers`)
3. Redis Streams automatically distribute messages across consumers

#### Monitoring Dead Letter Queues

The DLQ monitoring job runs hourly and logs warnings. To manually inspect:
```bash
# Check DLQ length for domain events
docker compose exec redis redis-cli -a $REDIS_PASSWORD XLEN "hris:events:domain:dlq"

# Read DLQ messages
docker compose exec redis redis-cli -a $REDIS_PASSWORD XRANGE "hris:events:domain:dlq" - + COUNT 10
```

#### Database Migration Safety

- Always backup before running migrations in production
- Migrations run as the `hris` superuser role
- The migration runner is in `packages/api/src/db/migrate.ts`
- Migration files use 4-digit zero-padded numbering (e.g., `0188_description.sql`)
- Check the highest existing migration number before creating a new one

---

## Appendix: State Machines

### Employee Lifecycle

```
pending --> active --> on_leave --> active --> terminated
```
States: `pending`, `active`, `on_leave`, `terminated`
Terminal state: `terminated`

### Leave Request

```
draft --> pending --> approved --> completed
                 \-> rejected
                 \-> cancelled
```
States: `draft`, `pending`, `approved`, `rejected`, `cancelled`, `in_progress`, `completed`
Terminal states: `rejected`, `cancelled`, `completed`

### Case Management

```
open --> in_progress --> resolved --> closed
     \-> escalated --/           \-> reopened --> in_progress
     \-> cancelled
```
States: `open`, `in_progress`, `escalated`, `resolved`, `closed`, `reopened`, `cancelled`
Terminal states: `closed`, `cancelled`

### Workflow/Approval

```
draft --> pending --> in_progress --> completed
                                 \-> cancelled
                                 \-> failed
```
States: `draft`, `pending`, `in_progress`, `completed`, `cancelled`, `failed`, `approved`, `rejected`, `expired`, and more
Terminal states: `approved`, `rejected`, `cancelled`, `expired`

### Performance Cycle

```
draft --> active --> review --> calibration --> completed
```
States: `draft`, `active`, `review`, `calibration`, `completed`
Terminal state: `completed`

---

## Appendix: Known Gotchas

1. **TypeBox version split**: `packages/api` uses `@sinclair/typebox@^0.34` while `packages/shared` uses `@sinclair/typebox@^0.32`. Be aware of API differences when schemas cross package boundaries.

2. **Web tests use vitest, not bun test**: `packages/web` must be tested with `bun run test:web` (vitest), while `packages/api` and `packages/shared` use `bun test`.

3. **Migration file naming**: Always use 4-digit padding (`0188_`, not `188_`). Check the highest existing migration number before creating a new one. There are known duplicate numbers in the 0076-0079 range from parallel feature branches.

4. **Database column transform**: The postgres.js client auto-converts between `snake_case` (database) and `camelCase` (TypeScript). Do not manually convert column names.

5. **System context must be wrapped in try-finally**: When using `enable_system_context()`/`disable_system_context()`, always wrap the operations in try-finally to ensure context is disabled even on error.

---

## Related Documents

- [Architecture Overview](architecture/ARCHITECTURE.md) — Detailed system architecture with diagrams
- [Architecture Map](architecture/architecture-map.md) — High-level architecture map
- [Database Guide](architecture/DATABASE.md) — PostgreSQL schema, migrations, and RLS
- [Worker System](architecture/WORKER_SYSTEM.md) — Background job processing architecture
- [Permissions System](architecture/PERMISSIONS_SYSTEM.md) — 7-layer access control model
- [API Reference](api/API_REFERENCE.md) — Complete endpoint documentation
- [Error Codes](api/ERROR_CODES.md) — Error codes and messages reference
- [Security Patterns](patterns/SECURITY.md) — Authentication, RLS, and authorization enforcement
- [State Machines](patterns/STATE_MACHINES.md) — Entity lifecycle state diagrams
- [Getting Started](guides/GETTING_STARTED.md) — Development setup guide
- [Deployment Guide](guides/DEPLOYMENT.md) — Production deployment instructions
- [Frontend Guide](guides/FRONTEND.md) — React frontend development guide
- [Production Readiness Report](operations/production-readiness-report.md) — Platform maturity assessment
