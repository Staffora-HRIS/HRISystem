# Staffora HRIS -- Risk Register

**Last Updated:** 2026-03-13
**Review Cadence:** Monthly
**Status:** Pre-production

---

## Risk Scoring

- **Probability:** Unlikely (1) | Possible (2) | Likely (3)
- **Impact:** Low (1) | Medium (2) | High (3) | Critical (4)
- **Risk Score:** Probability x Impact (max 12)
- **Threshold:** Score >= 6 requires active mitigation plan

---

## Active Risks

### R01: Production RLS Bypass -- Superuser Connection

| Field | Value |
|-------|-------|
| **ID** | RISK-01 |
| **Category** | Security |
| **Probability** | Likely (3) |
| **Impact** | Critical (4) |
| **Risk Score** | **12** |
| **Source** | Infrastructure Audit #2 |
| **Description** | The application connects as `hris` superuser in production, completely bypassing Row-Level Security. Multi-tenant data isolation is not enforced. Any SQL query returns all tenants' data. |
| **Consequence** | Data breach exposing all tenants' employee PII. Legal liability under UK GDPR (fines up to GBP 17.5M or 4% of revenue). Complete loss of customer trust. |
| **Mitigation** | Create `hris_app` role with NOBYPASSRLS in `docker/postgres/init.sql`. Configure production to use `hris_app` for API/worker connections. Reserve `hris` for migrations only. |
| **Owner** | Sprint 2 (S2-02) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 4 |

---

### R02: CSRF Protection Non-Functional

| Field | Value |
|-------|-------|
| **ID** | RISK-02 |
| **Category** | Security |
| **Probability** | Likely (3) |
| **Impact** | Critical (4) |
| **Risk Score** | **12** |
| **Source** | Security Audit HIGH-01, Architecture Risk R1 |
| **Description** | Backend checks for CSRF header presence but never validates the token. Frontend never sends a CSRF token. In production, either: (a) all mutations fail with 403 (if enforcement is strict), or (b) any arbitrary token passes (if check is presence-only). Currently the latter -- any non-empty string bypasses CSRF. |
| **Consequence** | Cross-site request forgery attacks against authenticated users. An attacker can create/modify/delete employee records, approve leave, change compensation via forged requests. |
| **Mitigation** | Implement HMAC-signed CSRF tokens on server. Add token fetching and header injection in frontend API client. |
| **Owner** | Sprint 1 (S1-01) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 2 |

---

### R03: No Graceful Shutdown -- Data Corruption on Deploy

| Field | Value |
|-------|-------|
| **ID** | RISK-03 |
| **Category** | Reliability |
| **Probability** | Likely (3) |
| **Impact** | High (3) |
| **Risk Score** | **9** |
| **Source** | Architecture Risk R2 |
| **Description** | API server has no SIGTERM/SIGINT handlers. Deployments and container restarts will abruptly terminate in-flight requests, potentially leaving open transactions and leaked DB connections. |
| **Consequence** | Corrupted transactions, orphaned RLS context state, database connection exhaustion after repeated deploys. Users experience random 500 errors during deployments. |
| **Mitigation** | Add signal handlers to `app.ts` that drain connections and close DB/Redis. Implement request drain period (30s). Pattern already exists in worker.ts. |
| **Owner** | Sprint 2 (S2-01) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 4 |

---

### R04: No Deployment Pipeline

| Field | Value |
|-------|-------|
| **ID** | RISK-04 |
| **Category** | Infrastructure |
| **Probability** | Likely (3) |
| **Impact** | High (3) |
| **Risk Score** | **9** |
| **Source** | Infrastructure Audit Gap #1 |
| **Description** | No CD workflow. No Docker image building in CI. No staging or production deployment automation. |
| **Consequence** | Manual deployments are error-prone, unrepeatable, and ungoverned. No rollback mechanism. Inconsistent environments between development and production. |
| **Mitigation** | Create GitHub Actions deploy workflow. Build/push Docker images to GHCR. Auto-deploy to staging on merge to main. Manual gate for production. |
| **Owner** | Sprint 3 (S3-01) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 6 |

---

### R05: Single Points of Failure (Database, Redis, API)

| Field | Value |
|-------|-------|
| **ID** | RISK-05 |
| **Category** | Infrastructure |
| **Probability** | Possible (2) |
| **Impact** | Critical (4) |
| **Risk Score** | **8** |
| **Source** | Architecture Risk R3 |
| **Description** | All services are single-instance: PostgreSQL, Redis, API, Worker. No replication, no failover, no horizontal scaling. |
| **Consequence** | Any single service failure causes complete platform outage. Database failure risks data loss for all data since last backup (up to 24 hours). |
| **Mitigation** | Phase 3: PostgreSQL streaming replication + WAL archiving. Redis Sentinel. API horizontal scaling behind load balancer. Multiple worker instances via Redis consumer groups. |
| **Owner** | Sprint 16 (S16-02) |
| **Status** | OPEN -- Planned for Phase 3 |
| **Target Date** | Week 32 |

---

### R06: Database Connection Pool Exhaustion

| Field | Value |
|-------|-------|
| **ID** | RISK-06 |
| **Category** | Reliability |
| **Probability** | Possible (2) |
| **Impact** | High (3) |
| **Risk Score** | **6** |
| **Source** | Architecture Risk R4 |
| **Description** | Three independent connection pools (API: 20, BetterAuth: 10, Scheduler: unlimited) compete for PostgreSQL's default 100 max connections. |
| **Consequence** | Under load, connection exhaustion causes 500 errors for all users. BetterAuth's separate pg Pool compounds the issue. |
| **Mitigation** | Consolidate to single postgres.js connection pool. Remove pg dependency. Limit scheduler pool. Set PostgreSQL max_connections appropriately. |
| **Owner** | Sprint 2 (S2-03) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 4 |

---

### R07: Account Brute-Force Vulnerability

| Field | Value |
|-------|-------|
| **ID** | RISK-07 |
| **Category** | Security |
| **Probability** | Possible (2) |
| **Impact** | High (3) |
| **Risk Score** | **6** |
| **Source** | Security Audit HIGH-03 |
| **Description** | Rate limiting is IP-based only. No account-level lockout. Attackers using proxy rotation can make unlimited password attempts against a single account. |
| **Consequence** | Credential stuffing attacks succeed against accounts with weak passwords. Unauthorized access to employee PII. |
| **Mitigation** | Implement account lockout after 10 failed attempts. Track per-account failures. Exponential backoff. Auto-unlock after 30 minutes. |
| **Owner** | Sprint 1 (S1-02) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 2 |

---

### R08: Hollow Tests Providing False Confidence

| Field | Value |
|-------|-------|
| **ID** | RISK-08 |
| **Category** | Quality |
| **Probability** | Likely (3) |
| **Impact** | Medium (2) |
| **Risk Score** | **6** |
| **Source** | Testing Audit #3.1, #3.2, Technical Debt Report #6 |
| **Description** | 1 fully hollow E2E test and 14 service unit tests that test extracted copies of business logic rather than actual service classes. The employee-lifecycle E2E test creates JS objects and asserts string equality -- zero DB operations. |
| **Consequence** | False sense of test coverage. Regressions in business logic go undetected. Service logic can drift from test copies without detection. |
| **Mitigation** | Rewrite hollow E2E test with real DB operations. Fix service tests to import actual service classes. Create TestApiClient for HTTP-level testing. |
| **Owner** | Sprint 8 (S8-01, S8-02) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 16 |

---

### R09: Backups Not Offsite

| Field | Value |
|-------|-------|
| **ID** | RISK-09 |
| **Category** | Disaster Recovery |
| **Probability** | Possible (2) |
| **Impact** | Critical (4) |
| **Risk Score** | **8** |
| **Source** | Infrastructure Audit Issue |
| **Description** | Database backups stored only in a Docker volume on the same host. Host failure means both the database and all backups are lost. |
| **Consequence** | Unrecoverable data loss for all tenants. Business-ending event for an HRIS platform. |
| **Mitigation** | Push backups to S3 after each dump. Add backup verification (restore test). Implement WAL archiving for point-in-time recovery. |
| **Owner** | Sprint 3 (S3-06) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 6 |

---

### R10: No Monitoring or Alerting

| Field | Value |
|-------|-------|
| **ID** | RISK-10 |
| **Category** | Operations |
| **Probability** | Likely (3) |
| **Impact** | Medium (2) |
| **Risk Score** | **6** |
| **Source** | Architecture Risk R13, Infrastructure Audit |
| **Description** | No structured logging, no error tracking, no metrics, no dashboards, no alerting. Container logs rotate every 50MB and are unsearchable. |
| **Consequence** | Production issues go undetected until users report them. Root cause analysis requires SSH into containers to grep logs. No capacity planning data. |
| **Mitigation** | Phase 1: Structured logging (Pino) + Sentry. Phase 3: Prometheus + Grafana + alerting. |
| **Owner** | Sprint 3 (S3-02, S3-03), Sprint 16 (S16-01) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 6 (basic), Week 32 (full) |

---

### R11: UK Right to Work Non-Compliance

| Field | Value |
|-------|-------|
| **ID** | RISK-11 |
| **Category** | Legal/Compliance |
| **Probability** | Likely (3) |
| **Impact** | Critical (4) |
| **Risk Score** | **12** |
| **Source** | UK Compliance Audit #1 |
| **Description** | No right-to-work verification workflow. Employers using Staffora cannot record or track RTW checks. Immigration Act violations carry unlimited fines and up to 5 years imprisonment. |
| **Consequence** | Customers using Staffora as sole HR system have no RTW compliance tooling. Legal liability for the customer, reputational risk for Staffora. |
| **Mitigation** | Build RTW verification workflow with document check tracking, expiry alerts, and employee activation gate. |
| **Owner** | Sprint 6 (S6-01, S6-02) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 12 |

---

### R12: No Statutory Sick Pay Calculation

| Field | Value |
|-------|-------|
| **ID** | RISK-12 |
| **Category** | Legal/Compliance |
| **Probability** | Likely (3) |
| **Impact** | High (3) |
| **Risk Score** | **9** |
| **Source** | UK Compliance Audit #3 |
| **Description** | No SSP logic: no waiting days, no PIW linking, no LEL check, no 28-week maximum. Customers cannot calculate SSP obligations. |
| **Consequence** | Payroll errors, underpayment of SSP, employment tribunal claims. |
| **Mitigation** | Build SSP calculation engine with all statutory components. |
| **Owner** | Sprint 7 (S7-01) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 14 |

---

### R13: No Family Leave Calculations (SMP/SPP)

| Field | Value |
|-------|-------|
| **ID** | RISK-13 |
| **Category** | Legal/Compliance |
| **Probability** | Likely (3) |
| **Impact** | High (3) |
| **Risk Score** | **9** |
| **Source** | UK Compliance Audit #4 |
| **Description** | No maternity, paternity, adoption, shared parental, or bereavement leave calculations. Leave categories exist as enums but no entitlement logic is implemented. |
| **Consequence** | Discrimination claims, incorrect SMP/SPP calculations, tribunal exposure. |
| **Mitigation** | Implement family leave module starting with maternity (most complex, establishes patterns for others). |
| **Owner** | Sprint 9-10 (S9-01 through S10-03) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 20 |

---

### R14: No Pension Auto-Enrolment

| Field | Value |
|-------|-------|
| **ID** | RISK-14 |
| **Category** | Legal/Compliance |
| **Probability** | Likely (3) |
| **Impact** | Critical (4) |
| **Risk Score** | **12** |
| **Source** | UK Compliance Audit #10 |
| **Description** | No auto-enrolment eligibility assessment, no enrolment processing, no opt-out tracking, no contribution calculation. TPR can impose fines and criminal prosecution for non-compliance. |
| **Consequence** | Customers who rely solely on Staffora for pension enrolment would be in breach of Pensions Act 2008. |
| **Mitigation** | Build auto-enrolment engine with eligibility assessment, opt-out window management, contribution calculation, and re-enrolment scheduling. |
| **Owner** | Sprint 11 (S11-01 through S11-03) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 22 |

---

### R15: GDPR Data Subject Rights Not Implemented

| Field | Value |
|-------|-------|
| **ID** | RISK-15 |
| **Category** | Legal/Compliance |
| **Probability** | Possible (2) |
| **Impact** | Critical (4) |
| **Risk Score** | **8** |
| **Source** | Security Audit MEDIUM-03/04, UK Compliance Audit #7 |
| **Description** | No DSAR capability, no data erasure/anonymisation, no data retention automation, no breach notification workflow. |
| **Consequence** | ICO enforcement action. Fines up to GBP 17.5M. Inability to respond to data subject requests within the 30-day statutory period. |
| **Mitigation** | Phase 2: DSAR workflow. Phase 3: Data retention engine, breach notification, privacy notices. |
| **Owner** | Sprint 7 (S7-04), Sprint 13 |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 14 (DSAR), Week 26 (full) |

---

### R16: Shared Package Unused in Production

| Field | Value |
|-------|-------|
| **ID** | RISK-16 |
| **Category** | Technical Debt |
| **Probability** | Likely (3) |
| **Impact** | Medium (2) |
| **Risk Score** | **6** |
| **Source** | Technical Debt Report #2.1 |
| **Description** | `@staffora/shared` has zero imports in production API or frontend code. Error codes, state machines, and types are duplicated locally in each module. |
| **Consequence** | Inconsistent behavior across modules. Error codes drift between shared definitions and local copies. State machine logic duplicated and potentially divergent. Maintenance burden doubles. |
| **Mitigation** | Systematically replace local definitions with shared package imports, starting with error codes and state machines. |
| **Owner** | Sprint 4 (S4-02, S4-03, S4-04) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 8 |

---

### R17: UK Statutory Rate Changes Not Automated

| Field | Value |
|-------|-------|
| **ID** | RISK-17 |
| **Category** | Compliance Operations |
| **Probability** | Likely (3) |
| **Impact** | Medium (2) |
| **Risk Score** | **6** |
| **Source** | UK Compliance Audit (general) |
| **Description** | SSP rates, SMP rates, pension thresholds, LEL, and other statutory values change annually (typically every April). No automated mechanism to update these values. |
| **Consequence** | Using outdated rates leads to incorrect calculations, underpayment, and compliance failures. |
| **Mitigation** | Store all statutory rates in a versioned configuration table keyed by tax year. Document annual update process. Add validation that rates are current. |
| **Owner** | Unassigned |
| **Status** | OPEN -- Planned for Phase 3 |
| **Target Date** | Week 22 |

---

### R18: Migration Renumbering Drift

| Field | Value |
|-------|-------|
| **ID** | RISK-18 |
| **Category** | Database |
| **Probability** | Possible (2) |
| **Impact** | Medium (2) |
| **Risk Score** | **4** |
| **Source** | Architecture Risk R15, Technical Debt Report #5.1 |
| **Description** | Migrations were renumbered (old 0076-0116 to new 0081-0122). A fixup script exists but any existing database with old numbering could be out of sync. |
| **Consequence** | Re-applied migrations cause errors or data corruption. New deployments against existing databases fail. |
| **Mitigation** | Ensure fixup script is applied to all environments. Add migration validation test. Document renumbering in migration README. |
| **Owner** | Sprint 4 |
| **Status** | OPEN |
| **Target Date** | Week 8 |

---

### R19: Dual PostgreSQL Driver

| Field | Value |
|-------|-------|
| **ID** | RISK-19 |
| **Category** | Technical Debt |
| **Probability** | Possible (2) |
| **Impact** | Medium (2) |
| **Risk Score** | **4** |
| **Source** | Technical Debt Report #3.2 |
| **Description** | Both `postgres` (postgres.js) and `pg` (node-postgres) are used. `pg` is only for BetterAuth's Pool adapter (single import). Creates duplicate connection pools and maintenance confusion. |
| **Consequence** | Connection pool conflicts. Two drivers with different behavior semantics. Increased dependency surface area. |
| **Mitigation** | Configure BetterAuth to use postgres.js adapter. Remove `pg` and `@types/pg`. |
| **Owner** | Sprint 2 (S2-03) |
| **Status** | OPEN -- Not started |
| **Target Date** | Week 4 |

---

### R20: No Migration Rollback Support

| Field | Value |
|-------|-------|
| **ID** | RISK-20 |
| **Category** | Database |
| **Probability** | Possible (2) |
| **Impact** | High (3) |
| **Risk Score** | **6** |
| **Source** | Infrastructure Audit #1 |
| **Description** | `migrate:down` throws an error. DOWN sections exist in migration files but cannot be executed. Bad migrations require manual database intervention. |
| **Consequence** | Any migration error requires manual SQL fixes or database restore. Deployment risk increases with each migration. |
| **Mitigation** | Implement down migration execution. Alternatively, adopt blue/green deployment strategy that doesn't rely on rollback. |
| **Owner** | Unassigned |
| **Status** | OPEN -- Deprioritised in favour of blue/green approach |
| **Target Date** | TBD |

---

## Risk Summary Matrix

```
                     Impact
                Low(1)   Medium(2)   High(3)    Critical(4)
            +--------+-----------+----------+-------------+
  Likely(3) |        | R08,R10   | R03,R04  | R01,R02     |
            |        | R16,R17   | R12,R13  | R11,R14     |
            +--------+-----------+----------+-------------+
  Possible  |        | R18,R19   | R06,R07  | R05,R09     |
  (2)       |        |           | R20      | R15         |
            +--------+-----------+----------+-------------+
  Unlikely  |        |           |          |             |
  (1)       |        |           |          |             |
            +--------+-----------+----------+-------------+
```

---

## Risk Response Summary

| Score Range | Count | Response |
|-------------|-------|----------|
| 9-12 (Critical) | 7 | Active mitigation required. Scheduled in Phase 1-2. |
| 6-8 (High) | 8 | Mitigation planned. Scheduled in Phase 1-3. |
| 4-5 (Medium) | 3 | Monitor. Address when resources allow. |
| 1-3 (Low) | 2 | Accept. Document and revisit quarterly. |

---

## Closed/Mitigated Risks

| ID | Title | Closure Date | Resolution |
|----|-------|-------------|------------|
| -- | -- | -- | No risks closed yet |

---

## Review Log

| Date | Reviewer | Changes |
|------|----------|---------|
| 2026-03-13 | Initial creation | All 20 risks identified from 6 audit reports |
