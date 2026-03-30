# Staffora HRIS — Development Tickets

*Last updated: 2026-03-28*

**Generated:** 2026-03-15 (Code-Verified Audit)
**Total Tickets:** 42 actionable tickets across 6 phases

---

## Phase 16: Immediate Quick Wins (1-2 days each)

### TICKET-001: Fix better-auth version mismatch
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Dependencies
- **Problem:** API uses `better-auth@^1.5.4`, web uses `^1.4.10` — potential auth behavior inconsistency
- **Action:** Align both packages to same better-auth version in `package.json`
- **Files:** `packages/api/package.json`, `packages/web/package.json`
- **Acceptance:** Both packages use identical better-auth version; `bun install` succeeds; auth flow works E2E

### TICKET-002: Fix vitest/coverage-v8 version mismatch
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Dependencies
- **Problem:** `vitest@^2.1.8` paired with `@vitest/coverage-v8@^4.1.0` — major version mismatch breaks coverage
- **Action:** Align coverage-v8 to match vitest major version
- **Files:** `packages/web/package.json`, `packages/api/package.json`
- **Acceptance:** `bun test --coverage` runs without errors

### TICKET-003: Wire tenant settings to real backend
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Frontend
- **Problem:** Tenant settings page returns hardcoded mock data; backend endpoint exists but is unused
- **Action:** Replace mock data with React Query hook calling `GET /api/v1/tenant/settings`
- **Files:** `packages/web/app/routes/(admin)/settings/`
- **Acceptance:** Settings page loads real data from API; save persists to database

### TICKET-004: Wire notification settings to persist
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Frontend
- **Problem:** Notification preference save is simulated, never persists
- **Action:** Connect to `PUT /api/v1/notifications/preferences` endpoint
- **Files:** `packages/web/app/routes/(admin)/settings/`, notification hooks
- **Acceptance:** Notification preferences survive page reload

### TICKET-005: Wire time policies to real backend
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Frontend
- **Problem:** Time policies page shows hardcoded fake data
- **Action:** Replace with React Query hook calling time module endpoints
- **Files:** `packages/web/app/routes/(admin)/time/`
- **Acceptance:** Time policies reflect actual database records

### TICKET-006: Wire reports page to real backend
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Frontend
- **Problem:** Reports page returns `MOCK_DATA` fallback on empty API response
- **Action:** Remove mock data fallback; show empty state when no reports exist; connect to analytics API
- **Files:** `packages/web/app/routes/(admin)/reports/`
- **Acceptance:** Reports page shows real data or proper empty state; no mock data

### TICKET-007: Enable leave type/policy editing
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Frontend
- **Problem:** Edit button is disabled; users must delete and recreate leave types/policies
- **Action:** Implement edit form using `PUT /api/v1/absence/leave-types/:id` and `PUT /api/v1/absence/leave-policies/:id`
- **Files:** `packages/web/app/routes/(admin)/leave/`
- **Acceptance:** Edit button enabled; inline or modal editing works; changes persist

### TICKET-008: NI category tracking
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Payroll
- **Problem:** No NI category field on employee records
- **Action:** Add `ni_category` column to employee/payroll table; expose in API; add to employee form
- **Files:** New migration, `packages/api/src/modules/payroll/`, employee forms
- **Acceptance:** NI category (A, B, C, etc.) can be set and retrieved per employee

### TICKET-009: Benefits cessation on termination
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Benefits
- **Problem:** Benefits enrollments are not automatically ended when employee is terminated
- **Action:** Add domain event handler in `domain-event-handlers.ts` to end active enrollments on `employee.terminated`
- **Files:** `packages/api/src/jobs/domain-event-handlers.ts`, `packages/api/src/modules/benefits/service.ts`
- **Acceptance:** Terminating an employee auto-closes all active benefit enrollments

### TICKET-010: Bulk approval capability
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Workflows
- **Problem:** Managers must approve leave/workflow items one at a time
- **Action:** Add `POST /api/v1/workflows/bulk-approve` endpoint; add "Select All" + bulk action on manager dashboard
- **Files:** `packages/api/src/modules/workflows/`, `packages/web/app/routes/(app)/manager/`
- **Acceptance:** Manager can select multiple pending items and approve/reject in one action

### TICKET-011: Add rate limiting integration tests
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Testing
- **Problem:** Rate limiting plugin has no integration tests
- **Action:** Add test file verifying rate limit headers and 429 responses after exceeding limits
- **Files:** `packages/api/src/test/integration/rate-limiting.test.ts` (new)
- **Acceptance:** Tests verify rate limit headers present, 429 after threshold, window reset

### TICKET-012: Consolidate dual user tables
- **Priority:** CRITICAL | **Effort:** LARGE | **Area:** Architecture
- **Problem:** Better Auth `user` table and `app.users` can diverge on sync failure
- **Action:** Implement sync verification on login; add background job to detect/fix drift; add monitoring alert
- **Files:** `packages/api/src/plugins/auth-better.ts`, `packages/api/src/jobs/domain-event-handlers.ts`
- **Acceptance:** User creation/update atomically syncs both tables; drift detection job runs hourly

---

## Phase 17: Short-term High Value (2-5 days each)

### TICKET-013: @staffora/shared integration
- **Priority:** HIGH | **Effort:** LARGE | **Area:** Architecture
- **Problem:** Only 5 files import from `@staffora/shared`; massive type duplication across packages
- **Action:** Audit all local type definitions in API and web; replace with imports from shared package; add lint rule to prevent local type duplication
- **Files:** All modules with local type definitions
- **Acceptance:** All shared types/schemas/state-machines imported from `@staffora/shared`; no duplicate type definitions

### TICKET-014: MFA recovery code flow
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Security
- **Problem:** No recovery path for users who lose MFA device
- **Action:** Generate backup codes on MFA enrollment; store hashed; allow login with backup code; invalidate used codes
- **Files:** `packages/api/src/plugins/auth-better.ts`, new migration for backup_codes table
- **Acceptance:** User gets 10 backup codes on MFA setup; can use one to bypass MFA; used codes are invalidated

### TICKET-015: IP-based rate limiting for unauthenticated endpoints
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Security
- **Problem:** Rate limiting only applies to authenticated users; login/register endpoints vulnerable to brute force
- **Action:** Add IP-based rate limiter for `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/auth/*`
- **Files:** `packages/api/src/plugins/rate-limit.ts`
- **Acceptance:** Unauthenticated endpoints rate-limited by IP; 429 returned after threshold

### TICKET-016: Tax code management
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Payroll
- **Problem:** No tax code management — critical for UK payroll
- **Action:** Create `tax_codes` migration (employee_id, tax_code, basis, effective_from); CRUD endpoints; P45 tax code capture
- **Files:** `packages/api/src/modules/tax-codes/` (exists), new migration if needed
- **Acceptance:** Tax codes can be assigned to employees with effective dates; history preserved

### TICKET-017: Pay schedule assignment
- **Priority:** HIGH | **Effort:** SMALL | **Area:** Payroll
- **Problem:** No way to assign employees to pay schedules (weekly/fortnightly/monthly)
- **Action:** Add `pay_schedule_id` to employee/contract; create pay_schedules table; expose in API
- **Files:** `packages/api/src/modules/payroll-config/`, new migration
- **Acceptance:** Pay schedules created; employees assigned to schedules; queryable by schedule

### TICKET-018: Bradford Factor calculation
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Absence
- **Problem:** No Bradford Factor absence monitoring
- **Action:** Add calculation utility (S² × D where S=spells, D=days); add to absence dashboard; configurable thresholds
- **Files:** `packages/api/src/modules/absence/service.ts`, `packages/shared/src/utils/` (new)
- **Acceptance:** Bradford Factor calculated per employee; displayed on absence dashboard; threshold alerts work

### TICKET-019: HR service decomposition
- **Priority:** HIGH | **Effort:** LARGE | **Area:** Tech Debt
- **Problem:** `hr/service.ts` is a god class handling too many responsibilities
- **Action:** Split into focused services: EmployeeService, OrgUnitService, PositionService, ContractService
- **Files:** `packages/api/src/modules/hr/service.ts` → multiple files
- **Acceptance:** Each sub-service has single responsibility; all existing tests pass; no behavior change

### TICKET-020: Holiday pay 52-week reference period
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** UK Compliance
- **Problem:** Holiday pay not calculated per Harpur Trust ruling (52-week reference period)
- **Action:** Implement calculation considering variable pay over 52 paid weeks; exclude unpaid weeks
- **Files:** `packages/api/src/lib/` or `packages/shared/src/utils/`
- **Acceptance:** Holiday pay calculated correctly for variable-hours workers; unit tests cover edge cases

### TICKET-021: Fix 14 partial service unit tests
- **Priority:** HIGH | **Effort:** LARGE | **Area:** Testing
- **Action:** Complete test coverage for all service files that have partial tests
- **Files:** `packages/api/src/test/unit/services/`
- **Acceptance:** All service test files have comprehensive happy-path and error-path coverage

### TICKET-022: Convert route tests to real HTTP
- **Priority:** HIGH | **Effort:** LARGE | **Area:** Testing
- **Action:** Convert mock-based route tests to use `app.handle()` for real HTTP testing
- **Files:** `packages/api/src/test/integration/routes/`
- **Acceptance:** Route tests make real HTTP requests through full middleware chain

---

## Phase 18: Payroll & Compliance (1-2 weeks each)

### TICKET-023: Payslip generation
- **Priority:** HIGH | **Effort:** LARGE | **Area:** Payroll
- **Problem:** No payslip generation capability
- **Action:** Create payslip template system; calculate gross→net with deductions; generate PDF; store and serve via documents module
- **Files:** `packages/api/src/modules/payslips/`, `packages/api/src/jobs/pdf-worker.ts`
- **Acceptance:** Payslips generated per pay period; downloadable as PDF; viewable in self-service portal

### TICKET-024: P45 generation on termination
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Payroll/Compliance
- **Action:** Auto-generate P45 PDF on employee termination; capture tax code, earnings YTD, tax paid YTD
- **Files:** `packages/api/src/modules/payslips/`, domain event handler
- **Acceptance:** P45 auto-generated on termination; available in employee documents

### TICKET-025: P60 annual generation
- **Priority:** HIGH | **Effort:** MEDIUM | **Area:** Payroll/Compliance
- **Action:** Batch-generate P60s at tax year end (April 5); summarize annual earnings and tax
- **Files:** `packages/api/src/modules/payslips/`, scheduler job
- **Acceptance:** P60s generated for all active employees at year end; accessible in self-service

### TICKET-026: HMRC RTI/FPS/EPS submission
- **Priority:** HIGH | **Effort:** XL | **Area:** UK Compliance
- **Problem:** No HMRC Real Time Information submission capability
- **Action:** Implement FPS (Full Payment Submission) and EPS (Employer Payment Summary) XML generation; HMRC API integration
- **Files:** New module or extension of payroll module
- **Acceptance:** FPS generated per pay run; EPS generated monthly; submission to HMRC test gateway works

### TICKET-027: SSO integration (SAML/OIDC)
- **Priority:** HIGH | **Effort:** XL | **Area:** Security
- **Action:** Integrate SAML 2.0 and OIDC providers (Google, Microsoft, Okta) via Better Auth plugins
- **Files:** `packages/api/src/plugins/auth-better.ts`, new SSO config UI
- **Acceptance:** Tenant admin can configure SSO provider; users can login via SSO; JIT provisioning works

### TICKET-028: Prometheus + Grafana deployment
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** Infrastructure
- **Action:** Add Prometheus and Grafana to Docker Compose; configure scraping from API metrics endpoint
- **Files:** `docker/docker-compose.yml`, new `docker/prometheus/`, `docker/grafana/`
- **Acceptance:** Grafana accessible with pre-built dashboards showing API latency, error rates, DB connections

### TICKET-029: Log aggregation
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** Infrastructure
- **Action:** Add Loki + Promtail (or ELK) to Docker Compose; ship API/worker logs
- **Files:** `docker/docker-compose.yml`, new log collector config
- **Acceptance:** Logs searchable in Grafana; structured JSON logs from all services

---

## Phase 19: Enterprise Features (Variable effort)

### TICKET-030: Employee directory/search (self-service)
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Self-Service
- **Action:** Add employee directory with search, filters, and department browsing for self-service portal
- **Files:** `packages/web/app/routes/(app)/me/`, `packages/api/src/modules/portal/`
- **Acceptance:** Employees can search and view basic colleague info (name, department, phone, photo)

### TICKET-031: Custom report builder
- **Priority:** MEDIUM | **Effort:** XL | **Area:** Analytics
- **Action:** Build drag-and-drop report builder with field selection, filters, grouping, and export
- **Files:** `packages/web/app/routes/(admin)/reports/`, `packages/api/src/modules/reports/`
- **Acceptance:** Users can create, save, and share custom reports; export to CSV/Excel/PDF

### TICKET-032: Diversity analytics dashboard
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Analytics
- **Action:** Build dashboard showing diversity metrics (gender, ethnicity, disability, age bands) with trend charts
- **Files:** `packages/web/app/routes/(admin)/analytics/`, `packages/api/src/modules/analytics/`
- **Acceptance:** Dashboard shows key diversity KPIs with configurable date ranges and department filters

### TICKET-033: Compensation analytics
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Analytics
- **Action:** Build salary band analysis, pay equity reports, compensation trend charts
- **Files:** `packages/web/app/routes/(admin)/analytics/`, `packages/api/src/modules/analytics/`
- **Acceptance:** Compensation reports show salary distributions, band analysis, and gender pay comparisons

### TICKET-034: Data import framework (CSV/Excel)
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** System
- **Action:** Build bulk import system with template download, validation, preview, and batch processing
- **Files:** New import module, `packages/api/src/modules/system/`
- **Acceptance:** Admin can upload CSV/Excel; preview and fix errors; batch-import employees/data

### TICKET-035: Workflow auto-escalation on SLA breach
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Workflows
- **Action:** Add cron job to check overdue workflow tasks; auto-escalate to next approver or notify admin
- **Files:** `packages/api/src/jobs/`, `packages/api/src/modules/workflows/`
- **Acceptance:** Overdue tasks auto-escalated after configurable threshold; notifications sent

### TICKET-036: E-signature integration
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** Documents
- **Action:** Integrate with DocuSign or similar for contract signing workflows
- **Files:** `packages/api/src/modules/documents/`, new integration module
- **Acceptance:** Documents can be sent for e-signature; signed copies stored automatically

### TICKET-037: Case appeal process
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Cases
- **Action:** Add appeal workflow for disciplinary/grievance cases with separate review panel
- **Files:** `packages/api/src/modules/cases/`, case state machine
- **Acceptance:** Employees can appeal case decisions; appeal routed to different reviewer; tracked in timeline

---

## Phase 20: Testing & Quality

### TICKET-038: Admin frontend route tests
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** Testing
- **Action:** Add Vitest tests for all 20 admin route groups
- **Files:** `packages/web/app/__tests__/`
- **Acceptance:** Each admin route has render test and key interaction tests

### TICKET-039: Worker integration tests
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Testing
- **Action:** Test Redis Streams E2E: write to outbox → poll → process → verify side effects
- **Files:** `packages/api/src/test/integration/` (new)
- **Acceptance:** Outbox→Redis→Worker pipeline tested end-to-end

### TICKET-040: RBAC route-level tests
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Testing
- **Action:** Test that routes enforce correct permission checks; verify 403 for unauthorized access
- **Files:** `packages/api/src/test/integration/` (new)
- **Acceptance:** Each module's routes tested for correct permission enforcement

### TICKET-041: Infrastructure tests (backups, DR)
- **Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Infrastructure
- **Action:** Add backup/restore test script; DR runbook; automated backup verification
- **Files:** `docker/scripts/`, `tests/`
- **Acceptance:** Backup can be taken and restored; documented DR procedure

### TICKET-042: Penetration testing
- **Priority:** MEDIUM | **Effort:** LARGE | **Area:** Security
- **Action:** Conduct security audit covering OWASP Top 10; document findings and remediation
- **Files:** `audit/` (new report)
- **Acceptance:** All critical/high findings remediated; report published

---

## Ticket Summary

| Phase | Tickets | Effort Range | Focus |
|-------|---------|-------------|-------|
| Phase 16 | 12 | SMALL–LARGE | Quick wins, dependency fixes, frontend wiring |
| Phase 17 | 10 | SMALL–LARGE | Architecture, security, testing, payroll basics |
| Phase 18 | 7 | MEDIUM–XL | Payroll generation, compliance, monitoring |
| Phase 19 | 8 | MEDIUM–XL | Enterprise features, analytics, integrations |
| Phase 20 | 5 | MEDIUM–LARGE | Testing, infrastructure, security audit |
| **Total** | **42** | | |

---

*Generated from code-verified audit 2026-03-15.*

---

## Related Documents

- [Master Requirements](master_requirements.md) — Requirements these tickets address
- [Implementation Status](implementation_status.md) — Current feature completion assessment
- [Kanban Board](../13-roadmap/kanban-board.md) — Work item tracking board
- [Engineering TODO](../13-roadmap/engineering-todo.md) — Master engineering task list
- [Master TODO](../15-archive/audit/MASTER_TODO.md) — Audit-derived TODO items
- [Roadmap](../13-roadmap/roadmap.md) — Product roadmap for ticket scheduling
