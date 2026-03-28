# Architecture

> System design, data layer, and background processing internals.

*Last updated: 2026-03-28*

## Contents

| File | When to Read |
|------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understanding the system. Mermaid diagrams for system overview, monorepo structure, plugin registration order, module layering (routes → service → repository), request flow sequence, frontend data flow |
| [DATABASE.md](DATABASE.md) | Database work. Schema conventions (`app` schema), migration file format, RLS template, table catalog by module, effective-dating pattern, system context bypass, two database roles (`hris` vs `hris_app`) |
| [database-indexes.md](database-indexes.md) | Index strategy. Complete catalog of ~793 indexes across ~200 tables, indexing strategy (tenant-first composites, partial indexes, GIN/GiST), performance indexes, and missing index recommendations |
| [WORKER_SYSTEM.md](WORKER_SYSTEM.md) | Background processing. Redis Streams architecture, outbox pattern flow, job processors (notification/export/PDF/analytics), scheduler cron jobs, health/metrics endpoints, scaling with consumer groups |

## Key Concepts

### Monorepo (Bun Workspaces)

```
packages/api      → @staffora/api     (Elysia.js backend)
packages/web      → @staffora/web     (React frontend)
packages/shared   → @staffora/shared  (Types, schemas, state machines)
```

### Plugin Registration Order (Critical)

Plugins must load in this order due to dependencies:

1. `errorsPlugin` — Error handling, request IDs
2. `dbPlugin` — PostgreSQL connection
3. `cachePlugin` — Redis connection
4. `rateLimitPlugin` — Request throttling
5. `betterAuthPlugin` — Auth route handler
6. `authPlugin` — Session validation
7. `tenantPlugin` — Tenant resolution, sets `app.current_tenant`
8. `rbacPlugin` — Permission checking
9. `idempotencyPlugin` — Deduplication
10. `auditPlugin` — Audit logging

### Module Pattern

Every module follows: `routes.ts` → `service.ts` → `repository.ts` + `schemas.ts`

### Database Roles

| Role | Purpose | RLS Behavior |
|------|---------|-------------|
| `hris` | Migrations, admin | Bypasses RLS |
| `hris_app` | Runtime, tests | RLS enforced |

### Worker Streams

| Stream | Processor |
|--------|----------|
| `hris:events:domain` | Domain event handler |
| `hris:events:notifications` | Email + push |
| `hris:events:exports` | CSV/Excel generation |
| `hris:events:pdf` | PDF generation |
| `hris:events:analytics` | Data aggregation |
| `hris:events:background` | General tasks |
