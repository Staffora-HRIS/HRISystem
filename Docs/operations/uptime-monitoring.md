# Uptime Monitoring (Uptime Kuma)

Staffora uses [Uptime Kuma](https://github.com/louislam/uptime-kuma) as a self-hosted uptime monitoring solution. It provides HTTP/TCP/DNS monitoring, SSL certificate expiry checks, alerting, and a public status page -- all without external SaaS dependencies.

## Quick Start

### Start Uptime Kuma

Using the override file:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.uptime.yml up -d
```

Or using the profile from the main compose file:

```bash
docker compose --profile uptime up -d
```

### Access the Dashboard

Open **http://localhost:3002** in your browser.

On first launch, Uptime Kuma prompts you to create an admin account. Use a strong password and store it in your team's credential vault (1Password, Bitwarden, etc.).

> **Port note:** Uptime Kuma listens internally on port 3001, but is mapped to host port **3002** because the Staffora worker health endpoint already uses port 3001.

## Monitors to Configure

After the initial setup, configure the following monitors through the Uptime Kuma web UI.

### 1. API Health Endpoint

| Setting | Value |
|---------|-------|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | Staffora API Health |
| **URL** | `http://api:3000/health` |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Accepted Status Codes** | 200 |
| **Max Response Time** | 2000 ms |
| **Description** | Core API health check. Verifies database and Redis connectivity. |

### 2. Web Frontend

| Setting | Value |
|---------|-------|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | Staffora Web Frontend |
| **URL** | `http://web:5173/healthz` |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Accepted Status Codes** | 200 |
| **Max Response Time** | 5000 ms |
| **Description** | Frontend application availability. |

### 3. PgBouncer (Database Connection Pool)

| Setting | Value |
|---------|-------|
| **Monitor Type** | TCP Port |
| **Friendly Name** | PgBouncer |
| **Hostname** | `pgbouncer` |
| **Port** | 6432 |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Description** | Database connection pooler TCP connectivity. |

### 4. PostgreSQL (Direct)

| Setting | Value |
|---------|-------|
| **Monitor Type** | TCP Port |
| **Friendly Name** | PostgreSQL Direct |
| **Hostname** | `postgres` |
| **Port** | 5432 |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Description** | Direct PostgreSQL connectivity (bypasses PgBouncer). |

### 5. Redis

| Setting | Value |
|---------|-------|
| **Monitor Type** | TCP Port |
| **Friendly Name** | Redis |
| **Hostname** | `redis` |
| **Port** | 6379 |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Description** | Redis cache and queue connectivity. |

### 6. Worker Health

| Setting | Value |
|---------|-------|
| **Monitor Type** | HTTP(s) |
| **Friendly Name** | Staffora Worker |
| **URL** | `http://worker:3001/health` |
| **Heartbeat Interval** | 60 seconds |
| **Retries** | 3 |
| **Accepted Status Codes** | 200 |
| **Max Response Time** | 2000 ms |
| **Description** | Background worker health. Processes outbox events, exports, notifications, PDFs. |

### 7. SSL Certificate Monitoring (Production)

Configure these only in production when HTTPS is enabled through the nginx reverse proxy.

| Setting | Value |
|---------|-------|
| **Monitor Type** | HTTP(s) - Keyword |
| **Friendly Name** | Staffora SSL Certificate |
| **URL** | `https://app.staffora.co.uk/health` |
| **Heartbeat Interval** | 300 seconds (5 minutes) |
| **Certificate Expiry Notification** | 14 days |
| **Description** | SSL certificate validity and expiry monitoring. |

| Setting | Value |
|---------|-------|
| **Monitor Type** | HTTP(s) - Keyword |
| **Friendly Name** | Staffora API SSL Certificate |
| **URL** | `https://api.staffora.co.uk/health` |
| **Heartbeat Interval** | 300 seconds (5 minutes) |
| **Certificate Expiry Notification** | 14 days |
| **Description** | API domain SSL certificate validity and expiry monitoring. |

## Check Intervals

| Monitor Category | Interval | Rationale |
|-----------------|----------|-----------|
| Health endpoints (API, Web, Worker) | 60s | Balance between early detection and resource use |
| Infrastructure (Postgres, PgBouncer, Redis) | 60s | Critical dependencies, fast detection needed |
| SSL certificate expiry | 300s (5 min) | Certificate status changes slowly |

## Response Time Thresholds

| Service | Warning Threshold | Critical Threshold |
|---------|------------------|--------------------|
| API (`/health`) | 1000 ms | 2000 ms |
| Web Frontend (`/healthz`) | 3000 ms | 5000 ms |
| Worker (`/health`) | 1000 ms | 2000 ms |

When a monitor exceeds the critical threshold, it is marked as degraded in Uptime Kuma. Configure alerts (see below) to fire when this occurs.

## Alert Channels

### Slack Webhook

1. In Uptime Kuma, go to **Settings > Notifications > Setup Notification**.
2. Select **Slack Incoming Webhook** as the notification type.
3. Enter the Slack webhook URL for your `#ops-alerts` channel.
4. Set the friendly name to `Staffora Ops Slack`.
5. Enable **Apply on all existing monitors** to cover all configured monitors.

### Email (SMTP)

1. In Uptime Kuma, go to **Settings > Notifications > Setup Notification**.
2. Select **SMTP** as the notification type.
3. Configure:

| Setting | Value |
|---------|-------|
| **SMTP Host** | Your SMTP server (same as `SMTP_HOST` env var) |
| **SMTP Port** | 587 (TLS) |
| **SMTP Security** | STARTTLS |
| **SMTP Username** | Your SMTP user |
| **SMTP Password** | Your SMTP password |
| **From Email** | `monitoring@staffora.co.uk` |
| **To Email** | `ops-team@staffora.co.uk` |

4. Enable **Apply on all existing monitors**.

### Microsoft Teams (Optional)

1. Create an Incoming Webhook connector in your Teams channel.
2. In Uptime Kuma, select **Microsoft Teams** notification type.
3. Paste the webhook URL.

### PagerDuty / Opsgenie (Production)

For production on-call rotation:

1. Create a service in PagerDuty or Opsgenie.
2. Copy the integration key / API key.
3. In Uptime Kuma, select the corresponding notification type.
4. Paste the integration key.

## SSL Certificate Expiry Monitoring

Uptime Kuma natively monitors SSL certificates on HTTPS monitors. Configuration:

- **Expiry warning threshold:** 14 days (alerts when certificate expires within 14 days)
- **Check interval:** 300 seconds (5 minutes)
- This is configured per-monitor on any HTTPS monitor

### How It Works

1. Every HTTPS monitor automatically tracks the SSL certificate expiry date.
2. When the certificate is within the configured warning period (14 days), Uptime Kuma sends an alert through all configured notification channels.
3. The status page shows certificate validity alongside uptime metrics.

### Recommended SSL Monitors

| Domain | Purpose |
|--------|---------|
| `https://app.staffora.co.uk` | Main application SSL |
| `https://api.staffora.co.uk` | API SSL |
| `https://status.staffora.co.uk` | Status page SSL (if exposed) |

## Status Page Setup

Uptime Kuma includes a built-in public status page feature.

### Creating the Status Page

1. In Uptime Kuma, go to **Status Pages** in the left sidebar.
2. Click **New Status Page**.
3. Configure:

| Setting | Value |
|---------|-------|
| **Name** | Staffora Platform Status |
| **Slug** | `staffora` |
| **Description** | Real-time status of the Staffora HRIS platform |

4. Add monitor groups:

**Group: Core Services**
- Staffora API Health
- Staffora Web Frontend
- Staffora Worker

**Group: Infrastructure**
- PostgreSQL Direct
- PgBouncer
- Redis

**Group: Security (Production)**
- Staffora SSL Certificate
- Staffora API SSL Certificate

5. Save and publish.

### Accessing the Status Page

- **Internal (Docker network):** `http://localhost:3002/status/staffora`
- **Production (via reverse proxy):** `https://status.staffora.co.uk`

### Exposing the Status Page Publicly

To serve the status page at `https://status.staffora.co.uk`, add a server block to the nginx configuration:

```nginx
server {
    listen 443 ssl;
    server_name status.staffora.co.uk;

    ssl_certificate     /etc/nginx/ssl/status.staffora.co.uk.crt;
    ssl_certificate_key /etc/nginx/ssl/status.staffora.co.uk.key;

    location / {
        proxy_pass http://uptime-kuma:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (required for real-time updates)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Architecture

```
                                    +-------------------+
                                    |   Uptime Kuma     |
                                    |  (port 3002)      |
                                    +-------------------+
                                           |
                    +----------------------+---------------------+
                    |                      |                     |
              HTTP checks            TCP checks           SSL checks
                    |                      |                     |
        +-----------+-----------+     +----+----+        +------+------+
        |           |           |     |    |    |        |             |
   API:3000   Web:5173   Worker:3001  PG  PgB  Redis   HTTPS endpoints
                                     5432 6432 6379     (production)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UPTIME_KUMA_PORT` | `3002` | Host port for Uptime Kuma dashboard |

## Data Persistence

All Uptime Kuma configuration (monitors, alerts, status pages, incident history) is stored in a SQLite database inside the `uptime_kuma_data` Docker volume. This data survives container restarts and upgrades.

### Backup

The `uptime_kuma_data` volume should be included in your backup strategy. To export:

```bash
# Create a backup of the Uptime Kuma data volume
docker run --rm -v staffora_uptime_kuma_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/uptime-kuma-backup-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# Restore from backup
docker run --rm -v staffora_uptime_kuma_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/uptime-kuma-backup-YYYYMMDD.tar.gz"
```

## Troubleshooting

### Uptime Kuma Cannot Reach Services

Uptime Kuma runs on the `staffora-network` Docker network and uses Docker DNS to resolve service names. If monitors show "Connection refused":

1. Verify the target service is running: `docker compose ps`
2. Verify network connectivity: `docker exec staffora-uptime-kuma ping -c1 api`
3. Check that the service is healthy: `docker inspect --format='{{.State.Health.Status}}' staffora-api`

### Monitors Show False Positives

If monitors intermittently report downtime for healthy services:

1. Increase the **Retry** count to 3-5.
2. Increase the **Heartbeat Interval** to reduce load.
3. Check Docker resource limits -- Uptime Kuma needs adequate CPU/memory.
4. Review container logs: `docker logs staffora-uptime-kuma --tail 100`

### Dashboard Not Accessible

If `http://localhost:3002` is unreachable:

1. Check the container status: `docker ps -f name=uptime-kuma`
2. Check health: `docker inspect --format='{{.State.Health.Status}}' staffora-uptime-kuma`
3. Check logs: `docker logs staffora-uptime-kuma --tail 50`
4. Verify port binding: `docker port staffora-uptime-kuma`

### Resetting the Admin Password

If you lose access to the Uptime Kuma dashboard:

```bash
docker exec -it staffora-uptime-kuma node -e "
const Database = require('./server/database');
const bcrypt = require('bcryptjs');
const db = Database.getInstance();
const hash = bcrypt.hashSync('NewPassword123!', 10);
db.prepare('UPDATE user SET password = ? WHERE id = 1').run(hash);
console.log('Password reset successfully');
"
```

## Integration with Existing Monitoring

Uptime Kuma complements the existing Grafana + Prometheus monitoring stack:

| Concern | Tool | Purpose |
|---------|------|---------|
| **Uptime / availability** | Uptime Kuma | External-perspective health checks, status page, SSL monitoring |
| **Metrics / performance** | Prometheus + Grafana | Internal metrics, query performance, resource utilisation |
| **Logs** | Loki + Promtail + Grafana | Structured log aggregation and search |
| **Alerting (metrics)** | Prometheus Alertmanager | Metric-based alerts (CPU, memory, error rates) |
| **Alerting (uptime)** | Uptime Kuma | Availability alerts, certificate expiry, response time |

For a complete observability setup, run both profiles:

```bash
docker compose --profile monitoring --profile uptime up -d
```

## Production Checklist

Before going live, verify:

- [ ] Admin password is set to a strong, unique password (not the setup default)
- [ ] All 7+ monitors are configured and showing green
- [ ] Slack webhook notification is configured and tested (use "Test" button)
- [ ] Email (SMTP) notification is configured and tested
- [ ] SSL certificate monitors are configured for all production domains
- [ ] Certificate expiry warning is set to 14 days
- [ ] Status page is created with all monitor groups
- [ ] Status page is accessible via the public URL (`status.staffora.co.uk`)
- [ ] Nginx reverse proxy is configured for WebSocket support
- [ ] Uptime Kuma data volume is included in backup strategy
- [ ] On-call escalation (PagerDuty/Opsgenie) is configured for production
- [ ] Response time thresholds are tuned for production infrastructure
