# Project Learning & Knowledge Log

## Purpose

This file stores **discoveries, debugging knowledge, failed attempts, and performance insights** discovered while working in the repository.

It acts as a **knowledge base of lessons learned** so future agents do not repeat the same mistakes.

Entries are appended chronologically within each category. Each entry follows the standard Learning Entry format.

---

## Architecture Learnings

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Architecture

Context: Full codebase audit with 8 parallel agents covering security, performance, architecture, bugs, database, tests, frontend, infrastructure.

Problem: `@hris/shared` package is unused in production — zero imports from any module service or route. State machines, error codes, types, and utilities are all dead code. Each module re-implements `ServiceResult<T>`, `TenantContext`, error codes, and state machine transitions locally, with subtle divergences.

Root Cause: Modules were built incrementally. HR module was the gold standard; later modules (talent, LMS, cases, onboarding, portal) increasingly deviated — some skip the service/repository layers entirely and inline raw SQL in routes.

Solution: Refactor modules to import shared types/state-machines. Talent (1150-line routes.ts with all SQL inline) and portal need service/repository extraction.

Prevention: New modules must import from `@hris/shared`. Code review should reject duplicate type definitions.

Affected Files: All `packages/api/src/modules/*/service.ts`, `packages/shared/src/`

Notes: The talent module has no service.ts or repository.ts at all. Cases, LMS, and onboarding routes bypass their own service layers for some operations.

---

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Architecture

Context: Outbox pattern compliance audit across all modules.

Problem: Cases, LMS, and onboarding services write domain events in a SEPARATE transaction from the business write, violating the outbox pattern. The `emitDomainEvent()` helper in these 3 modules opens a new `db.withTransaction()` and silently swallows errors in a catch block. Talent module emits zero domain events.

Root Cause: The `emitDomainEvent` helper was written without accepting the transaction handle as a parameter, unlike the HR module's correct `emitEvent(tx, ...)` pattern.

Solution: Pass the `tx` object from the business transaction into the outbox write. Follow the HR module pattern. Add outbox events to talent module.

Prevention: All domain event writes must use the transaction handle from the enclosing business operation. Never open a separate transaction for outbox writes.

Affected Files: `packages/api/src/modules/cases/service.ts:548-575`, `lms/service.ts:505-533`, `onboarding/service.ts:521-548`, `talent/routes.ts` (missing entirely)

Notes: The HR module and benefits module do this correctly. Use them as reference implementations.

---

## Debugging Learnings

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Security

Context: Security audit found CSRF protection is completely non-functional.

Problem: CSRF tokens are trivially forgeable (plain base64, no HMAC). The `requireCsrf()` function in auth-better.ts is an explicit no-op. Session cookies use `SameSite=Lax` which doesn't protect POST requests. Zero CSRF protection exists.

Root Cause: Legacy auth.ts generates tokens with `btoa(sessionId:timestamp)` without HMAC. auth-better.ts replaced it with a stub that does nothing. SameSite was set to Lax instead of Strict.

Solution: Implement HMAC-SHA256 CSRF tokens using CSRF_SECRET. Change SameSite to Strict. Or implement double-submit cookie pattern.

Prevention: Auth security features must have integration tests that verify they actually block attacks.

Affected Files: `packages/api/src/plugins/auth.ts:478-495`, `plugins/auth-better.ts:470-477`, `lib/better-auth.ts:273`

Notes: Combined with hardcoded fallback secret in better-auth.ts:68 (`"development-secret-change-in-production"`), this is the highest-priority security fix.

---

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Database

Context: Database audit found broken trigger and 32 tables missing INSERT RLS policies.

Problem: (1) `0101b_jobs.sql` trigger references `app.update_updated_at()` but function is named `app.update_updated_at_column()` — every UPDATE to app.jobs will error. (2) 32 tables have RLS for SELECT/UPDATE/DELETE but no `FOR INSERT WITH CHECK` policy. (3) `analytics_widgets` has no tenant_id column at all.

Root Cause: (1) Typo in migration. (2) Later migrations (0098-0106) consistently omitted the insert policy. (3) Widget table assumed parent dashboard's RLS would cascade (it doesn't in PostgreSQL).

Solution: (1) Fix trigger name. (2) Add `tenant_isolation_insert` policy to all 32 tables. (3) Add tenant_id + RLS to analytics_widgets.

Prevention: Migration template/checklist should include: tenant_id, ENABLE RLS, FOR ALL policy, FOR INSERT policy. Review all new migrations against this checklist.

Affected Files: `migrations/0101b_jobs.sql`, `migrations/0098-0106` (benefits, succession, competencies, equipment, geofence, delegation, reports)

Notes: Also found bootstrap functions (update_updated_at_column, is_system_context) are defined in docker/postgres/init.sql instead of migrations — non-Docker deployments will break.

---

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Testing

Context: Test coverage audit revealed most tests are hollow/fake.

Problem: Route integration tests, security tests, performance tests, chaos tests, E2E tests, and all frontend tests contain assertions against local variables, not actual API calls. Example: SQL injection "test" asserts `typeof "'; DROP TABLE" === "string"`. E2E test mutates a plain JS object. Test factories and assertion helpers are well-written but never used (0 grep results for `factories.` across all tests).

Root Cause: Tests appear to have been scaffolded with placeholder assertions that were never replaced with real HTTP calls via the TestApiClient helper.

Solution: Rewrite route tests to use `app.handle()` or `TestApiClient`. Connect to real test database. Assert HTTP status codes, response bodies, and DB side-effects.

Prevention: CI should enforce that test files actually import and use the test helpers. Consider a lint rule or test quality gate.

Affected Files: All files in `packages/api/src/test/integration/routes/`, `test/security/`, `test/performance/`, `test/chaos/`, `test/e2e/`, `packages/web/app/__tests__/`

Notes: The genuine tests (rls.test.ts, idempotency.test.ts, outbox.test.ts, effective-dating.test.ts, state-machine.test.ts, 3 service unit tests) are well-written. Only 5 of 20 modules have any route tests, and those are fake.

---

## Failed Attempts

*Solutions that were tried but failed. Recorded to prevent future agents from repeating them.*

---

## Performance Learnings

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Performance

Context: Performance audit across backend repositories and workers.

Problem: (1) Employee list query runs 3 correlated subqueries per row (position, org unit, manager) — 60+ DB ops per page. (2) Outbox processor makes 2 individual DB calls per event instead of batching. (3) Zero module-level caching despite full cache infrastructure being built and ready. (4) Export worker loads entire dataset into memory. (5) Three unbounded queries (shifts, cases, enrollments) with no LIMIT.

Root Cause: (1) Subqueries chosen over JOINs for code simplicity. (2) Sequential processing loop. (3) Cache plugin was built for auth/tenant/rbac but never extended to module repositories. (4) Streaming not implemented despite code comments claiming it. (5) Missing pagination on collection endpoints.

Solution: (1) Rewrite with LEFT JOINs. (2) Batch-update processed events with `WHERE id = ANY($1::uuid[])`. (3) Add `cache.getOrSet()` to reference data endpoints (leave types, org tree, course catalog). (4) Use postgres.js cursor streaming. (5) Add LIMIT to all collection queries.

Prevention: All new repository methods must include pagination. Cache should be considered for any reference data query.

Affected Files: `hr/repository.ts:707`, `jobs/outbox-processor.ts:193`, `plugins/cache.ts`, `jobs/export-worker.ts:559`, `time/repository.ts:372`, `cases/repository.ts:136`, `lms/repository.ts:256`

Notes: `CacheKeys.orgTree(tenantId)` is already defined but never populated. Executive Dashboard polls 5 DB queries every 60 seconds with no cache layer.

---

## Agent Workflow Improvements

*Better ways agents should operate in this repository.*

---

## Environment / Tooling Issues

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)
Category: Environment

Context: Infrastructure audit found critical config issues.

Problem: (1) `strict: false` in tsconfig.base.json with ALL strict sub-flags disabled — `strictNullChecks: false` directly caused the tenant null bug in commit 84c9460. (2) Redis has no authentication (requirepass commented out). (3) `better-auth` version skew: API declares ^1.1.10, web declares ^1.4.10. (4) `@sinclair/typebox` version skew: API has ^0.34.11, shared has ^0.32.0 (breaking changes). (5) No CI/CD pipeline exists. (6) No pre-commit hooks.

Root Cause: TypeScript strict mode was never enabled from project inception. Dependency versions drifted as packages were updated independently. CI/CD was never set up.

Solution: (1) Enable strictNullChecks immediately (highest impact). (2) Add requirepass to Redis. (3) Align better-auth to ^1.4.10 in both packages. (4) Align typebox to ^0.34.11. (5) Add GitHub Actions CI. (6) Add husky + lint-staged.

Prevention: Dependency versions should be checked for cross-package consistency. TypeScript strict mode should be enabled early in new projects.

Affected Files: `tsconfig.base.json`, `docker/redis/redis.conf`, `packages/api/package.json`, `packages/web/package.json`, `packages/shared/package.json`

Notes: ESLint also lacks type-aware rules (no `projectService` configured), so `no-floating-promises` and `no-misused-promises` are silently skipped.

---

## Entry Format Reference

Each entry must follow this format:

```
### Learning Entry

Date:
Agent:
Category:

Context:

Problem:

Root Cause:

Solution:

Prevention:

Affected Files:

Notes:
```

### Logging Rules

Agents MUST append a new entry whenever they encounter:
- Bugs or unexpected behaviour
- Architecture discoveries
- Workflow improvements
- Performance problems
- Build errors
- Hidden dependencies
- Complex debugging sessions
- Failed fix attempts

Agents must NEVER silently fix complex issues without documenting the learning.

Failed attempts MUST be recorded in the **Failed Attempts** section to prevent repetition.
