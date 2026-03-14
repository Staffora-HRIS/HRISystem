# Repository Map -- Wave 1 Audit

**Project:** Staffora HRIS Platform
**Audit Date:** 2026-03-12
**Scope:** Full repository structure and composition analysis

---

## 1. Overview

Staffora is an enterprise multi-tenant Human Resource Information System (HRIS) built as a Bun-based monorepo. The platform covers Core HR, Time & Attendance, Absence Management, Talent, LMS, Cases, Onboarding, Benefits, Documents, Succession, Analytics, Competencies, and Recruitment.

| Metric | Count |
|---|---|
| Total source files | ~700 |
| TypeScript/TSX files | 324 |
| Test files | 82 (API) + 12 (Web) + 8 (Shared) = 102 |
| SQL migrations | 122 |
| API modules | 20 |
| Elysia plugins | 11 |
| Frontend routes | 84 |
| Background workers | 8 |
| Scheduled jobs | 12 |
| State machines | 7 |

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Bun | Latest |
| Backend framework | Elysia.js | Latest |
| Frontend framework | React | 18 |
| Routing | React Router | v7 (framework mode) |
| Server state | React Query | Latest |
| CSS | Tailwind CSS | Latest |
| Validation | TypeBox | Latest |
| Authentication | BetterAuth | Latest |
| Database | PostgreSQL | 16 |
| Cache/Queue | Redis | 7 |
| Infrastructure | Docker | Multi-stage builds |
| Package manager | Bun workspaces | Monorepo |

## 3. Monorepo Structure

```
HRISystem/
├── packages/
│   ├── api/          @staffora/api       Elysia.js backend
│   ├── web/          @staffora/web       React Router v7 frontend
│   └── shared/       @staffora/shared    Shared types, schemas, state machines
├── Website/          @staffora/website   Marketing site (React Router v7 + Tailwind)
├── migrations/                           PostgreSQL migration files (122)
├── docker/                               Docker Compose, Dockerfiles, env
├── Docs/                                 Architecture documentation
├── .claude/                              Claude Code agent config
├── .github/workflows/                    CI pipeline
└── CLAUDE.md                             Project instructions
```

### 3.1 Package Details

| Package | Path | Purpose | Entry Point |
|---|---|---|---|
| `@staffora/api` | `packages/api` | Backend API + workers | `src/app.ts`, `src/worker.ts` |
| `@staffora/web` | `packages/web` | Frontend SPA | `app/root.tsx` |
| `@staffora/shared` | `packages/shared` | Shared library | `src/index.ts` |
| `@staffora/website` | `Website/` | Marketing site | `app/root.tsx` |

## 4. Backend Architecture (`packages/api`)

### 4.1 Directory Layout

```
packages/api/src/
├── app.ts                  Main Elysia entry point
├── worker.ts               Background job processor entry point
├── plugins/                Elysia plugins (11 files)
│   ├── audit.ts
│   ├── auth-better.ts
│   ├── cache.ts
│   ├── db.ts
│   ├── errors.ts
│   ├── idempotency.ts
│   ├── rate-limit.ts
│   ├── rbac.ts
│   ├── security-headers.ts
│   └── tenant.ts
├── modules/                Feature modules (20 directories)
│   ├── absence/
│   ├── analytics/
│   ├── benefits/
│   ├── cases/
│   ├── competencies/
│   ├── dashboard/
│   ├── documents/
│   ├── hr/                 ← Gold standard reference
│   ├── lms/
│   ├── onboarding/
│   ├── portal/
│   ├── recruitment/
│   ├── reports/
│   ├── security/
│   ├── succession/
│   ├── system/
│   ├── talent/
│   ├── tenant/
│   ├── time/
│   └── workflows/
├── jobs/                   Background workers (6 files)
│   ├── analytics-worker.ts
│   ├── domain-event-handlers.ts
│   ├── export-worker.ts
│   ├── notification-worker.ts
│   ├── outbox-processor.ts
│   └── pdf-worker.ts
├── worker/                 Worker runtime
│   ├── scheduler.ts
│   └── outbox-processor.ts
├── db/                     Migration runner
│   └── migrate.ts
├── config/                 Configuration
│   └── database.ts
├── lib/                    Shared utilities
│   ├── better-auth.ts
│   ├── better-auth-handler.ts
│   ├── storage.ts
│   └── transaction.ts
├── types/                  TypeScript type definitions
└── test/                   Test suites (82 files)
    ├── setup.ts
    ├── helpers/
    ├── integration/
    ├── unit/
    ├── security/
    ├── performance/
    └── chaos/
```

### 4.2 Module Composition

Each fully-implemented module follows a 4-file pattern:

| File | Purpose |
|---|---|
| `schemas.ts` | TypeBox request/response validation schemas |
| `repository.ts` | Database queries (postgres.js tagged templates) |
| `service.ts` | Business logic, validation, orchestration |
| `routes.ts` | Elysia route definitions, plugin wiring |

### 4.3 Module Quality Tiers

| Tier | Modules | Notes |
|---|---|---|
| Gold standard | `hr` | Proper layers, outbox in same tx, state machine validation, explicit SELECTs |
| Good | `absence`, `time`, `benefits` | Proper layers, minor issues |
| Rebuilt | `talent`, `lms`, `workflows` | Rewritten repositories; verify column names against migrations |
| Pattern violations | `dashboard` | Inline SQL in routes, not layered |

### 4.4 Plugin Chain (Registration Order)

| Order | Plugin | Depends On |
|---|---|---|
| 1 | `securityHeadersPlugin` | CORS |
| 2 | `errorsPlugin` | -- |
| 3 | `dbPlugin` | -- |
| 4 | `cachePlugin` | -- |
| 5 | `rateLimitPlugin` | cache |
| 6 | `betterAuthPlugin` | -- |
| 7 | `authPlugin` | db, cache |
| 8 | `tenantPlugin` | db, cache, auth |
| 9 | `rbacPlugin` | db, cache, auth, tenant |
| 10 | `idempotencyPlugin` | db, cache, auth, tenant |
| 11 | `auditPlugin` | db, auth, tenant |

### 4.5 Background Workers

| Worker | Stream | Purpose |
|---|---|---|
| Outbox Processor | `domain-events` | Polls `domain_outbox`, publishes to Redis Streams |
| Notification Worker | `notifications` | Email (SMTP/nodemailer) + push (Firebase) |
| Export Worker | `exports` | Excel/CSV generation, S3 upload |
| PDF Worker | `pdf-generation` | Certificates, letters, case bundles (pdf-lib) |
| Analytics Worker | `analytics` | Data aggregation |
| Domain Event Handlers | `domain-events` | Reacts to domain events |

### 4.6 Scheduler (12 Cron Jobs)

Jobs include: leave accrual, session cleanup, outbox cleanup, probation reminders, document expiry checks, training deadline notifications, time entry reminders, benefits enrollment windows, analytics aggregation, audit log archival, certificate expiry, and system health checks.

## 5. Frontend Architecture (`packages/web`)

### 5.1 Directory Layout

```
packages/web/app/
├── root.tsx                App shell
├── routes/
│   ├── (auth)/             Login, register, forgot-password
│   ├── (app)/              Employee-facing routes
│   └── (admin)/            Admin routes (per module)
├── components/
│   ├── ui/                 16 reusable UI components
│   ├── layouts/            Shell, sidebar, navigation
│   └── {module}/           Module-specific components
├── hooks/                  5 custom hooks
│   ├── use-permissions.ts
│   ├── use-tenant.ts
│   └── ...
└── lib/                    13 utilities
    ├── api-client.ts
    ├── query-client.ts
    ├── auth.ts
    ├── theme.ts
    └── utils.ts
```

### 5.2 Route Groups

| Group | Path Prefix | Purpose | Route Count |
|---|---|---|---|
| `(auth)` | `/login`, `/register`, etc. | Authentication flows | ~6 |
| `(app)` | `/dashboard`, `/profile`, etc. | Employee self-service | ~20 |
| `(admin)` | `/admin/*` | Admin management | ~58 |

**Total frontend routes:** 84

## 6. Shared Package (`packages/shared`)

```
packages/shared/src/
├── types/              Module-specific TypeScript types
├── constants/          Shared constants
├── utils/              Date, crypto, validation, effective-dating utilities
├── errors/             Error codes and messages (by module)
├── schemas/            Shared TypeBox/Zod schemas
└── state-machines/     7 state machines
    ├── employee-lifecycle.ts
    ├── leave-request.ts
    ├── case.ts
    ├── workflow.ts
    ├── performance-cycle.ts
    ├── onboarding.ts
    └── recruitment.ts
```

**Note:** The shared package is largely unused in production code. Modules define their own local types, `ServiceResult<T>`, and `TenantContext`. This is a known technical debt item.

## 7. Database Migrations

| Property | Value |
|---|---|
| Location | `migrations/` |
| Naming | `NNNN_description.sql` |
| Range | 0001 -- 0116 |
| Total files | 122 |
| Duplicate numbers | 7 (0076, 0077, 0078, 0079, 0101, 0110) |
| Schema | `app` (not `public`) |
| DB roles | `hris` (superuser), `hris_app` (NOBYPASSRLS) |

**Warning:** 7 migration numbers are duplicated, which can cause ordering ambiguity during migration execution. See infrastructure audit for details.

## 8. State Machines

| Machine | Location | States |
|---|---|---|
| Employee Lifecycle | `shared/state-machines/` | pending -> active -> on_leave <-> active -> terminated |
| Leave Request | `shared/state-machines/` | draft -> pending -> approved/rejected/cancelled |
| Case Management | `shared/state-machines/` | open -> in_progress -> resolved -> closed (with escalation/reopen) |
| Workflow | `shared/state-machines/` | draft -> pending -> in_progress -> completed/cancelled/failed |
| Performance Cycle | `shared/state-machines/` | draft -> active -> review -> calibration -> completed |
| Onboarding | `shared/state-machines/` | Onboarding workflow states |
| Recruitment | `shared/state-machines/` | Recruitment pipeline states |

## 9. Test Distribution

| Package | Location | File Count | Test Runner |
|---|---|---|---|
| API - Integration | `packages/api/src/test/integration/` | ~20 | bun test |
| API - Unit | `packages/api/src/test/unit/` | ~35 | bun test |
| API - Security | `packages/api/src/test/security/` | ~8 | bun test |
| API - Performance | `packages/api/src/test/performance/` | ~8 | bun test |
| API - Chaos | `packages/api/src/test/chaos/` | ~5 | bun test |
| API - E2E | `packages/api/src/test/e2e/` | ~6 | bun test |
| Web | `packages/web/app/__tests__/` | 12 | vitest |
| Shared | `packages/shared/src/__tests__/` | 8 | bun test |

**Total:** ~102 test files

## 10. CI/CD

| Component | Status |
|---|---|
| CI Pipeline | `.github/workflows/test.yml` -- runs typecheck, lint, build, test |
| CD Pipeline | **Not implemented** |
| Docker Compose | `docker/docker-compose.yml` -- development and production profiles |

## 11. Key File Paths (Quick Reference)

| Resource | Path |
|---|---|
| API entry | `packages/api/src/app.ts` |
| Worker entry | `packages/api/src/worker.ts` |
| Plugin directory | `packages/api/src/plugins/` |
| Module directory | `packages/api/src/modules/` |
| HR module (gold standard) | `packages/api/src/modules/hr/` |
| Frontend routes | `packages/web/app/routes/` |
| Shared package | `packages/shared/src/` |
| Migrations | `migrations/` |
| Docker config | `docker/` |
| Test setup | `packages/api/src/test/setup.ts` |
| Project instructions | `CLAUDE.md` |
| Documentation | `Docs/` |
