#!/usr/bin/env python3
"""
Temporary script to apply monitoring stack changes.
Run once, then delete this file.
"""
import pathlib, json, sys

BASE = pathlib.Path(__file__).resolve().parent.parent

# ============================================================================
# 1. Update metrics.ts - add outbox backlog metrics
# ============================================================================
metrics_path = BASE / 'packages' / 'api' / 'src' / 'plugins' / 'metrics.ts'
content = metrics_path.read_text()

# Add outbox backlog function before formatPrometheus
insert_before = 'async function formatPrometheus(): Promise<string> {'
new_fn = (
    '/**\n'
    ' * Collect domain outbox queue backlog stats.\n'
    ' * Counts pending (unprocessed, no error) and failed events via a direct\n'
    ' * query against app.domain_outbox. The metrics endpoint runs without\n'
    ' * tenant context, so this query relies on the database user having\n'
    ' * access (system context or superuser for the metrics query).\n'
    ' * Returns null if the query fails.\n'
    ' */\n'
    'async function collectOutboxBacklog(): Promise<{ pending: number; failed: number } | null> {\n'
    '  const db = resolveDbClient();\n'
    '  if (!db) return null;\n'
    '  try {\n'
    '    const rows = await db.query<{ pending: string; failed: string }>`\n'
    '      SELECT\n'
    '        count(*) FILTER (WHERE processed_at IS NULL AND error_message IS NULL)::text AS pending,\n'
    '        count(*) FILTER (WHERE processed_at IS NULL AND error_message IS NOT NULL)::text AS failed\n'
    '      FROM app.domain_outbox\n'
    '    `;\n'
    '    if (rows.length === 0) return { pending: 0, failed: 0 };\n'
    '    return {\n'
    '      pending: parseInt(rows[0]!.pending, 10),\n'
    '      failed: parseInt(rows[0]!.failed, 10),\n'
    '    };\n'
    '  } catch {\n'
    '    return null;\n'
    '  }\n'
    '}\n'
    '\n'
)
content = content.replace(insert_before, new_fn + insert_before)

# Update Promise.all to include outbox
content = content.replace(
    'const [dbPool, redisUp] = await Promise.all([\n    collectDbPoolStats(),\n    checkRedisConnected(),\n  ]);',
    'const [dbPool, redisUp, outboxBacklog] = await Promise.all([\n    collectDbPoolStats(),\n    checkRedisConnected(),\n    collectOutboxBacklog(),\n  ]);'
)

# Add outbox metrics after redis_connected
outbox_lines = (
    '  // --- domain_outbox_pending_count ---\n'
    '  lines.push("# HELP domain_outbox_pending_count Number of unprocessed domain outbox events awaiting processing");\n'
    '  lines.push("# TYPE domain_outbox_pending_count gauge");\n'
    '  lines.push(`domain_outbox_pending_count ${outboxBacklog?.pending ?? 0}`);\n'
    '\n'
    '  // --- domain_outbox_failed_count ---\n'
    '  lines.push("# HELP domain_outbox_failed_count Number of failed domain outbox events awaiting retry");\n'
    '  lines.push("# TYPE domain_outbox_failed_count gauge");\n'
    '  lines.push(`domain_outbox_failed_count ${outboxBacklog?.failed ?? 0}`);\n'
    '\n'
    '  // --- process_memory_bytes ---'
)
content = content.replace('  // --- process_memory_bytes ---', outbox_lines)

# Update doc comment
content = content.replace(
    ' * - redis_connected            \u2014 gauge (0/1)\n * - process_memory_bytes       \u2014 gauge (rss, heapUsed, heapTotal, external)',
    ' * - redis_connected                \u2014 gauge (0/1)\n * - domain_outbox_pending_count    \u2014 gauge (unprocessed outbox events)\n * - domain_outbox_failed_count     \u2014 gauge (failed outbox events awaiting retry)\n * - process_memory_bytes           \u2014 gauge (rss, heapUsed, heapTotal, external)'
)

metrics_path.write_text(content)
print('1. metrics.ts updated')

# ============================================================================
# 2. Update alert-rules.yml
# ============================================================================
alerts_path = BASE / 'docker' / 'prometheus' / 'alert-rules.yml'
alerts = alerts_path.read_text()

# p99 threshold from 5 to 2
alerts = alerts.replace(
    '      # High request latency: p99 above 5 seconds over 5 minutes',
    '      # High request latency: p99 above 2 seconds over 5 minutes'
)
alerts = alerts.replace('          ) > 5', '          ) > 2')
alerts = alerts.replace(
    '            99th percentile request latency is above 5 seconds.',
    '            99th percentile request latency is above 2 seconds.'
)

# Replace heuristic outbox alert with direct metric alerts
old_q = (
    '      # Outbox backlog growing (uses custom metric if available, otherwise DB pool as proxy)\n'
    '      # This alert fires if the API error rate is sustained AND connections are high,\n'
    '      # indicating the worker may not be processing events.\n'
    '      - alert: PossibleOutboxBacklog\n'
    '        expr: |\n'
    '          (\n'
    '            sum(rate(http_errors_total[10m])) > 0.1\n'
    '            and\n'
    '            db_pool_active_connections > 30\n'
    '          )\n'
    '        for: 10m\n'
    '        labels:\n'
    '          severity: warning\n'
    '          service: staffora-worker\n'
    '        annotations:\n'
    '          summary: "Possible domain outbox backlog"\n'
    '          description: >-\n'
    '            Sustained error rate with high DB connection usage suggests the\n'
    '            outbox processor may be falling behind.\n'
    '          runbook: "Check worker container: docker logs staffora-worker. Verify outbox table size."'
)

new_q = (
    '      # Outbox backlog exceeds 100 pending events\n'
    '      - alert: OutboxBacklogHigh\n'
    '        expr: domain_outbox_pending_count > 100\n'
    '        for: 5m\n'
    '        labels:\n'
    '          severity: warning\n'
    '          service: staffora-worker\n'
    '        annotations:\n'
    '          summary: "Domain outbox backlog exceeds 100 events"\n'
    '          description: >-\n'
    '            There are {{ $value }} unprocessed events in the domain outbox.\n'
    '            The outbox processor may be falling behind or has stopped.\n'
    '          runbook: "Check worker container: docker logs staffora-worker. Verify outbox table: SELECT count(*) FROM app.domain_outbox WHERE processed_at IS NULL."\n'
    '\n'
    '      # Outbox backlog critical (>500 events)\n'
    '      - alert: OutboxBacklogCritical\n'
    '        expr: domain_outbox_pending_count > 500\n'
    '        for: 2m\n'
    '        labels:\n'
    '          severity: critical\n'
    '          service: staffora-worker\n'
    '        annotations:\n'
    '          summary: "Critical domain outbox backlog (>500 events)"\n'
    '          description: >-\n'
    '            There are {{ $value }} unprocessed events in the domain outbox.\n'
    '            Immediate investigation required.\n'
    '          runbook: "Restart the worker: docker restart staffora-worker. Check for database connectivity issues. Review worker logs for processing errors."\n'
    '\n'
    '      # Outbox has failed events stuck in retry\n'
    '      - alert: OutboxFailedEvents\n'
    '        expr: domain_outbox_failed_count > 10\n'
    '        for: 10m\n'
    '        labels:\n'
    '          severity: warning\n'
    '          service: staffora-worker\n'
    '        annotations:\n'
    '          summary: "Domain outbox has failed events"\n'
    '          description: >-\n'
    '            There are {{ $value }} failed events in the domain outbox awaiting retry.\n'
    '            Some events may be permanently failing.\n'
    '          runbook: "Review error_message column: SELECT event_type, error_message FROM app.domain_outbox WHERE error_message IS NOT NULL AND processed_at IS NULL LIMIT 20."'
)

alerts = alerts.replace(old_q, new_q)
alerts_path.write_text(alerts)
print('2. alert-rules.yml updated')

# ============================================================================
# 3. Update docker-compose.yml - add monitoring profile services
# ============================================================================
compose_path = BASE / 'docker' / 'docker-compose.yml'
compose = compose_path.read_text()

# Update header comments
old_h = (
    '# Usage:\n'
    '#   Development:    docker compose up -d\n'
    '#   Production:     docker compose --profile production up -d\n'
    '#   Scaled (3 API): docker compose --profile production up -d --scale api=3\n'
    '#\n'
    '# Profiles:\n'
    '#   - default: All services for development\n'
    '#   - production: Production-optimized configuration with nginx load balancer\n'
    '#\n'
    '# Horizontal Scaling:'
)

new_h = (
    '# Usage:\n'
    '#   Development:    docker compose up -d\n'
    '#   Production:     docker compose --profile production up -d\n'
    '#   Monitoring:     docker compose --profile monitoring up -d\n'
    '#   Full stack:     docker compose --profile production --profile monitoring up -d\n'
    '#   Scaled (3 API): docker compose --profile production up -d --scale api=3\n'
    '#\n'
    '# Profiles:\n'
    '#   - default: Core services for development (postgres, pgbouncer, redis, api, worker, web, backup)\n'
    '#   - production: Production-optimized configuration with nginx load balancer\n'
    '#   - monitoring: Prometheus + Grafana observability stack with DB/Redis exporters\n'
    '#   - scanning: ClamAV virus scanning for document uploads\n'
    '#\n'
    '# Monitoring Stack (--profile monitoring):\n'
    '#   - Prometheus:         http://localhost:9090   (metrics collection & alerting)\n'
    '#   - Grafana:            http://localhost:3100   (dashboards & visualization)\n'
    '#   - Postgres Exporter:  internal:9187           (pg_stat metrics)\n'
    '#   - Redis Exporter:     internal:9121           (Redis metrics)\n'
    '#\n'
    '# Extended Observability (compose override files):\n'
    '#   - docker-compose.monitoring.yml: Same stack as override file (alternative to profile)\n'
    '#   - docker-compose.logging.yml: Loki + Promtail log aggregation\n'
    '#\n'
    '# Horizontal Scaling:'
)

compose = compose.replace(old_h, new_h)

# Add monitoring services before production section
monitoring_yaml = pathlib.Path(BASE / 'docker' / 'docker-compose.monitoring.yml').read_text()
# We build the block inline to match the compose style

monitoring_block = '''\
  # ---------------------------------------------------------------------------
  # Monitoring Stack (Optional -- enable with --profile monitoring)
  # ---------------------------------------------------------------------------
  # Prometheus scrapes /metrics from the API, plus dedicated exporters for
  # PostgreSQL and Redis. Grafana provides pre-provisioned dashboards for
  # API performance, database health, Redis status, and queue backlog.
  #
  # Usage:
  #   docker compose --profile monitoring up -d
  #
  # Alternatively, use the override file for the same stack:
  #   docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
  # ---------------------------------------------------------------------------

  # Prometheus -- Metrics collection and alerting
  prometheus:
    image: prom/prometheus:v2.51.0
    container_name: staffora-prometheus
    restart: unless-stopped
    profiles:
      - monitoring
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--storage.tsdb.retention.time=15d"
      - "--web.console.libraries=/usr/share/prometheus/console_libraries"
      - "--web.console.templates=/usr/share/prometheus/consoles"
      - "--web.enable-lifecycle"
    ports:
      - "${PROMETHEUS_PORT:-9090}:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/alert-rules.yml:/etc/prometheus/alert-rules.yml:ro
      - prometheus_data:/prometheus
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:9090/-/healthy || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    networks:
      - staffora-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"

  # Grafana -- Dashboards and visualization
  grafana:
    image: grafana/grafana:10.4.1
    container_name: staffora-grafana
    restart: unless-stopped
    profiles:
      - monitoring
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL:-http://localhost:3100}
      GF_SERVER_HTTP_PORT: "3100"
      GF_EXPLORE_ENABLED: "true"
      GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: /var/lib/grafana/dashboards/staffora-overview.json
    ports:
      - "${GRAFANA_PORT:-3100}:3100"
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana_data:/var/lib/grafana
    depends_on:
      prometheus:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3100/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - staffora-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "3"

  # PostgreSQL Exporter -- Exposes pg_stat metrics to Prometheus
  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:v0.15.0
    container_name: staffora-postgres-exporter
    restart: unless-stopped
    profiles:
      - monitoring
    environment:
      DATA_SOURCE_NAME: "postgresql://${POSTGRES_USER:-hris}:${POSTGRES_PASSWORD:-hris_dev_password}@postgres:5432/${POSTGRES_DB:-hris}?sslmode=disable"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - staffora-network
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
        reservations:
          cpus: '0.1'
          memory: 64M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "2"

  # Redis Exporter -- Exposes Redis metrics to Prometheus
  redis-exporter:
    image: oliver006/redis_exporter:v1.58.0
    container_name: staffora-redis-exporter
    restart: unless-stopped
    profiles:
      - monitoring
    environment:
      REDIS_ADDR: "redis://redis:6379"
      REDIS_PASSWORD: ${REDIS_PASSWORD:-staffora_redis_dev}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - staffora-network
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M
        reservations:
          cpus: '0.1'
          memory: 64M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "2"

'''

old_prod = (
    '  # ---------------------------------------------------------------------------\n'
    '  # Production-Only Services\n'
    '  # ---------------------------------------------------------------------------\n'
    '\n'
    '  # Nginx reverse proxy for production\n'
    '  nginx:'
)

compose = compose.replace(old_prod, monitoring_block + old_prod)

# Add volumes
compose = compose.replace(
    '  clamav_data:\n    driver: local',
    '  clamav_data:\n    driver: local\n  prometheus_data:\n    driver: local\n  grafana_data:\n    driver: local'
)

compose_path.write_text(compose)
print('3. docker-compose.yml updated')

print('\nAll files written successfully!')
