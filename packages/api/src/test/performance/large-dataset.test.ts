/**
 * Large Dataset Performance Tests
 *
 * Tests pagination, bulk insert, and aggregation performance
 * with larger data volumes.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Large Dataset Performance", () => {
  let db: ReturnType<typeof getTestDb>;
  let tenant: TestTenant;
  let user: TestUser;
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdOutboxIds: string[] = [];

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    db = getTestDb();
    const suffix = Date.now();
    tenant = await createTestTenant(db, {
      name: `LargeData Tenant ${suffix}`,
      slug: `large-data-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `large-data-${suffix}@example.com`,
    });
  }, 30_000);

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
        if (createdOrgUnitIds.length > 0) {
          await tx`DELETE FROM app.org_units WHERE id = ANY(${createdOrgUnitIds}::uuid[])`;
        }
      });
    } catch (e) {
      console.warn("Large dataset test cleanup warning:", e);
    }

    await cleanupTestUser(db, user?.id);
    await cleanupTestTenant(db, tenant?.id);
    await closeTestConnections(db);
  }, 60_000);

  // -----------------------------------------------------------------------
  // Bulk insert performance
  // -----------------------------------------------------------------------

  describe("Bulk insert performance", () => {
    it("should insert 500 employees in < 10s", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const batchSize = 50;
      const totalRecords = 500;
      const batches = Math.ceil(totalRecords / batchSize);

      const start = performance.now();

      for (let batch = 0; batch < batches; batch++) {
        const values: { id: string; empNum: string }[] = [];
        for (let i = 0; i < batchSize; i++) {
          const idx = batch * batchSize + i;
          values.push({
            id: crypto.randomUUID(),
            empNum: `BULK-${Date.now()}-${String(idx).padStart(5, "0")}`,
          });
        }

        // Use a multi-row insert for efficiency
        const rows = await db<{ id: string }[]>`
          INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
          SELECT
            (v->>'id')::uuid,
            ${tenant.id}::uuid,
            v->>'empNum',
            'active',
            CURRENT_DATE
          FROM jsonb_array_elements(${db.json(values)}) AS v
          RETURNING id
        `;

        for (const row of rows) {
          createdEmployeeIds.push(row.id);
        }
      }

      const duration = performance.now() - start;
      console.log(`  Inserted ${totalRecords} employees in ${duration.toFixed(0)}ms (${(totalRecords / (duration / 1000)).toFixed(0)} rows/sec)`);

      // Verify count
      const [countRow] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number LIKE 'BULK-%'
      `;
      expect(parseInt(countRow!.count, 10)).toBe(totalRecords);
      expect(duration).toBeLessThan(10_000);
    }, 30_000);
  });

  // -----------------------------------------------------------------------
  // Pagination with large result sets
  // -----------------------------------------------------------------------

  describe("Pagination with large result sets", () => {
    it("should paginate through all 500 records efficiently", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const pageSize = 50;
      let cursor: string | null = null;
      let totalFetched = 0;
      let pagesRead = 0;
      const pageTimes: number[] = [];

      while (true) {
        const start = performance.now();
        const rows = await db<{ id: string; employeeNumber: string }[]>`
          SELECT id, employee_number as "employeeNumber"
          FROM app.employees
          WHERE employee_number LIKE 'BULK-%'
            ${cursor ? db`AND employee_number > ${cursor}` : db``}
          ORDER BY employee_number ASC
          LIMIT ${pageSize}
        `;
        pageTimes.push(performance.now() - start);

        totalFetched += rows.length;
        pagesRead++;

        if (rows.length < pageSize) break;
        cursor = rows[rows.length - 1]!.employeeNumber;
      }

      const avgPageTime = pageTimes.reduce((a, b) => a + b, 0) / pageTimes.length;
      const maxPageTime = Math.max(...pageTimes);

      console.log(`  Paginated ${totalFetched} records in ${pagesRead} pages`);
      console.log(`  Avg page time: ${avgPageTime.toFixed(1)}ms, max: ${maxPageTime.toFixed(1)}ms`);

      expect(totalFetched).toBe(500);
      // Each page should complete in < 200ms
      expect(maxPageTime).toBeLessThan(200);
    }, 30_000);

    it("should COUNT(*) over 500 records in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const start = performance.now();
      const [row] = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.employees
        WHERE employee_number LIKE 'BULK-%'
      `;
      const duration = performance.now() - start;

      console.log(`  COUNT(*) over 500 records: ${duration.toFixed(1)}ms`);
      expect(parseInt(row!.count, 10)).toBe(500);
      expect(duration).toBeLessThan(100);
    });
  });

  // -----------------------------------------------------------------------
  // Aggregation queries
  // -----------------------------------------------------------------------

  describe("Aggregation queries with large datasets", () => {
    it("should aggregate employees by status in < 100ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const start = performance.now();
      const rows = await db<{ status: string; count: string }[]>`
        SELECT status, COUNT(*)::text as count
        FROM app.employees
        GROUP BY status
        ORDER BY count DESC
      `;
      const duration = performance.now() - start;

      console.log(`  Group by status: ${duration.toFixed(1)}ms (${rows.length} groups)`);
      expect(rows.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });

    it("should aggregate employees by hire_date month in < 200ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const start = performance.now();
      const rows = await db`
        SELECT
          date_trunc('month', hire_date)::date as month,
          COUNT(*)::int as count
        FROM app.employees
        GROUP BY date_trunc('month', hire_date)
        ORDER BY month DESC
      `;
      const duration = performance.now() - start;

      console.log(`  Group by hire month: ${duration.toFixed(1)}ms (${rows.length} months)`);
      expect(rows.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(200);
    });
  });

  // -----------------------------------------------------------------------
  // Outbox performance with large volumes
  // -----------------------------------------------------------------------

  describe("Outbox performance", () => {
    it("should bulk insert 100 outbox events in < 3s", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const events = Array.from({ length: 100 }, (_, i) => ({
        id: crypto.randomUUID(),
        aggregateId: crypto.randomUUID(),
        eventType: `perf.test.event.${i}`,
        payload: JSON.stringify({ index: i, timestamp: Date.now() }),
      }));

      const start = performance.now();

      const rows = await db<{ id: string }[]>`
        INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
        SELECT
          (v->>'id')::uuid,
          ${tenant.id}::uuid,
          'perf-test',
          (v->>'aggregateId')::uuid,
          v->>'eventType',
          (v->>'payload')::jsonb
        FROM jsonb_array_elements(${db.json(events)}) AS v
        RETURNING id
      `;

      const duration = performance.now() - start;
      console.log(`  Inserted 100 outbox events in ${duration.toFixed(0)}ms`);

      for (const row of rows) {
        createdOutboxIds.push(row.id);
      }

      expect(rows.length).toBe(100);
      expect(duration).toBeLessThan(3000);
    }, 10_000);

    it("should query unprocessed outbox events efficiently", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const start = performance.now();
      const rows = await db`
        SELECT id, aggregate_type, aggregate_id, event_type, created_at
        FROM app.domain_outbox
        WHERE processed_at IS NULL
          AND aggregate_type = 'perf-test'
        ORDER BY created_at ASC
        LIMIT 50
      `;
      const duration = performance.now() - start;

      console.log(`  Query unprocessed outbox: ${duration.toFixed(1)}ms (${rows.length} rows)`);
      expect(rows.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-org-unit query
  // -----------------------------------------------------------------------

  describe("Multi-entity aggregation", () => {
    beforeAll(async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      // Create 10 org units
      for (let i = 0; i < 10; i++) {
        const code = `LD-OU-${Date.now()}-${i}`;
        const [ou] = await db<{ id: string }[]>`
          INSERT INTO app.org_units (tenant_id, code, name, is_active, effective_from)
          VALUES (${tenant.id}::uuid, ${code}, ${"Large Dataset Org " + i}, true, CURRENT_DATE)
          RETURNING id
        `;
        createdOrgUnitIds.push(ou!.id);
      }
    }, 30_000);

    it("should list org units with counts in < 200ms", async () => {
      if (!isInfraAvailable()) return;
      await setTenantContext(db, tenant.id, user.id);

      const start = performance.now();
      const rows = await db`
        SELECT
          ou.id,
          ou.code,
          ou.name,
          ou.is_active,
          (
            SELECT COUNT(*)::int
            FROM app.position_assignments pa
            WHERE pa.org_unit_id = ou.id
              AND pa.tenant_id = ou.tenant_id
              AND pa.effective_to IS NULL
          ) as employee_count
        FROM app.org_units ou
        ORDER BY ou.name
      `;
      const duration = performance.now() - start;

      console.log(`  Org units with counts: ${duration.toFixed(1)}ms (${rows.length} rows)`);
      expect(rows.length).toBeGreaterThanOrEqual(10);
      expect(duration).toBeLessThan(200);
    });
  });
});
