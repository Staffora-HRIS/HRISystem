# Disk Space Full

*Last updated: 2026-03-28*

**Severity: P2 - High**
**Affected Components:** PostgreSQL 16, Redis 7, Docker Volumes, Container Logging, WAL Archive

## Symptoms / Detection

- PostgreSQL logs `PANIC: could not write to file` or `No space left on device`.
- Docker containers fail to start with `no space left on device`.
- Redis RDB/AOF persistence fails.
- API cannot write uploaded documents to disk.
- `docker system df` shows high disk usage.
- Host system alerts on disk utilisation above 85%.

### Monitoring Commands

```bash
# Check host disk usage
df -h

# Check Docker disk usage
docker system df

# Check Docker volume sizes
docker system df -v | head -40

# Check specific volume sizes
du -sh /var/lib/docker/volumes/docker_postgres_data/_data 2>/dev/null
du -sh /var/lib/docker/volumes/docker_redis_data/_data 2>/dev/null
du -sh /var/lib/docker/volumes/docker_postgres_wal_archive/_data 2>/dev/null

# Check container log sizes
find /var/lib/docker/containers -name "*.log" -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | tail -10
```

## Impact Assessment

- **PostgreSQL:** Cannot write WAL segments, accept new data, or run VACUUM. The database will refuse writes and may crash.
- **Redis:** RDB snapshots and AOF writes fail. Data is only in memory and will be lost on restart.
- **API:** Document uploads fail. Temporary file creation fails.
- **Docker:** Cannot pull new images, create containers, or write logs.

## Immediate Actions

### Step 1: Identify the Largest Consumer

```bash
# Check what is consuming space
du -sh /var/lib/docker/volumes/*/_data 2>/dev/null | sort -h | tail -10

# Check Docker image cache
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | sort -k3 -h | tail -10

# Check for large log files
find /var/lib/docker/containers -name "*.log" -size +100M 2>/dev/null
```

### Step 2: Clean Docker Resources

```bash
# Remove unused Docker images (safe -- only removes images not used by any container)
docker image prune -f

# Remove unused build cache
docker builder prune -f

# Remove stopped containers (if any)
docker container prune -f

# Nuclear option: remove ALL unused resources (images, networks, volumes not in use)
# WARNING: This removes unused volumes too -- only use if you understand the impact
# docker system prune --volumes -f
```

### Step 3: Truncate Container Logs

Docker JSON log files can grow large. Truncating them is safe (Docker recreates the file).

```bash
# Find the largest container log files
find /var/lib/docker/containers -name "*.log" -exec ls -lh {} \; 2>/dev/null | sort -k5 -h | tail -5

# Truncate a specific container log (replace with actual path)
truncate -s 0 /var/lib/docker/containers/<container-id>/<container-id>-json.log

# Truncate all container logs
find /var/lib/docker/containers -name "*.log" -exec truncate -s 0 {} \;
```

### Step 4: Clean PostgreSQL WAL Archive

```bash
# Check WAL archive size
du -sh /var/lib/docker/volumes/docker_postgres_wal_archive/_data 2>/dev/null

# Remove WAL files older than 7 days (adjust retention as needed)
docker exec -it staffora-postgres find /wal-archive -name "*.backup" -mtime +7 -delete
docker exec -it staffora-postgres find /wal-archive -name "0000*" -mtime +7 -delete
```

### Step 5: Clean PostgreSQL Bloat

```bash
# Check table and index bloat
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT schemaname, relname, n_dead_tup, pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname))
   FROM pg_stat_user_tables
   WHERE schemaname = 'app'
   ORDER BY n_dead_tup DESC LIMIT 10;"

# Run VACUUM on the most bloated tables
docker exec -it staffora-postgres psql -U hris -d hris -c "VACUUM VERBOSE app.audit_logs;"
docker exec -it staffora-postgres psql -U hris -d hris -c "VACUUM VERBOSE app.domain_outbox;"

# VACUUM FULL reclaims disk space but locks the table (use during maintenance window)
# docker exec -it staffora-postgres psql -U hris -d hris -c "VACUUM FULL app.audit_logs;"
```

### Step 6: Archive or Purge Old Data

```bash
# Check audit log size
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT pg_size_pretty(pg_total_relation_size('app.audit_logs'));"

# Check domain outbox -- processed events can be purged
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT count(*), processed FROM app.domain_outbox GROUP BY processed;"

# Delete processed outbox events older than 30 days
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "DELETE FROM app.domain_outbox WHERE processed = true AND created_at < now() - interval '30 days';"
```

## Root Cause Investigation

### Common Causes

1. **Container Log Growth**
   - Log rotation is not configured or the `max-size` limit is too generous.
   - Staffora docker-compose.yml configures `max-size: "50m"` and `max-file: "5"` for postgres (250 MB max), but other services may differ.

2. **WAL Archive Growth**
   - Continuous archiving is enabled but old WAL files are never cleaned up.
   - A long-running replication slot prevents WAL cleanup.

3. **PostgreSQL Table Bloat**
   - `autovacuum` is not keeping up with UPDATE/DELETE-heavy tables (`audit_logs`, `domain_outbox`).

4. **Unused Docker Images**
   - Old image layers accumulate from rebuilds during development or CI.

5. **Large Document Uploads**
   - Document storage volume filling up with uploaded files.

## Resolution Steps

### Configure Log Rotation for All Services

Update `docker/docker-compose.yml` to ensure all services have log limits:

```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"
    max-file: "3"
```

### Configure PostgreSQL Autovacuum

Ensure these settings in `docker/postgres/postgresql.conf`:

```
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 30s
autovacuum_vacuum_threshold = 50
autovacuum_vacuum_scale_factor = 0.05
```

### Set Up Retention Policies

```bash
# Add a cron job to clean old data
# Processed outbox events > 30 days
0 2 * * * docker exec staffora-postgres psql -U hris -d hris -c "DELETE FROM app.domain_outbox WHERE processed = true AND created_at < now() - interval '30 days';"

# WAL files > 7 days
0 3 * * * docker exec staffora-postgres find /wal-archive -mtime +7 -delete

# Docker image cleanup weekly
0 4 * * 0 docker image prune -f
```

## Post-Incident

- [ ] Disk usage is below 70% on all volumes.
- [ ] PostgreSQL is accepting writes normally.
- [ ] Redis persistence is functioning (check `INFO persistence`).
- [ ] Docker can pull images and create containers.
- [ ] Log rotation is configured for all services.
- [ ] Data retention policies are in place for audit_logs and domain_outbox.

## Prevention

- Alert when disk utilisation exceeds 75% on any volume.
- Configure log rotation (`max-size`, `max-file`) on all Docker services.
- Set up automatic WAL archive cleanup.
- Schedule regular `VACUUM` and monitor autovacuum effectiveness.
- Implement data retention policies for audit logs, processed outbox events, and expired sessions.
- Use a separate volume or object storage (S3) for document uploads to isolate growth from system volumes.
- Monitor Docker disk usage with `docker system df` as part of daily health checks.
