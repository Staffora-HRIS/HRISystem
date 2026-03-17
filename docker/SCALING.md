# Horizontal Scaling Guide

This document explains how to horizontally scale the Staffora API servers behind the nginx load balancer.

## Architecture Overview

```
                         +------------------+
                         |     Nginx LB     |
                         |  (least_conn)    |
                         |  ports 80/443    |
                         +--------+---------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
     +--------v--------+ +-------v---------+ +-------v---------+
     |   API Instance 1| |  API Instance 2 | |  API Instance 3 |
     |   (port 3000)   | |  (port 3000)    | |  (port 3000)    |
     +--------+--------+ +--------+--------+ +--------+--------+
              |                    |                   |
     +--------v--------------------v-------------------v--------+
     |                       PgBouncer                          |
     |                    (port 6432)                           |
     +----------------------------+-----------------------------+
              |                                        |
     +--------v--------+                      +--------v--------+
     |   PostgreSQL    |                      |     Redis       |
     |  (port 5432)    |                      |   (port 6379)   |
     +-----------------+                      +-----------------+
```

## Why No Session Affinity Is Needed

The API is fully stateless. All state is externalised to shared backing services:

| State Type       | Storage          | Shared? | Notes                                  |
|------------------|------------------|---------|----------------------------------------|
| User sessions    | PostgreSQL       | Yes     | Better Auth stores sessions in `app."session"` table |
| Session cookies  | Client browser   | N/A     | Cookie sent with every request; any API instance can validate it |
| Rate limiting    | Redis            | Yes     | Shared counters across all instances   |
| Idempotency keys | Redis/PostgreSQL | Yes     | Scoped by (tenant_id, user_id, route)  |
| Cache            | Redis            | Yes     | Shared cache layer                     |
| Domain events    | PostgreSQL       | Yes     | Outbox table; worker polls independently |

Because there is no in-process state, any API instance can handle any request. The nginx load balancer uses `least_conn` strategy (not round-robin) for optimal distribution across instances with varying request durations.

## Quick Start

### Option 1: Using --scale flag

```bash
# Start with 3 API instances behind nginx
cd docker
docker compose --profile production up -d --scale api=3
```

### Option 2: Using the scale override file

```bash
# Start with pre-configured scaling (default: 3 replicas)
cd docker
docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile production up -d

# Override the replica count via environment variable
API_REPLICAS=5 docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile production up -d
```

### Option 3: Scale at runtime

```bash
# Start normally, then scale up
cd docker
docker compose --profile production up -d
docker compose up -d --scale api=5 --no-recreate

# Scale down (traffic drains gracefully via health checks)
docker compose up -d --scale api=2 --no-recreate
```

## Verifying Load Distribution

### Check running instances

```bash
docker compose ps api
```

Expected output with 3 replicas:
```
NAME           SERVICE   STATUS    PORTS
docker-api-1   api       running   3000/tcp
docker-api-2   api       running   3000/tcp
docker-api-3   api       running   3000/tcp
```

### Check nginx upstream routing

The nginx access log includes the `upstream=` field showing which API instance handled each request:

```bash
docker compose logs nginx | grep 'upstream='
```

### Check via response headers

Every API response includes an `X-Upstream-Instance` header showing the IP:port of the backend that handled it:

```bash
# Make multiple requests and observe different upstream addresses
for i in 1 2 3 4 5; do
  curl -s -D - https://yourdomain.com/health 2>/dev/null | grep X-Upstream-Instance
done
```

### Check health of all instances

```bash
# Health check through nginx (picks one instance)
curl http://localhost/health

# Health check each instance directly (if ports are exposed)
docker compose exec --index=1 api bun -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(console.log)"
docker compose exec --index=2 api bun -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(console.log)"
docker compose exec --index=3 api bun -e "fetch('http://localhost:3000/health').then(r=>r.json()).then(console.log)"
```

## Monitoring Scaled Instances

### Prometheus

Prometheus is configured with `dns_sd_configs` to automatically discover all API instances via Docker DNS. When you scale the API service, Prometheus will detect and start scraping the new instances within 10 seconds (the DNS refresh interval).

Check discovered targets at: `http://localhost:9090/targets`

### Grafana

The Staffora overview dashboard will show metrics aggregated across all API instances. Use the `instance` label to filter by individual instance.

### Logs

View logs from all API instances:

```bash
# All instances
docker compose logs -f api

# Specific instance
docker compose logs -f api --index=2
```

## Resource Planning

### Per-Instance Resource Requirements

| Resource | Default Limit | Default Reservation |
|----------|--------------|---------------------|
| CPU      | 2 cores      | 0.25 cores          |
| Memory   | 1 GB         | 256 MB              |

### Connection Budget Per Instance

Each API instance creates connections to PostgreSQL (via PgBouncer) and Redis:

| Connection Type | Per Instance | Notes                     |
|-----------------|-------------|---------------------------|
| PgBouncer       | ~25         | Via postgres.js pool       |
| Better Auth pg  | 5           | Separate pg Pool           |
| Redis           | ~10         | Cache + rate limiting      |

### Scaling Limits

| Component   | Default Capacity | Bottleneck At             |
|-------------|-----------------|---------------------------|
| PgBouncer   | 200 client conn | ~8 API instances          |
| PostgreSQL  | 100 connections | Increase max_connections   |
| Redis       | 10000 clients   | ~1000 API instances       |
| Nginx       | 2048 conn/worker| ~500 concurrent requests  |

To scale beyond 8 API instances, increase PgBouncer's `max_client_conn` in `docker/pgbouncer/pgbouncer.ini`.

## Rolling Updates (Zero Downtime)

The `docker-compose.scale.yml` configures rolling updates:

```yaml
update_config:
  parallelism: 1     # Update one instance at a time
  delay: 10s         # Wait 10s between instances
  order: start-first # Start new before stopping old
  monitor: 30s       # Monitor health for 30s after start
  failure_action: rollback  # Roll back if health check fails
```

To perform a zero-downtime update:

```bash
# Rebuild the API image
docker compose build api

# Roll out the update (one instance at a time)
docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile production up -d
```

Nginx's `proxy_next_upstream` directive handles in-flight requests during updates by retrying failed connections on the next healthy instance.

## Troubleshooting

### Instance not receiving traffic

1. Check if the instance is healthy:
   ```bash
   docker compose ps api
   ```
2. Check if nginx can resolve the service DNS:
   ```bash
   docker compose exec nginx nslookup api
   ```
3. Check nginx error log:
   ```bash
   docker compose logs nginx | grep error
   ```

### Uneven load distribution

The `least_conn` strategy sends requests to the instance with fewest active connections. If one instance consistently has more connections, check:

1. Is one instance slower? Check per-instance response times in Prometheus/Grafana.
2. Are there long-running requests? Check for slow queries or large exports.
3. Is the health check passing for all instances? Unhealthy instances are removed from the pool.

### Port conflicts when scaling

If you see port binding errors, ensure `container_name` is not set on the API service (it has been removed to allow replicas) and that you are not trying to bind all instances to the same host port. When using `--scale`, access the API through nginx (ports 80/443) instead of direct host port binding.

### Database connection exhaustion

Symptoms: `too many connections` errors in API logs.

Solution: Increase PgBouncer's `max_client_conn` or reduce per-instance pool size:

```ini
# docker/pgbouncer/pgbouncer.ini
max_client_conn = 400  # Increase from default 200
```

## Environment Variables

| Variable       | Default | Description                              |
|----------------|---------|------------------------------------------|
| `API_REPLICAS` | 3       | Number of API instances (scale override) |
| `API_PORT`     | 3000    | Host port for single-instance dev mode   |
