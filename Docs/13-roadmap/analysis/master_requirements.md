# Staffora HRIS — Master Requirements

*Last updated: 2026-03-28*

**Source Documents:** Docs/ (18 files), audit/ (17 files), project-management/ (6 files)
**Generated:** 2026-03-14
**Total Requirements Identified:** 603 features from enterprise HR checklist + infrastructure, security, testing, and compliance requirements
**Documentation Coverage Analysed:** 100% of Docs/ directory

---

## Requirement Categories

| # | Category | Total Items | Source |
|---|----------|-------------|--------|
| 1 | Employee Lifecycle Management | 58 | ENTERPRISE_HR_CAPABILITY_CHECKLIST.md §1 |
| 2 | Organisation Structure | 34 | §2 |
| 3 | Position & Job Management | 15 | §3 |
| 4 | Compensation & Payroll | 44 | §6 |
| 5 | Contracts & Employment Terms | 30 | §5 |
| 6 | Absence & Leave Management | 49 | §7 |
| 7 | Time & Attendance | 30 | §8 |
| 8 | Recruitment & ATS | 32 | §9 |
| 9 | Onboarding | 24 | §10 |
| 10 | Performance Management | 25 | §11 |
| 11 | Learning & Development | 20 | §12 |
| 12 | Benefits Administration | 18 | §14 |
| 13 | Case Management | 20 | §15 |
| 14 | Document Management | 16 | §16 |
| 15 | Employee Self-Service Portal | 19 | §19 |
| 16 | Manager Self-Service | 14 | §20 |
| 17 | Workflow & Approvals | 16 | §17 |
| 18 | Reporting & Analytics | 24 | §18 |
| 19 | Security & Access Control | 26 | §21 |
| 20 | UK Employment Compliance | 28 | §22 |
| 21 | System Administration | 21 | §24 |
| 22 | Integration & APIs | 18 | §23 |
| 23 | Mobile & Accessibility | 16 | §25 |
| 24 | Talent Management | 14 | §13 |
| 25 | Infrastructure & Operations | 30 | PRODUCTION_CHECKLIST.md, architecture/README.md |
| 26 | Security Infrastructure | 22 | patterns/SECURITY.md, PRODUCTION_CHECKLIST.md §3 |
| 27 | Testing Requirements | 18 | PRODUCTION_CHECKLIST.md §5 |
| **Total** | | **~651** | |

---

## Core System Requirements (from Docs/)

### REQ-INFRA: Infrastructure & Deployment

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| INFRA-001 | Container registry push workflow (ECR/GCR/GHCR) | PRODUCTION_CHECKLIST §1 | P0 |
| INFRA-002 | Let's Encrypt / certbot auto-renewal | PRODUCTION_CHECKLIST §1 | P0 |
| INFRA-003 | Automated daily backups (pg_dump or WAL archiving) | PRODUCTION_CHECKLIST §1 | P0 |
| INFRA-004 | Backup restore procedure documented and tested | PRODUCTION_CHECKLIST §1 | P0 |
| INFRA-005 | Kubernetes manifests (Deployment, Service, Ingress, HPA) | PRODUCTION_CHECKLIST §1 | P1 |
| INFRA-006 | Point-in-time recovery (PITR) with WAL-G or pgBackRest | PRODUCTION_CHECKLIST §1 | P1 |
| INFRA-007 | Read replica for reporting queries | PRODUCTION_CHECKLIST §1 | P1 |
| INFRA-008 | CDN (CloudFront / Cloudflare) for static assets | PRODUCTION_CHECKLIST §1 | P1 |
| INFRA-009 | Blue/green or rolling deployment strategy | PRODUCTION_CHECKLIST §2 | P1 |
| INFRA-010 | Prometheus + Grafana monitoring stack deployment | WORKER_SYSTEM.md, PRODUCTION_CHECKLIST §4 | P1 |
| INFRA-011 | Log aggregation (ELK/Loki) | PRODUCTION_CHECKLIST §4 | P2 |
| INFRA-012 | Helm chart for parameterized deploys | PRODUCTION_CHECKLIST §1 | P2 |
| INFRA-013 | Terraform/Pulumi IaC for cloud resources | PRODUCTION_CHECKLIST §1 | P2 |
| INFRA-014 | PgBouncer connection pooling (external pooler) | PRODUCTION_CHECKLIST §1 | P2 |
| INFRA-015 | WAL archiving for point-in-time recovery | PRODUCTION_CHECKLIST §1 | P2 |
| INFRA-016 | Secret rotation documentation/tooling | PRODUCTION_CHECKLIST §3 | P2 |

### REQ-CICD: CI/CD Pipeline

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| CICD-001 | GitHub Actions: build + typecheck on every PR | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-002 | GitHub Actions: run API tests on every PR | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-003 | GitHub Actions: run frontend tests on every PR | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-004 | GitHub Actions: lint check on every PR | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-005 | Staging environment with same infra as production | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-006 | Production deployment workflow | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-007 | Database migration runner in deploy pipeline | PRODUCTION_CHECKLIST §2 | P0 |
| CICD-008 | Code coverage reporting (Codecov / Coveralls) | PRODUCTION_CHECKLIST §2 | P1 |
| CICD-009 | Coverage thresholds (API >=80%, Web >=60%) | PRODUCTION_CHECKLIST §2 | P1 |
| CICD-010 | Automated rollback on health check failure | PRODUCTION_CHECKLIST §2 | P1 |
| CICD-011 | Playwright E2E tests in CI | PRODUCTION_CHECKLIST §2 | P2 |

### REQ-SEC: Security Requirements

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| SEC-001 | Enforce MFA for admin roles in production | PRODUCTION_CHECKLIST §3, patterns/SECURITY.md | P0 |
| SEC-002 | Password policy enforcement (min length, complexity, history) | PRODUCTION_CHECKLIST §3 | P1 |
| SEC-003 | Account lockout after N failed attempts | PRODUCTION_CHECKLIST §3, security-audit | P1 |
| SEC-004 | Session timeout configuration (idle + absolute) | PRODUCTION_CHECKLIST §3 | P1 |
| SEC-005 | MFA recovery code flow | PRODUCTION_CHECKLIST §3 | P1 |
| SEC-006 | OAuth2/OIDC SSO (Google, Microsoft, Okta) | PRODUCTION_CHECKLIST §3, feature-validation SAC-007 | P2 |
| SEC-007 | IP allowlist/blocklist per tenant | PRODUCTION_CHECKLIST §3 | P2 |
| SEC-008 | IP-based rate limiting for unauthenticated endpoints | security-audit, architecture-risk | P1 |
| SEC-009 | Redis fallback for rate limiting | architecture-risk | P1 |
| SEC-010 | Penetration testing | PRODUCTION_CHECKLIST §3 | P2 |
| SEC-011 | Remove unsafe-inline from CSP | PRODUCTION_CHECKLIST §3 | P1 |
| SEC-012 | Remove hardcoded DB password fallback | security-audit, architecture-risk | P0 |
| SEC-013 | No MFA recovery path exists for locked-out users | code-scan | P1 |

### REQ-API: API Requirements (from Docs/api/)

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| API-001 | All endpoints documented in API_REFERENCE.md with 200+ endpoints | api/API_REFERENCE.md | CRITICAL |
| API-002 | Error codes follow ERROR_CODES.md taxonomy | api/ERROR_CODES.md | CRITICAL |
| API-003 | Cursor-based pagination on all list endpoints | api/README.md | CRITICAL |
| API-004 | Idempotency-Key header on all mutating endpoints | api/README.md, patterns/README.md | CRITICAL |
| API-005 | Consistent error shape: { error: { code, message, details, requestId } } | api/README.md | CRITICAL |
| API-006 | URL versioning /api/v1/ on all endpoints | api/README.md | CRITICAL |
| API-007 | TypeBox validation on all request/response schemas | architecture/README.md | CRITICAL |

### REQ-ARCH: Architecture Requirements (from Docs/architecture/)

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| ARCH-001 | All tenant tables have RLS policies | architecture/DATABASE.md, patterns/README.md | CRITICAL |
| ARCH-002 | Outbox pattern for all domain events | patterns/README.md | CRITICAL |
| ARCH-003 | Effective dating for all HR data that changes over time | patterns/README.md | CRITICAL |
| ARCH-004 | State machines for employee lifecycle, leave, cases, workflows, performance | patterns/STATE_MACHINES.md | CRITICAL |
| ARCH-005 | Plugin registration order maintained | architecture/README.md | CRITICAL |
| ARCH-006 | Background workers use Redis Streams | architecture/WORKER_SYSTEM.md | CRITICAL |
| ARCH-007 | Outbox processor polls domain_outbox table | architecture/WORKER_SYSTEM.md | CRITICAL |
| ARCH-008 | @staffora/shared imports used (no local duplication) | CLAUDE.md, architecture/README.md | HIGH |

### REQ-UK: UK Compliance Requirements

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| UK-001 | Right to Work verification (List A/B, online, IDVT) | implementation-plans.md | CRITICAL |
| UK-002 | DSAR handling with 30-day deadline | implementation-plans.md, uk-compliance-audit | CRITICAL |
| UK-003 | Data erasure and anonymisation | uk-compliance-audit | CRITICAL |
| UK-004 | SSP calculation (3 waiting days, 28-week limit, LEL check) | implementation-plans.md | CRITICAL |
| UK-005 | Pension auto-enrolment (eligibility, opt-out, re-enrolment) | implementation-plans.md | CRITICAL |
| UK-006 | SMP/SPP/ShPL calculations (KIT days, qualifying service) | implementation-plans.md | CRITICAL |
| UK-007 | Holiday minimum 28 days with pro-rata for part-time | implementation-plans.md | CRITICAL |
| UK-008 | HMRC RTI/FPS/EPS submission | implementation-plans.md, uk-compliance | HIGH |
| UK-009 | P45 on termination | feature-validation, uk-compliance | HIGH |
| UK-010 | P60 annual generation | feature-validation, uk-compliance | HIGH |
| UK-011 | NMW compliance checking by age band | uk-compliance | HIGH |
| UK-012 | Working Time Regulations (48hr, rest periods, night workers) | implementation-plans.md | HIGH |
| UK-013 | Flexible working request system (ACAS) | uk-compliance | HIGH |
| UK-014 | ACAS-compliant disciplinary procedure | uk-compliance | HIGH |
| UK-015 | Gender pay gap reporting | uk-compliance | HIGH |
| UK-016 | Holiday pay 52-week reference period (Harpur Trust) | implementation-plans.md | HIGH |
| UK-017 | Data breach notification (ICO 72-hour) | uk-compliance | HIGH |
| UK-018 | Contract statements (day-one written statement) | uk-compliance | HIGH |
| UK-019 | Parental bereavement leave (Jack's Law) | uk-compliance | MEDIUM |
| UK-020 | Carer's leave (Carer's Leave Act 2023) | uk-compliance | MEDIUM |
| UK-021 | Reasonable adjustments tracking | uk-compliance | MEDIUM |
| UK-022 | Data retention and automated purging | uk-compliance, GDPR | HIGH |
| UK-023 | GDPR consent management | uk-compliance, GDPR | HIGH |
| UK-024 | Privacy notices management | uk-compliance, GDPR | HIGH |

### REQ-PAYROLL: Compensation & Payroll

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| PAY-001 | Pay period configuration (weekly/fortnightly/monthly) | feature-validation CPY-001 | HIGH |
| PAY-002 | Pay schedule assignment to employees | feature-validation CPY-002 | HIGH |
| PAY-003 | Tax code management (P45, HMRC notification) | feature-validation CPY-016 | HIGH |
| PAY-004 | NI category tracking | feature-validation CPY-017 | HIGH |
| PAY-005 | Student loan plan tracking | feature-validation CPY-018 | MEDIUM |
| PAY-006 | Payslip generation | feature-validation CPY-027 | HIGH |
| PAY-007 | P45 generation on termination | feature-validation CPY-022 | HIGH |
| PAY-008 | P60 annual generation | feature-validation CPY-023 | HIGH |
| PAY-009 | PAYE/RTI FPS submission | feature-validation CPY-028 | HIGH |
| PAY-010 | Holiday pay calculation (52-week reference) | feature-validation CPY-037 | HIGH |
| PAY-011 | Final pay calculation on termination | feature-validation CPY-038 | HIGH |
| PAY-012 | Benefits cessation on termination | feature-validation BEN-017 | MEDIUM |
| PAY-013 | Bradford Factor absence monitoring | feature-validation ALM-011 | MEDIUM |

### REQ-TESTING: Testing Requirements

| ID | Requirement | Source | Priority |
|----|-------------|--------|----------|
| TEST-001 | RLS cross-tenant isolation tests | testing-patterns, guides/GETTING_STARTED | CRITICAL |
| TEST-002 | Idempotency duplicate prevention tests | testing-patterns | CRITICAL |
| TEST-003 | Outbox atomicity tests | testing-patterns | CRITICAL |
| TEST-004 | Effective-date overlap tests | testing-patterns | CRITICAL |
| TEST-005 | State machine transition tests | testing-patterns | CRITICAL |
| TEST-006 | Real HTTP-level route tests (app.handle) | testing-audit | HIGH |
| TEST-007 | Auth flow E2E tests | testing-audit | HIGH |
| TEST-008 | Worker integration tests (Redis Streams E2E) | testing-audit | MEDIUM |
| TEST-009 | RBAC route-level tests | testing-audit | MEDIUM |
| TEST-010 | Admin frontend route tests | testing-audit | HIGH |
| TEST-011 | Manager frontend route tests | testing-audit | MEDIUM |
| TEST-012 | Session lifecycle tests | testing-audit | MEDIUM |
| TEST-013 | Rate limiting integration tests | testing-audit | MEDIUM |
| TEST-014 | Concurrent overlap tests | testing-audit | MEDIUM |
| TEST-015 | File upload/download tests | testing-audit | MEDIUM |

---

## Acceptance Criteria Summary

All requirements are considered met when:
1. Backend: Database migration exists, API endpoint exists, service/repository pattern followed
2. Frontend: Route page exists, React Query hooks implemented, permission guards applied
3. Tests: At minimum integration test for RLS isolation and happy-path behaviour
4. Documentation: API endpoint documented in API_REFERENCE.md
5. Compliance: UK legal requirements validated against statute

---

*Generated from: ENTERPRISE_HR_CAPABILITY_CHECKLIST.md (577 items), FEATURE_VALIDATION_REPORT.md, PRODUCTION_CHECKLIST.md, API_REFERENCE.md, ARCHITECTURE.md, DATABASE.md, patterns/*, audit/*.*

---

## Related Documents

- [Implementation Status](implementation_status.md) — Feature completion against these requirements
- [Tickets](tickets.md) — Development tickets derived from requirements gaps
- [Roadmap](../project-management/roadmap.md) — Product roadmap for requirement delivery
- [Sprint Plan Phase 1](../project-management/sprint-plan-phase1.md) — Critical requirement fixes
- [Sprint Plan Phase 2](../project-management/sprint-plan-phase2.md) — High priority requirement work
- [Sprint Plan Phase 3](../project-management/sprint-plan-phase3.md) — Feature completion sprints
- [UK Compliance Report](../compliance/uk-hr-compliance-report.md) — UK statutory requirements coverage
- [Final System Report](../audit/FINAL_SYSTEM_REPORT.md) — Consolidated audit and feature scores
