# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Enterprise multi-tenant HRIS (Human Resource Information System) platform with modules for Core HR, Time & Attendance, Absence Management, Talent, LMS, Cases, and Onboarding. Payroll is explicitly out of scope.

**Tech Stack (Mandatory):**
- Frontend: React 18 + React Router v7 (framework mode) + React Query + Tailwind CSS
- Backend: Bun + Elysia.js + TypeBox validation
- Auth: BetterAuth (sessions, MFA, CSRF)
- Database: PostgreSQL 16 with Row-Level Security (RLS)
- Cache/Queue: Redis 7 (sessions, caching, Streams for jobs)
- Infrastructure: Docker

## Build & Development Commands

```bash
# Install dependencies (use Bun package manager)
bun install

# Start infrastructure only (postgres + redis)
bun run docker:up

# Start all services including API and worker
docker compose -f docker/docker-compose.yml --profile full up -d

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

# Run tests
bun test                           # All packages
bun run test:api                   # API tests only
bun run test:web                   # Frontend tests only
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
```

## Environment Setup

Copy `docker/.env.example` to `docker/.env` and set required secrets:
- `POSTGRES_PASSWORD` (required)
- `SESSION_SECRET` (required)
- `CSRF_SECRET` (required)
- `BETTER_AUTH_SECRET` (required)

## Architecture

### Monorepo Structure (Bun workspaces)
- `packages/api` (@hris/api): Elysia.js backend with plugins pattern
- `packages/web` (@hris/web): React Router v7 framework mode frontend
- `packages/shared` (@hris/shared): Shared types, schemas, error codes, state machines, utilities

### Backend Layers (packages/api)
- `src/app.ts`: Main Elysia entry point
- `src/worker.ts`: Background job processor entry point
- `src/plugins/`: Elysia plugins (db, cache, auth, tenant, rbac, audit, errors, idempotency)
- `src/modules/`: Feature modules (hr, time, absence, talent, lms, cases, onboarding, workflows, portal, auth) - each with routes.ts, service.ts, repository.ts, schemas.ts
- `src/jobs/`: Background workers (outbox-processor, export-worker, notification-worker, pdf-worker, analytics-worker, domain-event-handlers)
- `src/worker/`: Worker runtime (scheduler, outbox-processor)
- `src/lib/`: Shared utilities (transaction handling)
- `src/test/`: Integration tests (rls, idempotency, outbox, effective-dating, state-machine)

### Worker Subsystem
Background processing uses Redis Streams for reliable async operations:
- **Outbox Processor**: Polls `domain_outbox` table, publishes events to Redis Streams
- **Notification Worker**: Sends emails (nodemailer/SMTP) and push notifications (Firebase)
- **Export Worker**: Generates Excel/CSV files, uploads to S3
- **PDF Worker**: Generates certificates, letters, case bundles using pdf-lib
- **Scheduler**: Cron-based jobs for reminders, notifications, cleanup

### Frontend Layers (packages/web)
- `app/routes/`: React Router v7 file-based routes with route groups: `(auth)/`, `(app)/`, `(admin)/`
- `app/components/`: Reusable UI components (ui/, layouts/)
- `app/hooks/`: Custom hooks (use-permissions, use-tenant)
- `app/lib/`: Utilities (api-client, query-client, auth, theme, utils)

### Database (migrations/)
Migrations are numbered `NNNN_description.sql`. Currently includes 96 migrations covering all modules. See `migrations/README.md` for conventions.

## Critical Patterns (Non-Negotiable)

### 1. Multi-Tenant RLS
Every tenant-owned table MUST have:
- `tenant_id uuid NOT NULL` column
- RLS enabled: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
- Isolation policy: `CREATE POLICY tenant_isolation ON table_name USING (tenant_id = current_setting('app.current_tenant')::uuid);`
- Insert policy: `CREATE POLICY tenant_isolation_insert ON table_name FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);`

### 2. Effective Dating
HR data that changes over time uses `effective_from` / `effective_to` (NULL = current):
- No overlapping records per employee per dimension
- Validate overlaps under transaction to prevent race conditions
- Use `validateNoOverlap(employeeId, dimension, newRange, excludeId?)` utility

### 3. Outbox Pattern
All domain events written to `domain_outbox` in same transaction as business write:
```typescript
await tx.insert(domainOutbox).values({
  id: crypto.randomUUID(),
  tenantId: ctx.tenantId,
  aggregateType: 'employee',
  aggregateId: employee.id,
  eventType: 'hr.employee.created',
  payload: { employee, actor: ctx.userId },
  createdAt: new Date(),
});
```

### 4. Idempotency
All mutating endpoints require `Idempotency-Key` header. Scope: `(tenant_id, user_id, route_key)`. Expire after 24-72 hours.

### 5. State Machines
Employee lifecycle: `pending → active → on_leave ↔ active → terminated`
Performance cycle: defined in `packages/shared/src/state-machines/`
Store transitions immutably for audit.

## API Conventions

- URL versioning: `/api/v1/...`
- Cursor-based pagination (not offset)
- Error shape: `{ error: { code, message, details?, requestId } }`
- Error codes defined in `packages/shared/src/errors/codes.ts`
- TypeBox schemas for request/response validation in each module

## Testing Requirements

Integration tests MUST verify:
- RLS blocks cross-tenant access
- Effective-date overlap validation (including concurrency)
- Idempotency prevents duplicate writes
- Outbox written atomically with business writes
- State machine transitions enforced

## Specialized Agents

Use these agents (defined in `.claude/agents/`) for domain-specific work:
- `hris-platform-architect`: Docker, migrations, RLS, plugins, RBAC, audit
- `hris-core-hr-developer`: Employee data, org structure, contracts, effective-dating
- `time-attendance-module-developer`: Time events, schedules, timesheets, geo-fence
- `hris-absence-module-builder`: Leave types, balances, accruals, ledger patterns
- `hris-frontend-architect`: React components, React Query hooks, permission routing

## Shared Package Exports (@hris/shared)

Import paths available from the shared package:
- `@hris/shared` - Main entry point
- `@hris/shared/types` - TypeScript types for all modules (hr, time, absence, talent, etc.)
- `@hris/shared/constants` - Shared constants
- `@hris/shared/utils` - Utility functions (dates, crypto, validation, effective-dating)
- `@hris/shared/errors` - Error codes and messages organized by module
- `@hris/shared/schemas` - Shared TypeBox/Zod schemas
- `@hris/shared/state-machines` - Employee lifecycle and performance cycle state machines

## Key Documentation

- `Docs/systemplan.md`: Complete system specification
- `Docs/Prompt.md`: Implementation directives and deliverables
- `Docs/FULL_IMPLEMENTATION_REPORT.md`: Implementation status and completed work
- `migrations/README.md`: Migration conventions and patterns
