# Blue/Green Deployment Strategy

> **Implementation Status:** PLANNED — This document describes the target blue/green deployment architecture. The separate compose files and nginx upstream configs have not yet been created. Current deployment uses a single docker-compose.yml.

*Last updated: 2026-03-21*
*Document owner: Platform Engineering*
*Review cadence: Quarterly*

---

## 1. Overview

Blue/green deployment maintains two identical production environments (blue and green). At any time, one environment serves live traffic while the other is idle or staging the next release. Traffic is switched atomically via nginx upstream configuration, enabling instant rollback.

### Benefits

- **Zero-downtime deployments**: Traffic switches in under 1 second.
- **Instant rollback**: Revert by switching nginx back to the previous environment.
- **Pre-production validation**: Run health checks, smoke tests, and load tests against the new environment before it receives real traffic.
- **Database migration safety**: Both versions must be compatible with the current schema, enforcing backward-compatible migrations.

### Architecture

```
                        ┌──────────────────────────────────┐
                        │           Load Balancer           │
                        │         (nginx on host)           │
                        └───────────┬──────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
             ┌──────┴──────┐                 ┌──────┴──────┐
             │  BLUE env   │                 │  GREEN env  │
             │  (active)   │                 │  (standby)  │
             ├─────────────┤                 ├─────────────┤
             │ API x2-8    │                 │ API x2-8    │
             │ Worker x1-4 │                 │ Worker x1-4 │
             │ Web x1      │                 │ Web x1      │
             └──────┬──────┘                 └──────┬──────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                        ┌───────────┴──────────────┐
                        │    Shared Infrastructure  │
                        │  PostgreSQL + PgBouncer   │
                        │  Redis                    │
                        └──────────────────────────┘
```

Both environments share the same PostgreSQL and Redis instances. Only the application tier (API, worker, web) is duplicated.

---

## 2. Environment Layout

### Docker Compose Project Names

Each environment runs as a separate Docker Compose project with isolated container names and networks but shared database and cache volumes.

| Component | Blue | Green |
|-----------|------|-------|
| Compose project | `staffora-blue` | `staffora-green` |
| API port range | `3010-3017` (internal) | `3020-3027` (internal) |
| Worker health port | `3011` | `3021` |
| Web port | `5174` (internal) | `5175` (internal) |
| Docker network | `staffora-blue-net` | `staffora-green-net` |

Nginx runs outside both environments on the host (or in its own container) and routes to the active environment's API and web backends.

### Directory Structure

```
/opt/staffora/
├── blue/
│   ├── docker-compose.yml          # Blue environment compose
│   └── .env                        # Blue-specific env vars (ports, project name)
├── green/
│   ├── docker-compose.yml          # Green environment compose
│   └── .env                        # Green-specific env vars (ports, project name)
├── nginx/
│   ├── nginx.conf                  # Main config (includes active-upstream.conf)
│   ├── active-upstream.conf        # Currently active upstream (blue or green)
│   ├── blue-upstream.conf          # Blue upstream definition
│   └── green-upstream.conf         # Green upstream definition
├── shared/
│   ├── docker-compose.shared.yml   # PostgreSQL, PgBouncer, Redis
│   └── .env                        # Database credentials, Redis password
└── scripts/
    ├── deploy.sh                   # Main deployment script
    ├── switch-traffic.sh           # Traffic switching script
    ├── rollback.sh                 # Instant rollback script
    └── health-check.sh             # Health check validation
```

---

## 3. Nginx Upstream Configuration

### `blue-upstream.conf`

```nginx
# Blue environment upstream
upstream api_backend {
    least_conn;
    server 127.0.0.1:3010;
    server 127.0.0.1:3011;
    keepalive 64;
    keepalive_timeout 60s;
}

upstream web_backend {
    server 127.0.0.1:5174;
    keepalive 16;
}
```

### `green-upstream.conf`

```nginx
# Green environment upstream
upstream api_backend {
    least_conn;
    server 127.0.0.1:3020;
    server 127.0.0.1:3021;
    keepalive 64;
    keepalive_timeout 60s;
}

upstream web_backend {
    server 127.0.0.1:5175;
    keepalive 16;
}
```

### Switching Traffic

The `active-upstream.conf` is a symlink to either `blue-upstream.conf` or `green-upstream.conf`. Switching traffic requires only updating the symlink and reloading nginx:

```bash
# Switch to green
ln -sf /opt/staffora/nginx/green-upstream.conf /opt/staffora/nginx/active-upstream.conf
nginx -t && nginx -s reload
```

The main `nginx.conf` includes this file:

```nginx
http {
    include /opt/staffora/nginx/active-upstream.conf;

    # ... rest of server configuration (same as docker/nginx/nginx.conf)
}
```

---

## 4. Database Migration Compatibility

Both blue and green environments connect to the same PostgreSQL instance. This means migrations must be **backward compatible**: both the old version and the new version must work with the current schema.

### Rules for Safe Migrations

| Operation | Safe? | Strategy |
|-----------|-------|----------|
| Add a new column with a default | Yes | Old code ignores it, new code uses it |
| Add a new table | Yes | Old code never queries it |
| Remove a column | No | Deploy in two phases: (1) stop reading column, (2) remove column in next release |
| Rename a column | No | Deploy in two phases: (1) add new column + write to both, (2) remove old column |
| Add NOT NULL constraint | No | (1) Add column as nullable, (2) backfill, (3) add constraint in next release |
| Change column type | No | Use two-phase approach similar to rename |

### Migration Execution

Migrations run **before** the new environment starts, while the old environment is still serving traffic:

```bash
# Run from the deployment script
DB_HOST=localhost DB_PORT=5432 DB_NAME=hris DB_USER=hris DB_PASSWORD=$DB_PASSWORD \
  bun run migrate:up
```

If the migration fails, the deployment aborts and the active environment remains unchanged.

---

## 5. Deployment Procedure

### Prerequisites

- Shared infrastructure (PostgreSQL, PgBouncer, Redis) is running
- Both blue and green directories have the base `docker-compose.yml`
- Nginx is configured with the `active-upstream.conf` symlink
- SSH access to the production host

### Step-by-Step

```bash
#!/usr/bin/env bash
# deploy.sh — Blue/Green Deployment Script for Staffora
set -euo pipefail

# ---- Configuration ----
DEPLOY_DIR="/opt/staffora"
REPO_URL="git@github.com:your-org/HRISystem.git"
RELEASE_TAG="${1:?Usage: deploy.sh <release-tag>}"

# Determine which environment is currently active and which is standby
ACTIVE=$(readlink -f "$DEPLOY_DIR/nginx/active-upstream.conf" | grep -oP '(blue|green)')
if [ "$ACTIVE" = "blue" ]; then
  STANDBY="green"
else
  STANDBY="blue"
fi

echo "=== Deploying $RELEASE_TAG to $STANDBY (currently active: $ACTIVE) ==="

# ---- Step 1: Pull new code to standby environment ----
cd "$DEPLOY_DIR/$STANDBY"
git fetch origin
git checkout "$RELEASE_TAG"
bun install --frozen-lockfile
bun run build

# ---- Step 2: Run database migrations (backward compatible) ----
echo "Running database migrations..."
DB_HOST=localhost DB_PORT=5432 DB_NAME=hris DB_USER=hris \
  DB_PASSWORD="$POSTGRES_PASSWORD" \
  bun run migrate:up

# ---- Step 3: Start the standby environment ----
echo "Starting $STANDBY environment..."
docker compose -p "staffora-$STANDBY" up -d --build --remove-orphans

# ---- Step 4: Wait for health checks ----
echo "Waiting for $STANDBY health checks..."
HEALTH_URL="http://127.0.0.1:$([ "$STANDBY" = "blue" ] && echo 3010 || echo 3020)/health"
RETRIES=30
for i in $(seq 1 $RETRIES); do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "Health check passed (attempt $i/$RETRIES)"
    break
  fi
  if [ "$i" = "$RETRIES" ]; then
    echo "ERROR: Health check failed after $RETRIES attempts. Aborting deployment."
    docker compose -p "staffora-$STANDBY" down
    exit 1
  fi
  sleep 5
done

# ---- Step 5: Run smoke tests against standby ----
echo "Running smoke tests against $STANDBY..."
API_BASE="http://127.0.0.1:$([ "$STANDBY" = "blue" ] && echo 3010 || echo 3020)"

# Verify health endpoint returns 200
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$API_BASE/health")
if [ "$HTTP_CODE" != "200" ]; then
  echo "ERROR: Health endpoint returned $HTTP_CODE. Aborting."
  docker compose -p "staffora-$STANDBY" down
  exit 1
fi

# Verify API version header or response
echo "Smoke tests passed."

# ---- Step 6: Switch traffic ----
echo "Switching traffic from $ACTIVE to $STANDBY..."
ln -sf "$DEPLOY_DIR/nginx/${STANDBY}-upstream.conf" "$DEPLOY_DIR/nginx/active-upstream.conf"
nginx -t
nginx -s reload

echo "Traffic now routed to $STANDBY."

# ---- Step 7: Verify live traffic ----
sleep 5
LIVE_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "https://app.staffora.co.uk/health")
if [ "$LIVE_CODE" != "200" ]; then
  echo "WARNING: Live health check returned $LIVE_CODE. Rolling back!"
  ln -sf "$DEPLOY_DIR/nginx/${ACTIVE}-upstream.conf" "$DEPLOY_DIR/nginx/active-upstream.conf"
  nginx -t && nginx -s reload
  echo "Rolled back to $ACTIVE."
  exit 1
fi

echo "=== Deployment complete: $RELEASE_TAG is live on $STANDBY ==="
echo ""
echo "To shut down the old environment (optional, keeps as rollback target):"
echo "  docker compose -p staffora-$ACTIVE down"
echo ""
echo "To rollback immediately:"
echo "  $DEPLOY_DIR/scripts/rollback.sh"
```

---

## 6. Rollback Procedure

Rollback is instant because the old environment is still running:

```bash
#!/usr/bin/env bash
# rollback.sh — Instant rollback to the previous environment
set -euo pipefail

DEPLOY_DIR="/opt/staffora"

ACTIVE=$(readlink -f "$DEPLOY_DIR/nginx/active-upstream.conf" | grep -oP '(blue|green)')
if [ "$ACTIVE" = "blue" ]; then
  ROLLBACK_TO="green"
else
  ROLLBACK_TO="blue"
fi

echo "Rolling back from $ACTIVE to $ROLLBACK_TO..."

# Verify rollback target is running
HEALTH_URL="http://127.0.0.1:$([ "$ROLLBACK_TO" = "blue" ] && echo 3010 || echo 3020)/health"
if ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
  echo "ERROR: $ROLLBACK_TO is not running. Cannot rollback."
  echo "Start it first: docker compose -p staffora-$ROLLBACK_TO up -d"
  exit 1
fi

# Switch traffic
ln -sf "$DEPLOY_DIR/nginx/${ROLLBACK_TO}-upstream.conf" "$DEPLOY_DIR/nginx/active-upstream.conf"
nginx -t && nginx -s reload

echo "Rollback complete. Traffic now routed to $ROLLBACK_TO."
```

**Rollback time**: Under 5 seconds (symlink update + nginx reload).

---

## 7. Health Check Validation

The health check script validates that an environment is fully operational before traffic is switched:

```bash
#!/usr/bin/env bash
# health-check.sh — Validate environment health
set -euo pipefail

ENV="${1:?Usage: health-check.sh <blue|green>}"
API_PORT=$([ "$ENV" = "blue" ] && echo 3010 || echo 3020)
BASE="http://127.0.0.1:$API_PORT"

echo "Checking $ENV environment ($BASE)..."

# 1. API health endpoint
HTTP_CODE=$(curl -sf -o /tmp/health.json -w "%{http_code}" "$BASE/health")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL: /health returned $HTTP_CODE"
  exit 1
fi
echo "PASS: /health returned 200"

# 2. Verify database connectivity (health endpoint checks this)
DB_STATUS=$(cat /tmp/health.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('database','unknown'))" 2>/dev/null || echo "unknown")
echo "INFO: Database status: $DB_STATUS"

# 3. Verify Redis connectivity
REDIS_STATUS=$(cat /tmp/health.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('redis','unknown'))" 2>/dev/null || echo "unknown")
echo "INFO: Redis status: $REDIS_STATUS"

# 4. Response time check (should be under 500ms for health endpoint)
RESPONSE_TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$BASE/health")
RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d. -f1)
if [ "$RESPONSE_MS" -gt 500 ]; then
  echo "WARN: /health response time ${RESPONSE_MS}ms exceeds 500ms threshold"
else
  echo "PASS: /health response time ${RESPONSE_MS}ms"
fi

echo ""
echo "$ENV environment health check: PASSED"
```

---

## 8. Environment-Specific Docker Compose

### `blue/docker-compose.yml`

```yaml
# Blue environment — application tier only
# Shared infrastructure (postgres, pgbouncer, redis) runs in staffora-shared project

services:
  api:
    build:
      context: /opt/staffora/blue/repo
      dockerfile: packages/api/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_APP_URL: postgres://hris_app:${POSTGRES_APP_PASSWORD}@host.docker.internal:6432/hris
      DATABASE_URL: postgres://hris:${POSTGRES_PASSWORD}@host.docker.internal:5432/hris
      REDIS_URL: redis://:${REDIS_PASSWORD}@host.docker.internal:6379
      SESSION_SECRET: ${SESSION_SECRET}
      CSRF_SECRET: ${CSRF_SECRET}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: https://app.staffora.co.uk
      CORS_ORIGIN: https://app.staffora.co.uk
      LOG_LEVEL: info
    ports:
      - "3010-3017:3000"
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3000/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 1G

  worker:
    build:
      context: /opt/staffora/blue/repo
      dockerfile: packages/api/Dockerfile
    restart: unless-stopped
    command: ["bun", "run", "src/worker.ts"]
    environment:
      NODE_ENV: production
      DATABASE_APP_URL: postgres://hris_app:${POSTGRES_APP_PASSWORD}@host.docker.internal:6432/hris
      DATABASE_URL: postgres://hris:${POSTGRES_PASSWORD}@host.docker.internal:5432/hris
      REDIS_URL: redis://:${REDIS_PASSWORD}@host.docker.internal:6379
      WORKER_TYPE: all
      WORKER_HEALTH_PORT: 3001
      LOG_LEVEL: info
    healthcheck:
      test: ["CMD-SHELL", "curl -sf http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

  web:
    build:
      context: /opt/staffora/blue/repo
      dockerfile: packages/web/Dockerfile
      args:
        VITE_API_URL: https://app.staffora.co.uk
    restart: unless-stopped
    ports:
      - "5174:5173"
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:5173/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
```

The green environment compose is identical except port mappings use `3020-3027` for the API and `5175` for the web frontend.

---

## 9. Monitoring During Deployment

During deployment, monitor the following:

| Metric | Where | Expected |
|--------|-------|----------|
| API error rate | Grafana > Staffora Overview | No increase after switch |
| API response time (P95) | Grafana > Staffora Overview | Under 500ms |
| Active connections per upstream | `nginx -T` or access logs | Traffic shifts to new env |
| Worker job processing | Grafana > Worker Dashboard | No stuck jobs |
| Database connections | PgBouncer admin console | Within pool limits |

### Grafana Annotation

After a successful deployment, create a Grafana annotation for correlation:

```bash
curl -X POST http://localhost:3100/api/annotations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -d "{
    \"text\": \"Deployment: $RELEASE_TAG to $STANDBY\",
    \"tags\": [\"deployment\", \"$STANDBY\"]
  }"
```

---

## 10. Checklist

### Pre-Deployment

- [ ] Migration is backward compatible (old code works with new schema)
- [ ] Release tag exists and has passed CI
- [ ] Shared infrastructure is healthy (PostgreSQL, PgBouncer, Redis)
- [ ] Disk space is sufficient on production host
- [ ] On-call engineer is available

### During Deployment

- [ ] Migrations ran successfully
- [ ] Standby environment started and healthy
- [ ] Smoke tests passed against standby
- [ ] Traffic switched via nginx
- [ ] Live health check passed after switch

### Post-Deployment

- [ ] Error rate unchanged in Grafana
- [ ] Response times within SLO (P95 < 500ms)
- [ ] Worker is processing jobs
- [ ] Old environment kept running (rollback target) for at least 1 hour
- [ ] Grafana deployment annotation created

---

## Related Documentation

- [Docs/operations/disaster-recovery.md](disaster-recovery.md) -- Recovery procedures and RTO/RPO targets
- [Docs/operations/auto-scaling.md](auto-scaling.md) -- Horizontal scaling configuration
- [Docs/guides/DEPLOYMENT.md](../05-development/DEPLOYMENT.md) -- General deployment guide
- [docker/docker-compose.scale.yml](../../docker/docker-compose.scale.yml) -- Scaling override
- [docker/nginx/nginx.conf](../../docker/nginx/nginx.conf) -- Production nginx configuration
