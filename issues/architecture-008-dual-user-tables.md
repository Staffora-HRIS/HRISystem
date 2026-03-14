# [ARCHITECTURE] Dual User Tables Create Data Integrity Risk

**Priority:** HIGH
**Labels:** architecture, bug
**Effort:** LARGE

## Description
Better Auth manages a `"user"` table with camelCase columns while the application uses `app.users` with snake_case columns. Database hooks synchronize between them, but sync failures can leave tables out of sync. The RLS/RBAC system queries `app.users` while Better Auth queries `"user"`, meaning a sync failure could cause auth/RBAC mismatches.

## Current State
- `packages/api/src/lib/better-auth.ts` (lines 162-241): database hooks for user sync
- `after` create hook: `INSERT ... ON CONFLICT DO UPDATE` into `app.users`
- `update.after` hook syncs user updates
- Sync hooks can fail silently
- Schema changes to either table require hook updates

## Expected State
- Single source of truth for user data
- No synchronization risk between dual tables
- Schema changes only need to happen in one place

## Acceptance Criteria
- [ ] Single user table or database view consolidating both
- [ ] Sync failure cannot cause auth/RBAC mismatches
- [ ] User data changes are atomic (no partial sync states)
- [ ] Migration path from dual tables to unified approach documented

## Implementation Notes
Option A: Configure Better Auth to use `app.users` directly with column mapping. Option B: Create a database view over Better Auth's `"user"` table. Option C: Add transaction wrapping around sync operations and a reconciliation job. Long-term, Option A is preferred.

## Affected Files
- `packages/api/src/lib/better-auth.ts`
- Migrations for user table consolidation

## Related Issues
- tech-debt-002-dual-postgresql-drivers
