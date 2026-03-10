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

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (backend bug fix session)
Category: Debugging

Context: Four API endpoints returning 500 Internal Server Error at runtime.

Problem: (1) Benefits /stats endpoint referenced `app.benefit_life_events` table which does not exist (actual table is `app.life_events` from migration 0100). (2) Recruitment /requisitions repository used `this.db.query` (raw query without tenant context) which fails RLS since `app.current_tenant` session variable is never set. (3) Succession /pipeline/stats inline SQL used `sc.readiness_level` column name, but the actual column in `app.succession_candidates` (migration 0101) is named `readiness`. (4) Security /roles used `jsonb_object_length(r.permissions)` which fails on non-object JSON values; replaced with a subquery count from `app.role_permissions` table.

Root Cause: (1) Wrong table name in inline SQL. (2) Repository method pattern inconsistency -- some methods use `db.withTransaction` (which sets tenant context for RLS) while others use `db.query` (which does not). The `hris_app` role has `NOBYPASSRLS`, so all queries must set the tenant context first. (3) Column name typo in inline SQL (only in routes.ts; the repository.ts uses the correct `readiness` column name). (4) `jsonb_object_length` is fragile when permissions column might not be a JSON object.

Solution: (1) Changed `app.benefit_life_events` to `app.life_events`. (2) Changed `db.query` to `db.withTransaction` with proper tenant context and `tx` template tag for dynamic conditions. (3) Changed `sc.readiness_level` to `sc.readiness`. (4) Replaced `jsonb_object_length` with subquery `SELECT COUNT(*)::int FROM app.role_permissions rp WHERE rp.role_id = r.id`.

Prevention: Inline SQL in route files is error-prone -- prefer using service/repository methods that are already tested. When writing SQL, verify column and table names against the migration files. Always use `db.withTransaction` (not `db.query`) for tenant-scoped data to ensure RLS context is set.

Affected Files: `packages/api/src/modules/benefits/routes.ts`, `packages/api/src/modules/recruitment/repository.ts`, `packages/api/src/modules/succession/routes.ts`, `packages/api/src/modules/security/routes.ts`

Notes: The recruitment repository has the same `db.query` vs `db.withTransaction` issue in other methods (`getRequisitionById`, `getRequisitionStats`, `updateRequisition`, `listCandidates`, `getCandidateById`, `createCandidate`, `updateCandidate`, `advanceCandidateStage`, `getRequisitionPipeline`, `getCandidateStats`). These will also fail at runtime when RLS is enforced.

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

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (second verification pass)
Category: Architecture

Context: Second full review after the initial comprehensive fix session, looking for anything still unimplemented.

Problem: (1) Frontend leave request reject calls `/absence/requests/{id}/reject` which doesn't exist — backend uses single `/approve` endpoint with `action` body parameter. (2) Leave module has no index route — navigating to `/admin/leave` returns 404. (3) Inline SQL in benefits/stats, documents/my-summary, succession/pipeline/stats routes instead of service layers. (4) Security main routes (11 queries) and tenant routes (2 queries) had no service/repository layers. (5) Workflows (14 routes) and time (10 routes) modules missing RBAC `requirePermission()` guards. (6) Frontend `/time/stats` and `/time/schedule-assignments` call API endpoints that don't exist on backend.

Root Cause: (1) Frontend was built assuming separate approve/reject endpoints; backend uses single endpoint with action discriminator. (2) Leave prefix in routes.ts was missing `index()` registration. (3-4) Later modules were built with inline SQL shortcuts. (5) Same RBAC gap pattern found in earlier audit for LMS/cases/onboarding. (6) Frontend UI scaffolded ahead of backend implementation.

Solution: (1) Fixed frontend to POST to `/approve` with `{action: "approve"}` or `{action: "reject"}` body. (2) Created leave/index.tsx landing page and registered it in routes.ts. (3) Moved inline SQL to proper repository→service→route chain for benefits, documents, succession. (4) Created security/service.ts, security/repository.ts, tenant/service.ts, tenant/repository.ts with full service layers. (5) Added `requirePermission()` guards to all workflows and time routes. (6) Added `/time/stats` and `/time/schedule-assignments` backend endpoints with proper service/repository layers.

Prevention: When creating frontend pages, always verify the API endpoints exist on the backend first. All route prefixes need an index route. All route modules must use requirePermission().

Affected Files: `leave/requests/route.tsx`, `leave/index.tsx`, `routes.ts`, `benefits/{routes,service,repository}.ts`, `documents/{routes,service,repository}.ts`, `succession/{routes,service,repository}.ts`, `security/{routes,service,repository}.ts`, `tenant/{routes,service,repository}.ts`, `workflows/routes.ts`, `time/{routes,service,repository}.ts`

Notes: Self-service "my" endpoints (portal, documents/my-summary, benefits/my-enrollments) correctly use requireAuthContext/requireTenantContext instead of requirePermission. Reports pages use mock data but analytics backend endpoints exist — connecting them is a feature integration task, not a bug fix.

---

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (comprehensive fix session)
Category: Architecture

Context: Systematic fix of all issues identified by the 8-agent codebase audit.

Problem: Multiple runtime-breaking issues across the codebase: (1) 10/12 recruitment repository methods using `db.query` instead of `db.withTransaction`, breaking RLS. (2) Same `db.query` issue in succession (6 methods), competencies (8 methods), analytics (10 methods), documents (4 methods), security portal service (3 methods), and HR service (3 org chart methods). (3) Talent service `emitDomainEvent` using separate transaction from business writes, violating outbox pattern. (4) Benefits /stats endpoint referencing non-existent `app.benefit_life_events` table. (5) Migration 0101b_jobs.sql trigger referencing wrong function name `app.update_updated_at()`. (6) LMS, cases, and onboarding routes missing RBAC `requirePermission()` guards.

Root Cause: Modules were built at different times with inconsistent patterns. `db.query` was used as a shortcut that bypasses RLS context. Talent service followed a broken outbox pattern from early module implementations.

Solution: (1) Converted all `db.query` calls to `db.withTransaction(ctx, async (tx) => { ... })` across 8 files. (2) Refactored talent service `emitDomainEvent` to accept `tx` parameter and wrapped all mutating service methods in `db.withTransaction` to make outbox writes atomic. (3) Changed `app.benefit_life_events` to `app.life_events`. (4) Changed `app.update_updated_at()` to `app.update_updated_at_column()` in migration. (5) Added `requirePermission()` guards to all LMS, cases, and onboarding routes.

Prevention: All new repository methods MUST use `db.withTransaction(ctx, ...)` never `db.query`. All service methods that emit domain events MUST pass the `tx` handle. All route modules MUST use `requirePermission()` guards, not just `requireAuthContext/requireTenantContext`.

Affected Files: `recruitment/repository.ts`, `succession/repository.ts`, `competencies/repository.ts`, `analytics/repository.ts`, `documents/repository.ts`, `security/portal.service.ts`, `hr/service.ts`, `talent/service.ts`, `benefits/routes.ts`, `lms/routes.ts`, `cases/routes.ts`, `onboarding/routes.ts`, `migrations/0101b_jobs.sql`

Notes: The outbox pattern was already correctly fixed in cases, LMS, and onboarding services (they pass `tx` to `emitDomainEvent`). Only talent service still had the broken pattern. Portal module is read-only so no outbox needed. The `FOR ALL USING(...)` RLS pattern in migrations 0098-0106 actually does cover INSERT operations (PostgreSQL applies USING as WITH CHECK when no explicit WITH CHECK is provided).

---

### Learning Entry

Date: 2026-03-10
Agent: Claude Code (third review pass)
Category: Architecture

Context: Third comprehensive codebase review found critical schema mismatches where repository code references tables/columns that don't exist in migrations.

Problem: (1) Talent `repository.ts` references `app.review_cycles` table — actual table is `app.performance_cycles` (5 locations). Column `review_cycle_id` should be `cycle_id`. Columns `period_start/period_end` should be `start_date/end_date`. Columns `self_review_deadline/manager_review_deadline/calibration_deadline` should be `review_start/review_end/calibration_start`. (2) LMS `repository.ts` references `app.course_enrollments` — actual table is `app.assignments` (11 locations). Column `enrolled_at` should be `assigned_at`. Column `progress` should be `progress_percent`. Status value `enrolled` should be `not_started`. Status value `cancelled` should be `expired`. (3) Workflows `repository.ts` references `app.workflow_step_instances` — actual table is `app.workflow_tasks` (7 locations) with different column names: `workflow_instance_id`→`instance_id`, `step_key`→stored in `context` jsonb, `assignee_id`→`assigned_to`, `decision`→`completion_action`, `comments`→`completion_comment`. Additionally, `workflow_definitions` table has no `steps`, `status`, or `version` columns (steps are in `workflow_versions` table), and `workflow_instances` uses `definition_id` not `workflow_definition_id`, `created_by` not `initiator_id`, `current_step_index` not `current_step_key`. (4) Worker `scheduler.ts` references `app.performance_reviews` — actual table is `app.reviews`. Also uses columns `self_review_deadline/manager_review_deadline` that don't exist in `performance_cycles`. (5) `domain-event-handlers.ts` inserts into `app.analytics_events` which has no migration. (6) Time `service.ts` uses `this.repository` but constructor stores it as `this.repo`. (7) Competencies `routes.ts` missing all RBAC `requirePermission()` guards on 15 routes. (8) Manager approvals frontend calls non-existent `/reject` endpoints — should use `/approve` with `{action: "reject"}`. (9) Dashboard `routes.ts` has inline SQL. (10) Benefits `routes.ts` has inline SQL in self-service endpoints.

Root Cause: Repository code was written with assumed table names that don't match the actual migration schemas. Modules were scaffolded assuming simplified schemas (e.g., workflows assumed `steps` on `definitions` table, but they're actually in a separate `workflow_versions` table). The LMS module was built assuming a `course_enrollments` table, but the migration created `assignments` with a different status enum (`completion_status` vs assumed enrollment statuses).

Solution: All 8 critical fixes completed: (1) talent repository table/column names, (2) LMS repository table/column names and status enums, (3) workflows repository fully rewritten — definitions now JOIN `workflow_versions` for steps, use `is_active` boolean; instances use `definition_id`/`version_id`/`context`/`current_step_index`/`created_by`; service formatters updated to map between DB and API field names, (4) scheduler table names and columns, (5) replaced analytics_events INSERT with log statement, (6) `this.repository`→`this.repo` in time service, (7) added `requirePermission()` to all 15 competencies routes, (8) fixed manager approvals reject to use `/approve` with `{action: "reject"}`. Items (9-10) inline SQL in dashboard/benefits routes remain as lower priority — functional but pattern violations.

Prevention: When creating a repository, ALWAYS read the migration SQL first to verify exact table names, column names, and enum values. Never assume table/column names — verify against migrations/NNNN_*.sql files. The codebase has 4 tables for workflows (definitions, versions, instances, tasks), not the simplified 2-table model that was coded.

Affected Files: `talent/repository.ts`, `lms/repository.ts`, `workflows/repository.ts`, `time/service.ts`, `competencies/routes.ts`, `worker/scheduler.ts`, `jobs/domain-event-handlers.ts`, `manager/approvals/route.tsx`, `dashboard/routes.ts`, `benefits/routes.ts`

Notes: Workflow module has the deepest mismatch — the entire definitions/instances layer references non-existent columns. The `workflow_definitions` table uses `is_active` boolean (not `status`), has no `steps` or `version` columns. The `workflow_instances` table uses `definition_id`, `version_id`, `created_by`, `current_step_index`, `context` — none of which match the repository's column names.

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
