# Multi-Region Deployment Architecture

*Last updated: 2026-03-20*
*Document owner: Platform Engineering*
*Review cadence: Quarterly, or after any infrastructure change*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Region Selection](#2-region-selection)
3. [Architecture Overview](#3-architecture-overview)
4. [PostgreSQL Replication](#4-postgresql-replication)
5. [Redis Replication](#5-redis-replication)
6. [Application Tier](#6-application-tier)
7. [DNS Failover](#7-dns-failover)
8. [UK GDPR Data Residency Compliance](#8-uk-gdpr-data-residency-compliance)
9. [Recovery Objectives](#9-recovery-objectives)
10. [Failover Procedures](#10-failover-procedures)
11. [Failback Procedures](#11-failback-procedures)
12. [Monitoring and Alerting](#12-monitoring-and-alerting)
13. [Cost Estimate](#13-cost-estimate)
14. [Implementation Phases](#14-implementation-phases)
15. [Related Documents](#15-related-documents)

---

## 1. Executive Summary

Staffora is a UK-focused HRIS platform processing sensitive employee personal data under UK GDPR. This document defines the multi-region deployment architecture to achieve:

- **RTO (Recovery Time Objective): 15 minutes** -- maximum time from failure detection to service restoration
- **RPO (Recovery Point Objective): 5 minutes** -- maximum acceptable data loss measured in time
- **99.9% availability** -- maximum 8.76 hours unplanned downtime per year
- **UK GDPR compliance** -- all personal data stored within UK/EEA jurisdictions

The architecture uses an active-passive (warm standby) model with a primary region in London and a standby region in Dublin or Frankfurt.

---

## 2. Region Selection

### Primary Region: London (eu-west-2)

| Factor | Detail |
|--------|--------|
| Provider | AWS eu-west-2 (London) |
| Rationale | UK data residency, lowest latency for UK users, ICO jurisdiction |
| Services | Full stack: PostgreSQL 16, Redis 7, Elysia.js API, React frontend, nginx, workers |
| Network | Direct peering with major UK ISPs |

### Standby Region Options

| Region | Latency from London | GDPR Status | Pros | Cons |
|--------|---------------------|-------------|------|------|
| **Dublin (eu-west-1)** | ~10ms | EU Adequate | Lowest latency, mature AWS region, largest EU capacity | Post-Brexit adequacy depends on continued UK-EU data bridge |
| **Frankfurt (eu-central-1)** | ~15ms | EU Adequate | Stable GDPR jurisdiction, strong peering | Slightly higher latency, language considerations for support |

**Recommendation: Dublin (eu-west-1)** as the primary standby region. The ~10ms cross-region latency supports synchronous replication for critical data, and the UK-EU data adequacy decision (effective 28 June 2021, extended) permits personal data transfers. Frankfurt serves as a viable alternative if the adequacy decision is revoked.

### Why Active-Passive (Not Active-Active)

Active-active multi-region introduces write conflicts, distributed transaction complexity, and split-brain scenarios that are disproportionate to Staffora's current scale. The active-passive model provides:

- Simpler operational model (single write region)
- No conflict resolution for RLS-governed multi-tenant data
- Predictable failover behavior
- Significantly lower cost

Active-active should be revisited when Staffora exceeds 10,000 concurrent users or requires sub-second RTO.

---

## 3. Architecture Overview

```
                          ┌─────────────────────────────────────────────────────┐
                          │              AWS Route 53 (DNS Failover)            │
                          │    staffora.co.uk → Primary (London)                │
                          │    Health checks every 10s on /health               │
                          └─────────────┬───────────────────────┬───────────────┘
                                        │                       │
                              (Active)  │             (Standby) │
                 ┌──────────────────────▼──────┐  ┌─────────────▼───────────────┐
                 │     London (eu-west-2)       │  │     Dublin (eu-west-1)      │
                 │                              │  │                             │
                 │  ┌────────┐  ┌────────┐     │  │  ┌────────┐  ┌────────┐    │
                 │  │ nginx  │  │ nginx  │     │  │  │ nginx  │  │ nginx  │    │
                 │  └───┬────┘  └───┬────┘     │  │  └───┬────┘  └───┬────┘    │
                 │      │           │          │  │      │           │         │
                 │  ┌───▼────┐  ┌───▼────┐     │  │  ┌───▼────┐  ┌───▼────┐    │
                 │  │ API x3 │  │ Web x2 │     │  │  │ API x2 │  │ Web x1 │    │
                 │  └───┬────┘  └────────┘     │  │  └───┬────┘  └────────┘    │
                 │      │                      │  │      │                     │
                 │  ┌───▼──────────┐           │  │  ┌───▼──────────┐          │
                 │  │  PgBouncer   │           │  │  │  PgBouncer   │          │
                 │  └───┬──────────┘           │  │  └───┬──────────┘          │
                 │      │                      │  │      │                     │
                 │  ┌───▼──────────┐           │  │  ┌───▼──────────┐          │
                 │  │ PostgreSQL   │──────WAL──│──│──│▶PostgreSQL    │          │
                 │  │ (Primary)    │ Streaming │  │  │ (Standby)    │          │
                 │  └──────────────┘           │  │  └──────────────┘          │
                 │                              │  │                             │
                 │  ┌──────────────┐           │  │  ┌──────────────┐          │
                 │  │ Redis        │───Async───│──│──│▶Redis         │          │
                 │  │ (Primary)    │ Replica   │  │  │ (Replica)    │          │
                 │  └──────────────┘           │  │  └──────────────┘          │
                 │                              │  │                             │
                 │  ┌──────────────┐           │  │  ┌──────────────┐          │
                 │  │ Worker x2    │           │  │  │ Worker x1    │          │
                 │  └──────────────┘           │  │  │ (stopped)    │          │
                 │                              │  │  └──────────────┘          │
                 │  ┌──────────────┐           │  │  ┌──────────────┐          │
                 │  │ Backup       │           │  │  │ Backup       │          │
                 │  │ Sidecar      │           │  │  │ Sidecar      │          │
                 │  └──────────────┘           │  │  └──────────────┘          │
                 └──────────────────────────────┘  └─────────────────────────────┘
                                        │                       ▲
                                        │    S3 Cross-Region    │
                                        │     Replication       │
                                        └───────────────────────┘
                                   eu-west-2 bucket → eu-west-1 bucket
```

---

## 4. PostgreSQL Replication

### 4.1 Strategy: Streaming Replication with WAL Archiving

Staffora uses PostgreSQL 16 with `wal_level = replica` already configured (see `docker/postgres/postgresql.conf`). The multi-region architecture extends this with streaming replication to the standby region.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Replication mode | Asynchronous streaming | Synchronous adds 10-15ms per write; async keeps RPO at ~5 minutes via WAL archiving |
| `wal_level` | `replica` (already set) | Minimum for streaming replication |
| `max_wal_senders` | `5` | 1 standby + 1 WAL archiver + headroom |
| `max_replication_slots` | `3` | Prevents WAL cleanup before standby consumes it |
| `archive_mode` | `on` (already set) | WAL segments archived for gap recovery |
| `archive_timeout` | `300` (already set) | Forces WAL segment switch every 5 minutes, bounding RPO |
| `hot_standby` | `on` | Allows read queries on the standby for monitoring/verification |

### 4.2 Primary PostgreSQL Configuration Changes

Add to `docker/postgres/postgresql.conf` on the primary:

```ini
# --- Replication (Primary) ---
max_wal_senders = 5
max_replication_slots = 3
wal_keep_size = 2GB
```

Create a replication user:

```sql
-- Run on primary as superuser (hris)
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<strong-password>';
```

Update `pg_hba.conf` on the primary to allow replication connections from the standby:

```
# TYPE  DATABASE        USER            ADDRESS              METHOD
host    replication     replicator      <standby-ip>/32      scram-sha-256
```

### 4.3 Standby PostgreSQL Configuration

The standby is initialized with `pg_basebackup`:

```bash
# On the standby host
pg_basebackup -h <primary-host> -U replicator -D /var/lib/postgresql/data \
  --checkpoint=fast --wal-method=stream -R
```

The `-R` flag creates `standby.signal` and writes the primary connection info to `postgresql.auto.conf`:

```ini
# Auto-generated by pg_basebackup -R
primary_conninfo = 'host=<primary-host> port=5432 user=replicator password=<password> application_name=dublin_standby'
```

Additional standby configuration:

```ini
# --- Replication (Standby) ---
hot_standby = on
hot_standby_feedback = on
recovery_target_timeline = 'latest'

# WAL archiving on standby (receives archived WALs from primary via S3)
restore_command = 'aws s3 cp s3://staffora-wal-archive-eu-west-2/%f %p || cp /wal-archive/%f %p'
```

### 4.4 Replication Monitoring

Monitor replication lag to ensure RPO compliance:

```sql
-- On primary: check replication status
SELECT
  client_addr,
  state,
  sent_lsn,
  write_lsn,
  flush_lsn,
  replay_lsn,
  write_lag,
  flush_lag,
  replay_lag,
  sync_state
FROM pg_stat_replication;
```

```sql
-- On standby: check how far behind we are
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_lag,
  pg_last_wal_receive_lsn(),
  pg_last_wal_replay_lsn(),
  pg_is_in_recovery();
```

**Alert thresholds:**

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Replication lag (seconds) | > 60s | > 300s (RPO breach) | Page on-call engineer |
| WAL send queue (bytes) | > 1 GB | > 3 GB | Investigate network, increase `wal_keep_size` |
| Standby connection status | Disconnected > 60s | Disconnected > 300s | Investigate, restart standby |

### 4.5 WAL Archiving to S3 (Cross-Region)

In addition to streaming replication, WAL segments are archived to S3 with cross-region replication enabled. This provides a third copy of WAL data and enables gap recovery if streaming replication falls behind.

```bash
# Primary archive_command (enhanced for S3)
archive_command = 'test ! -f /wal-archive/%f && cp %p /wal-archive/%f && aws s3 cp %p s3://staffora-wal-archive-eu-west-2/%f --storage-class STANDARD_IA'
```

S3 bucket configuration:

```json
{
  "Rules": [{
    "ID": "WALCrossRegionReplication",
    "Status": "Enabled",
    "Destination": {
      "Bucket": "arn:aws:s3:::staffora-wal-archive-eu-west-1",
      "StorageClass": "STANDARD_IA"
    }
  }]
}
```

### 4.6 RLS Considerations for Replication

PostgreSQL streaming replication replicates at the physical level (WAL records), which means:

- All RLS policies, roles, and permissions are replicated automatically
- The `app` schema, `hris_app` role, and all `tenant_isolation` policies are present on the standby
- `SET app.current_tenant` context works identically on the standby for read queries
- No additional RLS configuration is needed on the standby

---

## 5. Redis Replication

### 5.1 Strategy: Redis Sentinel with Async Replication

Redis 7 supports native asynchronous replication. In the multi-region setup, a Redis replica in Dublin receives data from the London primary. Redis Sentinel manages health monitoring and automatic failover.

| Component | London (Primary) | Dublin (Standby) |
|-----------|-----------------|------------------|
| Redis server | Primary (read-write) | Replica (read-only) |
| Redis Sentinel | 2 Sentinel instances | 1 Sentinel instance |
| Quorum | 2 of 3 Sentinels must agree for failover | |

### 5.2 Redis Configuration (Primary)

```conf
# redis.conf (primary - London)
# Existing config from docker/redis/redis.conf applies, plus:
min-replicas-to-write 0
min-replicas-max-lag 10
repl-diskless-sync yes
repl-diskless-sync-delay 5
```

`min-replicas-to-write 0` means the primary continues accepting writes even if the replica is disconnected. This avoids write failures during network partitions, accepting that data written during the partition may be lost if failover occurs (bounded by RPO of 5 minutes).

### 5.3 Redis Configuration (Replica)

```conf
# redis.conf (replica - Dublin)
replicaof <london-redis-host> 6379
masterauth <redis-password>
replica-read-only yes
```

### 5.4 Sentinel Configuration

```conf
# sentinel.conf (all 3 instances)
sentinel monitor staffora-redis <london-redis-host> 6379 2
sentinel auth-pass staffora-redis <redis-password>
sentinel down-after-milliseconds staffora-redis 10000
sentinel failover-timeout staffora-redis 30000
sentinel parallel-syncs staffora-redis 1
```

Configuration explanation:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `down-after-milliseconds` | 10000 | Node considered down after 10s of no response |
| `failover-timeout` | 30000 | Total failover must complete within 30s |
| `parallel-syncs` | 1 | Only 1 replica syncs at a time (limits bandwidth) |
| Quorum | 2 | 2 of 3 Sentinels must agree the primary is down |

### 5.5 What Redis Data Means for Failover

Redis in Staffora stores:

| Data Type | Source of Truth | Impact of Loss |
|-----------|----------------|----------------|
| Session cache | PostgreSQL (`app."session"`) | Users re-authenticate; sessions rebuilt from DB |
| Tenant/permission cache | PostgreSQL (`app.tenants`, `app.permissions`) | Cache rebuilt on next request (cache-aside pattern) |
| Rate limit counters | Redis only | Counters reset; brief burst allowed |
| Idempotency keys | PostgreSQL (`app.idempotency_keys`) | Checked against DB; Redis is acceleration layer |
| Redis Streams (outbox events) | PostgreSQL (`app.domain_outbox`) | Worker re-polls outbox table; at-least-once delivery preserved |

**Conclusion:** Redis data loss is recoverable. The primary risk is a brief period of degraded performance while caches rebuild and a burst of re-authentication.

---

## 6. Application Tier

### 6.1 Stateless API and Workers

The Staffora API (Elysia.js on Bun) is fully stateless:

- Sessions stored in PostgreSQL (Better Auth) and cached in Redis
- No local file state on API containers
- Idempotency keys in PostgreSQL with Redis cache
- CSRF tokens are signed with `CSRF_SECRET` (same across instances)

This means the Dublin API instances can serve requests immediately after DNS failover with no session migration.

### 6.2 Docker Compose Configuration (Standby Region)

The standby region runs the same `docker-compose.yml` with these overrides in `docker-compose.standby.yml`:

```yaml
# docker-compose.standby.yml (Dublin)
services:
  postgres:
    # Standby-specific config is in postgresql.auto.conf (created by pg_basebackup)
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - postgres_wal_archive:/wal-archive
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./postgres/postgresql-standby.conf:/etc/postgresql/postgresql.conf:ro

  api:
    # Standby API instances are running but not receiving traffic
    # (nginx upstream weight=0 until promoted, or DNS not pointed here)
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 1G

  worker:
    # Workers are STOPPED on standby to prevent duplicate job processing
    # Start them only after PostgreSQL is promoted to primary
    deploy:
      replicas: 0

  web:
    deploy:
      replicas: 1
```

### 6.3 Warm Standby Validation

The standby API instances should be health-checked even when not receiving production traffic:

```bash
# Cron job on standby region (every 5 minutes)
curl -sf http://localhost:3000/health || echo "ALERT: Standby API unhealthy" | notify
```

The standby PostgreSQL can be validated with read queries:

```bash
# Verify replication is active and data is flowing
docker exec staffora-postgres psql -U hris -d hris -c \
  "SELECT pg_is_in_recovery(), now() - pg_last_xact_replay_timestamp() AS lag;"
```

---

## 7. DNS Failover

### 7.1 Route 53 Health-Check-Based Failover

AWS Route 53 performs automated DNS failover based on health check results.

| Record | Type | Routing Policy | TTL | Health Check |
|--------|------|---------------|-----|-------------|
| `staffora.co.uk` | A | Failover (Primary) | 60s | London health check |
| `staffora.co.uk` | A | Failover (Secondary) | 60s | Dublin health check |
| `api.staffora.co.uk` | A | Failover (Primary) | 60s | London API health check |
| `api.staffora.co.uk` | A | Failover (Secondary) | 60s | Dublin API health check |

### 7.2 Health Check Configuration

```
Health Check: staffora-london-api
  Protocol: HTTPS
  Hostname: api.staffora.co.uk (via London IP directly)
  Port: 443
  Path: /health
  Request interval: 10 seconds (Fast)
  Failure threshold: 3 consecutive failures
  Regions: us-east-1, eu-west-1, ap-southeast-1 (3 Route 53 health checker regions)

Health Check: staffora-dublin-api
  Protocol: HTTPS
  Hostname: api.staffora.co.uk (via Dublin IP directly)
  Port: 443
  Path: /health
  Request interval: 10 seconds (Fast)
  Failure threshold: 3 consecutive failures
```

### 7.3 Failover Timeline

| Time | Event |
|------|-------|
| T+0s | Primary region failure occurs |
| T+10s | First health check failure detected |
| T+30s | Third consecutive health check failure (failure threshold met) |
| T+30s | Route 53 marks primary as unhealthy |
| T+30s | Route 53 begins serving secondary IP for DNS queries |
| T+90s | DNS TTL (60s) expires; clients resolve to standby region |
| T+90s-120s | PostgreSQL promotion completes (see Section 10) |
| T+120s | Workers started on standby; full service restored |

**Total automated failover time: approximately 2 minutes** (well within 15-minute RTO).

### 7.4 DNS TTL Strategy

| Record | Normal TTL | During Incident | Rationale |
|--------|-----------|----------------|-----------|
| A records | 60s | 60s (no change needed) | Low TTL ensures fast failover |
| MX records | 3600s | 3600s | Email routing unaffected |
| TXT records | 3600s | 3600s | SPF/DKIM unaffected |

**Important:** Some DNS resolvers and clients cache beyond TTL. Expect up to 5 minutes for full client migration in practice.

---

## 8. UK GDPR Data Residency Compliance

### 8.1 Legal Framework

Staffora processes employee personal data including:
- Names, addresses, national insurance numbers
- Bank details, salary information
- Health and absence records
- Performance reviews and disciplinary records

This data is classified as **personal data** and some elements as **special category data** under UK GDPR (Article 9).

### 8.2 Data Residency Requirements

| Requirement | Implementation |
|-------------|---------------|
| Primary data storage | London (eu-west-2) -- within UK jurisdiction |
| Standby replication | Dublin (eu-west-1) -- covered by UK-EU adequacy decision |
| Backup storage | S3 eu-west-2 (primary), S3 eu-west-1 (replica) |
| WAL archives | S3 eu-west-2 with cross-region replication to eu-west-1 |
| No data outside UK/EEA | No US, APAC, or other region storage or processing |

### 8.3 UK-EU Data Adequacy Decision

The UK-EU Trade and Cooperation Agreement includes a data adequacy decision (adopted 28 June 2021) that permits personal data to flow between the UK and EEA without additional safeguards. This decision is periodically reviewed.

**Contingency if adequacy is revoked:**

1. Switch standby region from Dublin to a second UK availability zone (eu-west-2b)
2. Implement Standard Contractual Clauses (SCCs) for any remaining EU processing
3. Alternatively, use Frankfurt (eu-central-1) with SCCs in place

### 8.4 Encryption Requirements

| Layer | Mechanism | Key Management |
|-------|-----------|---------------|
| Data at rest (PostgreSQL) | EBS volume encryption (AES-256) | AWS KMS (eu-west-2 key) |
| Data at rest (Redis) | EBS volume encryption (AES-256) | AWS KMS (eu-west-2 key) |
| Data at rest (S3 backups) | SSE-S3 (AES-256) | AWS-managed |
| Data in transit (replication) | TLS 1.3 (PostgreSQL `sslmode=verify-full`) | Certificate-based |
| Data in transit (Redis) | TLS 1.3 (Redis 7 native TLS) | Certificate-based |
| Data in transit (client) | TLS 1.3 via nginx | Let's Encrypt / ACM |

### 8.5 Audit Trail

All data access is logged via Staffora's audit system (`app.audit_log` table). Cross-region replication of audit logs ensures accountability records survive regional failures.

The audit log captures:
- Who accessed the data (user ID, tenant ID)
- What was accessed (table, record ID)
- When (timestamp with timezone)
- From where (IP address, user agent)
- What action (create, read, update, delete)

---

## 9. Recovery Objectives

### 9.1 Target SLAs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **RTO** | 15 minutes | Time from failure detection to full service restoration |
| **RPO** | 5 minutes | Maximum data loss, bounded by `archive_timeout = 300s` |
| **Availability** | 99.9% | Maximum 8.76 hours unplanned downtime per year |

### 9.2 How Architecture Meets Targets

| Mechanism | Contribution to RTO | Contribution to RPO |
|-----------|--------------------|--------------------|
| Route 53 health checks (10s interval, 3 failures) | Detects failure in 30s | -- |
| DNS TTL of 60s | Client migration in 60-90s | -- |
| Warm standby API instances | No cold start delay | -- |
| PostgreSQL streaming replication | Standby seconds behind primary | Replication lag typically < 1s |
| WAL archiving (`archive_timeout = 300s`) | Gap recovery if streaming interrupted | Bounds RPO at 5 minutes |
| Redis Sentinel (10s down-after, 30s failover) | Redis available within 40s | Async replication; cache rebuilt from PostgreSQL |
| Pre-deployed workers (stopped) | Start in < 30s | Workers resume from outbox table |

### 9.3 RTO Breakdown

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Failure detection (3 health check failures) | 30s | 0:30 |
| DNS failover propagation | 60s | 1:30 |
| PostgreSQL promotion (`pg_ctl promote`) | 5-15s | 1:45 |
| Worker startup on standby | 15-30s | 2:15 |
| Client DNS cache expiry (worst case) | 0-300s | 2:15 - 7:15 |
| **Total (typical)** | **~2 minutes** | |
| **Total (worst case with DNS caching)** | **~7 minutes** | |

Both are well within the 15-minute RTO target.

---

## 10. Failover Procedures

### 10.1 Automated Failover (DNS-Triggered)

When Route 53 detects the primary is unhealthy:

1. **DNS automatically fails over** to the standby region IP.
2. **PostgreSQL promotion** must be triggered manually or via automation script:

```bash
#!/bin/bash
# failover-promote.sh -- Run on Dublin standby host
set -euo pipefail

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] FAILOVER: Promoting PostgreSQL standby to primary"

# 1. Promote PostgreSQL
docker exec staffora-postgres pg_ctl promote -D /var/lib/postgresql/data
echo "PostgreSQL promoted."

# 2. Wait for promotion to complete
until docker exec staffora-postgres psql -U hris -d hris -c "SELECT NOT pg_is_in_recovery();" -t | grep -q 't'; do
  sleep 1
done
echo "PostgreSQL is now primary (read-write)."

# 3. Start workers (were stopped on standby)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.standby.yml up -d worker
echo "Workers started."

# 4. Restart API instances to pick up read-write database connection
docker compose -f docker/docker-compose.yml restart api
echo "API restarted."

# 5. Verify health
sleep 5
curl -sf http://localhost:3000/health | python3 -m json.tool
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] FAILOVER: Complete"
```

### 10.2 Manual Failover (Planned Maintenance)

For planned maintenance on the London primary:

```bash
# 1. On London primary: stop accepting new connections
docker exec staffora-postgres psql -U hris -d hris -c \
  "ALTER SYSTEM SET max_connections = 0;"
docker exec staffora-postgres psql -U hris -d hris -c "SELECT pg_reload_conf();"

# 2. Wait for replication to catch up (lag should be 0)
docker exec staffora-postgres psql -U hris -d hris -c \
  "SELECT sent_lsn = replay_lsn AS synced FROM pg_stat_replication;"

# 3. On Dublin standby: promote
docker exec staffora-postgres pg_ctl promote -D /var/lib/postgresql/data

# 4. Update Route 53 to point to Dublin
aws route53 change-resource-record-sets --hosted-zone-id Z123456 \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"api.staffora.co.uk","Type":"A","TTL":60,"ResourceRecords":[{"Value":"<dublin-ip>"}]}}]}'

# 5. Start workers and restart API on Dublin
docker compose -f docker/docker-compose.yml up -d worker
docker compose -f docker/docker-compose.yml restart api
```

### 10.3 Failover Decision Matrix

| Scenario | Automated? | Requires DB Promotion? | Worker Action |
|----------|-----------|----------------------|---------------|
| Single API container crash | Yes (Docker restart) | No | No action |
| All London API containers down | Yes (Route 53) | No (read queries only until promotion) | No action |
| London PostgreSQL down | Yes (Route 53 triggers DNS) | **Yes** (manual `pg_ctl promote`) | Start on Dublin |
| London network partition | Yes (Route 53) | **Yes** | Start on Dublin |
| London data centre outage | Yes (Route 53) | **Yes** | Start on Dublin |
| London Redis only | No (API degrades gracefully) | No | No action |

---

## 11. Failback Procedures

After the primary (London) is restored, data must be synchronized back before returning traffic.

### 11.1 Failback Steps

```bash
# 1. On London (now standby): reinitialize as replica of Dublin (now primary)
docker compose -f docker/docker-compose.yml stop postgres
docker volume rm docker_postgres_data

# Run pg_basebackup from Dublin primary
pg_basebackup -h <dublin-host> -U replicator -D /var/lib/postgresql/data \
  --checkpoint=fast --wal-method=stream -R

docker compose -f docker/docker-compose.yml start postgres

# 2. Wait for London to catch up with Dublin
# Monitor replication lag until it reaches 0

# 3. Perform a planned failover back to London (Section 10.2)

# 4. Update Route 53 health check configuration back to primary/secondary
```

### 11.2 Failback Verification Checklist

- [ ] London PostgreSQL is primary and accepting writes
- [ ] Dublin PostgreSQL is standby and receiving replication
- [ ] Replication lag is < 1 second
- [ ] All London API instances are healthy (`/health` returns 200)
- [ ] Workers are running on London, stopped on Dublin
- [ ] Route 53 health checks confirm London is primary
- [ ] DNS resolves `api.staffora.co.uk` to London IP
- [ ] Run smoke test: create a test employee, verify data persists
- [ ] Verify audit log entries are being written

---

## 12. Monitoring and Alerting

### 12.1 Multi-Region Monitoring Stack

Each region runs its own monitoring stack (Prometheus + Grafana + Loki, as configured in the `monitoring` Docker Compose profile). A central Grafana instance in London aggregates data from both regions.

### 12.2 Critical Alerts

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| PostgreSQL replication lag > 60s | `replay_lag > 60` on primary | Warning | Investigate network |
| PostgreSQL replication lag > 300s | `replay_lag > 300` on primary | **Critical (RPO breach)** | Page on-call |
| Standby disconnected > 60s | No replication connection | Warning | Check standby health |
| Standby disconnected > 300s | No replication connection | **Critical** | Page on-call, prepare manual WAL ship |
| Route 53 health check failing | 3 consecutive failures | **Critical** | Verify failover is working |
| Cross-region S3 replication lag > 1h | S3 metrics | Warning | Check S3 replication status |
| Standby API unhealthy | `/health` returns non-200 | Warning | Restart standby API |
| Redis replica disconnected > 60s | Sentinel reports replica down | Warning | Check Redis replica |

### 12.3 Prometheus Metrics

```yaml
# prometheus-rules.yml (multi-region)
groups:
  - name: multi_region_replication
    rules:
      - alert: PostgresReplicationLagWarning
        expr: pg_replication_lag_seconds > 60
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication lag exceeds 60s"

      - alert: PostgresReplicationLagCritical
        expr: pg_replication_lag_seconds > 300
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL replication lag exceeds RPO (5 minutes)"

      - alert: StandbyApiUnhealthy
        expr: probe_success{job="standby-api-health"} == 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Standby region API health check failing"
```

---

## 13. Cost Estimate

### 13.1 Single-Region (Current) vs Multi-Region

All estimates are monthly, based on AWS eu-west-2 pricing as of March 2026. Assumes a moderate workload (1,000 employees, 200 concurrent users).

#### Compute

| Component | Single-Region | Multi-Region (Active-Passive) | Notes |
|-----------|--------------|-------------------------------|-------|
| API instances (c6g.large) | 3 x $52 = $156 | 3 + 2 = 5 x $52 = $260 | Standby runs 2 smaller instances |
| Worker instances (c6g.medium) | 2 x $26 = $52 | 2 + 1 = 3 x $26 = $78 | Standby worker stopped (pays for reservation) |
| Web server (t4g.medium) | 2 x $25 = $50 | 2 + 1 = 3 x $25 = $75 | |
| nginx/LB (t4g.small) | 1 x $12 = $12 | 2 x $12 = $24 | One per region |
| **Compute subtotal** | **$270** | **$437** | +62% |

#### Database

| Component | Single-Region | Multi-Region | Notes |
|-----------|--------------|--------------|-------|
| RDS PostgreSQL 16 (db.r6g.large) | $175 | $175 | Primary |
| RDS PostgreSQL 16 read replica | -- | $175 | Standby (cross-region replica) |
| Storage (100 GB gp3) | $8 | $16 | Both regions |
| **Database subtotal** | **$183** | **$366** | +100% |

#### Redis

| Component | Single-Region | Multi-Region | Notes |
|-----------|--------------|--------------|-------|
| ElastiCache Redis 7 (cache.r6g.large) | $130 | $130 | Primary |
| ElastiCache Redis 7 replica | -- | $130 | Cross-region replica |
| **Redis subtotal** | **$130** | **$260** | +100% |

#### Storage and Transfer

| Component | Single-Region | Multi-Region | Notes |
|-----------|--------------|--------------|-------|
| S3 backups (50 GB) | $1.15 | $2.30 | Cross-region replication |
| S3 WAL archive (100 GB) | $2.30 | $4.60 | Cross-region replication |
| Cross-region data transfer | -- | ~$50 | WAL streaming + S3 replication |
| Route 53 health checks | -- | $3.00 | 2 health checks, fast interval |
| **Storage subtotal** | **$3.45** | **$59.90** | |

#### Monitoring

| Component | Single-Region | Multi-Region | Notes |
|-----------|--------------|--------------|-------|
| CloudWatch / Grafana | $30 | $50 | Additional cross-region metrics |
| **Monitoring subtotal** | **$30** | **$50** | |

### 13.2 Monthly Total

| Configuration | Monthly Cost | Annual Cost |
|--------------|-------------|-------------|
| **Single-region (current)** | **$616** | **$7,392** |
| **Multi-region (active-passive)** | **$1,173** | **$14,076** |
| **Difference** | **+$557/mo** | **+$6,684/yr** |
| **% Increase** | **+90%** | |

### 13.3 Cost Optimization Options

| Optimization | Savings | Trade-off |
|-------------|---------|-----------|
| Reserved Instances (1-year, all upfront) | ~35% on compute and DB | Upfront commitment |
| Savings Plans (1-year, partial upfront) | ~25% on compute | Less flexibility |
| Smaller standby instances (scale up on failover) | ~20% on compute | Slower failover (2-3 min to scale) |
| Use Aurora PostgreSQL (built-in cross-region) | Eliminates manual replication setup | Higher per-hour cost, Aurora lock-in |
| Spot instances for standby API | ~60% on standby compute | Risk of interruption (acceptable for standby) |

**Recommended:** Reserved Instances for primary region, Spot/on-demand for standby. Estimated optimized cost: **~$900/month**.

---

## 14. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

- [ ] Set up Dublin VPC with peering to London VPC
- [ ] Configure PostgreSQL streaming replication
- [ ] Test `pg_basebackup` and standby initialization
- [ ] Verify replication lag monitoring

### Phase 2: Data Layer (Weeks 3-4)

- [ ] Configure S3 cross-region replication for backups and WAL archives
- [ ] Set up Redis Sentinel with cross-region replica
- [ ] Configure TLS for cross-region replication traffic
- [ ] Verify RPO by measuring worst-case replication lag

### Phase 3: Application Tier (Weeks 5-6)

- [ ] Deploy standby API and web containers in Dublin
- [ ] Configure standby-specific Docker Compose overrides
- [ ] Set up health checks on standby instances
- [ ] Deploy monitoring stack in Dublin

### Phase 4: DNS and Failover (Weeks 7-8)

- [ ] Configure Route 53 failover routing
- [ ] Configure health checks with appropriate thresholds
- [ ] Write and test `failover-promote.sh` script
- [ ] Write and test failback procedures

### Phase 5: Validation (Weeks 9-10)

- [ ] Perform planned failover drill
- [ ] Measure actual RTO and RPO
- [ ] Perform failback drill
- [ ] Document lessons learned
- [ ] Update this document with actual measurements

---

## 15. Related Documents

- [Disaster Recovery Plan](disaster-recovery.md) -- Single-region failure scenarios and recovery procedures
- [Point-in-Time Recovery](point-in-time-recovery.md) -- WAL archiving and PITR procedures
- [SLA/SLO Definitions](sla-slo-definitions.md) -- Service level objectives and error budgets
- [DR Drill Schedule](dr-drill-schedule.md) -- Quarterly drill schedule and reporting
- [Secret Rotation](secret-rotation.md) -- Credential rotation procedures (applies to both regions)
- [Production Checklist](production-checklist.md) -- Pre-launch verification items
- [PgBouncer Guide](pgbouncer-guide.md) -- Connection pooling (deployed in both regions)
- [Log Aggregation](log-aggregation.md) -- Loki/Promtail/Grafana monitoring stack
