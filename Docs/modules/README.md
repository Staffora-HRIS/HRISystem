# Staffora Module Catalog

Complete reference for all 72 backend modules in the Staffora HRIS platform. Each module lives in `packages/api/src/modules/{name}/` and follows the standard 5-file architecture. All routes are mounted under `/api/v1` in `packages/api/src/app.ts`.

*Last updated: 2026-03-17*

---

## Core Modules

The primary HR feature modules that form the backbone of the platform.

| Module | Prefix | Endpoints | Description | Key Resources |
|--------|--------|-----------|-------------|---------------|
| [HR](#hr) | `/hr` | 29 | Employee management, org structure, positions, compensation | Employees, org units, positions, org chart |
| [Time](#time-and-attendance) | `/time` | 18 | Time tracking, schedules, timesheets | Clock events, schedules, shifts, timesheets |
| [Absence](#absence) | `/absence` | 16 | Leave management, policies, balances | Leave types, policies, requests, balances |
| [Talent](#talent) | `/talent` | 16 | Performance management and goals | Goals, review cycles, reviews, competencies |
| [LMS](#lms) | `/lms` | 11 | Learning management system | Courses, enrollments, learning paths |
| [Cases](#cases) | `/cases` | 10 | Case management with SLA tracking | Cases, comments, appeals, escalations |
| [Onboarding](#onboarding) | `/onboarding` | 8 | Employee onboarding workflows | Templates, checklists, tasks |
| [Benefits](#benefits) | `/benefits` | 31 | Benefits administration | Plans, categories, enrollments, windows |
| [Documents](#documents) | `/documents` | 13 | Document management with S3 storage | Documents, templates, categories, expiry tracking |
| [Succession](#succession) | `/succession` | 13 | Succession planning | Plans, candidates, readiness assessments |
| [Analytics](#analytics) | `/analytics` | 15 | HR analytics and dashboards | Metrics, reports, KPIs, trends |
| [Competencies](#competencies) | `/competencies` | 17 | Competency frameworks | Frameworks, competencies, assessments, gap analysis |
| [Recruitment](#recruitment) | `/recruitment` | 15 | Hiring and applicant tracking | Vacancies, applications, offers, pipelines |

## UK Compliance Modules

Modules that implement UK-specific employment legislation and regulatory requirements.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| Right to Work | `/right-to-work` | 12 | UK right-to-work verification and document tracking |
| SSP | `/ssp` | 7 | Statutory Sick Pay calculation and management |
| Statutory Leave | `/statutory-leave` | 13 | Statutory leave entitlements (annual leave, etc.) |
| Family Leave | `/family-leave` | 10 | Maternity, paternity, adoption, shared parental leave |
| Parental Leave | `/parental-leave` | 6 | Extended parental leave entitlements |
| Bereavement | `/bereavement` | 5 | Bereavement leave management (Jack's Law) |
| Carers Leave | `/carers-leave` | 6 | Carers leave (Carer's Leave Act 2023) |
| Flexible Working | `/flexible-working` | 14 | Flexible working requests (Employment Relations Act) |
| Pension | `/pension` | 10 | Auto-enrolment pension management (Pensions Act 2008) |
| Warnings | `/warnings` | 8 | Disciplinary warnings and procedures (ACAS code) |
| WTR | `/wtr` | 7 | Working Time Regulations 1998 compliance |
| Health and Safety | `/health-safety` | 16 | H&S incident reporting and risk assessments |
| Gender Pay Gap | `/gender-pay-gap` | 6 | Gender pay gap reporting (Equality Act 2010) |
| Bank Holidays | `/bank-holidays` | 7 | UK bank holiday calendar management |
| NMW | `/nmw` | 5 | National Minimum/Living Wage tracking |
| Probation | `/probation` | 7 | Probation period management and reviews |
| Return to Work | `/return-to-work` | 5 | RTW interviews after absence |
| Contract Amendments | `/contract-amendments` | 5 | Employment contract change tracking |
| Contract Statements | `/contract-statements` | 6 | Written statements of employment (s.1 ERA 1996) |
| DBS Checks | `/dbs-checks` | 6 | Disclosure and Barring Service checks |

## GDPR and Data Privacy Modules

Modules that implement GDPR and UK Data Protection Act 2018 requirements.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| DSAR | `/dsar` | 12 | Data Subject Access Requests (Article 15) |
| Data Erasure | `/data-erasure` | 11 | Right to be forgotten (Article 17) |
| Data Breach | `/data-breach` | 10 | Breach notification (72hr ICO deadline, Article 33) |
| Data Retention | `/data-retention` | 11 | Retention schedules and automated purge |
| Consent | `/consent` | 11 | Consent management (Article 7) |
| Privacy Notices | `/privacy-notices` | 7 | Privacy notice management (Articles 13-14) |

## Payroll Modules

Modules for payroll processing, tax, and payment management.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| Payroll | `/payroll` | 16 | Payroll run processing and management |
| Payroll Config | `/payroll-config` | 8 | Payroll settings and configuration |
| Payslips | `/payslips` | 8 | Payslip generation and distribution |
| Tax Codes | `/tax-codes` | 4 | HMRC tax code management |
| Deductions | `/deductions` | 8 | Payroll deduction rules |
| Bank Details | `/employees/:employeeId/bank-details` | 6 | Employee bank account details (sub-resource) |

## Employee Data Modules

Modules for managing employee personal and supplementary data.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| Emergency Contacts | `/employees/:employeeId/emergency-contacts` | 5 | Emergency contact information (sub-resource) |
| Employee Photos | `/employees/:employeeId/photos` | 4 | Employee photo management (sub-resource) |
| Diversity | `/diversity` | 5 | Diversity and equality monitoring |
| Reasonable Adjustments | `/reasonable-adjustments` | 8 | Disability reasonable adjustments |
| Secondments | `/secondments` | 5 | Employee secondment tracking |

## Learning and Development Modules

Modules extending the core LMS with assessment, CPD, and budget tracking.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| Assessments | `/assessments` | 9 | Skill and knowledge assessments |
| Course Ratings | `/course-ratings` | 3 | LMS course feedback and ratings |
| CPD | `/cpd` | 6 | Continuing professional development records |
| Training Budgets | `/training-budgets` | 8 | Training budget allocation and tracking |

## Platform and Infrastructure Modules

Modules that provide platform-level functionality, portals, and system administration.

| Module | Prefix | Endpoints | Description |
|--------|--------|-----------|-------------|
| Auth | `/auth` | 5 | Authentication via BetterAuth (sessions, MFA, CSRF) |
| Portal | `/portal` | 7 | Employee self-service aggregation layer |
| Client Portal | `/client-portal` | 28 | Customer-facing portal (tenant management) |
| Security | `/security`, `/fields`, `/manager` | 18 | Field-level permissions, portal access, manager hierarchy |
| Tenant | `/tenant` | 2 | Tenant configuration and settings |
| Dashboard | `/dashboard` | 1 | Admin dashboard data |
| System | `/system` | 1 | System configuration and health |
| Reports | `/reports` | 24 | Custom report builder and execution |
| Notifications | `/notifications` | 10 | Notification preferences and delivery |
| Workflows | `/workflows` | 14 | Configurable workflow engine |
| Jobs | `/jobs` | 5 | Job catalogue and classification |
| Agencies | `/agencies` | 8 | Recruitment agency management |
| Equipment | `/equipment` | 9 | IT equipment and asset tracking |
| Geofence | `/geofences` | 10 | Location-based clock-in restrictions |
| Headcount Planning | `/headcount-planning` | 10 | Workforce planning and forecasting |
| Letter Templates | `/letter-templates` | 7 | HR letter/document generation |
| Delegations | `/delegations` | 5 | Authority delegation management |
| Reference Checks | `/reference-checks` | 6 | Employment reference management |

---

## Module Architecture

Every module follows a consistent 5-file pattern inside `packages/api/src/modules/{name}/`:

```
modules/{name}/
  schemas.ts      # TypeBox request/response validation schemas
  repository.ts   # Database access layer (postgres.js tagged templates)
  service.ts      # Business logic, validation, state machines
  routes.ts       # Elysia route definitions with auth/RBAC guards
  index.ts        # Module re-exports
```

### Layer Responsibilities

**schemas.ts** -- Defines TypeBox schemas used for request body validation, query parameter validation, and response typing. Schemas are referenced directly in Elysia route definitions for automatic validation. Uses `t` from Elysia (which wraps `@sinclair/typebox`).

```typescript
// Example from hr/schemas.ts
export const EmployeeStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("on_leave"),
  t.Literal("terminated"),
]);
```

**repository.ts** -- Pure data access using postgres.js tagged template literals. No business logic. Receives a `DatabaseClient` and uses `db.withTransaction()` for tenant-scoped queries (RLS context is set automatically). Exports row types for the service layer.

```typescript
// Example query pattern
const rows = await db.withTransaction(ctx, async (tx) => {
  return await tx`SELECT * FROM employees WHERE id = ${id}`;
});
```

**service.ts** -- Business logic orchestration. Validates invariants, enforces state machine transitions, handles effective dating, and emits domain events via the outbox pattern. Returns `ServiceResult<T>` or `PaginatedServiceResult<T>`.

```typescript
// Example from hr/service.ts
import { canTransition as canTransitionEmployee } from "@staffora/shared/state-machines";
```

**routes.ts** -- Elysia plugin that defines HTTP endpoints. Uses `.derive()` to instantiate the repository and service, applies permission guards via `requirePermission()`, and maps service results to HTTP responses with appropriate status codes.

```typescript
// Example from hr/routes.ts
export const hrRoutes = new Elysia({ prefix: "/hr", name: "hr-routes" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new HRRepository(db);
    const service = new HRService(repository, db);
    return { hrService: service, hrRepository: repository };
  })
```

**index.ts** -- Re-exports the route plugin and optionally the service/repository for use by other modules.

### Data Flow

```
                         Elysia Plugins (auto-applied)
                    ┌────────────────────────────────────┐
                    │  Auth -> Tenant -> RBAC -> Idempot. │
                    └──────────────┬─────────────────────┘
                                   │
  HTTP Request ──> routes.ts ──> schemas.ts (validate)
                       │
                       ├──> service.ts (business logic)
                       │        │
                       │        ├──> repository.ts (SQL queries)
                       │        │        │
                       │        │        └──> PostgreSQL (via RLS)
                       │        │
                       │        └──> domain_outbox (events, same tx)
                       │
                       └──> HTTP Response (with error mapping)
```

### Permission Model

Each module declares its required permissions in route guards:

```typescript
beforeHandle: [requirePermission("absence", "read")]   // read access
beforeHandle: [requirePermission("absence", "write")]   // write access
beforeHandle: [requirePermission("absence", "delete")]  // delete access
```

Compound permissions use colon notation for sub-resources:

```typescript
beforeHandle: [requirePermission("employees:compensation", "read")]
beforeHandle: [requirePermission("employees:bank_details", "write")]
```

### Error Handling

Modules define error code maps that translate domain errors to HTTP status codes:

```typescript
const hrErrorStatusMap: Record<string, number> = {
  INVALID_PARENT: 400,
  CIRCULAR_HIERARCHY: 400,
  ALREADY_TERMINATED: 409,
  POSITION_OVERFILLED: 400,
};
```

All errors follow the standard shape: `{ error: { code, message, details?, requestId } }`.

---

## Core Module Details

### HR

**Prefix:** `/api/v1/hr` | **29 endpoints** | **Source:** `packages/api/src/modules/hr/`

The foundational module managing employees, organisational structure, positions, and compensation. Uses effective dating for compensation and position history. Implements the employee lifecycle state machine (`pending -> active -> on_leave <-> active -> terminated`).

**Endpoints:**

| Method | Path | Description | Permission |
|--------|------|-------------|------------|
| GET | `/stats` | HR statistics overview | `employees:read` |
| GET | `/org-units` | List organisational units | `org_units:read` |
| GET | `/org-units/hierarchy` | Full org unit tree | `org_units:read` |
| GET | `/org-units/:id` | Get org unit by ID | `org_units:read` |
| POST | `/org-units` | Create org unit | `org_units:write` |
| PUT | `/org-units/:id` | Update org unit | `org_units:write` |
| DELETE | `/org-units/:id` | Delete org unit | `org_units:delete` |
| GET | `/positions` | List positions | `positions:read` |
| GET | `/positions/:id` | Get position by ID | `positions:read` |
| POST | `/positions` | Create position | `positions:write` |
| PUT | `/positions/:id` | Update position | `positions:write` |
| DELETE | `/positions/:id` | Delete position | `positions:delete` |
| GET | `/employees` | List employees (paginated) | `employees:read` |
| GET | `/employees/by-number/:employeeNumber` | Look up by employee number | `employees:read` |
| GET | `/employees/:id` | Get employee by ID | `employees:read` |
| POST | `/employees` | Create employee | `employees:write` |
| PUT | `/employees/:id/personal` | Update personal details | `employees:write` |
| PUT | `/employees/:id/contract` | Update contract details | `employees:write` |
| PUT | `/employees/:id/position` | Update position assignment | `employees:write` |
| PUT | `/employees/:id/compensation` | Update compensation | `employees:compensation:write` |
| PUT | `/employees/:id/manager` | Update reporting manager | `employees:write` |
| POST | `/employees/:id/status` | Transition employee status | `employees:write` |
| POST | `/employees/:id/terminate` | Terminate employee | `employees:write` |
| PATCH | `/employees/:id/ni-category` | Update NI category | `employees:write` |
| GET | `/org-chart` | Full org chart | `employees:read` |
| GET | `/org-chart/direct-reports/:employeeId` | Direct reports | `employees:read` |
| GET | `/org-chart/reporting-chain/:employeeId` | Reporting chain | `employees:read` |
| GET | `/employees/:id/statutory-notice` | Statutory notice period | `employees:read` |
| GET | `/employees/:id/history/:dimension` | Effective-dated history | `employees:history:read` |

**Key Patterns:** Effective dating (compensation, position, contract history), employee lifecycle state machine, org hierarchy validation (circular reference prevention), position headcount enforcement.

---

### Time and Attendance

**Prefix:** `/api/v1/time` | **18 endpoints** | **Source:** `packages/api/src/modules/time/`

Manages employee time tracking, work schedules, shifts, and timesheet processing. Supports clock-in/clock-out events with optional geofence validation.

**Key Resources:** Clock events, schedules, schedule assignments, shifts, timesheets, overtime rules.

---

### Absence

**Prefix:** `/api/v1/absence` | **16 endpoints** | **Source:** `packages/api/src/modules/absence/`

Leave management including leave type configuration, policy definitions, leave request workflows, and balance tracking. Supports Bradford Factor calculation for absence monitoring.

**Key Resources:** Leave types, leave policies, leave requests, leave balances, accrual rules.

**Key Patterns:** Leave request state machine (`draft -> pending -> approved/rejected/cancelled`), balance ledger, accrual calculations, Bradford Factor.

---

### Talent

**Prefix:** `/api/v1/talent` | **16 endpoints** | **Source:** `packages/api/src/modules/talent/`

Performance management including goal setting, review cycles, performance reviews, and calibration. Implements the performance cycle state machine.

**Key Resources:** Goals, review cycles, reviews, competency assessments.

**Key Patterns:** Performance cycle state machine (`draft -> active -> review -> calibration -> completed`), goal cascading, rating calibration.

---

### LMS

**Prefix:** `/api/v1/lms` | **11 endpoints** | **Source:** `packages/api/src/modules/lms/`

Learning management system for course creation, employee enrolments, and learning path management. Supports course completion tracking and certificate generation.

**Key Resources:** Courses, enrollments, learning paths, completions, certificates.

---

### Cases

**Prefix:** `/api/v1/cases` | **10 endpoints** | **Source:** `packages/api/src/modules/cases/`

HR case/ticket management with SLA tracking, priority levels, escalation workflows, and appeals. Implements the case state machine.

**Key Resources:** Cases, comments, appeals, escalations.

**Key Patterns:** Case state machine (`open -> in_progress -> resolved -> closed`, with escalation and reopening), SLA enforcement, priority-based routing.

---

### Onboarding

**Prefix:** `/api/v1/onboarding` | **8 endpoints** | **Source:** `packages/api/src/modules/onboarding/`

Employee onboarding workflow management. Supports configurable templates with task checklists and document collection requirements.

**Key Resources:** Onboarding templates, checklists, tasks, document requirements.

---

### Benefits

**Prefix:** `/api/v1/benefits` | **31 endpoints** | **Source:** `packages/api/src/modules/benefits/`

Comprehensive benefits administration including plan configuration, enrolment windows, employee enrolments, and cost tracking. The largest module by endpoint count.

**Key Resources:** Benefit categories, plans, enrolment windows, employee enrolments, dependants, costs.

---

### Documents

**Prefix:** `/api/v1/documents` | **13 endpoints** | **Source:** `packages/api/src/modules/documents/`

Document management with S3-compatible storage. Supports document categorisation, templates, version tracking, and expiry monitoring.

**Key Resources:** Documents, categories, templates, versions, expiry alerts.

---

### Succession

**Prefix:** `/api/v1/succession` | **13 endpoints** | **Source:** `packages/api/src/modules/succession/`

Succession planning for critical roles. Tracks potential successors, readiness assessments, and development plans.

**Key Resources:** Succession plans, candidates, readiness levels, development actions.

---

### Analytics

**Prefix:** `/api/v1/analytics` | **15 endpoints** | **Source:** `packages/api/src/modules/analytics/`

HR analytics and reporting dashboards. Provides aggregated metrics, trend analysis, and KPI tracking across all HR modules.

**Key Resources:** Dashboard metrics, reports, KPIs, trend data, custom analytics.

---

### Competencies

**Prefix:** `/api/v1/competencies` | **17 endpoints** | **Source:** `packages/api/src/modules/competencies/`

Competency framework management. Defines organisational competencies, assesses employee competency levels, and identifies skill gaps.

**Key Resources:** Frameworks, competencies, levels, employee assessments, gap analysis.

---

### Recruitment

**Prefix:** `/api/v1/recruitment` | **15 endpoints** | **Source:** `packages/api/src/modules/recruitment/`

Applicant tracking and hiring management. Manages job vacancies, applications, interview scheduling, and offer management.

**Key Resources:** Vacancies, applications, interviews, offers, hiring pipelines.

---

## Cross-Cutting Concerns

All modules automatically receive these capabilities via Elysia plugins registered in `src/app.ts`. No module-level code is needed to opt in.

### Row-Level Security (RLS)

Every tenant-owned database table has RLS policies enforcing `tenant_id` isolation. The `tenantPlugin` sets the PostgreSQL session variable `app.current_tenant` before every query, and the `DatabaseClient.withTransaction()` method applies this automatically.

### Authentication

The `authPlugin` validates the session cookie/token and populates `ctx.user` with the authenticated user's details. All module routes operate within an authenticated context.

### Role-Based Access Control (RBAC)

The `rbacPlugin` provides `requirePermission(resource, action)` guards. Modules declare their required permissions in `beforeHandle` arrays on each route.

### Idempotency

The `idempotencyPlugin` checks the `Idempotency-Key` header on mutating requests (POST, PUT, PATCH, DELETE). Duplicate requests within the TTL window return the cached response.

### Audit Logging

The `auditPlugin` records all mutations with actor, action, resource, and before/after snapshots. Modules can emit additional audit events via `AuditActions`.

### Rate Limiting

The `rateLimitPlugin` applies per-endpoint rate limits using Redis. Default limits are configurable per route.

---

## Related Documentation

- [API Reference](../api/API_REFERENCE.md) -- Full endpoint listing with request/response schemas
- [Error Codes](../api/ERROR_CODES.md) -- Error code reference organised by module
- [Architecture](../architecture/ARCHITECTURE.md) -- System design with Mermaid diagrams
- [Database](../architecture/DATABASE.md) -- Schema, migrations, RLS policy catalog
- [State Machines](../patterns/STATE_MACHINES.md) -- Workflow state diagrams for all 5 state machines
- [Security Patterns](../patterns/SECURITY.md) -- RLS, auth, RBAC, audit, and idempotency details
- [Worker System](../architecture/WORKER_SYSTEM.md) -- Background job processing (outbox, notifications, exports)
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) -- Permission model and RBAC details
