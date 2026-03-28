# System Architecture Analysis -- Wave 1 Audit

*Last updated: 2026-03-28*

**Project:** Staffora HRIS Platform
**Audit Date:** 2026-03-12
**Scope:** Architecture decomposition, data flow analysis, risk identification

---

## 1. Executive Summary

Staffora follows a modular monolith architecture deployed as three runtime processes (API server, background worker, scheduler) backed by PostgreSQL 16 and Redis 7. The architecture enforces multi-tenancy at the database level through Row-Level Security (RLS) and uses a transactional outbox pattern for reliable domain event processing. Authentication is handled by BetterAuth with session cookies.

The architecture is generally well-designed for a multi-tenant HRIS. Key risks center on dual database clients, lack of distributed scheduler locking, Redis as a single point of failure, and the shared package being largely unused despite its intended role.

## 2. Runtime Components

| Component | Entry Point | Purpose | Port |
|---|---|---|---|
| API Server | `packages/api/src/app.ts` | HTTP request handling | 3000 |
| Background Worker | `packages/api/src/worker.ts` | Async job processing | -- |
| Scheduler | `packages/api/src/worker/scheduler.ts` | Cron-based job triggering | -- |
| Frontend | `packages/web/` | React SPA | 5173 |
| PostgreSQL | Docker service | Primary data store | 5432 |
| Redis | Docker service | Cache, sessions, streams | 6379 |

## 3. Plugin Architecture

The API server uses an 11-plugin chain registered in strict dependency order. Every HTTP request passes through this chain before reaching module route handlers.

### Plugin Registration Order and Responsibilities

| # | Plugin | File | Responsibility |
|---|---|---|---|
| 1 | Security Headers | `plugins/security-headers.ts` | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| 2 | Errors | `plugins/errors.ts` | Global error handler, request ID generation |
| 3 | Database | `plugins/db.ts` | PostgreSQL connection (postgres.js), `withTransaction`, `withSystemContext` |
| 4 | Cache | `plugins/cache.ts` | Redis connection, get/set/invalidate |
| 5 | Rate Limit | `plugins/rate-limit.ts` | Token bucket rate limiting (opt-in, disabled by default) |
| 6 | Better Auth | `plugins/auth-better.ts` | BetterAuth route handler for `/api/auth/*` |
| 7 | Auth | `plugins/auth-better.ts` | Session resolution, user context population |
| 8 | Tenant | `plugins/tenant.ts` | Tenant resolution from session, header, or subdomain |
| 9 | RBAC | `plugins/rbac.ts` | Role-based access control enforcement |
| 10 | Idempotency | `plugins/idempotency.ts` | Request deduplication via `Idempotency-Key` header |
| 11 | Audit | `plugins/audit.ts` | Audit log writing for state-changing operations |

### Plugin Dependency Graph

```
Security Headers ─┐
Errors ───────────┤
DB ───────────────┼─→ Auth ──→ Tenant ──→ RBAC ──→ Idempotency ──→ Audit
Cache ────────────┤      ↑        ↑         ↑           ↑             ↑
Rate Limit ───────┘      │        │         │           │             │
Better Auth ─────────────┘        │         │           │             │
                                  └─────────┴───────────┴─────────────┘
                              (all depend on db, cache, auth, tenant)
```

## 4. Database Architecture

### 4.1 Dual Database Clients

The system maintains **two separate database client libraries**, which is a notable architectural risk:

| Client | Library | Max Connections | Used By |
|---|---|---|---|
| Primary | postgres.js | 20 | Application queries, RLS-scoped operations |
| Secondary | pg (node-postgres) Pool | 10 | BetterAuth session/account management |

**Total connection budget:** 30 connections to PostgreSQL.

**Risk:** Two connection pools increase connection exhaustion risk and make it harder to reason about total database load. The `pg` Pool used by BetterAuth does not set the RLS tenant context, so BetterAuth queries bypass tenant isolation by design (they operate on global auth tables).

### 4.2 Row-Level Security Model

All 92 tenant-owned tables enforce RLS through:

1. **`hris_app` role:** Application runtime role with `NOBYPASSRLS` -- cannot circumvent RLS policies
2. **`hris` role:** Superuser role used only for migrations
3. **Tenant context:** Set per-transaction via `SET LOCAL app.current_tenant = '<uuid>'`
4. **Isolation policy:** `tenant_id = current_setting('app.current_tenant')::uuid`
5. **System bypass:** `app.enable_system_context()` / `app.disable_system_context()` for cross-tenant admin operations

### 4.3 Schema Design

- All tables reside in the `app` schema (not `public`)
- Search path configured as `app,public` -- queries use bare table names
- Column names are `snake_case` in DB, auto-transformed to `camelCase` in TypeScript via postgres.js transforms
- Effective dating pattern (`effective_from` / `effective_to`) used for time-versioned HR data

## 5. Authentication Architecture

### 5.1 Authentication Flow

1. User submits credentials to `/api/auth/sign-in/email` (BetterAuth handler)
2. BetterAuth validates credentials (bcrypt cost 12), creates session in `app.sessions` table
3. Session cookie (`better-auth.session_token`) set with `httpOnly`, `sameSite=lax`
4. Subsequent requests: Auth plugin calls BetterAuth `getSession()` to resolve user
5. Tenant plugin resolves tenant from session's user record
6. RLS context set for the resolved tenant

### 5.2 Session Management

| Property | Value |
|---|---|
| Storage | PostgreSQL (`app.sessions` table) |
| Cache | Redis (session lookups cached) |
| Cookie | `better-auth.session_token`, httpOnly, sameSite=lax |
| Expiry | Configurable (default: server-side session expiry) |
| MFA | BetterAuth MFA plugin enabled |

## 6. Worker Architecture

### 6.1 Processing Model

The worker system uses Redis Streams with consumer groups for reliable, at-least-once message processing:

1. **Outbox Processor** polls the `domain_outbox` table for unpublished events
2. Events are published to topic-specific Redis Streams
3. Worker consumers read from streams using `XREADGROUP`
4. On success, messages are acknowledged (`XACK`)
5. Failed messages remain pending and are retried
6. Dead letter queue for messages exceeding retry limits

### 6.2 Stream Topology

| Stream | Consumer Group | Processors |
|---|---|---|
| `domain-events` | `event-handlers` | Domain event handlers (multiple) |
| `notifications` | `notification-workers` | Email, push notification |
| `exports` | `export-workers` | Excel/CSV generation |
| `pdf-generation` | `pdf-workers` | Certificate/letter generation |
| `analytics` | `analytics-workers` | Data aggregation |
| `dead-letters` | `dlq-handlers` | Failed message inspection |

### 6.3 Scheduled Jobs (12)

| Job | Schedule | Purpose |
|---|---|---|
| Leave accrual | Daily | Calculate and credit leave balances |
| Session cleanup | Hourly | Remove expired sessions |
| Outbox cleanup | Every 15 min | Archive processed outbox entries |
| Probation reminders | Daily | Notify managers of upcoming probation end dates |
| Document expiry | Daily | Check for expiring documents |
| Training deadlines | Daily | Notify of upcoming training deadlines |
| Time entry reminders | Daily | Remind employees to submit timesheets |
| Benefits enrollment | Daily | Open/close enrollment windows |
| Analytics aggregation | Hourly | Pre-compute analytics data |
| Audit log archival | Weekly | Archive old audit log entries |
| Certificate expiry | Daily | Check for expiring certificates |
| System health check | Every 5 min | Verify system component health |

**Risk:** The scheduler lacks distributed locking. Running multiple scheduler instances (e.g., in a scaled deployment) will execute duplicate jobs.

## 7. Frontend Architecture

### 7.1 State Management

| Concern | Solution |
|---|---|
| Server state | React Query (TanStack Query) |
| Client state | React component state (no global store) |
| URL state | React Router v7 |
| Auth state | Context provider + React Query |

The frontend has no global client state store (no Redux, Zustand, or Jotai). All server data flows through React Query, which handles caching, invalidation, and background refetching.

### 7.2 API Communication

The frontend uses a custom `api-client.ts` wrapper that:
- Prepends `/api/v1` to all requests
- Includes credentials (cookies) automatically
- Handles error response parsing
- Integrates with React Query for cache management

## 8. Transactional Outbox Pattern

The outbox pattern is a core architectural decision ensuring reliable domain event delivery:

```
HTTP Request
    │
    ▼
┌─────────────────────────────────────┐
│         Database Transaction         │
│                                     │
│  1. Business Write (e.g., INSERT    │
│     INTO employees)                 │
│                                     │
│  2. Outbox Write (INSERT INTO       │
│     domain_outbox)                  │
│                                     │
│  COMMIT (atomic)                    │
└─────────────────────────────────────┘
    │
    ▼ (async, polled)
┌─────────────────────────────────────┐
│       Outbox Processor (Worker)      │
│                                     │
│  1. SELECT unpublished from outbox  │
│  2. XADD to Redis Stream           │
│  3. UPDATE outbox as published      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│        Redis Stream Consumers        │
│                                     │
│  - Notification Worker              │
│  - Export Worker                    │
│  - PDF Worker                       │
│  - Analytics Worker                 │
│  - Domain Event Handlers            │
└─────────────────────────────────────┘
```

**Guarantee:** If the business write succeeds, the domain event is guaranteed to be published (eventually). If the business write fails, no event is published. This eliminates dual-write inconsistencies.

## 9. Connection and Resource Budget

| Resource | Limit | Notes |
|---|---|---|
| postgres.js connections | 20 | Primary application pool |
| pg Pool connections | 10 | BetterAuth only |
| Total DB connections | 30 | Per API instance |
| Redis connections | Shared pool | Cache + sessions + streams |
| Worker concurrency | Configurable | Per-stream consumer count |

## 10. Identified Architecture Risks

### 10.1 Critical Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | Dual DB clients (postgres.js + pg) | Connection exhaustion, inconsistent connection management | Consolidate to single client library |
| 2 | Redis single point of failure | Total system outage if Redis fails (cache, sessions, job queue) | Add Redis Sentinel or cluster mode |
| 3 | No distributed scheduler locking | Duplicate job execution in multi-instance deployments | Implement Redis-based distributed lock (Redlock) |

### 10.2 High Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 4 | Shared package largely unused | Code duplication, inconsistent types across modules | Adopt shared package imports in modules |
| 5 | Migration numbering collisions (7 duplicates) | Non-deterministic migration order | Renumber migrations, add CI check |
| 6 | No connection draining on shutdown | In-flight requests dropped during deployment | Add graceful shutdown with connection draining |

### 10.3 Medium Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 7 | Module quality inconsistency | Maintenance burden, varying reliability | Standardize all modules to HR module pattern |
| 8 | No circuit breaker for external services | Cascading failures from SMTP/S3 outages | Add circuit breaker pattern to workers |
| 9 | Frontend-backend path mismatches | Broken UI pages | Add contract testing or shared route constants |

## 11. Positive Architecture Decisions

1. **RLS at the database level** -- Tenant isolation is enforced by PostgreSQL, not application code. Even SQL injection cannot cross tenant boundaries.
2. **Transactional outbox** -- Reliable domain events without distributed transactions.
3. **Plugin chain architecture** -- Clear separation of cross-cutting concerns with explicit dependency ordering.
4. **Effective dating** -- Proper temporal data modeling for HR records.
5. **Idempotency enforcement** -- All mutating endpoints require idempotency keys, preventing duplicate operations.
6. **Tagged template SQL** -- postgres.js tagged templates prevent SQL injection by design.
7. **State machine enforcement** -- Business state transitions are validated against defined state machines.
