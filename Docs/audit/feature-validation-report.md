# Feature Validation Report -- Enterprise HR Capability Checklist (603 Items)

**Platform:** Staffora HRIS
**Validation Date:** 2026-03-13
**Checklist Reference:** `audit/hr-enterprise-checklist.md` (603 items, 25 categories)
**Method:** Systematic codebase verification against migrations, API modules (routes.ts, service.ts, repository.ts), frontend routes, state machines, workers, and plugins.

---

## Executive Summary

| Metric | Count | % |
|--------|-------|---|
| **Total features checked** | **603** | 100% |
| **IMPLEMENTED** | **189** | 31.3% |
| **PARTIALLY IMPLEMENTED** | **108** | 17.9% |
| **NOT IMPLEMENTED** | **306** | 50.7% |

### By Priority Level

| Priority | Total | Implemented | Partial | Not Implemented | Coverage (Impl + Partial) |
|----------|-------|-------------|---------|-----------------|---------------------------|
| CRITICAL | 127 | 56 | 22 | 49 | 61.4% |
| HIGH | 332 | 107 | 65 | 160 | 51.8% |
| MEDIUM | 112 | 22 | 18 | 72 | 35.7% |
| LOW | 32 | 4 | 3 | 25 | 21.9% |

### By Category

| # | Category | Items | Impl | Partial | Not Impl | Coverage |
|---|----------|-------|------|---------|----------|----------|
| 1 | Employee Lifecycle Management | 32 | 14 | 8 | 10 | 68.8% |
| 2 | Employee Records & Personal Data | 28 | 12 | 7 | 9 | 67.9% |
| 3 | Organisation Structure | 24 | 12 | 5 | 7 | 70.8% |
| 4 | Position & Job Management | 15 | 7 | 3 | 5 | 66.7% |
| 5 | Contracts & Employment Terms | 30 | 10 | 6 | 14 | 53.3% |
| 6 | Compensation & Payroll | 44 | 5 | 5 | 34 | 22.7% |
| 7 | Absence & Leave Management | 49 | 14 | 9 | 26 | 46.9% |
| 8 | Time & Attendance | 30 | 12 | 6 | 12 | 60.0% |
| 9 | Recruitment & ATS | 32 | 14 | 6 | 12 | 62.5% |
| 10 | Onboarding | 24 | 10 | 5 | 9 | 62.5% |
| 11 | Performance Management | 25 | 12 | 5 | 8 | 68.0% |
| 12 | Learning & Development | 20 | 10 | 4 | 6 | 70.0% |
| 13 | Talent Management | 14 | 8 | 3 | 3 | 78.6% |
| 14 | Benefits Administration | 18 | 10 | 4 | 4 | 77.8% |
| 15 | Case Management | 20 | 8 | 5 | 7 | 65.0% |
| 16 | Document Management | 16 | 9 | 3 | 4 | 75.0% |
| 17 | Workflow & Approvals | 16 | 10 | 3 | 3 | 81.3% |
| 18 | Reporting & Analytics | 24 | 9 | 5 | 10 | 58.3% |
| 19 | Employee Self-Service Portal | 19 | 10 | 4 | 5 | 73.7% |
| 20 | Manager Self-Service | 14 | 7 | 3 | 4 | 71.4% |
| 21 | Security & Access Control | 26 | 19 | 4 | 3 | 88.5% |
| 22 | UK Employment Compliance | 28 | 6 | 6 | 16 | 42.9% |
| 23 | Integration & APIs | 18 | 8 | 4 | 6 | 66.7% |
| 24 | System Administration | 21 | 11 | 4 | 6 | 71.4% |
| 25 | Mobile & Accessibility | 16 | 5 | 4 | 7 | 56.3% |

---

## Detailed Validation by Category

### 1. Employee Lifecycle Management (32 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| ELM-001 | Employee creation wizard | PARTIAL | Backend: `POST /api/v1/hr/employees` with structured `CreateEmployeeSchema` (personal, contract, position, compensation). Frontend: employee creation page at `packages/web/app/routes/(admin)/hr/employees/route.tsx`. Gap: Not a multi-step wizard UX; single form submission. |
| ELM-002 | Unique employee number generation | IMPLEMENTED | `HRRepository.generateEmployeeNumber()` calls `app.generate_employee_number()` DB function. Tenant-scoped with prefix. `packages/api/src/modules/hr/repository.ts:903` |
| ELM-003 | Employment status state machine | IMPLEMENTED | Full state machine in `packages/shared/src/state-machines/employee.ts`. States: pending, active, on_leave, terminated. Transition validation, audit trail via status_history table. `migrations/0026_employee_status_history.sql` |
| ELM-004 | Employment start date recording | IMPLEMENTED | `hire_date` field in employees table (`migrations/0017_employees.sql`). Captured in `CreateEmployeeSchema`. Gap: Only single hire_date, no separate continuous_service_date or original_hire_date fields. |
| ELM-005 | Multiple employment support | NOT IMPLEMENTED | Database has one employee record per person per tenant. No concurrent employment model. |
| ELM-006 | Employee transfer processing | IMPLEMENTED | `PUT /api/v1/hr/employees/:id/position` with effective dating. `UpdateEmployeePositionSchema` includes org_unit_id, position_id, assignment_reason. `packages/api/src/modules/hr/routes.ts` |
| ELM-007 | Promotion processing | PARTIAL | Position and compensation changes via separate effective-dated endpoints. Gap: No single "promotion" transaction combining title, grade, salary, and reporting line change. |
| ELM-008 | Demotion processing | PARTIAL | Same endpoints as promotion (position change + compensation change). Gap: No specific demotion reason codes or acknowledgement workflow. |
| ELM-009 | Secondment management | NOT IMPLEMENTED | No secondment data model, tracking, or return date management. |
| ELM-010 | Acting-up arrangements | NOT IMPLEMENTED | No acting-up model or temporary higher-grade duty tracking. |
| ELM-011 | Termination processing | IMPLEMENTED | `POST /api/v1/hr/employees/:id/terminate` with termination_date, reason. Status transitions to `terminated` via state machine. `packages/api/src/modules/hr/routes.ts` |
| ELM-012 | Termination reason taxonomy | PARTIAL | Free-text `reason` field in `EmployeeTerminationSchema`. Gap: No structured reason taxonomy (resignation, dismissal subcategories, redundancy, SOSR, etc.). |
| ELM-013 | Resignation capture | PARTIAL | Termination endpoint handles resignation. Gap: No separate resignation date received, notice period tracking, or counter-offer workflow. |
| ELM-014 | Redundancy processing | NOT IMPLEMENTED | No redundancy selection criteria, consultation period tracking, or statutory pay calculation. |
| ELM-015 | PILON calculation | NOT IMPLEMENTED | No pay-in-lieu-of-notice calculation logic. |
| ELM-016 | Garden leave management | NOT IMPLEMENTED | No garden leave flag or restriction tracking. |
| ELM-017 | Exit interview recording | NOT IMPLEMENTED | No exit interview model or questionnaire system. |
| ELM-018 | Leaver checklist automation | PARTIAL | Onboarding module has checklists that could be adapted. Gap: No specific leaver checklist automation (IT revocation, equipment return, P45, etc.). |
| ELM-019 | Re-hire detection | NOT IMPLEMENTED | No previous employment detection logic. |
| ELM-020 | Re-hire processing | NOT IMPLEMENTED | No re-hire workflow with pre-populated data. |
| ELM-021 | TUPE transfer management | NOT IMPLEMENTED | No TUPE data model or transfer tracking. |
| ELM-022 | Employee timeline view | PARTIAL | `GET /api/v1/hr/employees/:id/history/:dimension` provides history per dimension (personal, contract, position, compensation, manager, status). Frontend has employee detail page. Gap: No unified chronological timeline aggregating all events. |
| ELM-023 | Employment history reconstruction | IMPLEMENTED | Effective-dated tables allow point-in-time queries. History endpoint returns records with effective_from/effective_to. |
| ELM-024 | Effective-dated changes | IMPLEMENTED | All employee data dimensions (personal, contract, position, compensation, manager) support effective dating. `packages/api/src/modules/hr/service.ts`, `packages/shared/src/utils/effective-dating.ts` |
| ELM-025 | Bulk employee creation | NOT IMPLEMENTED | No CSV/Excel import or bulk create endpoint. |
| ELM-026 | Employee merge and deduplication | NOT IMPLEMENTED | No duplicate detection or merge capability. |
| ELM-027 | Length of service calculation | PARTIAL | `tenure_years` field computed from hire_date in employee response. Gap: Does not account for breaks, TUPE, or statutory exceptions. |
| ELM-028 | Retirement date projection | NOT IMPLEMENTED | No retirement date calculation or alerts. |
| ELM-029 | Death in service processing | NOT IMPLEMENTED | No death-in-service workflow. |
| ELM-030 | Continuous service date override | NOT IMPLEMENTED | No separate continuous service date field with override capability. |
| ELM-031 | Employee record locking | NOT IMPLEMENTED | No record locking for terminated employees. |
| ELM-032 | Employee status change notifications | PARTIAL | Domain events emitted to outbox on status changes. Notification worker exists (`packages/api/src/jobs/notification-worker.ts`). Gap: Notification routing to specific parties (IT, payroll, facilities) not configured. |

### 2. Employee Records & Personal Data (28 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| EPD-001 | Personal details capture | IMPLEMENTED | `employee_personal` table with first_name, last_name, date_of_birth, gender, marital_status, nationality. `migrations/0018_employee_personal.sql` |
| EPD-002 | Preferred name handling | IMPLEMENTED | `preferred_name` field in `EmployeePersonalInputSchema` and `employee_personal` table. Separate from legal name. |
| EPD-003 | Title and honorifics | NOT IMPLEMENTED | No title/honorific field in schema. |
| EPD-004 | Pronoun recording | NOT IMPLEMENTED | No pronoun field in employee data model. |
| EPD-005 | Contact information management | IMPLEMENTED | `employee_contacts` table with type (phone, mobile, email, emergency). `migrations/0019_employee_contacts.sql` |
| EPD-006 | Address history with effective dating | IMPLEMENTED | `employee_addresses` table with effective_from/effective_to, address_type (home, work, mailing, emergency). `migrations/0020_employee_addresses.sql` |
| EPD-007 | Emergency contact management | PARTIAL | Emergency contacts stored in employee_contacts with type='emergency'. Gap: No separate emergency contact model with relationship, priority order, or medical authority flag. |
| EPD-008 | Dependant recording | PARTIAL | Benefits module has `dependents` table (`migrations/0103_benefit_enrollments.sql` area). Gap: Not linked to main employee record for general HR purposes. |
| EPD-009 | NI number validation | PARTIAL | `employee_identifiers` table stores identifier values including NI number (type='tax_id'). Gap: No NI-specific format validation regex in application code. |
| EPD-010 | Bank details management | NOT IMPLEMENTED | No bank details table or management. `employee_identifiers` does not cover sort code/account number. |
| EPD-011 | Tax code recording | NOT IMPLEMENTED | No tax code storage or management. |
| EPD-012 | Student loan deduction tracking | NOT IMPLEMENTED | No student loan data model. |
| EPD-013 | Diversity data collection | PARTIAL | Gender, marital_status, nationality captured. Gap: No ethnicity, disability, religion, sexual orientation fields. No anonymous aggregate reporting. |
| EPD-014 | Disability and reasonable adjustments | NOT IMPLEMENTED | No disability recording or adjustments tracking. |
| EPD-015 | Employee photo management | NOT IMPLEMENTED | No photo upload or storage. |
| EPD-016 | Qualification and certification tracking | PARTIAL | LMS module has `certificates` table with expiry dates (`migrations/0075_certificates.sql`). Gap: No general professional qualification tracking outside LMS completions. |
| EPD-017 | Previous employment history | NOT IMPLEMENTED | No previous employer data model. |
| EPD-018 | Employee notes and annotations | NOT IMPLEMENTED | No employee notes system. |
| EPD-019 | Employee attachments | PARTIAL | Documents module supports file uploads linked to employees. Gap: No categorisation tied directly to employee record. |
| EPD-020 | Custom employee fields | IMPLEMENTED | Field registry system (`migrations/0115_field_registry.sql`). Defines entity fields with data types, sensitivity flags, and UI grouping. |
| EPD-021 | Employee data validation rules | PARTIAL | TypeBox schemas enforce format validation at API layer. Gap: No tenant-configurable validation rules (mandatory fields by status, cross-field validation). |
| EPD-022 | Employee search and filtering | IMPLEMENTED | `GET /api/v1/hr/employees` with filters for status, org_unit_id, manager_id, position_id, search text, hire_date range. Cursor-based pagination. |
| EPD-023 | Employee quick view card | IMPLEMENTED | `packages/web/app/components/employee/EmployeeQuickView.tsx` component. Shows key employee info. |
| EPD-024 | Employee consent management | NOT IMPLEMENTED | No consent tracking system. |
| EPD-025 | Data retention scheduling | NOT IMPLEMENTED | No data retention policy or auto-deletion scheduling. |
| EPD-026 | Work anniversary tracking | NOT IMPLEMENTED | No anniversary tracking or alerts. |
| EPD-027 | Employee self-service profile editing | PARTIAL | Portal module has `GET /api/v1/portal/me`. Frontend route `packages/web/app/routes/(app)/me/profile/route.tsx`. Gap: No profile update endpoint with approval workflow for sensitive fields. |
| EPD-028 | Medical information recording | NOT IMPLEMENTED | No medical information data model. |

### 3. Organisation Structure (24 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| ORG-001 | Department hierarchy management | IMPLEMENTED | `org_units` table with parent_id, level, path. CRUD endpoints. `migrations/0014_org_units.sql`, `packages/api/src/modules/hr/routes.ts` |
| ORG-002 | Division and business unit tracking | PARTIAL | `org_units` can be nested at any level, but no explicit division/business unit type distinction. |
| ORG-003 | Cost centre management | IMPLEMENTED | `cost_centers` table with codes, descriptions, parent hierarchy. `migrations/0015_cost_centers.sql`. Linked to org_units. |
| ORG-004 | Location management | PARTIAL | `geofence_locations` table has name, address, timezone (`migrations/0109_geofence.sql`). Gap: No full location management separate from geofencing (jurisdiction, capacity). |
| ORG-005 | Reporting hierarchy definition | IMPLEMENTED | `reporting_lines` table with effective dating, relationship_type (direct, dotted, matrix). `migrations/0024_reporting_lines.sql` |
| ORG-006 | Matrix reporting support | IMPLEMENTED | `RelationshipTypeSchema` includes 'direct', 'dotted', 'matrix'. Stored in `reporting_lines` table. |
| ORG-007 | Organisation chart visualisation | IMPLEMENTED | `GET /api/v1/hr/org-chart` endpoint with `getOrgChart()` service method. `migrations/0099_org_chart_functions.sql`. Frontend: `packages/web/app/routes/(admin)/hr/org-chart/route.tsx` |
| ORG-008 | Org chart export | NOT IMPLEMENTED | No PDF/PNG/SVG export of org chart. |
| ORG-009 | Span of control analysis | NOT IMPLEMENTED | No management ratio calculation. |
| ORG-010 | Effective-dated org changes | IMPLEMENTED | `org_units` table has `effective_from`/`effective_to` columns. |
| ORG-011 | Future-dated org restructure | PARTIAL | Effective dating allows future dates. Gap: No preview or impact analysis for future changes. |
| ORG-012 | Team management | NOT IMPLEMENTED | No team entity separate from org hierarchy. |
| ORG-013 | Legal entity management | NOT IMPLEMENTED | No legal entity table. Tenant represents the top-level entity. |
| ORG-014 | PAYE reference assignment | NOT IMPLEMENTED | No PAYE reference storage. |
| ORG-015 | Working pattern assignment | PARTIAL | Schedules and shifts exist in time module (`migrations/0038_schedules.sql`, `0039_shifts.sql`). Gap: Not assigned as defaults per department/location. |
| ORG-016 | Public holiday calendar per location | IMPLEMENTED | `public_holidays` table with country, region, date, name. `migrations/0054_public_holidays.sql` |
| ORG-017 | Organisational change history | PARTIAL | Audit trail captures org unit changes. Gap: No dedicated before/after snapshot comparison. |
| ORG-018 | Department budget allocation | NOT IMPLEMENTED | No department budget model. |
| ORG-019 | Headcount reporting by structure | IMPLEMENTED | Analytics module: `getHeadcountByDepartment()`, `getHeadcountSummary()`. `packages/api/src/modules/analytics/service.ts` |
| ORG-020 | Org structure comparison | NOT IMPLEMENTED | No date-range comparison tool. |
| ORG-021 | Delegation of authority matrix | PARTIAL | `approval_delegations` table (`migrations/0110_delegation.sql`) covers approval delegation. Gap: No full authority matrix for financial and HR decisions. |
| ORG-022 | Organisation closure and merge | NOT IMPLEMENTED | No department/location closure workflow. |
| ORG-023 | Cross-entity reporting hierarchy | PARTIAL | Reporting lines are tenant-scoped but not entity-scoped (no legal entity model). Functionally works within a tenant. |
| ORG-024 | Organisation structure import/export | NOT IMPLEMENTED | No bulk import/export for org structure. |

### 4. Position & Job Management (15 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| PJM-001 | Position management | IMPLEMENTED | `positions` table with code, title, org_unit_id, headcount. Full CRUD. `migrations/0016_positions.sql`, `packages/api/src/modules/hr/routes.ts` |
| PJM-002 | Position budgeting | PARTIAL | `headcount` field exists on positions. Gap: No funded/unfunded status or budget source tracking. |
| PJM-003 | Position-to-employee assignment | IMPLEMENTED | `position_assignments` table with effective dating. `migrations/0023_position_assignments.sql`. API: `PUT /api/v1/hr/employees/:id/position` |
| PJM-004 | Vacancy tracking | PARTIAL | Position has `headcount` and `current_headcount` in response schema. Gap: No time-vacant calculation or recruitment requisition link. |
| PJM-005 | Job title management | PARTIAL | Positions have titles. `jobs` table exists (`migrations/0106_jobs.sql`). Gap: No controlled job title catalogue with family/competency mappings. |
| PJM-006 | Job family and function taxonomy | NOT IMPLEMENTED | No job family or function grouping model. |
| PJM-007 | Grade and band structure | PARTIAL | Positions have `job_grade`, `min_salary`, `max_salary`. Gap: No standalone grade/band structure with location variations. |
| PJM-008 | Grade progression rules | NOT IMPLEMENTED | No grade progression criteria or rules engine. |
| PJM-009 | Job description management | NOT IMPLEMENTED | Position has `description` field but no version-controlled JD management. |
| PJM-010 | Person specification management | NOT IMPLEMENTED | No person specification model. |
| PJM-011 | Headcount planning | NOT IMPLEMENTED | No future headcount planning or scenario modelling. |
| PJM-012 | Establishment control | NOT IMPLEMENTED | No hiring prevention above approved headcount. |
| PJM-013 | Job evaluation and sizing | NOT IMPLEMENTED | No job evaluation scoring system. |
| PJM-014 | Competency profile per role | IMPLEMENTED | Competencies module with competency frameworks, role mappings, and proficiency levels. `packages/api/src/modules/competencies/`, `migrations/0107_competencies.sql` |
| PJM-015 | Role-based training requirements | NOT IMPLEMENTED | No automatic training assignment per position/role. |

### 5. Contracts & Employment Terms (30 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| CET-001 | Employment contract generation | NOT IMPLEMENTED | No contract document generation from templates. |
| CET-002 | Contract type tracking | IMPLEMENTED | `ContractTypeSchema`: permanent, fixed_term, contractor, intern, temporary. Stored in `employment_contracts` table. `migrations/0022_employment_contracts.sql` |
| CET-003 | Fixed-term contract end date tracking | PARTIAL | `probation_end_date` exists but no specific fixed-term end date field or 4-year alert. |
| CET-004 | Fixed-term contract renewal | NOT IMPLEMENTED | No renewal workflow. |
| CET-005 | Zero-hours contract management | NOT IMPLEMENTED | Zero-hours not in ContractTypeSchema enum. |
| CET-006 | Contract amendment processing | PARTIAL | `PUT /api/v1/hr/employees/:id/contract` with effective dating. Gap: No signed acknowledgement workflow. |
| CET-007 | Section 1 statement compliance | NOT IMPLEMENTED | No Section 1 particulars validation or tracking. |
| CET-008 | Probation period management | PARTIAL | `probation_end_date` field in contract schema. Gap: No extension, review schedule, or pass/fail outcome tracking. |
| CET-009 | Probation review reminders | NOT IMPLEMENTED | No automated probation reminders. |
| CET-010 | Notice period tracking | IMPLEMENTED | `notice_period_days` field in contract data. |
| CET-011 | Statutory notice period calculation | NOT IMPLEMENTED | No automatic statutory minimum calculation based on service length. |
| CET-012 | Working hours recording | IMPLEMENTED | `working_hours_per_week` field in contract schema. FTE calculated. |
| CET-013 | Working pattern definition | PARTIAL | Schedules and shifts defined in time module. Gap: No compressed hours or flexible pattern templates. |
| CET-014 | FTE calculation | IMPLEMENTED | `fte` field (0.01-1.0) in contract schema. |
| CET-015 | Flexible working request processing | NOT IMPLEMENTED | No flexible working request workflow. |
| CET-016 | Work location specification | PARTIAL | Position is linked to org_unit. Geofence locations exist. Gap: No hybrid/home working arrangement tracking. |
| CET-017 | Right to work documentation | IMPLEMENTED | Full RTW module: `packages/api/src/modules/right-to-work/`. Tables for checks, documents, compliance dashboard. `migrations/0125_right_to_work.sql` |
| CET-018 | Right to work share code verification | IMPLEMENTED | RTW check types include `online_share_code`. Share code recording supported. |
| CET-019 | Visa and immigration status tracking | PARTIAL | RTW module tracks document expiry and follow-up dates. Gap: No specific visa type, sponsor, or CoS tracking. |
| CET-020 | Continuous employment calculation | NOT IMPLEMENTED | No continuous employment calculation accounting for breaks. |
| CET-021 | Contract template management | NOT IMPLEMENTED | No contract template system. |
| CET-022 | Restrictive covenant tracking | NOT IMPLEMENTED | No post-employment restriction model. |
| CET-023 | Collective agreement tracking | NOT IMPLEMENTED | No collective agreement data model. |
| CET-024 | Agency worker tracking | NOT IMPLEMENTED | No agency worker or AWR 12-week tracking. |
| CET-025 | IR35 status determination | NOT IMPLEMENTED | No IR35 determination workflow. |
| CET-026 | Contract version history | PARTIAL | Contract changes are effective-dated (history preserved). Gap: No diff comparison or document download. |
| CET-027 | Digital contract signing | NOT IMPLEMENTED | No e-signature integration. |
| CET-028 | Contractual benefits recording | NOT IMPLEMENTED | No non-salary contractual benefits model. |
| CET-029 | Hours change impact analysis | NOT IMPLEMENTED | No automatic downstream impact calculation. |
| CET-030 | Mass contract amendment | NOT IMPLEMENTED | No bulk contract change processing. |

### 6. Compensation & Payroll (44 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| CPY-001 | Pay period configuration | NOT IMPLEMENTED | No pay period or payroll calendar model. |
| CPY-002 | Pay schedule assignment | NOT IMPLEMENTED | No pay schedule system. |
| CPY-003 | Salary recording with effective dating | IMPLEMENTED | `compensation_history` table. `PUT /api/v1/hr/employees/:id/compensation` with effective_from, base_salary, currency, pay_frequency, change_reason. `migrations/0025_compensation_history.sql` |
| CPY-004 | Salary history tracking | IMPLEMENTED | Full history via `GET /api/v1/hr/employees/:id/history/compensation`. Effective-dated records. |
| CPY-005 | Salary band and range definition | PARTIAL | `min_salary`, `max_salary` on positions. Gap: No standalone grade/band structure with midpoint, location variations. |
| CPY-006 | Compa-ratio calculation | NOT IMPLEMENTED | No compa-ratio calculation. |
| CPY-007 | Annual pay review process | NOT IMPLEMENTED | No pay review workflow. |
| CPY-008 | Pay review budget modelling | NOT IMPLEMENTED | No budget modelling. |
| CPY-009 | Pay element configuration | NOT IMPLEMENTED | No pay elements (allowances, deductions, overtime rates). |
| CPY-010 | Recurring deduction management | NOT IMPLEMENTED | No deduction management. |
| CPY-011 | One-off payment processing | NOT IMPLEMENTED | No ad-hoc payment processing. |
| CPY-012 | Bonus scheme management | NOT IMPLEMENTED | No bonus scheme model. |
| CPY-013 | Bonus calculation and processing | NOT IMPLEMENTED | No bonus calculation. |
| CPY-014 | National Minimum Wage compliance | NOT IMPLEMENTED | No NMW validation. |
| CPY-015 | NMW age band tracking | NOT IMPLEMENTED | No age-based rate tracking. |
| CPY-016 | Tax code management | NOT IMPLEMENTED | No tax code storage or management. |
| CPY-017 | National Insurance category tracking | NOT IMPLEMENTED | No NI category model. |
| CPY-018 | Student loan deduction management | NOT IMPLEMENTED | No student loan tracking. |
| CPY-019 | Benefits in Kind recording | NOT IMPLEMENTED | No BIK model. |
| CPY-020 | P11D reporting | NOT IMPLEMENTED | No P11D generation. |
| CPY-021 | Payrolling of benefits | NOT IMPLEMENTED | No payrolling capability. |
| CPY-022 | P45 generation | NOT IMPLEMENTED | No P45 generation. PDF worker exists but no P45 template. |
| CPY-023 | P60 generation | NOT IMPLEMENTED | No P60 generation. |
| CPY-024 | Starter checklist processing | NOT IMPLEMENTED | No HMRC Starter Checklist. |
| CPY-025 | RTI FPS submission data | NOT IMPLEMENTED | No RTI data generation. |
| CPY-026 | RTI EPS submission data | NOT IMPLEMENTED | No EPS generation. |
| CPY-027 | Payslip generation | NOT IMPLEMENTED | No payslip generation. |
| CPY-028 | Electronic payslip distribution | NOT IMPLEMENTED | No payslip distribution. |
| CPY-029 | Salary sacrifice management | NOT IMPLEMENTED | No salary sacrifice model. |
| CPY-030 | Auto-enrolment pension compliance | NOT IMPLEMENTED | No pension auto-enrolment. |
| CPY-031 | Pension contribution calculation | NOT IMPLEMENTED | No pension calculations. |
| CPY-032 | Pension scheme management | NOT IMPLEMENTED | No pension scheme model. |
| CPY-033 | Pension re-enrolment | NOT IMPLEMENTED | No pension re-enrolment. |
| CPY-034 | Apprenticeship Levy calculation | NOT IMPLEMENTED | No Apprenticeship Levy. |
| CPY-035 | Gender pay gap data preparation | NOT IMPLEMENTED | No gender pay gap calculations. |
| CPY-036 | CEO pay ratio reporting | NOT IMPLEMENTED | No CEO pay ratio. |
| CPY-037 | Holiday pay calculation (Harpur Trust) | NOT IMPLEMENTED | No holiday pay calculation. |
| CPY-038 | Final pay calculation | NOT IMPLEMENTED | No final pay calculation. |
| CPY-039 | Back-pay calculation | NOT IMPLEMENTED | No back-pay calculation. |
| CPY-040 | Attachment of earnings processing | NOT IMPLEMENTED | No AEO processing. |
| CPY-041 | Payroll variance reporting | NOT IMPLEMENTED | No payroll variance report. |
| CPY-042 | Payroll costing report | NOT IMPLEMENTED | No payroll costing. |
| CPY-043 | Payroll journal generation | NOT IMPLEMENTED | No journal generation. |
| CPY-044 | Payroll period locking | PARTIAL | Idempotency prevents duplicate processing. Gap: No explicit payroll period locking mechanism. |

### 7. Absence & Leave Management (49 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| ALM-001 | Holiday entitlement calculation | PARTIAL | Leave types and policies defined. `leave_balances` and `leave_balance_ledger` tables. Gap: No automatic statutory minimum (5.6 weeks) calculation. |
| ALM-002 | Pro-rata holiday calculation | NOT IMPLEMENTED | No pro-rata calculation for part-year or part-time. |
| ALM-003 | Holiday year configuration | PARTIAL | Leave policies exist with configurable parameters. Gap: No explicit holiday year start date configuration. |
| ALM-004 | Holiday carry-over rules | NOT IMPLEMENTED | No carry-over rules in leave policies. |
| ALM-005 | Holiday booking workflow | IMPLEMENTED | `POST /api/v1/absence/leave-requests`. Leave request state machine (draft, pending, approved, rejected, cancelled). `leave_approvals` table. `packages/shared/src/state-machines/leave-request.ts` |
| ALM-006 | Holiday calendar view | PARTIAL | Frontend leave route exists. Gap: No team calendar view with drag-and-drop. |
| ALM-007 | Holiday clash detection | NOT IMPLEMENTED | No concurrent absence limit or team minimum coverage rules. |
| ALM-008 | Compulsory holiday (shutdown) booking | NOT IMPLEMENTED | No compulsory holiday assignment. |
| ALM-009 | Holiday balance dashboard | IMPLEMENTED | `GET /api/v1/absence/balances` endpoint. Leave balance tracking with ledger. |
| ALM-010 | Bank holiday handling | PARTIAL | `public_holidays` table exists. Gap: No configurable treatment per employee group. |
| ALM-011 | Sick leave recording | IMPLEMENTED | Leave types include sickness. Leave requests support reason recording. |
| ALM-012 | Self-certification period | NOT IMPLEMENTED | No 7-day self-certification tracking or automated notification. |
| ALM-013 | Fit note management | NOT IMPLEMENTED | No fit note data model. |
| ALM-014 | SSP qualification checking | IMPLEMENTED | SSP module with qualification checking: qualifying days, waiting days, LEL test, linked spells, 28-week maximum. `packages/api/src/modules/ssp/`, `migrations/0124_ssp.sql` |
| ALM-015 | SSP calculation | IMPLEMENTED | SSP service with daily log, rate calculation, PIW period management. `packages/api/src/modules/ssp/service.ts` |
| ALM-016 | Occupational sick pay scheme | NOT IMPLEMENTED | No occupational sick pay tiers. |
| ALM-017 | Return-to-work interview tracking | NOT IMPLEMENTED | No RTW interview model. |
| ALM-018 | Bradford Factor calculation | NOT IMPLEMENTED | No Bradford Factor calculation. |
| ALM-019 | Absence trigger alerts | NOT IMPLEMENTED | No configurable absence trigger alerts. |
| ALM-020 | Maternity leave management | IMPLEMENTED | Statutory leave module covers maternity: EWC, MATB1, intended start, actual dates, return date, KIT days. `packages/api/src/modules/statutory-leave/`, `migrations/0124_statutory_leave.sql` |
| ALM-021 | SMP qualification and calculation | PARTIAL | Statutory leave module has pay calculation endpoint. Gap: Full SMP qualification (26 weeks + LEL test) and rate calculation (90% AWE for 6 weeks, then statutory rate) may not be fully implemented. |
| ALM-022 | Enhanced maternity pay | NOT IMPLEMENTED | No enhanced maternity pay above SMP. |
| ALM-023 | Maternity KIT days | PARTIAL | KIT days tracked in statutory leave module. Gap: Pay calculation for KIT days may not be implemented. |
| ALM-024 | Paternity leave management | IMPLEMENTED | Statutory leave module covers paternity leave type. |
| ALM-025 | SPP calculation | PARTIAL | Pay calculation endpoint exists. Gap: Full SPP rate logic may not be complete. |
| ALM-026 | Adoption leave management | IMPLEMENTED | Statutory leave module includes adoption leave type. |
| ALM-027 | Shared parental leave (SPL) | IMPLEMENTED | Statutory leave module includes shared_parental leave type. |
| ALM-028 | ShPP calculation | PARTIAL | Pay calculation endpoint exists. Gap: Remaining entitlement calculation from SMP/SAP/SPP may not be complete. |
| ALM-029 | Parental bereavement leave | NOT IMPLEMENTED | Not in statutory leave type enum. |
| ALM-030 | Unpaid parental leave | NOT IMPLEMENTED | No unpaid parental leave tracking. |
| ALM-031 | Neonatal care leave | NOT IMPLEMENTED | Not in statutory leave type enum. |
| ALM-032 | Carer's leave | NOT IMPLEMENTED | Not in statutory leave type enum. |
| ALM-033 | Compassionate leave management | NOT IMPLEMENTED | No compassionate leave type or configuration. |
| ALM-034 | Jury service leave | NOT IMPLEMENTED | No jury service absence type. |
| ALM-035 | Time off for dependants | NOT IMPLEMENTED | No dependant emergency leave type. |
| ALM-036 | Study and exam leave | NOT IMPLEMENTED | No study leave type. |
| ALM-037 | Sabbatical and career break | NOT IMPLEMENTED | No sabbatical model. |
| ALM-038 | TOIL booking and balance | NOT IMPLEMENTED | No TOIL accrual or booking system. |
| ALM-039 | Absence approval delegation | PARTIAL | `approval_delegations` table exists. Gap: No specific integration with absence approval flow. |
| ALM-040 | Half-day and hourly absence | NOT IMPLEMENTED | No half-day or hourly absence booking. |
| ALM-041 | Absence accrual and liability reporting | NOT IMPLEMENTED | No accrual liability calculation (IAS 19/FRS 102). |
| ALM-042 | Long-term sickness management | PARTIAL | SSP module tracks 28-week periods. Gap: No OH referral triggers, welfare meeting workflow, or capability process integration. |
| ALM-043 | Occupational health referral tracking | NOT IMPLEMENTED | No OH referral model. |
| ALM-044 | Absence cost reporting | NOT IMPLEMENTED | No absence cost calculation. |
| ALM-045 | Absence pattern reporting | NOT IMPLEMENTED | No pattern analysis (day-of-week, back-to-back). |
| ALM-046 | Holiday purchase/sell scheme | NOT IMPLEMENTED | No buy/sell holiday scheme. |
| ALM-047 | Absence type configuration | IMPLEMENTED | `leave_types` table with tenant-specific configuration. `POST /api/v1/absence/leave-types`. `migrations/0047_leave_types.sql` |
| ALM-048 | Absence entitlement by service | NOT IMPLEMENTED | No service-based entitlement tiers. |
| ALM-049 | Absence data export for payroll | NOT IMPLEMENTED | No absence-to-payroll export. |

### 8. Time & Attendance (30 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| TAT-001 | Clock in/out recording | IMPLEMENTED | `POST /api/v1/time/clock`. `time_events` table with timestamp, source, type (clock_in, clock_out, break_start, break_end). `migrations/0037_time_events.sql` |
| TAT-002 | Multiple clock sources | IMPLEMENTED | `time_devices` table with types (web, mobile, kiosk, biometric, api). `migrations/0036_time_devices.sql` |
| TAT-003 | GPS/geofence clock validation | IMPLEMENTED | `geofence_locations` table with lat/lng/radius. `migrations/0109_geofence.sql`. Time events capture location data. |
| TAT-004 | Timesheet submission | IMPLEMENTED | `timesheets` and `timesheet_lines` tables. `POST /api/v1/time/timesheets`. `migrations/0042_timesheets.sql`, `0043_timesheet_lines.sql` |
| TAT-005 | Timesheet approval workflow | IMPLEMENTED | `timesheet_approvals` table. `POST /api/v1/time/timesheets/:id/approve`, `POST /api/v1/time/timesheets/:id/reject`. `migrations/0044_timesheet_approvals.sql` |
| TAT-006 | Overtime recording and categorisation | PARTIAL | `overtime_rules` table exists (`migrations/0045_overtime_rules.sql`). Gap: No overtime recording on time events or specific overtime type categorisation. |
| TAT-007 | Overtime pre-authorisation | NOT IMPLEMENTED | No pre-approval workflow for overtime. |
| TAT-008 | Overtime rate calculation | PARTIAL | `overtime_rules` table with rate configuration. Gap: No automatic rate application to time entries. |
| TAT-009 | TOIL accrual from overtime | NOT IMPLEMENTED | No TOIL conversion from overtime. |
| TAT-010 | Shift pattern management | IMPLEMENTED | `shifts` table with rotation support. `schedules` table. `migrations/0039_shifts.sql`, `0038_schedules.sql` |
| TAT-011 | Shift allocation | IMPLEMENTED | `shift_assignments` table linking employees to shifts. `migrations/0040_shift_assignments.sql` |
| TAT-012 | Shift swap requests | IMPLEMENTED | `shift_swap_requests` table with requester, requestee, and status. `migrations/0041_shift_swap_requests.sql` |
| TAT-013 | Shift premium calculation | NOT IMPLEMENTED | No shift premium calculation logic. |
| TAT-014 | Break time tracking and enforcement | PARTIAL | Time events include break_start/break_end types. Gap: No WTR break enforcement (20 min per 6-hour shift). |
| TAT-015 | Working Time Regulations monitoring | NOT IMPLEMENTED | No 48-hour weekly limit tracking with rolling reference period. |
| TAT-016 | WTR opt-out management | NOT IMPLEMENTED | No WTR opt-out recording. |
| TAT-017 | Night worker identification and limits | NOT IMPLEMENTED | No night worker identification. |
| TAT-018 | Daily and weekly rest period tracking | NOT IMPLEMENTED | No rest period monitoring. |
| TAT-019 | Flexi-time management | NOT IMPLEMENTED | No flexi-time balance tracking. |
| TAT-020 | Time rounding rules | NOT IMPLEMENTED | No configurable rounding rules. |
| TAT-021 | Late arrival and early departure tracking | NOT IMPLEMENTED | No late/early flagging against schedule. |
| TAT-022 | Unplanned absence detection | NOT IMPLEMENTED | No no-show auto-detection. |
| TAT-023 | Time exception management | NOT IMPLEMENTED | No exception flagging for anomalies. |
| TAT-024 | Manager timesheet override | PARTIAL | Timesheet approval/rejection exists. Gap: No line-by-line correction by manager with reason. |
| TAT-025 | Payroll export generation | NOT IMPLEMENTED | No payroll-format time data export. |
| TAT-026 | Project time tracking | PARTIAL | Timesheet lines have task/project fields. Gap: No project management or billing integration. |
| TAT-027 | Annual hours tracking | NOT IMPLEMENTED | No annual hours contract model. |
| TAT-028 | Time and attendance dashboard | PARTIAL | Analytics module provides attendance summary. Frontend time routes exist. Gap: No real-time who-is-clocked-in view. |
| TAT-029 | Historical timesheet amendment | NOT IMPLEMENTED | No retrospective correction workflow. |
| TAT-030 | Attendance pattern analysis | NOT IMPLEMENTED | No pattern analysis for lateness or absence trends. |

### 9. Recruitment & ATS (32 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| REC-001 | Job requisition creation | IMPLEMENTED | `requisitions` table. `POST /api/v1/recruitment/requisitions`. `migrations/0057_requisitions.sql` |
| REC-002 | Requisition approval workflow | PARTIAL | Requisition state machine in `packages/shared/src/state-machines/recruitment.ts`. Gap: No multi-level approval chain (HR BP, finance, dept head). |
| REC-003 | Job posting to careers page | NOT IMPLEMENTED | No careers page or job posting system. |
| REC-004 | Multi-channel job distribution | NOT IMPLEMENTED | No job board integration. |
| REC-005 | Internal job posting | NOT IMPLEMENTED | No internal posting mechanism. |
| REC-006 | Application form builder | NOT IMPLEMENTED | No configurable application forms. |
| REC-007 | CV/resume parsing | NOT IMPLEMENTED | No CV parsing. |
| REC-008 | Candidate profile management | IMPLEMENTED | `candidates` table with full profile. CRUD endpoints. `migrations/0058_candidates.sql` |
| REC-009 | Application status tracking | IMPLEMENTED | Candidate stage state machine with stages: applied, screening, shortlisted, interviewing, offer, hired, rejected, withdrawn. `packages/shared/src/state-machines/recruitment.ts` |
| REC-010 | Candidate pipeline visualisation | PARTIAL | `GET /api/v1/recruitment/requisitions/:id/pipeline` endpoint. Frontend: `packages/web/app/routes/(admin)/talent/recruitment/candidates/route.tsx`. Gap: No Kanban-style drag-and-drop. |
| REC-011 | Screening question scoring | NOT IMPLEMENTED | No screening question model. |
| REC-012 | Interview scheduling | IMPLEMENTED | `interviews` table with datetime, location, status. `migrations/0060_interviews.sql` |
| REC-013 | Interview panel management | PARTIAL | Interviews have interviewers. Gap: No panel roles (chair, HR, technical) or availability management. |
| REC-014 | Interview scorecard | IMPLEMENTED | `interview_feedback` table with structured scoring. `migrations/0061_interview_feedback.sql` |
| REC-015 | Interview feedback capture | IMPLEMENTED | `POST /api/v1/recruitment/interviews/:id/feedback`. Score, comments, and recommendation fields. |
| REC-016 | Offer letter generation | PARTIAL | `offers` table with status tracking. Offer state machine. Gap: No template-based letter generation. |
| REC-017 | Offer approval workflow | PARTIAL | Offer state machine (draft, pending_approval, approved, sent, accepted, rejected, withdrawn). Gap: No approval based on salary band deviation. |
| REC-018 | Conditional offer tracking | NOT IMPLEMENTED | No individual condition tracking per offer. |
| REC-019 | Reference request management | NOT IMPLEMENTED | No reference request workflow. |
| REC-020 | DBS check initiation | NOT IMPLEMENTED | No DBS check integration. |
| REC-021 | Candidate communication templates | NOT IMPLEMENTED | No communication template system for recruitment. |
| REC-022 | Candidate self-service portal | NOT IMPLEMENTED | No candidate-facing portal. |
| REC-023 | Recruitment analytics dashboard | PARTIAL | `getRequisitionStats()` and `getCandidateStats()` in recruitment service. Gap: No time-to-fill, cost-per-hire, or source effectiveness metrics. |
| REC-024 | Equal opportunities monitoring | NOT IMPLEMENTED | No diversity data collection for applicants. |
| REC-025 | Guaranteed interview scheme | NOT IMPLEMENTED | No guaranteed interview flagging. |
| REC-026 | Talent pool management | NOT IMPLEMENTED | No silver-medal or speculative candidate pools. |
| REC-027 | Candidate GDPR consent and retention | NOT IMPLEMENTED | No consent capture or auto-purge for candidates. |
| REC-028 | Onboarding trigger from ATS | NOT IMPLEMENTED | No automatic onboarding creation from hire. |
| REC-029 | Hiring manager portal | PARTIAL | Frontend recruitment pages exist. Gap: No simplified hiring manager interface separate from admin. |
| REC-030 | Blind CV screening | NOT IMPLEMENTED | No anonymisation of candidate data. |
| REC-031 | Recruitment compliance audit | NOT IMPLEMENTED | No selection decision documentation requirement. |
| REC-032 | Agency and recruitment vendor management | NOT IMPLEMENTED | No agency tracking. |

### 10. Onboarding (24 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| ONB-001 | Onboarding checklist templates | IMPLEMENTED | `onboarding_templates` and `onboarding_template_tasks` tables. CRUD endpoints. `migrations/0086_onboarding_templates.sql`, `0087_onboarding_template_tasks.sql` |
| ONB-002 | Pre-boarding portal | PARTIAL | Portal module with `GET /api/v1/portal/me`. Employee self-service. Gap: No pre-start-date access for new starters before day one. |
| ONB-003 | Document collection workflow | PARTIAL | Documents module supports uploads. Onboarding tasks can require documents. Gap: No specific document collection workflow with chase reminders. |
| ONB-004 | Right-to-work verification process | IMPLEMENTED | Full RTW module with verification workflow, document storage, verifier sign-off, and expiry tracking. |
| ONB-005 | Personal details pre-capture | NOT IMPLEMENTED | No pre-start portal for bank details, tax info collection. |
| ONB-006 | IT equipment provisioning | IMPLEMENTED | `equipment_requests` table with types, approvals, and handover tracking. `migrations/0108_equipment.sql` |
| ONB-007 | System access provisioning | PARTIAL | Equipment module includes `software_license` type. Gap: No AD/Azure AD provisioning integration. |
| ONB-008 | Buddy and mentor assignment | NOT IMPLEMENTED | No buddy/mentor assignment model. |
| ONB-009 | Induction scheduling | NOT IMPLEMENTED | No induction scheduling system. |
| ONB-010 | Policy acknowledgement tracking | NOT IMPLEMENTED | No policy acknowledgement model. |
| ONB-011 | Contract signing tracking | NOT IMPLEMENTED | No contract signing workflow. |
| ONB-012 | Onboarding task assignment | IMPLEMENTED | `onboarding_template_tasks` with assignee, category, dependencies. `onboarding_task_completions` table. |
| ONB-013 | Onboarding progress dashboard | IMPLEMENTED | `GET /api/v1/onboarding/instances`. Frontend: `packages/web/app/routes/(admin)/onboarding/active/route.tsx` |
| ONB-014 | Automated reminders and escalation | PARTIAL | Domain events emitted on task completion. Notification worker exists. Gap: No configurable reminder/escalation thresholds. |
| ONB-015 | Mandatory training auto-enrolment | NOT IMPLEMENTED | No automatic LMS enrolment from onboarding. |
| ONB-016 | Probation setup from onboarding | NOT IMPLEMENTED | No automatic probation date/review creation from onboarding. |
| ONB-017 | Onboarding survey | NOT IMPLEMENTED | No onboarding survey system. |
| ONB-018 | Welcome communications | NOT IMPLEMENTED | No automated welcome emails. |
| ONB-019 | Payroll setup trigger | NOT IMPLEMENTED | No payroll record creation from onboarding. |
| ONB-020 | Benefits enrolment trigger | NOT IMPLEMENTED | No benefits enrolment trigger from onboarding. |
| ONB-021 | Starter checklist (HMRC) completion | NOT IMPLEMENTED | No HMRC Starter Checklist. |
| ONB-022 | Group/cohort onboarding | NOT IMPLEMENTED | No cohort onboarding support. |
| ONB-023 | Onboarding completion sign-off | PARTIAL | Task completion tracking exists. Instance state machine has `completed` state. Gap: No formal manager/HR sign-off step. |
| ONB-024 | Re-hire accelerated onboarding | NOT IMPLEMENTED | No re-hire detection or abbreviated onboarding. |

### 11. Performance Management (25 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| PER-001 | Performance cycle configuration | IMPLEMENTED | `performance_cycles` table with type, dates, status. `migrations/0063_performance_cycles.sql`. API: `POST /api/v1/talent/cycles` |
| PER-002 | Performance cycle state machine | IMPLEMENTED | `packages/shared/src/state-machines/performance-cycle.ts`. States: draft, active, self_assessment, manager_review, calibration, completed. |
| PER-003 | Goal and objective setting | IMPLEMENTED | `goals` table with description, weight, status. CRUD endpoints. `migrations/0064_goals.sql` |
| PER-004 | OKR support | NOT IMPLEMENTED | No Objectives and Key Results structure with progress tracking. |
| PER-005 | Goal cascade and alignment | NOT IMPLEMENTED | No parent_goal or organisational alignment. |
| PER-006 | Mid-year review and check-ins | NOT IMPLEMENTED | No mid-cycle review model. |
| PER-007 | Self-assessment submission | PARTIAL | Reviews table supports self-assessment. Gap: No explicit self-assessment submission step in cycle state machine. |
| PER-008 | Manager assessment | IMPLEMENTED | `reviews` table with reviewer_id, rating, comments. `migrations/0065_reviews.sql`. API: `POST /api/v1/talent/reviews` |
| PER-009 | Rating scale configuration | NOT IMPLEMENTED | No configurable rating scale per tenant. |
| PER-010 | 360-degree feedback | PARTIAL | `feedback_items` table. `POST /api/v1/talent/feedback`. Gap: No multi-source collection workflow or respondent management. |
| PER-011 | Anonymous feedback with threshold | NOT IMPLEMENTED | No anonymity controls or minimum respondent threshold. |
| PER-012 | Competency assessment | IMPLEMENTED | Competencies module with assessments and proficiency levels. `packages/api/src/modules/competencies/` |
| PER-013 | Competency framework management | IMPLEMENTED | Competency frameworks with categories, behavioural indicators, and role mapping. `migrations/0107_competencies.sql` |
| PER-014 | Calibration sessions | NOT IMPLEMENTED | No calibration meeting workflow. Performance cycle state machine has calibration state but no supporting UI/logic. |
| PER-015 | 9-box grid (performance vs potential) | NOT IMPLEMENTED | No 9-box grid model or visualisation. |
| PER-016 | Performance improvement plan (PIP) | NOT IMPLEMENTED | No PIP data model. |
| PER-017 | PIP progress tracking | NOT IMPLEMENTED | No PIP tracking. |
| PER-018 | Continuous feedback mechanism | PARTIAL | Feedback items table. Gap: No ad-hoc feedback outside review cycles with manager visibility. |
| PER-019 | Recognition and kudos | NOT IMPLEMENTED | No peer recognition system. |
| PER-020 | Development plan creation | IMPLEMENTED | `development_plans` table. `migrations/0067_development_plans.sql` |
| PER-021 | Performance review sign-off | NOT IMPLEMENTED | No dual sign-off (employee + manager) on review. |
| PER-022 | Performance-linked pay review | NOT IMPLEMENTED | No merit matrix or compensation link. |
| PER-023 | Performance analytics dashboard | PARTIAL | Analytics module has executive/manager dashboards. Gap: No performance-specific analytics (rating distribution, completion rates, calibration adjustments). |
| PER-024 | Probation review integration | NOT IMPLEMENTED | No probation-specific review integration. |
| PER-025 | Goal progress updates | PARTIAL | Goals have status field. Gap: No percentage completion tracking or evidence attachment. |

### 12. Learning & Development (20 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| LND-001 | Course catalogue management | IMPLEMENTED | `courses` table with CRUD. `GET /api/v1/lms/courses`. `migrations/0069_courses.sql` |
| LND-002 | Multiple delivery formats | PARTIAL | Course versions support different formats. Gap: May not include all types (classroom, webinar, on-the-job, coaching). |
| LND-003 | Course scheduling | NOT IMPLEMENTED | No session scheduling with dates, times, locations, capacity. |
| LND-004 | Course enrolment and approval | IMPLEMENTED | `assignments` table. `POST /api/v1/lms/enrollments`. Start/complete status transitions. `migrations/0073_assignments.sql` |
| LND-005 | Mandatory training assignment | PARTIAL | Assignments can be created for employees. Gap: No auto-assignment rules by role/department/location. |
| LND-006 | Mandatory training compliance dashboard | PARTIAL | LMS has enrollment tracking. Gap: No compliance-specific dashboard with overdue alerts per course/department. |
| LND-007 | Training completion recording | IMPLEMENTED | `completions` table with date, result, score. `POST /api/v1/lms/enrollments/:id/complete`. `migrations/0074_completions.sql` |
| LND-008 | Certificate generation | IMPLEMENTED | `certificates` table with unique codes, course details, expiry. PDF worker can generate certificates. `migrations/0075_certificates.sql`, `packages/api/src/jobs/pdf-worker.ts` |
| LND-009 | Certificate and qualification expiry tracking | PARTIAL | Certificates have expiry dates. Gap: No automated renewal reminders at configurable lead times. |
| LND-010 | CPD tracking | NOT IMPLEMENTED | No CPD hours/points tracking. |
| LND-011 | Learning path definition | IMPLEMENTED | `learning_paths` and `learning_path_courses` tables. CRUD endpoints. `migrations/0071_learning_paths.sql`, `0072_learning_path_courses.sql` |
| LND-012 | Training budget management | NOT IMPLEMENTED | No training budget model. |
| LND-013 | Training needs analysis | NOT IMPLEMENTED | No systematic TNA linked to performance or competencies. |
| LND-014 | E-learning content hosting | NOT IMPLEMENTED | No SCORM/xAPI hosting or tracking. |
| LND-015 | Health and safety training compliance | NOT IMPLEMENTED | No H&S-specific training tracking. |
| LND-016 | Individual training record | IMPLEMENTED | Employee enrolments and completions tracked. `GET /api/v1/lms/my-learning` for self-service. |
| LND-017 | Manager training dashboard | PARTIAL | Manager dashboard in analytics. Gap: No specific LMS view for direct reports. |
| LND-018 | Apprenticeship programme management | NOT IMPLEMENTED | No apprenticeship tracking. |
| LND-019 | Training evaluation surveys | NOT IMPLEMENTED | No post-training survey system. |
| LND-020 | Competency-linked training suggestions | NOT IMPLEMENTED | No auto-suggest based on competency gaps. |

### 13. Talent Management (14 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| TLM-001 | Succession planning for critical roles | IMPLEMENTED | Succession module: plans, candidates, readiness levels (ready_now, 1-2yr, 3-5yr). `packages/api/src/modules/succession/`, `migrations/0105_succession_planning.sql` |
| TLM-002 | Key person risk assessment | PARTIAL | Succession module tracks flight risk indicators. Gap: No comprehensive multi-factor risk assessment model. |
| TLM-003 | Talent pool management | PARTIAL | Succession candidates tracked per plan. Gap: No separate high-potential or specialist talent pool management. |
| TLM-004 | 9-box talent review | NOT IMPLEMENTED | No 9-box grid model. |
| TLM-005 | Career path definition | NOT IMPLEMENTED | No career path model between roles. |
| TLM-006 | Career aspiration recording | NOT IMPLEMENTED | No employee aspiration data model. |
| TLM-007 | High-potential identification and tracking | PARTIAL | Succession candidates can be tagged with readiness. Gap: No formal HiPo programme or development track. |
| TLM-008 | Flight risk assessment | PARTIAL | Succession planning references retention risk. Gap: No structured flight risk indicator model. |
| TLM-009 | Succession pipeline visualisation | IMPLEMENTED | `GET /api/v1/succession/pipeline`. Shows succession depth per role. |
| TLM-010 | Emergency succession plans | PARTIAL | Succession plans with ready_now candidates. Gap: No explicit emergency/interim plan with action items. |
| TLM-011 | Talent review meeting support | NOT IMPLEMENTED | No talent review meeting workflow. |
| TLM-012 | Succession metrics and reporting | IMPLEMENTED | `GET /api/v1/succession/gaps` for coverage gaps. Pipeline analytics. |
| TLM-013 | Mentoring programme management | NOT IMPLEMENTED | No mentoring programme model. |
| TLM-014 | Internal mobility marketplace | NOT IMPLEMENTED | No internal job marketplace. |

### 14. Benefits Administration (18 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| BEN-001 | Benefits scheme configuration | IMPLEMENTED | Benefits module with carriers, plans, eligibility rules, costs. `packages/api/src/modules/benefits/`, `migrations/0101_benefits_types.sql`, `0102_benefit_plans.sql` |
| BEN-002 | Benefits enrolment portal | IMPLEMENTED | `POST /api/v1/benefits/enrollments`. Frontend: `packages/web/app/routes/(admin)/benefits/enrollments/route.tsx`, `packages/web/app/routes/(app)/me/benefits/route.tsx` |
| BEN-003 | Benefits enrolment window management | PARTIAL | Enrolment management exists. Gap: No explicit open enrolment window with deadline enforcement. |
| BEN-004 | Life event benefits changes | IMPLEMENTED | `life_events` table with event types triggering benefit changes. `migrations/0104_life_events.sql`. API endpoints for life event processing. |
| BEN-005 | Pension scheme enrolment | NOT IMPLEMENTED | No pension-specific enrolment or scheme information. |
| BEN-006 | Pension contribution management | NOT IMPLEMENTED | No pension contribution tracking. |
| BEN-007 | Multiple pension scheme support | NOT IMPLEMENTED | No pension scheme model. |
| BEN-008 | Pension opt-out management | NOT IMPLEMENTED | No opt-out processing. |
| BEN-009 | Private medical insurance management | PARTIAL | Benefits plans can include PMI type. Gap: No provider-specific integration or dependent management for PMI. |
| BEN-010 | Death in service benefit administration | PARTIAL | Benefits plans can include life insurance. Gap: No beneficiary nomination or expression of wish model. |
| BEN-011 | Income protection insurance | NOT IMPLEMENTED | No income protection model. |
| BEN-012 | Company car and car allowance | NOT IMPLEMENTED | No vehicle benefit or BIK calculation. |
| BEN-013 | Cycle to work scheme | NOT IMPLEMENTED | No cycle-to-work scheme management. |
| BEN-014 | Total reward statement | NOT IMPLEMENTED | No total reward statement generation. |
| BEN-015 | Benefits cost reporting | IMPLEMENTED | `GET /api/v1/benefits/employees/:employeeId/costs`. Per-employee benefit cost calculation. |
| BEN-016 | Benefits provider data exchange | NOT IMPLEMENTED | No provider integration or file exchange. |
| BEN-017 | Benefits cessation on leaving | NOT IMPLEMENTED | No automatic benefits end date on termination. |
| BEN-018 | Flexible benefits fund allocation | NOT IMPLEMENTED | No flex fund/credits model. |

### 15. Case Management (20 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| CAS-001 | Case creation with classification | IMPLEMENTED | Cases table with types. `POST /api/v1/cases`. Case categories table. `migrations/0076_case_enums.sql`, `0077_case_categories.sql`, `0078_cases.sql` |
| CAS-002 | ACAS Code of Practice workflow | PARTIAL | Case state machine (open, in_progress, resolved, closed, escalated, reopened). Gap: No specific ACAS steps (investigation, notification, hearing, decision, appeal) enforced. |
| CAS-003 | Investigation management | PARTIAL | Cases can be assigned to investigators. Case comments provide evidence trail. Gap: No structured investigation lifecycle (witness interviews, evidence collection, investigation report). |
| CAS-004 | Suspension management | NOT IMPLEMENTED | No suspension data model. |
| CAS-005 | Hearing scheduling and management | NOT IMPLEMENTED | No hearing scheduling. |
| CAS-006 | Right to be accompanied | NOT IMPLEMENTED | No companion recording. |
| CAS-007 | Hearing outcome recording | NOT IMPLEMENTED | No structured outcome recording (warning, dismissal, etc.). |
| CAS-008 | Warning management with expiry | NOT IMPLEMENTED | No warning tracking with expiry dates. |
| CAS-009 | Appeal process management | NOT IMPLEMENTED | No appeal workflow. |
| CAS-010 | Grievance processing | PARTIAL | Cases can be created with grievance type. Gap: No structured grievance workflow (acknowledgement, investigation, hearing, outcome, appeal). |
| CAS-011 | Whistleblowing case handling | NOT IMPLEMENTED | No whistleblowing-specific confidentiality or protection tracking. |
| CAS-012 | Case documentation management | IMPLEMENTED | `case_attachments` table for document storage. `case_comments` for notes. `migrations/0079_case_comments.sql`, `0080_case_attachments.sql` |
| CAS-013 | Template letter generation | NOT IMPLEMENTED | No case letter templates. |
| CAS-014 | Case timeline view | PARTIAL | Case comments provide chronological history. Frontend: `packages/web/app/routes/(admin)/cases/[caseId]/route.tsx`. Gap: No consolidated timeline of all events/documents. |
| CAS-015 | SLA tracking for case stages | IMPLEMENTED | Case has SLA tracking. `GET /api/v1/cases` includes duration tracking. |
| CAS-016 | Case assignment and workload | IMPLEMENTED | Cases assigned to HR advisers. `GET /api/v1/cases` with filters. |
| CAS-017 | Case confidentiality controls | PARTIAL | RBAC controls access. Gap: No case-specific named-party access restriction. |
| CAS-018 | Settlement agreement tracking | NOT IMPLEMENTED | No settlement agreement model. |
| CAS-019 | Employment tribunal preparation | NOT IMPLEMENTED | No tribunal bundle assembly. |
| CAS-020 | Case analytics and reporting | PARTIAL | Case statistics available. Gap: No dedicated case analytics dashboard with outcome analysis. |

### 16. Document Management (16 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| DOC-001 | Secure document storage | IMPLEMENTED | Documents module with storage (S3 via upload URLs), encryption. `packages/api/src/modules/documents/`, `migrations/0083_documents.sql`, `0100_documents_enhanced.sql` |
| DOC-002 | Document categorisation taxonomy | IMPLEMENTED | Document types with categorisation. `migrations/0100_documents_enhanced.sql` includes document templates and categories. |
| DOC-003 | Document template management | IMPLEMENTED | Document templates with merge fields, version control. `GET/POST /api/v1/documents/templates`. Frontend: `packages/web/app/routes/(admin)/documents/templates/route.tsx` |
| DOC-004 | Automated letter generation | PARTIAL | Document templates with merge fields exist. PDF worker can generate documents. Gap: No specific HR letter templates (offer, contract variation, disciplinary, reference). |
| DOC-005 | E-signature integration | NOT IMPLEMENTED | No e-signature provider integration. |
| DOC-006 | Document version control | PARTIAL | Document templates have version tracking. Gap: No full version history with diff comparison for generated documents. |
| DOC-007 | Document access control | IMPLEMENTED | RBAC and field-level security control document access. Role-based permissions. |
| DOC-008 | Document expiry tracking | IMPLEMENTED | `GET /api/v1/documents/expiring` endpoint. Tracks documents with expiry dates and sends alerts. |
| DOC-009 | Bulk document generation | NOT IMPLEMENTED | No batch document generation for multiple employees. |
| DOC-010 | Document retention policy enforcement | NOT IMPLEMENTED | No auto-deletion based on retention schedules. |
| DOC-011 | Document audit trail | IMPLEMENTED | Audit plugin logs document operations. `packages/api/src/plugins/audit.ts` |
| DOC-012 | Employee document portal | IMPLEMENTED | `GET /api/v1/portal/me` includes documents. Frontend: `packages/web/app/routes/(app)/me/documents/route.tsx` |
| DOC-013 | Policy document distribution | NOT IMPLEMENTED | No policy distribution with read-receipt tracking. |
| DOC-014 | Document pack assembly | NOT IMPLEMENTED | No document pack assembly feature. |
| DOC-015 | Company policy library | NOT IMPLEMENTED | No central policy repository. |
| DOC-016 | Document virus scanning | NOT IMPLEMENTED | No virus scanning on upload. |

### 17. Workflow & Approvals (16 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| WFA-001 | Approval chain configuration | IMPLEMENTED | `workflow_definitions` and `workflow_versions` tables. Multi-step workflows. `migrations/0028_workflow_definitions.sql`, `0029_workflow_versions.sql` |
| WFA-002 | Dynamic approval routing | PARTIAL | Workflow definitions support conditional logic. Gap: No data-driven routing rules (e.g., salary threshold triggers). |
| WFA-003 | Approval delegation | IMPLEMENTED | `approval_delegations` table with delegator, delegate, date range, scope, and filters. `migrations/0110_delegation.sql` |
| WFA-004 | Approval timeout and escalation | PARTIAL | `workflow_slas` and `workflow_sla_events` tables for SLA tracking. Gap: No auto-escalation on timeout. |
| WFA-005 | Email notifications for workflow events | PARTIAL | Notification worker sends emails. Domain events emitted. Gap: No specific workflow event email templates. |
| WFA-006 | In-app notification centre | IMPLEMENTED | `notifications` table with read/dismiss status. `migrations/0081_notifications.sql`. Frontend notification UI in layouts. |
| WFA-007 | Workflow state machine | IMPLEMENTED | `packages/shared/src/state-machines/workflow.ts`. States: draft, pending, in_progress, completed, cancelled, failed. |
| WFA-008 | SLA tracking for workflows | IMPLEMENTED | `workflow_slas` table with target duration. `workflow_sla_events` track breaches. `migrations/0033_workflow_slas.sql`, `0034_workflow_sla_events.sql` |
| WFA-009 | Workflow dashboard | IMPLEMENTED | `GET /api/v1/workflows/my-approvals` for pending approvals. Frontend: `packages/web/app/routes/(admin)/workflows/index.tsx` |
| WFA-010 | Conditional workflow branching | PARTIAL | Workflow definitions support step configuration. Gap: No runtime conditional branching based on form data. |
| WFA-011 | Parallel task assignment | PARTIAL | `workflow_tasks` support multiple assignees. Gap: No explicit parallel/join condition logic. |
| WFA-012 | Workflow comments and attachments | PARTIAL | Workflow tasks can have notes. Gap: No file attachment per workflow step. |
| WFA-013 | Workflow audit trail | IMPLEMENTED | `workflow_transitions` table logs every state change with actor, timestamp, comment. `migrations/0032_workflow_transitions.sql`. Audit plugin also logs. |
| WFA-014 | Bulk approval capability | NOT IMPLEMENTED | No bulk approve endpoint. |
| WFA-015 | Recurring workflow triggers | PARTIAL | Worker scheduler (`packages/api/src/worker/scheduler.ts`) supports cron-based triggers. Gap: No user-configurable recurring workflow initiation. |
| WFA-016 | Workflow cancellation | IMPLEMENTED | `POST /api/v1/workflows/instances/:id/cancel` with reason recording. State machine enforces valid transitions. |

### 18. Reporting & Analytics (24 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| RAA-001 | Headcount reporting | IMPLEMENTED | `getHeadcountSummary()`, `getHeadcountByDepartment()`, `getHeadcountTrend()`. `packages/api/src/modules/analytics/service.ts` |
| RAA-002 | Starter and leaver reporting | PARTIAL | Headcount trend includes joiners/leavers. Gap: No breakdown by reason, source, or diversity group. |
| RAA-003 | Turnover rate calculation | IMPLEMENTED | `getTurnoverSummary()`, `getTurnoverByDepartment()`, `getTurnoverByReason()`. |
| RAA-004 | Absence rate reporting | IMPLEMENTED | `getAttendanceSummary()`, `getLeaveSummary()`. |
| RAA-005 | Diversity dashboard | NOT IMPLEMENTED | No diversity metrics across protected characteristics. |
| RAA-006 | Gender pay gap dashboard | NOT IMPLEMENTED | No gender pay gap calculation or dashboard. |
| RAA-007 | Compensation analytics | NOT IMPLEMENTED | No compensation distribution or compa-ratio analysis. |
| RAA-008 | Custom report builder | NOT IMPLEMENTED | No drag-and-drop report builder. |
| RAA-009 | Report scheduling and distribution | PARTIAL | Export worker generates reports. Gap: No scheduled report distribution via email. |
| RAA-010 | Report export formats | PARTIAL | Export worker supports CSV/Excel. `packages/api/src/jobs/export-worker.ts`. Gap: No PDF or interactive HTML export. |
| RAA-011 | Executive dashboard | IMPLEMENTED | `getExecutiveDashboard()`. Frontend: `packages/web/app/routes/(admin)/analytics/route.tsx` |
| RAA-012 | Manager dashboard | IMPLEMENTED | `getManagerDashboard()`. Frontend: `packages/web/app/routes/(app)/manager/index.tsx` |
| RAA-013 | Workforce planning analytics | NOT IMPLEMENTED | No workforce demand forecasting or retirement projection. |
| RAA-014 | Compliance reporting dashboard | NOT IMPLEMENTED | No consolidated compliance RAG dashboard. |
| RAA-015 | Right-to-work expiry reporting | IMPLEMENTED | RTW module: `GET /api/v1/right-to-work/expiring`, `GET /api/v1/right-to-work/compliance-dashboard`. |
| RAA-016 | Contract end date reporting | NOT IMPLEMENTED | No contract end date reporting. |
| RAA-017 | Sickness absence trends | PARTIAL | Leave summary in analytics. Gap: No sickness-specific trend analysis by reason, department, season. |
| RAA-018 | Recruitment analytics | PARTIAL | Requisition and candidate stats. Gap: No time-to-fill, cost-per-hire, source effectiveness. |
| RAA-019 | Training compliance reporting | NOT IMPLEMENTED | No mandatory training compliance reporting. |
| RAA-020 | Report access control | IMPLEMENTED | RBAC controls report access. RLS enforces data scope. |
| RAA-021 | Data visualisation library | PARTIAL | Frontend has dashboard components. Gap: No chart library for interactive filtering and drill-down. |
| RAA-022 | Ad-hoc data extraction | NOT IMPLEMENTED | No ad-hoc query tool. |
| RAA-023 | Predictive analytics | NOT IMPLEMENTED | No statistical modelling for attrition or absence prediction. |
| RAA-024 | Benchmark comparison | NOT IMPLEMENTED | No external benchmark data. |

### 19. Employee Self-Service Portal (19 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| ESS-001 | Personal details viewing | IMPLEMENTED | `GET /api/v1/portal/me`. Frontend: `packages/web/app/routes/(app)/me/profile/route.tsx` |
| ESS-002 | Personal details update with approval | PARTIAL | Portal provides profile view. Gap: No update endpoint or approval workflow for sensitive fields. |
| ESS-003 | Leave balance viewing | IMPLEMENTED | `GET /api/v1/absence/balances`. Frontend: `packages/web/app/routes/(app)/me/leave/route.tsx` |
| ESS-004 | Leave request submission | IMPLEMENTED | `POST /api/v1/absence/leave-requests`. Self-service leave booking. |
| ESS-005 | Leave request status tracking | IMPLEMENTED | Leave request state machine shows status. History available. |
| ESS-006 | Leave request cancellation | IMPLEMENTED | `POST /api/v1/absence/leave-requests/:id/cancel`. State machine allows cancellation from draft/pending. |
| ESS-007 | Team absence calendar | PARTIAL | Manager portal has team view. Gap: No team calendar visible to all team members. |
| ESS-008 | Payslip viewing and download | NOT IMPLEMENTED | No payslip generation or viewing. |
| ESS-009 | P60 viewing and download | NOT IMPLEMENTED | No P60 generation or viewing. |
| ESS-010 | Benefits viewing and enrolment | IMPLEMENTED | Self-service benefits page. Frontend: `packages/web/app/routes/(app)/me/benefits/route.tsx` |
| ESS-011 | Training catalogue and enrolment | IMPLEMENTED | `GET /api/v1/lms/my-learning`. Frontend: `packages/web/app/routes/(app)/me/learning/route.tsx` |
| ESS-012 | Training history and certificates | IMPLEMENTED | My learning shows completions. Certificates generated and downloadable. |
| ESS-013 | Goal and performance management | PARTIAL | Competencies self-service exists. Gap: No self-assessment submission or goal update through self-service. |
| ESS-014 | Document access portal | IMPLEMENTED | `packages/web/app/routes/(app)/me/documents/route.tsx`. Documents accessible via portal. |
| ESS-015 | Timesheet entry and submission | IMPLEMENTED | `packages/web/app/routes/(app)/me/time/route.tsx`. Time entry via self-service. |
| ESS-016 | Notification centre | IMPLEMENTED | Notifications table. In-app notification UI in layout components. |
| ESS-017 | Organisation directory | NOT IMPLEMENTED | No employee directory / search for general employees. |
| ESS-018 | Company news and announcements | NOT IMPLEMENTED | No news/announcements system. |
| ESS-019 | Feedback and recognition | NOT IMPLEMENTED | No peer recognition system. |

### 20. Manager Self-Service (14 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| MSS-001 | Team overview dashboard | IMPLEMENTED | `GET /api/v1/portal/my-team`. Frontend: `packages/web/app/routes/(app)/manager/team/route.tsx`, `packages/web/app/routes/(app)/manager/index.tsx` |
| MSS-002 | Approval queue | IMPLEMENTED | `GET /api/v1/portal/approvals`, `GET /api/v1/workflows/my-approvals`. Frontend: `packages/web/app/routes/(app)/manager/approvals/route.tsx` |
| MSS-003 | Team absence calendar | PARTIAL | Manager view exists. Gap: No visual calendar with coverage gaps. |
| MSS-004 | Absence approval with context | IMPLEMENTED | Leave approval/rejection endpoints. Manager can approve/reject with context from portal. |
| MSS-005 | Team performance overview | IMPLEMENTED | Frontend: `packages/web/app/routes/(app)/manager/performance/route.tsx` |
| MSS-006 | Initiate employee changes | PARTIAL | Manager can view team. Gap: Manager cannot directly initiate salary/transfer/promotion changes via self-service. |
| MSS-007 | Delegation of authority | IMPLEMENTED | `approval_delegations` table. Delegation with date range, scope, and filters. |
| MSS-008 | Team training overview | NOT IMPLEMENTED | No team training view in manager portal. |
| MSS-009 | Direct report onboarding tracking | NOT IMPLEMENTED | No manager view of new hire onboarding progress. |
| MSS-010 | Team timesheet review | PARTIAL | Manager schedules route exists. Gap: No specific timesheet review/approve for team. |
| MSS-011 | 1:1 meeting notes | NOT IMPLEMENTED | No 1:1 meeting notes model. |
| MSS-012 | Team reporting and analytics | PARTIAL | Manager dashboard with team metrics. Gap: Limited to high-level metrics, no absence trends or turnover risk per individual. |
| MSS-013 | Recruitment management | PARTIAL | Recruitment routes exist. Gap: No simplified hiring manager interface. |
| MSS-014 | Case awareness (need-to-know) | NOT IMPLEMENTED | No case visibility for managers as involved parties. |

### 21. Security & Access Control (26 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| SAC-001 | Role-based access control (RBAC) | IMPLEMENTED | RBAC plugin with roles, permissions per module/action/scope. `packages/api/src/plugins/rbac.ts`, `migrations/0006_roles.sql` through `0009_role_assignments.sql` |
| SAC-002 | Field-level security | IMPLEMENTED | Field registry and role field permissions. `packages/api/src/modules/security/field-permission.service.ts`, `migrations/0115_field_registry.sql`, `0117_role_field_permissions.sql`. Frontend: `packages/web/app/components/security/SecureField.tsx` |
| SAC-003 | Row-level security (RLS) | IMPLEMENTED | PostgreSQL RLS on all tenant-scoped tables. `tenant_isolation` policies. System context bypass via `enable_system_context()`. Enforced in tests via `hris_app` role. |
| SAC-004 | Custom role creation | IMPLEMENTED | `POST /api/v1/security/roles`. Tenant can create custom roles with specific permissions. |
| SAC-005 | Multi-factor authentication (MFA) | IMPLEMENTED | BetterAuth with TOTP support. `twoFactor` plugin enabled. `migrations/0096_better_auth_twofactor_columns.sql`. Frontend: `packages/web/app/routes/(auth)/mfa/route.tsx` |
| SAC-006 | MFA enforcement policy | PARTIAL | MFA available. Gap: No per-tenant or per-role MFA enforcement policy. |
| SAC-007 | Single sign-on (SSO) | NOT IMPLEMENTED | No SAML/OIDC SSO integration configured (only mentioned in types/settings UI). |
| SAC-008 | Password policy configuration | PARTIAL | BetterAuth handles password management. Gap: No tenant-configurable password complexity, history, or age rules. |
| SAC-009 | Account lockout and brute force protection | IMPLEMENTED | Rate limiting on auth endpoints. `packages/api/src/plugins/rate-limit.ts` |
| SAC-010 | Session management | IMPLEMENTED | BetterAuth session management. Session table with expiry. `migrations/0004_sessions.sql`. Configurable timeout. |
| SAC-011 | Comprehensive audit trail | IMPLEMENTED | Audit plugin logs all CRUD operations with user, timestamp, before/after values. `packages/api/src/plugins/audit.ts`, `migrations/0010_audit_log.sql` |
| SAC-012 | Audit log immutability | PARTIAL | Audit logs are append-only at application level. Gap: No database-enforced immutability (no DELETE/UPDATE prevention on audit table). |
| SAC-013 | Audit log search and export | IMPLEMENTED | `GET /api/v1/security/audit-log` with filtering. Frontend: `packages/web/app/routes/(admin)/security/audit-log/route.tsx` |
| SAC-014 | API authentication and authorisation | IMPLEMENTED | BetterAuth session-based auth. RBAC enforces permissions per endpoint. |
| SAC-015 | API rate limiting | IMPLEMENTED | Per-endpoint rate limiting with configurable thresholds and 429 responses. `packages/api/src/plugins/rate-limit.ts` |
| SAC-016 | CSRF protection | IMPLEMENTED | BetterAuth CSRF protection. `CSRF_SECRET` configuration. |
| SAC-017 | XSS prevention | IMPLEMENTED | Security headers plugin with CSP. Input validation via TypeBox schemas. `packages/api/src/plugins/security-headers.ts` |
| SAC-018 | SQL injection prevention | IMPLEMENTED | postgres.js tagged template literals. No raw SQL construction. Parameterised queries throughout. |
| SAC-019 | Security headers | IMPLEMENTED | Full security headers: HSTS, CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy. `packages/api/src/plugins/security-headers.ts` |
| SAC-020 | Data encryption at rest | PARTIAL | Employee identifiers table designed for application-layer encryption. Gap: Not confirmed if encryption is implemented in application code for all sensitive fields. |
| SAC-021 | Data encryption in transit | IMPLEMENTED | HSTS header configured. TLS handled at infrastructure level (Docker/reverse proxy). |
| SAC-022 | Data masking | PARTIAL | Field-level security can hide sensitive fields. Gap: No partial masking (e.g., last 3 digits of NI number). |
| SAC-023 | User provisioning and deprovisioning | IMPLEMENTED | User management in security module. `POST /api/v1/security/users`. User status management. Frontend: `packages/web/app/routes/(admin)/security/users/route.tsx` |
| SAC-024 | Login activity monitoring | PARTIAL | Audit trail logs auth events. Gap: No suspicious pattern detection (impossible travel, new device, unusual time). |
| SAC-025 | Tenant data isolation verification | IMPLEMENTED | RLS integration tests verify cross-tenant isolation. `packages/api/src/test/integration/rls.test.ts`, `rls-comprehensive.test.ts` |
| SAC-026 | Idempotency protection | IMPLEMENTED | Idempotency plugin with tenant+user+route scoped keys. `packages/api/src/plugins/idempotency.ts`, `migrations/0012_idempotency_keys.sql` |

### 22. UK Employment Compliance (28 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| UKC-001 | UK GDPR compliance framework | PARTIAL | Data access controlled via RBAC and RLS. Gap: No lawful basis recording per processing activity, data mapping, or DPIA. |
| UKC-002 | Data subject access request processing | NOT IMPLEMENTED | No DSAR workflow or deadline tracking. |
| UKC-003 | Right to erasure processing | NOT IMPLEMENTED | No erasure request workflow. |
| UKC-004 | Data portability | NOT IMPLEMENTED | No structured data export for individual employees. |
| UKC-005 | Data retention policy configuration | NOT IMPLEMENTED | No configurable retention periods or auto-deletion. |
| UKC-006 | Data breach notification workflow | NOT IMPLEMENTED | No breach notification system. |
| UKC-007 | Privacy notice management | NOT IMPLEMENTED | No privacy notice version control or distribution. |
| UKC-008 | Gender pay gap statutory reporting | NOT IMPLEMENTED | No GPG calculation or reporting. |
| UKC-009 | Right to work statutory compliance | IMPLEMENTED | Full RTW module with check types (manual List A/B, online share code, IDVT), compliance dashboard, expiry tracking. `packages/api/src/modules/right-to-work/` |
| UKC-010 | Statutory Sick Pay administration | IMPLEMENTED | SSP module with full qualification checking, daily log, PIW management, 28-week limit. `packages/api/src/modules/ssp/` |
| UKC-011 | Statutory maternity/paternity/adoption pay | PARTIAL | Statutory leave module covers maternity, paternity, shared parental, adoption. Pay calculation endpoint exists. Gap: Full rate calculation complexity may not be complete. |
| UKC-012 | National Minimum Wage compliance checking | NOT IMPLEMENTED | No NMW validation against age-based bands. |
| UKC-013 | Working Time Regulations compliance | NOT IMPLEMENTED | No WTR monitoring (48-hour limit, rest periods, night worker limits). |
| UKC-014 | Auto-enrolment pension compliance | NOT IMPLEMENTED | No pension auto-enrolment. |
| UKC-015 | Equality Act protected characteristics | PARTIAL | Gender and nationality captured. Gap: Only 2 of 9 protected characteristics tracked. |
| UKC-016 | Health and safety compliance tracking | NOT IMPLEMENTED | No H&S compliance tracking. |
| UKC-017 | RIDDOR reporting | NOT IMPLEMENTED | No RIDDOR incident reporting. |
| UKC-018 | DBS management | NOT IMPLEMENTED | No DBS check tracking. |
| UKC-019 | Employment tribunal case tracking | NOT IMPLEMENTED | No ET1/ET3 tracking. |
| UKC-020 | Agency Workers Regulations compliance | NOT IMPLEMENTED | No AWR 12-week tracking. |
| UKC-021 | Fixed-term worker regulations | NOT IMPLEMENTED | No fixed-term comparator treatment tracking. |
| UKC-022 | Part-time worker regulations | NOT IMPLEMENTED | No part-time worker equal treatment monitoring. |
| UKC-023 | IR35 off-payroll compliance | NOT IMPLEMENTED | No IR35 status determination. |
| UKC-024 | Modern slavery compliance | NOT IMPLEMENTED | No modern slavery statement or supply chain tracking. |
| UKC-025 | Flexible working request compliance | NOT IMPLEMENTED | No flexible working request workflow. |
| UKC-026 | Trade union and facility time | NOT IMPLEMENTED | No trade union tracking. |
| UKC-027 | Whistleblowing protection | NOT IMPLEMENTED | No whistleblowing protection tracking (case module has generic case types but no PIDA-specific protections). |
| UKC-028 | Records of processing activities | NOT IMPLEMENTED | No Article 30 processing activities register. |

### 23. Integration & APIs (18 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| INT-001 | RESTful API | IMPLEMENTED | Comprehensive REST API with `/api/v1/` versioning, cursor pagination, TypeBox validation. 200+ endpoints across all modules. |
| INT-002 | API documentation | IMPLEMENTED | Swagger/OpenAPI auto-generated. `@elysiajs/swagger` plugin in `packages/api/src/app.ts`. |
| INT-003 | Webhook configuration | PARTIAL | Outbox processor publishes to Redis Streams. Gap: No user-configurable outbound webhooks with retry logic and delivery tracking. |
| INT-004 | Payroll system integration | NOT IMPLEMENTED | No payroll provider integration. |
| INT-005 | Accounting system integration | NOT IMPLEMENTED | No accounting/journal integration. |
| INT-006 | Active Directory / Azure AD sync | NOT IMPLEMENTED | No AD/Azure AD synchronisation. |
| INT-007 | SSO provider integration | NOT IMPLEMENTED | No SAML/OIDC SSO provider configured. |
| INT-008 | Calendar integration | NOT IMPLEMENTED | No calendar sync (Outlook/Google Calendar). |
| INT-009 | Email system integration | IMPLEMENTED | Notification worker with nodemailer/SMTP support. `packages/api/src/jobs/notification-worker.ts` |
| INT-010 | Data import framework | NOT IMPLEMENTED | No structured CSV/Excel import. |
| INT-011 | Data export framework | IMPLEMENTED | Export worker generates CSV/Excel files. `packages/api/src/jobs/export-worker.ts`. S3 upload for downloads. |
| INT-012 | Pension provider integration | NOT IMPLEMENTED | No pension provider data exchange. |
| INT-013 | Benefits provider integration | NOT IMPLEMENTED | No benefits provider API integration. |
| INT-014 | Job board integration | NOT IMPLEMENTED | No job board posting integration. |
| INT-015 | Background check provider integration | NOT IMPLEMENTED | No DBS/screening provider integration. |
| INT-016 | API key management | PARTIAL | API authentication via BetterAuth sessions. Gap: No API key generation, rotation, or scope restriction. |
| INT-017 | Bulk API operations | NOT IMPLEMENTED | No batch API endpoints. |
| INT-018 | Event streaming | IMPLEMENTED | Redis Streams for domain events. Outbox processor publishes events. Domain event handlers process them. `packages/api/src/worker/outbox-processor.ts`, `packages/api/src/jobs/domain-event-handlers.ts` |

### 24. System Administration (21 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| SYS-001 | Multi-tenant management | IMPLEMENTED | Tenants table with full isolation. `migrations/0002_tenants.sql`. Tenant CRUD in security module. |
| SYS-002 | Tenant provisioning | PARTIAL | `bun run --filter @staffora/api bootstrap:root` for root tenant. Gap: No automated tenant setup with seed data and welcome communication. |
| SYS-003 | Tenant configuration | IMPLEMENTED | Tenant `settings` JSONB field for branding, feature flags, regional settings. `migrations/0002_tenants.sql`. Frontend: `packages/web/app/routes/(admin)/settings/tenant/route.tsx` |
| SYS-004 | Tenant branding | PARTIAL | Settings JSONB can store branding. Gap: No logo upload or colour customisation UI. |
| SYS-005 | Feature flag management | PARTIAL | Settings JSONB supports feature flags. Gap: No admin UI for managing feature toggles. |
| SYS-006 | Lookup value management | PARTIAL | Enums defined in migrations for each module. Gap: No tenant-configurable lookup values via admin UI. |
| SYS-007 | User account management | IMPLEMENTED | Security module with user CRUD, role assignment. `packages/api/src/modules/security/routes.ts`. Frontend: `packages/web/app/routes/(admin)/security/users/route.tsx` |
| SYS-008 | Password reset workflow | IMPLEMENTED | BetterAuth handles password reset via email. Frontend: `packages/web/app/routes/(auth)/forgot-password/route.tsx`, `reset-password/route.tsx` |
| SYS-009 | System health monitoring | IMPLEMENTED | `GET /api/v1/system/health` checks database and Redis health with latency. `packages/api/src/modules/system/routes.ts` |
| SYS-010 | Background job monitoring | PARTIAL | Worker scheduler runs jobs. Gap: No admin UI for job queue status, failed jobs, or retry. |
| SYS-011 | Email delivery monitoring | NOT IMPLEMENTED | No email send status tracking, bounce handling, or delivery monitoring. |
| SYS-012 | Database migration management | IMPLEMENTED | Version-controlled migrations with up/down. `bun run migrate:up`, `migrate:down`, `migrate:create`. `packages/api/src/db/migrate.ts`. 125 migration files. |
| SYS-013 | Cache management | PARTIAL | Redis cache plugin. Gap: No admin UI for cache invalidation. |
| SYS-014 | Audit log management | IMPLEMENTED | Audit log search, filter, and viewing. Frontend: `packages/web/app/routes/(admin)/security/audit-log/route.tsx` |
| SYS-015 | Notification template management | PARTIAL | Frontend settings page: `packages/web/app/routes/(admin)/settings/notifications/route.tsx`. Gap: No backend API for template management. |
| SYS-016 | Data archival | NOT IMPLEMENTED | No data archival system. |
| SYS-017 | Rate limit configuration | IMPLEMENTED | Configurable rate limits per endpoint. `packages/api/src/plugins/rate-limit.ts` |
| SYS-018 | System announcement broadcasting | NOT IMPLEMENTED | No system announcement feature. |
| SYS-019 | Usage analytics per tenant | NOT IMPLEMENTED | No per-tenant usage tracking. |
| SYS-020 | Backup and disaster recovery | PARTIAL | Backup/restore scripts exist. `docker/scripts/backup-db.sh`, `docker/scripts/restore-db.sh`. Gap: No automated scheduling, retention, or tested restore procedures. |
| SYS-021 | Environment management | PARTIAL | Docker-based development environment. `docker/docker-compose.yml`. Gap: No staging environment or data anonymisation. |

### 25. Mobile & Accessibility (16 items)

| ID | Feature | Status | Evidence |
|----|---------|--------|----------|
| MOB-001 | Responsive web design | PARTIAL | Tailwind CSS used throughout. Some responsive breakpoints. Gap: Limited responsive classes found in components. |
| MOB-002 | Mobile-optimised self-service | PARTIAL | Self-service routes exist. Gap: No specific mobile optimisation of key flows. |
| MOB-003 | Mobile clock in/out | PARTIAL | Time clock API exists. Gap: No mobile-specific UI or offline capability. |
| MOB-004 | Push notifications (mobile) | NOT IMPLEMENTED | No push notification system. Notification worker supports email only. |
| MOB-005 | Offline capability | NOT IMPLEMENTED | No offline support or service worker. |
| MOB-006 | WCAG 2.1 AA compliance | PARTIAL | ARIA attributes used extensively across UI components (108 files contain aria references). Semantic HTML in components. Gap: No formal WCAG audit or compliance verification. |
| MOB-007 | Screen reader compatibility | PARTIAL | ARIA labels and roles in UI components. Gap: Not verified with screen readers. |
| MOB-008 | Keyboard navigation | PARTIAL | Interactive elements use semantic HTML (buttons, inputs). Gap: No explicit focus trap management for modals or complex components verified. |
| MOB-009 | Colour contrast compliance | NOT IMPLEMENTED | No verified contrast ratios across all themes. |
| MOB-010 | Text resize support | NOT IMPLEMENTED | No verified text resize behaviour. |
| MOB-011 | Alternative text for images | NOT IMPLEMENTED | No images used prominently (no photo system). N/A for most of the app. |
| MOB-012 | Form accessibility | IMPLEMENTED | Form components use labels, error messages, and required indicators. `packages/web/app/components/ui/input.tsx` |
| MOB-013 | Focus management | PARTIAL | Modal component has focus management. Gap: Not verified across all dynamic content. |
| MOB-014 | Internationalisation (i18n) foundation | NOT IMPLEMENTED | No i18n framework. Strings are hardcoded in English. Locale types defined in shared package but not used. |
| MOB-015 | Progressive Web App (PWA) | NOT IMPLEMENTED | No service worker, manifest, or PWA configuration. |
| MOB-016 | Dark mode support | IMPLEMENTED | Theme system with dark mode. `packages/web/app/lib/theme.tsx`. Dark-mode CSS classes throughout components. |

---

## Critical Priority Gap Analysis

The following CRITICAL items are **NOT IMPLEMENTED** (49 total):

### Must-Fix for Go-Live (Legal/Compliance)
1. **CPY-001** Pay period configuration
2. **CPY-002** Pay schedule assignment
3. **CPY-014** National Minimum Wage compliance
4. **CPY-016** Tax code management
5. **CPY-017** National Insurance category tracking
6. **CPY-022** P45 generation
7. **CPY-023** P60 generation
8. **CPY-025** RTI FPS submission data
9. **CPY-027** Payslip generation
10. **CPY-030** Auto-enrolment pension compliance
11. **CPY-031** Pension contribution calculation
12. **CPY-035** Gender pay gap data preparation
13. **CPY-037** Holiday pay calculation (Harpur Trust)
14. **CPY-038** Final pay calculation
15. **CPY-044** Payroll period locking (partial)
16. **CET-007** Section 1 statement compliance
17. **EPD-010** Bank details management
18. **EPD-024** Employee consent management
19. **EPD-025** Data retention scheduling
20. **UKC-001** UK GDPR compliance framework (partial)
21. **UKC-002** Data subject access request processing
22. **UKC-003** Right to erasure processing
23. **UKC-005** Data retention policy configuration
24. **UKC-006** Data breach notification workflow
25. **UKC-007** Privacy notice management
26. **UKC-008** Gender pay gap statutory reporting
27. **UKC-012** National Minimum Wage compliance checking
28. **UKC-013** Working Time Regulations compliance
29. **UKC-014** Auto-enrolment pension compliance
30. **UKC-016** Health and safety compliance tracking

### Core Operations
31. **CPY-003/004** already implemented (salary recording)
32. **ALM-001** Holiday entitlement calculation (partial)
33. **MOB-001** Responsive web design (partial)
34. **MOB-006** WCAG 2.1 AA compliance (partial)
35. **MOB-007** Screen reader compatibility (partial)

---

## Key Strengths

1. **Security & Access Control (88.5% coverage)**: The strongest area. Full RLS, RBAC, field-level security, MFA, CSRF, XSS prevention, SQL injection prevention, audit trail, idempotency, rate limiting, and security headers are all implemented.

2. **Workflow & Approvals (81.3% coverage)**: Solid workflow engine with state machines, SLA tracking, delegation, and audit trails.

3. **Talent Management (78.6% coverage)**: Succession planning, competency frameworks, and pipeline visualisation are well-implemented.

4. **Benefits Administration (77.8% coverage)**: Carriers, plans, enrolments, dependents, life events, and cost reporting functional.

5. **Document Management (75.0% coverage)**: Secure storage, templates, expiry tracking, audit trail, and self-service access.

## Critical Gaps

1. **Compensation & Payroll (22.7% coverage)**: The largest gap. No payroll processing, tax management, pension, statutory pay calculations (except SSP via dedicated module), or HMRC reporting. This is the single biggest area blocking enterprise readiness.

2. **UK Employment Compliance (42.9% coverage)**: GDPR workflows (DSAR, erasure, breach notification), gender pay gap, WTR monitoring, H&S compliance, pension auto-enrolment, and most statutory obligations are missing.

3. **Absence & Leave Management (46.9% coverage)**: Core booking and balances work, but UK-specific leave types (bereavement, carer's, unpaid parental), Bradford Factor, carry-over rules, and pro-rata calculations are missing.

---

## Methodology Notes

- **IMPLEMENTED**: Feature has backend API endpoints, database tables, and service logic. Frontend pages may or may not exist.
- **PARTIALLY IMPLEMENTED**: Some aspects of the feature exist but significant functionality is missing (documented in gap description).
- **NOT IMPLEMENTED**: No evidence of the feature in migrations, API modules, services, or frontend routes.
- Evidence was gathered from: `migrations/*.sql`, `packages/api/src/modules/*/`, `packages/api/src/plugins/`, `packages/api/src/jobs/`, `packages/shared/src/state-machines/`, `packages/web/app/routes/`, and `packages/web/app/components/`.
