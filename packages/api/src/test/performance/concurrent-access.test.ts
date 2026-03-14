/**
 * Concurrent Access Tests
 *
 * Verifies database behavior under concurrent reads and writes,
 * connection pool behavior, and RLS context isolation during
 * parallel operations.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
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

describe("Concurrent Access", () => {
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
      name: `Concurrent Tenant ${suffix}`,
      slug: `concurrent-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `concurrent-user-${suffix}@example.com`,
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
      console.warn("Concurrent test cleanup warning:", e);
    }

    await cleanupTestUser(db, user?.id);
    await cleanupTestTenant(db, tenant?.id);
    await closeTestConnections(db);
  }, 30_000);

  // -----------------------------------------------------------------------
  // Concurrent reads
  // -----------------------------------------------------------------------

  describe("Concurrent reads", () => {
    beforeAll(async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Seed 20 employees for reading
      for (let i = 0; i < 20; i++) {
        const empNum = `CONC-READ-${Date.now()}-${i}`;
        const [emp] = await db<{ id: string }[]>`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
          RETURNING id
        `;
        createdEmployeeIds.push(emp!.id);
      }
    }, 30_000);

    it("should handle 10 parallel SELECT queries correctly", async () => {
      if (!isInfraAvailable()) return;

      // Create 10 separate connections with tenant context each
      const connections: ReturnType<typeof postgres>[] = [];
      for (let i = 0; i < 10; i++) {
        const conn = postgres({
          host: TEST_CONFIG.database.host,
          port: TEST_CONFIG.database.port,
          database: TEST_CONFIG.database.database,
          username: TEST_CONFIG.database.username,
          password: TEST_CONFIG.database.password,
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
        });
        connections.push(conn);
      }

      try {
        const results = await Promise.all(
          connections.map(async (conn) => {
            await conn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
            const rows = await conn<{ id: string }[]>`
              SELECT id FROM app.employees LIMIT 10
            `;
            return rows.length;
          })
        );

        // Every connection should see at least some employees
        for (const count of results) {
          expect(count).toBeGreaterThan(0);
          expect(count).toBeLessThanOrEqual(10);
        }
      } finally {
        await Promise.all(connections.map((c) => c.end({ timeout: 5 }).catch(() => {})));
      }
    }, 30_000);

    it("should return consistent data across concurrent reads", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Count employees
      const [baseline] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
      `;
      const expectedCount = baseline!.count;

      // Run 5 parallel COUNT queries
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          db<{ count: string }[]>`
            SELECT COUNT(*)::text as count FROM app.employees
          `.then((r) => r[0]!.count)
        )
      );

      // All should return the same count
      for (const count of results) {
        expect(count).toBe(expectedCount);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent writes
  // -----------------------------------------------------------------------

  describe("Concurrent writes", () => {
    it("should handle 5 parallel inserts to the same table", async () => {
      if (!isInfraAvailable()) return;

      const connections: ReturnType<typeof postgres>[] = [];
      for (let i = 0; i < 5; i++) {
        const conn = postgres({
          host: TEST_CONFIG.database.host,
          port: TEST_CONFIG.database.port,
          database: TEST_CONFIG.database.database,
          username: TEST_CONFIG.database.username,
          password: TEST_CONFIG.database.password,
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
        });
        connections.push(conn);
      }

      try {
        const insertedIds = await Promise.all(
          connections.map(async (conn, i) => {
            await conn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
            await conn`SELECT set_config('app.current_user', ${user.id}, false)`;

            const empNum = `CONC-WRITE-${Date.now()}-${i}`;
            const [emp] = await conn<{ id: string }[]>`
              INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
              VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
              RETURNING id
            `;
            return emp!.id;
          })
        );

        // All 5 inserts should succeed with unique IDs
        expect(insertedIds.length).toBe(5);
        expect(new Set(insertedIds).size).toBe(5);

        // Track for cleanup
        createdEmployeeIds.push(...insertedIds);

        // Verify all exist
        await setTenantContext(db, tenant.id, user.id);
        const rows = await db<{ id: string }[]>`
          SELECT id FROM app.employees WHERE id = ANY(${insertedIds}::uuid[])
        `;
        expect(rows.length).toBe(5);
      } finally {
        await Promise.all(connections.map((c) => c.end({ timeout: 5 }).catch(() => {})));
      }
    }, 30_000);

    it("should enforce unique constraint under concurrent inserts", async () => {
      if (!isInfraAvailable()) return;

      const sharedEmpNum = `CONC-UNIQUE-${Date.now()}`;
      const connections: ReturnType<typeof postgres>[] = [];
      for (let i = 0; i < 3; i++) {
        const conn = postgres({
          host: TEST_CONFIG.database.host,
          port: TEST_CONFIG.database.port,
          database: TEST_CONFIG.database.database,
          username: TEST_CONFIG.database.username,
          password: TEST_CONFIG.database.password,
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
        });
        connections.push(conn);
      }

      try {
        const results = await Promise.allSettled(
          connections.map(async (conn) => {
            await conn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
            await conn`SELECT set_config('app.current_user', ${user.id}, false)`;

            const [emp] = await conn<{ id: string }[]>`
              INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
              VALUES (${tenant.id}::uuid, ${sharedEmpNum}, 'active', CURRENT_DATE)
              RETURNING id
            `;
            return emp!.id;
          })
        );

        const successes = results.filter((r) => r.status === "fulfilled");
        const failures = results.filter((r) => r.status === "rejected");

        // Exactly one should succeed; the rest should fail with duplicate key
        expect(successes.length).toBe(1);
        expect(failures.length).toBe(2);

        for (const f of failures) {
          if (f.status === "rejected") {
            expect(String(f.reason)).toContain("duplicate");
          }
        }

        // Track for cleanup
        for (const s of successes) {
          if (s.status === "fulfilled") {
            createdEmployeeIds.push(s.value);
          }
        }
      } finally {
        await Promise.all(connections.map((c) => c.end({ timeout: 5 }).catch(() => {})));
      }
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Read/write contention
  // -----------------------------------------------------------------------

  describe("Read/write contention", () => {
    it("should not block reads during concurrent writes", async () => {
      if (!isInfraAvailable()) return;

      const writerConn = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 10,
        connect_timeout: 10,
      });

      const readerConn = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 10,
        connect_timeout: 10,
      });

      try {
        await writerConn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
        await writerConn`SELECT set_config('app.current_user', ${user.id}, false)`;
        await readerConn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;

        // Run writes and reads simultaneously
        const [writeResult, readResult] = await Promise.all([
          // Writer: insert 5 employees
          (async () => {
            const ids: string[] = [];
            for (let i = 0; i < 5; i++) {
              const empNum = `CONTENTION-W-${Date.now()}-${i}`;
              const [emp] = await writerConn<{ id: string }[]>`
                INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
                VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
                RETURNING id
              `;
              ids.push(emp!.id);
            }
            return ids;
          })(),
          // Reader: run 5 queries
          (async () => {
            const counts: number[] = [];
            for (let i = 0; i < 5; i++) {
              const [row] = await readerConn<{ count: string }[]>`
                SELECT COUNT(*)::text as count FROM app.employees
              `;
              counts.push(parseInt(row!.count, 10));
            }
            return counts;
          })(),
        ]);

        expect(writeResult.length).toBe(5);
        createdEmployeeIds.push(...writeResult);

        // Reader should have gotten results every time (no deadlock/timeout)
        expect(readResult.length).toBe(5);
        for (const count of readResult) {
          expect(count).toBeGreaterThan(0);
        }
      } finally {
        await writerConn.end({ timeout: 5 }).catch(() => {});
        await readerConn.end({ timeout: 5 }).catch(() => {});
      }
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // RLS context isolation under concurrency
  // -----------------------------------------------------------------------

  describe("RLS context isolation under concurrency", () => {
    it("should isolate tenant context across concurrent connections", async () => {
      if (!isInfraAvailable()) return;

      const suffix = Date.now();

      // Create a second tenant
      const tenant2 = await createTestTenant(db, {
        name: `Concurrent Tenant 2 ${suffix}`,
        slug: `concurrent-2-${suffix}`,
      });
      const user2 = await createTestUser(db, tenant2.id, {
        email: `concurrent-user2-${suffix}@example.com`,
      });

      // Insert an employee into each tenant
      await setTenantContext(db, tenant.id, user.id);
      const [empA] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${"RLS-CONC-A-" + suffix}, 'active', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(empA!.id);

      await setTenantContext(db, tenant2.id, user2.id);
      const [empB] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant2.id}::uuid, ${"RLS-CONC-B-" + suffix}, 'active', CURRENT_DATE)
        RETURNING id
      `;
      const empBId = empB!.id;

      try {
        // Two connections with different tenant contexts query simultaneously
        const connA = postgres({
          host: TEST_CONFIG.database.host,
          port: TEST_CONFIG.database.port,
          database: TEST_CONFIG.database.database,
          username: TEST_CONFIG.database.username,
          password: TEST_CONFIG.database.password,
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
        });
        const connB = postgres({
          host: TEST_CONFIG.database.host,
          port: TEST_CONFIG.database.port,
          database: TEST_CONFIG.database.database,
          username: TEST_CONFIG.database.username,
          password: TEST_CONFIG.database.password,
          max: 1,
          idle_timeout: 10,
          connect_timeout: 10,
        });

        try {
          await connA`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
          await connB`SELECT set_config('app.current_tenant', ${tenant2.id}, false)`;

          const [resultsA, resultsB] = await Promise.all([
            connA<{ id: string }[]>`
              SELECT id FROM app.employees WHERE employee_number LIKE 'RLS-CONC-%'
            `,
            connB<{ id: string }[]>`
              SELECT id FROM app.employees WHERE employee_number LIKE 'RLS-CONC-%'
            `,
          ]);

          // Each connection should only see its own tenant's employee
          expect(resultsA.length).toBe(1);
          expect(resultsA[0]!.id).toBe(empA!.id);

          expect(resultsB.length).toBe(1);
          expect(resultsB[0]!.id).toBe(empBId);
        } finally {
          await connA.end({ timeout: 5 }).catch(() => {});
          await connB.end({ timeout: 5 }).catch(() => {});
        }
      } finally {
        // Cleanup tenant2 data
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employees WHERE id = ${empBId}::uuid`;
        });
        await cleanupTestUser(db, user2.id);
        await cleanupTestTenant(db, tenant2.id);
      }
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Connection pool behavior
  // -----------------------------------------------------------------------

  describe("Connection pool behavior", () => {
    it("should handle many sequential queries through pool without error", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Run 50 sequential queries through the same pooled connection
      for (let i = 0; i < 50; i++) {
        const rows = await db<{ id: string }[]>`
          SELECT id FROM app.employees LIMIT 1
        `;
        expect(rows.length).toBe(1);
      }
    }, 30_000);

    it("should handle rapid connection create/destroy cycles", async () => {
      if (!isInfraAvailable()) return;

      // Create and destroy 10 short-lived connections
      for (let i = 0; i < 10; i++) {
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

        await conn`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
        const rows = await conn<{ count: string }[]>`
          SELECT COUNT(*)::text as count FROM app.employees
        `;
        expect(parseInt(rows[0]!.count, 10)).toBeGreaterThan(0);
        await conn.end({ timeout: 5 });
      }
    }, 30_000);
  });
});
