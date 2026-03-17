# Phase 2: High Priority -- Sprint Plan

**Duration:** 5 sprints (10 weeks)
**Goal:** Reduce technical debt, begin UK compliance, and establish testing infrastructure
**Prerequisite:** Phase 1 complete (security, architecture, infrastructure essentials)

---

## Sprint 4: Technical Debt -- Shared Package & Dependencies (Weeks 7-8)

**Sprint Goal:** Eliminate dependency mismatches and begin integrating `@staffora/shared` into production code.

### Stories

#### S4-01: Fix dependency version mismatches
- **Priority:** P0
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #4, #5, #6
- **Description:** Three critical version mismatches: TypeBox 0.32 vs 0.34, better-auth 1.4 vs 1.5, vitest 2.x vs coverage-v8 4.x. These can cause subtle schema incompatibilities, auth behavior differences, and broken coverage collection.
- **Acceptance Criteria:**
  - [ ] `@sinclair/typebox` aligned to `^0.34.11` in `packages/shared/package.json`
  - [ ] `better-auth` aligned to `^1.5.4` in `packages/web/package.json`
  - [ ] `vitest` and `@vitest/coverage-v8` aligned to matching major versions in `packages/web`
  - [ ] `bun install` succeeds with no peer dependency warnings
  - [ ] All tests pass after version alignment
- **Files:**
  - `packages/shared/package.json`
  - `packages/web/package.json`
  - `bun.lock`

#### S4-02: Integrate @staffora/shared error codes into API modules
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** Technical Debt Report #2 (CRITICAL)
- **Description:** `@staffora/shared` contains error codes, messages, and types that are duplicated locally in every API module. Zero imports from shared in production code.
- **Acceptance Criteria:**
  - [ ] All API modules import error codes from `@staffora/shared/errors` instead of defining locally
  - [ ] Error messages sourced from `@staffora/shared/errors/messages`
  - [ ] Duplicate error code definitions removed from module files
  - [ ] All tests pass with shared error codes
- **Files:**
  - `packages/shared/src/errors/codes.ts`
  - `packages/shared/src/errors/messages.ts`
  - All files in `packages/api/src/modules/*/routes.ts`

#### S4-03: Integrate @staffora/shared state machines into API services
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #2
- **Description:** State machine definitions exist in `@staffora/shared/state-machines` but API services define their own transition maps locally.
- **Acceptance Criteria:**
  - [ ] Employee lifecycle state machine imported from `@staffora/shared` in HR service
  - [ ] Case state machine imported from `@staffora/shared` in Cases service
  - [ ] Leave request state machine imported from `@staffora/shared` in Absence service
  - [ ] Performance cycle state machine imported from `@staffora/shared` in Talent service
  - [ ] Workflow state machine imported from `@staffora/shared` in Workflows service
  - [ ] Local state machine definitions removed
  - [ ] All state machine tests still pass
- **Files:**
  - `packages/api/src/modules/hr/service.ts`
  - `packages/api/src/modules/cases/service.ts`
  - `packages/api/src/modules/absence/service.ts`
  - `packages/api/src/modules/talent/service.ts`
  - `packages/api/src/modules/workflows/service.ts`

#### S4-04: Integrate @staffora/shared types (TenantContext, ServiceResult)
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #1.3
- **Description:** `TenantContext` is used 681 times across 50 files but each module defines it locally. `ServiceResult<T>` is redefined in 7 test files.
- **Acceptance Criteria:**
  - [ ] `TenantContext` interface defined in `@staffora/shared` and imported by all modules
  - [ ] `ServiceResult<T>` type defined in `@staffora/shared` and imported by services and tests
  - [ ] Local type definitions removed from module files
  - [ ] All tests pass with shared types
- **Files:**
  - `packages/shared/src/types/` (add TenantContext, ServiceResult)
  - All 50+ module files importing TenantContext

#### S4-05: Refactor dashboard module to service/repository pattern
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #3.1, Architecture Risk R10
- **Description:** Dashboard has inline SQL in routes.ts (only 71 lines). This is the sole NON-COMPLIANT module. No caching for expensive 6-subquery stats call.
- **Acceptance Criteria:**
  - [ ] `packages/api/src/modules/dashboard/repository.ts` created with SQL queries
  - [ ] `packages/api/src/modules/dashboard/service.ts` created with business logic
  - [ ] `packages/api/src/modules/dashboard/schemas.ts` created with TypeBox validation
  - [ ] Routes.ts delegates to service layer
  - [ ] Redis caching added for dashboard stats (60s TTL)
  - [ ] No inline SQL remains in routes.ts
- **Files:**
  - `packages/api/src/modules/dashboard/routes.ts`
  - New: `packages/api/src/modules/dashboard/repository.ts`
  - New: `packages/api/src/modules/dashboard/service.ts`
  - New: `packages/api/src/modules/dashboard/schemas.ts`

**Sprint 4 Velocity Target:** 11 points

---

## Sprint 5: Technical Debt -- Code Quality (Weeks 9-10)

**Sprint Goal:** Improve code quality: error handling, SELECT *, and large file decomposition.

### Stories

#### S5-01: Add error handling to services without try/catch
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Source:** Technical Debt Report #1.4
- **Description:** 11 of 17 services have zero error handling. They rely on the global error handler, meaning they cannot return structured `ServiceResult` error objects for business-logic failures.
- **Acceptance Criteria:**
  - [ ] Priority services wrapped with try/catch: `hr`, `benefits`, `workflows`, `recruitment`, `documents`
  - [ ] DB operations return `ServiceResult` with error codes on failure
  - [ ] Business validation errors return appropriate error codes from `@staffora/shared`
  - [ ] Unexpected errors caught, logged with structured logger, and re-thrown as internal errors
  - [ ] At least 5 of the 11 zero-error-handling services fixed this sprint
- **Files:**
  - `packages/api/src/modules/hr/service.ts`
  - `packages/api/src/modules/benefits/service.ts`
  - `packages/api/src/modules/workflows/service.ts`
  - `packages/api/src/modules/recruitment/service.ts`
  - `packages/api/src/modules/documents/service.ts`

#### S5-02: Replace SELECT * with explicit column lists
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** Architecture Risk R6 (HIGH)
- **Description:** 28 instances of `SELECT *` across 9 repository files. Violates the project's own gold-standard patterns. Risks exposing sensitive columns and causes unnecessary data transfer.
- **Acceptance Criteria:**
  - [ ] All 28 `SELECT *` instances replaced with explicit column lists
  - [ ] Column lists verified against migration schemas
  - [ ] No `SELECT *` in any repository file
  - [ ] All route and service tests pass
- **Files:**
  - `packages/api/src/modules/time/repository.ts` (9 instances)
  - `packages/api/src/modules/absence/repository.ts` (5 instances)
  - `packages/api/src/modules/talent/repository.ts` (4 instances)
  - `packages/api/src/modules/competencies/repository.ts` (3 instances)
  - Other repository files (7 instances total)

#### S5-03: Split HR service and repository (largest files)
- **Priority:** P2
- **Estimate:** 5 points (3 days)
- **Source:** Technical Debt Report #1.2
- **Description:** `hr/service.ts` (2,159 lines) and `hr/repository.ts` (1,766 lines) are the largest files. Split into domain-aligned sub-modules.
- **Acceptance Criteria:**
  - [ ] `hr/service.ts` split into: `employee.service.ts`, `org-unit.service.ts`, `position.service.ts`, `contract.service.ts`
  - [ ] `hr/repository.ts` split into matching repository files
  - [ ] `hr/service.ts` becomes a facade that delegates to sub-services
  - [ ] All existing routes continue to work without path changes
  - [ ] All HR tests pass
- **Files:**
  - `packages/api/src/modules/hr/service.ts`
  - `packages/api/src/modules/hr/repository.ts`

#### S5-04: Add route-level error boundaries to frontend
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #3.5, #8.1
- **Description:** Only one root-level ErrorBoundary exists. Any error in a sub-route crashes the entire view.
- **Acceptance Criteria:**
  - [ ] Reusable `RouteErrorBoundary` component created
  - [ ] Error boundary added to `(admin)/layout.tsx`
  - [ ] Error boundary added to `(app)/layout.tsx`
  - [ ] Error boundary added to `(auth)/layout.tsx`
  - [ ] Error boundary shows meaningful error message and retry option
  - [ ] Navigation remains functional when a route errors
- **Files:**
  - New: `packages/web/app/components/ui/RouteErrorBoundary.tsx`
  - `packages/web/app/routes/(admin)/layout.tsx`
  - `packages/web/app/routes/(app)/layout.tsx`
  - `packages/web/app/routes/(auth)/layout.tsx`

#### S5-05: Create shared pagination helper
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** Technical Debt Report #3.3
- **Description:** 162 cursor-based pagination implementations across modules. No shared helper.
- **Acceptance Criteria:**
  - [ ] `packages/api/src/lib/pagination.ts` created with cursor-based pagination utility
  - [ ] Handles forward/backward pagination, limit capping, cursor encoding/decoding
  - [ ] At least 3 modules refactored to use shared helper (HR, Absence, Time)
  - [ ] TypeBox schemas for pagination query params shared
- **Files:**
  - New: `packages/api/src/lib/pagination.ts`
  - `packages/api/src/modules/hr/repository.ts`
  - `packages/api/src/modules/absence/repository.ts`
  - `packages/api/src/modules/time/repository.ts`

#### S5-06: Remove dead code and unused dependencies
- **Priority:** P3
- **Estimate:** 1 point (0.5 days)
- **Source:** Technical Debt Report #2
- **Acceptance Criteria:**
  - [ ] `packages/web/src/App.tsx` deleted (legacy under-construction page)
  - [ ] `migrations/fix_schema_migrations_filenames.sql` documented as applied and archived
  - [ ] Duplicate `ServiceResult` definitions removed from test files
  - [ ] Unused dependencies verified and removed
- **Files:**
  - `packages/web/src/App.tsx`
  - Various test files

**Sprint 5 Velocity Target:** 18 points

---

## Sprint 6: UK Compliance Phase 1A -- Right to Work & Holiday (Weeks 11-12)

**Sprint Goal:** Implement the highest-risk UK compliance features: Right to Work verification and holiday minimum enforcement.

### Stories

#### S6-01: Right to Work verification workflow
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #1 (CRITICAL risk -- unlimited fines)
- **Description:** No RTW verification system exists. Employers face unlimited fines and criminal prosecution for hiring workers without valid RTW.
- **Acceptance Criteria:**
  - [ ] Migration creates `right_to_work_checks` table with: employee_id, check_type (manual/online/IDVT), check_date, document_type (List A/B), document_reference, expiry_date, share_code, status (pending/verified/expired/failed), verified_by, next_check_date
  - [ ] RLS enabled on new table
  - [ ] API endpoints: create check, update status, list checks, get expiring
  - [ ] Employee status cannot transition from `pending` to `active` without a verified RTW check
  - [ ] Integration test verifies: RTW check creation, status gate on employee activation
- **Files:**
  - New migration: `migrations/0123_right_to_work.sql`
  - `packages/api/src/modules/hr/service.ts` (activation gate)
  - New or extended: RTW repository/service in HR module

#### S6-02: RTW expiry alerting
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #1.2
- **Description:** Time-limited RTW permissions require follow-up checks before expiry. Existing `get_expiring_identifiers()` function exists but is not wired to notifications.
- **Acceptance Criteria:**
  - [ ] Scheduler job checks for expiring RTW documents daily
  - [ ] Alerts generated at 90, 60, and 30 days before expiry
  - [ ] Notifications sent to HR admins and the relevant employee's manager
  - [ ] Expired RTW flags employee record with warning status
  - [ ] Dashboard widget shows RTW documents expiring within 90 days
- **Files:**
  - `packages/api/src/worker/scheduler.ts`
  - `packages/api/src/jobs/notification-worker.ts`

#### S6-03: Holiday entitlement -- statutory minimum enforcement
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #2.1, #2.2 (HIGH risk)
- **Description:** Leave policies can be configured below the UK 28-day statutory minimum. No pro-rata calculation linked to FTE. Employment tribunal exposure.
- **Acceptance Criteria:**
  - [ ] Validation in `AbsenceService.createLeavePolicy()` rejects `default_balance < 28` for country_code `GBR` (full-time)
  - [ ] Pro-rata calculation: `Math.min(5.6 * days_per_week, 28)` applied for part-time
  - [ ] Warning displayed in UI when creating policies below statutory minimum
  - [ ] Compliance report endpoint lists employees with below-minimum entitlement
  - [ ] Integration test verifies: minimum enforcement, pro-rata calculation
- **Files:**
  - `packages/api/src/modules/absence/service.ts`
  - `packages/api/src/modules/absence/repository.ts`

#### S6-04: Bank holiday treatment configuration
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #2.3
- **Description:** No configuration for whether bank holidays are included in or additional to the 28-day entitlement.
- **Acceptance Criteria:**
  - [ ] Tenant or policy level setting: `bank_holiday_treatment` (included_in_entitlement / additional_to_entitlement)
  - [ ] Entitlement calculations adjusted based on setting
  - [ ] Default: additional_to_entitlement (most common UK approach)
  - [ ] Setting visible in leave policy configuration UI
- **Files:**
  - `packages/api/src/modules/absence/service.ts`
  - Migration for new column on leave_policies

**Sprint 6 Velocity Target:** 13 points

---

## Sprint 7: UK Compliance Phase 1B -- SSP & Contracts (Weeks 13-14)

**Sprint Goal:** Implement Statutory Sick Pay calculations and employment contract statement generation.

### Stories

#### S7-01: SSP calculation engine
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #3 (CRITICAL)
- **Description:** No SSP logic exists. Need waiting days, linking periods, rate calculation, lower earnings limit check, and 28-week maximum.
- **Acceptance Criteria:**
  - [ ] SSP calculation service with current statutory rate
  - [ ] 3 waiting days before payment begins
  - [ ] Linking of periods of incapacity (PIWs within 8 weeks)
  - [ ] Lower earnings limit (LEL) check against employee compensation
  - [ ] 28-week maximum tracking per period of incapacity
  - [ ] Fit note tracking: self-certification (days 1-7) vs medical certificate (day 8+)
  - [ ] SSP rates configurable and versioned by tax year
  - [ ] Integration tests for: waiting days, PIW linking, LEL check, 28-week max
- **Files:**
  - New: `packages/api/src/modules/absence/ssp.service.ts`
  - New migration for SSP tracking tables

#### S7-02: Employment contract statement generation
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #9.1
- **Description:** All employees/workers must receive a written statement on or before day one. The data exists in contracts and compensation tables but no statement is generated.
- **Acceptance Criteria:**
  - [ ] Contract template system with statutory required fields
  - [ ] PDF generation of day-one written statement from employee/contract/compensation data
  - [ ] Validation that all statutory terms are present before generation
  - [ ] Auto-trigger on employee creation (domain event handler)
  - [ ] Document stored in documents module with type `contract`
  - [ ] Acknowledgement/signature tracking
- **Files:**
  - `packages/api/src/jobs/pdf-worker.ts`
  - `packages/api/src/modules/documents/service.ts`
  - `packages/api/src/modules/hr/service.ts`

#### S7-03: Statutory notice period calculation
- **Priority:** P2
- **Estimate:** 1 point (0.5 days)
- **Source:** UK Compliance Audit #9.3
- **Description:** No validation that contractual notice meets the statutory minimum (1 week per year of service, up to 12 weeks).
- **Acceptance Criteria:**
  - [ ] Function calculates statutory minimum notice based on continuous service length
  - [ ] Validation that `notice_period_days` >= statutory minimum on contract save
  - [ ] Warning if contractual notice is below statutory minimum
- **Files:**
  - `packages/api/src/modules/hr/service.ts`

#### S7-04: GDPR -- Data Subject Access Request workflow
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #7.3, Security Audit MEDIUM-03
- **Description:** No mechanism to export all personal data for a data subject. GDPR Article 15 requires response within 30 days.
- **Acceptance Criteria:**
  - [ ] DSAR request endpoint with deadline tracking (30 days, extendable by 2 months)
  - [ ] Data compilation function aggregates data across: employees, contacts, addresses, identifiers, compensation, leave, performance, documents
  - [ ] Export as structured JSON
  - [ ] Identity verification step required before data release
  - [ ] DSAR request logged in audit trail
  - [ ] Integration test verifies data compilation completeness
- **Files:**
  - New: `packages/api/src/modules/hr/dsar.service.ts`
  - New migration for DSAR tracking table

**Sprint 7 Velocity Target:** 14 points

---

## Sprint 8: Testing Infrastructure (Weeks 15-16)

**Sprint Goal:** Fix hollow tests, establish HTTP-level test patterns, and create test utilities.

### Stories

#### S8-01: Rewrite hollow employee-lifecycle E2E test
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** Testing Audit #3.1 (CRITICAL)
- **Description:** The most egregious hollow test. Assigns strings to JS objects and asserts them. Creates a TestContext but never touches the database.
- **Acceptance Criteria:**
  - [ ] Test creates employees via real SQL
  - [ ] Status transitions executed through service or API calls
  - [ ] Employee status history verified in database
  - [ ] Outbox events verified in database
  - [ ] State machine constraints enforced (invalid transitions rejected)
  - [ ] Full lifecycle: pending -> active -> on_leave -> active -> terminated
- **Files:**
  - `packages/api/src/test/e2e/employee-lifecycle.test.ts`

#### S8-02: Create TestApiClient utility
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** Testing Audit #3.3, Recommendation #4
- **Description:** Only 1 route test uses real HTTP. Need a utility that automates session creation, tenant headers, CSRF tokens, and idempotency keys.
- **Acceptance Criteria:**
  - [ ] `TestApiClient` class created in test helpers
  - [ ] Handles: login, session cookies, CSRF token fetching, tenant header, idempotency key generation
  - [ ] Methods: `get()`, `post()`, `put()`, `patch()`, `delete()` with proper headers
  - [ ] Response includes parsed JSON body, status code, and headers
  - [ ] Example test demonstrating usage against HR module
- **Files:**
  - `packages/api/src/test/helpers/api-client.ts` (rewrite/enhance)

#### S8-03: Convert top 3 route tests to real HTTP
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Source:** Testing Audit Recommendation #3
- **Description:** Convert absence, cases, and time route tests from service-layer calls to real HTTP using TestApiClient. These should go through auth, tenant resolution, RBAC, idempotency, and error handling.
- **Acceptance Criteria:**
  - [ ] Absence routes test uses `app.handle()` with authenticated sessions
  - [ ] Cases routes test uses `app.handle()` with authenticated sessions
  - [ ] Time routes test uses `app.handle()` with authenticated sessions
  - [ ] Tests verify RBAC: unauthorized user gets 403
  - [ ] Tests verify tenant isolation: cross-tenant request returns empty/404
  - [ ] Tests verify idempotency: duplicate requests return cached response
- **Files:**
  - `packages/api/src/test/integration/routes/absence.routes.test.ts`
  - `packages/api/src/test/integration/routes/cases.routes.test.ts`
  - `packages/api/src/test/integration/routes/time.routes.test.ts`

#### S8-04: Add auth flow E2E test
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** Testing Audit #3.4
- **Description:** No test covers: register -> verify email -> login -> get session -> authenticated request -> session expiry.
- **Acceptance Criteria:**
  - [ ] E2E test covers full auth flow via HTTP
  - [ ] Registration creates user and sends verification
  - [ ] Login returns session cookie
  - [ ] Authenticated request succeeds with valid session
  - [ ] Unauthenticated request fails with 401
  - [ ] CSRF token required and validated on mutations
- **Files:**
  - New: `packages/api/src/test/e2e/auth-flow.test.ts`

#### S8-05: Fix partial service unit tests (top 5)
- **Priority:** P2
- **Estimate:** 5 points (3 days)
- **Source:** Testing Audit #3.2
- **Description:** 14 service unit tests extract logic into local functions instead of importing real services (Bun segfault workaround). Fix the top 5 most critical ones.
- **Acceptance Criteria:**
  - [ ] HR service test imports and tests the real HrService class
  - [ ] Cases service test imports and tests the real CasesService class
  - [ ] Absence service test imports and tests the real AbsenceService class
  - [ ] Tests use mock repository (in-memory) but real service logic
  - [ ] If Bun segfault persists on Windows, add CI-only flag and document workaround
- **Files:**
  - `packages/api/src/test/unit/services/hr.service.test.ts`
  - `packages/api/src/test/unit/services/cases.service.test.ts`
  - `packages/api/src/test/unit/services/absence.service.test.ts`
  - `packages/api/src/test/unit/services/hr.service.enhanced.test.ts`
  - `packages/api/src/test/unit/services/absence.service.enhanced.test.ts`

**Sprint 8 Velocity Target:** 19 points

---

## Phase 2 Exit Criteria

- [ ] All dependency version mismatches resolved
- [ ] `@staffora/shared` error codes, state machines, and types imported in production code
- [ ] Dashboard module refactored to service/repository pattern
- [ ] At least 5 services have proper error handling
- [ ] All `SELECT *` replaced with explicit column lists
- [ ] HR service/repository split into sub-modules
- [ ] Route-level error boundaries in frontend
- [ ] Right to Work verification workflow operational
- [ ] UK holiday minimum enforcement (28 days) active
- [ ] SSP calculation engine functional
- [ ] DSAR handling workflow implemented
- [ ] Hollow E2E test rewritten with real DB operations
- [ ] TestApiClient utility available for HTTP-level testing
- [ ] At least 3 route tests converted to real HTTP
- [ ] Auth flow E2E test passing

**Total Phase 2 Effort:** ~75 story points across 5 sprints
**Total Phase 2 Duration:** 10 weeks

---

## Related Documents

- [Sprint Plan Phase 1](sprint-plan-phase1.md) — Critical fixes prerequisite for Phase 2
- [Sprint Plan Phase 3](sprint-plan-phase3.md) — Feature completion following Phase 2
- [Roadmap](roadmap.md) — Product roadmap and release timeline
- [Kanban Board](kanban-board.md) — Work item tracking across all domains
- [Technical Debt Report](../audit/technical-debt-report.md) — Technical debt driving Phase 2 work
- [Testing Audit](../audit/testing-audit.md) — Test quality findings driving Phase 2 testing work
- [UK Compliance Report](../compliance/uk-hr-compliance-report.md) — Compliance requirements for Phase 2
