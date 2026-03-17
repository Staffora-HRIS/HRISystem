# Getting Started

*Last updated: 2026-03-17*

## Prerequisites

- **Bun** 1.1+ ([install](https://bun.sh/docs/installation))
- **Docker** and Docker Compose ([install](https://docs.docker.com/get-docker/))
- **Git**

## Initial Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd Staffora
bun install
```

### 2. Configure Environment

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` and set required secrets:

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `SESSION_SECRET` | Session encryption (32+ chars) | Yes |
| `CSRF_SECRET` | CSRF protection (32+ chars) | Yes |
| `BETTER_AUTH_SECRET` | BetterAuth encryption (32+ chars) | Yes |

Generate secrets:
```bash
openssl rand -base64 32
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL + Redis containers
bun run docker:up

# Run database migrations
bun run migrate:up

# Seed initial data
bun run db:seed

# Bootstrap root tenant and admin user
bun run --filter @staffora/api bootstrap:root
```

### 4. Start Development Servers

```bash
# Start everything (API + Worker + Frontend)
bun run dev

# Or start individually:
bun run dev:api       # API on http://localhost:3000
bun run dev:web       # Frontend on http://localhost:5173
bun run dev:worker    # Background worker
```

### 5. Verify Installation

1. Open `http://localhost:3000/health` - should show `{"status":"healthy"}`
2. Open `http://localhost:3000/docs` - Swagger API documentation
3. Open `http://localhost:3000/login` - Login with `root@staffora.co.uk`
4. Open `http://localhost:5173` - Frontend application

## Default Ports

| Service | Port | Description |
|---------|------|-------------|
| API | 3000 | Elysia.js backend |
| Frontend | 5173 | React dev server |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache and queues |
| Worker Health | 3001 | Worker health check |

## Common Commands

### Development

```bash
bun run dev              # All services
bun run dev:api          # API only (with hot reload)
bun run dev:web          # Frontend only
bun run dev:worker       # Background worker only
```

### Database

```bash
bun run migrate:up                  # Run pending migrations
bun run migrate:down                # Rollback last migration
bun run migrate:create <name>       # Create new migration file
bun run db:seed                     # Seed database
```

### Testing

```bash
bun test                             # All tests
bun run test:api                     # API tests (bun test)
bun run test:web                     # Frontend tests (vitest)
bun test path/to/file.test.ts       # Single test file
bun test --test-name-pattern "pat"  # Filter by name
```

### Quality

```bash
bun run typecheck        # TypeScript type checking
bun run lint             # ESLint
bun run build            # Production build
```

### Docker

```bash
bun run docker:up        # Start containers
bun run docker:down      # Stop containers
bun run docker:logs      # Tail container logs
bun run docker:ps        # Container status
```

## Project Structure

```
Staffora/
├── packages/
│   ├── api/             # @staffora/api - Elysia.js backend
│   │   ├── src/
│   │   │   ├── app.ts           # Main entry point
│   │   │   ├── worker.ts        # Background worker entry
│   │   │   ├── plugins/         # Elysia plugins
│   │   │   ├── modules/         # Feature modules
│   │   │   ├── jobs/            # Background job processors
│   │   │   ├── lib/             # Shared utilities
│   │   │   └── test/            # Test infrastructure
│   │   └── Dockerfile
│   ├── web/             # @staffora/web - React frontend
│   │   ├── app/
│   │   │   ├── routes/          # File-based routing
│   │   │   ├── components/      # UI components
│   │   │   ├── hooks/           # Custom hooks
│   │   │   └── lib/             # Utilities
│   │   └── Dockerfile
│   └── shared/          # @staffora/shared - Shared types & utils
│       └── src/
│           ├── types/           # TypeScript interfaces
│           ├── errors/          # Error codes & messages
│           ├── state-machines/  # State machine definitions
│           ├── utils/           # Utility functions
│           └── schemas/         # Validation schemas
├── migrations/          # SQL migration files (0001-0115+)
├── docker/              # Docker Compose & configs
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── postgres/        # PostgreSQL init scripts
│   └── redis/           # Redis configuration
└── Docs/                # This documentation
```

## Troubleshooting

### Docker containers won't start

```bash
# Check if ports are in use
docker ps -a
# Force recreate
docker compose -f docker/docker-compose.yml up -d --force-recreate
```

### Migration errors

```bash
# Check migration status
bun run migrate:up
# If RLS errors, ensure system context is enabled in migration
```

### API returns 500

Check logs:
```bash
bun run docker:logs
# Or for development:
bun run dev:api  # Check console output
```

### Redis connection failed

```bash
docker compose -f docker/docker-compose.yml ps redis
docker compose -f docker/docker-compose.yml restart redis
```

## Related Documentation

- [System Architecture](../architecture/ARCHITECTURE.md) — How the system is designed
- [Database Guide](../architecture/DATABASE.md) — Schema conventions, RLS, migrations
- [Frontend Guide](FRONTEND.md) — React Router v7, hooks, React Query
- [Migration Conventions](../../migrations/README.md) — Database migration format

---

## Related Documents

- [Deployment Guide](DEPLOYMENT.md) — Production deployment with Docker Compose
- [Frontend Guide](FRONTEND.md) — React frontend development and routing
- [Architecture Overview](../architecture/ARCHITECTURE.md) — System architecture and data flow diagrams
- [Database Guide](../architecture/DATABASE.md) — PostgreSQL schema, migrations, and RLS conventions
- [API Reference](../api/API_REFERENCE.md) — Complete endpoint documentation
- [Repository Map](../architecture/repository-map.md) — Monorepo structure and file layout
