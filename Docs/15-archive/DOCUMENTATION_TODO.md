# Documentation TODO

> Gaps identified during documentation audit (2026-03-16)

## Summary

- **Total backend modules**: 120 (105 registered + 15 internal/upcoming in `packages/api/src/modules/`)
- **Documented in API_REFERENCE.md**: 105 (all registered modules)
- **Undocumented modules**: 0 (resolved 2026-03-28)

---

## Missing Module Documentation

The following 52 backend modules have **no entries** in `Docs/api/API_REFERENCE.md`.

### UK Compliance Modules

These modules implement UK-specific employment law and statutory requirements:

- [ ] `bereavement` — Bereavement leave (Parental Bereavement Leave Act 2018)
- [ ] `carers-leave` — Carer's leave entitlements (Carer's Leave Act 2023)
- [ ] `contract-amendments` — Employment contract change tracking
- [ ] `contract-statements` — Written statement of employment particulars (s.1 ERA 1996)
- [ ] `dbs-checks` — Disclosure and Barring Service check tracking
- [ ] `family-leave` — Maternity, paternity, shared parental leave
- [ ] `flexible-working` — Flexible working requests (Employment Relations Act 2023)
- [ ] `gender-pay-gap` — Gender pay gap reporting (Equality Act 2010 regulations)
- [ ] `health-safety` — Health & safety incident reporting and risk assessments
- [ ] `nmw` — National Minimum Wage / National Living Wage compliance
- [ ] `parental-leave` — Parental leave entitlements
- [ ] `pension` — Auto-enrolment pension compliance (Pensions Act 2008)
- [ ] `probation` — Probationary period tracking and reviews
- [ ] `reasonable-adjustments` — Disability reasonable adjustments (Equality Act 2010)
- [ ] `reference-checks` — Employment reference request and response tracking
- [ ] `return-to-work` — Return-to-work interviews and fitness for work
- [ ] `right-to-work` — Right to work document verification (Immigration Act 2016)
- [ ] `secondments` — Employee secondment management
- [ ] `ssp` — Statutory Sick Pay calculations and records
- [ ] `statutory-leave` — Statutory leave entitlement calculations
- [ ] `warnings` — Disciplinary warnings and capability procedures
- [ ] `wtr` — Working Time Regulations 1998 compliance (max hours, rest breaks, annual leave)

### GDPR / Data Protection Modules

These modules implement UK GDPR and Data Protection Act 2018 requirements:

- [ ] `consent` — Data processing consent management
- [ ] `data-breach` — Data breach incident reporting and ICO notification
- [ ] `data-erasure` — Right to erasure (right to be forgotten) requests
- [ ] `data-retention` — Data retention policy enforcement and scheduled deletion
- [ ] `dsar` — Data Subject Access Request handling
- [ ] `privacy-notices` — Privacy notice management and version tracking

### Payroll Modules

- [ ] `payroll` — Payroll run processing
- [ ] `payroll-config` — Payroll configuration (pay periods, payment methods)
- [ ] `payslips` — Payslip generation and distribution
- [ ] `deductions` — Salary deductions (student loans, court orders, etc.)
- [ ] `tax-codes` — HMRC tax code management

### HR Operations Modules

- [ ] `agencies` — Recruitment agency management
- [ ] `assessments` — Skills and competency assessments
- [ ] `bank-details` — Employee bank account details (BACS payments)
- [ ] `bank-holidays` — UK bank holiday calendar management
- [ ] `cpd` — Continuing Professional Development tracking
- [ ] `delegations` — Authority delegation management
- [ ] `diversity` — Diversity and inclusion reporting
- [ ] `emergency-contacts` — Employee emergency contact records
- [ ] `employee-photos` — Employee photo management
- [ ] `equipment` — Company equipment assignment and tracking
- [ ] `geofence` — Geofencing for time and attendance validation
- [ ] `headcount-planning` — Workforce headcount planning and budgeting
- [ ] `training-budgets` — Training budget allocation and spend tracking

### Other Modules

- [ ] `client-portal` — External client-facing portal
- [ ] `course-ratings` — LMS course rating and feedback
- [ ] `jobs` — Job posting and vacancy management
- [ ] `letter-templates` — HR letter/document template engine
- [ ] `notifications` — Notification delivery (email, push, in-app)
- [ ] `reports` — Report builder and execution

---

## Missing Guides

The following guides do not exist anywhere in `Docs/`:

- [ ] **Troubleshooting guide** — Common issues, debugging tips, error resolution
- [ ] **Testing guide** — bun test vs vitest, writing tests, test helpers, running coverage
- [ ] **Module development guide** — Step-by-step walkthrough for creating a new backend module
- [ ] **Worker/job development guide** — Creating background jobs, Redis Streams producers/consumers
- [ ] **Redis Streams guide** — Stream topology, consumer groups, retry/dead-letter patterns
- [ ] **Database query patterns guide** — postgres.js tagged templates, transactions, RLS context
- [ ] **Permissions and RBAC guide** — Defining permissions, role hierarchies, field-level security
- [ ] **UK compliance development guide** — Adding new statutory modules, regulatory references

---

## Incomplete Documentation

### API_REFERENCE.md

- [ ] Missing endpoints for all 52 undocumented modules listed above (~200+ endpoints estimated)
- [ ] No request/response body examples for any endpoint
- [ ] No query parameter documentation for list endpoints (filters, sorting)
- [ ] No rate limit information per endpoint

### Frontend

- [ ] No component library documentation (Storybook or equivalent)
- [ ] No route map showing all frontend pages and their permissions
- [ ] No React Query hook documentation (cache keys, invalidation patterns)
- [ ] `packages/web/app/components/ui/` has no usage guide

### Environment & Configuration

- [ ] `docker/.env.example` exists but no dedicated environment variable reference document
- [ ] No documentation of all configuration options and their defaults
- [ ] No documentation of required vs optional environment variables by deployment target

### Test Suite

- [ ] No `packages/api/src/test/README.md` — test directory has no overview document
- [ ] No documentation of test helpers (`setup.ts`, `factories.ts`, `api-client.ts`)
- [ ] No guide for writing chaos tests or performance benchmarks
- [ ] No test coverage targets or thresholds documented

### Migrations

- [ ] `migrations/README.md` exists but no changelog of what each migration does
- [ ] No entity-relationship diagram for the full `app` schema

---

## Documentation Maintenance

- [ ] Add "Last Updated" dates to all major documents
- [ ] Review `Docs/audit/` reports for staleness quarterly
- [ ] Keep `API_REFERENCE.md` in sync whenever new module routes are added
- [ ] Establish a documentation review step in the PR template
- [ ] Audit `Docs/archive/` for documents that should be promoted or deleted
