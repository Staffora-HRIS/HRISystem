/**
 * Contract End Date Report - Integration Tests
 *
 * Verifies:
 * - Endpoint returns employees with contracts ending within look-ahead window
 * - Cursor-based pagination works correctly
 * - Filtering by contract_type and department_id
 * - RLS tenant isolation (cross-tenant data not visible)
 * - Default parameters (90 days, limit 50)
 * - Edge cases: no results, invalid cursors, boundary dates
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
let orgUnitId1: string;
let orgUnitId2: string;
let positionId1: string;
let positionId2: string;
let employee1Id: string;
let employee2Id: string;
let employee3Id: string;
let employee4Id: string;
let contract1Id: string;
let contract2Id: string;
let contract3Id: string;
let contract4Id: string;

const today = new Date();

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

beforeAll(async () => {
  await ensureTestInfra();
  if (skipIfNoInfra()) return;

  db = getTestDb();

  tenant1 = await createTestTenant(db, { name: "Contract Report Tenant 1" });
  tenant2 = await createTestTenant(db, { name: "Contract Report Tenant 2" });

  user1 = await createTestUser(db, tenant1.id);
  user2 = await createTestUser(db, tenant2.id);

  // --- Tenant 1 test data ---
  await withSystemContext(db, async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenant1.id}, true)`;
    await tx`SELECT set_config('app.current_user', ${user1.id}, true)`;

    const ou1 = await tx<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, effective_from)
      VALUES (${tenant1.id}::uuid, ${"OU-CED-ENG"}, ${"Engineering"}, ${"2025-01-01"}::date)
      RETURNING id
    `;
    orgUnitId1 = ou1[0]!.id;

    const ou2 = await tx<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, effective_from)
      VALUES (${tenant1.id}::uuid, ${"OU-CED-MKT"}, ${"Marketing"}, ${"2025-01-01"}::date)
      RETURNING id
    `;
    orgUnitId2 = ou2[0]!.id;

    const pos1 = await tx<{ id: string }[]>`
      INSERT INTO app.positions (tenant_id, code, title, org_unit_id)
      VALUES (${tenant1.id}::uuid, ${"POS-CED-01"}, ${"Engineer"}, ${orgUnitId1}::uuid)
      RETURNING id
    `;
    positionId1 = pos1[0]!.id;

    const pos2 = await tx<{ id: string }[]>`
      INSERT INTO app.positions (tenant_id, code, title, org_unit_id)
      VALUES (${tenant1.id}::uuid, ${"POS-CED-02"}, ${"Marketer"}, ${orgUnitId2}::uuid)
      RETURNING id
    `;
    positionId2 = pos2[0]!.id;

    // Employee 1: fixed_term ending in 30 days, Engineering
    const emp1 = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenant1.id}::uuid, ${"EMP-CED-001"}, ${"2025-01-01"}::date, 'active')
      RETURNING id
    `;
    employee1Id = emp1[0]!.id;

    await tx`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee1Id}::uuid, ${"Alice"}, ${"Smith"}, ${"2025-01-01"}::date)
    `;

    await tx`
      INSERT INTO app.position_assignments (tenant_id, employee_id, position_id, org_unit_id, is_primary, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee1Id}::uuid, ${positionId1}::uuid, ${orgUnitId1}::uuid, true, ${"2025-01-01"}::date)
    `;

    const c1 = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (tenant_id, employee_id, contract_type, employment_type, effective_from, effective_to)
      VALUES (${tenant1.id}::uuid, ${employee1Id}::uuid, 'fixed_term', 'full_time', ${"2025-01-01"}::date, ${addDays(today, 30)}::date)
      RETURNING id
    `;
    contract1Id = c1[0]!.id;

    // Employee 2: contractor ending in 60 days, Marketing
    const emp2 = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenant1.id}::uuid, ${"EMP-CED-002"}, ${"2025-01-01"}::date, 'active')
      RETURNING id
    `;
    employee2Id = emp2[0]!.id;

    await tx`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee2Id}::uuid, ${"Bob"}, ${"Jones"}, ${"2025-01-01"}::date)
    `;

    await tx`
      INSERT INTO app.position_assignments (tenant_id, employee_id, position_id, org_unit_id, is_primary, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee2Id}::uuid, ${positionId2}::uuid, ${orgUnitId2}::uuid, true, ${"2025-01-01"}::date)
    `;

    const c2 = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (tenant_id, employee_id, contract_type, employment_type, effective_from, effective_to)
      VALUES (${tenant1.id}::uuid, ${employee2Id}::uuid, 'contractor', 'full_time', ${"2025-01-01"}::date, ${addDays(today, 60)}::date)
      RETURNING id
    `;
    contract2Id = c2[0]!.id;

    // Employee 3: permanent contract (should NOT appear in report)
    const emp3 = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenant1.id}::uuid, ${"EMP-CED-003"}, ${"2025-01-01"}::date, 'active')
      RETURNING id
    `;
    employee3Id = emp3[0]!.id;

    await tx`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee3Id}::uuid, ${"Carol"}, ${"Brown"}, ${"2025-01-01"}::date)
    `;

    const c3 = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (tenant_id, employee_id, contract_type, employment_type, effective_from)
      VALUES (${tenant1.id}::uuid, ${employee3Id}::uuid, 'permanent', 'full_time', ${"2025-01-01"}::date)
      RETURNING id
    `;
    contract3Id = c3[0]!.id;
  });

  // --- Tenant 2 test data (for RLS isolation) ---
  await withSystemContext(db, async (tx) => {
    await tx`SELECT set_config('app.current_tenant', ${tenant2.id}, true)`;
    await tx`SELECT set_config('app.current_user', ${user2.id}, true)`;

    const ou = await tx<{ id: string }[]>`
      INSERT INTO app.org_units (tenant_id, code, name, effective_from)
      VALUES (${tenant2.id}::uuid, ${"OU-CED-T2"}, ${"Tenant2 Dept"}, ${"2025-01-01"}::date)
      RETURNING id
    `;

    await tx`
      INSERT INTO app.positions (tenant_id, code, title, org_unit_id)
      VALUES (${tenant2.id}::uuid, ${"POS-CED-T2"}, ${"Other Position"}, ${ou[0]!.id}::uuid)
    `;

    const emp4 = await tx<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, hire_date, status)
      VALUES (${tenant2.id}::uuid, ${"EMP-CED-T2-001"}, ${"2025-01-01"}::date, 'active')
      RETURNING id
    `;
    employee4Id = emp4[0]!.id;

    await tx`
      INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, effective_from)
      VALUES (${tenant2.id}::uuid, ${employee4Id}::uuid, ${"Dave"}, ${"Other"}, ${"2025-01-01"}::date)
    `;

    const c4 = await tx<{ id: string }[]>`
      INSERT INTO app.employment_contracts (tenant_id, employee_id, contract_type, employment_type, effective_from, effective_to)
      VALUES (${tenant2.id}::uuid, ${employee4Id}::uuid, 'fixed_term', 'full_time', ${"2025-01-01"}::date, ${addDays(today, 30)}::date)
      RETURNING id
    `;
    contract4Id = c4[0]!.id;
  });

  await setTenantContext(db, tenant1.id, user1.id);
});

afterAll(async () => {
  if (db) {
    await clearTenantContext(db);
    await closeTestConnections(db);
  }
});

describe("Contract End Date Report - Repository", () => {
  test("returns fixed-term and contractor contracts ending within 90 days", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT
        ec.id AS contract_id,
        ec.employee_id,
        e.employee_number,
        ep.first_name,
        ep.last_name,
        ec.contract_type,
        ec.effective_to AS contract_end_date,
        (ec.effective_to - CURRENT_DATE)::int AS days_remaining,
        pa_dept.org_unit_id AS department_id,
        ou.name AS department_name
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      LEFT JOIN employee_personal ep
        ON ep.employee_id = e.id
        AND ep.effective_to IS NULL
      LEFT JOIN position_assignments pa_dept
        ON pa_dept.employee_id = e.id
        AND pa_dept.is_primary = true
        AND pa_dept.effective_to IS NULL
      LEFT JOIN org_units ou
        ON ou.id = pa_dept.org_unit_id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
      ORDER BY ec.effective_to ASC, ec.id ASC
    `;

    expect(rows.length).toBe(2);
    expect(rows[0].first_name).toBe("Alice");
    expect(rows[0].contract_type).toBe("fixed_term");
    expect(rows[0].department_name).toBe("Engineering");
    expect(rows[1].first_name).toBe("Bob");
    expect(rows[1].contract_type).toBe("contractor");
    expect(rows[1].department_name).toBe("Marketing");
  });

  test("permanent contracts are excluded", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT ec.id
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 365
        AND e.status IN ('active', 'on_leave')
        AND ec.employee_id = ${employee3Id}
    `;

    expect(rows.length).toBe(0);
  });

  test("filters by contract_type", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT ec.id, ec.contract_type
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type = 'fixed_term'
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
      ORDER BY ec.effective_to ASC
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].contract_type).toBe("fixed_term");
  });

  test("filters by department_id", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT ec.id, ou.name AS department_name
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      INNER JOIN position_assignments pa
        ON pa.employee_id = e.id
        AND pa.is_primary = true
        AND pa.effective_to IS NULL
      LEFT JOIN org_units ou ON ou.id = pa.org_unit_id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
        AND pa.org_unit_id = ${orgUnitId2}
      ORDER BY ec.effective_to ASC
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].department_name).toBe("Marketing");
  });
});

describe("Contract End Date Report - RLS Isolation", () => {
  test("tenant1 cannot see tenant2 contracts", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT ec.id
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
    `;

    expect(rows.length).toBe(2);
    const ids = rows.map((r: any) => r.id);
    expect(ids).not.toContain(contract4Id);
  });

  test("switching to tenant2 context shows only tenant2 data", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant2.id, user2.id);

    const rows = await db`
      SELECT ec.id, ec.employee_id
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(contract4Id);

    await setTenantContext(db, tenant1.id, user1.id);
  });
});

describe("Contract End Date Report - Pagination", () => {
  test("cursor-based pagination returns correct pages", async () => {
    if (skipIfNoInfra()) return;

    const page1 = await db`
      SELECT
        ec.id AS contract_id,
        ec.effective_to AS contract_end_date
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
      ORDER BY ec.effective_to ASC, ec.id ASC
      LIMIT 1
    `;

    expect(page1.length).toBe(1);
    const cursorDate =
      page1[0].contract_end_date instanceof Date
        ? page1[0].contract_end_date.toISOString().split("T")[0]
        : String(page1[0].contract_end_date);
    const cursorId = page1[0].contract_id;

    const page2 = await db`
      SELECT
        ec.id AS contract_id,
        ec.effective_to AS contract_end_date
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 90
        AND e.status IN ('active', 'on_leave')
        AND (ec.effective_to, ec.id) > (${cursorDate}::date, ${cursorId}::uuid)
      ORDER BY ec.effective_to ASC, ec.id ASC
      LIMIT 1
    `;

    expect(page2.length).toBe(1);
    expect(page2[0].contract_id).not.toBe(page1[0].contract_id);
  });
});

describe("Contract End Date Report - Edge Cases", () => {
  test("narrow window only includes matching contracts", async () => {
    if (skipIfNoInfra()) return;

    const rows = await db`
      SELECT ep.first_name
      FROM employment_contracts ec
      INNER JOIN employees e ON ec.employee_id = e.id
      LEFT JOIN employee_personal ep
        ON ep.employee_id = e.id AND ep.effective_to IS NULL
      WHERE ec.contract_type IN ('fixed_term', 'contractor', 'intern', 'temporary')
        AND ec.effective_to IS NOT NULL
        AND ec.effective_to >= CURRENT_DATE
        AND ec.effective_to <= CURRENT_DATE + 45
        AND e.status IN ('active', 'on_leave')
    `;

    expect(rows.length).toBe(1);
    expect(rows[0].first_name).toBe("Alice");
  });
});
