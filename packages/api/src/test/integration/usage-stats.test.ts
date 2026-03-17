/**
 * Usage Stats Integration Tests
 *
 * Verifies:
 * - RLS isolation: Tenant A cannot see Tenant B's usage stats
 * - Daily stats upsert (insert + idempotent update)
 * - Monthly aggregation from daily rows
 * - Constraint enforcement (non-negative values, period validity)
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

describe("Usage Stats - Per-Tenant Analytics", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenantA: TestTenant | null = null;
  let tenantB: TestTenant | null = null;
  let userA: TestUser | null = null;
  let userB: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();

    const suffix = Date.now();

    tenantA = await createTestTenant(db, {
      name: `Usage Test Tenant A ${suffix}`,
      slug: `usage-a-${suffix}`,
    });
    tenantB = await createTestTenant(db, {
      name: `Usage Test Tenant B ${suffix}`,
      slug: `usage-b-${suffix}`,
    });

    userA = await createTestUser(db, tenantA.id, {
      email: `usage-a-${suffix}@example.com`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `usage-b-${suffix}@example.com`,
    });
  });

  afterAll(async () => {
    if (!db) return;

    // Clean up usage stats first, then users and tenants
    if (tenantA) {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.tenant_usage_stats WHERE tenant_id = ${tenantA!.id}::uuid`;
      });
    }
    if (tenantB) {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.tenant_usage_stats WHERE tenant_id = ${tenantB!.id}::uuid`;
      });
    }

    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  // =========================================================================
  // RLS Isolation
  // =========================================================================

  describe("RLS Isolation", () => {
    it("should not allow Tenant A to see Tenant B usage stats", async () => {
      if (!db || !tenantA || !tenantB || !userA || !userB) return;

      // Insert stats for Tenant B using system context
      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.tenant_usage_stats (
            tenant_id, period_start, period_end,
            active_users, api_requests, storage_bytes, employee_count, module_usage
          ) VALUES (
            ${tenantB!.id}::uuid, '2026-03-15', '2026-03-15',
            10, 500, 1048576, 25, '{"hr": 200, "time": 300}'::jsonb
          )
          ON CONFLICT (tenant_id, period_start, period_end)
          DO UPDATE SET active_users = EXCLUDED.active_users
        `;
      });

      // Set Tenant A context and try to query — should see 0 rows
      await setTenantContext(db, tenantA.id, userA.id);
      const rows = await db`
        SELECT * FROM app.tenant_usage_stats
        WHERE period_start = '2026-03-15'
      `;
      expect(rows.length).toBe(0);

      // Set Tenant B context — should see 1 row
      await setTenantContext(db, tenantB.id, userB.id);
      const bRows = await db`
        SELECT * FROM app.tenant_usage_stats
        WHERE period_start = '2026-03-15'
      `;
      expect(bRows.length).toBe(1);
      expect(Number(bRows[0]!.activeUsers)).toBe(10);
    });

    it("should prevent Tenant A from inserting stats for Tenant B", async () => {
      if (!db || !tenantA || !tenantB || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.tenant_usage_stats (
            tenant_id, period_start, period_end,
            active_users, api_requests, storage_bytes, employee_count, module_usage
          ) VALUES (
            ${tenantB!.id}::uuid, '2026-03-14', '2026-03-14',
            5, 100, 0, 10, '{}'::jsonb
          )
        `;
        // If we get here, RLS didn't block the insert — fail the test
        expect(true).toBe(false);
      } catch (err: any) {
        // RLS violation — INSERT policy check should fail
        expect(err.message || String(err)).toMatch(/row-level security|policy|new row violates/i);
      }
    });
  });

  // =========================================================================
  // Daily Stats Insert / Upsert
  // =========================================================================

  describe("Daily Stats", () => {
    it("should insert daily usage stats for a tenant", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      const [row] = await db`
        INSERT INTO app.tenant_usage_stats (
          tenant_id, period_start, period_end,
          active_users, api_requests, storage_bytes, employee_count, module_usage
        ) VALUES (
          ${tenantA.id}::uuid, '2026-03-10', '2026-03-10',
          15, 1200, 2097152, 42, '{"hr": 500, "absence": 300, "time": 400}'::jsonb
        )
        ON CONFLICT (tenant_id, period_start, period_end) DO UPDATE SET
          active_users = EXCLUDED.active_users
        RETURNING *
      `;

      expect(row).toBeDefined();
      expect(Number(row!.activeUsers)).toBe(15);
      expect(Number(row!.apiRequests)).toBe(1200);
      expect(Number(row!.storageBytes)).toBe(2097152);
      expect(Number(row!.employeeCount)).toBe(42);
      expect(row!.moduleUsage).toBeDefined();
    });

    it("should upsert (update) when inserting duplicate period", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      // First insert
      await db`
        INSERT INTO app.tenant_usage_stats (
          tenant_id, period_start, period_end,
          active_users, api_requests, storage_bytes, employee_count, module_usage
        ) VALUES (
          ${tenantA.id}::uuid, '2026-03-11', '2026-03-11',
          10, 500, 0, 30, '{}'::jsonb
        )
        ON CONFLICT (tenant_id, period_start, period_end) DO UPDATE SET
          active_users = EXCLUDED.active_users,
          api_requests = EXCLUDED.api_requests,
          employee_count = EXCLUDED.employee_count
      `;

      // Update via upsert
      const [updated] = await db`
        INSERT INTO app.tenant_usage_stats (
          tenant_id, period_start, period_end,
          active_users, api_requests, storage_bytes, employee_count, module_usage
        ) VALUES (
          ${tenantA.id}::uuid, '2026-03-11', '2026-03-11',
          20, 1000, 0, 35, '{}'::jsonb
        )
        ON CONFLICT (tenant_id, period_start, period_end) DO UPDATE SET
          active_users = EXCLUDED.active_users,
          api_requests = EXCLUDED.api_requests,
          employee_count = EXCLUDED.employee_count
        RETURNING *
      `;

      expect(Number(updated!.activeUsers)).toBe(20);
      expect(Number(updated!.apiRequests)).toBe(1000);
      expect(Number(updated!.employeeCount)).toBe(35);
    });
  });

  // =========================================================================
  // Constraint Enforcement
  // =========================================================================

  describe("Constraints", () => {
    it("should reject negative active_users", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.tenant_usage_stats (
            tenant_id, period_start, period_end,
            active_users, api_requests, storage_bytes, employee_count, module_usage
          ) VALUES (
            ${tenantA.id}::uuid, '2026-03-20', '2026-03-20',
            -1, 0, 0, 0, '{}'::jsonb
          )
        `;
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message || String(err)).toMatch(/ck_tenant_usage_stats_active_users|check/i);
      }
    });

    it("should reject period_end before period_start", async () => {
      if (!db || !tenantA || !userA) return;

      await setTenantContext(db, tenantA.id, userA.id);

      try {
        await db`
          INSERT INTO app.tenant_usage_stats (
            tenant_id, period_start, period_end,
            active_users, api_requests, storage_bytes, employee_count, module_usage
          ) VALUES (
            ${tenantA.id}::uuid, '2026-03-20', '2026-03-19',
            0, 0, 0, 0, '{}'::jsonb
          )
        `;
        expect(true).toBe(false);
      } catch (err: any) {
        expect(err.message || String(err)).toMatch(/ck_tenant_usage_stats_period|check/i);
      }
    });
  });

  // =========================================================================
  // Monthly Aggregation
  // =========================================================================

  describe("Monthly Aggregation", () => {
    it("should aggregate daily stats into monthly summaries", async () => {
      if (!db || !tenantA || !userA) return;

      // Insert several days of stats for Jan 2026 via system context
      await withSystemContext(db, async (tx) => {
        for (let day = 1; day <= 5; day++) {
          const dateStr = `2026-01-${String(day).padStart(2, "0")}`;
          await tx`
            INSERT INTO app.tenant_usage_stats (
              tenant_id, period_start, period_end,
              active_users, api_requests, storage_bytes, employee_count, module_usage
            ) VALUES (
              ${tenantA!.id}::uuid, ${dateStr}::date, ${dateStr}::date,
              ${10 + day}, ${100 * day}, ${1024 * day}, ${40 + day}, ${JSON.stringify({ hr: 50 * day })}::jsonb
            )
            ON CONFLICT (tenant_id, period_start, period_end) DO UPDATE SET
              active_users = EXCLUDED.active_users,
              api_requests = EXCLUDED.api_requests,
              storage_bytes = EXCLUDED.storage_bytes,
              employee_count = EXCLUDED.employee_count,
              module_usage = EXCLUDED.module_usage
          `;
        }
      });

      // Query monthly aggregation
      await setTenantContext(db, tenantA.id, userA.id);

      const rows = await db`
        SELECT
          date_trunc('month', period_start)::date AS period_start,
          (date_trunc('month', period_start) + interval '1 month' - interval '1 day')::date AS period_end,
          MAX(active_users) AS active_users,
          SUM(api_requests)::integer AS total_api_requests,
          ROUND(AVG(api_requests))::integer AS avg_daily_api_requests,
          MAX(storage_bytes) AS max_storage_bytes,
          ROUND(AVG(employee_count))::integer AS avg_employee_count,
          COUNT(*)::integer AS days_tracked
        FROM app.tenant_usage_stats
        WHERE period_start >= '2026-01-01'
          AND period_end <= '2026-01-31'
        GROUP BY date_trunc('month', period_start)
        ORDER BY date_trunc('month', period_start) DESC
      `;

      expect(rows.length).toBe(1);
      const jan = rows[0]!;

      // MAX(active_users) across days 1-5: 10+5 = 15
      expect(Number(jan.activeUsers)).toBe(15);

      // SUM(api_requests): 100+200+300+400+500 = 1500
      expect(Number(jan.totalApiRequests)).toBe(1500);

      // AVG(api_requests): 1500/5 = 300
      expect(Number(jan.avgDailyApiRequests)).toBe(300);

      // MAX(storage_bytes): 1024*5 = 5120
      expect(Number(jan.maxStorageBytes)).toBe(5120);

      // AVG(employee_count): (41+42+43+44+45)/5 = 43
      expect(Number(jan.avgEmployeeCount)).toBe(43);

      // 5 days tracked
      expect(Number(jan.daysTracked)).toBe(5);
    });
  });
});
