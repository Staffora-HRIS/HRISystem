/**
 * Enhanced Effective Dating Integration Tests
 *
 * Verifies:
 * - Concurrent overlap detection under transaction isolation
 * - Date boundary edge cases (same-day, adjacent, NULL effective_to)
 * - Historical queries using as-of-date functions
 * - Effective-dated record creation and closure patterns
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

describe("Enhanced Effective Dating", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `ed-enh-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `ed-enh-${suffix}@example.com` });
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
        SELECT id FROM app.employees WHERE tenant_id = ${tenant.id}::uuid
      )`.catch(() => {});
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
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

  // ===========================================================================
  // Date Boundary Edge Cases
  // ===========================================================================
  describe("Date boundary edge cases", () => {
    it("should allow adjacent non-overlapping records", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-ADJ-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      // Record 1: Jan 1 to Mar 31
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Alice', 'Before', '2025-01-01', '2025-04-01')
      `;

      // Record 2: Apr 1 onward (adjacent, not overlapping since effective_to > effective_from)
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Alice', 'After', '2025-04-01')
      `;

      // Verify both records exist
      const records = await db<{ firstName: string; effectiveFrom: string }[]>`
        SELECT first_name as "firstName", effective_from::text as "effectiveFrom"
        FROM app.employee_personal
        WHERE employee_id = ${empId}::uuid
        ORDER BY effective_from
      `;

      expect(records.length).toBe(2);
      expect(records[0]!.firstName).toBe("Alice");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
      });
    });

    it("should enforce unique constraint on same employee and effective_from", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-DUP-EF-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Bob', 'Smith', '2025-01-01')
      `;

      try {
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
          VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Robert', 'Smith', '2025-01-01')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
        expect(String(error)).toContain("employee_personal_effective_unique");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
      });
    });

    it("should correctly handle NULL effective_to as current record", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-NULL-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Carol', 'Past', '2020-01-01', '2025-01-01')
      `;

      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Carol', 'Current', '2025-01-01')
      `;

      // Query current record (effective_to IS NULL)
      const current = await db<{ firstName: string; lastName: string }[]>`
        SELECT first_name as "firstName", last_name as "lastName"
        FROM app.employee_personal
        WHERE employee_id = ${empId}::uuid AND effective_to IS NULL
      `;

      expect(current.length).toBe(1);
      expect(current[0]!.lastName).toBe("Current");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
      });
    });

    it("should reject effective_to equal to effective_from", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-SAME-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      // effective_to must be strictly greater than effective_from
      try {
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
          VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Dan', 'Zero', '2025-06-01', '2025-06-01')
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("employee_personal_effective_dates");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Historical / As-Of-Date Queries
  // ===========================================================================
  describe("Historical queries", () => {
    let empId: string;

    beforeAll(async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      const empNum = `ED-HIST-${suffix}`;
      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      empId = emp[0]!.id;

      // Insert historical records:
      // Record 1: 2020-01-01 to 2022-01-01 (maiden name)
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Emily', 'Maiden', '2020-01-01', '2022-01-01')
      `;

      // Record 2: 2022-01-01 to 2024-01-01 (married name)
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from, effective_to)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Emily', 'Married', '2022-01-01', '2024-01-01')
      `;

      // Record 3: 2024-01-01 onward (current)
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Emily', 'Current', '2024-01-01')
      `;
    });

    afterAll(async () => {
      if (!db || !tenant) return;
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`.catch(() => {});
      });
    });

    it("should return correct record for as-of-date in first period", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_employee_personal_as_of(${empId}::uuid, '2021-06-15'::date)
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.lastName).toBe("Maiden");
    });

    it("should return correct record for as-of-date in second period", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_employee_personal_as_of(${empId}::uuid, '2023-06-15'::date)
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.lastName).toBe("Married");
    });

    it("should return current record for today's date", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_employee_personal_as_of(${empId}::uuid, CURRENT_DATE)
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.lastName).toBe("Current");
    });

    it("should return current record via get_current_employee_personal", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_current_employee_personal(${empId}::uuid)
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.lastName).toBe("Current");
    });

    it("should return all records via get_employee_personal_history", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string; effectiveFrom: string }[]>`
        SELECT last_name as "lastName", effective_from::text as "effectiveFrom"
        FROM app.get_employee_personal_history(${empId}::uuid)
      `;

      expect(result.length).toBe(3);
      // Ordered by effective_from DESC
      expect(result[0]!.lastName).toBe("Current");
      expect(result[1]!.lastName).toBe("Married");
      expect(result[2]!.lastName).toBe("Maiden");
    });

    it("should return no record for as-of-date before any records", async () => {
      if (!db || !tenant) return;

      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_employee_personal_as_of(${empId}::uuid, '2019-01-01'::date)
      `;

      expect(result.length).toBe(0);
    });

    it("should return correct record at exact boundary date", async () => {
      if (!db || !tenant) return;

      // At the boundary date 2022-01-01, the new record should be effective
      // (effective_from <= as_of_date AND effective_to IS NULL OR effective_to > as_of_date)
      const result = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.get_employee_personal_as_of(${empId}::uuid, '2022-01-01'::date)
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.lastName).toBe("Married");
    });
  });

  // ===========================================================================
  // update_employee_personal Function
  // ===========================================================================
  describe("update_employee_personal function", () => {
    it("should close current record and insert new one", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-UPD-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      // Create initial record
      await db`
        INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
        VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Grace', 'Original', '2020-01-01')
      `;

      // Use the update function to create a new version
      const newId = await db<{ updateEmployeePersonal: string }[]>`
        SELECT app.update_employee_personal(
          ${empId}::uuid,
          'Grace', NULL, 'Updated', NULL, NULL, NULL, NULL, NULL,
          '2025-06-01'::date,
          ${user.id}::uuid
        ) as "updateEmployeePersonal"
      `;

      expect(newId.length).toBe(1);

      // Verify old record was closed
      const oldRecord = await db<{ effectiveTo: string | null }[]>`
        SELECT effective_to::text as "effectiveTo"
        FROM app.employee_personal
        WHERE employee_id = ${empId}::uuid AND effective_from = '2020-01-01'
      `;
      expect(oldRecord.length).toBe(1);
      expect(oldRecord[0]!.effectiveTo).toBe("2025-06-01");

      // Verify new record is current
      const newRecord = await db<{ lastName: string; effectiveTo: string | null }[]>`
        SELECT last_name as "lastName", effective_to as "effectiveTo"
        FROM app.employee_personal
        WHERE employee_id = ${empId}::uuid AND effective_to IS NULL
      `;
      expect(newRecord.length).toBe(1);
      expect(newRecord[0]!.lastName).toBe("Updated");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Concurrent Overlap Detection
  // ===========================================================================
  describe("Concurrent overlap detection", () => {
    it("should prevent duplicate effective_from under concurrent writes", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-CONC-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', '2020-01-01')
        RETURNING id
      `;
      const empId = emp[0]!.id;

      // Use a second connection for concurrency simulation
      const db2 = getTestDb();
      await setTenantContext(db2, tenant.id, user.id);

      let firstSucceeded = false;
      let secondFailed = false;

      try {
        // First insert
        await db`
          INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
          VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Hannah', 'First', '2025-07-01')
        `;
        firstSucceeded = true;

        // Second insert with same effective_from should fail due to unique constraint
        try {
          await db2`
            INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
            VALUES (${tenant.id}::uuid, ${empId}::uuid, 'Hannah', 'Second', '2025-07-01')
          `;
        } catch (error) {
          secondFailed = true;
          expect(String(error)).toContain("duplicate");
        }
      } finally {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employee_personal WHERE employee_id = ${empId}::uuid`;
          await tx`DELETE FROM app.employees WHERE id = ${empId}::uuid`;
        });
        await db2.end();
      }

      expect(firstSucceeded).toBe(true);
      expect(secondFailed).toBe(true);
    });
  });

  // ===========================================================================
  // Leave Balance Effective Dating (unique per employee/type/year)
  // ===========================================================================
  describe("Leave balance unique per employee/type/year", () => {
    it("should reject duplicate leave balance for same employee/type/year", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-LB-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'ED_LB_' + suffix}, 'Balance Test', 'annual')
        RETURNING id
      `;

      await db`
        INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2026, 20)
      `;

      try {
        await db`
          INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance)
          VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2026, 25)
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
        expect(String(error)).toContain("leave_balances_unique");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should allow same employee/type for different years", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-LB-YR-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'ED_LB_YR_' + suffix}, 'Multi Year', 'annual')
        RETURNING id
      `;

      // Insert for 2025
      await db`
        INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2025, 20)
      `;

      // Insert for 2026 (should succeed)
      await db`
        INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance)
        VALUES (${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2026, 22)
      `;

      const balances = await db<{ year: number }[]>`
        SELECT year FROM app.leave_balances
        WHERE employee_id = ${emp[0]!.id}::uuid AND leave_type_id = ${lt[0]!.id}::uuid
        ORDER BY year
      `;

      expect(balances.length).toBe(2);
      expect(balances[0]!.year).toBe(2025);
      expect(balances[1]!.year).toBe(2026);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });

    it("should compute closing_balance and available_balance correctly", async () => {
      if (!db || !tenant) return;
      const empNum = `ED-LB-COMP-${suffix}`;

      const emp = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${empNum}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const lt = await db<{ id: string }[]>`
        INSERT INTO app.leave_types (tenant_id, code, name, category)
        VALUES (${tenant.id}::uuid, ${'ED_LB_COMP_' + suffix}, 'Computed Balance', 'annual')
        RETURNING id
      `;

      await db`
        INSERT INTO app.leave_balances (
          tenant_id, employee_id, leave_type_id, year,
          opening_balance, accrued, used, pending, adjustments, carryover, forfeited
        )
        VALUES (
          ${tenant.id}::uuid, ${emp[0]!.id}::uuid, ${lt[0]!.id}::uuid, 2026,
          5, 20, 3, 2, 1, 3, 1
        )
      `;

      const balance = await db<{
        closingBalance: string;
        availableBalance: string;
      }[]>`
        SELECT
          closing_balance::text as "closingBalance",
          available_balance::text as "availableBalance"
        FROM app.leave_balances
        WHERE employee_id = ${emp[0]!.id}::uuid AND leave_type_id = ${lt[0]!.id}::uuid AND year = 2026
      `;

      expect(balance.length).toBe(1);
      // closing_balance = opening(5) + accrued(20) + carryover(3) + adjustments(1) - used(3) - forfeited(1) = 25
      expect(parseFloat(balance[0]!.closingBalance)).toBe(25);
      // available_balance = closing_balance(25) - pending(2) = 23
      expect(parseFloat(balance[0]!.availableBalance)).toBe(23);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE id = ${lt[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp[0]!.id}::uuid`;
      });
    });
  });
});
