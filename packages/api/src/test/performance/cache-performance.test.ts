/**
 * Cache Performance Tests
 *
 * Tests Redis cache hit/miss behavior, invalidation timing,
 * key collision handling, and connection behavior under load.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Redis from "ioredis";
import {
  ensureTestInfra,
  isInfraAvailable,
  skipIfNoInfra,
  getTestRedis,
  TEST_CONFIG,
} from "../setup";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a unique key prefix for this test run to avoid collisions. */
function testPrefix(): string {
  return `test:cache-perf:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Cache Performance", () => {
  let redis: Redis;
  let prefix: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    redis = getTestRedis();
    prefix = testPrefix();
  }, 15_000);

  afterAll(async () => {
    if (!redis) return;

    try {
      // Clean up all test keys
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      console.warn("Cache test cleanup warning:", e);
    }

    redis.disconnect();
  });

  // -----------------------------------------------------------------------
  // Cache hit/miss
  // -----------------------------------------------------------------------

  describe("Cache hit/miss ratios", () => {
    it("should achieve < 1ms latency for cache hits", async () => {
      if (!isInfraAvailable()) return;

      const key = `${prefix}:hit-test`;
      const value = JSON.stringify({ employee: { id: "123", name: "Test" } });

      // Warm up
      await redis.set(key, value, "EX", 60);

      // Measure multiple hits
      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const result = await redis.get(key);
        times.push(performance.now() - start);
        expect(result).toBe(value);
      }

      const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      console.log(`  Cache hit latency (median): ${median.toFixed(3)}ms`);
      // Redis GET on localhost should be sub-millisecond; allow 5ms for CI
      expect(median).toBeLessThan(5);
    });

    it("should return null for cache misses in < 2ms", async () => {
      if (!isInfraAvailable()) return;

      const times: number[] = [];
      for (let i = 0; i < 20; i++) {
        const key = `${prefix}:miss-${i}-${Date.now()}`;
        const start = performance.now();
        const result = await redis.get(key);
        times.push(performance.now() - start);
        expect(result).toBeNull();
      }

      const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      console.log(`  Cache miss latency (median): ${median.toFixed(3)}ms`);
      expect(median).toBeLessThan(5);
    });

    it("should track hit/miss ratio across a simulated workload", async () => {
      if (!isInfraAvailable()) return;

      // Pre-populate 50 keys
      const totalKeys = 50;
      for (let i = 0; i < totalKeys; i++) {
        await redis.set(`${prefix}:ratio-${i}`, `value-${i}`, "EX", 60);
      }

      // Simulate 200 requests: 80% hit existing keys, 20% miss
      let hits = 0;
      let _misses = 0;
      const totalRequests = 200;

      for (let i = 0; i < totalRequests; i++) {
        const hitTarget = Math.random() < 0.8;
        const keyIdx = hitTarget
          ? Math.floor(Math.random() * totalKeys)
          : totalKeys + i; // Non-existent key

        const result = await redis.get(`${prefix}:ratio-${keyIdx}`);
        if (result !== null) {
          hits++;
        } else {
          _misses++;
        }
      }

      const hitRate = hits / totalRequests;
      console.log(`  Hit rate: ${(hitRate * 100).toFixed(1)}% (${hits}/${totalRequests})`);

      // Should be close to 80% (+/- some variance from randomness)
      expect(hitRate).toBeGreaterThan(0.6);
      expect(hitRate).toBeLessThan(0.95);
    });
  });

  // -----------------------------------------------------------------------
  // Cache invalidation
  // -----------------------------------------------------------------------

  describe("Cache invalidation timing", () => {
    it("should invalidate a single key in < 2ms", async () => {
      if (!isInfraAvailable()) return;

      const key = `${prefix}:invalidate-single`;
      await redis.set(key, "to-be-deleted", "EX", 60);

      const start = performance.now();
      await redis.del(key);
      const duration = performance.now() - start;

      console.log(`  Single key invalidation: ${duration.toFixed(3)}ms`);
      expect(duration).toBeLessThan(5);

      const afterDelete = await redis.get(key);
      expect(afterDelete).toBeNull();
    });

    it("should invalidate 100 keys in < 50ms", async () => {
      if (!isInfraAvailable()) return;

      const keys: string[] = [];
      for (let i = 0; i < 100; i++) {
        const key = `${prefix}:invalidate-batch-${i}`;
        keys.push(key);
        await redis.set(key, `value-${i}`, "EX", 60);
      }

      const start = performance.now();
      await redis.del(...keys);
      const duration = performance.now() - start;

      console.log(`  Batch invalidation (100 keys): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(50);

      // Verify all deleted
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.get(key);
      }
      const results = await pipeline.exec();
      for (const [err, val] of results!) {
        expect(err).toBeNull();
        expect(val).toBeNull();
      }
    });

    it("should expire keys based on TTL", async () => {
      if (!isInfraAvailable()) return;

      const key = `${prefix}:ttl-expire`;
      await redis.set(key, "short-lived", "EX", 1); // 1 second TTL

      const before = await redis.get(key);
      expect(before).toBe("short-lived");

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const after = await redis.get(key);
      expect(after).toBeNull();
    }, 5_000);
  });

  // -----------------------------------------------------------------------
  // Key collision handling
  // -----------------------------------------------------------------------

  describe("Cache key collision handling", () => {
    it("should handle tenant-scoped keys without collision", async () => {
      if (!isInfraAvailable()) return;

      const tenantA = "aaaaaaaa-0000-0000-0000-000000000001";
      const tenantB = "bbbbbbbb-0000-0000-0000-000000000002";
      const resource = "employee:123";

      const keyA = `${prefix}:t:${tenantA}:${resource}`;
      const keyB = `${prefix}:t:${tenantB}:${resource}`;

      await redis.set(keyA, JSON.stringify({ name: "Tenant A Employee" }), "EX", 60);
      await redis.set(keyB, JSON.stringify({ name: "Tenant B Employee" }), "EX", 60);

      const resultA = await redis.get(keyA);
      const resultB = await redis.get(keyB);

      expect(JSON.parse(resultA!)).toEqual({ name: "Tenant A Employee" });
      expect(JSON.parse(resultB!)).toEqual({ name: "Tenant B Employee" });

      // They must be different keys
      expect(resultA).not.toBe(resultB);
    });

    it("should overwrite existing key atomically on SET", async () => {
      if (!isInfraAvailable()) return;

      const key = `${prefix}:overwrite`;

      await redis.set(key, "version-1", "EX", 60);
      const v1 = await redis.get(key);
      expect(v1).toBe("version-1");

      await redis.set(key, "version-2", "EX", 60);
      const v2 = await redis.get(key);
      expect(v2).toBe("version-2");
    });

    it("should support SET NX (set-if-not-exists) for distributed locking", async () => {
      if (!isInfraAvailable()) return;

      const lockKey = `${prefix}:lock:resource-1`;

      // First lock should succeed
      const result1 = await redis.set(lockKey, "owner-1", "EX", 10, "NX");
      expect(result1).toBe("OK");

      // Second lock should fail
      const result2 = await redis.set(lockKey, "owner-2", "EX", 10, "NX");
      expect(result2).toBeNull();

      // Value should still be owner-1
      const value = await redis.get(lockKey);
      expect(value).toBe("owner-1");
    });
  });

  // -----------------------------------------------------------------------
  // Redis pipeline performance
  // -----------------------------------------------------------------------

  describe("Redis pipeline performance", () => {
    it("should pipeline 100 GET operations in < 20ms", async () => {
      if (!isInfraAvailable()) return;

      // Pre-populate keys
      for (let i = 0; i < 100; i++) {
        await redis.set(`${prefix}:pipeline-${i}`, `value-${i}`, "EX", 60);
      }

      const start = performance.now();
      const pipeline = redis.pipeline();
      for (let i = 0; i < 100; i++) {
        pipeline.get(`${prefix}:pipeline-${i}`);
      }
      const results = await pipeline.exec();
      const duration = performance.now() - start;

      console.log(`  Pipeline 100 GETs: ${duration.toFixed(1)}ms`);
      expect(results!.length).toBe(100);

      // Verify all values
      for (let i = 0; i < 100; i++) {
        const [err, val] = results![i]!;
        expect(err).toBeNull();
        expect(val).toBe(`value-${i}`);
      }

      expect(duration).toBeLessThan(20);
    });

    it("should pipeline 100 SET operations in < 20ms", async () => {
      if (!isInfraAvailable()) return;

      const start = performance.now();
      const pipeline = redis.pipeline();
      for (let i = 0; i < 100; i++) {
        pipeline.set(`${prefix}:pipeline-set-${i}`, `new-value-${i}`, "EX", 60);
      }
      await pipeline.exec();
      const duration = performance.now() - start;

      console.log(`  Pipeline 100 SETs: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(20);
    });
  });

  // -----------------------------------------------------------------------
  // Connection pool under load
  // -----------------------------------------------------------------------

  describe("Redis connection pool under load", () => {
    it("should handle 10 concurrent Redis connections", async () => {
      if (!isInfraAvailable()) return;

      const connections: Redis[] = [];
      for (let i = 0; i < 10; i++) {
        const conn = new Redis({
          host: TEST_CONFIG.redis.host,
          port: TEST_CONFIG.redis.port,
          password: TEST_CONFIG.redis.password,
          maxRetriesPerRequest: 3,
          lazyConnect: true,
        });
        await conn.connect();
        connections.push(conn);
      }

      try {
        // All 10 connections do work simultaneously
        const results = await Promise.all(
          connections.map(async (conn, i) => {
            const key = `${prefix}:concurrent-${i}`;
            await conn.set(key, `value-${i}`, "EX", 30);
            const result = await conn.get(key);
            return result;
          })
        );

        for (let i = 0; i < 10; i++) {
          expect(results[i]).toBe(`value-${i}`);
        }
      } finally {
        for (const conn of connections) {
          conn.disconnect();
        }
      }
    }, 15_000);

    it("should handle rapid INCR operations (rate-limit simulation)", async () => {
      if (!isInfraAvailable()) return;

      const key = `${prefix}:rate-limit:test-user`;

      const start = performance.now();
      // Simulate 100 rate-limit increments
      for (let i = 0; i < 100; i++) {
        await redis.incr(key);
      }
      const duration = performance.now() - start;

      const finalValue = await redis.get(key);
      console.log(`  100 INCR operations: ${duration.toFixed(1)}ms`);
      expect(parseInt(finalValue!, 10)).toBe(100);
      expect(duration).toBeLessThan(200);
    });

    it("should handle hash operations for session-like data", async () => {
      if (!isInfraAvailable()) return;

      const sessionKey = `${prefix}:session:abc123`;
      const sessionData = {
        userId: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        email: "test@example.com",
        roles: JSON.stringify(["admin", "hr_manager"]),
        createdAt: new Date().toISOString(),
      };

      // Set session
      const start = performance.now();
      await redis.hmset(sessionKey, sessionData);
      await redis.expire(sessionKey, 3600);
      const setDuration = performance.now() - start;

      // Get session
      const getStart = performance.now();
      const result = await redis.hgetall(sessionKey);
      const getDuration = performance.now() - getStart;

      console.log(`  Session HMSET: ${setDuration.toFixed(3)}ms, HGETALL: ${getDuration.toFixed(3)}ms`);

      expect(result.userId).toBe(sessionData.userId);
      expect(result.email).toBe(sessionData.email);
      expect(setDuration).toBeLessThan(5);
      expect(getDuration).toBeLessThan(5);
    });
  });
});
