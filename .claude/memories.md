# Core Project Memory

## Purpose

This file stores **long-term stable knowledge about the project**.

It contains architecture information, critical workflows, key constraints, and major project decisions.

This file acts as **permanent memory for AI agents** so they quickly understand how the project works.

Unlike `.claude/learning.md`, which records debugging discoveries and issues, this file stores **stable truths that should rarely change**.

---

## Project Purpose

Staffora (staffora.co.uk) -- an enterprise multi-tenant HRIS platform. Manages Core HR, Time & Attendance, Absence Management, Talent, LMS, Cases, Onboarding, Benefits, Documents, Succession, Analytics, Competencies, and Recruitment across isolated tenant organizations.

---

## System Architecture

Monorepo with three packages:
- **`packages/api`** (@staffora/api) — Elysia.js REST API with plugin-based architecture
- **`packages/web`** (@staffora/web) — React Router v7 (framework mode) frontend
- **`packages/shared`** (@staffora/shared) — Shared types, schemas, error codes, state machines, utilities

Backend follows a layered pattern per module: `routes.ts` → `service.ts` → `repository.ts` with `schemas.ts` for validation.

Background processing uses Redis Streams with dedicated workers (outbox, notifications, exports, PDFs, analytics).

All tenant data is isolated at the database level via PostgreSQL Row-Level Security (RLS).

---

## Core Technologies

| Layer         | Technology                                      |
|---------------|------------------------------------------------|
| Runtime       | Bun                                            |
| Backend       | Elysia.js + TypeBox validation                 |
| Frontend      | React 18 + React Router v7 + React Query + Tailwind CSS |
| Auth          | BetterAuth (sessions, MFA, CSRF)               |
| Database      | PostgreSQL 16 with RLS                         |
| Cache/Queue   | Redis 7 (sessions, caching, Streams for jobs)  |
| Infrastructure| Docker (docker-compose for local dev)          |
| Package Mgr   | Bun workspaces                                 |

---

## Critical Workflows

### Build Pipeline
- `bun install` → `bun run build` (builds all packages)
- API: `bun run build:api`, Web: `bun run build:web`

### Database Migrations
- Numbered SQL files in `migrations/` (format `NNNN_description.sql`)
- Run: `bun run migrate:up`, Rollback: `bun run migrate:down`
- Create: `bun run migrate:create <name>`
- 115 migrations currently exist (0001–0115)
- All tables in `app` schema, NOT `public`
- Two DB roles: `hris` (admin/superuser), `hris_app` (app role, NOBYPASSRLS)

### Local Development
- `bun run docker:up` starts PostgreSQL + Redis
- `bun run dev` starts all services (API, web, worker)
- First-time: `bun run --filter @staffora/api bootstrap:root` creates root tenant + admin

### Background Processing
- Outbox processor polls `domain_outbox` table → publishes to Redis Streams
- Workers consume from streams: notifications, exports, PDFs, analytics
- Scheduler runs cron-based maintenance jobs

---

## Key Constraints

1. **RLS is mandatory** — Every tenant-owned table must have `tenant_id`, RLS enabled, and isolation policies
2. **Effective dating** — HR temporal data uses `effective_from`/`effective_to` with overlap validation under transactions
3. **Outbox pattern** — Domain events written atomically with business writes (same transaction)
4. **Idempotency** — All mutating endpoints require `Idempotency-Key` header, scoped to `(tenant_id, user_id, route_key)`
5. **State machines** — Employee lifecycle, leave requests, cases, workflows, performance cycles all use defined state machines in `packages/shared/src/state-machines/`
6. **Cursor-based pagination** — Never offset-based
7. **URL versioning** — All API routes under `/api/v1/`

---

## Important Project Decisions

- **Multi-tenant via RLS** — Database-level isolation using PostgreSQL `current_setting('app.current_tenant')` rather than application-level filtering
- **Outbox over direct events** — Guarantees event delivery consistency by writing to outbox table in same transaction as data mutations
- **Elysia plugin architecture** — Cross-cutting concerns (auth, tenant, rbac, audit, rate-limit) implemented as composable Elysia plugins
- **React Router v7 framework mode** — File-based routing with route groups: `(auth)/`, `(app)/`, `(admin)/`
- **Bun as runtime** — Chosen for performance and native TypeScript support

---

## Important Paths

| Path | Purpose |
|------|---------|
| `packages/api/` | Backend API (Elysia.js) |
| `packages/web/` | Frontend (React Router v7) |
| `packages/shared/` | Shared types, schemas, state machines |
| `migrations/` | PostgreSQL migration files |
| `docker/` | Docker Compose configs and env files |
| `.claude/` | AI agent configuration (agents, skills, memory) |
| `.claude/agents/` | Specialized agent definitions |
| `.claude/Skills/` | Domain-specific skill guides |
| `.claude/memories.md` | Long-term project knowledge (this file) |
| `.claude/learning.md` | Debugging discoveries and lessons learned |
| `.claude/claude.md` | Agent operating rules and reading order |
| `CLAUDE.md` | Primary project instructions for Claude Code |

---

## Agent Operating Rules

1. **Read before writing** — Always read existing code before modifying. Understand the module's pattern first.
2. **Follow the layer pattern** — routes → service → repository. Do not bypass layers.
3. **RLS on every migration** — Any new tenant-owned table must include RLS setup in the same migration.
4. **Test what matters** — Integration tests must verify RLS isolation, idempotency, outbox atomicity, effective-date overlap, and state machine transitions.
5. **Document discoveries** — Log debugging findings in `.claude/learning.md`. Log architecture insights in `.claude/memories.md`.
6. **Never silently fix** — Complex issues must be documented before or after fixing.
7. **Minimal changes** — Don't refactor surrounding code. Don't add features beyond what's requested.

---

## Core Memory Entries

*New entries should be appended below using the standard format.*

### Core Memory Entry

Date: 2026-03-10
Agent: Claude Code (initial setup)

Topic: Knowledge system initialization

Context: Created the persistent AI knowledge system for this repository.

Core Knowledge: The `.claude/memories.md` and `.claude/learning.md` files form a two-tier memory system. Memories stores stable project truths. Learning stores temporal debugging discoveries and failed attempts. Both are maintained automatically by agents.

Reason: Enables continuity across agent sessions — no agent starts from zero.

### Core Memory Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)

Topic: Module quality tiers — which modules to trust vs which need refactoring

Context: Full codebase audit revealed modules at very different maturity levels.

Core Knowledge:
- **Gold standard (follow these patterns):** `hr` module — proper layers, outbox in same tx, state machine validation, explicit column SELECTs
- **Good but imperfect:** `absence`, `time`, `benefits` — proper layers, some outbox issues
- **Broken outbox pattern:** `cases`, `lms`, `onboarding` — emitDomainEvent in separate transaction + errors silently swallowed
- **Missing RBAC:** `lms`, `cases`, `onboarding` — no requirePermission() guards
- **No service/repository layer:** `talent` (1150-line routes.ts with all SQL inline), `portal`, `dashboard`
- **No domain events at all:** `talent`
- **@staffora/shared is unused in production** — zero imports from any module

Reason: Agents must know which modules to use as reference and which need fixing. The HR module is the canonical implementation.

### Core Memory Entry

Date: 2026-03-10
Agent: Claude Code (8-agent codebase audit)

Topic: Test suite is mostly hollow — only integration/ core tests are real

Context: Test coverage audit found most tests assert local variables, not actual API behavior.

Core Knowledge:
- **Real tests:** rls.test.ts, rls-coverage.test.ts, idempotency.test.ts, outbox.test.ts, effective-dating.test.ts, state-machine.test.ts, 3 service unit tests (hr, absence, time)
- **Fake tests (assert constants, never call API):** All 5 route test files, all security tests, performance tests, chaos tests, E2E tests, all 10 frontend tests
- **Well-built but unused:** Test factories (factories.ts), assertion helpers (assertions.ts), TestApiClient (api-client.ts)
- 15 of 20 modules have zero route test coverage

Reason: Agents should not assume test coverage exists. When fixing bugs or adding features, agents must write REAL tests using the existing helpers, not follow the hollow test pattern.
