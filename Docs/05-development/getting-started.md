# Getting Started

Last updated: 2026-03-28

This guide walks you through setting up the Staffora HRIS platform for local development.

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| **Bun** | 1.3.10+ | Package manager and runtime (`curl -fsSL https://bun.sh/install \| bash`) |
| **Docker** | 24+ | Required for PostgreSQL 16, Redis 7, PgBouncer |
| **Docker Compose** | v2+ | Included with Docker Desktop |
| **Node.js** | 20+ | Required by some tooling (vitest, React Router) |
| **Git** | 2.30+ | Version control |

Verify installations:

```bash
bun --version      # >= 1.3.10
docker --version   # >= 24.0
node --version     # >= 20.0
```

---

## 1. Clone and Install

```bash
git clone https://github.com/your-org/HRISystem.git
cd HRISystem

# Install all workspace dependencies
bun install
```

The monorepo uses Bun workspaces with three packages:

| Package | Path | Description |
|---------|------|-------------|
| `@staffora/api` | `packages/api` | Elysia.js backend API |
| `@staffora/web` | `packages/web` | React Router v7 frontend |
| `@staffora/shared` | `packages/shared` | Shared types, schemas, state machines, utilities |

---

## 2. Environment Configuration

Copy the example environment file and configure required secrets:

```bash
cp docker/.env.example docker/.env
```

Open `docker/.env` and set the **required** values:

```bash
# [REQUIRED] PostgreSQL
POSTGRES_USER=hris
POSTGRES_PASSWORD=hris_dev_password      # Change in production
POSTGRES_DB=hris
DATABASE_URL=postgres://hris:hris_dev_password@localhost:5432/hris

# [REQUIRED] Authentication secrets (minimum 32 characters each)
# Generate with: openssl rand -base64 32
SESSION_SECRET=<generate-a-32-char-secret>
CSRF_SECRET=<generate-a-32-char-secret>
BETTER_AUTH_SECRET=<generate-a-32-char-secret>

# [REQUIRED] Better Auth URL
BETTER_AUTH_URL=http://localhost:3000
VITE_API_URL=http://localhost:3000

# [REQUIRED] CORS
CORS_ORIGIN=http://localhost:5173
```

### Optional Configuration

The `.env.example` file contains extensive optional configuration for:

- **Redis**: `REDIS_URL`, `REDIS_PASSWORD` (defaults to `redis://localhost:6379`)
- **PgBouncer**: `PGBOUNCER_PORT` (defaults to `6432`)
- **File Storage**: `STORAGE_TYPE`, `S3_BUCKET`, `S3_REGION`
- **Email (SMTP)**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`
- **Observability**: `SENTRY_DSN`, `OTEL_ENABLED`, Grafana, Loki, Prometheus
- **ClamAV virus scanning**: `CLAMAV_ENABLED`
- **Background workers**: `WORKER_TYPE`, `OUTBOX_BATCH_SIZE`
- **Database backups**: `BACKUP_RETENTION_DAYS`, `S3_BACKUP_BUCKET`
- **Feature flags**: `FEATURE_MFA_REQUIRED`, `FEATURE_AUDIT_ENABLED`

---

## 3. Start Docker Infrastructure

```bash
# Start core services (PostgreSQL 16, PgBouncer, Redis 7)
bun run docker:up
```

This runs `docker compose -f docker/docker-compose.yml up -d`, which starts:

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| PostgreSQL 16 | `staffora-postgres` | 5432 | Primary database |
| PgBouncer | `staffora-pgbouncer` | 6432 | Connection pooler |
| Redis 7 | `staffora-redis` | 6379 | Cache and job queues |

Verify containers are running:

```bash
bun run docker:ps
```

### Additional Docker Profiles

```bash
# Full observability stack (Grafana, Prometheus, Loki, Tempo)
docker compose -f docker/docker-compose.yml --profile monitoring up -d

# ClamAV virus scanning
docker compose -f docker/docker-compose.yml --profile scanning up -d

# Uptime monitoring (Uptime Kuma)
docker compose -f docker/docker-compose.yml --profile uptime up -d

# Production config with nginx load balancer
docker compose -f docker/docker-compose.yml --profile production up -d
```

---

## 4. Run Database Migrations

```bash
bun run migrate:up
```

This runs all pending SQL migration files from the `migrations/` directory (currently 230+ migrations). Migrations are numbered with 4-digit padding (`0001_`, `0002_`, ..., `0234_`) and create all tables in the `app` schema.

Two database roles are created automatically by the init script:
- **`hris`** -- Superuser for migrations and admin operations
- **`hris_app`** -- Application role with `NOBYPASSRLS` (used at runtime so RLS is enforced)

---

## 5. Seed the Database

```bash
# Seed reference data (leave types, roles, permissions, etc.)
bun run db:seed
```

---

## 6. Bootstrap Root Tenant and Admin

For first-time setup, create the root tenant and initial admin user:

```bash
bun run --filter @staffora/api bootstrap:root
```

This creates:
- A root tenant (default: "Staffora" / slug "staffora")
- An admin user with full permissions
- Records in all three auth tables (`app.users`, `app."user"`, `app."account"`)

You can customise the bootstrap via environment variables:

```bash
ROOT_TENANT_NAME=Staffora
ROOT_TENANT_SLUG=staffora
ROOT_USER_EMAIL=admin@staffora.co.uk
ROOT_USER_PASSWORD=<secure-password>
ROOT_USER_NAME=Admin
```

---

## 7. Start Development Servers

```bash
# Start all packages in dev mode (API + Web + Worker)
bun run dev

# Or start individually:
bun run dev:api       # API server (port 3000, with --watch)
bun run dev:web       # Frontend (port 5173, React Router dev server)
bun run dev:worker    # Background worker (with --watch)
```

### Default Ports

| Service | URL | Description |
|---------|-----|-------------|
| API | http://localhost:3000 | Elysia.js backend |
| API Docs | http://localhost:3000/docs | Swagger UI |
| Web | http://localhost:5173 | React frontend |
| API Login | http://localhost:3000/login | Built-in login page |

---

## 8. Verify Setup

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "environment": "development",
  "checks": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

### Readiness Check

```bash
curl http://localhost:3000/ready
```

### Login Test

Open http://localhost:3000/login in your browser, or use curl:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@staffora.co.uk","password":"your-password"}'
```

### Frontend

Open http://localhost:5173 -- you should see the Staffora login page. Log in with the admin credentials from the bootstrap step.

---

## Running Tests

Tests require Docker containers (PostgreSQL + Redis) to be running. Tests connect as the `hris_app` role so RLS policies are enforced.

```bash
# Run all tests across all packages
bun test

# API tests only (uses bun test)
bun run test:api

# Web tests only (uses vitest -- NOT bun test)
bun run test:web

# Single test file
bun test packages/api/src/test/integration/rls.test.ts

# Watch mode
bun test --watch

# Coverage
bun run --filter @staffora/api test:coverage    # API (bun --coverage)
bun run --filter @staffora/web test:coverage    # Web (vitest --coverage)
```

> **Important**: `packages/web` uses **vitest** (not bun test). `packages/api` and `packages/shared` use Bun's built-in test runner.

---

## Common Commands Reference

| Command | Description |
|---------|-------------|
| `bun install` | Install all dependencies |
| `bun run dev` | Start all dev servers |
| `bun run dev:api` | Start API server with watch |
| `bun run dev:web` | Start frontend dev server |
| `bun run dev:worker` | Start background worker |
| `bun run docker:up` | Start Docker containers |
| `bun run docker:down` | Stop Docker containers |
| `bun run docker:ps` | Container status |
| `bun run docker:logs` | Follow container logs |
| `bun run migrate:up` | Run pending migrations |
| `bun run migrate:down` | Rollback last migration |
| `bun run migrate:create <name>` | Create new migration |
| `bun run db:seed` | Seed database |
| `bun test` | Run all tests |
| `bun run typecheck` | Type-check all packages |
| `bun run lint` | Lint all packages |
| `bun run build` | Build all packages |
| `bun run clean` | Remove node_modules and dist |

---

## Troubleshooting

### Port Conflicts

If default ports are in use, change them in `docker/.env`:

```bash
POSTGRES_PORT=5433
REDIS_PORT=6380
API_PORT=3001
WEB_PORT=5174
```

### Database Connection Failures

1. Ensure Docker containers are running: `bun run docker:ps`
2. Check logs: `bun run docker:logs`
3. Verify `DATABASE_URL` in `docker/.env` matches the Postgres container

### Migration Errors

```bash
# Rollback the last migration and retry
bun run migrate:down
bun run migrate:up
```

### Clean Restart

```bash
bun run docker:down
bun run clean
bun install
bun run docker:up
bun run migrate:up
bun run db:seed
```

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) — System architecture, plugin chain, and request flow
- [Backend Development](./backend-development.md) — Backend module development, service patterns, and route conventions
- [Frontend Development](./frontend-development.md) — React Router routes, components, and permission guards
- [Database Guide](./database-guide.md) — Database queries, migrations, RLS, and connection management
- [Docker Guide](../06-devops/docker-guide.md) — Docker container management and local development setup
- [API Reference](../04-api/api-reference.md) — Full endpoint specifications for all modules
- [Testing Guide](../08-testing/testing-guide.md) — Running and writing tests across the platform
