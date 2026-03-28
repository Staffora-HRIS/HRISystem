# Staffora API Reference

> Comprehensive API reference for all 120 backend modules in the Staffora HRIS platform.
>
> **Base URL:** `/api/v1`
> **Authentication:** All endpoints require a valid session (BetterAuth) unless noted otherwise.
> **Idempotency:** All mutating endpoints (POST/PUT/PATCH/DELETE) require an `Idempotency-Key` header.
> **Pagination:** Cursor-based via `?cursor=&limit=` query parameters.
> **Error shape:** `{ error: { code, message, details?, requestId } }`

*Last updated: 2026-03-28*

**Total modules:** 120
**Total endpoints:** ~760 (across 113 modules with routes)
**Service-only modules (no routes):** 7

---

## Table of Contents

- [Core HR Modules](#core-hr-modules)
  - [HR (Core)](#hr-core) | [Jobs](#jobs) | [Cost Centre Assignments](#cost-centre-assignments)
  - [Probation](#probation) | [Secondments](#secondments) | [Contract Amendments](#contract-amendments)
  - [Contract Statements](#contract-statements) | [Lookup Values](#lookup-values)
- [Time & Scheduling](#time--scheduling)
  - [Time & Attendance](#time--attendance) | [Shift Swaps](#shift-swaps) | [TOIL](#toil)
  - [Overtime Requests](#overtime-requests) | [Overtime Rules](#overtime-rules)
  - [Overtime](#overtime-service-only) | [Calendar Sync](#calendar-sync) | [Geofence](#geofence)
- [Absence Management](#absence-management)
  - [Absence](#absence) | [Sickness Analytics](#sickness-analytics)
- [Talent & Learning](#talent--learning)
  - [Talent (Performance)](#talent-performance) | [Talent Pools](#talent-pools)
  - [Feedback 360](#feedback-360) | [Competencies](#competencies) | [Succession](#succession)
  - [LMS](#lms) | [Course Ratings](#course-ratings) | [CPD](#cpd) | [Training Budgets](#training-budgets)
  - [Recognition](#recognition) | [One-on-Ones](#one-on-ones-service-only)
- [Recruitment & Onboarding](#recruitment--onboarding)
  - [Recruitment](#recruitment) | [Assessments](#assessments) | [Job Boards](#job-boards)
  - [Offer Letters](#offer-letters) | [Background Checks](#background-checks)
  - [Reference Checks](#reference-checks) | [Agencies](#agencies)
  - [Onboarding](#onboarding) | [DBS Checks](#dbs-checks)
- [UK Compliance Modules](#uk-compliance-modules)
  - [Right to Work](#right-to-work) | [SSP](#ssp) | [Statutory Leave](#statutory-leave)
  - [Family Leave](#family-leave) | [Parental Leave](#parental-leave) | [Bereavement](#bereavement)
  - [Carer's Leave](#carers-leave) | [Flexible Working](#flexible-working)
  - [Gender Pay Gap](#gender-pay-gap) | [NMW/NLW](#nmwnlw)
  - [Working Time Regulations](#working-time-regulations) | [Health & Safety](#health--safety)
  - [Warnings](#warnings) | [Reasonable Adjustments](#reasonable-adjustments)
  - [Return to Work](#return-to-work) | [Bank Holidays](#bank-holidays)
  - [Tribunal](#tribunal) | [TUPE](#tupe) | [Whistleblowing](#whistleblowing)
  - [IR35](#ir35-service-only) | [Suspensions](#suspensions-service-only)
- [GDPR & Data Privacy](#gdpr--data-privacy)
  - [DSAR](#dsar) | [Data Erasure](#data-erasure) | [Data Breach](#data-breach)
  - [Data Retention](#data-retention) | [Data Archival](#data-archival)
  - [Consent](#consent) | [Privacy Notices](#privacy-notices) | [DPIA](#dpia)
  - [ROPA](#ropa-service-only)
- [Payroll & Finance](#payroll--finance)
  - [Payroll](#payroll) | [Payroll Config](#payroll-config) | [Payroll Submissions](#payroll-submissions)
  - [Payroll Period Lock](#payroll-period-lock) | [P45/P60](#p45p60)
  - [Payslips](#payslips) | [Tax Codes](#tax-codes) | [Pension](#pension)
  - [Salary Sacrifice](#salary-sacrifice) | [Deductions](#deductions)
  - [Total Reward](#total-reward) | [Income Protection](#income-protection)
- [Benefits](#benefits)
  - [Benefits (Core)](#benefits-core) | [Benefits Plans](#benefits-plans) | [Benefits Carriers](#benefits-carriers)
  - [Benefits Enrollment](#benefits-enrollment) | [Flex Fund](#flex-fund) | [Life Events](#life-events)
  - [Benefits Exchange](#benefits-exchange) | [Beneficiary Nominations](#beneficiary-nominations)
- [Employee Self-Service](#employee-self-service)
  - [Portal](#portal) | [Client Portal](#client-portal)
  - [Employee Change Requests](#employee-change-requests) | [Personal Detail Changes](#personal-detail-changes)
  - [Diversity](#diversity) | [Employee Photos](#employee-photos) | [Emergency Contacts](#emergency-contacts)
  - [Bank Details](#bank-details) | [Announcements](#announcements) | [Notifications](#notifications)
  - [Policy Distribution](#policy-distribution) | [Delegations](#delegations)
  - [Equipment](#equipment) | [E-Signatures](#e-signatures) | [Email Tracking](#email-tracking)
- [Document Management](#document-management)
  - [Documents](#documents) | [Bulk Document Generation](#bulk-document-generation)
  - [Letter Templates](#letter-templates)
- [Operations & Admin](#operations--admin)
  - [Auth](#auth) | [SSO](#sso) | [Security / RBAC](#security--rbac) | [Field Permissions](#field-permissions)
  - [Security Portal](#security-portal) | [Security Inspection](#security-inspection)
  - [Manager Hub](#manager-hub) | [Dashboard](#dashboard)
  - [System](#system) | [Usage Stats](#usage-stats) | [Tenant](#tenant) | [Tenant Provisioning](#tenant-provisioning)
  - [Feature Flags](#feature-flags) | [Webhooks](#webhooks) | [Integrations](#integrations)
  - [API Keys](#api-keys) | [Reports](#reports) | [Bulk Operations](#bulk-operations)
  - [Data Import](#data-import) | [Analytics](#analytics) | [Recruitment Analytics](#recruitment-analytics)
  - [Headcount Planning](#headcount-planning) | [Global Mobility](#global-mobility)
  - [Workflows](#workflows) | [Cases](#cases) | [Admin Jobs](#admin-jobs-service-only)
  - [Agency Workers](#agency-workers-service-only)

---

## Core HR Modules

### HR (Core)

**Prefix:** `/api/v1/hr`

The primary module for employee management, organisational structure, positions, contracts, and compensation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/hr/dashboard` | Get HR dashboard statistics | Yes |
| GET | `/hr/org-units` | List org units | Yes |
| GET | `/hr/org-units/hierarchy` | Get org unit hierarchy | Yes |
| GET | `/hr/org-units/:id` | Get org unit by ID | Yes |
| POST | `/hr/org-units` | Create org unit | Yes |
| PUT | `/hr/org-units/:id` | Update org unit | Yes |
| DELETE | `/hr/org-units/:id` | Delete org unit | Yes |
| GET | `/hr/positions` | List positions | Yes |
| GET | `/hr/positions/:id` | Get position by ID | Yes |
| POST | `/hr/positions` | Create position | Yes |
| PUT | `/hr/positions/:id` | Update position | Yes |
| DELETE | `/hr/positions/:id` | Delete position | Yes |
| GET | `/hr/employees` | List employees | Yes |
| GET | `/hr/employees/by-number/:employeeNumber` | Get employee by employee number | Yes |
| GET | `/hr/employees/:id` | Get employee by ID | Yes |
| POST | `/hr/employees` | Hire employee | Yes |
| PUT | `/hr/employees/:id/personal` | Update personal info | Yes |
| PUT | `/hr/employees/:id/contract` | Update contract | Yes |
| PUT | `/hr/employees/:id/transfer` | Transfer or promote employee | Yes |
| PUT | `/hr/employees/:id/compensation` | Change compensation | Yes |
| PUT | `/hr/employees/:id/manager` | Change manager | Yes |
| POST | `/hr/employees/:id/transition` | Transition status | Yes |
| POST | `/hr/employees/:id/terminate` | Terminate employee | Yes |
| POST | `/hr/employees/:id/rehire` | Rehire terminated employee | Yes |
| PATCH | `/hr/employees/:id/ni-category` | Update employee NI category | Yes |
| GET | `/hr/org-chart` | Get org chart data | Yes |
| GET | `/hr/employees/:id/direct-reports` | Get direct reports | Yes |
| GET | `/hr/employees/:id/reporting-chain` | Get reporting chain | Yes |
| GET | `/hr/employees/:id/notice-period` | Get statutory notice period | Yes |
| GET | `/hr/employees/:id/history` | Get employee history | Yes |
| GET | `/hr/employees/:id/addresses` | List current addresses | Yes |
| GET | `/hr/employees/:id/addresses/history` | Get address history | Yes |
| GET | `/hr/addresses/:id` | Get address by ID | Yes |
| POST | `/hr/employees/:id/addresses` | Create address | Yes |
| PUT | `/hr/addresses/:id` | Update address | Yes |
| DELETE | `/hr/addresses/:id` | Close address | Yes |
| GET | `/hr/employees/:id/positions` | Get employee positions | Yes |
| POST | `/hr/employees/:id/positions` | Assign additional position | Yes |
| DELETE | `/hr/position-assignments/:id` | End position assignment | Yes |

**Key request schemas:**
- Hire employee: `{ firstName, lastName, email, dateOfBirth, gender, startDate, contractType, orgUnitId, positionId, salary, currency, niNumber }`
- Transfer: `{ orgUnitId?, positionId?, effectiveFrom, reason }`
- Compensation: `{ salary, currency, effectiveFrom, reason }`

---

### Jobs

**Prefix:** `/api/v1/jobs`

Job catalogue management (job titles, grades, descriptions).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/jobs` | List jobs | Yes |
| GET | `/jobs/:id` | Get job by ID | Yes |
| POST | `/jobs` | Create job | Yes |
| PUT | `/jobs/:id` | Update job | Yes |
| PATCH | `/jobs/:id/archive` | Archive job | Yes |

**Key request schemas:**
- Create job: `{ title, code, grade, family, description, isActive }`

---

### Cost Centre Assignments

**Prefix:** `/api/v1/cost-centre-assignments`

Assign cost centres to employees, departments, or other entities.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cost-centre-assignments` | List cost centre assignments | Yes |
| GET | `/cost-centre-assignments/entity/:entityType/:entityId` | Get cost centre assignment history for an entity | Yes |
| GET | `/cost-centre-assignments/:id` | Get cost centre assignment by ID | Yes |
| POST | `/cost-centre-assignments` | Create cost centre assignment | Yes |
| PATCH | `/cost-centre-assignments/:id` | Update cost centre assignment | Yes |

---

### Probation

**Prefix:** `/api/v1/probation`

Manage employee probation periods and reviews.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/probation` | List probation reviews | Yes |
| GET | `/probation/upcoming` | List upcoming probation reviews | Yes |
| GET | `/probation/overdue` | List overdue probation reviews | Yes |
| GET | `/probation/:id` | Get probation review by ID | Yes |
| POST | `/probation` | Create probation review | Yes |
| PATCH | `/probation/:id/extend` | Extend probation period | Yes |
| PATCH | `/probation/:id/complete` | Complete probation review | Yes |

---

### Secondments

**Prefix:** `/api/v1/secondments`

Manage employee secondments (temporary internal transfers).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/secondments` | List secondments | Yes |
| GET | `/secondments/:id` | Get secondment by ID | Yes |
| POST | `/secondments` | Create secondment | Yes |
| PATCH | `/secondments/:id` | Update secondment | Yes |
| POST | `/secondments/:id/transition` | Transition secondment status | Yes |

---

### Contract Amendments

**Prefix:** `/api/v1/contract-amendments`

Track and manage changes to employment contracts.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/contract-amendments` | List contract amendments | Yes |
| GET | `/contract-amendments/:id` | Get contract amendment by ID | Yes |
| POST | `/contract-amendments` | Create contract amendment | Yes |
| PUT | `/contract-amendments/:id` | Update contract amendment | Yes |
| PATCH | `/contract-amendments/:id/transition` | Transition amendment status | Yes |

---

### Contract Statements

**Prefix:** `/api/v1/contract-statements`

UK Employment Rights Act 1996 section 1 written statement of particulars.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/contract-statements/generate/:employeeId` | Generate written statement for employee | Yes |
| GET | `/contract-statements/compliance` | Compliance status report | Yes |
| GET | `/contract-statements` | List all statements | Yes |
| GET | `/contract-statements/:id` | Get statement by ID | Yes |
| PATCH | `/contract-statements/:id/issue` | Issue statement | Yes |
| PATCH | `/contract-statements/:id/acknowledge` | Acknowledge statement | Yes |

---

### Lookup Values

**Prefix:** `/api/v1/lookup-values`

Manage configurable lookup categories and values (e.g., employment types, leave reasons).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/lookup-values/categories` | List lookup categories | Yes |
| POST | `/lookup-values/categories` | Create lookup category | Yes |
| GET | `/lookup-values/categories/:id` | Get lookup category | Yes |
| PATCH | `/lookup-values/categories/:id` | Update lookup category | Yes |
| DELETE | `/lookup-values/categories/:id` | Delete lookup category | Yes |
| GET | `/lookup-values/categories/:categoryId/values` | List lookup values for category | Yes |
| POST | `/lookup-values/values` | Create lookup value | Yes |
| GET | `/lookup-values/values/:id` | Get lookup value by ID | Yes |
| PATCH | `/lookup-values/values/:id` | Update lookup value | Yes |
| DELETE | `/lookup-values/values/:id` | Delete lookup value | Yes |
| GET | `/lookup-values/by-code/:code` | Get values by category code | Yes |
| POST | `/lookup-values/seed` | Seed default lookup categories | Yes |

---

## Time & Scheduling

### Time & Attendance

**Prefix:** `/api/v1/time`

Time policies, events (clock in/out), schedules, shifts, and timesheets with multi-level approval.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/time/policies` | Create time policy | Yes |
| GET | `/time/policies` | List time policies | Yes |
| GET | `/time/policies/:id` | Get time policy by ID | Yes |
| PUT | `/time/policies/:id` | Update time policy | Yes |
| DELETE | `/time/policies/:id` | Deactivate time policy | Yes |
| POST | `/time/events` | Record time event | Yes |
| GET | `/time/events` | List time events | Yes |
| GET | `/time/events/:id` | Get time event by ID | Yes |
| POST | `/time/schedules` | Create schedule | Yes |
| GET | `/time/schedules` | List schedules | Yes |
| GET | `/time/schedules/:id` | Get schedule by ID | Yes |
| PUT | `/time/schedules/:id` | Update schedule | Yes |
| POST | `/time/shifts` | Create shift | Yes |
| GET | `/time/shifts/:id` | Get shift by ID | Yes |
| PUT | `/time/shifts/:id` | Update shift | Yes |
| POST | `/time/timesheets` | Create timesheet | Yes |
| GET | `/time/timesheets` | List timesheets | Yes |
| GET | `/time/timesheets/:id` | Get timesheet by ID | Yes |
| PUT | `/time/timesheets/:id/lines` | Update timesheet lines | Yes |
| POST | `/time/timesheets/:id/submit` | Submit timesheet | Yes |
| POST | `/time/timesheets/:id/approve` | Approve or reject timesheet | Yes |
| POST | `/time/timesheets/:id/submit-chain` | Submit timesheet with multi-level approval chain | Yes |
| GET | `/time/timesheets/:id/approval-chain` | Get approval chain for a timesheet | Yes |
| POST | `/time/timesheets/:id/chain-approve` | Approve or reject at your level in the approval chain | Yes |
| GET | `/time/timesheets/pending-approval` | List timesheets pending your approval | Yes |
| GET | `/time/schedule-assignments` | List schedule assignments | Yes |
| GET | `/time/statistics` | Get time statistics | Yes |

**Additional route file:** `time/overtime-request-routes.ts`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/time/overtime-requests` | Submit overtime authorisation request | Yes |
| GET | `/time/overtime-requests/mine` | List own overtime requests | Yes |
| GET | `/time/overtime-requests/pending` | List pending overtime requests (manager) | Yes |
| GET | `/time/overtime-requests/:id` | Get overtime request by ID | Yes |
| POST | `/time/overtime-requests/:id/approve` | Approve overtime request | Yes |
| POST | `/time/overtime-requests/:id/reject` | Reject overtime request | Yes |
| POST | `/time/overtime-requests/:id/cancel` | Cancel overtime request | Yes |

---

### Shift Swaps

**Prefix:** `/api/v1/shift-swaps`

Two-phase shift swap approval: target employee accepts, then manager approves.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/shift-swaps` | Request a shift swap | Yes |
| GET | `/shift-swaps` | List shift swap requests | Yes |
| GET | `/shift-swaps/:id` | Get shift swap request by ID | Yes |
| POST | `/shift-swaps/:id/accept` | Accept a shift swap request (target employee) | Yes |
| POST | `/shift-swaps/:id/reject` | Reject a shift swap request (target employee) | Yes |
| POST | `/shift-swaps/:id/manager-approve` | Approve a shift swap request (manager) | Yes |
| POST | `/shift-swaps/:id/manager-reject` | Reject a shift swap request (manager) | Yes |
| POST | `/shift-swaps/:id/cancel` | Cancel a shift swap request (requester) | Yes |

---

### TOIL

**Prefix:** `/api/v1/toil`

Time Off In Lieu - accrue and use compensatory time for overtime worked.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/toil/balances` | List TOIL balances | Yes |
| POST | `/toil/balances` | Create TOIL balance period | Yes |
| GET | `/toil/balances/:id` | Get TOIL balance by ID | Yes |
| GET | `/toil/balances/employee/:employeeId/current` | Get current TOIL balance for employee | Yes |
| POST | `/toil/accrue` | Accrue TOIL hours for overtime worked | Yes |
| POST | `/toil/request` | Request to use TOIL hours | Yes |
| GET | `/toil/transactions` | List TOIL transactions | Yes |
| GET | `/toil/transactions/:id` | Get TOIL transaction by ID | Yes |

---

### Overtime Requests

**Prefix:** `/api/v1/overtime-requests`

Standalone overtime request approval workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/overtime-requests` | Submit overtime request | Yes |
| GET | `/overtime-requests/mine` | List my overtime requests | Yes |
| GET | `/overtime-requests/pending` | List pending overtime requests (manager) | Yes |
| GET | `/overtime-requests/:id` | Get overtime request by ID | Yes |
| PATCH | `/overtime-requests/:id/approve` | Approve overtime request | Yes |
| PATCH | `/overtime-requests/:id/reject` | Reject overtime request | Yes |
| PATCH | `/overtime-requests/:id/cancel` | Cancel overtime request | Yes |

---

### Overtime Rules

**Prefix:** `/api/v1/overtime-rules`

Configure overtime calculation rules and run calculations.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/overtime-rules` | Create an overtime rule | Yes |
| GET | `/overtime-rules` | List overtime rules | Yes |
| GET | `/overtime-rules/:id` | Get overtime rule by ID | Yes |
| PUT | `/overtime-rules/:id` | Update an overtime rule | Yes |
| DELETE | `/overtime-rules/:id` | Delete an overtime rule | Yes |
| GET | `/overtime-rules/calculations` | List overtime calculations | Yes |
| GET | `/overtime-rules/calculations/:id` | Get overtime calculation by ID | Yes |
| POST | `/overtime-rules/calculations/:id/approve` | Approve an overtime calculation | Yes |
| POST | `/overtime-rules/calculations/batch` | Batch calculate overtime | Yes |
| POST | `/overtime-rules/calculations/employee` | Calculate overtime for an employee | Yes |

---

### Overtime (Service-only)

**Module:** `overtime`

No HTTP routes. Provides shared overtime calculation logic used by other modules.

---

### Calendar Sync

**Prefix:** `/api/v1/calendar`

iCal feed generation and calendar connection management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/calendar/feed/:token` | Get iCal feed by token (public, no auth) | **No** |
| GET | `/calendar/connections` | List calendar connections for current user | Yes |
| POST | `/calendar/connections` | Enable iCal feed for current user | Yes |
| POST | `/calendar/connections/regenerate` | Regenerate iCal feed token | Yes |
| DELETE | `/calendar/connections` | Disable iCal feed | Yes |

---

### Geofence

**Prefix:** `/api/v1/geofences`

Location-based attendance enforcement with geofence zones.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/geofences` | List geofence locations | Yes |
| GET | `/geofences/:id` | Get geofence location by ID | Yes |
| POST | `/geofences` | Create geofence location | Yes |
| PATCH | `/geofences/:id` | Update geofence location | Yes |
| DELETE | `/geofences/:id` | Deactivate geofence location | Yes |
| GET | `/geofences/nearby` | Find nearby geofences for coordinates | Yes |
| POST | `/geofences/check` | Check if location is within a geofence zone | Yes |
| GET | `/geofences/violations` | List geofence violations | Yes |
| GET | `/geofences/violations/:id` | Get geofence violation by ID | Yes |
| POST | `/geofences/violations/:id/resolve` | Resolve a geofence violation | Yes |

---

## Absence Management

### Absence

**Prefix:** `/api/v1/absence`

Leave types, policies, requests (with approval workflow), balances, and Bradford Factor.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/absence/leave-types` | List leave types | Yes |
| POST | `/absence/leave-types` | Create leave type | Yes |
| GET | `/absence/leave-types/:id` | Get leave type by ID | Yes |
| PUT | `/absence/leave-types/:id` | Update leave type | Yes |
| DELETE | `/absence/leave-types/:id` | Delete (deactivate) leave type | Yes |
| GET | `/absence/policies` | List leave policies | Yes |
| POST | `/absence/policies` | Create leave policy | Yes |
| PUT | `/absence/policies/:id` | Update leave policy | Yes |
| DELETE | `/absence/policies/:id` | Delete (deactivate) leave policy | Yes |
| GET | `/absence/requests` | List leave requests | Yes |
| POST | `/absence/requests` | Create leave request | Yes |
| GET | `/absence/requests/:id` | Get leave request by ID | Yes |
| POST | `/absence/requests/:id/submit` | Submit leave request | Yes |
| POST | `/absence/requests/:id/approve` | Approve or reject leave request | Yes |
| DELETE | `/absence/requests/:id` | Cancel leave request | Yes |
| GET | `/absence/balances/:employeeId` | Get employee leave balances | Yes |
| GET | `/absence/bradford-factor/:employeeId` | Get employee Bradford Factor score | Yes |

**Key request schemas:**
- Create leave request: `{ employeeId, leaveTypeId, startDate, endDate, halfDay?, notes? }`
- Approve/reject: `{ action: "approve"|"reject", comments? }`

**State machine:** `draft -> pending -> approved | rejected | cancelled`

---

### Sickness Analytics

**Prefix:** `/api/v1/analytics/sickness`

Dedicated sickness absence analytics and trend analysis.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/analytics/sickness/trends` | Get sickness absence trends | Yes |
| GET | `/analytics/sickness/by-reason` | Get sickness absence by reason | Yes |
| GET | `/analytics/sickness/by-department` | Get sickness absence by department | Yes |
| GET | `/analytics/sickness/seasonal-patterns` | Get sickness seasonal patterns | Yes |
| GET | `/analytics/sickness/summary` | Get sickness absence summary | Yes |

---

## Talent & Learning

### Talent (Performance)

**Prefix:** `/api/v1/talent`

Goals, performance review cycles, reviews, and competencies.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/talent/goals` | List goals | Yes |
| GET | `/talent/goals/:id` | Get goal by ID | Yes |
| POST | `/talent/goals` | Create goal | Yes |
| PATCH | `/talent/goals/:id` | Update goal | Yes |
| DELETE | `/talent/goals/:id` | Delete goal | Yes |
| GET | `/talent/review-cycles` | List review cycles | Yes |
| GET | `/talent/review-cycles/:id` | Get review cycle by ID | Yes |
| POST | `/talent/review-cycles` | Create review cycle | Yes |
| GET | `/talent/reviews` | List reviews | Yes |
| GET | `/talent/reviews/:id` | Get review by ID | Yes |
| POST | `/talent/reviews` | Create review | Yes |
| POST | `/talent/reviews/:id/self-review` | Submit self review | Yes |
| POST | `/talent/reviews/:id/manager-review` | Submit manager review | Yes |
| GET | `/talent/competencies` | List competencies | Yes |
| GET | `/talent/competencies/:id` | Get competency by ID | Yes |
| POST | `/talent/competencies` | Create competency | Yes |

**State machine (performance cycle):** `draft -> active -> review -> calibration -> completed`

---

### Talent Pools

**Prefix:** `/api/v1/talent-pools`

Manage curated pools of high-potential employees for succession and development.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/talent-pools` | List talent pools | Yes |
| POST | `/talent-pools` | Create talent pool | Yes |
| GET | `/talent-pools/:id` | Get talent pool by ID | Yes |
| PATCH | `/talent-pools/:id` | Update talent pool | Yes |
| DELETE | `/talent-pools/:id` | Delete talent pool | Yes |
| GET | `/talent-pools/:id/members` | List pool members | Yes |
| POST | `/talent-pools/:id/members` | Add member to pool | Yes |
| PATCH | `/talent-pools/:id/members/:memberId` | Update pool member | Yes |
| DELETE | `/talent-pools/:id/members/:memberId` | Remove pool member | Yes |

---

### Feedback 360

**Prefix:** `/api/v1/feedback-360`

Multi-rater (360-degree) feedback cycles.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/feedback-360/cycles` | List 360 feedback cycles | Yes |
| GET | `/feedback-360/cycles/:id` | Get 360 feedback cycle by ID | Yes |
| POST | `/feedback-360/cycles` | Create 360 feedback cycle | Yes |
| PATCH | `/feedback-360/cycles/:id` | Update 360 feedback cycle | Yes |
| POST | `/feedback-360/cycles/:id/nominate` | Nominate reviewers | Yes |
| GET | `/feedback-360/cycles/:id/responses` | List cycle responses | Yes |
| GET | `/feedback-360/cycles/:id/results` | Get aggregated 360 results | Yes |
| POST | `/feedback-360/responses` | Submit 360 feedback | Yes |
| POST | `/feedback-360/responses/:id/decline` | Decline 360 feedback | Yes |

---

### Competencies

**Prefix:** `/api/v1/competencies`

Competency library, job competency profiles, and employee competency assessments.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/competencies` | List competencies | Yes |
| GET | `/competencies/:id` | Get competency by ID | Yes |
| POST | `/competencies` | Create competency | Yes |
| PATCH | `/competencies/:id` | Update competency | Yes |
| DELETE | `/competencies/:id` | Delete competency | Yes |
| GET | `/competencies/jobs/:jobId` | List job competencies | Yes |
| POST | `/competencies/jobs` | Create job competency | Yes |
| PATCH | `/competencies/jobs/:id` | Update job competency | Yes |
| DELETE | `/competencies/jobs/:id` | Delete job competency | Yes |
| GET | `/competencies/employees/:employeeId` | List employee competencies | Yes |
| GET | `/competencies/employees/:employeeId/gap-analysis` | Employee competency gap analysis | Yes |
| GET | `/competencies/employees/:employeeId/history` | Employee competency history | Yes |
| GET | `/competencies/employees/assessments/:id` | Get employee competency assessment | Yes |
| POST | `/competencies/employees` | Create employee competency assessment | Yes |
| PATCH | `/competencies/employees/:id` | Update employee competency assessment | Yes |
| GET | `/competencies/analytics/coverage` | Competency coverage analytics | Yes |
| GET | `/competencies/analytics/gaps` | Organisation-wide gap analysis | Yes |

---

### Succession

**Prefix:** `/api/v1/succession`

Succession planning with candidate pipeline management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/succession/plans` | List succession plans | Yes |
| GET | `/succession/pipeline` | Get succession pipeline | Yes |
| GET | `/succession/gaps` | Get succession gaps | Yes |
| GET | `/succession/plans/:id` | Get succession plan | Yes |
| POST | `/succession/plans` | Create succession plan | Yes |
| PUT | `/succession/plans/:id` | Update succession plan | Yes |
| DELETE | `/succession/plans/:id` | Delete succession plan | Yes |
| GET | `/succession/plans/:id/candidates` | List candidates | Yes |
| POST | `/succession/plans/:id/candidates` | Add candidate | Yes |
| GET | `/succession/candidates/:id` | Get candidate | Yes |
| PUT | `/succession/candidates/:id` | Update candidate | Yes |
| DELETE | `/succession/candidates/:id` | Remove candidate | Yes |
| GET | `/succession/statistics` | Get pipeline statistics | Yes |

---

### LMS

**Prefix:** `/api/v1/lms`

Learning Management System: courses, enrollments, learning paths, prerequisites, compliance.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/lms/courses` | List courses | Yes |
| POST | `/lms/courses` | Create course | Yes |
| GET | `/lms/courses/:id` | Get course by ID | Yes |
| GET | `/lms/courses/:id/prerequisites` | List course prerequisites | Yes |
| POST | `/lms/courses/:id/prerequisites` | Add course prerequisite | Yes |
| DELETE | `/lms/courses/:courseId/prerequisites/:prereqId` | Remove course prerequisite | Yes |
| GET | `/lms/enrollments` | List enrollments | Yes |
| POST | `/lms/enrollments` | Create enrollment | Yes |
| POST | `/lms/enrollments/:id/start` | Start course | Yes |
| POST | `/lms/enrollments/:id/complete` | Complete course | Yes |
| GET | `/lms/learning-paths` | List learning paths | Yes |
| GET | `/lms/learning-paths/:id` | Get learning path | Yes |
| POST | `/lms/learning-paths` | Create learning path | Yes |
| GET | `/lms/compliance-report` | Get mandatory training compliance report | Yes |
| GET | `/lms/my-learning` | Get my learning | Yes |

**Additional route file:** `lms/mandatory-training.routes.ts`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/lms/mandatory-rules` | List mandatory training rules | Yes |
| GET | `/lms/mandatory-rules/:id` | Get mandatory training rule by ID | Yes |
| POST | `/lms/mandatory-rules` | Create mandatory training rule | Yes |
| PATCH | `/lms/mandatory-rules/:id` | Update mandatory training rule | Yes |
| DELETE | `/lms/mandatory-rules/:id` | Delete mandatory training rule | Yes |
| POST | `/lms/mandatory-rules/:id/assign` | Bulk assign mandatory training to matching employees | Yes |
| GET | `/lms/mandatory-assignments` | List mandatory training assignments | Yes |
| GET | `/lms/mandatory-assignments/:id` | Get mandatory training assignment by ID | Yes |

---

### Course Ratings

**Prefix:** `/api/v1/course-ratings`

Employee ratings and reviews for LMS courses.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/course-ratings/course/:courseId` | List ratings for a course | Yes |
| GET | `/course-ratings/summary/:courseId` | Get rating summary for a course | Yes |
| POST | `/course-ratings` | Submit a course rating | Yes |

---

### CPD

**Prefix:** `/api/v1/cpd`

Continuing Professional Development records.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cpd/records` | List CPD records | Yes |
| GET | `/cpd/records/:id` | Get CPD record by ID | Yes |
| POST | `/cpd/records` | Create CPD record | Yes |
| PATCH | `/cpd/records/:id` | Update CPD record | Yes |
| POST | `/cpd/records/:id/verify` | Verify CPD record | Yes |
| DELETE | `/cpd/records/:id` | Delete CPD record | Yes |

---

### Training Budgets

**Prefix:** `/api/v1/training-budgets`

Departmental training budgets and expense tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/training-budgets/budgets` | List training budgets | Yes |
| GET | `/training-budgets/budgets/:id` | Get training budget by ID | Yes |
| POST | `/training-budgets/budgets` | Create training budget | Yes |
| PATCH | `/training-budgets/budgets/:id` | Update training budget | Yes |
| GET | `/training-budgets/expenses` | List training expenses | Yes |
| GET | `/training-budgets/expenses/:id` | Get training expense by ID | Yes |
| POST | `/training-budgets/expenses` | Create training expense | Yes |
| PATCH | `/training-budgets/expenses/:id/status` | Update expense status | Yes |

---

### Recognition

**Prefix:** `/api/v1/recognition`

Peer-to-peer employee recognition (kudos, thanks).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/recognition` | Give recognition to a colleague | Yes |
| GET | `/recognition` | List recognitions with optional filters | Yes |
| GET | `/recognition/leaderboard` | Get recognition leaderboard | Yes |

---

### One-on-Ones (Service-only)

**Module:** `one-on-ones`

No HTTP routes. Provides service logic for one-on-one meeting scheduling and notes used internally.

---

## Recruitment & Onboarding

### Recruitment

**Prefix:** `/api/v1/recruitment`

Requisitions, candidates, pipeline management, and recruitment cost tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/recruitment/requisitions` | List requisitions | Yes |
| GET | `/recruitment/requisitions/statistics` | Get requisition statistics | Yes |
| GET | `/recruitment/requisitions/:id` | Get requisition by ID | Yes |
| GET | `/recruitment/requisitions/:id/pipeline` | Get candidate pipeline | Yes |
| POST | `/recruitment/requisitions` | Create requisition | Yes |
| PATCH | `/recruitment/requisitions/:id` | Update requisition | Yes |
| POST | `/recruitment/requisitions/:id/open` | Open requisition | Yes |
| POST | `/recruitment/requisitions/:id/close` | Close requisition | Yes |
| POST | `/recruitment/requisitions/:id/cancel` | Cancel requisition | Yes |
| GET | `/recruitment/candidates` | List candidates | Yes |
| GET | `/recruitment/candidates/statistics` | Get candidate statistics | Yes |
| GET | `/recruitment/candidates/:id` | Get candidate by ID | Yes |
| POST | `/recruitment/candidates` | Create candidate | Yes |
| PATCH | `/recruitment/candidates/:id` | Update candidate | Yes |
| POST | `/recruitment/candidates/:id/advance` | Advance candidate stage | Yes |
| GET | `/recruitment/analytics` | Get recruitment analytics | Yes |
| GET | `/recruitment/costs` | List recruitment costs | Yes |
| POST | `/recruitment/costs` | Create recruitment cost | Yes |
| PATCH | `/recruitment/costs/:id` | Update recruitment cost | Yes |
| DELETE | `/recruitment/costs/:id` | Delete recruitment cost | Yes |

---

### Assessments

**Prefix:** `/api/v1/assessments`

Assessment templates and candidate assessments during recruitment.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/assessments/templates` | List assessment templates | Yes |
| GET | `/assessments/templates/:id` | Get assessment template by ID | Yes |
| POST | `/assessments/templates` | Create assessment template | Yes |
| PATCH | `/assessments/templates/:id` | Update assessment template | Yes |
| GET | `/assessments` | List candidate assessments | Yes |
| GET | `/assessments/:id` | Get candidate assessment by ID | Yes |
| POST | `/assessments` | Schedule candidate assessment | Yes |
| POST | `/assessments/:id/result` | Record assessment result | Yes |
| POST | `/assessments/:id/cancel` | Cancel candidate assessment | Yes |

---

### Job Boards

**Prefix:** `/api/v1/job-boards`

Integrate with external job boards for vacancy posting.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/job-boards/boards` | List supported job boards | Yes |
| GET | `/job-boards/integrations` | List configured integrations | Yes |
| POST | `/job-boards/integrations` | Add a new integration | Yes |
| GET | `/job-boards/integrations/:id` | Get integration by ID | Yes |
| PATCH | `/job-boards/integrations/:id` | Update an integration | Yes |
| DELETE | `/job-boards/integrations/:id` | Remove an integration | Yes |
| POST | `/job-boards/postings` | Publish vacancy to job board | Yes |
| POST | `/job-boards/post/:jobId` | Post job to selected boards | Yes |
| GET | `/job-boards/postings` | List job board postings | Yes |
| GET | `/job-boards/postings/:id` | Get posting status | Yes |
| DELETE | `/job-boards/postings/:id` | Withdraw posting from job board | Yes |

---

### Offer Letters

**Prefix:** `/api/v1/recruitment/offers`

Generate, send, and track offer letters.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/recruitment/offers` | Create offer letter | Yes |
| GET | `/recruitment/offers` | List offer letters | Yes |
| GET | `/recruitment/offers/:id` | Get offer letter | Yes |
| PUT | `/recruitment/offers/:id` | Update draft offer letter | Yes |
| POST | `/recruitment/offers/:id/send` | Send offer letter | Yes |
| POST | `/recruitment/offers/:id/accept` | Accept offer letter | Yes |
| POST | `/recruitment/offers/:id/decline` | Decline offer letter | Yes |

---

### Background Checks

**Prefix:** `/api/v1/background-checks`

Pre-employment background check request and tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/background-checks/webhook` | Provider webhook callback | **No** |
| GET | `/background-checks` | List background check requests | Yes |
| GET | `/background-checks/:id` | Get background check request by ID | Yes |
| POST | `/background-checks` | Request a background check | Yes |

---

### Reference Checks

**Prefix:** `/api/v1/reference-checks`

Employment reference request and verification.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/reference-checks` | List reference checks | Yes |
| GET | `/reference-checks/:id` | Get reference check by ID | Yes |
| POST | `/reference-checks` | Create reference check | Yes |
| PATCH | `/reference-checks/:id` | Update reference check | Yes |
| POST | `/reference-checks/:id/send` | Send reference request | Yes |
| POST | `/reference-checks/:id/verify` | Verify reference check | Yes |

---

### Agencies

**Prefix:** `/api/v1/agencies`

Recruitment agency and placement management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/agencies` | List recruitment agencies | Yes |
| GET | `/agencies/:id` | Get recruitment agency by ID | Yes |
| POST | `/agencies` | Create recruitment agency | Yes |
| PATCH | `/agencies/:id` | Update recruitment agency | Yes |
| DELETE | `/agencies/:id` | Delete recruitment agency | Yes |
| GET | `/agencies/:id/placements` | List agency placements | Yes |
| POST | `/agencies/:id/placements` | Create agency placement | Yes |
| PATCH | `/agencies/:id/placements/:placementId` | Update agency placement | Yes |

---

### Onboarding

**Prefix:** `/api/v1/onboarding`

Onboarding checklists, instances, task completion, compliance checks, and task dependencies.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/onboarding/checklists` | List onboarding checklists | Yes |
| POST | `/onboarding/checklists` | Create onboarding checklist | Yes |
| PATCH | `/onboarding/checklists/:id` | Update onboarding checklist | Yes |
| GET | `/onboarding/instances` | List onboarding instances | Yes |
| POST | `/onboarding/instances` | Start onboarding for employee | Yes |
| GET | `/onboarding/instances/:id` | Get onboarding instance | Yes |
| POST | `/onboarding/instances/:id/tasks/:taskId/complete` | Complete onboarding task | Yes |
| GET | `/onboarding/my-onboarding` | Get my onboarding | Yes |
| GET | `/onboarding/instances/:id/compliance-checks` | List compliance checks for an onboarding instance | Yes |
| POST | `/onboarding/instances/:id/compliance-checks` | Create a compliance check for an onboarding instance | Yes |
| PATCH | `/onboarding/instances/:id/compliance-checks/:checkId` | Update a compliance check | Yes |
| GET | `/onboarding/templates/:templateId/dependencies` | List all task dependencies for a template | Yes |
| GET | `/onboarding/tasks/:taskId/dependencies` | List dependencies for a specific task | Yes |
| POST | `/onboarding/tasks/dependencies` | Add a dependency between two template tasks | Yes |
| DELETE | `/onboarding/tasks/:taskId/dependencies/:dependsOnTaskId` | Remove a dependency between two template tasks | Yes |

---

### DBS Checks

**Prefix:** `/api/v1/dbs-checks`

Disclosure and Barring Service checks (UK pre-employment screening).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/dbs-checks` | List DBS checks | Yes |
| GET | `/dbs-checks/:id` | Get DBS check by ID | Yes |
| POST | `/dbs-checks` | Create DBS check | Yes |
| PATCH | `/dbs-checks/:id` | Update DBS check | Yes |
| POST | `/dbs-checks/:id/submit` | Submit DBS check | Yes |
| POST | `/dbs-checks/:id/result` | Record DBS result | Yes |

---

## UK Compliance Modules

### Right to Work

**Prefix:** `/api/v1/right-to-work`

UK right to work verification with document management and compliance tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/right-to-work/dashboard` | Get compliance dashboard | Yes |
| GET | `/right-to-work/expiring` | List expiring checks | Yes |
| GET | `/right-to-work` | List RTW checks | Yes |
| POST | `/right-to-work` | Create RTW check | Yes |
| GET | `/right-to-work/:id` | Get RTW check | Yes |
| PATCH | `/right-to-work/:id` | Update RTW check | Yes |
| POST | `/right-to-work/:id/verify` | Verify RTW check | Yes |
| POST | `/right-to-work/:id/fail` | Fail RTW check | Yes |
| GET | `/right-to-work/:id/documents` | List check documents | Yes |
| POST | `/right-to-work/:id/documents` | Upload document metadata | Yes |
| DELETE | `/right-to-work/:id/documents/:docId` | Delete document | Yes |
| GET | `/right-to-work/employee/:employeeId` | Get employee RTW status | Yes |

---

### SSP

**Prefix:** `/api/v1/ssp`

Statutory Sick Pay calculation and management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/ssp` | List SSP records | Yes |
| GET | `/ssp/:id` | Get SSP record by ID | Yes |
| POST | `/ssp` | Start new SSP period | Yes |
| PATCH | `/ssp/:id` | Update SSP record | Yes |
| POST | `/ssp/:id/end` | End SSP period | Yes |
| GET | `/ssp/entitlement/:employeeId` | Get SSP entitlement | Yes |
| GET | `/ssp/eligibility/:employeeId` | Check SSP eligibility | Yes |

---

### Statutory Leave

**Prefix:** `/api/v1/statutory-leave`

Maternity, paternity, adoption, shared parental, and other statutory leave types.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/statutory-leave` | List statutory leave records | Yes |
| POST | `/statutory-leave` | Create statutory leave record | Yes |
| GET | `/statutory-leave/eligibility/:employeeId` | Check eligibility | Yes |
| GET | `/statutory-leave/:id` | Get statutory leave record | Yes |
| PATCH | `/statutory-leave/:id` | Update statutory leave record | Yes |
| POST | `/statutory-leave/:id/start` | Start statutory leave | Yes |
| POST | `/statutory-leave/:id/complete` | Complete statutory leave | Yes |
| POST | `/statutory-leave/:id/cancel` | Cancel statutory leave | Yes |
| POST | `/statutory-leave/:id/curtail` | Curtail maternity/adoption leave | Yes |
| GET | `/statutory-leave/:id/pay` | Get pay calculation | Yes |
| POST | `/statutory-leave/:id/recalculate` | Recalculate pay | Yes |
| GET | `/statutory-leave/:id/kit-days` | List KIT days | Yes |
| POST | `/statutory-leave/:id/kit-days` | Record KIT day | Yes |

---

### Family Leave

**Prefix:** `/api/v1/family-leave`

Comprehensive family leave management (maternity, paternity, adoption, shared parental, statutory pay calculations, KIT/SPLIT days).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/family-leave/dashboard` | Compliance dashboard | Yes |
| POST | `/family-leave` | Create family leave entitlement | Yes |
| GET | `/family-leave` | List family leave entitlements | Yes |
| GET | `/family-leave/:id` | Get family leave entitlement | Yes |
| POST | `/family-leave/eligibility` | Check eligibility | Yes |
| POST | `/family-leave/statutory-pay` | Calculate statutory pay | Yes |
| POST | `/family-leave/:id/kit-day` | Record KIT/SPLIT day | Yes |
| PATCH | `/family-leave/:id/curtail` | Curtail maternity/adoption leave for ShPL | Yes |
| GET | `/family-leave/:id/pay-schedule` | Get pay schedule | Yes |
| POST | `/family-leave/:id/notice` | Record formal notice | Yes |

---

### Parental Leave

**Prefix:** `/api/v1/parental-leave`

UK unpaid parental leave (18 weeks per child).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/parental-leave/children` | Register child for parental leave | Yes |
| GET | `/parental-leave/employee/:employeeId` | Get employee parental leave entitlements | Yes |
| POST | `/parental-leave/bookings` | Create parental leave booking | Yes |
| GET | `/parental-leave/bookings` | List parental leave bookings | Yes |
| PATCH | `/parental-leave/bookings/:id/approve` | Approve parental leave booking | Yes |
| PATCH | `/parental-leave/bookings/:id/reject` | Reject parental leave booking | Yes |
| GET | `/parental-leave/requests` | List parental leave requests (alias) | Yes |
| POST | `/parental-leave/requests` | Create parental leave request (alias) | Yes |

---

### Bereavement

**Prefix:** `/api/v1/bereavement`

Parental bereavement leave (Jack's Law) and bereavement leave management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/bereavement` | List parental bereavement leave records | Yes |
| GET | `/bereavement/:id` | Get bereavement leave record by ID | Yes |
| POST | `/bereavement` | Create parental bereavement leave request | Yes |
| PUT | `/bereavement/:id` | Update parental bereavement leave record | Yes |
| PATCH | `/bereavement/:id/transition` | Transition bereavement leave status | Yes |
| GET | `/bereavement/requests` | List parental bereavement leave records (alias) | Yes |
| POST | `/bereavement/requests` | Create parental bereavement leave request (alias) | Yes |

---

### Carer's Leave

**Prefix:** `/api/v1/carers-leave`

Carer's Leave Act 2023 - one week unpaid leave for caring responsibilities.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/carers-leave` | List carer's leave entitlements | Yes |
| GET | `/carers-leave/:id` | Get carer's leave entitlement by ID | Yes |
| POST | `/carers-leave` | Create carer's leave entitlement | Yes |
| PUT | `/carers-leave/:id` | Update carer's leave entitlement | Yes |
| PATCH | `/carers-leave/:id/approve` | Approve or reject carer's leave | Yes |
| DELETE | `/carers-leave/:id` | Delete carer's leave entitlement | Yes |
| GET | `/carers-leave/requests` | List carer's leave requests (alias) | Yes |
| POST | `/carers-leave/requests` | Create carer's leave request (alias) | Yes |

---

### Flexible Working

**Prefix:** `/api/v1/flexible-working`

Employment Relations (Flexible Working) Act 2023 - request handling with consultation process.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/flexible-working` | Submit flexible working request | Yes |
| GET | `/flexible-working` | List flexible working requests | Yes |
| GET | `/flexible-working/:id` | Get flexible working request by ID | Yes |
| PATCH | `/flexible-working/:id/schedule-consultation` | Schedule consultation for request | Yes |
| POST | `/flexible-working/:id/consultation` | Record consultation meeting | Yes |
| GET | `/flexible-working/:id/consultations` | List consultation records | Yes |
| GET | `/flexible-working/:id/history` | Get request status history | Yes |
| PATCH | `/flexible-working/:id/approve` | Approve flexible working request | Yes |
| PATCH | `/flexible-working/:id/reject` | Reject flexible working request | Yes |
| PATCH | `/flexible-working/:id/withdraw` | Withdraw flexible working request | Yes |
| POST | `/flexible-working/:id/appeal` | Appeal rejection decision | Yes |
| PATCH | `/flexible-working/:id/appeal/resolve` | Resolve appeal | Yes |
| PATCH | `/flexible-working/:id/respond` | Respond to flexible working request (legacy) | Yes |
| GET | `/flexible-working/compliance` | Get compliance summary | Yes |

---

### Gender Pay Gap

**Prefix:** `/api/v1/gender-pay-gap`

Gender pay gap reporting for UK Equality Act 2010 compliance.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/gender-pay-gap/generate` | Generate gender pay gap report | Yes |
| POST | `/gender-pay-gap/calculate` | Calculate gender pay gap (advanced) | Yes |
| GET | `/gender-pay-gap` | List gender pay gap reports | Yes |
| GET | `/gender-pay-gap/dashboard` | Gender pay gap dashboard | Yes |
| GET | `/gender-pay-gap/:id` | Get gender pay gap report | Yes |
| PATCH | `/gender-pay-gap/:id/publish` | Publish gender pay gap report | Yes |

---

### NMW/NLW

**Prefix:** `/api/v1/nmw`

National Minimum/Living Wage compliance checking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/nmw/rates` | List NMW/NLW rates | Yes |
| POST | `/nmw/rates` | Create tenant-specific NMW rate | Yes |
| POST | `/nmw/check` | Check employee NMW compliance | Yes |
| POST | `/nmw/bulk-check` | Bulk check NMW compliance | Yes |
| GET | `/nmw/report` | Get NMW compliance report | Yes |

---

### Working Time Regulations

**Prefix:** `/api/v1/wtr`

Working Time Regulations 1998 compliance (48-hour week limit, opt-outs, rest periods).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/wtr/dashboard` | Get compliance dashboard | Yes |
| GET | `/wtr/alerts` | List WTR alerts | Yes |
| POST | `/wtr/alerts/:id/acknowledge` | Acknowledge WTR alert | Yes |
| GET | `/wtr/opt-outs` | List opt-out agreements | Yes |
| POST | `/wtr/opt-outs` | Create opt-out agreement | Yes |
| POST | `/wtr/opt-outs/:id/revoke` | Revoke opt-out agreement | Yes |
| GET | `/wtr/employees/:employeeId/status` | Get employee working time status | Yes |

---

### Health & Safety

**Prefix:** `/api/v1/health-safety`

Incident reporting, risk assessments, DSE assessments, and RIDDOR reporting.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health-safety/dashboard` | Get H&S dashboard statistics | Yes |
| GET | `/health-safety/riddor-reports` | List RIDDOR-reportable incidents | Yes |
| GET | `/health-safety/incidents` | List incidents | Yes |
| POST | `/health-safety/incidents` | Report a new incident | Yes |
| GET | `/health-safety/incidents/:id` | Get incident details | Yes |
| PATCH | `/health-safety/incidents/:id` | Update an incident | Yes |
| POST | `/health-safety/incidents/:id/close` | Close an incident | Yes |
| GET | `/health-safety/risk-assessments` | List risk assessments | Yes |
| POST | `/health-safety/risk-assessments` | Create a risk assessment | Yes |
| GET | `/health-safety/risk-assessments/:id` | Get risk assessment details | Yes |
| PATCH | `/health-safety/risk-assessments/:id` | Update a risk assessment | Yes |
| POST | `/health-safety/risk-assessments/:id/approve` | Approve a risk assessment | Yes |
| GET | `/health-safety/dse-assessments` | List DSE assessments | Yes |
| POST | `/health-safety/dse-assessments` | Create a DSE assessment | Yes |
| GET | `/health-safety/dse-assessments/:id` | Get DSE assessment details | Yes |
| GET | `/health-safety/dse-assessments/employee/:employeeId` | Get DSE assessments for an employee | Yes |

---

### Warnings

**Prefix:** `/api/v1/warnings`

ACAS-compliant disciplinary warnings with appeal workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/warnings/employee/:employeeId` | List warnings for an employee | Yes |
| GET | `/warnings/employee/:employeeId/active` | Get active warnings for an employee | Yes |
| GET | `/warnings/:id` | Get warning by ID | Yes |
| POST | `/warnings` | Issue a new warning | Yes |
| POST | `/warnings/:id/appeal` | Submit an appeal against a warning | Yes |
| PATCH | `/warnings/:id/appeal/resolve` | Resolve an appeal | Yes |
| PATCH | `/warnings/:id/rescind` | Rescind a warning | Yes |
| POST | `/warnings/batch-expire` | Batch expire warnings | Yes |

---

### Reasonable Adjustments

**Prefix:** `/api/v1/reasonable-adjustments`

Equality Act 2010 reasonable adjustment requests and tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/reasonable-adjustments` | Create reasonable adjustment request | Yes |
| GET | `/reasonable-adjustments` | List reasonable adjustments | Yes |
| GET | `/reasonable-adjustments/due-review` | Get adjustments due for review | Yes |
| GET | `/reasonable-adjustments/:id` | Get reasonable adjustment by ID | Yes |
| PATCH | `/reasonable-adjustments/:id/assess` | Assess adjustment | Yes |
| PATCH | `/reasonable-adjustments/:id/decide` | Decide on adjustment | Yes |
| PATCH | `/reasonable-adjustments/:id/implement` | Implement adjustment | Yes |
| PATCH | `/reasonable-adjustments/:id/withdraw` | Withdraw adjustment | Yes |

---

### Return to Work

**Prefix:** `/api/v1/return-to-work`

Return-to-work interviews after absence.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/return-to-work` | List return-to-work interviews | Yes |
| GET | `/return-to-work/:id` | Get return-to-work interview by ID | Yes |
| POST | `/return-to-work` | Create return-to-work interview | Yes |
| PUT | `/return-to-work/:id` | Update return-to-work interview | Yes |
| PATCH | `/return-to-work/:id/complete` | Complete return-to-work interview | Yes |
| GET | `/return-to-work/requests` | List return-to-work interviews (alias) | Yes |
| POST | `/return-to-work/requests` | Create return-to-work interview (alias) | Yes |

---

### Bank Holidays

**Prefix:** `/api/v1/bank-holidays`

UK bank holiday management with bulk import.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/bank-holidays` | List bank holidays | Yes |
| GET | `/bank-holidays/:id` | Get bank holiday by ID | Yes |
| POST | `/bank-holidays` | Create bank holiday | Yes |
| PUT | `/bank-holidays/:id` | Update bank holiday | Yes |
| DELETE | `/bank-holidays/:id` | Delete bank holiday | Yes |
| POST | `/bank-holidays/bulk-import` | Bulk import bank holidays | Yes |

---

### Tribunal

**Prefix:** `/api/v1/tribunal`

Employment tribunal case management with document tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tribunal` | List tribunal cases | Yes |
| GET | `/tribunal/:id` | Get tribunal case by ID | Yes |
| POST | `/tribunal` | Create a new tribunal case | Yes |
| PATCH | `/tribunal/:id` | Update a tribunal case | Yes |
| DELETE | `/tribunal/:id` | Delete a tribunal case | Yes |
| POST | `/tribunal/:id/documents` | Add document to tribunal case | Yes |
| PATCH | `/tribunal/:id/documents/:docId` | Update document in tribunal case | Yes |
| DELETE | `/tribunal/:id/documents/:docId` | Remove document from tribunal case | Yes |

---

### TUPE

**Prefix:** `/api/v1/tupe/transfers`

Transfer of Undertakings (Protection of Employment) management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tupe/transfers` | List TUPE transfers | Yes |
| GET | `/tupe/transfers/:id` | Get TUPE transfer by ID | Yes |
| POST | `/tupe/transfers` | Create a new TUPE transfer | Yes |
| PATCH | `/tupe/transfers/:id` | Update a TUPE transfer | Yes |
| DELETE | `/tupe/transfers/:id` | Delete a TUPE transfer | Yes |
| GET | `/tupe/transfers/:id/history` | Get TUPE transfer status history | Yes |
| GET | `/tupe/transfers/:id/employees` | List affected employees for a TUPE transfer | Yes |
| POST | `/tupe/transfers/:id/employees` | Add affected employee to TUPE transfer | Yes |
| PUT | `/tupe/transfers/:id/employees/:empId/consent` | Update employee consent for TUPE transfer | Yes |
| DELETE | `/tupe/transfers/:id/employees/:empId` | Remove affected employee from TUPE transfer | Yes |

---

### Whistleblowing

**Prefix:** `/api/v1/whistleblowing`

Public Interest Disclosure Act 1998 - confidential whistleblowing reports.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/whistleblowing` | Submit a whistleblowing report | Yes |
| GET | `/whistleblowing` | List whistleblowing cases | Yes |
| GET | `/whistleblowing/:id` | Get whistleblowing case by ID | Yes |
| PATCH | `/whistleblowing/:id` | Update whistleblowing case | Yes |
| GET | `/whistleblowing/:id/audit` | Get case audit trail | Yes |

---

### IR35 (Service-only)

**Module:** `ir35`

No HTTP routes. Provides IR35 off-payroll working assessment logic used by agency workers and contractor modules.

---

### Suspensions (Service-only)

**Module:** `suspensions`

No HTTP routes. Provides suspension management service logic used by the disciplinary/cases module.

---

## GDPR & Data Privacy

### DSAR

**Prefix:** `/api/v1/dsar`

Data Subject Access Request management with identity verification, data gathering, and ICO deadlines.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/dsar/dashboard` | Get DSAR dashboard statistics | Yes |
| GET | `/dsar/overdue` | List overdue DSAR requests | Yes |
| GET | `/dsar` | List DSAR requests | Yes |
| POST | `/dsar` | Create a new DSAR request | Yes |
| GET | `/dsar/:id` | Get DSAR request detail | Yes |
| POST | `/dsar/:id/verify` | Verify data subject identity | Yes |
| POST | `/dsar/:id/gather` | Gather data from a module | Yes |
| PATCH | `/dsar/:id/items/:itemId` | Update a data item | Yes |
| POST | `/dsar/:id/extend` | Extend DSAR deadline | Yes |
| POST | `/dsar/:id/complete` | Complete DSAR request | Yes |
| POST | `/dsar/:id/reject` | Reject DSAR request | Yes |
| GET | `/dsar/:id/audit` | Get DSAR audit trail | Yes |

---

### Data Erasure

**Prefix:** `/api/v1/data-erasure`

GDPR Article 17 right to erasure with retention conflict checking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/data-erasure` | List erasure requests | Yes |
| GET | `/data-erasure/overdue` | Get overdue erasure requests | Yes |
| POST | `/data-erasure` | Create erasure request | Yes |
| GET | `/data-erasure/:id` | Get erasure request detail | Yes |
| POST | `/data-erasure/:id/approve` | Approve erasure request | Yes |
| POST | `/data-erasure/:id/execute` | Execute erasure | Yes |
| POST | `/data-erasure/:id/complete` | Complete with certificate | Yes |
| POST | `/data-erasure/:id/reject` | Reject erasure request | Yes |
| GET | `/data-erasure/:id/audit` | Get erasure audit log | Yes |
| GET | `/data-erasure/retention-conflicts/:employeeId` | Check retention conflicts | Yes |
| GET | `/data-erasure/:id/certificate` | Generate erasure certificate | Yes |

---

### Data Breach

**Prefix:** `/api/v1/data-breach`

GDPR Article 33/34 data breach notification and management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/data-breach` | Report a new data breach | Yes |
| GET | `/data-breach` | List data breaches | Yes |
| GET | `/data-breach/dashboard` | Get breach dashboard | Yes |
| GET | `/data-breach/:id` | Get data breach by ID | Yes |
| PATCH | `/data-breach/:id/assess` | Assess breach risk | Yes |
| POST | `/data-breach/:id/ico-notification` | Record ICO notification | Yes |
| POST | `/data-breach/:id/subject-notifications` | Record data subject notifications | Yes |
| POST | `/data-breach/:id/timeline` | Add timeline entry | Yes |
| GET | `/data-breach/:id/timeline` | Get breach timeline | Yes |
| PATCH | `/data-breach/:id/close` | Close breach | Yes |

---

### Data Retention

**Prefix:** `/api/v1/data-retention`

Automated data retention policy management with UK defaults and legal holds.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/data-retention/policies` | Create retention policy | Yes |
| GET | `/data-retention/policies` | List retention policies | Yes |
| GET | `/data-retention/policies/:id` | Get retention policy | Yes |
| PATCH | `/data-retention/policies/:id` | Update retention policy | Yes |
| POST | `/data-retention/seed-uk-defaults` | Seed UK default retention policies | Yes |
| POST | `/data-retention/execute-review` | Execute retention review | Yes |
| GET | `/data-retention/reviews` | List retention reviews | Yes |
| POST | `/data-retention/exceptions` | Create retention exception (legal hold) | Yes |
| DELETE | `/data-retention/exceptions/:id` | Remove retention exception | Yes |
| GET | `/data-retention/dashboard` | Retention dashboard | Yes |
| GET | `/data-retention/expired` | Identify expired records | Yes |

---

### Data Archival

**Prefix:** `/api/v1/data-archival`

Long-term data archival with policy-based automation and restoration.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/data-archival/records` | List archived records | Yes |
| GET | `/data-archival/records/:id` | Get archived record | Yes |
| POST | `/data-archival/archive` | Manually archive a record | Yes |
| POST | `/data-archival/restore` | Restore record from archive | Yes |
| POST | `/data-archival/run-automated` | Run automated archival | Yes |
| GET | `/data-archival/dashboard` | Archival dashboard | Yes |
| GET | `/data-archival/rules` | List archival rules | Yes |
| POST | `/data-archival/rules/seed-uk` | Seed UK default archival rules | Yes |
| POST | `/data-archival/policies` | Create archive policy | Yes |
| GET | `/data-archival/policies` | List archive policies | Yes |
| GET | `/data-archival/policies/:id` | Get archive policy | Yes |
| PATCH | `/data-archival/policies/:id` | Update archive policy | Yes |
| DELETE | `/data-archival/policies/:id` | Delete archive policy | Yes |
| GET | `/data-archival/log` | List archive log | Yes |
| POST | `/data-archival/run-policy` | Run policy-based archival | Yes |
| POST | `/data-archival/restore-batch` | Restore from archive | Yes |

---

### Consent

**Prefix:** `/api/v1/consent`

GDPR consent purpose management and employee consent tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/consent/purposes` | List consent purposes | Yes |
| GET | `/consent/purposes/:id` | Get consent purpose | Yes |
| POST | `/consent/purposes` | Create consent purpose | Yes |
| PATCH | `/consent/purposes/:id` | Update consent purpose | Yes |
| GET | `/consent/records` | List consent records | Yes |
| POST | `/consent/grant` | Grant consent | Yes |
| POST | `/consent/withdraw` | Withdraw consent | Yes |
| GET | `/consent/employee/:employeeId` | Get employee consents | Yes |
| GET | `/consent/check/:employeeId/:purposeId` | Check employee consent | Yes |
| GET | `/consent/dashboard` | Consent dashboard | Yes |
| GET | `/consent/stale` | Stale consents | Yes |

---

### Privacy Notices

**Prefix:** `/api/v1/privacy-notices`

Privacy notice management with employee acknowledgement tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/privacy-notices` | List privacy notices | Yes |
| GET | `/privacy-notices/outstanding` | Outstanding acknowledgements | Yes |
| GET | `/privacy-notices/compliance` | Compliance summary | Yes |
| GET | `/privacy-notices/:id` | Get privacy notice | Yes |
| POST | `/privacy-notices` | Create privacy notice | Yes |
| PATCH | `/privacy-notices/:id` | Update privacy notice | Yes |
| POST | `/privacy-notices/:id/acknowledge` | Acknowledge privacy notice | Yes |

---

### DPIA

**Prefix:** `/api/v1/dpia`

Data Protection Impact Assessment management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/dpia` | Create a new DPIA assessment | Yes |
| GET | `/dpia` | List DPIA assessments | Yes |
| GET | `/dpia/:id` | Get DPIA by ID | Yes |
| PATCH | `/dpia/:id` | Update DPIA assessment | Yes |
| POST | `/dpia/:id/risks` | Add risk to DPIA | Yes |
| GET | `/dpia/:id/risks` | List DPIA risks | Yes |
| POST | `/dpia/:id/submit` | Submit DPIA for review | Yes |
| POST | `/dpia/:id/review` | Approve or reject DPIA | Yes |

---

### ROPA (Service-only)

**Module:** `ropa`

No HTTP routes. Provides Record of Processing Activities logic for GDPR Article 30 compliance, used internally by the DPIA and consent modules.

---

## Payroll & Finance

### Payroll

**Prefix:** `/api/v1/payroll`

Payroll runs, calculations, tax management, pay schedules, journal entries, and final pay.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/payroll/runs` | Create payroll run | Yes |
| GET | `/payroll/runs` | List payroll runs | Yes |
| GET | `/payroll/runs/:id` | Get payroll run detail | Yes |
| POST | `/payroll/runs/:id/calculate` | Calculate payroll | Yes |
| PATCH | `/payroll/runs/:id/approve` | Approve payroll run | Yes |
| POST | `/payroll/runs/:id/export` | Export payroll data | Yes |
| PUT | `/payroll/employees/:id/tax` | Update employee tax details | Yes |
| GET | `/payroll/employees/:id/tax` | Get employee tax details | Yes |
| GET | `/payroll/employees/:id/payslip` | Get employee payslip | Yes |
| GET | `/payroll/pay-schedules` | List pay schedules | Yes |
| POST | `/payroll/pay-schedules` | Create pay schedule | Yes |
| GET | `/payroll/pay-schedules/:id` | Get pay schedule by ID | Yes |
| PUT | `/payroll/pay-schedules/:id` | Update pay schedule | Yes |
| GET | `/payroll/pay-schedule-assignments` | List pay schedule assignments | Yes |
| POST | `/payroll/pay-schedule-assignments` | Create pay schedule assignment | Yes |
| GET | `/payroll/pay-schedule-assignments/:id` | Get pay schedule assignment by ID | Yes |
| PUT | `/payroll/pay-schedule-assignments/:id` | Update pay schedule assignment | Yes |
| DELETE | `/payroll/pay-schedule-assignments/:id` | Delete pay schedule assignment | Yes |
| POST | `/payroll/employees/:id/assign-schedule` | Assign employee to pay schedule | Yes |
| GET | `/payroll/employees/:id/schedule-assignments` | Get employee pay schedule assignments | Yes |
| GET | `/payroll/employees/:id/current-schedule` | Get current pay schedule assignment for employee | Yes |
| POST | `/payroll/period-locks` | Lock a payroll period | Yes |
| POST | `/payroll/period-locks/:id/unlock` | Unlock a payroll period | Yes |
| GET | `/payroll/period-locks/status` | Get payroll period lock status | Yes |
| GET | `/payroll/period-locks/:id` | Get period lock by ID | Yes |
| POST | `/payroll/runs/:id/journals` | Generate journal entries from payroll run | Yes |
| GET | `/payroll/runs/:id/journals` | Get journal entries for a payroll run | Yes |
| GET | `/payroll/journals` | List journal entries | Yes |
| POST | `/payroll/final-pay/calculate` | Calculate final pay breakdown | Yes |
| GET | `/payroll/final-pay/:employeeId` | Get confirmed final pay for employee | Yes |
| POST | `/payroll/final-pay/confirm` | Confirm and record final pay calculation | Yes |
| GET | `/payroll/holiday-pay/:employeeId` | Calculate employee holiday pay rate | Yes |
| POST | `/payroll/holiday-pay/harpur-trust` | Calculate Harpur Trust holiday pay | Yes |

**Additional route file:** `payroll/period-lock.routes.ts`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/payroll/periods` | List payroll periods with lock status | Yes |
| POST | `/payroll/periods/:id/lock` | Lock a payroll period | Yes |
| POST | `/payroll/periods/:id/unlock` | Unlock a payroll period | Yes |
| POST | `/payroll/periods/:id/finalize` | Finalize a payroll period (permanent) | Yes |
| GET | `/payroll/periods/:id` | Get period lock by ID | Yes |

---

### Payroll Submissions

**Prefix:** `/api/v1/submissions`

HMRC payroll submissions (FPS, EPS).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/submissions/fps` | Create Full Payment Submission (FPS) | Yes |
| POST | `/submissions/eps` | Create Employer Payment Summary (EPS) | Yes |
| GET | `/submissions` | List payroll submissions | Yes |
| GET | `/submissions/:id` | Get submission details | Yes |
| POST | `/submissions/:id/validate` | Validate submission before HMRC submission | Yes |
| POST | `/submissions/:id/submit` | Submit to HMRC | Yes |

---

### P45/P60

**Prefix:** `/api/v1/p45-p60` and `/api/v1/portal/p45-p60`

P45 (leaving) and P60 (annual summary) tax documents.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/p45-p60` | List P45/P60 documents (admin) | Yes |
| GET | `/portal/p45-p60` | List my P45/P60 documents (employee self-service) | Yes |

---

### Payroll Config

**Prefix:** `/api/v1/payroll-config`

Pay schedules, employee pay assignments, and NI categories configuration.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/payroll-config/pay-schedules` | List pay schedules | Yes |
| GET | `/payroll-config/pay-schedules/:id` | Get pay schedule by ID | Yes |
| POST | `/payroll-config/pay-schedules` | Create pay schedule | Yes |
| PUT | `/payroll-config/pay-schedules/:id` | Update pay schedule | Yes |
| GET | `/payroll-config/pay-assignments` | List employee pay assignments | Yes |
| POST | `/payroll-config/pay-assignments` | Create employee pay assignment | Yes |
| GET | `/payroll-config/pay-assignments/:id` | Get pay assignment by ID | Yes |
| GET | `/payroll-config/pay-assignments/employee/:employeeId/current` | Get current pay assignment for an employee | Yes |
| PUT | `/payroll-config/pay-assignments/:id` | Update pay assignment | Yes |
| DELETE | `/payroll-config/pay-assignments/:id` | Delete pay assignment | Yes |
| GET | `/payroll-config/ni-categories` | List employee NI categories | Yes |
| GET | `/payroll-config/ni-categories/employee/:employeeId/current` | Get current NI category for an employee | Yes |
| GET | `/payroll-config/ni-categories/:id` | Get NI category by ID | Yes |
| POST | `/payroll-config/ni-categories` | Create NI category record | Yes |
| PUT | `/payroll-config/ni-categories/:id` | Update NI category record | Yes |
| DELETE | `/payroll-config/ni-categories/:id` | Delete NI category record | Yes |

---

### Payslips

**Prefix:** `/api/v1/payslips`

Payslip templates and employee payslip management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/payslips/templates` | List payslip templates | Yes |
| GET | `/payslips/templates/:id` | Get payslip template | Yes |
| POST | `/payslips/templates` | Create payslip template | Yes |
| PUT | `/payslips/templates/:id` | Update payslip template | Yes |
| GET | `/payslips/employee/:employeeId` | List employee payslips | Yes |
| GET | `/payslips/:id` | Get payslip | Yes |
| POST | `/payslips` | Create payslip | Yes |
| PATCH | `/payslips/:id/status` | Update payslip status | Yes |

---

### Tax Codes

**Prefix:** `/api/v1/tax-codes`

Employee HMRC tax code management with effective dating.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tax-codes/employee/:employeeId` | List employee tax codes | Yes |
| GET | `/tax-codes/employee/:employeeId/current` | Get current tax code for employee | Yes |
| GET | `/tax-codes/:id` | Get tax code by ID | Yes |
| POST | `/tax-codes` | Create employee tax code | Yes |
| PUT | `/tax-codes/:id` | Update employee tax code | Yes |

---

### Pension

**Prefix:** `/api/v1/pension`

Automatic pension enrolment (The Pensions Regulator compliance).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/pension/schemes` | Create pension scheme | Yes |
| GET | `/pension/schemes` | List pension schemes | Yes |
| POST | `/pension/assess` | Assess employee eligibility | Yes |
| POST | `/pension/auto-enrol` | Auto-enrol employee | Yes |
| PATCH | `/pension/opt-out` | Process opt-out | Yes |
| POST | `/pension/postpone` | Postpone assessment | Yes |
| POST | `/pension/contributions` | Calculate contributions | Yes |
| POST | `/pension/re-enrol` | Trigger bulk re-enrolment | Yes |
| GET | `/pension/enrolments` | List pension enrolments | Yes |
| GET | `/pension/compliance` | Get compliance summary | Yes |

---

### Salary Sacrifice

**Prefix:** `/api/v1/salary-sacrifices`

Salary sacrifice arrangements (childcare vouchers, cycle to work, etc.).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/salary-sacrifices` | List salary sacrifices | Yes |
| GET | `/salary-sacrifices/employee/:employeeId` | List employee salary sacrifices | Yes |
| GET | `/salary-sacrifices/:id` | Get salary sacrifice | Yes |
| POST | `/salary-sacrifices` | Create salary sacrifice | Yes |
| PUT | `/salary-sacrifices/:id` | Update salary sacrifice | Yes |
| DELETE | `/salary-sacrifices/:id` | End salary sacrifice | Yes |

---

### Deductions

**Prefix:** `/api/v1/deductions`

Deduction types and employee deduction management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/deductions/types` | List deduction types | Yes |
| GET | `/deductions/types/:id` | Get deduction type | Yes |
| POST | `/deductions/types` | Create deduction type | Yes |
| PUT | `/deductions/types/:id` | Update deduction type | Yes |
| GET | `/deductions/employee/:employeeId` | List employee deductions | Yes |
| GET | `/deductions/:id` | Get employee deduction | Yes |
| POST | `/deductions` | Create employee deduction | Yes |
| PUT | `/deductions/:id` | Update employee deduction | Yes |

---

### Total Reward

**Prefix:** `/api/v1/total-reward`

Total reward statements combining salary, benefits, pension, and other compensation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/total-reward/:id` | Get total reward statement by ID | Yes |
| GET | `/total-reward/:id/pdf` | Request PDF total reward statement | Yes |
| GET | `/total-reward/generate/:employeeId` | Generate total reward statement | Yes |

---

### Income Protection

**Prefix:** `/api/v1/income-protection`

Group income protection insurance policies and employee enrollments.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/income-protection/policies` | List income protection policies | Yes |
| GET | `/income-protection/policies/:id` | Get income protection policy | Yes |
| POST | `/income-protection/policies` | Create income protection policy | Yes |
| PUT | `/income-protection/policies/:id` | Update income protection policy | Yes |
| GET | `/income-protection/enrollments` | List income protection enrollments | Yes |
| GET | `/income-protection/enrollments/:id` | Get income protection enrollment | Yes |
| POST | `/income-protection/enrollments` | Create income protection enrollment | Yes |
| PUT | `/income-protection/enrollments/:id` | Update income protection enrollment | Yes |

---

## Benefits

### Benefits (Core)

**Prefix:** `/api/v1/benefits`

Parent route group that mounts the sub-route modules below. The routes.ts itself serves as a router combining carriers, plans, enrollment, flex funds, and life events.

---

### Benefits Plans

**Prefix:** `/api/v1/benefits/plans`

Benefit plan configuration and management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/benefits/plans` | List plans | Yes |
| GET | `/benefits/plans/:id` | Get plan by ID | Yes |
| POST | `/benefits/plans` | Create plan | Yes |
| PUT | `/benefits/plans/:id` | Update plan | Yes |
| DELETE | `/benefits/plans/:id` | Deactivate plan | Yes |

---

### Benefits Carriers

**Prefix:** `/api/v1/benefits/carriers`

Insurance carrier/provider management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/benefits/carriers` | List carriers | Yes |
| GET | `/benefits/carriers/:id` | Get carrier by ID | Yes |
| POST | `/benefits/carriers` | Create carrier | Yes |
| PUT | `/benefits/carriers/:id` | Update carrier | Yes |
| DELETE | `/benefits/carriers/:id` | Deactivate carrier | Yes |

---

### Benefits Enrollment

**Prefix:** `/api/v1/benefits/enrollment`

Employee enrollment, dependents, open enrollment periods, and elections.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/benefits/enrollment/dependents` | List employee dependents | Yes |
| POST | `/benefits/enrollment/dependents` | Add dependent | Yes |
| PUT | `/benefits/enrollment/dependents/:id` | Update dependent | Yes |
| DELETE | `/benefits/enrollment/dependents/:id` | Remove dependent | Yes |
| GET | `/benefits/enrollment` | List enrollments | Yes |
| GET | `/benefits/enrollment/employee/:employeeId` | Get employee enrollments | Yes |
| GET | `/benefits/enrollment/employee/:employeeId/costs` | Get employee benefit costs | Yes |
| POST | `/benefits/enrollment/enroll` | Enroll employee | Yes |
| PUT | `/benefits/enrollment/:id` | Update enrollment | Yes |
| POST | `/benefits/enrollment/:id/terminate` | Terminate enrollment | Yes |
| POST | `/benefits/enrollment/:id/waive` | Waive coverage | Yes |
| GET | `/benefits/enrollment/open-periods` | List open enrollment periods | Yes |
| GET | `/benefits/enrollment/open-periods/current` | Get current open enrollment | Yes |
| POST | `/benefits/enrollment/open-periods` | Create open enrollment period | Yes |
| POST | `/benefits/enrollment/elections` | Submit elections | Yes |
| GET | `/benefits/enrollment/my-enrollments` | Get my enrollments | Yes |
| GET | `/benefits/enrollment/statistics` | Get enrollment statistics | Yes |

---

### Flex Fund

**Prefix:** `/api/v1/benefits/flex-fund`

Flexible benefits fund allocation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/benefits/flex-fund/options` | List flex-eligible benefit options | Yes |
| GET | `/benefits/flex-fund/balance/:employeeId` | Get employee flex fund balance | Yes |
| POST | `/benefits/flex-fund` | Create flex benefit fund | Yes |
| POST | `/benefits/flex-fund/allocate` | Allocate flex credits to a benefit | Yes |
| DELETE | `/benefits/flex-fund/:id` | Cancel flex fund allocation | Yes |

---

### Life Events

**Prefix:** `/api/v1/benefits/life-events`

Qualifying life event reporting and review for mid-year benefit changes.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/benefits/life-events` | List life events | Yes |
| POST | `/benefits/life-events` | Report life event | Yes |
| POST | `/benefits/life-events/:id/review` | Review life event | Yes |
| GET | `/benefits/life-events/mine` | Get my life events | Yes |

---

### Benefits Exchange

**Prefix:** `/api/v1/benefits-exchange`

Electronic benefits data exchange with carriers (EDI files).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/benefits-exchange/generate` | Generate outbound exchange file | Yes |
| GET | `/benefits-exchange/history` | Get exchange history | Yes |
| GET | `/benefits-exchange/:id` | Get exchange by ID | Yes |
| POST | `/benefits-exchange/process-inbound` | Process inbound exchange file | Yes |

---

### Beneficiary Nominations

**Prefix:** `/api/v1/beneficiary-nominations`

Death-in-service and pension beneficiary nominations.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/beneficiary-nominations/employee/:employeeId` | List beneficiary nominations for an employee | Yes |
| GET | `/beneficiary-nominations/employee/:employeeId/summary` | Get beneficiary nomination percentage summary | Yes |
| POST | `/beneficiary-nominations` | Create a beneficiary nomination | Yes |
| GET | `/beneficiary-nominations/:id` | Get a beneficiary nomination | Yes |
| PATCH | `/beneficiary-nominations/:id` | Update a beneficiary nomination | Yes |
| DELETE | `/beneficiary-nominations/:id` | Delete a beneficiary nomination | Yes |

---

## Employee Self-Service

### Portal

**Prefix:** `/api/v1/portal`

Employee self-service portal: profile, team, tasks, approvals, directory, and org chart.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/portal/me` | Get my profile | Yes |
| GET | `/portal/my-team` | Get my direct reports | Yes |
| GET | `/portal/tasks` | Get my pending tasks | Yes |
| GET | `/portal/approvals` | Get my pending approvals | Yes |
| GET | `/portal/directory` | Search employee directory | Yes |
| GET | `/portal/directory/departments` | List departments for directory | Yes |
| GET | `/portal/dashboard` | Get dashboard summary | Yes |
| GET | `/portal/org-chart` | Get organisation chart | Yes |
| GET | `/portal/org-chart/:employeeId/team` | Get direct reports for an employee | Yes |

---

### Client Portal

**Prefix:** `/api/v1/client-portal`

Multi-tenant client portal for external clients with ticket system, document sharing, billing, and news.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/client-portal/profile` | Get current portal user profile | Yes |
| GET | `/client-portal/dashboard` | Get dashboard data | Yes |
| GET | `/client-portal/tickets` | List my tickets | Yes |
| POST | `/client-portal/tickets` | Create ticket | Yes |
| GET | `/client-portal/tickets/:id` | Get ticket by ID | Yes |
| POST | `/client-portal/tickets/:id/reply` | Reply to ticket | Yes |
| GET | `/client-portal/documents` | List documents | Yes |
| GET | `/client-portal/documents/:id` | Get document by ID | Yes |
| POST | `/client-portal/documents/:id/acknowledge` | Acknowledge document | Yes |
| GET | `/client-portal/news` | List news articles | Yes |
| GET | `/client-portal/news/:slug` | Get news article by slug | Yes |
| GET | `/client-portal/billing` | Get billing overview | Yes |
| GET | `/client-portal/invoices` | List invoices | Yes |
| GET | `/client-portal/invoices/:id` | Get invoice by ID | Yes |
| GET | `/client-portal/admin/tickets` | List all tickets (admin) | Yes |
| PATCH | `/client-portal/admin/tickets/:id` | Update ticket (admin) | Yes |
| GET | `/client-portal/admin/users` | List portal users (admin) | Yes |
| POST | `/client-portal/admin/users` | Create portal user (admin) | Yes |
| GET | `/client-portal/admin/users/:id` | Get portal user (admin) | Yes |
| PATCH | `/client-portal/admin/users/:id` | Update portal user (admin) | Yes |
| POST | `/client-portal/admin/documents` | Create document (admin) | Yes |
| PATCH | `/client-portal/admin/documents/:id` | Update document (admin) | Yes |
| DELETE | `/client-portal/admin/documents/:id` | Delete document (admin) | Yes |
| POST | `/client-portal/admin/news` | Create news article (admin) | Yes |
| PATCH | `/client-portal/admin/news/:id` | Update news article (admin) | Yes |
| DELETE | `/client-portal/admin/news/:id` | Delete news article (admin) | Yes |

---

### Employee Change Requests

**Prefix:** `/api/v1/portal/change-requests` (employee) and `/api/v1/hr/change-requests` (admin)

Employee-initiated change requests with HR approval workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/portal/change-requests` | Submit a personal details change request | Yes |
| POST | `/portal/change-requests/batch` | Submit multiple change requests at once | Yes |
| GET | `/portal/change-requests` | List my change requests | Yes |
| GET | `/portal/change-requests/count` | Get count of my pending change requests | Yes |
| DELETE | `/portal/change-requests/:id` | Cancel a pending change request | Yes |
| GET | `/hr/change-requests/pending` | List pending change requests for review | Yes |
| GET | `/hr/change-requests/pending/count` | Get count of pending change requests for review | Yes |
| GET | `/hr/change-requests/:id` | Get a change request by ID | Yes |
| PATCH | `/hr/change-requests/:id/review` | Review (approve/reject) a change request | Yes |

---

### Personal Detail Changes

**Prefix:** `/api/v1/portal/personal-detail-changes` (employee) and `/api/v1/hr/personal-detail-changes` (admin)

An alternative personal detail change flow (parallel to employee change requests).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/portal/personal-detail-changes` | Submit a personal detail change request | Yes |
| GET | `/portal/personal-detail-changes` | List my personal detail change requests | Yes |
| GET | `/portal/personal-detail-changes/count` | Get count of my pending requests | Yes |
| PATCH | `/portal/personal-detail-changes/:id/cancel` | Cancel a pending request | Yes |
| GET | `/hr/personal-detail-changes/pending` | List pending requests for review | Yes |
| GET | `/hr/personal-detail-changes/pending/count` | Get count of pending requests for review | Yes |
| GET | `/hr/personal-detail-changes/:id` | Get a request by ID | Yes |
| PATCH | `/hr/personal-detail-changes/:id/review` | Review (approve/reject) a request | Yes |

---

### Diversity

**Prefix:** `/api/v1/diversity`

Voluntary diversity data collection (self-reported, anonymised aggregation).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/diversity/me` | Get my diversity data | Yes |
| PUT | `/diversity/me` | Submit or update my diversity data | Yes |
| DELETE | `/diversity/me` | Withdraw my diversity data | Yes |
| GET | `/diversity/statistics` | Get aggregate diversity statistics | Yes |
| GET | `/diversity/completion` | Get diversity data completion rate | Yes |

---

### Employee Photos

**Prefix:** `/api/v1/employee-photos`

Employee profile photo management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/employee-photos/:employeeId` | Get employee photo metadata | Yes |
| POST | `/employee-photos/:employeeId` | Upload an employee photo | Yes |
| PATCH | `/employee-photos/:employeeId` | Update employee photo metadata | Yes |
| DELETE | `/employee-photos/:employeeId` | Delete an employee photo | Yes |

---

### Emergency Contacts

**Prefix:** `/api/v1/emergency-contacts`

Employee emergency contact management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/emergency-contacts/employee/:employeeId` | List emergency contacts for an employee | Yes |
| POST | `/emergency-contacts` | Create an emergency contact | Yes |
| PATCH | `/emergency-contacts/:id` | Update an emergency contact | Yes |
| DELETE | `/emergency-contacts/:id` | Delete an emergency contact | Yes |

---

### Bank Details

**Prefix:** `/api/v1/bank-details`

Employee bank account details (encrypted storage).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/bank-details/employee/:employeeId` | List bank details for an employee | Yes |
| GET | `/bank-details/:id` | Get a bank detail by ID | Yes |
| POST | `/bank-details` | Create a bank detail for an employee | Yes |
| PUT | `/bank-details/:id` | Update a bank detail | Yes |
| DELETE | `/bank-details/:id` | Delete a bank detail | Yes |

---

### Announcements

**Prefix:** `/api/v1/announcements`

Company announcements with targeting by department and role.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/announcements` | List announcements (admin) | Yes |
| GET | `/announcements/active` | List active announcements for current employee | Yes |
| POST | `/announcements` | Create a new announcement | Yes |
| GET | `/announcements/:id` | Get an announcement by ID | Yes |
| PUT | `/announcements/:id` | Update an announcement | Yes |
| POST | `/announcements/:id/publish` | Publish an announcement immediately | Yes |
| DELETE | `/announcements/:id` | Delete an announcement | Yes |

---

### Notifications

**Prefix:** `/api/v1/notifications`

In-app notifications, push notifications (Firebase), and Web Push subscriptions.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/notifications` | List notifications for current user | Yes |
| GET | `/notifications/unread-count` | Get unread notification count | Yes |
| GET | `/notifications/push-tokens` | List push tokens for current user | Yes |
| POST | `/notifications/push-tokens` | Register a push notification token | Yes |
| DELETE | `/notifications/push-tokens/:id` | Remove a push notification token | Yes |
| POST | `/notifications/mark-all-read` | Mark all notifications as read | Yes |
| GET | `/notifications/:id` | Get a notification by ID | Yes |
| POST | `/notifications/:id/read` | Mark a notification as read | Yes |
| POST | `/notifications/:id/dismiss` | Dismiss a notification | Yes |
| DELETE | `/notifications/:id` | Delete a notification | Yes |
| GET | `/notifications/web-push/vapid-key` | Get VAPID public key for Web Push subscription | Yes |
| GET | `/notifications/web-push/subscriptions` | List Web Push subscriptions for current user | Yes |
| POST | `/notifications/web-push/subscribe` | Subscribe to Web Push notifications | Yes |
| DELETE | `/notifications/web-push/unsubscribe` | Unsubscribe from Web Push notifications by endpoint | Yes |
| DELETE | `/notifications/web-push/subscriptions/:id` | Unsubscribe from Web Push notifications by subscription ID | Yes |

---

### Policy Distribution

**Prefix:** `/api/v1/policy-distributions`

Distribute policy documents to employees and track acknowledgements.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/policy-distributions` | List all policy distributions | Yes |
| POST | `/policy-distributions` | Distribute a policy document | Yes |
| GET | `/policy-distributions/:id` | Get distribution status with acknowledgements | Yes |
| POST | `/policy-distributions/:id/acknowledge` | Acknowledge a policy distribution (read receipt) | Yes |

---

### Delegations

**Prefix:** `/api/v1/delegations`

Delegate approval authority during absences.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/delegations` | Create approval delegation | Yes |
| GET | `/delegations/mine` | List my delegations | Yes |
| GET | `/delegations/active` | Get active delegation | Yes |
| DELETE | `/delegations/:id` | Revoke delegation | Yes |
| GET | `/delegations/log` | View delegation log | Yes |

---

### Equipment

**Prefix:** `/api/v1/equipment`

IT equipment catalog and employee equipment request management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/equipment/catalog` | List equipment catalog items | Yes |
| POST | `/equipment/catalog` | Create equipment catalog item | Yes |
| GET | `/equipment/catalog/:id` | Get equipment catalog item by ID | Yes |
| PATCH | `/equipment/catalog/:id` | Update equipment catalog item | Yes |
| DELETE | `/equipment/catalog/:id` | Deactivate equipment catalog item | Yes |
| GET | `/equipment/requests` | List equipment requests | Yes |
| POST | `/equipment/requests` | Create equipment request | Yes |
| GET | `/equipment/requests/:id` | Get equipment request by ID with history | Yes |
| PATCH | `/equipment/requests/:id` | Update equipment request status | Yes |

---

### E-Signatures

**Prefix:** `/api/v1/e-signatures`

Electronic document signing workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/e-signatures` | List signature requests | Yes |
| POST | `/e-signatures` | Create signature request | Yes |
| GET | `/e-signatures/:id` | Get signature request | Yes |
| GET | `/e-signatures/:id/events` | Get signature request events | Yes |
| POST | `/e-signatures/:id/send` | Send signature request | Yes |
| POST | `/e-signatures/:id/viewed` | Mark signature request as viewed | Yes |
| POST | `/e-signatures/:id/sign` | Sign internally | Yes |
| POST | `/e-signatures/:id/decline` | Decline signature request | Yes |
| POST | `/e-signatures/:id/cancel` | Cancel signature request | Yes |
| POST | `/e-signatures/:id/void` | Void signature request | Yes |
| POST | `/e-signatures/:id/remind` | Send reminder | Yes |

---

### Email Tracking

**Prefix:** `/api/v1/email-tracking`

Track email delivery status and bounces.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/email-tracking` | List email delivery log entries with filters | Yes |
| GET | `/email-tracking/statistics` | Get email delivery statistics | Yes |
| GET | `/email-tracking/:id` | Get a single email delivery log entry | Yes |
| POST | `/email-tracking/bounces` | Record an email bounce event | Yes |

---

## Document Management

### Documents

**Prefix:** `/api/v1/documents`

Document storage, templates, versioning, and upload/download URL generation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/documents` | List documents | Yes |
| GET | `/documents/expiring` | Get expiring documents | Yes |
| GET | `/documents/upload-url` | Get upload URL | Yes |
| GET | `/documents/templates` | List document templates | Yes |
| POST | `/documents/templates` | Create document template | Yes |
| PUT | `/documents/templates/:id` | Update document template | Yes |
| GET | `/documents/:id` | Get document by ID | Yes |
| GET | `/documents/:id/download-url` | Get download URL | Yes |
| POST | `/documents` | Create document | Yes |
| PUT | `/documents/:id` | Update document | Yes |
| DELETE | `/documents/:id` | Delete document | Yes |
| GET | `/documents/:id/versions` | List document versions | Yes |
| POST | `/documents/:id/versions` | Create document version | Yes |
| GET | `/documents/my-summary` | Get my document summary | Yes |

---

### Bulk Document Generation

**Prefix:** `/api/v1/documents/bulk`

Generate documents in bulk from templates.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/documents/bulk/generate` | Bulk generate documents | Yes |
| GET | `/documents/bulk/:batchId` | Get bulk generation batch status | Yes |

---

### Letter Templates

**Prefix:** `/api/v1/letter-templates`

HR letter templates with merge field support and letter generation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/letter-templates` | List letter templates | Yes |
| GET | `/letter-templates/:id` | Get letter template | Yes |
| POST | `/letter-templates` | Create letter template | Yes |
| PATCH | `/letter-templates/:id` | Update letter template | Yes |
| POST | `/letter-templates/:id/generate` | Generate letter from template | Yes |
| GET | `/letter-templates/generated` | List generated letters | Yes |
| GET | `/letter-templates/generated/:id` | Get generated letter | Yes |

---

## Operations & Admin

### Auth

**Prefix:** `/api/v1/auth`

Staffora-specific authentication endpoints (complements BetterAuth's `/api/auth/*`).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/auth/me` | Get current user | Yes |
| GET | `/auth/tenants` | List user tenants | Yes |
| GET | `/auth/mfa/backup-codes/status` | Get MFA backup code status | Yes |
| POST | `/auth/mfa/backup-codes/regenerate` | Regenerate MFA backup codes | Yes |
| POST | `/auth/switch-tenant` | Switch tenant | Yes |

> **Note:** Core auth endpoints (sign-up, sign-in, sign-out, password reset, email verification, MFA enable/verify) are handled by BetterAuth at `/api/auth/*`.

---

### SSO

**Prefix:** `/api/v1/sso/configs` (admin) and `/api/v1/auth/sso` (public)

SAML/OIDC Single Sign-On configuration and login flow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/sso/configs` | List SSO configurations | Yes |
| POST | `/sso/configs` | Create SSO configuration | Yes |
| GET | `/sso/configs/:id` | Get SSO configuration by ID | Yes |
| PATCH | `/sso/configs/:id` | Update SSO configuration | Yes |
| DELETE | `/sso/configs/:id` | Delete SSO configuration | Yes |
| GET | `/sso/configs/attempts` | List SSO login attempts | Yes |
| GET | `/auth/sso/discover` | Discover SSO providers | **No** |
| GET | `/auth/sso/login` | Initiate SSO login | **No** |
| GET | `/auth/sso/callback` | SSO callback | **No** |

---

### Security / RBAC

**Prefix:** `/api/v1/security`

Role-Based Access Control, audit logs, user management, and permission catalog.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/security/my-permissions` | Get my permissions | Yes |
| GET | `/security/audit-log` | List audit log entries | Yes |
| GET | `/security/users` | List tenant users | Yes |
| GET | `/security/roles` | List roles | Yes |
| GET | `/security/permissions` | List permission catalog | Yes |
| GET | `/security/roles/:id/permissions` | Get role permissions | Yes |
| POST | `/security/roles` | Create role | Yes |
| PUT | `/security/roles/:id` | Update role | Yes |
| DELETE | `/security/roles/:id` | Delete role | Yes |
| POST | `/security/roles/:id/permissions` | Grant permission to role | Yes |
| DELETE | `/security/roles/:id/permissions/:permId` | Revoke permission from role | Yes |
| POST | `/security/users/:userId/roles` | Assign role to user | Yes |
| DELETE | `/security/users/:userId/roles/:roleId` | Revoke role assignment | Yes |
| POST | `/security/users/invite` | Invite a new user to the tenant | Yes |
| GET | `/security/users/:userId/roles` | List user role assignments | Yes |

---

### Field Permissions

**Prefix:** `/api/v1/security/fields`

Column-level access control for sensitive data fields.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/security/fields` | List all field definitions | Yes |
| GET | `/security/fields/:entityName` | List fields for an entity | Yes |
| GET | `/security/fields/my-permissions` | Get current user's field permissions | Yes |
| GET | `/security/fields/roles/:roleId` | Get role field permissions | Yes |
| PUT | `/security/fields/roles/:roleId/bulk` | Bulk update role field permissions | Yes |
| PUT | `/security/fields/roles/:roleId/:fieldId` | Set field permission for a role | Yes |

---

### Security Portal

**Prefix:** `/api/v1/security/portal`

Portal access management (which portals users can access).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/security/portal/all` | List all active portals | Yes |
| GET | `/security/portal/mine` | Get user's available portals | Yes |
| GET | `/security/portal/:code` | Get portal by code | Yes |
| GET | `/security/portal/:code/menu` | Get portal navigation menu | Yes |
| POST | `/security/portal/switch` | Switch current portal | Yes |
| POST | `/security/portal/grant` | Grant portal access to user | Yes |
| DELETE | `/security/portal/revoke` | Revoke portal access from user | Yes |
| GET | `/security/portal/access/:userId` | Get user's portal access | Yes |
| POST | `/security/portal/sync-roles` | Sync portal access from roles | Yes |

---

### Security Inspection

**Prefix:** `/api/v1/security/inspection`

Permission inspector for debugging access control.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/security/inspection/user/:userId` | Get user effective permissions (inspector) | Yes |
| GET | `/security/inspection/scope/:userId` | Get user data scope (which employees they can see) | Yes |
| POST | `/security/inspection/simulate` | Simulate permission changes | Yes |
| GET | `/security/inspection/compare` | Compare two roles side by side | Yes |

---

### Manager Hub

**Prefix:** `/api/v1/security/manager`

Manager-specific views and approval actions.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/security/manager/overview` | Get team overview for dashboard | Yes |
| GET | `/security/manager/is-manager` | Check if user is a manager | Yes |
| GET | `/security/manager/direct-reports` | Get direct reports | Yes |
| GET | `/security/manager/subordinates` | Get all subordinates | Yes |
| GET | `/security/manager/team/:employeeId` | Get team member details | Yes |
| GET | `/security/manager/approvals` | Get pending approvals | Yes |
| POST | `/security/manager/approve` | Approve a request | Yes |
| POST | `/security/manager/reject` | Reject a request | Yes |
| POST | `/security/manager/bulk-approve` | Bulk approve or reject requests | Yes |
| GET | `/security/manager/absence-calendar` | Get team absence calendar | Yes |
| GET | `/security/manager/is-subordinate/:employeeId` | Check if employee is a subordinate | Yes |
| GET | `/security/manager/training-overview` | Get team training overview | Yes |
| GET | `/security/manager/training/:employeeId` | Get detailed training for a team member | Yes |

---

### Dashboard

**Prefix:** `/api/v1/dashboard`

Admin dashboard statistics.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/dashboard/stats` | Admin dashboard stats (cached, 60s TTL) | Yes |
| GET | `/dashboard/activity` | Recent admin activity (cached, 60s TTL) | Yes |
| GET | `/dashboard/...` | Additional dashboard widget | Yes |

---

### System

**Prefix:** `/api/v1/system`

System health and diagnostics.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/system/health` | System health | Yes |
| GET | `/system/sync-health` | User table sync health | Yes |

---

### Usage Stats

**Prefix:** `/api/v1/system/usage`

Tenant usage statistics.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/system/usage` | Get tenant usage statistics | Yes |

---

### Tenant

**Prefix:** `/api/v1/tenant`

Current tenant and settings management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/tenant/current` | Get current tenant | Yes |
| GET | `/tenant/settings` | Get tenant settings | Yes |
| PUT | `/tenant/settings` | Update tenant settings | Yes |

---

### Tenant Provisioning

**Prefix:** `/api/v1/admin/tenants`

Platform admin tenant provisioning.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/admin/tenants` | Provision a new tenant with automated setup | Yes |
| GET | `/admin/tenants/provisioning-logs` | List tenant provisioning logs | Yes |
| GET | `/admin/tenants/provisioning-logs/:id` | Get a specific provisioning log by ID | Yes |

---

### Feature Flags

**Prefix:** `/api/v1/admin/feature-flags` (admin) and `/api/v1/feature-flags` (evaluation)

Feature flag management and evaluation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/feature-flags` | List feature flags | Yes |
| POST | `/admin/feature-flags` | Create feature flag | Yes |
| PATCH | `/admin/feature-flags/:id` | Update feature flag | Yes |
| DELETE | `/admin/feature-flags/:id` | Delete feature flag | Yes |
| POST | `/feature-flags/evaluate` | Evaluate feature flags | Yes |
| GET | `/feature-flags/evaluate` | Evaluate feature flags (deprecated) | Yes |

---

### Webhooks

**Prefix:** `/api/v1/webhooks`

Webhook subscription management for event notifications.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/webhooks` | Create a webhook subscription | Yes |
| GET | `/webhooks` | List webhook subscriptions | Yes |
| GET | `/webhooks/:id` | Get a webhook subscription | Yes |
| PUT | `/webhooks/:id` | Update a webhook subscription | Yes |
| DELETE | `/webhooks/:id` | Delete a webhook subscription | Yes |
| POST | `/webhooks/:id/test` | Send a test webhook event | Yes |
| GET | `/webhooks/:id/deliveries` | List webhook deliveries | Yes |

---

### Integrations

**Prefix:** `/api/v1/integrations`

Third-party integration management.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/integrations` | List integrations for the current tenant | Yes |
| GET | `/integrations/:id` | Get a single integration by ID | Yes |
| POST | `/integrations` | Connect (create or update) an integration | Yes |
| PATCH | `/integrations/:id` | Update integration configuration | Yes |
| POST | `/integrations/:id/disconnect` | Disconnect an integration | Yes |
| POST | `/integrations/:id/test` | Test an integration connection | Yes |
| DELETE | `/integrations/:id` | Delete an integration | Yes |

---

### API Keys

**Prefix:** `/api/v1/api-keys`

API key management for machine-to-machine access.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api-keys` | List API keys | Yes |
| POST | `/api-keys` | Generate new API key | Yes |
| GET | `/api-keys/:id` | Get API key by ID | Yes |
| PATCH | `/api-keys/:id` | Update API key | Yes |
| DELETE | `/api-keys/:id` | Revoke API key | Yes |
| POST | `/api-keys/:id/rotate` | Rotate API key | Yes |

---

### Reports

**Prefix:** `/api/v1/reports`

Custom and system reports with scheduling, favourites, and export.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/reports/fields` | Get available report fields | Yes |
| GET | `/reports/fields/categories` | Get field categories | Yes |
| GET | `/reports/fields/:fieldId/values` | Get distinct values for a field | Yes |
| GET | `/reports/templates` | List system report templates | Yes |
| POST | `/reports/from-template` | Create report from template | Yes |
| GET | `/reports/favourites` | Get favourite reports | Yes |
| GET | `/reports/scheduled` | List scheduled reports | Yes |
| GET | `/reports` | List reports | Yes |
| POST | `/reports` | Create report | Yes |
| GET | `/reports/:id` | Get report by ID | Yes |
| PUT | `/reports/:id` | Update report | Yes |
| DELETE | `/reports/:id` | Delete report | Yes |
| POST | `/reports/:id/duplicate` | Duplicate report | Yes |
| POST | `/reports/:id/publish` | Publish report | Yes |
| POST | `/reports/:id/archive` | Archive report | Yes |
| POST | `/reports/:id/execute` | Execute report | Yes |
| POST | `/reports/:id/preview` | Preview report (25 rows) | Yes |
| GET | `/reports/:id/history` | Get execution history | Yes |
| POST | `/reports/:id/export` | Export report data | Yes |
| POST | `/reports/:id/favourite` | Add to favourites | Yes |
| DELETE | `/reports/:id/favourite` | Remove from favourites | Yes |
| POST | `/reports/:id/share` | Share report | Yes |
| GET | `/reports/:id/schedule` | Get report schedule | Yes |
| POST | `/reports/:id/schedule` | Set report schedule | Yes |
| DELETE | `/reports/:id/schedule` | Remove report schedule | Yes |
| GET | `/reports/contract-end-dates` | Contract end date report | Yes |

**Report Schedules sub-routes:** `/api/v1/reports/schedules`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/reports/schedules` | List report schedules | Yes |
| POST | `/reports/schedules` | Create report schedule | Yes |
| GET | `/reports/schedules/:id` | Get report schedule by ID | Yes |
| PUT | `/reports/schedules/:id` | Update report schedule | Yes |
| DELETE | `/reports/schedules/:id` | Delete report schedule | Yes |

---

### Bulk Operations

**Prefix:** `/api/v1/bulk`

Batch operations for employees, leave requests, and generic API calls.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/bulk/employees` | Bulk create employees | Yes |
| PATCH | `/bulk/employees` | Bulk update employee fields | Yes |
| POST | `/bulk/leave-requests/approve` | Bulk approve/reject leave requests | Yes |
| POST | `/bulk/execute` | Execute generic bulk API operations | Yes |

---

### Data Import

**Prefix:** `/api/v1/data-import`

CSV data import with validation pipeline.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/data-import/upload` | Upload CSV for import | Yes |
| POST | `/data-import/:jobId/validate` | Validate import job | Yes |
| POST | `/data-import/:jobId/execute` | Execute validated import | Yes |
| GET | `/data-import` | List import jobs | Yes |
| GET | `/data-import/:jobId` | Get import job status | Yes |
| GET | `/data-import/:jobId/errors` | Get import job errors | Yes |

---

### Analytics

**Prefix:** `/api/v1/analytics`

Organisation-wide analytics dashboards: headcount, turnover, attendance, leave, recruitment, workforce planning, diversity, and compensation.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/analytics/dashboard/executive` | Get executive dashboard | Yes |
| GET | `/analytics/dashboard/manager` | Get manager dashboard | Yes |
| GET | `/analytics/headcount/summary` | Get headcount summary | Yes |
| GET | `/analytics/headcount/by-department` | Get headcount by department | Yes |
| GET | `/analytics/headcount/trend` | Get headcount trend | Yes |
| GET | `/analytics/turnover/summary` | Get turnover summary | Yes |
| GET | `/analytics/turnover/by-department` | Get turnover by department | Yes |
| GET | `/analytics/turnover/by-reason` | Get turnover by reason | Yes |
| GET | `/analytics/attendance/summary` | Get attendance summary | Yes |
| GET | `/analytics/leave/summary` | Get leave summary | Yes |
| GET | `/analytics/leave/by-type` | Get leave by type | Yes |
| GET | `/analytics/recruitment/summary` | Get recruitment summary | Yes |
| GET | `/analytics/reports` | Get standard reports catalog | Yes |
| GET | `/analytics/workforce-planning` | Get workforce planning analytics | Yes |
| GET | `/analytics/workforce/headcount-trends` | Get headcount trends over time | Yes |
| GET | `/analytics/workforce/turnover-rate` | Get voluntary/involuntary turnover rate by department | Yes |
| GET | `/analytics/workforce/retirement-projection` | Get retirement projection | Yes |
| GET | `/analytics/workforce/tenure-distribution` | Get employee tenure distribution | Yes |
| GET | `/analytics/workforce/vacancy-rate` | Get vacancy rate by department | Yes |
| GET | `/analytics/workforce/summary` | Get key workforce metrics summary | Yes |
| GET | `/analytics/diversity` | Get diversity dashboard | Yes |
| GET | `/analytics/compensation` | Get compensation analytics dashboard | Yes |

---

### Recruitment Analytics

**Prefix:** `/api/v1/analytics/recruitment`

Dedicated recruitment analytics: time-to-fill, cost-per-hire, source effectiveness, pipeline.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/analytics/recruitment/time-to-fill` | Time-to-fill analytics | Yes |
| GET | `/analytics/recruitment/cost-per-hire` | Cost-per-hire analytics | Yes |
| GET | `/analytics/recruitment/source-effectiveness` | Source effectiveness analytics | Yes |
| GET | `/analytics/recruitment/pipeline` | Pipeline analytics | Yes |
| GET | `/analytics/recruitment/summary` | Recruitment analytics summary | Yes |

---

### Headcount Planning

**Prefix:** `/api/v1/headcount-planning`

Headcount planning with approval workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/headcount-planning` | List headcount plans | Yes |
| GET | `/headcount-planning/:id` | Get headcount plan by ID | Yes |
| POST | `/headcount-planning` | Create headcount plan | Yes |
| PATCH | `/headcount-planning/:id` | Update headcount plan | Yes |
| POST | `/headcount-planning/:id/approve` | Approve headcount plan | Yes |
| DELETE | `/headcount-planning/:id` | Delete headcount plan | Yes |
| GET | `/headcount-planning/:id/items` | List items in headcount plan | Yes |
| POST | `/headcount-planning/:id/items` | Add item to headcount plan | Yes |
| PATCH | `/headcount-planning/:id/items/:itemId` | Update item in headcount plan | Yes |
| DELETE | `/headcount-planning/:id/items/:itemId` | Delete item from headcount plan | Yes |

---

### Global Mobility

**Prefix:** `/api/v1/global-mobility/assignments`

International assignment management with status tracking.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/global-mobility/assignments` | List international assignments | Yes |
| GET | `/global-mobility/assignments/expiring` | List expiring international assignments | Yes |
| GET | `/global-mobility/assignments/:id` | Get international assignment by ID | Yes |
| POST | `/global-mobility/assignments` | Create international assignment | Yes |
| PATCH | `/global-mobility/assignments/:id` | Update international assignment | Yes |
| POST | `/global-mobility/assignments/:id/transition` | Transition assignment status | Yes |

---

### Workflows

**Prefix:** `/api/v1/workflows`

Generic approval workflow engine with definitions, instances, SLA escalation, and bulk processing.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/workflows/definitions` | List workflow definitions | Yes |
| POST | `/workflows/definitions` | Create workflow definition | Yes |
| GET | `/workflows/definitions/:id` | Get workflow definition by ID | Yes |
| PATCH | `/workflows/definitions/:id` | Update workflow definition | Yes |
| POST | `/workflows/definitions/:id/activate` | Activate workflow definition | Yes |
| GET | `/workflows/instances` | List workflow instances | Yes |
| POST | `/workflows/instances` | Start workflow instance | Yes |
| GET | `/workflows/instances/:id` | Get workflow instance by ID | Yes |
| GET | `/workflows/instances/:id/steps` | Get workflow instance steps | Yes |
| POST | `/workflows/instances/:id/cancel` | Cancel workflow instance | Yes |
| POST | `/workflows/steps/:stepId/process` | Process workflow step (approve/reject) | Yes |
| POST | `/workflows/steps/:stepId/reassign` | Reassign workflow step | Yes |
| POST | `/workflows/steps/bulk-process` | Bulk process workflow steps (approve/reject multiple) | Yes |
| GET | `/workflows/escalations` | List SLA escalation history | Yes |
| GET | `/workflows/my-approvals` | Get my pending approvals | Yes |

**State machine:** `draft -> pending -> in_progress -> completed | cancelled | failed`

---

### Cases

**Prefix:** `/api/v1/cases`

Case management with comments, appeals, and ACAS-compliant disciplinary/grievance workflow.

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/cases` | List cases | Yes |
| POST | `/cases` | Create case | Yes |
| GET | `/cases/:id` | Get case by ID | Yes |
| PATCH | `/cases/:id` | Update case | Yes |
| GET | `/cases/:id/comments` | Get case comments | Yes |
| POST | `/cases/:id/comments` | Add case comment | Yes |
| POST | `/cases/:id/appeals` | File case appeal | Yes |
| GET | `/cases/:id/appeals` | List case appeals | Yes |
| GET | `/cases/:id/appeals/latest` | Get latest case appeal | Yes |
| PATCH | `/cases/:id/appeals/decide` | Decide case appeal | Yes |
| POST | `/cases/:id/appeal` | File case appeal (legacy) | Yes |
| GET | `/cases/:id/appeal` | Get case appeal (legacy) | Yes |
| GET | `/cases/my-cases` | Get my cases | Yes |

**Disciplinary/Grievance sub-routes:** `cases/disciplinary.routes.ts`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/cases/:id/disciplinary` | Create ACAS disciplinary/grievance case | Yes |
| GET | `/cases/:id/disciplinary` | Get disciplinary/grievance case details | Yes |
| PATCH | `/cases/:id/disciplinary/investigation` | Record investigation findings | Yes |
| POST | `/cases/:id/disciplinary/hearing` | Schedule disciplinary/grievance hearing | Yes |
| PATCH | `/cases/:id/disciplinary/hearing-notes` | Record hearing notes and companion details | Yes |
| PATCH | `/cases/:id/disciplinary/decision` | Record disciplinary/grievance decision | Yes |
| POST | `/cases/:id/disciplinary/appeal` | Submit appeal against decision | Yes |
| PATCH | `/cases/:id/disciplinary/appeal-outcome` | Record appeal outcome | Yes |
| GET | `/cases/:id/disciplinary/compliance` | ACAS compliance check | Yes |
| PATCH | `/cases/:id/disciplinary/informal-resolution` | Record informal resolution attempt (grievance only) | Yes |
| POST | `/cases/:id/disciplinary/advance-investigation` | Advance grievance to investigation stage | Yes |

**State machine:** `open -> in_progress -> resolved -> closed` (with escalation and reopening)

---

### Admin Jobs (Service-only)

**Module:** `admin-jobs`

No HTTP routes. Provides background job scheduling and execution logic (cron jobs, cleanup tasks, notification delivery).

---

### Agency Workers (Service-only)

**Module:** `agency-workers`

No HTTP routes. Provides agency worker management service logic used by the agencies module and IR35 assessments.

---

## Response Conventions

### Paginated List Response

```json
{
  "items": [...],
  "nextCursor": "cursor_token_or_null",
  "hasMore": true
}
```

### Single Resource Response

```json
{
  "id": "uuid",
  "tenantId": "uuid",
  "createdAt": "2026-03-28T00:00:00Z",
  "updatedAt": "2026-03-28T00:00:00Z",
  ...fields
}
```

### Error Response

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

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (no session) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 409 | Conflict (duplicate, overlap) |
| 422 | Unprocessable Entity (business rule violation) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |

---

## Authentication

All routes under `/api/v1/*` require authentication via BetterAuth session cookies unless explicitly marked as **No** in the Auth column. The exceptions are:

- `GET /api/v1/calendar/feed/:token` - Public iCal feed (token-authenticated)
- `POST /api/v1/background-checks/webhook` - Provider webhook (signature-verified)
- `GET /api/v1/auth/sso/discover` - SSO provider discovery
- `GET /api/v1/auth/sso/login` - SSO login initiation
- `GET /api/v1/auth/sso/callback` - SSO callback

Core auth endpoints (sign-up, sign-in, password reset, etc.) are handled by BetterAuth at `/api/auth/*` (note: no `/v1/` prefix).

---

## Service-Only Modules (No Routes)

These 7 modules provide internal service logic but do not expose HTTP endpoints:

| Module | Description |
|--------|-------------|
| `admin-jobs` | Background job scheduling and execution |
| `agency-workers` | Agency worker management logic |
| `ir35` | IR35 off-payroll working assessment |
| `one-on-ones` | One-on-one meeting scheduling and notes |
| `overtime` | Shared overtime calculation logic |
| `ropa` | Record of Processing Activities (GDPR Article 30) |
| `suspensions` | Employee suspension management |
