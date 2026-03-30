# Disaster Recovery Plan

*Last updated: 2026-03-28*
*Document owner: Platform Engineering*
*Review cadence: Quarterly, or after any incident*

---

## 1. Recovery Objectives

| Tier | Scenario | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) |
|------|----------|------|------|
| **Standard** | Single service failure (API, worker, web, Redis) | **4 hours** | **1 hour** |
| **Elevated** | Database failure, storage corruption | **4 hours** | **1 hour** |
| **Catastrophic** | Full host loss, ransomware, data centre outage | **24 hours** | **24 hours** (last daily backup) |

### Definitions

- **RTO**: Maximum acceptable time from failure detection to full service restoration.
- **RPO**: Maximum acceptable data loss measured in time. An RPO of 1 hour means we accept losing up to 1 hour of committed transactions.

### How Current Infrastructure Meets These Targets

| Mechanism | RPO Contribution | Reference |
|-----------|-----------------|-----------|
| Automated `pg_dump` via backup sidecar with cron | Per `BACKUP_SCHEDULE` cron expression (default: daily at 02:00) | `docker/scripts/backup-entrypoint.sh` |
| `BACKUP_SCHEDULE` configurable cron expression | Adjustable to hourly (`0 * * * *`) for Standard tier | `docker/docker-compose.yml` backup service |
| S3 offsite uploads with AES-256 encryption | Survives host loss | `docker/scripts/backup-db.sh` S3 section |
| Redis AOF persistence (`appendfsync everysec`) | ~1 second for cache/queue data | `docker/redis/redis.conf` |
| Redis RDB snapshots (60s/10000 keys, 300s/10 keys, 900s/1 key) | 1-15 minutes for cache data | `docker/redis/redis.conf` |
| PostgreSQL WAL configured (`wal_level = replica`, max 4 GB) | Foundation for future PITR | `docker/postgres/postgresql.conf` |

**Action required for Standard tier RPO of 1 hour**: Set `BACKUP_SCHEDULE=0 * * * *` in production `docker/.env`. This causes the backup sidecar cron to run `pg_dump` every hour instead of once daily at 02:00.

---

## 2. Failure Scenarios and Recovery Procedures

### 2.1 Database Failure (PostgreSQL)

**Symptoms**: API returns 500 errors, `/health` endpoint reports database unhealthy, `pg_isready` fails.

**Possible causes**: Container crash, OOM kill, corrupted data directory, disk full, connection exhaustion.

#### Procedure: Container Crash / Restart

1. **Check container status**:
   ```bash
   docker ps -a --filter name=staffora-postgres
   docker logs staffora-postgres --tail 100
   ```

2. **Restart the container** (Docker `restart: unless-stopped` should do this automatically):
   ```bash
   docker compose -f docker/docker-compose.yml restart postgres
   ```

3. **Wait for health check** (10s interval, 5 retries):
   ```bash
   docker compose -f docker/docker-compose.yml ps postgres
   # Wait until status shows "healthy"
   ```

4. **Verify connectivity**:
   ```bash
   docker exec staffora-postgres pg_isready -U hris -d hris
   ```

5. **Verify API recovery** -- dependent services (api, worker, backup) will reconnect automatically via health check dependencies:
   ```bash
   curl -s http://localhost:3000/health | python3 -m json.tool
   ```

**Estimated recovery time**: 1-5 minutes (automatic restart).

#### Procedure: Corrupted Data / Volume Loss

If the `postgres_data` Docker volume is corrupted or lost, restore from backup.

1. **Stop all dependent services**:
   ```bash
   docker compose -f docker/docker-compose.yml stop api worker web backup
   ```

2. **Stop and remove the postgres container and its volume**:
   ```bash
   docker compose -f docker/docker-compose.yml stop postgres
   docker compose -f docker/docker-compose.yml rm -f postgres
   docker volume rm docker_postgres_data
   ```

3. **Recreate the postgres container** (this runs `init.sql` to create the `app` schema, roles, and functions):
   ```bash
   docker compose -f docker/docker-compose.yml up -d postgres
   # Wait for healthy
   docker compose -f docker/docker-compose.yml ps postgres
   ```

4. **Run migrations** to recreate the schema:
   ```bash
   bun run migrate:up
   ```

5. **Restore from the most recent local backup**:
   ```bash
   # List available local backups
   ls -lh docker/backups/staffora_*.sql.gz

   # Restore the most recent one
   ./docker/scripts/restore-db.sh docker/backups/staffora_hris_YYYYMMDD_HHMMSS.sql.gz
   ```

   If local backups are unavailable, restore from S3:
   ```bash
   # List available S3 backups
   S3_BACKUP_BUCKET=your-bucket ./docker/scripts/restore-from-s3.sh --list

   # Restore the latest daily backup
   S3_BACKUP_BUCKET=your-bucket ./docker/scripts/restore-from-s3.sh --latest daily
   ```

6. **Restart all services**:
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

7. **Verify data integrity**:
   ```bash
   # Check tenant count
   docker exec staffora-postgres psql -U hris -d hris -c "SELECT count(*) FROM app.tenants;"

   # Check employee count
   docker exec staffora-postgres psql -U hris -d hris -c "SELECT count(*) FROM app.employees;"

   # Check RLS functions exist
   docker exec staffora-postgres psql -U hris -d hris -c "SELECT app.is_system_context();"
   ```

**Estimated recovery time**: 30-60 minutes depending on backup size.

#### Procedure: Connection Exhaustion

1. **Check active connections**:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT count(*), state FROM pg_stat_activity WHERE datname = 'hris' GROUP BY state;"
   ```

2. **Terminate idle connections if needed**:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'hris' AND state = 'idle' AND query_start < now() - interval '10 minutes';"
   ```

3. **Restart API and worker to reset connection pools** (configured at max 20 connections per service in `src/config/database.ts`):
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

**Estimated recovery time**: 5 minutes.

---

### 2.2 Redis Failure

**Symptoms**: Elevated API latency, rate limiting not working, session lookups slow, worker jobs stalled, `/health` endpoint reports Redis unhealthy.

**Impact assessment**: Redis is used for caching, session storage, rate limiting, and job queues (Redis Streams). PostgreSQL is the source of truth for all business data. Redis data loss is recoverable but causes temporary degradation.

#### Procedure: Container Crash / Restart

1. **Check container status**:
   ```bash
   docker ps -a --filter name=staffora-redis
   docker logs staffora-redis --tail 50
   ```

2. **Restart the container**:
   ```bash
   docker compose -f docker/docker-compose.yml restart redis
   ```

3. **Verify connectivity**:
   ```bash
   docker exec staffora-redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning ping
   ```

4. **Check persistence recovery** -- Redis loads the AOF file on startup. Verify data was restored:
   ```bash
   docker exec staffora-redis redis-cli -a "${REDIS_PASSWORD}" --no-auth-warning dbsize
   ```

**Estimated recovery time**: 1-2 minutes (automatic restart with AOF replay).

#### Procedure: Volume Loss (Complete Redis Data Loss)

Redis data loss is not catastrophic. All authoritative data lives in PostgreSQL.

1. **Stop and recreate Redis**:
   ```bash
   docker compose -f docker/docker-compose.yml stop redis
   docker compose -f docker/docker-compose.yml rm -f redis
   docker volume rm docker_redis_data
   docker compose -f docker/docker-compose.yml up -d redis
   ```

2. **Restart API and worker** to rebuild caches and reconnect:
   ```bash
   docker compose -f docker/docker-compose.yml restart api worker
   ```

3. **Verify recovery**:
   ```bash
   curl -s http://localhost:3000/health | python3 -m json.tool
   ```

**Impact of Redis data loss**:
- Active sessions invalidated -- all users must re-authenticate.
- Cached tenant/permission data rebuilt on next request (cache-aside pattern).
- Rate limit counters reset -- temporary burst allowance until counters rebuild.
- Pending job queue entries lost -- unprocessed outbox events will be re-polled from `domain_outbox` table on next worker cycle (outbox pattern guarantees at-least-once delivery).
- Redis Stream consumer group positions reset -- some events may be reprocessed (idempotency keys in PostgreSQL prevent duplicate side effects).

**Estimated recovery time**: 5-10 minutes.

---

### 2.3 API Server Crash

**Symptoms**: HTTP requests to port 3000 fail, `/health` endpoint unreachable, nginx returns 502/504.

#### Procedure

1. **Check container status and logs**:
   ```bash
   docker ps -a --filter name=staffora-api
   docker logs staffora-api --tail 200
   ```

2. **Restart the container** (usually automatic via `restart: unless-stopped`):
   ```bash
   docker compose -f docker/docker-compose.yml restart api
   ```

3. **If OOM killed**, check resource limits (current: 2 CPU, 1 GB memory):
   ```bash
   docker inspect staffora-api --format='{{.State.OOMKilled}}'
   # If true, consider increasing memory limit in docker-compose.yml
   ```

4. **Verify health**:
   ```bash
   # Health check runs every 30s with 30s start period
   curl -s http://localhost:3000/health | python3 -m json.tool
   ```

5. **Check dependent services recovered** (worker uses same Dockerfile):
   ```bash
   docker compose -f docker/docker-compose.yml ps
   ```

**Estimated recovery time**: 1-3 minutes (automatic restart).

---

### 2.4 Worker Process Crash

**Symptoms**: Background jobs not processing, outbox table growing, notifications not sent, exports not generated.

**Impact assessment**: Worker crash does not affect API availability. Users can continue working. Background tasks (notifications, exports, PDF generation, analytics aggregation) queue up and process when the worker recovers.

#### Procedure

1. **Check worker status and logs**:
   ```bash
   docker ps -a --filter name=staffora-worker
   docker logs staffora-worker --tail 200
   ```

2. **Restart the worker**:
   ```bash
   docker compose -f docker/docker-compose.yml restart worker
   ```

3. **Check worker health endpoint** (port 3001):
   ```bash
   curl -s http://localhost:3001/health | python3 -m json.tool
   ```

4. **Monitor outbox drain** -- verify the worker is processing queued events:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT count(*), status FROM app.domain_outbox GROUP BY status;"
   ```

**Estimated recovery time**: 1-3 minutes. Queued events process within minutes of worker restart.

---

### 2.5 Web Frontend Crash

**Symptoms**: Users cannot access the web interface, nginx returns 502 for frontend routes.

**Impact assessment**: API remains functional. Any integrations or direct API consumers continue operating.

#### Procedure

1. **Restart the web container**:
   ```bash
   docker compose -f docker/docker-compose.yml restart web
   ```

2. **Verify**:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/healthz
   # Should return 200
   ```

**Estimated recovery time**: 1 minute.

---

### 2.6 Full Host Loss

**Symptoms**: All services unreachable. SSH to host fails. Monitoring alerts for total outage.

**Causes**: Hardware failure, hypervisor crash, data centre outage, network partition.

#### Procedure

1. **Provision a new host** with Docker and Docker Compose installed. Minimum specs:
   - 4 vCPUs, 8 GB RAM, 100 GB SSD
   - Ubuntu 22.04+ or similar Linux
   - Docker 24+ and Docker Compose v2
   - Ports 80, 443 open

2. **Clone the repository**:
   ```bash
   git clone https://github.com/<org>/HRISystem.git /opt/staffora
   cd /opt/staffora
   ```

3. **Restore environment configuration**:
   ```bash
   cp docker/.env.example docker/.env
   # Edit docker/.env with production values:
   #   POSTGRES_PASSWORD, SESSION_SECRET, CSRF_SECRET, BETTER_AUTH_SECRET
   #   S3_BACKUP_BUCKET, AWS credentials
   #   SMTP settings, domain URLs, etc.
   ```

4. **Pull Docker images** from GHCR (images were built by CI/CD):
   ```bash
   docker compose -f docker/docker-compose.yml pull
   ```

5. **Start infrastructure services**:
   ```bash
   docker compose -f docker/docker-compose.yml up -d postgres redis
   # Wait for health checks to pass
   docker compose -f docker/docker-compose.yml ps
   ```

6. **Run database migrations**:
   ```bash
   bun run migrate:up
   ```

7. **Restore database from S3 backup**:
   ```bash
   # Install AWS CLI if not present
   apt-get install -y awscli

   # List available backups
   export S3_BACKUP_BUCKET=your-bucket-name
   export AWS_DEFAULT_REGION=eu-west-2
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret

   ./docker/scripts/restore-from-s3.sh --latest daily
   ```

8. **Start application services**:
   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

9. **Update DNS** to point to the new host IP.

10. **Restore SSL certificates** (copy from backup or re-issue via Let's Encrypt):
    ```bash
    # If using Let's Encrypt on the new host:
    certbot certonly --standalone -d staffora.co.uk -d api.staffora.co.uk
    ```

11. **Verify full stack health**:
    ```bash
    curl -s https://api.staffora.co.uk/health | python3 -m json.tool
    curl -s -o /dev/null -w "%{http_code}" https://staffora.co.uk/
    ```

**Estimated recovery time**: 2-4 hours for Standard, up to 24 hours for Catastrophic (includes provisioning, DNS propagation, and certificate issuance).

---

### 2.7 Data Corruption

**Symptoms**: Application errors referencing constraint violations, unexpected NULL values, orphaned records, RLS policy errors.

**Causes**: Bug in application code, failed migration, concurrent write race condition, manual SQL executed against production.

#### Procedure: Targeted Table Repair

1. **Identify the scope of corruption**:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename;"
   ```

2. **Check for orphaned records** (example for employees missing a tenant):
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT e.id FROM app.employees e LEFT JOIN app.tenants t ON e.tenant_id = t.id WHERE t.id IS NULL;"
   ```

3. **If corruption is limited**, fix with targeted SQL under system context:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c "
     SELECT app.enable_system_context();
     -- targeted fix here
     SELECT app.disable_system_context();
   "
   ```

4. **If corruption is widespread**, restore from the last known good backup following the procedure in Section 2.1 (Corrupted Data / Volume Loss).

#### Procedure: Failed Migration Rollback

1. **Rollback the last migration**:
   ```bash
   bun run migrate:down
   ```

2. **Verify schema state**:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT * FROM app.schema_migrations ORDER BY id DESC LIMIT 5;"
   ```

3. **Fix the migration SQL** and re-run:
   ```bash
   bun run migrate:up
   ```

---

### 2.8 Ransomware / Security Breach

**Symptoms**: Encrypted files, unauthorised access detected in audit logs, unusual database queries, data exfiltration alerts.

#### Immediate Response (First 30 Minutes)

1. **Isolate the host** -- block all inbound/outbound traffic except your management IP:
   ```bash
   # On the host or via cloud security group
   ufw default deny incoming
   ufw default deny outgoing
   ufw allow from <your-ip> to any port 22
   ufw enable
   ```

2. **Preserve evidence** -- do NOT restart or destroy containers:
   ```bash
   # Snapshot all container logs
   docker logs staffora-api > /tmp/evidence-api.log 2>&1
   docker logs staffora-postgres > /tmp/evidence-postgres.log 2>&1
   docker logs staffora-redis > /tmp/evidence-redis.log 2>&1
   docker logs staffora-worker > /tmp/evidence-worker.log 2>&1

   # Snapshot running processes
   ps auxf > /tmp/evidence-processes.txt
   netstat -tulpn > /tmp/evidence-network.txt
   ```

3. **Revoke all active sessions** (if the database is still accessible):
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "TRUNCATE app.\"session\";"
   ```

4. **Rotate all secrets immediately**:
   - PostgreSQL passwords (`hris`, `hris_app`)
   - `SESSION_SECRET`, `CSRF_SECRET`, `BETTER_AUTH_SECRET`
   - AWS credentials
   - SMTP credentials
   - Any API keys

#### Recovery (Hours 1-24)

5. **Provision a clean host** -- never reuse the compromised host.

6. **Restore from a pre-breach backup**:
   - Identify the breach timestamp from audit logs (`app.audit_log` table).
   - Select a backup from before that timestamp.
   ```bash
   ./docker/scripts/restore-from-s3.sh --list daily
   # Choose a backup dated before the breach
   ./docker/scripts/restore-from-s3.sh backups/staffora/daily/YYYY-MM-DD/staffora_hris_YYYYMMDD_HHMMSS.sql.gz
   ```

7. **Audit what was accessed** -- query the audit log in the restored database:
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c \
     "SELECT * FROM app.audit_log WHERE created_at > '<breach-start-time>' ORDER BY created_at;"
   ```

8. **Follow the communication plan** (Section 4) -- GDPR Article 72 requires notification to the ICO within 72 hours if personal data was compromised.

**Estimated recovery time**: 12-24 hours including forensics and clean rebuild.

---

## 3. Backup Strategy

### 3.1 Backup Architecture

```
                    +------------------+
                    |  backup sidecar  |
                    | (staffora-backup)|
                    +--------+---------+
                             |
                    pg_dump on cron schedule
                    (BACKUP_SCHEDULE)
                             |
               +-------------+-------------+
               |                           |
        +------v------+          +--------v--------+
        | Local Volume |          |    AWS S3       |
        | (backup_data)|          | (AES-256 SSE)  |
        | 7 days       |          | Tiered:        |
        +--------------+          |  daily/  30d   |
                                  |  weekly/ 90d   |
                                  |  monthly/365d  |
                                  +-----------------+
```

### 3.2 Backup Schedule

| Type | Frequency | Retention | Storage | Encryption |
|------|-----------|-----------|---------|------------|
| Local `pg_dump` | Per `BACKUP_SCHEDULE` cron (default: `0 2 * * *`, daily at 02:00) | `BACKUP_RETENTION_DAYS` (default: 7) | Docker volume `backup_data` | None (local only) |
| S3 Daily | Every backup run | 30 days (`S3_DAILY_RETENTION`) | `s3://<bucket>/backups/staffora/daily/` | AES-256 SSE |
| S3 Weekly | Sundays | 90 days (`S3_WEEKLY_RETENTION`) | `s3://<bucket>/backups/staffora/weekly/` | AES-256 SSE |
| S3 Monthly | 1st of month | 365 days (`S3_MONTHLY_RETENTION`) | `s3://<bucket>/backups/staffora/monthly/` | AES-256 SSE |

### 3.3 Backup Content

The `pg_dump` command in `docker/scripts/backup-db.sh` exports:
- All tables in `app` schema (all application data including RLS policies)
- All tables in `public` schema (extensions)
- `--clean --if-exists` flags for idempotent restore
- `--no-owner --no-acl` for portability across environments
- Output compressed with gzip

**Not included in backups** (must be recreated separately):
- Database roles (`hris`, `hris_app`) -- created by `docker/postgres/init.sql`
- Redis data (ephemeral, rebuilt from PostgreSQL on restart)
- Uploaded files in `worker_uploads` volume (should be stored in S3 in production)
- SSL certificates
- Environment variables / secrets

### 3.4 Backup Verification

Run these checks weekly to confirm backups are valid:

1. **Verify local backup exists and is non-empty**:
   ```bash
   docker exec staffora-backup ls -lh /backups/staffora_*.sql.gz
   ```

2. **Verify S3 backups exist**:
   ```bash
   docker exec staffora-backup /scripts/restore-from-s3.sh --list daily
   ```

3. **Test restore to a temporary database** (non-destructive):
   ```bash
   # Create a temporary database
   docker exec staffora-postgres psql -U hris -c "CREATE DATABASE hris_dr_test;"

   # Restore the latest backup into it
   gunzip -c docker/backups/staffora_hris_LATEST.sql.gz | \
     docker exec -i staffora-postgres psql -U hris -d hris_dr_test

   # Verify table counts match
   docker exec staffora-postgres psql -U hris -d hris_dr_test -c \
     "SELECT count(*) FROM app.tenants;"

   # Drop the test database
   docker exec staffora-postgres psql -U hris -c "DROP DATABASE hris_dr_test;"
   ```

4. **Manual trigger** of an on-demand backup:
   ```bash
   docker exec staffora-backup /scripts/backup-db.sh /backups
   ```

### 3.5 Production Backup Configuration

For production environments meeting the Standard tier RPO of 1 hour, set these in `docker/.env`:

```bash
# Run backup every hour (cron expression)
BACKUP_SCHEDULE=0 * * * *

# Keep 14 days of local backups
BACKUP_RETENTION_DAYS=14

# Enable S3 offsite backup
S3_BACKUP_BUCKET=staffora-production-backups
S3_BACKUP_PREFIX=backups/staffora/
S3_BACKUP_STORAGE_CLASS=STANDARD_IA

# AWS credentials
AWS_DEFAULT_REGION=eu-west-2
AWS_ACCESS_KEY_ID=<production-key>
AWS_SECRET_ACCESS_KEY=<production-secret>

# S3 retention
S3_DAILY_RETENTION=30
S3_WEEKLY_RETENTION=90
S3_MONTHLY_RETENTION=365
```

---

## 4. Communication Plan

### 4.1 Escalation Matrix

| Severity | Description | Notify | Response Time |
|----------|-------------|--------|---------------|
| **SEV-1** | Total platform outage, data loss, security breach | Engineering Lead, CTO, all stakeholders | Immediate (within 15 min) |
| **SEV-2** | Partial outage (one service down), degraded performance | Engineering Lead, on-call engineer | Within 30 minutes |
| **SEV-3** | Non-critical service issue, worker delays | On-call engineer | Within 2 hours |
| **SEV-4** | Monitoring alert, potential issue | On-call engineer | Next business day |

### 4.2 Notification Templates

#### Internal (Slack / Teams / Email)

**Incident opened**:
```
[SEV-X] Staffora Platform Incident - <brief description>
Status: INVESTIGATING
Impact: <what users/tenants are affected>
Started: <timestamp>
Lead: <engineer name>
Next update: <timestamp, within 30 min for SEV-1/2>
```

**Incident update**:
```
[SEV-X] Staffora Platform Incident Update
Status: IDENTIFIED / MITIGATING / RESOLVED
Root cause: <brief description>
Actions taken: <what was done>
ETA to resolution: <estimate>
Next update: <timestamp>
```

**Incident resolved**:
```
[SEV-X] Staffora Platform Incident RESOLVED
Duration: <total downtime>
Root cause: <brief summary>
Data impact: <any data loss, quantified>
Follow-up: Post-incident review scheduled for <date>
```

#### Customer-Facing (for SEV-1 and SEV-2)

**Status page update**:
```
We are currently experiencing issues with <service description>.
Our team is actively investigating and working to restore service.
We will provide updates every 30 minutes.
Last updated: <timestamp>
```

**Resolution notice**:
```
The issue affecting <service description> has been resolved.
Service was restored at <timestamp>.
We apologise for any inconvenience.
If you experience any remaining issues, contact support at support@staffora.co.uk.
```

### 4.3 GDPR Data Breach Notification

Under GDPR Article 33, if a breach involves personal data:

1. **Within 72 hours**: Notify the ICO (Information Commissioner's Office) at https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/
2. **Without undue delay**: Notify affected data subjects if the breach poses a high risk to their rights and freedoms (Article 34).
3. **Document**: Record the breach, its effects, and remedial actions in the breach register.

Required information for ICO notification:
- Nature of the breach (what data, how many records, how many individuals)
- Name and contact details of the DPO or contact point
- Likely consequences of the breach
- Measures taken or proposed to address the breach

---

## 5. Deployment Rollback

The CI/CD pipeline (`.github/workflows/deploy.yml`) includes automatic rollback for production deployments.

### 5.1 Automatic Rollback (CI/CD)

The production deployment job:
1. Captures the current running image tags before deploying (`prev_api`, `prev_web`).
2. Deploys new images with rolling restart (API first, then worker, then web).
3. Runs health checks (10 attempts, 15 seconds apart).
4. If health checks fail, automatically rolls back to the previous image tags.
5. Sends a Slack notification with rollback status.

### 5.2 Manual Rollback

If automatic rollback fails or a rollback is needed after a successful deployment:

1. **Identify the previous image tags** from the deployment logs or GHCR:
   ```bash
   # List available image tags
   docker images --filter "reference=ghcr.io/<org>/hrisystem/api" --format "{{.Tag}}\t{{.CreatedAt}}"
   ```

2. **Roll back on the production host**:
   ```bash
   ssh deploy@staffora.co.uk
   cd /opt/staffora

   # Set the previous image tags
   export API_IMAGE=ghcr.io/<org>/hrisystem/api:<previous-tag>
   export WEB_IMAGE=ghcr.io/<org>/hrisystem/web:<previous-tag>

   # Pull and restart
   docker compose pull api web
   docker compose up -d --no-deps api worker web
   ```

3. **If the rollback involves a database migration**, roll back the migration first:
   ```bash
   # On the production host
   docker compose exec api bun run src/db/migrate.ts down
   ```

   Note: Not all migrations are reversible. If a migration added columns or tables, rolling back may require a full database restore. Always check the migration SQL before attempting rollback.

### 5.3 Database-Only Rollback

If a migration corrupted data but the application code is fine:

1. **Create a backup of the current (corrupted) state** for forensics:
   ```bash
   docker exec staffora-backup /scripts/backup-db.sh /backups
   ```

2. **Restore from the pre-deployment backup** (taken automatically by the CI/CD pipeline before production deploys):
   ```bash
   ./docker/scripts/restore-db.sh docker/backups/staffora_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

3. **Roll back the application to the previous version** (to match the restored schema).

---

## 6. DR Testing Schedule

| Test | Frequency | Procedure | Success Criteria |
|------|-----------|-----------|-----------------|
| Backup integrity check | Weekly | Restore latest backup to a temp database, verify row counts | Restore completes without errors, row counts match production |
| Single service recovery | Monthly | Stop one service, verify auto-restart and health recovery | Service recovers within 5 minutes, no data loss |
| Database restore from S3 | Quarterly | Restore from S3 to a fresh database on a test host | Full restore completes within RTO, all tables present |
| Full stack rebuild | Semi-annually | Build a complete environment from scratch using backups | All services healthy, data restored, users can authenticate |
| Tabletop exercise | Annually | Walk through ransomware/breach scenario with the team | Team understands roles, communication plan executed correctly |

### DR Test Checklist

Before each DR test:
- [ ] Notify stakeholders that a DR test is being performed
- [ ] Confirm the test will not affect production data
- [ ] Verify backup availability (local and S3)
- [ ] Assign an engineer to lead the test
- [ ] Document start time

After each DR test:
- [ ] Record actual recovery time vs. RTO target
- [ ] Record any data loss vs. RPO target
- [ ] Document issues encountered during recovery
- [ ] Create action items for any gaps found
- [ ] Update this DR plan if procedures need adjustment

---

## 7. Infrastructure Dependencies

| Component | Container | Port | Volume | Health Check | Restart Policy |
|-----------|-----------|------|--------|-------------|----------------|
| PostgreSQL 16 | `staffora-postgres` | 5432 | `postgres_data` | `pg_isready` every 10s | `unless-stopped` |
| Redis 7 | `staffora-redis` | 6379 | `redis_data` | `redis-cli ping` every 10s | `unless-stopped` |
| API Server | `staffora-api` | 3000 | None | `GET /health` every 30s | `unless-stopped` |
| Background Worker | `staffora-worker` | 3001 | `worker_uploads` | `GET /health` every 30s | `unless-stopped` |
| Web Frontend | `staffora-web` | 5173 | None | `GET /healthz` every 30s | `unless-stopped` |
| Backup Sidecar | `staffora-backup` | None | `backup_data` | None | `unless-stopped` |
| Nginx (production) | `staffora-nginx` | 80, 443 | None (config mounted) | None | `unless-stopped` |

### Service Dependency Chain

```
nginx --> web --> api --> postgres
                  api --> redis
          worker --> postgres
          worker --> redis
          backup --> postgres
```

**Startup order** is enforced by Docker Compose `depends_on` with `condition: service_healthy`. Services will not start until their dependencies are healthy.

---

## 8. Contact Information

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Engineering Lead | *[To be assigned]* | *[email/phone]* | *[backup contact]* |
| Platform Engineer (On-call) | *[To be assigned]* | *[email/phone]* | *[backup contact]* |
| CTO | *[To be assigned]* | *[email/phone]* | -- |
| AWS Account Owner | *[To be assigned]* | *[email/phone]* | *[backup contact]* |
| Domain Registrar | *[Provider name]* | *[support URL]* | -- |
| Hosting Provider | *[Provider name]* | *[support URL]* | -- |

---

## 9. Future Improvements

These items are not yet implemented but would strengthen the DR posture. They are tracked in the production checklist (`Docs/operations/production-checklist.md`).

| Item | Priority | Impact |
|------|----------|--------|
| **Point-in-Time Recovery (PITR)** via WAL-G or pgBackRest | P1 | Reduces RPO to minutes instead of hours. `wal_level = replica` is already configured. |
| **Read replica** for reporting and failover | P1 | Enables fast failover for read queries. WAL shipping already possible with current config. |
| **Kubernetes deployment** with auto-scaling and self-healing | P2 | Eliminates single-host risk, enables multi-AZ deployment. |
| **Infrastructure as Code** (Terraform/Pulumi) | P2 | Enables repeatable infrastructure provisioning in minutes instead of hours. |
| **Automated DR testing** in CI/CD | P2 | Backup restore verified on every deployment, not just quarterly. |
| **Multi-region S3 replication** | P3 | Protects against AWS region outage. |
| **Database connection pooler** (PgBouncer) | P2 | Reduces connection exhaustion risk. |

---

## Related Documents

- [Production Checklist](production-checklist.md) -- Pre-launch readiness items
- [Production Readiness Report](production-readiness-report.md) -- Platform maturity scores
- [Point-in-Time Recovery](point-in-time-recovery.md) -- WAL archiving and PITR procedures
- [Backup Verification](backup-verification.md) -- Automated backup restore testing
- [Worker System](worker-system.md) -- Background job architecture
- [Monitoring & Observability](monitoring-observability.md) -- Metrics, tracing, health checks
- [External Service Integrations](../09-integrations/external-services.md) -- S3, SMTP, Redis configuration
- [Docker Guide](../06-devops/docker-guide.md) -- Container management deep-dive
- [Secret Rotation](secret-rotation.md) -- Credential rotation procedures
