# PgBouncer Connection Pooler Guide

*Last updated: 2026-03-28*

PgBouncer is a lightweight connection pooler for PostgreSQL that sits between the Staffora application (API, worker) and the PostgreSQL database. It multiplexes many client connections onto a smaller number of backend PostgreSQL connections, dramatically reducing resource consumption and improving connection latency.

## Architecture Overview

```
                        Docker Network (staffora-network)
 +-----------+                                          +-------------+
 |  API (x3) |--+                                      |             |
 +-----------+  |    +------------+    pool_size=25     | PostgreSQL  |
                +--->|  PgBouncer |-------------------->|   (max 100) |
 +-----------+  |    | :6432      |    (backend conns)  |   :5432     |
 |  Worker   |--+    +------------+                     |             |
 +-----------+       max_client_conn=200                +-------------+
                     (client conns)                           ^
                                                              |
 +-----------+          Direct connection (migrations)        |
 | Migrations|------------------------------------------------+
 +-----------+       DATABASE_URL -> postgres:5432
```

### Connection Routing

| Component | Connection URL | Route | Purpose |
|-----------|---------------|-------|---------|
| API (runtime) | `DATABASE_APP_URL` | pgbouncer:6432 | All runtime queries, RLS-enforced |
| Worker (runtime) | `DATABASE_APP_URL` | pgbouncer:6432 | Outbox processing, background jobs |
| Better Auth (pg Pool) | `DATABASE_APP_URL` | pgbouncer:6432 | Session management, auth queries |
| Migrations | `DATABASE_URL` | postgres:5432 | DDL, schema changes (direct) |
| Backup sidecar | Direct | postgres:5432 | pg_dump (direct) |
| Admin/psql | Direct | postgres:5432 | Manual operations (direct) |

## Configuration

### PgBouncer Settings

Configuration file: `docker/pgbouncer/pgbouncer.ini`

| Setting | Value | Rationale |
|---------|-------|-----------|
| `pool_mode` | `transaction` | Connections returned after each TX. Safe because RLS context is set per-transaction via `set_tenant_context()`. |
| `max_client_conn` | `200` | Maximum client connections PgBouncer accepts. Supports scaled API (3+ instances) + worker. |
| `default_pool_size` | `25` | Backend PostgreSQL connections per user/database pair. |
| `min_pool_size` | `5` | Keep connections warm to avoid latency spikes on cold starts. |
| `reserve_pool_size` | `5` | Extra connections reserved for the superuser (`hris`) role. |
| `max_db_connections` | `60` | Total backend connections to PostgreSQL across all users. Leaves 40 for direct connections. |
| `max_user_connections` | `40` | Per-user backend connection limit. |
| `server_reset_query` | `DISCARD ALL` | Resets session state (search_path, prepared statements, temp tables) when returning connections to pool. Critical for multi-tenant RLS safety. |
| `server_idle_timeout` | `300` | Close idle backend connections after 5 minutes. |
| `query_timeout` | `120` | Cancel queries running longer than 2 minutes. |
| `client_idle_timeout` | `600` | Drop idle-in-transaction clients after 10 minutes. |

### User Authentication

User credentials file: `docker/pgbouncer/userlist.txt`

Two users are configured:
- `hris` -- Superuser for migrations and admin operations
- `hris_app` -- Application role with `NOBYPASSRLS` for runtime queries

**Production security:** Replace plain-text passwords with MD5 hashes:
```bash
# Generate MD5 hash for PgBouncer userlist
echo -n "md5$(echo -n 'YOUR_PASSWORD_HEREhris_app' | md5sum | cut -d' ' -f1)"
```

Format in userlist.txt: `"hris_app" "md5<hash>"`

Alternatively, use `auth_query` to look up passwords from `pg_shadow` dynamically (eliminates the need to maintain a separate password file).

## Connection Budget

### With PgBouncer (Production / Docker)

```
PostgreSQL max_connections = 100

PgBouncer backend connections:
  default_pool_size (hris_app) = 25
  default_pool_size (hris)     = 25  (if used)
  reserve_pool_size            =  5
                                ----
  Max via PgBouncer            = 60  (max_db_connections)

Direct connections (bypass PgBouncer):
  Migrations                   =  1-2
  Backup sidecar               =  1
  Admin/psql                   =  5
                                ----
  Reserved for direct          = ~40

Client-side pools (connect to PgBouncer):
  postgres.js per API instance =  10  (reduced from 20)
  pg Pool (Better Auth)        =   5
                                ----
  Per API instance             =  15
  3 API instances + 1 worker   = ~60 client connections
  PgBouncer multiplexes to     = ~25 backend connections
```

### Without PgBouncer (Local Development)

When `DATABASE_APP_URL` connects directly to PostgreSQL (port 5432), the application automatically uses larger pool sizes (max=20) and enables prepared statements.

## Prepared Statement Handling

**PgBouncer transaction mode does not support server-side prepared statements** because backend connections are reassigned between transactions. The Staffora application handles this automatically:

### postgres.js (main DB driver)

When the connection URL targets port 6432 (or `PGBOUNCER_ENABLED=true`), the `DatabaseClient` constructor sets `prepare: false`:

```typescript
// packages/api/src/plugins/db.ts
this.sql = postgres({
  // ...
  prepare: config.prepare,  // false when via PgBouncer
});
```

Detection is automatic based on port number:
- Port 6432 (PgBouncer default) -> `prepare: false`
- Port 5432 (PostgreSQL default) -> `prepare: true`
- `PGBOUNCER_ENABLED=true` env var -> `prepare: false` (override)

### pg Pool (Better Auth)

The `pg` library uses unnamed prepared statements by default (the extended query protocol with `$1`, `$2` placeholders). PgBouncer handles unnamed prepared statements correctly even in transaction mode. Named prepared statements (with a `name` property in query config) would cause issues, but Better Auth does not use them.

## Multi-Tenant RLS Safety

PgBouncer's `server_reset_query = DISCARD ALL` ensures that when a connection is returned to the pool, all session state is cleared. This includes:

- `search_path` -- Reset to server default
- GUC variables (`app.current_tenant`, `app.current_user`, `app.system_context`) -- Cleared
- Temporary tables -- Dropped
- Prepared statements -- Deallocated

Combined with the fact that `set_tenant_context()` is called inside every transaction (before any query), there is no risk of tenant context leaking between requests, even when connections are reused across different tenants.

## Docker Compose Service

```yaml
pgbouncer:
  image: edoburu/pgbouncer:1.23.1
  container_name: staffora-pgbouncer
  restart: unless-stopped
  ports:
    - "${PGBOUNCER_PORT:-6432}:6432"
  volumes:
    - ./pgbouncer/pgbouncer.ini:/etc/pgbouncer/pgbouncer.ini:ro
    - ./pgbouncer/userlist.txt:/etc/pgbouncer/userlist.txt:ro
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -h 127.0.0.1 -p 6432 -U hris_app -d hris"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 5s
```

## Operations

### Viewing Pool Statistics

Connect to the PgBouncer admin console:

```bash
# From the host
docker exec -it staffora-pgbouncer psql -h 127.0.0.1 -p 6432 -U hris pgbouncer

# Or from any container on the staffora-network
psql -h pgbouncer -p 6432 -U hris pgbouncer
```

Useful admin commands:

```sql
-- Show pool statistics (connections, queries, bytes)
SHOW POOLS;

-- Show active client connections
SHOW CLIENTS;

-- Show active server (backend) connections
SHOW SERVERS;

-- Show per-database statistics
SHOW STATS;

-- Show configuration
SHOW CONFIG;

-- Show memory usage
SHOW MEM;

-- Reload configuration without restart
RELOAD;
```

### Monitoring Key Metrics

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| `cl_active` | `SHOW POOLS` | > 150 (75% of max_client_conn) |
| `sv_active` | `SHOW POOLS` | > 50 (83% of max_db_connections) |
| `cl_waiting` | `SHOW POOLS` | > 0 for more than 30s |
| `avg_query_time` | `SHOW STATS` | > 500ms |
| `total_query_count` | `SHOW STATS` | Monitor for anomalies |

### Reloading Configuration

To apply changes to `pgbouncer.ini` without restarting:

```bash
# Option 1: Docker exec
docker exec staffora-pgbouncer kill -HUP 1

# Option 2: Admin console
docker exec -it staffora-pgbouncer psql -h 127.0.0.1 -p 6432 -U hris pgbouncer -c "RELOAD;"
```

Note: Changes to `userlist.txt` also take effect on reload. Changes to `pool_mode` require a full restart.

### Graceful Restart

```bash
# Pause new connections, wait for active queries to complete, then restart
docker compose -f docker/docker-compose.yml restart pgbouncer
```

### Troubleshooting

**Symptom: "no more connections allowed"**

PgBouncer has hit `max_client_conn`. Check for:
- Connection leaks in the application (connections not being returned to pool)
- Too many API replicas without adjusting pool sizes
- Slow queries holding connections open

```sql
-- Check who is using connections
SHOW CLIENTS;
SHOW POOLS;
```

**Symptom: "prepared statement does not exist"**

The application is using named prepared statements through PgBouncer. Verify:
- `DATABASE_APP_URL` port is 6432 (detected automatically)
- Or set `PGBOUNCER_ENABLED=true` in the environment
- Check logs for `[DB] PgBouncer detected (port=6432) -- prepared statements disabled`

**Symptom: "server closed the connection unexpectedly"**

PgBouncer's `server_idle_timeout` may be too aggressive for long-running queries. Check:
- `query_timeout` in pgbouncer.ini (default: 120s)
- PostgreSQL `statement_timeout` setting
- Application query performance

**Symptom: Tenant data leaking between requests**

This should never happen if `server_reset_query = DISCARD ALL` is set. Verify:
1. `SHOW CONFIG;` and check `server_reset_query`
2. Application calls `set_tenant_context()` inside every transaction
3. RLS policies are correctly defined on all tenant-owned tables

## Production Hardening Checklist

- [ ] Replace plain-text passwords in `userlist.txt` with MD5 hashes (or use `auth_query`)
- [ ] Enable TLS between clients and PgBouncer if PgBouncer is exposed outside Docker network
- [ ] Enable TLS between PgBouncer and PostgreSQL if on separate hosts
- [ ] Set up Prometheus metrics exporter for PgBouncer (e.g., pgbouncer_exporter)
- [ ] Configure alerting on `cl_waiting > 0` (clients waiting for connections)
- [ ] Configure alerting on `sv_active` approaching `max_db_connections`
- [ ] Review and tune `default_pool_size` based on actual production load
- [ ] Consider `auth_query` instead of `userlist.txt` for password rotation

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PGBOUNCER_PORT` | `6432` | Host port for PgBouncer |
| `PGBOUNCER_ENABLED` | Auto-detected | Force PgBouncer mode (disables prepared statements) |
| `DATABASE_APP_URL` | (required) | Connection URL routed through PgBouncer in Docker |
| `DATABASE_URL` | (required) | Direct PostgreSQL connection for migrations |
| `DB_MAX_CONNECTIONS` | `10` (PgBouncer) / `20` (direct) | postgres.js pool size |

## Related Documentation

- [production-checklist.md](production-checklist.md) -- Production deployment checklist
- [Docs/architecture/DATABASE.md](../architecture/DATABASE.md) -- Database schema and RLS documentation
- [Docs/architecture/database-guide.md](../architecture/database-guide.md) -- Database deep-dive
- `docker/pgbouncer/pgbouncer.ini` -- PgBouncer configuration file
- `docker/pgbouncer/userlist.txt` -- PgBouncer user credentials
- `packages/api/src/plugins/db.ts` -- Database plugin with PgBouncer detection
