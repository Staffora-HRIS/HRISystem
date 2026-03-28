# [ARCHITECTURE] No Graceful Shutdown for API Server

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** CRITICAL
**Labels:** bug, infrastructure
**Effort:** SMALL

## Description
The main API entry point has no process signal handlers -- no `SIGTERM`, `SIGINT`, or `unhandledRejection` handling. Deployments will terminate in-flight requests abruptly, database connections may leak, Redis connections will not be cleanly closed, and open transactions may leave RLS context in an inconsistent state. The worker process correctly implements graceful shutdown, proving the pattern is understood but was not applied to the API server.

## Current State
- `packages/api/src/app.ts`: zero signal handlers (no `SIGTERM`, `SIGINT`, `unhandledRejection`)
- `packages/api/src/worker.ts` (lines 223-246): correctly implements graceful shutdown
- Database and Redis connections not cleaned up on process exit

## Expected State
- `SIGTERM`/`SIGINT` handlers drain connections and close DB/Redis
- Request drain period before shutdown
- `unhandledRejection` and `uncaughtException` logged and handled with safe exit

## Acceptance Criteria
- [ ] `SIGTERM` handler stops accepting new requests and drains in-flight requests
- [ ] `SIGINT` handler triggers the same graceful shutdown
- [ ] Database connection pool closed on shutdown
- [ ] Redis connections closed on shutdown
- [ ] `unhandledRejection` and `uncaughtException` logged with request IDs
- [ ] Configurable drain timeout (default: 30 seconds)
- [ ] Health endpoint returns `503 Service Unavailable` during shutdown

## Implementation Notes
Follow the same pattern used in `worker.ts`. Add signal handlers after `app.listen()`. Set a shutdown flag that causes the health endpoint to return 503 and stops new request processing.

## Affected Files
- `packages/api/src/app.ts`

## Related Issues
- architecture-002-single-points-of-failure
