# Docker Guide

Last updated: 2026-03-28

This guide covers the Docker-based infrastructure for the Staffora HRIS platform, including container architecture, development workflow, and production deployment.

---

## Table of Contents

- [Container Architecture](#container-architecture)
- [Docker Compose Profiles](#docker-compose-profiles)
- [Core Services](#core-services)
- [Optional Services](#optional-services)
- [Networking](#networking)
- [Volumes](#volumes)
- [Environment Variables](#environment-variables)
- [Development Workflow](#development-workflow)
- [Production Deployment](#production-deployment)
- [Horizontal Scaling](#horizontal-scaling)
- [Resource Limits](#resource-limits)
- [Monitoring Stack](#monitoring-stack)
- [Troubleshooting](#troubleshooting)

---

## Container Architecture

The platform runs as a set of Docker containers orchestrated by Docker Compose. The compose file is at `docker/docker-compose.yml`.

```
                          +-------------------+
                          |     nginx (80)    |   (production profile)
                          |  reverse proxy    |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |                             |
             +------+------+              +------+------+
             |  web (5173) |              | api (3000)  |  <-- horizontally scalable
             |  React SPA  |              | Elysia.js   |
             +-------------+              +------+------+
                                                 |
                                    +------------+------------+
                                    |                         |
                             +------+------+          +------+------+
                             | pgbouncer   |          |  redis (6379)|
                             |   (6432)    |          |  cache/queue |
                             +------+------+          +-------------+
                                    |
                             +------+------+
                             | postgres    |
                             |   (5432)    |
                             +-------------+

             +-------------+              +-------------+
             |  worker     |              |   backup    |
             | background  |              |  sidecar    |
             |  (3001)     |              +-------------+
             +-------------+
```

### Request Flow

1. In production, Nginx receives HTTPS traffic and routes API requests to the API service and frontend requests to the web service.
2. The API server connects to PostgreSQL through PgBouncer for connection pooling. Runtime queries use the `hris_app` role (NOBYPASSRLS) so RLS policies are enforced.
3. Migrations and superuser operations use a direct PostgreSQL connection (bypassing PgBouncer) with the `hris` admin role.
4. Redis handles session caching, rate limiting, idempotency keys, and job queues (via Redis Streams).
5. The background worker processes domain events from the outbox, sends notifications, generates exports and PDFs, and runs scheduled jobs.

---

## Docker Compose Profiles

| Profile | Services Added | Activation |
|---------|---------------|------------|
| (default) | postgres, pgbouncer, redis, api, worker, web, backup | `docker compose up -d` |
| `production` | nginx, certbot | `docker compose --profile production up -d` |
| `monitoring` | loki, promtail, prometheus, grafana, tempo, postgres-exporter, redis-exporter | `docker compose --profile monitoring up -d` |
| `scanning` | clamav | `docker compose --profile scanning up -d` |
| `uptime` | uptime-kuma | `docker compose --profile uptime up -d` |

Multiple profiles can be combined:

```bash
docker compose --profile production --profile monitoring up -d
```

---

## Core Services

### PostgreSQL (`postgres`)

- **Image**: `postgres:16`
- **Container**: `staffora-postgres`
- **Port**: `${POSTGRES_PORT:-5432}:5432`
- **Custom config**: `docker/postgres/postgresql.conf` (mounted read-only)
- **Init script**: `docker/postgres/init.sql` (creates `app` schema, `hris_app` role, RLS helper functions)
- **Entrypoint wrapper**: `docker/postgres/entrypoint-wrapper.sh`
- **Health check**: `pg_isready -U hris -d hris` every 10s
- **Volumes**: `postgres_data` (data), `postgres_wal_archive` (WAL archive for PITR)
- **Resource limits**: 2 CPU, 2GB memory

### PgBouncer (`pgbouncer`)

- **Image**: `edoburu/pgbouncer:1.23.1`
- **Container**: `staffora-pgbouncer`
- **Port**: `${PGBOUNCER_PORT:-6432}:6432`
- **Mode**: Transaction-mode pooling -- connections returned to pool after each transaction. Safe because RLS context is set per-transaction via `app.set_tenant_context()`.
- **Config**: `docker/pgbouncer/pgbouncer.ini`, `docker/pgbouncer/userlist.txt`
- **Architecture**: `API/Worker --[max_client_conn=200]--> PgBouncer --[pool_size=20]--> PostgreSQL`
- **Health check**: `pg_isready -h 127.0.0.1 -p 6432 -U hris_app -d hris`
- **Depends on**: postgres (healthy)

### Redis (`redis`)

- **Image**: `redis:7`
- **Container**: `staffora-redis`
- **Port**: `${REDIS_PORT:-6379}:6379`
- **Config**: `docker/redis/redis.conf` (mounted read-only)
- **Password**: `${REDIS_PASSWORD:-staffora_redis_dev}`
- **Health check**: `redis-cli -a <password> --no-auth-warning ping` every 10s
- **Volume**: `redis_data`
- **Resource limits**: 1 CPU, 1GB memory

### API Server (`api`)

- **Build**: `packages/api/Dockerfile` (multi-stage: deps -> build -> prod-deps -> runner)
- **No fixed container name** (intentionally omitted to allow multiple replicas)
- **Port**: `${API_PORT:-3000}:3000`
- **Base image**: `oven/bun:1.3-alpine`
- **Runtime user**: `staffora` (non-root, UID 1001)
- **Health check**: Bun fetch against `http://localhost:3000/health` every 30s
- **Environment**: `DATABASE_APP_URL` routes through PgBouncer; `DATABASE_URL` connects directly for migrations
- **Depends on**: pgbouncer (healthy), redis (healthy)
- **Resource limits**: 2 CPU, 1GB memory
- **Stateless**: Sessions in PostgreSQL (Better Auth), cache/idempotency in Redis. No session affinity required.

### Background Worker (`worker`)

- **Build**: Same Dockerfile as API (`packages/api/Dockerfile`)
- **Container**: `staffora-worker`
- **Command override**: `["bun", "run", "packages/api/src/worker.ts"]`
- **Health port**: `3001` (separate from API)
- **Environment**: Same database and Redis URLs as API, plus SMTP, storage, and ClamAV configuration
- **Volume**: `worker_uploads` mounted at `/app/uploads`
- **Depends on**: pgbouncer (healthy), redis (healthy)
- **Resource limits**: 1 CPU, 1GB memory

### Web Frontend (`web`)

- **Build**: `packages/web/Dockerfile`
- **Container**: `staffora-web`
- **Port**: `${WEB_PORT:-5173}:5173`
- **Environment**: `VITE_API_URL` for client-side API calls, `INTERNAL_API_URL: http://api:3000` for server-side rendering (uses Docker service name for DNS-based load balancing)
- **Health check**: `wget -q --spider http://localhost:5173/healthz`
- **Depends on**: api (healthy)
- **Resource limits**: 1 CPU, 512MB memory

### Database Backup Sidecar (`backup`)

- **Image**: `postgres:16` (uses pg_dump from the same version)
- **Container**: `staffora-backup`
- **Schedule**: `${BACKUP_SCHEDULE:-0 2 * * *}` (daily at 02:00 UTC by default)
- **Retention**: `${BACKUP_RETENTION_DAYS:-7}` days locally
- **S3 offsite**: Set `S3_BACKUP_BUCKET` to enable automatic upload to S3
- **S3 retention tiers**: Daily (30 days), Weekly (90 days), Monthly (365 days)
- **Verification**: `${VERIFY_BACKUP:-weekly}` (false, true/always, or weekly)
- **Volumes**: `backup_data`, `postgres_wal_archive` (read-only)
- **Manual backup**: `docker exec staffora-backup /scripts/backup-db.sh`
- **Manual restore from S3**: `docker exec staffora-backup /scripts/restore-from-s3.sh`

---

## Optional Services

### ClamAV Virus Scanner (`clamav`)

- **Profile**: `scanning`
- **Image**: `clamav/clamav:1.4`
- **Port**: `${CLAMAV_PORT:-3310}:3310`
- **First startup**: Downloads virus definitions (~300MB), may take several minutes
- **Enable in API/worker**: Set `CLAMAV_ENABLED=true` in `.env`
- **Behavior when unavailable**: Fail-open (uploads proceed with warning logged)
- **Resource limits**: 1 CPU, 2GB memory

### Uptime Kuma (`uptime-kuma`)

- **Profile**: `uptime`
- **Image**: `louislam/uptime-kuma:1`
- **Dashboard**: `http://localhost:${UPTIME_KUMA_PORT:-3002}`
- **Features**: HTTP/TCP uptime monitoring, SSL certificate expiry checks, alerting (Slack, email, PagerDuty), public status page

### Nginx Reverse Proxy (`nginx`)

- **Profile**: `production`
- **Image**: `nginx:alpine`
- **Ports**: `80:80`, `443:443`
- **Config**: `docker/nginx/nginx.conf`, `docker/nginx/cache.conf`
- **SSL**: Certificates from Let's Encrypt via certbot (shared volumes)
- **Auto-reload**: Reloads config every 6 hours to pick up renewed certificates

### Certbot (`certbot`)

- **Profile**: `production`
- **Image**: `certbot/certbot:latest`
- **Renewal check**: Every 12 hours
- **First-time setup**: Run `./scripts/init-letsencrypt.sh`
- **Shared volumes**: `certbot_conf` (certificates), `certbot_webroot` (ACME challenges)

---

## Networking

All services communicate over a single Docker bridge network:

- **Network name**: `staffora-network`
- **Subnet**: `172.28.0.0/16`
- **Driver**: `bridge`

Service discovery uses Docker DNS. The `api` service name resolves to any healthy container, enabling round-robin load balancing when scaled.

---

## Volumes

| Volume | Purpose | Used By |
|--------|---------|---------|
| `postgres_data` | PostgreSQL data directory | postgres |
| `postgres_wal_archive` | WAL archive for PITR | postgres (rw), backup (ro) |
| `redis_data` | Redis persistence | redis |
| `worker_uploads` | File uploads from worker | worker |
| `backup_data` | Database backups | backup |
| `clamav_data` | Virus definition database | clamav |
| `nginx_cache` | Nginx proxy cache | nginx |
| `certbot_conf` | Let's Encrypt certificates | certbot (rw), nginx (ro) |
| `certbot_webroot` | ACME challenge files | certbot (rw), nginx (ro) |
| `uptime_kuma_data` | Uptime Kuma data | uptime-kuma |
| `loki_data` | Log storage | loki |
| `prometheus_data` | Metrics storage | prometheus |
| `grafana_data` | Grafana state | grafana |
| `tempo_data` | Trace storage | tempo |

---

## Environment Variables

Copy `docker/.env.example` to `docker/.env` and configure:

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL admin password | (set a strong password in production) |
| `SESSION_SECRET` | Session signing secret (32+ chars) | `openssl rand -base64 32` |
| `CSRF_SECRET` | CSRF token secret (32+ chars) | `openssl rand -base64 32` |
| `BETTER_AUTH_SECRET` | Better Auth secret (32+ chars) | `openssl rand -base64 32` |

### Key Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `POSTGRES_USER` | `hris` | PostgreSQL admin username |
| `POSTGRES_DB` | `hris` | Database name |
| `POSTGRES_PORT` | `5432` | PostgreSQL host port |
| `REDIS_PORT` | `6379` | Redis host port |
| `REDIS_PASSWORD` | `staffora_redis_dev` | Redis password |
| `API_PORT` | `3000` | API host port |
| `WEB_PORT` | `5173` | Web frontend host port |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins |
| `RATE_LIMIT_MAX` | `100` | Max requests per minute per IP |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window (ms) |
| `CLAMAV_ENABLED` | `false` | Enable virus scanning |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `BACKUP_SCHEDULE` | `0 2 * * *` | Backup cron expression |
| `BACKUP_RETENTION_DAYS` | `7` | Local backup retention |

See `docker/.env.example` for the complete list with descriptions.

---

## Development Workflow

### Starting Services

```bash
# Start core infrastructure (postgres + redis + pgbouncer)
bun run docker:up

# Or start all services including API, worker, and web
docker compose -f docker/docker-compose.yml up -d

# Start with monitoring
docker compose -f docker/docker-compose.yml --profile monitoring up -d
```

### Checking Status

```bash
bun run docker:ps       # Container status
bun run docker:logs     # Follow all logs
```

### Running Migrations

```bash
bun run migrate:up      # Apply pending migrations
```

### Local Development (without Docker for app services)

For faster iteration, run only infrastructure in Docker and the application locally:

```bash
# Start only postgres, redis, and pgbouncer
docker compose -f docker/docker-compose.yml up -d postgres redis pgbouncer

# Run API server locally with hot reload
bun run dev:api

# Run web frontend locally with hot reload
bun run dev:web

# Run background worker locally
bun run dev:worker
```

### Stopping Services

```bash
bun run docker:down     # Stop all services
```

### Rebuilding Containers

```bash
docker compose -f docker/docker-compose.yml build --no-cache api web
docker compose -f docker/docker-compose.yml up -d
```

### Viewing Logs for a Specific Service

```bash
docker compose -f docker/docker-compose.yml logs -f api
docker compose -f docker/docker-compose.yml logs -f worker
docker compose -f docker/docker-compose.yml logs -f postgres
```

---

## Production Deployment

### Building Production Images

The API Dockerfile (`packages/api/Dockerfile`) uses a 4-stage multi-stage build:

1. **deps** -- Install all dependencies (including devDependencies for build)
2. **builder** -- Build the API bundle with `bun build`
3. **prod-deps** -- Install production dependencies only
4. **runner** -- Final production image with non-root user (`staffora`, UID 1001)

The production image:
- Uses `oven/bun:1.3-alpine` as the base (minimal image size)
- Runs as non-root user for security
- Includes a health check (`/health` endpoint)
- Exposes port 3000
- Carries OCI metadata labels for traceability

### Deploying

See the CI/CD pipeline documentation (`docs/06-devops/ci-cd-pipeline.md`) for the automated deployment process. For manual deployment:

```bash
# On the deployment server
cd /opt/staffora

# Pull new images
docker compose pull api web

# Rolling restart (zero-downtime)
docker compose up -d --no-deps api
sleep 10
docker compose exec -T api bun run src/db/migrate.ts up
docker compose up -d --no-deps worker
docker compose up -d --no-deps web
```

---

## Horizontal Scaling

The API service is fully stateless and can be scaled to multiple instances:

```bash
# Scale to 3 API replicas
docker compose up -d --scale api=3

# Or use the scaling override file
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

When scaled, Docker DNS resolves the `api` service name to any healthy container, providing round-robin load balancing. The `web` service uses `INTERNAL_API_URL: http://api:3000` for server-side rendering requests, which automatically load-balances across API replicas.

No session affinity is needed because:
- Sessions are stored in PostgreSQL (Better Auth)
- Cache and idempotency keys are in Redis
- The API is completely stateless

---

## Resource Limits

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|--------------|--------------|-----------------|
| postgres | 2 | 2GB | 0.5 | 512MB |
| pgbouncer | 0.5 | 256MB | 0.1 | 64MB |
| redis | 1 | 1GB | 0.25 | 256MB |
| api | 2 | 1GB | 0.5 | 256MB |
| worker | 1 | 1GB | 0.25 | 256MB |
| web | 1 | 512MB | 0.25 | 128MB |
| backup | 0.5 | 512MB | 0.1 | 64MB |
| clamav | 1 | 2GB | 0.25 | 512MB |
| nginx | 0.5 | 256MB | -- | -- |
| grafana | 1 | 512MB | 0.25 | 128MB |
| prometheus | 1 | 512MB | 0.25 | 128MB |
| loki | 1 | 1GB | 0.25 | 256MB |
| tempo | 1 | 1GB | 0.25 | 256MB |

---

## Monitoring Stack

Enable with `docker compose --profile monitoring up -d`.

### Components

| Service | Port | Purpose |
|---------|------|---------|
| Grafana | `${GRAFANA_PORT:-3100}` | Dashboards and visualization (default: admin/staffora) |
| Prometheus | `${PROMETHEUS_PORT:-9090}` | Metrics collection (15-day retention) |
| Loki | `${LOKI_PORT:-3101}` | Log aggregation (30-day retention) |
| Promtail | (internal) | Log collection agent (Docker socket discovery) |
| Tempo | `${TEMPO_HTTP_PORT:-3200}` | Distributed tracing (72-hour retention) |
| Postgres Exporter | (internal) | PostgreSQL metrics for Prometheus |
| Redis Exporter | (internal) | Redis metrics for Prometheus |

### Architecture

```
Docker containers --> json-file driver --> /var/lib/docker/containers/
Promtail (tails log files via Docker socket) --> Loki (stores + indexes)
API/Worker --[OTLP HTTP]--> Tempo (stores + indexes traces)
Grafana (queries Loki via LogQL + Prometheus via PromQL + Tempo via TraceQL)
```

### Log Rotation

All containers use the `json-file` logging driver with rotation:
- High-volume services (api, worker, postgres, nginx): `max-size: 50m`, `max-file: 5`
- Low-volume services (redis, web, others): `max-size: 20m`, `max-file: 3`
- Utility services (backup, pgbouncer, exporters): `max-size: 10m`, `max-file: 2-3`

Promtail reads rotated log files seamlessly via the Docker socket.

### Enabling Distributed Tracing

1. Set `OTEL_ENABLED=true` in `docker/.env`
2. Start the monitoring profile: `docker compose --profile monitoring up -d`
3. Open Grafana at `http://localhost:3100` and navigate to Explore > Tempo

---

## Troubleshooting

### Containers not starting

```bash
# Check container status and exit codes
docker compose -f docker/docker-compose.yml ps -a

# Check logs for a specific failed service
docker compose -f docker/docker-compose.yml logs postgres
```

### Database connection refused

```bash
# Verify postgres is healthy
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U hris

# Check PgBouncer connectivity
docker compose -f docker/docker-compose.yml exec pgbouncer pg_isready -h 127.0.0.1 -p 6432
```

### Redis authentication errors

Ensure `REDIS_PASSWORD` in `docker/.env` matches what is passed to the `redis` service command. An empty password requires either unsetting `REDIS_PASSWORD` or using `--requirepass ""` (not recommended).

### Port conflicts

If a port is already in use, override it in `docker/.env`:

```env
POSTGRES_PORT=5433
REDIS_PORT=6380
API_PORT=3001
WEB_PORT=5174
```

### Resetting all data

```bash
bun run docker:down
docker volume rm $(docker volume ls -q | grep staffora)
bun run docker:up
bun run migrate:up
```
