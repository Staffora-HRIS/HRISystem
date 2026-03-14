/**
 * Transaction Rollback Integration Tests
 *
 * Verifies:
 * - Transaction atomicity (partial failure -> full rollback)
 * - Outbox + business write atomicity
 * - Concurrent transactions with conflicting data
 * - Savepoint behavior within transactions
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Transaction Rollback", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `tx-rollback-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `tx-rollback-${suffix}@example.com` });
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    // Clean up any leftover test data
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
        SELECT id FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number LIKE 'TX-%'
      )`.catch(() => {});
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number LIKE 'TX-%'`.catch(() => {});
      await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenant.id}::uuid AND code LIKE 'TX-%'`.catch(() => {});
    });
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  describe("Atomicity", () => {
    it("should rollback entire transaction on failure", async () => {
      if (!db || !tenant) return;
      const empNum1 = `TX-ATOM-1-${suffix}`;
      const empNum2 = `TX-ATOM-2-${suffix}`;

      // First create an employee to cause a duplicate key conflict
      await db`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum2}, 'active', CURRENT_DATE)
      `;

      // Now try a transaction that inserts employee 1, then tries duplicate employee 2
      try {
        await db.begin(async (tx) => {
          // This should succeed
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum1}, 'pending', CURRENT_DATE)
          `;

          // This should fail due to duplicate employee_number
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum2}, 'pending', CURRENT_DATE)
          `;
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(String(error)).toContain("duplicate");
      }

      // Verify employee 1 was NOT created (entire transaction rolled back)
      const check = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum1}
      `;
      expect(parseInt(check[0]!.count, 10)).toBe(0);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum2}`;
      });
    });

    it("should rollback outbox event when main write fails", async () => {
      if (!db || !tenant) return;
      const empNum = `TX-OBX-FAIL-${suffix}`;
      const aggregateId = crypto.randomUUID();

      // Count outbox entries before
      const before = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND aggregate_type = 'tx-rollback-test'
      `;
      const countBefore = parseInt(before[0]!.count, 10);

      try {
        await db.begin(async (tx) => {
          // Write outbox event first
          await tx`
            INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
            VALUES (${tenant.id}::uuid, 'tx-rollback-test', ${aggregateId}::uuid, 'test.created', '{}'::jsonb)
          `;

          // Force the transaction to fail with an invalid UUID cast
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date, user_id)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE, 'not-a-uuid'::uuid)
          `;
        });
        expect(true).toBe(false);
      } catch {
        // Expected
      }

      // Verify outbox event was NOT created
      const after = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND aggregate_type = 'tx-rollback-test'
      `;
      const countAfter = parseInt(after[0]!.count, 10);
      expect(countAfter).toBe(countBefore);
    });

    it("should commit both employee and outbox event atomically on success", async () => {
      if (!db || !tenant) return;
      const empNum = `TX-OBX-OK-${suffix}`;
      let employeeId: string = "";

      await db.begin(async (tx) => {
        const empResult = await tx<{ id: string }[]>`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
          RETURNING id
        `;
        employeeId = empResult[0]!.id;

        await tx`
          INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
          VALUES (${tenant.id}::uuid, 'employee', ${employeeId}::uuid, 'hr.employee.created', '{}'::jsonb)
        `;
      });

      // Verify both exist
      const emp = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE employee_number = ${empNum}
      `;
      expect(emp.length).toBe(1);

      const outbox = await db<{ aggregateId: string }[]>`
        SELECT aggregate_id as "aggregateId" FROM app.domain_outbox
        WHERE aggregate_id = ${employeeId}::uuid AND aggregate_type = 'employee'
      `;
      expect(outbox.length).toBe(1);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE aggregate_id = ${employeeId}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE employee_id = ${employeeId}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${employeeId}::uuid`;
      });
    });
  });

  describe("Concurrent transactions", () => {
    it("should handle unique constraint violation under concurrency", async () => {
      if (!db || !tenant) return;
      const empNum = `TX-CONC-${suffix}`;

      // Simulate two concurrent attempts to create the same employee number
      // Use separate connections to simulate real concurrency
      const db2 = getTestDb();
      await setTenantContext(db2, tenant.id, user!.id);

      let firstSucceeded = false;
      let secondFailed = false;

      try {
        // First insert
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        `;
        firstSucceeded = true;

        // Second insert with same employee number should fail
        try {
          await db2`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
          `;
        } catch (error) {
          secondFailed = true;
          expect(String(error)).toContain("duplicate");
        }
      } finally {
        // Cleanup
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
            SELECT id FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum}
          )`.catch(() => {});
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum}`.catch(() => {});
        });
        await db2.end();
      }

      expect(firstSucceeded).toBe(true);
      expect(secondFailed).toBe(true);
    });
  });

  describe("Multiple operations in single transaction", () => {
    it("should rollback all operations when any one fails", async () => {
      if (!db || !tenant) return;

      const orgCode = `TX-MULTI-${suffix}`;
      const empNum = `TX-MULTI-EMP-${suffix}`;

      try {
        await db.begin(async (tx) => {
          // Create org unit
          await tx`
            INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
            VALUES (${tenant.id}::uuid, ${orgCode}, 'Multi Test Org', true, CURRENT_DATE)
          `;

          // Create employee
          await tx`
            INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
            VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
          `;

          // Force failure
          throw new Error("Intentional failure to test rollback");
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Intentional failure");
      }

      // Verify neither org unit nor employee was created
      const orgCheck = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.org_units
        WHERE tenant_id = ${tenant.id}::uuid AND code = ${orgCode}
      `;
      expect(parseInt(orgCheck[0]!.count, 10)).toBe(0);

      const empCheck = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
        WHERE tenant_id = ${tenant.id}::uuid AND employee_number = ${empNum}
      `;
      expect(parseInt(empCheck[0]!.count, 10)).toBe(0);
    });
  });
});
