# [TECH-DEBT] Dual PostgreSQL Drivers (pg + postgres.js)

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** tech-debt, architecture
**Effort:** MEDIUM

## Description
The codebase uses two PostgreSQL client libraries: `postgres` (postgres.js) as the primary driver with 47 import sites, and `pg` (node-postgres) used solely in `src/lib/better-auth.ts` for Better Auth's Pool adapter. This creates dependency duplication, potential connection pool conflicts (two independent pools competing for connections), and maintenance burden.

## Current State
- `postgres` (postgres.js): 47 import sites, primary driver for all modules, workers, migrations
- `pg` (node-postgres): 1 import in `src/lib/better-auth.ts` line 16
- `@types/pg`: dev dependency only needed for the single `pg` import
- Two connection pools competing for PostgreSQL connections

## Expected State
- Single PostgreSQL driver (postgres.js) used throughout
- Better Auth configured with postgres.js adapter
- `pg` and `@types/pg` removed from dependencies

## Acceptance Criteria
- [ ] Better Auth configured to use postgres.js connection
- [ ] `pg` package removed from dependencies
- [ ] `@types/pg` removed from dev dependencies
- [ ] All database connections go through a single pool
- [ ] Auth flow integration tests pass with the unified driver

## Implementation Notes
Better Auth supports custom database adapters. Create a postgres.js adapter for Better Auth or use their Kysely/Drizzle adapter with a postgres.js backend. The key constraint is that Better Auth expects a different query interface than postgres.js tagged templates.

## Affected Files
- `packages/api/src/lib/better-auth.ts`
- `packages/api/package.json`

## Related Issues
- architecture-003-connection-pool-exhaustion
- architecture-008-dual-user-tables
