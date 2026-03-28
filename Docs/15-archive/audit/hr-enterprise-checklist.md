# Enterprise HR System Capability Checklist

*Last updated: 2026-03-28*

**Platform:** Staffora (UK Multi-Tenant HRIS)
**Generated:** 2026-03-13
**Total Items:** 603
**Purpose:** Comprehensive benchmark of enterprise-grade UK HRIS capabilities for validation and gap analysis

---

## Priority Legend

| Priority | Definition |
|----------|-----------|
| CRITICAL | Must-have for go-live; legal compliance, core operations, or security requirement |
| HIGH | Essential for enterprise readiness; expected by any serious buyer |
| MEDIUM | Important for competitive differentiation; needed within 6 months of launch |
| LOW | Nice-to-have; enhances user experience or addresses niche requirements |

---

## 1. Employee Lifecycle Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| ELM-001 | Employee creation wizard | Multi-step form to create a new employee record with all mandatory fields and validation | Structured, complete data capture for new starters; reduces errors | CRITICAL |
| ELM-002 | Unique employee number generation | Auto-generate unique, tenant-scoped employee identifiers with configurable format (prefix, sequence, check digit) | Consistent employee identification across all systems and documents | CRITICAL |
| ELM-003 | Employment status state machine | Enforce valid status transitions: pending, active, on_leave, suspended, terminated, retired with immutable audit trail | Accurate workforce status at any point in time; prevents invalid state changes | CRITICAL |
| ELM-004 | Employment start date recording | Capture and validate employment start date, continuous service date, and original hire date as separate fields | Statutory entitlement calculations, redundancy pay, long service awards | CRITICAL |
| ELM-005 | Multiple employment support | Allow an individual to hold multiple concurrent employments within the same tenant (e.g., two part-time roles) | Support complex employment arrangements common in NHS, education, hospitality | MEDIUM |
| ELM-006 | Employee transfer processing | Move employee between departments, locations, cost centres, or legal entities with effective date and approval workflow | Organisational restructuring, career development, cost reallocation | CRITICAL |
| ELM-007 | Promotion processing | Record promotion with new job title, grade, salary, reporting line, effective date in single auditable transaction | Career progression tracking, compensation changes, morale | CRITICAL |
| ELM-008 | Demotion processing | Record demotion with reason code, new terms, and required acknowledgements/signatures | Performance management outcomes, organisational restructuring | HIGH |
| ELM-009 | Secondment management | Track temporary assignments to different teams, departments, or external organisations with return date and terms | Talent development, resource sharing, inter-org collaboration | MEDIUM |
| ELM-010 | Acting-up arrangements | Record temporary assumption of higher-grade duties with additional pay, start/end dates, and review schedule | Cover for absent managers, development opportunities, fair pay | MEDIUM |
| ELM-011 | Termination processing | Full leaver workflow: reason capture, last working day, PILON, garden leave, asset return, system deprovisioning | Legal compliance, clean offboarding, security | CRITICAL |
| ELM-012 | Termination reason taxonomy | Structured reasons: resignation, dismissal (conduct, capability, redundancy, SOSR, statutory restriction), mutual agreement, end of contract, retirement, death in service, TUPE out | Turnover analysis by category, tribunal defence, statutory reporting | CRITICAL |
| ELM-013 | Resignation capture | Record resignation date received, notice given vs required, requested vs calculated last day, manager acknowledgement | Notice period management, workforce planning, counter-offer tracking | CRITICAL |
| ELM-014 | Redundancy processing | Track selection criteria scoring, consultation periods (30/45 day collective), alternative employment offers, settlement agreements, statutory redundancy pay calculation | Employment Rights Act compliance, collective consultation obligations | HIGH |
| ELM-015 | PILON calculation | Calculate pay in lieu of notice based on contractual or statutory entitlement including benefits value | Accurate final pay, tax implications (post-2018 rules) | HIGH |
| ELM-016 | Garden leave management | Flag employee as on garden leave with restrictions, access revocation, end date, and pay continuation | Protect business interests, client relationships during notice period | MEDIUM |
| ELM-017 | Exit interview recording | Capture exit interview responses with configurable questionnaire, interviewer assignment, and trend analysis | Retention insights, culture improvement, identify systemic issues | MEDIUM |
| ELM-018 | Leaver checklist automation | Auto-generate and track task list: IT access revocation, equipment return, final pay calculation, P45, pension cessation, benefits end, knowledge transfer | Complete offboarding, security compliance, nothing missed | HIGH |
| ELM-019 | Re-hire detection | Detect when a new starter was previously employed; link records; calculate continuous service where applicable | Statutory rights calculation, security check reuse, faster onboarding | HIGH |
| ELM-020 | Re-hire processing | Streamline re-hire with pre-populated data from previous employment, gap analysis, abbreviated onboarding | Efficient onboarding of returning employees, positive candidate experience | MEDIUM |
| ELM-021 | TUPE transfer management | Record TUPE transfers in/out with preserved terms, ELI (Employee Liability Information), consultation tracking, measures notification | Transfer of Undertakings (Protection of Employment) Regulations compliance | HIGH |
| ELM-022 | Employee timeline view | Chronological view of all lifecycle events: status changes, salary changes, role changes, absences, disciplinary, training | Complete employment history at a glance for HR and management | HIGH |
| ELM-023 | Employment history reconstruction | View employee record as it existed at any historical date (point-in-time snapshot) | Audit queries, tribunal preparation, historical reporting accuracy | HIGH |
| ELM-024 | Effective-dated changes | All employment data changes (status, salary, role, department, grade) support effective dating with no overlapping records | Point-in-time accuracy for payroll, reporting, and audit | CRITICAL |
| ELM-025 | Bulk employee creation | Import multiple employees via CSV/Excel with field mapping, validation, error reporting, and rollback on failure | Mass onboarding, TUPE transfers, acquisitions, seasonal hiring | HIGH |
| ELM-026 | Employee merge and deduplication | Detect and merge duplicate employee records with field-level conflict resolution and full audit trail | Data quality, GDPR compliance, accurate headcount | MEDIUM |
| ELM-027 | Length of service calculation | Auto-calculate continuous service length accounting for breaks, TUPE transfers, and statutory exceptions (e.g., maternity) | Statutory entitlements (redundancy, notice), long service awards, absence tiers | HIGH |
| ELM-028 | Retirement date projection | Calculate projected retirement date based on state pension age and any contractual retirement age with workforce planning alerts | Succession planning triggers, workforce planning, pension communication | MEDIUM |
| ELM-029 | Death in service processing | Workflow for processing employee death: next-of-kin notification, benefits claims, payroll cessation, memorial | Compassionate, compliant handling of death in service | HIGH |
| ELM-030 | Continuous service date override | Allow manual override of continuous service date with mandatory reason and authorisation | TUPE transfers, NHS/public sector continuous service, tribunal settlements | HIGH |
| ELM-031 | Employee record locking | Lock terminated employee records after configurable retention period with unlock requiring elevated permissions | Data integrity, prevent accidental modification, compliance | MEDIUM |
| ELM-032 | Employee status change notifications | Auto-notify relevant parties (HR, IT, payroll, manager, facilities) on status changes via configured channels | Timely action on workforce changes, no manual handoff required | HIGH |

---

## 2. Employee Records & Personal Data

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| EPD-001 | Personal details capture | Full legal name, date of birth, gender, marital status, nationality, NI number with validation | Legal compliance, statutory reporting, payroll accuracy | CRITICAL |
| EPD-002 | Preferred name handling | Store legal name and preferred/known-as name separately for use in communications vs legal documents | Respectful workplace communication, inclusive culture | MEDIUM |
| EPD-003 | Title and honorifics | Support Mr, Mrs, Ms, Mx, Dr, Prof, Rev, and custom titles | Professional correspondence, cultural respect | LOW |
| EPD-004 | Pronoun recording | Store preferred pronouns (he/him, she/her, they/them, neo-pronouns, custom) with display preferences | Inclusive workplace practices, legal compliance trend | MEDIUM |
| EPD-005 | Contact information management | Home address (with UK postcode validation), personal email, personal phone, work email, work phone with effective dating | Employee communication, P60/P45 delivery, emergency response | CRITICAL |
| EPD-006 | Address history with effective dating | Maintain full address history with move-in/move-out dates for tax and correspondence accuracy | Payroll accuracy (Scottish tax), historical correspondence | HIGH |
| EPD-007 | Emergency contact management | Multiple emergency contacts with name, relationship, phone numbers, priority order, and medical authority flag | Emergency response, duty of care, H&S compliance | CRITICAL |
| EPD-008 | Dependant recording | Record spouse/partner and dependant details (name, DOB, relationship) for benefits, death-in-service, and tax | Benefits administration, life insurance nominations, childcare vouchers | MEDIUM |
| EPD-009 | National Insurance number validation | Validate NI number format (two prefix letters, six digits, one suffix letter) with uniqueness check per tenant | HMRC compliance, payroll accuracy, identity verification | CRITICAL |
| EPD-010 | Bank details management | Capture sort code (with BACS validation), account number, account name, building society reference with full audit trail | Payroll payments, BACS processing, fraud prevention | CRITICAL |
| EPD-011 | Tax code recording | Store current HMRC tax code with effective date, source (P45, HMRC notification, starter checklist), and cumulative/week-1 basis | Accurate PAYE deductions, avoid over/under-taxation | CRITICAL |
| EPD-012 | Student loan deduction tracking | Record student loan plan type (1, 2, 4, 5, postgraduate) with threshold tracking and concurrent loan handling | Correct student loan deductions per HMRC requirements | HIGH |
| EPD-013 | Diversity data collection | Ethnicity, disability status, religion, sexual orientation with opt-out option and anonymous aggregate reporting only | Equality Act 2010 compliance, diversity reporting, pay gap analysis | HIGH |
| EPD-014 | Disability and reasonable adjustments | Record disability details, Access to Work support, workplace adjustments required and implemented, review dates | Equality Act 2010 duty to make reasonable adjustments | HIGH |
| EPD-015 | Employee photo management | Upload, crop, resize, and store employee photographs with size/format validation and consent recording | Visual identification, ID badges, org charts, directory | LOW |
| EPD-016 | Qualification and certification tracking | Record professional qualifications, awarding body, date obtained, expiry date, CPD requirements, and evidence upload | Compliance (regulated industries), capability tracking, licence verification | HIGH |
| EPD-017 | Previous employment history | Record prior employers, dates, job titles, leaving reasons for reference checks and continuous service calculation | Background verification, NHS/public sector continuous service | MEDIUM |
| EPD-018 | Employee notes and annotations | Free-text notes on employee record with author, timestamp, category, and configurable access controls | Informal record keeping, context for future HR decisions | MEDIUM |
| EPD-019 | Employee attachments | Upload and manage documents against employee record with categorisation, virus scanning, and size limits | Supporting documentation storage, complete digital personnel file | HIGH |
| EPD-020 | Custom employee fields | Tenant-configurable custom fields with data types (text, number, date, dropdown, multi-select), validation, and reporting support | Flexibility for industry-specific and tenant-specific requirements | HIGH |
| EPD-021 | Employee data validation rules | Configurable validation rules per tenant: mandatory fields by status, format checks, cross-field validation, uniqueness constraints | Data quality enforcement, reduce downstream errors | HIGH |
| EPD-022 | Employee search and filtering | Full-text search across employee records with filters for status, department, location, grade, employment type, and custom fields | Efficient employee lookup for large workforces (1000+ employees) | CRITICAL |
| EPD-023 | Employee quick view card | Summary card showing key employee info (photo, name, title, department, status, contact) without full page navigation | Manager productivity, quick reference during meetings | HIGH |
| EPD-024 | Employee consent management | Track and manage employee consent for data processing with granular opt-in/opt-out, withdrawal recording, and re-consent workflows | UK GDPR compliance, lawful basis documentation | CRITICAL |
| EPD-025 | Data retention scheduling | Auto-flag and schedule deletion of employee data per configurable retention policy after termination (default 6 years per HMRC) | UK GDPR data minimisation, storage management | CRITICAL |
| EPD-026 | Work anniversary tracking | Track and surface work anniversaries with configurable milestone alerts (1, 5, 10, 15, 20, 25 years) | Employee engagement, recognition programmes, long service awards | LOW |
| EPD-027 | Employee self-service profile editing | Allow employees to update own personal details with immediate effect for non-sensitive fields and approval workflow for sensitive fields | Data accuracy, reduce HR admin burden, employee empowerment | HIGH |
| EPD-028 | Medical information recording | Record relevant medical conditions (with explicit consent), fit-for-work status, and occupational health referral history | Duty of care, health and safety, reasonable adjustments | HIGH |

---

## 3. Organisation Structure

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| ORG-001 | Department hierarchy management | Create, edit, and nest departments in a tree structure with effective dating and no orphaned nodes | Organisational clarity, reporting hierarchy, cost allocation | CRITICAL |
| ORG-002 | Division and business unit tracking | Top-level organisational units above departments with P&L ownership | Multi-entity reporting, strategic planning, cost allocation | HIGH |
| ORG-003 | Cost centre management | Define cost centres with codes, descriptions, owner, and mapping to departments/positions | Financial reporting, budget control, payroll costing | CRITICAL |
| ORG-004 | Location management | Physical locations with full addresses, time zones, jurisdiction assignment, and capacity | Multi-site operations, WTR compliance, facilities planning | CRITICAL |
| ORG-005 | Reporting hierarchy definition | Define who reports to whom with effective dating, validation (no circular references), and vacancy detection | Management structure, approval routing, cascade communication | CRITICAL |
| ORG-006 | Matrix reporting support | Secondary/dotted-line reporting relationships alongside primary line management with distinct permission scopes | Complex organisational structures, project-based working | MEDIUM |
| ORG-007 | Organisation chart visualisation | Interactive org chart with drill-down, search, filtering by department/location, and vacant position display | Organisational visibility for all employees and managers | HIGH |
| ORG-008 | Org chart export | Export org chart as PDF, PNG, or SVG for presentations and documentation | Communication with stakeholders, board presentations | MEDIUM |
| ORG-009 | Span of control analysis | Calculate and visualise management ratios per manager/department with configurable ideal ranges | Organisational efficiency, identify over/under-managed teams | MEDIUM |
| ORG-010 | Effective-dated org changes | All organisational changes (hierarchy, department, location assignments) must be effective-dated for historical accuracy | Historical reporting, planned restructures, audit compliance | CRITICAL |
| ORG-011 | Future-dated org restructure | Plan and schedule organisational changes for a future date with preview and impact analysis | Change management, communication planning, parallel structure preparation | HIGH |
| ORG-012 | Team management | Define teams within departments with team leads, members, and purpose (separate from formal org hierarchy) | Project-based working, agile teams, cross-functional groups | MEDIUM |
| ORG-013 | Legal entity management | Track multiple legal entities within a tenant with separate company numbers, PAYE references, and registered addresses | Multi-entity payroll, legal compliance, statutory reporting | HIGH |
| ORG-014 | PAYE reference assignment | Associate legal entities with HMRC PAYE references and Accounts Office references | RTI submissions, payroll compliance, multi-entity tax | HIGH |
| ORG-015 | Working pattern assignment | Assign standard working patterns to departments/locations as defaults for new employees | Time and absence calculation defaults, reduce setup effort | HIGH |
| ORG-016 | Public holiday calendar per location | Configure bank holidays and regional holidays per location/jurisdiction/legal entity with annual rollover | Accurate entitlement calculation, multi-jurisdiction support (England, Scotland, NI) | HIGH |
| ORG-017 | Organisational change history | Full audit trail of all structural changes with before/after snapshots and change reason | Governance, audit, restructure tracking | HIGH |
| ORG-018 | Department budget allocation | Assign salary, training, recruitment, and discretionary budgets to departments with tracking | Financial control, delegated budget management | MEDIUM |
| ORG-019 | Headcount reporting by structure | Real-time headcount broken down by department, location, grade, entity, employment type with FTE | Workforce analytics, board reporting, capacity planning | HIGH |
| ORG-020 | Org structure comparison | Compare organisation structure between two dates to visualise what changed and who was affected | Change impact analysis, restructure validation, audit | MEDIUM |
| ORG-021 | Delegation of authority matrix | Define approval limits and authority levels by grade, position, or role for financial and HR decisions | Governance, segregation of duties, audit compliance | HIGH |
| ORG-022 | Organisation closure and merge | Process department or location closures with employee reassignment, budget reallocation, and communication | Restructuring support, acquisition integration | MEDIUM |
| ORG-023 | Cross-entity reporting hierarchy | Support managers having direct reports across different legal entities within the same tenant | Multi-entity management, shared services | MEDIUM |
| ORG-024 | Organisation structure import/export | Bulk import/export of organisational structure via CSV/Excel for migration and bulk restructuring | Migration, restructuring, integration with org design tools | MEDIUM |

---

## 4. Position & Job Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| PJM-001 | Position management | Define positions (roles to be filled) as separate entities from employees with headcount control | Workforce planning, vacancy tracking, establishment control | HIGH |
| PJM-002 | Position budgeting | Track approved headcount per position with funded/unfunded status and budget source | Budget control, hiring approval governance | HIGH |
| PJM-003 | Position-to-employee assignment | Assign employees to positions with effective dating and support for one-to-many (job share) | Clear role accountability, headcount accuracy | HIGH |
| PJM-004 | Vacancy tracking | Identify unfilled positions with time-vacant calculation and link to recruitment requisitions | Recruitment prioritisation, capacity gap visibility | HIGH |
| PJM-005 | Job title management | Maintain a controlled, tenant-specific list of job titles mapped to grades, job families, and competency profiles | Consistency, external benchmarking, career framework | HIGH |
| PJM-006 | Job family and function taxonomy | Group job titles into families (Engineering, Finance, HR, Operations) and sub-families for reporting and career pathing | Career path definition, benchmarking, workforce analytics | MEDIUM |
| PJM-007 | Grade and band structure | Define pay grades/bands with minimum, midpoint, and maximum salary ranges by location/entity | Compensation governance, pay equity, market positioning | HIGH |
| PJM-008 | Grade progression rules | Define criteria for movement between grades: minimum time in grade, qualification requirements, performance threshold | Career framework transparency, objective progression criteria | MEDIUM |
| PJM-009 | Job description management | Create and maintain job descriptions with version control, approval workflow, and template library | Consistent job advertising, performance review reference, tribunal defence | HIGH |
| PJM-010 | Person specification management | Define essential and desirable criteria for each role linked to competency framework | Fair selection process, discrimination defence, objective assessment | HIGH |
| PJM-011 | Headcount planning | Plan future headcount by department, role, and period with scenario modelling against budget | Strategic workforce planning, budget alignment, growth management | HIGH |
| PJM-012 | Establishment control | Prevent hiring above approved establishment (budgeted positions) without explicit override | Budget discipline, governance, prevent headcount drift | HIGH |
| PJM-013 | Job evaluation and sizing | Record job evaluation scores (e.g., Hay, Willis Towers Watson) for grade assignment and benchmarking | Objective grading, equal pay defence, market comparison | MEDIUM |
| PJM-014 | Competency profile per role | Define required competencies and proficiency levels for each position/job title | Recruitment criteria, performance assessment, development planning | HIGH |
| PJM-015 | Role-based training requirements | Define mandatory and recommended training per position/job title for auto-assignment | Compliance training automation, role readiness | HIGH |

---

## 5. Contracts & Employment Terms

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| CET-001 | Employment contract generation | Generate employment contracts from templates with mail merge of employee, role, and compensation data | Efficient, consistent, legally compliant contract creation | HIGH |
| CET-002 | Contract type tracking | Classify contracts: permanent, fixed-term, zero-hours, casual, apprenticeship, agency, contractor | Employment rights determination, statutory reporting | CRITICAL |
| CET-003 | Fixed-term contract end date tracking | Track and alert on approaching fixed-term contract end dates; flag 4+ years continuous for automatic permanent status | Legal compliance (Fixed-term Employees Regulations), workforce planning | CRITICAL |
| CET-004 | Fixed-term contract renewal | Process contract renewals with updated terms, capturing objective justification for continued fixed-term use | Avoid inadvertent permanent employment, tribunal defence | HIGH |
| CET-005 | Zero-hours contract management | Track zero-hours workers with separate entitlement calculations, no guaranteed hours, and exclusivity clause ban | Employment law compliance, fair treatment | HIGH |
| CET-006 | Contract amendment processing | Record changes to contractual terms (hours, salary, location, duties) with effective dates and signed acknowledgement | Contractual compliance, change audit trail, dispute prevention | CRITICAL |
| CET-007 | Section 1 statement compliance | Ensure all Employment Rights Act 1996 s.1 written particulars are captured and issued from day one of employment | Legal compliance (post-April 2020 requirement), tribunal defence | CRITICAL |
| CET-008 | Probation period management | Track probation start/end dates, extension with reason, review schedule, and outcome (pass/fail/extend) | Performance management for new starters, legal clarity | HIGH |
| CET-009 | Probation review reminders | Auto-remind managers of upcoming probation review deadlines with escalation on overdue | Timely probation decisions, avoid implied permanent status | HIGH |
| CET-010 | Notice period tracking | Record contractual and statutory notice periods per employee with auto-calculation of notice end date | Termination management, resource planning | CRITICAL |
| CET-011 | Statutory notice period calculation | Auto-calculate statutory minimum notice (1 week per year of service, max 12 weeks) and compare with contractual | Legal compliance, ensure greater-of-the-two is applied | CRITICAL |
| CET-012 | Working hours recording | Track contracted weekly hours, actual hours worked, and automatic FTE calculation | WTR compliance, absence pro-rata, payroll accuracy | CRITICAL |
| CET-013 | Working pattern definition | Define work patterns (days of week, start/end times) with support for compressed hours, part-time, and shift patterns | Time and absence calculations, scheduling, payroll | HIGH |
| CET-014 | FTE calculation | Automatically calculate Full-Time Equivalent based on contracted hours vs organisation standard full-time hours | Headcount reporting, cost analysis, absence pro-rata | HIGH |
| CET-015 | Flexible working request processing | Handle statutory flexible working requests (day-one right post-April 2024) with 2-month decision deadline tracking | Employment Rights Act compliance, employee retention | HIGH |
| CET-016 | Work location specification | Record primary work location, hybrid working arrangement, home working days, and desk allocation | Facilities planning, tax implications, H&S (home worker DSE) | HIGH |
| CET-017 | Right to work documentation | Track right-to-work document types (List A/B), copies, verification date, verifier, and expiry dates | Immigration compliance, civil penalty avoidance (up to 45K per worker) | CRITICAL |
| CET-018 | Right to work share code verification | Support Home Office online right-to-work check with share code recording and screenshot storage | Current immigration checking service requirements | CRITICAL |
| CET-019 | Visa and immigration status tracking | Track visa type, sponsor, expiry date, work restrictions, and Certificates of Sponsorship | Prevent illegal working, sponsor licence compliance | CRITICAL |
| CET-020 | Continuous employment calculation | Calculate continuous employment dates accounting for breaks, TUPE, maternity, and statutory exceptions | Redundancy pay eligibility, unfair dismissal qualification period | HIGH |
| CET-021 | Contract template management | Create and manage contract templates with versioning, conditional clauses, and role-based selection rules | Efficient, consistent contract generation at scale | HIGH |
| CET-022 | Restrictive covenant tracking | Record post-employment restrictions (non-compete, non-solicitation, confidentiality) with duration and scope | Protect business interests, enforce on termination | MEDIUM |
| CET-023 | Collective agreement tracking | Record which collective agreements apply to which employee groups with terms and negotiation history | Unionised workforce management, pay bargaining | MEDIUM |
| CET-024 | Agency worker tracking | Track agency workers with Agency Workers Regulations 12-week qualification date and comparable terms obligation | AWR 2010 compliance, cost management | HIGH |
| CET-025 | IR35 status determination | Record and track IR35 determination for off-payroll workers with Status Determination Statement and dispute process | Off-Payroll Working Rules compliance, tax liability avoidance | HIGH |
| CET-026 | Contract version history | Maintain full version history of all contract iterations with diff comparison and download | Audit trail, dispute resolution, tribunal bundle | HIGH |
| CET-027 | Digital contract signing | E-signature integration for contract execution with legally binding audit trail (eIDAS/UK equivalent compliant) | Efficient contract execution, remote hiring, reduced paper | HIGH |
| CET-028 | Contractual benefits recording | Record non-salary contractual benefits: car allowance, private medical, bonus eligibility, enhanced pension | Total compensation tracking, contract accuracy | HIGH |
| CET-029 | Hours change impact analysis | When changing contracted hours, auto-calculate impact on leave entitlement, salary, pension contributions, and benefits | Accurate downstream adjustments, prevent manual errors | HIGH |
| CET-030 | Mass contract amendment | Process bulk contract changes (e.g., annual pay review, policy changes, hours changes) with individual consent tracking | Efficient large-scale changes, evidence of agreement | MEDIUM |

---

## 6. Compensation & Payroll

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| CPY-001 | Pay period configuration | Define pay periods: weekly, fortnightly, four-weekly, monthly, with period dates and cut-off dates | Payroll processing structure, multi-frequency support | CRITICAL |
| CPY-002 | Pay schedule assignment | Assign employees to pay schedules with effective dating and mid-period transfer handling | Multi-frequency payroll support, accurate period allocation | CRITICAL |
| CPY-003 | Salary recording with effective dating | Record annual salary, hourly rate, or daily rate with effective dates, change reason, and authoriser | Compensation management, historical accuracy, audit trail | CRITICAL |
| CPY-004 | Salary history tracking | Maintain full history of all salary changes with effective dates, reasons, authoriser, and percentage change | Trend analysis, equal pay audit, tribunal preparation | CRITICAL |
| CPY-005 | Salary band and range definition | Define min, mid, max salary ranges per grade/level with location and entity variations | Compensation governance, market positioning, pay equity | CRITICAL |
| CPY-006 | Compa-ratio calculation | Calculate employee salary position within band (salary / midpoint) with distribution analysis | Pay equity analysis, identify outliers, review prioritisation | HIGH |
| CPY-007 | Annual pay review process | Structured annual salary review with budget allocation per department, manager recommendations, multi-level approval | Organised, fair, budget-controlled compensation management | CRITICAL |
| CPY-008 | Pay review budget modelling | Model pay review scenarios with budget constraints, distribution rules (merit matrix, flat, percentage), and cost projection | Cost-controlled pay decisions before commitment | HIGH |
| CPY-009 | Pay element configuration | Define recurring and one-off pay elements: allowances, deductions, overtime rates, shift premiums with tax treatment | Flexible pay structure for diverse compensation arrangements | HIGH |
| CPY-010 | Recurring deduction management | Set up and manage recurring deductions: union dues, charity (Give As You Earn), cycle-to-work, season ticket loan | Automated payroll processing, employee benefits | HIGH |
| CPY-011 | One-off payment processing | Process ad-hoc payments: bonuses, arrears, expense reimbursements, referral rewards for specific pay periods | Exception pay management, timely compensation | HIGH |
| CPY-012 | Bonus scheme management | Define bonus schemes with eligibility criteria, targets, calculation rules, payment schedule, and clawback terms | Performance-linked compensation, retention, alignment | HIGH |
| CPY-013 | Bonus calculation and processing | Calculate individual bonuses based on performance ratings, company performance multiplier, and scheme rules | Accurate incentive payments, transparent methodology | HIGH |
| CPY-014 | National Minimum Wage compliance | Validate pay rates against current NMW/NLW bands by employee age with auto-update on threshold changes | Legal compliance, avoid prosecution and naming | CRITICAL |
| CPY-015 | NMW age band tracking | Auto-update applicable NMW rate when employee crosses age threshold (18, 21, 23) and flag underpayment risk | Compliance automation, prevent accidental breach | HIGH |
| CPY-016 | Tax code management | Record and update HMRC tax codes with source, effective date, basis (cumulative/week-1/month-1), and Scottish/Welsh indicator | Accurate PAYE deductions, devolved tax compliance | CRITICAL |
| CPY-017 | National Insurance category tracking | Record NI category letter (A, B, C, H, M, Z, etc.) with effective dates for correct contribution calculation | NIC accuracy, apprentice levy relief, veteran exemption | CRITICAL |
| CPY-018 | Student loan deduction management | Track student loan plan type and deduction status with threshold checking and concurrent Plan 1 + Plan 2 handling | Correct deduction application per HMRC SL1/SL2 | HIGH |
| CPY-019 | Benefits in Kind recording | Record non-cash benefits with P11D values, Class 1A NIC implications, and optional payrolling election | HMRC compliance, accurate tax treatment | HIGH |
| CPY-020 | P11D reporting | Generate P11D data for benefits in kind and expenses reporting to HMRC by 6 July deadline | Annual HMRC obligation, employee tax liability notification | HIGH |
| CPY-021 | Payrolling of benefits | Support real-time taxation of benefits through payroll instead of P11D reporting with HMRC registration tracking | Simplified administration, real-time tax accuracy | MEDIUM |
| CPY-022 | P45 generation | Generate P45 (parts 1A, 2, 3) on employee termination with correct tax/NI data for the leaving date | Legal requirement for leavers, HMRC compliance | CRITICAL |
| CPY-023 | P60 generation | Generate annual P60 certificates for all employees paid during the tax year by 31 May deadline | Legal requirement, employee tax documentation | CRITICAL |
| CPY-024 | Starter checklist processing | Process HMRC Starter Checklist (Statement A/B/C) for new employees without P45 to determine initial tax code | New starter tax code determination, avoid emergency tax | HIGH |
| CPY-025 | RTI FPS submission data | Generate Full Payment Submission data for HMRC on or before each payday with YTD totals | Real Time Information compliance, avoid penalties | CRITICAL |
| CPY-026 | RTI EPS submission data | Generate Employer Payment Summary for recoverable amounts (SMP, SPP, SAP, ShPP), NICs, Apprenticeship Levy | Real Time Information compliance, claim statutory pay recovery | HIGH |
| CPY-027 | Payslip generation | Generate detailed payslips showing gross pay, all deductions itemised, net pay, YTD figures, employer pension contribution | Statutory right (Employment Rights Act), transparency | CRITICAL |
| CPY-028 | Electronic payslip distribution | Distribute payslips via employee self-service portal with email notification and download capability | Efficient, secure, environmentally friendly distribution | HIGH |
| CPY-029 | Salary sacrifice management | Record salary sacrifice arrangements (pension, cycle-to-work, EV) with pensionable pay impact and NIC savings calculation | Tax-efficient benefits, accurate pension contributions | HIGH |
| CPY-030 | Auto-enrolment pension compliance | Determine eligible jobholders, assess and auto-enrol, handle opt-out within 1-month window, and postponement | Pensions Act 2008 compliance, avoid TPR penalties | CRITICAL |
| CPY-031 | Pension contribution calculation | Calculate employer and employee pension contributions at correct rates for qualifying earnings or total pay basis | Pension scheme compliance, accurate pay | CRITICAL |
| CPY-032 | Pension scheme management | Track multiple pension schemes per tenant (DC, DB, master trust) with provider details and contribution rules | Multi-scheme administration, merger scenarios | HIGH |
| CPY-033 | Pension re-enrolment | Manage cyclical re-enrolment (every 3 years) of opted-out eligible jobholders with TPR declaration | Auto-enrolment compliance, avoid TPR enforcement | HIGH |
| CPY-034 | Apprenticeship Levy calculation | Calculate Apprenticeship Levy at 0.5% of total pay bill for employers with pay bill over 3M, net of 15K allowance | HMRC compliance, digital apprenticeship account management | HIGH |
| CPY-035 | Gender pay gap data preparation | Calculate and report mean/median hourly pay gaps and bonus gaps by gender across pay quartiles at snapshot date | Equality Act 2010 (Gender Pay Gap Information) Regulations compliance | CRITICAL |
| CPY-036 | CEO pay ratio reporting | Calculate ratio of CEO total pay to 25th, 50th, and 75th percentile full-time equivalent employee pay | Companies (Miscellaneous Reporting) Regulations 2018 for quoted companies | HIGH |
| CPY-037 | Holiday pay calculation (Harpur Trust) | Calculate holiday pay including regular overtime, commission, allowances, and other regular payments per case law | Legal compliance with Harpur Trust v Brazel and Working Time Regulations | CRITICAL |
| CPY-038 | Final pay calculation | Calculate final pay including pro-rata salary, outstanding holiday pay, PILON, deductions, and notice period | Accurate leaver payment, avoid underpayment claims | CRITICAL |
| CPY-039 | Back-pay calculation | Calculate arrears when salary changes or corrections are backdated past processed payroll periods | Accurate retrospective pay, employee trust, compliance | HIGH |
| CPY-040 | Attachment of earnings processing | Process court-ordered deductions (DEOs, council tax AEOs, CCJs) with priority rules and protected earnings | Legal obligation, correct priority ordering | HIGH |
| CPY-041 | Payroll variance reporting | Compare current period payroll with previous period, highlighting significant changes for review before finalisation | Error detection, fraud prevention, payroll accuracy | HIGH |
| CPY-042 | Payroll costing report | Break down payroll costs by department, cost centre, project, and entity for journal posting | Financial management, budget monitoring, cost allocation | HIGH |
| CPY-043 | Payroll journal generation | Generate accounting journals from payroll data in format suitable for general ledger posting | Financial system integration, month-end close | HIGH |
| CPY-044 | Payroll period locking | Lock time and pay data for completed payroll periods to prevent retrospective changes without formal amendment process | Payroll integrity, audit trail, prevent retroactive manipulation | CRITICAL |

---

## 7. Absence & Leave Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| ALM-001 | Holiday entitlement calculation | Calculate statutory minimum (5.6 weeks / 28 days including bank holidays) and enhanced contractual entitlement | Legal compliance, accurate employee benefit tracking | CRITICAL |
| ALM-002 | Pro-rata holiday calculation | Auto-calculate entitlement for part-year starters, leavers, and part-time workers using 12.07% or Working Days method | Fair entitlement, legal compliance, Part-Time Workers Regulations | CRITICAL |
| ALM-003 | Holiday year configuration | Configurable holiday year per tenant/entity: calendar year, April-March, custom start date | Flexible configuration matching business financial year | HIGH |
| ALM-004 | Holiday carry-over rules | Configurable carry-over limits with separate handling for statutory 1.6 weeks (EU derived, cannot be lost) and contractual enhancement | Policy enforcement, liability management, legal compliance | HIGH |
| ALM-005 | Holiday booking workflow | Employee submits request specifying dates and type, manager approves/rejects with mandatory reason for rejection | Controlled absence planning, fair process, audit trail | CRITICAL |
| ALM-006 | Holiday calendar view | Team and department calendar showing approved, pending, and conflicting holidays with drag-and-drop booking | Resource planning, conflict identification, visual planning | HIGH |
| ALM-007 | Holiday clash detection | Warn or block when holiday request conflicts with team minimum coverage rules or concurrent absence limits | Operational continuity, prevent under-staffing | HIGH |
| ALM-008 | Compulsory holiday (shutdown) booking | Admin can assign compulsory holiday dates (e.g., Christmas shutdown) that auto-deduct from entitlement with advance notice | Operational shutdowns, fair allocation of closure costs | HIGH |
| ALM-009 | Holiday balance dashboard | Real-time view of total entitlement, taken, booked (future), carry-over, remaining, and pending requests | Employee and manager visibility, prevent year-end rush | CRITICAL |
| ALM-010 | Bank holiday handling | Configurable bank holiday treatment per employee group: automatic day off, included in entitlement calculation, or enhanced pay | Flexible policy for different worker types (shift, office, part-time) | HIGH |
| ALM-011 | Sick leave recording | Record sickness absence with start date, end date, reason category (ICD-10 or simplified), and return-to-work details | Absence tracking, SSP calculation, duty of care | CRITICAL |
| ALM-012 | Self-certification period | Track 7-calendar-day self-certification period before fit note is required with automated notification | SSP compliance, reduce unnecessary GP visits | CRITICAL |
| ALM-013 | Fit note management | Record fit note details: date, duration, GP/consultant name, conditions, and recommended adjustments (may be fit/not fit) | SSP compliance, return-to-work planning, phased return | CRITICAL |
| ALM-014 | SSP qualification checking | Determine SSP eligibility: qualifying days, 3 waiting days, Lower Earnings Limit test, linked spells (8-week gap), 28-week maximum | Statutory Sick Pay Regulations compliance | CRITICAL |
| ALM-015 | SSP calculation | Calculate SSP at current statutory weekly rate for qualifying days within the 28-week entitlement period | Payroll accuracy, statutory minimum compliance | CRITICAL |
| ALM-016 | Occupational sick pay scheme | Track enhanced company sick pay entitlement with service-based tiers (e.g., 0-1yr: 4 weeks full / 4 weeks half) | Policy administration, employee benefit | HIGH |
| ALM-017 | Return-to-work interview tracking | Record RTW interview: date, interviewer, outcome, agreed adjustments, referral to OH, follow-up date | Duty of care, attendance management, legal compliance | HIGH |
| ALM-018 | Bradford Factor calculation | Auto-calculate Bradford Factor (S x S x D) with configurable trigger points, actions, and historical trend | Attendance management, objective trigger-based intervention | HIGH |
| ALM-019 | Absence trigger alerts | Configurable alerts when absence hits trigger points: frequency count, total days, Bradford Factor, back-to-back Mondays/Fridays | Proactive absence management, early intervention | HIGH |
| ALM-020 | Maternity leave management | Track maternity: EWC, MATB1 receipt, intended start date (11 weeks before EWC), actual dates, return date, KIT days used | Statutory compliance, accurate pay calculation, resource planning | CRITICAL |
| ALM-021 | SMP qualification and calculation | Determine SMP eligibility (26 weeks continuous employment + LEL test) and calculate: 90% of AWE for 6 weeks, then statutory rate or 90% (whichever lower) for 33 weeks | Legal compliance, payroll accuracy | CRITICAL |
| ALM-022 | Enhanced maternity pay | Track company-enhanced maternity pay above SMP with clawback rules if employee does not return for minimum period | Benefits administration, retention mechanism | HIGH |
| ALM-023 | Maternity KIT days | Track up to 10 Keeping In Touch days with pay calculation, purpose, and mutual agreement recording | Statutory entitlement management, smooth return support | HIGH |
| ALM-024 | Paternity leave management | Track 1 or 2 weeks paternity leave (now flexible blocks post-April 2024) within 52 weeks of birth, eligibility checking | Statutory compliance, modern family support | CRITICAL |
| ALM-025 | SPP calculation | Calculate Statutory Paternity Pay at statutory flat rate or 90% AWE (whichever lower) for eligible weeks | Payroll accuracy, statutory compliance | CRITICAL |
| ALM-026 | Adoption leave management | Track adoption leave with matching certificate, placement date, notice requirements, and KIT days | Statutory compliance, equal treatment with maternity | HIGH |
| ALM-027 | Shared parental leave (SPL) | Track SPL: SPLIT days, curtailment notices, partner employer declarations, continuous and discontinuous leave blocks | Statutory compliance, complex entitlement management | HIGH |
| ALM-028 | ShPP calculation | Calculate Shared Parental Pay based on remaining SMP/SAP/SPP entitlement with correct rates | Payroll accuracy, statutory compliance | HIGH |
| ALM-029 | Parental bereavement leave | Track 2 weeks statutory parental bereavement leave with flexible booking window (56 weeks from death) | Parental Bereavement (Leave and Pay) Act 2018 compliance | HIGH |
| ALM-030 | Unpaid parental leave | Track 18 weeks unpaid parental leave per child (max 4 weeks per year per child, up to child's 18th birthday) | Statutory entitlement management, Employment Rights Act | HIGH |
| ALM-031 | Neonatal care leave | Track up to 12 weeks neonatal care leave for parents of babies receiving neonatal care (7+ consecutive days) | Neonatal Care (Leave and Pay) Act 2023 compliance | HIGH |
| ALM-032 | Carer's leave | Track 1 week unpaid carer's leave per year (day-one right, flexible booking in half/full days) | Carer's Leave Act 2023 compliance | HIGH |
| ALM-033 | Compassionate leave management | Track compassionate/bereavement leave with configurable entitlement per tenant and relationship category | Policy administration, employee support during grief | HIGH |
| ALM-034 | Jury service leave | Record jury service absence with certificate tracking, pay handling (employer offset), and duration | Legal obligation compliance, employee support | HIGH |
| ALM-035 | Time off for dependants | Record emergency time off for dependants as statutory right (reasonable unpaid time, no cap on occasions) | Employment Rights Act compliance, employee support | HIGH |
| ALM-036 | Study and exam leave | Track study leave entitlement and usage linked to approved qualifications or training programmes | Development support, retention | MEDIUM |
| ALM-037 | Sabbatical and career break | Manage extended unpaid leave with terms preservation, return-to-work date, and benefits continuation options | Talent retention, employee wellbeing | MEDIUM |
| ALM-038 | TOIL booking and balance | Allow employees to book time off against accrued Time Off In Lieu balance with approval and expiry rules | Flexible compensation, overtime offset | HIGH |
| ALM-039 | Absence approval delegation | Allow managers to delegate absence approval to named deputies during their own absence with date range | Business continuity, prevent approval bottlenecks | HIGH |
| ALM-040 | Half-day and hourly absence | Support booking half-day absences (AM/PM) and hourly absences for flexi-time workers | Common requirement for flexibility, accurate deduction | HIGH |
| ALM-041 | Absence accrual and liability reporting | Calculate leave accruals on monthly/quarterly basis for financial reporting (IAS 19 / FRS 102) | Financial reporting compliance, liability management | HIGH |
| ALM-042 | Long-term sickness management | Workflow for managing long-term sick: OH referral triggers, welfare meetings, reasonable adjustments, capability process, ill-health retirement | Duty of care, legal compliance, return-to-work support | HIGH |
| ALM-043 | Occupational health referral tracking | Record OH referrals: reason, appointment date, report received date, recommendations, and follow-up actions | Duty of care, medical evidence management, reasonable adjustments | HIGH |
| ALM-044 | Absence cost reporting | Calculate cost of absence by employee, department, reason, and period including salary cost and cover cost | Financial impact analysis, business case for intervention | MEDIUM |
| ALM-045 | Absence pattern reporting | Identify absence patterns by day of week, month, department, manager, and reason for management insight | Pattern identification, targeted management action | MEDIUM |
| ALM-046 | Holiday purchase/sell scheme | Allow employees to buy additional holiday or sell unused days within configured limits per year | Flexible benefits, employee choice | MEDIUM |
| ALM-047 | Absence type configuration | Tenant-configurable absence types with pay rules, entitlement rules, evidence requirements, and approval workflow | Flexible policy implementation for diverse organisations | CRITICAL |
| ALM-048 | Absence entitlement by service | Auto-increase leave entitlement based on length of service with configurable tiers and effective dates | Reward long service, competitive benefits | HIGH |
| ALM-049 | Absence data export for payroll | Export absence data for external payroll processing with period filtering and pay impact calculation | Payroll integration, accurate statutory pay | HIGH |

---

## 8. Time & Attendance

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| TAT-001 | Clock in/out recording | Record clock-in and clock-out events with precise timestamp, source device, and location | Accurate time capture for hourly and shift workers | CRITICAL |
| TAT-002 | Multiple clock sources | Support web browser, mobile app, biometric terminal, RFID reader, and shared kiosk clock methods | Flexible time capture for different work environments | HIGH |
| TAT-003 | GPS/geofence clock validation | Validate clock events against defined geographical boundaries with configurable radius and alert on violation | Prevent buddy clocking, field worker verification, site compliance | MEDIUM |
| TAT-004 | Timesheet submission | Weekly/fortnightly/monthly timesheet entry with project/task/cost centre allocation and notes | Time recording for salaried and project-based staff | HIGH |
| TAT-005 | Timesheet approval workflow | Manager approval of submitted timesheets with line-by-line review, bulk approve, and rejection with reason | Authorisation before payroll processing, cost accuracy | HIGH |
| TAT-006 | Overtime recording and categorisation | Capture overtime hours with type (voluntary, mandatory, emergency, bank holiday) and applicable pay rate | Payroll accuracy, WTR monitoring, cost tracking | HIGH |
| TAT-007 | Overtime pre-authorisation | Pre-approval workflow for overtime with budget impact visibility before hours are worked | Cost control, prevent unauthorised overtime | HIGH |
| TAT-008 | Overtime rate calculation | Calculate overtime pay at configurable rates (1x, 1.5x, 2x, custom) by day of week, time of day, and contract terms | Payroll accuracy, contractual compliance | HIGH |
| TAT-009 | TOIL accrual from overtime | Convert approved overtime hours to Time Off In Lieu balance instead of or in addition to payment | Flexible compensation, employee choice, cost management | HIGH |
| TAT-010 | Shift pattern management | Define rotating, fixed, and flexible shift patterns with cycle length, handover times, and rest period validation | Shift workforce scheduling, operational coverage | HIGH |
| TAT-011 | Shift allocation | Assign employees to shifts with conflict detection, skill matching, and coverage gap alerting | Operational coverage, fair allocation | HIGH |
| TAT-012 | Shift swap requests | Employee-initiated shift swaps with peer agreement and manager approval workflow | Workforce flexibility, employee satisfaction, reduced absence | MEDIUM |
| TAT-013 | Shift premium calculation | Auto-calculate shift allowances for nights, weekends, bank holidays, and unsocial hours per contractual rules | Accurate compensation for shift workers | HIGH |
| TAT-014 | Break time tracking and enforcement | Record and enforce break periods per Working Time Regulations (20 minutes per 6-hour shift minimum) | WTR compliance, duty of care, payroll accuracy | HIGH |
| TAT-015 | Working Time Regulations monitoring | Track weekly hours against 48-hour WTR limit using 17-week rolling reference period | Legal compliance, prevent WTR breach | CRITICAL |
| TAT-016 | WTR opt-out management | Record individual opt-outs from 48-hour week with voluntary consent, withdrawal handling (7-day minimum notice) | WTR compliance, evidence of voluntary agreement | CRITICAL |
| TAT-017 | Night worker identification and limits | Identify night workers (regularly work 3+ hours during night period) and enforce 8-hour average limit | WTR night worker protections, health assessment triggers | HIGH |
| TAT-018 | Daily and weekly rest period tracking | Monitor 11-hour daily rest between shifts and 24-hour weekly rest (or 48-hour fortnightly) | WTR compliance, worker welfare | HIGH |
| TAT-019 | Flexi-time management | Track flexi-time balance with core hours enforcement, debit/credit limits, and carry-over rules | Flexible working support, accurate attendance | MEDIUM |
| TAT-020 | Time rounding rules | Configurable rounding rules for clock events (nearest 5/15/30 min, specific direction, grace periods) | Payroll consistency, fair treatment | MEDIUM |
| TAT-021 | Late arrival and early departure tracking | Flag and report late arrivals and early departures against scheduled start/end times with configurable thresholds | Attendance management, identify patterns | MEDIUM |
| TAT-022 | Unplanned absence detection | Auto-detect no-shows where employee is scheduled but has not clocked in by threshold time, with manager alert | Operational response, trigger absence recording | HIGH |
| TAT-023 | Time exception management | Flag and route anomalies (missed clocks, excessive hours, short shifts, double clocks) for manager review | Data quality, payroll accuracy, compliance | HIGH |
| TAT-024 | Manager timesheet override | Allow managers to correct timesheet entries with mandatory reason and full audit trail | Error correction, data accuracy | HIGH |
| TAT-025 | Payroll export generation | Generate time data exports in configurable payroll system format for the pay period with reconciliation totals | Payroll integration, automated data transfer | CRITICAL |
| TAT-026 | Project time tracking | Allocate time to projects and clients with reporting and billing support | Professional services, cost allocation, client invoicing | MEDIUM |
| TAT-027 | Annual hours tracking | Support annual hours contracts with periodic reconciliation against worked hours and deficit/surplus management | Flexible contract management, seasonal workload | MEDIUM |
| TAT-028 | Time and attendance dashboard | Real-time dashboard showing who is clocked in, who is absent, attendance rates, and exception counts | Operational visibility for managers and HR | HIGH |
| TAT-029 | Historical timesheet amendment | Process retrospective timesheet corrections with payroll adjustment flagging and approval workflow | Error correction, back-pay/clawback calculation | HIGH |
| TAT-030 | Attendance pattern analysis | Identify patterns: regular lateness, day-of-week absence, declining attendance trends per individual | Proactive attendance management, objective evidence | MEDIUM |

---

## 9. Recruitment & ATS

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| REC-001 | Job requisition creation | Create requisition with role, department, grade, salary range, budget code, justification, and headcount request | Controlled hiring process, budget alignment | CRITICAL |
| REC-002 | Requisition approval workflow | Multi-level approval (hiring manager, HR BP, finance, department head) before recruitment commences | Budget control, governance, headcount management | CRITICAL |
| REC-003 | Job posting to careers page | Publish approved roles to tenant-branded careers page with SEO-friendly URLs and application form | Attract direct applicants, employer branding | HIGH |
| REC-004 | Multi-channel job distribution | Post to external job boards (Indeed, LinkedIn, Reed, Totaljobs, Civil Service Jobs) via integration or multiposting | Maximise candidate reach, source diversity | MEDIUM |
| REC-005 | Internal job posting | Post vacancies internally first or simultaneously with external channels with internal-only window option | Internal mobility, employee engagement, retention | HIGH |
| REC-006 | Application form builder | Configurable application forms with custom questions, required fields, and conditional sections per role | Relevant candidate information capture, fair process | HIGH |
| REC-007 | CV/resume parsing | Auto-extract candidate data from uploaded CVs into structured profile fields | Reduce manual data entry, faster processing | MEDIUM |
| REC-008 | Candidate profile management | Store candidate details, application history, communication log, documents, and interview feedback | Complete candidate view, multi-vacancy tracking | CRITICAL |
| REC-009 | Application status tracking | Track each application through configurable stages (applied, screened, shortlisted, interviewed, offered, hired, rejected, withdrawn) | Pipeline visibility, bottleneck identification | CRITICAL |
| REC-010 | Candidate pipeline visualisation | Kanban-style view of candidates across recruitment stages with drag-and-drop stage progression | Recruitment progress visibility, intuitive management | HIGH |
| REC-011 | Screening question scoring | Score candidate responses to screening questions for automated initial filtering with pass/fail threshold | Efficient initial screening, objective first cut | MEDIUM |
| REC-012 | Interview scheduling | Schedule interviews with calendar integration, room booking, candidate notification, and time zone handling | Efficient interview management, candidate experience | HIGH |
| REC-013 | Interview panel management | Assign interview panels with roles (chair, HR, technical assessor, peer) and manage availability | Structured, fair interview process with diverse panels | HIGH |
| REC-014 | Interview scorecard | Structured scoring forms aligned to person specification criteria with competency-based questions | Objective assessment, Equality Act defence, consistent evaluation | HIGH |
| REC-015 | Interview feedback capture | Collect and store interviewer feedback with scoring, narrative comments, and recommendation (hire/reject/hold) | Auditable selection decisions, evidence for challenge | HIGH |
| REC-016 | Offer letter generation | Generate offer letters from configurable templates with role, salary, benefits, start date, and conditions | Efficient offer process, consistent communication | HIGH |
| REC-017 | Offer approval workflow | Approval for offers, especially those exceeding grade midpoint, outside salary band, or above budget | Compensation governance, budget control | HIGH |
| REC-018 | Conditional offer tracking | Track conditions (references, DBS, right-to-work, medical clearance, qualification verification) with individual status | Risk management before unconditional offer/start | HIGH |
| REC-019 | Reference request management | Send reference requests via email, track responses, flag concerns, and store reference reports | Pre-employment verification, duty of care | HIGH |
| REC-020 | DBS check initiation | Initiate DBS checks (basic, standard, enhanced, enhanced with barred list) and track through to certificate receipt | Safeguarding compliance, regulated activity verification | HIGH |
| REC-021 | Candidate communication templates | Email/SMS templates for each recruitment stage with personalisation tokens and scheduling | Consistent, timely candidate experience | HIGH |
| REC-022 | Candidate self-service portal | Allow candidates to view application status, upload documents, book interview slots, and complete pre-hire forms | Candidate experience, admin reduction, modern process | MEDIUM |
| REC-023 | Recruitment analytics dashboard | Metrics: time-to-fill, time-to-hire, cost-per-hire, source effectiveness, conversion rates by stage, diversity stats | Recruitment performance management, optimisation | HIGH |
| REC-024 | Equal opportunities monitoring | Collect diversity data from applicants separately from selection process with anonymised aggregate reporting | Equality Act compliance, positive action evidence | HIGH |
| REC-025 | Guaranteed interview scheme | Flag and track candidates qualifying for guaranteed interview (Disability Confident, veterans, care leavers) | Employer scheme obligations, inclusive recruitment | MEDIUM |
| REC-026 | Talent pool management | Maintain pools of silver-medal candidates and speculative applicants for future roles with GDPR-compliant retention | Proactive sourcing, reduced time-to-fill for future roles | MEDIUM |
| REC-027 | Candidate GDPR consent and retention | Capture and manage candidate consent for data retention with configurable auto-purge periods (typically 6-12 months) | UK GDPR compliance, data minimisation | CRITICAL |
| REC-028 | Onboarding trigger from ATS | Auto-initiate onboarding workflow when candidate status changes to hired, passing all captured data | Seamless hire-to-onboard transition, zero rekeying | HIGH |
| REC-029 | Hiring manager portal | Simplified interface for hiring managers to manage their vacancies, review candidates, and provide feedback | Self-service, reduce HR bottleneck, manager engagement | HIGH |
| REC-030 | Blind CV screening | Remove or mask identifying information (name, age, gender, university, photo) from CVs for initial screening | Reduce unconscious bias, fairer shortlisting | MEDIUM |
| REC-031 | Recruitment compliance audit | Track that all selection decisions have documented, objective justification linked to person specification | Tribunal defence, fair process evidence | HIGH |
| REC-032 | Agency and recruitment vendor management | Track agency terms, preferred supplier list, fee schedules, and performance metrics | Supplier management, cost control, consolidated view | MEDIUM |

---

## 10. Onboarding

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| ONB-001 | Onboarding checklist templates | Configurable onboarding checklists by role, department, location, and employment type with task dependencies | Consistent, thorough, role-appropriate onboarding | CRITICAL |
| ONB-002 | Pre-boarding portal | Self-service portal for new starters before day one to complete forms, read policies, and access welcome content | Reduce day-one admin, improve first impression, early engagement | HIGH |
| ONB-003 | Document collection workflow | Track required documents (ID, qualifications, right-to-work, bank details form) with upload, verification, and chase reminders | Compliance, complete personnel file before or on day one | CRITICAL |
| ONB-004 | Right-to-work verification process | Structured workflow for right-to-work checks: document type validation, copy storage, verifier sign-off, expiry tracking | Immigration compliance, civil penalty avoidance (up to 45K) | CRITICAL |
| ONB-005 | Personal details pre-capture | Collect personal details, bank details, emergency contacts, tax information before start date via secure portal | Payroll setup, day-one readiness, first pay accuracy | HIGH |
| ONB-006 | IT equipment provisioning | Track equipment requests (laptop, monitor, phone, headset, access cards), approvals, ordering, and handover confirmation | Day-one productivity, nothing forgotten | HIGH |
| ONB-007 | System access provisioning | Request and track system access setup (email, AD/Azure AD, application accounts, VPN) with IT team assignment | Day-one productivity, security compliance | HIGH |
| ONB-008 | Buddy and mentor assignment | Assign onboarding buddy or mentor with notification, guidance materials, and check-in scheduling | New starter integration, retention, cultural assimilation | MEDIUM |
| ONB-009 | Induction scheduling | Schedule and track mandatory induction activities (H&S, fire safety, data protection, company overview) with attendance recording | Compliance, consistent experience, legal requirements | HIGH |
| ONB-010 | Policy acknowledgement tracking | Track employee acknowledgement of key policies (acceptable use, data protection, code of conduct, anti-bribery) with timestamp and version | Compliance evidence, disciplinary foundation | HIGH |
| ONB-011 | Contract signing tracking | Track contract issue, employee review, signing (wet or e-signature), and return with automated reminders | Contractual compliance, employment relationship clarity | CRITICAL |
| ONB-012 | Onboarding task assignment | Assign tasks to multiple stakeholders (HR, IT, facilities, manager, buddy, new starter) with deadlines and dependencies | Cross-functional coordination, accountability | HIGH |
| ONB-013 | Onboarding progress dashboard | Real-time view of onboarding completion across all new starters with bottleneck identification and overdue alerts | HR oversight, proactive intervention, SLA management | HIGH |
| ONB-014 | Automated reminders and escalation | Auto-remind task owners of upcoming and overdue onboarding tasks; escalate after configurable threshold to manager/HR | Timely completion, prevent delays, accountability | HIGH |
| ONB-015 | Mandatory training auto-enrolment | Auto-enrol new starters in mandatory training courses based on role, department, and location | Compliance training completion, no manual step | HIGH |
| ONB-016 | Probation setup from onboarding | Auto-set probation dates and create review calendar entries linked to performance module from onboarding data | Seamless transition from onboarding to probation management | HIGH |
| ONB-017 | Onboarding survey | Survey new starters on onboarding experience at 7, 30, 60, 90 days with trend analysis and action tracking | Continuous improvement, early disengagement detection | MEDIUM |
| ONB-018 | Welcome communications | Automated welcome emails to new starter and notifications to manager, team, IT, facilities with customisable templates | Professional first impression, team preparation | MEDIUM |
| ONB-019 | Payroll setup trigger | Auto-create payroll record from onboarding data (bank details, tax code, pension, NI category) with validation | Accurate first pay, zero rekeying from onboarding | HIGH |
| ONB-020 | Benefits enrolment trigger | Auto-trigger benefits enrolment (pension auto-enrolment, private medical, other benefits) at eligibility date | Benefits compliance, timely enrolment | HIGH |
| ONB-021 | Starter checklist (HMRC) completion | Ensure HMRC Starter Checklist is completed via portal for employees without P45 with statement A/B/C guidance | Tax compliance, correct initial tax code | HIGH |
| ONB-022 | Group/cohort onboarding | Support cohort onboarding for multiple starters on the same date with shared activities and individual tracking | Efficient bulk onboarding, graduate intakes, seasonal hiring | MEDIUM |
| ONB-023 | Onboarding completion sign-off | Mark onboarding as formally complete with sign-off from manager and HR, recording any outstanding items | Governance, clear handover from onboarding to BAU, audit trail | HIGH |
| ONB-024 | Re-hire accelerated onboarding | Streamlined onboarding flow for re-hired employees, skipping already-completed items and pre-populating known data | Efficiency for returning employees, positive experience | MEDIUM |

---

## 11. Performance Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| PER-001 | Performance cycle configuration | Define review cycles (annual, bi-annual, quarterly, continuous) with dates, eligible populations, and deadlines | Structured performance management, clear expectations | CRITICAL |
| PER-002 | Performance cycle state machine | Enforce cycle progression: draft, active, self-assessment, manager review, calibration, completed with deadline tracking | Process integrity, prevent premature or skipped stages | CRITICAL |
| PER-003 | Goal and objective setting | Employees and managers collaborate to set SMART goals with weighting, alignment to team/company objectives, and measurable criteria | Focused performance direction, clear expectations | CRITICAL |
| PER-004 | OKR support | Structure goals as Objectives with measurable Key Results and progress tracking (0-100% or scored) | Modern goal framework, agile alignment, transparency | HIGH |
| PER-005 | Goal cascade and alignment | Cascade company objectives through divisions, departments, teams to individuals with visual alignment view | Strategic alignment, line of sight from individual to company | HIGH |
| PER-006 | Mid-year review and check-ins | Structured mid-cycle review with documented progress, goal adjustments, and development discussion | Ongoing performance dialogue, prevent year-end surprises | HIGH |
| PER-007 | Self-assessment submission | Employees complete self-assessment against goals and competencies with evidence and narrative | Reflective performance evaluation, employee voice | HIGH |
| PER-008 | Manager assessment | Manager completes assessment of employee with ratings, narrative feedback, and development recommendations | Core performance evaluation, basis for pay and promotion decisions | CRITICAL |
| PER-009 | Rating scale configuration | Configurable rating scales (3-point, 4-point, 5-point, descriptive) per tenant with label customisation | Flexible assessment framework matching organisational culture | HIGH |
| PER-010 | 360-degree feedback | Collect feedback from peers, direct reports, skip-level, and external stakeholders via structured questionnaires | Comprehensive, multi-perspective performance view | HIGH |
| PER-011 | Anonymous feedback with threshold | Support anonymous feedback collection with minimum respondent threshold (typically 3) to protect identity | Candid feedback, psychological safety, honest assessment | HIGH |
| PER-012 | Competency assessment | Rate employees against role-specific and organisational competencies with behavioural indicator evidence | Capability evaluation, development gap identification | HIGH |
| PER-013 | Competency framework management | Define multi-level competency frameworks with behavioural indicators per proficiency level and role mapping | Consistent capability expectations across organisation | HIGH |
| PER-014 | Calibration sessions | Facilitate cross-manager calibration meetings to normalise ratings across teams and departments | Fair, consistent ratings, reduce manager leniency/severity bias | HIGH |
| PER-015 | 9-box grid (performance vs potential) | Plot employees on performance vs potential matrix for talent discussions with movement tracking between reviews | Talent identification, differentiated development investment | HIGH |
| PER-016 | Performance improvement plan (PIP) | Structured PIP with specific objectives, support provided, timeline, review milestones, and success criteria | Manage underperformance formally, legal compliance, fair process | HIGH |
| PER-017 | PIP progress tracking | Track PIP milestone completion, review outcomes (improved, extended, failed), and link to capability process | PIP effectiveness monitoring, evidence for next steps | HIGH |
| PER-018 | Continuous feedback mechanism | Ad-hoc feedback (praise, constructive, developmental) outside formal review cycles with manager visibility option | Real-time performance culture, timely recognition | HIGH |
| PER-019 | Recognition and kudos | Peer-to-peer recognition tied to company values with visibility feed and optional rewards integration | Employee engagement, positive culture reinforcement | MEDIUM |
| PER-020 | Development plan creation | Create individual development plans linked to performance gaps, competency gaps, and career aspirations | Targeted development, growth investment, retention | HIGH |
| PER-021 | Performance review sign-off | Both employee and manager sign off on review content with option to record disagreement and comments | Audit trail, fairness, mutual acknowledgement | HIGH |
| PER-022 | Performance-linked pay review | Link performance ratings to annual pay review recommendations with merit matrix and budget constraints | Merit-based compensation, reward high performers | HIGH |
| PER-023 | Performance analytics dashboard | Aggregate analytics: rating distribution, completion rates, calibration adjustments, department comparisons, trend over cycles | Performance programme effectiveness, identify systemic issues | HIGH |
| PER-024 | Probation review integration | Use performance review framework for probation assessments with pass/fail/extend outcome | Consistent assessment approach, unified system | HIGH |
| PER-025 | Goal progress updates | Regular progress updates on goals between formal reviews with percentage completion and evidence | Ongoing goal visibility, prevent year-end surprises | HIGH |

---

## 12. Learning & Development

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| LND-001 | Course catalogue management | Create and manage a catalogue of learning activities with descriptions, duration, delivery method, and prerequisites | Organised learning provision, self-service discovery | CRITICAL |
| LND-002 | Multiple delivery formats | Support classroom, e-learning, blended, webinar, on-the-job, coaching, self-study, and external course formats | Flexible learning delivery for different needs and preferences | HIGH |
| LND-003 | Course scheduling | Schedule classroom/webinar sessions with dates, times, locations, capacity limits, and waiting lists | Learning logistics, resource management | HIGH |
| LND-004 | Course enrolment and approval | Self-service and manager-initiated enrolment with optional approval workflow and auto-enrolment rules | Controlled learning access, employee development | CRITICAL |
| LND-005 | Mandatory training assignment | Assign mandatory training by role, department, or location with compliance tracking and overdue escalation | Regulatory compliance, H&S obligations, legal requirement | CRITICAL |
| LND-006 | Mandatory training compliance dashboard | Real-time view of mandatory training completion rates by individual, department, and course with overdue alerts | Compliance monitoring, identify training gaps, audit readiness | CRITICAL |
| LND-007 | Training completion recording | Record course completion with date, result (pass/fail/attended/distinction), score, and assessor | Training record maintenance, evidence of competence | CRITICAL |
| LND-008 | Certificate generation | Auto-generate completion certificates with unique verification codes, course details, and expiry date where applicable | Evidence of completion, professional credibility | HIGH |
| LND-009 | Certificate and qualification expiry tracking | Track certification expiry dates with automated renewal reminders at configurable lead times (90, 60, 30 days) | Ongoing compliance, prevent lapsed certifications | HIGH |
| LND-010 | CPD tracking | Log Continuing Professional Development hours/points by category with annual target tracking per professional body | Professional body compliance (CIPD, ACCA, nursing, teaching) | HIGH |
| LND-011 | Learning path definition | Define sequenced learning paths (multiple courses in order) for role preparation or development programmes | Structured development programmes, career preparation | HIGH |
| LND-012 | Training budget management | Set and track training budgets by department and individual with spend reporting and remaining allocation | Cost control, fair allocation, ROI tracking | HIGH |
| LND-013 | Training needs analysis | Systematic identification of training gaps from performance reviews, competency assessments, and role requirements | Targeted training investment, evidence-based L&D | HIGH |
| LND-014 | E-learning content hosting | Host or link to e-learning content with SCORM/xAPI tracking of progress, completion, and scores | Digital learning delivery, self-paced learning | HIGH |
| LND-015 | Health and safety training compliance | Track H&S training (fire safety, manual handling, DSE, first aid, COSHH) with renewal dates and legal requirements | H&S legislation compliance, avoid prosecution | CRITICAL |
| LND-016 | Individual training record | Complete training history per employee with search, filter, and export capability | Training verification, audit, continuous record | HIGH |
| LND-017 | Manager training dashboard | View of direct reports' training completion, upcoming courses, gaps, and budget remaining | People development oversight, manager accountability | HIGH |
| LND-018 | Apprenticeship programme management | Track apprenticeship programmes with 20% off-the-job training hours, EPA preparation, and levy funding | Apprenticeship levy utilisation, programme compliance | MEDIUM |
| LND-019 | Training evaluation surveys | Auto-send evaluation surveys after training completion with analysis and provider feedback | Training effectiveness measurement, continuous improvement | MEDIUM |
| LND-020 | Competency-linked training suggestions | Auto-suggest relevant training based on competency assessment gaps and career development goals | Targeted development, personalised learning recommendations | MEDIUM |

---

## 13. Talent Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| TLM-001 | Succession planning for critical roles | Identify business-critical roles and nominate potential successors with readiness assessment (ready now/1-2yr/3-5yr) | Business continuity, leadership pipeline, risk mitigation | HIGH |
| TLM-002 | Key person risk assessment | Assess risk of key person departure based on retention factors, market demand, notice period, and knowledge concentration | Proactive risk management, targeted retention investment | HIGH |
| TLM-003 | Talent pool management | Create and manage pools of high-potential employees, emerging leaders, and specialist talent for targeted development | Talent pipeline visibility, development programme targeting | HIGH |
| TLM-004 | 9-box talent review | Structured talent review using performance vs potential matrix with calibrated placement and movement tracking | Talent identification, differentiated investment, succession source | HIGH |
| TLM-005 | Career path definition | Define career paths showing progression routes between roles with required competencies, qualifications, and experience | Career development framework, retention, employee engagement | MEDIUM |
| TLM-006 | Career aspiration recording | Record employee career aspirations, mobility preferences (location, function), and development interests | Employee engagement, talent matching, succession alignment | MEDIUM |
| TLM-007 | High-potential identification and tracking | Tag and track high-potential employees based on performance, potential, and readiness with separate development track | Focused development investment, leadership pipeline | HIGH |
| TLM-008 | Flight risk assessment | Record and track flight risk indicators (market demand, compensation gap, engagement, manager relationship) with retention actions | Proactive retention, prevent unwanted attrition | MEDIUM |
| TLM-009 | Succession pipeline visualisation | Visual view of succession depth per critical role showing ready-now, short-term, and long-term successors | Pipeline strength assessment at a glance, board reporting | HIGH |
| TLM-010 | Emergency succession plans | Define emergency/interim successors for sudden departure of critical role holders with immediate action plans | Business continuity, reduce disruption from unexpected departures | HIGH |
| TLM-011 | Talent review meeting support | Structured talent review meeting workflow with agenda, pre-reads, action tracking, and decision recording | Systematic talent management, governance, follow-through | HIGH |
| TLM-012 | Succession metrics and reporting | Report on succession coverage ratio, pipeline strength by level, readiness distribution, diversity of pipeline | Programme effectiveness, board reporting, identify gaps | HIGH |
| TLM-013 | Mentoring programme management | Match mentors to mentees based on development needs, experience, and availability with programme milestones | Development acceleration, knowledge transfer, engagement | MEDIUM |
| TLM-014 | Internal mobility marketplace | Allow employees to express interest in internal opportunities, projects, and secondments visible to HR and managers | Internal talent matching, retention, career development | MEDIUM |

---

## 14. Benefits Administration

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| BEN-001 | Benefits scheme configuration | Configure available benefits per tenant with eligibility rules (grade, service, employment type), costs, and provider details | Flexible benefits platform, multi-scheme support | CRITICAL |
| BEN-002 | Benefits enrolment portal | Employee self-service benefits selection during enrolment windows with plan comparison and cost calculator | Efficient benefits administration, informed employee choice | HIGH |
| BEN-003 | Benefits enrolment window management | Define open enrolment periods with deadline enforcement, late-joiner rules, and auto-close | Controlled benefits changes, orderly administration | HIGH |
| BEN-004 | Life event benefits changes | Allow mid-year benefits changes for qualifying life events (marriage, birth, adoption, divorce, death of dependant) | Responsive benefits administration, employee support | HIGH |
| BEN-005 | Pension scheme enrolment | Enrol employees in workplace pension with contribution rate selection and scheme information | Pensions Act compliance, employee retirement provision | CRITICAL |
| BEN-006 | Pension contribution management | Track employer and employee pension contributions with salary sacrifice option and pensionable pay definition | Accurate pension administration, tax efficiency | CRITICAL |
| BEN-007 | Multiple pension scheme support | Support different pension schemes (defined contribution, defined benefit, master trust, NEST) per tenant | Complex pension landscape, M&A scenarios | HIGH |
| BEN-008 | Pension opt-out management | Process opt-out notices within 1-month window with contribution refund flagging and re-enrolment scheduling | Auto-enrolment compliance, TPR regulations | HIGH |
| BEN-009 | Private medical insurance management | Manage PMI enrolment, dependent cover, scheme details, and interface with provider for membership updates | Employee health benefit administration | HIGH |
| BEN-010 | Death in service benefit administration | Record death-in-service cover level (multiple of salary), beneficiary nominations (expression of wish), and provider details | Employee protection, family welfare, duty to beneficiaries | HIGH |
| BEN-011 | Income protection insurance | Track income protection cover details, waiting periods (deferred period), and claims process integration | Employee financial protection during long-term absence | MEDIUM |
| BEN-012 | Company car and car allowance | Manage company car allocations and cash car allowances with BIK calculations and P11D reporting | Vehicle benefit administration, tax compliance | MEDIUM |
| BEN-013 | Cycle to work scheme | Manage cycle-to-work salary sacrifice arrangements with HMRC exemption tracking and ownership transfer | Green benefit, tax-efficient employee benefit | MEDIUM |
| BEN-014 | Total reward statement | Generate individualised total reward statements showing salary, bonus, pension (employer contribution), benefits value, and share schemes | Employee appreciation of full package value, retention tool | HIGH |
| BEN-015 | Benefits cost reporting | Report on total benefits cost by scheme, department, entity, and per employee with trend analysis | Financial management, budget planning, benchmarking | HIGH |
| BEN-016 | Benefits provider data exchange | Automated data exchange with benefits providers (pension, PMI, life assurance) via API or scheduled file | Efficient administration, accuracy, reduce manual updates | HIGH |
| BEN-017 | Benefits cessation on leaving | Auto-calculate benefits end dates on termination, notify providers, and handle COBRA-equivalent continuation rights | Clean offboarding, accurate provider notification | HIGH |
| BEN-018 | Flexible benefits fund allocation | Allocate flex fund/credits for employees to spend across benefit options with unused fund rules | Modern, choice-based benefits approach | MEDIUM |

---

## 15. Case Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| CAS-001 | Case creation with classification | Create HR cases with type classification: disciplinary, grievance, bullying, performance, whistleblowing, general query | Structured case tracking, reporting by type | CRITICAL |
| CAS-002 | ACAS Code of Practice workflow | Enforce ACAS Code steps for disciplinary/grievance: investigation, notification, hearing, decision, appeal | Employment tribunal compliance, fair process | CRITICAL |
| CAS-003 | Investigation management | Track investigation lifecycle: investigator assignment, witness interviews, evidence collection, investigation report, findings | Thorough, fair, documented investigation | CRITICAL |
| CAS-004 | Suspension management | Record precautionary suspension with start date, review dates, pay status, and conditions/restrictions | Duty of care, proportionate response, manage risk | HIGH |
| CAS-005 | Hearing scheduling and management | Schedule hearings with adequate notice, panel assignment, companion notification, venue/virtual setup | ACAS Code compliance, right to fair hearing | HIGH |
| CAS-006 | Right to be accompanied | Record employee's chosen companion (trade union representative or work colleague) and manage availability | Employment Relations Act 1999 statutory right | CRITICAL |
| CAS-007 | Hearing outcome recording | Record outcome: no action, verbal warning, written warning, final written warning, dismissal, other sanction with reasoning | Auditable decision, proportionality evidence | CRITICAL |
| CAS-008 | Warning management with expiry | Track active warnings with type, issue date, expiry date, conditions, and auto-expiry notification | Sanction monitoring, progressive discipline tracking | CRITICAL |
| CAS-009 | Appeal process management | Track appeal: submission within deadline, separate panel assignment, hearing scheduling, appeal outcome | ACAS Code compliance, procedural fairness | CRITICAL |
| CAS-010 | Grievance processing | Structured grievance workflow: submission, acknowledgement, investigation, hearing, outcome, appeal | Employee voice, legal compliance, resolution tracking | CRITICAL |
| CAS-011 | Whistleblowing case handling | Separate whistleblowing process with enhanced confidentiality, independent investigation, and protection from detriment tracking | Public Interest Disclosure Act 1998 compliance | HIGH |
| CAS-012 | Case documentation management | Store all case documents (letters, evidence, witness statements, minutes, reports) with version control and access restriction | Evidence management, tribunal bundle preparation | CRITICAL |
| CAS-013 | Template letter generation | Generate ACAS-compliant letters: invitation to investigation, hearing notification, outcome letter, appeal acknowledgement | Consistent, legally compliant communication | HIGH |
| CAS-014 | Case timeline view | Chronological view of all case events, documents, communications, and decisions with elapsed time tracking | Case management oversight, tribunal preparation | HIGH |
| CAS-015 | SLA tracking for case stages | Track duration of each case stage against target timelines with breach alerting and escalation | Timely resolution, identify bottlenecks | HIGH |
| CAS-016 | Case assignment and workload | Assign cases to HR advisers with workload visibility, reassignment capability, and specialisation matching | HR resource management, equitable distribution | HIGH |
| CAS-017 | Case confidentiality controls | Restrict case access to named involved parties only with field-level security and no search visibility for others | Data protection, fairness, prevent prejudice | CRITICAL |
| CAS-018 | Settlement agreement tracking | Track settlement agreement negotiation, terms, adviser certificate (s.111A), payments, and confidentiality clauses | Protected conversation management, clean exit processing | MEDIUM |
| CAS-019 | Employment tribunal preparation | Collate case evidence, timeline, witness statements, and documents into tribunal bundle format with index | Tribunal defence preparation, efficient legal process | HIGH |
| CAS-020 | Case analytics and reporting | Report on case volumes by type, outcomes, duration, department distribution, and resolution rates | Process improvement, risk identification, trend analysis | HIGH |

---

## 16. Document Management

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| DOC-001 | Secure document storage | Encrypted cloud storage of employee documents with categorisation, search, and access logging | Central document management, security, compliance | CRITICAL |
| DOC-002 | Document categorisation taxonomy | Classify documents by type (contract, passport, qualification, letter, policy, fit note, DBS) with custom categories | Organised digital personnel file, efficient retrieval | HIGH |
| DOC-003 | Document template management | Create and manage document templates with merge fields, conditional sections, version control, and approval workflow | Efficient, consistent document creation at scale | HIGH |
| DOC-004 | Automated letter generation | Generate HR letters (offer, contract variation, disciplinary invitation, reference, termination) from templates with employee data merge | Consistent, legally compliant correspondence, time savings | HIGH |
| DOC-005 | E-signature integration | Send documents for electronic signature with legally binding audit trail, reminder workflow, and multi-party signing | Efficient contract execution, remote operations, legally valid | HIGH |
| DOC-006 | Document version control | Track document versions with change history, ability to view previous versions, and restore capability | Document integrity, audit trail, prevent accidental overwrite | HIGH |
| DOC-007 | Document access control | Restrict document access based on role, relationship to employee, document type, and case involvement | Data protection, confidentiality, need-to-know principle | CRITICAL |
| DOC-008 | Document expiry tracking | Track documents with expiry dates (visas, DBS, certifications, right-to-work) with automated alerts at configurable lead times | Compliance management, prevent lapsed documents | HIGH |
| DOC-009 | Bulk document generation | Generate same document for multiple employees (e.g., annual pay review letters, policy updates) in batch | Efficient mass communication, consistent messaging | HIGH |
| DOC-010 | Document retention policy enforcement | Auto-flag documents for deletion based on configurable retention schedules per document type with confirmation workflow | UK GDPR data minimisation, storage management | CRITICAL |
| DOC-011 | Document audit trail | Log all document events: upload, view, download, edit, delete, share with user, timestamp, and IP address | Security compliance, GDPR accountability | CRITICAL |
| DOC-012 | Employee document portal | Self-service access for employees to view and download their own documents (contract, payslips, P60, letters) | Employee self-service, reduce HR queries | HIGH |
| DOC-013 | Policy document distribution | Distribute company policy documents to employees with read-receipt tracking, acknowledgement recording, and version management | Policy communication evidence, compliance foundation | HIGH |
| DOC-014 | Document pack assembly | Assemble document packs (new starter pack, tribunal bundle, TUPE information pack) from individual documents | Efficient document compilation for specific purposes | MEDIUM |
| DOC-015 | Company policy library | Central repository of company policies with version control, owner assignment, review schedule, and employee access | Policy governance, single source of truth | HIGH |
| DOC-016 | Document virus scanning | Scan all uploaded files for malware before storage with quarantine for failed scans | Security, system protection, malware prevention | HIGH |

---

## 17. Workflow & Approvals

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| WFA-001 | Approval chain configuration | Define multi-step approval workflows with sequential and parallel steps, configurable per process type | Governance, process control, organisational hierarchy respect | CRITICAL |
| WFA-002 | Dynamic approval routing | Route approvals based on data attributes (e.g., salary changes over threshold need finance approval, absence over 5 days needs HR) | Context-aware governance, appropriate oversight level | HIGH |
| WFA-003 | Approval delegation | Temporary delegation of approval authority during absence with date range, scope, and full audit trail | Business continuity, prevent process bottlenecks | HIGH |
| WFA-004 | Approval timeout and escalation | Auto-escalate approvals not actioned within configurable timeframe to next level or nominated escalation point | Prevent process bottlenecks, SLA compliance | HIGH |
| WFA-005 | Email notifications for workflow events | Automated email notifications for submission, approval needed, approved, rejected, reminder, and escalation | Process awareness, timely action, reduce delays | CRITICAL |
| WFA-006 | In-app notification centre | Real-time in-application notifications for pending actions, updates, and alerts with mark-as-read and filtering | Timely action within the application, unified inbox | HIGH |
| WFA-007 | Workflow state machine | Enforce valid state transitions for all workflow types with immutable audit trail of every state change | Process integrity, prevent invalid transitions, compliance | CRITICAL |
| WFA-008 | SLA tracking for workflows | Track elapsed time per workflow stage against defined SLA targets with breach alerting and reporting | Service level management, identify slow processes | HIGH |
| WFA-009 | Workflow dashboard | Centralised view of all workflows: my pending actions, my submitted requests, overdue items, completion statistics | Operational oversight, personal task management | HIGH |
| WFA-010 | Conditional workflow branching | Route workflow differently based on form data, employee attributes, or request value (e.g., high-value approvals get extra step) | Complex process handling without multiple workflow definitions | HIGH |
| WFA-011 | Parallel task assignment | Assign multiple workflow tasks simultaneously to different people/roles with join condition (all complete or first complete) | Efficient parallel processing, faster cycle times | HIGH |
| WFA-012 | Workflow comments and attachments | Allow participants to add comments, notes, and supporting documents at each workflow step | Context preservation, decision support, audit trail | HIGH |
| WFA-013 | Workflow audit trail | Complete immutable log of all workflow actions: who, what, when, outcome, comment, IP address | Governance, compliance, dispute resolution | CRITICAL |
| WFA-014 | Bulk approval capability | Approve multiple pending items of the same type at once with individual review option | Manager efficiency, reduce approval backlog | HIGH |
| WFA-015 | Recurring workflow triggers | Auto-trigger workflows on schedules (monthly timesheet reminders, annual review launch, quarterly talent reviews) | Automated process initiation, no manual trigger needed | HIGH |
| WFA-016 | Workflow cancellation | Cancel in-progress workflows with reason recording, notification to participants, and rollback of provisional changes | Error correction, changed circumstances | HIGH |

---

## 18. Reporting & Analytics

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| RAA-001 | Headcount reporting | Real-time and historical headcount by department, location, grade, entity, employment type, and FTE with trend | Core workforce metric, board reporting, planning | CRITICAL |
| RAA-002 | Starter and leaver reporting | Joiners and leavers by period (month/quarter/year), department, reason, source, and diversity group | Turnover analysis, workforce flow understanding | CRITICAL |
| RAA-003 | Turnover rate calculation | Calculate voluntary, involuntary, and total turnover rates with trend analysis and benchmarking | Retention measurement, target setting | CRITICAL |
| RAA-004 | Absence rate reporting | Absence rates by type, department, month, individual, and reason with Bradford Factor scores and lost days | Absence management insight, cost quantification | CRITICAL |
| RAA-005 | Diversity dashboard | Real-time diversity metrics across all nine protected characteristics by level, department, function, and pipeline stage | Equality monitoring, regulatory reporting, DE&I strategy | CRITICAL |
| RAA-006 | Gender pay gap dashboard | Interactive dashboard showing all six statutory gender pay gap metrics with drill-down and year-on-year comparison | Equality Act compliance, internal monitoring, action planning | CRITICAL |
| RAA-007 | Compensation analytics | Salary distribution, compa-ratio analysis, pay equity by group, regression analysis for unexplained gaps | Compensation governance, equal pay risk management | HIGH |
| RAA-008 | Custom report builder | Drag-and-drop report builder with field selection from all modules, filtering, grouping, calculated fields, and formatting | Flexible reporting for HR, finance, and management users | HIGH |
| RAA-009 | Report scheduling and distribution | Schedule reports to run automatically (daily/weekly/monthly) and distribute via email to configured recipients | Automated reporting, consistent stakeholder communication | HIGH |
| RAA-010 | Report export formats | Export reports as PDF, Excel (xlsx), CSV, and interactive HTML with charts and formatting preserved | Flexible consumption, integration with other tools | HIGH |
| RAA-011 | Executive dashboard | Board-level dashboard with key HR KPIs (headcount, turnover, absence, diversity, cost) and traffic-light status | Strategic HR reporting, C-suite visibility | HIGH |
| RAA-012 | Manager dashboard | Department-level dashboard for people managers with team metrics, pending actions, and actionable insights | Empowered people management, self-service analytics | HIGH |
| RAA-013 | Workforce planning analytics | Project future headcount needs based on turnover trends, growth plans, retirement projections, and attrition modelling | Strategic workforce planning, budget forecasting | HIGH |
| RAA-014 | Compliance reporting dashboard | Consolidated view of all compliance obligations with RAG status: right-to-work, training, DBS, probation, contract dates | Compliance oversight at a glance, risk management | HIGH |
| RAA-015 | Right-to-work expiry reporting | Report on approaching and expired right-to-work documents with escalation for overdue rechecks | Immigration compliance, civil penalty avoidance | CRITICAL |
| RAA-016 | Contract end date reporting | Report on approaching fixed-term contract end dates with 4-year automatic permanent flag | Workforce planning, legal compliance | HIGH |
| RAA-017 | Sickness absence trends | Trend analysis of sickness absence by reason category, department, season, and comparison with benchmarks | Pattern identification, targeted interventions | HIGH |
| RAA-018 | Recruitment analytics | Time-to-fill, cost-per-hire, source effectiveness, pipeline conversion, offer acceptance rate, diversity metrics | Recruitment performance optimisation | HIGH |
| RAA-019 | Training compliance reporting | Training completion rates for mandatory courses by individual, department, and course with overdue escalation | Compliance audit readiness, risk identification | HIGH |
| RAA-020 | Report access control | Control report access based on role and data scope (own team, own department, all departments, all entities) | Data security, GDPR compliance, appropriate visibility | CRITICAL |
| RAA-021 | Data visualisation library | Charts (bar, line, pie, donut), heat maps, scatter plots, and data tables with interactive filtering and drill-down | Effective data communication, insight discovery | HIGH |
| RAA-022 | Ad-hoc data extraction | Allow HR power users to query data across modules with field selection and filtering within RLS-enforced boundaries | Flexible data access for complex questions | MEDIUM |
| RAA-023 | Predictive analytics | Statistical modelling for attrition risk, absence prediction, retirement waves, and workforce demand | Forward-looking HR insights, proactive management | MEDIUM |
| RAA-024 | Benchmark comparison | Compare internal metrics against industry, sector, or size benchmarks where data is available | Competitive positioning, identify outliers | MEDIUM |

---

## 19. Employee Self-Service Portal

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| ESS-001 | Personal details viewing | Employees view their own personal information, employment details, role history, and key dates | Self-service access to own data, GDPR right of access | CRITICAL |
| ESS-002 | Personal details update with approval | Employees update contact details, emergency contacts, and bank details; sensitive field changes require manager/HR approval | Data accuracy, HR admin reduction, employee empowerment | CRITICAL |
| ESS-003 | Leave balance viewing | View current and projected leave balances by type with carry-over, taken, booked, and remaining breakdown | Self-service absence information, informed booking decisions | CRITICAL |
| ESS-004 | Leave request submission | Submit leave requests with date selection, absence type, notes, and team calendar visibility for clash checking | Self-service absence management, efficient process | CRITICAL |
| ESS-005 | Leave request status tracking | View status of all submitted leave requests (pending, approved, rejected, cancelled) with approval chain visibility | Request transparency, reduce chase-up queries to HR | HIGH |
| ESS-006 | Leave request cancellation | Cancel submitted (pending) or approved (future) leave requests with reason and manager notification | Flexibility, accurate planning, balance correction | HIGH |
| ESS-007 | Team absence calendar | View team/department absence calendar to check colleague availability before booking own leave | Conflict awareness, collaborative planning | HIGH |
| ESS-008 | Payslip viewing and download | Access and download current and historical payslips in PDF format with secure authentication | Statutory right (Employment Rights Act 1996), reduce HR queries | CRITICAL |
| ESS-009 | P60 viewing and download | Access annual P60 certificates for current and previous tax years | Self-service tax document access, reduce HR distribution burden | HIGH |
| ESS-010 | Benefits viewing and enrolment | View current benefits enrolment, entitlements, and cost; select/change benefits during open enrolment windows | Benefits awareness, efficient self-service administration | HIGH |
| ESS-011 | Training catalogue and enrolment | Browse available training courses, view learning paths, and self-enrol with approval if required | Self-directed development, accessible learning | HIGH |
| ESS-012 | Training history and certificates | View completed training record, download certificates, and track CPD hours | Development record, professional body evidence | HIGH |
| ESS-013 | Goal and performance management | Set/update goals, complete self-assessments, view review outcomes, and access development plans | Performance self-management, continuous development | HIGH |
| ESS-014 | Document access portal | View and download personal documents: contract, offer letter, policy documents, generated letters | Self-service document access, reduce HR queries | HIGH |
| ESS-015 | Timesheet entry and submission | Enter and submit timesheets via self-service with project/task allocation and submission reminders | Self-service time capture, reduce paper timesheets | HIGH |
| ESS-016 | Notification centre | Unified view of all notifications: pending actions, approvals needed, reminders, and system alerts with read/unread status | Action management, nothing missed, prioritisation | HIGH |
| ESS-017 | Organisation directory | Searchable employee directory with name, photo, title, department, contact details (respecting privacy settings) | Employee connection, collaboration, find the right person | HIGH |
| ESS-018 | Company news and announcements | View company news, HR announcements, and policy updates on portal home page | Internal communication, employee engagement | MEDIUM |
| ESS-019 | Feedback and recognition | Give and receive peer feedback, recognise colleagues for contributions aligned to company values | Engagement, positive culture, continuous feedback | MEDIUM |

---

## 20. Manager Self-Service

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| MSS-001 | Team overview dashboard | Consolidated view of all direct and indirect reports with key metrics: headcount, absence rate, pending actions, birthdays/anniversaries | People management at a glance, actionable overview | CRITICAL |
| MSS-002 | Approval queue | Single unified queue for all pending approvals: leave, expenses, timesheets, training, recruitment, pay changes with priority and age | Efficient approval management, reduce backlog, SLA visibility | CRITICAL |
| MSS-003 | Team absence calendar | Visual calendar showing team member absences (approved, pending, sick) with coverage gaps highlighted | Resource planning, approve/reject decisions with context | HIGH |
| MSS-004 | Absence approval with context | Approve/reject leave requests with team calendar, coverage rules, remaining balance, and reason for decision | Informed, fair decisions with audit trail | CRITICAL |
| MSS-005 | Team performance overview | View performance review status, ratings, goal progress, and development plans for all direct reports | Performance management oversight, identify needs | HIGH |
| MSS-006 | Initiate employee changes | Initiate salary changes, transfers, promotions, and role changes for direct reports with approval routing | Manager empowerment, reduce HR administrative bottleneck | HIGH |
| MSS-007 | Delegation of authority | Temporarily delegate management responsibilities (approvals, access) to another manager during absence | Business continuity, prevent bottlenecks during manager absence | HIGH |
| MSS-008 | Team training overview | View team training completion status, upcoming courses, gaps against requirements, and budget remaining | L&D oversight, compliance responsibility | HIGH |
| MSS-009 | Direct report onboarding tracking | Track onboarding progress for new direct reports with task completion status and due dates | Manager involvement in onboarding, accountability | HIGH |
| MSS-010 | Team timesheet review | Review and approve team timesheets with exception highlighting and bulk approval | Time management efficiency, payroll accuracy | HIGH |
| MSS-011 | 1:1 meeting notes | Record and track 1:1 meeting notes with direct reports, linked to goals and development plans | Coaching documentation, performance context | MEDIUM |
| MSS-012 | Team reporting and analytics | Access team-level analytics: absence trends, turnover risk, performance distribution, headcount changes | Data-driven people management, evidence-based decisions | HIGH |
| MSS-013 | Recruitment management | Manage hiring for team vacancies: review candidates, provide interview feedback, make hiring decisions | Hiring manager engagement, streamlined recruitment | HIGH |
| MSS-014 | Case awareness (need-to-know) | View case status for direct reports where manager is an involved party (respecting confidentiality controls) | Appropriate awareness, support management decisions | MEDIUM |

---

## 21. Security & Access Control

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| SAC-001 | Role-based access control (RBAC) | Define roles with granular permissions per module, action (create, read, update, delete), and scope (own, team, department, all) | Access governance, least privilege principle | CRITICAL |
| SAC-002 | Field-level security | Control visibility and editability of individual fields (e.g., salary, NI number, disciplinary) based on role | Sensitive data protection, need-to-know principle | CRITICAL |
| SAC-003 | Row-level security (RLS) | Database-enforced tenant isolation ensuring no cross-tenant data access regardless of application logic errors | Multi-tenant data security, contractual obligation | CRITICAL |
| SAC-004 | Custom role creation | Allow tenants to create custom roles with specific permission combinations beyond pre-defined system roles | Flexible access configuration for diverse organisational structures | HIGH |
| SAC-005 | Multi-factor authentication (MFA) | Support TOTP authenticator apps, backup/recovery codes, and optionally hardware keys (WebAuthn/FIDO2) | Account security, prevent credential-based attacks | CRITICAL |
| SAC-006 | MFA enforcement policy | Per-tenant and per-role MFA enforcement (e.g., mandatory for admins and HR, optional for employees) | Security governance, risk-based authentication | HIGH |
| SAC-007 | Single sign-on (SSO) | Support SAML 2.0 and OIDC SSO integration with corporate identity providers (Azure AD, Okta, Google Workspace) | Enterprise authentication, user convenience, centralised access management | HIGH |
| SAC-008 | Password policy configuration | Configurable password complexity, minimum length, history depth, and maximum age per tenant | Account security, meet customer security requirements | HIGH |
| SAC-009 | Account lockout and brute force protection | Lock accounts after configurable failed login attempts with auto-unlock timer or admin manual unlock | Brute force attack prevention, account protection | HIGH |
| SAC-010 | Session management | Configurable session timeout, concurrent session limits, and admin-initiated forced logout for user or all sessions | Security compliance, licence management, incident response | CRITICAL |
| SAC-011 | Comprehensive audit trail | Log all data access, create, update, delete operations with user ID, timestamp, IP address, and before/after values | Security monitoring, GDPR accountability, forensic investigation | CRITICAL |
| SAC-012 | Audit log immutability | Audit logs stored in append-only format that cannot be modified or deleted even by system administrators | Audit integrity, regulatory compliance, tamper evidence | CRITICAL |
| SAC-013 | Audit log search and export | Search audit logs by user, action type, entity, date range, and IP with export for investigation and compliance | Security investigation, GDPR subject access requests | HIGH |
| SAC-014 | API authentication and authorisation | Secure API access with API keys, OAuth 2.0 tokens, or session-based auth with scope restrictions per integration | Integration security, controlled third-party access | CRITICAL |
| SAC-015 | API rate limiting | Per-tenant, per-user, per-endpoint rate limiting with configurable thresholds and 429 response with retry-after | System protection, fair usage, DDoS mitigation | HIGH |
| SAC-016 | CSRF protection | Cross-site request forgery prevention tokens on all state-changing operations with secure cookie configuration | Web application security, prevent unauthorised actions | CRITICAL |
| SAC-017 | XSS prevention | Input sanitisation, output encoding, and Content Security Policy to prevent cross-site scripting attacks | Web security, prevent data theft and session hijacking | CRITICAL |
| SAC-018 | SQL injection prevention | Parameterised queries (tagged template literals), input validation, and no dynamic SQL construction from user input | Data security, prevent database compromise | CRITICAL |
| SAC-019 | Security headers | HSTS (with preload), CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy | Web security hardening, prevent common attack vectors | HIGH |
| SAC-020 | Data encryption at rest | Encrypt sensitive data fields (NI number, bank details, medical info) in database using AES-256 or equivalent | Data protection, breach impact mitigation | HIGH |
| SAC-021 | Data encryption in transit | Enforce TLS 1.2+ for all data transmission with strong cipher suites and HSTS | Data protection, prevent interception | CRITICAL |
| SAC-022 | Data masking | Mask sensitive fields (NI number shows last 3 digits, bank account partially hidden) in UI and exports based on role | PII protection, reduce exposure surface | HIGH |
| SAC-023 | User provisioning and deprovisioning | Create and disable user accounts with proper access revocation; auto-disable on employment termination | Access lifecycle management, prevent orphaned accounts | CRITICAL |
| SAC-024 | Login activity monitoring | Track login events with timestamp, IP, user agent, location inference; alert on suspicious patterns (new device, unusual time, impossible travel) | Security monitoring, compromised account detection | HIGH |
| SAC-025 | Tenant data isolation verification | Automated test suite verifying no cross-tenant data leakage across all queries, APIs, and background jobs | Multi-tenant security assurance, customer confidence | CRITICAL |
| SAC-026 | Idempotency protection | All mutating API endpoints require idempotency keys to prevent duplicate operations from retries | Data integrity, safe retry behaviour, prevent double-processing | HIGH |

---

## 22. UK Employment Compliance

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| UKC-001 | UK GDPR compliance framework | Data protection by design: lawful basis recording per processing activity, data mapping, impact assessments | UK GDPR / Data Protection Act 2018, avoid ICO fines | CRITICAL |
| UKC-002 | Data subject access request processing | Structured DSAR workflow within 1-calendar-month deadline with extension handling (2 months for complex), fee provisions, and redaction | UK GDPR Article 15, avoid ICO enforcement | CRITICAL |
| UKC-003 | Right to erasure processing | Process erasure requests with identification of legitimate retention exceptions (legal obligation, tax records) and partial erasure | UK GDPR Article 17, balance with HMRC/pension retention | CRITICAL |
| UKC-004 | Data portability | Export employee personal data in structured, machine-readable format (JSON/CSV) on request | UK GDPR Article 20, employee right | HIGH |
| UKC-005 | Data retention policy configuration | Configure retention periods by data category with auto-deletion scheduling: 6 years post-termination for payroll, 1 year for recruitment, etc. | UK GDPR data minimisation principle, HMRC requirements | CRITICAL |
| UKC-006 | Data breach notification workflow | Track data breaches: detection, risk assessment, ICO notification (within 72 hours if high risk), individual notification, remediation | UK GDPR Articles 33-34, avoid penalties for late notification | CRITICAL |
| UKC-007 | Privacy notice management | Maintain and distribute employee privacy notices with version control, acknowledgement recording, and update notifications | UK GDPR transparency obligation, Article 13/14 | CRITICAL |
| UKC-008 | Gender pay gap statutory reporting | Calculate all six statutory metrics (mean/median hourly pay gap, mean/median bonus gap, proportion receiving bonus, quartile distribution) at snapshot date | Equality Act 2010 (Gender Pay Gap Information) Regulations 2017 | CRITICAL |
| UKC-009 | Right to work statutory compliance | Complete right-to-work checking process per Home Office guidance: prescribed document check, online check (share code), or IDVT | Immigration, Asylum and Nationality Act 2006; avoid 45K civil penalty per worker | CRITICAL |
| UKC-010 | Statutory Sick Pay administration | Full SSP administration: qualifying days, waiting days, Lower Earnings Limit, linked periods, 28-week limit, recovery (no longer available but historical) | Social Security Contributions and Benefits Act 1992 | CRITICAL |
| UKC-011 | Statutory maternity/paternity/adoption pay | Calculate SMP, SPP, SAP, ShPP, SPBP per current rates and qualification rules with HMRC recovery tracking | Various statutory instruments, accurate pay, HMRC recovery | CRITICAL |
| UKC-012 | National Minimum Wage compliance checking | Validate all pay rates against current NMW/NLW bands by age with alerts on rate changes | National Minimum Wage Act 1998, avoid naming and prosecution | CRITICAL |
| UKC-013 | Working Time Regulations compliance | Track and enforce 48-hour weekly limit, daily rest (11 hours), weekly rest (24 hours), annual leave (5.6 weeks), night worker limits | Working Time Regulations 1998, employer criminal liability | CRITICAL |
| UKC-014 | Auto-enrolment pension compliance | Full auto-enrolment lifecycle: assessment, enrolment, opt-out, re-enrolment, communications per TPR requirements | Pensions Act 2008, avoid TPR enforcement (fixed/escalating penalties) | CRITICAL |
| UKC-015 | Equality Act protected characteristics | Monitor and report on all nine protected characteristics: age, disability, gender reassignment, marriage/civil partnership, pregnancy/maternity, race, religion/belief, sex, sexual orientation | Equality Act 2010, positive duty compliance | HIGH |
| UKC-016 | Health and safety compliance tracking | Track H&S obligations: risk assessments, COSHH assessments, incident reporting, training, first aiders, fire wardens | Health and Safety at Work Act 1974, Management Regulations 1999 | CRITICAL |
| UKC-017 | RIDDOR reporting | Identify RIDDOR-reportable incidents (fatality, specified injury, over-7-day incapacitation, occupational disease) with submission tracking | Reporting of Injuries, Diseases and Dangerous Occurrences Regulations 2013 | HIGH |
| UKC-018 | DBS management | Track DBS applications, clearance levels, update service registrations, and rechecking schedules per role requirement | Safeguarding, Rehabilitation of Offenders Act 1974 | HIGH |
| UKC-019 | Employment tribunal case tracking | Track ET1/ET3, hearing dates, bundle deadlines, ACAS early conciliation, settlement, and outcomes with costs | Legal risk management, defence preparation | HIGH |
| UKC-020 | Agency Workers Regulations compliance | Track 12-week qualifying period for agency workers and ensure comparable terms obligation from week 13 | Agency Workers Regulations 2010 | HIGH |
| UKC-021 | Fixed-term worker regulations | Monitor fixed-term worker treatment vs permanent comparators; flag 4-year continuous service for automatic permanence | Fixed-Term Employees (Prevention of Less Favourable Treatment) Regulations 2002 | HIGH |
| UKC-022 | Part-time worker regulations | Ensure pro-rata equal treatment of part-time workers for pay, benefits, training, and career opportunities | Part-Time Workers (Prevention of Less Favourable Treatment) Regulations 2000 | HIGH |
| UKC-023 | IR35 off-payroll compliance | Status Determination Statement process, right of appeal, disagreement resolution, and HMRC enquiry evidence | Off-Payroll Working Rules (Finance Act 2017/2021) | HIGH |
| UKC-024 | Modern slavery compliance | Track modern slavery statement (for qualifying organisations), supply chain due diligence, and training records | Modern Slavery Act 2015, reputational risk | HIGH |
| UKC-025 | Flexible working request compliance | Process statutory flexible working requests per Employment Relations (Flexible Working) Act 2023: day-one right, 2-month decision deadline, 2 requests per year | Employment Rights Act 1996 (as amended), employee right | HIGH |
| UKC-026 | Trade union and facility time | Record trade union recognition, facility time for officials, and report facility time percentage (public sector) | Trade Union and Labour Relations (Consolidation) Act 1992, Trade Union Act 2016 | MEDIUM |
| UKC-027 | Whistleblowing protection | Ensure whistleblowing disclosures are handled per PIDA with detriment protection tracking and outcome recording | Public Interest Disclosure Act 1998, protect whistleblowers | HIGH |
| UKC-028 | Records of processing activities | Maintain Article 30 record of all HR data processing activities with purpose, lawful basis, retention, and recipients | UK GDPR Article 30, ICO inspection readiness | CRITICAL |

---

## 23. Integration & APIs

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| INT-001 | RESTful API | Comprehensive RESTful API covering all system entities and operations with versioning, pagination, and filtering | Third-party integration, custom development, extensibility | CRITICAL |
| INT-002 | API documentation | Auto-generated, interactive API documentation (OpenAPI/Swagger) with examples, authentication guide, and sandbox | Developer experience, integration speed, self-service | HIGH |
| INT-003 | Webhook configuration | Configure outbound webhooks for key events (employee created, status changed, leave approved) with retry logic and delivery tracking | Real-time event-driven integration, reduce polling | HIGH |
| INT-004 | Payroll system integration | Structured data export/import with major UK payroll providers (Sage, ADP, Ceridian, Xero, FreeAgent) via API or file | Eliminate dual data entry, payroll accuracy | HIGH |
| INT-005 | Accounting system integration | Generate and export payroll journals for posting to accounting systems (Xero, Sage, QuickBooks, NetSuite) | Financial integration, month-end automation | HIGH |
| INT-006 | Active Directory / Azure AD sync | Synchronise user accounts, groups, and attributes with Active Directory or Azure AD for SSO and provisioning | Centralised identity management, automated provisioning | HIGH |
| INT-007 | SSO provider integration | Support SAML 2.0 and OIDC with major identity providers: Azure AD, Okta, Google Workspace, OneLogin, Ping | Enterprise authentication, single sign-on experience | HIGH |
| INT-008 | Calendar integration | Sync approved absences, meetings, and training to employee calendars (Outlook/Google Calendar) via CalDAV or API | Unified calendar view, avoid double-booking | MEDIUM |
| INT-009 | Email system integration | Send system emails via configurable SMTP or transactional email provider (SendGrid, Postmark, SES) with delivery tracking | Reliable notification delivery, branded emails | HIGH |
| INT-010 | Data import framework | Structured import capability for all major entities (employees, org structure, absences, training) via CSV/Excel with validation and error handling | Data migration, bulk updates, integration with legacy systems | HIGH |
| INT-011 | Data export framework | Export data in standard formats (CSV, Excel, JSON) with field selection, filtering, and scheduling within RLS boundaries | Data portability, regulatory compliance, analytics tools | HIGH |
| INT-012 | Pension provider integration | Data exchange with pension providers (NEST, People's Pension, Scottish Widows, Royal London) for enrolment and contribution data | Efficient pension administration, reduce manual files | HIGH |
| INT-013 | Benefits provider integration | Data exchange with benefits providers (PMI, life assurance, EAP) for membership and claims data | Automated benefits administration, accuracy | MEDIUM |
| INT-014 | Job board integration | Post vacancies to and receive applications from external job boards (Indeed, LinkedIn, Reed) via API | Recruitment reach, candidate pipeline management | MEDIUM |
| INT-015 | Background check provider integration | Initiate and track DBS checks, reference checks, and other screening via integrated providers | Streamlined pre-employment checks, status tracking | MEDIUM |
| INT-016 | API key management | Create, rotate, and revoke API keys per tenant with scope restrictions and usage monitoring | Integration security, access control, audit | HIGH |
| INT-017 | Bulk API operations | Support batch API operations for efficient bulk data processing (create/update multiple records in single request) | Integration performance, reduce API call volume | MEDIUM |
| INT-018 | Event streaming | Real-time event stream (Redis Streams, webhooks, or similar) for system events enabling real-time integrations | Real-time downstream processing, event-driven architecture | MEDIUM |

---

## 24. System Administration

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| SYS-001 | Multi-tenant management | Create, configure, suspend, and manage completely isolated tenant environments with independent data and configuration | SaaS platform management, customer isolation | CRITICAL |
| SYS-002 | Tenant provisioning | Automated tenant setup: database schema creation, seed data, admin user, default configuration, and welcome communication | Efficient customer onboarding, consistent setup | CRITICAL |
| SYS-003 | Tenant configuration | Tenant-specific settings: company details, branding, feature toggles, lookup values, default policies, locale preferences | Customisation without code changes, self-service administration | CRITICAL |
| SYS-004 | Tenant branding | Customisable logos, primary/secondary colours, favicon, and email templates per tenant | White-label capability, customer brand consistency | HIGH |
| SYS-005 | Feature flag management | Enable/disable features per tenant for phased rollout, tier-based access control, or beta testing | Controlled feature delivery, tiered pricing support | HIGH |
| SYS-006 | Lookup value management | Manage configurable dropdown lists (absence reasons, termination reasons, department types, job families) per tenant | Tenant self-service configuration, data standardisation | HIGH |
| SYS-007 | User account management | Create, edit, suspend, reactivate, and delete user accounts with role assignment and multi-tenant access | Access management, user lifecycle | CRITICAL |
| SYS-008 | Password reset workflow | Self-service password reset via email verification link and admin-initiated password reset with temporary password | Account recovery, reduce support burden | CRITICAL |
| SYS-009 | System health monitoring | Dashboard showing API response times, error rates, queue depths, database performance, and uptime metrics | Operational monitoring, proactive issue detection | HIGH |
| SYS-010 | Background job monitoring | View job queues, processing status, failed jobs with error details, retry capability, and dead letter handling | Operational oversight, ensure background processing reliability | HIGH |
| SYS-011 | Email delivery monitoring | Track email send status, opens, bounces, delivery failures, and spam reports with retry for transient failures | Communication reliability, identify delivery issues | HIGH |
| SYS-012 | Database migration management | Version-controlled database migrations with up/down capability, status tracking, and rollback on failure | Schema management, safe deployments, reproducible environments | CRITICAL |
| SYS-013 | Cache management | View cache utilisation, invalidate specific entries or tenant-wide cache for troubleshooting and deployments | Operational support, data consistency after changes | MEDIUM |
| SYS-014 | Audit log management | View, search, filter, and export system audit logs with configurable retention period (minimum 2 years) | Compliance, security investigation, GDPR accountability | CRITICAL |
| SYS-015 | Notification template management | Manage email, in-app, and push notification templates with variable substitution, HTML/text, and multilingual support | Communication customisation, consistent messaging | HIGH |
| SYS-016 | Data archival | Archive old data (terminated employees beyond retention, historical transactions) to reduce active dataset size | Performance optimisation, storage management, cost control | MEDIUM |
| SYS-017 | Rate limit configuration | Configure rate limits per tenant, role, and endpoint with burst allowance and monitoring | Fair usage enforcement, system protection, abuse prevention | HIGH |
| SYS-018 | System announcement broadcasting | Send system announcements to all users, specific tenants, or specific roles with scheduling and acknowledgement | Change communication, maintenance windows, important notices | MEDIUM |
| SYS-019 | Usage analytics per tenant | Track feature usage, active users, login frequency, and adoption metrics per tenant | Customer success insights, capacity planning, upsell identification | MEDIUM |
| SYS-020 | Backup and disaster recovery | Automated database backups with configurable retention, point-in-time recovery, and tested restore procedures | Business continuity, data protection, RPO/RTO compliance | CRITICAL |
| SYS-021 | Environment management | Support separate development, staging, and production environments with data anonymisation for non-production | Development workflow, data protection, safe testing | HIGH |

---

## 25. Mobile & Accessibility

| ID | Feature | Description | Business Value | Enterprise Priority |
|----|---------|-------------|----------------|---------------------|
| MOB-001 | Responsive web design | Full application functionality on mobile, tablet, and desktop screen sizes with touch-optimised UI | Access from any device, no separate mobile app requirement initially | CRITICAL |
| MOB-002 | Mobile-optimised self-service | Key self-service functions (leave requests, approvals, payslips, clock in/out) optimised for mobile interaction | On-the-go access for frontline and remote workers | HIGH |
| MOB-003 | Mobile clock in/out | Clock in and out via mobile device with optional GPS/geofence validation and offline capability | Time capture for mobile and field workers | HIGH |
| MOB-004 | Push notifications (mobile) | Push notifications to mobile devices for approvals, reminders, and alerts via PWA or native wrapper | Timely action for managers and employees away from desktop | MEDIUM |
| MOB-005 | Offline capability | Core functions (timesheet entry, clock events, form completion) available offline with sync when connectivity returns | Support workers in areas with poor connectivity | MEDIUM |
| MOB-006 | WCAG 2.1 AA compliance | All web interfaces meet WCAG 2.1 Level AA accessibility standards: keyboard navigation, screen reader support, colour contrast, focus indicators | Equality Act 2010 duty, inclusive access for disabled users | CRITICAL |
| MOB-007 | Screen reader compatibility | All UI components properly labelled with ARIA attributes, semantic HTML, and logical reading order for screen reader users | Accessible to visually impaired users, legal compliance | CRITICAL |
| MOB-008 | Keyboard navigation | Full application operability via keyboard alone without requiring mouse interaction for any feature | Accessible to motor-impaired users, power user efficiency | HIGH |
| MOB-009 | Colour contrast compliance | All text meets minimum contrast ratios (4.5:1 for normal text, 3:1 for large text) across all themes | Visual accessibility, WCAG compliance | HIGH |
| MOB-010 | Text resize support | Application remains functional and readable when text is resized up to 200% without horizontal scrolling | Visual accessibility, aging workforce support | HIGH |
| MOB-011 | Alternative text for images | All non-decorative images have meaningful alternative text; decorative images are properly hidden from assistive technology | Screen reader accessibility, WCAG compliance | HIGH |
| MOB-012 | Form accessibility | All form fields have associated labels, error messages are programmatically linked, and required fields are indicated accessibly | Accessible data entry, reduce errors for assistive technology users | HIGH |
| MOB-013 | Focus management | Visible focus indicators on all interactive elements, logical focus order, and focus management for dynamic content (modals, notifications) | Keyboard and assistive technology navigation | HIGH |
| MOB-014 | Internationalisation (i18n) foundation | Architecture supports future localisation: externalised strings, RTL layout support, locale-aware date/number formatting | Future multi-language support, international expansion | MEDIUM |
| MOB-015 | Progressive Web App (PWA) | Installable PWA with service worker for caching, offline support, and native-like experience on mobile devices | App-like experience without app store distribution | MEDIUM |
| MOB-016 | Dark mode support | System-level and user-preference dark mode with accessible contrast in both themes | User preference, reduced eye strain, accessibility | LOW |

---

## Summary

| # | Category | Item Count |
|---|----------|-----------|
| 1 | Employee Lifecycle Management (ELM) | 32 |
| 2 | Employee Records & Personal Data (EPD) | 28 |
| 3 | Organisation Structure (ORG) | 24 |
| 4 | Position & Job Management (PJM) | 15 |
| 5 | Contracts & Employment Terms (CET) | 30 |
| 6 | Compensation & Payroll (CPY) | 44 |
| 7 | Absence & Leave Management (ALM) | 49 |
| 8 | Time & Attendance (TAT) | 30 |
| 9 | Recruitment & ATS (REC) | 32 |
| 10 | Onboarding (ONB) | 24 |
| 11 | Performance Management (PER) | 25 |
| 12 | Learning & Development (LND) | 20 |
| 13 | Talent Management (TLM) | 14 |
| 14 | Benefits Administration (BEN) | 18 |
| 15 | Case Management (CAS) | 20 |
| 16 | Document Management (DOC) | 16 |
| 17 | Workflow & Approvals (WFA) | 16 |
| 18 | Reporting & Analytics (RAA) | 24 |
| 19 | Employee Self-Service Portal (ESS) | 19 |
| 20 | Manager Self-Service (MSS) | 14 |
| 21 | Security & Access Control (SAC) | 26 |
| 22 | UK Employment Compliance (UKC) | 28 |
| 23 | Integration & APIs (INT) | 18 |
| 24 | System Administration (SYS) | 21 |
| 25 | Mobile & Accessibility (MOB) | 16 |
| | **TOTAL** | **603** |

### Priority Distribution

| Priority | Count | Percentage |
|----------|-------|------------|
| CRITICAL | 168 | 27.9% |
| HIGH | 338 | 56.1% |
| MEDIUM | 93 | 15.4% |
| LOW | 4 | 0.7% |

### Coverage Notes

This checklist is designed as an enterprise benchmark for a UK-focused multi-tenant HRIS. Key considerations:

1. **UK-Specific**: All compliance items reference specific UK legislation (Employment Rights Act, Equality Act, Working Time Regulations, UK GDPR, etc.) rather than generic international requirements.

2. **Enterprise-Grade**: Items reflect expectations of organisations with 250+ employees including multi-entity, multi-site, and complex organisational structures.

3. **SaaS Platform**: Multi-tenancy, tenant isolation, and platform administration items reflect the Staffora SaaS model.

4. **Priority Rationale**:
   - CRITICAL: Legal compliance requirement, core operational need, or security imperative
   - HIGH: Expected by enterprise buyers, significant business value, or competitive necessity
   - MEDIUM: Important for differentiation, needed within first year, or addresses specific use cases
   - LOW: Nice-to-have, cosmetic, or niche requirement

5. **Exclusions**: This checklist does not cover internal platform engineering (CI/CD, monitoring infrastructure, deployment automation) which are separate operational concerns.
