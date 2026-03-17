---
name: staffora-hris-patterns
description: Coding patterns extracted from Staffora HRIS repository
version: 2.0.0
source: local-git-analysis
analyzed_commits: 200
---

# Staffora HRIS Patterns

## Commit Conventions

This project uses **conventional commits** with these prefixes (by frequency across 200 commits):

| Prefix | Usage | Share |
|--------|-------|-------|
| `fix:` | Bug fixes, migration fixes, typecheck fixes | 33% |
| `perf:` | Performance optimizations | 14% |
| `Merge:` | Squash-merge PRs | 13% |
| `build(deps):` | Dependency bumps (Dependabot) | 8% |
| `refactor:` | Code restructuring | 6% |
| `docs:` | Documentation updates | 6% |
| `feat:` | New features | 5% |

**Message style**: Lowercase after prefix, descriptive and specific.
- Good: `fix: correct update_updated_at trigger function name in 13 migrations`
- Good: `feat: enterprise CI/CD pipelines, UK compliance, permissions, client portal`
- Good: `perf: push analytics aggregation into SQL and add incremental computation`
- Avoid: generic messages like "Main Commit" or "update"

## Code Architecture

### Monorepo Structure (Bun Workspaces)
```
packages/
├── api/          # @staffora/api — Elysia.js backend (72 modules)
├── web/          # @staffora/web — React Router v7 frontend
├── shared/       # @staffora/shared — Types, schemas, state machines
migrations/       # 228 numbered SQL files (NNNN_description.sql)
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

All 72 modules follow this convention — `routes.ts` (72), `service.ts` (72), `repository.ts` (70), `schemas.ts` (70), `index.ts` (72).

**Most changed files** (hotspots from recent history):
- `packages/api/src/app.ts` (11 changes) — Plugin/route registration
- `packages/api/src/modules/hr/service.ts` (11 changes) — Core HR logic
- `packages/api/src/modules/time/repository.ts` (9 changes) — Time queries
- `packages/api/src/plugins/auth-better.ts` (8 changes) — Auth middleware
- `packages/api/src/plugins/errors.ts` (8 changes) — Error codes

### Frontend Route Groups
```
app/routes/
├── (auth)/       # Login, MFA, forgot-password, reset-password
├── (admin)/      # Admin panel (21 route modules)
│   ├── hr/       # Core HR (employees, positions, org)
│   ├── talent/   # Recruitment, performance, goals
│   ├── absence/  # Leave management
│   ├── time/     # Time & attendance
│   ├── cases/    # Case management
│   ├── lms/      # Learning management
│   └── ...       # benefits, documents, analytics, payroll, etc.
└── (app)/        # Employee self-service (dashboard, manager, me)
```

### Frontend Libraries
```
app/
├── components/   # Reusable (ui/, layouts/, analytics/, auth/, etc.)
├── hooks/        # use-permissions, use-tenant, use-manager, use-portal
└── lib/          # api-client, auth-client, better-auth, query-client, theme, utils
```

## Authentication

**All auth uses Better Auth (https://better-auth.com/)** — no custom auth systems.

- Backend: `betterAuth()` in `packages/api/src/lib/better-auth.ts`
- Frontend: `createAuthClient` from `better-auth/react` in `packages/web/app/lib/better-auth.ts`
- Tables: `app."user"`, `app."session"`, `app."account"`, `app."verification"`, `app."twoFactor"`
- Legacy sync: `app.users` kept in sync via `databaseHooks` (gradual migration)
- Plugins: `twoFactor`, `organization`, `dash`
- Sessions: httpOnly cookies, 7-day expiry, `staffora` prefix

**Key rule**: When creating users outside Better Auth's API (e.g., bootstrap scripts), you MUST create records in BOTH `app.users` AND `app."user"` + `app."account"` atomically.

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
2. Create `migrations/NNNN_description.sql` (4-digit padded)
3. Include RLS policies for all tenant-scoped tables
4. Run `bun run migrate:up`
5. Note: Some numbers have duplicates from parallel branches (known quirk)

### Common Fix Patterns (from git history)
Recent fix categories (33% of all commits):
1. **Migration SQL fixes** — Trigger names, enum ordering, FK references, syntax
2. **TypeScript typecheck fixes** — Import paths, missing types, error codes
3. **CI pipeline fixes** — Redis auth, permissions, audit formatting
4. **Dependency fixes** — Lockfile sync, missing packages

## Testing Patterns

### Test Structure
```
packages/api/src/test/
├── integration/        # RLS, idempotency, outbox, effective-dating
│   ├── routes/         # Module-specific route tests (10 files)
│   ├── multi-tenant/   # Cross-tenant attack tests
│   └── workflows/      # Multi-step workflow tests
├── unit/               # Service, plugin, job, lib, repository unit tests
├── e2e/                # Full flows (employee lifecycle, auth, cases, leave, onboarding)
├── security/           # Injection attacks, authentication
├── chaos/              # Database/connection failure scenarios
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

## Performance Patterns

| Area | Pattern |
|------|---------|
| **Frontend** | React.memo on card/list components, useMemo for column defs/stats |
| **Backend** | Batch INSERT instead of loops, composite indexes |
| **Database** | PostgreSQL tuning config, SQL-based analytics aggregation |
| **Caching** | Cache invalidation hooks for employee/security/tenant events |
| **Infrastructure** | Alpine Docker images, trimmed Bun workspace installs |
| **React Query** | Disabled refetchOnWindowFocus/refetchOnReconnect |
| **Redis Streams** | Stream trimming, consumer group start position fixes |

## Key Conventions

1. **All tables in `app` schema** — not `public`
2. **postgres.js tagged templates** — not Drizzle ORM
3. **snake_case DB / camelCase TS** — auto-transformed by postgres.js
4. **Cursor-based pagination** — not offset
5. **TypeBox for validation** — not Zod (except shared package)
6. **beforeHandle guards** — not inline auth checks in routes
7. **Outbox pattern** — domain events in same transaction as writes
8. **RLS on every tenant table** — `tenant_id` + isolation policy
9. **Effective dating** — `effective_from`/`effective_to` for time-varying HR data
10. **Bun** as package manager and test runner (API), **Vitest** for web tests
11. **Better Auth** for all authentication — no custom auth systems
12. **UK-only HRIS** — GBP currency, UK compliance modules, no US defaults
