# Test Coverage Matrix

Last updated: 2026-03-28

This document maps which modules have test coverage and what types of tests exist. It serves as a quick reference for identifying coverage gaps.

---

## Summary

| Category | Test Files | Location |
|----------|-----------|----------|
| Integration (general) | 30 | `packages/api/src/test/integration/` |
| Integration (routes) | 58 | `packages/api/src/test/integration/routes/` |
| Integration (multi-tenant) | 1 | `packages/api/src/test/integration/multi-tenant/` |
| Integration (workflows) | 1 | `packages/api/src/test/integration/workflows/` |
| Unit (services) | 18 | `packages/api/src/test/unit/services/` |
| Unit (plugins) | 11 | `packages/api/src/test/unit/plugins/` |
| Unit (repositories) | 3 | `packages/api/src/test/unit/repositories/` |
| Unit (jobs) | 7 | `packages/api/src/test/unit/jobs/` |
| Unit (lib) | 6 | `packages/api/src/test/unit/lib/` |
| E2E | 7 | `packages/api/src/test/e2e/` |
| Contract | 3 | `packages/api/src/test/contract/` |
| Security | 8 | `packages/api/src/test/security/` |
| Performance | 5 | `packages/api/src/test/performance/` |
| Chaos | 3 | `packages/api/src/test/chaos/` |
| Auth (top-level) | 1 | `packages/api/src/test/` |
| Frontend (components) | 6 | `packages/web/app/__tests__/components/` |
| Frontend (hooks) | 7 | `packages/web/app/__tests__/hooks/` |
| Frontend (routes) | 7 | `packages/web/app/__tests__/routes/` |
| Frontend (lib) | 5 | `packages/web/app/lib/__tests__/` |
| Frontend (other) | 6 | `packages/web/app/` (various) |
| **Total** | **162** | |

---

## Module Coverage Matrix -- Backend Route Tests

This matrix shows which backend modules have dedicated route-level integration tests (`integration/routes/`).

| Module | Route Test | Unit Test (Service) | Unit Test (Repo) |
|--------|-----------|--------------------|--------------------|
| **Core HR** | | | |
| HR (employees, org-units, positions) | `hr.routes.test.ts`, `hr.routes.enhanced.test.ts`, `hr-modules.routes.test.ts` | `hr.service.test.ts`, `hr.service.enhanced.test.ts` | `hr.repository.test.ts` |
| Employee positions | `hr-employee-positions.test.ts` | -- | -- |
| Rehire | `hr.rehire.test.ts` | -- | -- |
| **Time & Attendance** | | | |
| Time events/schedules | `time.routes.test.ts` | `time.service.test.ts`, `time.service.enhanced.test.ts` | `time.repository.test.ts` |
| **Absence Management** | | | |
| Leave types/requests/balances | `absence.routes.test.ts` | `absence.service.test.ts`, `absence.service.enhanced.test.ts`, `absence.statutory-minimum.test.ts` | `absence.repository.test.ts` |
| Leave payroll integration | `leave-payroll.routes.test.ts` | -- | -- |
| Parental leave | `parental-leave.routes.test.ts` | -- | -- |
| Family leave | `family-leave.routes.test.ts` | -- | -- |
| Carers leave | `carers-leave.routes.test.ts` | -- | -- |
| Bereavement leave | `bereavement.routes.test.ts` | -- | -- |
| Flexible working | `flexible-working.routes.test.ts` | -- | -- |
| **Talent Management** | | | |
| Performance reviews/goals | `talent.routes.test.ts` | `talent.service.test.ts` | -- |
| Competencies | `competencies.routes.test.ts` | -- | -- |
| Succession planning | `succession.routes.test.ts` | -- | -- |
| Feedback 360 | `feedback-360.routes.test.ts` | -- | -- |
| Assessments | `assessments.routes.test.ts` | -- | -- |
| CPD | `cpd.routes.test.ts` | -- | -- |
| Headcount planning | `headcount-planning.routes.test.ts` | -- | -- |
| **LMS** | | | |
| Courses/enrollments | `lms.routes.test.ts` | `lms.service.test.ts` | -- |
| LMS compliance | `lms-compliance.test.ts` | -- | -- |
| **Cases** | | | |
| Case management | `cases.routes.test.ts` | `cases.service.test.ts` | -- |
| **Onboarding** | | | |
| Onboarding templates/checklists | `onboarding.routes.test.ts` | `onboarding.service.test.ts` | -- |
| **Benefits** | | | |
| Benefits enrollment | `benefits.routes.test.ts` | `benefits.service.test.ts` | -- |
| **Documents** | | | |
| Document management | `documents.routes.test.ts` | `documents.service.test.ts` | -- |
| Letter templates | `letter-templates.routes.test.ts` | -- | -- |
| **Recruitment** | | | |
| Jobs/candidates | `recruitment.routes.test.ts` | `recruitment.service.test.ts` | -- |
| Recruitment analytics | `recruitment-analytics.routes.test.ts` | -- | -- |
| Reference checks | `reference-checks.routes.test.ts` | -- | -- |
| Agencies | `agencies.routes.test.ts` | -- | -- |
| **Analytics** | | | |
| Analytics dashboards | `analytics.routes.test.ts` | `analytics.service.test.ts` | -- |
| Compensation analytics | `compensation-analytics.routes.test.ts` | -- | -- |
| **Payroll** | | | |
| Payroll processing | `payroll.routes.test.ts` | `payroll.service.test.ts` | -- |
| Pay assignments | `pay-assignment.routes.test.ts` | -- | -- |
| Payroll journal entries | `payroll-journal-entries.routes.test.ts` | -- | -- |
| Payroll submissions | `payroll-submissions.routes.test.ts` | -- | -- |
| Deductions | `deductions.routes.test.ts` | -- | -- |
| **UK Compliance** | | | |
| UK compliance | `uk-compliance.routes.test.ts` | -- | -- |
| Tax codes | `tax-codes.routes.test.ts` | -- | -- |
| NI categories | `ni-categories.routes.test.ts` | -- | -- |
| NMW rates | `nmw.routes.test.ts` | -- | -- |
| Pension auto-enrolment | `pension.routes.test.ts` | -- | -- |
| DBS checks | `dbs-checks.routes.test.ts` | -- | -- |
| P45/P60 | `p45-p60.test.ts` (integration) | -- | -- |
| **GDPR** | | | |
| GDPR (general) | `gdpr.routes.test.ts` | -- | -- |
| Consent | `consent.routes.test.ts` | -- | -- |
| Privacy notices | `privacy.routes.test.ts` | -- | -- |
| Data breach | `data-breach.routes.test.ts` | -- | -- |
| Data erasure | `data-erasure.routes.test.ts` | -- | -- |
| Data retention | `data-retention.routes.test.ts` | -- | -- |
| **Security & Admin** | | | |
| Security settings | `security.routes.test.ts` | -- | -- |
| Compliance | `compliance.routes.test.ts` | -- | -- |
| Delegations | `delegations.routes.test.ts` | -- | -- |
| Portal | `portal.routes.test.ts` | -- | -- |
| Notifications | `notifications.routes.test.ts` | `notifications.service.test.ts` | -- |
| **Employee Data** | | | |
| Bank details | `bank-details.routes.test.ts` | -- | -- |
| Emergency contacts | `emergency-contacts.routes.test.ts` | -- | -- |
| Employee photos | `employee-photos.routes.test.ts` | -- | -- |
| Equipment | `equipment.routes.test.ts` | -- | -- |
| Employee addresses | `employee-addresses.test.ts` (integration) | -- | -- |
| **Operations** | | | |
| Geofence | `geofence.routes.test.ts` | -- | -- |
| Probation | `probation.routes.test.ts` | -- | -- |
| Secondments | `secondments.routes.test.ts` | -- | -- |
| Diversity | `diversity.routes.test.ts` | -- | -- |
| Health & safety | `health-safety.routes.test.ts` | -- | -- |
| Bulk operations | `bulk-operations.routes.test.ts` | -- | -- |
| **Specialist** | | | |
| Specialist operations | `specialist-ops.routes.test.ts` | -- | -- |
| Specialist talent | `specialist-talent.routes.test.ts` | -- | -- |

---

## Cross-Cutting Concern Coverage

| Concern | Dedicated Test(s) | Covered In |
|---------|-------------------|------------|
| Row-Level Security (RLS) | `rls.test.ts`, `rls-comprehensive.test.ts`, `rls-coverage.test.ts` | Most route tests |
| Effective dating | `effective-dating.test.ts`, `effective-dating-enhanced.test.ts`, `concurrent-overlap.test.ts` | HR route tests |
| Idempotency | `idempotency.test.ts`, `idempotency-replay.test.ts` | Route tests (automatic via TestApiClient) |
| Outbox pattern | `outbox.test.ts` | Route tests with write operations |
| State machines | `state-machine.test.ts` | Employee lifecycle, leave request, case management E2E tests |
| Multi-tenant isolation | `multi-tenant/cross-tenant-attacks.test.ts`, `e2e/multi-tenant-isolation.test.ts` | RLS tests |
| Transaction rollback | `transaction-rollback.test.ts` | -- |
| Rate limiting | `rate-limit.test.ts` (integration), `rate-limiting.test.ts` (security) | -- |
| RBAC routes | `rbac-routes.test.ts` | Route tests |
| Session lifecycle | `session-lifecycle.test.ts` | Auth E2E |
| Database connection | `database-connection.test.ts` | -- |
| Tenant resolution | `tenant-resolution-fallback.test.ts`, `tenant-context-500-fix.test.ts`, `tenant-security.endpoints.test.ts` | -- |
| Migration validation | `migration-validation.test.ts` | -- |
| Worker integration | `worker-integration.test.ts`, `worker-redis-streams.test.ts` | -- |
| Bootstrap | `bootstrap-root.test.ts` | -- |

---

## Plugin Unit Test Coverage

| Plugin | Test File |
|--------|-----------|
| Audit | `audit.plugin.test.ts` |
| Audit read access | `audit-read-access.plugin.test.ts` |
| Auth (Better Auth) | `auth-better.plugin.test.ts` |
| Cache | `cache.plugin.test.ts` |
| Database | `db.plugin.test.ts` |
| Errors | `errors.plugin.test.ts` |
| Idempotency | `idempotency.plugin.test.ts` |
| Rate limit | `rate-limit.plugin.test.ts` |
| RBAC | `rbac.plugin.test.ts` |
| Security headers | `security-headers.plugin.test.ts` |
| Tenant | `tenant.plugin.test.ts` |

---

## Background Job Unit Test Coverage

| Job | Test File |
|-----|-----------|
| Analytics worker | `analytics-worker.test.ts` |
| Base job | `base.test.ts` |
| Domain event handlers | `domain-event-handlers.test.ts` |
| Export worker | `export-worker.test.ts` |
| Notification worker | `notification-worker.test.ts` |
| Outbox processor | `outbox-processor.test.ts` |
| PDF worker | `pdf-worker.test.ts` |

---

## Library Unit Test Coverage

| Library | Test File |
|---------|-----------|
| Distributed lock | `distributed-lock.test.ts` |
| Pagination | `pagination.test.ts` |
| UK final pay | `uk-final-pay.test.ts` |
| UK holiday pay | `uk-holiday-pay.test.ts` |
| UK leave carryover | `uk-leave-carryover.test.ts` |
| Virus scan | `virus-scan.test.ts` |

---

## Frontend Test Coverage

### Component Tests

| Category | Test File | What is Tested |
|----------|-----------|----------------|
| Auth | `AuthGuard.test.tsx` | Authentication guard component |
| UI | `Alert.test.tsx` | Alert component |
| UI | `Badge.test.tsx` | Badge component |
| UI | `Button.test.tsx` | Button component |
| UI | `Input.test.tsx` | Input component |
| UI | `Modal.test.tsx` | Modal component |
| Charts | `chart-components.test.ts` | Chart components |

### Hook Tests

| Hook | Test File | What is Tested |
|------|-----------|----------------|
| `usePermissions` | `use-permissions.test.ts` | Permission checking logic |
| `useEnhancedPermissions` | `use-enhanced-permissions.test.ts` | Enhanced permission evaluation |
| `useFieldPermissions` | `use-field-permissions.test.ts` | Field-level permissions |
| `useTenant` | `use-tenant.test.ts` | Tenant context management |
| `useManager` | `use-manager.test.ts` | Manager hierarchy hook |
| `usePortal` | `use-portal.test.ts` | Portal access hook |
| `useFocusTrap` | `use-focus-trap.test.ts` | Focus trap accessibility |

### Route Tests

| Route | Test File | What is Tested |
|-------|-----------|----------------|
| Dashboard | `dashboard.test.tsx` | Dashboard page rendering |
| Employee list | `hr/employees/__tests__/route.test.tsx` | Employee list page |
| Employee detail | `hr/employees/[employeeId]/__tests__/route.test.tsx` | Employee detail page |
| Reports (builder) | `reports/builder-wiring.test.ts` | Report builder wiring |
| Reports (components) | `reports/components.test.ts` | Report components |
| Reports (hooks) | `reports/hooks.test.ts` | Report data hooks |
| Reports (query keys) | `reports/query-keys.test.ts` | Query key generation |
| Reports (types) | `reports/types.test.ts` | Report type definitions |

### Library Tests

| Library | Test File | What is Tested |
|---------|-----------|----------------|
| API client | `api-client.test.ts` | HTTP client configuration |
| Auth client | `auth-client.test.ts` | Better Auth client setup |
| Query client | `query-client.test.ts` | React Query client config |
| Theme | `theme.test.ts` | Theme utilities |
| Utils | `utils.test.ts` | General utility functions |
| Hydration | `hydration.test.ts` | SSR hydration logic |

### Other Frontend Tests

| Test File | What is Tested |
|-----------|----------------|
| `entry.client.test.tsx` | Client-side entry point |
| `root.structure.test.tsx` | Root layout structure |
| `under-construction.guard.test.ts` | Under-construction guard |

---

## E2E Test Coverage

| Flow | Test File | What is Covered |
|------|-----------|-----------------|
| Authentication | `auth-flow.test.ts` | Sign-up, sign-in, session management, MFA |
| Employee lifecycle | `employee-lifecycle.test.ts` | Create, update, terminate, full lifecycle |
| Leave requests | `leave-request-flow.test.ts` | Submit, approve, reject, cancel |
| Case management | `case-management-flow.test.ts` | Open, assign, resolve, close |
| Onboarding | `onboarding-flow.test.ts` | Template creation, checklist execution |
| Multi-tenant isolation | `multi-tenant-isolation.test.ts` | Cross-tenant data isolation |
| CI smoke | `ci-smoke.test.ts` | Health check, basic endpoints |

---

## Security Test Coverage

| Attack Vector | Test File |
|---------------|-----------|
| Authentication bypass | `authentication.test.ts` |
| Authorization bypass | `authorization-bypass.test.ts` |
| CSRF attacks | `csrf-protection.test.ts` |
| General injection | `injection-attacks.test.ts` |
| SQL injection | `sql-injection.test.ts` |
| XSS attacks | `xss-prevention.test.ts` |
| Input validation | `input-validation.test.ts` |
| Rate limit bypass | `rate-limiting.test.ts` |

---

## CI Workflow Test Execution

| Workflow | Tests Run | Trigger |
|----------|-----------|---------|
| `test.yml` | Unit + integration + shared + frontend (with coverage) | Push to main, PR to main |
| `e2e.yml` | E2E tests against live API server | Push to main, PR to main |
| `deploy.yml` | Full test suite (gate for deployment) | Push to main, manual dispatch |
| `chaos-tests.yml` | Chaos engineering suite | Weekly (Sunday 02:00 UTC), manual dispatch |
| `security.yml` | Dependency audit, Docker image scan, secret detection | Push to main, PR to main, weekly |
| `pr-check.yml` | Typecheck + lint only (fast feedback, no DB required) | PR to main |
| `migration-check.yml` | Migration naming + RLS compliance validation | PR to main (migrations/ path only) |
