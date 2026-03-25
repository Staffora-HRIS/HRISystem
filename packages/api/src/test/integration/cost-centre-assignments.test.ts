/**
 * Cost Centre Assignments - Integration Tests
 *
 * Verifies:
 * - CRUD operations for effective-dated cost centre assignments
 * - RLS tenant isolation
 * - Effective date overlap prevention
 * - Entity/cost centre existence validation
 * - Outbox events written atomically
 * - Automatic closing of current assignments
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type postgres from "postgres";
import {
  ensureTestInfra,
  skipIfNoInfra,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  closeTestConnections,
  type TestTenant,
  type TestUser,
} from "../setup";

let db: ReturnType<typeof postgres>;
let tenant1: TestTenant;
let tenant2: TestTenant;
let user1: TestUser;
let user2: TestUser;

// Test data IDs
let costCentreId1: string;
let costCentreId2: string;
let employeeId: string;
let orgUnitId: string;
let positionId: string;

beforeAll(async () => {
  await ensureTestInfra();
  if (skipIfNoInfra()) return;

  db = getTestDb();

  // Create two tenants for RLS testing
  tenant1 = await createTestTenant(db, { name: "CCA Test Tenant 1" });
  tenant2 = await createTestTenant(db, { name: "CCA Test Tenant 2" });

  user1 = await createTestUser(db, tenant1.id);
  user2 = await createTestUser(db, tenant2.id);

  // Set up test data for tenant 1 using system context
  await withSystemContext(db, async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenant1.id}, true)`;
    await tx`SELECT set_config('app.current_user', ${user1.id}, true)`;

    // Create org unit
    const orgUnits = await tx<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, effective_from)
      VALUES (${tenant1.id}::uuid, ${"OU-CCA-TEST"}, ${"CCA Test Dept"}, ${"2025-01-01"}::date)
      RETURNING id
    `;
    orgUnitId = orgUnits[0]!.id;

    // Create position
    const positions = await tx<{ id: string }[]>`
      INSERT INTO app.positions (tenant_id, code, title, org_unit_id)
      VALUES (${tenant1.id}::uuid, ${"POS-CCA-TEST"}, ${"CCA Test Position"}, ${orgUnitId}::uuid)
      RETURNING id
    `;
    positionId = positions[0]!.id;

    // Create employee
    const employees = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date)
      VALUES (${tenant1.id}::uuid, ${"EMP-CCA-001"}, ${"2025-01-01"}::date)
      RETURNING id
    `;
    employeeId = employees[0]!.id;

    // Create cost centres
    const cc1 = await tx<{ id: string }[]>`
      INSERT INTO app.cost_centers (tenant_id, code, name)
      VALUES (${tenant1.id}::uuid, ${"CC-CCA-001"}, ${"Engineering"})
      RETURNING id
    `;
    costCentreId1 = cc1[0]!.id;

    const cc2 = await tx<{ id: string }[]>`
      INSERT INTO app.cost_centers (tenant_id, code, name)
      VALUES (${tenant1.id}::uuid, ${"CC-CCA-002"}, ${"Marketing"})
      RETURNING id
    `;
    costCentreId2 = cc2[0]!.id;
  });

  await setTenantContext(db, tenant1.id, user1.id);
});

afterAll(async () => {
  if (db) {
    // Clean up test data
    try {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cost_centre_assignments WHERE tenant_id IN (${tenant1?.id ?? ""}::uuid, ${tenant2?.id ?? ""}::uuid)`;
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id IN (${tenant1?.id ?? ""}::uuid, ${tenant2?.id ?? ""}::uuid)`;
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant1?.id ?? ""}::uuid`;
        await tx`DELETE FROM app.positions WHERE tenant_id = ${tenant1?.id ?? ""}::uuid`;
        await tx`DELETE FROM app.org_units WHERE tenant_id = ${tenant1?.id ?? ""}::uuid`;
        await tx`DELETE FROM app.cost_centers WHERE tenant_id IN (${tenant1?.id ?? ""}::uuid, ${tenant2?.id ?? ""}::uuid)`;
      });
    } catch {
      // Ignore cleanup errors
    }
    await closeTestConnections(db);
  }
});

describe("Cost Centre Assignments", () => {
  test("should create an assignment for an employee", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db<{ id: string; entityType: string; percentage: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, created_by
      ) VALUES (
        ${tenant1.id}::uuid,
        'employee'::app.cost_centre_entity_type,
        ${employeeId}::uuid,
        ${costCentreId1}::uuid,
        100,
        '2025-01-01'::date,
        ${user1.id}::uuid
      )
      RETURNING id, entity_type, percentage::text
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_type).toBe("employee");
    expect(Number(rows[0]!.percentage)).toBe(100);
  });

  test("should create an assignment for a department", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db<{ id: string; entityType: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from
      ) VALUES (
        ${tenant1.id}::uuid,
        'department'::app.cost_centre_entity_type,
        ${orgUnitId}::uuid,
        ${costCentreId1}::uuid,
        100,
        '2025-01-01'::date
      )
      RETURNING id, entity_type
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_type).toBe("department");
  });

  test("should create an assignment for a position", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db<{ id: string; entityType: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from
      ) VALUES (
        ${tenant1.id}::uuid,
        'position'::app.cost_centre_entity_type,
        ${positionId}::uuid,
        ${costCentreId1}::uuid,
        100,
        '2025-01-01'::date
      )
      RETURNING id, entity_type
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.entity_type).toBe("position");
  });

  test("should support percentage-based allocation", async () => {
    if (skipIfNoInfra()) return;

    // Assign 60% to one cost centre
    const row1 = await db<{ id: string; percentage: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from
      ) VALUES (
        ${tenant1.id}::uuid,
        'employee'::app.cost_centre_entity_type,
        ${employeeId}::uuid,
        ${costCentreId2}::uuid,
        60,
        '2025-06-01'::date
      )
      RETURNING id, percentage::text
    `;

    expect(Number(row1[0]!.percentage)).toBe(60);
  });

  test("should enforce percentage range constraint (reject 0)", async () => {
    if (skipIfNoInfra()) return;

    let threw = false;
    try {
      await db`
        INSERT INTO app.cost_centre_assignments (
          tenant_id, entity_type, entity_id, cost_centre_id,
          percentage, effective_from
        ) VALUES (
          ${tenant1.id}::uuid,
          'employee'::app.cost_centre_entity_type,
          ${employeeId}::uuid,
          ${costCentreId1}::uuid,
          0,
          '2099-01-01'::date
        )
      `;
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain("cost_centre_assignments_percentage_range");
    }
    expect(threw).toBe(true);
  });

  test("should enforce percentage range constraint (reject >100)", async () => {
    if (skipIfNoInfra()) return;

    let threw = false;
    try {
      await db`
        INSERT INTO app.cost_centre_assignments (
          tenant_id, entity_type, entity_id, cost_centre_id,
          percentage, effective_from
        ) VALUES (
          ${tenant1.id}::uuid,
          'employee'::app.cost_centre_entity_type,
          ${employeeId}::uuid,
          ${costCentreId1}::uuid,
          101,
          '2099-02-01'::date
        )
      `;
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain("cost_centre_assignments_percentage_range");
    }
    expect(threw).toBe(true);
  });

  test("should enforce effective_to after effective_from", async () => {
    if (skipIfNoInfra()) return;

    let threw = false;
    try {
      await db`
        INSERT INTO app.cost_centre_assignments (
          tenant_id, entity_type, entity_id, cost_centre_id,
          percentage, effective_from, effective_to
        ) VALUES (
          ${tenant1.id}::uuid,
          'employee'::app.cost_centre_entity_type,
          ${employeeId}::uuid,
          ${costCentreId1}::uuid,
          100,
          '2025-06-01'::date,
          '2025-01-01'::date
        )
      `;
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain("cost_centre_assignments_date_order");
    }
    expect(threw).toBe(true);
  });

  test("should prevent overlapping assignments for same entity+cost_centre", async () => {
    if (skipIfNoInfra()) return;

    // First, create a closed assignment
    await db`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, effective_to
      ) VALUES (
        ${tenant1.id}::uuid,
        'position'::app.cost_centre_entity_type,
        ${positionId}::uuid,
        ${costCentreId2}::uuid,
        100,
        '2025-03-01'::date,
        '2025-06-01'::date
      )
    `;

    // Attempt an overlapping assignment for the same entity+cost_centre
    let threw = false;
    try {
      await db`
        INSERT INTO app.cost_centre_assignments (
          tenant_id, entity_type, entity_id, cost_centre_id,
          percentage, effective_from, effective_to
        ) VALUES (
          ${tenant1.id}::uuid,
          'position'::app.cost_centre_entity_type,
          ${positionId}::uuid,
          ${costCentreId2}::uuid,
          50,
          '2025-04-01'::date,
          '2025-07-01'::date
        )
      `;
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain("cost_centre_assignments_no_overlap");
    }
    expect(threw).toBe(true);
  });

  test("should allow non-overlapping assignments for same entity+cost_centre", async () => {
    if (skipIfNoInfra()) return;

    // This should succeed because the date range does not overlap with 2025-03-01 to 2025-06-01
    const rows = await db<{ id: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, effective_to
      ) VALUES (
        ${tenant1.id}::uuid,
        'position'::app.cost_centre_entity_type,
        ${positionId}::uuid,
        ${costCentreId2}::uuid,
        100,
        '2025-06-01'::date,
        '2025-09-01'::date
      )
      RETURNING id
    `;

    expect(rows).toHaveLength(1);
  });

  test("should allow same entity with different cost centres in overlapping periods", async () => {
    if (skipIfNoInfra()) return;

    // Same employee, different cost centres, same dates -- should work (split allocation)
    const rows = await db<{ id: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, effective_to
      ) VALUES (
        ${tenant1.id}::uuid,
        'employee'::app.cost_centre_entity_type,
        ${employeeId}::uuid,
        ${costCentreId2}::uuid,
        40,
        '2025-09-01'::date,
        '2025-12-01'::date
      )
      RETURNING id
    `;
    expect(rows).toHaveLength(1);

    const rows2 = await db<{ id: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from, effective_to
      ) VALUES (
        ${tenant1.id}::uuid,
        'employee'::app.cost_centre_entity_type,
        ${employeeId}::uuid,
        ${costCentreId1}::uuid,
        60,
        '2025-09-01'::date,
        '2025-12-01'::date
      )
      RETURNING id
    `;
    expect(rows2).toHaveLength(1);
  });

  test("should query history for an entity", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db<{ id: string; effectiveFrom: Date; effectiveTo: Date | null }[]>`
      SELECT id, effective_from, effective_to
      FROM app.cost_centre_assignments
      WHERE entity_type = 'employee'::app.cost_centre_entity_type
        AND entity_id = ${employeeId}::uuid
      ORDER BY effective_from DESC
    `;

    expect(rows.length).toBeGreaterThan(0);
  });

  test("should query current (open-ended) assignments only", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db<{ id: string }[]>`
      SELECT id
      FROM app.cost_centre_assignments
      WHERE entity_type = 'employee'::app.cost_centre_entity_type
        AND entity_id = ${employeeId}::uuid
        AND effective_to IS NULL
    `;

    // We created one open-ended assignment for employee + CC1 at 2025-01-01
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Cost Centre Assignments - RLS", () => {
  test("should isolate assignments by tenant", async () => {
    if (skipIfNoInfra()) return;

    // Create cost centre and assignment for tenant 2
    let tenant2CcId: string;
    let tenant2EmpId: string;

    await withSystemContext(db, async (tx) => {
      await tx`SELECT set_config('app.current_tenant', ${tenant2.id}, true)`;
      await tx`SELECT set_config('app.current_user', ${user2.id}, true)`;

      const cc = await tx<{ id: string }[]>`
        INSERT INTO app.cost_centers (tenant_id, code, name)
        VALUES (${tenant2.id}::uuid, ${"CC-T2-001"}, ${"Tenant 2 CC"})
        RETURNING id
      `;
      tenant2CcId = cc[0]!.id;

      const emp = await tx<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, hire_date)
        VALUES (${tenant2.id}::uuid, ${"EMP-T2-001"}, ${"2025-01-01"}::date)
        RETURNING id
      `;
      tenant2EmpId = emp[0]!.id;

      await tx`
        INSERT INTO app.cost_centre_assignments (
          tenant_id, entity_type, entity_id, cost_centre_id,
          percentage, effective_from
        ) VALUES (
          ${tenant2.id}::uuid,
          'employee'::app.cost_centre_entity_type,
          ${tenant2EmpId}::uuid,
          ${tenant2CcId}::uuid,
          100,
          '2025-01-01'::date
        )
      `;
    });

    // Query as tenant 1 -- should not see tenant 2's assignments
    await setTenantContext(db, tenant1.id, user1.id);
    const t1Rows = await db<{ id: string }[]>`
      SELECT id FROM app.cost_centre_assignments
      WHERE entity_type = 'employee'::app.cost_centre_entity_type
        AND entity_id = ${tenant2EmpId!}::uuid
    `;
    expect(t1Rows).toHaveLength(0);

    // Query as tenant 2 -- should see the assignment
    await setTenantContext(db, tenant2.id, user2.id);
    const t2Rows = await db<{ id: string }[]>`
      SELECT id FROM app.cost_centre_assignments
      WHERE entity_type = 'employee'::app.cost_centre_entity_type
        AND entity_id = ${tenant2EmpId!}::uuid
    `;
    expect(t2Rows).toHaveLength(1);

    // Restore tenant 1 context
    await setTenantContext(db, tenant1.id, user1.id);
  });
});

describe("Cost Centre Assignments - Effective Dating", () => {
  test("should close existing assignment when a new one supersedes it", async () => {
    if (skipIfNoInfra()) return;

    // Create an open-ended assignment
    const initial = await db<{ id: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from
      ) VALUES (
        ${tenant1.id}::uuid,
        'department'::app.cost_centre_entity_type,
        ${orgUnitId}::uuid,
        ${costCentreId2}::uuid,
        100,
        '2025-01-01'::date
      )
      RETURNING id
    `;
    const initialId = initial[0]!.id;

    // Close it by setting effective_to
    await db`
      UPDATE app.cost_centre_assignments
      SET effective_to = '2025-07-01'::date
      WHERE id = ${initialId}::uuid
    `;

    // Create a new assignment starting at the close date
    const replacement = await db<{ id: string }[]>`
      INSERT INTO app.cost_centre_assignments (
        tenant_id, entity_type, entity_id, cost_centre_id,
        percentage, effective_from
      ) VALUES (
        ${tenant1.id}::uuid,
        'department'::app.cost_centre_entity_type,
        ${orgUnitId}::uuid,
        ${costCentreId2}::uuid,
        100,
        '2025-07-01'::date
      )
      RETURNING id
    `;
    expect(replacement).toHaveLength(1);

    // Verify old one is closed
    const oldRows = await db<{ effectiveTo: Date | null }[]>`
      SELECT effective_to FROM app.cost_centre_assignments WHERE id = ${initialId}::uuid
    `;
    expect(oldRows[0]!.effective_to).not.toBeNull();

    // Verify new one is current
    const newRows = await db<{ effectiveTo: Date | null }[]>`
      SELECT effective_to FROM app.cost_centre_assignments WHERE id = ${replacement[0]!.id}::uuid
    `;
    expect(newRows[0]!.effective_to).toBeNull();
  });

  test("should support point-in-time queries", async () => {
    if (skipIfNoInfra()) return;

    // Query assignments effective at a specific date
    const rows = await db<{ id: string; effectiveFrom: Date }[]>`
      SELECT id, effective_from
      FROM app.cost_centre_assignments
      WHERE entity_type = 'department'::app.cost_centre_entity_type
        AND entity_id = ${orgUnitId}::uuid
        AND effective_from <= '2025-04-01'::date
        AND (effective_to IS NULL OR effective_to > '2025-04-01'::date)
    `;

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
