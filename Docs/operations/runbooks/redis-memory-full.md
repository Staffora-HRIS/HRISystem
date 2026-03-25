# Redis Memory Full

**Severity: P1 - Critical**
**Affected Components:** Redis 7, Elysia.js API, Background Worker, Session Management

## Symptoms / Detection

- Redis logs show `OOM command not allowed when used memory > 'maxmemory'`.
- API returns errors for cached data lookups, session validation, or rate limiting.
- Rate limiting stops working (all requests pass or all requests are blocked).
- Worker processes fail to publish or consume from Redis Streams.
- Idempotency checks fail, allowing duplicate writes.
- `redis-cli INFO memory` shows `used_memory` near or at `maxmemory`.

### Monitoring Commands

```bash
# Check Redis memory usage
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO memory

# Check maxmemory setting
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory

# Check eviction policy
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory-policy

# Check key count per database
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO keyspace
```

## Impact Assessment

- **User Impact:** Degraded performance. Session lookups may fail, forcing re-authentication. Rate limiting is unreliable.
- **Data Impact:** Cache data may be evicted. Redis Streams may reject new entries, causing outbox events to queue in PostgreSQL.
- **Downstream:** Idempotency keys may not be stored, risking duplicate API operations. Worker event processing halts.

## Immediate Actions

### Step 1: Confirm Memory Usage

```bash
# Get memory breakdown
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO memory | grep -E 'used_memory_human|maxmemory_human|mem_fragmentation_ratio'
```

### Step 2: Identify Large Key Patterns

```bash
# Scan for large keys (non-blocking, uses SCAN internally)
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --bigkeys

# Check memory usage of specific key patterns
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning MEMORY USAGE "stream:domain-events"
```

### Step 3: Trim Redis Streams

Redis Streams used by the worker system can grow unbounded if trimming fails.

```bash
# Check stream lengths
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XLEN stream:domain-events
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XLEN stream:notifications
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XLEN stream:exports

# Trim streams to last 10,000 entries
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XTRIM stream:domain-events MAXLEN ~ 10000
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XTRIM stream:notifications MAXLEN ~ 10000
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XTRIM stream:exports MAXLEN ~ 10000
```

### Step 4: Flush Expired Cache Keys

```bash
# Trigger lazy expiration by scanning keys (safe, non-destructive)
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "cache:*" | head -100

# If safe to clear all cache (sessions are in PostgreSQL via Better Auth):
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EVAL "
  local cursor = '0'
  local count = 0
  repeat
    local result = redis.call('SCAN', cursor, 'MATCH', 'cache:*', 'COUNT', 1000)
    cursor = result[1]
    for _, key in ipairs(result[2]) do
      redis.call('DEL', key)
      count = count + 1
    end
  until cursor == '0'
  return count
" 0
```

### Step 5: Increase maxmemory if Needed

```bash
# Increase maxmemory at runtime (no restart required)
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG SET maxmemory 1gb

# Verify the change
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory
```

**Note:** Also update `docker/redis/redis.conf` so the change persists across restarts.

## Root Cause Investigation

### Common Causes

1. **Redis Stream Growth**
   - The worker's XTRIM is not running (worker process crashed or scheduler failed).
   - Check worker logs: `docker compose -f docker/docker-compose.yml logs --tail=50 worker`

2. **Cache Key Explosion**
   - A code change introduced cache keys without TTL, or with very long TTLs.
   - Check for keys without TTL: scan for `cache:*` keys and check `TTL` on a sample.

3. **Idempotency Key Accumulation**
   - Idempotency keys (24-72h TTL) accumulating faster than they expire during traffic spikes.

4. **Memory Fragmentation**
   - `mem_fragmentation_ratio` > 1.5 indicates significant fragmentation.
   - Restart Redis to defragment (see resolution).

### Investigation Commands

```bash
# Check keys without TTL
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EVAL "
  local cursor = '0'
  local noTtl = {}
  repeat
    local result = redis.call('SCAN', cursor, 'COUNT', 1000)
    cursor = result[1]
    for _, key in ipairs(result[2]) do
      if redis.call('TTL', key) == -1 then
        table.insert(noTtl, key)
        if #noTtl >= 20 then return noTtl end
      end
    end
  until cursor == '0'
  return noTtl
" 0

# Check stream consumer group lag
docker exec -it staffora-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning XINFO GROUPS stream:domain-events
```

## Resolution Steps

### Short-Term: Free Memory

Follow the immediate actions above (trim streams, flush expired cache, increase maxmemory).

### Long-Term: Prevent Recurrence

1. **Enforce TTL on all cache keys:** Audit the codebase for `SET` calls without `EX`/`PX`. The cache plugin in `src/plugins/cache.ts` should always set a TTL.

2. **Configure eviction policy:** Set `maxmemory-policy allkeys-lru` in `docker/redis/redis.conf` so Redis evicts least-recently-used keys instead of returning errors.

3. **Automate Stream trimming:** Ensure the worker scheduler trims all streams on a regular interval (every 5 minutes). Verify in `src/worker/scheduler.ts`.

4. **Monitor with alerts:** Add a Prometheus alert when `redis_memory_used_bytes / redis_memory_max_bytes > 0.85`.

5. **Persist maxmemory change:**

```bash
# Update docker/redis/redis.conf
# maxmemory 1gb
# maxmemory-policy allkeys-lru
```

## Post-Incident

- [ ] Verify `INFO memory` shows `used_memory` well below `maxmemory`.
- [ ] Verify Redis Streams have been trimmed (check `XLEN` for all streams).
- [ ] Verify the worker is processing events normally.
- [ ] Verify API health check returns 200 with cache operational.
- [ ] Verify rate limiting is functioning (test with rapid requests).

## Prevention

- Set `maxmemory-policy allkeys-lru` to gracefully handle memory pressure.
- Enforce TTL on all cache keys in application code; reject PRs that omit TTL.
- Schedule regular Redis Stream trimming in the worker scheduler.
- Alert when memory usage exceeds 85% of maxmemory.
- Size `maxmemory` to at least 2x the expected working set.
