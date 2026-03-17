# Staffora Platform — Architecture Review & Redesign Recommendations

> **Generated:** 2026-03-17 | **Reviewer:** AI CTO
> **Scope:** Full architecture assessment for enterprise production readiness

---

## 1. Scalability Assessment

### Current Capacity
| Dimension | Current State | Enterprise Target | Gap |
|-----------|--------------|-------------------|-----|
| Tenants | Tested with 1-2 | 10,000+ | **HIGH** — RLS performs well but needs connection pooling tuning |
| Employees/tenant | Untested at scale | 100,000+ | **MEDIUM** — N+1 queries will bottleneck at 1K+ |
| Concurrent users | Unknown | 10,000+ | **MEDIUM** — Single API process, no horizontal scaling |
| Background jobs | Single worker | 100+ jobs/minute | **LOW** — Redis Streams supports partitioning |

### Connection Pool Analysis
- postgres.js default pool: 10 connections
- At 10K concurrent requests: pool exhaustion within seconds
- **Recommendation:** Configure pool size based on: `pool = num_cores * 2 + effective_spindle_count` (typically 20-50 for production)
- Add PgBouncer for connection multiplexing in production

### Worker Scaling
- Currently single worker process handles all job types
- **Recommendation:** Support `WORKER_TYPE=outbox|notification|export|pdf|analytics` for process-per-type scaling
- Docker Compose already supports scaling: `docker compose up -d --scale worker=3`

### Caching Gap
- Cache infrastructure (Redis) fully built but **zero module-level usage**
- Reference data endpoints hit DB every request
- Dashboard polls 5 queries every 60s with no cache
- **Recommendation:** Implement cache-aside pattern for: org tree, leave types, course catalog, role permissions

---

## 2. Modularity Assessment

### Module Architecture Quality (by tier)

**Tier 1 — Gold Standard (correct architecture)**
- `hr/` — Full routes → service → repository → db chain, outbox events, effective dating
- `benefits/` — Proper layering, life events, enrollment wizard

**Tier 2 — Functional but Incomplete**
- `cases/`, `lms/`, `onboarding/` — Have service/repository but outbox was fixed recently (was separate tx)
- `time/`, `absence/` — Proper structure, minor issues (property name mismatch fixed)

**Tier 3 — Architecture Violations**
- `talent/` — **No service.ts or repository.ts**. All SQL inline in routes.ts (~1150 lines). Zero domain events. Highest refactoring priority.
- `portal/`, `dashboard/` — Inline SQL in routes, no service layer
- `security/` routes — 11 inline queries (service layer added for some)

**Tier 4 — UK Compliance Modules (17 modules)**
- Structurally sound but lightly tested
- SSP, statutory-leave, pension, RTW, warnings, GDPR modules

### @staffora/shared Integration
**Current state:** Zero production imports. The shared package contains:
- TypeScript types (ServiceResult, TenantContext, HR types)
- State machines (employee lifecycle, leave, cases, workflows, performance)
- Error codes by module
- Validation utilities
- Constants

**Each module re-implements** these locally with subtle divergences. This is the #1 architecture debt item.

**Recommendation:** Phased integration:
1. Sprint 1: Import shared types (ServiceResult, TenantContext) in all modules
2. Sprint 2: Replace local state machine logic with shared implementations
3. Sprint 3: Consolidate error codes to shared package
4. Sprint 4: Remove all duplicate type definitions

---

## 3. Dependency Analysis

### Cross-Package Health
| Dependency | API Version | Web Version | Shared Version | Risk |
|-----------|------------|------------|---------------|------|
| better-auth | ^1.5.4 | ^1.5.4 | — | **OK** (aligned) |
| @sinclair/typebox | ^0.34.11 | — | ^0.32.0 | **HIGH** — Breaking changes between 0.32 and 0.34 |
| zod | ^3.24.1 | ^3.24.1 | — | OK |
| typescript | ^5.7.2 | ^5.7.2 | ^5.7.2 | OK |

### TypeBox Version Skew (Critical)
- API uses TypeBox 0.34 (Value.Create, Value.Check API changes)
- Shared uses TypeBox 0.32 (older API)
- Schemas crossing package boundaries will have runtime incompatibilities
- **Fix:** Upgrade shared to ^0.34.11 and verify all schema usage

### Critical Dependencies
| Package | Purpose | Risk if Compromised |
|---------|---------|-------------------|
| postgres (postgres.js) | Database driver | **CRITICAL** — All data access |
| better-auth | Authentication | **CRITICAL** — Session management |
| ioredis | Cache/queue | **HIGH** — Session store |
| elysia | HTTP framework | **HIGH** — All request handling |
| pdf-lib | PDF generation | LOW — Isolated worker |
| exceljs | Export generation | LOW — Isolated worker |

---

## 4. Enterprise Growth Support

### Multi-Region Readiness: NOT READY
- Single PostgreSQL instance, no read replicas
- No geographic routing or CDN
- Session affinity not configured
- **Path forward:** PostgreSQL streaming replication → read replica for reporting queries

### Horizontal Scaling: PARTIALLY READY
- API is stateless (sessions in Redis) — can scale horizontally
- Worker supports single-type mode for independent scaling
- Missing: load balancer health check tuning, graceful shutdown
- **Path forward:** Add SIGTERM handler, configure health check intervals

### Feature Flags: NOT IMPLEMENTED
- No feature flag infrastructure
- Module routes are always registered
- **Recommendation:** Add simple Redis-based feature flags for tenant-level rollouts

### Observability: PARTIAL
- Pino structured logging configured
- Audit logging for mutations
- Missing: distributed tracing (no trace IDs across services), APM, error aggregation
- **Recommendation:** Add OpenTelemetry integration for API + worker

---

## 5. Redesign Recommendations

### P0 — Fix NOW (blocking production)
1. **TypeBox version alignment** — Upgrade shared to ^0.34.11
2. **Graceful shutdown handler** — Add SIGTERM handling to API and worker
3. **Connection pool tuning** — Set pool size to 20+ for production

### P1 — Fix NEXT (within 2 sprints)
1. **Talent module refactoring** — Extract to service/repository pattern (Issue #15)
2. **@staffora/shared integration** — Import shared types across all modules (Issue #19)
3. **Real test coverage** — Rewrite hollow tests (Issue #16)
4. **N+1 query fix** — Employee list JOIN optimization (Issue #18)
5. **Bootstrap functions in migrations** — Move from init.sql (Issue #24)

### P2 — Strategic Improvements (3-6 months)
1. **Module-level caching** — Redis cache-aside for reference data
2. **OpenTelemetry integration** — Distributed tracing across API + worker
3. **Feature flag system** — Tenant-level feature rollouts via Redis
4. **E2E test pipeline** — Playwright tests for critical user flows
5. **Error standardization** — Unified AppError across all modules

### P3 — Future Architecture Evolution (6-12 months)
1. **Read replica** — PostgreSQL streaming replication for reporting
2. **CDN integration** — Static asset serving via CloudFront/Cloudflare
3. **Event-driven architecture** — Replace polling with pub/sub for real-time features
4. **API versioning strategy** — Plan for v2 API alongside v1
5. **Multi-region** — Geographic routing for global tenants

---

## 6. Architecture Decision Records (ADRs)

### ADR-001: PostgreSQL RLS for Multi-Tenancy
- **Decision:** Use Row-Level Security instead of separate schemas/databases per tenant
- **Status:** Implemented and enforced
- **Rationale:** Simpler operations, single migration path, proven at scale (Supabase, Neon)
- **Trade-off:** Slightly more complex queries, need to always set tenant context

### ADR-002: Transactional Outbox for Domain Events
- **Decision:** Write domain events to outbox table in same transaction as business data
- **Status:** Implemented (fixed in 3 modules during recent audit)
- **Rationale:** Guarantees at-least-once delivery without distributed transactions
- **Trade-off:** Polling overhead, eventual consistency

### ADR-003: Elysia.js + Bun Runtime
- **Decision:** Use Elysia.js on Bun instead of Express/Fastify on Node.js
- **Status:** Committed
- **Rationale:** High performance, TypeBox integration, excellent DX
- **Trade-off:** Smaller ecosystem, fewer battle-tested libraries

### ADR-004: BetterAuth for Authentication
- **Decision:** Use BetterAuth instead of Passport.js/custom auth
- **Status:** Implemented with MFA, sessions, CSRF
- **Rationale:** Full-featured auth with minimal code, TypeScript-first
- **Trade-off:** Newer library, smaller community

### ADR-005: UK-Only Platform
- **Decision:** Remove all US-specific logic, enforce UK employment law exclusively
- **Status:** Enforced (migration 0186, code audit complete)
- **Rationale:** Focus > generalization for initial market
- **Trade-off:** Cannot serve non-UK customers without significant rework

---

## Related Documents

- [Architecture Overview](ARCHITECTURE.md) — Current system architecture
- [Architecture Map](architecture-map.md) — Current architecture diagrams
- [Database Guide](DATABASE.md) — Current database design and conventions
- [Performance Audit](../audit/PERFORMANCE_AUDIT.md) — Performance findings addressed by redesign
- [Technical Debt Report](../audit/technical-debt-report.md) — Structural debt driving redesign
- [Production Readiness Report](../operations/production-readiness-report.md) — Platform maturity assessment
- [Risk Register](../project-management/risk-register.md) — Architectural risks and mitigations
