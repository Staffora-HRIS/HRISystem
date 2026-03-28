# [ARCHITECTURE] Dashboard Module Has Inline SQL and No Service/Repository Layer

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** tech-debt, architecture
**Effort:** SMALL

## Description
The dashboard module is the only module with inline SQL directly in route handlers. It lacks service, repository, and schema layers, violating the project's own architecture conventions (CLAUDE.md marks it as a "Pattern violation"). Each request to `/dashboard/admin/stats` runs 6 COUNT queries in a single transaction with no caching, which will become a performance bottleneck as data grows.

## Current State
- `packages/api/src/modules/dashboard/routes.ts`: 71 lines, inline SQL (lines 19-41)
- No `service.ts`, `repository.ts`, or `schemas.ts` files
- No caching for expensive 6-subquery dashboard stats
- Each request triggers 6 full COUNT queries

## Expected State
- Proper service/repository/schemas layer following the HR module pattern
- Redis caching with short TTL (30-60 seconds) for dashboard stats
- Explicit column lists (no SELECT *)
- Individual subquery error handling

## Acceptance Criteria
- [ ] Dashboard module refactored with `schemas.ts`, `service.ts`, `repository.ts`
- [ ] SQL extracted from routes into repository layer
- [ ] Redis caching added for stats queries (30-60 second TTL)
- [ ] Error handling for individual subquery failures
- [ ] Performance test verifying cached response time

## Implementation Notes
Follow the HR module pattern. Create `DashboardRepository` with individual stat query methods. Add `DashboardService` with caching wrapper. Consider materialized views for high-volume tables.

## Affected Files
- `packages/api/src/modules/dashboard/routes.ts`
- New: `packages/api/src/modules/dashboard/service.ts`
- New: `packages/api/src/modules/dashboard/repository.ts`
- New: `packages/api/src/modules/dashboard/schemas.ts`

## Related Issues
- tech-debt-005-select-star-usage
