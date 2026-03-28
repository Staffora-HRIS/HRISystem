# Database Connection Exhaustion

*Last updated: 2026-03-28*

**Severity: P1 - Critical**
**Affected Components:** PostgreSQL 16, PgBouncer 1.23, Elysia.js API, Background Worker

## Symptoms / Detection

- API returns HTTP 500 with error messages containing "too many connections" or "connection pool timeout".
- PgBouncer logs show `no more connections allowed` or `server connection slots are full`.
- PostgreSQL logs show `FATAL: too many connections for role "hris_app"`.
- Grafana PostgreSQL dashboard shows active connections near or at `max_connections`.
- Health check endpoint (`GET /health`) fails or responds slowly.
- Worker processes log database connection errors and stop processing the outbox.

### Monitoring Queries

```bash
# Check current PostgreSQL connection count
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state ORDER BY count DESC;"

# Check max_connections setting
docker exec -it staffora-postgres psql -U hris -d hris -c "SHOW max_connections;"

# Check PgBouncer pool status
docker exec -it staffora-pgbouncer psql -h 127.0.0.1 -p 6432 -U hris pgbouncer -c "SHOW POOLS;"

# Check PgBouncer client count
docker exec -it staffora-pgbouncer psql -h 127.0.0.1 -p 6432 -U hris pgbouncer -c "SHOW CLIENTS;"
```

## Impact Assessment

- **User Impact:** All API requests fail. Users see error pages or timeouts. No data can be read or written.
- **Data Impact:** In-flight transactions may be rolled back. Outbox events stop processing but are not lost (they remain in the `domain_outbox` table).
- **Downstream:** Worker processes halt. Notifications, exports, and PDF generation queue up but do not execute.

## Immediate Actions

### Step 1: Confirm the Problem

```bash
# Check PostgreSQL connection count vs limit
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT count(*) AS total, max_conn.setting AS max
   FROM pg_stat_activity, (SELECT setting FROM pg_settings WHERE name='max_connections') max_conn
   GROUP BY max_conn.setting;"
```

### Step 2: Identify Connection Holders

```bash
# Find long-running or idle connections
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT pid, usename, application_name, client_addr, state,
          query_start, now() - query_start AS duration, left(query, 80) AS query
   FROM pg_stat_activity
   WHERE state != 'idle'
   ORDER BY duration DESC NULLS LAST
   LIMIT 20;"

# Find idle connections consuming slots
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT usename, client_addr, count(*) AS conn_count
   FROM pg_stat_activity
   GROUP BY usename, client_addr
   ORDER BY conn_count DESC;"
```

### Step 3: Kill Idle Connections

```bash
# Terminate idle connections older than 5 minutes (safe for transaction-mode PgBouncer)
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
     AND query_start < now() - interval '5 minutes'
     AND usename = 'hris_app';"
```

### Step 4: Restart PgBouncer if Stuck

```bash
# PgBouncer may have stale server connections; restart it
docker compose -f docker/docker-compose.yml restart pgbouncer

# Verify PgBouncer reconnects
docker compose -f docker/docker-compose.yml logs --tail=20 pgbouncer
```

### Step 5: Restart API Instances if Needed

```bash
# Rolling restart of API containers to reset client connection pools
docker compose -f docker/docker-compose.yml restart api

# Restart the worker
docker compose -f docker/docker-compose.yml restart worker
```

## Root Cause Investigation

### Common Causes

1. **Connection Leak in Application Code**
   - A transaction is opened but never committed or rolled back (missing `finally` block).
   - Check recent deployments for changes to `db.withTransaction()` callers.
   - Look for `BEGIN` without matching `COMMIT` or `ROLLBACK` in slow query logs.

2. **PgBouncer Pool Size Mismatch**
   - `pool_size` in `pgbouncer.ini` is too low relative to the number of API instances.
   - With 3 API replicas and `pool_size=25`, PgBouncer opens up to 75 server connections.
   - PostgreSQL `max_connections` defaults to 100; 75 + superuser + worker connections can exceed this.

3. **Long-Running Queries Holding Connections**
   - Analytics or export queries running for minutes, holding a server connection.
   - Check `pg_stat_activity` for queries with high `duration`.

4. **Scaled API Without Matching Pool Adjustment**
   - Horizontal scaling (`--scale api=N`) without reducing per-instance pool size.

### Investigation Queries

```bash
# Check for transactions stuck in "idle in transaction"
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT pid, usename, state, now() - xact_start AS tx_duration, left(query, 100) AS query
   FROM pg_stat_activity
   WHERE state = 'idle in transaction'
   ORDER BY tx_duration DESC;"

# Check PgBouncer configuration
docker exec -it staffora-pgbouncer cat /etc/pgbouncer/pgbouncer.ini | grep -E 'pool_size|max_client_conn|max_db_connections'
```

## Resolution Steps

### Short-Term: Increase Limits

```bash
# Increase PostgreSQL max_connections (requires restart)
# Edit docker/postgres/postgresql.conf:
#   max_connections = 200

# Restart PostgreSQL
docker compose -f docker/docker-compose.yml restart postgres

# Wait for health check to pass, then restart dependent services
docker compose -f docker/docker-compose.yml restart pgbouncer api worker
```

### Long-Term: Fix the Root Cause

1. **Fix connection leaks:** Ensure all `db.withTransaction()` calls handle errors and release connections. Audit recent code changes.
2. **Tune PgBouncer:** Adjust `default_pool_size` and `max_db_connections` in `docker/pgbouncer/pgbouncer.ini` to match the instance count.
3. **Add connection monitoring:** Set up a Prometheus alert when `pg_stat_activity` count exceeds 80% of `max_connections`.
4. **Set statement timeout:** Add `statement_timeout = '30s'` to `postgresql.conf` for the `hris_app` role to prevent runaway queries.

```sql
-- Set default statement timeout for the app role
ALTER ROLE hris_app SET statement_timeout = '30s';
```

## Post-Incident

- [ ] Verify all API instances are healthy (`GET /health` returns 200).
- [ ] Verify PgBouncer pool stats show normal active/idle ratios.
- [ ] Verify the worker is processing outbox events (check `domain_outbox` for unprocessed rows).
- [ ] Check Grafana dashboards for connection count returning to baseline.
- [ ] Review recent deployments for connection leak regressions.

## Prevention

- Enforce `statement_timeout` and `idle_in_transaction_session_timeout` in PostgreSQL configuration.
- Add PgBouncer `server_idle_timeout` to reclaim unused server connections.
- Include connection pool health in deployment smoke tests.
- Alert when active connection count exceeds 70% of `max_connections`.
- Document required PgBouncer pool size changes when scaling API instances.
