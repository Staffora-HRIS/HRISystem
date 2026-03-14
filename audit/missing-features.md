# Missing Features Report -- Staffora HRIS Platform

**Generated:** 2026-03-13
**Source Reports:**
- `audit/feature-validation-report.md` (603-item validation)
- `audit/hr-enterprise-checklist.md` (603-item enterprise benchmark)
- `audit/uk-compliance-audit.md` (12 UK employment law areas, score 18/100)
- `audit/code-scan-findings.md` (108 code-level findings)

**Scope:** All NOT IMPLEMENTED and PARTIALLY IMPLEMENTED features from the 603-item enterprise checklist, cross-referenced with UK compliance gaps and code-level findings.

---

## Executive Summary

| Metric | Count | % |
|--------|-------|---|
| **Total features assessed** | **603** | 100% |
| **IMPLEMENTED** | **189** | 31.3% |
| **PARTIALLY IMPLEMENTED** | **108** | 17.9% |
| **NOT IMPLEMENTED** | **306** | 50.7% |

**414 features require work** (306 not implemented + 108 partial). This document catalogues every gap, organised by priority grouping, with feature IDs, dependencies, and effort estimates.

### Priority Breakdown of Missing Features

| Priority | Not Implemented | Partial | Total Gaps |
|----------|-----------------|---------|------------|
| CRITICAL | 49 | 22 | 71 |
| HIGH | 160 | 65 | 225 |
| MEDIUM | 72 | 18 | 90 |
| LOW | 25 | 3 | 28 |

### Biggest Gap Areas (by % unimplemented)

| Module | Coverage | Gap |
|--------|----------|-----|
| Compensation & Payroll | 22.7% | 77.3% |
| UK Employment Compliance | 42.9% | 57.1% |
| Absence & Leave Management | 46.9% | 53.1% |
| Contracts & Employment Terms | 53.3% | 46.7% |
| Reporting & Analytics | 58.3% | 41.7% |
| Mobile & Accessibility | 56.3% | 43.7% |

---

## Group 1: UK Compliance Features (Legally Required)

These features carry statutory obligations under UK employment law. Non-compliance risks unlimited fines, criminal prosecution, ICO enforcement, or employment tribunal awards.

---

### 1.1 Right to Work Compliance

#### RTW -- Right to Work Verification (CET-017, CET-018, UKC-009)
- **Status:** IMPLEMENTED
- **Module:** Right to Work (`packages/api/src/modules/right-to-work/`)
- **Notes:** Full RTW module was recently built with check types, compliance dashboard, expiry tracking. This is now complete.

#### RTW -- Visa and Immigration Status Tracking (CET-019)
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Sponsor licence compliance; prevent illegal working.
- **What Exists:** RTW module tracks document expiry and follow-up dates.
- **What's Missing:** Specific visa type tracking, sponsor details, Certificate of Sponsorship (CoS) management, work restriction recording.
- **Effort:** 1-2 weeks
- **Dependencies:** RTW module (exists)

---

### 1.2 Statutory Sick Pay (SSP)

#### SSP -- SSP Administration (UKC-010, ALM-014, ALM-015)
- **Status:** IMPLEMENTED
- **Module:** SSP (`packages/api/src/modules/ssp/`)
- **Notes:** Full SSP module with qualification checking, daily log, PIW management, 28-week limit, waiting days, LEL test.

#### SSP -- Fit Note Management (ALM-013)
- **ID:** ALM-013
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** SSP compliance requires fit note tracking after 7-day self-certification period. Statement of Fitness for Work is a statutory document.
- **What Exists:** Sick leave can be recorded via leave requests.
- **What's Missing:** Fit note data model (GP name, conditions, "may be fit" adjustments, duration), 7-day self-certification threshold trigger, scanned document storage.
- **Effort:** 1-2 weeks
- **Dependencies:** SSP module (exists), documents module (exists)

#### SSP -- Self-Certification Period Tracking (ALM-012)
- **ID:** ALM-012
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Legal threshold -- employees self-certify for first 7 calendar days; fit note required thereafter.
- **What Exists:** Sick leave recording via leave types.
- **What's Missing:** Automatic notification at day 7 requiring fit note upload, self-certification form, integration with absence recording.
- **Effort:** 1 week
- **Dependencies:** ALM-013 (Fit Note Management)

#### SSP -- Occupational Sick Pay Scheme (ALM-016)
- **ID:** ALM-016
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Most employers offer enhanced sick pay above SSP; needs service-based tiering.
- **What Exists:** SSP module calculates statutory rate.
- **What's Missing:** Configurable company sick pay tiers (e.g., 0-1yr: 4 weeks full / 4 weeks half), deduction of SSP from company pay.
- **Effort:** 2 weeks
- **Dependencies:** SSP module, service length calculation

#### SSP -- Return-to-Work Interview Tracking (ALM-017)
- **ID:** ALM-017
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Duty of care, attendance management, legal compliance best practice.
- **What Exists:** Nothing.
- **What's Missing:** RTW interview form (date, interviewer, outcome, adjustments, OH referral, follow-up), integration with absence record.
- **Effort:** 1 week
- **Dependencies:** Absence module

#### SSP -- Long-Term Sickness Management (ALM-042)
- **ID:** ALM-042
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Duty of care for long-term sick employees; capability process integration.
- **What Exists:** SSP module tracks 28-week periods.
- **What's Missing:** OH referral triggers, welfare meeting scheduling, reasonable adjustments workflow, capability process integration, ill-health retirement pathway.
- **Effort:** 3-4 weeks
- **Dependencies:** SSP module, case management, OH referral tracking (ALM-043)

#### SSP -- Occupational Health Referral Tracking (ALM-043)
- **ID:** ALM-043
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Medical evidence management, reasonable adjustments, duty of care.
- **What Exists:** Nothing.
- **What's Missing:** OH referral model (reason, appointment date, report received, recommendations, follow-up actions).
- **Effort:** 1-2 weeks
- **Dependencies:** Case management module

---

### 1.3 Statutory Family Leave & Pay

#### SFL -- Statutory Maternity Leave & SMP (UKC-011, ALM-020, ALM-021)
- **Status:** IMPLEMENTED / PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Module:** Statutory Leave (`packages/api/src/modules/statutory-leave/`)
- **What Exists:** Statutory leave module covers maternity: EWC, MATB1, intended start, actual dates, return date, KIT days. Pay calculation endpoint exists.
- **What's Missing:** Full SMP qualification verification (26 weeks continuous service + LEL test), rate calculation complexity (90% AWE for 6 weeks, then statutory rate or 90% whichever lower for 33 weeks), HMRC SMP recovery tracking.
- **Effort:** 2-3 weeks (to complete pay calculation)
- **Dependencies:** Compensation history, earnings calculation

#### SFL -- Enhanced Maternity Pay (ALM-022)
- **ID:** ALM-022
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Company-enhanced maternity pay above SMP; common employer benefit with clawback rules.
- **What Exists:** Statutory leave module for maternity.
- **What's Missing:** Enhanced pay tiers, clawback conditions if employee doesn't return for minimum period.
- **Effort:** 1-2 weeks
- **Dependencies:** Statutory leave module, compensation

#### SFL -- Maternity KIT Days Pay (ALM-023)
- **ID:** ALM-023
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** 10 Keeping in Touch days are a statutory entitlement; pay calculation needed.
- **What Exists:** KIT days tracked in statutory leave module.
- **What's Missing:** Pay calculation for KIT days.
- **Effort:** 1 week
- **Dependencies:** Statutory leave module

#### SFL -- Paternity Leave & SPP (UKC-011, ALM-024, ALM-025)
- **Status:** IMPLEMENTED / PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **What Exists:** Statutory leave module covers paternity leave type. Pay calculation endpoint exists.
- **What's Missing:** Full SPP rate logic (statutory flat rate or 90% AWE, whichever lower), timing constraints (within 52 weeks of birth), flexible block booking (post-April 2024).
- **Effort:** 1-2 weeks
- **Dependencies:** Statutory leave module

#### SFL -- Adoption Leave & SAP (ALM-026)
- **ID:** ALM-026
- **Status:** IMPLEMENTED
- **Priority:** HIGH
- **Notes:** Statutory leave module includes adoption leave type.

#### SFL -- Shared Parental Leave & ShPP (ALM-027, ALM-028)
- **Status:** IMPLEMENTED / PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **What Exists:** Statutory leave module includes shared_parental leave type. Pay calculation endpoint exists.
- **What's Missing:** Remaining entitlement calculation from SMP/SAP/SPP, curtailment notice tracking, partner employer declarations, continuous vs discontinuous booking.
- **Effort:** 2-3 weeks
- **Dependencies:** Statutory leave module

#### SFL -- Parental Bereavement Leave & SPBP (ALM-029)
- **ID:** ALM-029
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Parental Bereavement (Leave and Pay) Act 2018 ("Jack's Law") -- 2 weeks statutory leave with SPBP.
- **What Exists:** Leave type category `bereavement` exists but no specific parental bereavement entitlement.
- **What's Missing:** Statutory 2-week entitlement, SPBP calculation, flexible 56-week booking window from date of death, per-child eligibility.
- **Effort:** 1-2 weeks
- **Dependencies:** Statutory leave module, absence module

#### SFL -- Neonatal Care Leave (ALM-031)
- **ID:** ALM-031
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Neonatal Care (Leave and Pay) Act 2023 -- up to 12 weeks for parents of babies receiving neonatal care (7+ consecutive days).
- **What Exists:** Nothing.
- **What's Missing:** Neonatal care leave type, 12-week entitlement, 7-day qualifying period, statutory neonatal care pay calculation.
- **Effort:** 1-2 weeks
- **Dependencies:** Statutory leave module

#### SFL -- Carer's Leave (ALM-032)
- **ID:** ALM-032
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Carer's Leave Act 2023 -- 1 week unpaid carer's leave per year, day-one right, flexible half/full day booking.
- **What Exists:** Nothing.
- **What's Missing:** Carer's leave type, 1-week annual entitlement, half-day booking support, day-one eligibility.
- **Effort:** 1 week
- **Dependencies:** Absence module

#### SFL -- Unpaid Parental Leave (ALM-030)
- **ID:** ALM-030
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** 18 weeks per child (up to age 18), blocks of 1 week minimum, max 4 weeks per year per child.
- **What Exists:** Leave type category `unpaid` exists.
- **What's Missing:** Per-child tracking, weekly block enforcement, 4-week annual cap per child, age-18 expiry.
- **Effort:** 1-2 weeks
- **Dependencies:** Dependant recording (EPD-008)

---

### 1.4 Holiday Entitlement (Working Time Regulations 1998)

#### HOL -- Statutory Minimum Enforcement (ALM-001)
- **ID:** ALM-001
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** All UK workers are entitled to 5.6 weeks (28 days) paid annual leave. No employer can go below this.
- **What Exists:** Leave types, policies, balances, ledger, accrual rules, policy matching by country/employment type.
- **What's Missing:** Validation that `default_balance >= 28` for UK workers; compliance check function; warning when creating sub-statutory policies.
- **Effort:** 1 week
- **Dependencies:** None

#### HOL -- Pro-Rata Holiday Calculation (ALM-002)
- **ID:** ALM-002
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Part-time workers receive proportional entitlement; Part-Time Workers Regulations compliance.
- **What Exists:** FTE and working hours recorded in contracts; pro-rate on hire function exists.
- **What's Missing:** Automatic statutory minimum calculation `Math.min(5.6 * days_per_week, 28)` linked to contracted working pattern.
- **Effort:** 1 week
- **Dependencies:** Contract working hours

#### HOL -- Holiday Pay Calculation (ALM -- related, CPY-037)
- **ID:** CPY-037
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Holiday pay must be based on normal remuneration using 52-week reference period (Employment Rights Act 1996, amended April 2020). Includes regular overtime, commission, bonuses. Harpur Trust v Brazel case law.
- **What Exists:** Compensation history stores base salary; leave_types has `is_paid` boolean.
- **What's Missing:** 52-week reference period calculation engine aggregating base pay, regular overtime, commission, and allowances.
- **Effort:** 2-3 weeks
- **Dependencies:** Payroll data integration

#### HOL -- Holiday Carry-Over Rules (ALM-004)
- **ID:** ALM-004
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** EU-derived 4 weeks cannot be lost if untaken due to sickness/maternity; additional 1.6 weeks can have employer carry-over rules.
- **What Exists:** Leave policies have `max_carryover` and `carryover_expiry_months` fields; balance transaction type includes `carryover` and `forfeited`.
- **What's Missing:** Two-tier statutory entitlement split (4 weeks EU + 1.6 weeks additional) with different carry-over rules; automatic carryover for sickness/maternity-related untaken leave.
- **Effort:** 2 weeks
- **Dependencies:** ALM-001

#### HOL -- Bank Holiday Handling (ALM-010)
- **ID:** ALM-010
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Clear, consistent treatment of bank holidays -- included in or additional to the 28-day entitlement.
- **What Exists:** Public holidays table with country/region support, used in leave duration calculations.
- **What's Missing:** Tenant/policy-level setting for bank holiday treatment (included/additional), per-employee-group configuration (shift workers vs office).
- **Effort:** 1 week
- **Dependencies:** ALM-001

#### HOL -- Holiday Year Configuration (ALM-003)
- **ID:** ALM-003
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Holiday year can be calendar year, April-March, or anniversary-based. Must be configurable.
- **What Exists:** Leave policies with configurable parameters.
- **What's Missing:** Explicit holiday year start date configuration per tenant/entity.
- **Effort:** 1 week
- **Dependencies:** None

---

### 1.5 Working Time Regulations Compliance

#### WTR -- 48-Hour Weekly Limit Monitoring (UKC-013, TAT-015)
- **ID:** UKC-013 / TAT-015
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Employer criminal liability under WTR 1998 for failing to ensure 48-hour limit using 17-week rolling reference period.
- **What Exists:** Time events and timesheet tracking.
- **What's Missing:** Rolling 17-week reference period calculation, automated alerts when approaching limit, dashboard monitoring.
- **Effort:** 2-3 weeks
- **Dependencies:** Time & Attendance module

#### WTR -- Opt-Out Management (TAT-016)
- **ID:** TAT-016
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Individual opt-out must be voluntary, in writing, with 7-day minimum withdrawal notice.
- **What Exists:** Nothing.
- **What's Missing:** Opt-out agreement recording, withdrawal handling, consent evidence storage.
- **Effort:** 1 week
- **Dependencies:** UKC-013

#### WTR -- Night Worker Identification and Limits (TAT-017)
- **ID:** TAT-017
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Night workers (regularly work 3+ hours during night period) subject to 8-hour average limit and health assessment triggers.
- **What Exists:** Shift management exists.
- **What's Missing:** Night worker identification logic, 8-hour average limit tracking, health assessment scheduling.
- **Effort:** 2 weeks
- **Dependencies:** TAT-010 (shift management)

#### WTR -- Daily and Weekly Rest Period Tracking (TAT-018)
- **ID:** TAT-018
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** 11-hour daily rest between shifts, 24-hour weekly rest (or 48-hour fortnightly). WTR compliance.
- **What Exists:** Time events with clock in/out.
- **What's Missing:** Automated rest period monitoring, violation alerts.
- **Effort:** 2 weeks
- **Dependencies:** Time events module

#### WTR -- Break Time Enforcement (TAT-014)
- **ID:** TAT-014
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** WTR requires 20-minute break per 6-hour shift minimum.
- **What Exists:** Break start/end time events.
- **What's Missing:** Enforcement logic (20 min per 6-hour shift), alerts for missed breaks.
- **Effort:** 1 week
- **Dependencies:** Time events module

---

### 1.6 UK GDPR / Data Protection Act 2018

#### GDPR -- DSAR Processing (UKC-002)
- **ID:** UKC-002
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR Article 15 -- employees have right to copies of personal data. 1 calendar month deadline (extendable by 2 months). ICO fines up to GBP 17.5M for non-compliance.
- **What Exists:** Case management could be adapted; comprehensive employee data across many tables.
- **What's Missing:** DSAR request workflow with deadline tracking, data compilation function across all tables, identity verification step, redaction tooling for third-party data, response delivery.
- **Effort:** 2-3 weeks
- **Dependencies:** None

#### GDPR -- Right to Erasure (UKC-003)
- **ID:** UKC-003
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR Article 17 -- right to be forgotten with legitimate exceptions for legal obligations.
- **What Exists:** Nothing.
- **What's Missing:** Erasure request workflow, legal hold checks, partial erasure (retain tax records for 6 years), anonymisation functions, confirmation notification.
- **Effort:** 2-3 weeks
- **Dependencies:** UKC-005 (data retention policy)

#### GDPR -- Data Retention Policy Configuration (UKC-005, EPD-025)
- **ID:** UKC-005 / EPD-025
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR data minimisation principle. HMRC requires 6 years post-termination for payroll records. Settings UI has "Data Management" marked as unavailable.
- **What Exists:** Settings page shows "Data Management" section with `available: false`.
- **What's Missing:** Configurable retention periods per data category, auto-flag for deletion, automated retention enforcement in scheduler, anonymisation function for expired data.
- **Effort:** 3 weeks
- **Dependencies:** Scheduler (exists)

#### GDPR -- Data Breach Notification (UKC-006)
- **ID:** UKC-006
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR Articles 33-34 -- breaches must be reported to ICO within 72 hours if high risk. Late notification carries penalties.
- **What Exists:** Nothing.
- **What's Missing:** Breach incident tracking, 72-hour countdown timer, affected data scope assessment, ICO notification template, individual notification workflow, remediation tracking.
- **Effort:** 2 weeks
- **Dependencies:** Notification worker (exists)

#### GDPR -- Privacy Notice Management (UKC-007)
- **ID:** UKC-007
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR Articles 13-14 transparency obligation -- employees must receive privacy notices.
- **What Exists:** Marketing website privacy page (for visitors, not employees).
- **What's Missing:** Employee privacy notice system, version control, distribution, acknowledgement tracking, consent recording for optional processing.
- **Effort:** 1-2 weeks
- **Dependencies:** Document management module

#### GDPR -- UK GDPR Compliance Framework (UKC-001)
- **ID:** UKC-001
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Comprehensive data protection framework including lawful basis recording, data mapping, DPIAs.
- **What Exists:** Strong technical measures (RLS, audit logging, field-level permissions, security headers, session management, sensitive field marking).
- **What's Missing:** Lawful basis recording per processing activity, data mapping, DPIA templates and tracking.
- **Effort:** 2-3 weeks
- **Dependencies:** None

#### GDPR -- Employee Consent Management (EPD-024)
- **ID:** EPD-024
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR lawful basis documentation -- granular opt-in/opt-out, withdrawal recording, re-consent workflows.
- **What Exists:** Nothing.
- **What's Missing:** Consent tracking per processing purpose, opt-in/opt-out management, withdrawal recording, re-consent workflow.
- **Effort:** 2 weeks
- **Dependencies:** UKC-001

#### GDPR -- Records of Processing Activities (UKC-028)
- **ID:** UKC-028
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** UK GDPR Article 30 -- mandatory register of processing activities for ICO inspection.
- **What Exists:** Nothing.
- **What's Missing:** Article 30 register with purpose, lawful basis, retention period, recipients per processing activity.
- **Effort:** 1-2 weeks
- **Dependencies:** UKC-001

#### GDPR -- Data Portability (UKC-004)
- **ID:** UKC-004
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** UK GDPR Article 20 -- structured, machine-readable export of personal data on request.
- **What Exists:** Export worker generates CSV/Excel for reports.
- **What's Missing:** Per-employee data export in structured format (JSON/CSV) covering all personal data across tables.
- **Effort:** 1-2 weeks
- **Dependencies:** UKC-002 (DSAR, similar compilation logic)

---

### 1.7 Pension Auto-Enrolment

#### PEN -- Auto-Enrolment Compliance (UKC-014, CPY-030)
- **ID:** UKC-014 / CPY-030
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Pensions Act 2008 -- employers must auto-enrol eligible jobholders. TPR enforcement includes fixed and escalating penalties, criminal prosecution.
- **What Exists:** Benefits module has `retirement` category, employee/employer contribution fields, enrollment management.
- **What's Missing:** Automatic eligibility assessment (age 22 to SPA, earnings above GBP 10,000/year), automatic enrolment trigger, opt-out window management (1 month), minimum contribution enforcement (8% total: 5% employee + 3% employer), qualifying earnings band calculation.
- **Effort:** 4-6 weeks
- **Dependencies:** Benefits module, compensation data

#### PEN -- Pension Contribution Calculation (CPY-031)
- **ID:** CPY-031
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Accurate employer and employee pension contributions at correct rates for qualifying earnings or total pay basis.
- **What Exists:** Benefits enrollment has contribution fields.
- **What's Missing:** Qualifying earnings band calculation, contribution rate application, salary sacrifice impact.
- **Effort:** 2-3 weeks
- **Dependencies:** UKC-014

#### PEN -- Pension Scheme Management (CPY-032, BEN-005, BEN-006, BEN-007)
- **ID:** CPY-032 / BEN-005 / BEN-006 / BEN-007
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Support DC, DB, master trust, NEST schemes with provider details and contribution rules.
- **What Exists:** Generic benefits plans.
- **What's Missing:** Pension-specific scheme model, provider integration details, scheme type classification.
- **Effort:** 2-3 weeks
- **Dependencies:** UKC-014

#### PEN -- Pension Opt-Out Management (CPY-033, BEN-008)
- **ID:** BEN-008
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Process opt-out within 1-month window with contribution refund flagging and re-enrolment scheduling (every 3 years).
- **What Exists:** Nothing.
- **What's Missing:** Opt-out notice processing, refund flagging, 3-year re-enrolment scheduling, TPR declaration of compliance.
- **Effort:** 2 weeks
- **Dependencies:** UKC-014

---

### 1.8 National Minimum Wage

#### NMW -- NMW Compliance Checking (UKC-012, CPY-014)
- **ID:** UKC-012 / CPY-014
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** National Minimum Wage Act 1998 -- employers face naming, fines, and prosecution for underpayment. Must validate against age-based bands.
- **What Exists:** Compensation history stores base salary; DOB available for age calculation.
- **What's Missing:** NMW/NLW rate table by age band, validation of pay rates against current thresholds, auto-update alerts on threshold changes.
- **Effort:** 1-2 weeks
- **Dependencies:** Compensation module

#### NMW -- Age Band Rate Tracking (CPY-015)
- **ID:** CPY-015
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Auto-update applicable NMW rate when employee crosses age threshold (18, 21, 23). Flag underpayment risk.
- **What Exists:** Employee DOB available.
- **What's Missing:** Age threshold monitoring, automatic rate review trigger on birthday.
- **Effort:** 1 week
- **Dependencies:** UKC-012

---

### 1.9 Gender Pay Gap Reporting

#### GPG -- Gender Pay Gap Statutory Reporting (UKC-008, CPY-035)
- **ID:** UKC-008 / CPY-035
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Equality Act 2010 (Gender Pay Gap Information) Regulations 2017 -- organisations with 250+ employees must publish annually. Six statutory metrics required.
- **What Exists:** Compensation history stores salary; employee_personal stores gender; analytics module has report definitions.
- **What's Missing:** Mean/median hourly pay gap calculation, mean/median bonus gap calculation, proportion receiving bonus by gender, quartile distribution, snapshot date configuration, year-on-year comparison.
- **Effort:** 2-3 weeks
- **Dependencies:** Compensation data, employee gender data

---

### 1.10 Employment Contracts -- Statutory Requirements

#### CON -- Section 1 Statement Compliance (CET-007)
- **ID:** CET-007
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Employment Rights Act 1996 s.1 -- all employees and workers must receive written statement of terms on or before day one (post-April 2020). Tribunal compensation for non-compliance.
- **What Exists:** Employment contracts table stores key terms; documents module can generate contracts.
- **What's Missing:** Statutory required fields validation checklist, auto-generation of written statement from employee/contract/compensation data, day-one statement trigger on hire, acknowledgement tracking.
- **Effort:** 2-3 weeks
- **Dependencies:** Contract data, document templates

#### CON -- Statutory Notice Period Calculation (CET-011)
- **ID:** CET-011
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** 1 week per year of service up to 12 weeks -- statutory minimum that cannot be undercut by contract.
- **What Exists:** `notice_period_days` field in contract.
- **What's Missing:** Automatic statutory minimum calculation based on service length, validation that contractual notice >= statutory.
- **Effort:** 1 week
- **Dependencies:** Service length calculation

#### CON -- Fixed-Term Contract End Date Tracking (CET-003)
- **ID:** CET-003
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Fixed-Term Employees Regulations -- 4+ years continuous service triggers automatic permanent status.
- **What Exists:** `probation_end_date` exists but no specific fixed-term end date.
- **What's Missing:** Specific fixed-term end date field, 4-year continuous service alert, renewal history.
- **Effort:** 1-2 weeks
- **Dependencies:** None

---

### 1.11 Disciplinary & Grievance (ACAS Code)

#### DG -- ACAS Code of Practice Workflow (CAS-002, CAS-003, CAS-009, CAS-010)
- **IDs:** CAS-002, CAS-003, CAS-009, CAS-010
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Employment tribunals can increase awards by up to 25% for unreasonable failure to follow ACAS Code. Investigation -> hearing -> outcome -> appeal stages.
- **What Exists:** Case management module with state machine (open, in_progress, resolved, closed, escalated, reopened), SLA tracking, comments, attachments.
- **What's Missing:** ACAS-compliant workflow stages, hearing scheduling, right to be accompanied tracking (CAS-006), structured investigation lifecycle, warning register with expiry (CAS-008), appeal process with different decision maker, outcome recording (CAS-007), sanction types (verbal, written, final, dismissal).
- **Effort:** 4-6 weeks (complete disciplinary/grievance overhaul)
- **Dependencies:** Case management module (exists)

#### DG -- Suspension Management (CAS-004)
- **ID:** CAS-004
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Precautionary suspension with pay, review dates, conditions/restrictions.
- **What Exists:** Nothing.
- **What's Missing:** Suspension data model (start date, review dates, pay status, conditions), link to case.
- **Effort:** 1 week
- **Dependencies:** Case management

#### DG -- Warning Management with Expiry (CAS-008)
- **ID:** CAS-008
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Track active warnings with type, issue date, expiry date, conditions, auto-expiry notification. Progressive discipline.
- **What Exists:** Nothing.
- **What's Missing:** Warning register table, warning types (verbal, written, final written), auto-expiry logic, active warning count.
- **Effort:** 1-2 weeks
- **Dependencies:** CAS-002 (ACAS workflow)

#### DG -- Settlement Agreement Tracking (CAS-018)
- **ID:** CAS-018
- **Status:** NOT IMPLEMENTED
- **Priority:** MEDIUM
- **Business Value:** Track protected conversations (s.111A), settlement terms, payments, confidentiality.
- **What Exists:** Nothing.
- **What's Missing:** Settlement agreement model, adviser certificate tracking, payment tracking.
- **Effort:** 1-2 weeks
- **Dependencies:** Case management

#### DG -- Employment Tribunal Preparation (CAS-019)
- **ID:** CAS-019
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** ET1/ET3 tracking, hearing dates, bundle assembly, ACAS early conciliation.
- **What Exists:** Case documents and timeline.
- **What's Missing:** Tribunal case tracking (UKC-019), bundle assembly feature (DOC-014), deadline management.
- **Effort:** 2-3 weeks
- **Dependencies:** Case management, document management

---

### 1.12 Flexible Working

#### FW -- Flexible Working Request Compliance (UKC-025, CET-015)
- **ID:** UKC-025 / CET-015
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Day-one right post-April 2024 (Employment Relations (Flexible Working) Act 2023). 2-month decision deadline. 2 requests per 12 months. 8 statutory grounds for refusal.
- **What Exists:** Nothing.
- **What's Missing:** Request form/workflow, 2-month response deadline tracking, request count per rolling 12 months, statutory refusal grounds recording, appeal process.
- **Effort:** 2-3 weeks
- **Dependencies:** Workflow engine (exists)

---

### 1.13 Health & Safety

#### HS -- Health and Safety Compliance Tracking (UKC-016)
- **ID:** UKC-016
- **Status:** NOT IMPLEMENTED
- **Priority:** CRITICAL
- **Business Value:** Health and Safety at Work Act 1974, Management of Health and Safety at Work Regulations 1999. Employer criminal liability.
- **What Exists:** Nothing.
- **What's Missing:** Risk assessment module (general workplace, DSE, new/expectant mothers, young workers), H&S training tracking, first aider and fire warden registers.
- **Effort:** 3-4 weeks
- **Dependencies:** LMS module (for training tracking)

#### HS -- RIDDOR Reporting (UKC-017)
- **ID:** UKC-017
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** RIDDOR 2013 -- certain workplace accidents, injuries, and dangerous occurrences must be reported to HSE.
- **What Exists:** Nothing.
- **What's Missing:** Incident/accident reporting module, RIDDOR category classification, HSE notification tracking, investigation workflow.
- **Effort:** 2-3 weeks
- **Dependencies:** UKC-016

---

### 1.14 Equality & Diversity

#### EQ -- Equality Act Protected Characteristics (UKC-015, EPD-013, EPD-014)
- **IDs:** UKC-015, EPD-013, EPD-014
- **Status:** PARTIALLY IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Equality Act 2010 -- only 2 of 9 protected characteristics tracked (gender, nationality). Organisations with 250+ employees must report gender pay gap.
- **What Exists:** Gender (male/female/other/prefer_not_to_say) and nationality in employee_personal.
- **What's Missing:** Ethnicity, disability status, religion/belief, sexual orientation, age band reporting (7 of 9 characteristics). Anonymous aggregate reporting. Reasonable adjustments tracking. All should be strictly voluntary with explicit consent.
- **Effort:** 2-3 weeks
- **Dependencies:** EPD-024 (consent management)

---

### 1.15 Other UK Compliance

#### OUK -- Agency Workers Regulations (UKC-020, CET-024)
- **ID:** UKC-020 / CET-024
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** AWR 2010 -- 12-week qualifying period then comparable terms obligation.
- **What Exists:** Nothing.
- **What's Missing:** Agency worker tracking, 12-week qualifying date calculation, comparable terms obligation from week 13.
- **Effort:** 2 weeks
- **Dependencies:** Contract module

#### OUK -- IR35 Off-Payroll Compliance (UKC-023, CET-025)
- **ID:** UKC-023 / CET-025
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Off-Payroll Working Rules (Finance Act 2017/2021) -- Status Determination Statement, right of appeal.
- **What Exists:** Nothing.
- **What's Missing:** IR35 determination workflow, Status Determination Statement generation, dispute resolution process, HMRC enquiry evidence.
- **Effort:** 2-3 weeks
- **Dependencies:** Contractor contract type (exists)

#### OUK -- DBS Management (UKC-018, REC-020)
- **ID:** UKC-018 / REC-020
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Safeguarding compliance, Rehabilitation of Offenders Act 1974. DBS checks required for regulated activities.
- **What Exists:** Nothing.
- **What's Missing:** DBS check types (basic, standard, enhanced, enhanced with barred list), application initiation, certificate receipt tracking, update service registration, rechecking schedules.
- **Effort:** 2-3 weeks
- **Dependencies:** Recruitment module

#### OUK -- Modern Slavery Compliance (UKC-024)
- **ID:** UKC-024
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Modern Slavery Act 2015 -- qualifying organisations must publish statement.
- **What Exists:** Nothing.
- **What's Missing:** Modern slavery statement tracking, supply chain due diligence, training records.
- **Effort:** 1 week
- **Dependencies:** None

#### OUK -- Whistleblowing Protection (UKC-027, CAS-011)
- **ID:** UKC-027 / CAS-011
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Public Interest Disclosure Act 1998 -- protect whistleblowers from detriment.
- **What Exists:** Case management with generic case types.
- **What's Missing:** Whistleblowing-specific confidentiality controls, independent investigation, detriment protection tracking, outcome recording.
- **Effort:** 2 weeks
- **Dependencies:** Case management module

#### OUK -- Trade Union and Facility Time (UKC-026)
- **ID:** UKC-026
- **Status:** NOT IMPLEMENTED
- **Priority:** MEDIUM
- **Business Value:** Trade Union Act 2016 -- public sector must report facility time percentage.
- **What Exists:** Nothing.
- **What's Missing:** Trade union recognition recording, facility time tracking for officials, reporting.
- **Effort:** 1-2 weeks
- **Dependencies:** None

#### OUK -- Fixed-Term Worker Regulations (UKC-021)
- **ID:** UKC-021
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Fixed-Term Employees Regulations 2002 -- comparable treatment, 4-year automatic permanence.
- **What Exists:** Contract type includes fixed_term.
- **What's Missing:** Comparator treatment monitoring, 4-year continuous service flagging.
- **Effort:** 1 week
- **Dependencies:** CET-003

#### OUK -- Part-Time Worker Regulations (UKC-022)
- **ID:** UKC-022
- **Status:** NOT IMPLEMENTED
- **Priority:** HIGH
- **Business Value:** Part-Time Workers Regulations 2000 -- pro-rata equal treatment for pay, benefits, training, career.
- **What Exists:** Employment type includes part_time; FTE calculated.
- **What's Missing:** Pro-rata treatment monitoring for pay, benefits, training, career opportunities.
- **Effort:** 1-2 weeks
- **Dependencies:** None

---

## Group 2: Core HR Features (Essential for Basic HRIS Operation)

These features are essential for an HRIS to function as a usable platform, even without UK-specific compliance.

---

### 2.1 Compensation & Payroll (Largest Gap -- 77.3% missing)

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| CPY-001 | Pay period configuration (weekly/monthly) | CRITICAL | NOT IMPL | 1-2 weeks | None |
| CPY-002 | Pay schedule assignment to employees | CRITICAL | NOT IMPL | 1 week | CPY-001 |
| CPY-005 | Salary band and range definition (midpoint, location) | CRITICAL | PARTIAL | 1-2 weeks | None |
| CPY-006 | Compa-ratio calculation | HIGH | NOT IMPL | 1 week | CPY-005 |
| CPY-007 | Annual pay review process | CRITICAL | NOT IMPL | 3-4 weeks | CPY-005 |
| CPY-008 | Pay review budget modelling | HIGH | NOT IMPL | 2-3 weeks | CPY-007 |
| CPY-009 | Pay element configuration (allowances, deductions) | HIGH | NOT IMPL | 2-3 weeks | None |
| CPY-010 | Recurring deduction management | HIGH | NOT IMPL | 1-2 weeks | CPY-009 |
| CPY-011 | One-off payment processing | HIGH | NOT IMPL | 1-2 weeks | CPY-009 |
| CPY-012 | Bonus scheme management | HIGH | NOT IMPL | 2-3 weeks | None |
| CPY-013 | Bonus calculation and processing | HIGH | NOT IMPL | 2-3 weeks | CPY-012, PER module |
| CPY-016 | Tax code management | CRITICAL | NOT IMPL | 1-2 weeks | None |
| CPY-017 | National Insurance category tracking | CRITICAL | NOT IMPL | 1-2 weeks | None |
| CPY-018 | Student loan deduction management | HIGH | NOT IMPL | 1 week | None |
| CPY-019 | Benefits in Kind recording | HIGH | NOT IMPL | 1-2 weeks | Benefits module |
| CPY-020 | P11D reporting | HIGH | NOT IMPL | 2 weeks | CPY-019 |
| CPY-021 | Payrolling of benefits | MEDIUM | NOT IMPL | 2 weeks | CPY-019 |
| CPY-022 | P45 generation on termination | CRITICAL | NOT IMPL | 2-3 weeks | PDF worker |
| CPY-023 | P60 annual generation | CRITICAL | NOT IMPL | 2 weeks | PDF worker |
| CPY-024 | Starter checklist (HMRC) processing | HIGH | NOT IMPL | 1-2 weeks | None |
| CPY-025 | RTI FPS submission data | CRITICAL | NOT IMPL | 3-4 weeks | Tax/NI data |
| CPY-026 | RTI EPS submission data | HIGH | NOT IMPL | 2-3 weeks | CPY-025 |
| CPY-027 | Payslip generation | CRITICAL | NOT IMPL | 2-3 weeks | PDF worker, pay data |
| CPY-028 | Electronic payslip distribution | HIGH | NOT IMPL | 1 week | CPY-027 |
| CPY-029 | Salary sacrifice management | HIGH | NOT IMPL | 2 weeks | Pension module |
| CPY-034 | Apprenticeship Levy calculation | HIGH | NOT IMPL | 1-2 weeks | Compensation data |
| CPY-036 | CEO pay ratio reporting | HIGH | NOT IMPL | 1-2 weeks | Compensation data |
| CPY-038 | Final pay calculation | CRITICAL | NOT IMPL | 2-3 weeks | Multiple pay elements |
| CPY-039 | Back-pay calculation | HIGH | NOT IMPL | 2 weeks | Pay history |
| CPY-040 | Attachment of earnings processing | HIGH | NOT IMPL | 2 weeks | Pay processing |
| CPY-041 | Payroll variance reporting | HIGH | NOT IMPL | 1-2 weeks | Pay data |
| CPY-042 | Payroll costing report | HIGH | NOT IMPL | 1-2 weeks | Pay data, cost centres |
| CPY-043 | Payroll journal generation | HIGH | NOT IMPL | 2 weeks | CPY-042 |
| CPY-044 | Payroll period locking | CRITICAL | PARTIAL | 1 week | None |

**Note:** Most HRIS platforms integrate with dedicated payroll software (Sage, Xero, ADP) rather than building full payroll. The minimum viable approach is: (1) payroll data export interface, (2) tax code/NI storage, (3) payroll integration API, (4) P45/P60 document storage from payroll system.

---

### 2.2 Employee Records & Personal Data Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| EPD-003 | Title and honorifics | LOW | NOT IMPL | 0.5 days | None |
| EPD-004 | Pronoun recording | MEDIUM | NOT IMPL | 0.5 days | None |
| EPD-007 | Emergency contact management (enhanced) | CRITICAL | PARTIAL | 1 week | None |
| EPD-008 | Dependant recording (linked to employee) | MEDIUM | PARTIAL | 1 week | Benefits module |
| EPD-009 | NI number format validation | CRITICAL | PARTIAL | 1 day | None |
| EPD-010 | Bank details management | CRITICAL | NOT IMPL | 2 weeks | Audit trail |
| EPD-011 | Tax code recording | CRITICAL | NOT IMPL | 1 week | None |
| EPD-012 | Student loan deduction tracking | HIGH | NOT IMPL | 1 week | None |
| EPD-015 | Employee photo management | LOW | NOT IMPL | 1-2 weeks | Storage (S3) |
| EPD-017 | Previous employment history | MEDIUM | NOT IMPL | 1 week | None |
| EPD-018 | Employee notes and annotations | MEDIUM | NOT IMPL | 1 week | None |
| EPD-021 | Employee data validation rules (tenant-configurable) | HIGH | PARTIAL | 2-3 weeks | Field registry |
| EPD-026 | Work anniversary tracking | LOW | NOT IMPL | 1 week | Scheduler |
| EPD-027 | Employee self-service profile editing (update endpoint) | HIGH | PARTIAL | 2 weeks | Portal module |
| EPD-028 | Medical information recording | HIGH | NOT IMPL | 1-2 weeks | Consent management |

---

### 2.3 Employee Lifecycle Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| ELM-001 | Employee creation wizard (multi-step UX) | CRITICAL | PARTIAL | 2 weeks | None (backend exists) |
| ELM-005 | Multiple employment support | MEDIUM | NOT IMPL | 3-4 weeks | Major schema change |
| ELM-007 | Promotion processing (single transaction) | CRITICAL | PARTIAL | 2 weeks | Position + compensation |
| ELM-008 | Demotion processing (reason codes) | HIGH | PARTIAL | 1 week | ELM-007 |
| ELM-009 | Secondment management | MEDIUM | NOT IMPL | 2 weeks | Position module |
| ELM-010 | Acting-up arrangements | MEDIUM | NOT IMPL | 1-2 weeks | Position module |
| ELM-012 | Termination reason taxonomy | CRITICAL | PARTIAL | 1 week | None |
| ELM-013 | Resignation capture (notice tracking, counter-offer) | CRITICAL | PARTIAL | 1-2 weeks | None |
| ELM-014 | Redundancy processing | HIGH | NOT IMPL | 3-4 weeks | Compensation |
| ELM-015 | PILON calculation | HIGH | NOT IMPL | 1-2 weeks | Notice period, pay |
| ELM-016 | Garden leave management | MEDIUM | NOT IMPL | 1 week | None |
| ELM-017 | Exit interview recording | MEDIUM | NOT IMPL | 1-2 weeks | None |
| ELM-018 | Leaver checklist automation | HIGH | PARTIAL | 2 weeks | Onboarding patterns |
| ELM-019 | Re-hire detection | HIGH | NOT IMPL | 1-2 weeks | Employee search |
| ELM-020 | Re-hire processing | MEDIUM | NOT IMPL | 1-2 weeks | ELM-019 |
| ELM-021 | TUPE transfer management | HIGH | NOT IMPL | 3-4 weeks | Complex model |
| ELM-022 | Employee timeline view (unified) | HIGH | PARTIAL | 2 weeks | History endpoints |
| ELM-025 | Bulk employee creation (CSV/Excel import) | HIGH | NOT IMPL | 3-4 weeks | Import framework |
| ELM-026 | Employee merge and deduplication | MEDIUM | NOT IMPL | 3-4 weeks | Complex logic |
| ELM-027 | Length of service calculation (breaks, TUPE) | HIGH | PARTIAL | 2 weeks | ELM-021 |
| ELM-028 | Retirement date projection | MEDIUM | NOT IMPL | 1 week | DOB, SPA data |
| ELM-029 | Death in service processing | HIGH | NOT IMPL | 2 weeks | Benefits, payroll |
| ELM-030 | Continuous service date override | HIGH | NOT IMPL | 1 week | None |
| ELM-031 | Employee record locking | MEDIUM | NOT IMPL | 1 week | None |
| ELM-032 | Employee status change notifications (routing) | HIGH | PARTIAL | 1-2 weeks | Notification worker |

---

### 2.4 Organisation Structure Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| ORG-002 | Division and business unit tracking | HIGH | PARTIAL | 1 week | Org units |
| ORG-004 | Location management (full, not just geofence) | CRITICAL | PARTIAL | 2 weeks | None |
| ORG-008 | Org chart export (PDF/PNG/SVG) | MEDIUM | NOT IMPL | 2 weeks | Org chart |
| ORG-009 | Span of control analysis | MEDIUM | NOT IMPL | 1-2 weeks | Org chart |
| ORG-011 | Future-dated org restructure (preview/impact) | HIGH | PARTIAL | 2-3 weeks | Effective dating |
| ORG-012 | Team management (separate from org hierarchy) | MEDIUM | NOT IMPL | 2 weeks | None |
| ORG-013 | Legal entity management | HIGH | NOT IMPL | 3 weeks | Multi-entity model |
| ORG-014 | PAYE reference assignment per entity | HIGH | NOT IMPL | 1 week | ORG-013 |
| ORG-015 | Working pattern assignment per dept/location | HIGH | PARTIAL | 1-2 weeks | Schedules |
| ORG-017 | Organisational change history (before/after) | HIGH | PARTIAL | 1-2 weeks | Audit module |
| ORG-018 | Department budget allocation | MEDIUM | NOT IMPL | 2 weeks | None |
| ORG-020 | Org structure comparison (between dates) | MEDIUM | NOT IMPL | 2-3 weeks | Effective dating |
| ORG-021 | Delegation of authority matrix (full) | HIGH | PARTIAL | 2 weeks | Delegation module |
| ORG-022 | Organisation closure and merge | MEDIUM | NOT IMPL | 2-3 weeks | Complex |
| ORG-024 | Organisation structure import/export | MEDIUM | NOT IMPL | 2 weeks | Import framework |

---

### 2.5 Contracts & Employment Terms Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| CET-001 | Employment contract generation from templates | HIGH | NOT IMPL | 2-3 weeks | Document templates |
| CET-004 | Fixed-term contract renewal workflow | HIGH | NOT IMPL | 1-2 weeks | CET-003 |
| CET-005 | Zero-hours contract management | HIGH | NOT IMPL | 1-2 weeks | Contract types |
| CET-006 | Contract amendment acknowledgement workflow | CRITICAL | PARTIAL | 1-2 weeks | Workflow engine |
| CET-008 | Probation period management (full) | HIGH | PARTIAL | 1-2 weeks | None |
| CET-009 | Probation review reminders | HIGH | NOT IMPL | 1 week | Scheduler, CET-008 |
| CET-013 | Working pattern definition (compressed, flexible) | HIGH | PARTIAL | 1-2 weeks | Schedules |
| CET-016 | Work location specification (hybrid/home tracking) | HIGH | PARTIAL | 1 week | None |
| CET-020 | Continuous employment calculation | HIGH | NOT IMPL | 2 weeks | Service dates |
| CET-021 | Contract template management (versioned) | HIGH | NOT IMPL | 2-3 weeks | Document module |
| CET-022 | Restrictive covenant tracking | MEDIUM | NOT IMPL | 1 week | None |
| CET-023 | Collective agreement tracking | MEDIUM | NOT IMPL | 1-2 weeks | None |
| CET-026 | Contract version history (diff comparison) | HIGH | PARTIAL | 1-2 weeks | Effective dating |
| CET-027 | Digital contract signing (e-signature) | HIGH | NOT IMPL | 3-4 weeks | E-sign provider |
| CET-028 | Contractual benefits recording | HIGH | NOT IMPL | 1-2 weeks | Benefits module |
| CET-029 | Hours change impact analysis | HIGH | NOT IMPL | 2-3 weeks | Multiple modules |
| CET-030 | Mass contract amendment | MEDIUM | NOT IMPL | 2-3 weeks | CET-006, bulk ops |

---

## Group 3: Module Features (Per-Module Missing Capabilities)

---

### 3.1 Absence & Leave Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| ALM-006 | Holiday calendar view (team, drag-and-drop) | HIGH | PARTIAL | 2-3 weeks | Frontend |
| ALM-007 | Holiday clash detection (team coverage rules) | HIGH | NOT IMPL | 2 weeks | ALM-006 |
| ALM-008 | Compulsory holiday (shutdown) booking | HIGH | NOT IMPL | 1-2 weeks | ALM-001 |
| ALM-018 | Bradford Factor calculation | HIGH | NOT IMPL | 1 week | Absence data |
| ALM-019 | Absence trigger alerts (configurable thresholds) | HIGH | NOT IMPL | 2 weeks | ALM-018, scheduler |
| ALM-033 | Compassionate leave management | HIGH | NOT IMPL | 1 week | Absence types |
| ALM-034 | Jury service leave | HIGH | NOT IMPL | 1 week | Absence types |
| ALM-035 | Time off for dependants | HIGH | NOT IMPL | 1 week | Absence types |
| ALM-036 | Study and exam leave | MEDIUM | NOT IMPL | 1 week | Absence types |
| ALM-037 | Sabbatical and career break | MEDIUM | NOT IMPL | 1-2 weeks | None |
| ALM-038 | TOIL booking and balance | HIGH | NOT IMPL | 2 weeks | Overtime module |
| ALM-039 | Absence approval delegation (specific integration) | HIGH | PARTIAL | 1 week | Delegation module |
| ALM-040 | Half-day and hourly absence | HIGH | NOT IMPL | 1-2 weeks | Absence module |
| ALM-041 | Absence accrual and liability reporting (IAS 19) | HIGH | NOT IMPL | 2-3 weeks | Financial reporting |
| ALM-044 | Absence cost reporting | MEDIUM | NOT IMPL | 1-2 weeks | Compensation data |
| ALM-045 | Absence pattern reporting (day-of-week) | MEDIUM | NOT IMPL | 1-2 weeks | Absence data |
| ALM-046 | Holiday purchase/sell scheme | MEDIUM | NOT IMPL | 2 weeks | Payroll integration |
| ALM-048 | Absence entitlement by service length | HIGH | NOT IMPL | 1-2 weeks | Service calculation |
| ALM-049 | Absence data export for payroll | HIGH | NOT IMPL | 1-2 weeks | Export framework |

---

### 3.2 Time & Attendance

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| TAT-006 | Overtime recording and categorisation (full) | HIGH | PARTIAL | 1-2 weeks | Time events |
| TAT-007 | Overtime pre-authorisation | HIGH | NOT IMPL | 2 weeks | Workflow engine |
| TAT-008 | Overtime rate calculation (automatic) | HIGH | PARTIAL | 1-2 weeks | Overtime rules |
| TAT-009 | TOIL accrual from overtime | HIGH | NOT IMPL | 1-2 weeks | ALM-038, overtime |
| TAT-013 | Shift premium calculation | HIGH | NOT IMPL | 1-2 weeks | Shift management |
| TAT-019 | Flexi-time management (core hours, balance) | MEDIUM | NOT IMPL | 2-3 weeks | Time events |
| TAT-020 | Time rounding rules | MEDIUM | NOT IMPL | 1 week | Time events |
| TAT-021 | Late arrival / early departure tracking | MEDIUM | NOT IMPL | 1 week | Schedule comparison |
| TAT-022 | Unplanned absence detection (no-show) | HIGH | NOT IMPL | 1-2 weeks | Schedules, alerts |
| TAT-023 | Time exception management (anomalies) | HIGH | NOT IMPL | 2 weeks | Time events |
| TAT-024 | Manager timesheet override (line-by-line) | HIGH | PARTIAL | 1 week | Timesheets |
| TAT-025 | Payroll export generation (time data) | CRITICAL | NOT IMPL | 2 weeks | Export framework |
| TAT-026 | Project time tracking (full) | MEDIUM | PARTIAL | 2-3 weeks | Project model |
| TAT-027 | Annual hours tracking | MEDIUM | NOT IMPL | 2 weeks | Contract model |
| TAT-028 | Time and attendance dashboard (real-time) | HIGH | PARTIAL | 2 weeks | Frontend |
| TAT-029 | Historical timesheet amendment | HIGH | NOT IMPL | 1-2 weeks | Audit trail |
| TAT-030 | Attendance pattern analysis | MEDIUM | NOT IMPL | 1-2 weeks | Reporting |

**Code Scan Finding:** F-006 -- Time policies backend endpoint (`/api/v1/time/policies`) is NOT IMPLEMENTED. Frontend uses hardcoded data (F-004). This should be built first as it underpins time module configuration.

---

### 3.3 Recruitment & ATS

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| REC-002 | Requisition approval workflow (multi-level) | CRITICAL | PARTIAL | 2 weeks | Workflow engine |
| REC-003 | Job posting to careers page | HIGH | NOT IMPL | 3-4 weeks | Frontend |
| REC-004 | Multi-channel job distribution | MEDIUM | NOT IMPL | 3-4 weeks | Job board APIs |
| REC-005 | Internal job posting | HIGH | NOT IMPL | 1-2 weeks | Portal |
| REC-006 | Application form builder | HIGH | NOT IMPL | 3-4 weeks | Form engine |
| REC-007 | CV/resume parsing | MEDIUM | NOT IMPL | 3-4 weeks | NLP/third-party |
| REC-010 | Candidate pipeline (Kanban drag-and-drop) | HIGH | PARTIAL | 2 weeks | Frontend |
| REC-011 | Screening question scoring | MEDIUM | NOT IMPL | 1-2 weeks | Form builder |
| REC-013 | Interview panel management (roles, availability) | HIGH | PARTIAL | 1-2 weeks | None |
| REC-016 | Offer letter generation (from template) | HIGH | PARTIAL | 2 weeks | Document templates |
| REC-017 | Offer approval workflow (salary band checks) | HIGH | PARTIAL | 1-2 weeks | Salary bands |
| REC-018 | Conditional offer tracking | HIGH | NOT IMPL | 1-2 weeks | Offers |
| REC-019 | Reference request management | HIGH | NOT IMPL | 2 weeks | Email integration |
| REC-021 | Candidate communication templates | HIGH | NOT IMPL | 1-2 weeks | Email templates |
| REC-022 | Candidate self-service portal | MEDIUM | NOT IMPL | 3-4 weeks | Frontend |
| REC-023 | Recruitment analytics (time-to-fill, cost-per-hire) | HIGH | PARTIAL | 2 weeks | Analytics module |
| REC-024 | Equal opportunities monitoring (applicants) | HIGH | NOT IMPL | 1-2 weeks | Consent |
| REC-025 | Guaranteed interview scheme | MEDIUM | NOT IMPL | 1 week | Candidate flags |
| REC-026 | Talent pool management | MEDIUM | NOT IMPL | 2 weeks | Candidate module |
| REC-027 | Candidate GDPR consent and retention | CRITICAL | NOT IMPL | 2 weeks | GDPR framework |
| REC-028 | Onboarding trigger from ATS | HIGH | NOT IMPL | 1-2 weeks | Onboarding module |
| REC-029 | Hiring manager portal (simplified) | HIGH | PARTIAL | 2-3 weeks | Frontend |
| REC-030 | Blind CV screening | MEDIUM | NOT IMPL | 1-2 weeks | Data masking |
| REC-031 | Recruitment compliance audit | HIGH | NOT IMPL | 1-2 weeks | Audit trail |
| REC-032 | Agency and recruitment vendor management | MEDIUM | NOT IMPL | 2 weeks | None |

---

### 3.4 Onboarding

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| ONB-002 | Pre-boarding portal (before day one) | HIGH | PARTIAL | 2-3 weeks | Portal |
| ONB-003 | Document collection workflow (chase reminders) | CRITICAL | PARTIAL | 2 weeks | Documents, scheduler |
| ONB-005 | Personal details pre-capture (bank, tax) | HIGH | NOT IMPL | 2 weeks | Pre-boarding portal |
| ONB-007 | System access provisioning (AD integration) | HIGH | PARTIAL | 3-4 weeks | INT-006 |
| ONB-008 | Buddy and mentor assignment | MEDIUM | NOT IMPL | 1 week | None |
| ONB-009 | Induction scheduling | HIGH | NOT IMPL | 2 weeks | Calendar |
| ONB-010 | Policy acknowledgement tracking | HIGH | NOT IMPL | 1-2 weeks | Document module |
| ONB-011 | Contract signing tracking | CRITICAL | NOT IMPL | 2 weeks | E-signature |
| ONB-014 | Automated reminders and escalation (configurable) | HIGH | PARTIAL | 1-2 weeks | Scheduler |
| ONB-015 | Mandatory training auto-enrolment | HIGH | NOT IMPL | 1-2 weeks | LMS module |
| ONB-016 | Probation setup from onboarding | HIGH | NOT IMPL | 1 week | CET-008 |
| ONB-017 | Onboarding survey (7/30/60/90 days) | MEDIUM | NOT IMPL | 2 weeks | Survey system |
| ONB-018 | Welcome communications (automated) | MEDIUM | NOT IMPL | 1 week | Email templates |
| ONB-019 | Payroll setup trigger | HIGH | NOT IMPL | 1-2 weeks | Payroll integration |
| ONB-020 | Benefits enrolment trigger | HIGH | NOT IMPL | 1 week | Benefits module |
| ONB-021 | Starter checklist (HMRC) completion | HIGH | NOT IMPL | 1-2 weeks | Tax code mgmt |
| ONB-022 | Group/cohort onboarding | MEDIUM | NOT IMPL | 2 weeks | None |
| ONB-023 | Onboarding completion sign-off (formal) | HIGH | PARTIAL | 1 week | Workflow |
| ONB-024 | Re-hire accelerated onboarding | MEDIUM | NOT IMPL | 1-2 weeks | ELM-019 |

---

### 3.5 Performance Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| PER-004 | OKR support (Objectives & Key Results) | HIGH | NOT IMPL | 2-3 weeks | Goals module |
| PER-005 | Goal cascade and alignment | HIGH | NOT IMPL | 2-3 weeks | Goals module |
| PER-006 | Mid-year review and check-ins | HIGH | NOT IMPL | 2 weeks | Review cycles |
| PER-007 | Self-assessment submission (explicit step) | HIGH | PARTIAL | 1-2 weeks | Review workflow |
| PER-009 | Rating scale configuration (per tenant) | HIGH | NOT IMPL | 1-2 weeks | None |
| PER-010 | 360-degree feedback (full workflow) | HIGH | PARTIAL | 3-4 weeks | Feedback module |
| PER-011 | Anonymous feedback with threshold | HIGH | NOT IMPL | 1-2 weeks | PER-010 |
| PER-014 | Calibration sessions (meeting workflow) | HIGH | NOT IMPL | 2-3 weeks | Performance cycles |
| PER-015 | 9-box grid (performance vs potential) | HIGH | NOT IMPL | 2-3 weeks | Performance data |
| PER-016 | Performance improvement plan (PIP) | HIGH | NOT IMPL | 2-3 weeks | Case management |
| PER-017 | PIP progress tracking | HIGH | NOT IMPL | 1-2 weeks | PER-016 |
| PER-018 | Continuous feedback mechanism (ad-hoc) | HIGH | PARTIAL | 1-2 weeks | Feedback module |
| PER-019 | Recognition and kudos | MEDIUM | NOT IMPL | 2 weeks | None |
| PER-021 | Performance review sign-off (dual) | HIGH | NOT IMPL | 1-2 weeks | Reviews |
| PER-022 | Performance-linked pay review (merit matrix) | HIGH | NOT IMPL | 2-3 weeks | CPY-007, reviews |
| PER-023 | Performance analytics dashboard | HIGH | PARTIAL | 2 weeks | Analytics |
| PER-024 | Probation review integration | HIGH | NOT IMPL | 1-2 weeks | CET-008 |
| PER-025 | Goal progress updates (% completion) | HIGH | PARTIAL | 1 week | Goals module |

---

### 3.6 Learning & Development

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| LND-002 | Multiple delivery formats (full) | HIGH | PARTIAL | 1 week | Course module |
| LND-003 | Course scheduling (dates, capacity, waitlists) | HIGH | NOT IMPL | 2-3 weeks | Calendar |
| LND-005 | Mandatory training assignment (auto by role) | CRITICAL | PARTIAL | 2 weeks | Role/dept mappings |
| LND-006 | Mandatory training compliance dashboard | CRITICAL | PARTIAL | 2 weeks | LND-005 |
| LND-009 | Certificate/qualification expiry reminders | HIGH | PARTIAL | 1 week | Scheduler |
| LND-010 | CPD tracking (hours/points by body) | HIGH | NOT IMPL | 1-2 weeks | None |
| LND-012 | Training budget management | HIGH | NOT IMPL | 2 weeks | Budget model |
| LND-013 | Training needs analysis (from performance) | HIGH | NOT IMPL | 2-3 weeks | PER module |
| LND-014 | E-learning content hosting (SCORM/xAPI) | HIGH | NOT IMPL | 4-6 weeks | Major feature |
| LND-015 | Health and safety training compliance | CRITICAL | NOT IMPL | 1-2 weeks | LND-005, UKC-016 |
| LND-017 | Manager training dashboard (direct reports) | HIGH | PARTIAL | 1-2 weeks | Frontend |
| LND-018 | Apprenticeship programme management | MEDIUM | NOT IMPL | 2-3 weeks | None |
| LND-019 | Training evaluation surveys | MEDIUM | NOT IMPL | 2 weeks | Survey system |
| LND-020 | Competency-linked training suggestions | MEDIUM | NOT IMPL | 1-2 weeks | Competency gaps |

---

### 3.7 Talent Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| TLM-002 | Key person risk assessment (multi-factor) | HIGH | PARTIAL | 1-2 weeks | Succession |
| TLM-003 | Talent pool management (HiPo, specialist) | HIGH | PARTIAL | 2 weeks | None |
| TLM-004 | 9-box talent review | HIGH | NOT IMPL | 2-3 weeks | PER-015 |
| TLM-005 | Career path definition | MEDIUM | NOT IMPL | 2-3 weeks | Competencies |
| TLM-006 | Career aspiration recording | MEDIUM | NOT IMPL | 1 week | None |
| TLM-007 | High-potential identification and tracking | HIGH | PARTIAL | 1-2 weeks | TLM-004 |
| TLM-008 | Flight risk assessment (structured) | MEDIUM | PARTIAL | 1-2 weeks | None |
| TLM-010 | Emergency succession plans (with actions) | HIGH | PARTIAL | 1 week | Succession |
| TLM-011 | Talent review meeting support | HIGH | NOT IMPL | 2 weeks | Workflow |
| TLM-013 | Mentoring programme management | MEDIUM | NOT IMPL | 2-3 weeks | None |
| TLM-014 | Internal mobility marketplace | MEDIUM | NOT IMPL | 3-4 weeks | Recruitment |

---

### 3.8 Benefits Administration

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| BEN-003 | Benefits enrolment window management (deadline) | HIGH | PARTIAL | 1-2 weeks | None |
| BEN-009 | Private medical insurance management (full) | HIGH | PARTIAL | 1-2 weeks | Provider API |
| BEN-010 | Death in service benefit (beneficiary nomination) | HIGH | PARTIAL | 1 week | None |
| BEN-011 | Income protection insurance | MEDIUM | NOT IMPL | 1-2 weeks | Benefits module |
| BEN-012 | Company car and car allowance | MEDIUM | NOT IMPL | 1-2 weeks | BIK calc |
| BEN-013 | Cycle to work scheme | MEDIUM | NOT IMPL | 1-2 weeks | Salary sacrifice |
| BEN-014 | Total reward statement | HIGH | NOT IMPL | 2-3 weeks | All comp data |
| BEN-016 | Benefits provider data exchange | HIGH | NOT IMPL | 3-4 weeks | Provider APIs |
| BEN-017 | Benefits cessation on leaving | HIGH | NOT IMPL | 1-2 weeks | Termination workflow |
| BEN-018 | Flexible benefits fund allocation | MEDIUM | NOT IMPL | 2-3 weeks | Flex fund model |

---

### 3.9 Case Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| CAS-005 | Hearing scheduling and management | HIGH | NOT IMPL | 1-2 weeks | Calendar |
| CAS-006 | Right to be accompanied (companion tracking) | CRITICAL | NOT IMPL | 1 week | CAS-005 |
| CAS-007 | Hearing outcome recording (structured) | CRITICAL | NOT IMPL | 1 week | CAS-002 |
| CAS-013 | Template letter generation (ACAS letters) | HIGH | NOT IMPL | 2 weeks | Document templates |
| CAS-014 | Case timeline view (consolidated) | HIGH | PARTIAL | 1-2 weeks | Frontend |
| CAS-017 | Case confidentiality controls (named-party) | CRITICAL | PARTIAL | 1-2 weeks | Security module |
| CAS-020 | Case analytics and reporting (outcomes) | HIGH | PARTIAL | 1-2 weeks | Analytics module |

---

### 3.10 Document Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| DOC-004 | Automated letter generation (HR-specific templates) | HIGH | PARTIAL | 2-3 weeks | Templates, data merge |
| DOC-005 | E-signature integration | HIGH | NOT IMPL | 3-4 weeks | Provider (DocuSign/Adobe Sign) |
| DOC-006 | Document version control (full, diff comparison) | HIGH | PARTIAL | 1-2 weeks | None |
| DOC-009 | Bulk document generation (batch) | HIGH | NOT IMPL | 2 weeks | Templates, PDF worker |
| DOC-010 | Document retention policy enforcement (auto-delete) | CRITICAL | NOT IMPL | 2-3 weeks | UKC-005 |
| DOC-013 | Policy document distribution (read-receipt) | HIGH | NOT IMPL | 2 weeks | Notification worker |
| DOC-014 | Document pack assembly (tribunal bundle) | MEDIUM | NOT IMPL | 2 weeks | None |
| DOC-015 | Company policy library | HIGH | NOT IMPL | 2-3 weeks | Document module |
| DOC-016 | Document virus scanning | HIGH | NOT IMPL | 1-2 weeks | Third-party scanner |

---

### 3.11 Workflow & Approvals

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| WFA-002 | Dynamic approval routing (data-driven rules) | HIGH | PARTIAL | 2-3 weeks | Workflow engine |
| WFA-004 | Approval timeout and escalation (auto) | HIGH | PARTIAL | 1-2 weeks | Scheduler |
| WFA-005 | Email notifications for workflow events (templates) | CRITICAL | PARTIAL | 1-2 weeks | Email templates |
| WFA-010 | Conditional workflow branching (runtime) | HIGH | PARTIAL | 2-3 weeks | Workflow engine |
| WFA-011 | Parallel task assignment (join conditions) | HIGH | PARTIAL | 2 weeks | Workflow engine |
| WFA-012 | Workflow comments and attachments (per step) | HIGH | PARTIAL | 1 week | None |
| WFA-014 | Bulk approval capability | HIGH | NOT IMPL | 1-2 weeks | Frontend |
| WFA-015 | Recurring workflow triggers (user-configurable) | HIGH | PARTIAL | 1-2 weeks | Scheduler |

---

### 3.12 Reporting & Analytics

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| RAA-002 | Starter and leaver reporting (by reason/diversity) | CRITICAL | PARTIAL | 1-2 weeks | None |
| RAA-005 | Diversity dashboard | CRITICAL | NOT IMPL | 2-3 weeks | EPD-013 |
| RAA-006 | Gender pay gap dashboard | CRITICAL | NOT IMPL | 2-3 weeks | CPY-035 |
| RAA-007 | Compensation analytics (distribution, equity) | HIGH | NOT IMPL | 2-3 weeks | Compensation data |
| RAA-008 | Custom report builder (drag-and-drop) | HIGH | NOT IMPL | 4-6 weeks | Major feature |
| RAA-009 | Report scheduling and distribution (email) | HIGH | PARTIAL | 2 weeks | Email, scheduler |
| RAA-010 | Report export formats (PDF, interactive HTML) | HIGH | PARTIAL | 2 weeks | PDF worker |
| RAA-013 | Workforce planning analytics (forecast) | HIGH | NOT IMPL | 3-4 weeks | Headcount data |
| RAA-014 | Compliance reporting dashboard (RAG status) | HIGH | NOT IMPL | 2-3 weeks | All compliance modules |
| RAA-016 | Contract end date reporting | HIGH | NOT IMPL | 1 week | Contract data |
| RAA-017 | Sickness absence trends (by reason/dept/season) | HIGH | PARTIAL | 1-2 weeks | Absence data |
| RAA-018 | Recruitment analytics (time-to-fill, source) | HIGH | PARTIAL | 2 weeks | Recruitment data |
| RAA-019 | Training compliance reporting | HIGH | NOT IMPL | 1-2 weeks | LMS data |
| RAA-021 | Data visualisation library (interactive charts) | HIGH | PARTIAL | 3-4 weeks | Frontend |
| RAA-022 | Ad-hoc data extraction | MEDIUM | NOT IMPL | 3-4 weeks | Query builder |
| RAA-023 | Predictive analytics (attrition, absence) | MEDIUM | NOT IMPL | 4-6 weeks | ML/statistics |
| RAA-024 | Benchmark comparison (external data) | MEDIUM | NOT IMPL | 3-4 weeks | External data |

---

### 3.13 Position & Job Management

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| PJM-002 | Position budgeting (funded/unfunded status) | HIGH | PARTIAL | 1-2 weeks | None |
| PJM-004 | Vacancy tracking (time-vacant, recruitment link) | HIGH | PARTIAL | 1-2 weeks | Recruitment |
| PJM-005 | Job title management (controlled catalogue) | HIGH | PARTIAL | 1-2 weeks | Jobs table |
| PJM-006 | Job family and function taxonomy | MEDIUM | NOT IMPL | 1-2 weeks | None |
| PJM-007 | Grade and band structure (standalone, with location) | HIGH | PARTIAL | 2 weeks | None |
| PJM-008 | Grade progression rules | MEDIUM | NOT IMPL | 2 weeks | PJM-007 |
| PJM-009 | Job description management (version-controlled) | HIGH | NOT IMPL | 2 weeks | None |
| PJM-010 | Person specification management | HIGH | NOT IMPL | 1-2 weeks | Competencies |
| PJM-011 | Headcount planning (scenario modelling) | HIGH | NOT IMPL | 3-4 weeks | PJM-002 |
| PJM-012 | Establishment control (hiring prevention) | HIGH | NOT IMPL | 1-2 weeks | PJM-002 |
| PJM-013 | Job evaluation and sizing | MEDIUM | NOT IMPL | 2 weeks | None |
| PJM-015 | Role-based training requirements (auto-assign) | HIGH | NOT IMPL | 1-2 weeks | LMS, competencies |

---

## Group 4: Integration Features (External System Connectivity)

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| INT-003 | Webhook configuration (outbound, user-configurable) | HIGH | PARTIAL | 2-3 weeks | Outbox processor |
| INT-004 | Payroll system integration (Sage, ADP, Xero) | HIGH | NOT IMPL | 4-6 weeks | Pay data export |
| INT-005 | Accounting system integration (journal export) | HIGH | NOT IMPL | 3-4 weeks | CPY-043 |
| INT-006 | Active Directory / Azure AD sync | HIGH | NOT IMPL | 3-4 weeks | SSO |
| INT-007 | SSO provider integration (SAML/OIDC) | HIGH | NOT IMPL | 3-4 weeks | BetterAuth config |
| INT-008 | Calendar integration (Outlook/Google) | MEDIUM | NOT IMPL | 2-3 weeks | CalDAV/API |
| INT-010 | Data import framework (CSV/Excel) | HIGH | NOT IMPL | 3-4 weeks | Validation engine |
| INT-012 | Pension provider integration | HIGH | NOT IMPL | 3-4 weeks | Pension module |
| INT-013 | Benefits provider integration | MEDIUM | NOT IMPL | 3-4 weeks | Provider APIs |
| INT-014 | Job board integration | MEDIUM | NOT IMPL | 3-4 weeks | Recruitment module |
| INT-015 | Background check provider integration | MEDIUM | NOT IMPL | 2-3 weeks | DBS module |
| INT-016 | API key management (full) | HIGH | PARTIAL | 2 weeks | Auth module |
| INT-017 | Bulk API operations (batch endpoints) | MEDIUM | NOT IMPL | 2-3 weeks | None |

---

## Group 5: Self-Service Features (Employee/Manager Portals)

### 5.1 Employee Self-Service Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| ESS-002 | Personal details update with approval workflow | CRITICAL | PARTIAL | 2-3 weeks | Portal, workflow |
| ESS-007 | Team absence calendar (for all team members) | HIGH | PARTIAL | 2 weeks | ALM-006 |
| ESS-008 | Payslip viewing and download | CRITICAL | NOT IMPL | 1-2 weeks | CPY-027 |
| ESS-009 | P60 viewing and download | HIGH | NOT IMPL | 1 week | CPY-023 |
| ESS-013 | Goal and performance management (self-service) | HIGH | PARTIAL | 2 weeks | PER module |
| ESS-017 | Organisation directory (searchable) | HIGH | NOT IMPL | 2 weeks | Employee data |
| ESS-018 | Company news and announcements | MEDIUM | NOT IMPL | 2 weeks | Content system |
| ESS-019 | Feedback and recognition (peer) | MEDIUM | NOT IMPL | 2 weeks | PER-019 |

### 5.2 Manager Self-Service Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| MSS-003 | Team absence calendar (visual, coverage) | HIGH | PARTIAL | 2 weeks | ALM-006 |
| MSS-006 | Initiate employee changes (salary/transfer/promotion) | HIGH | PARTIAL | 2-3 weeks | Workflow, HR module |
| MSS-008 | Team training overview | HIGH | NOT IMPL | 1-2 weeks | LMS module |
| MSS-009 | Direct report onboarding tracking | HIGH | NOT IMPL | 1-2 weeks | Onboarding module |
| MSS-010 | Team timesheet review (approve/reject) | HIGH | PARTIAL | 1-2 weeks | Time module |
| MSS-011 | 1:1 meeting notes | MEDIUM | NOT IMPL | 1-2 weeks | None |
| MSS-012 | Team reporting and analytics (detailed) | HIGH | PARTIAL | 2 weeks | Analytics module |
| MSS-013 | Recruitment management (simplified interface) | HIGH | PARTIAL | 2 weeks | Recruitment module |
| MSS-014 | Case awareness (need-to-know basis) | MEDIUM | NOT IMPL | 1-2 weeks | Case module |

### 5.3 Missing Frontend Routes (from Code Scan)

| ID | Path | Priority | Context |
|----|------|----------|---------|
| F-010 | `/manager/dashboard` | HIGH | Main manager landing page |
| F-011 | `/manager/org-chart` | MEDIUM | Manager org chart view |
| F-012 | `/manager/approvals/leave` | HIGH | Leave approval sub-page |
| F-013 | `/manager/approvals/timesheets` | HIGH | Timesheet approval sub-page |
| F-014 | `/manager/approvals/expenses` | HIGH | Expense approval sub-page |
| F-015 | `/manager/calendar/absence` | MEDIUM | Team absence calendar |
| F-016 | `/manager/performance/goals` | MEDIUM | Goal management for reports |
| F-017 | `/manager/performance/reviews` | MEDIUM | Performance review management |
| F-018 | `/admin/settings/appearance` | MEDIUM | Branding/theme settings |

---

## Group 6: Advanced Features (Analytics, AI, Predictive)

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| RAA-023 | Predictive analytics (attrition risk, absence prediction) | MEDIUM | NOT IMPL | 4-6 weeks | ML models, historical data |
| RAA-024 | Benchmark comparison (external data sources) | MEDIUM | NOT IMPL | 3-4 weeks | External data |
| RAA-008 | Custom report builder (drag-and-drop) | HIGH | NOT IMPL | 4-6 weeks | Query engine |
| LND-014 | E-learning content hosting (SCORM/xAPI) | HIGH | NOT IMPL | 4-6 weeks | Content engine |
| MOB-015 | Progressive Web App (PWA) | MEDIUM | NOT IMPL | 3-4 weeks | Service worker |
| MOB-005 | Offline capability | MEDIUM | NOT IMPL | 4-6 weeks | PWA, IndexedDB |
| MOB-014 | Internationalisation (i18n) foundation | MEDIUM | NOT IMPL | 4-6 weeks | String extraction |
| MOB-004 | Push notifications (mobile) | MEDIUM | NOT IMPL | 2-3 weeks | PWA or native |

---

## Code-Level Findings Requiring Fixes

These are from the code scan report -- bugs and unfinished implementations in existing code.

| ID | Issue | Priority | Effort | File |
|----|-------|----------|--------|------|
| F-019 | `manager.service.ts` uses wrong table name `leave_approvals` (should be `leave_request_approvals`) and wrong column names. Runtime SQL error. | CRITICAL | 1 day | `packages/api/src/modules/security/manager.service.ts` |
| F-001 | Tenant settings page returns mock data instead of calling real backend API | CRITICAL | 1 day | `packages/web/app/routes/(admin)/settings/tenant/route.tsx` |
| F-002 | Tenant settings save is simulated (setTimeout, not persisted) | HIGH | 1 day | `packages/web/app/routes/(admin)/settings/tenant/route.tsx` |
| F-003 | Notification settings save is simulated (setTimeout) | HIGH | 1 day | `packages/web/app/routes/(admin)/settings/notifications/route.tsx` |
| F-004 | Time policies page uses hardcoded local data | HIGH | 1 day | `packages/web/app/routes/(admin)/time/policies/route.tsx` |
| F-005 | Reports page falls back to mock data for empty API responses | MEDIUM | 1 day | `packages/web/app/routes/(admin)/reports/[reportId]/route.tsx` |
| F-007 | Integrations page is entirely static (no API calls) | HIGH | Depends on integration roadmap | `packages/web/app/routes/(admin)/settings/integrations/route.tsx` |
| F-020 | Notifications table has no API routes for reading/managing | HIGH | 2-3 days | Backend missing |
| F-021 | Equipment tables have no API module | HIGH | 1-2 weeks | Backend missing |
| F-022 | Geofence tables have no API module | HIGH | 1-2 weeks | Backend missing |
| F-023 | Approval delegations table has no API module | MEDIUM | 1 week | Backend missing |
| F-024 | Jobs table has no API module | MEDIUM | 1 week | Backend missing |
| F-034 | Dead code: `packages/web/src/` directory and `index.html` | MEDIUM | 1 hour | Remove files |
| F-036 | MFA recovery code flow shows "not available yet" | HIGH | 1-2 weeks | `packages/web/app/routes/(auth)/mfa/route.tsx` |
| F-037 | Leave type editing disabled | MEDIUM | 1-2 weeks | Backend + Frontend |
| F-038 | Leave policy editing disabled | MEDIUM | 1-2 weeks | Backend + Frontend |
| F-039 | Report scheduling disabled | MEDIUM | 1-2 weeks | Scheduler integration |
| F-040 | 74 console.log statements in production workers | MEDIUM | 2-3 days | Replace with structured logger |

---

## Mobile & Accessibility Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| MOB-001 | Responsive web design (full) | CRITICAL | PARTIAL | 3-4 weeks | Frontend audit |
| MOB-002 | Mobile-optimised self-service | HIGH | PARTIAL | 2-3 weeks | MOB-001 |
| MOB-003 | Mobile clock in/out (offline capable) | HIGH | PARTIAL | 2-3 weeks | PWA |
| MOB-006 | WCAG 2.1 AA compliance (verified) | CRITICAL | PARTIAL | 4-6 weeks | Accessibility audit |
| MOB-007 | Screen reader compatibility (verified) | CRITICAL | PARTIAL | 2-3 weeks | MOB-006 |
| MOB-008 | Keyboard navigation (full) | HIGH | PARTIAL | 2-3 weeks | MOB-006 |
| MOB-009 | Colour contrast compliance (verified) | HIGH | NOT IMPL | 1-2 weeks | Design review |
| MOB-010 | Text resize support (200% without scroll) | HIGH | NOT IMPL | 1-2 weeks | CSS review |
| MOB-011 | Alternative text for images | HIGH | NOT IMPL | N/A currently | No images in app |
| MOB-013 | Focus management (all dynamic content) | HIGH | PARTIAL | 1-2 weeks | Frontend |

---

## System Administration Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| SYS-002 | Tenant provisioning (automated with seed data) | CRITICAL | PARTIAL | 2-3 weeks | None |
| SYS-004 | Tenant branding (logo upload, colour UI) | HIGH | PARTIAL | 2 weeks | Frontend |
| SYS-005 | Feature flag management (admin UI) | HIGH | PARTIAL | 1-2 weeks | Frontend |
| SYS-006 | Lookup value management (tenant-configurable UI) | HIGH | PARTIAL | 2-3 weeks | Frontend |
| SYS-010 | Background job monitoring (admin UI) | HIGH | PARTIAL | 2-3 weeks | Worker system |
| SYS-011 | Email delivery monitoring | HIGH | NOT IMPL | 2 weeks | Email integration |
| SYS-013 | Cache management (admin UI) | MEDIUM | PARTIAL | 1 week | Frontend |
| SYS-015 | Notification template management (backend API) | HIGH | PARTIAL | 2-3 weeks | Backend |
| SYS-016 | Data archival | MEDIUM | NOT IMPL | 3-4 weeks | Data model |
| SYS-018 | System announcement broadcasting | MEDIUM | NOT IMPL | 1-2 weeks | Notifications |
| SYS-019 | Usage analytics per tenant | MEDIUM | NOT IMPL | 2-3 weeks | Analytics |
| SYS-020 | Backup and disaster recovery (automated) | CRITICAL | PARTIAL | 2-3 weeks | Infrastructure |
| SYS-021 | Environment management (staging, anonymisation) | HIGH | PARTIAL | 3-4 weeks | Infrastructure |

---

## Security & Access Control Gaps

| ID | Feature | Priority | Status | Effort | Dependencies |
|----|---------|----------|--------|--------|--------------|
| SAC-006 | MFA enforcement policy (per-tenant/role) | HIGH | PARTIAL | 1-2 weeks | BetterAuth |
| SAC-007 | Single sign-on (SAML/OIDC) | HIGH | NOT IMPL | 3-4 weeks | Identity provider |
| SAC-008 | Password policy configuration (tenant-configurable) | HIGH | PARTIAL | 1-2 weeks | BetterAuth |
| SAC-012 | Audit log immutability (database-enforced) | CRITICAL | PARTIAL | 1 week | Migration |
| SAC-020 | Data encryption at rest (verified implementation) | HIGH | PARTIAL | 2-3 weeks | Crypto module |
| SAC-022 | Data masking (partial display, e.g., NI last 3) | HIGH | PARTIAL | 1-2 weeks | Field registry |
| SAC-024 | Login activity monitoring (suspicious patterns) | HIGH | PARTIAL | 2-3 weeks | Anomaly detection |

---

## Prioritised Implementation Roadmap

### Phase 1: Critical Legal & Code Fixes (0-3 months) -- 31 items

1. **F-019** -- Fix manager.service.ts SQL error (1 day)
2. **F-001** -- Wire tenant settings to real API (1 day)
3. **UKC-002** -- DSAR processing workflow (2-3 weeks)
4. **UKC-005/EPD-025** -- Data retention policy (3 weeks)
5. **UKC-006** -- Data breach notification (2 weeks)
6. **UKC-007** -- Privacy notice management (1-2 weeks)
7. **EPD-024** -- Employee consent management (2 weeks)
8. **UKC-008/CPY-035** -- Gender pay gap reporting (2-3 weeks)
9. **ALM-001** -- Holiday minimum enforcement (1 week)
10. **ALM-002** -- Pro-rata holiday calculation (1 week)
11. **CET-007** -- Section 1 statement compliance (2-3 weeks)
12. **CET-011** -- Statutory notice period calculation (1 week)
13. **UKC-014/CPY-030** -- Pension auto-enrolment engine (4-6 weeks)
14. **UKC-012/CPY-014** -- NMW compliance checking (1-2 weeks)
15. **UKC-013/TAT-015/TAT-016** -- WTR monitoring + opt-out (3-4 weeks)
16. **ALM-012/ALM-013** -- Self-certification + fit note management (2-3 weeks)
17. **EPD-010** -- Bank details management (2 weeks)
18. **SAC-012** -- Audit log immutability enforcement (1 week)

### Phase 2: High-Priority Enterprise Features (3-6 months) -- 52 items

19. **CAS-002/006/007/008/009** -- ACAS disciplinary/grievance workflow (4-6 weeks)
20. **UKC-025/CET-015** -- Flexible working request (2-3 weeks)
21. **SMP/SPP/SAP rates** -- Complete statutory pay calculations (3-4 weeks)
22. **ALM-029/031/032** -- Parental bereavement, neonatal care, carer's leave (3-4 weeks)
23. **INT-007/SAC-007** -- SSO integration (3-4 weeks)
24. **INT-004** -- Payroll system integration (4-6 weeks)
25. **INT-010** -- Data import framework (3-4 weeks)
26. **RAA-008** -- Custom report builder (4-6 weeks)
27. **CPY-001/002** -- Pay period configuration (2-3 weeks)
28. **CPY-016/017** -- Tax code and NI management (2-3 weeks)
29. **UKC-016** -- Health and safety module (3-4 weeks)
30. **ONB-010/011** -- Policy acknowledgement + contract signing (3-4 weeks)

### Phase 3: Module Enhancement (6-12 months) -- 100+ items

Remaining HIGH and MEDIUM priority items across all modules, with focus on:
- Performance management enhancement (PIP, 9-box, calibration)
- Recruitment features (candidate portal, job posting, communication templates)
- Learning management (SCORM hosting, mandatory training auto-assign)
- Benefits administration (pension schemes, provider integration)
- Advanced reporting and analytics
- Mobile optimisation and accessibility audit

### Phase 4: Advanced Capabilities (12+ months) -- 28+ items

- Predictive analytics and AI
- E-learning content hosting (SCORM/xAPI)
- PWA and offline capability
- Internationalisation (i18n)
- External benchmarking
- Advanced integration marketplace

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total missing features (NOT IMPL + PARTIAL) | 414 |
| CRITICAL priority gaps | 71 |
| HIGH priority gaps | 225 |
| MEDIUM priority gaps | 90 |
| LOW priority gaps | 28 |
| UK compliance score | 18/100 |
| Largest module gap | Compensation & Payroll (77.3% missing) |
| Estimated total effort (rough) | 300-400 developer-weeks |
| Phase 1 critical items | 18 work items |
| Code-level bugs (runtime errors) | 2 (F-019, F-001) |

---

*Report generated from comprehensive audit of codebase against 603-item enterprise HR capability checklist, UK employment law compliance audit (12 areas), and code scan findings (108 items). All feature IDs reference `audit/hr-enterprise-checklist.md` and `audit/code-scan-findings.md`.*
