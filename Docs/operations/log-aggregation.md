# Log Aggregation with Loki + Promtail + Grafana

> **Status:** Implemented
> **Last updated:** 2026-03-17
> **Addresses:** TODO-082, Production Checklist Section 4 (Monitoring & Observability / Logging)

---

## Overview

Staffora uses **Grafana Loki** for centralized log aggregation and **Promtail** as the log collection agent. All Docker container logs are automatically collected, labeled, and made searchable through **Grafana**.

### Architecture

```
Docker containers
    |
    | (json-file log driver, max-size: 50m, max-file: 5)
    v
/var/lib/docker/containers/*.log
    |
    | (Promtail tails via Docker socket)
    v
Promtail (label extraction, JSON parsing)
    |
    | (HTTP push)
    v
Loki (stores, indexes labels, compacts)
    |
    | (LogQL queries)
    v
Grafana (dashboards, Explore, alerts)
```

### Why Loki?

- **Label-based indexing** -- indexes metadata (container, service, level) not full text, keeping storage costs low
- **LogQL** -- Prometheus-like query language, familiar to anyone who uses PromQL
- **Grafana native** -- first-class Grafana integration, correlate logs with metrics on the same dashboard
- **Lightweight** -- single binary, no JVM, no Elasticsearch cluster overhead
- **Already integrated** -- Grafana is already deployed for Prometheus metrics

---

## Quick Start

### Start the logging stack

```bash
# Logging only (extends main compose)
docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.logging.yml up -d

# Full observability (metrics + logs)
docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.monitoring.yml \
  -f docker/docker-compose.logging.yml up -d
```

### Stop the logging stack

```bash
docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.logging.yml down
```

### Access Grafana

- **URL:** http://localhost:3100
- **Credentials:** admin / staffora (change in production)
- **Logs dashboard:** Dashboards > Staffora > Staffora Logs
- **Ad-hoc queries:** Explore > select Loki datasource

---

## Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| Loki | `grafana/loki:3.4.2` | 3101 (HTTP API) | Log storage and indexing |
| Promtail | `grafana/promtail:3.4.2` | 9080 (status) | Log collection from Docker containers |
| Grafana | `grafana/grafana:10.4.1` | 3100 (UI) | Visualization and querying |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `docker/docker-compose.logging.yml` | Docker Compose override with Loki, Promtail, Grafana |
| `docker/loki/loki-config.yml` | Loki server configuration (storage, retention, limits) |
| `docker/promtail/promtail-config.yml` | Promtail scrape config (Docker discovery, label extraction, pipeline) |
| `docker/grafana/provisioning/datasources/loki.yml` | Grafana datasource auto-provisioning for Loki |
| `docker/grafana/dashboards/staffora-logs.json` | Pre-built log exploration dashboard |

---

## Log Rotation

All containers are configured with Docker's `json-file` logging driver with rotation:

| Service | max-size | max-file | Total max per container |
|---------|----------|----------|------------------------|
| API | 50 MB | 5 | 250 MB |
| Worker | 50 MB | 5 | 250 MB |
| PostgreSQL | 50 MB | 5 | 250 MB |
| Nginx | 50 MB | 5 | 250 MB |
| Redis | 20 MB | 3 | 60 MB |
| Web | 20 MB | 3 | 60 MB |
| Grafana | 20 MB | 3 | 60 MB |
| Prometheus | 20 MB | 3 | 60 MB |
| Loki | 20 MB | 3 | 60 MB |
| Promtail | 10 MB | 3 | 30 MB |
| Backup | 10 MB | 3 | 30 MB |
| Exporters | 10 MB | 2 | 20 MB |

**Total worst-case disk usage for raw logs:** ~1.1 GB

Promtail reads rotated log files seamlessly via the Docker socket -- no log loss during rotation.

---

## Loki Retention

- **Default retention period:** 30 days (720 hours)
- **Override via environment variable:** `LOKI_RETENTION_PERIOD=2160h` (90 days)
- **Compactor runs every 10 minutes** to merge index files and enforce retention

### Changing retention

Set in `docker/.env`:

```bash
LOKI_RETENTION_PERIOD=2160h  # 90 days
```

Or pass directly:

```bash
LOKI_RETENTION_PERIOD=720h docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.logging.yml up -d
```

---

## Querying Logs (LogQL)

### Grafana Explore

1. Open Grafana at http://localhost:3100
2. Click **Explore** in the left sidebar
3. Select **Loki** as the datasource
4. Write LogQL queries

### Common Queries

```logql
# All logs from the API service
{service="api"}

# API errors only
{service="api"} |~ "(?i)error"

# Structured JSON log parsing -- filter by level
{service="api"} | json | level="error"

# API requests with status 500
{service="api"} | json | status="500"

# Search by request ID (for request tracing)
{service="api"} |~ "abc12345-request-id-here"

# Worker outbox processing logs
{service="worker"} |~ "outbox"

# PostgreSQL slow queries or errors
{service="postgres"} |~ "(?i)slow|error|deadlock"

# Redis connection issues
{service="redis"} |~ "(?i)error|refused|timeout"

# Log volume rate by service (metric query)
sum by (service) (rate({project="docker"} [5m]))

# Top 5 services by error count
topk(5, sum by (service) (count_over_time({project="docker"} |~ "(?i)error" [1h])))
```

### LogQL Syntax Reference

| Pattern | Meaning |
|---------|---------|
| `{service="api"}` | Stream selector -- filter by label |
| `\|~` "regex" | Log line regex filter |
| `\|=` "exact" | Log line exact match |
| `!~` "regex" | Negative regex filter |
| `\| json` | Parse JSON and extract fields |
| `\| level="error"` | Filter by extracted field |
| `\| line_format "..."` | Reformat log line for display |
| `count_over_time(...)` | Count log lines over a time range |
| `rate(...)` | Calculate log line rate |
| `sum by (label) (...)` | Aggregate by label |

---

## Dashboard: Staffora Logs

The pre-built dashboard (`staffora-logs.json`) provides:

### Panels

1. **Log Volume & Health** -- stat panels showing total lines, errors, warnings, active containers
2. **Log Volume by Service** -- stacked bar chart of log volume per container over time
3. **Log Volume by Level** -- stacked bar chart coloured by log level (debug/info/warn/error/fatal)
4. **API Request Logs** -- live log viewer with structured request data (method, path, status, duration, requestId)
5. **Errors & Warnings** -- filtered log viewer showing only error/warning lines across all services
6. **Worker Logs** -- background worker log viewer
7. **Database & Redis Logs** -- side-by-side log viewers for infrastructure services
8. **All Logs (Live Tail)** -- unfiltered log stream for real-time debugging

### Variables

- **Service** -- dropdown to filter by Docker Compose service (api, worker, postgres, redis, web, etc.)
- **Log Level** -- dropdown to filter by log level (debug, info, warn, error, fatal)

---

## Structured Logging

Promtail is configured to parse JSON-structured logs emitted by the API and Worker services. The following fields are extracted as labels or displayed in log details:

| Field | Label? | Description |
|-------|--------|-------------|
| `level` | Yes | Log level (debug, info, warn, error, fatal) |
| `msg` | No | Log message |
| `requestId` | No | Request correlation ID |
| `tenantId` | No | Tenant UUID (for multi-tenant debugging) |
| `userId` | No | Actor user UUID |
| `method` | No | HTTP method |
| `path` | No | Request path |
| `status` | No | HTTP response status code |
| `duration` | No | Request duration in ms |
| `error` | No | Error message/stack |

### Best Practices for Application Logging

To get the most out of log aggregation, application code should:

1. **Use structured JSON logging** -- emit `{ "level": "info", "msg": "...", ... }` format
2. **Include requestId** -- propagate the request ID from the errors plugin through all log calls
3. **Include tenantId and userId** -- for multi-tenant debugging and audit correlation
4. **Use consistent log levels** -- `debug` for development, `info` for operational events, `warn` for recoverable issues, `error` for failures
5. **Do not log sensitive data** -- never log passwords, tokens, PII, or full request bodies containing personal data

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOKI_PORT` | `3101` | Loki HTTP API port (host-side) |
| `LOKI_RETENTION_PERIOD` | `720h` | How long Loki retains logs (30 days) |
| `GRAFANA_PORT` | `3100` | Grafana UI port |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `staffora` | Grafana admin password (change in production) |

---

## Resource Limits

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|--------------|--------------|-----------------|
| Loki | 1 | 1 GB | 0.25 | 256 MB |
| Promtail | 0.5 | 256 MB | 0.1 | 64 MB |
| Grafana | 1 | 512 MB | 0.25 | 128 MB |

**Total additional resources for logging stack:** 2.5 CPU / 1.75 GB memory (limits)

---

## Troubleshooting

### Loki is not receiving logs

1. Check Promtail is running and healthy:
   ```bash
   docker compose -f docker/docker-compose.yml \
     -f docker/docker-compose.logging.yml ps promtail
   ```

2. Check Promtail targets (should show discovered containers):
   ```bash
   curl -s http://localhost:9080/targets | head -50
   ```

3. Check Loki is ready:
   ```bash
   curl -s http://localhost:3101/ready
   ```

4. Verify Docker socket is mounted (Promtail needs it for discovery):
   ```bash
   docker exec staffora-promtail ls -la /var/run/docker.sock
   ```

### No logs appearing in Grafana

1. Verify Loki datasource is provisioned:
   - Go to Grafana > Configuration > Data Sources
   - "Loki" should appear with a green checkmark

2. Try a simple query in Explore:
   ```logql
   {service=~".+"}
   ```

3. Check Loki ingestion metrics:
   ```bash
   curl -s http://localhost:3101/metrics | grep loki_distributor_lines_received_total
   ```

### High memory usage

- Reduce `max_streams_per_user` in `loki-config.yml`
- Reduce `ingestion_rate_mb` and `ingestion_burst_size_mb`
- Lower the retention period
- Increase the Loki memory limit in `docker-compose.logging.yml`

### Promtail not discovering containers

- Ensure the Docker Compose project label matches the filter in `promtail-config.yml`
- The default filter is `com.docker.compose.project=docker` (the directory name)
- If your project directory has a different name, update the filter:
  ```yaml
  filters:
    - name: label
      values: ["com.docker.compose.project=your-directory-name"]
  ```

---

## Production Considerations

### Security

- **Change Grafana admin password** -- set `GRAFANA_ADMIN_PASSWORD` to a strong value
- **Restrict Loki port** -- do not expose port 3101 publicly; keep it internal to the Docker network
- **Enable auth** -- set `auth_enabled: true` in `loki-config.yml` for multi-tenant Loki
- **PII in logs** -- configure log masking in Promtail pipeline stages if application logs contain personal data

### Scaling

- **Loki** can be scaled horizontally with a shared object store (S3/GCS) instead of local filesystem
- **Promtail** runs one instance per Docker host; for Kubernetes, use the DaemonSet deployment
- **Grafana** can be load-balanced behind a reverse proxy with a shared PostgreSQL/MySQL database for state

### High Availability

For production HA deployment, consider:
1. Replace filesystem storage with S3 (or compatible object store)
2. Deploy Loki in microservices mode (read/write/backend components)
3. Use Grafana Helm chart with replicas
4. See: https://grafana.com/docs/loki/latest/setup/install/helm/

---

## Related Documentation

- [Production Checklist](production-checklist.md) -- Section 4: Monitoring & Observability
- [Monitoring Stack](../../docker/docker-compose.monitoring.yml) -- Prometheus + Grafana metrics
- [DevOps Guide](../devops/docker-guide.md) -- Docker development deep-dive
- [Architecture Overview](../architecture/ARCHITECTURE.md) -- System design and request flow
