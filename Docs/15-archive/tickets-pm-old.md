# Staffora HRIS — Implementation Tickets (Phase 16+)

*Last updated: 2026-03-28*

**Generated:** 2026-03-14
**Total tickets:** 30 (Phase 16 quick wins + critical high-priority)

---

## TICKET-001: Remove hardcoded DB password fallback

**Priority:** CRITICAL | **Effort:** SMALL | **Area:** Security
**TODO:** TODO-006

### Problem
`packages/api/src/config/database.ts` and `packages/api/src/plugins/db.ts` use `hris_dev_password` as a fallback when `DB_PASSWORD`/`DATABASE_URL` is not set. This is a security risk — production should crash with a clear error message.

### Acceptance Criteria
- [ ] API crashes on startup in production if `DATABASE_APP_URL` is not set
- [ ] Startup log confirms connected role is `hris_app` with `NOBYPASSRLS`
- [ ] No hardcoded password strings in any source file
- [ ] Clear error message: "DATABASE_APP_URL environment variable is required"

### Files to Modify
- `packages/api/src/config/database.ts`
- `packages/api/src/plugins/db.ts`

---

## TICKET-002: Fix leave_approvals table name mismatch

**Priority:** CRITICAL | **Effort:** SMALL | **Area:** Data Integrity
**TODO:** TODO-012

### Problem
`packages/api/src/modules/security/manager.service.ts` references `app.leave_approvals` with wrong column names. Actual table is `app.leave_request_approvals` with columns `request_id`, `actor_id`, `action`, `created_at`. All manager approval/rejection calls fail at runtime.

### Acceptance Criteria
- [ ] All references to `leave_approvals` changed to `leave_request_approvals`
- [ ] Column names corrected: `request_id`, `actor_id`, `action`, `created_at`
- [ ] Integration test verifies manager can approve/reject leave requests
- [ ] Domain event emitted on approval/rejection

### Files to Modify
- `packages/api/src/modules/security/manager.service.ts`
- `packages/api/src/modules/security/manager.routes.ts`

---

## TICKET-003: Replace Redis KEYS with SCAN in cache plugin

**Priority:** HIGH | **Effort:** SMALL | **Area:** Performance/Architecture
**TODO:** TODO-047

### Problem
`invalidateTenantCache()` in cache plugin uses `KEYS` command which blocks Redis during scan. Under load this causes production latency spikes.

### Acceptance Criteria
- [ ] `KEYS` replaced with `SCAN` using cursor-based iteration
- [ ] No Redis blocking during cache invalidation
- [ ] Existing cache tests pass

### Files to Modify
- `packages/api/src/plugins/cache.ts`

---

## TICKET-004: Fix better-auth and vitest version mismatches

**Priority:** HIGH | **Effort:** SMALL | **Area:** Tech Debt
**TODO:** TODO-041, TODO-042

### Problem
1. API uses `better-auth: ^1.5.4`, web uses `^1.4.10` — client/server auth behavior may differ
2. `vitest: ^2.1.8` vs `@vitest/coverage-v8: ^4.1.0` — major version mismatch breaks frontend coverage

### Acceptance Criteria
- [ ] `better-auth` version aligned across `packages/api` and `packages/web`
- [ ] `vitest` and `@vitest/coverage-v8` use matching major versions
- [ ] Frontend tests still pass
- [ ] Coverage reporting works in `packages/web`

### Files to Modify
- `packages/api/package.json`
- `packages/web/package.json`
- `bun.lock`

---

## TICKET-005: Fix Docker and CI infrastructure issues

**Priority:** HIGH | **Effort:** SMALL (per item) | **Area:** Infrastructure
**TODO:** TODO-083, TODO-084, TODO-085, TODO-086, TODO-089, TODO-090, TODO-091

### Problem
Multiple small Docker/CI issues causing environment inconsistency:
1. CI uses `bun-version: latest` (non-reproducible builds)
2. CI Redis has no password (differs from dev/prod)
3. Redis health check fails when `requirepass` is set
4. Web container doesn't wait for API to be healthy
5. Docker user named `nodejs`/`nextjs` not `staffora`
6. `docker/nginx/ssl/` directory missing (nginx fails to start)
7. Web Dockerfile build stage uses `NODE_ENV=development`

### Acceptance Criteria
- [ ] Bun version pinned in CI to match `packageManager` field in `package.json`
- [ ] CI Redis has password configured
- [ ] Redis health check uses `redis-cli -a $REDIS_PASSWORD ping`
- [ ] Web `depends_on` uses `condition: service_healthy`
- [ ] Docker user renamed to `staffora`
- [ ] `docker/nginx/ssl/` directory created with `README.md`
- [ ] Web Dockerfile build stage uses `NODE_ENV=production`

### Files to Modify
- `.github/workflows/test.yml`
- `.github/workflows/pr-check.yml`
- `docker/docker-compose.yml`
- `packages/web/Dockerfile`
- `docker/nginx/` (new directory)

---

## TICKET-006: Wire tenant settings and notification settings to real backend

**Priority:** HIGH | **Effort:** SMALL | **Area:** Feature
**TODO:** TODO-051, TODO-052, TODO-053

### Problem
1. Tenant settings `queryFn` returns hardcoded mock data (`id: "tenant-1"`, `name: "Acme Corporation"`)
2. Tenant settings save uses `setTimeout(1000)` and shows success toast without persisting
3. Notification settings save is also simulated

### Acceptance Criteria
- [ ] Tenant settings page fetches from `/api/v1/tenant/settings`
- [ ] Tenant settings save calls `PUT /api/v1/tenant/settings`
- [ ] Notification settings save calls real API endpoint
- [ ] Error states handled and displayed

### Files to Modify
- `packages/web/app/routes/(admin)/settings/tenant/route.tsx`
- `packages/web/app/routes/(admin)/settings/notifications/route.tsx`

---

## TICKET-007: Remove mock data fallback in reports page

**Priority:** MEDIUM | **Effort:** SMALL | **Area:** Feature
**TODO:** TODO-107

### Problem
`transformReportData()` in reports route returns `MOCK_DATA` for empty or unexpected API responses. Users may see fake data in production.

### Acceptance Criteria
- [ ] `MOCK_DATA` constant removed
- [ ] Empty state shown when API returns no data
- [ ] Error state shown when API call fails
- [ ] No hardcoded data anywhere in reports route

### Files to Modify
- `packages/web/app/routes/(admin)/reports/route.tsx`
- `packages/web/app/routes/(admin)/reports/[reportId]/route.tsx`

---

## TICKET-008: NI category tracking

**Priority:** HIGH | **Effort:** SMALL | **Area:** Feature/UK Compliance
**TODO:** TODO-127

### Problem
No National Insurance category assignment or tracking. Required for payroll compliance.

### Acceptance Criteria
- [ ] Migration adds `ni_category` column to `app.employees` or separate `app.employee_ni` table
- [ ] NI categories supported: A, B, C, D, E, F, H, J, L, M, N, S, V, X, Z
- [ ] API endpoint to get/set employee NI category
- [ ] Audit trail on category changes
- [ ] Frontend field in employee HR settings

### Files to Modify / Create
- `migrations/0175_ni_categories.sql` (new)
- `packages/api/src/modules/hr/schemas.ts`
- `packages/api/src/modules/hr/repository.ts`
- `packages/api/src/modules/hr/service.ts`
- `packages/api/src/modules/hr/routes.ts`

---

## TICKET-009: Benefits cessation on termination

**Priority:** MEDIUM | **Effort:** SMALL | **Area:** Feature
**TODO:** TODO-145

### Problem
No automatic benefits end date when employee is terminated. Benefits continue indefinitely.

### Acceptance Criteria
- [ ] On employee termination, all active benefit enrollments get `end_date = termination_date`
- [ ] Domain event emitted: `benefits.enrollment.ceased`
- [ ] Outbox entry written in same transaction as termination
- [ ] Pension auto-enrolment also ceased on termination

### Files to Modify
- `packages/api/src/modules/hr/service.ts` (terminateEmployee function)
- `packages/api/src/modules/benefits/service.ts`
- `packages/api/src/modules/pension/service.ts`

---

## TICKET-010: Bulk approval endpoint for managers

**Priority:** MEDIUM | **Effort:** SMALL | **Area:** Feature
**TODO:** TODO-157

### Problem
No batch approve endpoint for managers with many pending items. Managers must approve one at a time.

### Acceptance Criteria
- [ ] `POST /api/v1/manager/approvals/bulk` endpoint accepts array of `{ type, id }` pairs
- [ ] Types supported: `leave`, `expense`, `timesheet`
- [ ] Each approval processed with outbox event in same transaction
- [ ] Returns `{ approved: [], failed: [] }` with details on each
- [ ] Idempotency-Key required
- [ ] RBAC: manager role only

### Files to Create/Modify
- `packages/api/src/modules/security/manager.routes.ts`
- `packages/api/src/modules/security/manager.service.ts`

---

## TICKET-011: MFA recovery code flow

**Priority:** HIGH | **Effort:** MEDIUM | **Area:** Security
**TODO:** TODO-028

### Problem
"Use recovery code" button shows toast "not available yet". Users locked out with no MFA device have zero recovery path.

### Acceptance Criteria
- [ ] Recovery code generation on MFA setup (10 one-time codes)
- [ ] Recovery codes stored as bcrypt hashes
- [ ] Recovery code validation at login bypasses TOTP requirement
- [ ] Used codes invalidated immediately
- [ ] Remaining recovery code count shown in security settings
- [ ] Regenerate recovery codes option (invalidates all old codes)

### Files to Create/Modify
- `packages/api/src/modules/auth/service.ts`
- `packages/api/src/modules/auth/routes.ts`
- `packages/web/app/routes/(auth)/mfa/route.tsx`
- `migrations/0176_mfa_recovery_codes.sql` (new)

---

## TICKET-012: IP-based rate limiting for unauthenticated endpoints

**Priority:** HIGH | **Effort:** MEDIUM | **Area:** Security
**TODO:** TODO-025

### Problem
Generic rate limit key uses `tenantId ?? "public"` — all unauthenticated requests share one bucket. An attacker can enumerate user accounts without hitting any limit.

### Acceptance Criteria
- [ ] Unauthenticated requests rate-limited by client IP (from X-Forwarded-For, validated)
- [ ] Auth endpoints (`/api/auth/*`) have stricter limits (5 req/min per IP)
- [ ] API enumeration endpoints have limits (10 req/min per IP when unauthenticated)
- [ ] Uses `getClientIp()` from `src/lib/client-ip.ts`
- [ ] Integration test verifies IP-based limiting works

### Files to Modify
- `packages/api/src/plugins/rate-limit.ts`
- `packages/api/src/test/integration/routes/` (new test)

---

## TICKET-013: Fix `unsafe()` in db.ts + opt-in debug logging

**Priority:** MEDIUM | **Effort:** SMALL | **Area:** Security/Architecture
**TODO:** TODO-075, TODO-076

### Problem
1. `SET TRANSACTION ISOLATION LEVEL` in `db.ts` uses `unsafe()` which is dangerous if the signature is relaxed
2. DB plugin logs query parameters (may include PII) in non-production

### Acceptance Criteria
- [ ] `unsafe()` replaced with switch/case map of known isolation level strings
- [ ] Query parameter logging only enabled when `DB_DEBUG=true` env var is set
- [ ] No query parameters logged in default mode

### Files to Modify
- `packages/api/src/plugins/db.ts`
- `packages/api/src/lib/transaction.ts` (if applicable)

---

## TICKET-014: Add rate limiting integration tests

**Priority:** HIGH | **Effort:** SMALL | **Area:** Testing
**TODO:** TODO-024

### Problem
Rate limiting disabled when `NODE_ENV=test`. No tests verify it actually works. Tests should force-enable rate limiting and verify 429 responses.

### Acceptance Criteria
- [ ] Test creates app with `rateLimitPlugin` options `{ enabled: true }`
- [ ] Test verifies 429 response after exceeding limit
- [ ] Test verifies `Retry-After` header is included in 429 response
- [ ] Test verifies limit resets after TTL

### Files to Create
- `packages/api/src/test/integration/routes/rate-limit.routes.test.ts`

---

## TICKET-015: Pay schedule assignment to employees

**Priority:** HIGH | **Effort:** SMALL | **Area:** Feature/Payroll
**TODO:** TODO-124

### Problem
No employee-to-pay-schedule assignment despite pay period configuration existing in `payroll-config` module.

### Acceptance Criteria
- [ ] Migration adds `pay_schedule_id` FK to `app.employees` or `app.employment_contracts`
- [ ] API endpoint to assign/update pay schedule for employee
- [ ] Employee list shows assigned pay schedule
- [ ] Effective-dated assignment supported

---

## TICKET-016: Remove legacy App.tsx and dead code

**Priority:** LOW | **Effort:** SMALL | **Area:** Tech Debt
**TODO:** TODO-163, TODO-164, TODO-165

### Problem
- `packages/web/src/App.tsx` shows "under construction" message but is dead code
- `packages/web/src/index.css` and `packages/web/src/main.tsx` are dead (app runs from `app/root.tsx`)
- Debug `_test_conn.ts` files left in repo

### Acceptance Criteria
- [ ] `packages/web/src/` directory removed (entire legacy Vite entrypoint)
- [ ] `packages/api/_test_conn.ts` removed
- [ ] `packages/api/src/test/_test_conn.ts` removed
- [ ] `vite.config.ts` updated if it referenced old entrypoint

---

## TICKET-017: Add missing manager route pages

**Priority:** HIGH | **Effort:** LARGE | **Area:** Feature
**TODO:** TODO-056

### Problem
Navigation links to non-existent pages: `/manager/dashboard`, `/manager/org-chart`, `/manager/approvals/leave`, `/manager/approvals/timesheets`.

### Acceptance Criteria
- [ ] `/manager/dashboard` — Summary with pending approvals, team metrics
- [ ] `/manager/org-chart` — Org chart showing manager's subtree
- [ ] `/manager/approvals/leave` — Leave requests pending manager approval
- [ ] `/manager/approvals/timesheets` — Timesheets pending manager approval
- [ ] All pages have proper loading states and error boundaries
- [ ] All pages use React Query for data fetching

---

## TICKET-018: Implement time policies backend endpoint

**Priority:** HIGH | **Effort:** MEDIUM | **Area:** Feature
**TODO:** TODO-054

### Problem
Frontend `/time/policies` page shows hardcoded fake data. `/api/v1/time/policies` may not be implemented.

### Acceptance Criteria
- [ ] Migration creates `app.time_policies` table (or verify existing)
- [ ] `GET /api/v1/time/policies` returns paginated list
- [ ] `POST /api/v1/time/policies` creates policy
- [ ] `PUT /api/v1/time/policies/:id` updates policy
- [ ] Frontend connects to real endpoint
- [ ] RLS enforces tenant isolation

---

## TICKET-019: Implement Bradford Factor absence monitoring

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Feature/UK Compliance
**TODO:** TODO-134

### Problem
No Bradford Factor (S² × D) calculation for absence monitoring. Common UK HR practice for identifying frequent short-term absence patterns.

### Acceptance Criteria
- [ ] Bradford Factor = (number of spells)² × (total days absent)
- [ ] Calculated per employee over rolling 52-week period
- [ ] Trigger thresholds configurable per tenant (e.g., 100 = informal review, 200 = formal review)
- [ ] `GET /api/v1/absence/bradford-factors` returns scores with employee breakdown
- [ ] Dashboard widget shows employees exceeding threshold
- [ ] Audit trail when threshold triggers action

---

## TICKET-020: Tax code management

**Priority:** HIGH | **Effort:** MEDIUM | **Area:** Feature/UK Compliance
**TODO:** TODO-126

### Problem
No tax code storage or management. Required for payroll.

### Acceptance Criteria
- [ ] Migration creates `app.employee_tax_codes` table with effective dating
- [ ] Columns: employee_id, tax_code, source (P45/HMRC/starter_checklist), effective_from, effective_to
- [ ] Emergency tax codes supported (0T, BR, NT, W1/M1)
- [ ] API CRUD endpoints
- [ ] History view in employee record
- [ ] Integration with payroll calculation

---

## TICKET-021: Holiday pay 52-week reference period

**Priority:** HIGH | **Effort:** MEDIUM | **Area:** UK Compliance
**TODO:** TODO-113, TODO-131

### Problem
No holiday pay calculation including regular overtime, commission, and bonuses using 52-week reference period (required by Working Time Regulations as amended by Harpur Trust v Brazel).

### Acceptance Criteria
- [ ] Calculate average weekly pay over last 52 paid weeks (excluding zero-pay weeks)
- [ ] Include regular overtime, commission, and bonuses
- [ ] `GET /api/v1/absence/holiday-pay-rate/:employeeId` returns calculated daily rate
- [ ] Used in holiday pay calculation on leave approval
- [ ] Works correctly for part-year workers (Harpur Trust ruling)

---

## TICKET-022: Implement leave type and leave policy editing

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Feature
**TODO:** TODO-104, TODO-105

### Problem
Edit buttons disabled on leave types and leave policies with tooltip "not yet supported. Delete and recreate to modify."

### Acceptance Criteria
- [ ] Leave type edit modal opens with current values pre-populated
- [ ] `PUT /api/v1/absence/leave-types/:id` endpoint implemented
- [ ] Leave policy edit modal opens with current values
- [ ] `PUT /api/v1/absence/leave-policies/:id` endpoint implemented
- [ ] Validation prevents changes that would invalidate existing requests
- [ ] Audit trail captures who changed what

---

## TICKET-023: Session resolution performance optimization

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Architecture
**TODO:** TODO-110

### Problem
Auth plugin creates a new Request and calls `auth.handler()` for every incoming request. This doubles effective request cost. Sessions should be cached.

### Acceptance Criteria
- [ ] Session cached in Redis with short TTL (30 seconds)
- [ ] Cache key: `session:{sessionToken}`
- [ ] Cache invalidated on logout
- [ ] Cache invalidated on permission change
- [ ] Verified session resolution is < 5ms p95 with caching

---

## TICKET-024: Implement @staffora/shared integration

**Priority:** HIGH | **Effort:** LARGE | **Area:** Tech Debt
**TODO:** TODO-039

### Problem
`@staffora/shared` package has 0 imports in frontend and API modules. All types, error codes, and state machines are duplicated locally. This is the largest source of maintenance burden.

### Acceptance Criteria
- [ ] API modules import `TenantContext` from `@staffora/shared`
- [ ] API modules import `ServiceResult` from `@staffora/shared`
- [ ] Error codes bridge to `@staffora/shared/errors`
- [ ] State machine transitions use `@staffora/shared/state-machines`
- [ ] Frontend imports shared types
- [ ] No duplicate type definitions in service files
- [ ] Full test suite passes after migration

---

## TICKET-025: Frontend retry logic with exponential backoff

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Architecture
**TODO:** TODO-109

### Problem
API client makes single fetch calls with no retry for 429, 502, 503. No `Retry-After` header respect. Poor user experience on transient errors.

### Acceptance Criteria
- [ ] Retry on 429, 502, 503 with exponential backoff (100ms, 200ms, 400ms)
- [ ] `Retry-After` header respected when present
- [ ] Max 3 retries before failing
- [ ] GET requests only (no retry on mutations unless idempotent)
- [ ] Retry count visible in debug logs

### Files to Modify
- `packages/web/app/lib/api-client.ts`

---

## TICKET-026: Payslip generation

**Priority:** HIGH | **Effort:** LARGE | **Area:** Feature/Payroll
**TODO:** TODO-128

### Problem
No payslip generation or viewing. Core employee expectation and legal requirement.

### Acceptance Criteria
- [ ] Migration: `app.payslips` table with gross/net pay, deductions, tax, NI, pension
- [ ] `POST /api/v1/payroll/payslips/generate` generates payslip for a pay period
- [ ] `GET /api/v1/payroll/payslips` lists employee payslips
- [ ] PDF generation using pdf-lib (existing PDF worker)
- [ ] Employee self-service: view own payslips at `/me/payslips`
- [ ] Payslip includes: employee name, NI number, tax code, gross pay, deductions, net pay
- [ ] RLS enforces employees can only view their own payslips

---

## TICKET-027: P45 and P60 generation

**Priority:** HIGH | **Effort:** MEDIUM (each) | **Area:** Feature/UK Compliance
**TODO:** TODO-129, TODO-130

### Problem
No P45 (required on termination) or P60 (required annually) generation. Legal requirements.

### Acceptance Criteria (P45)
- [ ] P45 auto-generated on employee termination
- [ ] Includes: leaving date, total pay to date, total tax to date, tax code, NI number
- [ ] PDF generated using pdf-lib
- [ ] Sent to employee email via notification worker
- [ ] Stored in documents module with category `P45`

### Acceptance Criteria (P60)
- [ ] P60 generated at end of tax year (5 April)
- [ ] Includes: total taxable pay, total tax deducted, NI contributions
- [ ] Scheduler triggers generation annually
- [ ] Employee can view/download from self-service portal

---

## TICKET-028: Implement employee self-service directory

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Feature
**TODO:** TODO-149

### Problem
No employee directory for general employees (self-service). Only HR admins can search employees.

### Acceptance Criteria
- [ ] `/me/directory` route added to employee self-service
- [ ] Shows basic info only: name, job title, department, email, phone
- [ ] Search by name, department, job title
- [ ] RLS ensures only active employees visible to other employees
- [ ] Field-level permissions respected (sensitive data not shown)
- [ ] Does not expose NI number, bank details, salary

---

## TICKET-029: Workflow auto-escalation on SLA breach

**Priority:** MEDIUM | **Effort:** MEDIUM | **Area:** Feature
**TODO:** TODO-156

### Problem
`workflow_slas` and SLA events tables exist but no automatic escalation when SLA breaches occur.

### Acceptance Criteria
- [ ] Scheduler job checks for SLA breaches (every 15 minutes)
- [ ] On breach: escalate to next approver, emit `workflow.sla.breached` event
- [ ] Notification sent to manager's manager on escalation
- [ ] SLA breach recorded in audit trail
- [ ] Dashboard shows workflows currently in breach

---

## TICKET-030: Integrate @staffora/shared into modules (decomposition)

**Priority:** HIGH | **Effort:** LARGE | **Area:** Tech Debt
**TODO:** TODO-065, TODO-039

### Problem
HR `service.ts` is 2,159 lines (god class). Additionally, `@staffora/shared` is unused — all types duplicated locally.

### Acceptance Criteria (service split)
- [ ] `hr/service.ts` split into `employee.service.ts`, `org-unit.service.ts`, `position.service.ts`
- [ ] Corresponding repository splits
- [ ] All existing tests pass
- [ ] Route handlers updated to import from correct service

### Acceptance Criteria (@staffora/shared)
- [ ] `TenantContext` imported from `@staffora/shared` in all split services
- [ ] `ServiceResult<T>` imported from `@staffora/shared`
- [ ] Error codes bridged to `@staffora/shared/errors`

---

*Tickets generated from audit/MASTER_TODO.md and implementation_status.md on 2026-03-14*
*Next review: After Phase 16 completion*
