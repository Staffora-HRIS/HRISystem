# Staffora HRIS -- Master TODO List

**Generated:** 2026-03-13 | **Updated:** 2026-03-14 (post-remediation)
**Source Audits (original -> updated scores):**
- Security Audit (74/100 -> **90/100**)
- Testing Audit (42/100 -> **55/100**)
- Infrastructure Audit (57/100 -> **80/100**)
- Architecture Risk Report (52/100 -> **78/100**)
- Technical Debt Report (42/100 -> **68/100**)
- UK Compliance Audit (18/100 -> **72/100**)
- Code Scan Findings (108 findings)
- Refactoring Plan (10 proposals)
- Feature Validation Report (603 items, 31.3% -> **~57% implemented**)

**Total Items: 263** | **Completed: ~105** | **Remaining: ~158**

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
| TODO-006 | Remove hardcoded database password fallback | `hris_dev_password` hardcoded in `db.ts` and `database.ts` as fallback. Production should crash if `DB_PASSWORD`/`DATABASE_URL` is not set. | Security | security-audit MEDIUM-02, architecture-risk R24 | SMALL | None |

### Infrastructure / Architecture

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-007 | ~~Create `hris_app` runtime role in production~~ | [DONE] `hris_app` role created via `docker/postgres/01-create-app-role.sh` and configured in docker-compose. | Infrastructure | infrastructure-audit Issue 2 | SMALL | None |
| TODO-008 | ~~Add graceful shutdown to API server~~ | [DONE] API server now has SIGTERM/SIGINT handlers with connection draining and cleanup. | Architecture | architecture-risk R2, refactoring-plan P6 | SMALL | None |
| TODO-009 | Implement offsite backup storage (S3) | Backups stored only in Docker volume on same host. Host failure = total data loss. Backup sidecar already has dump logic; add S3 upload. | Infrastructure | infrastructure-audit P0-3 | MEDIUM | None |
| TODO-010 | ~~Add deployment pipeline (CI/CD)~~ | [DONE] CI/CD workflows added: deploy.yml, pr-check.yml, test.yml, security.yml. | Infrastructure | infrastructure-audit Gap 1, Gap 3 | LARGE | None |
| TODO-011 | ~~Implement migration rollback support~~ | [DONE] `migrate:down` and `migrate:repair` commands implemented. | Infrastructure | infrastructure-audit P0-2 | MEDIUM | None |

### Runtime Errors / Data Integrity

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-012 | Fix leave_approvals table/column name mismatch | `manager.service.ts` references `app.leave_approvals` with wrong column names. Actual table is `app.leave_request_approvals` with columns `request_id`, `actor_id`, `action`, `created_at`. All manager approval/rejection calls will fail at runtime. | Tech Debt | code-scan F-019 | SMALL | None |
| TODO-013 | Consolidate dual user tables | Better Auth manages `"user"` table (camelCase) while app uses `app.users` (snake_case). Sync hooks can fail silently, causing auth/RBAC mismatches. Database hooks use `INSERT ... ON CONFLICT DO UPDATE` which may lose data on sync failure. | Architecture | architecture-risk R12 | LARGE | None |
| TODO-014 | Consolidate database connection pools | Three independent pools compete for PostgreSQL connections: postgres.js (20), Better Auth pg Pool (10), Scheduler (unlimited). With default max_connections=100, this risks exhaustion under load. | Architecture | architecture-risk R4 | MEDIUM | TODO-015 |
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
| TODO-024 | Add rate limiting integration tests | Rate limiting disabled when `NODE_ENV=test`. No tests verify it actually works. Add dedicated tests with `options.enabled: true`. | Testing | security-audit MEDIUM-05, architecture-risk R5 | SMALL | None |
| TODO-025 | Implement IP-based rate limiting for unauthenticated endpoints | Generic rate limit key uses `tenantId ?? "public"` -- all unauthenticated requests share one bucket. No global rate limit on API enumeration. | Security | architecture-risk R5 | MEDIUM | None |
| TODO-026 | Add Redis fallback for rate limiting | If Redis is down, rate limiting silently fails. Add in-memory LRU cache fallback. | Security | architecture-risk R5 | MEDIUM | None |
| TODO-027 | Reduce tenant cache TTL from 5 minutes | Suspended tenant users can continue accessing data for up to 5 minutes due to cache. Reduce to 30-60 seconds or implement event-driven invalidation. | Security | architecture-risk R9 | SMALL | None |
| TODO-028 | Implement MFA recovery code flow | "Use recovery code" button shows toast "not available yet". Users locked out with no MFA device have zero recovery path. | Security | code-scan F-036 | MEDIUM | None |
| TODO-029 | ~~Add security scanning to CI~~ | [DONE] CodeQL and Trivy scanning added in `.github/workflows/security.yml`. | Security | infrastructure-audit Gap 2 | SMALL | None |

### Testing

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-030 | ~~Rewrite hollow E2E employee-lifecycle.test.ts~~ | [DONE] E2E employee lifecycle test rewritten with real API calls. | Testing | testing-audit 3.1, technical-debt 6.1, refactoring-plan P7 | MEDIUM | None |
| TODO-031 | Fix 14 partial service unit tests | Tests extract business logic into local functions and test the copy, not the actual service class. Zero regression protection if service logic drifts. | Testing | testing-audit 3.2, technical-debt 6.1 | LARGE | None |
| TODO-032 | Convert top route tests to real HTTP (app.handle) | Only `hr.routes.test.ts` makes real HTTP calls. All others bypass auth, tenant resolution, RBAC, idempotency, rate limiting, audit logging, and error formatting. | Testing | testing-audit 3.3, refactoring-plan P7 | LARGE | None |
| TODO-033 | ~~Add auth flow E2E test~~ | [DONE] Auth flow E2E test added. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-034 | Create TestApiClient utility | No utility for making authenticated HTTP requests in tests with session creation, tenant headers, and idempotency keys. | Testing | testing-audit 4.2 | MEDIUM | None |
| TODO-035 | ~~Add test data factories~~ | [DONE] Test data factories created for domain objects. | Testing | testing-audit 4.2 | MEDIUM | None |
| TODO-036 | ~~Add test coverage thresholds to CI~~ | [DONE] Coverage thresholds enforced in CI pipeline. | Testing | testing-audit 4.3, infrastructure-audit Gap 6 | SMALL | None |
| TODO-037 | Add admin frontend route tests | ~30 admin routes with zero tests. Priority: employees list, employee detail, absence management, time management, cases list. | Testing | testing-audit 3.4 | LARGE | None |
| TODO-038 | Add manager frontend route tests | 5 manager routes with zero tests. Approvals and team management are critical workflows. | Testing | testing-audit 3.4 | MEDIUM | None |

### Architecture & Tech Debt

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-039 | Integrate @staffora/shared into production code | Package has 0 imports in frontend, 0 in API modules. All types, error codes, state machines duplicated locally. Massive duplication. | Tech Debt | technical-debt 2.1, refactoring-plan P1 | LARGE | TODO-040 |
| TODO-040 | ~~Fix TypeBox version mismatch (0.32 vs 0.34)~~ | [DONE] TypeBox versions aligned across packages. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-041 | Fix better-auth version mismatch | API uses `^1.5.4`, web uses `^1.4.10`. Client/server should match to prevent auth behavior inconsistency. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-042 | Fix vitest/coverage version mismatch | `vitest: ^2.1.8` and `@vitest/coverage-v8: ^4.1.0`. Major version mismatch (v2 vs v4) -- incompatible. Frontend coverage may be broken. | Tech Debt | technical-debt 4.1 | SMALL | None |
| TODO-043 | ~~Refactor dashboard module to service/repository pattern~~ | [DONE] Dashboard refactored with service.ts, repository.ts, schemas.ts. | Architecture | architecture-risk R10, technical-debt 3.1, code-scan F-025, refactoring-plan P3 | SMALL | None |
| TODO-044 | ~~Move audit logging into business transactions~~ | [DONE] Audit `logInTransaction()` now used throughout modules. | Architecture | architecture-risk R8 | MEDIUM | None |
| TODO-045 | ~~Add error handling to 11 services~~ | [DONE] Service error handling utility (`withServiceErrorHandling`) created and applied across services. | Tech Debt | technical-debt 1.4, refactoring-plan P4 | LARGE | None |
| TODO-046 | ~~Replace all SELECT * with explicit column lists~~ | [DONE] All SELECT * replaced with explicit column lists across repository files. | Architecture | architecture-risk R6, refactoring-plan P8 | MEDIUM | None |
| TODO-047 | Replace Redis KEYS command with SCAN | `invalidateTenantCache()` uses `KEYS` which blocks Redis and scans all keys. Production latency spikes. | Architecture | architecture-risk R17 | SMALL | None |
| TODO-048 | ~~Add structured logging (replace console.log)~~ | [DONE] Structured logging via Pino implemented (`src/lib/logger.ts`). console.log statements eliminated. PII redaction included. | Infrastructure | infrastructure-audit P1-5, code-scan F-040 | MEDIUM | None |
| TODO-049 | ~~Add error tracking (Sentry)~~ | [DONE] Sentry integration added (`src/lib/sentry.ts`), wired into errorsPlugin. | Infrastructure | infrastructure-audit P1-6 | SMALL | None |
| TODO-050 | ~~Standardize outbox pattern across all modules~~ | [DONE] Shared outbox helper created (`src/lib/outbox.ts`). All new modules use standardised outbox emission. | Architecture | architecture-risk R14 | MEDIUM | None |

### Code Scan Runtime Fixes

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-051 | Wire tenant settings page to real backend API | `queryFn` returns hardcoded mock data (`id: "tenant-1"`, `name: "Acme Corporation"`). Backend `/tenant/settings` endpoint exists but is unused. | Feature | code-scan F-001 | SMALL | None |
| TODO-052 | Wire tenant settings save to backend | Save handler uses `setTimeout(1000)` and shows success toast without persisting. Users believe settings are saved. | Feature | code-scan F-002 | SMALL | TODO-051 |
| TODO-053 | Wire notification settings save to backend | Same simulated save pattern. Notification preferences never persist. | Feature | code-scan F-003 | SMALL | None |
| TODO-054 | Implement time policies backend endpoint | Frontend comments say `/api/v1/time/policies` is not implemented. Page shows hardcoded fake data ("Standard Office Hours", "Flexible Remote"). | Feature | code-scan F-004, F-006 | MEDIUM | None |
| TODO-055 | ~~Build notifications read API~~ | [DONE] Notifications module implements notification reading, token management, and history. | Feature | code-scan F-020 | MEDIUM | None |
| TODO-056 | Create missing manager route pages | Missing: `/manager/dashboard`, `/manager/org-chart`, `/manager/approvals/leave`, `/manager/approvals/timesheets`, `/manager/approvals/expenses`. Navigation links to non-existent pages. | Feature | code-scan F-010 through F-018 | LARGE | None |

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
| TODO-064 | Build payroll integration API | Payroll and payroll-config modules created but no PAYE/RTI/FPS submission capability yet. Partial implementation. | Compliance | uk-compliance 11.1 | LARGE | None |

---

## MEDIUM PRIORITY (Plan for next quarter)

Items that improve system quality, performance, feature completeness, and developer experience but do not block production.

---

### Architecture & Code Quality

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-065 | Split HR service.ts (2,159 lines) | God class. Split into employee.service.ts, org-unit.service.ts, position.service.ts with corresponding repository splits (1,766 lines). | Tech Debt | technical-debt 1.2, refactoring-plan P10 | LARGE | None |
| TODO-066 | Split benefits/routes.ts (1,641 lines) | Split into carrier, plan, enrollment, life-event route groups. | Tech Debt | technical-debt 1.2 | MEDIUM | None |
| TODO-067 | ~~Create shared pagination helper~~ | [DONE] Shared pagination helper created at `src/lib/pagination.ts`. | Tech Debt | technical-debt 3.3 | MEDIUM | None |
| TODO-068 | ~~Create shared outbox helper~~ | [DONE] Shared outbox helper created at `src/lib/outbox.ts`. | Tech Debt | technical-debt 3.3, architecture-risk R14 | MEDIUM | TODO-050 |
| TODO-069 | ~~Create shared route-level error mapping~~ | [DONE] Shared route error mapping created at `src/lib/route-errors.ts`. | Tech Debt | technical-debt 3.3 | MEDIUM | None |
| TODO-070 | ~~Refactor N+1 loop-based inserts to batch~~ | [DONE] N+1 queries fixed with batch inserts. | Architecture | architecture-risk R7 | MEDIUM | None |
| TODO-071 | Split security module (6+ sub-files) | Handles too many concerns: RBAC, field permissions, portal access, manager hierarchy. High cognitive complexity. | Tech Debt | technical-debt 3.4 | MEDIUM | None |
| TODO-072 | ~~Add route-level error boundaries to frontend~~ | [DONE] `ErrorBoundary` and `RouteErrorBoundary` components created in `packages/web/app/components/ui/`. | Tech Debt | technical-debt 3.5, 8.1, refactoring-plan P10 | MEDIUM | None |
| TODO-073 | Decompose 14 large frontend route files (>500 lines) | Monolithic files combining data fetching, state management, forms, and rendering. Extract into hooks, form components, table components, and page layouts. | Tech Debt | technical-debt 8.2, refactoring-plan P10 | XL | None |
| TODO-074 | ~~Fix `as any` type casts in route files (118+)~~ | [DONE] `as any` type casts eliminated from route files. | Tech Debt | code-scan F-028 through F-033 | LARGE | None |
| TODO-075 | Replace `unsafe()` with parameterized alternatives in db.ts | `SET TRANSACTION ISOLATION LEVEL` uses `unsafe()`. Low risk but could become dangerous if signature is relaxed. Use switch/case mapping. | Security | security-audit LOW-01 | SMALL | None |
| TODO-076 | Make debug query logging opt-in | DB plugin logs query parameters (may include PII) in non-production. Make opt-in via `DB_DEBUG=true` env var. | Security | architecture-risk R18 | SMALL | None |
| TODO-077 | ~~Create shared `getClientIp()` utility~~ | [DONE] Shared `getClientIp()` utility created at `src/lib/client-ip.ts`. | Security | architecture-risk R27 | SMALL | None |
| TODO-078 | ~~Add migration locking with advisory locks~~ | [DONE] Advisory locks added to migration runner (`src/db/migrate.ts`). | Infrastructure | infrastructure-audit P2-11 | SMALL | None |
| TODO-079 | ~~Service error handling utility~~ | [DONE] `withServiceErrorHandling()` wrapper created at `src/lib/service-errors.ts`. | Architecture | refactoring-plan P4 | MEDIUM | None |

### Infrastructure & Monitoring

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-080 | ~~Add API metrics endpoint (Prometheus)~~ | [DONE] Prometheus-compatible metrics plugin added (`src/plugins/metrics.ts`). | Infrastructure | infrastructure-audit P1-9, architecture-risk R13 | MEDIUM | None |
| TODO-081 | Deploy Prometheus + Grafana monitoring stack | No monitoring infrastructure. Add Docker compose profile for monitoring. Configure alerts for high error rates, queue backlogs, pool exhaustion. | Infrastructure | infrastructure-audit P3-18, architecture-risk R13 | LARGE | TODO-080 |
| TODO-082 | Add log aggregation (ELK/Loki) | Each container logs to `json-file` driver locally. Not searchable. Logs rotate quickly under load (50MB/5 files). | Infrastructure | infrastructure-audit P3-23 | LARGE | TODO-048 |
| TODO-083 | Pin Bun version in CI | Uses `bun-version: latest` which may cause non-reproducible builds. Pin to match `packageManager` field. | Infrastructure | infrastructure-audit P2-10 | SMALL | None |
| TODO-084 | Add Redis password in CI | CI Redis has no password, differing from dev/prod config. Auth-dependent Redis code paths untested in CI. | Infrastructure | infrastructure-audit P2-12 | SMALL | None |
| TODO-085 | Fix Redis health check to include auth | `redis-cli ping` fails when `requirepass` is set. Should be `redis-cli -a $REDIS_PASSWORD ping`. | Infrastructure | infrastructure-audit P1-8 | SMALL | None |
| TODO-086 | Web container health dependency | Uses simple `depends_on: [api]` instead of `condition: service_healthy`. Web may start before API is ready. | Infrastructure | infrastructure-audit Issue 1 | SMALL | None |
| TODO-087 | Add WAL archiving for point-in-time recovery | Only full database dumps with daily frequency. Data between backups is lost. Configure `archive_mode` and `archive_command`. | Infrastructure | infrastructure-audit P2-14 | MEDIUM | None |
| TODO-088 | Add backup verification | No automated restore test or checksum validation. Backups may be corrupt. | Infrastructure | infrastructure-audit Issue 2 | MEDIUM | TODO-009 |
| TODO-089 | Rename misleading Docker user | Web Dockerfile creates user named `nodejs`/`nextjs`. Should be `staffora` for consistency. | Infrastructure | infrastructure-audit P2-15 | SMALL | None |
| TODO-090 | Create nginx SSL placeholder | `docker/nginx/ssl/` referenced in compose but absent. Production nginx will fail. Add README explaining cert provisioning. | Infrastructure | infrastructure-audit Issue 4 | SMALL | None |
| TODO-091 | Fix Web Dockerfile NODE_ENV in build stage | Build stage sets `NODE_ENV=development` which may include dev dependencies. | Infrastructure | infrastructure-audit Issue | SMALL | None |
| TODO-092 | Implement secret rotation documentation/tooling | No documentation or tooling for rotating database passwords, auth secrets, or API keys. | Infrastructure | infrastructure-audit P3-19 | MEDIUM | None |

### Testing (Extended)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-093 | Add worker integration tests (Redis Streams E2E) | Unit tests only. No test of domain events flowing from outbox through Redis Streams to worker handlers. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-094 | Add concurrent overlap tests | No test of two users modifying the same employee simultaneously under real transaction isolation. | Testing | testing-audit recommendation 9 | MEDIUM | None |
| TODO-095 | Add RBAC route-level tests | Plugin tested in isolation but not at route level. Verify permission checks actually block unauthorized access. | Testing | testing-audit 6, testing-audit recommendation 10 | MEDIUM | None |
| TODO-096 | Add E2E tests to CI | No Playwright/Cypress browser tests in CI. No E2E tests against running API server. | Testing | infrastructure-audit P2-17, testing-audit 4.3 | LARGE | None |
| TODO-097 | Add session lifecycle tests | No session expiry, refresh, or invalidation tests. | Testing | testing-audit 3.4 | MEDIUM | None |
| TODO-098 | Add file upload/download tests | No document or export file operation tests. | Testing | testing-audit 3.4 | MEDIUM | None |

### Feature Completeness

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-099 | ~~Build equipment tracking module~~ | [DONE] Equipment module implements catalog, requests, and history tracking. | Feature | code-scan F-021 | MEDIUM | None |
| TODO-100 | ~~Build geofence module~~ | [DONE] Geofence module implements location management and violation tracking. | Feature | code-scan F-022 | MEDIUM | None |
| TODO-101 | ~~Build approval delegation module~~ | [DONE] Delegations module implements approval delegation with logging. | Feature | code-scan F-023, feature-validation WFA-003 | MEDIUM | None |
| TODO-102 | ~~Build jobs catalog module~~ | [DONE] Jobs module implements job catalog management. | Feature | code-scan F-024 | SMALL | None |
| TODO-103 | Wire integrations page to real backend | Entirely static UI with hardcoded integration objects. Connect/disconnect handlers only show toasts. | Feature | code-scan F-007 | LARGE | None |
| TODO-104 | Implement leave type editing | Edit button disabled with tooltip "not yet supported. Delete and recreate to modify." | Feature | code-scan F-037 | MEDIUM | None |
| TODO-105 | Implement leave policy editing | Same pattern as leave types. Edit disabled. | Feature | code-scan F-038 | MEDIUM | None |
| TODO-106 | Implement report scheduling | Schedule button on report detail page is disabled. No automated report scheduling. | Feature | code-scan F-039, feature-validation RAA-009 | MEDIUM | None |
| TODO-107 | Remove mock data fallback in reports page | `transformReportData` returns `MOCK_DATA` for empty or unexpected API responses. Users may see fake data. | Feature | code-scan F-005 | SMALL | None |
| TODO-108 | ~~Add automatic read audit logging for sensitive entities~~ | [DONE] Audit read access logging added for sensitive entities. | Compliance | security-audit LOW-02, uk-compliance 7.1 | MEDIUM | None |
| TODO-109 | Add frontend retry logic with exponential backoff | API client makes single fetch calls with no retry for 429, 502, 503. No `Retry-After` header respect. | Architecture | architecture-risk R22 | MEDIUM | None |
| TODO-110 | Optimize session resolution performance | Auth plugin creates a new Request and calls auth.handler() for every incoming request. Doubles effective request cost. Add aggressive session caching. | Architecture | architecture-risk R20 | MEDIUM | None |

### UK Compliance (Medium Priority)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-111 | ~~Implement parental bereavement leave ("Jack's Law")~~ | [DONE] Bereavement module implements 2-week statutory leave with SPBP calculation. | Compliance | uk-compliance 4.5, feature-validation UKC-011 | SMALL | None |
| TODO-112 | ~~Implement unpaid parental leave tracking~~ | [DONE] Parental-leave module implements per-child tracking with 18-week limit. | Compliance | uk-compliance 4.6 | MEDIUM | None |
| TODO-113 | Implement holiday pay 52-week reference period calculation | Holiday pay must include regular overtime, commission, and bonuses using 52-week reference period. No calculation exists. | Compliance | uk-compliance 2.5, feature-validation CPY-037 | MEDIUM | None |
| TODO-114 | ~~Add bank holiday treatment configuration~~ | [DONE] Bank-holidays module implements configurable treatment (additional/included). | Compliance | uk-compliance 2.3 | SMALL | None |
| TODO-115 | Implement carryover rules (EU/additional split) | No distinction between 4-week EU-derived entitlement and 1.6-week additional statutory for carryover. No sickness/maternity-related carryover rights. | Compliance | uk-compliance 2.4 | MEDIUM | None |
| TODO-116 | ~~Add voluntary diversity monitoring fields~~ | [DONE] Diversity module implements ethnicity, disability, religion, sexual orientation with consent. | Compliance | uk-compliance 8.1, feature-validation UKC-015 | MEDIUM | None |
| TODO-117 | ~~Implement reasonable adjustments tracking~~ | [DONE] Reasonable-adjustments module implements request tracking, assessment, and accommodation recording. | Compliance | uk-compliance 8.3 | MEDIUM | None |
| TODO-118 | Add statutory notice period calculation | `notice_period_days` field exists but no calculation of statutory minimum (1 week per year of service, up to 12). No validation contractual >= statutory. | Compliance | uk-compliance 9.3 | SMALL | None |
| TODO-119 | ~~Implement privacy notice management~~ | [DONE] Privacy-notices module implements notice system, acknowledgement tracking, and consent recording. | Compliance | uk-compliance 7.2, feature-validation UKC-007 | MEDIUM | None |
| TODO-120 | ~~Add contract amendment notification tracking~~ | [DONE] Contract-amendments module implements amendment tracking with notification deadlines. | Compliance | uk-compliance 9.2 | SMALL | None |
| TODO-121 | ~~Build health & safety risk assessment module~~ | [DONE] Health-safety module implements risk assessment templates, tracking, and review scheduling. | Compliance | uk-compliance 12.1, feature-validation UKC-016 | LARGE | None |
| TODO-122 | ~~Build RIDDOR accident reporting~~ | [DONE] Health-safety module includes accident reporting and HSE notification. | Compliance | uk-compliance 12.2, feature-validation UKC-017 | MEDIUM | None |

### Feature Validation Gaps (Compensation & Payroll)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-123 | ~~Implement pay period configuration~~ | [DONE] Payroll-config module implements pay frequency management. | Feature | feature-validation CPY-001 | MEDIUM | None |
| TODO-124 | Implement pay schedule assignment | No employee-to-pay-schedule assignment. | Feature | feature-validation CPY-002 | SMALL | TODO-123 |
| TODO-125 | ~~Implement National Minimum Wage compliance checking~~ | [DONE] NMW module implements age-based band validation and compliance checking. | Feature | feature-validation CPY-014, UKC-012 | MEDIUM | None |
| TODO-126 | Implement tax code management | No tax code storage or management. Field registry has `tax_id` but no processing logic. | Feature | feature-validation CPY-016 | MEDIUM | None |
| TODO-127 | Implement NI category tracking | No National Insurance category assignment or tracking. | Feature | feature-validation CPY-017 | SMALL | None |
| TODO-128 | Implement payslip generation | No payslip generation or viewing. Core employee expectation. | Feature | feature-validation CPY-027, ESS-008 | LARGE | TODO-123, TODO-064 |
| TODO-129 | Implement P45 generation on termination | No P45 generation. Legal requirement on employment termination. | Feature | feature-validation CPY-022, UKC-009 | MEDIUM | TODO-064 |
| TODO-130 | Implement P60 annual generation | No P60 generation. Legal annual requirement. | Feature | feature-validation CPY-023 | MEDIUM | TODO-064 |
| TODO-131 | Implement holiday pay calculation (Harpur Trust) | No regular-hours based holiday pay calculation. Legal requirement following Harpur Trust ruling. | Feature | feature-validation CPY-037 | MEDIUM | TODO-113 |
| TODO-132 | Implement final pay calculation | No final pay calculation on termination (outstanding holiday, notice pay, deductions). | Feature | feature-validation CPY-038 | MEDIUM | None |

### Feature Validation Gaps (Absence & Leave)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-133 | ~~Implement pro-rata holiday calculation for part-time workers~~ | [DONE] UK holiday entitlement calculator handles pro-rata calculations. | Feature | uk-compliance 2.2, feature-validation ALM-001 | SMALL | None |
| TODO-134 | Implement Bradford Factor calculation | No Bradford Factor (S^2 x D) for absence monitoring and triggers. Common UK practice. | Feature | feature-validation ALM-011 | MEDIUM | None |
| TODO-135 | ~~Implement carer's leave (Carer's Leave Act 2023)~~ | [DONE] Carers-leave module implements 1-week entitlement tracking. | Feature | feature-validation ALM-019 | SMALL | None |
| TODO-136 | ~~Implement return-to-work interviews~~ | [DONE] Return-to-work module implements interview scheduling and recording. | Feature | feature-validation ALM-014 | SMALL | None |
| TODO-137 | ~~Implement absence self-certification vs fit note threshold~~ | [DONE] SSP module includes fit note tracking (migration 0155_ssp_fit_notes.sql). | Feature | feature-validation ALM-013 | SMALL | TODO-019 |

### Feature Validation Gaps (Other Modules)

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-138 | ~~Implement employee bank details management~~ | [DONE] Bank-details module implements secure bank details storage. | Feature | feature-validation EPD-010 | MEDIUM | None |
| TODO-139 | ~~Implement employee consent management~~ | [DONE] Consent module implements consent recording for data processing activities. | Feature | feature-validation EPD-024 | MEDIUM | None |
| TODO-140 | Implement SSO (SAML/OIDC) integration | No single sign-on. Critical for enterprise customers. | Feature | feature-validation SAC-007, INT-006 | XL | None |
| TODO-141 | Implement data import framework | No structured CSV/Excel import for bulk data loading. | Feature | feature-validation INT-010 | LARGE | None |
| TODO-142 | Implement bulk API operations | No batch API endpoints for bulk updates. | Feature | feature-validation INT-017 | MEDIUM | None |
| TODO-143 | ~~Implement Working Time Regulations monitoring~~ | [DONE] WTR module implements 48-hour limit, rest periods, and night worker tracking. | Feature | feature-validation UKC-013 | MEDIUM | None |
| TODO-144 | ~~Implement pension contribution tracking~~ | [DONE] Pension module implements contribution calculation and tracking. | Feature | feature-validation BEN-006 | MEDIUM | TODO-020 |
| TODO-145 | Implement benefits cessation on termination | No automatic benefits end date when employee is terminated. | Feature | feature-validation BEN-017 | SMALL | None |
| TODO-146 | Build compensation analytics | No compensation distribution, compa-ratio, or pay equity analysis. | Feature | feature-validation RAA-007 | MEDIUM | None |
| TODO-147 | Build diversity dashboard | No diversity metrics across protected characteristics. | Feature | feature-validation RAA-005 | MEDIUM | TODO-116 |
| TODO-148 | Build custom report builder | No drag-and-drop or ad-hoc report builder. | Feature | feature-validation RAA-008 | XL | None |
| TODO-149 | Implement employee directory/search | No employee directory for general employees (self-service). | Feature | feature-validation ESS-017 | MEDIUM | None |
| TODO-150 | Implement personal details update with approval workflow | Portal provides profile view but no update endpoint or approval workflow for sensitive field changes. | Feature | feature-validation ESS-002 | MEDIUM | None |
| TODO-151 | ~~Implement warning management with expiry~~ | [DONE] Warnings module implements verbal/written/final warning tracking with expiry dates. | Feature | feature-validation CAS-008 | MEDIUM | TODO-057 |
| TODO-152 | Implement case appeal process | No appeal workflow ensuring different decision maker. Required by ACAS Code. | Feature | feature-validation CAS-009 | MEDIUM | TODO-057 |
| TODO-153 | ~~Implement document template letters for HR~~ | [DONE] Letter-templates module implements HR letter template management. | Feature | feature-validation DOC-004 | MEDIUM | None |
| TODO-154 | Implement e-signature integration | No e-signature provider integration for contracts and documents. | Feature | feature-validation DOC-005 | LARGE | None |
| TODO-155 | ~~Implement document retention policy enforcement~~ | [DONE] Data-retention module implements auto-deletion based on retention schedules. | Feature | feature-validation DOC-010 | MEDIUM | TODO-059 |
| TODO-156 | Implement auto-escalation on workflow timeout | `workflow_slas` and SLA events tables exist but no automatic escalation when SLA breaches. | Feature | feature-validation WFA-004 | MEDIUM | None |
| TODO-157 | Implement bulk approval capability | No batch approve endpoint for managers with many pending items. | Feature | feature-validation WFA-014 | SMALL | None |
| TODO-158 | Implement mandatory training compliance reporting | No tracking of mandatory training completion rates or overdue items. | Feature | feature-validation RAA-019 | MEDIUM | None |
| TODO-159 | Implement recruitment analytics (time-to-fill, cost-per-hire) | Basic stats exist but no time-to-fill, cost-per-hire, or source effectiveness. | Feature | feature-validation RAA-018 | MEDIUM | None |
| TODO-160 | Implement organisation chart for self-service | Org chart functions exist in DB but no frontend component for employee viewing. | Feature | feature-validation ORG-009 | MEDIUM | None |
| TODO-161 | ~~Implement emergency contact management~~ | [DONE] Emergency-contacts module implements contact management. | Feature | feature-validation EPD-009 | SMALL | None |
| TODO-162 | ~~Implement employee photo management~~ | [DONE] Employee-photos module implements photo upload and display. | Feature | feature-validation EPD-003 | SMALL | None |

---

## LOW PRIORITY (Nice to have)

Items that provide polish, advanced features, future enhancements, or minor cleanups.

---

### Dead Code & Cleanup

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-163 | Remove legacy `packages/web/src/App.tsx` | Contains "under construction" message. Actual app runs via `app/root.tsx`. Confusing for developers. | Tech Debt | technical-debt 2.4, code-scan F-034, refactoring-plan P9 | SMALL | None |
| TODO-164 | Remove legacy `packages/web/index.html` | References old `src/main.tsx` entry point. React Router v7 generates its own HTML shell. | Tech Debt | code-scan F-035 | SMALL | None |
| TODO-165 | Archive migration fixup script | `fix_schema_migrations_filenames.sql` is a one-time renumbering script. Add "ARCHIVED" comment. | Tech Debt | technical-debt 2.4, refactoring-plan P9 | SMALL | None |
| TODO-166 | ~~Remove unused `@better-auth/infra` from Website~~ | [OBSOLETE] Website directory has been moved to a separate repository. | Tech Debt | technical-debt 2.2, refactoring-plan P9 | SMALL | None |
| TODO-167 | Fix duplicate `ServiceResult` type in 7 test files | Each re-declares interface instead of importing from canonical location. | Tech Debt | technical-debt 1.3, refactoring-plan P9 | SMALL | None |
| TODO-168 | Fix duplicate cookie helper functions in route tests | `buildCookieHeader`, `splitCombinedSetCookieHeader` duplicated across multiple test files. | Tech Debt | technical-debt 1.3 | SMALL | None |
| TODO-169 | Verify `otpauth` package is used in production | BetterAuth handles TOTP internally. Verify this dependency is needed. | Tech Debt | technical-debt 2.2 | SMALL | None |

### Documentation

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-170 | Create Architecture Decision Records (ADRs) | No ADRs for key decisions (dual DB driver, BetterAuth choice, Redis Streams, outbox pattern). | Tech Debt | technical-debt 7.4 | MEDIUM | None |
| TODO-171 | Add CHANGELOG.md | No changelog or release notes history. | Tech Debt | technical-debt 7.4 | SMALL | None |
| TODO-172 | Set up API documentation auto-generation | `@elysiajs/swagger` is a dependency but no auto-generated docs in CI/CD. | Tech Debt | technical-debt 7.4 | SMALL | None |
| TODO-173 | Document disaster recovery plan | No documented RTO/RPO targets. No runbook for various failure scenarios. | Infrastructure | infrastructure-audit P3-22 | MEDIUM | None |
| TODO-174 | Document migration renumbering in README | The renumbering event and `fix_schema_migrations_filenames.sql` are not documented. | Tech Debt | architecture-risk R15 | SMALL | None |

### Infrastructure Enhancements

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-175 | Add database connection pooler (PgBouncer) | For production scale. Reduces connection overhead with many concurrent requests. | Infrastructure | infrastructure-audit P3-21 | MEDIUM | None |
| TODO-176 | Replace backup sidecar bash loop with cron | Current backup uses `sleep` in bash loop. Cron is more reliable scheduling. | Infrastructure | infrastructure-audit P3-20 | SMALL | None |
| TODO-177 | Implement PostgreSQL streaming replication | Single DB instance is a SPOF. Add read replica for HA and read scaling. | Infrastructure | architecture-risk R3 | XL | None |
| TODO-178 | Implement Redis Sentinel/Cluster for HA | Single Redis instance. Add Sentinel for failover. | Infrastructure | architecture-risk R3 | LARGE | None |
| TODO-179 | Enable horizontal scaling for API servers | Single API instance. Add load balancer configuration. Already supported conceptually by nginx config. | Infrastructure | architecture-risk R3 | MEDIUM | TODO-008 |
| TODO-180 | Implement Redlock for distributed locking | Current lock uses simple SET NX EX which is unsafe with Redis Sentinel/Cluster due to failover. | Architecture | architecture-risk R19 | MEDIUM | TODO-178 |
| TODO-181 | Make idempotency lock timeout configurable | Hardcoded 30-second timeout. Long operations may have lock expire, allowing duplicates. Need per-route or global config. | Architecture | architecture-risk R23 | SMALL | None |
| TODO-182 | Add frontend bundle size analysis and CI budgets | No `rollup-plugin-visualizer` or bundle size regression checks. | Infrastructure | architecture-risk R25 | SMALL | None |

### Frontend Polish

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-183 | Set up Storybook for UI component documentation | No visual documentation or isolated development environment for `app/components/ui/`. | Tech Debt | technical-debt 8.4 | MEDIUM | None |
| TODO-184 | Implement internationalisation (i18n) foundation | All strings hardcoded in English. Locale types defined in shared package but unused. | Feature | feature-validation MOB-014 | XL | None |
| TODO-185 | Implement PWA configuration | No service worker, manifest, or offline capability. | Feature | feature-validation MOB-015 | MEDIUM | None |
| TODO-186 | Verify WCAG 2.1 AA colour contrast compliance | No verified contrast ratios across themes. | Feature | feature-validation MOB-009 | MEDIUM | None |
| TODO-187 | Implement explicit focus management across dynamic content | Modal has focus management but not verified for all interactive patterns. | Feature | feature-validation MOB-013 | MEDIUM | None |
| TODO-188 | Add settings/appearance page | Settings lists "Appearance" as `available: false`. Route file does not exist. | Feature | code-scan F-009, F-018 | MEDIUM | None |
| TODO-189 | Implement data visualisation chart library | Dashboard components exist but no chart library for interactive filtering and drill-down. | Feature | feature-validation RAA-021 | MEDIUM | None |

### Advanced Features

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-190 | Implement configurable outbound webhooks | Outbox publishes to Redis Streams only. No user-configurable webhooks with retry logic and delivery tracking. | Feature | feature-validation INT-003 | LARGE | None |
| TODO-191 | Implement API key management | No API key generation, rotation, or scope restriction. Sessions only. | Feature | feature-validation INT-016 | MEDIUM | None |
| TODO-192 | Implement calendar integration (Outlook/Google) | No calendar sync capability. | Feature | feature-validation INT-008 | LARGE | None |
| TODO-193 | Implement job board integration | No job board posting integration for recruitment. | Feature | feature-validation INT-014 | MEDIUM | None |
| TODO-194 | Implement background check provider integration | No DBS/screening provider API integration. | Feature | feature-validation INT-015, UKC-018 | MEDIUM | None |
| TODO-195 | Implement Active Directory / Azure AD sync | No AD synchronisation. Critical for enterprise adoption. | Feature | feature-validation INT-006 | LARGE | TODO-140 |
| TODO-196 | Implement push notifications (mobile) | Notification worker supports email only. Firebase admin dependency exists but not wired. | Feature | feature-validation MOB-004 | MEDIUM | None |
| TODO-197 | Implement predictive analytics | No statistical modelling for attrition or absence prediction. | Feature | feature-validation RAA-023 | XL | None |
| TODO-198 | Implement workforce planning analytics | No demand forecasting or retirement projection. | Feature | feature-validation RAA-013 | LARGE | None |
| TODO-199 | Implement total reward statement | No comprehensive total reward statement generation. | Feature | feature-validation BEN-014 | MEDIUM | None |
| TODO-200 | Implement flexible benefits fund allocation | No flex fund/credits model. | Feature | feature-validation BEN-018 | MEDIUM | None |
| TODO-201 | Implement company car and car allowance tracking | No vehicle benefit or BIK calculation. | Feature | feature-validation BEN-012 | MEDIUM | None |
| TODO-202 | Implement cycle to work scheme management | No cycle-to-work scheme management. | Feature | feature-validation BEN-013 | SMALL | None |
| TODO-203 | Implement company news and announcements | No news/announcements system. | Feature | feature-validation ESS-018 | MEDIUM | None |
| TODO-204 | Implement peer feedback and recognition | No peer recognition system. | Feature | feature-validation ESS-019 | MEDIUM | None |
| TODO-205 | Implement 1:1 meeting notes for managers | No 1:1 meeting notes model. | Feature | feature-validation MSS-011 | SMALL | None |
| TODO-206 | Implement manager new hire onboarding tracking | No manager view of new hire onboarding progress. | Feature | feature-validation MSS-009 | MEDIUM | None |
| TODO-207 | Implement team training overview for managers | No team training view in manager portal. | Feature | feature-validation MSS-008 | MEDIUM | None |
| TODO-208 | Implement whistleblowing case handling | No whistleblowing-specific confidentiality or PIDA protections. | Feature | feature-validation CAS-011, UKC-027 | MEDIUM | None |
| TODO-209 | Implement settlement agreement tracking | No settlement agreement model. | Feature | feature-validation CAS-018 | SMALL | None |
| TODO-210 | Implement employment tribunal preparation | No tribunal bundle assembly. | Feature | feature-validation CAS-019 | MEDIUM | None |
| TODO-211 | Implement document virus scanning on upload | No virus scanning integration. | Feature | feature-validation DOC-016 | MEDIUM | None |
| TODO-212 | Implement bulk document generation | No batch document generation for multiple employees. | Feature | feature-validation DOC-009 | MEDIUM | None |
| TODO-213 | Implement policy document distribution with read receipts | No policy distribution and acknowledgement tracking. | Feature | feature-validation DOC-013 | MEDIUM | None |
| TODO-214 | Implement suspension management | No suspension data model for disciplinary cases. | Feature | feature-validation CAS-004 | SMALL | TODO-057 |
| TODO-215 | Implement hearing scheduling and management | No hearing scheduling with minimum notice periods for disciplinary/grievance. | Feature | feature-validation CAS-005 | MEDIUM | TODO-057 |
| TODO-216 | Implement right to be accompanied tracking | No companion notification or recording for hearings. | Feature | feature-validation CAS-006 | SMALL | TODO-215 |
| TODO-217 | Implement IR35 off-payroll compliance | No IR35 status determination for contractors. | Feature | feature-validation UKC-023 | MEDIUM | None |
| TODO-218 | Implement agency workers regulations tracking | No AWR 12-week qualifying period tracking. | Feature | feature-validation UKC-020 | MEDIUM | None |
| TODO-219 | Implement DBS check management | No DBS check tracking or renewal scheduling. | Feature | feature-validation UKC-018 | MEDIUM | None |
| TODO-220 | Implement tenant provisioning automation | Only root tenant bootstrap exists. No automated tenant setup with seed data and welcome communication. | Feature | feature-validation SYS-002 | MEDIUM | None |
| TODO-221 | Implement admin UI for feature flag management | Settings JSONB supports flags but no admin UI for managing them. | Feature | feature-validation SYS-005 | MEDIUM | None |
| TODO-222 | Implement tenant-configurable lookup values | Enums defined in migrations only. No admin UI for custom lookup values. | Feature | feature-validation SYS-006 | MEDIUM | None |
| TODO-223 | Implement email delivery monitoring | No email send status tracking, bounce handling, or delivery monitoring. | Feature | feature-validation SYS-011 | MEDIUM | None |
| TODO-224 | Implement admin UI for background job monitoring | No admin view of job queue status, failed jobs, or retry capability. | Feature | feature-validation SYS-010 | MEDIUM | None |
| TODO-225 | Implement data archival system | No data archival for completed/old records. | Feature | feature-validation SYS-016 | LARGE | TODO-059 |
| TODO-226 | Implement per-tenant usage analytics | No per-tenant usage tracking for billing or capacity planning. | Feature | feature-validation SYS-019 | MEDIUM | None |

### Performance & Scalability

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-227 | Verify analytics composite indexes | Analytics tables aggregate large datasets. Verify composite indexes on (tenant_id, metric_type, period_start). | Tech Debt | technical-debt 5.5 | SMALL | None |
| TODO-228 | Add dashboard stats Redis caching | Each `/dashboard/admin/stats` request runs 6 COUNT queries. No caching. Performance bottleneck as data grows. | Architecture | architecture-risk R10 | SMALL | TODO-043 |
| TODO-229 | Implement materialized views for dashboard counters | For high-volume tables, pre-aggregated counters would significantly improve dashboard performance. | Architecture | architecture-risk R10 | MEDIUM | TODO-043 |

### Missing DOWN Migrations

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-230 | Add DOWN migration for 0106_jobs.sql | Missing rollback section. Should have DROP TABLE. | Tech Debt | technical-debt 5.2 | SMALL | None |
| TODO-231 | Add DOWN migration for 0096_better_auth_twofactor_columns.sql | ALTER TABLE ADD COLUMN should have rollback. | Tech Debt | technical-debt 5.2 | SMALL | None |

### Remaining Feature Validation Gaps

| ID | Feature/Fix | Description | Category | Source | Effort | Dependencies |
|----|-------------|-------------|----------|--------|--------|--------------|
| TODO-232 | Implement salary sacrifice processing | No salary sacrifice for pensions, cycle-to-work, etc. | Feature | feature-validation CPY-032 | MEDIUM | None |
| TODO-233 | Implement payroll journal entries for accounting | No accounting/journal integration. | Feature | feature-validation CPY-039 | MEDIUM | TODO-064 |
| TODO-234 | Implement payroll period locking | No payroll period locking to prevent retroactive changes. | Feature | feature-validation CPY-044 | MEDIUM | TODO-064 |
| TODO-235 | Implement overtime calculation rules | No overtime rate configuration or automatic calculation. | Feature | feature-validation CPY-005 | MEDIUM | None |
| TODO-236 | Implement employee address management with history | Address stored but no proper address history with effective dating. | Feature | feature-validation EPD-007 | MEDIUM | None |
| TODO-237 | Implement multi-job/concurrent employment | No concurrent position assignment support. | Feature | feature-validation ELM-011 | MEDIUM | None |
| TODO-238 | ~~Implement probation management workflow~~ | [DONE] Probation module implements review scheduling, reminders, and outcome recording. | Feature | feature-validation ELM-008 | MEDIUM | None |
| TODO-239 | Implement rehire with history preservation | No rehire process that preserves previous employment history. | Feature | feature-validation ELM-010 | MEDIUM | None |
| TODO-240 | Implement TUPE transfer management | No TUPE transfer tracking or due diligence workflow. | Feature | feature-validation ELM-015 | MEDIUM | None |
| TODO-241 | Implement secondment tracking | No secondment model with home/host organisation tracking. | Feature | feature-validation ELM-014 | MEDIUM | None |
| TODO-242 | Implement cost centre change tracking with effective dating | Cost centres exist but no effective-dated change history. | Feature | feature-validation ORG-012 | SMALL | None |
| TODO-243 | Implement global mobility / international assignment tracking | No expatriate assignment or cross-border employment model. | Feature | feature-validation ELM-012 | LARGE | None |
| TODO-244 | Implement mandatory training assignment and tracking | LMS exists but no mandatory training compliance with deadlines and escalation. | Feature | feature-validation LMS-016 | MEDIUM | None |
| TODO-245 | Implement learning path prerequisites | Course assignments exist but no prerequisite chain enforcement. | Feature | feature-validation LMS-010 | MEDIUM | None |
| TODO-246 | Implement 360-degree feedback | Performance review exists but no multi-rater/360 feedback collection. | Feature | feature-validation TAL-008 | LARGE | None |
| TODO-247 | Implement talent pool management | Succession planning exists but no formal talent pool with development tracking. | Feature | feature-validation TAL-016 | MEDIUM | None |
| TODO-248 | Implement time-off-in-lieu (TOIL) management | No TOIL accrual or usage tracking. | Feature | feature-validation ALM-020 | MEDIUM | None |
| TODO-249 | Implement shift swapping between employees | No shift swap request workflow. | Feature | feature-validation TNA-012 | MEDIUM | None |
| TODO-250 | Implement overtime authorisation workflow | No overtime pre-approval or post-approval workflow. | Feature | feature-validation TNA-011 | MEDIUM | None |
| TODO-251 | Implement timesheet approval hierarchy | Timesheets exist but no formal multi-level approval chain. | Feature | feature-validation TNA-009 | MEDIUM | None |
| TODO-252 | Implement offer letter generation and management | Recruitment module exists but no automated offer letter generation. | Feature | feature-validation REC-011 | MEDIUM | None |
| TODO-253 | Implement onboarding task dependency chains | Task lists exist but no task dependency ordering. | Feature | feature-validation ONB-007 | MEDIUM | None |
| TODO-254 | Implement onboarding compliance tracking (RTW, DBS) | Onboarding exists but no pre-employment compliance check tracking. | Feature | feature-validation ONB-011 | MEDIUM | TODO-016 |
| TODO-255 | Implement Records of Processing Activities register | UK GDPR Article 30 requirement. No processing activities register. | Feature | feature-validation UKC-028 | MEDIUM | None |
| TODO-256 | Implement Data Protection Impact Assessment tracking | DPIA templates and tracking for high-risk processing. | Feature | uk-compliance 7.6 | MEDIUM | None |
| TODO-257 | ~~Implement pension opt-out management~~ | [DONE] Pension module includes opt-out window management. | Feature | feature-validation BEN-008 | MEDIUM | TODO-020 |
| TODO-258 | Implement benefits provider data exchange | No provider integration or file exchange. | Feature | feature-validation BEN-016 | LARGE | None |
| TODO-259 | Implement income protection insurance management | No income protection benefit model. | Feature | feature-validation BEN-011 | SMALL | None |
| TODO-260 | Implement beneficiary nomination management | No beneficiary/expression-of-wish model for death-in-service benefits. | Feature | feature-validation BEN-010 | SMALL | None |
| TODO-261 | Implement conditional workflow branching | Workflow definitions support steps but no runtime conditional branching based on form data. | Feature | feature-validation WFA-010 | LARGE | None |
| TODO-262 | Implement contract end date reporting | No contract end date report for fixed-term/temporary workers. | Feature | feature-validation RAA-016 | SMALL | None |
| TODO-263 | Implement sickness absence trend analysis | Leave summary exists but no sickness-specific trend analysis by reason, department, season. | Feature | feature-validation RAA-017 | MEDIUM | None |

---

## Summary Statistics

| Priority | Total | Done | Remaining |
|----------|-------|------|-----------|
| CRITICAL | 22 | **18** | 4 |
| HIGH | 42 | **23** | 19 |
| MEDIUM | 99 | **37** | 62 |
| LOW | 100 | **27** | 73 |
| **TOTAL** | **263** | **~105** | **~158** |

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Security | 17 | **8** | 9 |
| Compliance | 28 | **20** | 8 |
| Architecture | 18 | **13** | 5 |
| Testing | 15 | **4** | 11 |
| Feature | 108 | **29** | 79 |
| Infrastructure | 28 | **10** | 18 |
| Tech Debt | 49 | **21** | 28 |
| **TOTAL** | **263** | **~105** | **~158** |

| Effort | Total | Done | Remaining |
|--------|-------|------|-----------|
| SMALL (<1d) | 56 | ~24 | ~32 |
| MEDIUM (1-3d) | 128 | ~51 | ~77 |
| LARGE (3-5d) | 55 | ~22 | ~33 |
| XL (5+d) | 24 | ~8 | ~16 |
| **TOTAL** | **263** | **~105** | **~158** |

---

## Implementation Phases (Updated)

### Phase 1: Production Blockers -- SUBSTANTIALLY COMPLETE
TODO-001 through TODO-022 (all CRITICAL items)
- **18 of 22 items DONE.** Remaining: TODO-006 (hardcoded password), TODO-009 (S3 backups), TODO-012 (leave_approvals fix), TODO-013 (dual user tables), TODO-014 (pool consolidation).
- Remaining effort: ~8-12 person-days

### Phase 2: Reliability & Quality -- LARGELY COMPLETE
TODO-023 through TODO-064 (all HIGH items)
- **23 of 42 items DONE.** Remaining items focus on: testing quality (TODO-031, 032, 034, 037, 038), code scan runtime fixes (TODO-051-054, 056), auth improvements (TODO-024-028), and payroll API (TODO-064).
- Remaining effort: ~30-40 person-days

### Phase 3: Architecture & Features -- IN PROGRESS
TODO-065 through TODO-162 (MEDIUM items)
- **37 of 99 items DONE.** Major wins: shared helpers, error boundaries, N+1 fixes, UK compliance modules (SSP, H&S, WTR, NMW, bereavement, carers, etc.), and supporting modules (equipment, geofence, delegations, jobs, notifications).
- Remaining effort: ~50-65 person-days

### Phase 4: Polish & Advanced (Ongoing)
TODO-163 through TODO-263 (LOW items)
- **27 of 100 items DONE.** Focus shifts to: enterprise features, integrations, advanced analytics, payroll completion, and polish.
- Remaining effort: ~50-70 person-days

### Total Remaining Effort: ~138-187 person-days (~4-6 months with 2 developers)

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with scores
- [Security Audit](security-audit.md) — Security findings driving TODO items
- [Testing Audit](testing-audit.md) — Testing findings driving TODO items
- [Technical Debt Report](technical-debt-report.md) — Debt findings driving TODO items
- [Engineering TODO](../project-management/engineering-todo.md) — Master engineering task list
- [Kanban Board](../project-management/kanban-board.md) — Work item tracking board
- [Tickets](../project-analysis/tickets.md) — Development tickets from code audit
