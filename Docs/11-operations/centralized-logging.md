# Centralized Logging with Grafana Loki + Promtail

> **Status:** Implemented
> **Last updated:** 2026-03-20
> **Related:** [Log Aggregation Guide](log-aggregation.md), [Production Checklist](production-checklist.md)

---

## Architecture Overview

Staffora uses a three-component centralized logging stack:

```
+-------------------+     +-------------------+     +-------------------+
|  Docker Containers |     |  Docker Containers |     |  Docker Containers |
|  (API, Worker)     |     |  (Postgres, Redis) |     |  (Web, Nginx)      |
+--------+----------+     +--------+----------+     +--------+----------+
         |                          |                          |
         | json-file log driver     | json-file log driver     | json-file log driver
         | (max-size: 50m x 5)      | (max-size: 50m x 5)      | (max-size: 20m x 3)
         v                          v                          v
+------------------------------------------------------------------------+
|  /var/lib/docker/containers/*/  (rotated JSON log files on disk)       |
+------------------------------------------------------------------------+
         |
         | Promtail tails log files via Docker socket discovery
         | Parses JSON (Pino format), extracts labels, drops health checks
         v
+------------------------------------------------------------------------+
|  Promtail (grafana/promtail:3.4.2)                                     |
|  - Docker socket container discovery                                    |
|  - Pipeline: docker -> drop health -> json parse -> level normalize    |
|  - Labels: container, service, project, image, level, cluster, env     |
|  - Extracted fields: requestId, tenantId, userId, method, path, status |
+--------+---------------------------------------------------------------+
         |
         | HTTP push to /loki/api/v1/push (batch: 1MB, wait: 1s)
         v
+------------------------------------------------------------------------+
|  Loki (grafana/loki:3.4.2)                                             |
|  - TSDB index + filesystem chunk storage                                |
|  - Label-based indexing (not full-text)                                  |
|  - 30-day retention with compactor                                      |
|  - Snappy compression, embedded query cache (100MB)                     |
+--------+---------------------------------------------------------------+
         |
         | LogQL queries via HTTP API
         v
+------------------------------------------------------------------------+
|  Grafana (grafana/grafana:10.4.1)                                      |
|  - Pre-provisioned Loki + Prometheus datasources                        |
|  - Staffora Logs dashboard (log exploration, security events, tracing)  |
|  - Staffora Overview dashboard (metrics)                                |
|  - Loki-based alert rules (error spikes, auth failures, RLS violations) |
|  - Explore mode for ad-hoc LogQL queries                                |
+------------------------------------------------------------------------+
```

### Why Loki (not ELK/Elasticsearch)?

| Concern | Loki | ELK |
|---------|------|-----|
| Resource usage | Single binary, ~256MB RAM | JVM-based, 2GB+ RAM minimum |
| Indexing strategy | Labels only (low storage) | Full-text indexing (high storage) |
| Query language | LogQL (Prometheus-like) | KQL / Lucene |
| Grafana integration | Native, first-class | Plugin required |
| Complexity | 2 components (Loki + Promtail) | 3+ components (ES, Kibana, Logstash/Beats) |
| Cost at scale | Low (labels are cheap) | High (full-text indexes grow fast) |

---

## Quick Start

### Start the full monitoring stack (recommended)

```bash
# Uses the monitoring profile in docker-compose.yml
# Includes: Loki, Promtail, Prometheus, Grafana, exporters
docker compose -f docker/docker-compose.yml --profile monitoring up -d
```

### Start logging only (without Prometheus metrics)

```bash
# Uses the standalone logging compose override
docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.logging.yml up -d
```

### Access Grafana

| Field | Value |
|-------|-------|
| URL | http://localhost:3100 |
| Username | `admin` |
| Password | `staffora` (change in production) |
| Logs Dashboard | Dashboards > Staffora > Staffora Logs |
| Ad-hoc Queries | Left sidebar > Explore > select Loki datasource |

### Verify the stack is healthy

```bash
# Check all monitoring containers are running
docker compose -f docker/docker-compose.yml --profile monitoring ps

# Verify Loki is ready
curl -s http://localhost:3101/ready
# Expected: "ready"

# Verify Promtail is collecting
curl -s http://localhost:9080/ready
# Expected: "Ready"

# Verify Promtail discovered containers
curl -s http://localhost:9080/targets | python3 -m json.tool | head -30

# Verify logs are flowing into Loki
curl -s 'http://localhost:3101/loki/api/v1/labels' | python3 -m json.tool
# Expected: {"status":"success","data":["cluster","container","environment",...]}
```

---

## Configuration Files

| File | Purpose | Mounted at |
|------|---------|------------|
| `docker/loki/local-config.yaml` | Loki server config (monitoring profile) | `/etc/loki/local-config.yaml` |
| `docker/loki/loki-config.yml` | Loki server config (logging overlay) | `/etc/loki/loki-config.yml` |
| `docker/promtail/config.yml` | Promtail config (monitoring profile) | `/etc/promtail/config.yml` |
| `docker/promtail/promtail-config.yml` | Promtail config (logging overlay) | `/etc/promtail/promtail-config.yml` |
| `docker/grafana/provisioning/datasources/loki.yml` | Loki datasource auto-provisioning | `/etc/grafana/provisioning/datasources/loki.yml` |
| `docker/grafana/provisioning/datasources/prometheus.yml` | Prometheus datasource auto-provisioning | `/etc/grafana/provisioning/datasources/prometheus.yml` |
| `docker/grafana/provisioning/dashboards/dashboard.yml` | Dashboard provider config | `/etc/grafana/provisioning/dashboards/dashboard.yml` |
| `docker/grafana/provisioning/alerting/loki-alerts.yml` | Loki-based alert rules | `/etc/grafana/provisioning/alerting/loki-alerts.yml` |
| `docker/grafana/dashboards/staffora-logs.json` | Log exploration dashboard | `/var/lib/grafana/dashboards/staffora-logs.json` |
| `docker/grafana/dashboards/staffora-overview.json` | Metrics overview dashboard | `/var/lib/grafana/dashboards/staffora-overview.json` |
| `docker/prometheus/alert-rules.yml` | Prometheus metric-based alerts | `/etc/prometheus/alert-rules.yml` |

---

## Querying Logs with LogQL

LogQL is Loki's query language, designed to feel like PromQL. It has two modes:

1. **Log queries** -- return log lines
2. **Metric queries** -- return numeric aggregations over log data

### Basic Log Queries

```logql
# All logs from the API service
{service="api"}

# All logs from the API service at error level
{service="api", level="error"}

# Worker logs at warn or error level
{service="worker", level=~"warn|error"}

# All logs from any service (useful for broad searches)
{project="docker"}
```

### Filtering with Pipeline Stages

```logql
# Parse JSON and filter by extracted field
{service="api"} | json | status="500"

# Filter by HTTP method and path
{service="api"} | json | method="POST" | path=~"/api/v1/employees.*"

# Filter by specific error message
{service="api"} |~ "ECONNREFUSED"

# Negative filter -- exclude health checks (already dropped by Promtail,
# but useful if querying raw data)
{service="api"} !~ "/health"

# Case-insensitive regex search
{service="api"} |~ "(?i)timeout"
```

### Tenant-Scoped Log Filtering

Since this is a multi-tenant HRIS platform, isolating logs by tenant is critical for debugging:

```logql
# All logs for a specific tenant
{service="api"} | json | tenant_id="550e8400-e29b-41d4-a716-446655440000"

# Errors for a specific tenant
{service="api"} | json | tenant_id="550e8400-e29b-41d4-a716-446655440000" | level="error"

# All requests for a tenant in the last hour, formatted for readability
{service="api"} | json
  | tenant_id="550e8400-e29b-41d4-a716-446655440000"
  | line_format "{{.method}} {{.path}} {{.status}} {{.duration}}ms [{{.request_id}}]"

# Count requests per tenant over the last hour
sum by (tenant_id) (
  count_over_time({service="api"} | json | tenant_id != `` [1h])
)

# Find which tenant is generating the most errors
topk(5, sum by (tenant_id) (
  count_over_time({service="api", level="error"} | json | tenant_id != `` [1h])
))
```

The Grafana Staffora Logs dashboard includes a **Tenant ID** text box variable. Enter a UUID to filter the Tenant-Scoped Logs panel.

### Request Tracing

Trace a single request across the API and worker services:

```logql
# Find all log entries for a specific request ID
{service=~"api|worker"} |~ "abc12345-request-id-here"

# More precise: parse JSON and filter by requestId field
{service=~"api|worker"} | json | request_id="abc12345-request-id-here"
```

The dashboard includes a **Request ID** text box variable for this purpose.

### Metric Queries (Aggregations)

```logql
# Log line rate per service (lines/second)
sum by (service) (rate({project="docker"} [5m]))

# Error rate per service (errors/second)
sum by (service) (rate({project="docker", level="error"} [5m]))

# Total error count in the last hour
sum(count_over_time({project="docker", level="error"} [1h]))

# Top 5 services by error count
topk(5, sum by (service) (count_over_time({project="docker", level="error"} [1h])))

# Average request duration from API logs (requires numeric extraction)
avg_over_time(
  {service="api"} | json | unwrap duration [5m]
) by (path)

# 95th percentile request duration
quantile_over_time(0.95,
  {service="api"} | json | unwrap duration [5m]
) by (path)

# Count of 5xx responses per path
sum by (path) (
  count_over_time({service="api"} | json | status >= 500 [1h])
)
```

### LogQL Syntax Reference

| Syntax | Description |
|--------|-------------|
| `{label="value"}` | Stream selector (required) |
| `{label=~"regex"}` | Regex stream selector |
| `{label!="value"}` | Negative match |
| `\|= "text"` | Line contains exact text |
| `\|~ "regex"` | Line matches regex |
| `!= "text"` | Line does not contain text |
| `!~ "regex"` | Line does not match regex |
| `\| json` | Parse line as JSON, extract fields |
| `\| field="value"` | Filter by extracted field |
| `\| field=~"regex"` | Regex filter on extracted field |
| `\| unwrap field` | Use numeric field for metric queries |
| `\| line_format "template"` | Reformat the log line |
| `count_over_time({} [range])` | Count lines over time range |
| `rate({} [range])` | Lines per second |
| `sum by (label) (...)` | Aggregate by label |
| `topk(n, ...)` | Top N results |
| `quantile_over_time(q, {} [range])` | Quantile calculation |

---

## Alert Rules

Staffora uses two complementary alerting systems:

### Prometheus Metric-Based Alerts

Defined in `docker/prometheus/alert-rules.yml`. These fire based on scraped numeric metrics:

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | >5% of HTTP requests return 5xx | Critical |
| HighLatencyP95 | p95 latency > 2s for 5m | Warning |
| CriticalLatencyP99 | p99 latency > 5s for 5m | Critical |
| ApiDown | API health check fails for 1m | Critical |
| HighActiveRequests | >50 concurrent requests for 3m | Warning |
| DbPoolExhaustion | >80 active DB connections for 2m | Critical |
| RedisDown | Redis unreachable for 1m | Critical |

### Loki Log-Based Alerts

Defined in `docker/grafana/provisioning/alerting/loki-alerts.yml`. These fire based on log content patterns:

| Alert | What It Detects | Severity | Response |
|-------|-----------------|----------|----------|
| **High Error Rate in API Logs** | >20 error-level log lines in 5m | Critical | Check API logs, verify DB/Redis connectivity |
| **Fatal Error Detected** | Any fatal-level log from API/worker | Critical | Check container status, investigate crash cause |
| **Authentication Failure Spike** | >10 auth failures in 5m | Warning | Check for brute-force attacks, review rate limiting |
| **MFA Verification Failure Spike** | >5 MFA failures in 5m | Warning | Identify affected accounts, check for bypass attempts |
| **RLS Policy Violation** | Any RLS/tenant isolation violation | Critical | **IMMEDIATE** -- investigate cross-tenant data access |
| **PostgreSQL Permission Denied** | Permission denied errors in PG logs | Warning | Check query permissions, review recent migrations |
| **Database Connection Errors** | DB connection failures in app logs | Critical | Check PostgreSQL and PgBouncer health |
| **Redis Connection Errors** | Redis connection failures in app logs | Critical | Check Redis health, verify network connectivity |
| **Outbox Processing Failures** | Outbox/event processing errors | Warning | Check worker health, verify Redis Streams |

### RLS Violation Alert (Critical)

This is the most security-critical alert. Row-Level Security violations should **never** occur in normal operation. Any occurrence indicates either:

1. A code bug that bypasses tenant isolation
2. A direct database access attempt with incorrect tenant context
3. A privilege escalation attack

The alert triggers immediately (no `for` delay) because even a single RLS violation is a potential data breach. The runbook requires:

1. Identify the exact query, tenant, and user involved
2. Determine if data was actually exposed (RLS should block it)
3. File a security incident report regardless
4. Patch the code path that triggered the violation

### Configuring Alert Notifications

By default, alerts appear in the Grafana UI. To send notifications externally:

1. Open Grafana at http://localhost:3100
2. Go to **Alerting > Contact points**
3. Add a contact point (email, Slack, PagerDuty, etc.)
4. Go to **Alerting > Notification policies**
5. Route alerts by severity label to appropriate channels

Recommended routing:

| Severity | Channel |
|----------|---------|
| `critical` | PagerDuty / SMS + Slack #incidents |
| `warning` | Slack #platform-alerts |

---

## Dashboard: Staffora Logs

The pre-built dashboard (`docker/grafana/dashboards/staffora-logs.json`) provides comprehensive log exploration.

### Template Variables (Top Bar)

| Variable | Type | Purpose |
|----------|------|---------|
| Service | Multi-select dropdown | Filter by Docker Compose service (api, worker, postgres, redis, web) |
| Log Level | Multi-select dropdown | Filter by level (debug, info, warn, error, fatal) |
| Tenant ID | Text box | Filter logs by tenant UUID for multi-tenant debugging |
| Request ID | Text box | Trace a single request across all services |

### Dashboard Sections

| Section | Panels | Description |
|---------|--------|-------------|
| **Log Volume & Health** | 4 stat panels | Total lines, error count, warning count, active containers (last 1h) |
| **Log Volume by Service** | Stacked bar chart | Lines per minute broken down by Docker service |
| **Log Volume by Level** | Stacked bar chart | Lines per minute colour-coded by log level |
| **API Logs** | Log viewer | Structured API request logs formatted as `METHOD /path STATUS DURATIONms [requestId]` |
| **Error Tracking** | Log viewer | All error/warning/fatal lines across all services |
| **Worker Logs** | Log viewer | Background worker log stream |
| **Database & Redis Logs** | Side-by-side log viewers | PostgreSQL errors/warnings and Redis logs |
| **All Logs (Live Tail)** | Log viewer | Unfiltered log stream for real-time debugging |
| **Tenant-Scoped Logs** | Log viewer (collapsed) | Logs filtered by Tenant ID variable |
| **Request Tracing** | Log viewer (collapsed) | Logs filtered by Request ID variable, sorted chronologically |
| **Security Events** | 3 stat panels + log viewer (collapsed) | Auth failures, RLS violations, permission denials + full security event log |

---

## Log Retention

### Loki Retention

| Setting | Default | Override |
|---------|---------|---------|
| Retention period | 30 days (720h) | `LOKI_RETENTION_PERIOD` env var |
| Compactor interval | 10 minutes | `compaction_interval` in loki config |
| Delete delay | 2 hours | `retention_delete_delay` in loki config |
| Max query lookback | 30 days | `max_query_lookback` in loki config |

To change the retention period, set in `docker/.env`:

```bash
LOKI_RETENTION_PERIOD=2160h  # 90 days
```

### Docker Log Rotation

Raw container log files are rotated by Docker's json-file driver before Promtail reads them:

| Service | max-size | max-file | Total per container |
|---------|----------|----------|---------------------|
| API | 50 MB | 5 | 250 MB |
| Worker | 50 MB | 5 | 250 MB |
| PostgreSQL | 50 MB | 5 | 250 MB |
| Nginx | 50 MB | 5 | 250 MB |
| Redis | 20 MB | 3 | 60 MB |
| Web | 20 MB | 3 | 60 MB |
| Monitoring stack | 10-20 MB | 2-3 | 20-60 MB each |

Total worst-case disk usage for raw container logs: ~1.1 GB.

### Storage Tiers

| Tier | Technology | Retention | Purpose |
|------|-----------|-----------|---------|
| **Hot** | Loki TSDB + filesystem | 30 days | Active querying and alerting |
| **Raw** | Docker json-file on disk | Rotation-based (max 250MB per service) | Promtail source of truth |
| **Cold** | Not configured (future: S3) | N/A | Long-term archival for compliance |

For GDPR compliance, consider archiving logs older than 30 days to S3 with lifecycle policies matching your data retention requirements.

---

## Health Check Noise Reduction

Promtail is configured to drop health check log lines before they reach Loki. This significantly reduces ingestion volume because Docker health checks run every 10-30 seconds per container.

Dropped patterns:
- `"path":"/health"` (structured JSON from API/worker)
- `"path":"/healthz"` (structured JSON from web)
- `"path":"/ready"` (structured JSON from any service)
- `GET /health` (plain-text format)
- `GET /healthz` (plain-text format)

Estimated volume reduction: 50-80% of API/worker log lines in a healthy system are health checks.

---

## Structured Logging Fields

Promtail parses JSON-structured logs (Pino format) from the API and Worker services. The following fields are extracted:

| JSON Field | Promtail Key | Indexed Label? | Description |
|------------|--------------|----------------|-------------|
| `level` | `level` | Yes | Log level (debug, info, warn, error, fatal) |
| `msg` | `msg` | No | Log message body |
| `timestamp` | `timestamp` | N/A (used for ordering) | Application-level timestamp |
| `requestId` | `request_id` | No | Request correlation ID |
| `tenantId` | `tenant_id` | No | Tenant UUID for multi-tenant isolation |
| `userId` | `user_id` | No | Acting user UUID |
| `method` | `method` | No | HTTP method (GET, POST, etc.) |
| `path` | `path` | No | Request URL path |
| `status` | `status` | No | HTTP response status code |
| `duration` | `duration` | No | Request duration in milliseconds |
| `error` | `error` | No | Error message or stack trace |
| `module` | `module` | No | Application module name |

**Why tenant_id is not a label:** Loki labels create index entries. Since tenant_id is a UUID with potentially thousands of unique values, promoting it to a label would create high cardinality and degrade Loki performance. Instead, use `| json | tenant_id="..."` to filter at query time.

### Application Logging Best Practices

To maximise the value of centralized logging:

1. **Always include tenantId and userId** in every log call for multi-tenant debugging
2. **Always include requestId** for distributed tracing across API and worker
3. **Use consistent log levels**: `debug` for development details, `info` for operational events, `warn` for recoverable issues, `error` for failures requiring attention, `fatal` for unrecoverable crashes
4. **Never log sensitive data**: no passwords, tokens, PII, or full request bodies containing personal information (GDPR requirement)
5. **Log at module boundaries**: include the module name when logging from service or repository layers

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOKI_PORT` | `3101` | Loki HTTP API port (host-side) |
| `LOKI_RETENTION_PERIOD` | `720h` | How long Loki retains logs (30 days) |
| `GRAFANA_PORT` | `3100` | Grafana UI port |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username |
| `GRAFANA_ADMIN_PASSWORD` | `staffora` | Grafana admin password (**change in production**) |
| `GRAFANA_ROOT_URL` | `http://localhost:3100` | Grafana external URL |
| `PROMETHEUS_PORT` | `9090` | Prometheus UI port |

---

## Resource Requirements

| Service | CPU Limit | Memory Limit | CPU Reserved | Memory Reserved |
|---------|-----------|--------------|--------------|-----------------|
| Loki | 1 core | 1 GB | 0.25 core | 256 MB |
| Promtail | 0.5 core | 256 MB | 0.1 core | 64 MB |
| Grafana | 1 core | 512 MB | 0.25 core | 128 MB |
| Prometheus | 1 core | 512 MB | 0.25 core | 128 MB |
| Postgres Exporter | 0.25 core | 128 MB | 0.1 core | 64 MB |
| Redis Exporter | 0.25 core | 128 MB | 0.1 core | 64 MB |

**Total monitoring stack:** 4 cores / 2.5 GB memory (limits)

---

## Troubleshooting

### Loki not receiving logs

```bash
# 1. Check Promtail is running
docker ps | grep promtail

# 2. Check Promtail targets (should show discovered containers)
curl -s http://localhost:9080/targets | python3 -m json.tool | head -50

# 3. Check Loki readiness
curl -s http://localhost:3101/ready

# 4. Check Loki ingestion stats
curl -s http://localhost:3101/metrics | grep loki_distributor_lines_received_total

# 5. Verify Docker socket is accessible
docker exec staffora-promtail ls -la /var/run/docker.sock
```

### No logs in Grafana

1. Verify Loki datasource: Grafana > Configuration > Data Sources > "Loki" should have a green checkmark
2. Try a simple query in Explore: `{service=~".+"}`
3. Check the time range picker -- ensure it covers a recent period
4. Check Loki labels are present: `curl -s http://localhost:3101/loki/api/v1/labels`

### Promtail not discovering containers

The default Docker Compose project filter is `com.docker.compose.project=docker` (based on the directory name). If your project directory has a different name, update the filter in both Promtail config files:

```yaml
filters:
  - name: label
    values: ["com.docker.compose.project=your-directory-name"]
```

### High memory usage on Loki

1. Reduce `max_streams_per_user` (default: 10000)
2. Reduce `ingestion_rate_mb` (default: 10)
3. Lower the retention period
4. Check for high-cardinality labels (avoid promoting UUIDs to labels)

### Alert rules not loading

```bash
# Check Grafana provisioning logs
docker logs staffora-grafana 2>&1 | grep -i "alert\|provision\|error"

# Verify the alerting file is mounted
docker exec staffora-grafana ls -la /etc/grafana/provisioning/alerting/
```

---

## Production Considerations

### Security Hardening

1. **Change Grafana admin password** -- set `GRAFANA_ADMIN_PASSWORD` to a strong random value
2. **Restrict Loki port** -- do not expose 3101 publicly; keep it internal to Docker network
3. **Enable Loki auth** -- set `auth_enabled: true` in loki config for multi-tenant Loki isolation
4. **Network segmentation** -- monitoring services should only be accessible from internal networks
5. **PII masking** -- if application logs accidentally contain PII, add Promtail pipeline stages to redact sensitive patterns before ingestion

### Scaling

| Component | Scaling Strategy |
|-----------|-----------------|
| Loki | Replace filesystem with S3; deploy in microservices mode (read/write/backend) |
| Promtail | One instance per Docker host; DaemonSet in Kubernetes |
| Grafana | Load-balance behind reverse proxy with shared PostgreSQL state |

### High Availability

For production HA:
1. Replace filesystem storage with S3-compatible object store
2. Deploy Loki in microservices mode
3. Use Grafana Helm chart with replicas
4. See: https://grafana.com/docs/loki/latest/setup/install/helm/

---

## Related Documentation

- [Log Aggregation Guide](log-aggregation.md) -- Quick reference for the logging stack
- [Production Checklist](production-checklist.md) -- Section 4: Monitoring & Observability
- [Docker Guide](../06-devops/docker-guide.md) -- Docker development deep-dive
- [Architecture Overview](../02-architecture/ARCHITECTURE.md) -- System design and request flow
- [SLA/SLO Definitions](sla-slo-definitions.md) -- Service level objectives that drive alerting thresholds
