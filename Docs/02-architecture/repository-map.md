# Staffora Platform — Repository Architecture Map

Generated: 2026-03-16

*Last updated: 2026-03-17*

## Overview

Enterprise multi-tenant HRIS platform with 71 backend modules, comprehensive frontend, background worker system, and full CI/CD pipeline.

## Monorepo Structure

```
staffora-platform/
├── packages/
│   ├── api/          @staffora/api      — Elysia.js REST API (Bun runtime)
│   ├── web/          @staffora/web      — React Router v7 frontend
│   └── shared/       @staffora/shared   — Types, schemas, state machines, utils
├── migrations/       233 SQL files      — PostgreSQL migrations (0001–0181)
├── docker/           Docker Compose     — Postgres, Redis, API, Worker, Web, Nginx
├── .github/          CI/CD              — 4 workflows (PR check, tests, security, deploy)
├── Docs/             Documentation      — Guides, architecture, API reference, patterns
└── .claude/          AI agent system    — Agents, skills, memory, learning log
```

## Backend Architecture (packages/api)

### Entry Points
- `src/app.ts` — Main API server (Elysia + plugins + all module routes)
- `src/worker.ts` — Background job processor (Redis Streams consumer)

### Plugins (11 plugins, strict registration order)
1. `security-headers` — CSP, HSTS, X-Frame, etc.
2. `errors` — Error handling, request ID generation, AppError classes
3. `db` — PostgreSQL via postgres.js (DatabaseClient, transactions, RLS context)
4. `cache` — Redis via ioredis (CacheClient, TTLs, key patterns)
5. `rate-limit` — Token bucket rate limiting per IP/user
6. `better-auth-handler` — BetterAuth route handler for /api/auth/*
7. `auth-better` — Session/user resolution, AuthService, MFA guards
8. `tenant` — Tenant resolution from session/header/cookie, TenantService
9. `rbac` — RBAC with permission checking, data scopes, SoD, field perms
10. `idempotency` — Request deduplication via Idempotency-Key header
11. `audit` — Audit logging for all mutations

### Modules (71 total, all have routes/service/repository/schemas/index)

**Core HR:** hr, contracts, positions, departments, org-chart
**Time & Attendance:** time, geofence, schedules
**Absence:** absence, bereavement, carers-leave, family-leave, parental-leave, statutory-leave, return-to-work, ssp
**Talent:** talent, competencies, succession, recruitment, assessments, reference-checks, dbs-checks, agencies
**Learning:** lms, cpd, course-ratings, training-budgets
**Cases:** cases, warnings, probation
**Onboarding:** onboarding
**Benefits:** benefits
**Documents:** documents, letter-templates, contract-statements, contract-amendments
**Payroll:** payroll, payroll-config, payslips, tax-codes, deductions, pension, nmw
**GDPR:** dsar, data-erasure, data-breach, data-retention, consent, privacy-notices
**Employee Data:** bank-details, emergency-contacts, employee-photos, diversity, reasonable-adjustments, equipment, secondments
**Operations:** delegations, notifications, jobs, headcount-planning, flexible-working, wtr, health-safety, gender-pay-gap
**System:** auth, tenant, security, portal, dashboard, system, workflows, reports, analytics

### Background Workers (packages/api/src/jobs/)
- `base.ts` — BaseWorker with Redis Streams consumer groups
- `outbox-processor.ts` — Polls domain_outbox → publishes to Redis Streams
- `domain-event-handlers.ts` — Processes domain events
- `notification-worker.ts` — Email (nodemailer) + push (Firebase)
- `export-worker.ts` — Excel/CSV generation, S3 upload
- `pdf-worker.ts` — PDF generation via pdf-lib
- `analytics-worker.ts` — Analytics aggregation

### Scheduler (packages/api/src/worker/scheduler.ts)
- Cron-based jobs for reminders, notifications, cleanup

## Frontend Architecture (packages/web)

### Route Groups
- `(auth)/` — Login, forgot-password, reset-password, MFA
- `(admin)/` — Full admin panel with 130+ route files
- `(app)/` — Self-service portal (me/, manager/)

### Admin Modules (route count)
- Dashboard, HR (15 routes), Leave (10), Time (5), Talent (8), LMS (6)
- Onboarding (3), Benefits (3), Cases (3), Documents (3), Workflows (3)
- Payroll (10), Reports (8+), Security (5), Settings (6)
- Compliance (9), Privacy (6), Analytics (2)

### Key Libraries
- `app/lib/api-client.ts` — Fetch wrapper for API communication
- `app/lib/auth-client.ts` — Better Auth client
- `app/lib/query-client.ts` — React Query configuration
- `app/hooks/use-permissions.tsx` — RBAC permission hooks

## Database

### Schema: `app` (not `public`)
- 233 migration files (0001–0181, with duplicates in 0076–0079 range)
- Two roles: `hris` (admin), `hris_app` (app, NOBYPASSRLS)
- RLS on all tenant-owned tables via `app.set_tenant_context()`
- System context bypass via `app.enable_system_context()`

### Key Tables
- `user`, `session`, `account` — Better Auth tables
- `users`, `tenants`, `user_tenants` — Application user/tenant mapping
- `employees`, `positions`, `org_units`, `departments` — Core HR
- `leave_types`, `leave_balances`, `leave_requests` — Absence
- `time_events`, `timesheets`, `schedules` — Time
- `domain_outbox` — Transactional outbox for events
- `audit_log` — Immutable audit trail
- `roles`, `permissions`, `role_assignments`, `role_permissions` — RBAC

### State Machines (packages/shared/src/state-machines/)
- Employee lifecycle (pending → active → on_leave ↔ active → terminated)
- Leave request (draft → pending → approved/rejected/cancelled)
- Case management (open → in_progress → resolved → closed)
- Performance cycle (draft → active → review → calibration → completed)
- Flexible working request (submitted → under_review → approved/rejected)

## Infrastructure

### Docker Services
- PostgreSQL 16 (staffora-postgres)
- Redis 7 (staffora-redis)
- API Server (staffora-api)
- Background Worker (staffora-worker)
- Web Frontend (staffora-web)
- Nginx reverse proxy (production profile only)

### CI/CD (GitHub Actions)
- `pr-check.yml` — Typecheck + lint + Docker build verification
- `test.yml` — Full test suite with Postgres/Redis services
- `security.yml` — Dependency audit + Docker image scan (Trivy) + secret detection (TruffleHog)
- `deploy.yml` — Build → Push to GHCR → Deploy staging/production (placeholder deploy steps)

### Dockerfiles
- `packages/api/Dockerfile` — 4-stage build (deps → builder → prod-deps → runner)
- `packages/web/Dockerfile` — Multi-stage build

## Test Infrastructure

### API Tests (107 test files)
- `test/unit/` — Plugin tests (11), service tests (15), job tests (7), repository tests (3), lib tests (2)
- `test/integration/` — RLS (3), idempotency (2), outbox (1), effective-dating (2), state-machine (1), routes (16), tenant (3), workflows (1), migration (1), constraint (1)
- `test/e2e/` — Auth flow, employee lifecycle, case management, leave request, multi-tenant, onboarding (6)
- `test/security/` — Auth, authz bypass, CSRF, injection, input validation, rate limiting, SQL injection, XSS (8)
- `test/performance/` — Cache, concurrent access, large dataset, query performance (5)
- `test/chaos/` — Connection failures, data integrity, database failures (3)

### Frontend Tests (35 test files)
- Vitest-based (not bun test)
- Component tests, hook tests, route tests

### Shared Package Tests
- State machine tests, constant validation tests

## Documentation
- `Docs/guides/` — Getting started, deployment, frontend guide
- `Docs/architecture/` — Architecture, database, worker system
- `Docs/api/` — API reference (200+ endpoints), error codes
- `Docs/patterns/` — State machines, security patterns
- `SECURITY.md` — Security policy

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — System architecture and data flow diagrams
- [Architecture Map](architecture-map.md) — High-level architecture map with diagrams
- [Database Guide](DATABASE.md) — Schema, migrations, and table catalog
- [Worker System](WORKER_SYSTEM.md) — Background job processing subsystem
- [Getting Started](../05-development/GETTING_STARTED.md) — Development setup and common commands
- [Implementation Status](../13-roadmap/analysis/implementation_status.md) — Feature completion by module
