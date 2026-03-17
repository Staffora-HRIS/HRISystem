# Staffora Platform — Master Engineering TODO

Generated: 2026-03-16 | Updated: 2026-03-16 (AI CTO enterprise audit)
Source: Comprehensive repository audit (Phases 1–13) + AI CTO review

## Priority Legend
- **P0 (CRITICAL)** — Security vulnerabilities, data integrity risks, production blockers
- **P1 (HIGH)** — Architectural violations, broken patterns, missing critical tests
- **P2 (MEDIUM)** — Code quality, performance, maintainability issues
- **P3 (LOW)** — Nice-to-haves, minor improvements, documentation gaps

## Status Legend
- **RESOLVED** — Fixed and verified
- **IN_PROGRESS** — Currently being worked on
- **OPEN** — Not yet started
- **BLOCKED** — Waiting on dependency

---

## P0 — CRITICAL ISSUES

### ~~SEC-001: CSRF Protection Non-Functional~~ — RESOLVED (pre-session)
**Status:** Already fixed with HMAC-SHA256 + constant-time comparison in auth-better.ts:642-700.
**Agent:** N/A

### ~~SEC-002: Better Auth Hardcoded Fallback Secret~~ — FIXED (this session)
**Status:** Production now throws fatal error if secrets not set. Dev uses labeled insecure default with warning.
**File:** `packages/api/src/lib/better-auth.ts:68-76`

### ~~DB-001: 65 Tables Missing INSERT RLS Policies~~ — FIXED (this session)
**Status:** Created `migrations/0182_fix_missing_insert_rls_policies.sql` adding INSERT policies to all 65 affected tables.

### DB-002: analytics_widgets Missing tenant_id Column
**Severity:** P2 MEDIUM (downgraded — needs verification) | **Skill:** Database
**Description:** Verify if analytics_widgets actually lacks tenant_id. If so, add it with RLS.
**Agent:** Database Agent

### ~~DB-003: Broken Triggers (wrong function name)~~ — FIXED (this session)
**Status:** Created `migrations/0183_fix_triggers_and_bootstrap_functions.sql`. Also creates alias function so both names work.

### ~~ARCH-001: Outbox Pattern Violated in 3 Modules~~ — RESOLVED (pre-session)
**Status:** All 3 modules now pass `tx` to `emitDomainEvent` within the same transaction.

### ~~ARCH-002: Recruitment Repository Uses db.query~~ — RESOLVED (pre-session)
**Status:** All methods now use `db.withTransaction(ctx, ...)`.

---

## P1 — HIGH PRIORITY

### ARCH-003: Talent Module Has No Service/Repository Layer
**Severity:** P1 HIGH | **Skill:** Refactoring
**Files:** `packages/api/src/modules/talent/routes.ts` (~1150 lines)
**Description:** All SQL is inline in routes.ts. No service.ts or repository.ts separation. No domain events emitted. Violates layered architecture pattern.
**Fix:** Extract SQL into repository.ts, business logic into service.ts. Add outbox events for mutations.
**Agent:** Refactor Agent

### ARCH-004: @staffora/shared Package Unused in Production
**Severity:** P1 HIGH | **Skill:** Architecture
**Files:** `packages/shared/src/`, all module service/route files
**Description:** Zero production imports from @staffora/shared. Each module re-implements ServiceResult<T>, TenantContext, error codes, and state machine transitions locally.
**Fix:** Refactor modules to import shared types. Deduplicate type definitions.
**Agent:** Architecture Agent

### TEST-001: Majority of Tests Are Hollow/Fake
**Severity:** P1 HIGH | **Skill:** Testing
**Files:** `packages/api/src/test/integration/routes/*.test.ts`, `test/security/*.test.ts`, `test/performance/*.test.ts`, `test/chaos/*.test.ts`, `test/e2e/*.test.ts`
**Description:** Tests assert local variables, not actual API behavior. SQL injection "test" asserts `typeof string`. E2E tests mutate plain JS objects. Test factories and helpers are never used.
**Fix:** Rewrite tests to use `app.handle()` or TestApiClient. Assert HTTP status codes, response bodies, and DB side-effects.
**Agent:** Testing Agent

### TEST-002: 15 of 20 Core Modules Have Zero Route Test Coverage
**Severity:** P1 HIGH | **Skill:** Testing
**Files:** Missing tests for: talent, benefits, documents, succession, analytics, competencies, recruitment, workflows, payroll, pension, notifications, delegations, and more
**Description:** Only 5 modules have route tests (and those are fake per TEST-001).
**Fix:** Create real route integration tests for all core modules.
**Agent:** Testing Agent

### SEC-003: MFA twoFactorVerified Check May Not Be Enforced
**Severity:** P1 HIGH | **Skill:** Security
**Files:** `packages/api/src/plugins/auth-better.ts:583-606`
**Description:** MFA guard checks `session.twoFactorVerified` but this field may not be set by Better Auth depending on plugin configuration. Has a warning log but still blocks — could either always block or never block MFA users depending on config.
**Fix:** Verify Better Auth MFA plugin configuration. Ensure session schema includes twoFactorVerified field.
**Agent:** Security Agent

### PERF-001: Employee List Query Has N+1 Problem
**Severity:** P1 HIGH | **Skill:** Performance
**Files:** `packages/api/src/modules/hr/repository.ts:707`
**Description:** 3 correlated subqueries per row (position, org unit, manager). 60+ DB operations per page of 20.
**Fix:** Rewrite with LEFT JOINs.
**Agent:** Performance Agent

### PERF-002: Outbox Processor Sequential Processing
**Severity:** P1 HIGH | **Skill:** Performance
**Files:** `packages/api/src/worker/outbox-processor.ts`
**Description:** 2 individual DB calls per event instead of batching. Was also using wrong column names (fixed in prior session).
**Fix:** Batch-update processed events with `WHERE id = ANY($1::uuid[])`.
**Agent:** Performance Agent

### ~~DEPLOY-001: Deployment Steps Are Placeholders~~ — RESOLVED
**Status:** deploy.yml now has full SSH-based deployment with image pull, rolling restart, migration execution, health checks, and Slack notifications for both staging and production.

### DB-004: Bootstrap Functions in init.sql Not in Migrations
**Severity:** P1 HIGH | **Skill:** Database
**Files:** `docker/postgres/init.sql`, migrations/
**Description:** Functions like `update_updated_at_column`, `is_system_context`, `enable_system_context`, `disable_system_context` are only in docker/postgres/init.sql. Non-Docker deployments (CI, managed Postgres) won't have them.
**Fix:** Create a migration that idempotently creates these functions.
**Agent:** Database Agent

---

## P2 — MEDIUM PRIORITY

### PERF-003: Zero Module-Level Caching
**Severity:** P2 MEDIUM | **Skill:** Performance
**Files:** All module repository.ts files, `packages/api/src/plugins/cache.ts`
**Description:** Cache infrastructure is built and ready but never used by any module. `CacheKeys.orgTree()` is defined but never populated. Executive dashboard polls 5 DB queries every 60s uncached.
**Fix:** Add `cache.getOrSet()` to reference data endpoints (leave types, org tree, course catalog, dashboard stats).
**Agent:** Performance Agent

### PERF-004: Unbounded Collection Queries
**Severity:** P2 MEDIUM | **Skill:** Performance
**Files:** `packages/api/src/modules/time/repository.ts:372`, `cases/repository.ts:136`, `lms/repository.ts:256`
**Description:** Three collection queries have no LIMIT clause. Could return unbounded result sets.
**Fix:** Add pagination/LIMIT to all collection queries.
**Agent:** Performance Agent

### PERF-005: Export Worker Loads Entire Dataset Into Memory
**Severity:** P2 MEDIUM | **Skill:** Performance
**Files:** `packages/api/src/jobs/export-worker.ts:559`
**Description:** Loads entire dataset into memory for export. Comments claim streaming but it's not implemented.
**Fix:** Use postgres.js cursor streaming for large exports.
**Agent:** Performance Agent

### ARCH-005: Cases/LMS/Onboarding Missing RBAC Guards
**Severity:** P2 MEDIUM | **Skill:** Security
**Files:** `packages/api/src/modules/cases/routes.ts`, `lms/routes.ts`, `onboarding/routes.ts`
**Description:** No `requirePermission()` guards on route handlers. Any authenticated user can access these modules.
**Fix:** Add appropriate permission guards to all route handlers.
**Agent:** Security Agent

### ARCH-006: Portal/Dashboard Skip Service Layer
**Severity:** P2 MEDIUM | **Skill:** Architecture
**Files:** `packages/api/src/modules/portal/routes.ts`, `dashboard/routes.ts`
**Description:** Routes contain inline SQL queries instead of going through service/repository layers.
**Fix:** Extract to proper service/repository pattern.
**Agent:** Refactor Agent

### CODE-001: Inconsistent Error Handling Across Modules
**Severity:** P2 MEDIUM | **Skill:** Code Quality
**Files:** Multiple module service.ts files
**Description:** Some modules use AppError, some use custom error classes, some use raw throw. No consistent pattern for error responses.
**Fix:** Standardize on AppError from errors plugin across all modules.
**Agent:** Refactor Agent

### CODE-002: `any` Type Usage
**Severity:** P2 MEDIUM | **Skill:** Code Quality
**Files:** Various files across packages/api and packages/web
**Description:** Multiple uses of `any` type in TypeScript, especially in plugin derive functions and service methods.
**Fix:** Replace `any` with proper types. Use type assertions sparingly.
**Agent:** Refactor Agent

### DOC-001: API Reference May Be Out of Date
**Severity:** P2 MEDIUM | **Skill:** Documentation
**Files:** `Docs/api/API_REFERENCE.md`
**Description:** Documentation references may not reflect all 71 modules and their routes.
**Fix:** Regenerate API reference from actual route definitions.
**Agent:** Documentation Agent

### ~~INFRA-001: Nginx Configuration Missing~~ — RESOLVED
**Status:** `docker/nginx/nginx.conf` exists with reverse proxy configuration.

### TEST-003: Frontend Tests Need Improvement
**Severity:** P2 MEDIUM | **Skill:** Testing
**Files:** `packages/web/app/__tests__/`, various component tests
**Description:** 35 test files exist but quality varies. Many may be placeholder tests.
**Fix:** Audit and improve frontend test quality. Add tests for critical user flows.
**Agent:** Testing Agent

---

## P3 — LOW PRIORITY

### CODE-003: Console.log Statements Should Use Pino Logger
**Severity:** P3 LOW | **Skill:** Code Quality
**Files:** Multiple files across packages/api
**Description:** Several console.log/console.error statements in production code paths. Should use pino structured logging.
**Fix:** Replace with pino logger calls.
**Agent:** Refactor Agent

### CODE-004: Dead Code in Legacy Auth Plugin
**Severity:** P3 LOW | **Skill:** Code Quality
**Files:** `packages/api/src/plugins/auth.ts` (if still exists alongside auth-better.ts)
**Description:** Legacy auth plugin may still exist after migration to Better Auth.
**Fix:** Remove if unused.
**Agent:** Refactor Agent

### ~~INFRA-002: Docker Compose Missing .env.example~~ — RESOLVED
**Status:** `docker/.env.example` exists.

### DOC-002: Migration README Conventions
**Severity:** P3 LOW | **Skill:** Documentation
**Files:** `migrations/README.md`
**Description:** Should include RLS checklist (tenant_id, ENABLE RLS, FOR ALL policy, FOR INSERT policy).
**Fix:** Update with RLS migration checklist.
**Agent:** Documentation Agent

### PERF-006: Consider Connection Pooling Configuration
**Severity:** P3 LOW | **Skill:** Performance
**Files:** `packages/api/src/plugins/db.ts`, `docker/postgres/postgresql.conf`
**Description:** Review PostgreSQL connection pool settings for production workloads.
**Fix:** Tune max_connections, pool_size based on expected load.
**Agent:** Performance Agent

---

---

## P2 — ADDITIONAL (CI/CD, Documentation, HR Domain)

### CICD-001: Coverage Gate Thresholds Need Increase
**Severity:** P2 MEDIUM | **Skill:** DevOps | **Complexity:** Low
**Files:** `.github/workflows/test.yml`
**Description:** Current thresholds are 60% (API) and 50% (frontend). Enterprise target is 80%+. Gate is correctly implemented but threshold needs raising as test quality improves.
**Dependencies:** TEST-001, TEST-002 must be resolved first
**Agent:** DevOps Agent | **Status:** OPEN

### CICD-002: E2E Test Pipeline Missing
**Severity:** P2 MEDIUM | **Skill:** Testing/DevOps | **Complexity:** High
**Description:** No Playwright or browser-based E2E test pipeline. Only unit/integration tests run in CI.
**Fix:** Add Playwright E2E tests for critical user flows (login, employee CRUD, leave request, onboarding).
**Agent:** Testing Agent | **Status:** OPEN

### CICD-003: Performance Regression Pipeline Missing
**Severity:** P2 MEDIUM | **Skill:** DevOps | **Complexity:** Medium
**Description:** No benchmark or performance regression testing in CI. Performance tests exist but are hollow (per TEST-001).
**Fix:** Add k6 or artillery load testing to CI for critical API endpoints.
**Agent:** DevOps Agent | **Status:** OPEN

### DOC-003: System Documentation Comprehensive Update
**Severity:** P2 MEDIUM | **Skill:** Documentation | **Complexity:** High
**Description:** Docs/ directory exists but needs audit for completeness. Missing: runbook/operations guide, ADRs, change management process.
**Fix:** Generate comprehensive system-documentation.md and update Docs/ directory.
**Agent:** Documentation Agent | **Status:** IN_PROGRESS

### DOC-004: CONTRIBUTING.md Missing
**Severity:** P2 MEDIUM | **Skill:** Documentation | **Complexity:** Low
**Description:** No contribution guide for new developers.
**Fix:** Create CONTRIBUTING.md with development setup, coding standards, PR process.
**Agent:** Documentation Agent | **Status:** OPEN

### DOC-005: CHANGELOG.md Missing
**Severity:** P2 MEDIUM | **Skill:** Documentation | **Complexity:** Low
**Description:** No changelog file. Release workflow generates notes but no persistent changelog.
**Fix:** Create CHANGELOG.md and update release workflow to maintain it.
**Agent:** Documentation Agent | **Status:** OPEN

### UK-001: Verify All US Code Removed
**Severity:** P2 MEDIUM | **Skill:** Compliance | **Complexity:** Low
**Description:** Migration 0186 renamed US fields. Verify no residual US-specific logic remains in application code.
**Dependencies:** None
**Agent:** Compliance Agent | **Status:** IN_PROGRESS (security audit agent checking)

### HR-001: Client Portal Module Integration
**Severity:** P2 MEDIUM | **Skill:** Full-Stack | **Complexity:** High
**Files:** `packages/api/src/modules/client-portal/`
**Description:** Client portal module exists but needs integration testing and frontend completion. (Note: the marketing Website directory has been moved to a separate repository.)
**Agent:** Full-Stack Agent | **Status:** OPEN

### HR-002: Payroll Integration Module
**Severity:** P2 MEDIUM | **Skill:** Backend | **Complexity:** High
**Description:** Payroll module exists but UK payroll integration (HMRC RTI, PAYE) needs validation.
**Agent:** Backend Agent | **Status:** OPEN

---

## Summary

| Priority | Total | Resolved | Remaining |
|----------|-------|----------|-----------|
| P0 CRITICAL | 7 | 7 (all fixed or pre-resolved) | **0** |
| P1 HIGH | 9 | 3 | **6** |
| P2 MEDIUM | 20 | 1 | **19** |
| P3 LOW | 5 | 0 | **5** |
| **Total** | **41** | **11** | **30** |

## Agent Assignments

| Agent | Tasks | Status |
|-------|-------|--------|
| Security Agent | SEC-001✅, SEC-002✅, SEC-003, ARCH-005 | 2/4 done |
| Database Agent | DB-001✅, DB-002, DB-003✅, DB-004 | 2/4 done |
| Architecture Agent | ARCH-001✅, ARCH-002✅, ARCH-004 | 2/3 done |
| Refactor Agent | ARCH-003, ARCH-006, CODE-001, CODE-002, CODE-003, CODE-004 | 0/6 done |
| Testing Agent | TEST-001, TEST-002, TEST-003, CICD-002 | 0/4 done |
| Performance Agent | PERF-001, PERF-002, PERF-003, PERF-004, PERF-005, PERF-006 | 0/6 done |
| DevOps Agent | DEPLOY-001✅, INFRA-001✅, INFRA-002✅, CICD-001, CICD-003 | 3/5 done |
| Documentation Agent | DOC-001, DOC-002, DOC-003, DOC-004, DOC-005 | 0/5 done |
| Compliance Agent | UK-001 | 0/1 done |
| Full-Stack Agent | HR-001, HR-002 | 0/2 done |

## CI/CD Pipeline Status

| Pipeline | File | Status |
|----------|------|--------|
| PR Check (typecheck + lint + Docker) | `pr-check.yml` | ✅ DONE |
| Full Test Suite (coverage gates) | `test.yml` | ✅ DONE |
| Security Scan (audit + Trivy + TruffleHog) | `security.yml` | ✅ DONE |
| CodeQL Static Analysis | `codeql.yml` | ✅ DONE |
| Migration Validation (naming + RLS) | `migration-check.yml` | ✅ DONE |
| Release Automation (tag-based) | `release.yml` | ✅ DONE |
| Deploy (staging auto + production manual) | `deploy.yml` | ✅ DONE |
| Stale Issue/PR Cleanup | `stale.yml` | ✅ DONE |
| E2E Tests | — | ❌ MISSING |
| Performance Regression | — | ❌ MISSING |

---

## Related Documents

- [Roadmap](roadmap.md) — Product roadmap and release timeline
- [Kanban Board](kanban-board.md) — Work item tracking across all domains
- [Risk Register](risk-register.md) — Project risks and mitigation plans
- [Master TODO](../audit/MASTER_TODO.md) — Audit-derived TODO items
- [Tickets](../project-analysis/tickets.md) — Development tickets from code audit
- [Final System Report](../audit/FINAL_SYSTEM_REPORT.md) — Consolidated audit scores and findings
- [Technical Debt Report](../audit/technical-debt-report.md) — Structural debt assessment
