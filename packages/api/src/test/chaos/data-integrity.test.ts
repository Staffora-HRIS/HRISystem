/**
 * Data Integrity Tests
 *
 * Verifies data consistency under failure conditions:
 * partial transaction failures, idempotency under duplicate
 * requests, concurrent updates, and outbox atomicity.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
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
  clearTenantContext,
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

describe("Data Integrity", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenant: TestTenant;
  let user: TestUser;
  const createdEmployeeIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    db = getTestDb();
    const suffix = Date.now();
    tenant = await createTestTenant(db, {
      name: `Integrity Tenant ${suffix}`,
      slug: `integrity-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `integrity-${suffix}@example.com`,
    });
  }, 30_000);

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (!db) return;

    try {
      await withSystemContext(db, async (tx) => {
        if (createdOutboxIds.length > 0) {
          await tx`DELETE FROM app.domain_outbox WHERE id = ANY(${createdOutboxIds}::uuid[])`;
        }
        if (createdEmployeeIds.length > 0) {
          await tx`DELETE FROM app.employees WHERE id = ANY(${createdEmployeeIds}::uuid[])`;
        }
      });
    } catch (e) {
      console.warn("Integrity test cleanup warning:", e);
    }

    await cleanupTestUser(db, user?.id);
    await cleanupTestTenant(db, tenant?.id);
    await closeTestConnections(db);
  }, 30_000);

  // -----------------------------------------------------------------------
  // Partial transaction failure
  // -----------------------------------------------------------------------

  describe("Partial transaction failure", () => {
    it("should rollback business write when outbox insert fails", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `INTEGRITY-OUTBOX-FAIL-${Date.now()}`;

      try {
        await db.begin(async (tx) => {
          // Business write succeeds
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
          `;

          // Outbox write fails with invalid UUID
          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'integrity-test', 'NOT-A-UUID'::uuid,
              'test.failed', '{}'::jsonb
            )
          `;
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(String(error)).toContain("uuid");
      }

      // Verify employee was NOT created (rolled back)
      const [count] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;
      expect(count!.count).toBe("0");
    });

    it("should rollback outbox when business insert violates constraint", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `INTEGRITY-DUP-${Date.now()}`;

      // Create the first employee
      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      // Get outbox count before
      const [outboxBefore] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE aggregate_type = 'integrity-dup-test'
      `;

      // Try to insert duplicate employee + outbox in a transaction
      try {
        await db.begin(async (tx) => {
          // This should fail due to unique constraint on employee_number
          const [dup] = await tx<{ id: string }[]>`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
            RETURNING id
          `;

          // This outbox write should be rolled back
          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'integrity-dup-test', ${dup!.id}::uuid,
              'test.duplicate', '{}'::jsonb
            )
          `;
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
      }

      // Verify outbox count unchanged
      const [outboxAfter] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE aggregate_type = 'integrity-dup-test'
      `;
      expect(outboxAfter!.count).toBe(outboxBefore!.count);
    });

    it("should maintain atomicity when application code throws mid-transaction", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `INTEGRITY-APPFAIL-${Date.now()}`;

      try {
        await db.begin(async (tx) => {
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
          `;

          // Simulate application logic error
          const shouldFail = 1;
          if (shouldFail) {
            throw new Error("Business rule violation: employee cannot be created on weekend");
          }

          // This should never execute
          await tx`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'integrity-app-test', ${crypto.randomUUID()}::uuid,
              'test.created', '{}'::jsonb
            )
          `;
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Business rule violation");
      }

      // Employee should not exist
      const [count] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;
      expect(count!.count).toBe("0");
    });
  });

  // -----------------------------------------------------------------------
  // Idempotency under duplicate requests
  // -----------------------------------------------------------------------

  describe("Idempotency under duplicate requests", () => {
    it("should reject duplicate employee_number inserts", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `IDEMP-${Date.now()}`;

      // First insert should succeed
      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      // Second insert with same employee_number should fail
      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
      }

      // Verify only one employee exists
      const [count] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number = ${empNum}
      `;
      expect(count!.count).toBe("1");
    });

    it("should support INSERT ON CONFLICT DO NOTHING for idempotent inserts", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `IDEMP-UPSERT-${Date.now()}`;

      // First insert
      const [first] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
        ON CONFLICT (tenant_id, employee_number) DO NOTHING
        RETURNING id
      `;
      expect(first).toBeDefined();
      createdEmployeeIds.push(first!.id);

      // Second insert - should be a no-op
      const second = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        ON CONFLICT (tenant_id, employee_number) DO NOTHING
        RETURNING id
      `;
      expect(second.length).toBe(0);

      // Verify original record unchanged
      const [emp] = await db<{ status: string }[]>`
        SELECT status FROM app.employees
        WHERE employee_number = ${empNum}
      `;
      expect(emp!.status).toBe("active"); // Not 'pending'
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent updates to same record
  // -----------------------------------------------------------------------

  describe("Concurrent updates to same record", () => {
    it("should serialize concurrent status updates (last writer wins)", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `CONC-UPDATE-${Date.now()}`;
      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      // Two connections updating the same record concurrently
      const conn1 = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 10,
        connect_timeout: 10,
      });

      const conn2 = postgres({
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
        await conn1`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
        await conn2`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;

        // Both update the same record simultaneously
        await Promise.all([
          conn1`
            UPDATE app.employees
            SET status = 'active', updated_at = now()
            WHERE id = ${emp!.id}::uuid
          `,
          conn2`
            UPDATE app.employees
            SET termination_reason = 'concurrent update test', updated_at = now()
            WHERE id = ${emp!.id}::uuid
          `,
        ]);

        // Both updates should have applied (different columns)
        const [result] = await db<{ status: string; terminationReason: string | null }[]>`
          SELECT status, termination_reason as "terminationReason"
          FROM app.employees
          WHERE id = ${emp!.id}::uuid
        `;

        // With default READ COMMITTED, both non-conflicting updates succeed
        expect(result!.status).toBe("active");
        expect(result!.terminationReason).toBe("concurrent update test");
      } finally {
        await conn1.end({ timeout: 5 }).catch(() => {});
        await conn2.end({ timeout: 5 }).catch(() => {});
      }
    }, 15_000);

    it("should handle concurrent updates to same column (last writer wins)", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `CONC-SAME-COL-${Date.now()}`;
      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      const conn1 = postgres({
        host: TEST_CONFIG.database.host,
        port: TEST_CONFIG.database.port,
        database: TEST_CONFIG.database.database,
        username: TEST_CONFIG.database.username,
        password: TEST_CONFIG.database.password,
        max: 1,
        idle_timeout: 10,
        connect_timeout: 10,
      });

      const conn2 = postgres({
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
        await conn1`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
        await conn2`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;

        // Both update status - one of them will "win"
        const results = await Promise.allSettled([
          conn1`
            UPDATE app.employees
            SET status = 'active'
            WHERE id = ${emp!.id}::uuid
          `,
          conn2`
            UPDATE app.employees
            SET status = 'active'
            WHERE id = ${emp!.id}::uuid
          `,
        ]);

        // Both should succeed (READ COMMITTED allows this)
        for (const r of results) {
          expect(r.status).toBe("fulfilled");
        }

        // Final state should be 'active'
        const [result] = await db<{ status: string }[]>`
          SELECT status FROM app.employees WHERE id = ${emp!.id}::uuid
        `;
        expect(result!.status).toBe("active");
      } finally {
        await conn1.end({ timeout: 5 }).catch(() => {});
        await conn2.end({ timeout: 5 }).catch(() => {});
      }
    }, 15_000);
  });

  // -----------------------------------------------------------------------
  // Data consistency checks
  // -----------------------------------------------------------------------

  describe("Data consistency checks", () => {
    it("should enforce foreign key constraints", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Try to insert employee_personal for non-existent employee
      const fakeEmployeeId = crypto.randomUUID();

      try {
        await db`
          INSERT INTO app.employee_personal (
            tenant_id, employee_id, effective_from, first_name, last_name
          )
          VALUES (
            ${tenant.id}::uuid, ${fakeEmployeeId}::uuid, CURRENT_DATE,
            'Test', 'User'
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("foreign key") ||
          msg.includes("violates") ||
          msg.includes("not present in table")
        ).toBe(true);
      }
    });

    it("should enforce NOT NULL constraints", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Try to insert employee without required fields
      try {
        await db`
          INSERT INTO app.employees (tenant_id, status, hire_date)
          VALUES (${tenant.id}::uuid, 'active', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("null value") ||
          msg.includes("not-null constraint") ||
          msg.includes("employee_number")
        ).toBe(true);
      }
    });

    it("should enforce CHECK constraints on employee status", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Try to insert employee with invalid status
      try {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${"CHECK-" + Date.now()}, 'invalid_status', CURRENT_DATE)
        `;
        expect(true).toBe(false);
      } catch (error) {
        const msg = String(error);
        expect(
          msg.includes("invalid input value") ||
          msg.includes("check constraint") ||
          msg.includes("enum") ||
          msg.includes("invalid_status")
        ).toBe(true);
      }
    });

    it("should preserve data types through insert and select cycle", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `TYPE-CHECK-${Date.now()}`;
      const hireDate = "2024-06-15";

      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', ${hireDate}::date)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      const [row] = await db<{
        employeeNumber: string;
        status: string;
        hireDate: Date;
        tenantId: string;
      }[]>`
        SELECT
          employee_number as "employeeNumber",
          status,
          hire_date as "hireDate",
          tenant_id as "tenantId"
        FROM app.employees
        WHERE id = ${emp!.id}::uuid
      `;

      expect(row!.employeeNumber).toBe(empNum);
      expect(row!.status).toBe("pending");
      expect(row!.tenantId).toBe(tenant.id);

      // hire_date should be a Date
      const hireDateObj = new Date(row!.hireDate);
      expect(hireDateObj.getFullYear()).toBe(2024);
      expect(hireDateObj.getMonth()).toBe(5); // June = 5 (zero-indexed)
      expect(hireDateObj.getDate()).toBe(15);
    });
  });

  // -----------------------------------------------------------------------
  // Outbox atomicity under stress
  // -----------------------------------------------------------------------

  describe("Outbox atomicity under stress", () => {
    it("should create employee + outbox atomically across 10 sequential transactions", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const suffix = Date.now();
      const employeeIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const empNum = `ATOM-SEQ-${suffix}-${i}`;
        await db.begin(async (tx) => {
          const [emp] = await tx<{ id: string }[]>`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
            RETURNING id
          `;
          employeeIds.push(emp!.id);

          const [outbox] = await tx<{ id: string }[]>`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'atom-test', ${emp!.id}::uuid,
              'test.created', ${JSON.stringify({ empNum, index: i })}::jsonb
            )
            RETURNING id
          `;
          createdOutboxIds.push(outbox!.id);
        });
      }

      createdEmployeeIds.push(...employeeIds);

      // Verify all employees exist
      const [empCount] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE id = ANY(${employeeIds}::uuid[])
      `;
      expect(empCount!.count).toBe("10");

      // Verify all outbox events exist (one per employee)
      const [outboxCount] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.domain_outbox
        WHERE aggregate_type = 'atom-test'
          AND aggregate_id = ANY(${employeeIds}::uuid[])
      `;
      expect(outboxCount!.count).toBe("10");
    }, 30_000);

    it("should maintain 1:1 ratio between employees and outbox events", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const suffix = Date.now();
      const created: Array<{ empId: string; outboxId: string }> = [];

      for (let i = 0; i < 5; i++) {
        const empNum = `RATIO-${suffix}-${i}`;
        await db.begin(async (tx) => {
          const [emp] = await tx<{ id: string }[]>`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
            RETURNING id
          `;

          const [outbox] = await tx<{ id: string }[]>`
            INSERT INTO app.domain_outbox (
              tenant_id, aggregate_type, aggregate_id, event_type, payload
            )
            VALUES (
              ${tenant.id}::uuid, 'ratio-test', ${emp!.id}::uuid,
              'test.created', '{}'::jsonb
            )
            RETURNING id
          `;

          created.push({ empId: emp!.id, outboxId: outbox!.id });
        });
      }

      createdEmployeeIds.push(...created.map((c) => c.empId));
      createdOutboxIds.push(...created.map((c) => c.outboxId));

      // Verify 1:1 relationship
      for (const { empId, outboxId } of created) {
        const [emp] = await db<{ id: string }[]>`
          SELECT id FROM app.employees WHERE id = ${empId}::uuid
        `;
        expect(emp).toBeDefined();

        const [outbox] = await db<{ aggregateId: string }[]>`
          SELECT aggregate_id as "aggregateId"
          FROM app.domain_outbox
          WHERE id = ${outboxId}::uuid
        `;
        expect(outbox).toBeDefined();
        expect(outbox!.aggregateId).toBe(empId);
      }
    });
  });
});
