# UK Employment Law Compliance Audit - Staffora HRIS

**Audit Date**: 2026-03-13
**Platform**: Staffora HRIS (staffora.co.uk)
**Auditor**: UK Employment Compliance Agent (automated codebase audit)
**Scope**: All 12 UK employment law compliance areas audited against actual codebase

---

## Executive Summary

Staffora HRIS provides a strong generic HRIS foundation with multi-tenant architecture, RLS-enforced data isolation, comprehensive audit logging, and effective-dated employee records. However, **UK-specific employment law compliance is significantly incomplete**. The platform is built as a general-purpose, jurisdiction-agnostic HRIS and lacks purpose-built features for the majority of UK statutory requirements.

**Overall Compliance Score: 18/100**

| Rating | Count | Areas |
|--------|-------|-------|
| IMPLEMENTED | 0 | None fully meet UK statutory requirements |
| PARTIALLY IMPLEMENTED | 5 | Holiday Entitlement, Employment Contracts, Case Management, Data Protection (basic), Document Management |
| NOT IMPLEMENTED | 7 | Right to Work, SSP, Family Leave, Flexible Working, Equality/Diversity, Pension Auto-Enrolment, HMRC Integration, Health & Safety |

**Critical Risk Areas**: 7 of 12 compliance areas have no implementation whatsoever.

---

## 1. Right to Work

### 1.1 Document Verification Workflows

- **Requirement**: Employers must verify every employee's right to work in the UK before employment begins (Immigration, Asylum and Nationality Act 2006; Immigration Act 2016). Failure carries unlimited fines and up to 5 years imprisonment.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No dedicated right-to-work verification workflow exists. The `employee_identifiers` table (`migrations/0021_employee_identifiers.sql`) stores document types including `passport` and `national_id`, and the field registry (`migrations/0120_seed_field_registry.sql`) defines `work_permit_number` and `work_permit_expiry` fields. However, there is:
  - No verification status tracking (verified/pending/expired)
  - No prescribed document check workflow (List A / List B documents)
  - No verification date recording
  - No follow-up check scheduling for time-limited right to work
  - No digital identity verification integration (IDVT/DBS)
- **Risk Level**: CRITICAL
- **Remediation**:
  1. Create `right_to_work_checks` table with fields: `employee_id`, `check_type` (manual/online/IDVT), `check_date`, `document_type`, `document_reference`, `expiry_date`, `share_code`, `status` (pending/verified/expired/failed), `verified_by`, `next_check_date`
  2. Build verification workflow with mandatory completion before employee status can move from `pending` to `active`
  3. Implement automated alerts for expiring right-to-work documents (30/60/90 day warnings)
  4. Add Home Office online checking service integration endpoint
  5. Add repeat check scheduling for time-limited permissions

### 1.2 Expiry Tracking and Alerts

- **Requirement**: Employers must conduct follow-up checks before right-to-work permission expires.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `employee_identifiers` table has an `expiry_date` column with an `idx_employee_identifiers_expiry` index, and the `get_expiring_identifiers()` function returns documents expiring within N days. The `get_expired_identifiers()` function identifies already-expired documents. However, these are generic document expiry functions, not right-to-work specific. No background job or notification triggers these alerts.
- **Risk Level**: CRITICAL
- **Remediation**: Wire expiry alerts into the notification worker (`packages/api/src/jobs/notification-worker.ts`) and scheduler (`packages/api/src/worker/scheduler.ts`) with UK-specific right-to-work thresholds.

---

## 2. Holiday Entitlement (Working Time Regulations 1998)

### 2.1 Statutory Minimum 28 Days (5.6 Weeks)

- **Requirement**: All workers are entitled to 5.6 weeks' paid annual leave (28 days for full-time, pro-rata for part-time). This is a legal minimum that cannot be contractually reduced.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The system has a robust leave management infrastructure:
  - `leave_types` table (`migrations/0047_leave_types.sql`) with categories including `annual`
  - `leave_policies` table (`migrations/0048_leave_policies.sql`) with `default_balance`, `employment_type` scope, and `country_code` filtering
  - `leave_balances` table (`migrations/0050_leave_balances.sql`) with computed `closing_balance` and `available_balance`
  - `leave_accrual_rules` table (`migrations/0049_leave_accrual_rules.sql`) with tenure bonuses
  - `leave_balance_ledger` (migration 0051) for auditable balance changes
  - Pro-rata calculation via `app.calculate_prorated_balance()` function
  - Policy matching via `app.find_applicable_leave_policy()` which considers org unit, country, employment type, and tenure

  **Missing for UK compliance**:
  - No enforcement of the 28-day statutory minimum -- policies can be configured with any `default_balance` including below statutory minimum
  - No validation that `default_balance >= 28` for UK workers (or pro-rata equivalent)
  - No UK-specific leave year concept (could be calendar year, April-March, or anniversary-based)
- **Risk Level**: HIGH
- **Remediation**:
  1. Add country-specific statutory minimum validation in the `AbsenceService.createLeavePolicy()` method
  2. Create a compliance check function that verifies all UK employees have at least 5.6 weeks entitlement
  3. Add warning when creating policies below statutory minimum for GBR country code

### 2.2 Pro-rata for Part-Time Workers

- **Requirement**: Part-time workers receive proportional entitlement (e.g., 3 days/week = 16.8 days).
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `leave_policies` table has `employment_type` scope (can set different policies for `part_time`), and `prorate_on_hire` handles mid-year joiners. The `employment_contracts` table stores `fte` (0-1 range) and `working_hours_per_week`. However, there is no automatic calculation linking FTE to statutory minimum pro-rata entitlement.
- **Risk Level**: HIGH
- **Remediation**: Implement automatic statutory minimum calculation: `Math.min(5.6 * days_per_week, 28)` based on the employee's contracted working pattern.

### 2.3 Bank Holiday Handling

- **Requirement**: Bank holidays can be included in the 28-day entitlement or given in addition. The approach must be clear and consistently applied.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `public_holidays` table (`migrations/0054_public_holidays.sql`) supports country-specific (`country_code = 'GBR'`) and region-specific holidays, half-day holidays, and is used in leave duration calculations. This provides the data foundation, but there is no logic to automatically include/exclude bank holidays from the statutory 28-day entitlement calculation, and no configuration for "bank holidays additional to entitlement" vs "included in entitlement."
- **Risk Level**: MEDIUM
- **Remediation**: Add a tenant/policy-level setting for bank holiday treatment (included/additional) and adjust entitlement calculations accordingly.

### 2.4 Holiday Carryover Rules

- **Requirement**: Under the Working Time Regulations, 4 weeks (20 days) of the 28-day entitlement can generally only be carried forward if the worker was unable to take it (e.g., due to sickness or maternity). The additional 1.6 weeks can be subject to carryover rules set by the employer.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `leave_policies` table has `max_carryover` and `carryover_expiry_months` fields. The `balance_transaction_type` enum includes `carryover` and `forfeited`. However, there is no distinction between the 4-week EU-derived entitlement and the 1.6-week additional statutory entitlement for carryover purposes, and no automatic handling of sickness/maternity-related carryover rights.
- **Risk Level**: MEDIUM
- **Remediation**: Split statutory entitlement into two tiers with different carryover rules; implement automatic carryover for leave untaken due to sickness/maternity.

### 2.5 Holiday Pay Calculation

- **Requirement**: Holiday pay must be based on a worker's normal remuneration using a 52-week reference period (Employment Rights Act 1996, amended April 2020). This includes regular overtime, commission, and bonuses.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No holiday pay calculation logic found anywhere in the codebase. The `compensation_history` table (`migrations/0025_compensation_history.sql`) stores base salary but does not track overtime, commission components, or calculate reference period averages. The `leave_types` table has an `is_paid` boolean but no pay rate calculation.
- **Risk Level**: HIGH
- **Remediation**: Implement a 52-week reference period calculation engine that aggregates base pay, regular overtime, commission, and allowances. This requires integration with payroll data.

---

## 3. Statutory Sick Pay (SSP)

### 3.1 SSP Calculations and Qualifying Rules

- **Requirement**: Employers must pay SSP for up to 28 weeks at the prescribed rate (currently GBP 116.75/week for 2024-25). Requires: (a) qualifying days (days normally worked), (b) 3 waiting days before payment begins, (c) linking rules for periods of incapacity within 8 weeks, (d) lower earnings limit check, (e) record keeping.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `leave_types` table has a `sick` category, and the leave request system can track sick absence. However, there is:
  - No SSP rate calculation
  - No waiting day logic (first 3 qualifying days unpaid)
  - No linking periods of incapacity for work (PIW)
  - No lower earnings limit (LEL) check
  - No 28-week maximum tracking
  - No SSP1 form generation
  - No fit note (Statement of Fitness for Work) tracking
  - No self-certification vs medical certificate threshold (7 calendar days)
- **Risk Level**: CRITICAL
- **Remediation**:
  1. Create SSP calculation engine with current rates, waiting days, linking rules
  2. Add fit note/medical certificate tracking with 7-day self-certification threshold
  3. Implement PIW (Period of Incapacity for Work) linking
  4. Add SSP1 form generation for employees reaching 28-week limit
  5. Integrate lower earnings limit check against employee pay

---

## 4. Family Leave

### 4.1 Maternity Leave and SMP

- **Requirement**: 52 weeks maternity leave (39 weeks paid: 6 weeks at 90% average earnings, 33 weeks at statutory rate). Qualifying criteria include 26 weeks' continuous service and earnings above LEL.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `leave_type_category` enum includes `parental` and the `leave_types` table mentions 'MATERNITY' as an example code. However, there is no:
  - Maternity leave entitlement calculation (ordinary vs additional)
  - SMP calculation logic
  - Qualifying service period check (26 weeks by 15th week before EWC)
  - MATB1 certificate tracking
  - KIT (Keeping in Touch) day tracking (10 days allowed)
  - Return to work date calculation
  - Compulsory maternity leave enforcement (2 weeks, 4 weeks for factory workers)
- **Risk Level**: CRITICAL
- **Remediation**: Build comprehensive maternity leave module with SMP calculation, qualifying period validation, KIT day tracking, and HMRC SMP recovery integration.

### 4.2 Paternity Leave and SPP

- **Requirement**: 2 weeks paternity leave (paid at statutory rate). Can be taken as 1 or 2 consecutive weeks within 56 days of birth/placement.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No paternity-specific leave logic, SPP calculation, or qualifying criteria checks found.
- **Risk Level**: CRITICAL
- **Remediation**: Implement paternity leave module with SPP rates, qualifying checks, and timing constraints.

### 4.3 Shared Parental Leave (SPL)

- **Requirement**: Parents can share up to 50 weeks of leave and 37 weeks of pay. Requires complex notice and booking processes.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No SPL notice, booking, or SPLIT day tracking found.
- **Risk Level**: HIGH
- **Remediation**: Implement SPL with curtailment notice tracking, booking periods, and ShPP calculation.

### 4.4 Adoption Leave

- **Requirement**: Same entitlements as maternity leave for the primary adopter (52 weeks, SAP calculation).
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `life_event_type` enum (`migrations/0101_benefits_types.sql`) includes `adoption` as a life event for benefits, but no adoption leave entitlement logic exists.
- **Risk Level**: HIGH
- **Remediation**: Implement adoption leave mirroring maternity provisions.

### 4.5 Parental Bereavement Leave

- **Requirement**: 2 weeks' leave for parents who lose a child under 18 (Parental Bereavement (Leave and Pay) Act 2018 / "Jack's Law").
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `leave_type_category` enum includes `bereavement` but there is no specific parental bereavement entitlement with the statutory 2-week minimum or SPBP (Statutory Parental Bereavement Pay) calculation.
- **Risk Level**: HIGH
- **Remediation**: Add dedicated parental bereavement leave type with statutory 2-week entitlement and SPBP calculation.

### 4.6 Unpaid Parental Leave

- **Requirement**: 18 weeks per child (up to age 18), taken in blocks of 1 week minimum, maximum 4 weeks per year per child.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `leave_type_category` enum includes `unpaid` but there is no per-child tracking, block constraints, or annual limit enforcement.
- **Risk Level**: MEDIUM
- **Remediation**: Implement per-child unpaid parental leave tracking with weekly block enforcement and 4-week annual cap.

---

## 5. Flexible Working

### 5.1 Right to Request (from Day One - April 2024)

- **Requirement**: Since April 2024, all employees have the right to request flexible working from day one (previously 26 weeks). Employers must respond within 2 months. Employees can make 2 requests per 12 months.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `leave_requests` table tracks `working_pattern_type` in shared types as a concept, but there is no:
  - Flexible working request form/workflow
  - Formal response tracking with 2-month deadline
  - Request count tracking (max 2 per 12 months)
  - Appeal process
  - Business reason recording for refusal (8 statutory grounds)
- **Risk Level**: HIGH
- **Remediation**:
  1. Create `flexible_working_requests` table with request details, proposed changes, business case
  2. Build formal workflow with manager consideration and response deadlines
  3. Track request count per employee per rolling 12-month period
  4. Record statutory grounds for refusal

---

## 6. Disciplinary & Grievance (ACAS Code of Practice)

### 6.1 Formal Procedures

- **Requirement**: The ACAS Code of Practice on Disciplinary and Grievance Procedures requires: formal investigation, written notification, hearing with right to be accompanied, written outcome, and right of appeal. Employment tribunals can increase awards by up to 25% for unreasonable failure to follow the Code.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The case management module provides a foundation:
  - `cases` table (`migrations/0078_cases.sql`) with status workflow (new -> open -> pending -> resolved -> closed)
  - `case_type` enum includes `complaint` and `escalation`
  - `case_categories` table for categorization
  - `case_comments` and `case_attachments` for evidence tracking
  - SLA tracking with `sla_response_due_at` and `sla_resolution_due_at`
  - Escalation levels (tier_1 through tier_4)
  - Shared types (`packages/shared/src/types/cases.ts`) include `grievance` and `employee_relations` as `CaseTypeCategory` values
  - Cases service (`packages/api/src/modules/cases/service.ts`) implements state transitions

  **Missing for ACAS compliance**:
  - No dedicated disciplinary/grievance workflow stages (investigation -> hearing -> outcome -> appeal)
  - No "right to be accompanied" notification/tracking
  - No hearing scheduling with minimum notice periods
  - No formal investigation assignment and evidence collection workflow
  - No appeal process with different decision maker
  - No distinction between informal resolution and formal procedure
  - No sanction tracking (verbal warning, written warning, final warning, dismissal)
  - No warning expiry tracking
- **Risk Level**: HIGH
- **Remediation**:
  1. Create disciplinary-specific case category with ACAS-compliant stages
  2. Add hearing management (scheduling, companion notification, outcome recording)
  3. Implement warning register with expiry dates
  4. Build appeal workflow ensuring different decision maker
  5. Add investigation assignment and evidence collection features

---

## 7. Data Protection (UK GDPR / Data Protection Act 2018)

### 7.1 Technical Security Measures

- **Requirement**: Appropriate technical and organisational measures to protect personal data (Article 32 UK GDPR).
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The platform has strong technical security foundations:
  - **Row-Level Security**: All tables use PostgreSQL RLS with tenant isolation (`migrations/0002_tenants.sql` onward)
  - **Audit logging**: Immutable, partitioned `audit_log` table with comprehensive change tracking (`migrations/0010_audit_log.sql`)
  - **Field-level permissions**: `field_registry` with `is_sensitive` flags and role-based field access (`migrations/0115_field_registry.sql`, `migrations/0117_role_field_permissions.sql`)
  - **Security headers**: CSP, HSTS, X-Frame-Options, Referrer-Policy (`packages/api/src/plugins/security-headers.ts`)
  - **Session management**: BetterAuth with MFA support
  - **Identifier masking**: `app.mask_identifier()` function shows only last 4 characters
  - **Sensitive field marking**: Personal data fields (DOB, gender, nationality, bank details, NI number) marked as `is_sensitive = true` in field registry
  - **Data encryption note**: Employee identifiers table states "values should be encrypted at the application layer"
  - **Document access logging**: `document_access_log` table tracks views/downloads
- **Risk Level**: MEDIUM (good foundation but gaps below)

### 7.2 Privacy Notices

- **Requirement**: Employees must receive privacy notices explaining how their data is processed (Articles 13-14 UK GDPR).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No employee privacy notice system exists. No privacy notice acknowledgement tracking, no consent recording for optional data processing. (Note: the marketing website has been moved to a separate repository.)
- **Risk Level**: HIGH
- **Remediation**: Implement employee privacy notice delivery and acknowledgement tracking.

### 7.3 Data Subject Access Requests (DSARs)

- **Requirement**: Employees have the right to request copies of their personal data. Employers must respond within 1 calendar month (extendable by 2 months for complex requests).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No DSAR workflow, request tracking, data compilation, or response deadline management found. The case management system could be adapted but lacks DSAR-specific features.
- **Risk Level**: HIGH
- **Remediation**:
  1. Create DSAR request handling workflow with deadline tracking
  2. Build data export function that compiles all personal data across tables
  3. Add identity verification step
  4. Implement redaction tooling for third-party data

### 7.4 Right to Erasure / Data Retention

- **Requirement**: Personal data must not be kept longer than necessary. Employees have the right to erasure (with legitimate exceptions for legal obligations).
- **Status**: NOT IMPLEMENTED
- **Evidence**: The settings UI shows a "Data Management" section (`packages/web/app/routes/(admin)/settings/index.tsx`) for "Import, export, and data retention policies" but it is marked as `available: false` (not yet built). No data retention schedules, automated purge logic, or anonymisation functions found in the codebase.
- **Risk Level**: HIGH
- **Remediation**:
  1. Define retention schedules per data category (e.g., 6 years post-employment for tax records)
  2. Implement anonymisation function for expired data
  3. Build data erasure workflow with legal hold checks
  4. Add automated retention enforcement in the scheduler

### 7.5 Data Breach Notification

- **Requirement**: Personal data breaches must be reported to the ICO within 72 hours if they pose a risk to individuals (Article 33 UK GDPR).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No breach detection, notification workflow, or ICO reporting capability found.
- **Risk Level**: HIGH
- **Remediation**: Implement breach incident tracking with 72-hour countdown, affected data scope assessment, and notification templates.

### 7.6 Data Protection Impact Assessments (DPIAs)

- **Requirement**: DPIAs required for high-risk processing (Article 35 UK GDPR).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No DPIA templates, tracking, or workflow found.
- **Risk Level**: MEDIUM
- **Remediation**: This is typically handled outside the HRIS (via documents/policies), but the system could provide DPIA templates and tracking.

---

## 8. Equality & Diversity (Equality Act 2010)

### 8.1 Protected Characteristics Tracking

- **Requirement**: While collection of diversity data is voluntary, organisations with 250+ employees must report gender pay gap data. Protected characteristics data must be handled with extra care.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `employee_personal` table stores `gender` (enum: male, female, other, prefer_not_to_say) and `nationality`. The `life_event_type` enum includes `disability`. The field registry marks gender and nationality as `is_sensitive = true`. However:
  - No ethnicity recording
  - No disability recording or reasonable adjustment tracking
  - No religion/belief recording
  - No sexual orientation recording
  - No age band reporting
  - All above should be strictly voluntary with clear consent
- **Risk Level**: MEDIUM
- **Remediation**:
  1. Add voluntary diversity monitoring fields (separate from core HR data, with explicit consent)
  2. Ensure data can only be accessed for reporting purposes (aggregated, anonymised)
  3. Implement "prefer not to say" options for all protected characteristics

### 8.2 Gender Pay Gap Reporting

- **Requirement**: Organisations with 250+ employees must publish annual gender pay gap data (mean/median hourly pay, bonus gaps, proportion in pay quartiles).
- **Status**: NOT IMPLEMENTED
- **Evidence**: The `compensation_history` table stores base salary and the `employee_personal` table stores gender. The analytics module (`migrations/0111_analytics.sql`) has report definitions but no gender pay gap report template exists. No pay gap calculation logic found.
- **Risk Level**: HIGH (for organisations with 250+ employees)
- **Remediation**: Build gender pay gap report using compensation and gender data, calculating mean/median hourly pay gaps and quartile distributions.

### 8.3 Reasonable Adjustments

- **Requirement**: Employers must make reasonable adjustments for disabled employees (Equality Act 2010, s.20).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No reasonable adjustment request tracking, assessment workflow, or accommodation recording found.
- **Risk Level**: MEDIUM
- **Remediation**: Add reasonable adjustment request and tracking module linked to employee records.

---

## 9. Employment Contracts

### 9.1 Written Statement of Terms

- **Requirement**: Since April 2020, all employees and workers must receive a written statement of terms on or before their first day of work (previously within 2 months). This must include: employer name, employee name, start date, job title/description, place of work, pay details, hours, holiday entitlement, notice periods, probation period, and other terms.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `employment_contracts` table (`migrations/0022_employment_contracts.sql`) stores:
  - `contract_type` (permanent, fixed_term, contractor, intern, temporary)
  - `employment_type` (full_time, part_time)
  - `fte` (full-time equivalent)
  - `working_hours_per_week`
  - `probation_end_date`
  - `notice_period_days`
  - `effective_from` / `effective_to` (effective dating)

  The documents module can generate `contract` and `employment_letter` document types. The `compensation_history` table stores salary with pay frequency.

  **Missing**:
  - No contract template system with statutory required fields
  - No validation that all statutory terms are included
  - No day-one statement generation workflow triggered by hire
  - No wider written statement (must be given within 2 months) tracking
  - No contract signature/acknowledgement tracking
- **Risk Level**: HIGH
- **Remediation**:
  1. Create contract template system with statutory minimum field validation
  2. Auto-generate day-one written statement from employee/contract/compensation data
  3. Add acknowledgement/signature tracking
  4. Trigger day-one statement generation on employee creation

### 9.2 Contract Amendment Tracking

- **Requirement**: Any changes to employment terms must be notified in writing within 1 month.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `employment_contracts` table uses effective dating (`effective_from`/`effective_to`) and the `update_employment_contract()` function properly closes the old record and creates a new one. Full contract history is available via `get_employment_contract_history()`. The outbox pattern emits domain events on changes.

  **Missing**: No automatic notification to employee of contract changes, no 1-month notification deadline tracking.
- **Risk Level**: MEDIUM
- **Remediation**: Add automated notification triggered by contract change domain event with 1-month deadline tracking.

### 9.3 Notice Period Management

- **Requirement**: Statutory minimum notice periods apply (1 week per year of service, up to 12 weeks). Contractual notice may be longer but cannot be shorter.
- **Status**: PARTIALLY IMPLEMENTED
- **Evidence**: The `employment_contracts` table has `notice_period_days` field. The `get_contracts_ending_soon()` function tracks ending contracts. However, there is no statutory minimum notice calculation based on service length, and no validation that contractual notice meets the statutory minimum.
- **Risk Level**: MEDIUM
- **Remediation**: Add statutory notice period calculation function and validate contractual notice >= statutory minimum.

---

## 10. Pension Auto-Enrolment

### 10.1 Qualifying Criteria and Auto-Enrolment

- **Requirement**: Employers must automatically enrol eligible jobholders (aged 22 to state pension age, earning above GBP 10,000/year) into a qualifying workplace pension scheme. Employer minimum contribution is 3% of qualifying earnings.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The benefits module (`migrations/0101_benefits_types.sql` through `0103_benefit_enrollments.sql`) includes a `retirement` benefit category, employee/employer contribution fields, and enrollment management. However, this is a generic benefits framework with no UK pension auto-enrolment specifics:
  - No automatic eligibility assessment (age, earnings threshold)
  - No automatic enrolment trigger
  - No opt-out window management (1 month from enrolment)
  - No opt-in handling for non-eligible workers
  - No qualifying earnings band calculation
  - No minimum contribution rate enforcement (currently 8% total: 5% employee + 3% employer)
  - No re-enrolment processing (every 3 years)
  - No postponement period tracking
  - No TPR (The Pensions Regulator) declaration of compliance
- **Risk Level**: CRITICAL
- **Remediation**:
  1. Build auto-enrolment assessment engine checking age and earnings thresholds
  2. Implement automatic enrolment with opt-out window tracking
  3. Add qualifying earnings band calculation and minimum contribution enforcement
  4. Build 3-yearly re-enrolment processing
  5. Add TPR reporting/declaration integration

---

## 11. HMRC Integration

### 11.1 PAYE Reporting / Real Time Information (RTI)

- **Requirement**: Employers must report employee pay and deductions to HMRC in real time (before or on payday) via Full Payment Submissions (FPS) and Employer Payment Summaries (EPS).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No PAYE, RTI, FPS, or EPS functionality found. No tax code storage or management (the field registry mentions `national_insurance_number` and `tax_id` as stored fields, but no processing logic exists). No HMRC API integration.
- **Risk Level**: CRITICAL (but typically handled by dedicated payroll software)
- **Remediation**: This is typically handled by specialist payroll software (Sage, Xero, etc.). Staffora should provide:
  1. Payroll data export interface (employee details, hours, absence, SSP/SMP/SPP entitlements)
  2. Tax code storage and management
  3. Integration API for payroll systems
  4. P45/P60 document storage (generated by payroll system)

### 11.2 P45/P60/P11D Generation

- **Requirement**: P45 on termination, P60 annually, P11D for benefits in kind.
- **Status**: NOT IMPLEMENTED
- **Evidence**: The documents module supports `tax_form` and `salary_slip` document types but no P45/P60/P11D generation logic exists.
- **Risk Level**: CRITICAL (but typically handled by payroll software)
- **Remediation**: Implement document storage/retrieval for payroll-generated tax documents; consider payroll integration for automatic import.

---

## 12. Health & Safety

### 12.1 Risk Assessments

- **Requirement**: Employers must conduct suitable and sufficient risk assessments (Management of Health and Safety at Work Regulations 1999). Specific assessments required for pregnant workers, young workers, and DSE users.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No risk assessment templates, tracking, or review scheduling found. The equipment module (`migrations/0108_equipment.sql`) tracks IT equipment but has no DSE assessment capability.
- **Risk Level**: MEDIUM (typically handled outside HRIS but increasingly digitised)
- **Remediation**: Add risk assessment module with templates for general workplace, DSE, new/expectant mothers, and young workers.

### 12.2 Accident Reporting (RIDDOR)

- **Requirement**: Certain workplace accidents, injuries, and dangerous occurrences must be reported to the HSE under RIDDOR 2013.
- **Status**: NOT IMPLEMENTED
- **Evidence**: No accident reporting, investigation tracking, or RIDDOR notification capability found.
- **Risk Level**: MEDIUM
- **Remediation**: Add incident/accident reporting module with RIDDOR category classification and HSE notification tracking.

### 12.3 Display Screen Equipment (DSE) Assessments

- **Requirement**: Employers must assess DSE workstations and ensure users take adequate breaks (Health and Safety (Display Screen Equipment) Regulations 1992).
- **Status**: NOT IMPLEMENTED
- **Evidence**: No DSE assessment forms or tracking found.
- **Risk Level**: LOW
- **Remediation**: Add DSE self-assessment questionnaire linked to employee records.

---

## Compliance Score Summary

| # | Area | Score (0-10) | Status | Risk |
|---|------|:---:|--------|------|
| 1 | Right to Work | 1 | Document fields exist, no workflow | CRITICAL |
| 2 | Holiday Entitlement | 5 | Good framework, no UK minimum enforcement | HIGH |
| 3 | Statutory Sick Pay | 0 | No SSP logic at all | CRITICAL |
| 4 | Family Leave | 0 | Leave categories exist, no statutory calculations | CRITICAL |
| 5 | Flexible Working | 0 | No request/response workflow | HIGH |
| 6 | Disciplinary & Grievance | 3 | Case management exists, no ACAS stages | HIGH |
| 7 | Data Protection (UK GDPR) | 4 | Strong security, no DSAR/retention/breach | HIGH |
| 8 | Equality & Diversity | 1 | Gender stored, no pay gap reporting | MEDIUM |
| 9 | Employment Contracts | 4 | Good contract data model, no statement generation | HIGH |
| 10 | Pension Auto-Enrolment | 0 | Generic benefits only, no UK pension logic | CRITICAL |
| 11 | HMRC Integration | 0 | No PAYE/RTI capability | CRITICAL |
| 12 | Health & Safety | 0 | No H&S module | MEDIUM |

**Weighted Compliance Score: 18/100**

---

## Prioritised Remediation Plan

### Phase 1: Critical Legal Obligations (0-3 months)

These items carry the highest legal risk (unlimited fines, criminal liability, employment tribunal exposure).

| Priority | Item | Effort | Risk if Unaddressed |
|----------|------|--------|---------------------|
| P1.1 | **Right to Work verification workflow** | 2-3 weeks | Unlimited fines, criminal prosecution |
| P1.2 | **Holiday minimum enforcement** (28-day validation) | 1 week | Employment tribunal claims |
| P1.3 | **SSP calculation engine** | 3-4 weeks | Payroll errors, tribunal claims |
| P1.4 | **Maternity/paternity leave & SMP/SPP** | 4-6 weeks | Discrimination claims, tribunal |
| P1.5 | **Pension auto-enrolment engine** | 4-6 weeks | TPR fines, criminal prosecution |
| P1.6 | **DSAR handling workflow** | 2 weeks | ICO enforcement, GBP 17.5M fines |

### Phase 2: High Priority Compliance (3-6 months)

| Priority | Item | Effort | Risk if Unaddressed |
|----------|------|--------|---------------------|
| P2.1 | **Disciplinary/grievance ACAS workflow** | 3-4 weeks | 25% tribunal award uplift |
| P2.2 | **Flexible working request system** | 2 weeks | Tribunal claims (day-one right) |
| P2.3 | **Data retention & erasure** | 3 weeks | ICO enforcement |
| P2.4 | **Contract statement generation** | 2-3 weeks | Compensation at tribunal |
| P2.5 | **Gender pay gap reporting** | 2 weeks | Publication deadline breach |
| P2.6 | **Shared parental leave** | 3-4 weeks | Discrimination claims |
| P2.7 | **Data breach notification** | 2 weeks | ICO fines |
| P2.8 | **Payroll integration API** | 3-4 weeks | RTI compliance failure |

### Phase 3: Medium Priority Enhancement (6-12 months)

| Priority | Item | Effort | Risk if Unaddressed |
|----------|------|--------|---------------------|
| P3.1 | **Parental bereavement leave** | 1 week | Tribunal claims |
| P3.2 | **Unpaid parental leave tracking** | 1-2 weeks | Low risk |
| P3.3 | **Holiday pay 52-week calculation** | 2-3 weeks | Underpayment claims |
| P3.4 | **Bank holiday treatment config** | 1 week | Entitlement disputes |
| P3.5 | **Carryover rules (EU/additional split)** | 2 weeks | Balance disputes |
| P3.6 | **Diversity monitoring** | 2 weeks | Reporting gaps |
| P3.7 | **Reasonable adjustments tracking** | 1-2 weeks | Discrimination risk |
| P3.8 | **Notice period statutory minimum** | 1 week | Termination disputes |
| P3.9 | **Health & safety module** | 3-4 weeks | HSE enforcement |
| P3.10 | **Privacy notice management** | 1-2 weeks | ICO compliance |

---

## Key Files Referenced in This Audit

### Migrations (Database Schema)
- `migrations/0010_audit_log.sql` -- Immutable audit trail
- `migrations/0013_hr_enums.sql` -- Employee status, contract/employment types, gender, identifiers
- `migrations/0017_employees.sql` -- Core employee records with state machine
- `migrations/0018_employee_personal.sql` -- Personal data (name, DOB, gender, nationality)
- `migrations/0021_employee_identifiers.sql` -- ID documents with expiry tracking
- `migrations/0022_employment_contracts.sql` -- Contracts with effective dating, notice periods
- `migrations/0025_compensation_history.sql` -- Salary history with change tracking
- `migrations/0046_absence_enums.sql` -- Leave categories including parental, sick, bereavement
- `migrations/0047_leave_types.sql` -- Leave type definitions with configurable rules
- `migrations/0048_leave_policies.sql` -- Leave entitlement policies with country/employment type scoping
- `migrations/0049_leave_accrual_rules.sql` -- Accrual engine with tenure bonuses
- `migrations/0050_leave_balances.sql` -- Balance tracking with computed columns
- `migrations/0052_leave_requests.sql` -- Leave request workflow with half-day support
- `migrations/0054_public_holidays.sql` -- Bank holiday calendars by country/region
- `migrations/0076_case_enums.sql` -- Case management types including escalation
- `migrations/0078_cases.sql` -- HR case records with SLA tracking
- `migrations/0083_documents.sql` -- Document management with types (contract, tax_form, etc.)
- `migrations/0100_documents_enhanced.sql` -- Document versioning, access logs, work_permit type
- `migrations/0101_benefits_types.sql` -- Benefits enums (retirement category, life events)
- `migrations/0102_benefit_plans.sql` -- Benefit plan definitions with contributions
- `migrations/0111_analytics.sql` -- Reporting infrastructure
- `migrations/0115_field_registry.sql` -- Field-level access control definitions
- `migrations/0117_role_field_permissions.sql` -- Role-based field permissions
- `migrations/0120_seed_field_registry.sql` -- Sensitive field definitions (NI number, bank details, work permit)

### Application Code
- `packages/api/src/modules/absence/service.ts` -- Leave management service
- `packages/api/src/modules/absence/repository.ts` -- Leave data access
- `packages/api/src/modules/cases/service.ts` -- Case management with state machine
- `packages/api/src/modules/benefits/service.ts` -- Benefits enrollment service
- `packages/api/src/modules/documents/service.ts` -- Document management service
- `packages/api/src/modules/hr/service.ts` -- Core HR operations
- `packages/api/src/modules/hr/repository.ts` -- HR data access
- `packages/api/src/plugins/security-headers.ts` -- Security headers (CSP, HSTS, X-Frame-Options)
- `packages/api/src/plugins/audit.ts` -- Audit logging plugin
- `packages/api/src/plugins/rbac.ts` -- Role-based access control
- `packages/api/src/modules/security/field-permission.service.ts` -- Field-level permissions
- `packages/api/src/worker/scheduler.ts` -- Background job scheduler
- `packages/api/src/jobs/notification-worker.ts` -- Notification processing

### Shared Types
- `packages/shared/src/types/absence.ts` -- Leave type definitions with carryover, accrual
- `packages/shared/src/types/hr.ts` -- Employee, contract, compensation types
- `packages/shared/src/types/cases.ts` -- Case type definitions (includes `grievance`)
- `packages/shared/src/types/analytics.ts` -- Reporting types

### Frontend
- `packages/web/app/routes/(admin)/settings/index.tsx` -- Settings (Data Management marked unavailable)
- `packages/web/app/routes/(admin)/leave/` -- Leave management UI
- `packages/web/app/routes/(admin)/cases/route.tsx` -- Case management UI
- `packages/web/app/routes/(admin)/benefits/` -- Benefits management UI

---

## Disclaimer

This audit examines the codebase for evidence of UK employment law compliance features. It does not constitute legal advice. Organisations should consult employment law specialists and The Pensions Regulator, HMRC, and the ICO guidance for definitive compliance requirements. HRIS software is one component of compliance; policies, procedures, and training are equally important.

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with all scores
- [UK Compliance Report](../compliance/uk-hr-compliance-report.md) — UK compliance remediation status
- [Sprint Plan Phase 3](../project-management/sprint-plan-phase3.md) — UK compliance feature sprints
- [Master Requirements](../project-analysis/master_requirements.md) — UK statutory requirements
- [Implementation Status](../project-analysis/implementation_status.md) — Compliance feature completion
- [State Machines](../patterns/STATE_MACHINES.md) — Employee and leave lifecycle workflows
