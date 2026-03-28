# Staffora HRIS -- Comprehensive Testing Audit

*Last updated: 2026-03-28*

**Audit Date:** 2026-03-13
**Auditor:** Testing Agent (Automated)
**Total Test Files:** 113
**Total Test Cases:** ~2,800+

---

## Executive Summary

The test suite is large in surface area (113 files, ~2,800 test cases) but quality is uneven. The situation has **improved significantly** since the Wave 1 audit (2026-03-12), with the majority of tests now connecting to real infrastructure. A core group of ~80+ files contain **genuine tests** that hit real PostgreSQL/Redis, use real services/repositories, or render real React components. However, a problematic subset remains: 1 fully hollow E2E test and 14 service unit tests that extract and test **copies** of business logic rather than the actual service classes.

The CLAUDE.md warning about hollow tests was accurate at the time of the previous audit but the codebase has been substantially improved since then. The remaining issues are well-understood and actionable.

**Testing Score: 42/100** (penalized for partial service tests and missing HTTP-level integration)

---

## 1. Test Inventory Table

### API Backend Tests (packages/api/src/test/)

| File | Category | Quality | Test Count | Notes |
|------|----------|---------|------------|-------|
| **INTEGRATION -- Core Critical Path** | | | | |
| integration/rls.test.ts | Integration | GENUINE | 11 | Real DB, two tenants, RLS enforced via hris_app role |
| integration/rls-comprehensive.test.ts | Integration | GENUINE | 15 | Extended RLS coverage across more tables |
| integration/rls-coverage.test.ts | Integration | GENUINE | 1 | RLS coverage verification |
| integration/idempotency.test.ts | Integration | GENUINE | 9 | Real idempotency_keys table operations |
| integration/idempotency-replay.test.ts | Integration | GENUINE | 1 | Replay detection |
| integration/outbox.test.ts | Integration | GENUINE | 7 | Atomic outbox writes, rollback verification |
| integration/effective-dating.test.ts | Integration | GENUINE | 13 | Real compensation_history, position_assignments with overlap detection |
| integration/effective-dating-enhanced.test.ts | Integration | GENUINE | 16 | Extended effective dating scenarios |
| integration/state-machine.test.ts | Integration | GENUINE | 23 | Real employee status transitions + DB triggers + outbox events |
| integration/constraint-validation.test.ts | Integration | GENUINE | 28 | Real DB constraint enforcement |
| integration/database-connection.test.ts | Integration | GENUINE | 8 | Connection pooling behavior |
| integration/transaction-rollback.test.ts | Integration | GENUINE | 5 | Transaction atomicity |
| integration/migration-validation.test.ts | Integration | GENUINE | 20 | Schema validation against migrations |
| integration/bootstrap-root.test.ts | Integration | GENUINE | 2 | Root tenant bootstrap |
| integration/tenant-context-500-fix.test.ts | Integration | GENUINE | 9 | Tenant context edge cases |
| integration/tenant-resolution-fallback.test.ts | Integration | GENUINE | 16 | Tenant resolution logic |
| integration/tenant-security.endpoints.test.ts | Integration | GENUINE | 5 | Tenant security via HTTP |
| integration/multi-tenant/cross-tenant-attacks.test.ts | Integration | GENUINE | 13 | Cross-tenant attack prevention |
| integration/workflows/leave-approval-flow.test.ts | Integration | GENUINE | 9 | Workflow integration |
| **INTEGRATION -- Route Tests** | | | | |
| integration/routes/absence.routes.test.ts | Integration | GENUINE | 45 | Real DB via service layer, RLS isolation, outbox, state machine |
| integration/routes/hr.routes.test.ts | Integration | GENUINE | 13 | Real HTTP via app.handle(), session auth, RLS |
| integration/routes/hr.routes.enhanced.test.ts | Integration | GENUINE | 42 | Extended HR routes via service layer |
| integration/routes/cases.routes.test.ts | Integration | GENUINE | 12 | Real DB operations |
| integration/routes/time.routes.test.ts | Integration | GENUINE | 79 | Comprehensive time module via service layer |
| integration/routes/talent.routes.test.ts | Integration | GENUINE | 40 | Talent module via service layer |
| integration/routes/lms.routes.test.ts | Integration | GENUINE | 53 | LMS module via service layer |
| integration/routes/onboarding.routes.test.ts | Integration | GENUINE | 56 | Onboarding via service layer |
| integration/routes/benefits.routes.test.ts | Integration | GENUINE | 9 | Benefits via service layer |
| integration/routes/competencies.routes.test.ts | Integration | GENUINE | 7 | Competencies via service layer |
| integration/routes/documents.routes.test.ts | Integration | GENUINE | 9 | Documents via service layer |
| integration/routes/recruitment.routes.test.ts | Integration | GENUINE | 9 | Recruitment via service layer |
| integration/routes/succession.routes.test.ts | Integration | GENUINE | 10 | Succession via service layer |
| integration/routes/portal.routes.test.ts | Integration | GENUINE | 7 | Portal via service layer |
| integration/routes/analytics.routes.test.ts | Integration | GENUINE | 5 | Analytics via service layer |
| integration/routes/security.routes.test.ts | Integration | GENUINE | 7 | Security routes via service layer |
| **E2E Tests** | | | | |
| e2e/case-management-flow.test.ts | E2E | GENUINE | 16 | Real DB, full case lifecycle, state machine triggers, escalation |
| e2e/employee-lifecycle.test.ts | E2E | **HOLLOW** | 5 | Asserts local JS objects, no DB operations whatsoever |
| e2e/leave-request-flow.test.ts | E2E | GENUINE | 11 | Real DB operations for leave lifecycle |
| e2e/multi-tenant-isolation.test.ts | E2E | GENUINE | 20 | Real multi-tenant isolation tests |
| e2e/onboarding-flow.test.ts | E2E | GENUINE | 15 | Real onboarding lifecycle |
| **SECURITY Tests** | | | | |
| security/sql-injection.test.ts | Security | GENUINE | 17 | Real DB queries with malicious payloads, verifies parameterization |
| security/injection-attacks.test.ts | Security | GENUINE | 13 | Real DB + Redis injection tests |
| security/authentication.test.ts | Security | GENUINE | 18 | Real HTTP via app.handle(), tests unauthenticated access rejection |
| security/authorization-bypass.test.ts | Security | GENUINE | 21 | Real HTTP authorization tests |
| security/csrf-protection.test.ts | Security | GENUINE | 12 | CSRF prevention via HTTP |
| security/input-validation.test.ts | Security | GENUINE | 23 | Input validation via HTTP |
| security/rate-limiting.test.ts | Security | GENUINE | 15 | Rate limiting via Redis |
| security/xss-prevention.test.ts | Security | GENUINE | 17 | XSS prevention via HTTP |
| **PERFORMANCE Tests** | | | | |
| performance/cache-performance.test.ts | Performance | GENUINE | 14 | Real Redis operations, latency measurement |
| performance/concurrent-access.test.ts | Performance | GENUINE | 8 | Real concurrent DB access |
| performance/large-dataset.test.ts | Performance | GENUINE | 8 | Real large dataset queries |
| performance/query-performance.test.ts | Performance | GENUINE | 9 | Real query benchmarking |
| performance/query-performance.enhanced.test.ts | Performance | GENUINE | 14 | Enhanced query performance |
| **CHAOS Tests** | | | | |
| chaos/connection-failures.test.ts | Chaos | GENUINE | 12 | Real connection failure simulation |
| chaos/data-integrity.test.ts | Chaos | GENUINE | 13 | Real data integrity verification |
| chaos/database-failures.test.ts | Chaos | GENUINE | 11 | Real database failure scenarios |
| **UNIT -- Plugin Tests** | | | | |
| unit/plugins/rbac.plugin.test.ts | Unit | GENUINE | 43 | Tests RbacService with mocks, real logic |
| unit/plugins/audit.plugin.test.ts | Unit | GENUINE | 40 | Tests audit plugin logic |
| unit/plugins/cache.plugin.test.ts | Unit | GENUINE | 38 | Tests cache plugin logic |
| unit/plugins/db.plugin.test.ts | Unit | GENUINE | 21 | Tests DB plugin logic |
| unit/plugins/errors.plugin.test.ts | Unit | GENUINE | 35 | Tests error handling plugin |
| unit/plugins/idempotency.plugin.test.ts | Unit | GENUINE | 26 | Tests idempotency plugin |
| unit/plugins/rate-limit.plugin.test.ts | Unit | GENUINE | 18 | Tests rate limit plugin |
| unit/plugins/security-headers.plugin.test.ts | Unit | GENUINE | 32 | Tests security headers plugin |
| unit/plugins/tenant.plugin.test.ts | Unit | GENUINE | 33 | Tests tenant plugin |
| unit/plugins/auth-better.plugin.test.ts | Unit | GENUINE | 34 | Tests auth plugin |
| **UNIT -- Service Tests** | | | | |
| unit/services/hr.service.test.ts | Unit | PARTIAL | 25 | Uses mock repo (in-memory), tests state transitions via local const |
| unit/services/hr.service.enhanced.test.ts | Unit | PARTIAL | 57 | Enhanced HR service with mock repo |
| unit/services/absence.service.test.ts | Unit | PARTIAL | 16 | Mock-based service tests |
| unit/services/absence.service.enhanced.test.ts | Unit | PARTIAL | 45 | Extended absence service with mocks |
| unit/services/cases.service.test.ts | Unit | PARTIAL | 51 | Extracts logic into local functions, tests those -- no real service import |
| unit/services/lms.service.test.ts | Unit | PARTIAL | 36 | Same pattern -- extracted local logic, not actual service |
| unit/services/talent.service.test.ts | Unit | PARTIAL | 27 | Same pattern |
| unit/services/time.service.test.ts | Unit | PARTIAL | 12 | Same pattern |
| unit/services/time.service.enhanced.test.ts | Unit | PARTIAL | 75 | Extended time service tests |
| unit/services/benefits.service.test.ts | Unit | PARTIAL | 27 | Same pattern |
| unit/services/analytics.service.test.ts | Unit | PARTIAL | 15 | Same pattern |
| unit/services/dashboard.service.test.ts | Unit | PARTIAL | 9 | Same pattern |
| unit/services/documents.service.test.ts | Unit | PARTIAL | 29 | Same pattern |
| unit/services/onboarding.service.test.ts | Unit | PARTIAL | 22 | Same pattern |
| unit/services/recruitment.service.test.ts | Unit | PARTIAL | 21 | Same pattern |
| unit/services/workflows.service.test.ts | Unit | PARTIAL | 30 | Same pattern |
| **UNIT -- Repository Tests** | | | | |
| unit/repositories/absence.repository.test.ts | Unit | GENUINE | 55 | Tests repository with real DB adapter |
| unit/repositories/hr.repository.test.ts | Unit | GENUINE | 56 | Tests repository with real DB adapter |
| unit/repositories/time.repository.test.ts | Unit | GENUINE | 73 | Tests repository with real DB adapter |
| **UNIT -- Job Tests** | | | | |
| unit/jobs/analytics-worker.test.ts | Unit | GENUINE | 30 | Job worker tests |
| unit/jobs/base.test.ts | Unit | GENUINE | 41 | Base job infrastructure tests |
| unit/jobs/domain-event-handlers.test.ts | Unit | GENUINE | 35 | Event handler tests |
| unit/jobs/export-worker.test.ts | Unit | GENUINE | 22 | Export worker tests |
| unit/jobs/notification-worker.test.ts | Unit | GENUINE | 43 | Notification worker tests |
| unit/jobs/outbox-processor.test.ts | Unit | GENUINE | 32 | Outbox processor tests |
| unit/jobs/pdf-worker.test.ts | Unit | GENUINE | 24 | PDF worker tests |
| **UNIT -- Other** | | | | |
| unit/auth-service-session-tenant.test.ts | Unit | GENUINE | 3 | Auth session tests |
| auth.test.ts | Unit | GENUINE | 27 | Auth flow tests |
| config/database.test.ts | Unit | GENUINE | 21 | Database config tests |

### Shared Package Tests (packages/shared/src/__tests__/)

| File | Category | Quality | Test Count | Notes |
|------|----------|---------|------------|-------|
| state-machines/employee-lifecycle.test.ts | Unit | GENUINE | 55 | Pure function tests, comprehensive |
| state-machines/case.test.ts | Unit | GENUINE | 71 | Pure function tests, comprehensive |
| state-machines/leave-request.test.ts | Unit | GENUINE | 71 | Pure function tests, comprehensive |
| state-machines/performance-cycle.test.ts | Unit | GENUINE | 76 | Pure function tests, comprehensive |
| state-machines/workflow.test.ts | Unit | GENUINE | 86 | Pure function tests, comprehensive |
| utils/effective-dating.test.ts | Unit | GENUINE | 58 | Pure function tests |
| utils/validation.test.ts | Unit | GENUINE | 89 | Pure function tests |
| utils/dates.test.ts | Unit | GENUINE | 101 | Pure function tests |
| utils/crypto.test.ts | Unit | GENUINE | 60 | Pure function tests |
| errors/codes.test.ts | Unit | GENUINE | 65 | Error code validation |
| constants/index.test.ts | Unit | GENUINE | 43 | Constant validation |
| schemas/index.test.ts | Unit | GENUINE | 76 | Schema validation |

### Frontend Tests (packages/web/)

| File | Category | Quality | Test Count | Notes |
|------|----------|---------|------------|-------|
| components/ui/Button.test.tsx | Unit | GENUINE | 30 | Real rendering with @testing-library/react |
| components/ui/Input.test.tsx | Unit | GENUINE | 52 | Real rendering, interactions |
| components/ui/Modal.test.tsx | Unit | GENUINE | 32 | Real rendering, open/close |
| components/ui/Card.test.tsx | Unit | GENUINE | 35 | Real rendering |
| components/ui/Badge.test.tsx | Unit | GENUINE | 26 | Real rendering |
| components/ui/Avatar.test.tsx | Unit | GENUINE | 24 | Real rendering |
| components/ui/Table.test.tsx | Unit | GENUINE | 25 | Real rendering |
| components/ui/Alert.test.tsx | Unit | GENUINE | 20 | Real rendering |
| components/ui/Toast.test.tsx | Unit | GENUINE | 12 | Real rendering |
| components/ui/Tabs.test.tsx | Unit | GENUINE | 15 | Real rendering |
| components/ui/Skeleton.test.tsx | Unit | GENUINE | 25 | Real rendering |
| components/ui/Spinner.test.tsx | Unit | GENUINE | 20 | Real rendering |
| components/ui/SearchInput.test.tsx | Unit | GENUINE | 20 | Real rendering, interactions |
| components/layouts/AdminLayout.test.tsx | Unit | GENUINE | 19 | Layout rendering tests |
| components/layouts/AppLayout.test.tsx | Unit | GENUINE | 20 | Layout rendering tests |
| components/layouts/AuthLayout.test.tsx | Unit | GENUINE | 23 | Layout rendering tests |
| hooks/use-permissions.test.ts | Unit | GENUINE | 17 | Hook logic tests |
| hooks/use-manager.test.ts | Unit | GENUINE | 13 | Hook logic tests |
| hooks/use-tenant.test.ts | Unit | GENUINE | 13 | Hook logic tests |
| routes/dashboard.test.tsx | Unit | GENUINE | 7 | Real rendering with mocked API |
| routes/login.test.tsx | Unit | GENUINE | 9 | Real rendering with mocked auth |
| lib/api-client.test.ts | Unit | GENUINE | 13 | API client logic |
| lib/auth-client.test.ts | Unit | GENUINE | 9 | Auth client logic |
| lib/query-client.test.ts | Unit | GENUINE | 28 | React Query config |
| lib/theme.test.ts | Unit | GENUINE | 9 | Theme logic |
| lib/utils.test.ts | Unit | GENUINE | 85 | Utility functions |
| under-construction.guard.test.ts | Unit | GENUINE | 1 | Guard logic |
| entry.client.test.tsx | Unit | GENUINE | 1 | Entry point test |
| root.structure.test.tsx | Unit | GENUINE | 1 | Root structure test |
| lib/hydration.test.ts | Unit | GENUINE | 5 | Hydration logic |

---

## 2. Coverage by Module

### Backend Modules with Tests

| Module | Route Tests | Service Tests | Repository Tests | Integration Tests | Quality Assessment |
|--------|------------|---------------|-----------------|-------------------|-------------------|
| **HR (Core)** | REAL HTTP + service layer (55 tests) | PARTIAL (82 tests) | GENUINE (56 tests) | RLS, effective-dating, state-machine, outbox | **GOOD** -- Best covered module |
| **Absence** | Service layer (45 tests) | PARTIAL (61 tests) | GENUINE (55 tests) | effective-dating, outbox | **GOOD** -- Well covered |
| **Time** | Service layer (79 tests) | PARTIAL (87 tests) | GENUINE (73 tests) | -- | **GOOD** -- Well covered |
| **Cases** | Service layer (12 tests) | PARTIAL (51 tests) | -- | case-management-flow E2E (GENUINE, 16 tests) | **GOOD** -- E2E is strong |
| **Talent** | Service layer (40 tests) | PARTIAL (27 tests) | -- | -- | **ADEQUATE** |
| **LMS** | Service layer (53 tests) | PARTIAL (36 tests) | -- | -- | **ADEQUATE** |
| **Onboarding** | Service layer (56 tests) | PARTIAL (22 tests) | -- | onboarding-flow E2E (GENUINE, 15 tests) | **ADEQUATE** |
| **Benefits** | Service layer (9 tests) | PARTIAL (27 tests) | -- | -- | **ADEQUATE** |
| **Documents** | Service layer (9 tests) | PARTIAL (29 tests) | -- | -- | **ADEQUATE** |
| **Recruitment** | Service layer (9 tests) | PARTIAL (21 tests) | -- | -- | **ADEQUATE** |
| **Succession** | Service layer (10 tests) | -- | -- | -- | **MINIMAL** |
| **Competencies** | Service layer (7 tests) | -- | -- | -- | **MINIMAL** |
| **Portal** | Service layer (7 tests) | -- | -- | -- | **MINIMAL** |
| **Analytics** | Service layer (5 tests) | PARTIAL (15 tests) | -- | -- | **MINIMAL** |
| **Security (field perms)** | Service layer (7 tests) | -- | -- | -- | **MINIMAL** |
| **Workflows** | -- | PARTIAL (30 tests) | -- | leave-approval-flow (9 tests) | **MINIMAL** |
| **Dashboard** | -- | PARTIAL (9 tests) | -- | -- | **WEAK** |
| **System** | -- | -- | -- | -- | **NONE** |

### Frontend Route Coverage

| Route Group | Routes with Tests | Routes without Tests |
|-------------|------------------|---------------------|
| **(auth)/** | login | forgot-password, reset-password, mfa |
| **(app)/** | dashboard | manager/*, me/competencies, me/learning, me/leave |
| **(admin)/** | NONE | ALL admin routes untested (~30 routes) |

---

## 3. Critical Coverage Gaps

### 3.1. Hollow Test -- employee-lifecycle.test.ts (CRITICAL)

The most egregious example of a hollow test. Claims to test "full employee lifecycle" but literally does:

```typescript
const employee = { id: crypto.randomUUID(), status: "pending" };
employee.status = "active";
expect(employee.status).toBe("active");
```

Creates a `TestContext` in `beforeAll` but never uses `ctx.db`. All 5 test cases assert properties on local JavaScript objects. Zero database operations. Zero API calls. Zero state machine enforcement. This file gives a false impression that the employee lifecycle is E2E tested.

### 3.2. Service Unit Test Extraction Pattern (SIGNIFICANT)

14 service unit test files work around a Bun/Windows segfault by **extracting business logic into local functions** within the test file rather than importing the actual service class. The pattern:

```typescript
// NOTE: These tests extract and verify the business logic directly
// rather than importing the service class, to avoid bun 1.3.3 segfault

// Re-implements validation logic locally
function validateStatusTransition(from, to) { ... }

// Tests the local copy, not the actual service
it("should reject invalid transition", () => {
  expect(validateStatusTransition("closed", "open").success).toBe(false);
});
```

**Impact:** If service logic drifts from the test copy, the tests still pass but coverage is illusory. These tests verify the developer's intent at write time but provide zero regression protection.

**Affected files (14):** cases, lms, talent, time, benefits, analytics, dashboard, documents, onboarding, recruitment, workflows, absence (2 files), hr (2 files with mock repo)

### 3.3. Missing HTTP-Level Integration

Only `hr.routes.test.ts` makes real HTTP calls via `app.handle()` with proper session authentication. All other route test files instantiate services directly, bypassing:
- Authentication (BetterAuth session validation)
- Tenant resolution (header/session extraction)
- RBAC permission checks
- Idempotency plugin
- Rate limiting
- Audit logging
- Error formatting

### 3.4. Missing Test Areas

| Area | Impact | Notes |
|------|--------|-------|
| **Admin frontend routes** | HIGH | ~30 admin routes with zero tests |
| **Manager frontend routes** | HIGH | 5 routes, 0 tests |
| **Auth flow E2E** | HIGH | No login -> session -> authenticated request flow test |
| **MFA flow** | HIGH | No MFA enrollment/verification tests |
| **Session lifecycle** | MEDIUM | No session expiry, refresh, or invalidation tests |
| **Worker integration** | MEDIUM | Unit tests only; no Redis Streams end-to-end tests |
| **File upload/download** | MEDIUM | No document or export file operation tests |
| **Email/notification delivery** | LOW | Unit tests with mocks only |

---

## 4. Test Infrastructure Assessment

### 4.1. Docker Test Setup -- GOOD

- `setup.ts` auto-starts Docker services (postgres + redis) if not running
- Uses `hris_app` role (NOBYPASSRLS) ensuring RLS is genuinely enforced
- Admin role used only for bootstrap (creating roles, granting permissions)
- `waitForPostgresReady()` and `waitForRedisReady()` with configurable timeouts
- `loadDockerEnv()` loads docker/.env for local development
- Schema existence check prevents tests from running against uninitialized DB

### 4.2. Test Helpers -- ADEQUATE

| Helper | Purpose | Quality |
|--------|---------|---------|
| `createTestTenant()` | Creates real tenant in DB | GOOD |
| `createTestUser()` | Creates user with role assignments | GOOD |
| `setTenantContext()` | Sets session-level RLS context | GOOD |
| `clearTenantContext()` | Clears RLS context | GOOD |
| `withSystemContext()` | Bypasses RLS for admin ops | GOOD |
| `expectRlsError()` | Asserts RLS violation | GOOD |
| `withTestTransaction()` | Rollback transactions for isolation | GOOD |
| `cleanupTestTenant()` | Cleanup with error handling | GOOD |
| `createMockDatabaseClient()` | In-memory mock DB | ADEQUATE |
| `createMockHRRepository()` | In-memory HR repo mock | ADEQUATE |
| `createMockOutbox()` | Mock outbox for event testing | ADEQUATE |

**Missing:**
- No `TestApiClient` utility for making authenticated HTTP requests
- No data factories for domain objects (employees, positions, etc.)
- Fixtures created inline in each test file

### 4.3. CI/CD Pipeline -- GOOD

`.github/workflows/test.yml`:
- Runs on push to main and pull requests
- GitHub Actions service containers (Postgres 16 + Redis 7)
- Migrations run before tests
- Separate jobs: API tests (bun test) + Frontend tests (vitest)
- Frontend job includes coverage reporting with artifact upload
- Type checking and linting run before tests
- Build step verifies all packages compile

**Missing from CI:**
- No test coverage thresholds enforced
- No E2E tests against a running API server
- No parallel test execution optimization

---

## 5. Frontend Test Coverage Assessment

### 5.1. UI Components -- GOOD (13 files, ~350 tests)

Thorough test coverage using vitest + @testing-library/react + userEvent. All 13 core UI components tested for rendering, variants, sizes, interactions, and accessibility.

### 5.2. Layouts -- GOOD (3 files, 62 tests)

Admin, App, and Auth layouts tested for navigation, responsive behavior, and link structure.

### 5.3. Hooks -- GOOD (3 files, 43 tests)

Permission checking, manager context, and tenant resolution logic tested.

### 5.4. Libraries -- GOOD (5 files, ~144 tests)

api-client, auth-client, query-client, theme, and utils all thoroughly tested.

### 5.5. Route Pages -- WEAK (2 files, 16 tests)

Only dashboard and login pages have tests. All ~35+ admin routes and ~8+ app routes are untested.

---

## 6. Critical Paths: Covered vs. Not

| Critical Path | Covered? | Quality |
|---------------|----------|---------|
| RLS tenant isolation | YES | GENUINE -- comprehensive, multi-table |
| Idempotency deduplication | YES | GENUINE -- key storage, scoping, expiry |
| Outbox atomicity | YES | GENUINE -- atomic write + rollback verification |
| Effective-dating overlap | YES | GENUINE -- compensation + position assignments |
| State machine transitions | YES | GENUINE -- DB triggers + history recording |
| Authentication enforcement | YES | GENUINE -- via app.handle() HTTP |
| SQL injection prevention | YES | GENUINE -- real queries with malicious payloads |
| Cross-tenant attacks | YES | GENUINE -- 13 attack scenarios |
| CSRF protection | YES | GENUINE -- via HTTP |
| Rate limiting | YES | GENUINE -- via Redis |
| XSS prevention | YES | GENUINE -- via HTTP |
| Input validation | YES | GENUINE -- via HTTP |
| Case state machine (DB trigger) | YES | GENUINE -- full lifecycle + constraint checks |
| Full HTTP request lifecycle | PARTIAL | Only 1 route test file uses real HTTP (hr.routes.test.ts) |
| Session management | NO | No session lifecycle tests |
| MFA enforcement | NO | No tests |
| RBAC at route level | NO | Plugin tested in isolation, not at route level |
| Worker/Redis Streams E2E | NO | Unit tests only |

---

## 7. Testing Score Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| **Core Critical Paths** (RLS, idempotency, outbox, effective-dating, state machines) | 25% | 90/100 | 22.5 |
| **API Integration Tests** (route tests via service layer) | 20% | 70/100 | 14.0 |
| **Security Tests** (SQL injection, auth, CSRF, XSS) | 15% | 80/100 | 12.0 |
| **Unit Tests** (plugins, jobs, shared package) | 10% | 65/100 | 6.5 |
| **Service Unit Tests** | 10% | 25/100 | 2.5 |
| **Frontend Tests** | 10% | 55/100 | 5.5 |
| **E2E Tests** | 5% | 30/100 | 1.5 |
| **CI/CD Pipeline** | 5% | 70/100 | 3.5 |
| **TOTAL** | **100%** | | **68.0** |

**Adjusted for Hollow/Partial Penalty:** -26 points for hollow E2E tests, copied-logic service tests, and missing HTTP-level integration.

**Final Score: 42/100**

---

## 8. Recommendations

### Priority 1: Fix Hollow Tests (HIGH IMPACT, LOW EFFORT)

1. **Rewrite `e2e/employee-lifecycle.test.ts`** to use real database operations. Create employees via SQL, execute status transitions, verify history and outbox records in the database. This is the textbook hollow test.

2. **Fix service unit tests** to import and test real service classes. Options:
   - Use the same approach as route tests: instantiate service + repository with a real DB adapter
   - Run the segfault-affected tests only on Linux/CI
   - At minimum, add runtime assertions verifying extracted logic matches the real service

### Priority 2: Expand HTTP-Level Testing (HIGH IMPACT, MEDIUM EFFORT)

3. **Convert top 3 route tests to real HTTP** (Pattern A from hr.routes.test.ts). The absence, cases, and time modules should have at least some tests that go through auth + tenant resolution + RBAC + error handling.

4. **Create a `TestApiClient`** utility that automates session creation, tenant headers, and idempotency keys for HTTP tests.

5. **Add auth flow E2E test**: Register, login, get session, make authenticated request, verify session expiry, test MFA enrollment.

### Priority 3: Frontend Route Testing (MEDIUM IMPACT)

6. **Add tests for top admin routes**: employees list, employee detail, absence management, time management, cases list.

7. **Add tests for manager routes**: Approvals and team management.

### Priority 4: Missing Integration Tests (MEDIUM IMPACT)

8. **Add worker integration tests**: Domain events flowing from outbox through Redis Streams to worker handlers.

9. **Add concurrent overlap tests**: Two users modifying the same employee simultaneously under real transaction isolation.

10. **Add RBAC route-level tests**: Verify that permission checks actually block unauthorized access at the API endpoint level.

### Priority 5: CI/CD and Infrastructure (LOW IMPACT)

11. **Add coverage thresholds** to CI pipeline. Fail builds if genuine test coverage drops below threshold.

12. **Create test data factories** for employees, org units, positions, leave types, etc. in `helpers/factories.ts`.

13. **Add E2E CI job** that starts the API server and runs tests against real HTTP endpoints.

---

## Appendix A: File Counts Summary

| Category | Files | Test Cases | Genuine | Hollow | Partial |
|----------|-------|-----------|---------|--------|---------|
| API Integration (core) | 19 | ~200 | 19 | 0 | 0 |
| API Integration (routes) | 16 | ~450 | 16 | 0 | 0 |
| API E2E | 5 | ~67 | 4 | 1 | 0 |
| API Security | 8 | ~136 | 8 | 0 | 0 |
| API Performance | 5 | ~53 | 5 | 0 | 0 |
| API Chaos | 3 | ~36 | 3 | 0 | 0 |
| API Unit (plugins) | 10 | ~320 | 10 | 0 | 0 |
| API Unit (services) | 14 | ~462 | 0 | 0 | 14 |
| API Unit (repos) | 3 | ~184 | 3 | 0 | 0 |
| API Unit (jobs) | 7 | ~227 | 7 | 0 | 0 |
| API Unit (other) | 3 | ~51 | 3 | 0 | 0 |
| Shared Package | 12 | ~851 | 12 | 0 | 0 |
| Frontend | 28 | ~610 | 28 | 0 | 0 |
| **TOTAL** | **113** | **~2,847** | **98** | **1** | **14** |

## Appendix B: Comparison with Wave 1 Audit

| Metric | Wave 1 (2026-03-12) | Wave 2 (2026-03-13) | Change |
|--------|---------------------|---------------------|--------|
| Total test files | 102 | 113 | +11 |
| Genuine test files | ~32 | ~98 | +66 |
| Hollow test files | ~50+ | 1 | -49 |
| Partial test files | ~20 | 14 | -6 |
| Previous score | 3/10 | 42/100 | Significant improvement |
| Route test coverage | 0 modules | 15+ modules | Major improvement |
| Security tests quality | 4 genuine | 8 genuine | Doubled |
| Shared package tests | 8 files | 12 files | +4 |

The codebase has undergone a substantial testing quality improvement between the two audits. The majority of previously hollow route tests, E2E tests, chaos tests, and performance tests have been rewritten to use real infrastructure. The remaining issues (1 hollow E2E file, 14 partial service tests, missing HTTP-level integration) are well-defined and fixable.

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with all scores
- [Technical Debt Report](technical-debt-report.md) — Testing debt in the structural debt assessment
- [Security Audit](security-audit.md) — Security test coverage findings
- [Implementation Status](../project-analysis/implementation_status.md) — Feature completion and test gaps
- [Sprint Plan Phase 2](../project-management/sprint-plan-phase2.md) — Testing infrastructure sprint work
- [Enterprise Engineering Checklist](../checklists/enterprise-engineering-checklist.md) — Testing checklist items
