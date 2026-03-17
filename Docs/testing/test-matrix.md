# Test Coverage Matrix

> Comprehensive module-by-module test coverage status for the Staffora HRIS platform.
> Use this matrix to identify coverage gaps and prioritize new test development.
> **Last updated:** 2026-03-17

**Related documentation:**

- [Testing Guide](README.md) -- Infrastructure, helpers, and how to write tests
- [Worker System](../architecture/worker-system.md) -- Background job architecture
- [Database Guide](../architecture/database-guide.md) -- RLS, transactions, and query patterns
- [Security Patterns](../patterns/SECURITY.md) -- Security patterns being tested
- [API Reference](../api/API_REFERENCE.md) -- Endpoint contracts

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Y | Test file exists with meaningful assertions |
| P | Test file exists but covers only a subset of functionality |
| - | No test file exists for this module/type combination |
| n/a | Not applicable for this test type |

---

## Module vs Test Type Matrix

### Core Modules

| Module | Unit (Svc) | Unit (Repo) | Route | E2E | Security | Perf | Chaos |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **HR** (employees, org, positions) | Y | Y | Y | Y | Y | Y | Y |
| **Absence** (leave types, requests) | Y | Y | Y | Y | - | - | - |
| **Time** (events, timesheets) | Y | Y | Y | - | - | - | - |
| **Talent** (performance, goals) | Y | - | Y | - | - | - | - |
| **LMS** (courses, enrollments) | Y | - | Y | - | - | - | - |
| **Cases** (case mgmt, SLA) | Y | - | Y | Y | - | - | - |
| **Onboarding** (templates, checklists) | Y | - | Y | Y | - | - | - |
| **Benefits** (plans, enrollments) | Y | - | Y | - | - | - | - |
| **Documents** (uploads, templates) | Y | - | Y | - | - | - | - |
| **Succession** (plans, pools) | - | - | Y | - | - | - | - |
| **Analytics** (dashboards, reports) | Y | - | Y | - | - | - | - |
| **Competencies** (frameworks) | - | - | Y | - | - | - | - |
| **Recruitment** (jobs, candidates) | Y | - | Y | - | - | - | - |

### UK Compliance Modules

| Module | Unit (Svc) | Route | RLS | Security |
|--------|:---:|:---:|:---:|:---:|
| **Right-to-Work** | - | Y (uk-compliance) | P | - |
| **SSP** (Statutory Sick Pay) | - | Y (uk-compliance) | P | - |
| **Statutory Leave** | - | Y (uk-compliance) | P | - |
| **Pension** (auto-enrolment) | - | Y (uk-compliance) | P | - |
| **Warnings** (disciplinary) | - | Y (uk-compliance) | P | - |
| **NMW** (National Minimum Wage) | - | Y (uk-compliance) | P | - |
| **WTR** (Working Time Regs) | - | Y (uk-compliance) | P | - |
| **Probation** | - | - | - | - |
| **Family Leave** | - | - | - | - |
| **Parental Leave** | - | - | - | - |
| **Bereavement** | - | - | - | - |
| **Carers Leave** | - | - | - | - |
| **Flexible Working** | - | - | - | - |
| **Gender Pay Gap** | - | - | - | - |
| **Health & Safety** | - | - | - | - |
| **DBS Checks** | - | - | - | - |
| **Return to Work** | - | - | - | - |
| **Contract Amendments** | - | - | - | - |
| **Contract Statements** | - | - | - | - |
| **Reasonable Adjustments** | - | - | - | - |
| **Reference Checks** | - | - | - | - |
| **Secondments** | - | - | - | - |

### GDPR Modules

| Module | Unit (Svc) | Route | RLS | Security |
|--------|:---:|:---:|:---:|:---:|
| **DSAR** | - | Y (gdpr) | P | - |
| **Data Erasure** | - | Y (gdpr) | P | - |
| **Data Breach** | - | Y (gdpr) | P | - |
| **Consent** | - | Y (gdpr) | P | - |
| **Privacy Notices** | - | Y (privacy) | P | - |
| **Data Retention** | - | Y (gdpr) | P | - |

### Payroll Modules

| Module | Unit (Svc) | Route | RLS | Security |
|--------|:---:|:---:|:---:|:---:|
| **Payroll** | Y | Y | P | - |
| **Payroll Config** | - | Y (payroll) | P | - |
| **Payslips** | - | Y (payroll) | P | - |
| **Deductions** | - | Y (payroll) | P | - |
| **Tax Codes** | - | Y (payroll) | P | - |
| **Bank Details** | - | - | - | - |

### Supporting Modules

| Module | Unit (Svc) | Route | RLS | Security |
|--------|:---:|:---:|:---:|:---:|
| **Auth** | Y | n/a (BetterAuth) | n/a | Y |
| **Portal** | - | Y | P | - |
| **Client Portal** | - | - | - | - |
| **Security** (field perms) | - | Y | P | Y |
| **Workflows** | Y | - | P | - |
| **Notifications** | Y | - | P | - |
| **Reports** | - | - | - | - |
| **Dashboard** | Y | - | P | - |
| **Tenant** | - | Y (tenant-security) | Y | Y |
| **System** | - | - | - | - |

### Specialist Modules (all untested)

| Module | Unit (Svc) | Route | RLS | Security |
|--------|:---:|:---:|:---:|:---:|
| Agencies | - | - | - | - |
| Assessments | - | - | - | - |
| Bank Holidays | - | - | - | - |
| Course Ratings | - | - | - | - |
| CPD | - | - | - | - |
| Delegations | - | - | - | - |
| Diversity | - | - | - | - |
| Emergency Contacts | - | - | - | - |
| Employee Photos | - | - | - | - |
| Equipment | - | - | - | - |
| Geofence | - | - | - | - |
| Headcount Planning | - | - | - | - |
| Letter Templates | - | - | - | - |
| Training Budgets | - | - | - | - |

---

## Test File Inventory

Total test files: ~110 | Total lines: ~63,000

### Unit Tests -- Services (19 files)

| File | Lines |
|------|------:|
| `time.service.enhanced.test.ts` | 1,328 |
| `hr.service.enhanced.test.ts` | 1,217 |
| `absence.service.enhanced.test.ts` | 942 |
| `cases.service.test.ts` | 642 |
| `analytics.service.test.ts` | 622 |
| `workflows.service.test.ts` | 481 |
| `hr.service.test.ts` | 466 |
| `lms.service.test.ts` | 443 |
| `talent.service.test.ts` | 435 |
| `documents.service.test.ts` | 424 |
| `dashboard.service.test.ts` | 419 |
| `absence.statutory-minimum.test.ts` | 410 |
| `benefits.service.test.ts` | 397 |
| `onboarding.service.test.ts` | 384 |
| `notifications.service.test.ts` | 318 |
| `payroll.service.test.ts` | 313 |
| `recruitment.service.test.ts` | 309 |
| `absence.service.test.ts` | 210 |
| `time.service.test.ts` | 140 |

### Unit Tests -- Repositories (3 files)

| File | Lines |
|------|------:|
| `time.repository.test.ts` | 1,484 |
| `hr.repository.test.ts` | 1,353 |
| `absence.repository.test.ts` | 1,172 |

### Unit Tests -- Plugins (11 files)

| File | Lines |
|------|------:|
| `auth-better.plugin.test.ts` | 791 |
| `tenant.plugin.test.ts` | 488 |
| `errors.plugin.test.ts` | 420 |
| `db.plugin.test.ts` | 357 |
| `security-headers.plugin.test.ts` | 329 |
| `audit-read-access.plugin.test.ts` | 305 |
| `rbac.plugin.test.ts` | 188 |
| `audit.plugin.test.ts` | 157 |
| `cache.plugin.test.ts` | 108 |
| `idempotency.plugin.test.ts` | 107 |
| `rate-limit.plugin.test.ts` | 43 |

### Unit Tests -- Jobs (7 files)

| File | Lines |
|------|------:|
| `base.test.ts` | 633 |
| `analytics-worker.test.ts` | 511 |
| `domain-event-handlers.test.ts` | 473 |
| `pdf-worker.test.ts` | 446 |
| `export-worker.test.ts` | 412 |
| `notification-worker.test.ts` | 98 |
| `outbox-processor.test.ts` | 92 |

### Unit Tests -- Lib (2 files)

| File | Lines |
|------|------:|
| `pagination.test.ts` | 334 |
| `distributed-lock.test.ts` | 294 |

### Integration Tests -- Core (19+ files)

| File | Lines |
|------|------:|
| `constraint-validation.test.ts` | 816 |
| `tenant-resolution-fallback.test.ts` | 704 |
| `effective-dating-enhanced.test.ts` | 601 |
| `rls-comprehensive.test.ts` | 531 |
| `migration-validation.test.ts` | 505 |
| `idempotency.test.ts` | 470 |
| `tenant-context-500-fix.test.ts` | 424 |
| `test-api-client.test.ts` | 414 |
| `outbox.test.ts` | 403 |
| `rls.test.ts` | 400 |
| `state-machine.test.ts` | 379 |
| `effective-dating.test.ts` | 321 |
| `idempotency-replay.test.ts` | 293 |
| `rate-limiting.test.ts` | 259 |
| `tenant-security.endpoints.test.ts` | 249 |
| `database-connection.test.ts` | 210 |
| `transaction-rollback.test.ts` | 283 |
| `bootstrap-root.test.ts` | 121 |
| `rls-coverage.test.ts` | 115 |
| `cross-tenant-attacks.test.ts` (multi-tenant/) | 116 |
| `leave-approval-flow.test.ts` (workflows/) | 107 |

### Integration Tests -- Routes (25 files)

| File | Lines |
|------|------:|
| `payroll.routes.test.ts` | 2,914 |
| `gdpr.routes.test.ts` | 2,664 |
| `uk-compliance.routes.test.ts` | 2,373 |
| `specialist-ops.routes.test.ts` | 1,641 |
| `specialist-talent.routes.test.ts` | 1,394 |
| `leave-payroll.routes.test.ts` | 1,312 |
| `hr-modules.routes.test.ts` | 1,189 |
| `time.routes.test.ts` | 1,186 |
| `privacy.routes.test.ts` | 1,130 |
| `hr.routes.enhanced.test.ts` | 1,128 |
| `absence.routes.test.ts` | 923 |
| `compliance.routes.test.ts` | 892 |
| `hr.routes.test.ts` | 798 |
| `succession.routes.test.ts` | 560 |
| `recruitment.routes.test.ts` | 490 |
| `documents.routes.test.ts` | 484 |
| `lms.routes.test.ts` | 469 |
| `onboarding.routes.test.ts` | 464 |
| `competencies.routes.test.ts` | 431 |
| `benefits.routes.test.ts` | 432 |
| `security.routes.test.ts` | 412 |
| `talent.routes.test.ts` | 386 |
| `analytics.routes.test.ts` | 383 |
| `portal.routes.test.ts` | 383 |
| `cases.routes.test.ts` | 267 |

### E2E Tests (6 files)

| File | Lines |
|------|------:|
| `auth-flow.test.ts` | 1,039 |
| `multi-tenant-isolation.test.ts` | 611 |
| `onboarding-flow.test.ts` | 629 |
| `case-management-flow.test.ts` | 562 |
| `leave-request-flow.test.ts` | 555 |
| `employee-lifecycle.test.ts` | 167 |

### Security Tests (8 files)

| File | Lines |
|------|------:|
| `input-validation.test.ts` | 632 |
| `authorization-bypass.test.ts` | 507 |
| `rate-limiting.test.ts` | 350 |
| `xss-prevention.test.ts` | 317 |
| `csrf-protection.test.ts` | 290 |
| `sql-injection.test.ts` | 290 |
| `injection-attacks.test.ts` | 143 |
| `authentication.test.ts` | 120 |

### Performance Tests (5 files)

| File | Lines |
|------|------:|
| `query-performance.enhanced.test.ts` | 497 |
| `concurrent-access.test.ts` | 489 |
| `cache-performance.test.ts` | 412 |
| `large-dataset.test.ts` | 356 |
| `query-performance.test.ts` | 130 |

### Chaos Tests (3 files)

| File | Lines |
|------|------:|
| `data-integrity.test.ts` | 666 |
| `connection-failures.test.ts` | 519 |
| `database-failures.test.ts` | 134 |

---

## Cross-Cutting Concern Tests

These tests verify platform-wide behaviors independent of any single module:

| Concern | Test File(s) | Status |
|---------|-------------|--------|
| RLS tenant isolation | `rls.test.ts`, `rls-comprehensive.test.ts`, `rls-coverage.test.ts` | Covered |
| Idempotency | `idempotency.test.ts`, `idempotency-replay.test.ts` | Covered |
| Outbox pattern | `outbox.test.ts` | Covered |
| Effective dating | `effective-dating.test.ts`, `effective-dating-enhanced.test.ts` | Covered |
| State machines | `state-machine.test.ts` | Covered |
| Rate limiting | `rate-limiting.test.ts` (integration + security) | Covered |
| Database connections | `database-connection.test.ts` | Covered |
| Transaction rollback | `transaction-rollback.test.ts` | Covered |
| Migration integrity | `migration-validation.test.ts` | Covered |
| Constraint validation | `constraint-validation.test.ts` | Covered |
| Bootstrap | `bootstrap-root.test.ts` | Covered |
| Tenant resolution | `tenant-resolution-fallback.test.ts`, `tenant-context-500-fix.test.ts` | Covered |
| Cross-tenant attacks | `cross-tenant-attacks.test.ts` | Covered |
| Multi-tenant isolation (E2E) | `multi-tenant-isolation.test.ts` | Covered |

---

## Plugin Unit Tests

| Plugin | Test File | Status |
|--------|-----------|--------|
| `db` | `db.plugin.test.ts` | Covered |
| `cache` | `cache.plugin.test.ts` | Covered |
| `errors` | `errors.plugin.test.ts` | Covered |
| `rbac` | `rbac.plugin.test.ts` | Covered |
| `rate-limit` | `rate-limit.plugin.test.ts` | Covered |
| `idempotency` | `idempotency.plugin.test.ts` | Covered |
| `tenant` | `tenant.plugin.test.ts` | Covered |
| `auth-better` | `auth-better.plugin.test.ts` | Covered |
| `security-headers` | `security-headers.plugin.test.ts` | Covered |
| `audit` | `audit.plugin.test.ts`, `audit-read-access.plugin.test.ts` | Covered |

## Background Job Unit Tests

| Job | Test File | Status |
|-----|-----------|--------|
| Base worker infrastructure | `base.test.ts` | Covered |
| Outbox processor | `outbox-processor.test.ts` | Covered |
| Notification worker | `notification-worker.test.ts` | Covered |
| Export worker | `export-worker.test.ts` | Covered |
| Analytics worker | `analytics-worker.test.ts` | Covered |
| PDF worker | `pdf-worker.test.ts` | Covered |
| Domain event handlers | `domain-event-handlers.test.ts` | Covered |
| Scheduler | -- | Missing |

---

## Coverage Gaps

### Modules With Zero Tests (72 modules total, ~40 untested)

The following modules in `packages/api/src/modules/` have no test files at all:

- **Financial:** bank-details
- **UK Compliance:** probation, family-leave, parental-leave, bereavement, carers-leave, flexible-working, gender-pay-gap, health-safety, dbs-checks, return-to-work, contract-amendments, contract-statements, reasonable-adjustments, reference-checks, secondments
- **GDPR:** (route tests exist but no unit service tests for any GDPR module)
- **Specialist:** agencies, assessments, bank-holidays, course-ratings, cpd, delegations, diversity, emergency-contacts, employee-photos, equipment, geofence, headcount-planning, letter-templates, training-budgets
- **Supporting:** client-portal, reports, system, jobs (module)

---

## Priority Matrix

### Tier 1 -- Critical (Security and Compliance Risk)

These gaps pose the highest risk and should be addressed first:

| Gap | Risk | Effort | Recommendation |
|-----|------|--------|---------------|
| **Bank details** -- zero tests | Financial data exposure, PCI implications | Medium | Add RLS + unit + security tests |
| **GDPR modules** -- no unit tests | ICO enforcement, data breach risk | High | Add unit tests for dsar, data-erasure, data-breach, consent |
| **Emergency contacts** -- zero tests | Personal data exposure under GDPR | Low | Add RLS + basic CRUD route tests |
| **Client portal** -- no security tests | External-facing attack surface | Medium | Add auth, authz bypass, and input validation tests |
| **Payroll** -- no security tests | Financial data manipulation | Medium | Add injection + authorization tests |

### Tier 2 -- High (Business Logic Correctness)

| Gap | Risk | Effort | Recommendation |
|-----|------|--------|---------------|
| **Succession** -- no unit tests | Incorrect succession planning logic | Medium | Add service tests |
| **Competencies** -- no unit tests | Assessment scoring errors | Medium | Add service tests |
| **Time module** -- no E2E test | Clock in/out flow regression | Medium | Add E2E timesheet submission flow |
| **Cases** -- only 267-line route test | Thin coverage for case lifecycle | Low | Expand route test assertions |
| **Workflows** -- no route tests | Approval flow API errors undetected | Medium | Add route integration tests |
| **Scheduler** -- no unit test | Missed cron jobs undetected | Low | Add unit test for job scheduling logic |

### Tier 3 -- Medium (Feature Completeness)

| Gap | Risk | Effort | Recommendation |
|-----|------|--------|---------------|
| UK Compliance unit tests (7 modules) | Compliance calculation errors | High | Add statutory calculation tests |
| Specialist modules (14 modules) | Feature-level bugs | High | Add route tests as modules mature |
| Reports module -- zero tests | Incorrect report output | Medium | Add when report engine is finalized |
| System module -- zero tests | Admin configuration errors | Low | Add when admin features ship |

### Tier 4 -- Low (Nice to Have)

| Gap | Risk | Effort | Recommendation |
|-----|------|--------|---------------|
| Expand performance tests to more modules | Undetected query regressions | Medium | Add query performance benchmarks for absence, talent |
| Expand chaos tests | Undetected failure modes | Medium | Add Redis failure scenarios |
| Add repository tests for talent, lms, cases | Subtle query bugs | High | Add as modules stabilize |

---

## Test Count Summary

| Category | Files | Lines | Est. Test Cases |
|----------|------:|------:|---------:|
| Unit -- services | 19 | 9,900 | ~200 |
| Unit -- plugins | 11 | 3,293 | ~120 |
| Unit -- jobs | 7 | 2,665 | ~80 |
| Unit -- repositories | 3 | 4,009 | ~30 |
| Unit -- lib | 2 | 628 | ~20 |
| Unit -- other | 1 | 165 | ~10 |
| Integration -- core | 20 | 7,574 | ~180 |
| Integration -- routes | 25 | 23,733 | ~300 |
| Integration -- multi-tenant | 1 | 116 | ~15 |
| Integration -- workflows | 1 | 107 | ~10 |
| E2E | 6 | 3,563 | ~40 |
| Security | 8 | 2,649 | ~80 |
| Performance | 5 | 1,884 | ~30 |
| Chaos | 3 | 1,319 | ~20 |
| **Total** | **~112** | **~63,000** | **~1,135** |

---

## Recommendations

1. **Prioritize bank-details and GDPR module testing** -- these handle sensitive data with regulatory requirements under UK GDPR.

2. **Add security tests for all external-facing modules** -- especially payroll, portal, and recruitment (candidate-facing).

3. **Expand RLS integration tests** -- the `rls-coverage.test.ts` file (115 lines) should be extended to explicitly test every tenant-owned table, not just representative samples.

4. **Add E2E tests for time module** -- the clock-in/clock-out/timesheet flow is a high-frequency operation that currently lacks end-to-end coverage.

5. **Establish a test requirement policy** -- every new module should ship with at minimum: unit service tests, route integration tests, and RLS isolation tests.

6. **Add scheduler unit tests** -- the scheduler is the only background job component without test coverage. Its cron logic and job dispatch should be tested.

7. **Achieve full job test coverage** -- the export-worker.test.ts now exists (412 lines), but the scheduler remains untested.
