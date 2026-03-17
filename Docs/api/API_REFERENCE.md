# API Reference

Base URL: `http://localhost:3000`

Interactive Swagger docs: `http://localhost:3000/docs`

## Common Headers

| Header | Required | Description |
|--------|:--------:|-------------|
| `Cookie: hris_session=...` | Yes | Session authentication |
| `Content-Type: application/json` | Yes (POST/PUT/PATCH) | Request body format |
| `X-CSRF-Token` | Yes (mutating) | CSRF protection |
| `Idempotency-Key` | Yes (mutating) | Request deduplication |
| `X-Tenant-ID` | Optional | Explicit tenant selection |
| `X-Request-ID` | Optional | Client-specified request ID |

## Response Format

### Success

```json
{
  "data": { ... },
  "pagination": { "nextCursor": "...", "hasMore": true, "count": 20 }
}
```

### Error

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {},
    "requestId": "req_abc123"
  }
}
```

## Pagination

List endpoints use **cursor-based pagination**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cursor` | string | - | Cursor from previous response |
| `limit` | number | 20 | Items per page (max 100) |

---

## Health Endpoints

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/health` | No | Full health check (database + redis status) |
| GET | `/ready` | No | Readiness probe |
| GET | `/live` | No | Liveness probe |

---

## Auth Module (`/api/v1/auth`)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/auth/login` | No | Login with email/password |
| POST | `/auth/logout` | Yes | Logout, clear session |
| GET | `/auth/me` | Yes | Get current authenticated user |
| GET | `/auth/tenants` | Yes | List tenants for current user |
| POST | `/auth/switch-tenant` | Yes | Switch active tenant |

---

## Core HR Module (`/api/v1/hr`)

### Org Units

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/org-units` | `hr.org_units.read` | List organizational units |
| POST | `/hr/org-units` | `hr.org_units.write` | Create org unit |
| GET | `/hr/org-units/:id` | `hr.org_units.read` | Get org unit by ID |
| PATCH | `/hr/org-units/:id` | `hr.org_units.write` | Update org unit |
| DELETE | `/hr/org-units/:id` | `hr.org_units.write` | Delete org unit |

### Positions

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/positions` | `hr.positions.read` | List positions |
| POST | `/hr/positions` | `hr.positions.write` | Create position |
| GET | `/hr/positions/:id` | `hr.positions.read` | Get position by ID |
| PATCH | `/hr/positions/:id` | `hr.positions.write` | Update position |
| DELETE | `/hr/positions/:id` | `hr.positions.write` | Delete position |

### Employees

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/hr/employees` | `hr.employees.read` | List employees |
| POST | `/hr/employees` | `hr.employees.write` | Create employee |
| GET | `/hr/employees/:id` | `hr.employees.read` | Get employee by ID |
| PATCH | `/hr/employees/:id/personal` | `hr.employees.write` | Update personal info |
| PATCH | `/hr/employees/:id/contract` | `hr.employees.write` | Update contract |
| PATCH | `/hr/employees/:id/position` | `hr.employees.write` | Update position assignment |
| PATCH | `/hr/employees/:id/compensation` | `hr.employees.write` | Update compensation |
| PATCH | `/hr/employees/:id/manager` | `hr.employees.write` | Update reporting line |
| POST | `/hr/employees/:id/status-transition` | `hr.employees.write` | Transition employee status |
| POST | `/hr/employees/:id/terminate` | `hr.employees.terminate` | Terminate employee |
| GET | `/hr/employees/:id/history/:dimension` | `hr.employees.read` | Get effective-dated history |
| GET | `/hr/employees/:id/statutory-notice` | `hr.employees.read` | Calculate statutory notice period (UK ERA 1996 s.86) |

---

## Time & Attendance Module (`/api/v1/time`)

### Time Events

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/events` | Record clock in/out event |
| GET | `/time/events` | List time events |
| GET | `/time/events/:id` | Get time event by ID |

### Schedules

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/schedules` | Create schedule |
| GET | `/time/schedules` | List schedules |
| GET | `/time/schedules/:id` | Get schedule by ID |
| PUT | `/time/schedules/:id` | Update schedule |

### Shifts

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/shifts` | Create shift |
| GET | `/time/shifts/:id` | Get shift by ID |
| PUT | `/time/shifts/:id` | Update shift |

### Timesheets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/time/timesheets` | Create timesheet |
| GET | `/time/timesheets` | List timesheets |
| GET | `/time/timesheets/:id` | Get timesheet by ID |
| PUT | `/time/timesheets/:id` | Update timesheet lines |
| POST | `/time/timesheets/:id/submit` | Submit timesheet for approval |
| POST | `/time/timesheets/:id/approve` | Approve or reject timesheet |

---

## Absence Module (`/api/v1/absence`)

### Leave Types & Policies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/leave-types` | List leave types |
| POST | `/absence/leave-types` | Create leave type |
| GET | `/absence/leave-types/:id` | Get leave type by ID |
| GET | `/absence/policies` | List leave policies |
| POST | `/absence/policies` | Create leave policy |

### Leave Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/requests` | List leave requests |
| POST | `/absence/requests` | Create leave request |
| GET | `/absence/requests/:id` | Get leave request by ID |
| POST | `/absence/requests/:id/submit` | Submit request for approval |
| POST | `/absence/requests/:id/approve` | Approve or reject request |
| DELETE | `/absence/requests/:id` | Cancel leave request |

### Balances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/absence/balances/:employeeId` | Get employee leave balances |

---

## Talent Module (`/api/v1/talent`)

### Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/goals` | List goals |
| POST | `/talent/goals` | Create goal |
| GET | `/talent/goals/:id` | Get goal by ID |
| PATCH | `/talent/goals/:id` | Update goal |
| DELETE | `/talent/goals/:id` | Delete goal |

### Review Cycles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/review-cycles` | List review cycles |
| POST | `/talent/review-cycles` | Create review cycle |
| GET | `/talent/review-cycles/:id` | Get review cycle by ID |

### Reviews

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/reviews` | List reviews |
| POST | `/talent/reviews` | Create review |
| GET | `/talent/reviews/:id` | Get review by ID |
| POST | `/talent/reviews/:id/self-review` | Submit self review |
| POST | `/talent/reviews/:id/manager-review` | Submit manager review |

### Competencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/talent/competencies` | List competencies |
| POST | `/talent/competencies` | Create competency |
| GET | `/talent/competencies/:id` | Get competency by ID |

---

## LMS Module (`/api/v1/lms`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lms/courses` | List courses |
| POST | `/lms/courses` | Create course |
| GET | `/lms/courses/:id` | Get course by ID |
| GET | `/lms/enrollments` | List enrollments |
| POST | `/lms/enrollments` | Create enrollment |
| POST | `/lms/enrollments/:id/start` | Start course |
| POST | `/lms/enrollments/:id/complete` | Complete course |
| GET | `/lms/my-learning` | Get current user's learning |

---

## Cases Module (`/api/v1/cases`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cases/` | List cases |
| POST | `/cases/` | Create case |
| GET | `/cases/:id` | Get case by ID |
| PATCH | `/cases/:id` | Update case (status transition) |
| GET | `/cases/:id/comments` | Get case comments |
| POST | `/cases/:id/comments` | Add comment to case |
| GET | `/cases/my-cases` | Get current user's cases |

---

## Onboarding Module (`/api/v1/onboarding`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/onboarding/checklists` | List onboarding checklists |
| POST | `/onboarding/checklists` | Create checklist |
| GET | `/onboarding/instances` | List onboarding instances |
| POST | `/onboarding/instances` | Start onboarding for employee |
| GET | `/onboarding/instances/:id` | Get onboarding instance |
| POST | `/onboarding/instances/:id/tasks/:taskId/complete` | Complete task |
| GET | `/onboarding/my-onboarding` | Get current user's onboarding |

---

## Benefits Module (`/api/v1/benefits`)

### Carriers & Plans

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/carriers` | List benefit carriers |
| POST | `/benefits/carriers` | Create carrier |
| GET | `/benefits/plans` | List benefit plans |
| POST | `/benefits/plans` | Create plan |

### Enrollments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/enrollments` | List enrollments |
| POST | `/benefits/enrollments` | Create enrollment |
| GET | `/benefits/enrollments/:id` | Get enrollment |

### Dependents & Life Events

| Method | Path | Description |
|--------|------|-------------|
| GET | `/benefits/dependents` | List dependents |
| POST | `/benefits/dependents` | Add dependent |
| GET | `/benefits/life-events` | List life events |
| POST | `/benefits/life-events` | Create life event |

---

## Documents Module (`/api/v1/documents`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/documents/` | List documents |
| POST | `/documents/` | Create document |
| GET | `/documents/:id` | Get document by ID |
| PUT | `/documents/:id` | Update document |
| DELETE | `/documents/:id` | Delete document |
| GET | `/documents/:id/download-url` | Get download URL |
| GET | `/documents/upload-url` | Get upload URL |
| GET | `/documents/expiring` | Get expiring documents |
| GET | `/documents/:id/versions` | List document versions |
| POST | `/documents/:id/versions` | Create new version |
| GET | `/documents/my-summary` | Get self-service document summary |

---

## Succession Module (`/api/v1/succession`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/succession/plans` | List succession plans |
| POST | `/succession/plans` | Create succession plan |
| GET | `/succession/plans/:id` | Get plan by ID |
| PUT | `/succession/plans/:id` | Update plan |
| DELETE | `/succession/plans/:id` | Delete plan |
| GET | `/succession/plans/:id/candidates` | List plan candidates |
| POST | `/succession/candidates` | Add candidate to plan |
| GET | `/succession/candidates/:id` | Get candidate |
| PUT | `/succession/candidates/:id` | Update candidate |
| DELETE | `/succession/candidates/:id` | Remove candidate |
| GET | `/succession/pipeline` | Get succession pipeline |
| GET | `/succession/pipeline/stats` | Get pipeline statistics |
| GET | `/succession/gaps` | Get succession gaps |

---

## Analytics Module (`/api/v1/analytics`)

### Dashboards

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard/executive` | Executive dashboard |
| GET | `/analytics/dashboard/manager` | Manager dashboard |

### Headcount

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/headcount/summary` | Headcount summary |
| GET | `/analytics/headcount/by-department` | Headcount by department |
| GET | `/analytics/headcount/trend` | Headcount trend over time |

### Turnover

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/turnover/summary` | Turnover summary |
| GET | `/analytics/turnover/by-department` | Turnover by department |
| GET | `/analytics/turnover/by-reason` | Turnover by reason |

### Other Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/attendance/summary` | Attendance summary |
| GET | `/analytics/leave/summary` | Leave summary |
| GET | `/analytics/leave/by-type` | Leave by type |
| GET | `/analytics/recruitment/summary` | Recruitment summary |
| GET | `/analytics/reports` | Standard reports catalog |

---

## Competencies Module (`/api/v1/competencies`)

### Competency Framework

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/` | List competencies |
| POST | `/competencies/` | Create competency |
| GET | `/competencies/:id` | Get competency by ID |
| PATCH | `/competencies/:id` | Update competency |
| DELETE | `/competencies/:id` | Delete competency |

### Job Competencies

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/jobs/:jobId` | List competencies for job |
| POST | `/competencies/jobs` | Add competency to job |
| PATCH | `/competencies/jobs/:id` | Update job competency |
| DELETE | `/competencies/jobs/:id` | Remove job competency |

### Employee Assessments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/competencies/employees/:employeeId` | List employee competencies |
| GET | `/competencies/employees/:employeeId/gaps` | Get competency gaps |
| POST | `/competencies/employees` | Assess employee competency |
| PATCH | `/competencies/employees/assessments/:id` | Update assessment |
| GET | `/competencies/due-assessments` | Get assessments due |
| GET | `/competencies/team/:managerId` | Get team competency overview |

---

## Recruitment Module (`/api/v1/recruitment`)

### Requisitions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruitment/requisitions` | List requisitions |
| POST | `/recruitment/requisitions` | Create requisition |
| GET | `/recruitment/requisitions/:id` | Get requisition by ID |
| PATCH | `/recruitment/requisitions/:id` | Update requisition |
| POST | `/recruitment/requisitions/:id/open` | Open requisition |
| POST | `/recruitment/requisitions/:id/close` | Close requisition |
| POST | `/recruitment/requisitions/:id/cancel` | Cancel requisition |
| GET | `/recruitment/requisitions/:id/pipeline` | Get candidate pipeline |
| GET | `/recruitment/requisitions/stats` | Get requisition statistics |

### Candidates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recruitment/candidates` | List candidates |
| POST | `/recruitment/candidates` | Create candidate |
| GET | `/recruitment/candidates/:id` | Get candidate by ID |
| PATCH | `/recruitment/candidates/:id` | Update candidate |
| POST | `/recruitment/candidates/:id/advance` | Advance candidate stage |
| GET | `/recruitment/candidates/stats` | Get candidate statistics |

---

## Workflows Module (`/api/v1/workflows`)

### Definitions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/definitions` | List workflow definitions |
| POST | `/workflows/definitions` | Create definition |
| GET | `/workflows/definitions/:id` | Get definition by ID |
| PATCH | `/workflows/definitions/:id` | Update definition |
| POST | `/workflows/definitions/:id/activate` | Activate definition |

### Instances

| Method | Path | Description |
|--------|------|-------------|
| GET | `/workflows/instances` | List workflow instances |
| POST | `/workflows/instances` | Start workflow |
| GET | `/workflows/instances/:id` | Get instance by ID |
| GET | `/workflows/instances/:id/steps` | Get instance steps |
| POST | `/workflows/instances/:id/cancel` | Cancel workflow |

### Steps & Approvals

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/steps/:stepId/process` | Process step (approve/reject) |
| POST | `/workflows/steps/:stepId/reassign` | Reassign step |
| GET | `/workflows/my-approvals` | Get pending approvals |

---

## Security Module (`/api/v1/security`)

### Permissions & Roles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/my-permissions` | Get current user's permissions |
| GET | `/security/permissions` | List permission catalog |
| GET | `/security/roles` | List roles |
| POST | `/security/roles` | Create role |
| PUT | `/security/roles/:id` | Update role |
| DELETE | `/security/roles/:id` | Delete role |
| GET | `/security/roles/:id/permissions` | Get role permissions |
| POST | `/security/roles/:id/permissions` | Grant permission to role |
| DELETE | `/security/roles/:id/permissions` | Revoke permission from role |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/users` | List tenant users |
| POST | `/security/users/:id/roles` | Assign role to user |
| DELETE | `/security/role-assignments/:id` | Revoke role assignment |
| GET | `/security/users/:id/role-assignments` | List user role assignments |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/security/audit-log` | Query audit log entries |

---

## Portal Module (`/api/v1/portal`)

Self-service endpoints for logged-in employees:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/portal/me` | Get my profile |
| GET | `/portal/my-team` | Get my direct reports |
| GET | `/portal/tasks` | Get my pending tasks |
| GET | `/portal/approvals` | Get my pending approvals |
| GET | `/portal/dashboard` | Get dashboard summary |

---

## Tenant Module (`/api/v1/tenant`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tenant/current` | Get current tenant info |
| GET | `/tenant/settings` | Get tenant settings |

---

## Dashboard Module (`/api/v1/dashboard`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/admin/stats` | Admin dashboard statistics |

---

## System Module (`/api/v1/system`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/system/health` | System health check |

---

# Additional Module APIs

The following 52 modules provide extended functionality across UK compliance, GDPR, payroll, HR operations, learning, notifications, reporting, and the client portal.

---

## UK Compliance

---

### Right to Work (`/api/v1/right-to-work`)

UK right-to-work verification and document management for Immigration, Asylum and Nationality Act 2006 compliance.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/right-to-work/compliance` | Yes | Get compliance dashboard |
| GET | `/right-to-work/expiring` | Yes | List expiring RTW checks |
| GET | `/right-to-work/checks` | Yes | List RTW checks with filters |
| POST | `/right-to-work/checks` | Yes | Create a new RTW check |
| GET | `/right-to-work/checks/:id` | Yes | Get RTW check by ID |
| PATCH | `/right-to-work/checks/:id` | Yes | Update RTW check |
| POST | `/right-to-work/checks/:id/verify` | Yes | Verify RTW check |
| POST | `/right-to-work/checks/:id/fail` | Yes | Fail RTW check |
| GET | `/right-to-work/checks/:id/documents` | Yes | List documents for check |
| POST | `/right-to-work/checks/:id/documents` | Yes | Add document to check |
| DELETE | `/right-to-work/checks/:id/documents/:documentId` | Yes | Remove document from check |
| GET | `/right-to-work/employees/:employeeId/status` | Yes | Get employee RTW status |

---

### SSP (`/api/v1/ssp`)

Statutory Sick Pay management per Social Security Contributions and Benefits Act 1992.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/ssp/records` | Yes | List SSP records |
| GET | `/ssp/records/:id` | Yes | Get SSP record detail |
| POST | `/ssp/records` | Yes | Start new SSP period |
| PATCH | `/ssp/records/:id` | Yes | Update SSP record |
| POST | `/ssp/records/:id/end` | Yes | End SSP period |
| GET | `/ssp/employees/:employeeId/entitlement` | Yes | Check remaining SSP entitlement |
| GET | `/ssp/employees/:employeeId/eligibility` | Yes | Check SSP eligibility |

---

### Statutory Leave (`/api/v1/statutory-leave`)

UK statutory leave management for maternity, paternity, shared parental, and adoption leave.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/statutory-leave/` | Yes | List statutory leave records |
| POST | `/statutory-leave/` | Yes | Create statutory leave record |
| GET | `/statutory-leave/eligibility/:employeeId` | Yes | Check employee eligibility |
| GET | `/statutory-leave/:id` | Yes | Get statutory leave by ID |
| PATCH | `/statutory-leave/:id` | Yes | Update statutory leave |
| POST | `/statutory-leave/:id/start` | Yes | Start leave period |
| POST | `/statutory-leave/:id/complete` | Yes | Complete leave period |
| POST | `/statutory-leave/:id/cancel` | Yes | Cancel leave |
| POST | `/statutory-leave/:id/curtail` | Yes | Curtail leave for ShPL |
| GET | `/statutory-leave/:id/pay` | Yes | Get pay calculation |
| POST | `/statutory-leave/:id/pay/recalculate` | Yes | Recalculate statutory pay |
| GET | `/statutory-leave/:id/kit-days` | Yes | List KIT/SPLIT days |
| POST | `/statutory-leave/:id/kit-days` | Yes | Record KIT/SPLIT day |

---

### Pension (`/api/v1/pension`)

UK workplace pension auto-enrolment under the Pensions Act 2008.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/pension/schemes` | Yes | Create pension scheme |
| GET | `/pension/schemes` | Yes | List pension schemes |
| POST | `/pension/assess/:employeeId` | Yes | Assess employee eligibility |
| POST | `/pension/enrol/:employeeId` | Yes | Auto-enrol eligible employee |
| PATCH | `/pension/enrolments/:id/opt-out` | Yes | Process opt-out |
| POST | `/pension/enrolments/:id/postpone` | Yes | Postpone assessment |
| POST | `/pension/contributions/calculate` | Yes | Calculate contributions |
| POST | `/pension/re-enrolment` | Yes | Trigger bulk re-enrolment |
| GET | `/pension/enrolments` | Yes | List pension enrolments |
| GET | `/pension/compliance` | Yes | Get compliance summary |

---

### Probation (`/api/v1/probation`)

Probation review management and reminder tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/probation/reviews` | Yes | List all probation reviews |
| GET | `/probation/reviews/upcoming` | Yes | Reviews due in next 30 days |
| GET | `/probation/reviews/overdue` | Yes | Reviews past due date |
| GET | `/probation/reviews/:id` | Yes | Get review with reminders |
| POST | `/probation/reviews` | Yes | Create probation review |
| PATCH | `/probation/reviews/:id/extend` | Yes | Extend probation period |
| PATCH | `/probation/reviews/:id/complete` | Yes | Record probation outcome |

---

### Warnings (`/api/v1/warnings`)

Employee warning management with appeal and rescission workflows.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/warnings/employee/:employeeId` | Yes | List warnings for employee |
| GET | `/warnings/:id` | Yes | Get warning by ID |
| GET | `/warnings/employee/:employeeId/active` | Yes | Get active warnings |
| POST | `/warnings/` | Yes | Issue a new warning |
| POST | `/warnings/:id/appeal` | Yes | Submit an appeal |
| PATCH | `/warnings/:id/appeal/resolve` | Yes | Resolve an appeal |
| PATCH | `/warnings/:id/rescind` | Yes | Rescind a warning |
| POST | `/warnings/batch-expire` | Yes | Batch expire active warnings |

---

### Bereavement (`/api/v1/bereavement`)

Parental Bereavement Leave (Jack's Law) management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/bereavement/` | Yes | List bereavement leave records |
| GET | `/bereavement/:id` | Yes | Get bereavement leave record |
| POST | `/bereavement/` | Yes | Create bereavement leave request |
| PUT | `/bereavement/:id` | Yes | Update bereavement leave record |
| PATCH | `/bereavement/:id/status` | Yes | Transition bereavement leave status |

---

### Carer's Leave (`/api/v1/carers-leave`)

Carer's leave entitlements under the Carer's Leave Act 2023.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/carers-leave/` | Yes | List carer's leave entitlements |
| GET | `/carers-leave/:id` | Yes | Get entitlement by ID |
| POST | `/carers-leave/` | Yes | Create carer's leave entitlement |
| PUT | `/carers-leave/:id` | Yes | Update entitlement |
| PATCH | `/carers-leave/:id/status` | Yes | Approve or reject carer's leave |
| DELETE | `/carers-leave/:id` | Yes | Delete entitlement |

---

### Family Leave (`/api/v1/family-leave`)

Unified family leave management: maternity, paternity, shared parental, and adoption leave.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/family-leave/dashboard` | Yes | Compliance dashboard |
| POST | `/family-leave/entitlements` | Yes | Create family leave entitlement |
| GET | `/family-leave/entitlements` | Yes | List entitlements |
| GET | `/family-leave/entitlements/:id` | Yes | Get entitlement detail |
| POST | `/family-leave/entitlements/:id/check-eligibility` | Yes | Check eligibility |
| POST | `/family-leave/entitlements/:id/calculate-pay` | Yes | Calculate statutory pay |
| POST | `/family-leave/entitlements/:id/kit-day` | Yes | Record KIT/SPLIT day |
| PATCH | `/family-leave/entitlements/:id/curtail` | Yes | Curtail for ShPL conversion |
| GET | `/family-leave/entitlements/:id/pay-schedule` | Yes | Get pay schedule |
| POST | `/family-leave/entitlements/:id/notices` | Yes | Record formal notice |

---

### Parental Leave (`/api/v1/parental-leave`)

Unpaid parental leave entitlements and bookings (UK Employment Rights Act 1996).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/parental-leave/entitlements` | Yes | Register child for parental leave |
| GET | `/parental-leave/entitlements/:employeeId` | Yes | Get employee entitlements |
| POST | `/parental-leave/bookings` | Yes | Create parental leave booking |
| GET | `/parental-leave/bookings` | Yes | List bookings with filters |
| PATCH | `/parental-leave/bookings/:id/approve` | Yes | Approve booking |
| PATCH | `/parental-leave/bookings/:id/reject` | Yes | Reject booking |

---

### Flexible Working (`/api/v1/flexible-working`)

Flexible working requests under the Employment Relations (Flexible Working) Act 2023.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/flexible-working/requests` | Yes | Submit flexible working request |
| GET | `/flexible-working/requests` | Yes | List flexible working requests |
| GET | `/flexible-working/requests/:id` | Yes | Get request by ID |
| PATCH | `/flexible-working/requests/:id/consultation` | Yes | Schedule consultation |
| POST | `/flexible-working/requests/:id/consultations` | Yes | Record consultation meeting |
| GET | `/flexible-working/requests/:id/consultations` | Yes | List consultation records |
| GET | `/flexible-working/requests/:id/history` | Yes | Get request status history |
| PATCH | `/flexible-working/requests/:id/approve` | Yes | Approve request |
| PATCH | `/flexible-working/requests/:id/reject` | Yes | Reject request |
| PATCH | `/flexible-working/requests/:id/withdraw` | Yes | Withdraw request |
| POST | `/flexible-working/requests/:id/appeal` | Yes | Appeal rejection |
| PATCH | `/flexible-working/requests/:id/appeal/resolve` | Yes | Resolve appeal |
| PATCH | `/flexible-working/requests/:id/respond` | Yes | Combined approve/reject (deprecated) |
| GET | `/flexible-working/compliance-summary` | Yes | Get compliance summary |

---

### Return to Work (`/api/v1/return-to-work`)

Return-to-work interview management following absence periods.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/return-to-work/` | Yes | List interviews |
| GET | `/return-to-work/:id` | Yes | Get interview by ID |
| POST | `/return-to-work/` | Yes | Create interview |
| PUT | `/return-to-work/:id` | Yes | Update interview |
| PATCH | `/return-to-work/:id/complete` | Yes | Complete interview with assessment |

---

### Working Time Regulations (`/api/v1/wtr`)

UK Working Time Regulations 1998 monitoring, opt-outs, and alerts.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/wtr/compliance` | Yes | Compliance dashboard report |
| GET | `/wtr/alerts` | Yes | List WTR alerts |
| POST | `/wtr/alerts/:id/acknowledge` | Yes | Acknowledge alert |
| GET | `/wtr/opt-outs` | Yes | List opt-out agreements |
| POST | `/wtr/opt-outs` | Yes | Create opt-out agreement |
| POST | `/wtr/opt-outs/:id/revoke` | Yes | Revoke opt-out agreement |
| GET | `/wtr/employees/:employeeId/status` | Yes | Get individual working time status |

---

### Reasonable Adjustments (`/api/v1/reasonable-adjustments`)

Reasonable adjustment tracking per Equality Act 2010 (ss.20-22).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/reasonable-adjustments/` | Yes | Create adjustment request |
| GET | `/reasonable-adjustments/` | Yes | List adjustments |
| GET | `/reasonable-adjustments/due-reviews` | Yes | Get adjustments due for review |
| GET | `/reasonable-adjustments/:id` | Yes | Get adjustment by ID |
| PATCH | `/reasonable-adjustments/:id/assess` | Yes | Record assessment |
| PATCH | `/reasonable-adjustments/:id/decide` | Yes | Record decision |
| PATCH | `/reasonable-adjustments/:id/implement` | Yes | Mark as implemented |
| PATCH | `/reasonable-adjustments/:id/withdraw` | Yes | Withdraw request |

---

### Contract Amendments (`/api/v1/contract-amendments`)

Contract amendment management per Employment Rights Act 1996, s.4.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/contract-amendments/` | Yes | List contract amendments |
| GET | `/contract-amendments/:id` | Yes | Get amendment by ID |
| POST | `/contract-amendments/` | Yes | Create contract amendment |
| PUT | `/contract-amendments/:id` | Yes | Update contract amendment |
| PATCH | `/contract-amendments/:id/status` | Yes | Transition amendment status |

---

### Contract Statements (`/api/v1/contract-statements`)

UK Written Statements of Employment Particulars (Employment Rights Act 1996, s.1-7B).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/contract-statements/generate/:employeeId` | Yes | Generate written statement |
| GET | `/contract-statements/compliance` | Yes | Compliance status report |
| GET | `/contract-statements/` | Yes | List all statements |
| GET | `/contract-statements/:id` | Yes | Get statement by ID |
| PATCH | `/contract-statements/:id/issue` | Yes | Issue statement to employee |
| PATCH | `/contract-statements/:id/acknowledge` | Yes | Acknowledge receipt |

---

## GDPR & Data Protection

---

### Consent (`/api/v1/consent`)

GDPR consent purpose and record management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/consent/purposes` | Yes | List consent purposes |
| GET | `/consent/purposes/:id` | Yes | Get consent purpose |
| POST | `/consent/purposes` | Yes | Create consent purpose |
| PATCH | `/consent/purposes/:id` | Yes | Update consent purpose |
| GET | `/consent/records` | Yes | List consent records |
| POST | `/consent/records/grant` | Yes | Grant consent |
| POST | `/consent/records/withdraw` | Yes | Withdraw consent |
| GET | `/consent/employees/:employeeId/consents` | Yes | Get employee consents |
| GET | `/consent/employees/:employeeId/check/:purposeCode` | Yes | Check employee consent |
| GET | `/consent/dashboard` | Yes | Consent dashboard statistics |
| GET | `/consent/stale` | Yes | Find consents requiring re-consent |

---

### Data Breach (`/api/v1/data-breach`)

UK GDPR data breach notification workflow (Articles 33-34).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/data-breach/incidents` | Yes | Report a new data breach |
| GET | `/data-breach/incidents` | Yes | List data breaches |
| GET | `/data-breach/dashboard` | Yes | Get breach dashboard |
| GET | `/data-breach/incidents/:id` | Yes | Get data breach by ID |
| PATCH | `/data-breach/incidents/:id/assess` | Yes | Assess breach risk |
| POST | `/data-breach/incidents/:id/notify-ico` | Yes | Record ICO notification |
| POST | `/data-breach/incidents/:id/notify-subjects` | Yes | Record subject notifications |
| POST | `/data-breach/incidents/:id/timeline` | Yes | Add timeline entry |
| GET | `/data-breach/incidents/:id/timeline` | Yes | Get breach timeline |
| PATCH | `/data-breach/incidents/:id/close` | Yes | Close breach |

---

### Data Erasure (`/api/v1/data-erasure`)

GDPR Article 17 (Right to Erasure) request management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/data-erasure/requests` | Yes | List erasure requests |
| GET | `/data-erasure/requests/overdue` | Yes | Get overdue requests |
| POST | `/data-erasure/requests` | Yes | Create erasure request |
| GET | `/data-erasure/requests/:id` | Yes | Get erasure request detail |
| POST | `/data-erasure/requests/:id/approve` | Yes | Approve erasure request |
| POST | `/data-erasure/requests/:id/execute` | Yes | Execute anonymization |
| POST | `/data-erasure/requests/:id/complete` | Yes | Complete with certificate |
| POST | `/data-erasure/requests/:id/reject` | Yes | Reject erasure request |
| GET | `/data-erasure/requests/:id/audit-log` | Yes | Get erasure audit log |
| GET | `/data-erasure/employees/:employeeId/retention-conflicts` | Yes | Check retention conflicts |
| GET | `/data-erasure/requests/:id/certificate` | Yes | Generate erasure certificate |

---

### Data Retention (`/api/v1/data-retention`)

UK GDPR Article 5(1)(e) storage limitation policies and review execution.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/data-retention/policies` | Yes | Create retention policy |
| GET | `/data-retention/policies` | Yes | List retention policies |
| GET | `/data-retention/policies/:id` | Yes | Get retention policy |
| PATCH | `/data-retention/policies/:id` | Yes | Update retention policy |
| POST | `/data-retention/policies/seed-defaults` | Yes | Seed UK default policies |
| POST | `/data-retention/reviews/:policyId` | Yes | Execute retention review |
| GET | `/data-retention/reviews` | Yes | List retention reviews |
| POST | `/data-retention/exceptions` | Yes | Create retention exception (legal hold) |
| DELETE | `/data-retention/exceptions/:id` | Yes | Remove retention exception |
| GET | `/data-retention/dashboard` | Yes | Retention dashboard |
| GET | `/data-retention/policies/:id/expired-records` | Yes | Identify expired records |

---

### DSAR (`/api/v1/dsar`)

Data Subject Access Request management (UK GDPR Articles 15-20).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/dsar/requests/dashboard` | Yes | Get DSAR dashboard statistics |
| GET | `/dsar/requests/overdue` | Yes | List overdue DSARs |
| GET | `/dsar/requests` | Yes | List DSAR requests |
| POST | `/dsar/requests` | Yes | Create a new DSAR request |
| GET | `/dsar/requests/:id` | Yes | Get DSAR request detail |
| POST | `/dsar/requests/:id/verify-identity` | Yes | Verify data subject identity |
| POST | `/dsar/requests/:id/gather/:moduleName` | Yes | Gather data from a module |
| PATCH | `/dsar/requests/:id/data-items/:itemId` | Yes | Update a data item (redact/exclude) |
| POST | `/dsar/requests/:id/extend` | Yes | Extend DSAR deadline |
| POST | `/dsar/requests/:id/complete` | Yes | Complete DSAR request |
| POST | `/dsar/requests/:id/reject` | Yes | Reject DSAR request |
| GET | `/dsar/requests/:id/audit-log` | Yes | Get DSAR audit trail |

---

### Privacy Notices (`/api/v1/privacy-notices`)

UK GDPR privacy notice management and employee acknowledgement tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/privacy-notices/` | Yes | List privacy notices |
| GET | `/privacy-notices/outstanding` | Yes | List outstanding acknowledgements |
| GET | `/privacy-notices/compliance-summary` | Yes | Get compliance summary |
| GET | `/privacy-notices/:id` | Yes | Get privacy notice by ID |
| POST | `/privacy-notices/` | Yes | Create privacy notice |
| PATCH | `/privacy-notices/:id` | Yes | Update privacy notice |
| POST | `/privacy-notices/:id/acknowledge` | Yes | Acknowledge privacy notice |

---

## Payroll & Compensation

---

### Payroll (`/api/v1/payroll`)

Payroll run lifecycle, calculation, export, tax details, and payslip retrieval.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/payroll/runs` | Yes | Create payroll run |
| GET | `/payroll/runs` | Yes | List payroll runs |
| GET | `/payroll/runs/:id` | Yes | Get payroll run detail with lines |
| POST | `/payroll/runs/:id/calculate` | Yes | Calculate payroll |
| PATCH | `/payroll/runs/:id/approve` | Yes | Approve payroll run |
| POST | `/payroll/runs/:id/export` | Yes | Export payroll data (CSV/JSON) |
| PUT | `/payroll/employees/:id/tax-details` | Yes | Update employee tax details |
| GET | `/payroll/employees/:id/tax-details` | Yes | Get employee tax details |
| GET | `/payroll/employees/:id/payslips/:runId` | Yes | Get employee payslip |
| GET | `/payroll/pay-schedules` | Yes | List pay schedules |
| POST | `/payroll/pay-schedules` | Yes | Create pay schedule |
| GET | `/payroll/pay-schedules/:id` | Yes | Get pay schedule by ID |
| PUT | `/payroll/pay-schedules/:id` | Yes | Update pay schedule |
| POST | `/payroll/employees/:id/pay-assignment` | Yes | Assign employee to pay schedule |
| GET | `/payroll/employees/:id/pay-assignments` | Yes | Get employee pay assignments |
| GET | `/payroll/employees/:id/pay-assignment/current` | Yes | Get current pay assignment |

---

### Payroll Config (`/api/v1/payroll-config`)

Payroll configuration: pay schedules, employee pay assignments, and NI categories.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/payroll-config/pay-schedules` | Yes | List pay schedules |
| GET | `/payroll-config/pay-schedules/:id` | Yes | Get pay schedule by ID |
| POST | `/payroll-config/pay-schedules` | Yes | Create pay schedule |
| PUT | `/payroll-config/pay-schedules/:id` | Yes | Update pay schedule |
| GET | `/payroll-config/employees/:employeeId/pay-assignments` | Yes | List employee pay assignments |
| POST | `/payroll-config/pay-assignments` | Yes | Create employee pay assignment |
| GET | `/payroll-config/employees/:employeeId/ni-categories` | Yes | List employee NI categories |
| POST | `/payroll-config/ni-categories` | Yes | Create NI category record |

---

### Payslips (`/api/v1/payslips`)

Payslip template and payslip management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/payslips/templates` | Yes | List payslip templates |
| GET | `/payslips/templates/:id` | Yes | Get payslip template |
| POST | `/payslips/templates` | Yes | Create payslip template |
| PUT | `/payslips/templates/:id` | Yes | Update payslip template |
| GET | `/payslips/employee/:employeeId` | Yes | List payslips for employee |
| GET | `/payslips/:id` | Yes | Get payslip by ID |
| POST | `/payslips/` | Yes | Create/generate payslip |
| PATCH | `/payslips/:id/status` | Yes | Update payslip status |

---

### Deductions (`/api/v1/deductions`)

Deduction type catalogue and employee deduction assignments.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/deductions/types` | Yes | List deduction types |
| GET | `/deductions/types/:id` | Yes | Get deduction type by ID |
| POST | `/deductions/types` | Yes | Create deduction type |
| PUT | `/deductions/types/:id` | Yes | Update deduction type |
| GET | `/deductions/employee/:employeeId` | Yes | List employee deductions |
| GET | `/deductions/:id` | Yes | Get employee deduction |
| POST | `/deductions/` | Yes | Create employee deduction |
| PUT | `/deductions/:id` | Yes | Update employee deduction |

---

### Tax Codes (`/api/v1/tax-codes`)

Employee HMRC tax code management with effective dating.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/tax-codes/employee/:employeeId` | Yes | List tax codes for employee |
| GET | `/tax-codes/:id` | Yes | Get tax code by ID |
| POST | `/tax-codes/` | Yes | Create tax code |
| PUT | `/tax-codes/:id` | Yes | Update tax code |

---

### NMW (`/api/v1/nmw`)

National Minimum Wage / National Living Wage compliance management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/nmw/rates` | Yes | List NMW/NLW rates |
| POST | `/nmw/rates` | Yes | Create tenant-specific rate |
| POST | `/nmw/check/:employeeId` | Yes | Check employee NMW compliance |
| POST | `/nmw/check-all` | Yes | Bulk check all active employees |
| GET | `/nmw/compliance-report` | Yes | Get compliance report |

---

## HR Operations

---

### Agencies (`/api/v1/agencies`)

Recruitment agency and placement management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/agencies/` | Yes | List recruitment agencies |
| GET | `/agencies/:id` | Yes | Get agency by ID |
| POST | `/agencies/` | Yes | Create recruitment agency |
| PATCH | `/agencies/:id` | Yes | Update agency |
| DELETE | `/agencies/:id` | Yes | Delete agency |
| GET | `/agencies/:id/placements` | Yes | List agency placements |
| POST | `/agencies/:id/placements` | Yes | Create agency placement |
| PATCH | `/agencies/:id/placements/:placementId` | Yes | Update placement |

---

### Assessments (`/api/v1/assessments`)

Assessment templates and candidate assessment scheduling.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/assessments/templates` | Yes | List assessment templates |
| GET | `/assessments/templates/:id` | Yes | Get assessment template |
| POST | `/assessments/templates` | Yes | Create assessment template |
| PATCH | `/assessments/templates/:id` | Yes | Update assessment template |
| GET | `/assessments/candidate-assessments` | Yes | List candidate assessments |
| GET | `/assessments/candidate-assessments/:id` | Yes | Get candidate assessment |
| POST | `/assessments/candidate-assessments` | Yes | Schedule candidate assessment |
| POST | `/assessments/candidate-assessments/:id/record-result` | Yes | Record assessment result |
| POST | `/assessments/candidate-assessments/:id/cancel` | Yes | Cancel candidate assessment |

---

### Bank Details (`/api/v1`)

Employee bank detail management (sensitive data, restricted access).

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/bank-details` | Yes | List bank details for employee |
| GET | `/employees/:employeeId/bank-details/:id` | Yes | Get bank detail by ID |
| POST | `/employees/:employeeId/bank-details` | Yes | Create bank detail |
| PUT | `/employees/:employeeId/bank-details/:id` | Yes | Update bank detail |
| DELETE | `/employees/:employeeId/bank-details/:id` | Yes | Delete bank detail |

---

### Bank Holidays (`/api/v1/bank-holidays`)

Bank holiday configuration and bulk import.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/bank-holidays/` | Yes | List bank holidays |
| GET | `/bank-holidays/:id` | Yes | Get bank holiday by ID |
| POST | `/bank-holidays/` | Yes | Create bank holiday |
| PUT | `/bank-holidays/:id` | Yes | Update bank holiday |
| DELETE | `/bank-holidays/:id` | Yes | Delete bank holiday |
| POST | `/bank-holidays/import` | Yes | Bulk import bank holidays |

---

### DBS Checks (`/api/v1/dbs-checks`)

Disclosure and Barring Service check management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/dbs-checks/` | Yes | List DBS checks |
| GET | `/dbs-checks/:id` | Yes | Get DBS check by ID |
| POST | `/dbs-checks/` | Yes | Create DBS check |
| PATCH | `/dbs-checks/:id` | Yes | Update DBS check |
| POST | `/dbs-checks/:id/submit` | Yes | Submit DBS check |
| POST | `/dbs-checks/:id/record-result` | Yes | Record DBS result |

---

### Delegations (`/api/v1/delegations`)

Approval delegation management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/delegations/` | Yes | Create approval delegation |
| GET | `/delegations/` | Yes | List my delegations |
| GET | `/delegations/active` | Yes | Get active delegation |
| DELETE | `/delegations/:id` | Yes | Revoke delegation |
| GET | `/delegations/:id/log` | Yes | View delegation usage log |

---

### Diversity (`/api/v1/diversity`)

Voluntary diversity monitoring data under Equality Act 2010.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/diversity/me` | Yes | Get my diversity data |
| PUT | `/diversity/me` | Yes | Submit or update my diversity data |
| DELETE | `/diversity/me` | Yes | Withdraw my diversity data |
| GET | `/diversity/aggregate` | Yes | Get aggregate diversity statistics |
| GET | `/diversity/completion-rate` | Yes | Get diversity data completion rate |

---

### Emergency Contacts (`/api/v1`)

Employee emergency contact management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/emergency-contacts` | Yes | List contacts for employee |
| POST | `/employees/:employeeId/emergency-contacts` | Yes | Create emergency contact |
| PATCH | `/emergency-contacts/:id` | Yes | Update emergency contact |
| DELETE | `/emergency-contacts/:id` | Yes | Delete emergency contact |

---

### Employee Photos (`/api/v1`)

Employee profile photo metadata management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/employees/:employeeId/photos` | Yes | Get employee photo metadata |
| POST | `/employees/:employeeId/photos` | Yes | Upload (create/replace) photo |
| PATCH | `/employees/:employeeId/photos` | Yes | Update photo metadata |
| DELETE | `/employees/:employeeId/photos` | Yes | Delete photo |

---

### Equipment (`/api/v1/equipment`)

Equipment catalog and request management for provisioning.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/equipment/catalog` | Yes | List catalog items |
| POST | `/equipment/catalog` | Yes | Create catalog item |
| GET | `/equipment/catalog/:id` | Yes | Get catalog item |
| PATCH | `/equipment/catalog/:id` | Yes | Update catalog item |
| DELETE | `/equipment/catalog/:id` | Yes | Deactivate catalog item |
| GET | `/equipment/requests` | Yes | List equipment requests |
| POST | `/equipment/requests` | Yes | Create equipment request |
| GET | `/equipment/requests/:id` | Yes | Get request with history |
| PATCH | `/equipment/requests/:id/status` | Yes | Update request status |

---

### Geofence (`/api/v1/geofences`)

Geofence location management, proximity checks, and violation resolution.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/geofences/locations` | Yes | List geofence locations |
| GET | `/geofences/locations/:id` | Yes | Get geofence location |
| POST | `/geofences/locations` | Yes | Create geofence location |
| PATCH | `/geofences/locations/:id` | Yes | Update geofence location |
| DELETE | `/geofences/locations/:id` | Yes | Deactivate geofence location |
| GET | `/geofences/nearby` | Yes | Find nearby geofences |
| POST | `/geofences/check-location` | Yes | Check if location is within zone |
| GET | `/geofences/violations` | Yes | List violations |
| GET | `/geofences/violations/:id` | Yes | Get violation |
| POST | `/geofences/violations/:id/resolve` | Yes | Resolve violation |

---

### Headcount Planning (`/api/v1/headcount-planning`)

Headcount plan and plan item management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/headcount-planning/plans` | Yes | List headcount plans |
| GET | `/headcount-planning/plans/:id` | Yes | Get headcount plan |
| POST | `/headcount-planning/plans` | Yes | Create headcount plan |
| PATCH | `/headcount-planning/plans/:id` | Yes | Update headcount plan |
| POST | `/headcount-planning/plans/:id/approve` | Yes | Approve headcount plan |
| DELETE | `/headcount-planning/plans/:id` | Yes | Delete headcount plan |
| GET | `/headcount-planning/plans/:id/items` | Yes | List plan items |
| POST | `/headcount-planning/plans/:id/items` | Yes | Add plan item |
| PATCH | `/headcount-planning/plans/:id/items/:itemId` | Yes | Update plan item |
| DELETE | `/headcount-planning/plans/:id/items/:itemId` | Yes | Delete plan item |

---

### Health & Safety (`/api/v1/health-safety`)

Workplace health and safety: incidents (accident book), RIDDOR reporting, risk assessments, and DSE assessments.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/health-safety/dashboard` | Yes | Get H&S dashboard statistics |
| GET | `/health-safety/riddor-reports` | Yes | List RIDDOR-reportable incidents |
| GET | `/health-safety/incidents` | Yes | List incidents |
| POST | `/health-safety/incidents` | Yes | Report a new incident |
| GET | `/health-safety/incidents/:id` | Yes | Get incident details |
| PATCH | `/health-safety/incidents/:id` | Yes | Update an incident |
| POST | `/health-safety/incidents/:id/close` | Yes | Close an incident |
| GET | `/health-safety/risk-assessments` | Yes | List risk assessments |
| POST | `/health-safety/risk-assessments` | Yes | Create risk assessment |
| GET | `/health-safety/risk-assessments/:id` | Yes | Get risk assessment details |
| PATCH | `/health-safety/risk-assessments/:id` | Yes | Update risk assessment |
| POST | `/health-safety/risk-assessments/:id/approve` | Yes | Approve risk assessment |
| GET | `/health-safety/dse-assessments` | Yes | List DSE assessments |
| POST | `/health-safety/dse-assessments` | Yes | Create DSE assessment |
| GET | `/health-safety/dse-assessments/:id` | Yes | Get DSE assessment details |
| GET | `/health-safety/dse-assessments/employee/:employeeId` | Yes | Get DSE assessments for employee |

---

### Jobs (`/api/v1/jobs`)

Jobs catalog for position definitions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/jobs/` | Yes | List jobs with filters |
| GET | `/jobs/:id` | Yes | Get job by ID |
| POST | `/jobs/` | Yes | Create job |
| PUT | `/jobs/:id` | Yes | Update job |
| PATCH | `/jobs/:id/archive` | Yes | Archive job |

---

### Letter Templates (`/api/v1/letter-templates`)

Letter template management and letter generation with placeholder rendering.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/letter-templates/templates` | Yes | List letter templates |
| GET | `/letter-templates/templates/:id` | Yes | Get letter template |
| POST | `/letter-templates/templates` | Yes | Create letter template |
| PATCH | `/letter-templates/templates/:id` | Yes | Update letter template |
| POST | `/letter-templates/templates/:id/generate` | Yes | Generate letter from template |
| GET | `/letter-templates/generated` | Yes | List generated letters |
| GET | `/letter-templates/generated/:id` | Yes | Get generated letter |

---

### Reference Checks (`/api/v1/reference-checks`)

Employment reference check management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/reference-checks/` | Yes | List reference checks |
| GET | `/reference-checks/:id` | Yes | Get reference check by ID |
| POST | `/reference-checks/` | Yes | Create reference check |
| PATCH | `/reference-checks/:id` | Yes | Update reference check |
| POST | `/reference-checks/:id/send` | Yes | Send reference request |
| POST | `/reference-checks/:id/verify` | Yes | Verify reference check |

---

### Secondments (`/api/v1/secondments`)

Secondment management with status transitions.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/secondments/` | Yes | List secondments |
| GET | `/secondments/:id` | Yes | Get secondment by ID |
| POST | `/secondments/` | Yes | Create secondment |
| PATCH | `/secondments/:id` | Yes | Update secondment |
| POST | `/secondments/:id/transition` | Yes | Transition secondment status |

---

### Training Budgets (`/api/v1/training-budgets`)

Training budget management and expense tracking.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/training-budgets/budgets` | Yes | List training budgets |
| GET | `/training-budgets/budgets/:id` | Yes | Get training budget |
| POST | `/training-budgets/budgets` | Yes | Create training budget |
| PATCH | `/training-budgets/budgets/:id` | Yes | Update training budget |
| GET | `/training-budgets/expenses` | Yes | List training expenses |
| GET | `/training-budgets/expenses/:id` | Yes | Get training expense |
| POST | `/training-budgets/expenses` | Yes | Create training expense |
| PATCH | `/training-budgets/expenses/:id/status` | Yes | Update expense status |

---

### Gender Pay Gap (`/api/v1/gender-pay-gap`)

UK Gender Pay Gap reporting for organisations with 250+ employees.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/gender-pay-gap/reports` | Yes | Generate GPG report for year |
| POST | `/gender-pay-gap/calculate` | Yes | Calculate GPG with explicit snapshot date |
| GET | `/gender-pay-gap/reports` | Yes | List GPG reports |
| GET | `/gender-pay-gap/dashboard` | Yes | GPG dashboard with trends |
| GET | `/gender-pay-gap/reports/:id` | Yes | Get GPG report with all metrics |
| PATCH | `/gender-pay-gap/reports/:id/publish` | Yes | Publish GPG report |

---

## Learning & Notifications

---

### CPD (`/api/v1/cpd`)

Continuing Professional Development record management.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/cpd/records` | Yes | List CPD records |
| GET | `/cpd/records/:id` | Yes | Get CPD record by ID |
| POST | `/cpd/records` | Yes | Create CPD record |
| PATCH | `/cpd/records/:id` | Yes | Update CPD record |
| POST | `/cpd/records/:id/verify` | Yes | Verify CPD record |
| DELETE | `/cpd/records/:id` | Yes | Delete CPD record |

---

### Course Ratings (`/api/v1/course-ratings`)

Course rating and review management for the LMS.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/course-ratings/course/:courseId` | Yes | List ratings for a course |
| GET | `/course-ratings/summary/:courseId` | Yes | Get rating summary for a course |
| POST | `/course-ratings/` | Yes | Submit a course rating |

---

### Notifications (`/api/v1/notifications`)

User-scoped notification management and push token registration.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/notifications/` | Yes | List user's notifications |
| GET | `/notifications/unread-count` | Yes | Get unread notification count |
| GET | `/notifications/push-tokens` | Yes | List push tokens |
| POST | `/notifications/push-tokens` | Yes | Register push token |
| DELETE | `/notifications/push-tokens/:id` | Yes | Remove push token |
| POST | `/notifications/read-all` | Yes | Mark all as read |
| GET | `/notifications/:id` | Yes | Get notification by ID |
| POST | `/notifications/:id/read` | Yes | Mark notification as read |
| POST | `/notifications/:id/dismiss` | Yes | Dismiss notification |
| DELETE | `/notifications/:id` | Yes | Delete notification |

---

### Reports (`/api/v1/reports`)

Reporting engine: CRUD, execution, export, field catalog, favourites, and scheduling.

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/reports/fields` | Yes | Get field catalog |
| GET | `/reports/fields/categories` | Yes | Get field categories |
| GET | `/reports/fields/:fieldKey/values` | Yes | Get distinct values for field |
| GET | `/reports/templates` | Yes | List system report templates |
| POST | `/reports/templates/:id/create` | Yes | Create report from template |
| GET | `/reports/favourites` | Yes | List favourite reports |
| GET | `/reports/scheduled` | Yes | List scheduled reports |
| GET | `/reports/` | Yes | List reports |
| POST | `/reports/` | Yes | Create report |
| GET | `/reports/:id` | Yes | Get report by ID |
| PUT | `/reports/:id` | Yes | Update report |
| DELETE | `/reports/:id` | Yes | Delete report |
| POST | `/reports/:id/duplicate` | Yes | Duplicate report |
| POST | `/reports/:id/publish` | Yes | Publish report |
| POST | `/reports/:id/archive` | Yes | Archive report |
| POST | `/reports/:id/execute` | Yes | Execute report |
| POST | `/reports/:id/execute/preview` | Yes | Preview report execution |
| GET | `/reports/:id/executions` | Yes | List past executions |
| POST | `/reports/:id/export/:format` | Yes | Export report |
| POST | `/reports/:id/favourite` | Yes | Add to favourites |
| DELETE | `/reports/:id/favourite` | Yes | Remove from favourites |
| POST | `/reports/:id/share` | Yes | Share report |
| POST | `/reports/:id/schedule` | Yes | Schedule report |
| DELETE | `/reports/:id/schedule` | Yes | Remove schedule |

---

## Portal

---

### Client Portal (`/api/v1/client-portal`)

Customer-facing portal API. Authentication via BetterAuth; portal users are linked by BetterAuth user ID.

#### Auth

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/auth/me` | Yes | Get current portal user profile |

#### Dashboard

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/dashboard` | Portal | Get dashboard data |

#### Tickets

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/tickets` | Portal | List my tickets |
| POST | `/client-portal/tickets` | Portal | Create ticket |
| GET | `/client-portal/tickets/:id` | Portal | Get ticket by ID |
| POST | `/client-portal/tickets/:id/messages` | Portal | Reply to ticket |

#### Documents

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/documents` | Portal | List documents |
| GET | `/client-portal/documents/:id` | Portal | Get document by ID |
| POST | `/client-portal/documents/:id/acknowledge` | Portal | Acknowledge document |

#### News

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/news` | Portal | List news articles |
| GET | `/client-portal/news/:slug` | Portal | Get news article by slug |

#### Billing

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/billing` | Portal | Get billing overview |
| GET | `/client-portal/billing/invoices` | Portal | List invoices |
| GET | `/client-portal/billing/invoices/:id` | Portal | Get invoice by ID |

#### Admin (requires portal admin role)

| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/client-portal/admin/tickets` | Admin | List all tickets |
| PATCH | `/client-portal/admin/tickets/:id` | Admin | Update ticket |
| GET | `/client-portal/admin/users` | Admin | List portal users |
| POST | `/client-portal/admin/users` | Admin | Create portal user |
| GET | `/client-portal/admin/users/:id` | Admin | Get portal user |
| PATCH | `/client-portal/admin/users/:id` | Admin | Update portal user |
| POST | `/client-portal/admin/documents` | Admin | Create document |
| PATCH | `/client-portal/admin/documents/:id` | Admin | Update document |
| DELETE | `/client-portal/admin/documents/:id` | Admin | Delete document |
| POST | `/client-portal/admin/news` | Admin | Create news article |
| PATCH | `/client-portal/admin/news/:id` | Admin | Update news article |
| DELETE | `/client-portal/admin/news/:id` | Admin | Delete news article |

---

## Related Documentation

- [Error Codes](ERROR_CODES.md) — All error codes by module
- [Security Patterns](../patterns/SECURITY.md) — Authentication and authorization
- [Architecture Overview](../architecture/ARCHITECTURE.md) — System design context
