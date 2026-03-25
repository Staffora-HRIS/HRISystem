# [ARCHITECTURE] Cache Invalidation Uses Redis KEYS Command (Blocks Server)

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** MEDIUM
**Labels:** bug, performance
**Effort:** SMALL

## Description
The `invalidateTenantCache()` method uses `this.redis.keys(pattern)` to find all cache keys for a tenant. The Redis `KEYS` command blocks the Redis server and scans all keys. In production with many tenants and cache entries, this will cause latency spikes or timeouts for all Redis operations. The Redis documentation explicitly warns against using `KEYS` in production.

## Current State
- `packages/api/src/plugins/cache.ts` (lines 397-409): uses `this.redis.keys(pattern)`
- Pattern: `${prefix}t:${tenantId}:*` scans all keys

## Expected State
- `SCAN` used for iterative key matching, or
- Tenant-scoped cache keys tracked in a Redis Set for efficient invalidation

## Acceptance Criteria
- [ ] `KEYS` command replaced with `SCAN` or Set-based tracking
- [ ] Cache invalidation does not block Redis for other operations
- [ ] Performance test verifying invalidation completes within acceptable time with many keys

## Implementation Notes
Replace `KEYS` with `SCAN` using cursor-based iteration. Alternatively, track tenant cache keys in a Redis Set (`t:${tenantId}:keys`) and use `SMEMBERS` + pipeline `DEL`.

## Affected Files
- `packages/api/src/plugins/cache.ts`

## Related Issues
- None
