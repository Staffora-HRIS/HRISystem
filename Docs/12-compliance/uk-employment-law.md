# UK Employment Law Compliance

> Last updated: 2026-03-28

This document catalogs the UK employment law compliance modules implemented in the Staffora HRIS platform. Each module maps to specific UK legislation and provides API endpoints to manage statutory requirements.

---

## Table of Contents

- [Overview](#overview)
- [Right to Work](#right-to-work)
- [Statutory Sick Pay (SSP)](#statutory-sick-pay-ssp)
- [Statutory Leave (Maternity, Paternity, Adoption, ShPL)](#statutory-leave)
- [Family Leave](#family-leave)
- [Unpaid Parental Leave](#unpaid-parental-leave)
- [Parental Bereavement Leave (Jack's Law)](#parental-bereavement-leave)
- [Carer's Leave](#carers-leave)
- [Flexible Working](#flexible-working)
- [Pension Auto-Enrolment](#pension-auto-enrolment)
- [Warnings & Disciplinary](#warnings--disciplinary)
- [Working Time Regulations (WTR)](#working-time-regulations-wtr)
- [Health & Safety](#health--safety)
- [Gender Pay Gap Reporting](#gender-pay-gap-reporting)
- [National Minimum Wage (NMW)](#national-minimum-wage-nmw)
- [Probation](#probation)
- [Contract Amendments](#contract-amendments)
- [Contract Statements (Written Particulars)](#contract-statements)
- [DBS Checks](#dbs-checks)
- [TUPE Transfers](#tupe-transfers)
- [Employment Tribunal Preparation](#employment-tribunal-preparation)
- [Secondments](#secondments)
- [Reasonable Adjustments](#reasonable-adjustments)

---

## Overview

Staffora implements 22+ UK-specific compliance modules covering the major areas of UK employment law. Each module is implemented as a standard backend module in `packages/api/src/modules/` with routes, service, repository, and schema files.

All modules share these common patterns:
- **RBAC-protected**: Every endpoint requires authentication and specific permissions
- **Audit-logged**: All state changes are recorded in the audit trail
- **Tenant-isolated**: All data is scoped via RLS
- **Cursor-paginated**: List endpoints use cursor-based pagination
- **Idempotent**: Mutating endpoints support `Idempotency-Key` header

## Right to Work

**Legislation:** Immigration, Asylum and Nationality Act 2006; Immigration Act 2014

**Module:** `packages/api/src/modules/right-to-work/`

**Purpose:** Verify that employees have the legal right to work in the UK before employment begins. Employers face civil penalties of up to GBP 60,000 per illegal worker and potential criminal prosecution.

**Key Features:**
- Create and manage right-to-work checks per employee
- Track document types (passport, BRP, share code, etc.)
- Verify checks with outcome recording
- Record failed checks with reasons
- Track document expiry dates
- Alert on expiring checks (follow-up verification required for time-limited workers)

**Permissions:** `right_to_work:read`, `right_to_work:write`, `right_to_work:delete`

**Key Endpoints:**
- `POST /right-to-work/checks` -- Create a new RTW check
- `POST /right-to-work/checks/:id/verify` -- Verify a check
- `POST /right-to-work/checks/:id/fail` -- Record a failed check
- `GET /right-to-work/checks/expiring` -- List expiring checks

## Statutory Sick Pay (SSP)

**Legislation:** Social Security Contributions and Benefits Act 1992, Part XI

**Module:** `packages/api/src/modules/ssp/`

**Purpose:** Manage Statutory Sick Pay records, eligibility checking, and entitlement tracking.

**Key Features:**
- Start and end SSP periods
- Check SSP eligibility (earnings threshold, qualifying days, waiting days)
- Track remaining entitlement (max 28 weeks per period of incapacity)
- Calculate SSP amounts at current statutory rates
- Link to absence records

**Permissions:** `ssp:records:read`, `ssp:records:write`, `ssp:eligibility:read`

**Key Endpoints:**
- `POST /ssp/records` -- Start new SSP period
- `POST /ssp/records/:id/end` -- End SSP period
- `GET /ssp/employees/:employeeId/eligibility` -- Check SSP eligibility
- `GET /ssp/employees/:employeeId/entitlement` -- Check remaining entitlement

## Statutory Leave

**Legislation:** Employment Rights Act 1996; Maternity and Parental Leave Regulations 1999; Paternity and Adoption Leave Regulations 2002; Shared Parental Leave Regulations 2014

**Module:** `packages/api/src/modules/statutory-leave/`

**Purpose:** Manage statutory maternity, paternity, shared parental, and adoption leave.

**Key Features:**
- Create statutory leave entitlements for maternity, paternity, adoption, and shared parental leave
- Calculate statutory pay (SMP, SPP, SAP, ShPP) at current rates
- Track KIT (Keeping In Touch) days -- up to 10 per maternity/adoption, 20 SPLIT days for ShPL
- Curtail maternity/adoption leave for shared parental leave transfer
- Pay schedule generation

**Permissions:** `statutory_leave:read`, `statutory_leave:write`, `statutory_leave:pay:read`, `statutory_leave:kit:read`, `statutory_leave:kit:write`

**Key Endpoints:**
- `POST /statutory-leave/entitlements` -- Create leave entitlement
- `POST /statutory-leave/entitlements/:id/calculate-pay` -- Calculate statutory pay
- `POST /statutory-leave/entitlements/:id/kit-days` -- Record KIT/SPLIT day
- `PATCH /statutory-leave/entitlements/:id/curtail` -- Curtail for ShPL

## Family Leave

**Legislation:** Employment Rights Act 1996; Work and Families Act 2006; Children and Families Act 2014

**Module:** `packages/api/src/modules/family-leave/`

**Purpose:** Unified API for UK family leave management (maternity, paternity, shared parental, adoption).

**Key Features:**
- Eligibility checking (qualifying service, earnings threshold)
- Statutory pay calculation (SMP, SPP, SAP, ShPP)
- KIT/SPLIT day recording
- Curtailment for shared parental leave
- Pay schedule generation
- Formal notice recording (MAT B1, SC3/SC4, etc.)
- Compliance dashboard

**Permissions:** `family_leave:read`, `family_leave:write`

**Key Endpoints:**
- `POST /family-leave/entitlements` -- Create entitlement
- `POST /family-leave/entitlements/:id/check-eligibility` -- Check eligibility
- `POST /family-leave/entitlements/:id/calculate-pay` -- Calculate pay
- `POST /family-leave/entitlements/:id/kit-day` -- Record KIT day
- `PATCH /family-leave/entitlements/:id/curtail` -- Curtail for ShPL
- `GET /family-leave/entitlements/:id/pay-schedule` -- Pay schedule
- `POST /family-leave/entitlements/:id/notices` -- Record formal notice
- `GET /family-leave/dashboard` -- Compliance dashboard

## Unpaid Parental Leave

**Legislation:** Maternity and Parental Leave Regulations 1999 (as amended)

**Module:** `packages/api/src/modules/parental-leave/`

**Purpose:** Manage unpaid parental leave entitlements and bookings. Employees with 1 year's service are entitled to 18 weeks per child (taken before child's 18th birthday).

**Key Features:**
- Register children for parental leave entitlement
- Create and manage parental leave bookings
- Approval workflow (employer can postpone for up to 6 months)
- Track remaining entitlement per child

**Permissions:** `parental_leave:read`, `parental_leave:write`, `parental_leave:approve:write`

**Key Endpoints:**
- `POST /parental-leave/entitlements` -- Register child
- `GET /parental-leave/entitlements/:employeeId` -- Get entitlements
- `POST /parental-leave/bookings` -- Create booking
- `PATCH /parental-leave/bookings/:id/approve` -- Approve booking
- `PATCH /parental-leave/bookings/:id/reject` -- Reject booking

## Parental Bereavement Leave

**Legislation:** Parental Bereavement (Leave and Pay) Act 2018 ("Jack's Law")

**Module:** `packages/api/src/modules/bereavement/`

**Purpose:** Manage parental bereavement leave. Bereaved parents are entitled to 2 weeks' leave (taken within 56 weeks of the child's death).

**Key Features:**
- Create bereavement leave requests
- Approval and activation workflow
- Status transitions: pending, approved, active, completed

**Permissions:** `bereavement:read`, `bereavement:write`

**Key Endpoints:**
- `POST /bereavement` -- Create bereavement leave request
- `PATCH /bereavement/:id/status` -- Approve, activate, or complete

## Carer's Leave

**Legislation:** Carer's Leave Act 2023 (c. 18)

**Module:** `packages/api/src/modules/carers-leave/`

**Purpose:** Manage carer's leave entitlements. Employees are entitled to 1 week of unpaid leave per year to provide care for a dependant with a long-term care need.

**Key Features:**
- Create and manage carer's leave entitlements
- Approval workflow
- Track remaining entitlement

**Permissions:** `carers_leave:read`, `carers_leave:write`, `carers_leave:delete`

**Key Endpoints:**
- `POST /carers-leave` -- Create entitlement
- `PATCH /carers-leave/:id/status` -- Approve or reject

## Flexible Working

**Legislation:** Employment Relations (Flexible Working) Act 2023

**Module:** `packages/api/src/modules/flexible-working/`

**Purpose:** Manage flexible working requests under the 2023 Act. From April 2024, employees can make requests from day one (no 26-week qualifying period), and employers must respond within 2 months.

**Key Features:**
- Submit flexible working requests (work pattern, hours, location changes)
- Consultation scheduling and recording
- Request history tracking
- Approval/rejection with documented business reasons (8 statutory grounds)
- Appeal process

**Permissions:** `flexible_working:read`, `flexible_working:write`

**Key Endpoints:**
- `POST /flexible-working/requests` -- Submit request
- `PATCH /flexible-working/requests/:id/consultation` -- Schedule consultation
- `POST /flexible-working/requests/:id/consultations` -- Record consultation
- `PATCH /flexible-working/requests/:id/approve` -- Approve request
- `PATCH /flexible-working/requests/:id/reject` -- Reject with reason

## Pension Auto-Enrolment

**Legislation:** Pensions Act 2008; Occupational and Personal Pension Schemes (Automatic Enrolment) Regulations 2010

**Module:** `packages/api/src/modules/pension/`

**Purpose:** Manage workplace pension auto-enrolment. Non-compliance carries criminal prosecution risk.

**Key Features:**
- Pension scheme management
- Auto-enrolment processing (eligible jobholders, non-eligible jobholders, entitled workers)
- Contribution tracking (employer and employee)
- Opt-out and re-enrolment management
- Compliance dashboard and reporting
- Postponement period tracking

**Permissions:** `pension:schemes:read/write`, `pension:enrolments:read/write`, `pension:contributions:read/write`, `pension:compliance:read`

## Warnings & Disciplinary

**Legislation:** Employment Rights Act 1996; ACAS Code of Practice on Disciplinary and Grievance Procedures

**Module:** `packages/api/src/modules/warnings/`

**Purpose:** Manage employee warnings following the ACAS disciplinary process.

**Key Features:**
- Issue warnings (verbal, written, final written)
- Appeal submission and resolution
- Warning rescission
- Batch expiry of active warnings
- Track active warnings per employee

**Permissions:** `warnings:read`, `warnings:write`

**Key Endpoints:**
- `POST /warnings` -- Issue a warning
- `POST /warnings/:id/appeal` -- Submit appeal
- `PATCH /warnings/:id/appeal/resolve` -- Resolve appeal
- `PATCH /warnings/:id/rescind` -- Rescind warning
- `POST /warnings/batch-expire` -- Batch expire active warnings

## Working Time Regulations (WTR)

**Legislation:** Working Time Regulations 1998 (SI 1998/1833)

**Module:** `packages/api/src/modules/wtr/`

**Purpose:** Monitor compliance with working time limits: 48-hour weekly maximum, 11 hours daily rest, 24 hours weekly rest, 20-minute break per 6 hours, and 5.6 weeks annual leave.

**Key Features:**
- Compliance dashboard reporting
- Alert system for breaches and near-breaches
- Alert acknowledgement workflow
- Opt-out agreement management (48-hour week opt-out)
- Individual working time status checks

**Permissions:** `wtr:compliance:read`, `wtr:alerts:read/write`, `wtr:opt_outs:read/write`

**Key Endpoints:**
- `GET /wtr/compliance` -- Compliance dashboard
- `GET /wtr/alerts` -- List alerts
- `POST /wtr/alerts/:id/acknowledge` -- Acknowledge alert
- `POST /wtr/opt-outs` -- Create opt-out agreement
- `POST /wtr/opt-outs/:id/revoke` -- Revoke opt-out
- `GET /wtr/employees/:employeeId/status` -- Individual status

## Health & Safety

**Legislation:** Health and Safety at Work etc. Act 1974; RIDDOR 2013; Management of Health and Safety at Work Regulations 1999; Health and Safety (Display Screen Equipment) Regulations 1992

**Module:** `packages/api/src/modules/health-safety/`

**Purpose:** Manage health and safety incidents, risk assessments, and DSE assessments.

**Key Features:**
- Accident book (statutory requirement)
- RIDDOR (Reporting of Injuries, Diseases and Dangerous Occurrences Regulations) reporting
- Risk assessments with review scheduling
- DSE (Display Screen Equipment) assessments
- Health & safety dashboard

**Permissions:** `health_safety:incidents:read/write`, `health_safety:risk_assessments:read/write`, `health_safety:dse_assessments:read/write`, `health_safety:dashboard:read`

## Gender Pay Gap Reporting

**Legislation:** Equality Act 2010 (Gender Pay Gap Information) Regulations 2017

**Module:** `packages/api/src/modules/gender-pay-gap/`

**Purpose:** Generate and manage annual gender pay gap reports for employers with 250+ employees.

**Key Features:**
- Generate pay gap reports for a reporting year
- Calculate all 6 statutory metrics: mean/median gender pay gap, mean/median bonus pay gap, proportion of males/females receiving bonus, proportion in each pay quartile
- Dashboard with trends across years
- Publish reports (for submission to the government portal)

**Permissions:** `analytics:read`, `analytics:write`

**Key Endpoints:**
- `POST /gender-pay-gap/reports` -- Generate report
- `GET /gender-pay-gap/reports` -- List reports
- `GET /gender-pay-gap/reports/:id` -- Detail with metrics
- `PATCH /gender-pay-gap/reports/:id/publish` -- Mark as published
- `GET /gender-pay-gap/dashboard` -- Trends dashboard

## National Minimum Wage (NMW)

**Legislation:** National Minimum Wage Act 1998; National Minimum Wage Regulations 2015

**Module:** `packages/api/src/modules/nmw/`

**Purpose:** Ensure compliance with NMW/NLW (National Living Wage) rates. HMRC can issue penalties of 200% of underpayment.

**Key Features:**
- Maintain current NMW/NLW rates by age band
- Tenant-specific rate overrides (for enhanced rates)
- Single employee compliance check
- Bulk compliance check for all active employees
- Compliance reporting with filters

**Permissions:** `nmw:rates:read/write`, `nmw:compliance:read/write`

**Key Endpoints:**
- `GET /nmw/rates` -- List current rates
- `POST /nmw/check/:employeeId` -- Single employee check
- `POST /nmw/check-all` -- Bulk compliance check
- `GET /nmw/compliance-report` -- Compliance report

## Probation

**Module:** `packages/api/src/modules/probation/`

**Purpose:** Manage probation reviews, extensions, and outcomes.

**Key Features:**
- Create probation reviews with due dates
- Track upcoming and overdue reviews
- Extend probation periods
- Record outcomes (pass, extend, fail)
- Reminder tracking

**Key Endpoints:**
- `POST /probation/reviews` -- Create review
- `GET /probation/reviews/upcoming` -- Due in next 30 days
- `GET /probation/reviews/overdue` -- Past due date
- `PATCH /probation/reviews/:id/extend` -- Extend period
- `PATCH /probation/reviews/:id/complete` -- Record outcome

## Contract Amendments

**Legislation:** Employment Rights Act 1996, s.4 (duty to notify of changes)

**Module:** `packages/api/src/modules/contract-amendments/`

**Purpose:** Track contract amendments and ensure employees are notified of changes to their terms and conditions.

**Key Features:**
- Create and manage contract amendments
- Status workflow: draft, notification_sent, acknowledged
- Track employee acknowledgement of changes

**Permissions:** `contracts:read`, `contracts:write`

## Contract Statements

**Legislation:** Employment Rights Act 1996, ss.1-7B (Written Statement of Employment Particulars)

**Module:** `packages/api/src/modules/contract-statements/`

**Purpose:** Generate and manage UK Written Statements of Employment Particulars. Since 6 April 2020, all UK employees and workers must receive a written statement on or before their first day.

**Key Features:**
- Auto-generate statements from employee and contract data
- Track all 12 legally required particulars
- Issue statements to employees
- Record employee acknowledgement
- Compliance status report (identify employees without statements)

**Permissions:** `employees:read`, `employees:write`

**Key Endpoints:**
- `POST /contract-statements/generate/:employeeId` -- Generate statement
- `GET /contract-statements/compliance` -- Compliance status
- `PATCH /contract-statements/:id/issue` -- Issue to employee

## DBS Checks

**Legislation:** Police Act 1997, Part V; Safeguarding Vulnerable Groups Act 2006

**Module:** `packages/api/src/modules/dbs-checks/`

**Purpose:** Manage DBS (Disclosure and Barring Service) check applications and results for roles requiring criminal record checks.

**Key Features:**
- Create DBS check applications (Basic, Standard, Enhanced, Enhanced with Barred Lists)
- Submit applications
- Record results
- Track renewal dates

**Permissions:** RBAC-controlled via module permissions

## TUPE Transfers

**Legislation:** Transfer of Undertakings (Protection of Employment) Regulations 2006 (SI 2006/246)

**Module:** `packages/api/src/modules/tupe/`

**Purpose:** Manage TUPE transfers when employees transfer between organisations as part of a business transfer or service provision change.

**Key Features:**
- Create and manage transfer records
- Track affected employees with consent/objection status
- Status workflow: planning, consultation, in_progress, completed, cancelled
- Status transition history
- Employee information and liability (ELI) tracking

**Permissions:** `tupe:read`, `tupe:write`, `tupe:delete`

**Key Endpoints:**
- `POST /tupe/transfers` -- Create transfer
- `POST /tupe/transfers/:id/employees` -- Add affected employee
- `PUT /tupe/transfers/:id/employees/:empId/consent` -- Update consent/objection
- `GET /tupe/transfers/:id/history` -- Status transition history

## Employment Tribunal Preparation

**Legislation:** Employment Tribunals Act 1996; Employment Tribunals (Constitution and Rules of Procedure) Regulations 2013

**Module:** `packages/api/src/modules/tribunal/`

**Purpose:** Prepare for employment tribunal cases by managing case details and document bundles.

**Key Features:**
- Create and manage tribunal case records
- Document bundle management (add, update, remove documents)
- Case preparation tracking

**Permissions:** `tribunal:read`, `tribunal:write`

## Secondments

**Module:** `packages/api/src/modules/secondments/`

**Purpose:** Manage employee secondments (temporary transfers to different roles, departments, or organisations).

**Key Features:**
- Create and track secondments
- Status workflow with transitions
- Track home and host details

**Permissions:** RBAC-controlled via module permissions

## Reasonable Adjustments

**Legislation:** Equality Act 2010, ss.20-22

**Module:** `packages/api/src/modules/reasonable-adjustments/`

**Purpose:** Track reasonable adjustments made for disabled employees. Employers have a duty to make reasonable adjustments to avoid substantial disadvantage.

**Key Features:**
- Record adjustment requests and implementations
- Track adjustment types and status
- Review scheduling

**Permissions:** `reasonable_adjustments:read`, `reasonable_adjustments:write`
