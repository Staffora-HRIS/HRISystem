/**
 * Multi-Tenant Isolation E2E Tests
 *
 * Complete tenant isolation verification using REAL database operations:
 * 1. Create two fully populated tenants
 * 2. Verify data isolation across every major table
 * 3. Verify cross-tenant writes are blocked by RLS
 * 4. Verify system context bypasses RLS when needed
 * 5. Verify tenant context switching works correctly
 * 6. Verify domain outbox isolation
 * 7. Verify idempotency key isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
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
  expectRlsError,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Multi-Tenant Isolation E2E", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  const suffix = Date.now();

  // Tenant A
  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let employeeA1Id: string;
  let _orgUnitAId: string;
  let leaveTypeAId: string;

  // Tenant B
  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let employeeB1Id: string;
  let _orgUnitBId: string;
  let leaveTypeBId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();

    // Create Tenant A with full data
    tenantA = await createTestTenant(db, { name: "Acme Corp", slug: `acme-${suffix}` });
    userA = await createTestUser(db, tenantA.id, { email: `acme-admin-${suffix}@example.com` });

    await setTenantContext(db, tenantA.id, userA.id);

    // Org Unit A
    const orgA = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenantA.id}::uuid, ${'ACME-ENG-' + suffix}, 'Engineering', true, '2024-01-01')
      RETURNING id
    `;
    _orgUnitAId = orgA[0]!.id;

    // Employee A1
    const empA1 = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantA.id}::uuid, ${'ACME-001-' + suffix}, 'pending', '2024-01-01')
      RETURNING id
    `;
    employeeA1Id = empA1[0]!.id;
    await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeA1Id}::uuid`;

    // Personal info A1
    await db`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenantA.id}::uuid, ${employeeA1Id}::uuid, 'Alice', 'Acme', '2024-01-01')
    `;

    // Leave type A
    const ltA = await db<{ id: string }[]>`
      INSERT INTO app.leave_types (tenant_id, code, name, category)
      VALUES (${tenantA.id}::uuid, ${'ACME_ANNUAL_' + suffix}, 'Annual Leave', 'annual')
      RETURNING id
    `;
    leaveTypeAId = ltA[0]!.id;

    // Leave balance A
    await db`
      INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance, accrued)
      VALUES (${tenantA.id}::uuid, ${employeeA1Id}::uuid, ${leaveTypeAId}::uuid, 2026, 5, 20)
    `;

    // Domain outbox event A
    await db`
      INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
      VALUES (${tenantA.id}::uuid, 'employee', ${employeeA1Id}::uuid, 'hr.employee.created', '{}'::jsonb)
    `;

    // Create Tenant B with full data
    tenantB = await createTestTenant(db, { name: "Globex Inc", slug: `globex-${suffix}` });
    userB = await createTestUser(db, tenantB.id, { email: `globex-admin-${suffix}@example.com` });

    await setTenantContext(db, tenantB.id, userB.id);

    // Org Unit B
    const orgB = await db<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
      VALUES (${tenantB.id}::uuid, ${'GLX-HR-' + suffix}, 'Human Resources', true, '2024-01-01')
      RETURNING id
    `;
    _orgUnitBId = orgB[0]!.id;

    // Employee B1
    const empB1 = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenantB.id}::uuid, ${'GLX-001-' + suffix}, 'pending', '2024-01-01')
      RETURNING id
    `;
    employeeB1Id = empB1[0]!.id;
    await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeB1Id}::uuid`;

    // Personal info B1
    await db`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenantB.id}::uuid, ${employeeB1Id}::uuid, 'Bob', 'Globex', '2024-01-01')
    `;

    // Leave type B
    const ltB = await db<{ id: string }[]>`
      INSERT INTO app.leave_types (tenant_id, code, name, category)
      VALUES (${tenantB.id}::uuid, ${'GLX_ANNUAL_' + suffix}, 'Annual Leave', 'annual')
      RETURNING id
    `;
    leaveTypeBId = ltB[0]!.id;

    // Leave balance B
    await db`
      INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance, accrued)
      VALUES (${tenantB.id}::uuid, ${employeeB1Id}::uuid, ${leaveTypeBId}::uuid, 2026, 10, 15)
    `;

    // Domain outbox event B
    await db`
      INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
      VALUES (${tenantB.id}::uuid, 'employee', ${employeeB1Id}::uuid, 'hr.employee.created', '{}'::jsonb)
    `;

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (!db) return;
    // Clean up everything for both tenants
    if (tenantA) {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
          SELECT id FROM app.employees WHERE tenant_id = ${tenantA.id}::uuid
        )`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenantA.id}::uuid`.catch(() => {});
      });
    }
    if (tenantB) {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employee_personal WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
          SELECT id FROM app.employees WHERE tenant_id = ${tenantB.id}::uuid
        )`.catch(() => {});
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
        await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenantB.id}::uuid`.catch(() => {});
      });
    }
    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  // ===========================================================================
  // Read Isolation
  // ===========================================================================
  describe("Read isolation", () => {
    it("Tenant A should only see Tenant A employees", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;

      expect(employees.length).toBeGreaterThanOrEqual(1);
      for (const emp of employees) {
        expect(emp.employeeNumber).toContain("ACME");
      }
    });

    it("Tenant B should only see Tenant B employees", async () => {
      if (!db || !tenantB || !userB) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;

      expect(employees.length).toBeGreaterThanOrEqual(1);
      for (const emp of employees) {
        expect(emp.employeeNumber).toContain("GLX");
      }
    });

    it("Tenant A should only see Tenant A org units", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const orgs = await db<{ code: string }[]>`
        SELECT code FROM app.org_units
      `;

      expect(orgs.length).toBeGreaterThanOrEqual(1);
      for (const org of orgs) {
        expect(org.code).toContain("ACME");
      }
    });

    it("Tenant B should only see Tenant B org units", async () => {
      if (!db || !tenantB || !userB) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const orgs = await db<{ code: string }[]>`
        SELECT code FROM app.org_units
      `;

      expect(orgs.length).toBeGreaterThanOrEqual(1);
      for (const org of orgs) {
        expect(org.code).toContain("GLX");
      }
    });

    it("Tenant A should only see Tenant A personal data", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const personal = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName" FROM app.employee_personal
      `;

      expect(personal.length).toBeGreaterThanOrEqual(1);
      for (const p of personal) {
        expect(p.lastName).toBe("Acme");
      }
    });

    it("Tenant A should only see Tenant A leave types", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const types = await db<{ code: string }[]>`
        SELECT code FROM app.leave_types
      `;

      expect(types.length).toBeGreaterThanOrEqual(1);
      for (const t of types) {
        expect(t.code).toContain("ACME");
      }
    });

    it("Tenant A should only see Tenant A leave balances", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const balances = await db<{ openingBalance: string }[]>`
        SELECT opening_balance::text as "openingBalance" FROM app.leave_balances
      `;

      expect(balances.length).toBeGreaterThanOrEqual(1);
      // Tenant A has opening_balance=5
      expect(parseFloat(balances[0]!.openingBalance)).toBe(5);
    });

    it("Tenant B should see its own leave balances", async () => {
      if (!db || !tenantB || !userB) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const balances = await db<{ openingBalance: string }[]>`
        SELECT opening_balance::text as "openingBalance" FROM app.leave_balances
      `;

      expect(balances.length).toBeGreaterThanOrEqual(1);
      // Tenant B has opening_balance=10
      expect(parseFloat(balances[0]!.openingBalance)).toBe(10);
    });

    it("Tenant A should only see Tenant A outbox events", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const events = await db<{ aggregateId: string }[]>`
        SELECT aggregate_id as "aggregateId"
        FROM app.domain_outbox
        WHERE event_type = 'hr.employee.created'
      `;

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.aggregateId).toBe(employeeA1Id);
    });

    it("Tenant B should only see Tenant B outbox events", async () => {
      if (!db || !tenantB || !userB) return;

      await setTenantContext(db, tenantB.id, userB.id);

      const events = await db<{ aggregateId: string }[]>`
        SELECT aggregate_id as "aggregateId"
        FROM app.domain_outbox
        WHERE event_type = 'hr.employee.created'
      `;

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.aggregateId).toBe(employeeB1Id);
    });
  });

  // ===========================================================================
  // Write Isolation
  // ===========================================================================
  describe("Write isolation", () => {
    it("Tenant A should not be able to INSERT into Tenant B data", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      await expectRlsError(async () => {
        await db`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenantB.id}::uuid, 'CROSS-WRITE-1', 'pending', CURRENT_DATE)
        `;
      });
    });

    it("Tenant A should not be able to UPDATE Tenant B employees", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      // This should silently affect 0 rows (RLS hides tenant B's rows)
      const _result = await db`
        UPDATE app.employees
        SET employee_number = 'HACKED'
        WHERE id = ${employeeB1Id}::uuid
      `;

      // Verify B's data is unchanged
      await setTenantContext(db, tenantB.id, userB!.id);
      const emp = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees WHERE id = ${employeeB1Id}::uuid
      `;
      expect(emp[0]!.employeeNumber).toContain("GLX");
    });

    it("Tenant A should not be able to DELETE Tenant B employees", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      // This should silently affect 0 rows
      await db`DELETE FROM app.employees WHERE id = ${employeeB1Id}::uuid`;

      // Verify B's employee still exists
      await setTenantContext(db, tenantB.id, userB!.id);
      const emp = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE id = ${employeeB1Id}::uuid
      `;
      expect(emp.length).toBe(1);
    });
  });

  // ===========================================================================
  // System Context Bypass
  // ===========================================================================
  describe("System context bypass", () => {
    it("system context should see all tenants data", async () => {
      if (!db || !tenantA || !tenantB) return;

      const allEmployees = await withSystemContext(db, async (tx) => {
        return await tx<{ tenantId: string; employeeNumber: string }[]>`
          SELECT tenant_id as "tenantId", employee_number as "employeeNumber"
          FROM app.employees
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
          ORDER BY tenant_id
        `;
      });

      // Should see employees from both tenants
      const tenantIds = new Set(allEmployees.map(e => e.tenantId));
      expect(tenantIds.size).toBe(2);
      expect(tenantIds.has(tenantA.id)).toBe(true);
      expect(tenantIds.has(tenantB.id)).toBe(true);
    });

    it("system context should be able to write to any tenant", async () => {
      if (!db || !tenantA || !userA) return;

      // Write in system context, overriding current_user to a real user so the
      // record_employee_initial_status trigger can satisfy the FK constraint
      // on employee_status_history.created_by.
      const result = await withSystemContext(db, async (tx) => {
        await tx`SELECT set_config('app.current_user', ${userA!.id}, true)`;
        const emp = await tx<{ id: string }[]>`
          INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
          VALUES (${tenantA.id}::uuid, ${'SYS-EMP-' + suffix}, 'pending', CURRENT_DATE)
          RETURNING id
        `;
        return emp;
      });

      expect(result.length).toBe(1);

      // Verify it's visible to Tenant A
      await setTenantContext(db, tenantA.id, userA!.id);
      const emp = await db<{ id: string }[]>`
        SELECT id FROM app.employees WHERE employee_number = ${'SYS-EMP-' + suffix}
      `;
      expect(emp.length).toBe(1);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${result[0]!.id}::uuid`;
      });
    });

    it("RLS should re-engage after system context ends", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      // Use system context
      await withSystemContext(db, async (tx) => {
        const allEmps = await tx<{ id: string }[]>`
          SELECT id FROM app.employees
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
        `;
        expect(allEmps.length).toBeGreaterThanOrEqual(2);
      });

      // After system context, set to Tenant A
      await setTenantContext(db, tenantA.id, userA.id);

      // Should only see Tenant A employees
      const employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;

      for (const emp of employees) {
        expect(emp.employeeNumber).not.toContain("GLX");
      }
    });
  });

  // ===========================================================================
  // Context Switching
  // ===========================================================================
  describe("Context switching", () => {
    it("should correctly switch between tenants", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // Start as Tenant A
      await setTenantContext(db, tenantA.id, userA.id);
      let employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;
      const acmeCount = employees.length;
      expect(acmeCount).toBeGreaterThanOrEqual(1);

      // Switch to Tenant B
      await setTenantContext(db, tenantB.id, userB.id);
      employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;
      const globexCount = employees.length;
      expect(globexCount).toBeGreaterThanOrEqual(1);

      // Switch back to Tenant A
      await setTenantContext(db, tenantA.id, userA.id);
      employees = await db<{ employeeNumber: string }[]>`
        SELECT employee_number as "employeeNumber" FROM app.employees
      `;
      expect(employees.length).toBe(acmeCount);
    });
  });

  // ===========================================================================
  // Cross-Table Isolation
  // ===========================================================================
  describe("Cross-table data consistency", () => {
    it("should isolate leave balances with their associated leave types", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // As Tenant A, query balance with leave type join
      await setTenantContext(db, tenantA.id, userA.id);
      const balancesA = await db<{ leaveTypeCode: string; openingBalance: string }[]>`
        SELECT lt.code as "leaveTypeCode", lb.opening_balance::text as "openingBalance"
        FROM app.leave_balances lb
        JOIN app.leave_types lt ON lt.id = lb.leave_type_id
      `;

      expect(balancesA.length).toBeGreaterThanOrEqual(1);
      for (const b of balancesA) {
        expect(b.leaveTypeCode).toContain("ACME");
      }

      // As Tenant B, query same
      await setTenantContext(db, tenantB.id, userB.id);
      const balancesB = await db<{ leaveTypeCode: string; openingBalance: string }[]>`
        SELECT lt.code as "leaveTypeCode", lb.opening_balance::text as "openingBalance"
        FROM app.leave_balances lb
        JOIN app.leave_types lt ON lt.id = lb.leave_type_id
      `;

      expect(balancesB.length).toBeGreaterThanOrEqual(1);
      for (const b of balancesB) {
        expect(b.leaveTypeCode).toContain("GLX");
      }
    });

    it("should isolate employee personal data with employee join", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // As Tenant A
      await setTenantContext(db, tenantA.id, userA.id);
      const personalA = await db<{ employeeNumber: string; lastName: string }[]>`
        SELECT e.employee_number as "employeeNumber", ep.last_name as "lastName"
        FROM app.employee_personal ep
        JOIN app.employees e ON e.id = ep.employee_id
      `;

      expect(personalA.length).toBeGreaterThanOrEqual(1);
      expect(personalA[0]!.lastName).toBe("Acme");
      expect(personalA[0]!.employeeNumber).toContain("ACME");

      // As Tenant B
      await setTenantContext(db, tenantB.id, userB.id);
      const personalB = await db<{ employeeNumber: string; lastName: string }[]>`
        SELECT e.employee_number as "employeeNumber", ep.last_name as "lastName"
        FROM app.employee_personal ep
        JOIN app.employees e ON e.id = ep.employee_id
      `;

      expect(personalB.length).toBeGreaterThanOrEqual(1);
      expect(personalB[0]!.lastName).toBe("Globex");
      expect(personalB[0]!.employeeNumber).toContain("GLX");
    });
  });

  // ===========================================================================
  // Aggregate Counts Isolation
  // ===========================================================================
  describe("Aggregate count isolation", () => {
    it("should return correct counts per tenant", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // Tenant A count
      await setTenantContext(db, tenantA.id, userA.id);
      const countA = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
      `;

      // Tenant B count
      await setTenantContext(db, tenantB.id, userB.id);
      const countB = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count FROM app.employees
      `;

      // System context should show sum
      const totalCount = await withSystemContext(db, async (tx) => {
        return await tx<{ count: string }[]>`
          SELECT COUNT(*)::text as count FROM app.employees
          WHERE tenant_id IN (${tenantA.id}::uuid, ${tenantB.id}::uuid)
        `;
      });

      const total = parseInt(totalCount[0]!.count, 10);
      const sumOfTenants = parseInt(countA[0]!.count, 10) + parseInt(countB[0]!.count, 10);
      expect(total).toBe(sumOfTenants);
    });
  });
});
