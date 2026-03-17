# Contributing to Staffora

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.1.38
- [Docker](https://www.docker.com/) and Docker Compose
- Git

### First-Time Setup

```bash
# Clone the repository
git clone https://github.com/your-org/staffora.git
cd staffora

# Install dependencies
bun install

# Copy environment file and configure secrets
cp docker/.env.example docker/.env

# Start infrastructure
bun run docker:up

# Run database migrations
bun run migrate:up

# Bootstrap root tenant (first time only)
bun run --filter @staffora/api bootstrap:root

# Start all dev servers
bun run dev
```

## Coding Standards

### TypeScript

- Use TypeBox schemas for request/response validation
- Use `camelCase` for TypeScript properties (auto-converted to/from `snake_case` in DB)
- Avoid `any` — use proper types or generics
- All new code must pass `bun run typecheck` and `bun run lint`

### Backend (packages/api)

- **Module structure**: Every module needs `schemas.ts`, `repository.ts`, `service.ts`, `routes.ts`, `index.ts`
- **Database queries**: Use `db.withTransaction(ctx, async (tx) => { ... })` — never `db.query` directly
- **Domain events**: Write to `domain_outbox` in the SAME transaction as business writes
- **RLS**: Every tenant-owned table must have `tenant_id`, RLS enabled, and isolation policies
- **RBAC**: All route handlers must use `requirePermission()` guards
- **Pagination**: Use cursor-based pagination, never offset-based

### Frontend (packages/web)

- React Router v7 framework mode with file-based routing
- React Query for all API data fetching
- Tailwind CSS for styling
- Permission-based rendering via `useHasPermission()` hook

### Database Migrations

- File naming: `NNNN_description.sql` (4-digit prefix, lowercase, underscores)
- Check the highest existing migration number before creating new ones
- Every new table must include:
  - `tenant_id uuid NOT NULL` column
  - `ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;`
  - Tenant isolation policy (FOR ALL USING + FOR INSERT WITH CHECK)
- Test migrations can roll back cleanly

## Testing

```bash
# Run all tests
bun run test:api    # API tests (bun test, requires Docker)
bun run test:web    # Frontend tests (vitest)

# Single test file
bun test path/to/file.test.ts

# Watch mode
bun test --watch
```

### Test Requirements

- Integration tests must verify RLS blocks cross-tenant access
- Tests must use `hris_app` role (non-superuser) so RLS is enforced
- Use test helpers from `packages/api/src/test/setup.ts`
- Use factories from `packages/api/src/test/helpers/factories.ts`

## Git Workflow

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `refactor/description` — Code refactoring
- `docs/description` — Documentation
- `chore/description` — Maintenance

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add employee onboarding checklist
fix: correct RLS policy for benefits table
refactor: extract talent repository from routes
docs: update API reference for leave module
chore: upgrade better-auth to 1.5.4
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all checks pass: `bun run typecheck && bun run lint && bun run test:api`
4. Push and create a PR targeting `main`
5. CI will run: typecheck, lint, Docker build verification, full test suite, security scans
6. Get code review approval
7. Squash and merge

## Architecture Decisions

Before making significant architectural changes, document your rationale. Key patterns that must be followed:

1. **Multi-tenant RLS** — All tenant data isolated via PostgreSQL RLS
2. **Effective dating** — Time-versioned HR data with overlap prevention
3. **Outbox pattern** — Domain events written atomically with business data
4. **Plugin chain** — 11 plugins in strict registration order (see CLAUDE.md)
5. **State machines** — Defined in `@staffora/shared` for all lifecycle workflows

## UK-Only Policy

This is a UK-only HRIS. Do not add:
- US payroll/tax logic (FLSA, FMLA, W-2, I-9, etc.)
- US compliance frameworks (EEOC, ADA, etc.)
- USD currency defaults
- `en-US` locale formatting
- Social Security Number (SSN) validation

Use UK equivalents: NI numbers (NINO), GBP, en-GB, SOC codes, WTR status, HMRC integration.
