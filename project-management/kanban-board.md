# Staffora HRIS -- Kanban Board

**Last Updated:** 2026-03-13
**Board View:** All identified work items from audit reports

---

## CRITICAL -- Blocking Production

> Items that must be resolved before any production deployment.

| ID | Title | Source | Effort | Sprint |
|----|-------|--------|--------|--------|
| CRIT-01 | CSRF token validation (server generates, validates; frontend sends) | Security HIGH-01, Arch R1 | 2d | S1 |
| CRIT-02 | Create `hris_app` role in production (RLS bypassed without it) | Infra #2, Arch R3 | 2d | S2 |
| CRIT-03 | Add graceful shutdown to API server (SIGTERM/SIGINT) | Arch R2 | 1d | S2 |
| CRIT-04 | Account lockout after failed login attempts | Security HIGH-03 | 2d | S1 |
| CRIT-05 | Enable email verification in production | Security HIGH-02 | 0.5d | S1 |
| CRIT-06 | Create deployment pipeline (build/push Docker images, staging deploy) | Infra #1 | 3d | S3 |
| CRIT-07 | Implement offsite backup storage (S3) | Infra P0 #3 | 1d | S3 |

---

## BACKLOG -- Categorised by Domain

### Security & Authentication

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| SEC-01 | Add request body size limit (10MB default) | Security MEDIUM-01 | P1 | 0.5d |
| SEC-02 | Remove hardcoded dev database password fallback in production | Security MEDIUM-02 | P1 | 0.5d |
| SEC-03 | Increase minimum password length to 12+ chars | Security MEDIUM-06 | P2 | 0.5d |
| SEC-04 | Wire `isStrongPassword()` into BetterAuth password flow | Security MEDIUM-06 | P2 | 0.5d |
| SEC-05 | Add rate limiting integration tests (enable in test mode) | Security MEDIUM-05 | P2 | 1d |
| SEC-06 | Replace `unsafe()` in DB plugin with parameterized alternatives | Security LOW-01 | P3 | 0.5d |
| SEC-07 | Add automatic read audit logging for sensitive entities | Security LOW-02 | P2 | 1d |
| SEC-08 | Implement IP-based rate limiting for unauthenticated endpoints | Arch R5 | P1 | 1d |
| SEC-09 | Create shared `getClientIp()` utility (audit + rate limit) | Arch R27 | P3 | 0.5d |
| SEC-10 | Make debug query logging opt-in (DB_DEBUG env var) | Arch R18 | P2 | 0.5d |

### Architecture & Code Quality

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| ARCH-01 | Consolidate database connection pools (3 pools -> 1) | Arch R4 | P1 | 2d |
| ARCH-02 | Reduce tenant cache TTL to 60s, add invalidation on suspension | Arch R9 | P1 | 0.5d |
| ARCH-03 | Replace Redis KEYS with SCAN in cache invalidation | Arch R17 | P1 | 0.5d |
| ARCH-04 | Fix audit logging transaction atomicity | Arch R8 | P2 | 1d |
| ARCH-05 | Replace all SELECT * with explicit column lists (28 instances) | Arch R6 | P1 | 2d |
| ARCH-06 | Batch loop-based INSERT operations (N+1 queries) | Arch R7 | P2 | 1d |
| ARCH-07 | Refactor dashboard to service/repository pattern | Arch R10, Debt #3.1 | P1 | 1d |
| ARCH-08 | Audit all `withSystemContext` calls for necessity | Arch R11 | P2 | 0.5d |
| ARCH-09 | Plan user table consolidation (dual BetterAuth + app.users) | Arch R12 | P2 | 3d |
| ARCH-10 | Standardise outbox pattern across all modules | Arch R14 | P2 | 2d |
| ARCH-11 | Add migration validation test (numbering, gaps, duplicates) | Arch R15 | P2 | 0.5d |
| ARCH-12 | Make idempotency lock timeout configurable per-route | Arch R23 | P3 | 0.5d |
| ARCH-13 | Add frontend retry logic with exponential backoff | Arch R22 | P2 | 1d |
| ARCH-14 | Add session caching to reduce per-request auth overhead | Arch R20 | P2 | 1d |
| ARCH-15 | Implement explicit scrypt verification in password handler | Arch R21 | P3 | 0.5d |

### Technical Debt

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| DEBT-01 | Fix dependency version mismatches (TypeBox, better-auth, vitest) | Debt #4 | P0 | 1d |
| DEBT-02 | Integrate @staffora/shared error codes into API modules | Debt #2.1 | P1 | 2d |
| DEBT-03 | Integrate @staffora/shared state machines into API services | Debt #2.1 | P1 | 1d |
| DEBT-04 | Integrate @staffora/shared types (TenantContext, ServiceResult) | Debt #2.1 | P1 | 1d |
| DEBT-05 | Add error handling to 11 services without try/catch | Debt #1.4 | P1 | 3d |
| DEBT-06 | Split HR service.ts (2,159 lines) into sub-services | Debt #1.2 | P2 | 3d |
| DEBT-07 | Split HR repository.ts (1,766 lines) into sub-repositories | Debt #1.2 | P2 | 2d |
| DEBT-08 | Create shared pagination helper | Debt #3.3 | P2 | 1d |
| DEBT-09 | Add route-level error boundaries to frontend | Debt #3.5 | P2 | 1d |
| DEBT-10 | Remove dead code (legacy App.tsx, fix migration script) | Debt #2.4 | P3 | 0.5d |
| DEBT-11 | Remove unused dependencies (@better-auth/infra, pg) | Debt #2.2 | P2 | 0.5d |
| DEBT-12 | Split benefits/routes.ts (1,641 lines) | Debt #1.2 | P3 | 2d |
| DEBT-13 | Consolidate config imports (db.ts vs database.ts) | Arch R29 | P3 | 0.5d |
| DEBT-14 | Split security module (6+ sub-files, too many concerns) | Debt #3.4 | P3 | 2d |

### Infrastructure & DevOps

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| INFRA-01 | Add structured logging (Pino, JSON format) | Infra P1 #5 | P1 | 2d |
| INFRA-02 | Add error tracking (Sentry) | Infra P1 #6 | P1 | 0.5d |
| INFRA-03 | Add security scanning to CI (CodeQL, Trivy, audit) | Infra P1 #7 | P1 | 0.5d |
| INFRA-04 | Add API metrics endpoint (/metrics, Prometheus format) | Infra P1 #9 | P2 | 1d |
| INFRA-05 | Pin Bun version in CI | Infra P2 #10 | P2 | 0.25d |
| INFRA-06 | Fix Redis health check to include auth | Infra P1 #8 | P2 | 0.25d |
| INFRA-07 | Add migration locking (advisory locks) | Infra P2 #11 | P2 | 0.5d |
| INFRA-08 | Fix web container dependency (condition: service_healthy) | Infra P2 #13 | P3 | 0.25d |
| INFRA-09 | Add WAL archiving for point-in-time recovery | Infra P2 #14 | P1 | 2d |
| INFRA-10 | Deploy Prometheus + Grafana monitoring stack | Infra P3 #18 | P2 | 3d |
| INFRA-11 | Document disaster recovery plan (RTO/RPO targets) | Infra P3 #22 | P1 | 2d |
| INFRA-12 | Add database connection pooler (PgBouncer) | Infra P3 #21 | P3 | 1d |
| INFRA-13 | Add log aggregation (Grafana Loki or ELK) | Infra P3 #23 | P3 | 2d |
| INFRA-14 | Implement secret rotation tooling | Infra P3 #19 | P3 | 1d |
| INFRA-15 | Add backup verification (automated restore test) | Infra P2 | P2 | 1d |
| INFRA-16 | Create nginx SSL directory with cert provisioning docs | Infra P2 #16 | P3 | 0.25d |

### Testing

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| TEST-01 | Rewrite hollow employee-lifecycle E2E test | Testing #3.1 | P0 | 2d |
| TEST-02 | Create TestApiClient utility for HTTP-level testing | Testing #3.3 | P0 | 2d |
| TEST-03 | Convert absence route tests to real HTTP | Testing Rec #3 | P1 | 1d |
| TEST-04 | Convert cases route tests to real HTTP | Testing Rec #3 | P1 | 1d |
| TEST-05 | Convert time route tests to real HTTP | Testing Rec #3 | P1 | 1d |
| TEST-06 | Add auth flow E2E test (register -> login -> session -> request) | Testing #3.4 | P1 | 2d |
| TEST-07 | Fix partial service unit tests (top 5: HR, Cases, Absence) | Testing #3.2 | P2 | 3d |
| TEST-08 | Add RBAC route-level tests | Testing #3.4 | P2 | 1d |
| TEST-09 | Add worker integration tests (Redis Streams E2E) | Testing #3.4 | P2 | 2d |
| TEST-10 | Add frontend admin route tests (top 5 routes) | Testing #5.5 | P2 | 3d |
| TEST-11 | Add test coverage thresholds to CI | Testing Rec #5 | P2 | 0.5d |
| TEST-12 | Create test data factories for domain objects | Testing #4.2 | P2 | 1d |
| TEST-13 | Add E2E CI job (start API, run HTTP tests) | Testing Rec #5 | P2 | 1d |

### UK Compliance

| ID | Title | Source | Priority | Effort |
|----|-------|--------|----------|--------|
| UK-01 | Right to Work verification workflow | UK Audit #1 | P0 | 3d |
| UK-02 | Right to Work expiry alerting (90/60/30 day warnings) | UK Audit #1.2 | P0 | 2d |
| UK-03 | Holiday entitlement statutory minimum enforcement (28 days) | UK Audit #2.1 | P0 | 2d |
| UK-04 | Holiday pro-rata calculation linked to FTE | UK Audit #2.2 | P0 | 0.5d |
| UK-05 | Bank holiday treatment configuration | UK Audit #2.3 | P1 | 1d |
| UK-06 | Holiday carryover rules (EU 4-week vs additional 1.6-week) | UK Audit #2.4 | P2 | 2d |
| UK-07 | Holiday pay 52-week reference period calculation | UK Audit #2.5 | P1 | 2d |
| UK-08 | SSP calculation engine (waiting days, PIW, LEL, 28-week max) | UK Audit #3 | P0 | 3d |
| UK-09 | Fit note / medical certificate tracking | UK Audit #3 | P1 | 1d |
| UK-10 | Maternity leave & SMP calculation | UK Audit #4.1 | P0 | 5d |
| UK-11 | Paternity leave & SPP calculation | UK Audit #4.2 | P0 | 2d |
| UK-12 | Shared Parental Leave & ShPP | UK Audit #4.3 | P1 | 5d |
| UK-13 | Adoption leave & SAP | UK Audit #4.4 | P1 | 2d |
| UK-14 | Parental bereavement leave & SPBP | UK Audit #4.5 | P1 | 1d |
| UK-15 | Unpaid parental leave per-child tracking | UK Audit #4.6 | P2 | 1d |
| UK-16 | Flexible working request system | UK Audit #5 | P1 | 2d |
| UK-17 | ACAS-compliant disciplinary/grievance workflow | UK Audit #6 | P1 | 3d |
| UK-18 | DSAR handling workflow | UK Audit #7.3, Security MEDIUM-03 | P1 | 3d |
| UK-19 | Data retention and anonymisation engine | UK Audit #7.4, Security MEDIUM-04 | P1 | 3d |
| UK-20 | Data breach notification workflow (72h ICO deadline) | UK Audit #7.5 | P1 | 2d |
| UK-21 | Privacy notice management | UK Audit #7.2 | P2 | 1d |
| UK-22 | Gender pay gap reporting | UK Audit #8.2 | P1 | 2d |
| UK-23 | Diversity monitoring (voluntary, aggregated) | UK Audit #8.1 | P2 | 2d |
| UK-24 | Reasonable adjustments tracking | UK Audit #8.3 | P2 | 1d |
| UK-25 | Employment contract statement generation (day-one) | UK Audit #9.1 | P1 | 2d |
| UK-26 | Statutory notice period validation | UK Audit #9.3 | P2 | 0.5d |
| UK-27 | Pension auto-enrolment (eligibility, enrolment, opt-out) | UK Audit #10 | P0 | 6d |
| UK-28 | Pension re-enrolment (3-yearly) and TPR compliance | UK Audit #10 | P1 | 2d |
| UK-29 | Payroll data export interface | UK Audit #11 | P0 | 3d |
| UK-30 | Tax code storage and management | UK Audit #11 | P1 | 1d |
| UK-31 | P45/P60/P11D document storage | UK Audit #11.2 | P2 | 1d |
| UK-32 | Health & Safety module (risk assessments, RIDDOR) | UK Audit #12 | P3 | 4w |
| UK-33 | DSE self-assessment questionnaire | UK Audit #12.3 | P3 | 1d |

---

## TODO -- Next Up

> Items scheduled for the next sprint (Sprint 1).

| ID | Title | Sprint | Effort |
|----|-------|--------|--------|
| CRIT-01 | CSRF token validation | S1 | 2d |
| CRIT-04 | Account lockout mechanism | S1 | 2d |
| CRIT-05 | Enable email verification | S1 | 0.5d |
| SEC-01 | Request body size limit | S1 | 0.5d |
| SEC-02 | Remove hardcoded dev password fallback | S1 | 0.5d |
| SEC-03 | Increase minimum password length | S1 | 0.5d |

---

## IN PROGRESS

> Currently being worked on.

| ID | Title | Assignee | Started | Notes |
|----|-------|----------|---------|-------|
| -- | -- | -- | -- | Nothing in progress yet |

---

## TESTING

> Completed work awaiting verification.

| ID | Title | Assignee | Notes |
|----|-------|----------|-------|
| -- | -- | -- | Nothing in testing yet |

---

## DONE -- Already Completed

> Items from the audit that the codebase already handles well.

| ID | Title | Source | Notes |
|----|-------|--------|-------|
| DONE-01 | Row-Level Security on all tenant tables (40+ tables) | Security Audit | Comprehensive, tested, `hris_app` used in tests |
| DONE-02 | SQL injection prevention (parameterized queries everywhere) | Security Audit | Zero string interpolation in SQL |
| DONE-03 | RBAC with field-level permissions | Security Audit | 28+ permission checks in HR module alone |
| DONE-04 | Idempotency enforcement on all mutations | Security Audit | Scoped by tenant+user+route, 48h TTL |
| DONE-05 | Security headers (CSP, HSTS, CORP, COOP, X-Frame-Options) | Security Audit | Complete set, Swagger disabled in production |
| DONE-06 | Transactional outbox pattern for domain events | Architecture | Atomic with business writes |
| DONE-07 | Effective dating for HR data | Architecture | Overlap validation, history tracking |
| DONE-08 | State machines for employee, case, leave, workflow, performance | Architecture | DB trigger enforcement, immutable history |
| DONE-09 | Secret validation at startup (crash in production) | Security Audit | 32+ char, known-default detection |
| DONE-10 | Rate limiting with auth-specific thresholds | Security Audit | 5 login/min, 3 signup/min |
| DONE-11 | Audit logging with data sanitization | Security Audit | Before/after values, sensitive field redaction |
| DONE-12 | Better Auth MFA support (TOTP) | Security Audit | Two-factor authentication available |
| DONE-13 | Cookie security (HttpOnly, Secure, SameSite) | Security Audit | Proper cookie attributes |
| DONE-14 | Docker health checks on all services | Infra Audit | interval, timeout, retries, start_period |
| DONE-15 | Resource limits on all containers | Infra Audit | CPU and memory limits configured |
| DONE-16 | Automated daily database backups | Infra Audit | 2 AM UTC, 7-day retention |
| DONE-17 | Manual backup/restore scripts | Infra Audit | With safety confirmation |
| DONE-18 | CI pipeline (typecheck, lint, build, test) | Infra Audit | GitHub Actions, Postgres + Redis services |
| DONE-19 | 122 sequential database migrations with RLS | DB Audit | Well-structured, numbered |
| DONE-20 | 586 database indexes | DB Audit | Comprehensive coverage |
| DONE-21 | Shared package with state machines, error codes, utils | Code Audit | Comprehensive but unused in production (see DEBT-02/03/04) |
| DONE-22 | Test infrastructure (real DB, RLS enforcement in tests) | Testing Audit | hris_app role, tenant context helpers |
| DONE-23 | 98 genuine test files (out of 113 total) | Testing Audit | Significant improvement from Wave 1 |
| DONE-24 | Frontend UI component test coverage (13 components) | Testing Audit | @testing-library/react, interactions tested |
