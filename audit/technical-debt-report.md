# Staffora HRIS -- Technical Debt Report

**Date:** 2026-03-13
**Auditor:** Technical Debt Agent (Claude Opus 4.6)
**Scope:** Full codebase scan of `packages/api`, `packages/web`, `packages/shared`, `Website/`, `migrations/`

---

## Technical Debt Score: 42 / 100

> A score of 100 means zero debt. The Staffora codebase has significant structural debt in testing, shared package usage, and architectural consistency, offset by solid infrastructure patterns (RLS, outbox, migrations).

| Category | Score | Weight | Weighted |
|---|---|---|---|
| Code Quality | 60 / 100 | 15% | 9.0 |
| Dead Code & Unused Assets | 35 / 100 | 10% | 3.5 |
| Architecture | 50 / 100 | 20% | 10.0 |
| Dependencies | 45 / 100 | 10% | 4.5 |
| Database & Migrations | 70 / 100 | 15% | 10.5 |
| Testing | 20 / 100 | 20% | 4.0 |
| Documentation | 65 / 100 | 5% | 3.25 |
| Frontend | 55 / 100 | 5% | 2.75 |
| **Total** | | **100%** | **47.5** |

*(Rounded to 42 reflecting qualitative severity adjustments for the hollow test problem.)*

---

## 1. Code Quality (Score: 60/100)

### 1.1 No TODO/FIXME/HACK Comments -- GOOD
No `// TODO`, `// FIXME`, `// HACK`, or `// XXX` comments were found in production code. This is clean.

### 1.2 Large Files (>500 lines) -- MODERATE CONCERN

**Backend (15 files over 500 lines):**

| File | Lines | Concern |
|---|---|---|
| `packages/api/src/modules/hr/service.ts` | 2,159 | God class -- should be split into sub-services |
| `packages/api/src/modules/hr/repository.ts` | 1,766 | Massive -- split by domain (employee, org, position) |
| `packages/api/src/modules/benefits/routes.ts` | 1,641 | Routing file doing too much |
| `packages/api/src/modules/hr/routes.ts` | 1,410 | Large route file |
| `packages/api/src/jobs/pdf-worker.ts` | 1,382 | Monolithic worker |
| `packages/api/src/modules/benefits/service.ts` | 1,311 | Large but functionally coherent |
| `packages/api/src/modules/benefits/repository.ts` | 1,110 | Large but acceptable |
| `packages/api/src/jobs/analytics-worker.ts` | 980 | Could be split |
| `packages/api/src/jobs/domain-event-handlers.ts` | 968 | Many handlers in one file |
| `packages/api/src/worker/scheduler.ts` | 921 | Acceptable for scheduler |
| `packages/api/src/worker/outbox-processor.ts` | 909 | Acceptable |
| `packages/api/src/plugins/idempotency.ts` | 839 | Complex but cohesive |
| `packages/api/src/modules/talent/routes.ts` | 836 | Large route file |
| `packages/api/src/modules/hr/schemas.ts` | 814 | Many schemas, acceptable |
| `packages/api/src/modules/time/service.ts` | 776 | Large but coherent |

**Frontend (14 route files over 500 lines):**

| File | Lines |
|---|---|
| `routes/(admin)/talent/recruitment/candidates/route.tsx` | 644 |
| `routes/(admin)/talent/recruitment/route.tsx` | 640 |
| `routes/(admin)/hr/employees/route.tsx` | 616 |
| `routes/(admin)/benefits/route.tsx` | 616 |
| `routes/(admin)/hr/positions/route.tsx` | 580 |
| `routes/(admin)/talent/performance/route.tsx` | 550 |
| `routes/(admin)/leave/policies/route.tsx` | 541 |
| `routes/(app)/manager/performance/route.tsx` | 541 |
| `routes/(admin)/time/schedules/route.tsx` | 538 |
| `routes/(admin)/talent/goals/route.tsx` | 524 |
| `routes/(admin)/leave/types/route.tsx` | 524 |
| `routes/(admin)/hr/employees/[employeeId]/route.tsx` | 518 |
| `routes/(admin)/time/timesheets/route.tsx` | 507 |

### 1.3 Code Duplication -- SIGNIFICANT

- **`ServiceResult<T>` type redefined in 7 test files** instead of importing from `packages/api/src/types/service-result.ts`:
  - `test/unit/services/talent.service.test.ts:23`
  - `test/unit/services/recruitment.service.test.ts:22`
  - `test/unit/services/onboarding.service.test.ts:23`
  - `test/unit/services/lms.service.test.ts:23`
  - `test/unit/services/documents.service.test.ts:24`
  - `test/unit/services/cases.service.test.ts:35`
  - `test/unit/services/benefits.service.test.ts:23`

- **`TenantContext` interface** is used 681 times across 50 module files. Each module defines or imports it locally rather than sharing from `@staffora/shared`.

- **Session cookie helper functions** (`buildCookieHeader`, `splitCombinedSetCookieHeader`) are duplicated across multiple route test files.

### 1.4 Inconsistent Error Handling Across Services

Only 6 of 17 service files use try/catch for error handling:

| Service | Catch Blocks | Pattern |
|---|---|---|
| `time/service.ts` | 18 | Full error handling |
| `absence/service.ts` | 15 | Full error handling |
| `talent/service.ts` | 8 | Moderate |
| `cases/service.ts` | 7 | Moderate |
| `onboarding/service.ts` | 6 | Moderate |
| `lms/service.ts` | 4 | Minimal |
| `analytics/service.ts` | 0 | **No error handling** |
| `benefits/service.ts` | 0 | **No error handling** |
| `competencies/service.ts` | 0 | **No error handling** |
| `documents/service.ts` | 0 | **No error handling** |
| `hr/service.ts` | 0 | **No error handling** |
| `portal/service.ts` | 0 | **No error handling** |
| `recruitment/service.ts` | 0 | **No error handling** |
| `security/service.ts` | 0 | **No error handling** |
| `succession/service.ts` | 0 | **No error handling** |
| `tenant/service.ts` | 0 | **No error handling** |
| `workflows/service.ts` | 0 | **No error handling** |

Note: The services without catch blocks may rely on the global error handler in `errorsPlugin`. However, this means they cannot return structured `ServiceResult` error objects for business-logic failures -- they just throw.

---

## 2. Dead Code & Unused Assets (Score: 35/100)

### 2.1 Shared Package Almost Entirely Unused -- CRITICAL

`@staffora/shared` is declared as a peer dependency of both `@staffora/api` and `@staffora/web`, yet:

- **0 imports in `packages/web/app/`** (the entire frontend)
- **0 imports in `packages/api/src/modules/`** (all production API code)
- **2 imports total** -- both in test files (`effective-dating.test.ts`, `state-machine.test.ts`)

The shared package contains:
- Type definitions for all modules
- Error codes and messages
- State machine definitions (employee lifecycle, performance cycle, case, etc.)
- Validation utilities
- Effective-dating utilities
- TypeBox/Zod schemas

All of these are duplicated locally in the API modules instead. This represents a **massive duplication of effort** and makes cross-package consistency impossible to enforce.

### 2.2 Unused Dependencies

| Package | Dependency | Issue |
|---|---|---|
| `@staffora/api` | `pg` (^8.16.3) | Only used in `src/lib/better-auth.ts` for BetterAuth's Pool adapter; `postgres` (postgres.js) is the primary DB driver. Two PostgreSQL drivers is unnecessary. |
| `@staffora/api` | `@types/pg` (^8.16.0) | Only needed because of the `pg` dependency above |
| `Website/` | `@better-auth/infra` (^0.1.8) | **Zero imports** in any Website source file |
| `@staffora/api` | `otpauth` (^9.3.5) | Verify if actually used in production code (BetterAuth handles TOTP internally) |

### 2.3 Commented-Out Code -- MINIMAL

Only 5 instances of commented-out executable code found across the entire codebase. This is clean.

### 2.4 Obsolete Files

- `packages/web/src/App.tsx` -- Contains an "under construction" page. This appears to be a leftover from pre-React Router v7 setup. The actual app entry is `packages/web/app/root.tsx`.
- `migrations/fix_schema_migrations_filenames.sql` -- A one-time fixup script that should be documented as "already applied" or archived.

---

## 3. Architecture Debt (Score: 50/100)

### 3.1 Modules Missing Service/Repository Pattern -- MODERATE

The CLAUDE.md correctly identifies the layered architecture pattern. These modules lack it:

| Module | Missing Files | Severity |
|---|---|---|
| `dashboard` | `schemas.ts`, `service.ts`, `repository.ts` | **High** -- inline SQL in routes (confirmed: SQL in `routes.ts` line 19-39) |
| `auth` | `schemas.ts`, `service.ts`, `repository.ts` | Low -- delegates to BetterAuth |
| `system` | `schemas.ts`, `service.ts`, `repository.ts` | Low -- simple health/info endpoints |
| `portal` | `schemas.ts` | Low -- has service/repo but no schemas |
| `tenant` | `schemas.ts` | Low -- has service/repo but no schemas |

### 3.2 Dual PostgreSQL Driver Architecture -- HIGH

The codebase uses two PostgreSQL client libraries:
- **`postgres` (postgres.js)** -- Used by the main application (`db.ts` plugin, all modules, workers, migrations, tests). 47 import sites.
- **`pg` (node-postgres)** -- Used only in `src/lib/better-auth.ts` line 16 for `Pool`. A single import.

This creates dependency duplication, potential connection pool conflicts, and maintenance burden. Better Auth should be configured to use the existing postgres.js connection.

### 3.3 Missing Global Abstractions

- **No shared pagination helper**: Cursor-based pagination logic (162 occurrences of cursor-related patterns) is implemented independently in each module's repository/service.
- **No centralized outbox helper**: Each service writes outbox events with inline SQL rather than using a shared function.
- **No shared route-level error mapping**: Error-code-to-HTTP-status mapping is duplicated across route files.

### 3.4 Module Coupling Through Direct Imports

The security module has 6 sub-files (`field-permission.routes.ts`, `field-permission.service.ts`, `manager.routes.ts`, `manager.service.ts`, `portal.routes.ts`, `portal.service.ts`) plus the standard set. This module handles too many concerns (RBAC, field permissions, portal access, manager hierarchy). Consider splitting.

### 3.5 Single Error Boundary

The frontend has only **one ErrorBoundary** at the root level (`app/root.tsx:100`). Individual route modules have no error boundaries, meaning any data-fetching error in a sub-route will crash the entire application view rather than showing a localized error.

---

## 4. Dependency Debt (Score: 45/100)

### 4.1 Version Mismatches -- HIGH

| Dependency | Package A | Package B | Issue |
|---|---|---|---|
| `@sinclair/typebox` | `@staffora/api: ^0.34.11` | `@staffora/shared: ^0.32.0` | **Major version mismatch** -- TypeBox 0.32 vs 0.34 have breaking API changes |
| `better-auth` | `@staffora/api: ^1.5.4` | `@staffora/web: ^1.4.10` | Version drift -- client/server should match |
| `vitest` / `@vitest/coverage-v8` | `vitest: ^2.1.8` | `@vitest/coverage-v8: ^4.1.0` | **Major version mismatch** -- v2 vs v4 incompatible |

### 4.2 Redundant Dependencies

- `pg` + `postgres` in `@staffora/api` -- see Section 3.2
- `@better-auth/infra` in `Website/` -- never imported
- `zod` appears in all 3 packages -- consistent version but the API uses TypeBox for validation, so Zod may be partially redundant there

### 4.3 Heavy Dependencies

- `firebase-admin` (^13.0.2) -- 40+ MB package, dynamically imported in notification-worker. Consider making this optional/pluggable.
- `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` -- dynamically imported in storage.ts. Consider making storage providers pluggable via configuration.
- `exceljs` -- dynamically imported in export-worker. Good pattern (lazy loading).

---

## 5. Database & Migrations (Score: 70/100)

### 5.1 Migration Renumbering History -- MODERATE

The presence of `fix_schema_migrations_filenames.sql` confirms that migrations were renumbered at least once. The git status shows deleted files with old numbers and new untracked files with updated numbers. This creates operational risk for any existing database that applied the old filenames.

**Current state:** 122 numbered migration files (0001-0122) + 1 fixup script. The numbering is now sequential and correct.

### 5.2 Migrations Missing DOWN Sections -- LOW

7 migration files lack `-- DOWN Migration` rollback sections:

| File | Reason |
|---|---|
| `0090_fix_immutable_system_context.sql` | Fix script -- hard to reverse |
| `0091_fix_employee_status_history_triggers.sql` | Fix script |
| `0096_better_auth_twofactor_columns.sql` | ALTER TABLE ADD COLUMN |
| `0106_jobs.sql` | Should have rollback |
| `0113_seed_demo_employees_data.sql` | Seed data -- acceptable |
| `0114_seed_demo_position_assignments.sql` | Seed data -- acceptable |
| `fix_schema_migrations_filenames.sql` | One-time fixup |

### 5.3 RLS Coverage -- GOOD

- 122 `ENABLE ROW LEVEL SECURITY` statements across 92 migration files
- 140 `CREATE TABLE` statements across 99 files
- Tables that intentionally skip RLS: Better Auth managed tables (user, session, account, organization) -- documented in migration 0122

### 5.4 Index Coverage -- GOOD

- 586 `CREATE INDEX` / `CREATE UNIQUE INDEX` statements across 102 files
- Core query patterns (WHERE tenant_id =, WHERE employee_id =, WHERE status =) appear 236 times in module repositories -- these are all covered by RLS policies and existing indexes.

### 5.5 Potential Missing Indexes

The analytics tables (`0084_analytics.sql`, `0111_analytics.sql`) aggregate across large datasets. Composite indexes on `(tenant_id, metric_type, period_start)` should be verified.

---

## 6. Testing (Score: 20/100) -- CRITICAL

### 6.1 Hollow/Fake Tests -- CRITICAL SEVERITY

This is the single largest technical debt item. CLAUDE.md itself warns: *"Most route tests, security tests, performance tests, chaos tests, and E2E tests assert local variables, not actual API calls."*

**Confirmed hollow test files (assert local variables, no DB/API interaction):**

| File | What It Does | Lines |
|---|---|---|
| `test/integration/routes/onboarding.routes.test.ts` | Creates JS objects and asserts their properties | 74 test cases |
| `test/integration/routes/lms.routes.test.ts` | Creates JS objects and asserts their properties | 70 test cases |
| `test/integration/routes/talent.routes.test.ts` | Creates JS objects and asserts their properties | 54 test cases |
| `test/e2e/employee-lifecycle.test.ts` | Assigns string to variable and asserts it | 8 test cases |
| `test/performance/query-performance.test.ts` | Uses `setTimeout` to simulate delays, asserts timeout < threshold | 12 test cases |

**Example of hollow testing (from `employee-lifecycle.test.ts`):**
```typescript
// This "test" does nothing:
const employee = { status: "pending" };
employee.status = "active";
expect(employee.status).toBe("active"); // Always passes
```

### 6.2 Test Classification

| Category | Files | Real Tests | Hollow Tests |
|---|---|---|---|
| **Integration (core)** | 12 | 12 (rls, idempotency, outbox, effective-dating, state-machine, constraint-validation, database-connection, etc.) | 0 |
| **Integration (routes)** | 16 | 13 (use `app.handle()` or service calls) | 3 (onboarding, lms, talent) |
| **Unit (services)** | 14 | ~11 (hr, absence, time have enhanced tests with real DB) | ~3 (mock-only, testing mocks) |
| **Unit (plugins)** | 10 | 10 (most test plugin behavior) | 0 |
| **Unit (jobs)** | 6 | 6 (test worker logic) | 0 |
| **Unit (repositories)** | 3 | 3 (real DB queries) | 0 |
| **E2E** | 5 | 4 (case-management, leave-request, multi-tenant, onboarding) | 1 (employee-lifecycle) |
| **Security** | 7 | ~4 (csrf, auth-bypass, injection use `app.handle()`) | ~3 (some test local objects) |
| **Performance** | 5 | 3 (concurrent-access, large-dataset, query-performance.enhanced) | 2 (query-performance, cache-performance partially) |
| **Chaos** | 2 | 2 (real DB connections) | 0 |
| **Shared package** | 8+ | 8+ | 0 |

**Estimated hollow test percentage: ~15-20% of test files contain partially or fully hollow tests.**

### 6.3 Frontend Test Coverage -- LOW

- **30 test files** for **84 route files** (36% file coverage)
- Most frontend tests are UI component tests, not route integration tests
- No E2E frontend tests (no Playwright/Cypress)
- `vitest` / `@vitest/coverage-v8` version mismatch may cause coverage collection failures

### 6.4 Missing Test Coverage for Critical Paths

- **Benefits module** -- integration route tests exist but are minimal (17 assertions)
- **Succession planning** -- route tests exist but are minimal
- **Documents module** -- minimal route coverage
- **Portal module** -- has real route tests (good)
- **Recruitment module** -- has real route tests (good)

---

## 7. Documentation Debt (Score: 65/100)

### 7.1 Comprehensive Docs Structure -- GOOD

The `Docs/` directory is well-organized with architecture, API reference, guides, patterns, and security documentation.

### 7.2 CLAUDE.md Quality -- GOOD

The `CLAUDE.md` is thorough (400+ lines) and correctly identifies known pitfalls, module quality tiers, and critical patterns.

### 7.3 Migration README -- EXISTS

`migrations/README.md` exists and documents conventions.

### 7.4 Missing Documentation

- No API documentation auto-generation despite `@elysiajs/swagger` being a dependency
- No changelog/release notes
- No ADR (Architecture Decision Records) for key decisions (dual DB driver, BetterAuth choice, etc.)
- Worker system documentation in code is limited (inline comments only in complex workers)

---

## 8. Frontend Debt (Score: 55/100)

### 8.1 No Route-Level Error Boundaries -- MODERATE

Only the root-level `ErrorBoundary` exists. Any uncaught error in a route component crashes the entire view.

### 8.2 Large Route Files

14 route files exceed 500 lines. These monolithic route files combine data fetching, state management, form handling, and rendering. They should be decomposed into:
- Data hooks (useQuery/useMutation)
- Form components
- Table/list components
- Page layout component

### 8.3 Shared Package Not Used

The frontend imports **zero** items from `@staffora/shared`. Error codes, types, and constants are hardcoded or inferred from API responses.

### 8.4 No Storybook or Component Documentation

UI components in `app/components/ui/` have no visual documentation or isolated development environment.

### 8.5 Legacy Entry Point

`packages/web/src/App.tsx` exists with an "under construction" message but the actual app runs via `app/root.tsx`. This legacy file should be removed.

---

## Top 20 Highest-Impact Debt Items

| # | Item | Category | Severity | Impact | Effort |
|---|---|---|---|---|---|
| 1 | Hollow/fake tests providing false confidence | Testing | CRITICAL | System reliability | High |
| 2 | `@staffora/shared` package unused in production | Architecture | CRITICAL | Code duplication, inconsistency | High |
| 3 | Dual PostgreSQL drivers (pg + postgres) | Architecture | HIGH | Maintenance, confusion | Medium |
| 4 | `vitest` vs `@vitest/coverage-v8` version mismatch | Dependencies | HIGH | Frontend coverage broken | Low |
| 5 | TypeBox version mismatch (0.32 vs 0.34) | Dependencies | HIGH | Schema compatibility | Low |
| 6 | `better-auth` version mismatch (1.4 vs 1.5) | Dependencies | HIGH | Auth behavior inconsistency | Low |
| 7 | Dashboard module has inline SQL in routes | Architecture | HIGH | Pattern violation | Medium |
| 8 | HR service.ts at 2,159 lines | Code Quality | HIGH | Maintainability | High |
| 9 | 11 of 17 services lack error handling | Code Quality | HIGH | Silent failures | Medium |
| 10 | Single root-level ErrorBoundary in frontend | Frontend | HIGH | UX on errors | Medium |
| 11 | No frontend test coverage for most routes | Testing | HIGH | Regression risk | High |
| 12 | Migration renumbering requires fixup script | Database | MODERATE | Deployment complexity | Low |
| 13 | 14 frontend route files >500 lines | Frontend | MODERATE | Maintainability | High |
| 14 | Redundant ServiceResult type in 7 test files | Code Quality | MODERATE | Maintenance | Low |
| 15 | `@better-auth/infra` unused in Website package | Dependencies | MODERATE | Bundle bloat | Low |
| 16 | No pagination abstraction (162 cursor implementations) | Architecture | MODERATE | Code duplication | Medium |
| 17 | 7 migrations missing DOWN rollback sections | Database | LOW | Rollback capability | Low |
| 18 | Legacy `packages/web/src/App.tsx` file | Dead Code | LOW | Confusion | Trivial |
| 19 | No route-level error boundaries in frontend | Frontend | MODERATE | UX degradation | Medium |
| 20 | Security module handles too many concerns (6 files) | Architecture | LOW | Cognitive complexity | Medium |

---

## Estimated Effort to Resolve (Per Category)

| Category | Est. Effort | Priority |
|---|---|---|
| **Testing: Replace hollow tests with real ones** | 10-15 days | P0 -- IMMEDIATE |
| **Architecture: Integrate @staffora/shared** | 5-8 days | P0 -- IMMEDIATE |
| **Dependencies: Fix version mismatches** | 1 day | P0 -- IMMEDIATE |
| **Architecture: Eliminate dual PG driver** | 2-3 days | P1 -- HIGH |
| **Architecture: Dashboard refactor to layers** | 1 day | P1 -- HIGH |
| **Code Quality: Add error handling to services** | 3-4 days | P1 -- HIGH |
| **Code Quality: Split large files** | 5-7 days | P2 -- MEDIUM |
| **Frontend: Add route-level error boundaries** | 2 days | P2 -- MEDIUM |
| **Frontend: Decompose large route files** | 8-10 days | P2 -- MEDIUM |
| **Architecture: Shared pagination helper** | 2-3 days | P2 -- MEDIUM |
| **Dependencies: Remove unused deps** | 0.5 days | P2 -- MEDIUM |
| **Database: Add missing DOWN migrations** | 1 day | P3 -- LOW |
| **Dead Code: Remove legacy files** | 0.5 days | P3 -- LOW |
| **Documentation: Add ADRs and changelog** | 2-3 days | P3 -- LOW |

**Total estimated effort: ~45-60 person-days**

---

## Prioritized Remediation Plan

### Phase 1: Critical Fixes (Week 1-2)

1. **Fix dependency version mismatches** (1 day)
   - Align `@sinclair/typebox` to `^0.34.11` in `packages/shared`
   - Align `better-auth` to `^1.5.4` in `packages/web`
   - Align `vitest` and `@vitest/coverage-v8` to matching major versions
   - Remove `@better-auth/infra` from `Website/package.json`

2. **Replace the top-3 hollow test files** (5 days)
   - Rewrite `test/integration/routes/onboarding.routes.test.ts` to use `app.handle()` or service calls
   - Rewrite `test/integration/routes/lms.routes.test.ts` with real DB operations
   - Rewrite `test/integration/routes/talent.routes.test.ts` with real DB operations
   - Rewrite `test/e2e/employee-lifecycle.test.ts` with actual database CRUD
   - Delete `test/performance/query-performance.test.ts` (fake setTimeout test)

3. **Begin @staffora/shared integration** (3 days)
   - Start importing error codes from `@staffora/shared/errors` in API modules
   - Import state machines from `@staffora/shared/state-machines`
   - Import TenantContext and ServiceResult types

### Phase 2: Architecture Cleanup (Week 3-4)

4. **Eliminate dual PostgreSQL driver** (2 days)
   - Configure BetterAuth to use postgres.js adapter instead of `pg` Pool
   - Remove `pg` and `@types/pg` from dependencies

5. **Refactor dashboard module to service/repository pattern** (1 day)
   - Extract SQL from `routes.ts` into `repository.ts`
   - Create `service.ts` with business logic
   - Add `schemas.ts` for TypeBox validation

6. **Add error handling to services without it** (3 days)
   - Priority: `hr/service.ts`, `benefits/service.ts`, `workflows/service.ts`
   - Wrap DB operations in try/catch, return `ServiceResult` error objects

7. **Create shared pagination helper** (2 days)
   - Extract cursor-based pagination into `packages/api/src/lib/pagination.ts`
   - Refactor modules to use shared helper

### Phase 3: Code Quality (Week 5-6)

8. **Split oversized files** (5 days)
   - `hr/service.ts` (2,159 lines) -> split into `employee.service.ts`, `org-unit.service.ts`, `position.service.ts`
   - `hr/repository.ts` (1,766 lines) -> matching repository splits
   - `benefits/routes.ts` (1,641 lines) -> split into carrier, plan, enrollment, life-event route groups

9. **Add route-level error boundaries to frontend** (2 days)
   - Create reusable `RouteErrorBoundary` component
   - Add to all admin and app layout routes

10. **Remove dead code** (0.5 days)
    - Delete `packages/web/src/App.tsx`
    - Archive `migrations/fix_schema_migrations_filenames.sql`
    - Remove unused test type definitions

### Phase 4: Test Infrastructure (Week 7-8)

11. **Rewrite remaining hollow tests** (5 days)
    - Convert remaining mock-only service tests to use real DB
    - Add frontend route tests with React Testing Library
    - Set up E2E test framework (Playwright)

12. **Add missing DOWN migrations** (1 day)
    - `0106_jobs.sql`
    - `0096_better_auth_twofactor_columns.sql`

13. **Documentation improvements** (2 days)
    - Create ADR template and document key decisions
    - Set up API documentation generation from Swagger annotations
    - Add CHANGELOG.md

---

## Appendix A: File Inventory Summary

| Area | Files | Lines (approx) |
|---|---|---|
| API modules (src/modules/) | ~100 | ~25,000 |
| API plugins (src/plugins/) | ~11 | ~4,000 |
| API jobs (src/jobs/) | ~7 | ~6,000 |
| API workers (src/worker/) | ~2 | ~1,800 |
| API tests (src/test/) | ~98 | ~30,000 |
| Frontend routes | 84 | ~23,500 |
| Frontend components | ~30 | ~5,000 |
| Frontend tests | 30 | ~4,000 |
| Shared package | ~20 | ~5,000 |
| Migrations | 123 SQL files | ~15,000 |
| **Total** | **~500+** | **~120,000** |

## Appendix B: Module Architecture Compliance

| Module | routes | schemas | service | repository | Compliant? |
|---|---|---|---|---|---|
| hr | Y | Y | Y | Y | FULL |
| absence | Y | Y | Y | Y | FULL |
| time | Y | Y | Y | Y | FULL |
| benefits | Y | Y | Y | Y | FULL |
| cases | Y | Y | Y | Y | FULL |
| competencies | Y | Y | Y | Y | FULL |
| documents | Y | Y | Y | Y | FULL |
| lms | Y | Y | Y | Y | FULL |
| onboarding | Y | Y | Y | Y | FULL |
| recruitment | Y | Y | Y | Y | FULL |
| succession | Y | Y | Y | Y | FULL |
| talent | Y | Y | Y | Y | FULL |
| workflows | Y | Y | Y | Y | FULL |
| analytics | Y | Y | Y | Y | FULL |
| portal | Y | -- | Y | Y | PARTIAL (no schemas) |
| tenant | Y | -- | Y | Y | PARTIAL (no schemas) |
| security | Y | Y | Y | Y | FULL (but overly complex, 6+ files) |
| **dashboard** | Y | -- | -- | -- | **NON-COMPLIANT** (inline SQL) |
| auth | Y | -- | -- | -- | PARTIAL (delegates to BetterAuth) |
| system | Y | -- | -- | -- | PARTIAL (simple health endpoint) |
