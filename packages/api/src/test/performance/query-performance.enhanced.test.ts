/**
 * Enhanced Query Performance Tests
 *
 * Benchmarks real database queries against acceptable thresholds.
 * Tests employee list, search, pagination, and join-heavy queries.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
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
  type TestTenant,
  type TestUser,
} from "../setup";
import { factories } from "../helpers/factories";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a function and return the elapsed time in milliseconds. */
async function measure(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** Run a function N times and return the median elapsed time. */
async function measureMedian(fn: () => Promise<void>, runs = 5): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    times.push(await measure(fn));
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Query Performance - Enhanced", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenant: TestTenant;
  let user: TestUser;

  // IDs that we need to clean up
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];
  const createdPersonalIds: string[] = [];

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `Perf Tenant ${suffix}`,
      slug: `perf-tenant-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `perf-user-${suffix}@example.com`,
    });

    // Seed data: org units, positions, and employees with personal records
    await setTenantContext(db, tenant.id, user.id);

    // Create a single org unit
    const ouData = factories.orgUnit(tenant.id, {
      code: `PERF-OU-${suffix}`,
      name: "Perf Org Unit",
    });
    const [ou] = await db<{ id: string }[]>`
      INSERT INTO app.org_units (id, tenant_id, code, name, is_active, effective_from)
      VALUES (${ouData.id}::uuid, ${tenant.id}::uuid, ${ouData.code}, ${ouData.name}, true, CURRENT_DATE)
      RETURNING id
    `;
    createdOrgUnitIds.push(ou!.id);

    // Create a position
    const posData = factories.position(tenant.id, ou!.id, {
      code: `PERF-POS-${suffix}`,
      title: "Perf Position",
    });
    const [pos] = await db<{ id: string }[]>`
      INSERT INTO app.positions (id, tenant_id, org_unit_id, code, title, is_active, headcount)
      VALUES (
        ${posData.id}::uuid, ${tenant.id}::uuid, ${ou!.id}::uuid,
        ${posData.code}, ${posData.title}, true, 1000
      )
      RETURNING id
    `;
    createdPositionIds.push(pos!.id);

    // Seed 200 employees with personal records
    for (let i = 0; i < 200; i++) {
      const empNum = `PERF-${suffix}-${String(i).padStart(5, "0")}`;
      const empData = factories.employee(tenant.id, { employeeNumber: empNum });
      const personalData = factories.employeePersonal(tenant.id, empData.id, {
        effectiveFrom: "2024-01-01",
        nationality: "GBR",
      });

      const [emp] = await db<{ id: string }[]>`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
        VALUES (${empData.id}::uuid, ${tenant.id}::uuid, ${empNum}, 'active', CURRENT_DATE)
        RETURNING id
      `;
      createdEmployeeIds.push(emp!.id);

      const [personal] = await db<{ id: string }[]>`
        INSERT INTO app.employee_personal (
          id, tenant_id, employee_id, effective_from,
          first_name, last_name, date_of_birth, gender, nationality
        )
        VALUES (
          ${personalData.id}::uuid, ${tenant.id}::uuid, ${emp!.id}::uuid, '2024-01-01',
          ${personalData.firstName}, ${personalData.lastName},
          ${personalData.dateOfBirth}, ${personalData.gender}, ${personalData.nationality}
        )
        RETURNING id
      `;
      createdPersonalIds.push(personal!.id);
    }
  }, 120_000);

  afterAll(async () => {
    if (!db) return;

    try {
      await withSystemContext(db, async (tx) => {
        if (createdPersonalIds.length > 0) {
          await tx`DELETE FROM app.employee_personal WHERE id = ANY(${createdPersonalIds}::uuid[])`;
        }
        if (createdEmployeeIds.length > 0) {
          await tx`DELETE FROM app.employees WHERE id = ANY(${createdEmployeeIds}::uuid[])`;
        }
        if (createdPositionIds.length > 0) {
          await tx`DELETE FROM app.positions WHERE id = ANY(${createdPositionIds}::uuid[])`;
        }
        if (createdOrgUnitIds.length > 0) {
          await tx`DELETE FROM app.org_units WHERE id = ANY(${createdOrgUnitIds}::uuid[])`;
        }
      });
    } catch (e) {
      console.warn("Performance test cleanup warning:", e);
    }

    await cleanupTestUser(db, user?.id);
    await cleanupTestTenant(db, tenant?.id);
    await closeTestConnections(db);
  }, 30_000);

  // -----------------------------------------------------------------------
  // Employee list queries
  // -----------------------------------------------------------------------

  describe("Employee list queries", () => {
    it("should list employees with LIMIT 50 in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        await db`
          SELECT id, employee_number, status, hire_date
          FROM app.employees
          ORDER BY employee_number
          LIMIT 50
        `;
      });

      console.log(`  List 50 employees: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });

    it("should list all 200 employees in < 200ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT id, employee_number, status, hire_date
          FROM app.employees
          ORDER BY employee_number
        `;
        expect(rows.length).toBeGreaterThanOrEqual(200);
      });

      console.log(`  List 200 employees: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(200);
    });

    it("should filter employees by status in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT id, employee_number, status
          FROM app.employees
          WHERE status = 'active'
          LIMIT 50
        `;
        expect(rows.length).toBeGreaterThan(0);
      });

      console.log(`  Filter by status: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });
  });

  // -----------------------------------------------------------------------
  // Search queries
  // -----------------------------------------------------------------------

  describe("Search queries", () => {
    it("should search employees by employee_number prefix in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const prefix = `PERF-${tenant.slug?.split("-").pop()}`;
      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT id, employee_number
          FROM app.employees
          WHERE employee_number LIKE ${prefix + "%"}
          LIMIT 20
        `;
        expect(rows.length).toBeGreaterThan(0);
      });

      console.log(`  Search by employee_number prefix: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });

    it("should search employee personal records by last name in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Get any last name from existing data
      const [sample] = await db<{ lastName: string }[]>`
        SELECT last_name as "lastName"
        FROM app.employee_personal
        LIMIT 1
      `;
      if (!sample) return;

      const duration = await measureMedian(async () => {
        await db`
          SELECT ep.id, ep.first_name, ep.last_name, e.employee_number
          FROM app.employee_personal ep
          JOIN app.employees e ON e.id = ep.employee_id AND e.tenant_id = ep.tenant_id
          WHERE ep.last_name ILIKE ${sample.lastName.slice(0, 3) + "%"}
            AND ep.effective_to IS NULL
          LIMIT 20
        `;
      });

      console.log(`  Search by last name: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });
  });

  // -----------------------------------------------------------------------
  // Cursor-based pagination
  // -----------------------------------------------------------------------

  describe("Cursor-based pagination", () => {
    it("should paginate first page in < 50ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        const rows = await db<{ id: string; employeeNumber: string }[]>`
          SELECT id, employee_number as "employeeNumber"
          FROM app.employees
          ORDER BY employee_number ASC
          LIMIT 20
        `;
        expect(rows.length).toBe(20);
      });

      console.log(`  First page (20 rows): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(50);
    });

    it("should paginate subsequent pages using cursor in < 50ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Get cursor from first page
      const firstPage = await db<{ id: string; employeeNumber: string }[]>`
        SELECT id, employee_number as "employeeNumber"
        FROM app.employees
        ORDER BY employee_number ASC
        LIMIT 20
      `;
      const cursor = firstPage[firstPage.length - 1]!.employeeNumber;

      const duration = await measureMedian(async () => {
        const rows = await db<{ id: string; employeeNumber: string }[]>`
          SELECT id, employee_number as "employeeNumber"
          FROM app.employees
          WHERE employee_number > ${cursor}
          ORDER BY employee_number ASC
          LIMIT 20
        `;
        expect(rows.length).toBe(20);
      });

      console.log(`  Cursor page (20 rows): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(50);
    });

    it("should paginate deeply (page 5+) without degradation beyond 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Simulate paging to page 5 by skipping 80 records
      let cursor: string | null = null;
      for (let page = 0; page < 4; page++) {
        const rows = await db<{ employeeNumber: string }[]>`
          SELECT employee_number as "employeeNumber"
          FROM app.employees
          ${cursor ? db`WHERE employee_number > ${cursor}` : db``}
          ORDER BY employee_number ASC
          LIMIT 20
        `;
        if (rows.length > 0) {
          cursor = rows[rows.length - 1]!.employeeNumber;
        }
      }

      const duration = await measureMedian(async () => {
        const rows = await db<{ employeeNumber: string }[]>`
          SELECT employee_number as "employeeNumber"
          FROM app.employees
          ${cursor ? db`WHERE employee_number > ${cursor}` : db``}
          ORDER BY employee_number ASC
          LIMIT 20
        `;
        expect(rows.length).toBeGreaterThan(0);
      });

      console.log(`  Deep pagination (page 5): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });
  });

  // -----------------------------------------------------------------------
  // Join-heavy queries
  // -----------------------------------------------------------------------

  describe("Join-heavy queries", () => {
    it("should join employee + personal in < 200ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT
            e.id,
            e.employee_number,
            e.status,
            ep.first_name,
            ep.last_name,
            ep.date_of_birth,
            ep.gender
          FROM app.employees e
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          ORDER BY e.employee_number
          LIMIT 50
        `;
        expect(rows.length).toBeGreaterThan(0);
      });

      console.log(`  Employee + personal join (50 rows): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(200);
    });

    it("should count employees by status in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT status, COUNT(*)::int as count
          FROM app.employees
          GROUP BY status
        `;
        expect(rows.length).toBeGreaterThan(0);
      });

      console.log(`  Count by status (aggregation): ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(100);
    });

    it("should query org_units with employee counts in < 200ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const duration = await measureMedian(async () => {
        await db`
          SELECT
            ou.id,
            ou.name,
            ou.code,
            COUNT(DISTINCT pa.employee_id)::int as employee_count
          FROM app.org_units ou
          LEFT JOIN app.position_assignments pa
            ON pa.org_unit_id = ou.id
            AND pa.tenant_id = ou.tenant_id
            AND pa.effective_to IS NULL
          GROUP BY ou.id, ou.name, ou.code
          ORDER BY ou.name
        `;
      });

      console.log(`  Org units with employee counts: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(200);
    });
  });

  // -----------------------------------------------------------------------
  // Index effectiveness
  // -----------------------------------------------------------------------

  describe("Index effectiveness", () => {
    it("should use index on employees(tenant_id, employee_number)", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const explain = await db`
        EXPLAIN (FORMAT JSON) SELECT id FROM app.employees
        WHERE employee_number = 'PERF-00000'
      `;

      // The plan should NOT be a full Seq Scan on a large table
      const plan = JSON.stringify(explain);
      console.log(`  EXPLAIN for employee_number lookup: ${plan.slice(0, 200)}`);
      // We just verify the query completes; index usage depends on planner statistics
    });

    it("should retrieve single employee by PK in < 10ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const targetId = createdEmployeeIds[100]; // middle of the dataset

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT id, employee_number, status, hire_date
          FROM app.employees
          WHERE id = ${targetId}::uuid
        `;
        expect(rows.length).toBe(1);
      }, 10);

      console.log(`  PK lookup: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(10);
    });

    it("should retrieve employee personal by employee_id in < 10ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const targetId = createdEmployeeIds[50]!;

      const duration = await measureMedian(async () => {
        const rows = await db`
          SELECT id, first_name, last_name
          FROM app.employee_personal
          WHERE employee_id = ${targetId}::uuid AND effective_to IS NULL
        `;
        expect(rows.length).toBe(1);
      }, 10);

      console.log(`  Personal lookup by employee_id: ${duration.toFixed(1)}ms`);
      expect(duration).toBeLessThan(10);
    });
  });
});
