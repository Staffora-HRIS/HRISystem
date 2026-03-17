# Staffora Platform Architecture Map

> **Last updated:** 2026-03-17
> **Platform:** UK-only enterprise multi-tenant HRIS (staffora.co.uk)
> **Runtime:** Bun 1.1.38 | PostgreSQL 16 | Redis 7

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Boundaries & Communication](#2-service-boundaries--communication)
3. [Request Data Flow](#3-request-data-flow)
4. [Plugin Pipeline](#4-plugin-pipeline)
5. [Worker Subsystem](#5-worker-subsystem)
6. [Database Architecture](#6-database-architecture)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Package Dependency Graph](#8-package-dependency-graph)
9. [Network Topology](#9-network-topology)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Module Inventory](#11-module-inventory)
12. [Technical Risk Analysis](#12-technical-risk-analysis)

---

## 1. System Overview

Staffora is a UK-only enterprise HRIS platform built as a Bun monorepo. It serves multiple tenants with strict data isolation via PostgreSQL Row-Level Security, processes background jobs through Redis Streams, and enforces UK employment law compliance (WTR, SSP, statutory leave, pension auto-enrolment, GDPR).

### High-Level Architecture Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Browser<br/>(HRIS App)"]
        Portal["Client Portal<br/>(staffora.co.uk)"]
        Mobile["Mobile / API<br/>Consumers"]
    end

    subgraph "Edge Layer (Production)"
        Nginx["nginx<br/>TLS termination<br/>Rate limiting<br/>Reverse proxy"]
    end

    subgraph "Application Layer"
        API["API Server<br/>Elysia.js<br/>:3000"]
        Web["Web Frontend<br/>React Router v7 SSR<br/>:5173"]
        Worker["Background Worker<br/>Redis Streams consumer<br/>:3001 (health)"]
        Scheduler["Scheduler<br/>Cron-based jobs<br/>(embedded in worker)"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL 16<br/>app schema + RLS<br/>:5432"]
        Redis["Redis 7<br/>Sessions, Cache,<br/>Streams<br/>:6379"]
        S3["S3 / Local FS<br/>File storage"]
    end

    subgraph "External Services"
        SMTP["SMTP<br/>(Email)"]
        Firebase["Firebase<br/>(Push notifications)"]
    end

    Browser --> Nginx
    Portal --> Nginx
    Mobile --> Nginx

    Nginx -->|"/api/*"| API
    Nginx -->|"/*"| Web
    Web -->|"INTERNAL_API_URL<br/>server-side fetch"| API

    API --> PG
    API --> Redis
    Worker --> PG
    Worker --> Redis
    Worker --> S3
    Worker --> SMTP
    Worker --> Firebase
    Scheduler --> PG
    Scheduler --> Redis
```

---

## 2. Service Boundaries & Communication

### Service Inventory

| Service | Image / Runtime | Port | Role | Healthcheck |
|---------|----------------|------|------|-------------|
| **postgres** | `postgres:16` | 5432 | Primary datastore, RLS enforcement | `pg_isready` |
| **redis** | `redis:7` | 6379 | Sessions, cache, job streams, rate limit counters | `redis-cli ping` |
| **api** | `packages/api/Dockerfile` (Bun) | 3000 | REST API, auth, business logic | `GET /health` |
| **worker** | Same Dockerfile, `bun run src/worker.ts` | 3001 | Stream consumer, outbox poller, scheduler | `GET /health` |
| **web** | `packages/web/Dockerfile` (Bun) | 5173 | SSR frontend, proxies API calls server-side | `wget /` |
| **nginx** | `nginx:alpine` (production profile only) | 80, 443 | TLS, routing, rate limiting, gzip | -- |

### Inter-Service Communication

```mermaid
graph LR
    subgraph "Synchronous (HTTP)"
        Web -- "INTERNAL_API_URL<br/>http://staffora-api:3000" --> API
        Nginx -- "proxy_pass" --> API
        Nginx -- "proxy_pass" --> Web
    end

    subgraph "Asynchronous (Redis Streams)"
        API -- "domain_outbox table" --> PG
        Worker -- "polls domain_outbox" --> PG
        Worker -- "XADD events" --> Redis
        Worker -- "XREADGROUP" --> Redis
    end

    subgraph "Shared State"
        API -- "sessions, cache" --> Redis
        API -- "queries, transactions" --> PG
        Worker -- "queries" --> PG
    end
```

**Key protocols:**
- **Browser to API:** HTTPS (via nginx) with session cookies, CSRF tokens, `X-Tenant-ID` header
- **Web SSR to API:** HTTP over Docker bridge network (`http://staffora-api:3000`)
- **API to Worker:** Indirect via `domain_outbox` table (outbox pattern) and Redis Streams
- **Worker internal:** Redis Streams consumer groups (`XREADGROUP`) with dead letter queues

---

## 3. Request Data Flow

### Authenticated API Request

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as nginx
    participant A as API (Elysia)
    participant PG as PostgreSQL
    participant R as Redis

    B->>N: HTTPS POST /api/v1/hr/employees
    Note over N: TLS termination, rate limit check
    N->>A: HTTP proxy_pass

    Note over A: Plugin Pipeline Begins
    A->>A: 1. CORS check
    A->>A: 2. Security headers
    A->>A: 3. Error handler + request ID
    A->>PG: 4. DB connection pool
    A->>R: 5. Cache connection
    A->>R: 6. Rate limit check (token bucket)
    A->>PG: 7. BetterAuth session lookup
    A->>A: 8. Auth: resolve user from session
    A->>R: 9. Tenant resolution (cached)
    A->>PG: 10. RBAC permission check
    A->>R: 11. Idempotency key check
    Note over A: Plugin Pipeline Complete

    A->>PG: SET app.current_tenant = :tenantId
    A->>PG: BEGIN transaction
    A->>PG: INSERT INTO employees ... (RLS enforced)
    A->>PG: INSERT INTO domain_outbox ... (same tx)
    A->>PG: COMMIT
    A->>R: Cache invalidation
    A->>R: Store idempotency result

    A-->>N: 201 Created + JSON
    N-->>B: HTTPS response
```

### Domain Event Flow (Outbox Pattern)

```mermaid
sequenceDiagram
    participant PG as PostgreSQL
    participant OP as Outbox Poller
    participant R as Redis Streams
    participant W as Worker
    participant EXT as External (SMTP/S3)

    loop Every 1s
        OP->>PG: SELECT * FROM domain_outbox WHERE processed_at IS NULL LIMIT 100
        PG-->>OP: Unprocessed events
        OP->>R: XADD staffora:events:domain
        OP->>PG: UPDATE domain_outbox SET processed_at = now()
    end

    W->>R: XREADGROUP staffora:events:domain
    R-->>W: Domain event batch
    W->>W: Route to processor by event type
    W->>PG: Execute side effects (notifications, analytics)
    W->>R: XADD staffora:jobs:notifications (chained job)
    W->>R: XACK (acknowledge processed)

    W->>R: XREADGROUP staffora:jobs:notifications
    W->>EXT: Send email / push notification
    W->>R: XACK
```

---

## 4. Plugin Pipeline

Plugins are registered in strict dependency order. Every request passes through this pipeline before reaching route handlers.

```mermaid
graph TD
    REQ["Incoming Request"] --> CORS["CORS<br/>(Elysia built-in)"]
    CORS --> SEC["securityHeadersPlugin<br/>CSP, HSTS, X-Frame-Options"]
    SEC --> SWAGGER["Swagger<br/>(/docs endpoint)"]
    SWAGGER --> ERR["errorsPlugin<br/>Request ID, error formatting"]
    ERR --> DB["dbPlugin<br/>postgres.js pool"]
    DB --> CACHE["cachePlugin<br/>Redis/ioredis"]
    CACHE --> RL["rateLimitPlugin<br/>Token bucket via Redis"]
    RL --> BA["betterAuthPlugin<br/>/api/auth/* routes"]
    BA --> HEALTH["Health/Ready/Live<br/>(short-circuit, no auth)"]
    HEALTH --> AUTH["authPlugin<br/>Session resolution"]
    AUTH --> TENANT["tenantPlugin<br/>X-Tenant-ID header or session"]
    TENANT --> RBAC["rbacPlugin<br/>Permission enforcement"]
    RBAC --> IDEMP["idempotencyPlugin<br/>Duplicate request prevention"]
    IDEMP --> AUDIT["auditPlugin<br/>Action logging"]
    AUDIT --> ROUTE["Route Handler<br/>(module routes)"]

    style REQ fill:#2563eb,color:#fff
    style ROUTE fill:#059669,color:#fff
    style HEALTH fill:#d97706,color:#fff
```

### Plugin Dependency Matrix

| Plugin | Depends On | Provides |
|--------|-----------|----------|
| `errorsPlugin` | -- | `requestId`, error formatting |
| `dbPlugin` | -- | `db` (DatabaseClient) |
| `cachePlugin` | -- | `cache` (CacheClient) |
| `rateLimitPlugin` | cache | Rate limit enforcement |
| `betterAuthPlugin` | db, cache | `/api/auth/*` route handling |
| `authPlugin` | db, cache | `user`, `session`, `authState` |
| `tenantPlugin` | db, cache, auth | `tenantId`, `tenantContext` |
| `rbacPlugin` | db, cache, auth, tenant | Permission checks |
| `idempotencyPlugin` | db, cache, auth, tenant | Idempotency enforcement |
| `auditPlugin` | db, auth, tenant | Audit trail recording |

---

## 5. Worker Subsystem

The background worker runs as a separate process (same Docker image, different entrypoint) and combines three subsystems:

### 5.1 Redis Streams Consumer

```mermaid
graph TB
    subgraph "Redis Streams"
        S1["staffora:events:domain"]
        S2["staffora:jobs:notifications"]
        S3["staffora:jobs:exports"]
        S4["staffora:jobs:pdf"]
        S5["staffora:jobs:analytics"]
        S6["staffora:jobs:background"]
    end

    subgraph "Consumer Group: staffora-workers"
        W["BaseWorker<br/>XREADGROUP"]
    end

    subgraph "Processors"
        P1["Domain Event Handler"]
        P2["Notification Worker<br/>(email + in-app)"]
        P3["Export Worker<br/>(CSV/Excel + S3)"]
        P4["PDF Worker<br/>(pdf-lib)"]
        P5["Analytics Worker"]
        P6["Background Job Handler"]
    end

    subgraph "Dead Letter Queues"
        DLQ1["staffora:events:domain:dlq"]
        DLQ2["staffora:jobs:notifications:dlq"]
        DLQ3["...other DLQs"]
    end

    S1 --> W
    S2 --> W
    S3 --> W
    S4 --> W
    S5 --> W
    S6 --> W

    W --> P1
    W --> P2
    W --> P3
    W --> P4
    W --> P5
    W --> P6

    W -->|"After max retries (10)"| DLQ1
    W -->|"After max retries"| DLQ2
    W -->|"After max retries"| DLQ3
```

**Worker configuration (env vars):**
- `WORKER_CONCURRENCY=5` -- max parallel jobs
- `WORKER_POLL_INTERVAL=1000ms` -- stream polling frequency
- `WORKER_BLOCK_TIMEOUT=5000ms` -- XREADGROUP block duration
- `WORKER_MAX_RETRIES=10` -- retries before DLQ
- `WORKER_HEALTH_PORT=3001` -- Prometheus-compatible `/metrics` endpoint

### 5.2 Outbox Poller

Runs as a loop within the worker process. Polls `app.domain_outbox` every 1 second, publishes unprocessed events to Redis Streams, then marks them as processed.

### 5.3 Scheduler (Cron Jobs)

| Job | Schedule | Description |
|-----|----------|-------------|
| `leave-balance-accrual` | Daily 01:00 | Batch-update leave balances for all active employees |
| `session-cleanup` | Daily 02:00 | Delete sessions expired >7 days |
| `outbox-cleanup` | Daily 03:00 | Delete processed outbox events >30 days old |
| `wtr-compliance-check` | Monday 06:00 | Check 48-hour Working Time Regulations across 17-week reference |
| `review-cycle-check` | Monday 08:00 | Notify employees of upcoming performance review deadlines |
| `birthday-notifications` | 1st of month 08:00 | Notify HR admins of employee birthdays this month |
| `timesheet-reminder` | Friday 09:00 | Remind employees with missing timesheets |
| `dlq-monitoring` | Hourly :00 | Check DLQ lengths, warn if >1000 messages |
| `user-table-drift-detection` | Hourly :30 | Repair drift between BetterAuth `user` table and `app.users` |
| `workflow-auto-escalation` | Every 15 min | Escalate overdue workflow steps past SLA threshold |
| `scheduled-report-runner` | Every 15 min | Execute due report schedules, email results to recipients |

---

## 6. Database Architecture

### Schema Layout

All application tables live in the `app` schema (not `public`). The search path is set to `app,public` so queries use bare table names.

```mermaid
erDiagram
    tenants ||--o{ employees : "has"
    tenants ||--o{ users : "has"
    tenants ||--o{ roles : "has"
    employees ||--o{ employee_personal : "1:1"
    employees ||--o{ employee_employment : "effective-dated"
    employees ||--o{ employee_compensation : "effective-dated"
    employees ||--o{ leave_balances : "has"
    employees ||--o{ time_events : "has"
    employees ||--o{ timesheets : "has"
    employees ||--o{ reviews : "has"
    employees ||--o{ case_records : "has"
    employees ||--o{ enrollments : "benefits"
    employees ||--o{ course_enrollments : "LMS"
    users ||--o{ role_assignments : "has"
    users ||--o{ sessions : "has"
    roles ||--o{ role_assignments : "has"
    roles ||--o{ role_permissions : "has"
```

### Two Database Roles

| Role | Privileges | Used By |
|------|-----------|---------|
| `hris` | Superuser / owner | Migrations, schema changes |
| `hris_app` | `NOBYPASSRLS`, granted DML on `app.*` | API server, worker, tests |

### RLS Enforcement Pattern

Every tenant-owned table has:
```sql
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.table_name
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
CREATE POLICY tenant_isolation_insert ON app.table_name
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

System context bypass (for cross-tenant admin operations):
```sql
SELECT app.enable_system_context();   -- sets app.system_context = 'true'
-- ... privileged query ...
SELECT app.disable_system_context();
```

### Key Patterns

- **Effective dating:** `effective_from`/`effective_to` (NULL = current) on employment, compensation, position assignment records. Overlap validation under transaction lock.
- **Transactional outbox:** `domain_outbox` table written in the same transaction as the business write. Guarantees at-least-once event delivery.
- **Idempotency keys:** Stored per `(tenant_id, user_id, route_key)` with 24-72 hour TTL.
- **Column transform:** `snake_case` in DB, `camelCase` in TypeScript via postgres.js `toCamel`/`fromCamel`.

### Migration Stats

- **Location:** `migrations/` directory
- **Numbering:** 4-digit padded (`0001` to `0187+`)
- **Total files:** ~233 (some duplicate numbers from parallel feature branches at 0076-0079)
- **Runner:** `packages/api/src/db/migrate.ts`

---

## 7. Deployment Architecture

### Environments

```mermaid
graph LR
    subgraph "Development"
        DevLocal["docker compose up<br/>(all services)"]
    end

    subgraph "CI (GitHub Actions)"
        CI["ubuntu-latest<br/>+ postgres:16 service<br/>+ redis:7 service"]
    end

    subgraph "Staging"
        StagingHost["staging.staffora.co.uk<br/>Auto-deploy on push to main"]
    end

    subgraph "Production"
        ProdHost["staffora.co.uk<br/>Manual trigger + approval gate"]
    end

    DevLocal -->|"git push"| CI
    CI -->|"test pass + build"| GHCR["GHCR<br/>ghcr.io/*/api<br/>ghcr.io/*/web"]
    GHCR -->|"auto"| StagingHost
    GHCR -->|"manual + approval"| ProdHost
```

### Deploy Pipeline (deploy.yml)

```
Push to main
    |
    v
[1. Test Suite] -----> typecheck, lint, build, migrate, API tests, shared tests, web tests
    |
    v
[2. Build Images] ---> Build API + Web Docker images in parallel, push to GHCR
    |                   Tags: sha-XXXXXXX, branch, latest, YYYYMMDD-HHmmss
    v
[3a. Deploy Staging] -> SSH, docker compose pull, rolling restart, run migrations
    |
    v (manual trigger only)
[3b. Deploy Production] -> Pre-deploy checks, DB backup, rolling restart
    |                       (api first, wait 10s, migrate, then worker, then web)
    v
[Health Check] -------> If fails: automatic rollback + Slack notification
```

### Production Rolling Deploy Sequence

```
1. docker compose pull api web         # pull new images
2. docker compose up -d --no-deps api  # restart API (zero-downtime: nginx retries)
3. sleep 10                            # wait for API to stabilize
4. bun run src/db/migrate.ts up        # run pending migrations
5. docker compose up -d --no-deps worker  # restart worker
6. docker compose up -d --no-deps web     # restart frontend
```

### Resource Limits (Docker)

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|-------------|-------------|----------------|
| postgres | 2 | 2 GB | 0.5 | 512 MB |
| redis | 1 | 1 GB | 0.25 | 256 MB |
| api | 2 | 1 GB | 0.5 | 256 MB |
| worker | 1 | 1 GB | 0.25 | 256 MB |
| web | 1 | 512 MB | 0.25 | 128 MB |
| nginx | 0.5 | 256 MB | -- | -- |

---

## 8. Package Dependency Graph

```mermaid
graph TD
    subgraph "Bun Workspace Packages"
        Shared["@staffora/shared<br/>Types, schemas, state machines,<br/>utilities, error codes"]
        API["@staffora/api<br/>Elysia.js backend<br/>71+ modules"]
        Web["@staffora/web<br/>React Router v7 SSR<br/>HRIS frontend"]
    end

    API --> Shared
    Web --> Shared

    subgraph "Shared Package Exports"
        ST["types/"] --> Shared
        SC["constants/"] --> Shared
        SU["utils/"] --> Shared
        SE["errors/"] --> Shared
        SS["schemas/"] --> Shared
        SSM["state-machines/"] --> Shared
    end

    subgraph "Key External Dependencies"
        Elysia["elysia + @elysiajs/*"]
        PGjs["postgres.js"]
        IORedis["ioredis"]
        TypeBox["@sinclair/typebox"]
        RR7["react-router v7"]
        RQ["@tanstack/react-query"]
        TW["tailwindcss"]
        BA["better-auth"]
    end

    API --> Elysia
    API --> PGjs
    API --> IORedis
    API --> TypeBox
    API --> BA
    Web --> RR7
    Web --> RQ
    Web --> TW
```

### TypeBox Version Split (Known Gotcha)

| Package | TypeBox Version |
|---------|----------------|
| `@staffora/api` | `@sinclair/typebox@^0.34` |
| `@staffora/shared` | `@sinclair/typebox@^0.32` |

Schemas crossing package boundaries must account for API differences.

### Test Runners

| Package | Runner | Command |
|---------|--------|---------|
| `@staffora/api` | `bun test` | `bun run test:api` |
| `@staffora/web` | `vitest` | `bun run test:web` |
| `@staffora/shared` | `bun test` | `bun test packages/shared` |

---

## 9. Network Topology

### Docker Network

All services communicate over a single Docker bridge network (`staffora-network`, subnet `172.28.0.0/16`).

```
                                 Internet
                                    |
                              [Port 80/443]
                                    |
                        +-----------+-----------+
                        |         nginx         |
                        | (production profile)  |
                        +--+--------+--------+--+
                           |        |        |
                    /api/* |   /*   |  /docs |
                           |        |        |
              +------------+   +----+----+   |
              |                |         |   |
         +----+----+     +----+----+     |   |
         |   api   |     |   web   |     +---+
         | :3000   |     | :5173   |
         +----+----+     +----+----+
              |                |
              |    (server-side fetch)
              +<---------------+
              |
    +---------+---------+
    |                   |
+---+----+         +----+----+
|postgres|         |  redis  |
| :5432  |         |  :6379  |
+--------+         +----+----+
                        |
              +---------+---------+
              |                   |
         +----+----+         +---+----+
         | worker  |         |scheduler|
         | :3001   |         |(embed)  |
         +---------+         +--------+
```

### Port Mapping (Default)

| Service | Container Port | Host Port | Configurable Via |
|---------|---------------|-----------|-----------------|
| API | 3000 | `$API_PORT` (default 3000) | `docker/.env` |
| Web | 5173 | `$WEB_PORT` (default 5173) | `docker/.env` |
| PostgreSQL | 5432 | `$POSTGRES_PORT` (default 5432) | `docker/.env` |
| Redis | 6379 | `$REDIS_PORT` (default 6379) | `docker/.env` |
| Worker Health | 3001 | -- (internal only) | `WORKER_HEALTH_PORT` |
| nginx (HTTP) | 80 | 80 | production profile |
| nginx (HTTPS) | 443 | 443 | production profile |

### nginx Routing Rules

| Path Pattern | Upstream | Rate Limit | Notes |
|-------------|----------|-----------|-------|
| `/api/*` | `api:3000` | 100 req/s burst 50 | API proxy, no buffering |
| `/api/v1/auth/*` | `api:3000` | 10 req/s burst 5 | Stricter auth rate limit |
| `/health`, `/ready`, `/live` | `api:3000` | None | Health probes |
| `/docs` | `api:3000` | None | Swagger UI |
| `/ws` | `web:5173` | None | WebSocket (dev hot reload) |
| `/*` | `web:5173` | None | Frontend SSR |
| `*.js,*.css,*.png,...` | `web:5173` | None | Static assets, 1d cache |

### TLS Configuration

- Protocols: TLSv1.2, TLSv1.3
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Ciphers: ECDHE-ECDSA/RSA-AES128/256-GCM-SHA256/384, CHACHA20-POLY1305
- Certificate: `/etc/nginx/ssl/cert.pem` (mounted volume)

---

## 10. CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy.yml` | Push to main / manual | Full deploy pipeline: test, build images, deploy |
| `test.yml` | (defined separately) | Test suite |
| `pr-check.yml` | Pull requests | PR validation |
| `security.yml` | Scheduled / manual | Trivy container scan, TruffleHog secrets scan |
| `codeql.yml` | Scheduled / push | GitHub CodeQL SAST analysis |
| `release.yml` | Tags / manual | Release management |
| `stale.yml` | Scheduled | Close stale issues/PRs |
| `migration-check.yml` | PRs touching `migrations/` | Validate migration files |

### Security Scanning

```mermaid
graph LR
    PR["Pull Request"] --> Lint["Linting"]
    PR --> Types["Type Check"]
    PR --> Tests["Full Test Suite"]
    PR --> MigCheck["Migration Validation"]

    Push["Push to main"] --> CodeQL["CodeQL SAST"]
    Push --> Trivy["Trivy Container Scan"]
    Push --> TruffleHog["TruffleHog Secrets"]
    Push --> DepAudit["Dependency Audit"]
    Push --> Deploy["Deploy Pipeline"]
```

### Dependabot Coverage

- npm dependencies
- Docker base images
- GitHub Actions versions

---

## 11. Module Inventory

### Core HRIS Modules (15)

| Module | Route Prefix | Description |
|--------|-------------|-------------|
| `hr` | `/api/v1/hr` | Employees, departments, positions, org chart, contracts |
| `time` | `/api/v1/time` | Clock events, schedules, timesheets |
| `absence` | `/api/v1/absence` | Leave types, requests, balances, accruals |
| `talent` | `/api/v1/talent` | Performance reviews, goals, calibration |
| `lms` | `/api/v1/lms` | Courses, enrollments, learning paths, certificates |
| `cases` | `/api/v1/cases` | Case management, SLA tracking, escalation |
| `onboarding` | `/api/v1/onboarding` | Templates, checklists, document collection |
| `benefits` | `/api/v1/benefits` | Plans, enrollments, life events |
| `documents` | `/api/v1/documents` | Templates, contracts, letters |
| `succession` | `/api/v1/succession` | Succession planning, talent pools |
| `analytics` | `/api/v1/analytics` | Dashboards, widgets, data aggregation |
| `competencies` | `/api/v1/competencies` | Competency frameworks, assessments |
| `recruitment` | `/api/v1/recruitment` | Job postings, candidates, pipelines |
| `workflows` | `/api/v1/workflows` | Approval chains, multi-step workflows |
| `reports` | `/api/v1/reports` | Report definitions, schedules, executions |

### UK Compliance Modules (15)

| Module | Description |
|--------|-------------|
| `right-to-work` | Immigration status, visa tracking, RTW checks |
| `ssp` | Statutory Sick Pay calculations |
| `statutory-leave` | SMP, SPP, SAP, ShPP calculations |
| `family-leave` | Maternity, paternity, shared parental |
| `parental-leave` | Unpaid parental leave entitlement |
| `bereavement` | Bereavement leave (Jack's Law) |
| `carers-leave` | Carer's Leave Act 2023 |
| `flexible-working` | Flexible working requests (Employment Relations Act) |
| `pension` | Auto-enrolment, contributions, opt-out |
| `warnings` | Disciplinary warnings, ACAS codes |
| `probation` | Probation period management |
| `nmw` | National Minimum/Living Wage compliance |
| `wtr` | Working Time Regulations (48-hour rule, rest breaks) |
| `bank-holidays` | Regional bank holiday calendars |
| `health-safety` | Risk assessments, incident reporting |

### GDPR / Data Privacy Modules (6)

| Module | Description |
|--------|-------------|
| `dsar` | Data Subject Access Requests |
| `data-erasure` | Right to erasure / right to be forgotten |
| `data-breach` | Breach notification (72-hour ICO reporting) |
| `data-retention` | Retention policies, automated purging |
| `consent` | Consent management, withdrawal tracking |
| `privacy-notices` | Privacy notice versioning, acknowledgements |

### Infrastructure & Support Modules (20+)

Payroll (`payroll`, `payroll-config`, `payslips`, `tax-codes`, `deductions`), employee data (`bank-details`, `emergency-contacts`, `employee-photos`, `diversity`, `reasonable-adjustments`), operations (`equipment`, `geofence`, `headcount-planning`, `jobs`, `letter-templates`, `notifications`, `delegations`), talent extensions (`training-budgets`, `cpd`, `course-ratings`, `assessments`), compliance (`dbs-checks`, `reference-checks`, `agencies`, `contract-statements`, `contract-amendments`, `gender-pay-gap`, `secondments`, `return-to-work`), and system (`auth`, `portal`, `client-portal`, `dashboard`, `system`, `security`, `tenant`).

---

## 12. Technical Risk Analysis

### High Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Single PostgreSQL instance** | Total data loss if disk fails; no read replicas for scaling | Implement streaming replication; daily backups exist in deploy pipeline but no tested restore procedure |
| **Single Redis instance** | Loss of all sessions, cache, and in-flight jobs on crash | Redis AOF persistence configured; consider Redis Sentinel for HA |
| **No horizontal API scaling** | Single API container is a SPOF and throughput ceiling | nginx upstream supports multiple backends; Docker Compose needs replica config or orchestrator |
| **TypeBox version split** | Schema validation bugs at package boundaries | Document explicitly; consider aligning versions |
| **Migration numbering collisions** | Parallel branches created duplicate 0076-0079 | Documented as known quirk; CI migration-check workflow helps |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Outbox poller in worker process** | If worker crashes, events stop flowing | Worker auto-restarts via Docker `unless-stopped`; health check on `:3001` |
| **No message ordering guarantee** | Consumer group may process events out of order | Acceptable for most event types; critical operations use DB constraints |
| **BetterAuth user table drift** | Auth state diverges from `app.users` | Hourly drift detection job repairs discrepancies automatically |
| **Large migration set (~233 files)** | Slow CI; migration ordering complexity | Squash/baseline migration recommended for production |
| **No CDN** | Static assets served through nginx/web SSR | Consider CloudFront/Cloudflare for static asset caching |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Bun runtime maturity** | Potential edge-case bugs vs Node.js | Pin to 1.1.38; test suite provides regression coverage |
| **DLQ accumulation** | Failed jobs pile up unnoticed | Hourly DLQ monitoring job logs warnings at 1000+ threshold |
| **Session cookie scope** | Cross-subdomain auth complexity | BetterAuth handles session management centrally |

### Scalability Bottlenecks (Ordered by Likely Impact)

1. **PostgreSQL write throughput** -- Single primary, all tenants share one instance. Mitigation: Connection pooling, efficient RLS policies, effective-dated records reduce update frequency.
2. **Redis memory** -- Sessions + cache + stream history grow with tenant count. Mitigation: TTL on sessions (7 days), outbox cleanup (30 days), stream trimming.
3. **Worker throughput** -- Single worker with concurrency=5. Mitigation: Consumer group architecture supports adding more worker instances by changing `WORKER_ID`.
4. **Frontend SSR** -- Single web container handles all SSR. Mitigation: React Query client-side caching reduces server load; nginx can load-balance multiple web instances.

---

## Appendix: Environment Variables

### Required Secrets

| Variable | Used By | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | postgres, api, worker | Database password |
| `SESSION_SECRET` | api | Session signing key (32+ chars) |
| `CSRF_SECRET` | api | CSRF token signing key (32+ chars) |
| `BETTER_AUTH_SECRET` | api | BetterAuth signing key (32+ chars) |
| `REDIS_PASSWORD` | redis, api, worker | Redis authentication |

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | API listen port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window (ms) |
| `SMTP_HOST/PORT/USER/PASSWORD` | -- | Email delivery |
| `SMTP_FROM` | `noreply@staffora.co.uk` | Email sender address |
| `STORAGE_TYPE` | `local` | `local` or `s3` |
| `S3_BUCKET/REGION/ACCESS_KEY/SECRET_KEY` | -- | S3 storage config |
| `WORKER_CONCURRENCY` | `5` | Max parallel background jobs |
| `LOG_LEVEL` | `info` | Logging verbosity |

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — Detailed architecture with Mermaid diagrams
- [Repository Map](repository-map.md) — File-level monorepo structure
- [Database Guide](DATABASE.md) — Schema, migrations, and RLS conventions
- [Worker System](WORKER_SYSTEM.md) — Background processing architecture
- [Permissions System](PERMISSIONS_SYSTEM.md) — 7-layer access control model
- [DevOps Dashboard](../devops/devops-dashboard.md) — CI/CD pipeline architecture
- [Deployment Guide](../guides/DEPLOYMENT.md) — Docker Compose deployment topology
