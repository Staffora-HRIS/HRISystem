---
name: staffora-hris-patterns
description: Coding patterns extracted from Staffora HRIS repository
version: 1.0.0
source: local-git-analysis
analyzed_commits: 48
---

# Staffora HRIS Patterns

## Commit Conventions

This project uses **conventional commits** with these prefixes (by frequency):

| Prefix | Usage | Count |
|--------|-------|-------|
| `perf:` | Performance optimizations | 29% |
| `Merge:` | Merge commits (squash-merge PRs) | 27% |
| `refactor:` | Code restructuring | 13% |
| `docs:` | Documentation updates | 13% |
| `feat:` | New features | 6% |
| `fix:` | Bug fixes | 4% |

**Message style**: Lowercase after prefix, descriptive but concise.
- Good: `perf: add composite indexes for common query patterns`
- Good: `refactor: apply beforeHandle auth guards to remaining route modules`
- Avoid: generic messages like "Main Commit" or "Git"

## Code Architecture

### Monorepo Structure (Bun Workspaces)
```
packages/
├── api/          # @staffora/api — Elysia.js backend (71 modules)
├── web/          # @staffora/web — React Router v7 frontend
├── shared/       # @staffora/shared — Types, schemas, state machines
Website/          # @staffora/website — Marketing site
migrations/       # 232 numbered SQL files (NNNN_description.sql)
docker/           # Docker Compose, postgres/redis config
```

### Backend Module Pattern (5-file convention)
Every module in `packages/api/src/modules/{name}/` follows this structure:

```
{module}/
├── schemas.ts      # TypeBox validation schemas (request/response)
├── repository.ts   # Database queries (postgres.js tagged templates)
├── service.ts      # Business logic (calls repository)
├── routes.ts       # Elysia.js route definitions (calls service)
└── index.ts        # Barrel export
```

Some modules have sub-domain files (e.g., `cases/disciplinary.{repository,routes,schemas,service}.ts`).

**Most changed files** (hotspots):
- `routes.ts` (141 changes) — Most actively iterated
- `repository.ts` (121 changes) — Queries evolve with schema
- `service.ts` (107 changes) — Business logic refinement
- `schemas.ts` (74 changes) — Validation schemas

### Frontend Route Groups
```
app/routes/
├── (auth)/       # Login, register, forgot-password
├── (admin)/      # Admin panel (20 route modules)
│   ├── hr/       # Core HR (employees, positions, org)
│   ├── talent/   # Recruitment, performance, goals
│   ├── absence/  # Leave management
│   ├── time/     # Time & attendance
│   ├── cases/    # Case management
│   ├── lms/      # Learning management
│   └── ...       # benefits, documents, analytics, etc.
└── (app)/        # Employee self-service portal
```

### Frontend Libraries
```
app/
├── components/   # Reusable (ui/, layouts/, analytics/, auth/, etc.)
├── hooks/        # use-permissions, use-tenant, use-manager, use-portal
└── lib/          # api-client, auth-client, query-client, theme, utils
```

## Workflows

### Adding a New Backend Module
1. Create `packages/api/src/modules/{module}/schemas.ts` — Define TypeBox schemas
2. Create `packages/api/src/modules/{module}/repository.ts` — Database queries
3. Create `packages/api/src/modules/{module}/service.ts` — Business logic
4. Create `packages/api/src/modules/{module}/routes.ts` — Elysia route handlers
5. Create `packages/api/src/modules/{module}/index.ts` — Barrel export
6. Register routes in `packages/api/src/app.ts`
7. Create migration `migrations/NNNN_description.sql` with RLS policies

### Adding a Frontend Feature
1. Create route in `packages/web/app/routes/(admin)/{module}/route.tsx`
2. Create components in `packages/web/app/components/{module}/`
3. Use `api` client from `~/lib/api-client` with React Query
4. Guard with `useHasPermission()` from `~/hooks/use-permissions`

### Database Migration Workflow
1. Find next available number after highest in `migrations/`
2. Create `migrations/NNNN_description.sql`
3. Include RLS policies for all tenant-scoped tables
4. Run `bun run migrate:up`
5. Note: Numbers 0076-0079 and 0165/0174 have duplicates from parallel branches

### Refactoring Pattern (from git history)
Recent refactoring focus areas:
1. **Auth guards** → Move from inline auth checks to `beforeHandle` guards
2. **Service extraction** → Extract service/repository layers from route handlers
3. **Performance** → React.memo, useMemo, batch INSERTs, composite indexes

## Testing Patterns

### Test Structure
```
packages/api/src/test/
├── integration/        # RLS, idempotency, outbox, effective-dating
│   ├── routes/         # Module-specific route tests
│   └── multi-tenant/   # Cross-tenant attack tests
├── unit/               # Service, plugin, job unit tests
├── e2e/                # Full flows (employee lifecycle, auth, cases)
├── security/           # Injection attacks, authentication
├── chaos/              # Database failure scenarios
└── performance/        # Query benchmarks
```

### Test Naming
- Integration: `{feature}.test.ts` or `{feature}-enhanced.test.ts`
- E2E: `{flow-name}-flow.test.ts`
- Route: `{module}.routes.test.ts`

### What Tests MUST Verify
- RLS blocks cross-tenant access
- Effective-date overlap validation
- Idempotency prevents duplicate writes
- Outbox written atomically with business writes
- State machine transitions enforced

## Performance Patterns (Recent Focus)

The repo had a significant performance optimization sprint (14 perf commits in one session):

| Area | Pattern |
|------|---------|
| **Frontend** | React.memo on 20+ components, useMemo for column defs/stats |
| **Backend** | Batch INSERT instead of loops, composite indexes |
| **Database** | PostgreSQL tuning config, SQL-based analytics aggregation |
| **Caching** | Cache invalidation hooks, increased Redis maxmemory (750MB) |
| **Infrastructure** | Docker image optimization (Alpine, trimmed workspace) |
| **React Query** | Disabled refetchOnWindowFocus/refetchOnReconnect |
| **Redis Streams** | Stream trimming, consumer group start position fix |

## Key Conventions

1. **All tables in `app` schema** — not `public`
2. **postgres.js tagged templates** — not Drizzle ORM
3. **snake_case DB ↔ camelCase TS** — auto-transformed by postgres.js
4. **Cursor-based pagination** — not offset
5. **TypeBox for validation** — not Zod (except shared package)
6. **beforeHandle guards** — not inline auth checks in routes
7. **Outbox pattern** — domain events in same transaction as writes
8. **RLS on every tenant table** — `tenant_id` + isolation policy
9. **Effective dating** — `effective_from`/`effective_to` for time-varying HR data
10. **Bun** as package manager and test runner (API), **Vitest** for web tests
