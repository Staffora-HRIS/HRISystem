# API 5xx Spike

**Severity: P1 - Critical**
**Affected Components:** Elysia.js API, nginx Reverse Proxy, PostgreSQL, Redis

## Symptoms / Detection

- Monitoring shows elevated HTTP 5xx error rate (above 1% of total requests).
- Grafana API dashboard shows spike in error responses.
- Users report "Something went wrong" errors or blank pages.
- nginx access logs show increased 502 (Bad Gateway) or 504 (Gateway Timeout) responses.
- Prometheus alert `api_error_rate_5xx > 0.01` fires.

### Quick Check

```bash
# Check nginx error logs for upstream failures
docker compose -f docker/docker-compose.yml logs --tail=50 nginx | grep -E '5[0-9]{2}'

# Check API container logs for errors
docker compose -f docker/docker-compose.yml logs --tail=100 api | grep -iE 'error|fatal|exception|unhandled'

# Check if API containers are running
docker compose -f docker/docker-compose.yml ps api

# Hit the health endpoint directly
curl -s http://localhost:3000/health | jq .
```

## Impact Assessment

- **User Impact:** Users experience errors on some or all pages. Data entry may fail, causing frustration and potential data loss for unsaved forms.
- **Data Impact:** Failed writes are rolled back by PostgreSQL transactions. Outbox events for failed requests are not created (no orphaned events).
- **Downstream:** If the cause is database-related, the worker may also be affected.

## Immediate Actions

### Step 1: Determine the Scope

```bash
# Check if ALL requests fail or only specific routes
# Review the last 200 API log lines for patterns
docker compose -f docker/docker-compose.yml logs --tail=200 api 2>&1 | grep -oP '"statusCode":\d+' | sort | uniq -c | sort -rn

# Check if the error is specific to one tenant
docker compose -f docker/docker-compose.yml logs --tail=200 api 2>&1 | grep '"statusCode":5' | grep -oP '"tenantId":"[^"]*"' | sort | uniq -c | sort -rn
```

### Step 2: Check Upstream Dependencies

```bash
# PostgreSQL health
docker exec -it staffora-postgres pg_isready -U hris -d hris

# PgBouncer health
docker exec -it staffora-pgbouncer psql -h 127.0.0.1 -p 6432 -U hris pgbouncer -c "SHOW POOLS;" 2>/dev/null || echo "PgBouncer unreachable"

# Redis health
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning PING

# Check container resource usage
docker stats --no-stream staffora-postgres staffora-redis staffora-pgbouncer
```

### Step 3: Check for OOM or Crash Loops

```bash
# Check if API containers are restarting
docker compose -f docker/docker-compose.yml ps api --format json | jq '.[] | {Name, State, Health, Status}'

# Check container restart count
docker inspect --format='{{.RestartCount}}' $(docker compose -f docker/docker-compose.yml ps -q api)

# Check for OOM kills
docker inspect --format='{{.State.OOMKilled}}' $(docker compose -f docker/docker-compose.yml ps -q api)

# Check host memory
free -h
```

### Step 4: Restart API if Unresponsive

```bash
# Rolling restart of API containers
docker compose -f docker/docker-compose.yml restart api

# Verify health after restart
sleep 5
curl -s http://localhost:3000/health | jq .
```

### Step 5: Enable Detailed Logging (if cause unclear)

```bash
# Set LOG_LEVEL to debug temporarily (Pino logger in the API)
docker compose -f docker/docker-compose.yml exec api sh -c 'export LOG_LEVEL=debug'

# Or restart with debug logging
LOG_LEVEL=debug docker compose -f docker/docker-compose.yml up -d api
```

## Root Cause Investigation

### Common Causes

1. **Database Connection Exhaustion**
   - See [Database Connection Exhaustion](database-connection-exhaustion.md) runbook.
   - Check `pg_stat_activity` and PgBouncer pool status.

2. **Unhandled Exception in Application Code**
   - A recent deployment introduced a bug that throws on certain inputs.
   - Check if the error is in a specific module by examining the request path in logs.
   - Review the `errorsPlugin` in `src/plugins/errors.ts` -- unhandled errors should be caught here.

3. **Redis Unavailable**
   - Rate limiting, caching, and idempotency depend on Redis. If Redis is down, these middleware layers throw.
   - See [Redis Memory Full](redis-memory-full.md) runbook.

4. **Upstream Timeout**
   - nginx returns 504 when the API takes too long to respond.
   - Check for slow database queries in `pg_stat_activity`.

5. **Memory Leak in API Process**
   - Bun process growing in memory until OOM killed by Docker.
   - Check `docker stats` for memory usage trend.

6. **Bad Migration**
   - A recent migration altered a table or index in a way that breaks queries.
   - Check if the error started immediately after a deployment.

### Investigation Queries

```bash
# Find the most common error messages
docker compose -f docker/docker-compose.yml logs --tail=500 api 2>&1 | grep '"statusCode":5' | grep -oP '"message":"[^"]*"' | sort | uniq -c | sort -rn | head -10

# Find the most erroring endpoints
docker compose -f docker/docker-compose.yml logs --tail=500 api 2>&1 | grep '"statusCode":5' | grep -oP '"path":"[^"]*"' | sort | uniq -c | sort -rn | head -10

# Check for slow queries currently running
docker exec -it staffora-postgres psql -U hris -d hris -c \
  "SELECT pid, now() - query_start AS duration, left(query, 120) AS query
   FROM pg_stat_activity
   WHERE state = 'active' AND query_start < now() - interval '5 seconds'
   ORDER BY duration DESC;"
```

## Resolution Steps

### If Caused by Bad Deployment

```bash
# Roll back to the previous Docker image
docker compose -f docker/docker-compose.yml pull api  # if using a registry
docker compose -f docker/docker-compose.yml up -d api

# Or revert to a specific image tag
# Edit docker-compose.yml or override:
# api:
#   image: staffora/api:previous-tag
```

### If Caused by Database Issue

Follow the [Database Connection Exhaustion](database-connection-exhaustion.md) or [Database Migration Failure](database-migration-failure.md) runbook as appropriate.

### If Caused by Redis Issue

Follow the [Redis Memory Full](redis-memory-full.md) runbook.

### If Caused by Application Bug

1. Identify the failing endpoint from logs.
2. Check the corresponding module in `packages/api/src/modules/`.
3. If a hotfix is needed, deploy it through the standard CI/CD pipeline.
4. If the fix is not immediately available, consider disabling the affected route behind a feature flag or returning a maintenance response.

## Post-Incident

- [ ] Error rate returned to baseline (below 0.1%).
- [ ] Health check endpoint returns 200 consistently.
- [ ] No containers in restart loops.
- [ ] Worker processing outbox events normally.
- [ ] Review Grafana dashboards for 30 minutes to confirm stability.
- [ ] If a deployment caused the issue, add a regression test.

## Prevention

- Require canary deployments or staged rollouts for production releases.
- Add integration tests that exercise error paths, not just happy paths.
- Set up error rate alerts at 0.5% threshold for early warning.
- Maintain structured logging (Pino JSON) so errors are searchable in Loki.
- Enforce request timeouts in nginx (`proxy_read_timeout`, `proxy_connect_timeout`).
- Review and load-test before deploying database-heavy features.
