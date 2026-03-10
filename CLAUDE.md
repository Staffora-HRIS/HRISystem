# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Enterprise multi-tenant HRIS (Human Resource Information System) platform with modules for Core HR, Time & Attendance, Absence Management, Talent, LMS, Cases, Onboarding, Benefits, Documents, Succession, Analytics, Competencies, and Recruitment.

**Tech Stack (Mandatory):**
- Frontend: React 18 + React Router v7 (framework mode) + React Query + Tailwind CSS
- Backend: Bun + Elysia.js + TypeBox validation
- Auth: BetterAuth (sessions, MFA, CSRF)
- Database: PostgreSQL 16 with Row-Level Security (RLS), all tables in `app` schema
- Cache/Queue: Redis 7 (sessions, caching, Streams for jobs)
- Infrastructure: Docker

## Build & Development Commands

```bash
# Install dependencies (use Bun package manager)
bun install

# Start infrastructure only (postgres + redis)
bun run docker:up

# Start all services (postgres, redis, api, worker, web)
docker compose -f docker/docker-compose.yml up -d

# View container logs
bun run docker:logs

# Run development servers
bun run dev           # All packages
bun run dev:api       # API only (with watch)
bun run dev:web       # Frontend only
bun run dev:worker    # Background worker only

# Database migrations
bun run migrate       # Run pending migrations (alias for migrate:up)
bun run migrate:up    # Run pending migrations
bun run migrate:down  # Rollback last migration
bun run migrate:create <name>  # Create new migration file

# Run tests (requires Docker containers running)
bun test                           # All packages
bun run test:api                   # API tests only (bun test)
bun run test:web                   # Frontend tests only (vitest)
bun test --watch                   # Watch mode
bun test path/to/file.test.ts     # Single test file
bun test --test-name-pattern "pattern"  # Filter by test name

# Type checking and linting
bun run typecheck     # All packages
bun run lint          # All packages

# Build
bun run build         # All packages
bun run build:api     # API only
bun run build:web     # Frontend only

# Seed database (after migrations)
bun run db:seed

# Bootstrap root tenant and admin user (first-time setup)
bun run --filter @hris/api bootstrap:root
```

## Environment Setup

Copy `docker/.env.example` to `docker/.env` and set required secrets:
- `POSTGRES_PASSWORD` (required)
- `SESSION_SECRET` (required, 32+ chars)
- `CSRF_SECRET` (required, 32+ chars)
- `BETTER_AUTH_SECRET` (required, 32+ chars)

Default ports: API=3000, Web=5173, Postgres=5432, Redis=6379.

## Architecture

### Monorepo Structure (Bun workspaces)
- `packages/api` (@hris/api): Elysia.js backend with plugins pattern
- `packages/web` (@hris/web): React Router v7 framework mode frontend (uses **vitest**, not bun test)
- `packages/shared` (@hris/shared): Shared types, schemas, error codes, state machines, utilities

### Backend Layers (packages/api)
- `src/app.ts`: Main Elysia entry point — registers plugins then mounts all module routes
- `src/worker.ts`: Background job processor entry point
- `src/plugins/`: Elysia plugins (see plugin registration order below)
- `src/modules/`: Feature modules — each has `routes.ts`, `service.ts`, `repository.ts`, `schemas.ts`
- `src/jobs/`: Background workers (outbox-processor, export-worker, notification-worker, pdf-worker, analytics-worker, domain-event-handlers)
- `src/worker/`: Worker runtime (scheduler, outbox-processor)
- `src/db/`: Database migration runner (`migrate.ts`)
- `src/config/`: Application configuration (`database.ts`)
- `src/lib/`: Shared utilities (transaction handling, better-auth handler)
- `src/types/`: TypeScript type definitions
- `src/test/`: Integration, unit, e2e, security, performance, and chaos tests

### Plugin Registration Order (Critical)

Plugins have dependencies and **must** be registered in this order in `src/app.ts`:

1. `securityHeadersPlugin` — Security headers (after CORS)
2. `errorsPlugin` — Error handling, request ID generation
3. `dbPlugin` — Database connectivity (postgres.js)
4. `cachePlugin` — Redis caching
5. `rateLimitPlugin` — Rate limiting (depends on cache)
6. `betterAuthPlugin` — BetterAuth route handler for `/api/auth/*`
7. `authPlugin` — Session/user resolution (depends on db, cache)
8. `tenantPlugin` — Tenant resolution (depends on db, cache, auth)
9. `rbacPlugin` — Authorization (depends on db, cache, auth, tenant)
10. `idempotencyPlugin` — Request deduplication (depends on db, cache, auth, tenant)
11. `auditPlugin` — Audit logging (depends on db, auth, tenant)

### Worker Subsystem
Background processing uses Redis Streams for reliable async operations:
- **Outbox Processor**: Polls `domain_outbox` table, publishes events to Redis Streams
- **Notification Worker**: Sends emails (nodemailer/SMTP) and push notifications (Firebase)
- **Export Worker**: Generates Excel/CSV files, uploads to S3
- **PDF Worker**: Generates certificates, letters, case bundles using pdf-lib
- **Analytics Worker**: Aggregates analytics data
- **Scheduler**: Cron-based jobs for reminders, notifications, cleanup

### Frontend Layers (packages/web)
- `app/routes/`: React Router v7 file-based routes with route groups: `(auth)/`, `(app)/`, `(admin)/`
- `app/components/`: Reusable UI components (ui/, layouts/)
- `app/hooks/`: Custom hooks (use-permissions, use-tenant)
- `app/lib/`: Utilities (api-client, query-client, auth, theme, utils)

### Database (migrations/)
Migrations are numbered `NNNN_description.sql` (currently 121 files, numbered 0001–0115 with some duplicate numbers). All tables live in the `app` schema (not `public`). See `migrations/README.md` for conventions.

Two database roles:
- `hris` — Superuser/admin (used for migrations)
- `hris_app` — Application role with `NOBYPASSRLS` (used at runtime and in tests so RLS is enforced)

### Database Client Behavior
The `DatabaseClient` (in `src/plugins/db.ts`) configures postgres.js with:
- **Search path**: `app,public` — queries can use bare table names (e.g., `employees` not `app.employees`)
- **Column transform**: Auto-converts `snake_case` ↔ `camelCase` via `postgres.toCamel`/`postgres.fromCamel` — DB columns are `snake_case`, TypeScript properties are `camelCase`
- **Tenant context**: `db.withTransaction(ctx, callback)` sets RLS context automatically via `app.set_tenant_context()`
- **System bypass**: `db.withSystemContext(callback)` wraps calls with `enable/disable_system_context()`

## Query Style

All database queries use **postgres.js tagged templates** (NOT Drizzle ORM, NOT raw pg):
```typescript
// Reads — db.withTransaction sets RLS context
const rows = await db.withTransaction(ctx, async (tx) => {
  return await tx`SELECT * FROM employees WHERE id = ${id}`;
});

// Writes — outbox in same transaction
await db.withTransaction(ctx, async (tx) => {
  const [emp] = await tx`INSERT INTO employees (...) VALUES (...) RETURNING *`;
  await tx`INSERT INTO domain_outbox (...) VALUES (...)`;
  return emp;
});
```

## Critical Patterns (Non-Negotiable)

### 1. Multi-Tenant RLS
Every tenant-owned table MUST have:
- `tenant_id uuid NOT NULL` column
- RLS enabled: `ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;`
- Isolation policy: `CREATE POLICY tenant_isolation ON app.table_name USING (tenant_id = current_setting('app.current_tenant')::uuid);`
- Insert policy: `CREATE POLICY tenant_isolation_insert ON app.table_name FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);`

To bypass RLS for administrative operations, use system context:
```sql
SELECT app.enable_system_context();
-- ... privileged operations ...
SELECT app.disable_system_context();
```
In TypeScript tests, use `withSystemContext(db, async (tx) => { ... })`.

### 2. Effective Dating
HR data that changes over time uses `effective_from` / `effective_to` (NULL = current):
- No overlapping records per employee per dimension
- Validate overlaps under transaction to prevent race conditions
- Use `validateNoOverlap(employeeId, dimension, newRange, excludeId?)` utility

### 3. Outbox Pattern
All domain events written to `domain_outbox` in same transaction as business write:
```typescript
await tx`
  INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
  VALUES (${crypto.randomUUID()}, ${ctx.tenantId}, 'employee', ${employee.id},
          'hr.employee.created', ${JSON.stringify({ employee, actor: ctx.userId })}::jsonb, now())
`;
```

### 4. Idempotency
All mutating endpoints require `Idempotency-Key` header. Scope: `(tenant_id, user_id, route_key)`. Expire after 24-72 hours.

### 5. State Machines
All state machines defined in `packages/shared/src/state-machines/`:
- **Employee lifecycle**: `pending → active → on_leave ↔ active → terminated`
- **Leave request**: `draft → pending → approved/rejected/cancelled`
- **Case management**: `open → in_progress → resolved → closed` (with escalation and reopening)
- **Workflow**: `draft → pending → in_progress → completed/cancelled/failed`
- **Performance cycle**: `draft → active → review → calibration → completed`

Store transitions immutably for audit.

## API Conventions

- URL versioning: `/api/v1/...`
- Cursor-based pagination (not offset)
- Error shape: `{ error: { code, message, details?, requestId } }`
- Error codes defined in `packages/shared/src/errors/codes.ts`
- TypeBox schemas for request/response validation in each module

## Testing

### Test Infrastructure
Tests require Docker containers (postgres + redis). The test setup in `src/test/setup.ts` will auto-start Docker services if they aren't running, but `bun run docker:up && bun run migrate:up` should be run first.

Tests connect as the `hris_app` role (non-superuser, `NOBYPASSRLS`) so RLS policies are actually enforced during testing.

### Test Structure (packages/api/src/test/)
- `integration/` — RLS, idempotency, outbox, effective-dating, state-machine tests
- `integration/routes/` — Route tests for hr, cases, talent, lms, onboarding modules
- `unit/` — Service, plugin, and job unit tests
- `e2e/` — End-to-end flows (employee lifecycle)
- `security/` — Injection attacks, authentication tests
- `performance/` — Query performance benchmarks
- `chaos/` — Database failure scenarios

### Test Helpers (packages/api/src/test/)
- `setup.ts` — `ensureTestInfra()`, `createTestContext()`, `getTestDb()`, `getTestRedis()`, `withSystemContext()`, `setTenantContext()`, `expectRlsError()`
- `helpers/factories.ts` — Test data factories
- `helpers/api-client.ts` — Test API client
- `helpers/assertions.ts` — Custom assertions
- `helpers/mocks.ts` — Mock utilities

### What Integration Tests MUST Verify
- RLS blocks cross-tenant access
- Effective-date overlap validation (including concurrency)
- Idempotency prevents duplicate writes
- Outbox written atomically with business writes
- State machine transitions enforced

## Shared Package Exports (@hris/shared)

Import paths available from the shared package:
- `@hris/shared` — Main entry point
- `@hris/shared/types` — TypeScript types for all modules
- `@hris/shared/constants` — Shared constants
- `@hris/shared/utils` — Utility functions (dates, crypto, validation, effective-dating)
- `@hris/shared/errors` — Error codes and messages organized by module
- `@hris/shared/schemas` — Shared TypeBox/Zod schemas
- `@hris/shared/state-machines` — Employee lifecycle and performance cycle state machines

## Common Workflows

### Adding a New Backend Module
1. Create `packages/api/src/modules/{module}/` with 5 files: `schemas.ts` → `repository.ts` → `service.ts` → `routes.ts` → `index.ts`
2. Register module routes in `packages/api/src/app.ts`
3. Create migration(s) in `migrations/NNNN_description.sql` with RLS

### Adding a Frontend Feature
1. Create route in `packages/web/app/routes/(admin)/{module}/` or `(app)/`
2. Create feature components in `packages/web/app/components/{module}/`
3. Use `api` client from `~/lib/api-client` with React Query hooks
4. Guard with `useHasPermission()` from `~/hooks/use-permissions`

### Adding Integration Tests
1. Create test in `packages/api/src/test/integration/`
2. Import helpers from `../setup` (`createTestTenant`, `createTestUser`, `setTenantContext`, etc.)
3. Always test RLS isolation, idempotency, and outbox atomicity

## Specialized Agents

Use these agents (defined in `.claude/agents/`, all swarm-enabled) for domain-specific work:
- `hris-platform-architect`: Docker, migrations, RLS, plugins, RBAC, audit
- `hris-core-hr-developer`: Employee data, org structure, contracts, effective-dating
- `time-attendance-module-developer`: Time events, schedules, timesheets, geo-fence
- `hris-absence-module-builder`: Leave types, balances, accruals, ledger patterns
- `hris-frontend-architect`: React components, React Query hooks, permission routing
- `cases-module-developer`: Case management, SLA tracking, escalation workflows
- `lms-module-developer`: Courses, enrollments, learning paths, certificates
- `talent-module-developer`: Performance reviews, goals, competencies, calibration
- `onboarding-module-developer`: Onboarding templates, checklists, document collection
- `security-module-developer`: Field permissions, portal access, manager hierarchy

## Documentation (`Docs/`)

Detailed documentation is organized in `Docs/` with subfolder READMEs for AI context loading:

```
Docs/
├── README.md                  ← Start here: folder map, project summary, critical patterns
├── guides/                    ← Setup, deployment, frontend usage
│   ├── README.md              # Quick reference: commands, ports, env vars
│   ├── GETTING_STARTED.md     # Dev setup, first run, common commands
│   ├── DEPLOYMENT.md          # Docker, env vars, production checklist
│   └── FRONTEND.md            # React Router v7, hooks, React Query
├── architecture/              ← System design and internals
│   ├── README.md              # Plugin order, module pattern, DB roles, streams
│   ├── ARCHITECTURE.md        # Mermaid diagrams, request flow, data flow
│   ├── DATABASE.md            # Schema, migrations, RLS, table catalog
│   └── WORKER_SYSTEM.md       # Background jobs, Redis Streams, outbox
├── api/                       ← API surface and contracts
│   ├── README.md              # Headers, response format, endpoint counts
│   ├── API_REFERENCE.md       # All 200+ endpoints by module
│   └── ERROR_CODES.md         # Error codes with messages by module
└── patterns/                  ← Reusable design patterns
    ├── README.md              # Pattern summary: RLS, dating, outbox, RBAC
    ├── STATE_MACHINES.md      # 5 state machines with Mermaid diagrams
    └── SECURITY.md            # RLS, auth, RBAC, audit, idempotency
```

When working on a specific area, read the relevant subfolder README first, then drill into the detailed file.

## Skills (use `/skill-name` in Claude Code)

Skills provide domain-specific guidance. Invoke with `/` prefix:
- `/api-conventions`: API design, pagination, error handling, TypeBox schemas
- `/backend-module-development`: Creating Elysia.js modules, services, repositories
- `/database-migrations-rls`: PostgreSQL migrations with Row-Level Security
- `/postgres-js-patterns`: Database queries, transactions, tagged template SQL
- `/effective-dating-patterns`: Time-versioned records, overlap prevention
- `/outbox-pattern`: Domain event publishing, transactional outbox
- `/state-machine-patterns`: Status workflows, transition enforcement, audit
- `/testing-patterns`: Integration tests for RLS, idempotency, outbox
- `/frontend-react-components`: React components, React Query hooks
- `/better-auth-integration`: Authentication flows, sessions, MFA
- `/docker-development`: Container management, local development
