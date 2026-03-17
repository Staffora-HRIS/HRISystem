# Staffora HRIS — Master TODO List

**Generated:** 2026-03-15 (Code-Verified Audit)
**Total Open Items:** 155
**Resolved Since Last Audit:** 3 (TODO-006, TODO-012, TODO-047)

---

## ✅ Recently Resolved

| ID | Title | Resolution |
|----|-------|------------|
| TODO-006 | Remove hardcoded DB password fallback | `database.ts` now enforces env var, no fallback |
| TODO-012 | Fix leave_approvals table name mismatch | Codebase consistently uses `leave_request_approvals` |
| TODO-047 | Replace Redis KEYS with SCAN | False positive — matches were `Object.keys()` JS, not Redis KEYS |

---

## 🔴 CRITICAL Priority (Must Fix Before Production)

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-013 | Consolidate dual user tables (Better Auth vs app.users sync) | Architecture | LARGE | PARTIAL |
| TODO-014 | Consolidate database connection pools (3 competing pools) | Infrastructure | MEDIUM | PARTIAL |

---

## 🟠 HIGH Priority — Phase 16 (Immediate Quick Wins)

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-041 | Fix better-auth version mismatch (^1.5.4 API vs ^1.4.10 web) | Dependencies | SMALL | NOT_IMPLEMENTED |
| TODO-042 | Fix vitest/coverage-v8 major version mismatch | Dependencies | SMALL | NOT_IMPLEMENTED |
| TODO-051 | Wire tenant settings page to real backend | Frontend | SMALL | PARTIAL |
| TODO-052 | Wire notification settings to persist | Frontend | SMALL | PARTIAL |
| TODO-053 | Wire time policies page to real backend | Frontend | SMALL | PARTIAL |
| TODO-054 | Wire reports page to real backend (remove MOCK_DATA) | Frontend | MEDIUM | PARTIAL |
| TODO-056 | Enable leave type/policy editing (not just create/delete) | Frontend | MEDIUM | PARTIAL |
| TODO-024 | Add rate limiting integration tests | Testing | SMALL | NOT_IMPLEMENTED |
| TODO-127 | NI category tracking | Payroll | SMALL | NOT_IMPLEMENTED |
| TODO-145 | Benefits cessation on termination | Benefits | SMALL | NOT_IMPLEMENTED |
| TODO-157 | Bulk approval capability | Workflows | SMALL | NOT_IMPLEMENTED |

---

## 🟡 HIGH Priority — Phase 17 (Short-term High Value)

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-039 | @staffora/shared integration (only 5 imports exist) | Architecture | LARGE | PARTIAL |
| TODO-028 | MFA recovery code flow | Security | MEDIUM | NOT_IMPLEMENTED |
| TODO-025 | IP-based rate limiting for unauthenticated endpoints | Security | MEDIUM | NOT_IMPLEMENTED |
| TODO-031 | Fix 14 partial service unit tests | Testing | LARGE | PARTIAL |
| TODO-032 | Convert route tests to real HTTP (app.handle) | Testing | LARGE | PARTIAL |
| TODO-126 | Tax code management (P45, HMRC notification) | Payroll | MEDIUM | NOT_IMPLEMENTED |
| TODO-124 | Pay schedule assignment to employees | Payroll | SMALL | NOT_IMPLEMENTED |
| TODO-134 | Bradford Factor absence monitoring | Absence | MEDIUM | NOT_IMPLEMENTED |
| TODO-065 | HR service.ts decomposition (god class) | Tech Debt | LARGE | NOT_IMPLEMENTED |
| TODO-113 | Holiday pay 52-week reference period (Harpur Trust) | UK Compliance | MEDIUM | NOT_IMPLEMENTED |

---

## 🔵 HIGH Priority — Phase 18 (Payroll & Compliance)

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-128 | Payslip generation | Payroll | LARGE | NOT_IMPLEMENTED |
| TODO-129 | P45 generation on termination | Payroll | MEDIUM | NOT_IMPLEMENTED |
| TODO-130 | P60 annual generation | Payroll | MEDIUM | NOT_IMPLEMENTED |
| TODO-064 | HMRC RTI/FPS/EPS submission | UK Compliance | XL | NOT_IMPLEMENTED |
| TODO-081 | Prometheus + Grafana monitoring deployment | Infrastructure | LARGE | NOT_IMPLEMENTED |
| TODO-082 | Log aggregation (ELK/Loki) | Infrastructure | LARGE | NOT_IMPLEMENTED |
| TODO-140 | SSO integration (SAML/OIDC) | Security | XL | NOT_IMPLEMENTED |

---

## 🟢 MEDIUM Priority — Enterprise Features

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-150 | Employee directory/search (self-service) | Self-Service | MEDIUM | NOT_IMPLEMENTED |
| TODO-156 | Custom report builder | Analytics | XL | NOT_IMPLEMENTED |
| TODO-149 | Diversity analytics dashboard | Analytics | MEDIUM | NOT_IMPLEMENTED |
| TODO-152 | Compensation analytics | Analytics | MEDIUM | NOT_IMPLEMENTED |
| TODO-146 | Case appeal process | Cases | MEDIUM | NOT_IMPLEMENTED |
| TODO-141 | E-signature integration | Documents | LARGE | NOT_IMPLEMENTED |
| TODO-147 | Data import framework (CSV/Excel bulk) | System | LARGE | NOT_IMPLEMENTED |
| TODO-148 | Workflow auto-escalation on SLA breach | Workflows | MEDIUM | NOT_IMPLEMENTED |
| TODO-033 | Admin frontend route tests | Testing | LARGE | NOT_IMPLEMENTED |
| TODO-034 | Worker integration tests | Testing | MEDIUM | NOT_IMPLEMENTED |
| TODO-035 | RBAC route-level tests | Testing | MEDIUM | NOT_IMPLEMENTED |

---

## 🔵 MEDIUM Priority — Infrastructure & Operations

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-083 | Offsite backup storage (S3) | Infrastructure | MEDIUM | NOT_IMPLEMENTED |
| TODO-084 | WAL archiving for PITR | Infrastructure | MEDIUM | NOT_IMPLEMENTED |
| TODO-085 | Kubernetes manifests | Infrastructure | LARGE | NOT_IMPLEMENTED |
| TODO-086 | Helm chart for parameterized deploys | Infrastructure | MEDIUM | NOT_IMPLEMENTED |
| TODO-087 | Terraform/Pulumi IaC | Infrastructure | LARGE | NOT_IMPLEMENTED |
| TODO-088 | PgBouncer connection pooling | Infrastructure | MEDIUM | NOT_IMPLEMENTED |
| TODO-090 | Blue/green deployment strategy | Infrastructure | MEDIUM | NOT_IMPLEMENTED |

---

## ⚪ LOW Priority — Nice to Have

| ID | Title | Area | Effort | Status |
|----|-------|------|--------|--------|
| TODO-160 | Employee title and honorifics | Employee Data | SMALL | NOT_IMPLEMENTED |
| TODO-161 | Pronoun recording | Employee Data | SMALL | NOT_IMPLEMENTED |
| TODO-162 | Work anniversary tracking (automated) | Employee Data | SMALL | PARTIAL |
| TODO-163 | Retirement date projection | Employee Data | SMALL | NOT_IMPLEMENTED |
| TODO-164 | Previous employment history | Employee Data | MEDIUM | NOT_IMPLEMENTED |
| TODO-165 | Employee merge/deduplication | Employee Data | LARGE | NOT_IMPLEMENTED |
| TODO-166 | Custom employee fields | Employee Data | LARGE | NOT_IMPLEMENTED |
| TODO-167 | Employee notes and annotations | Employee Data | SMALL | NOT_IMPLEMENTED |

---

## Summary by Area

| Area | Open Items | Critical | High | Medium | Low |
|------|-----------|----------|------|--------|-----|
| Payroll & Compensation | 17 | 0 | 11 | 4 | 2 |
| Testing | 12 | 0 | 4 | 6 | 2 |
| Infrastructure | 10 | 1 | 2 | 5 | 2 |
| Frontend (wiring) | 8 | 0 | 5 | 2 | 1 |
| Security | 6 | 0 | 3 | 2 | 1 |
| UK Compliance | 5 | 0 | 3 | 1 | 1 |
| Architecture | 4 | 1 | 1 | 1 | 1 |
| Employee Lifecycle | 18 | 0 | 5 | 7 | 6 |
| Enterprise Features | 12 | 0 | 2 | 7 | 3 |
| Other modules | ~63 | 0 | ~10 | ~35 | ~18 |

---

*Generated from code-verified audit 2026-03-15. Sources: 20 docs, 72 API modules, 224 migrations, 149 frontend routes.*
