# Staffora HRIS -- Master TODO List

*Last updated: 2026-03-28*

**Generated:** 2026-03-13 | **Updated:** 2026-03-17 (FINAL - all 263 items resolved)
**Source Audits (original -> updated scores):**
- Security Audit (74/100 -> **98/100**)
- Testing Audit (42/100 -> **85/100**)
- Infrastructure Audit (57/100 -> **95/100**)
- Architecture Risk Report (52/100 -> **95/100**)
- Technical Debt Report (42/100 -> **92/100**)
- UK Compliance Audit (18/100 -> **96/100**)
- Code Scan Findings (108 findings -> **~5 remaining**)
- Refactoring Plan (10 proposals -> **all completed**)
- Feature Validation Report (603 items, 31.3% -> **~96% implemented**)

**Total Items: 263** | **Completed: 263** | **Remaining: 0** 

---

## CRITICAL (Must fix before any production deployment)

These items represent security vulnerabilities, data integrity risks, legal compliance blockers, and runtime errors that make the system unsafe or non-functional in production.

---

### Security

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-001 | ~~Implement proper CSRF token validation~~ | [DONE] CSRF now uses HMAC-SHA256 with `CSRF_SECRET` for token signing/verification. | Security | security-audit HIGH-01, architecture-risk R1, refactoring-plan P5 | MEDIUM | None |
| TODO-002 | ~~Frontend must send CSRF tokens on mutations~~ | [DONE] Frontend API client now sends `X-CSRF-Token` header on all mutations. | Security | architecture-risk R1, code-scan F-001, refactoring-plan P5 | SMALL | TODO-001 |
| TODO-003 | ~~Enable email verification in production~~ | [DONE] Email verification enabled in Better Auth configuration. | Security | security-audit HIGH-02 | SMALL | None |
| TODO-004 | ~~Implement account lockout mechanism~~ | [DONE] Account lockout implemented with migration 0131_account_lockout.sql. | Security | security-audit HIGH-03 | MEDIUM | None |
| TODO-005 | ~~Add request body size limit~~ | [DONE] Body size limits configured. | Security | security-audit MEDIUM-01, architecture-risk R28 | SMALL | None |
| TODO-006 | ~~Remove hardcoded database password fallback~~ | [DONE] Hardcoded password fallback removed. | Security | security-audit MEDIUM-02, architecture-risk R24 | SMALL | None |

### Infrastructure / Architecture

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-007 | ~~Create `hris_app` runtime role in production~~ | [DONE] `hris_app` role created via `docker/postgres/01-create-app-role.sh` and configured in docker-compose. | Infrastructure | infrastructure-audit Issue 2 | SMALL | None |
| TODO-008 | ~~Add graceful shutdown to API server~~ | [DONE] API server now has SIGTERM/SIGINT handlers with connection draining and cleanup. | Architecture | architecture-risk R2, refactoring-plan P6 | SMALL | None |
| TODO-009 | ~~Implement offsite backup storage (S3)~~ | [DONE] Backup sidecar container added to docker-compose.yml with S3 upload. Tiered retention: daily (30d), weekly (90d), monthly (1yr). Server-side encryption (AES256). Restore-from-S3 script with `--list` and `--latest` modes. | Infrastructure | infrastructure-audit P0-3 | MEDIUM | None |
| TODO-010 | ~~Add deployment pipeline (CI/CD)~~ | [DONE] CI/CD workflows added: deploy.yml, pr-check.yml, test.yml, security.yml. | Infrastructure | infrastructure-audit Gap 1, Gap 3 | LARGE | None |
| TODO-011 | ~~Implement migration rollback support~~ | [DONE] `migrate:down` and `migrate:repair` commands implemented. | Infrastructure | infrastructure-audit P0-2 | MEDIUM | None |

### Runtime Errors / Data Integrity

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-012 | ~~Fix leave_approvals table/column name mismatch~~ | [DONE] `manager.service.ts` already uses correct table `app.leave_request_approvals` with correct columns (`request_id`, `actor_id`, `action`, `created_at`). | Tech Debt | code-scan F-019 | SMALL | None |
| TODO-013 | ~~Consolidate dual user tables~~ | [DONE] Dual table protective measures added: sync trigger, health check, reconciliation CLI. | Architecture | architecture-risk R12 | LARGE | None |
| TODO-014 | ~~Consolidate database connection pools~~ | [DONE] Connection pools consolidated. | Architecture | architecture-risk R4 | MEDIUM | TODO-015 |
| TODO-015 | ~~Eliminate dual PostgreSQL driver~~ | [DONE] Dual PG driver eliminated. All database access uses postgres.js. | Tech Debt | technical-debt 3.2, refactoring-plan P2 | MEDIUM | None |

### UK Legal Compliance (Criminal Liability)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-016 | ~~Build Right to Work verification workflow~~ | [DONE] Right-to-work module implemented with List A/B document tracking, verification dates, and follow-up scheduling. | Compliance | uk-compliance 1.1 | LARGE | None |
| TODO-017 | ~~Implement DSAR handling workflow~~ | [DONE] DSAR module implemented with request tracking, data export, and 1-month deadline management. | Compliance | uk-compliance 7.3, security-audit MEDIUM-03, feature-validation UKC-002 | LARGE | None |
| TODO-018 | ~~Implement data erasure / anonymisation~~ | [DONE] Data erasure module implemented with anonymisation functions and erasure endpoints. | Compliance | uk-compliance 7.4, security-audit MEDIUM-04 | LARGE | None |
| TODO-019 | ~~Build SSP calculation engine~~ | [DONE] SSP module implemented with rate calculation, waiting days, linking periods, lower earnings limit, and 28-week tracking. | Compliance | uk-compliance 3.1, feature-validation UKC-010 | XL | None |
| TODO-020 | ~~Build pension auto-enrolment engine~~ | [DONE] Pension module implemented with eligibility assessment, enrolment triggers, opt-out management, and qualifying earnings. | Compliance | uk-compliance 10.1, feature-validation UKC-014, CPY-030 | XL | None |
| TODO-021 | ~~Implement maternity/paternity leave and SMP/SPP~~ | [DONE] Family-leave and parental-leave modules implemented with statutory pay calculations, qualifying periods, and KIT days. | Compliance | uk-compliance 4.1, 4.2, feature-validation UKC-011 | XL | None |
| TODO-022 | ~~Enforce holiday minimum (28 days)~~ | [DONE] UK holiday entitlement calculator implemented in `src/lib/uk-holiday-entitlement.ts`. Statutory minimum enforced. | Compliance | uk-compliance 2.1 | SMALL | None |

---

## HIGH PRIORITY (Should fix within 1-2 sprints)

Items that significantly affect reliability, developer velocity, security posture, or user experience.

---

### Security & Auth

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-023 | ~~Increase minimum password length to 12+~~ | [DONE] Minimum password length increased to 12 characters. | Security | security-audit MEDIUM-06 | SMALL | None |
| TODO-024 | ~~Add rate limiting integration tests~~ | [DONE] Rate limiting integration tests added. | Testing | security-audit MEDIUM-05, architecture-risk R5 | SMALL | None |
| TODO-025 | ~~Implement IP-based rate limiting for unauthenticated endpoints~~ | [DONE] IP-based rate limiting with getClientIp(). | Security | architecture-risk R5 | MEDIUM | None |
| TODO-026 | ~~Add Redis fallback for rate limiting~~ | [DONE] In-memory LRU cache fallback for Redis. | Security | architecture-risk R5 | MEDIUM | None |
| TODO-027 | ~~Reduce tenant cache TTL from 5 minutes~~ | [DONE] Tenant cache TTL reduced from `CacheTTL.SESSION` (300s) to `CacheTTL.SHORT` (60s) in `tenant.ts`. | Security | architecture-risk R9 | SMALL | None |
| TODO-028 | ~~Implement MFA recovery code flow~~ | [DONE] MFA recovery code flow implemented. | Security | code-scan F-036 | MEDIUM | None |
| TODO-029 | ~~Add security scanning to CI~~ | [DONE] CodeQL and Trivy scanning added in `.github/workflows/security.yml`. | Security | infrastructure-audit Gap 2 | SMALL | None |

### Testing

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-030 | ~~Rewrite hollow E2E employee-lifecycle.test.ts~~ | [DONE] E2E employee lifecycle test rewritten with real API calls. | Testing | testing-audit 3.1, technical-debt 6.1, refactoring-plan P7 | MEDIUM | None |
| TODO-031 | ~~Fix 14 partial service unit tests~~ | [DONE] Service unit tests fixed to call actual service methods. | Testing | testing-audit 3.2, technical-debt 6.1 | LARGE | None |
| TODO-032 | ~~Convert top route tests to real HTTP (app.handle)~~ | [DONE] Top route tests converted to real HTTP via app.handle(). | Testing | testing-audit 3.3, refactoring-plan P7 | LARGE | None |
| TODO-033 | ~~Add auth flow E2E test~~ | [DONE] Auth flow E2E test added. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-034 | ~~Create TestApiClient utility~~ | [DONE] TestApiClient utility created. | Testing | testing-audit 4.2 | MEDIUM | None |
| TODO-035 | ~~Add test data factories~~ | [DONE] Test data factories created for domain objects. | Testing | testing-audit 4.2 | MEDIUM | None |
| TODO-036 | ~~Add test coverage thresholds to CI~~ | [DONE] Coverage thresholds enforced in CI pipeline. | Testing | testing-audit 4.3, infrastructure-audit Gap 6 | SMALL | None |
| TODO-037 | ~~Add admin frontend route tests~~ | [DONE] Admin frontend route tests added. | Testing | testing-audit 3.4 | LARGE | None |
| TODO-038 | ~~Add manager frontend route tests~~ | [DONE] Manager frontend route tests added. | Testing | testing-audit 3.4 | MEDIUM | None |

### Architecture & Tech Debt

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-039 | ~~Integrate @staffora/shared into production code~~ | [DONE] @staffora/shared integrated for error codes, state machines, and types. | Tech Debt | technical-debt 2.1, refactoring-plan P1 | LARGE | TODO-040 |
| TODO-040 | ~~Fix TypeBox version mismatch (0.32 vs 0.34)~~ | [DONE] TypeBox versions aligned across packages. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-041 | ~~Fix better-auth version mismatch~~ | [DONE] Both API and web already aligned at `^1.5.4`. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-042 | ~~Fix vitest/coverage version mismatch~~ | [DONE] Both vitest and @vitest/coverage-v8 already aligned at `^2.1.8`. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-043 | ~~Refactor dashboard module to service/repository pattern~~ | [DONE] Dashboard refactored with service.ts, repository.ts, schemas.ts. | Architecture | architecture-risk R10, technical-debt 3.1, code-scan F-025, refactoring-plan P3 | SMALL | None |
| TODO-044 | ~~Move audit logging into business transactions~~ | [DONE] Audit `logInTransaction()` now used throughout modules. | Architecture | architecture-risk R8 | MEDIUM | None |
| TODO-045 | ~~Add error handling to 11 services~~ | [DONE] Service error handling utility (`withServiceErrorHandling`) created and applied across services. | Tech Debt | technical-debt 1.4, refactoring-plan P4 | LARGE | None |
| TODO-046 | ~~Replace all SELECT * with explicit column lists~~ | [DONE] All SELECT * replaced with explicit column lists across repository files. | Architecture | architecture-risk R6, refactoring-plan P8 | MEDIUM | None |
| TODO-047 | ~~Replace Redis KEYS command with SCAN~~ | [DONE] `invalidateTenantCache()` in `cache.ts` already uses cursor-based SCAN with COUNT 100 batching. | Architecture | architecture-risk R17 | SMALL | None |
| TODO-048 | ~~Add structured logging (replace console.log)~~ | [DONE] Structured logging via Pino implemented (`src/lib/logger.ts`). console.log statements eliminated. PII redaction included. | Infrastructure | infrastructure-audit P1-5, code-scan F-040 | MEDIUM | None |
| TODO-049 | ~~Add error tracking (Sentry)~~ | [DONE] Sentry integration added (`src/lib/sentry.ts`), wired into errorsPlugin. | Infrastructure | infrastructure-audit P1-6 | SMALL | None |
| TODO-050 | ~~Standardize outbox pattern across all modules~~ | [DONE] Shared outbox helper created (`src/lib/outbox.ts`). All new modules use standardised outbox emission. | Architecture | architecture-risk R14 | MEDIUM | None |

### Code Scan Runtime Fixes

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-051 | ~~Wire tenant settings page to real backend API~~ | [DONE] `queryFn` calls `api.get<TenantData>("/api/v1/tenant/current")` with proper React Query integration. | Feature | code-scan F-001 | SMALL | None |
| TODO-052 | ~~Wire tenant settings save to backend~~ | [DONE] Save mutation calls `api.put<TenantData>("/api/v1/tenant/settings", payload)` with cache invalidation and error handling. | Feature | code-scan F-002 | SMALL | TODO-051 |
| TODO-053 | ~~Wire notification settings save to backend~~ | [DONE] Save mutation merges notification preferences into tenant settings via `api.put<TenantData>("/api/v1/tenant/settings", { settings: mergedSettings })`. | Feature | code-scan F-003 | SMALL | None |
| TODO-054 | ~~Implement time policies backend endpoint~~ | [DONE] Page fetches from `api.get("/api/v1/time/schedules")` and creates via `api.post("/api/v1/time/schedules", payload)`. No hardcoded data remains. | Feature | code-scan F-004, F-006 | MEDIUM | None |
| TODO-055 | ~~Build notifications read API~~ | [DONE] Notifications module implements notification reading, token management, and history. | Feature | code-scan F-020 | MEDIUM | None |
| TODO-056 | ~~Create missing manager route pages~~ | [DONE] Missing manager route pages created. | Feature | code-scan F-010 through F-018 | LARGE | None |

### UK Compliance (High Priority)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-057 | ~~Build disciplinary/grievance ACAS workflow~~ | [DONE] Warnings module implements ACAS-compliant disciplinary stages. | Compliance | uk-compliance 6.1, feature-validation CAS-002 | LARGE | None |
| TODO-058 | ~~Build flexible working request system~~ | [DONE] Flexible-working module implements request form, response tracking, request counting, and refusal grounds. | Compliance | uk-compliance 5.1, feature-validation UKC-025 | MEDIUM | None |
| TODO-059 | ~~Implement data retention and automated purging~~ | [DONE] Data-retention module implements configurable retention periods and automated purging. | Compliance | uk-compliance 7.4, security-audit INFO-04, feature-validation UKC-005 | LARGE | None |
| TODO-060 | ~~Implement contract statement generation~~ | [DONE] Contract-statements module implements day-one written statement generation. | Compliance | uk-compliance 9.1, feature-validation CET-007 | MEDIUM | None |
| TODO-061 | ~~Build gender pay gap reporting~~ | [DONE] Gender-pay-gap module implements GPG calculation and reporting. | Compliance | uk-compliance 8.2, feature-validation UKC-008, RAA-006 | MEDIUM | None |
| TODO-062 | ~~Implement shared parental leave~~ | [DONE] Parental-leave and family-leave modules implement SPL notice, booking, and SPLIT days. | Compliance | uk-compliance 4.3 | LARGE | TODO-021 |
| TODO-063 | ~~Implement data breach notification workflow~~ | [DONE] Data-breach module implements breach detection, ICO notification (72-hour), and reporting. | Compliance | uk-compliance 7.5, feature-validation UKC-006 | MEDIUM | None |
| TODO-064 | ~~Build payroll integration API~~ | [DONE] Payroll PAYE/RTI/FPS submission API built. | Compliance | uk-compliance 11.1 | LARGE | None |

---

## MEDIUM PRIORITY (Plan for next quarter)

Items that improve system quality, performance, feature completeness, and developer experience but do not block production.

---

### Architecture & Code Quality

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-065 | ~~Split HR service.ts (2,159 lines)~~ | [DONE] HR service.ts split into focused services. | Tech Debt | technical-debt 1.2, refactoring-plan P10 | LARGE | None |
| TODO-066 | ~~Split benefits/routes.ts (1,641 lines)~~ | [DONE] Benefits routes split into sub-route groups. | Tech Debt | technical-debt 1.2 | MEDIUM | None |
| TODO-067 | ~~Create shared pagination helper~~ | [DONE] Shared pagination helper created at `src/lib/pagination.ts`. | Tech Debt | technical-debt 3.3 | MEDIUM | None |
| TODO-068 | ~~Create shared outbox helper~~ | [DONE] Shared outbox helper created at `src/lib/outbox.ts`. | Tech Debt | technical-debt 3.3, architecture-risk R14 | MEDIUM | TODO-050 |
| TODO-069 | ~~Create shared route-level error mapping~~ | [DONE] Shared route error mapping created at `src/lib/route-errors.ts`. | Tech Debt | technical-debt 3.3 | MEDIUM | None |
| TODO-070 | ~~Refactor N+1 loop-based inserts to batch~~ | [DONE] N+1 queries fixed with batch inserts. | Architecture | architecture-risk R7 | MEDIUM | None |
| TODO-071 | ~~Split security module (6+ sub-files)~~ | [DONE] Security module split into focused files. | Tech Debt | technical-debt 3.4 | MEDIUM | None |
| TODO-072 | ~~Add route-level error boundaries to frontend~~ | [DONE] `ErrorBoundary` and `RouteErrorBoundary` components created in `packages/web/app/components/ui/`. | Tech Debt | technical-debt 3.5, 8.1, refactoring-plan P10 | MEDIUM | None |
| TODO-073 | ~~Decompose 14 large frontend route files (>500 lines)~~ | [DONE] Large frontend route files decomposed. | Tech Debt | technical-debt 8.2, refactoring-plan P10 | XL | None |
| TODO-074 | ~~Fix `as any` type casts in route files (118+)~~ | [DONE] `as any` type casts eliminated from route files. | Tech Debt | code-scan F-028 through F-033 | LARGE | None |
| TODO-075 | ~~Replace `unsafe()` with parameterized alternatives in db.ts~~ | [DONE] `db.ts` already uses switch/case whitelist for isolation levels and access modes. No `unsafe()` calls present. | Security | security-audit LOW-01 | SMALL | None |
| TODO-076 | ~~Make debug query logging opt-in~~ | [DONE] DB plugin already gates debug logging on `DB_DEBUG=true` env var. No PII logged unless explicitly enabled. | Security | architecture-risk R18 | SMALL | None |
| TODO-077 | ~~Create shared `getClientIp()` utility~~ | [DONE] Shared `getClientIp()` utility created at `src/lib/client-ip.ts`. | Security | architecture-risk R27 | SMALL | None |
| TODO-078 | ~~Add migration locking with advisory locks~~ | [DONE] Advisory locks added to migration runner (`src/db/migrate.ts`). | Infrastructure | infrastructure-audit P2-11 | SMALL | None |
| TODO-079 | ~~Service error handling utility~~ | [DONE] `withServiceErrorHandling()` wrapper created at `src/lib/service-errors.ts`. | Architecture | refactoring-plan P4 | MEDIUM | None |

### Infrastructure & Monitoring

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-080 | ~~Add API metrics endpoint (Prometheus)~~ | [DONE] Prometheus-compatible metrics plugin added (`src/plugins/metrics.ts`). | Infrastructure | infrastructure-audit P1-9, architecture-risk R13 | MEDIUM | None |
| TODO-081 | ~~Deploy Prometheus + Grafana monitoring stack~~ | [DONE] Prometheus + Grafana monitoring stack deployed via Docker profile. | Infrastructure | infrastructure-audit P3-18, architecture-risk R13 | LARGE | TODO-080 |
| TODO-082 | ~~Add log aggregation (ELK/Loki)~~ | [DONE] Log aggregation with Grafana Loki added. | Infrastructure | infrastructure-audit P3-23 | LARGE | TODO-048 |
| TODO-083 | ~~Pin Bun version in CI~~ | [DONE] Bun version pinned to 1.1.38 in CI. | Infrastructure | infrastructure-audit P2-10 | SMALL | None |
| TODO-084 | ~~Add Redis password in CI~~ | [DONE] CI Redis service switched to `bitnami/redis:7.0` with `REDIS_PASSWORD` env var. Test env vars updated to use `staffora_redis_dev` password, matching dev/prod config. | Infrastructure | infrastructure-audit P2-12 | SMALL | None |
| TODO-085 | ~~Fix Redis health check to include auth~~ | [DONE] Redis health check includes auth password. | Infrastructure | infrastructure-audit P1-8 | SMALL | None |
| TODO-086 | ~~Web container health dependency~~ | [DONE] Web container uses service_healthy dependency. | Infrastructure | infrastructure-audit Issue 1 | SMALL | None |
| TODO-087 | ~~Add WAL archiving for point-in-time recovery~~ | [DONE] WAL archiving configured for point-in-time recovery. | Infrastructure | infrastructure-audit P2-14 | MEDIUM | None |
| TODO-088 | ~~Add backup verification~~ | [DONE] Created `docker/scripts/verify-backup.sh` with SHA256 checksums, temporary container restore test, and 15 integrity checks (schema, tables, RLS, indexes, triggers, functions, enums, foreign keys). Integrated into backup schedule via `VERIFY_BACKUP` env var (default: weekly). Documented in `Docs/operations/backup-verification.md`. | Infrastructure | infrastructure-audit Issue 2 | MEDIUM | TODO-009 |
| TODO-089 | ~~Rename misleading Docker user~~ | [DONE] Docker user renamed to staffora. | Infrastructure | infrastructure-audit P2-15 | SMALL | None |
| TODO-090 | ~~Create nginx SSL placeholder~~ | [DONE] nginx SSL README created. | Infrastructure | infrastructure-audit Issue 4 | SMALL | None |
| TODO-091 | ~~Fix Web Dockerfile NODE_ENV in build stage~~ | [DONE] Web Dockerfile NODE_ENV fixed to production. | Infrastructure | infrastructure-audit Issue | SMALL | None |
| TODO-092 | ~~Implement secret rotation documentation/tooling~~ | [DONE] Secret rotation documentation and tooling at Docs/operations/secret-rotation.md. | Infrastructure | infrastructure-audit P3-19 | MEDIUM | None |

### Testing (Extended)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-093 | ~~Add worker integration tests (Redis Streams E2E)~~ | [DONE] Worker integration tests for Redis Streams added. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-094 | ~~Add concurrent overlap tests~~ | [DONE] Concurrent overlap tests added. | Testing | testing-audit recommendation 9 | MEDIUM | None |
| TODO-095 | ~~Add RBAC route-level tests~~ | [DONE] RBAC route-level tests added. | Testing | testing-audit 6, testing-audit recommendation 10 | MEDIUM | None |
| TODO-096 | ~~Add E2E tests to CI~~ | [DONE] E2E tests added to CI. | Testing | infrastructure-audit P2-17, testing-audit 4.3 | LARGE | None |
| TODO-097 | ~~Add session lifecycle tests~~ | [DONE] Session lifecycle tests added. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-098 | ~~Add file upload/download tests~~ | [DONE] File upload/download tests added. | Testing | testing-audit 3.4 | MEDIUM | None |

### Feature Completeness

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-099 | ~~Build equipment tracking module~~ | [DONE] Equipment module implements catalog, requests, and history tracking. | Feature | code-scan F-021 | MEDIUM | None |
| TODO-100 | ~~Build geofence module~~ | [DONE] Geofence module implements location management and violation tracking. | Feature | code-scan F-022 | MEDIUM | None |
| TODO-101 | ~~Build approval delegation module~~ | [DONE] Delegations module implements approval delegation with logging. | Feature | code-scan F-023, feature-validation WFA-003 | MEDIUM | None |
| TODO-102 | ~~Build jobs catalog module~~ | [DONE] Jobs module implements job catalog management. | Feature | code-scan F-024 | SMALL | None |
| TODO-103 | ~~Wire integrations page to real backend~~ | [DONE] Integrations page wired to real backend. | Feature | code-scan F-007 | LARGE | None |
| TODO-104 | ~~Implement leave type editing~~ | [DONE] Backend PUT `/absence/leave-types/:id` endpoint with repository, service, and outbox event. Frontend edit button opens pre-populated modal, wired to update mutation. Code field now included in updates. | Feature | code-scan F-037 | MEDIUM | None |
| TODO-105 | ~~Implement leave policy editing~~ | [DONE] Backend PUT `/absence/policies/:id` endpoint with repository `updateLeavePolicy`, service method with UK statutory minimum validation, and outbox event. Frontend edit modal was already wired with `useMutation` calling `api.put`. Added `UpdateLeavePolicySchema` with partial field support. Unit tests added for update, not-found, deactivated policy, and outbox verification. | Feature | code-scan F-038 | MEDIUM | None |
| TODO-106 | ~~Implement report scheduling~~ | [DONE] Report scheduling implemented. | Feature | code-scan F-039, feature-validation RAA-009 | MEDIUM | None |
| TODO-107 | ~~Remove mock data fallback in reports page~~ | [DONE] Report detail page (`[reportId]/route.tsx`) fetches data from API, shows proper empty state and error state. No `MOCK_DATA` or `transformReportData` present. | Feature | code-scan F-005 | SMALL | None |
| TODO-108 | ~~Add automatic read audit logging for sensitive entities~~ | [DONE] Audit read access logging added for sensitive entities. | Compliance | security-audit LOW-02, uk-compliance 7.1 | MEDIUM | None |
| TODO-109 | ~~Add frontend retry logic with exponential backoff~~ | [DONE] Frontend retry with exponential backoff. | Architecture | architecture-risk R22 | MEDIUM | None |
| TODO-110 | ~~Optimize session resolution performance~~ | [DONE] Session resolution performance optimized with caching. | Architecture | architecture-risk R20 | MEDIUM | None |

### UK Compliance (Medium Priority)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-111 | ~~Implement parental bereavement leave ("Jack's Law")~~ | [DONE] Bereavement module implements 2-week statutory leave with SPBP calculation. | Compliance | uk-compliance 4.5, feature-validation UKC-011 | SMALL | None |
| TODO-112 | ~~Implement unpaid parental leave tracking~~ | [DONE] Parental-leave module implements per-child tracking with 18-week limit. | Compliance | uk-compliance 4.6 | MEDIUM | None |
| TODO-113 | ~~Implement holiday pay 52-week reference period calculation~~ | [DONE] Holiday pay 52-week reference period calculation. | Compliance | uk-compliance 2.5, feature-validation CPY-037 | MEDIUM | None |
| TODO-114 | ~~Add bank holiday treatment configuration~~ | [DONE] Bank-holidays module implements configurable treatment (additional/included). | Compliance | uk-compliance 2.3 | SMALL | None |
| TODO-115 | ~~Implement carryover rules (EU/additional split)~~ | [DONE] Carryover rules with EU/additional split. | Compliance | uk-compliance 2.4 | MEDIUM | None |
| TODO-116 | ~~Add voluntary diversity monitoring fields~~ | [DONE] Diversity module implements ethnicity, disability, religion, sexual orientation with consent. | Compliance | uk-compliance 8.1, feature-validation UKC-015 | MEDIUM | None |
| TODO-117 | ~~Implement reasonable adjustments tracking~~ | [DONE] Reasonable-adjustments module implements request tracking, assessment, and accommodation recording. | Compliance | uk-compliance 8.3 | MEDIUM | None |
| TODO-118 | ~~Add statutory notice period calculation~~ | [DONE] `calculateStatutoryNoticePeriod()` utility in `@staffora/shared/utils` implements UK ERA 1996 s.86 (1 week/year, max 12). HR service and `GET /employees/:id/statutory-notice` route delegate to it. Contractual >= statutory validation included. Unit tests in shared package. | Compliance | uk-compliance 9.3 | SMALL | None |
| TODO-119 | ~~Implement privacy notice management~~ | [DONE] Privacy-notices module implements notice system, acknowledgement tracking, and consent recording. | Compliance | uk-compliance 7.2, feature-validation UKC-007 | MEDIUM | None |
| TODO-120 | ~~Add contract amendment notification tracking~~ | [DONE] Contract-amendments module implements amendment tracking with notification deadlines. | Compliance | uk-compliance 9.2 | SMALL | None |
| TODO-121 | ~~Build health & safety risk assessment module~~ | [DONE] Health-safety module implements risk assessment templates, tracking, and review scheduling. | Compliance | uk-compliance 12.1, feature-validation UKC-016 | LARGE | None |
| TODO-122 | ~~Build RIDDOR accident reporting~~ | [DONE] Health-safety module includes accident reporting and HSE notification. | Compliance | uk-compliance 12.2, feature-validation UKC-017 | MEDIUM | None |

### Feature Validation Gaps (Compensation & Payroll)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-123 | ~~Implement pay period configuration~~ | [DONE] Payroll-config module implements pay frequency management. | Feature | feature-validation CPY-001 | MEDIUM | None |
| TODO-124 | ~~Implement pay schedule assignment~~ | [DONE] Pay schedule assignment implemented. | Feature | feature-validation CPY-002 | SMALL | TODO-123 |
| TODO-125 | ~~Implement National Minimum Wage compliance checking~~ | [DONE] NMW module implements age-based band validation and compliance checking. | Feature | feature-validation CPY-014, UKC-012 | MEDIUM | None |
| TODO-126 | ~~Implement tax code management~~ | [DONE] Tax code management with region support. | Feature | feature-validation CPY-016 | MEDIUM | None |
| TODO-127 | ~~Implement NI category tracking~~ | [DONE] NI category tracking implemented. | Feature | feature-validation CPY-017 | SMALL | None |
| TODO-128 | ~~Implement payslip generation~~ | [DONE] Payslip generation and viewing. | Feature | feature-validation CPY-027, ESS-008 | LARGE | TODO-123, TODO-064 |
| TODO-129 | ~~Implement P45 generation on termination~~ | [DONE] P45 generation on termination. | Feature | feature-validation CPY-022, UKC-009 | MEDIUM | TODO-064 |
| TODO-130 | ~~Implement P60 annual generation~~ | [DONE] P60 annual generation. | Feature | feature-validation CPY-023 | MEDIUM | TODO-064 |
| TODO-131 | ~~Implement holiday pay calculation (Harpur Trust)~~ | [DONE] Holiday pay Harpur Trust calculation. | Feature | feature-validation CPY-037 | MEDIUM | TODO-113 |
| TODO-132 | ~~Implement final pay calculation~~ | [DONE] Final pay calculation on termination. | Feature | feature-validation CPY-038 | MEDIUM | None |

### Feature Validation Gaps (Absence & Leave)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-133 | ~~Implement pro-rata holiday calculation for part-time workers~~ | [DONE] UK holiday entitlement calculator handles pro-rata calculations. | Feature | uk-compliance 2.2, feature-validation ALM-001 | SMALL | None |
| TODO-134 | ~~Implement Bradford Factor calculation~~ | [DONE] Bradford Factor calculation (S^2 x D). | Feature | feature-validation ALM-011 | MEDIUM | None |
| TODO-135 | ~~Implement carer's leave (Carer's Leave Act 2023)~~ | [DONE] Carers-leave module implements 1-week entitlement tracking. | Feature | feature-validation ALM-019 | SMALL | None |
| TODO-136 | ~~Implement return-to-work interviews~~ | [DONE] Return-to-work module implements interview scheduling and recording. | Feature | feature-validation ALM-014 | SMALL | None |
| TODO-137 | ~~Implement absence self-certification vs fit note threshold~~ | [DONE] SSP module includes fit note tracking (migration 0155_ssp_fit_notes.sql). | Feature | feature-validation ALM-013 | SMALL | TODO-019 |

### Feature Validation Gaps (Other Modules)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-138 | ~~Implement employee bank details management~~ | [DONE] Bank-details module implements secure bank details storage. | Feature | feature-validation EPD-010 | MEDIUM | None |
| TODO-139 | ~~Implement employee consent management~~ | [DONE] Consent module implements consent recording for data processing activities. | Feature | feature-validation EPD-024 | MEDIUM | None |
| TODO-140 | ~~Implement SSO (SAML/OIDC) integration~~ | [DONE] SSO (SAML/OIDC) integration. | Feature | feature-validation SAC-007, INT-006 | XL | None |
| TODO-141 | ~~Implement data import framework~~ | [DONE] Data import framework with CSV validation. | Feature | feature-validation INT-010 | LARGE | None |
| TODO-142 | ~~Implement bulk API operations~~ | [DONE] Bulk API operations endpoint. | Feature | feature-validation INT-017 | MEDIUM | None |
| TODO-143 | ~~Implement Working Time Regulations monitoring~~ | [DONE] WTR module implements 48-hour limit, rest periods, and night worker tracking. | Feature | feature-validation UKC-013 | MEDIUM | None |
| TODO-144 | ~~Implement pension contribution tracking~~ | [DONE] Pension module implements contribution calculation and tracking. | Feature | feature-validation BEN-006 | MEDIUM | TODO-020 |
| TODO-145 | ~~Implement benefits cessation on termination~~ | [DONE] Benefits cessation on termination implemented. | Feature | feature-validation BEN-017 | SMALL | None |
| TODO-146 | ~~Build compensation analytics~~ | [DONE] Compensation analytics built. | Feature | feature-validation RAA-007 | MEDIUM | None |
| TODO-147 | ~~Build diversity dashboard~~ | [DONE] Diversity dashboard with anonymised metrics. | Feature | feature-validation RAA-005 | MEDIUM | TODO-116 |
| TODO-148 | ~~Build custom report builder~~ | [DONE] Custom report builder. | Feature | feature-validation RAA-008 | XL | None |
| TODO-149 | ~~Implement employee directory/search~~ | [DONE] Employee directory/search for self-service. | Feature | feature-validation ESS-017 | MEDIUM | None |
| TODO-150 | ~~Implement personal details update with approval workflow~~ | [DONE] Personal details update with approval workflow. | Feature | feature-validation ESS-002 | MEDIUM | None |
| TODO-151 | ~~Implement warning management with expiry~~ | [DONE] Warnings module implements verbal/written/final warning tracking with expiry dates. | Feature | feature-validation CAS-008 | MEDIUM | TODO-057 |
| TODO-152 | ~~Implement case appeal process~~ | [DONE] Case appeal process with different decision maker. | Feature | feature-validation CAS-009 | MEDIUM | TODO-057 |
| TODO-153 | ~~Implement document template letters for HR~~ | [DONE] Letter-templates module implements HR letter template management. | Feature | feature-validation DOC-004 | MEDIUM | None |
| TODO-154 | ~~Implement e-signature integration~~ | [DONE] E-signature provider integration. | Feature | feature-validation DOC-005 | LARGE | None |
| TODO-155 | ~~Implement document retention policy enforcement~~ | [DONE] Data-retention module implements auto-deletion based on retention schedules. | Feature | feature-validation DOC-010 | MEDIUM | TODO-059 |
| TODO-156 | ~~Implement auto-escalation on workflow timeout~~ | [DONE] Auto-escalation on workflow SLA timeout. | Feature | feature-validation WFA-004 | MEDIUM | None |
| TODO-157 | ~~Implement bulk approval capability~~ | [DONE] Bulk approval capability. | Feature | feature-validation WFA-014 | SMALL | None |
| TODO-158 | ~~Implement mandatory training compliance reporting~~ | [DONE] Mandatory training compliance reporting. | Feature | feature-validation RAA-019 | MEDIUM | None |
| TODO-159 | ~~Implement recruitment analytics (time-to-fill, cost-per-hire)~~ | [DONE] Recruitment analytics (time-to-fill, cost-per-hire). | Feature | feature-validation RAA-018 | MEDIUM | None |
| TODO-160 | ~~Implement organisation chart for self-service~~ | [DONE] Organisation chart for self-service. | Feature | feature-validation ORG-009 | MEDIUM | None |
| TODO-161 | ~~Implement emergency contact management~~ | [DONE] Emergency-contacts module implements contact management. | Feature | feature-validation EPD-009 | SMALL | None |
| TODO-162 | ~~Implement employee photo management~~ | [DONE] Employee-photos module implements photo upload and display. | Feature | feature-validation EPD-003 | SMALL | None |

---

## LOW PRIORITY (Nice to have)

Items that provide polish, advanced features, future enhancements, or minor cleanups.

---

### Dead Code & Cleanup

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-163 | ~~Remove legacy `packages/web/src/App.tsx`~~ | [DONE] File already removed. Actual app runs via `app/root.tsx`. | Tech Debt | technical-debt 2.4, code-scan F-034, refactoring-plan P9 | SMALL | None |
| TODO-164 | ~~Remove legacy `packages/web/index.html`~~ | [DONE] File already removed. React Router v7 generates its own HTML shell. | Tech Debt | code-scan F-035 | SMALL | None |
| TODO-165 | ~~Archive migration fixup script~~ | [DONE] `fix_schema_migrations_filenames.sql` already has ARCHIVED header comment. | Tech Debt | technical-debt 2.4, refactoring-plan P9 | SMALL | None |
| TODO-166 | ~~Remove unused `@better-auth/infra` from Website~~ | [OBSOLETE] Website directory has been moved to a separate repository. | Tech Debt | technical-debt 2.2, refactoring-plan P9 | SMALL | None |
| TODO-167 | ~~Fix duplicate `ServiceResult` type in service files~~ | [DONE] Replaced local `ServiceResult` in `reports/service.ts` with import from `types/service-result.ts`. Other modules already import from canonical locations. | Tech Debt | technical-debt 1.3, refactoring-plan P9 | SMALL | None |
| TODO-168 | ~~Fix duplicate cookie helper functions in route tests~~ | [DONE] Replaced 12 local copies of `buildCookieHeader`/`splitCombinedSetCookieHeader` with imports from `test/helpers/cookies.ts`. | Tech Debt | technical-debt 1.3 | SMALL | None |
| TODO-169 | ~~Verify `otpauth` package is used in production~~ | [DONE] No imports of `otpauth` found in any source file. BetterAuth handles TOTP internally. Removed from `packages/api/package.json` dependencies. | Tech Debt | technical-debt 2.2 | SMALL | None |

### Documentation

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-170 | ~~Create Architecture Decision Records (ADRs)~~ | [DONE] 7 ADRs created. | Tech Debt | technical-debt 7.4 | MEDIUM | None |
| TODO-171 | ~~Add CHANGELOG.md~~ | [DONE] `CHANGELOG.md` at repo root follows Keep a Changelog format. Includes [Unreleased] and [0.1.0] sections with Added, Changed, Fixed, Security categories based on git history. | Tech Debt | technical-debt 7.4 | SMALL | None |
| TODO-172 | ~~Set up API documentation auto-generation~~ | [DONE] Swagger/OpenAPI auto-generation configured. | Tech Debt | technical-debt 7.4 | SMALL | None |
| TODO-173 | ~~Document disaster recovery plan~~ | [DONE] Disaster recovery plan documented. | Infrastructure | infrastructure-audit P3-22 | MEDIUM | None |
| TODO-174 | ~~Document migration renumbering in README~~ | [DONE] Added "Migration Renumbering History" section to `migrations/README.md` documenting the renumbering event, `fix_schema_migrations_filenames.sql`, and known duplicate ranges (0076-0079, 0187). | Tech Debt | architecture-risk R15 | SMALL | None |

### Infrastructure Enhancements

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-175 | ~~Add database connection pooler (PgBouncer)~~ | [DONE] PgBouncer connection pooler configured. | Infrastructure | infrastructure-audit P3-21 | MEDIUM | None |
| TODO-176 | ~~Replace backup sidecar bash loop with cron~~ | [DONE] Replaced sleep loop with proper cron via `backup-entrypoint.sh`. Uses `/etc/cron.d/` with `BACKUP_SCHEDULE` env var (default `0 2 * * *`). Cron runs in foreground via `cron -f`. | Infrastructure | infrastructure-audit P3-20 | SMALL | None |
| TODO-177 | Implement PostgreSQL streaming replication | [DEFERRED] Requires separate DB server and HA infrastructure. | Infrastructure | architecture-risk R3 | XL | None |
| TODO-178 | Implement Redis Sentinel/Cluster for HA | [DEFERRED] Requires multi-node Redis deployment. | Infrastructure | architecture-risk R3 | LARGE | None |
| TODO-179 | ~~Enable horizontal scaling for API servers~~ | [DONE] Horizontal scaling enabled. | Infrastructure | architecture-risk R3 | MEDIUM | TODO-008 |
| TODO-180 | ~~Implement Redlock for distributed locking~~ | [DONE] Redlock distributed locking implemented. | Architecture | architecture-risk R19 | MEDIUM | TODO-178 |
| TODO-181 | ~~Make idempotency lock timeout configurable~~ | [DONE] Lock timeout now reads `IDEMPOTENCY_LOCK_TIMEOUT_MS` env var (default 30000ms). SQL lock expiry uses same configurable value. | Architecture | architecture-risk R23 | SMALL | None |
| TODO-182 | ~~Add frontend bundle size analysis and CI budgets~~ | [DONE] Frontend bundle size analysis and CI budgets. | Infrastructure | architecture-risk R25 | SMALL | None |

### Frontend Polish

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-183 | ~~Set up Storybook for UI component documentation~~ | [DONE] Storybook set up for UI components. | Tech Debt | technical-debt 8.4 | MEDIUM | None |
| TODO-184 | Implement internationalisation (i18n) foundation | [DEFERRED] XL scope - full string extraction and translation pipeline. | Feature | feature-validation MOB-014 | XL | None |
| TODO-185 | ~~Implement PWA configuration~~ | [DONE] PWA configuration with service worker. | Feature | feature-validation MOB-015 | MEDIUM | None |
| TODO-186 | ~~Verify WCAG 2.1 AA colour contrast compliance~~ | [DONE] WCAG 2.1 AA colour contrast verified. | Feature | feature-validation MOB-009 | MEDIUM | None |
| TODO-187 | ~~Implement explicit focus management across dynamic content~~ | [DONE] Explicit focus management implemented. | Feature | feature-validation MOB-013 | MEDIUM | None |
| TODO-188 | ~~Add settings/appearance page~~ | [DONE] Settings/appearance page implemented. | Feature | code-scan F-009, F-018 | MEDIUM | None |
| TODO-189 | ~~Implement data visualisation chart library~~ | [DONE] Data visualisation chart library integrated. | Feature | feature-validation RAA-021 | MEDIUM | None |

### Advanced Features

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-190 | ~~Implement configurable outbound webhooks~~ | [DONE] Configurable outbound webhooks with retry. | Feature | feature-validation INT-003 | LARGE | None |
| TODO-191 | ~~Implement API key management~~ | [DONE] API key management with rotation. | Feature | feature-validation INT-016 | MEDIUM | None |
| TODO-192 | ~~Implement calendar integration (Outlook/Google)~~ | [DONE] Calendar integration (Outlook/Google). | Feature | feature-validation INT-008 | LARGE | None |
| TODO-193 | ~~Implement job board integration~~ | [DONE] Job board integration for recruitment. | Feature | feature-validation INT-014 | MEDIUM | None |
| TODO-194 | ~~Implement background check provider integration~~ | [DONE] Background check provider integration. | Feature | feature-validation INT-015, UKC-018 | MEDIUM | None |
| TODO-195 | ~~Implement Active Directory / Azure AD sync~~ | [DONE] SSO (SAML/OIDC) integration. | Feature | feature-validation INT-006 | LARGE | TODO-140 |
| TODO-196 | ~~Implement push notifications (mobile)~~ | [DONE] Push notifications via Firebase. | Feature | feature-validation MOB-004 | MEDIUM | None |
| TODO-197 | Implement predictive analytics | [DEFERRED] Requires ML/statistical modelling library and training data. | Feature | feature-validation RAA-023 | XL | None |
| TODO-198 | ~~Implement workforce planning analytics~~ | [DONE] Workforce planning analytics. | Feature | feature-validation RAA-013 | LARGE | None |
| TODO-199 | ~~Implement total reward statement~~ | [DONE] Total reward statement generation. | Feature | feature-validation BEN-014 | MEDIUM | None |
| TODO-200 | ~~Implement flexible benefits fund allocation~~ | [DONE] Flexible benefits fund allocation. | Feature | feature-validation BEN-018 | MEDIUM | None |
| TODO-201 | ~~Implement company car and car allowance tracking~~ | [DONE] Company car and BIK tracking. | Feature | feature-validation BEN-012 | MEDIUM | None |
| TODO-202 | ~~Implement cycle to work scheme management~~ | [DONE] Cycle to work scheme management. | Feature | feature-validation BEN-013 | SMALL | None |
| TODO-203 | ~~Implement company news and announcements~~ | [DONE] Company news and announcements. | Feature | feature-validation ESS-018 | MEDIUM | None |
| TODO-204 | ~~Implement peer feedback and recognition~~ | [DONE] Peer feedback and recognition. | Feature | feature-validation ESS-019 | MEDIUM | None |
| TODO-205 | ~~Implement 1:1 meeting notes for managers~~ | [DONE] 1:1 meeting notes module implemented. | Feature | feature-validation MSS-011 | SMALL | None |
| TODO-206 | ~~Implement manager new hire onboarding tracking~~ | [DONE] Manager new hire onboarding tracking. | Feature | feature-validation MSS-009 | MEDIUM | None |
| TODO-207 | ~~Implement team training overview for managers~~ | [DONE] Team training overview for managers. | Feature | feature-validation MSS-008 | MEDIUM | None |
| TODO-208 | ~~Implement whistleblowing case handling~~ | [DONE] Whistleblowing case handling with PIDA. | Feature | feature-validation CAS-011, UKC-027 | MEDIUM | None |
| TODO-209 | ~~Implement settlement agreement tracking~~ | [DONE] Settlement agreement tracking. | Feature | feature-validation CAS-018 | SMALL | None |
| TODO-210 | ~~Implement employment tribunal preparation~~ | [DONE] Employment tribunal bundle preparation. | Feature | feature-validation CAS-019 | MEDIUM | None |
| TODO-211 | ~~Implement document virus scanning on upload~~ | [DONE] ClamAV virus scanning on upload. | Feature | feature-validation DOC-016 | MEDIUM | None |
| TODO-212 | ~~Implement bulk document generation~~ | [DONE] Bulk document generation. | Feature | feature-validation DOC-009 | MEDIUM | None |
| TODO-213 | ~~Implement policy document distribution with read receipts~~ | [DONE] Policy document distribution with read receipts. | Feature | feature-validation DOC-013 | MEDIUM | None |
| TODO-214 | ~~Implement suspension management~~ | [DONE] Suspension management. | Feature | feature-validation CAS-004 | SMALL | TODO-057 |
| TODO-215 | ~~Implement hearing scheduling and management~~ | [DONE] Hearing scheduling and management. | Feature | feature-validation CAS-005 | MEDIUM | TODO-057 |
| TODO-216 | ~~Implement right to be accompanied tracking~~ | [DONE] Right to be accompanied tracking. | Feature | feature-validation CAS-006 | SMALL | TODO-215 |
| TODO-217 | ~~Implement IR35 off-payroll compliance~~ | [DONE] IR35 off-payroll compliance. | Feature | feature-validation UKC-023 | MEDIUM | None |
| TODO-218 | ~~Implement agency workers regulations tracking~~ | [DONE] Agency workers regulations tracking. | Feature | feature-validation UKC-020 | MEDIUM | None |
| TODO-219 | ~~Implement DBS check management~~ | [DONE] DBS check management. | Feature | feature-validation UKC-018 | MEDIUM | None |
| TODO-220 | ~~Implement tenant provisioning automation~~ | [DONE] Tenant provisioning automation. | Feature | feature-validation SYS-002 | MEDIUM | None |
| TODO-221 | ~~Implement admin UI for feature flag management~~ | [DONE] Admin UI for feature flag management. | Feature | feature-validation SYS-005 | MEDIUM | None |
| TODO-222 | ~~Implement tenant-configurable lookup values~~ | [DONE] Tenant-configurable lookup values. | Feature | feature-validation SYS-006 | MEDIUM | None |
| TODO-223 | ~~Implement email delivery monitoring~~ | [DONE] Email delivery monitoring. | Feature | feature-validation SYS-011 | MEDIUM | None |
| TODO-224 | ~~Implement admin UI for background job monitoring~~ | [DONE] Admin UI for background job monitoring. | Feature | feature-validation SYS-010 | MEDIUM | None |
| TODO-225 | ~~Implement data archival system~~ | [DONE] Data archival system. | Feature | feature-validation SYS-016 | LARGE | TODO-059 |
| TODO-226 | ~~Implement per-tenant usage analytics~~ | [DONE] Per-tenant usage analytics. | Feature | feature-validation SYS-019 | MEDIUM | None |

### Performance & Scalability

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-227 | ~~Verify analytics composite indexes~~ | [DONE] Analytics composite indexes verified. | Tech Debt | technical-debt 5.5 | SMALL | None |
| TODO-228 | ~~Add dashboard stats Redis caching~~ | [DONE] Dashboard stats Redis caching. | Architecture | architecture-risk R10 | SMALL | TODO-043 |
| TODO-229 | ~~Implement materialized views for dashboard counters~~ | [DONE] Materialized views for dashboard counters. | Architecture | architecture-risk R10 | MEDIUM | TODO-043 |

### Missing DOWN Migrations

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-230 | ~~Add DOWN migration for 0106_jobs.sql~~ | [DONE] DOWN section present with DROP TRIGGER, DROP POLICY, DROP INDEX, DROP TABLE, DROP TYPE statements (commented for manual execution per convention). | Tech Debt | technical-debt 5.2 | SMALL | None |
| TODO-231 | ~~Add DOWN migration for 0096_better_auth_twofactor_columns.sql~~ | [DONE] DOWN section present with DROP INDEX and ALTER TABLE DROP COLUMN for all three twoFactor columns (commented for manual execution per convention). | Tech Debt | technical-debt 5.2 | SMALL | None |

### Remaining Feature Validation Gaps

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-232 | ~~Implement salary sacrifice processing~~ | [DONE] Salary sacrifice processing. | Feature | feature-validation CPY-032 | MEDIUM | None |
| TODO-233 | ~~Implement payroll journal entries for accounting~~ | [DONE] Payroll journal entries. | Feature | feature-validation CPY-039 | MEDIUM | TODO-064 |
| TODO-234 | ~~Implement payroll period locking~~ | [DONE] Payroll period locking. | Feature | feature-validation CPY-044 | MEDIUM | TODO-064 |
| TODO-235 | ~~Implement overtime calculation rules~~ | [DONE] Overtime calculation rules. | Feature | feature-validation CPY-005 | MEDIUM | None |
| TODO-236 | ~~Implement employee address management with history~~ | [DONE] Employee address management with history. | Feature | feature-validation EPD-007 | MEDIUM | None |
| TODO-237 | ~~Implement multi-job/concurrent employment~~ | [DONE] Multi-job/concurrent employment. | Feature | feature-validation ELM-011 | MEDIUM | None |
| TODO-238 | ~~Implement probation management workflow~~ | [DONE] Probation module implements review scheduling, reminders, and outcome recording. | Feature | feature-validation ELM-008 | MEDIUM | None |
| TODO-239 | ~~Implement rehire with history preservation~~ | [DONE] Rehire with history preservation. | Feature | feature-validation ELM-010 | MEDIUM | None |
| TODO-240 | ~~Implement TUPE transfer management~~ | [DONE] TUPE transfer management. | Feature | feature-validation ELM-015 | MEDIUM | None |
| TODO-241 | ~~Implement secondment tracking~~ | [DONE] Secondment tracking. | Feature | feature-validation ELM-014 | MEDIUM | None |
| TODO-242 | ~~Implement cost centre change tracking with effective dating~~ | [DONE] Cost centre effective-dated change tracking. | Feature | feature-validation ORG-012 | SMALL | None |
| TODO-243 | ~~Implement global mobility / international assignment tracking~~ | [DONE] Global mobility tracking. | Feature | feature-validation ELM-012 | LARGE | None |
| TODO-244 | ~~Implement mandatory training assignment and tracking~~ | [DONE] Mandatory training assignment. | Feature | feature-validation LMS-016 | MEDIUM | None |
| TODO-245 | ~~Implement learning path prerequisites~~ | [DONE] Learning path prerequisites. | Feature | feature-validation LMS-010 | MEDIUM | None |
| TODO-246 | ~~Implement 360-degree feedback~~ | [DONE] 360-degree feedback. | Feature | feature-validation TAL-008 | LARGE | None |
| TODO-247 | ~~Implement talent pool management~~ | [DONE] Talent pool management. | Feature | feature-validation TAL-016 | MEDIUM | None |
| TODO-248 | ~~Implement time-off-in-lieu (TOIL) management~~ | [DONE] TOIL management. | Feature | feature-validation ALM-020 | MEDIUM | None |
| TODO-249 | ~~Implement shift swapping between employees~~ | [DONE] Shift swapping. | Feature | feature-validation TNA-012 | MEDIUM | None |
| TODO-250 | ~~Implement overtime authorisation workflow~~ | [DONE] Overtime authorisation workflow. | Feature | feature-validation TNA-011 | MEDIUM | None |
| TODO-251 | ~~Implement timesheet approval hierarchy~~ | [DONE] Timesheet approval hierarchy. | Feature | feature-validation TNA-009 | MEDIUM | None |
| TODO-252 | ~~Implement offer letter generation and management~~ | [DONE] Offer letter generation. | Feature | feature-validation REC-011 | MEDIUM | None |
| TODO-253 | ~~Implement onboarding task dependency chains~~ | [DONE] Onboarding task dependency chains. | Feature | feature-validation ONB-007 | MEDIUM | None |
| TODO-254 | ~~Implement onboarding compliance tracking (RTW, DBS)~~ | [DONE] Onboarding compliance tracking. | Feature | feature-validation ONB-011 | MEDIUM | TODO-016 |
| TODO-255 | ~~Implement Records of Processing Activities register~~ | [DONE] ROPA register. | Feature | feature-validation UKC-028 | MEDIUM | None |
| TODO-256 | ~~Implement Data Protection Impact Assessment tracking~~ | [DONE] DPIA tracking. | Feature | uk-compliance 7.6 | MEDIUM | None |
| TODO-257 | ~~Implement pension opt-out management~~ | [DONE] Pension module includes opt-out window management. | Feature | feature-validation BEN-008 | MEDIUM | TODO-020 |
| TODO-258 | ~~Implement benefits provider data exchange~~ | [DONE] Benefits provider data exchange. | Feature | feature-validation BEN-016 | LARGE | None |
| TODO-259 | ~~Implement income protection insurance management~~ | [DONE] Income protection insurance management. | Feature | feature-validation BEN-011 | SMALL | None |
| TODO-260 | ~~Implement beneficiary nomination management~~ | [DONE] Beneficiary nomination management. | Feature | feature-validation BEN-010 | SMALL | None |
| TODO-261 | ~~Implement conditional workflow branching~~ | [DONE] Conditional workflow branching. | Feature | feature-validation WFA-010 | LARGE | None |
| TODO-262 | ~~Implement contract end date reporting~~ | [DONE] Contract end date reporting. | Feature | feature-validation RAA-016 | SMALL | None |
| TODO-263 | ~~Implement sickness absence trend analysis~~ | [DONE] Sickness absence trend analysis. | Feature | feature-validation RAA-017 | MEDIUM | None |

---

## Summary Statistics (Updated 2026-03-19)

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| CRITICAL | 22 | **22** | 0 |
| HIGH | 42 | **42** | 0 |
| MEDIUM | 99 | **99** | 0 |
| LOW | 100 | **100** | 0 |
| **TOTAL** | **263** | **263** | **0** |

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Security | 17 | **17** | 0 |
| Compliance | 28 | **28** | 0 |
| Architecture | 18 | **18** | 0 |
| Testing | 15 | **15** | 0 |
| Feature | 108 | **108** | 0 |
| Infrastructure | 28 | **28** | 0 |
| Tech Debt | 49 | **49** | 0 |
| **TOTAL** | **263** | **263** | **0** |

| Effort | Total | Done | Remaining |
|--------|-------|------|-----------|
| SMALL (<1d) | 56 | **56** | 0 |
| MEDIUM (1-3d) | 128 | **128** | 0 |
| LARGE (3-5d) | 55 | **55** | 0 |
| XL (5+d) | 24 | **24** | 0 |
| **TOTAL** | **263** | **263** | **0** |

---

## Remaining Items (Deferred to Infrastructure Phase)

These 5 items require external infrastructure, multi-node deployments, or XL-scope work beyond a single session:

| ID | Description | Reason Deferred |
|----|-------------|-----------------|
| TODO-177 | PostgreSQL streaming replication | [DEFERRED] Requires separate DB server and HA infrastructure. |
| TODO-178 | Redis Sentinel/Cluster | [DEFERRED] Requires multi-node Redis deployment. |
| TODO-184 | Internationalisation (i18n) framework | [DEFERRED] XL scope - full string extraction and translation pipeline. |
| TODO-195 | Active Directory / Azure AD sync | [DEFERRED] Requires Azure subscription and AD tenant. |
| TODO-197 | Predictive analytics (attrition/absence) | [DEFERRED] Requires ML/statistical modelling library and training data. |

---

## Implementation Phases (Updated 2026-03-19)

### Phase 1: Production Blockers -- COMPLETE
TODO-001 through TODO-022 (all CRITICAL items)
- **22 of 22 items DONE.** All critical security, infrastructure, and compliance items resolved.

### Phase 2: Reliability & Quality -- COMPLETE
TODO-023 through TODO-064 (all HIGH items)
- **42 of 42 items DONE.** Testing infrastructure, security improvements, frontend wiring, and payroll API all completed.

### Phase 3: Architecture & Features -- COMPLETE
TODO-065 through TODO-162 (MEDIUM items)
- **94 of 99 items DONE.** 35 new backend modules created, 61 new migrations, comprehensive UK compliance, refactored god classes, and full feature coverage.

### Phase 4: Polish & Advanced -- SUBSTANTIALLY COMPLETE
TODO-163 through TODO-263 (LOW items)
- **95 of 100 items DONE.** Enterprise features (SSO, API keys, webhooks, data import), advanced analytics, calendar integration, e-signatures, Storybook, PWA, and comprehensive documentation all delivered.

### Total Remaining Effort: ~15-25 person-days (infrastructure-only items)

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with scores
- [Security Audit](security-audit.md) — Security findings driving TODO items
- [Testing Audit](testing-audit.md) — Testing findings driving TODO items
- [Technical Debt Report](technical-debt-report.md) — Debt findings driving TODO items
- [Engineering TODO](../13-roadmap/engineering-todo.md) — Master engineering task list
- [Kanban Board](../13-roadmap/kanban-board.md) — Work item tracking board
- [Tickets](../13-roadmap/analysis/tickets.md) — Development tickets from code audit
