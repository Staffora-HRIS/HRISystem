/**
 * Compensation Analytics Routes Integration Tests
 *
 * Tests the GET /api/v1/analytics/compensation endpoint which provides:
 * - Salary distribution (min, max, median, percentiles)
 * - Compa-ratio analysis (employee salary / midpoint of pay range)
 * - Pay equity / gender pay gap by job level
 * - Headcount cost by department
 *
 * Seeds real data across two tenants and verifies RLS isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as bcrypt from "bcryptjs";
import { app } from "../../../app";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { buildCookieHeader } from "../../helpers/cookies";

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Compensation Analytics Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  const password = "TestPassword123!";
  const createdEmployeeIds: string[] = [];
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];

  async function bootstrapAuthUser(
    tenant: TestTenant,
    user: TestUser
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(password, 12);

    await withSystemContext(db!, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin', 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [tenant.id, user.id]
      );

      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [user.id, user.email, user.email]
      );

      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [user.id, user.email, passwordHash]
      );
    });

    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signIn.status).toBe(200);
    const cookie = buildCookieHeader(signIn);
    expect(cookie).toContain("staffora.session_token=");
    return cookie;
  }

  /**
   * Seed compensation test data for a tenant:
   * - 2 org units (Engineering, Sales)
   * - 2 positions with salary ranges and job grades
   * - 6 employees (3 male, 3 female) with compensation history
   * - Position assignments linking employees to positions
   */
  async function seedCompensationData(tenantId: string): Promise<void> {
    await withSystemContext(db!, async (tx) => {
      // Create org units
      const [eng] = (await tx.unsafe(
        `INSERT INTO app.org_units (tenant_id, name, code, type, level, is_active)
         VALUES ($1::uuid, 'Engineering', $2, 'department', 1, true)
         RETURNING id::text AS id`,
        [tenantId, `ENG-${Date.now()}`]
      )) as Array<{ id: string }>;
      createdOrgUnitIds.push(eng.id);

      const [sales] = (await tx.unsafe(
        `INSERT INTO app.org_units (tenant_id, name, code, type, level, is_active)
         VALUES ($1::uuid, 'Sales', $2, 'department', 1, true)
         RETURNING id::text AS id`,
        [tenantId, `SAL-${Date.now()}`]
      )) as Array<{ id: string }>;
      createdOrgUnitIds.push(sales.id);

      // Create positions with salary ranges and job grades
      const [seniorEng] = (await tx.unsafe(
        `INSERT INTO app.positions (tenant_id, code, title, org_unit_id, job_grade, min_salary, max_salary, currency, is_active)
         VALUES ($1::uuid, $2, 'Senior Engineer', $3::uuid, 'L5', 60000, 90000, 'GBP', true)
         RETURNING id::text AS id`,
        [tenantId, `SEN-ENG-${Date.now()}`, eng.id]
      )) as Array<{ id: string }>;
      createdPositionIds.push(seniorEng.id);

      const [salesRep] = (await tx.unsafe(
        `INSERT INTO app.positions (tenant_id, code, title, org_unit_id, job_grade, min_salary, max_salary, currency, is_active)
         VALUES ($1::uuid, $2, 'Sales Representative', $3::uuid, 'L3', 30000, 50000, 'GBP', true)
         RETURNING id::text AS id`,
        [tenantId, `SAL-REP-${Date.now()}`, sales.id]
      )) as Array<{ id: string }>;
      createdPositionIds.push(salesRep.id);

      // Create 6 employees
      const employeeData = [
        { number: `EMP-CA1-${Date.now()}`, gender: "male", salary: 75000, posId: seniorEng.id, orgId: eng.id },
        { number: `EMP-CA2-${Date.now()}`, gender: "male", salary: 80000, posId: seniorEng.id, orgId: eng.id },
        { number: `EMP-CA3-${Date.now()}`, gender: "female", salary: 70000, posId: seniorEng.id, orgId: eng.id },
        { number: `EMP-CA4-${Date.now()}`, gender: "female", salary: 40000, posId: salesRep.id, orgId: sales.id },
        { number: `EMP-CA5-${Date.now()}`, gender: "male", salary: 45000, posId: salesRep.id, orgId: sales.id },
        { number: `EMP-CA6-${Date.now()}`, gender: "female", salary: 35000, posId: salesRep.id, orgId: sales.id },
      ];

      for (const emp of employeeData) {
        const [employee] = (await tx.unsafe(
          `INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
           VALUES ($1::uuid, $2, 'active', CURRENT_DATE - INTERVAL '1 year')
           RETURNING id::text AS id`,
          [tenantId, emp.number]
        )) as Array<{ id: string }>;
        createdEmployeeIds.push(employee.id);

        // Employee personal (gender data for pay equity)
        await tx.unsafe(
          `INSERT INTO app.employee_personal (tenant_id, employee_id, first_name, last_name, gender, effective_from)
           VALUES ($1::uuid, $2::uuid, 'Test', 'Employee', $3::app.gender, CURRENT_DATE - INTERVAL '1 year')`,
          [tenantId, employee.id, emp.gender]
        );

        // Compensation history
        await tx.unsafe(
          `INSERT INTO app.compensation_history (tenant_id, employee_id, base_salary, currency, pay_frequency, effective_from, change_reason)
           VALUES ($1::uuid, $2::uuid, $3, 'GBP', 'annual', CURRENT_DATE - INTERVAL '1 year', 'hire')`,
          [tenantId, employee.id, emp.salary]
        );

        // Position assignment
        await tx.unsafe(
          `INSERT INTO app.position_assignments (tenant_id, employee_id, position_id, org_unit_id, is_primary, effective_from, assignment_reason)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, CURRENT_DATE - INTERVAL '1 year', 'hire')`,
          [tenantId, employee.id, emp.posId, emp.orgId]
        );
      }
    });
  }

  // =========================================================================
  // Setup / Teardown
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();

    const suffix = Date.now();

    tenantA = await createTestTenant(db, {
      name: `CompAnalytics Test A ${suffix}`,
      slug: `comp-analytics-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `comp-analytics-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    tenantB = await createTestTenant(db, {
      name: `CompAnalytics Test B ${suffix}`,
      slug: `comp-analytics-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `comp-analytics-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // Seed compensation data only for tenant A
    await seedCompensationData(tenantA.id);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up in reverse dependency order
      for (const empId of createdEmployeeIds) {
        await tx.unsafe("DELETE FROM app.position_assignments WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.compensation_history WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employee_personal WHERE employee_id = $1::uuid", [empId]).catch(() => {});
        await tx.unsafe("DELETE FROM app.employees WHERE id = $1::uuid", [empId]).catch(() => {});
      }
      for (const posId of createdPositionIds) {
        await tx.unsafe("DELETE FROM app.positions WHERE id = $1::uuid", [posId]).catch(() => {});
      }
      for (const ouId of createdOrgUnitIds) {
        await tx.unsafe("DELETE FROM app.org_units WHERE id = $1::uuid", [ouId]).catch(() => {});
      }

      for (const tenant of [tenantA, tenantB]) {
        if (tenant) {
          await tx.unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tenant.id]).catch(() => {});
        }
      }
    }).catch(() => {});

    await withSystemContext(db, async (tx) => {
      for (const user of [userA, userB]) {
        if (!user) continue;
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user.id]).catch(() => {});
      }
    }).catch(() => {});

    if (userA) await cleanupTestUser(db, userA.id);
    if (userB) await cleanupTestUser(db, userB.id);
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);
    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  // =========================================================================
  // Request helper
  // =========================================================================

  function makeRequest(
    path: string,
    method: string,
    cookie: string,
    tenantId: string,
  ): Request {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Tenant-ID": tenantId,
    };
    return new Request(`http://localhost${path}`, { method, headers });
  }

  // =========================================================================
  // Tests
  // =========================================================================

  describe("GET /api/v1/analytics/compensation", () => {
    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/analytics/compensation", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA.id,
          },
        })
      );

      expect(res.status).toBe(401);
    });

    it("should return compensation dashboard with all sections", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;

      // Verify summary section with percentiles
      expect(body).toHaveProperty("summary");
      expect(body.summary.total_employees).toBeGreaterThanOrEqual(6);
      expect(body.summary.avg_salary).toBeGreaterThan(0);
      expect(body.summary.median_salary).toBeGreaterThan(0);
      expect(body.summary.min_salary).toBeGreaterThan(0);
      expect(body.summary.max_salary).toBeGreaterThan(0);
      expect(body.summary.p25_salary).toBeGreaterThan(0);
      expect(body.summary.p75_salary).toBeGreaterThan(0);
      expect(body.summary.p90_salary).toBeGreaterThan(0);
      expect(body.summary.total_payroll).toBeGreaterThan(0);
      expect(body.summary.currency).toBe("GBP");

      // Percentiles should be ordered: p25 <= median <= p75 <= p90
      expect(body.summary.p25_salary).toBeLessThanOrEqual(body.summary.median_salary);
      expect(body.summary.median_salary).toBeLessThanOrEqual(body.summary.p75_salary);
      expect(body.summary.p75_salary).toBeLessThanOrEqual(body.summary.p90_salary);

      // Verify salary band distribution
      expect(body).toHaveProperty("by_band");
      expect(Array.isArray(body.by_band)).toBe(true);
      expect(body.by_band.length).toBeGreaterThan(0);
      for (const band of body.by_band) {
        expect(band).toHaveProperty("band");
        expect(band).toHaveProperty("count");
        expect(band).toHaveProperty("percentage");
        expect(band).toHaveProperty("avg_salary");
      }

      // Verify department breakdown
      expect(body).toHaveProperty("by_department");
      expect(Array.isArray(body.by_department)).toBe(true);
      expect(body.by_department.length).toBeGreaterThanOrEqual(2); // Engineering + Sales
      for (const dept of body.by_department) {
        expect(dept).toHaveProperty("org_unit_id");
        expect(dept).toHaveProperty("org_unit_name");
        expect(dept).toHaveProperty("headcount");
        expect(dept).toHaveProperty("avg_salary");
        expect(dept).toHaveProperty("median_salary");
        expect(dept).toHaveProperty("min_salary");
        expect(dept).toHaveProperty("max_salary");
        expect(dept).toHaveProperty("total_payroll");
      }

      // Verify recent changes
      expect(body).toHaveProperty("recent_changes");
      expect(Array.isArray(body.recent_changes)).toBe(true);

      // Verify compa-ratio section
      expect(body).toHaveProperty("compa_ratio");
      expect(body.compa_ratio).toHaveProperty("overall_avg_compa_ratio");
      expect(body.compa_ratio).toHaveProperty("total_employees_with_range");
      expect(body.compa_ratio).toHaveProperty("total_below_range");
      expect(body.compa_ratio).toHaveProperty("total_within_range");
      expect(body.compa_ratio).toHaveProperty("total_above_range");
      expect(body.compa_ratio).toHaveProperty("by_grade");
      expect(Array.isArray(body.compa_ratio.by_grade)).toBe(true);

      // Should have compa-ratio data since we have positions with salary ranges
      expect(body.compa_ratio.total_employees_with_range).toBeGreaterThanOrEqual(6);
      expect(body.compa_ratio.by_grade.length).toBeGreaterThanOrEqual(2); // L5 and L3

      for (const grade of body.compa_ratio.by_grade) {
        expect(grade).toHaveProperty("job_grade");
        expect(grade).toHaveProperty("headcount");
        expect(grade).toHaveProperty("range_min");
        expect(grade).toHaveProperty("range_max");
        expect(grade).toHaveProperty("range_midpoint");
        expect(grade).toHaveProperty("avg_salary");
        expect(grade).toHaveProperty("avg_compa_ratio");
        expect(grade).toHaveProperty("below_range_count");
        expect(grade).toHaveProperty("within_range_count");
        expect(grade).toHaveProperty("above_range_count");
        // range_midpoint should be between range_min and range_max
        expect(grade.range_midpoint).toBeGreaterThanOrEqual(grade.range_min);
        expect(grade.range_midpoint).toBeLessThanOrEqual(grade.range_max);
      }

      // Verify pay equity section
      expect(body).toHaveProperty("pay_equity");
      expect(body.pay_equity).toHaveProperty("total_male");
      expect(body.pay_equity).toHaveProperty("total_female");
      expect(body.pay_equity).toHaveProperty("overall_male_avg_salary");
      expect(body.pay_equity).toHaveProperty("overall_female_avg_salary");
      expect(body.pay_equity).toHaveProperty("overall_mean_pay_gap_percentage");
      expect(body.pay_equity).toHaveProperty("overall_median_pay_gap_percentage");
      expect(body.pay_equity).toHaveProperty("by_level");
      expect(Array.isArray(body.pay_equity.by_level)).toBe(true);

      // We seeded 3 male and 3 female employees
      expect(body.pay_equity.total_male).toBeGreaterThanOrEqual(3);
      expect(body.pay_equity.total_female).toBeGreaterThanOrEqual(3);

      for (const level of body.pay_equity.by_level) {
        expect(level).toHaveProperty("job_grade");
        expect(level).toHaveProperty("male_count");
        expect(level).toHaveProperty("female_count");
        expect(level).toHaveProperty("male_avg_salary");
        expect(level).toHaveProperty("female_avg_salary");
        expect(level).toHaveProperty("pay_gap_percentage");
        expect(level).toHaveProperty("male_median_salary");
        expect(level).toHaveProperty("female_median_salary");
        expect(level).toHaveProperty("median_pay_gap_percentage");
      }
    });

    it("should support org_unit_id filter", async () => {
      if (!sessionCookieA || !tenantA || createdOrgUnitIds.length < 1) return;

      const engOrgId = createdOrgUnitIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/analytics/compensation?org_unit_id=${engOrgId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;

      // Engineering has 3 employees (75k, 80k, 70k)
      expect(body.summary.total_employees).toBeGreaterThanOrEqual(3);
      expect(body.summary.min_salary).toBeGreaterThanOrEqual(70000);
    });

    it("should support currency filter", async () => {
      if (!sessionCookieA || !tenantA) return;

      // Request with a currency that has no data
      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation?currency=USD",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;

      // No USD data was seeded
      expect(body.summary.total_employees).toBe(0);
    });
  });

  describe("RLS isolation - compensation analytics", () => {
    it("tenant B should not see tenant A compensation data", async () => {
      if (!sessionCookieA || !sessionCookieB || !tenantA || !tenantB) return;

      // Tenant A should have compensation data
      const resA = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );
      expect(resA.status).toBe(200);
      const bodyA = await resA.json() as any;
      expect(bodyA.summary.total_employees).toBeGreaterThanOrEqual(6);

      // Tenant B should have zero employees (no data seeded for B)
      const resB = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation",
          "GET",
          sessionCookieB,
          tenantB.id
        )
      );
      expect(resB.status).toBe(200);
      const bodyB = await resB.json() as any;
      expect(bodyB.summary.total_employees).toBe(0);
      expect(bodyB.summary.total_payroll).toBe(0);

      // Tenant B should also have empty compa-ratio and pay equity
      expect(bodyB.compa_ratio.total_employees_with_range).toBe(0);
      expect(bodyB.compa_ratio.by_grade).toHaveLength(0);
      expect(bodyB.pay_equity.total_male).toBe(0);
      expect(bodyB.pay_equity.total_female).toBe(0);
      expect(bodyB.pay_equity.by_level).toHaveLength(0);
    });
  });

  describe("Compa-ratio correctness", () => {
    it("should calculate correct compa-ratio for L5 grade", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation?job_grade=L5",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;

      // L5 position: min=60000, max=90000, midpoint=75000
      // Employees: 75000, 80000, 70000 (all within range)
      const l5Grade = body.compa_ratio.by_grade.find((g: any) => g.job_grade === "L5");
      if (l5Grade) {
        expect(l5Grade.range_min).toBe(60000);
        expect(l5Grade.range_max).toBe(90000);
        expect(l5Grade.range_midpoint).toBe(75000);
        expect(l5Grade.headcount).toBeGreaterThanOrEqual(3);
        // All 3 employees are within range (70k, 75k, 80k all between 60k-90k)
        expect(l5Grade.within_range_count).toBeGreaterThanOrEqual(3);
        expect(l5Grade.below_range_count).toBe(0);
        expect(l5Grade.above_range_count).toBe(0);
        // Avg salary = (75000 + 80000 + 70000)/3 = 75000
        // Compa-ratio = 75000 / 75000 = 1.0
        expect(l5Grade.avg_compa_ratio).toBeGreaterThan(0.9);
        expect(l5Grade.avg_compa_ratio).toBeLessThan(1.1);
      }
    });
  });

  describe("Pay equity correctness", () => {
    it("should show gender breakdown by job level", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/compensation",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = await res.json() as any;

      // For L5: 2 male (75k, 80k) avg=77500, 1 female (70k) avg=70000
      // Pay gap = (77500 - 70000) / 77500 * 100 = 9.68%
      const l5 = body.pay_equity.by_level.find((l: any) => l.job_grade === "L5");
      if (l5) {
        expect(l5.male_count).toBeGreaterThanOrEqual(2);
        expect(l5.female_count).toBeGreaterThanOrEqual(1);
        expect(l5.male_avg_salary).toBeGreaterThan(l5.female_avg_salary);
        // Pay gap should be positive (men paid more)
        if (l5.pay_gap_percentage !== null) {
          expect(l5.pay_gap_percentage).toBeGreaterThan(0);
        }
      }

      // For L3: 1 male (45k), 2 female (40k, 35k) avg=37500
      // Pay gap = (45000 - 37500) / 45000 * 100 = 16.67%
      const l3 = body.pay_equity.by_level.find((l: any) => l.job_grade === "L3");
      if (l3) {
        expect(l3.male_count).toBeGreaterThanOrEqual(1);
        expect(l3.female_count).toBeGreaterThanOrEqual(2);
        if (l3.pay_gap_percentage !== null) {
          expect(l3.pay_gap_percentage).toBeGreaterThan(0);
        }
      }

      // Overall gap should exist and be positive (men paid more in our test data)
      if (body.pay_equity.overall_mean_pay_gap_percentage !== null) {
        expect(body.pay_equity.overall_mean_pay_gap_percentage).toBeGreaterThan(0);
      }
    });
  });
});
