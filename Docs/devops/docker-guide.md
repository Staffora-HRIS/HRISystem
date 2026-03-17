# Docker Development Guide

> Comprehensive guide to the Staffora HRIS platform's Docker-based development and deployment infrastructure.
> **Last updated:** 2026-03-17

**Related documentation:**
- [CI/CD Pipeline](./ci-cd.md) -- Build and deployment automation
- [Worker System](../architecture/worker-system.md) -- Background job processing
- [Database Guide](../architecture/database-guide.md) -- PostgreSQL schema and connection management
- [Getting Started](../guides/GETTING_STARTED.md) -- First-time setup walkthrough

---

## Service Architecture

The platform runs five services orchestrated via Docker Compose, plus a production-only Nginx reverse proxy.

```mermaid
graph TD
    subgraph "Docker Network (staffora-network, 172.28.0.0/16)"
        Web["Web (SSR)<br/>:5173"] -->|HTTP| API["API Server<br/>:3000"]
        API --> Postgres["PostgreSQL 16<br/>:5432"]
        API --> Redis["Redis 7<br/>:6379"]
        Worker["Background Worker<br/>:3001 (health)"] --> Postgres
        Worker --> Redis
    end

    subgraph "Production Only"
        Nginx["Nginx<br/>:80 / :443"] --> Web
        Nginx --> API
    end

    Client["Browser / API Client"] --> Nginx
    Client -.->|Dev only| Web
    Client -.->|Dev only| API
```

### Service Summary

| Service | Image | Port | Purpose | Resource Limits |
|---------|-------|------|---------|-----------------|
| **postgres** | `postgres:16` | 5432 | Primary database with RLS | 2 CPU / 2 GB |
| **redis** | `redis:7` | 6379 | Cache, sessions, job queue (Streams) | 1 CPU / 1 GB |
| **api** | Custom (Bun) | 3000 | Elysia.js REST API server | 2 CPU / 1 GB |
| **worker** | Same as API | 3001 (health) | Background job processor | 1 CPU / 1 GB |
| **web** | Custom (Bun) | 5173 | React Router v7 SSR frontend | 1 CPU / 512 MB |
| **nginx** | `nginx:alpine` | 80, 443 | Reverse proxy (production profile) | 0.5 CPU / 256 MB |

---

## Docker Compose Configuration

The Docker Compose file lives at `docker/docker-compose.yml` and supports two profiles:

- **default** -- All services for development (no nginx)
- **production** -- Adds the nginx reverse proxy with SSL

### Dependency Chain

Services declare health-check-based dependencies to ensure correct startup order:

```
postgres (healthy) --> api
redis    (healthy) --> api
api      (healthy) --> web
postgres (healthy) --> worker
redis    (healthy) --> worker
api, web           --> nginx (production only)
```

### Health Checks

Every service has a Docker-native health check:

| Service | Check Method | Interval | Retries |
|---------|-------------|----------|---------|
| postgres | `pg_isready -U hris -d hris` | 10s | 5 |
| redis | `redis-cli -a <password> ping` | 10s | 5 |
| api | `fetch('http://localhost:3000/health')` via Bun | 30s | 3 |
| worker | `fetch('http://localhost:3001/health')` via Bun | 30s | 3 |
| web | `wget -q --spider http://localhost:5173/` | 30s | 3 |

---

## Development Workflow

### Starting Services

```bash
# Start all services (infrastructure + application)
docker compose -f docker/docker-compose.yml up -d

# Or use the shortcut from the repo root
bun run docker:up    # Infrastructure only (postgres + redis)
bun run dev          # Development servers (api, web, worker with watch mode)
```

For local development, you typically want infrastructure in Docker and application services running natively for hot reload:

```bash
# Step 1: Start postgres + redis
bun run docker:up

# Step 2: Run migrations
bun run migrate:up

# Step 3: Start dev servers (with watch mode)
bun run dev:api    # API on :3000
bun run dev:web    # Web on :5173
bun run dev:worker # Worker
```

### Stopping Services

```bash
# Stop all containers
bun run docker:down

# Stop and remove volumes (destructive - clears database)
docker compose -f docker/docker-compose.yml down -v
```

### Viewing Logs

```bash
# All service logs
bun run docker:logs

# Specific service logs
docker compose -f docker/docker-compose.yml logs -f api
docker compose -f docker/docker-compose.yml logs -f worker
docker compose -f docker/docker-compose.yml logs -f postgres

# Container status
bun run docker:ps
```

### Rebuilding Images

```bash
# Rebuild a specific service after code changes
docker compose -f docker/docker-compose.yml build api
docker compose -f docker/docker-compose.yml build web

# Rebuild and restart
docker compose -f docker/docker-compose.yml up -d --build api

# Force rebuild without cache
docker compose -f docker/docker-compose.yml build --no-cache api
```

---

## Multi-Stage Docker Builds

### API Dockerfile (`packages/api/Dockerfile`)

The API image serves dual purpose: it runs the API server (default) and the background worker (overridden via compose `command`).

```mermaid
graph LR
    subgraph "Stage 1: deps"
        D1["Copy package.json files<br/>(api + shared only)"]
        D2["Create trimmed workspace"]
        D3["bun install (all deps)"]
        D1 --> D2 --> D3
    end
    subgraph "Stage 2: builder"
        B1["Copy source code"]
        B2["bun build src/app.ts<br/>--target bun"]
        B1 --> B2
    end
    subgraph "Stage 3: prod-deps"
        P1["bun install --production"]
    end
    subgraph "Stage 4: runner"
        R1["Create staffora user (UID 1001)"]
        R2["Copy prod node_modules"]
        R3["Copy dist/ (API bundle)"]
        R4["Copy src/ (worker source)"]
        R5["Expose :3000"]
        R1 --> R2 --> R3 --> R4 --> R5
    end
    D3 -.-> B1
    P1 -.-> R2
    B2 -.-> R3
    B2 -.-> R4
```

**Key design decisions:**

1. **Trimmed workspace** -- The deps stage creates a workspace config that only includes `packages/api` and `packages/shared`, avoiding installation of web/website dependencies entirely.

2. **Separate prod-deps stage** -- Production dependencies are installed in a separate stage to exclude devDependencies (TypeScript, test tools, etc.) from the final image.

3. **Source files included** -- The worker runs from `src/worker.ts` (not the built bundle), so source files are copied alongside the built dist. Test files are excluded via `.dockerignore`.

4. **Non-root user** -- The final stage runs as a dedicated `staffora` user (UID/GID 1001) for security.

5. **Base image** -- All stages use `oven/bun:1.1.38-alpine` for minimal image size.

**Default CMD and override:**
- API server: `CMD ["bun", "./dist/app.js"]` (default)
- Worker: `command: ["bun", "run", "src/worker.ts"]` (overridden in compose)

### Web Dockerfile (`packages/web/Dockerfile`)

The web image builds a React Router v7 SSR application served by `react-router-serve`.

```mermaid
graph LR
    subgraph "Stage 1: deps"
        WD1["Copy all workspace package.json"]
        WD2["bun install --frozen-lockfile"]
        WD1 --> WD2
    end
    subgraph "Stage 2: builder"
        WB1["Accept VITE_API_URL build arg"]
        WB2["bun run --filter @staffora/web build"]
        WB3["Produces build/server/ + build/client/"]
        WB1 --> WB2 --> WB3
    end
    subgraph "Stage 3: runner"
        WR1["bun install --production"]
        WR2["Copy built output"]
        WR3["CMD bun run start"]
        WR1 --> WR2 --> WR3
    end
    WD2 -.-> WB1
    WB3 -.-> WR2
```

**Key details:**

- The `VITE_API_URL` build argument is inlined into the client bundle at build time via Vite
- The runtime needs `INTERNAL_API_URL` for server-side API calls (uses Docker service name `staffora-api`)
- Health check uses `wget` (not `curl` or Bun `fetch`) since the SSR server may not have Bun CLI available in the Alpine image

---

## Environment Configuration

### Required Environment Variables

Copy `docker/.env.example` to `docker/.env` and configure these values:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | Yes | `hris_dev_password` | PostgreSQL password |
| `SESSION_SECRET` | Yes | -- | Session encryption key (32+ chars) |
| `CSRF_SECRET` | Yes | -- | CSRF token secret (32+ chars) |
| `BETTER_AUTH_SECRET` | Yes | -- | BetterAuth encryption key (32+ chars) |
| `POSTGRES_USER` | No | `hris` | PostgreSQL username |
| `POSTGRES_DB` | No | `hris` | PostgreSQL database name |
| `REDIS_PASSWORD` | No | `staffora_redis_dev` | Redis password |
| `NODE_ENV` | No | `development` | Runtime environment |
| `LOG_LEVEL` | No | `info` | Logging verbosity |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `VITE_API_URL` | No | `http://localhost:3000` | API URL for frontend |

**Generating secrets:**

```bash
# Generate a random 32-character secret
openssl rand -base64 32
```

### Worker-Specific Variables

The worker container accepts additional environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_TYPE` | `all` | Which worker types to run |
| `WORKER_HEALTH_PORT` | `3001` | Health check endpoint port |
| `SMTP_HOST` | -- | SMTP server for email notifications |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | -- | SMTP authentication username |
| `SMTP_PASSWORD` | -- | SMTP authentication password |
| `SMTP_FROM` | `noreply@staffora.co.uk` | Default sender address |
| `STORAGE_TYPE` | `local` | File storage backend (`local` or `s3`) |
| `STORAGE_PATH` | `/app/uploads` | Local storage path |
| `S3_BUCKET` | -- | S3 bucket for file exports |

---

## Networking

### Docker Network

All services share a single bridge network (`staffora-network`) with subnet `172.28.0.0/16`. Services communicate using Docker DNS (container names).

**Internal service URLs used within Docker:**

| From | To | URL |
|------|----|-----|
| API | PostgreSQL | `postgres://hris:password@postgres:5432/hris` |
| API | Redis | `redis://:password@redis:6379` |
| Worker | PostgreSQL | `postgres://hris:password@postgres:5432/hris` |
| Worker | Redis | `redis://:password@redis:6379` |
| Web (SSR) | API | `http://staffora-api:3000` |

### Port Mapping

All ports are configurable via environment variables:

```bash
# Customize ports in .env
POSTGRES_PORT=5433  # Default: 5432
REDIS_PORT=6380     # Default: 6379
API_PORT=3001       # Default: 3000
WEB_PORT=3000       # Default: 5173
```

---

## Volume Management

### Named Volumes

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL data files |
| `redis_data` | `/data` | Redis persistence (RDB/AOF) |
| `worker_uploads` | `/app/uploads` | Worker-generated files (exports, PDFs) |

### Config Volumes (Read-Only Bind Mounts)

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `docker/postgres/init.sql` | `/docker-entrypoint-initdb.d/init.sql` | DB initialization script |
| `docker/postgres/postgresql.conf` | `/etc/postgresql/postgresql.conf` | PostgreSQL tuning |
| `docker/redis/redis.conf` | `/usr/local/etc/redis/redis.conf` | Redis configuration |
| `docker/nginx/nginx.conf` | `/etc/nginx/nginx.conf` | Nginx routing (production) |
| `docker/nginx/ssl/` | `/etc/nginx/ssl/` | TLS certificates (production) |

### Data Cleanup

```bash
# Remove all data (database, redis, uploads)
docker compose -f docker/docker-compose.yml down -v

# Remove only postgres data
docker volume rm $(docker volume ls -q | grep postgres_data)

# Inspect volume contents
docker run --rm -v staffora_postgres_data:/data alpine ls -la /data
```

---

## Logging

All services use Docker's JSON file logging driver with size rotation:

| Service | Max Size | Max Files | Total Retention |
|---------|----------|-----------|-----------------|
| postgres | 50 MB | 5 | 250 MB |
| redis | 20 MB | 3 | 60 MB |
| api | 50 MB | 5 | 250 MB |
| worker | 50 MB | 5 | 250 MB |
| web | 20 MB | 3 | 60 MB |
| nginx | 50 MB | 5 | 250 MB |

---

## Troubleshooting

### Container fails to start

**Symptom:** `api` or `worker` exits immediately after start.

```bash
# Check container logs
docker compose -f docker/docker-compose.yml logs api

# Common causes:
# 1. Missing environment variables (DATABASE_URL, BETTER_AUTH_SECRET)
# 2. Database not ready (check postgres health)
# 3. Port conflict (another process on :3000)
```

### Database connection refused

**Symptom:** `ECONNREFUSED` errors from the API.

```bash
# Verify postgres is healthy
docker compose -f docker/docker-compose.yml ps postgres

# Check postgres logs
docker compose -f docker/docker-compose.yml logs postgres

# Test connectivity
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U hris
```

### Redis authentication error

**Symptom:** `NOAUTH Authentication required` or `ERR invalid password`.

The Redis container requires a password (default: `staffora_redis_dev`). Ensure the `REDIS_URL` includes the password:

```
redis://:staffora_redis_dev@redis:6379
```

### Migrations fail with RLS error

**Symptom:** `permission denied for table` during migrations.

Migrations must run as the `hris` superuser role, not `hris_app`. Check that `DATABASE_URL` (not `DATABASE_APP_URL`) is set for migration commands. See the [Database Guide](../architecture/database-guide.md) for role details.

### Port already in use

```bash
# Find what is using the port
# On Linux/macOS:
lsof -i :3000
# On Windows:
netstat -ano | findstr :3000

# Use a different port
API_PORT=3001 docker compose -f docker/docker-compose.yml up -d
```

### Image rebuild not picking up changes

```bash
# Force rebuild without Docker cache
docker compose -f docker/docker-compose.yml build --no-cache api

# Or remove all cached layers
docker builder prune -f
```

### Out of disk space

```bash
# Clean up unused Docker resources
docker system prune -f

# Clean up unused volumes (WARNING: removes data)
docker volume prune -f

# Check disk usage by Docker
docker system df
```
