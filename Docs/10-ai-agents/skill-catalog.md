# Skill Catalog

> Last updated: 2026-03-28

This document provides comprehensive documentation for every development skill available in the Staffora platform. Skills are domain-specific guidance documents defined in `.claude/Skills/` that provide focused instructions for common development tasks.

---

## Table of Contents

- [Skill Summary Table](#skill-summary-table)
- [How to Invoke Skills](#how-to-invoke-skills)
- [Skills vs Agents](#skills-vs-agents)
- [Backend Skills](#backend-skills)
  - [/api-conventions](#api-conventions)
  - [/backend-module-development](#backend-module-development)
  - [/postgres-js-patterns](#postgres-js-patterns)
  - [/outbox-pattern](#outbox-pattern)
  - [/state-machine-patterns](#state-machine-patterns)
  - [/effective-dating-patterns](#effective-dating-patterns)
  - [/testing-patterns](#testing-patterns)
- [Database Skills](#database-skills)
  - [/database-migrations-rls](#database-migrations-rls)
- [Authentication Skills](#authentication-skills)
  - [/better-auth-integration](#better-auth-integration)
- [Frontend Skills](#frontend-skills)
  - [/frontend-react-components](#frontend-react-components)
- [Infrastructure Skills](#infrastructure-skills)
  - [/docker-development](#docker-development)
  - [/docker-build](#docker-build)
- [Pattern Reference Skills](#pattern-reference-skills)
  - [/hris-patterns](#hris-patterns)
  - [/repo-patterns](#repo-patterns)
- [Related Documents](#related-documents)

---

## Skill Summary Table

| Skill | Directory | Category | What It Provides |
|-------|-----------|----------|-----------------|
| `/api-conventions` | `api-conventions/` | Backend | URL structure, headers, pagination, error responses, TypeBox schemas |
| `/backend-module-development` | `backend-module-development/` | Backend | 5-file module pattern with complete code templates |
| `/postgres-js-patterns` | `postgres-js-patterns/` | Backend | Tagged template queries, transactions, RLS context, cursor pagination |
| `/outbox-pattern` | `outbox-pattern/` | Backend | Transactional outbox for domain events, event naming, worker consumption |
| `/state-machine-patterns` | `state-machine-patterns/` | Backend | Status workflows, transition validation, immutable audit, testing |
| `/effective-dating-patterns` | `effective-dating-patterns/` | Backend | Time-versioned records, overlap prevention, as-of-date queries |
| `/testing-patterns` | `testing-patterns/` | Backend | RLS tests, idempotency tests, outbox tests, state machine tests, test setup |
| `/database-migrations-rls` | `database-migrations-rls/` | Database | Migration naming, table templates, RLS policies, effective dating schema |
| `/better-auth-integration` | `better-auth-integration/` | Auth | Key files, database tables, auth endpoints, tenant context, session management |
| `/frontend-react-components` | `frontend-react-components/` | Frontend | Route creation, React Query hooks, permission guards, component patterns |
| `/docker-development` | `docker-development/` | Infrastructure | Quick commands, environment setup, database/Redis connections, troubleshooting |
| `/docker-build` | `docker-build/` | Infrastructure | Full rebuild steps, container verification, expected container list |
| `/hris-patterns` | `hris-patterns/` | Reference | Extracted coding patterns, architecture overview, workflows, conventions |
| `/repo-patterns` | `repo-patterns/` | Reference | Git history analysis, commit conventions, co-change patterns, project scale |

---

## How to Invoke Skills

Skills are invoked in Claude Code using the `/` prefix:

```
/database-migrations-rls     -- When writing a migration
/outbox-pattern              -- When emitting domain events
/testing-patterns            -- When writing integration tests
/effective-dating-patterns   -- When implementing temporal data
/api-conventions             -- When designing API endpoints
/backend-module-development  -- When creating a new module
/postgres-js-patterns        -- When writing database queries
/state-machine-patterns      -- When implementing status workflows
/frontend-react-components   -- When building React UI
/better-auth-integration     -- When working on authentication
/docker-development          -- When managing local containers
/docker-build                -- When rebuilding all containers
/hris-patterns               -- When checking project conventions
/repo-patterns               -- When checking git conventions
```

Skills provide contextual guidance -- they load the relevant pattern documentation into the agent's context so it can follow established conventions without needing to search the codebase.

---

## Skills vs Agents

| Characteristic | Skills | Agents |
|---------------|--------|--------|
| **Scope** | Single pattern or concern | Entire module domain |
| **Context depth** | Pattern templates and conventions | Full module knowledge (tables, state machines, business rules) |
| **Invocation** | `/skill-name` prefix | Selected based on task domain |
| **Use case** | Focused guidance for a specific task | End-to-end module implementation |
| **Memory** | No memory system | Reads and writes to memory files |

**When to use a skill:** You need guidance on a specific pattern (e.g., "how do I write an RLS migration?") without full module context.

**When to use an agent:** You need deep domain knowledge to implement a feature end-to-end (e.g., "build the case escalation workflow").

---

## Backend Skills

### /api-conventions

**Directory:** `.claude/Skills/api-conventions/`
**Trigger:** Designing API endpoints, error handling, pagination, or TypeBox schemas.

**What it provides:**

- **URL structure**: Base path `/api/v1/`, module routes `/api/v1/{module}/{resource}`
- **Required headers**: `Content-Type: application/json`, `Idempotency-Key: {uuid}` for all mutations
- **Cursor-based pagination**: Request with `cursor` and `limit` query params; response with `items`, `pagination.cursor`, `pagination.hasMore`, `pagination.total`
- **Error response shape**: `{ error: { code, message, details?, requestId } }` with module-prefixed error codes (e.g., `HR_EMPLOYEE_NOT_FOUND`)
- **TypeBox schema conventions**: `t.String({ format: 'date' })` for dates, `t.String({ format: 'uuid' })` for IDs, `t.Optional()` for optional fields, `minLength`/`maxLength` constraints
- **Route definition pattern**: `new Elysia({ prefix: '/resources' })` with typed query, params, body, and response schemas

---

### /backend-module-development

**Directory:** `.claude/Skills/backend-module-development/`
**Trigger:** Creating new Elysia.js modules, routes, services, repositories, or TypeBox schemas.

**What it provides:**

Complete code templates for the 5-file module pattern:

1. **`schemas.ts`** -- TypeBox input schemas (Create, Update), response schemas, filter/pagination schemas, param/header schemas, inferred types
2. **`repository.ts`** -- Repository class with `DatabaseClient` constructor injection, `findAll()` with cursor pagination and conditional filters, `findById()`, `create()` and `update()` accepting `TransactionSql` for atomic outbox writes
3. **`service.ts`** -- Service class with `emitEvent()` for outbox writes in the same transaction, `list()` with response mapping, `getById()` with error handling, `create()` with transactional write + outbox event
4. **`routes.ts`** -- Elysia route definitions with `.derive()` for service instantiation, `requirePermission()` guards, `IdempotencyHeaderSchema` on mutations, `mapErrorToStatus()` for error responses, OpenAPI detail tags
5. **`index.ts`** -- Re-exports for module registration

**Key patterns documented:**

| Concern | Pattern |
|---------|---------|
| Database access | `postgres.js` tagged templates via `DatabaseClient` wrapper |
| Tenant RLS | `db.withTransaction(ctx, async (tx) => { ... })` sets `app.current_tenant` |
| Request context | `tenantContext` from tenant plugin: `{ tenantId, userId }` |
| Transactions | Service calls `db.withTransaction(ctx, callback)`, passes `tx` to repository writes |
| Outbox events | Insert into `domain_outbox` inside the same `tx` |
| Pagination | Fetch `limit + 1` rows; return `{ items, nextCursor, hasMore }` |
| Idempotency | All mutating endpoints require `Idempotency-Key` header |
| Error handling | Services return `ServiceResult<T>`; routes use `mapErrorToStatus()` |
| Column naming | DB uses snake_case; postgres.js auto-converts to camelCase in TypeScript |

---

### /postgres-js-patterns

**Directory:** `.claude/Skills/postgres-js-patterns/`
**Trigger:** Writing database queries, transactions, or data access code in repository files.

**What it provides:**

- **Connection and types**: `DatabaseClient`, `TransactionSql`, `Row` imports from `../../plugins/db`
- **Tagged template queries**: Parameters are automatically escaped; use `tx<TypedRow[]>` for typed results
- **Repository class pattern**: Constructor receives `DatabaseClient`, reads use `db.withTransaction(context, async (tx) => { ... })` for automatic RLS context
- **Transaction pattern**: Service-level transactions pass `tx` to repository write methods; outbox insert in the same transaction
- **RLS context**: Set automatically by `withTransaction()`; never set manually in repository code
- **Cursor-based pagination**: Fetch `limit + 1` rows, detect `hasMore`, compute `nextCursor`
- **Conditional filters**: `${filters.status ? tx\`AND status = ${filters.status}\` : tx\`\`}`
- **Parameterised IN queries**: Use `ANY(${ids}::uuid[])` instead of `IN`
- **System context (bypass RLS)**: `db.withSystemContext(async (tx) => { ... })` calls `enable_system_context()`/`disable_system_context()`
- **Raw SQL via unsafe**: `tx.unsafe()` for DDL or dynamic SQL

---

### /outbox-pattern

**Directory:** `.claude/Skills/outbox-pattern/`
**Trigger:** Emitting domain events, handling async workflows, or working with the `domain_outbox` table.

**What it provides:**

- **Why outbox**: Atomicity (same transaction as business data), reliability (no lost events), consistency (event only published if write succeeds)
- **Database table schema**: `domain_outbox` columns -- id, tenant_id, aggregate_type, aggregate_id, event_type, payload (jsonb), created_at, processed_at, published_at, error, retry_count
- **Writing events**: Service-layer code template showing business write + outbox insert in the same `db.withTransaction()` call
- **Event type naming convention**: `<module>.<aggregate>.<action>` (e.g., `hr.employee.created`, `time.timesheet.submitted`, `cases.case.escalated`)
- **Outbox processor**: Worker polls unprocessed events, publishes to Redis Streams, marks as processed; retries on failure with retry_count increment
- **Best practices**: Always write in same transaction, make handlers idempotent, include enough context in payload, process in order by `created_at`

---

### /state-machine-patterns

**Directory:** `.claude/Skills/state-machine-patterns/`
**Trigger:** Adding state transitions, enforcing status workflows, or implementing status history tracking.

**What it provides:**

- **Existing state machines**: Employee lifecycle, leave request, case management, workflow, performance cycle -- all defined in `packages/shared/src/state-machines/`
- **Transition functions**: `canTransition()` (unprefixed for employee), `canTransitionCase()`, `canTransitionLeaveRequest()`, `canTransitionWorkflow()`, `canTransitionCycle()`, `validateTransition()`, `getValidTransitions()`
- **Service layer enforcement**: Always validate transitions before persisting; throw `ConflictError` on invalid transition
- **Immutable transition audit**: Every state change must insert a record in the status history table (from_status, to_status, reason, changed_by, changed_at); never update history rows
- **Outbox event on transition**: Every state change must emit a domain event in the same transaction
- **Testing transitions**: Test both valid and invalid transitions; test via API (expect 409 on invalid); use `validateTransition()` for error messages

---

### /effective-dating-patterns

**Directory:** `.claude/Skills/effective-dating-patterns/`
**Trigger:** Working with positions, salaries, managers, contracts, or any time-versioned employee data.

**What it provides:**

- **Concept**: `effective_from` (inclusive start date), `effective_to` (NULL means current/active)
- **Database schema**: Exclusion constraint with `btree_gist` extension for overlap prevention: `EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[)') WITH &&)`
- **Query patterns**: Current record (`WHERE effective_to IS NULL`), as-of-date query (`WHERE effective_from <= date AND (effective_to IS NULL OR effective_to > date)`)
- **Service layer validation**: Check for overlapping records under transaction, close out current record before inserting new one, validate in `db.withTransaction(ctx, async (tx) => { ... })`
- **Common effective-dated entities**: position_assignments, compensation_history, reporting_lines, employment_contracts, employee_personal

---

### /testing-patterns

**Directory:** `.claude/Skills/testing-patterns/`
**Trigger:** Creating integration tests for RLS, idempotency, effective dating, outbox, or state machines.

**What it provides:**

- **Test commands**: `bun test` (all), `bun run test:api` (API), `bun run test:web` (frontend/vitest), `bun test --watch`, `bun test path/to/file.test.ts`
- **Five required integration test categories**:
  1. **RLS tests**: Verify tenant B cannot read/update tenant A data
  2. **Idempotency tests**: Duplicate request returns cached result
  3. **Effective dating tests**: Overlapping records are prevented
  4. **Outbox tests**: Domain event written atomically with business data
  5. **State machine tests**: Valid transitions succeed, invalid transitions are rejected
- **Test setup utilities**: `getTestDb()`, `setTenantContext(db, tenantId, userId?)`, `withSystemContext(db, fn)` (bypass RLS for admin operations), `createTestTenant()`, `createTestUser()`, `closeTestConnections()`
- **Test file structure**: Import from `../setup`, `beforeAll` for tenant/user setup, `afterAll` for cleanup

---

## Database Skills

### /database-migrations-rls

**Directory:** `.claude/Skills/database-migrations-rls/`
**Trigger:** Creating database tables, adding RLS policies, or writing migration files.

**What it provides:**

- **Migration naming**: Sequential numbering `NNNN_description.sql`; check existing migrations for next number
- **Commands**: `bun run migrate:create <name>`, `bun run migrate:up`, `bun run migrate:down`
- **Basic table template**: Complete SQL template with `gen_random_uuid()` primary key, `tenant_id` foreign key, `created_at`/`updated_at` timestamps, RLS enable, two isolation policies (FOR ALL and FOR INSERT), tenant index
- **RLS policies (non-negotiable)**: Every tenant-owned table must have `tenant_id`, RLS enabled, and two isolation policies
- **Effective dating tables**: Template with `effective_from`/`effective_to` columns and `EXCLUDE USING gist` constraint for overlap prevention (requires `btree_gist` extension)
- **Enum types**: `CREATE TYPE app.status_enum AS ENUM ('active', 'inactive', 'pending')`

---

## Authentication Skills

### /better-auth-integration

**Directory:** `.claude/Skills/better-auth-integration/`
**Trigger:** Working on login, registration, sessions, tenant switching, or auth-related code.

**What it provides:**

- **Key files**: `plugins/auth-better.ts` (Better Auth config), `modules/auth/` (auth module), `packages/web/app/lib/auth.ts` (frontend auth client)
- **Database tables**: `app."user"` (accounts), `app."account"` (credentials with `provider_id='credential'`), `app."session"` (sessions with `current_tenant_id`), `app."verification"` (email tokens)
- **Auth endpoints**: Sign up, sign in, sign out, get session (all via Better Auth at `/api/auth/*`)
- **Custom auth routes**: `POST /api/v1/auth/switch-tenant`, `GET /api/v1/auth/tenants`
- **Frontend auth client**: `signIn.email()`, `signUp.email()`, `signOut()`, `useSession()` from `~/lib/auth`
- **Tenant context**: Backend uses `store.ctx.tenantId` (set by tenant plugin); frontend uses `session.currentTenantId`
- **Important notes**: Password hash stored in `account` table (not `user`), `provider_id = 'credential'` for email/password, never access password directly

---

## Frontend Skills

### /frontend-react-components

**Directory:** `.claude/Skills/frontend-react-components/`
**Trigger:** Creating routes, components, React Query hooks, or pages in `packages/web/app/`.

**What it provides:**

- **Tech stack reference**: React 18, React Router v7 (framework mode), React Query (TanStack Query), Tailwind CSS, Lucide icons
- **Directory structure**: Routes in `(auth)/`, `(app)/`, `(admin)/` groups; components in `components/ui/`; hooks in `hooks/`; utilities in `lib/`
- **Route creation template**: Page component with `useQuery` hook, loading state, data table rendering
- **React Query hook patterns**: `useEmployees(params)` for queries, `useCreateEmployee()` with `invalidateQueries` for mutations
- **Permission guard**: `<PermissionGuard permission="hr:employees:create">` wrapper component
- **Auth hook**: `useAuth()` returning `{ user, isAuthenticated, isLoading }`

---

## Infrastructure Skills

### /docker-development

**Directory:** `.claude/Skills/docker-development/`
**Trigger:** Starting services, viewing logs, or troubleshooting containers in local development.

**What it provides:**

- **Quick commands**: `bun run docker:up` (start postgres + redis), `bun run docker:down`, `bun run docker:logs`, `bun run docker:ps`
- **Full stack startup**: `docker compose -f docker/docker-compose.yml --profile full up -d`
- **Environment setup**: Copy `docker/.env.example` to `docker/.env` with `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CSRF_SECRET`, `BETTER_AUTH_SECRET`
- **Database connection**: localhost:5432, database `hris`, user `hris`
- **Redis connection**: localhost:6379
- **Common issue solutions**: Port conflicts (netstat command), database reset (`down -v` + `docker:up` + `migrate:up` + `db:seed`), log viewing per container

---

### /docker-build

**Directory:** `.claude/Skills/docker-build/`
**Trigger:** Rebuilding and restarting all Docker containers from scratch.

**What it provides:**

- **Full rebuild steps**: Stop and remove orphans, rebuild with `--no-cache`, start all services, verify health
- **Expected containers table**: staffora-postgres (5432), staffora-redis (6379), staffora-api (3000), staffora-worker (3001 health), staffora-web (5173)

---

## Pattern Reference Skills

### /hris-patterns

**Directory:** `.claude/Skills/hris-patterns/`
**Trigger:** Checking project coding patterns and conventions.

**What it provides:**

- **Commit conventions**: Conventional commits with `fix:`, `feat:`, `docs:`, `refactor:`, `test:` prefixes
- **Code architecture overview**: Monorepo layout, backend module structure (5-file pattern), plugin architecture (10 plugins), background worker jobs (6 workers), frontend structure, shared package layout
- **Workflows**: Adding a new backend module (7 steps), database migration workflow (5 steps), adding a frontend feature (6 steps), adding integration tests (5 steps)
- **Key patterns**: Route file pattern, service file pattern, repository file pattern, migration file pattern, frontend route pattern, test file pattern
- **Non-negotiable rules**: RLS on every table, effective dating, outbox pattern, idempotency, state machines, cursor pagination, error shape, URL versioning

---

### /repo-patterns

**Directory:** `.claude/Skills/repo-patterns/`
**Trigger:** Checking git conventions, commit styles, or understanding co-change patterns.

**What it provides:**

- **Commit convention analysis**: Frequency breakdown (45% fix, 14% feat, 11% perf, 8% deps, 5% refactor, 5% docs), message style guidelines
- **File co-change patterns**: Files that frequently change together (e.g., `app.ts` with `scheduler.ts`, module `repository.ts` with `service.ts` and `routes.ts`)
- **Most frequently modified files**: Top 8 hotspot files with change counts
- **CI fix cycle**: Common pattern of iterative CI fixes after feature commits
- **Large feature development pattern**: Migrations first, then backend, then frontend, then tests, then CI fixes
- **RLS policy fix pattern**: Recurring fix pattern for permission errors (check RLS enabled, verify both policies, add system_context bypass, test with hris_app role)
- **Testing patterns**: File naming conventions, infrastructure notes (bun test vs vitest), common failure points (RLS, camelCase/snake_case, enum values, system context, field names)
- **Project scale**: 120 backend modules, 319 migrations, 134 frontend routes, 184 test files, 133 commits

---

## Related Documents

- [Agent Catalog](agent-catalog.md) -- All 10 specialised development agents
- [Memory System](memory-system.md) -- How the two-tier memory system works
- [Agent System Overview](agent-system.md) -- Architecture and context hierarchy
- [CLAUDE.md](../../CLAUDE.md) -- Primary project instructions (loaded by all agents)
