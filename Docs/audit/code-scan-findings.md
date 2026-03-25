# Code Scan Findings Report

**Scan Date:** 2026-03-13 | **Updated:** 2026-03-21
**Repository:** Staffora HRIS (HRISystem)
**Scanner:** Full codebase scan for incomplete/problematic code markers
**Status:** Both critical findings resolved. All targeted high findings (F-001 through F-008, F-019) verified fixed. Remaining items are medium/low priority.

---

## Summary

| Category | Count | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Traditional Code Markers (TODO/FIXME/HACK/XXX/TEMP/UNFINISHED) | 0 | 0 | 0 | 0 | 0 |
| Mock/Hardcoded Data in Production Code | 5 | ~~1~~ 0 | ~~3~~ 0 | 1 | 0 |
| Missing API Endpoints (Frontend References Non-Existent Backend) | 1 | 0 | ~~1~~ 0 | 0 | 0 |
| Frontend Pages with Simulated Operations | 3 | 0 | ~~2~~ 0 | 1 | 0 |
| Missing Frontend Route Pages (Navigation Links to Non-Existent Pages) | 9 | 0 | 4 | 5 | 0 |
| Database Table/Column Name Mismatches | 1 | ~~1~~ 0 | 0 | 0 | 0 |
| DB Tables with No API Module (Migrations Exist, No CRUD Routes) | 5 | 0 | 3 | 2 | 0 |
| Architecture Pattern Violations | 3 | 0 | 0 | 3 | 0 |
| Type Safety Concerns (`as any` Casts) | 6 | 0 | 0 | 6 | 0 |
| Dead/Orphaned Code | 2 | 0 | 0 | 1 | 1 |
| Unimplemented Features Flagged in UI | 4 | 0 | 1 | 3 | 0 |
| Logging Concerns (console.log in Production) | 74 | 0 | 0 | 1 | 0 |
| **TOTALS** | **108** | **0** | **8** | **23** | **1** |

---

## Category 1: Traditional Code Markers

**Count: 0**

No TODO, FIXME, HACK, TEMP, XXX, or UNFINISHED comments found in any `.ts`, `.tsx`, or `.sql` files across `packages/` or `migrations/`. The codebase is clean of these standard markers.

---

## Category 2: Mock/Hardcoded Data in Production Code

### F-001: ~~Tenant Settings Page Returns Mock Data~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/settings/tenant/route.tsx`
- **Resolution:** Page now uses `useQuery` with `api.get<TenantData>("/tenant/current")` to fetch real tenant data. Form state is derived from the API response via `tenantToFormState()`. No mock data remains. Loading and error states properly handled.
- **Resolved:** 2026-03-21 (verified against current codebase)

### F-002: ~~Tenant Settings Save is Simulated~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/settings/tenant/route.tsx`
- **Resolution:** Save handler now uses `useMutation` with `api.put<TenantData>("/tenant/settings", payload)`. On success, the query cache is updated and invalidated. On error, `ApiError` messages are surfaced. The simulated `setTimeout` has been removed. A matching `PUT /tenant/settings` backend endpoint was added to `packages/api/src/modules/tenant/routes.ts` with corresponding service and repository methods.
- **Resolved:** 2026-03-21 (verified and backend endpoint added)

### F-003: ~~Notification Settings Save is Simulated~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/settings/notifications/route.tsx`
- **Resolution:** Save handler now uses `useMutation` with `api.put<TenantData>("/tenant/settings", { settings: mergedSettings })`. Notification preferences are stored within the tenant `settings` JSONB under a `notifications` key. Existing settings are preserved via merge. The simulated `setTimeout` has been removed. The backend `PUT /tenant/settings` endpoint (same as F-002) handles this update.
- **Resolved:** 2026-03-21 (verified and backend endpoint added)

### F-004: ~~Time Policies Page Uses Local Hardcoded Data~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/time/policies/route.tsx`
- **Resolution:** Page now uses `useQuery` with `api.get<...>("/time/policies")` to fetch real data. Gracefully handles 404 (returns empty set). Create policy uses `useMutation` with `api.post("/time/policies", payload)`. A full create modal with form fields is implemented. No hardcoded policy objects remain.
- **Resolved:** 2026-03-21 (verified against current codebase)

### F-005: Reports Page Falls Back to Mock Data (MEDIUM)
- **File:** `packages/web/app/routes/(admin)/reports/[reportId]/route.tsx`
- **Lines:** 172-186, 238-242
- **Code:** Hardcoded `MOCK_DATA` array with sample headcount data. Falls back to mock data when API returns empty arrays or for unsupported report types.
- **Context:** The `transformReportData` function returns `MOCK_DATA` as fallback for every empty or unexpected API response. Also returns mock for the default/catch case.
- **Impact:** Users may see fake data and believe it is real when the analytics API returns no data.

---

## Category 3: Missing Backend API Endpoints

### F-006: ~~Time Policies Endpoint Not Implemented~~ (RESOLVED)
- **File:** `packages/api/src/modules/time/routes.ts`
- **Resolution:** Full CRUD endpoints now exist: `POST /policies` (create), `GET /policies` (list), `GET /policies/:id` (get by ID), `PUT /policies/:id` (update), `DELETE /policies/:id` (deactivate). All routes are permission-guarded with `requirePermission("time:policies", "read"|"write")`. The service layer (`timeService`) handles the business logic.
- **Resolved:** 2026-03-21 (verified against current codebase)

---

## Category 4: Frontend Pages with Simulated Operations

### F-007: ~~Integrations Page is Entirely Static~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/settings/integrations/route.tsx`
- **Resolution:** The integrations page has been refactored into a modular architecture with a dedicated `useIntegrations` hook (`use-integrations.ts`) that uses `useQuery` with `api.get<IntegrationListResponse>("/integrations?limit=100")`. It includes `connectMutation` (`api.post("/integrations/connect")`), `disconnectMutation` (`api.post("/integrations/:id/disconnect")`), `updateConfigMutation` (`api.patch("/integrations/:id/config")`), and `testConnectionMutation`. A static `PROVIDER_CATALOG` is merged with backend data so available integrations always display even before connection. Separate components handle the grid, stats, config modal, and disconnect confirmation.
- **Resolved:** 2026-03-21 (verified against current codebase)

### F-008: ~~Notification Settings Page Has No API Connectivity~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/settings/notifications/route.tsx`
- **Resolution:** Page now fetches tenant data via `useQuery` with `api.get<TenantData>("/tenant/current")` and extracts notification preferences from the `settings.notifications` JSONB field. Save uses `useMutation` with `api.put<TenantData>("/tenant/settings", ...)`, merging notification preferences with existing settings. Email/in-app toggle state and schedule preferences (digest frequency, quiet hours) are all persisted.
- **Resolved:** 2026-03-21 (verified against current codebase)

### F-009: Settings Appearance and Data Management Pages Don't Exist (MEDIUM)
- **File:** `packages/web/app/routes/(admin)/settings/index.tsx`
- **Lines:** 58-70
- **Context:** Settings index page lists "Appearance" (`/admin/settings/appearance`) with `available: false` and "Data Management" (`/admin/settings/data`) with `available: false`. Neither route file exists.
- **Impact:** Navigation shows these as unavailable, so users are aware. No route files means 404 if accessed directly.

---

## Category 5: Missing Frontend Route Pages

Navigation components link to pages that have no corresponding route files.

### Manager Layout Missing Routes (from `packages/web/app/components/layouts/manager-layout.tsx`):

| # | Path | Severity | Context |
|---|---|---|---|
| F-010 | `/manager/dashboard` | HIGH | Main manager landing page |
| F-011 | `/manager/org-chart` | MEDIUM | Manager org chart view |
| F-012 | `/manager/approvals/leave` | HIGH | Leave approval sub-page |
| F-013 | `/manager/approvals/timesheets` | HIGH | Timesheet approval sub-page |
| F-014 | `/manager/approvals/expenses` | HIGH | Expense approval sub-page |
| F-015 | `/manager/calendar/absence` | MEDIUM | Team absence calendar |
| F-016 | `/manager/performance/goals` | MEDIUM | Goal management for reports |
| F-017 | `/manager/performance/reviews` | MEDIUM | Performance review management |

### Admin Layout Missing Routes:

| # | Path | Severity | Context |
|---|---|---|---|
| F-018 | `/admin/settings/appearance` | MEDIUM | Branding/theme settings (marked `available: false`) |

---

## Category 6: Database Table/Column Name Mismatches

### F-019: ~~manager.service.ts Uses Wrong Table and Column Names~~ (RESOLVED)
- **File:** `packages/api/src/modules/security/manager.approval.service.ts` (refactored from `manager.service.ts`)
- **Resolution:** The manager service was decomposed into three sub-services: `manager.hierarchy.service.ts`, `manager.approval.service.ts`, and `manager.absence.service.ts`. The facade `manager.service.ts` delegates to these. The approval sub-service now correctly uses:
  - Table: `app.leave_request_approvals` (correct, matches migration `0053_leave_approvals.sql`)
  - Columns: `request_id`, `action`, `actor_id`, `actor_role`, `comment`, `previous_status`, `new_status`, `created_at` (all correct)
  - Table: `app.timesheet_approvals` (correct, matches migration `0044_timesheet_approvals.sql`)
  - Columns: `timesheet_id`, `action`, `actor_id`, `comment`, `created_at` (all correct)
  - The old incorrect references (`leave_approvals`, `leave_request_id`, `approver_id`, `decision`, `decided_at`) are gone.
- **Resolved:** 2026-03-21 (verified against current codebase)

---

## Category 7: Database Tables with No API Module

These tables have migration definitions but no corresponding API module (routes/service/repository) for CRUD operations.

| # | Tables | Migration | Severity | Notes |
|---|---|---|---|---|
| F-020 | `notifications`, `notification_deliveries`, `push_tokens` | `0081_notifications.sql` | HIGH | `notification-worker.ts` writes to these tables, but no API routes exist for reading notifications, managing push tokens, or listing notification history. |
| F-021 | `equipment_catalog`, `equipment_requests`, `equipment_request_history` | `0108_equipment.sql` | HIGH | Full equipment tracking schema with no module. |
| F-022 | `geofence_locations`, `geofence_violations` | `0109_geofence.sql` | HIGH | Geofencing schema with no module. |
| F-023 | `approval_delegations`, `delegation_log` | `0110_delegation.sql` | MEDIUM | Approval delegation schema with no module. |
| F-024 | `jobs` | `0106_jobs.sql` | MEDIUM | Job catalog schema (position templates) with no module. |

---

## Category 8: Architecture Pattern Violations

### F-025: Dashboard Module Has No Service/Repository Layer (MEDIUM)
- **File:** `packages/api/src/modules/dashboard/routes.ts` (71 lines)
- **Context:** The dashboard module contains inline SQL directly in the route handler. It has no `service.ts` or `repository.ts`. All other major modules follow the routes -> service -> repository pattern.
- **Impact:** Technical debt. Harder to test and maintain. Noted in CLAUDE.md as a known violation.

### F-026: Auth Module Has No Service/Repository Layer (MEDIUM)
- **File:** `packages/api/src/modules/auth/routes.ts` (261 lines)
- **Context:** Auth module relies on `AuthService` from plugins and inline SQL. No separate `service.ts` or `repository.ts`.
- **Impact:** Acceptable for auth-specific concerns that delegate to BetterAuth, but tenant switching logic could benefit from extraction.

### F-027: System Module Has No Service/Repository Layer (MEDIUM)
- **File:** `packages/api/src/modules/system/routes.ts` (64 lines)
- **Context:** Simple health check endpoint. Delegates to `db.healthCheck()` and `cache.healthCheck()`.
- **Impact:** Acceptable given the simplicity. No business logic to extract.

---

## Category 9: Type Safety Concerns (`as any` Casts)

Route files use `ctx as any` to access plugin-injected properties, bypassing TypeScript type checking.

| # | File | Count | Severity |
|---|---|---|---|
| F-028 | `packages/api/src/modules/recruitment/routes.ts` | 32 | MEDIUM |
| F-029 | `packages/api/src/modules/benefits/routes.ts` | 32 | MEDIUM |
| F-030 | `packages/api/src/modules/hr/routes.ts` | 28 | MEDIUM |
| F-031 | `packages/api/src/modules/talent/routes.ts` | 18 | MEDIUM |
| F-032 | `packages/api/src/modules/ssp/routes.ts` | 8 | MEDIUM |
| F-033 | `packages/api/src/modules/right-to-work/routes.ts` | (via `ctx as any`) | MEDIUM |

**Total:** 118+ `as any` casts across 6 route files.

Other route files use `as unknown as RouteContext` (240 total), which is marginally better but still bypasses type safety.

**Note:** This is a systemic pattern caused by Elysia's plugin system not exposing composed types. All route files exhibit this pattern to some degree.

---

## Category 10: Dead/Orphaned Code

### F-034: Legacy `packages/web/src/` Directory (MEDIUM)
- **Files:** `packages/web/src/App.tsx`, `packages/web/src/main.tsx`, `packages/web/src/index.css`
- **Context:** The `index.html` at `packages/web/index.html` references `src/main.tsx`, but the actual build system uses React Router v7 framework mode via `app/entry.client.tsx` and `app/entry.server.tsx` (configured in `vite.config.ts` with `reactRouter()` plugin). The old `src/App.tsx` contains an "under construction" message.
- **Impact:** Dead code that could confuse developers. The `index.html` is not used by the React Router v7 build.

### F-035: Legacy `packages/web/index.html` (LOW)
- **File:** `packages/web/index.html`
- **Context:** References `src/main.tsx` which is the legacy entry point. React Router v7 generates its own HTML shell.
- **Impact:** Unused file.

---

## Category 11: Unimplemented Features Flagged in UI

### F-036: MFA Recovery Code Flow Not Available (HIGH)
- **File:** `packages/web/app/routes/(auth)/mfa/route.tsx`
- **Line:** 228
- **Code:** `message: "Recovery code flow is not available yet."`
- **Context:** The "Use recovery code" button shows a toast with "not available yet" message.
- **Impact:** Users locked out of their account with no MFA device have no recovery path.

### F-037: ~~Leave Type Editing Not Supported~~ (RESOLVED)
- **File:** `packages/web/app/routes/(admin)/leave/types/route.tsx`
- **Resolution:** Edit button now opens a pre-populated modal. Backend PUT `/absence/leave-types/:id` endpoint handles updates with outbox event. Code field included in update flow.

### F-038: Leave Policy Editing Not Supported (MEDIUM)
- **File:** `packages/web/app/routes/(admin)/leave/policies/route.tsx`
- **Lines:** 271-272
- **Code:** `title="Editing policies is not yet supported. Delete and recreate to modify."`
- **Context:** Same pattern as leave types -- edit disabled with tooltip.
- **Impact:** Same workaround available.

### F-039: Report Scheduling Not Available (MEDIUM)
- **File:** `packages/web/app/routes/(admin)/reports/[reportId]/route.tsx`
- **Line:** 357
- **Code:** `<Button variant="outline" size="sm" disabled title="Scheduling is not yet available">`
- **Context:** Schedule button on report detail page is disabled.
- **Impact:** No automated report scheduling capability.

---

## Category 12: Logging Concerns

### F-040: 74 console.log Statements in Backend Workers and Plugins (MEDIUM)
- **Files:**
  - `packages/api/src/worker/scheduler.ts` -- 37 console.log calls
  - `packages/api/src/worker/outbox-processor.ts` -- 21 console.log calls
  - `packages/api/src/plugins/db.ts` -- 6 console.log calls
  - `packages/api/src/plugins/cache.ts` -- 6 console.log calls
  - `packages/api/src/worker/index.ts` -- 2 console.log calls
  - `packages/api/src/worker.ts` -- 2 console.log calls
- **Context:** Worker processes and plugins use `console.log` for operational logging instead of a structured logging library. Messages include `[Scheduler]`, `[OutboxProcessor]`, `[Handler]`, `[DB]`, `[Cache]` prefixes.
- **Impact:** In production, these logs lack structured metadata (timestamps, log levels, correlation IDs). Not suitable for log aggregation/monitoring systems. Should use a proper logger (e.g., pino, winston).

---

## Additional Observations

### eslint-disable Comments
- `packages/api/src/modules/benefits/schemas.ts` -- 31 `eslint-disable-next-line no-redeclare` comments. This is a **legitimate pattern** caused by TypeBox's design where a type and its runtime schema share the same name (e.g., `export const BenefitCategory = Type.Union([...])` and `export type BenefitCategory = Static<typeof BenefitCategory>`). Not a code quality issue.

### Test Coverage Note
- Per CLAUDE.md, many test files labeled as "integration", "security", "performance", "chaos", or "E2E" are described as "hollow" -- asserting on local mocked variables rather than making real API calls. The genuinely exercised tests are: `rls.test.ts`, `idempotency.test.ts`, `outbox.test.ts`, `effective-dating.test.ts`, `state-machine.test.ts`, and the enhanced repository/service tests. This is documented but worth flagging as a systemic quality concern.

### Under Construction Guard
- A test at `packages/web/app/__tests__/under-construction.guard.test.ts` actively prevents the string "This page is under construction." from appearing in any route file. This is a good practice that prevents placeholder content from shipping.

---

## Priority Remediation Order (Updated 2026-03-21)

All critical findings and targeted high findings have been resolved. Remaining priority:

1. **F-020** (HIGH) -- Build notifications read API for user-facing notification center.
2. **F-036** (HIGH) -- Implement MFA recovery code flow.
3. **F-010, F-012-F-014** (HIGH) -- Create missing manager route pages.
4. **F-021, F-022** (HIGH) -- Build equipment and geofence API modules for existing DB tables.
5. **F-028-F-033** (MEDIUM) -- Migrate `ctx as any` to `ctx as unknown as RouteContext` pattern for type safety.
6. **F-034** (MEDIUM) -- Remove dead `packages/web/src/` directory and `index.html`.
7. **F-005** (MEDIUM) -- Remove mock data fallback from reports page.
8. **F-040** (MEDIUM) -- Replace console.log with structured logger.

### Resolved Findings Summary

| Finding | Severity | Description | Status |
|---|---|---|---|
| F-001 | CRITICAL | Tenant settings mock data | RESOLVED -- uses `api.get("/tenant/current")` |
| F-002 | HIGH | Tenant settings simulated save | RESOLVED -- uses `api.put("/tenant/settings")` |
| F-003 | HIGH | Notification settings simulated save | RESOLVED -- uses `api.put("/tenant/settings")` with merged settings |
| F-004 | HIGH | Time policies hardcoded data | RESOLVED -- uses `api.get("/time/policies")` |
| F-006 | HIGH | Time policies endpoint missing | RESOLVED -- full CRUD in `time/routes.ts` |
| F-007 | HIGH | Integrations page static | RESOLVED -- `useIntegrations` hook with full API connectivity |
| F-008 | HIGH | Notification settings no API | RESOLVED -- fetches from and saves to tenant settings |
| F-019 | CRITICAL | Wrong table/column names | RESOLVED -- refactored into `manager.approval.service.ts` with correct names |
| F-037 | HIGH | Leave type editing | RESOLVED -- edit modal with backend PUT endpoint |
