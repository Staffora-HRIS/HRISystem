# [ARCHITECTURE] Database Connection Pool Exhaustion Risk

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** bug, infrastructure
**Effort:** MEDIUM

## Description
Three independent PostgreSQL connection pools compete for database connections: the main API (20 via postgres.js), Better Auth (10 via pg Pool), and the scheduler (unlimited, no max specified). With PostgreSQL's default `max_connections = 100`, this leaves minimal headroom and risks connection exhaustion under load.

## Current State
- `packages/api/src/plugins/db.ts` (line 55): `maxConnections: 20` (postgres.js)
- `packages/api/src/lib/better-auth.ts` (line 93): `max: 10` (pg Pool -- separate driver)
- `packages/api/src/worker/scheduler.ts` (line 37): `postgres(DB_URL)` with no max specified
- Total: 30+ connections minimum, potentially unlimited via scheduler
- PostgreSQL default `max_connections = 100`

## Expected State
- Consolidated or explicitly coordinated connection pools
- PostgreSQL `max_connections` set appropriately for total pool sizes
- Connection pool monitoring and alerting
- Single PostgreSQL driver used across the application

## Acceptance Criteria
- [ ] All connection pools have explicit max connection limits
- [ ] Total max connections across all pools documented and within PostgreSQL limits
- [ ] Connection pool exhaustion produces clear error messages (not timeouts)
- [ ] Monitoring for connection pool utilization added
- [ ] Scheduler uses the main connection pool or has explicit limits

## Implementation Notes
Short-term: add `max: 5` to scheduler's postgres.js config. Medium-term: eliminate the `pg` driver used only by Better Auth (see tech-debt-002). Long-term: add PgBouncer for production-grade connection pooling.

## Affected Files
- `packages/api/src/plugins/db.ts`
- `packages/api/src/lib/better-auth.ts`
- `packages/api/src/worker/scheduler.ts`

## Related Issues
- tech-debt-002-dual-postgresql-drivers
