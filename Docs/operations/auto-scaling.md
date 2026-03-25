# Auto-Scaling Configuration

> **Implementation Status:** PLANNED — This document describes the target Docker Swarm auto-scaling setup. The swarm manifest and auto-scaler script have not yet been created. Current deployment uses standard Docker Compose.

*Last updated: 2026-03-21*
*Document owner: Platform Engineering*
*Review cadence: Quarterly*

---

## 1. Overview

Staffora uses Docker Swarm for production orchestration with auto-scaling based on system load. The API service scales horizontally (2-8 replicas) based on CPU and memory utilisation. The worker service scales independently (1-4 replicas) based on Redis queue depth.

### Architecture

```
                    ┌─────────────────────────────────┐
                    │       Nginx Load Balancer        │
                    │     (least_conn balancing)       │
                    └────────────────┬────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
    ┌─────┴─────┐            ┌──────┴──────┐           ┌──────┴──────┐
    │  API #1   │            │  API #2     │    ...    │  API #N     │
    │  (3000)   │            │  (3000)     │           │  (3000)     │
    └───────────┘            └─────────────┘           └─────────────┘
          │                          │                          │
          └──────────────────────────┼──────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
              │ PgBouncer │   │   Redis    │   │ Worker(s) │
              │  (6432)   │   │  (6379)    │   │  (1-4)    │
              └─────┬─────┘   └───────────┘   └───────────┘
                    │
              ┌─────┴─────┐
              │ PostgreSQL │
              │  (5432)    │
              └───────────┘
```

### Why Docker Swarm

Docker Swarm is chosen over Kubernetes for Staffora's deployment size because:

- **Lower operational overhead**: No etcd, no control plane, no CRDs to manage
- **Built into Docker**: No additional tooling required
- **Suitable scale**: Staffora runs on 1-3 VPS nodes, well within Swarm's design point
- **Declarative service definitions**: Uses the same `docker-compose.yml` format with `deploy` keys

---

## 2. Docker Swarm Deployment Manifest

### `docker-compose.swarm.yml`

```yaml
# =============================================================================
# Staffora Platform -- Docker Swarm Production Deployment
# =============================================================================
#
# Deploy:
#   docker stack deploy -c docker-compose.swarm.yml staffora
#
# Scale manually:
#   docker service scale staffora_api=5
#   docker service scale staffora_worker=3
#
# Monitor:
#   docker service ls
#   docker service ps staffora_api
#   docker service logs staffora_api --follow
# =============================================================================

version: "3.8"

services:
  # ---------------------------------------------------------------------------
  # PostgreSQL Database
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-hris}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-hris}
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - postgres_wal_archive:/wal-archive
    configs:
      - source: postgres_init
        target: /docker-entrypoint-initdb.d/init.sql
      - source: postgres_conf
        target: /etc/postgresql/postgresql.conf
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-hris}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.labels.db == true
      resources:
        limits:
          cpus: "2"
          memory: 2G
        reservations:
          cpus: "0.5"
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
        window: 120s

  # ---------------------------------------------------------------------------
  # PgBouncer Connection Pooler
  # ---------------------------------------------------------------------------
  pgbouncer:
    image: edoburu/pgbouncer:1.23.1
    configs:
      - source: pgbouncer_ini
        target: /etc/pgbouncer/pgbouncer.ini
      - source: pgbouncer_users
        target: /etc/pgbouncer/userlist.txt
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 6432 -U hris_app -d hris || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.labels.db == true
      resources:
        limits:
          cpus: "0.5"
          memory: 256M
        reservations:
          cpus: "0.1"
          memory: 64M

  # ---------------------------------------------------------------------------
  # Redis Cache & Queue
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7
    command: redis-server /usr/local/etc/redis/redis.conf --requirepass ${REDIS_PASSWORD}
    configs:
      - source: redis_conf
        target: /usr/local/etc/redis/redis.conf
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a ${REDIS_PASSWORD} --no-auth-warning ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.labels.cache == true
      resources:
        limits:
          cpus: "1"
          memory: 1G
        reservations:
          cpus: "0.25"
          memory: 256M

  # ---------------------------------------------------------------------------
  # API Server (Auto-Scaled: 2-8 replicas)
  # ---------------------------------------------------------------------------
  api:
    image: ${REGISTRY:-ghcr.io/your-org}/staffora-api:${VERSION:-latest}
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_APP_URL: postgres://hris_app:${POSTGRES_APP_PASSWORD}@pgbouncer:6432/${POSTGRES_DB:-hris}
      DATABASE_URL: postgres://hris:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-hris}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      SESSION_SECRET: ${SESSION_SECRET}
      CSRF_SECRET: ${CSRF_SECRET}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL:-https://app.staffora.co.uk}
      CORS_ORIGIN: ${CORS_ORIGIN:-https://app.staffora.co.uk}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      RATE_LIMIT_MAX: ${RATE_LIMIT_MAX:-100}
      RATE_LIMIT_WINDOW: ${RATE_LIMIT_WINDOW:-60000}
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 2
      # Swarm does not have built-in HPA. See Section 3 for the external
      # auto-scaler script that adjusts replica count based on metrics.
      update_config:
        parallelism: 1
        delay: 15s
        failure_action: rollback
        monitor: 30s
        order: start-first
      rollback_config:
        parallelism: 1
        delay: 5s
        order: stop-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
        window: 120s
      resources:
        limits:
          cpus: "2"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 256M

  # ---------------------------------------------------------------------------
  # Background Worker (Auto-Scaled: 1-4 replicas)
  # ---------------------------------------------------------------------------
  worker:
    image: ${REGISTRY:-ghcr.io/your-org}/staffora-api:${VERSION:-latest}
    command: ["bun", "run", "src/worker.ts"]
    environment:
      NODE_ENV: production
      DATABASE_APP_URL: postgres://hris_app:${POSTGRES_APP_PASSWORD}@pgbouncer:6432/${POSTGRES_DB:-hris}
      DATABASE_URL: postgres://hris:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-hris}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      WORKER_TYPE: all
      WORKER_HEALTH_PORT: 3001
      LOG_LEVEL: ${LOG_LEVEL:-info}
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      SMTP_FROM: ${SMTP_FROM:-noreply@staffora.co.uk}
      STORAGE_TYPE: ${STORAGE_TYPE:-local}
      S3_BUCKET: ${S3_BUCKET:-}
      S3_REGION: ${S3_REGION:-eu-west-2}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-}
    volumes:
      - worker_uploads:/app/uploads
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 1
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
        monitor: 30s
        order: start-first
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 5
        window: 120s
      resources:
        limits:
          cpus: "1"
          memory: 1G
        reservations:
          cpus: "0.25"
          memory: 256M

  # ---------------------------------------------------------------------------
  # Web Frontend
  # ---------------------------------------------------------------------------
  web:
    image: ${REGISTRY:-ghcr.io/your-org}/staffora-web:${VERSION:-latest}
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:5173/healthz || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - staffora
    deploy:
      mode: replicated
      replicas: 1
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M

  # ---------------------------------------------------------------------------
  # Nginx Load Balancer
  # ---------------------------------------------------------------------------
  nginx:
    image: nginx:alpine
    ports:
      - target: 80
        published: 80
        mode: host
      - target: 443
        published: 443
        mode: host
    configs:
      - source: nginx_conf
        target: /etc/nginx/nginx.conf
    volumes:
      - nginx_ssl:/etc/nginx/ssl:ro
    networks:
      - staffora
    deploy:
      mode: global
      placement:
        constraints:
          - node.role == manager
      resources:
        limits:
          cpus: "1"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 128M

# =============================================================================
# Configs (stored in Swarm's Raft log, distributed to nodes)
# =============================================================================
configs:
  postgres_init:
    file: ./docker/postgres/init.sql
  postgres_conf:
    file: ./docker/postgres/postgresql.conf
  pgbouncer_ini:
    file: ./docker/pgbouncer/pgbouncer.ini
  pgbouncer_users:
    file: ./docker/pgbouncer/userlist.txt
  redis_conf:
    file: ./docker/redis/redis.conf
  nginx_conf:
    file: ./docker/nginx/nginx.conf

# =============================================================================
# Volumes
# =============================================================================
volumes:
  postgres_data:
    driver: local
  postgres_wal_archive:
    driver: local
  redis_data:
    driver: local
  worker_uploads:
    driver: local
  nginx_ssl:
    driver: local

# =============================================================================
# Networks
# =============================================================================
networks:
  staffora:
    driver: overlay
    attachable: true
```

---

## 3. Auto-Scaler Script

Docker Swarm does not include a built-in Horizontal Pod Autoscaler like Kubernetes. The following cron-based script polls metrics and adjusts replica counts.

### `scripts/auto-scale.sh`

```bash
#!/usr/bin/env bash
# =============================================================================
# Staffora Auto-Scaler for Docker Swarm
# =============================================================================
#
# Adjusts API and worker replica counts based on system load.
#
# Install as a cron job (runs every 60 seconds):
#   * * * * * /opt/staffora/scripts/auto-scale.sh >> /var/log/staffora/autoscale.log 2>&1
#
# =============================================================================
set -euo pipefail

# ---- Configuration ----
API_SERVICE="staffora_api"
WORKER_SERVICE="staffora_worker"

API_MIN_REPLICAS=2
API_MAX_REPLICAS=8
WORKER_MIN_REPLICAS=1
WORKER_MAX_REPLICAS=4

# Scale-up thresholds
API_CPU_SCALE_UP=70        # Percentage: scale up if average CPU > 70%
API_MEMORY_SCALE_UP=80     # Percentage: scale up if average memory > 80%

# Scale-down thresholds
API_CPU_SCALE_DOWN=30      # Percentage: scale down if average CPU < 30%
API_MEMORY_SCALE_DOWN=40   # Percentage: scale down if average memory < 40%

# Worker scales on Redis queue depth
WORKER_QUEUE_SCALE_UP=100  # Scale up if pending jobs > 100
WORKER_QUEUE_SCALE_DOWN=10 # Scale down if pending jobs < 10

# Cooldown: minimum seconds between scaling actions
COOLDOWN_SECONDS=300       # 5 minutes
COOLDOWN_FILE="/tmp/staffora-autoscale-cooldown"

REDIS_PASSWORD="${REDIS_PASSWORD:-staffora_redis_dev}"

# ---- Helpers ----

get_current_replicas() {
  local service="$1"
  docker service inspect --format '{{.Spec.Mode.Replicated.Replicas}}' "$service" 2>/dev/null || echo "0"
}

get_api_cpu_usage() {
  # Query Prometheus for average CPU usage across API containers
  # Falls back to docker stats if Prometheus is unavailable
  if curl -sf "http://localhost:9090/api/v1/query?query=avg(rate(container_cpu_usage_seconds_total{container_label_com_docker_swarm_service_name=\"${API_SERVICE}\"}[1m]))*100" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['data']['result']:
    print(int(float(data['data']['result'][0]['value'][1])))
else:
    print(0)
" 2>/dev/null; then
    return
  fi

  # Fallback: docker stats (less accurate, but always available)
  docker stats --no-stream --format "{{.CPUPerc}}" $(docker service ps -q "$API_SERVICE" --filter desired-state=running 2>/dev/null) 2>/dev/null \
    | sed 's/%//' \
    | awk '{ total += $1; count++ } END { if (count > 0) printf "%d", total/count; else print "0" }' || echo "0"
}

get_api_memory_usage() {
  # Query Prometheus for average memory usage percentage
  if curl -sf "http://localhost:9090/api/v1/query?query=avg(container_memory_usage_bytes{container_label_com_docker_swarm_service_name=\"${API_SERVICE}\"}/container_spec_memory_limit_bytes)*100" 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data['data']['result']:
    print(int(float(data['data']['result'][0]['value'][1])))
else:
    print(0)
" 2>/dev/null; then
    return
  fi
  echo "0"
}

get_redis_queue_depth() {
  # Sum of pending messages across all Staffora Redis Streams
  redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XLEN staffora:outbox 2>/dev/null || echo "0"
}

check_cooldown() {
  if [ -f "$COOLDOWN_FILE" ]; then
    local last_scale
    last_scale=$(cat "$COOLDOWN_FILE")
    local now
    now=$(date +%s)
    local elapsed=$(( now - last_scale ))
    if [ "$elapsed" -lt "$COOLDOWN_SECONDS" ]; then
      echo "Cooldown active (${elapsed}s / ${COOLDOWN_SECONDS}s). Skipping."
      exit 0
    fi
  fi
}

set_cooldown() {
  date +%s > "$COOLDOWN_FILE"
}

scale_service() {
  local service="$1"
  local target="$2"
  local current
  current=$(get_current_replicas "$service")

  if [ "$target" != "$current" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Scaling $service: $current -> $target replicas"
    docker service scale "$service=$target" --detach
    set_cooldown
  fi
}

# ---- Main ----

check_cooldown

# --- API auto-scaling (CPU/memory based) ---
API_CURRENT=$(get_current_replicas "$API_SERVICE")
API_CPU=$(get_api_cpu_usage)
API_MEM=$(get_api_memory_usage)
API_TARGET=$API_CURRENT

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) API: replicas=$API_CURRENT cpu=${API_CPU}% mem=${API_MEM}%"

if [ "$API_CPU" -gt "$API_CPU_SCALE_UP" ] || [ "$API_MEM" -gt "$API_MEMORY_SCALE_UP" ]; then
  # Scale up by 1 (bounded by max)
  API_TARGET=$(( API_CURRENT + 1 ))
  if [ "$API_TARGET" -gt "$API_MAX_REPLICAS" ]; then
    API_TARGET=$API_MAX_REPLICAS
  fi
elif [ "$API_CPU" -lt "$API_CPU_SCALE_DOWN" ] && [ "$API_MEM" -lt "$API_MEMORY_SCALE_DOWN" ]; then
  # Scale down by 1 (bounded by min)
  API_TARGET=$(( API_CURRENT - 1 ))
  if [ "$API_TARGET" -lt "$API_MIN_REPLICAS" ]; then
    API_TARGET=$API_MIN_REPLICAS
  fi
fi

scale_service "$API_SERVICE" "$API_TARGET"

# --- Worker auto-scaling (queue depth based) ---
WORKER_CURRENT=$(get_current_replicas "$WORKER_SERVICE")
QUEUE_DEPTH=$(get_redis_queue_depth)
WORKER_TARGET=$WORKER_CURRENT

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Worker: replicas=$WORKER_CURRENT queue_depth=$QUEUE_DEPTH"

if [ "$QUEUE_DEPTH" -gt "$WORKER_QUEUE_SCALE_UP" ]; then
  WORKER_TARGET=$(( WORKER_CURRENT + 1 ))
  if [ "$WORKER_TARGET" -gt "$WORKER_MAX_REPLICAS" ]; then
    WORKER_TARGET=$WORKER_MAX_REPLICAS
  fi
elif [ "$QUEUE_DEPTH" -lt "$WORKER_QUEUE_SCALE_DOWN" ]; then
  WORKER_TARGET=$(( WORKER_CURRENT - 1 ))
  if [ "$WORKER_TARGET" -lt "$WORKER_MIN_REPLICAS" ]; then
    WORKER_TARGET=$WORKER_MIN_REPLICAS
  fi
fi

scale_service "$WORKER_SERVICE" "$WORKER_TARGET"
```

---

## 4. Scale Triggers and Cooldown

### API Scaling Triggers

| Metric | Scale Up | Scale Down |
|--------|----------|------------|
| Average CPU usage | > 70% | < 30% |
| Average memory usage | > 80% | < 40% |
| Scaling increment | +1 replica | -1 replica |
| Minimum replicas | 2 | 2 |
| Maximum replicas | 8 | 8 |

### Worker Scaling Triggers

| Metric | Scale Up | Scale Down |
|--------|----------|------------|
| Redis queue depth (pending jobs) | > 100 | < 10 |
| Scaling increment | +1 replica | -1 replica |
| Minimum replicas | 1 | 1 |
| Maximum replicas | 4 | 4 |

### Cooldown Period

- **Duration**: 5 minutes (300 seconds)
- **Scope**: Global (any scaling action resets the cooldown for all services)
- **Purpose**: Prevents oscillation (rapid scale-up/scale-down cycles) and allows new replicas to stabilise and absorb load before the next scaling decision
- **Override**: Delete `/tmp/staffora-autoscale-cooldown` to force an immediate scaling evaluation

---

## 5. Load Balancer Health Checks and Graceful Draining

### Nginx Health Checks

Nginx checks API instance health using the `/health` endpoint. When an instance is removed during scale-down or rolling update, Docker Swarm's routing mesh handles draining:

```nginx
upstream api_backend {
    least_conn;
    server api:3000;
    keepalive 64;
    keepalive_timeout 60s;
}
```

Docker Swarm's built-in ingress routing mesh automatically:
1. Removes unhealthy tasks from the load balancer pool
2. Drains existing connections from tasks being shut down
3. Waits for the `stop_grace_period` before forcefully killing the container

### Graceful Shutdown

The API server handles `SIGTERM` for graceful shutdown:

1. Swarm sends `SIGTERM` to the container
2. The API stops accepting new connections
3. In-flight requests are allowed to complete (up to the `stop_grace_period`)
4. Database connections are returned to PgBouncer's pool
5. Redis connections are closed
6. The process exits

Configure the grace period in the Swarm manifest:

```yaml
services:
  api:
    stop_grace_period: 30s   # Allow 30s for in-flight requests to complete
```

### Health Check Configuration

| Service | Endpoint | Interval | Timeout | Retries | Start Period |
|---------|----------|----------|---------|---------|--------------|
| API | `GET /health` | 15s | 5s | 3 | 30s |
| Worker | `GET /health` (port 3001) | 30s | 10s | 3 | 30s |
| Web | `GET /healthz` | 30s | 10s | 3 | 10s |

If a health check fails 3 consecutive times, Swarm replaces the task with a new one on a healthy node.

---

## 6. PgBouncer Connection Budget

When scaling API instances, verify PgBouncer has sufficient connection capacity:

| Setting | Value | Rationale |
|---------|-------|-----------|
| `max_client_conn` | 200 | Supports up to 8 API replicas at ~25 connections each |
| `default_pool_size` | 20 | Server-side connections to PostgreSQL |
| `reserve_pool_size` | 5 | Emergency overflow pool |
| `reserve_pool_timeout` | 3 | Seconds before using reserve pool |

**Rule of thumb**: `max_client_conn >= (API_MAX_REPLICAS * 25) + (WORKER_MAX_REPLICAS * 10) + 20 (buffer)`

With 8 API + 4 worker replicas: `(8 * 25) + (4 * 10) + 20 = 260`. Increase `max_client_conn` to 300 if running at maximum scale.

---

## 7. Monitoring Auto-Scaling

### Log File

The auto-scaler logs to `/var/log/staffora/autoscale.log`:

```
2026-03-20T14:00:01Z API: replicas=2 cpu=45% mem=60%
2026-03-20T14:00:01Z Worker: replicas=1 queue_depth=5
2026-03-20T14:01:01Z API: replicas=2 cpu=72% mem=65%
2026-03-20T14:01:01Z Scaling staffora_api: 2 -> 3 replicas
2026-03-20T14:01:01Z Worker: replicas=1 queue_depth=150
2026-03-20T14:01:01Z Scaling staffora_worker: 1 -> 2 replicas
```

### Grafana Dashboard Queries

Add these panels to the Staffora Overview dashboard:

**API Replica Count**:
```promql
count(container_last_seen{container_label_com_docker_swarm_service_name="staffora_api"})
```

**Worker Replica Count**:
```promql
count(container_last_seen{container_label_com_docker_swarm_service_name="staffora_worker"})
```

**Redis Queue Depth**:
```promql
redis_stream_length{stream="staffora:outbox"}
```

### Alerts

Configure these Prometheus alert rules in `docker/prometheus/alert-rules.yml`:

```yaml
groups:
  - name: autoscaling
    rules:
      - alert: APIAtMaxReplicas
        expr: count(container_last_seen{container_label_com_docker_swarm_service_name="staffora_api"}) >= 8
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "API service at maximum replicas (8/8)"
          description: "API has been at maximum capacity for 10 minutes. Consider increasing API_MAX_REPLICAS or optimising slow endpoints."

      - alert: WorkerQueueBacklog
        expr: redis_stream_length{stream="staffora:outbox"} > 500
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Redis queue backlog exceeds 500 jobs"
          description: "Worker queue depth has been above 500 for 5 minutes. Workers may be stalled or insufficient."

      - alert: HighPgBouncerWaitingClients
        expr: pgbouncer_pools_client_waiting > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "PgBouncer has {{ $value }} waiting clients"
          description: "Connection pool may be saturated. Consider increasing pool_size or reducing API replicas."
```

---

## 8. Manual Scaling Commands

### Docker Swarm

```bash
# View current service state
docker service ls

# Scale API to 5 replicas
docker service scale staffora_api=5

# Scale worker to 3 replicas
docker service scale staffora_worker=3

# View task distribution across nodes
docker service ps staffora_api

# View service logs
docker service logs staffora_api --follow --tail 100
```

### Docker Compose (Development/Staging)

```bash
# Scale API to 3 replicas
docker compose -f docker/docker-compose.yml up -d --scale api=3

# Using the scale override file
docker compose -f docker/docker-compose.yml -f docker/docker-compose.scale.yml --profile production up -d
```

---

## Related Documentation

- [docker/docker-compose.scale.yml](../../docker/docker-compose.scale.yml) -- Docker Compose scaling override
- [Docs/operations/blue-green-deployment.md](blue-green-deployment.md) -- Blue/green deployment strategy
- [Docs/operations/pgbouncer-guide.md](pgbouncer-guide.md) -- PgBouncer connection pooling
- [Docs/operations/sla-slo-definitions.md](sla-slo-definitions.md) -- SLO targets for availability and latency
- [docker/nginx/nginx.conf](../../docker/nginx/nginx.conf) -- Nginx load balancer configuration
