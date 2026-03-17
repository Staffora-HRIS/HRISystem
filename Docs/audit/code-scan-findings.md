# Code Scan Findings Report

**Scan Date:** 2026-03-13
**Repository:** Staffora HRIS (HRISystem)
**Scanner:** Full codebase scan for incomplete/problematic code markers

---

## Summary

| Category | Count | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Traditional Code Markers (TODO/FIXME/HACK/XXX/TEMP/UNFINISHED) | 0 | 0 | 0 | 0 | 0 |
| Mock/Hardcoded Data in Production Code | 5 | 1 | 3 | 1 | 0 |
| Missing API Endpoints (Frontend References Non-Existent Backend) | 1 | 0 | 1 | 0 | 0 |
| Frontend Pages with Simulated Operations | 3 | 0 | 2 | 1 | 0 |
| Missing Frontend Route Pages (Navigation Links to Non-Existent Pages) | 9 | 0 | 4 | 5 | 0 |
| Database Table/Column Name Mismatches | 1 | 1 | 0 | 0 | 0 |
| DB Tables with No API Module (Migrations Exist, No CRUD Routes) | 5 | 0 | 3 | 2 | 0 |
| Architecture Pattern Violations | 3 | 0 | 0 | 3 | 0 |
| Type Safety Concerns (`as any` Casts) | 6 | 0 | 0 | 6 | 0 |
| Dead/Orphaned Code | 2 | 0 | 0 | 1 | 1 |
| Unimplemented Features Flagged in UI | 4 | 0 | 1 | 3 | 0 |
| Logging Concerns (console.log in Production) | 74 | 0 | 0 | 1 | 0 |
| **TOTALS** | **108** | **2** | **14** | **23** | **1** |

---

## Category 1: Traditional Code Markers

**Count: 0**

No TODO, FIXME, HACK, TEMP, XXX, or UNFINISHED comments found in any `.ts`, `.tsx`, or `.sql` files across `packages/` or `migrations/`. The codebase is clean of these standard markers.

---

## Category 2: Mock/Hardcoded Data in Production Code

### F-001: Tenant Settings Page Returns Mock Data (CRITICAL)
- **File:** `packages/web/app/routes/(admin)/settings/tenant/route.tsx`
- **Lines:** 74-86
- **Code:** `// Return mock data for now` followed by hardcoded tenant object with `id: "tenant-1"`, `name: "Acme Corporation"`
- **Context:** The `queryFn` for tenant settings returns a static object instead of calling the backend `/tenant/settings` endpoint (which does exist in the backend).
- **Impact:** Tenant settings page displays fake data and cannot load real tenant configuration.

### F-002: Tenant Settings Save is Simulated (HIGH)
- **File:** `packages/web/app/routes/(admin)/settings/tenant/route.tsx`
- **Lines:** 90-96
- **Code:** `// Simulate save` with `await new Promise((resolve) => setTimeout(resolve, 1000));`
- **Context:** The save handler in tenant settings page uses a 1-second setTimeout instead of making a PUT/PATCH API call. Shows success toast without persisting changes.
- **Impact:** Users believe settings are saved but nothing is persisted.

### F-003: Notification Settings Save is Simulated (HIGH)
- **File:** `packages/web/app/routes/(admin)/settings/notifications/route.tsx`
- **Lines:** 69-75
- **Code:** `// Simulate save` with `await new Promise((resolve) => setTimeout(resolve, 1000));`
- **Context:** Same pattern as tenant settings -- save button uses setTimeout and shows success toast without any API call.
- **Impact:** Notification preferences are never persisted.

### F-004: Time Policies Page Uses Local Hardcoded Data (HIGH)
- **File:** `packages/web/app/routes/(admin)/time/policies/route.tsx`
- **Lines:** 54-88
- **Code:** `// Local data -- the /api/v1/time/policies endpoint is not yet implemented`
- **Context:** Returns two hardcoded policy objects ("Standard Office Hours" and "Flexible Remote") because the backend has no time policies endpoint.
- **Impact:** Read-only view of fake data. No ability to create, edit, or delete time policies.

### F-005: Reports Page Falls Back to Mock Data (MEDIUM)
- **File:** `packages/web/app/routes/(admin)/reports/[reportId]/route.tsx`
- **Lines:** 172-186, 238-242
- **Code:** Hardcoded `MOCK_DATA` array with sample headcount data. Falls back to mock data when API returns empty arrays or for unsupported report types.
- **Context:** The `transformReportData` function returns `MOCK_DATA` as fallback for every empty or unexpected API response. Also returns mock for the default/catch case.
- **Impact:** Users may see fake data and believe it is real when the analytics API returns no data.

---

## Category 3: Missing Backend API Endpoints

### F-006: Time Policies Endpoint Not Implemented (HIGH)
- **File:** Backend: `packages/api/src/modules/time/routes.ts` (no `/policies` section)
- **Referenced by:** `packages/web/app/routes/(admin)/time/policies/route.tsx:55`
- **Context:** The frontend explicitly comments that `/api/v1/time/policies` is not yet implemented. The backend `time` module has routes for: Time Events, Schedules, Shifts, Timesheets, and Schedule Assignments -- but no Policies section.
- **Impact:** No backend support for time policies CRUD operations.

---

## Category 4: Frontend Pages with Simulated Operations

### F-007: Integrations Page is Entirely Static (HIGH)
- **File:** `packages/web/app/routes/(admin)/settings/integrations/route.tsx`
- **Lines:** 38-86 (hardcoded integration list), 186-199 (handlers)
- **Context:** The entire integrations page is a static UI with hardcoded integration objects (Azure AD, Okta, ADP, Paychex, Slack, etc.). The `handleConnect`, `handleDisconnect`, and `handleSaveConfig` functions only show toast messages without making any API calls. No `useQuery`, `useMutation`, `api`, or `fetch` calls exist.
- **Impact:** Purely cosmetic page. No actual integration connectivity.

### F-008: Notification Settings Page Has No API Connectivity (HIGH)
- **File:** `packages/web/app/routes/(admin)/settings/notifications/route.tsx`
- **Lines:** 1-95
- **Context:** Renders notification preference toggles from a local constant array. Save handler is simulated (see F-003). No query/mutation hooks or API calls.
- **Impact:** Users can toggle notification settings but nothing persists.

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

### F-019: manager.service.ts Uses Wrong Table and Column Names (CRITICAL)
- **File:** `packages/api/src/modules/security/manager.service.ts`
- **Lines:** 428-444, 499-515
- **Code:**
  ```sql
  INSERT INTO app.leave_approvals (
    tenant_id, leave_request_id, approver_id, decision, comment, decided_at
  )
  ```
- **Actual table:** `app.leave_request_approvals` (defined in `migrations/0053_leave_approvals.sql:18`)
- **Actual columns:** `request_id` (not `leave_request_id`), `actor_id` (not `approver_id`), `action` (not `decision`), `created_at` (not `decided_at`)
- **Impact:** These INSERT statements will fail at runtime with a "relation does not exist" error. Manager leave approval/rejection functionality is broken.

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

## Priority Remediation Order

1. **F-019** (CRITICAL) -- Fix `leave_approvals` table/column name mismatch in `manager.service.ts`. This is a runtime error.
2. **F-001** (CRITICAL) -- Connect tenant settings page to real backend API.
3. **F-006** (HIGH) -- Implement time policies backend endpoint.
4. **F-020** (HIGH) -- Build notifications read API for user-facing notification center.
5. **F-036** (HIGH) -- Implement MFA recovery code flow.
6. **F-002, F-003** (HIGH) -- Wire up save handlers for tenant and notification settings.
7. **F-004** (HIGH) -- Wire time policies page to backend once F-006 is done.
8. **F-007, F-008** (HIGH) -- Either implement real integrations/notification settings or clearly mark as roadmap items.
9. **F-010, F-012-F-014** (HIGH) -- Create missing manager route pages.
10. **F-021, F-022** (HIGH) -- Build equipment and geofence API modules for existing DB tables.
11. **F-028-F-033** (MEDIUM) -- Migrate `ctx as any` to `ctx as unknown as RouteContext` pattern for type safety.
12. **F-034** (MEDIUM) -- Remove dead `packages/web/src/` directory and `index.html`.
13. **F-040** (MEDIUM) -- Replace console.log with structured logger.
