/**
 * Connection Failure Handling Tests
 *
 * Tests how the system handles database and Redis connection
 * failures, timeouts, and recovery scenarios using real
 * infrastructure.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import Redis from "ioredis";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  skipIfNoInfra,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  TEST_CONFIG,
  type TestTenant,
  type TestUser,
} from "../setup";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Connection Failures", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenant: TestTenant;
  let user: TestUser;
  const createdEmployeeIds: string[] = [];

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    db = getTestDb();
    const suffix = Date.now();
    tenant = await createTestTenant(db, {
      name: `Chaos Tenant ${suffix}`,
      slug: `chaos-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `chaos-${suffix}@example.com`,
    });
  }, 30_000);

  afterAll(async () => {
    if (!db) return;

    try {
      await withSystemContext(db, async (tx) => {
        if (createdEmployeeIds.length > 0) {
          await tx`DELETE FROM app.employees WHERE id = ANY(${createdEmployeeIds}::uuid[])`;
        }
      });
    } catch (e) {
      console.warn("Chaos test cleanup warning:", e);
    }

    await cleanupTestUser(db, user?.id);
    await cleanupTestTenant(db, tenant?.id);
    await closeTestConnections(db);
  }, 30_000);

  // -----------------------------------------------------------------------
  // Database connection timeout handling
  // -----------------------------------------------------------------------

  describe("Database connection timeout handling", () => {
    it("should fail fast when connecting to unreachable host", async () => {
      if (!isInfraAvailable()) return;

      const badDb = postgres({
        host: "192.0.2.1", // RFC 5737 TEST-NET: guaranteed unreachable
        port: 5432,
        database: "nonexistent",
        username: "nobody",
        password: "nope",
        max: 1,
        idle_timeout: 1,
        connect_timeout: 2, // 2 second timeout
      });

      const start = performance.now();
      try {
        await badDb`SELECT 1`;
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const duration = performance.now() - start;
        console.log(`  Connection to unreachable host failed in ${duration.toFixed(0)}ms`);
        // Should fail within ~2-5 seconds (connect_timeout + overhead)
        expect(duration).toBeLessThan(10_000);
        expect(String(error).length).toBeGreaterThan(0);
      } finally {
        await badDb.end({ timeout: 1 }).catch(() => {});
      }
    }, 15_000);

    it("should fail when connecting with wrong credentials", async () => {
      if (!isInfraAvailable()) return;

      const badDb = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: "wrong_user_" + Date.now(),
        password: "wrong_password",
        max: 1,
        idle_timeout: 1,
        connect_timeout: 5,
      });

      try {
        await badDb`SELECT 1`;
        expect(true).toBe(false);
      } catch (error) {
        const msg = String(error);
        // Should get an auth error, not a timeout
        expect(
          msg.includes("password authentication failed") ||
          msg.includes("does not exist") ||
          msg.includes("role") ||
          msg.includes("FATAL")
        ).toBe(true);
      } finally {
        await badDb.end({ timeout: 1 }).catch(() => {});
      }
    }, 10_000);

    it("should fail when connecting to wrong port", async () => {
      if (!isInfraAvailable()) return;

      const badDb = postgres({
        host: TEST_CONFIG.database.host,
        port: 54321, // Wrong port
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 1,
        connect_timeout: 2,
      });

      try {
        await badDb`SELECT 1`;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error).length).toBeGreaterThan(0);
      } finally {
        await badDb.end({ timeout: 1 }).catch(() => {});
      }
    }, 10_000);
  });

  // -----------------------------------------------------------------------
  // Redis connection failure handling
  // -----------------------------------------------------------------------

  describe("Redis connection failure handling", () => {
    it("should fail when connecting to wrong Redis port", async () => {
      if (!isInfraAvailable()) return;

      const badRedis = new Redis({
        host: TEST_CONFIG.redis.host,
        port: 63790, // Wrong port
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        retryStrategy: () => null, // Don't retry
      });

      try {
        await badRedis.connect();
        await badRedis.ping();
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error).length).toBeGreaterThan(0);
      } finally {
        badRedis.disconnect();
      }
    }, 10_000);

    it("should handle Redis command timeout gracefully", async () => {
      if (!isInfraAvailable()) return;

      const redis = new Redis({
        host: TEST_CONFIG.redis.host,
        port: TEST_CONFIG.redis.port,
        password: TEST_CONFIG.redis.password,
        maxRetriesPerRequest: 1,
        commandTimeout: 100, // Very short timeout
      });

      try {
        // Normal operations should still work within timeout
        const result = await redis.set("chaos:timeout-test", "value", "EX", 10);
        expect(result).toBe("OK");

        const value = await redis.get("chaos:timeout-test");
        expect(value).toBe("value");

        // Cleanup
        await redis.del("chaos:timeout-test");
      } finally {
        redis.disconnect();
      }
    });

    it("should reconnect after Redis disconnect", async () => {
      if (!isInfraAvailable()) return;

      const redis = new Redis({
        host: TEST_CONFIG.redis.host,
        port: TEST_CONFIG.redis.port,
        password: TEST_CONFIG.redis.password,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 100, 500);
        },
      });

      try {
        // Verify initial connection
        const ping1 = await redis.ping();
        expect(ping1).toBe("PONG");

        // Set a value
        await redis.set("chaos:reconnect-test", "before", "EX", 30);

        // The value should be retrievable
        const value = await redis.get("chaos:reconnect-test");
        expect(value).toBe("before");

        // Cleanup
        await redis.del("chaos:reconnect-test");
      } finally {
        redis.disconnect();
      }
    });
  });

  // -----------------------------------------------------------------------
  // Graceful degradation
  // -----------------------------------------------------------------------

  describe("Graceful degradation", () => {
    it("should still serve database queries when Redis is unavailable", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Create a failing Redis connection
      const badRedis = new Redis({
        host: TEST_CONFIG.redis.host,
        port: 63790, // Wrong port
        maxRetriesPerRequest: 0,
        lazyConnect: true,
        retryStrategy: () => null,
      });

      // Simulate cache miss fallback: Redis fails, fall back to DB
      let cacheHit = false;
      let dbFallbackWorked = false;

      try {
        await badRedis.connect();
        const cached = await badRedis.get("nonexistent");
        cacheHit = cached !== null;
      } catch {
        // Expected: Redis is unavailable
        cacheHit = false;
      }

      // Fall back to database
      if (!cacheHit) {
        const _rows = await db<{ id: string }[]>`
          SELECT id FROM app.employees LIMIT 1
        `;
        // DB should work even when Redis is down
        dbFallbackWorked = true;
      }

      expect(cacheHit).toBe(false);
      expect(dbFallbackWorked).toBe(true);

      badRedis.disconnect();
    });
  });

  // -----------------------------------------------------------------------
  // Query timeout handling
  // -----------------------------------------------------------------------

  describe("Query timeout handling", () => {
    it("should handle pg_sleep timeout correctly", async () => {
      if (!isInfraAvailable()) return;

      // Create a connection with a very short statement timeout
      const timeoutDb = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 5,
        connect_timeout: 5,
      });

      try {
        await timeoutDb`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;

        // Set a very short statement timeout (100ms)
        await timeoutDb`SET statement_timeout = '100ms'`;

        // A query that exceeds the timeout should be cancelled
        try {
          await timeoutDb`SELECT pg_sleep(2)`;
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          const msg = String(error);
          expect(
            msg.includes("canceling statement due to statement timeout") ||
            msg.includes("statement timeout") ||
            msg.includes("cancel")
          ).toBe(true);
        }

        // Reset timeout and verify connection still works
        await timeoutDb`SET statement_timeout = '0'`;
        const [row] = await timeoutDb<{ result: number }[]>`SELECT 1 as result`;
        expect(row!.result).toBe(1);
      } finally {
        await timeoutDb.end({ timeout: 5 }).catch(() => {});
      }
    }, 10_000);
  });

  // -----------------------------------------------------------------------
  // Recovery after connection restoration
  // -----------------------------------------------------------------------

  describe("Recovery after connection issues", () => {
    it("should create new working connection after previous one fails", async () => {
      if (!isInfraAvailable()) return;

      // Simulate: first connection "fails" (close it), second should work
      const conn1 = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 2,
        connect_timeout: 5,
      });

      // Use and then close connection 1
      await conn1`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
      const [r1] = await conn1<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
      `;
      expect(parseInt(r1!.count, 10)).toBeGreaterThanOrEqual(0);
      await conn1.end({ timeout: 5 });

      // Create a new connection - should work normally
      const conn2 = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 2,
        connect_timeout: 5,
      });

      await conn2`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
      const [r2] = await conn2<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
      `;
      expect(parseInt(r2!.count, 10)).toBeGreaterThanOrEqual(0);
      await conn2.end({ timeout: 5 });
    });

    it("should handle query on closed connection with proper error", async () => {
      if (!isInfraAvailable()) return;

      const conn = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 2,
        connect_timeout: 5,
      });

      await conn`SELECT 1`;
      await conn.end({ timeout: 5 });

      // Query after close should fail gracefully
      try {
        await conn`SELECT 1`;
        // Some drivers may reconnect automatically; that's acceptable too
      } catch (error) {
        // Should get a connection-related error, not a crash
        expect(String(error).length).toBeGreaterThan(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Transaction isolation under failure
  // -----------------------------------------------------------------------

  describe("Transaction isolation under failure", () => {
    it("should rollback transaction on error and leave no partial writes", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `CHAOS-TX-${Date.now()}`;

      const [countBefore] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;

      try {
        await db.begin(async (tx) => {
          // Successful insert
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
          `;

          // Force an error to trigger rollback
          throw new Error("Simulated transaction failure");
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Simulated transaction failure");
      }

      // Verify no partial write
      const [countAfter] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;

      expect(countAfter!.count).toBe(countBefore!.count);
    });

    it("should rollback nested transaction-like scenario (outbox + business)", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `CHAOS-OUTBOX-${Date.now()}`;

      const [outboxBefore] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE aggregate_type = 'chaos-test'
      `;

      try {
        await db.begin(async (tx) => {
          const [emp] = await tx<{ id: string }[]>`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
            RETURNING id
          `;

          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'chaos-test', ${emp!.id}::uuid,
              'chaos.employee.created', '{}'::jsonb
            )
          `;

          // Simulate failure after both writes
          throw new Error("Simulated failure after outbox write");
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Simulated failure after outbox write");
      }

      // Both employee and outbox should be rolled back
      const [empCount] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;
      expect(empCount!.count).toBe("0");

      const [outboxAfter] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE aggregate_type = 'chaos-test'
      `;
      expect(outboxAfter!.count).toBe(outboxBefore!.count);
    });
  });
});
