# Phase 3: Feature Completion -- Sprint Plan

**Duration:** 8 sprints (16 weeks)
**Goal:** Complete UK compliance, build integrations, and prepare for production deployment
**Prerequisite:** Phase 1 (security/infra) and Phase 2 (debt/testing/initial compliance) complete

---

## Sprint 9: Family Leave -- Maternity & Paternity (Weeks 17-18)

**Sprint Goal:** Implement statutory maternity and paternity leave calculations with SMP/SPP.

### Stories

#### S9-01: Maternity leave entitlement engine
- **Priority:** P0
- **Estimate:** 8 points (5 days)
- **Source:** UK Compliance Audit #4.1 (CRITICAL)
- **Description:** 52 weeks maternity leave (39 weeks paid: 6 weeks at 90% average earnings, 33 weeks at statutory rate). Qualifying criteria, KIT days, and compulsory leave enforcement required.
- **Acceptance Criteria:**
  - [ ] Migration creates maternity-specific tracking fields (EWC, MATB1 date, KIT days used)
  - [ ] Qualifying service check: 26 weeks continuous service by 15th week before EWC
  - [ ] SMP calculation: 6 weeks at 90% average weekly earnings, 33 weeks at statutory rate (or 90% AWE if lower)
  - [ ] 52-week reference period for average earnings calculation
  - [ ] Compulsory maternity leave enforcement (2 weeks from birth)
  - [ ] KIT day tracking (maximum 10 days)
  - [ ] Return-to-work date calculation
  - [ ] Leave balance adjusted automatically
  - [ ] Integration tests for qualifying criteria, SMP tiers, KIT day limits
- **Files:**
  - New: `packages/api/src/modules/absence/maternity.service.ts`
  - New migration for maternity leave tracking

#### S9-02: Paternity leave and SPP
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #4.2 (CRITICAL)
- **Description:** 2 weeks paternity leave at statutory rate. Must be taken within 56 days of birth/placement.
- **Acceptance Criteria:**
  - [ ] Paternity leave type with 2-week entitlement (1 or 2 consecutive weeks)
  - [ ] SPP at statutory rate
  - [ ] Qualifying criteria: 26 weeks continuous employment by 15th week before EWC
  - [ ] Timing constraint: must be taken within 56 days of birth/placement
  - [ ] Expected date tracking for advance booking
  - [ ] Integration tests for entitlement, timing constraints
- **Files:**
  - `packages/api/src/modules/absence/maternity.service.ts` (extend to paternity)
  - Leave type configuration

#### S9-03: Parental bereavement leave
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #4.5
- **Description:** 2 weeks statutory leave for parents losing a child under 18 (Jack's Law). SPBP calculation required.
- **Acceptance Criteria:**
  - [ ] Dedicated parental bereavement leave type with 2-week statutory minimum
  - [ ] SPBP at statutory rate
  - [ ] No qualifying period (available from day one)
  - [ ] Can be taken as 2 consecutive weeks or 2 separate weeks within 56 weeks
  - [ ] Sensitive handling: minimal approval workflow
- **Files:**
  - `packages/api/src/modules/absence/service.ts`
  - Leave type configuration

**Sprint 9 Velocity Target:** 13 points

---

## Sprint 10: Family Leave -- Shared Parental & Adoption (Weeks 19-20)

**Sprint Goal:** Complete family leave coverage with SPL, adoption leave, and unpaid parental leave.

### Stories

#### S10-01: Shared Parental Leave (SPL) and ShPP
- **Priority:** P1
- **Estimate:** 8 points (5 days)
- **Source:** UK Compliance Audit #4.3
- **Description:** Parents can share up to 50 weeks of leave and 37 weeks of pay. Complex notice and booking process.
- **Acceptance Criteria:**
  - [ ] SPL calculation: 52 weeks minus maternity/adoption leave taken = available SPL
  - [ ] ShPP: 39 weeks minus SMP/SAP weeks taken = available ShPP weeks
  - [ ] Curtailment notice tracking (mother must curtail maternity leave/SMP)
  - [ ] Booking notice periods (8 weeks before each block)
  - [ ] Up to 3 booking requests (employer can reject discontinuous leave)
  - [ ] SPLIT (Shared Parental Leave In Touch) day tracking (20 days)
  - [ ] Both parents can book from the same pool
  - [ ] Integration tests for curtailment, booking, ShPP calculation
- **Files:**
  - New: `packages/api/src/modules/absence/spl.service.ts`
  - New migration for SPL tracking

#### S10-02: Adoption leave and SAP
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #4.4
- **Description:** Same entitlements as maternity for the primary adopter. 52 weeks leave, SAP mirroring SMP rates.
- **Acceptance Criteria:**
  - [ ] Adoption leave entitlement mirroring maternity provisions
  - [ ] SAP calculation matching SMP (6 weeks 90% AWE + 33 weeks statutory)
  - [ ] Qualifying criteria: 26 weeks continuous service by matching week
  - [ ] Matching certificate tracking
  - [ ] KIT day allowance (10 days)
- **Files:**
  - Extend maternity service for adoption cases

#### S10-03: Unpaid parental leave tracking
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #4.6
- **Description:** 18 weeks per child up to age 18, taken in 1-week blocks, maximum 4 weeks per year per child.
- **Acceptance Criteria:**
  - [ ] Per-child leave tracking (not just per-employee)
  - [ ] 1-week block minimum enforcement
  - [ ] 4-week annual cap per child
  - [ ] 18-week lifetime cap per child
  - [ ] Child age validation (up to 18)
- **Files:**
  - `packages/api/src/modules/absence/service.ts`
  - New migration for child-linked leave tracking

**Sprint 10 Velocity Target:** 13 points

---

## Sprint 11: Pension Auto-Enrolment (Weeks 21-22)

**Sprint Goal:** Implement UK workplace pension auto-enrolment compliance.

### Stories

#### S11-01: Auto-enrolment eligibility assessment
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #10 (CRITICAL)
- **Description:** Automatically assess employee eligibility based on age (22 to state pension age) and earnings (above GBP 10,000/year).
- **Acceptance Criteria:**
  - [ ] Eligibility assessment engine checking age and earnings thresholds
  - [ ] Worker categories: eligible jobholder, non-eligible jobholder, entitled worker
  - [ ] Assessment runs automatically on: hire, age milestone, pay change
  - [ ] Postponement period tracking (up to 3 months)
  - [ ] Qualifying earnings band calculation (current: GBP 6,240 to GBP 50,270)
  - [ ] Thresholds configurable and versioned by tax year
  - [ ] Integration tests for each worker category
- **Files:**
  - New: `packages/api/src/modules/benefits/pension.service.ts`
  - New migration for pension auto-enrolment tracking

#### S11-02: Auto-enrolment processing and opt-out
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #10
- **Acceptance Criteria:**
  - [ ] Automatic enrolment triggered for eligible jobholders
  - [ ] Opt-out window management (1 month from enrolment date)
  - [ ] Opt-in handling for non-eligible workers who request it
  - [ ] Minimum contribution rate enforcement: 5% employee + 3% employer = 8% total
  - [ ] Contribution calculated on qualifying earnings (between lower and upper thresholds)
  - [ ] Opt-out refund processing within opt-out window
  - [ ] Domain events emitted for enrolment, opt-out, contribution changes
- **Files:**
  - `packages/api/src/modules/benefits/pension.service.ts`
  - `packages/api/src/modules/benefits/routes.ts`

#### S11-03: Re-enrolment and TPR compliance
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #10
- **Acceptance Criteria:**
  - [ ] 3-yearly re-enrolment processing for opted-out employees
  - [ ] Re-enrolment date calculation and tracking
  - [ ] Re-enrolment notification to employees
  - [ ] TPR declaration of compliance data export
  - [ ] Audit trail for all pension-related decisions
- **Files:**
  - `packages/api/src/modules/benefits/pension.service.ts`
  - `packages/api/src/worker/scheduler.ts` (re-enrolment scheduler)

**Sprint 11 Velocity Target:** 13 points

---

## Sprint 12: HMRC Integration & Payroll (Weeks 23-24)

**Sprint Goal:** Build payroll integration interfaces and HMRC data management.

### Stories

#### S12-01: Payroll data export interface
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #11 (CRITICAL -- typically handled by payroll software)
- **Description:** Staffora should provide structured data export for payroll systems (Sage, Xero, etc.) rather than implementing PAYE/RTI directly.
- **Acceptance Criteria:**
  - [ ] Payroll export endpoint generating structured data per pay period
  - [ ] Export includes: employee details, hours worked, absence records, SSP/SMP/SPP entitlements
  - [ ] Configurable pay period alignment (weekly, monthly, 4-weekly)
  - [ ] CSV and JSON export formats
  - [ ] Delta export (changes since last export) for incremental sync
  - [ ] Audit trail of all payroll exports
- **Files:**
  - New: `packages/api/src/modules/hr/payroll-export.service.ts`
  - `packages/api/src/jobs/export-worker.ts`

#### S12-02: Tax code storage and management
- **Priority:** P1
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #11
- **Acceptance Criteria:**
  - [ ] Tax code field added to employee record with effective dating
  - [ ] Tax code format validation (e.g., 1257L, BR, D0, NT)
  - [ ] Tax code change history tracked
  - [ ] P45 starter declaration tracking for new employees
  - [ ] NI category letter storage
- **Files:**
  - New migration for tax code fields
  - `packages/api/src/modules/hr/repository.ts`

#### S12-03: P45/P60/P11D document storage
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #11.2
- **Acceptance Criteria:**
  - [ ] Document types for P45, P60, P11D in documents module
  - [ ] Upload endpoint for payroll-system-generated documents
  - [ ] Automatic association with employee and tax year
  - [ ] Employee self-service access via portal
  - [ ] Retention policy: minimum 6 years after end of tax year
- **Files:**
  - `packages/api/src/modules/documents/service.ts`
  - Document type configuration

#### S12-04: Holiday pay 52-week reference period calculation
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #2.5
- **Description:** Holiday pay must include regular overtime, commission, and bonuses using 52-week reference period (excluding weeks with no pay).
- **Acceptance Criteria:**
  - [ ] 52-week reference period calculation engine
  - [ ] Includes: base pay, regular overtime, commission, allowances
  - [ ] Excludes weeks with zero pay (extends lookback)
  - [ ] Capped at 104-week total lookback
  - [ ] Average weekly pay calculated for holiday pay rate
  - [ ] Integration with payroll export data
- **Files:**
  - New: `packages/api/src/modules/absence/holiday-pay.service.ts`

**Sprint 12 Velocity Target:** 12 points

---

## Sprint 13: GDPR & Data Protection (Weeks 25-26)

**Sprint Goal:** Complete GDPR compliance features: data retention, erasure, and breach notification.

### Stories

#### S13-01: Data retention and anonymisation engine
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #7.4, Security Audit MEDIUM-04
- **Description:** No automated data retention or anonymisation. Personal data kept indefinitely.
- **Acceptance Criteria:**
  - [ ] Configurable retention schedules per data category (e.g., 6 years post-employment for tax records)
  - [ ] Anonymisation function replacing PII with anonymised values (name, address, identifiers)
  - [ ] Scheduled job runs daily to identify records past retention period
  - [ ] Legal hold mechanism prevents anonymisation of data under litigation
  - [ ] Audit trail of all anonymisation operations
  - [ ] Employee records anonymised, not deleted (preserves aggregate analytics)
- **Files:**
  - New: `packages/api/src/modules/hr/retention.service.ts`
  - `packages/api/src/worker/scheduler.ts`

#### S13-02: Data breach notification workflow
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #7.5
- **Acceptance Criteria:**
  - [ ] Breach incident creation endpoint with: description, affected data scope, discovery date
  - [ ] 72-hour countdown timer from discovery to ICO notification deadline
  - [ ] Risk assessment: likelihood and severity of harm to individuals
  - [ ] Notification templates: ICO report, affected individual notification
  - [ ] Breach register for ongoing tracking and annual review
  - [ ] Dashboard alerts for active breach incidents
- **Files:**
  - New migration for breach incident tracking
  - New: `packages/api/src/modules/hr/breach.service.ts`

#### S13-03: Privacy notice management
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** UK Compliance Audit #7.2
- **Acceptance Criteria:**
  - [ ] Employee privacy notice template system
  - [ ] Delivery tracking: when notice was provided to each employee
  - [ ] Acknowledgement recording with timestamp
  - [ ] Version tracking: when privacy notice is updated, re-acknowledgement required
  - [ ] Portal integration for employee self-service acknowledgement
- **Files:**
  - `packages/api/src/modules/documents/service.ts`
  - `packages/api/src/modules/portal/service.ts`

#### S13-04: Automatic read audit logging for sensitive data
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Source:** Security Audit LOW-02
- **Acceptance Criteria:**
  - [ ] `onAfterHandle` hook automatically logs read access to sensitive entities
  - [ ] Sensitive routes identified by pattern (employee, compensation, identifiers)
  - [ ] Audit log includes: who accessed, what data, when, IP address
  - [ ] No performance degradation for non-sensitive routes
  - [ ] Configurable via `FEATURE_AUDIT_READS` env var
- **Files:**
  - `packages/api/src/plugins/audit.ts`

**Sprint 13 Velocity Target:** 12 points

---

## Sprint 14: Disciplinary & Flexible Working (Weeks 27-28)

**Sprint Goal:** Implement ACAS-compliant disciplinary/grievance workflows and flexible working requests.

### Stories

#### S14-01: ACAS-compliant disciplinary workflow
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Source:** UK Compliance Audit #6 (HIGH)
- **Acceptance Criteria:**
  - [ ] Disciplinary case category with ACAS stages: investigation -> hearing -> outcome -> appeal
  - [ ] Hearing scheduling with minimum notice period tracking
  - [ ] Right to be accompanied notification
  - [ ] Sanction tracking: verbal warning, written warning, final warning, dismissal
  - [ ] Warning register with configurable expiry dates
  - [ ] Appeal workflow ensuring different decision maker
  - [ ] Investigation assignment and evidence collection
- **Files:**
  - `packages/api/src/modules/cases/service.ts`
  - New migration for disciplinary-specific fields

#### S14-02: Flexible working request system
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #5 (HIGH)
- **Acceptance Criteria:**
  - [ ] Flexible working request form with proposed changes
  - [ ] Available from day one (April 2024 change)
  - [ ] 2-month response deadline tracking
  - [ ] Maximum 2 requests per 12-month rolling period
  - [ ] 8 statutory grounds for refusal available for manager response
  - [ ] Appeal process
  - [ ] Request state machine: submitted -> under_consideration -> approved/refused -> appeal
- **Files:**
  - New migration for flexible working requests table
  - New: `packages/api/src/modules/hr/flexible-working.service.ts`

#### S14-03: Gender pay gap reporting
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Source:** UK Compliance Audit #8.2
- **Acceptance Criteria:**
  - [ ] Report calculating: mean/median gender hourly pay gap
  - [ ] Bonus pay gap (mean/median)
  - [ ] Proportion of males/females in each pay quartile
  - [ ] Proportion receiving bonus pay by gender
  - [ ] Snapshot date configurable (default: 5 April each year)
  - [ ] Export in format suitable for GOV.UK submission
- **Files:**
  - `packages/api/src/modules/analytics/service.ts`
  - `packages/api/src/modules/analytics/repository.ts`

**Sprint 14 Velocity Target:** 11 points

---

## Sprint 15: Enhanced Reporting & Analytics (Weeks 29-30)

**Sprint Goal:** Build production-grade reporting and analytics capabilities.

### Stories

#### S15-01: Compliance dashboard
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Description:** Centralised view of all compliance status across UK statutory requirements.
- **Acceptance Criteria:**
  - [ ] Dashboard showing: RTW check status, expiring documents, SSP claims, pension enrolment status
  - [ ] Holiday entitlement compliance check (all UK employees >= 28 days)
  - [ ] DSAR request status tracker
  - [ ] Data retention compliance status
  - [ ] Exportable compliance summary report
- **Files:**
  - `packages/api/src/modules/analytics/service.ts`
  - Frontend: new compliance dashboard route

#### S15-02: Absence analytics reports
- **Priority:** P2
- **Estimate:** 3 points (2 days)
- **Acceptance Criteria:**
  - [ ] Bradford Factor calculation per employee
  - [ ] Absence trends by department, type, and period
  - [ ] Cost of absence calculation
  - [ ] Return-to-work interview tracking
  - [ ] Trigger alerts for employees exceeding absence thresholds

#### S15-03: Headcount and turnover reports
- **Priority:** P2
- **Estimate:** 2 points (1 day)
- **Acceptance Criteria:**
  - [ ] Headcount report by department, location, employment type
  - [ ] Turnover rate calculation (monthly, quarterly, annual)
  - [ ] New starter report
  - [ ] Leaver analysis (reasons, tenure distribution)
  - [ ] FTE vs headcount breakdown

**Sprint 15 Velocity Target:** 10 points

---

## Sprint 16: Production Deployment Preparation (Weeks 31-32)

**Sprint Goal:** Final hardening, monitoring, and documentation for production launch.

### Stories

#### S16-01: Monitoring stack deployment
- **Priority:** P0
- **Estimate:** 5 points (3 days)
- **Source:** Infrastructure Audit, Architecture Risk R13
- **Acceptance Criteria:**
  - [ ] Prometheus + Grafana deployed via Docker Compose production profile
  - [ ] API and worker metrics scraped
  - [ ] Dashboards: request rate/latency, error rate, DB pool usage, Redis memory, queue depth
  - [ ] Alerts configured: high error rate (>5%), queue backlog (>100), connection pool exhaustion
  - [ ] Uptime monitoring endpoint with external checker
- **Files:**
  - `docker/docker-compose.yml` (monitoring profile)
  - New: `docker/prometheus/prometheus.yml`
  - New: `docker/grafana/dashboards/`

#### S16-02: Database replication and point-in-time recovery
- **Priority:** P1
- **Estimate:** 5 points (3 days)
- **Source:** Infrastructure Audit, Architecture Risk R3
- **Acceptance Criteria:**
  - [ ] PostgreSQL WAL archiving configured
  - [ ] Point-in-time recovery documented and tested
  - [ ] Streaming replication to read replica operational
  - [ ] Failover procedure documented
  - [ ] RTO target: < 15 minutes; RPO target: < 5 minutes
- **Files:**
  - Docker Compose and PostgreSQL configuration

#### S16-03: Disaster recovery plan and runbook
- **Priority:** P1
- **Estimate:** 3 points (2 days)
- **Acceptance Criteria:**
  - [ ] RTO/RPO targets defined per service
  - [ ] Runbooks for: application crash, database corruption, data centre failure, security breach
  - [ ] Backup restore tested and documented
  - [ ] Communication plan for incidents
  - [ ] Quarterly DR drill schedule established
- **Files:**
  - New: `Docs/operations/disaster-recovery.md`
  - New: `Docs/operations/runbooks/`

#### S16-04: Production environment configuration
- **Priority:** P0
- **Estimate:** 3 points (2 days)
- **Acceptance Criteria:**
  - [ ] Production Docker Compose with: resource limits, restart policies, log rotation
  - [ ] SSL/TLS certificate provisioning (Let's Encrypt or manual)
  - [ ] Production nginx configuration validated
  - [ ] Environment variables documented with production defaults
  - [ ] Secrets rotation procedure documented
  - [ ] Pre-launch checklist completed
- **Files:**
  - `docker/docker-compose.yml`
  - `docker/nginx/nginx.conf`
  - `docker/.env.example`

**Sprint 16 Velocity Target:** 16 points

---

## Phase 3 Exit Criteria

- [ ] All family leave types implemented (maternity, paternity, SPL, adoption, bereavement, unpaid parental)
- [ ] Pension auto-enrolment engine operational
- [ ] Payroll data export interface functional
- [ ] Tax code management in place
- [ ] GDPR: data retention, breach notification, privacy notices complete
- [ ] ACAS-compliant disciplinary workflow
- [ ] Flexible working request system
- [ ] Gender pay gap reporting
- [ ] Holiday pay 52-week reference period calculation
- [ ] Compliance dashboard functional
- [ ] Monitoring stack deployed (Prometheus + Grafana)
- [ ] Database replication and PITR configured
- [ ] Disaster recovery plan documented and tested
- [ ] Production environment ready for launch

**Total Phase 3 Effort:** ~100 story points across 8 sprints
**Total Phase 3 Duration:** 16 weeks
