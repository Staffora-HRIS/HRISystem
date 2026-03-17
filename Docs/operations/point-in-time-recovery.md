# Point-in-Time Recovery (PITR) with WAL Archiving

> **Last updated:** 2026-03-17
>
> This document describes how Staffora's PostgreSQL backup and WAL archiving
> configuration enables point-in-time recovery (PITR). It covers the architecture,
> daily operations, and step-by-step recovery procedures.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [How WAL Archiving Works](#how-wal-archiving-works)
4. [Configuration Reference](#configuration-reference)
5. [Verifying WAL Archiving is Active](#verifying-wal-archiving-is-active)
6. [Backup Strategy](#backup-strategy)
7. [WAL Archive Maintenance](#wal-archive-maintenance)
8. [Recovery Procedures](#recovery-procedures)
   - [Scenario A: Restore to the Latest State](#scenario-a-restore-to-the-latest-state)
   - [Scenario B: Restore to a Specific Point in Time](#scenario-b-restore-to-a-specific-point-in-time)
   - [Scenario C: Restore a Single Table](#scenario-c-restore-a-single-table)
9. [Testing Recovery](#testing-recovery)
10. [Production Considerations](#production-considerations)
11. [Troubleshooting](#troubleshooting)
12. [Related Documentation](#related-documentation)

---

## Overview

Staffora uses two complementary backup mechanisms:

| Mechanism | What It Captures | Granularity | RPO |
|-----------|-----------------|-------------|-----|
| **pg_dump** (daily, via backup sidecar) | Full logical database dump | Point-in-time snapshot at dump start | Up to 24 hours of data loss |
| **WAL archiving** (continuous) | Every write operation (INSERT, UPDATE, DELETE, DDL) | Individual transaction | Seconds (bounded by `archive_timeout`) |

Together, these give you **point-in-time recovery**: you can restore the database
to any moment between now and the oldest retained base backup, not just to the
time the daily dump ran.

**Recovery Point Objective (RPO):** Up to 5 minutes of data loss (bounded by
`archive_timeout = 300` seconds in `postgresql.conf`).

**Recovery Time Objective (RTO):** Depends on database size and WAL volume.
Typically 10-30 minutes for databases under 50 GB.

---

## Architecture

```
PostgreSQL Container (staffora-postgres)
  |
  |-- writes data --> postgres_data volume (/var/lib/postgresql/data)
  |
  |-- archives completed WAL segments --> postgres_wal_archive volume (/wal-archive)
  |       (via archive_command in postgresql.conf)
  |
  v
Backup Sidecar (staffora-backup)
  |
  |-- runs daily pg_dump --> backup_data volume (/backups)
  |-- reads WAL archive (read-only) --> postgres_wal_archive volume (/wal-archive)
  |-- optionally uploads to S3
```

### Docker Volumes

| Volume | Mount Point | Container | Access | Purpose |
|--------|-------------|-----------|--------|---------|
| `postgres_data` | `/var/lib/postgresql/data` | postgres | rw | PostgreSQL data directory |
| `postgres_wal_archive` | `/wal-archive` | postgres | rw | Archived WAL segments |
| `postgres_wal_archive` | `/wal-archive` | backup | ro | WAL archive read access for offsite copy |
| `backup_data` | `/backups` | backup | rw | pg_dump base backups |

---

## How WAL Archiving Works

PostgreSQL's Write-Ahead Log (WAL) records every change made to the database
before the change is applied to the actual data files. WAL segments are 16 MB
files stored in `pg_wal/` inside the data directory.

When `archive_mode = on`, PostgreSQL calls the `archive_command` each time a WAL
segment is completed (filled to 16 MB) or when `archive_timeout` seconds have
elapsed since the last archive, whichever comes first.

Our `archive_command` is:

```
test ! -f /wal-archive/%f && cp %p /wal-archive/%f
```

This means:
- `%p` = full path to the completed WAL segment in `pg_wal/`
- `%f` = just the filename (e.g., `000000010000000000000001`)
- `test ! -f` = only copy if the file does not already exist (crash safety)
- The file is copied to `/wal-archive/`, which is the `postgres_wal_archive`
  Docker volume

The `archive_timeout = 300` setting forces archival every 5 minutes even if the
WAL segment has not been filled, bounding the maximum data loss window.

---

## Configuration Reference

All WAL archiving configuration lives in `docker/postgres/postgresql.conf`:

```ini
# WAL level must be 'replica' or 'logical' for archiving to work
wal_level = replica

# Enable WAL archiving
archive_mode = on

# Command to copy completed WAL segments to the archive volume
archive_command = 'test ! -f /wal-archive/%f && cp %p /wal-archive/%f'

# Force archive every 5 minutes even if WAL segment is not full
archive_timeout = 300
```

Environment variables in `docker/.env` (or `docker/.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `WAL_ARCHIVE_RETENTION_DAYS` | `7` | Days to retain archived WAL files |

---

## Verifying WAL Archiving is Active

After starting the containers with `docker compose up -d`, verify that archiving
is working:

### 1. Check PostgreSQL settings

```bash
docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT name, setting
  FROM pg_settings
  WHERE name IN ('archive_mode', 'archive_command', 'archive_timeout', 'wal_level')
  ORDER BY name;
"
```

Expected output:

```
       name        |                           setting
-------------------+--------------------------------------------------------------
 archive_command   | test ! -f /wal-archive/%f && cp %p /wal-archive/%f
 archive_mode      | on
 archive_timeout   | 300
 wal_level         | replica
```

### 2. Check the archive directory has files

```bash
# Wait at least 5 minutes after starting PostgreSQL, then:
docker exec staffora-postgres ls -la /wal-archive/
```

You should see one or more WAL segment files (names like
`000000010000000000000001`).

### 3. Check archive status

```bash
docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT archived_count, last_archived_wal, last_archived_time,
         failed_count, last_failed_wal, last_failed_time
  FROM pg_stat_archiver;
"
```

- `archived_count` should be incrementing
- `failed_count` should be 0
- `last_archived_time` should be recent (within the last `archive_timeout` seconds)

### 4. Force a WAL switch (for testing)

```bash
docker exec staffora-postgres psql -U hris -d hris -c "SELECT pg_switch_wal();"
```

Then verify a new file appears in `/wal-archive/`.

---

## Backup Strategy

The recommended production backup strategy combines daily base backups with
continuous WAL archiving:

| Component | Frequency | Retention | Storage |
|-----------|-----------|-----------|---------|
| pg_dump base backup | Daily at 02:00 UTC | 7 days local, 30 days S3 daily, 90 days S3 weekly, 365 days S3 monthly | `backup_data` volume + S3 |
| WAL archive | Continuous (every 5 min max) | 7 days | `postgres_wal_archive` volume |

### Why Both?

- **pg_dump alone** gives you recovery to the exact time the dump ran, but you
  lose all changes since the last dump (up to 24 hours).
- **WAL archive alone** is useless without a base backup to replay the WAL on
  top of. You need a consistent starting point.
- **Together**, you restore the base backup, then replay WAL segments to reach
  any point in time after the backup was taken.

---

## WAL Archive Maintenance

Archived WAL files accumulate continuously and must be cleaned up to prevent
disk exhaustion.

### Automatic Cleanup

A cleanup script is provided at `docker/scripts/wal-archive-cleanup.sh`. It
removes WAL files older than `WAL_ARCHIVE_RETENTION_DAYS` (default: 7 days).

Run it manually from the postgres container (which has read-write access):

```bash
docker exec staffora-postgres /bin/bash -c '
  WAL_ARCHIVE_RETENTION_DAYS=7
  find /wal-archive -maxdepth 1 -type f -name "0*" -mtime +$WAL_ARCHIVE_RETENTION_DAYS -delete
'
```

### Monitoring Archive Size

```bash
docker exec staffora-postgres du -sh /wal-archive/
docker exec staffora-postgres find /wal-archive/ -maxdepth 1 -type f -name '0*' | wc -l
```

A typical WAL segment is 16 MB. Under moderate write load, expect roughly:
- 100 segments/day = ~1.6 GB/day
- 7-day retention = ~11 GB

Adjust `WAL_ARCHIVE_RETENTION_DAYS` and the `max_wal_size` setting if disk space
is constrained. Never set WAL retention shorter than the pg_dump backup interval
(daily by default), or you will lose the ability to recover between backups.

---

## Recovery Procedures

> **WARNING:** Recovery replaces the current database contents. Always take a
> fresh backup before attempting recovery if the current database still has
> valuable data.

### Prerequisites

- Access to the backup volume (`backup_data`) containing at least one pg_dump
- Access to the WAL archive volume (`postgres_wal_archive`)
- The `postgres:16` Docker image
- Sufficient disk space for the restored database

### Scenario A: Restore to the Latest State

Use this when the database is corrupted or the data volume is lost, and you want
to recover as much data as possible.

**Step 1: Stop the application**

```bash
docker compose -f docker/docker-compose.yml stop api worker web
```

**Step 2: Stop PostgreSQL**

```bash
docker compose -f docker/docker-compose.yml stop postgres
```

**Step 3: Back up the current (damaged) data directory**

```bash
# Create a safety copy in case you need it later
docker run --rm \
  -v staffora_postgres_data:/data:ro \
  -v $(pwd)/docker/backups:/backup \
  postgres:16 \
  tar czf /backup/damaged_data_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

**Step 4: Clear the data directory**

```bash
docker run --rm \
  -v staffora_postgres_data:/data \
  postgres:16 \
  bash -c 'rm -rf /data/*'
```

**Step 5: Initialize a fresh PostgreSQL instance and restore the base backup**

```bash
# Find the most recent base backup
ls -lt docker/backups/staffora_hris_*.sql.gz | head -1

# Initialize a fresh data directory
docker run --rm \
  -v staffora_postgres_data:/var/lib/postgresql/data \
  -e POSTGRES_USER=hris \
  -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  -e POSTGRES_DB=hris \
  postgres:16 \
  docker-entrypoint.sh postgres &

# Wait for init to complete, then stop
sleep 10
docker stop $(docker ps -q --filter ancestor=postgres:16) 2>/dev/null || true
```

**Step 6: Restore the base backup**

```bash
# Decompress and apply the base backup
gunzip -c docker/backups/staffora_hris_YYYYMMDD_HHMMSS.sql.gz | \
  docker run --rm -i \
    -v staffora_postgres_data:/var/lib/postgresql/data \
    -e PGPASSWORD="${POSTGRES_PASSWORD}" \
    postgres:16 \
    psql -U hris -d hris
```

**Step 7: Configure WAL replay**

Create a `recovery.signal` file and set the `restore_command` to read from the
WAL archive:

```bash
docker run --rm \
  -v staffora_postgres_data:/var/lib/postgresql/data \
  -v staffora_postgres_wal_archive:/wal-archive:ro \
  postgres:16 \
  bash -c '
    touch /var/lib/postgresql/data/recovery.signal
    cat >> /var/lib/postgresql/data/postgresql.auto.conf <<CONF
restore_command = '"'"'cp /wal-archive/%f %p'"'"'
recovery_target = '"'"'immediate'"'"'
recovery_target_action = '"'"'promote'"'"'
CONF
  '
```

**Step 8: Start PostgreSQL with WAL replay**

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

PostgreSQL will:
1. Start in recovery mode
2. Read WAL segments from `/wal-archive/` via the `restore_command`
3. Replay all transactions up to the latest available WAL
4. Promote itself to a read-write primary when recovery completes

**Step 9: Verify recovery**

```bash
docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT pg_is_in_recovery();
  -- Should return 'f' (false) after recovery completes
"

docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT count(*) FROM app.employees;
"
```

**Step 10: Clean up recovery configuration**

After verifying the database is healthy, remove the recovery settings from
`postgresql.auto.conf`:

```bash
docker exec staffora-postgres psql -U hris -d hris -c "
  ALTER SYSTEM RESET restore_command;
  ALTER SYSTEM RESET recovery_target;
  ALTER SYSTEM RESET recovery_target_action;
"

# Remove the recovery.signal file (it is already gone after promotion, but
# clean up just in case)
docker exec staffora-postgres rm -f /var/lib/postgresql/data/recovery.signal
```

**Step 11: Restart the application**

```bash
docker compose -f docker/docker-compose.yml up -d
```

---

### Scenario B: Restore to a Specific Point in Time

Use this when you need to recover to a moment before a destructive operation
(e.g., accidental mass deletion or a bad migration).

The procedure is identical to Scenario A, except Step 7 uses a timestamp
instead of `recovery_target = 'immediate'`:

```bash
docker run --rm \
  -v staffora_postgres_data:/var/lib/postgresql/data \
  -v staffora_postgres_wal_archive:/wal-archive:ro \
  postgres:16 \
  bash -c '
    touch /var/lib/postgresql/data/recovery.signal
    cat >> /var/lib/postgresql/data/postgresql.auto.conf <<CONF
restore_command = '"'"'cp /wal-archive/%f %p'"'"'
recovery_target_time = '"'"'2026-03-17 14:30:00 UTC'"'"'
recovery_target_action = '"'"'promote'"'"'
CONF
  '
```

Replace `2026-03-17 14:30:00 UTC` with the desired recovery timestamp in UTC.

> **Tip:** To find the right timestamp, check the application audit logs, the
> domain_outbox table in a recent pg_dump, or the PostgreSQL server logs.

All other steps (1-6, 8-11) remain the same.

---

### Scenario C: Restore a Single Table

If only one table was damaged, you can restore the base backup into a temporary
database and copy just the affected table.

**Step 1: Create a temporary database**

```bash
docker exec staffora-postgres psql -U hris -c "CREATE DATABASE hris_recovery;"
```

**Step 2: Restore the base backup into the temporary database**

```bash
gunzip -c docker/backups/staffora_hris_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i staffora-postgres psql -U hris -d hris_recovery
```

**Step 3: Copy the table from the recovery database**

```bash
docker exec staffora-postgres psql -U hris -d hris -c "
  -- Clear the damaged table
  TRUNCATE app.affected_table;

  -- Copy from recovery database
  INSERT INTO app.affected_table
  SELECT * FROM dblink(
    'dbname=hris_recovery user=hris',
    'SELECT * FROM app.affected_table'
  ) AS t(/* column definitions matching the table schema */);
"
```

Alternatively, use `pg_dump` with `--table` to dump just one table from the
recovery database:

```bash
docker exec staffora-postgres pg_dump -U hris -d hris_recovery \
  --table=app.affected_table --data-only | \
  docker exec -i staffora-postgres psql -U hris -d hris
```

**Step 4: Drop the temporary database**

```bash
docker exec staffora-postgres psql -U hris -c "DROP DATABASE hris_recovery;"
```

---

## Testing Recovery

Recovery procedures must be tested regularly to ensure they work when needed.
Schedule a recovery drill at least quarterly.

### Recovery Drill Checklist

1. **Take a manual base backup**
   ```bash
   docker exec staffora-backup /scripts/backup-db.sh /backups
   ```

2. **Record the current state**
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c "
     SELECT count(*) AS employee_count FROM app.employees;
     SELECT now() AS current_time;
   "
   ```

3. **Insert test data after the backup**
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c "
     SELECT app.enable_system_context();
     INSERT INTO app.audit_log (id, tenant_id, user_id, action, resource_type, resource_id, created_at)
     VALUES (gen_random_uuid(), (SELECT id FROM app.tenants LIMIT 1),
             gen_random_uuid(), 'recovery_drill_marker', 'system', 'drill',
             now());
     SELECT app.disable_system_context();
   "
   ```

4. **Force a WAL switch** to ensure the test data is archived
   ```bash
   docker exec staffora-postgres psql -U hris -d hris -c "SELECT pg_switch_wal();"
   ```

5. **Perform the recovery** following Scenario A or B above (use a separate
   Docker volume or a different host to avoid disrupting production)

6. **Verify the recovery** includes the test data (the `recovery_drill_marker`
   audit log entry)

7. **Document the result** including recovery time and any issues encountered

---

## Production Considerations

### Disk Space Planning

| Factor | Typical Size | Notes |
|--------|-------------|-------|
| WAL segment | 16 MB each | Fixed size |
| WAL generation rate | 50-200 segments/day | Depends on write load |
| 7-day WAL retention | 5-22 GB | Monitor and adjust |
| Daily pg_dump | 100 MB - 5 GB | Depends on database size |
| 7-day dump retention | 700 MB - 35 GB | Compressed |

Monitor the `postgres_wal_archive` volume size and alert if it exceeds 80%
of available disk.

### Offsite WAL Archiving

For production environments, consider:

1. **S3-based archive_command**: Replace the local `cp` with an S3 upload.
   This requires installing the AWS CLI in the postgres container or using a
   custom image.

2. **WAL-G or pgBackRest**: Purpose-built tools that handle WAL archiving,
   base backups, compression, encryption, and S3/GCS/Azure upload in a single
   integrated tool. These are recommended for production deployments with
   strict RPO/RTO requirements.

3. **Managed PostgreSQL (RDS, Cloud SQL, Azure Database)**: These services
   handle WAL archiving and PITR automatically. If using a managed service,
   the Docker-based WAL archiving documented here is not needed.

### High Availability

WAL archiving is **not** a replacement for replication. For high availability:

- Use `wal_level = replica` (already configured) with streaming replication
  to a standby server
- WAL archiving serves as a fallback for disaster recovery when the standby
  is also unavailable

### Security

- The WAL archive contains all database changes including sensitive data
  (PII, credentials, etc.)
- Ensure the `postgres_wal_archive` volume has appropriate file permissions
- If copying WAL files offsite (S3), enable server-side encryption (SSE)
- Include WAL archive volumes in your data retention and GDPR compliance
  policies

---

## Troubleshooting

### WAL archiving is not working (failed_count > 0)

```bash
# Check the last failure
docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT last_failed_wal, last_failed_time FROM pg_stat_archiver;
"

# Check PostgreSQL logs for archive_command errors
docker logs staffora-postgres 2>&1 | grep -i 'archive'
```

Common causes:
- `/wal-archive/` directory does not exist or has wrong permissions
- Volume mount is missing in docker-compose.yml
- Disk full on the archive volume

### WAL archive is growing too fast

```bash
# Check current size
docker exec staffora-postgres du -sh /wal-archive/

# Check write rate
docker exec staffora-postgres psql -U hris -d hris -c "
  SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') / (1024*1024*1024) AS wal_generated_gb;
"
```

Solutions:
- Reduce `archive_timeout` if most segments are partially filled
- Increase `WAL_ARCHIVE_RETENTION_DAYS` cleanup frequency
- Investigate application write patterns for unnecessary bulk operations

### Recovery hangs or does not complete

- Check PostgreSQL logs: `docker logs staffora-postgres`
- Verify that all required WAL segments are present in the archive
- If a WAL segment is missing, recovery cannot proceed past that gap
- Use `pg_waldump` to inspect WAL contents:
  ```bash
  docker exec staffora-postgres pg_waldump /wal-archive/000000010000000000000001
  ```

### Cannot find the right recovery timestamp

- Check `app.audit_log` in the most recent pg_dump for operation timestamps
- Check `app.domain_outbox` for event timestamps
- Check PostgreSQL server logs (`docker logs staffora-postgres`) for
  transaction timestamps

---

## Related Documentation

- [Production Checklist](production-checklist.md) -- Pre-launch readiness items
- [Production Readiness Report](production-readiness-report.md) -- Platform maturity assessment
- [Deployment Guide](../guides/DEPLOYMENT.md) -- Docker Compose deployment instructions
- [Database Architecture](../architecture/DATABASE.md) -- Schema, migrations, RLS
- [Database Guide](../architecture/database-guide.md) -- Query patterns, roles, performance
- `docker/postgres/postgresql.conf` -- PostgreSQL configuration (WAL archiving settings)
- `docker/scripts/backup-db.sh` -- Daily pg_dump backup script
- `docker/scripts/restore-db.sh` -- Simple restore from pg_dump
- `docker/scripts/wal-archive-cleanup.sh` -- WAL archive retention cleanup
