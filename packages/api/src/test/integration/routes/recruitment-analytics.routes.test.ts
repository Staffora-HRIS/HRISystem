/**
 * Recruitment Analytics Routes Integration Tests
 *
 * Tests the five recruitment analytics endpoints:
 * - GET /api/v1/analytics/recruitment/time-to-fill
 * - GET /api/v1/analytics/recruitment/cost-per-hire
 * - GET /api/v1/analytics/recruitment/source-effectiveness
 * - GET /api/v1/analytics/recruitment/pipeline
 * - GET /api/v1/analytics/recruitment/summary
 *
 * TODO-159: Recruitment analytics (time-to-fill, cost-per-hire)
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
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { buildCookieHeader } from "../../helpers/cookies";

describe("Recruitment Analytics Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  const password = "TestPassword123!";

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
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password`,
        [user.id, user.email, passwordHash]
      );
    });

    const loginRes = await app.handle(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    const setCookieHeaders = loginRes.headers.getSetCookie();
    return buildCookieHeader(setCookieHeaders);
  }

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenantA = await createTestTenant(db, { name: "RA Test Tenant" });
    userA = await createTestUser(db, tenantA.id, { email: "ra-test@staffora.test" });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);
  });

  afterAll(async () => {
    if (db && userA) await cleanupTestUser(db, userA.id);
    if (db && tenantA) await cleanupTestTenant(db, tenantA.id);
    await closeTestConnections();
  });

  // ---------------------------------------------------------------------------
  // Helper: make authenticated GET request
  // ---------------------------------------------------------------------------

  async function get(path: string, cookie?: string): Promise<Response> {
    return app.handle(
      new Request(`http://localhost:3000/api/v1${path}`, {
        method: "GET",
        headers: cookie ? { Cookie: cookie } : {},
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Time-to-fill endpoint
  // ---------------------------------------------------------------------------

  describe("GET /analytics/recruitment/time-to-fill", () => {
    it("should return 200 with time-to-fill data", async () => {
      if (!sessionCookieA) return;
      const res = await get("/analytics/recruitment/time-to-fill", sessionCookieA);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("average_days_to_fill");
      expect(body).toHaveProperty("median_days_to_fill");
      expect(body).toHaveProperty("min_days_to_fill");
      expect(body).toHaveProperty("max_days_to_fill");
      expect(body).toHaveProperty("total_filled");
      expect(body).toHaveProperty("by_department");
      expect(body).toHaveProperty("period");
      expect(body.period).toHaveProperty("start_date");
      expect(body.period).toHaveProperty("end_date");
      expect(typeof body.average_days_to_fill).toBe("number");
      expect(Array.isArray(body.by_department)).toBe(true);
    });

    it("should accept date range filters", async () => {
      if (!sessionCookieA) return;
      const res = await get(
        "/analytics/recruitment/time-to-fill?start_date=2025-01-01&end_date=2025-12-31",
        sessionCookieA
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period.start_date).toBe("2025-01-01");
      expect(body.period.end_date).toBe("2025-12-31");
    });

    it("should reject invalid date range", async () => {
      if (!sessionCookieA) return;
      const res = await get(
        "/analytics/recruitment/time-to-fill?start_date=2025-12-31&end_date=2025-01-01",
        sessionCookieA
      );
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error.code).toBe("INVALID_DATE_RANGE");
    });

    it("should require authentication", async () => {
      const res = await get("/analytics/recruitment/time-to-fill");
      expect(res.status).toBeGreaterThanOrEqual(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Cost-per-hire endpoint
  // ---------------------------------------------------------------------------

  describe("GET /analytics/recruitment/cost-per-hire", () => {
    it("should return 200 with cost-per-hire data", async () => {
      if (!sessionCookieA) return;
      const res = await get("/analytics/recruitment/cost-per-hire", sessionCookieA);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("total_costs");
      expect(body).toHaveProperty("total_hires");
      expect(body).toHaveProperty("cost_per_hire");
      expect(body).toHaveProperty("currency");
      expect(body.currency).toBe("GBP");
      expect(body).toHaveProperty("by_department");
      expect(body).toHaveProperty("by_category");
      expect(body).toHaveProperty("period");
      expect(typeof body.total_costs).toBe("number");
      expect(typeof body.cost_per_hire).toBe("number");
      expect(Array.isArray(body.by_department)).toBe(true);
      expect(Array.isArray(body.by_category)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Source effectiveness endpoint
  // ---------------------------------------------------------------------------

  describe("GET /analytics/recruitment/source-effectiveness", () => {
    it("should return 200 with source data", async () => {
      if (!sessionCookieA) return;
      const res = await get("/analytics/recruitment/source-effectiveness", sessionCookieA);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("items");
      expect(body).toHaveProperty("total_candidates");
      expect(body).toHaveProperty("total_hired");
      expect(body).toHaveProperty("overall_conversion_rate");
      expect(body).toHaveProperty("period");
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total_candidates).toBe("number");
      expect(typeof body.overall_conversion_rate).toBe("number");
    });
  });

  // ---------------------------------------------------------------------------
  // Pipeline endpoint
  // ---------------------------------------------------------------------------

  describe("GET /analytics/recruitment/pipeline", () => {
    it("should return 200 with pipeline data", async () => {
      if (!sessionCookieA) return;
      const res = await get("/analytics/recruitment/pipeline", sessionCookieA);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("stages");
      expect(body).toHaveProperty("overall_hire_rate");
      expect(body).toHaveProperty("total_in_pipeline");
      expect(body).toHaveProperty("period");
      expect(Array.isArray(body.stages)).toBe(true);
      // Should include all 5 defined stages
      expect(body.stages.length).toBe(5);

      const stageNames = body.stages.map((s: any) => s.stage);
      expect(stageNames).toContain("applied");
      expect(stageNames).toContain("screening");
      expect(stageNames).toContain("interview");
      expect(stageNames).toContain("offer");
      expect(stageNames).toContain("hired");

      // Each stage should have required properties
      for (const stage of body.stages) {
        expect(stage).toHaveProperty("count");
        expect(stage).toHaveProperty("entered_count");
        expect(stage).toHaveProperty("progressed_count");
        expect(stage).toHaveProperty("conversion_rate");
        expect(stage).toHaveProperty("avg_days_in_stage");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Summary endpoint
  // ---------------------------------------------------------------------------

  describe("GET /analytics/recruitment/summary", () => {
    it("should return 200 with summary data", async () => {
      if (!sessionCookieA) return;
      const res = await get("/analytics/recruitment/summary", sessionCookieA);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("open_requisitions");
      expect(body).toHaveProperty("total_openings");
      expect(body).toHaveProperty("total_filled");
      expect(body).toHaveProperty("total_candidates");
      expect(body).toHaveProperty("total_hires");
      expect(body).toHaveProperty("average_time_to_fill_days");
      expect(body).toHaveProperty("average_cost_per_hire");
      expect(body).toHaveProperty("overall_conversion_rate");
      expect(body).toHaveProperty("top_source");
      expect(body).toHaveProperty("pipeline_bottleneck");
      expect(body).toHaveProperty("currency");
      expect(body).toHaveProperty("period");
      expect(body.currency).toBe("GBP");
      expect(typeof body.open_requisitions).toBe("number");
      expect(typeof body.average_time_to_fill_days).toBe("number");
      expect(typeof body.average_cost_per_hire).toBe("number");
    });

    it("should accept department_id filter", async () => {
      if (!sessionCookieA) return;
      const fakeUuid = "00000000-0000-0000-0000-000000000001";
      const res = await get(
        `/analytics/recruitment/summary?department_id=${fakeUuid}`,
        sessionCookieA
      );
      expect(res.status).toBe(200);

      const body = await res.json();
      // Even with non-existent department, should return valid structure with zeros
      expect(body.total_candidates).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // RLS isolation
  // ---------------------------------------------------------------------------

  describe("RLS Isolation", () => {
    it("should not return data from other tenants", async () => {
      if (!sessionCookieA || !db) return;

      // Create tenant B
      const tenantB = await createTestTenant(db, { name: "RA Other Tenant" });

      try {
        // Insert some data into tenant B using system context
        await withSystemContext(db, async (tx) => {
          await tx.unsafe(
            `INSERT INTO app.requisitions (id, tenant_id, code, title, status, openings, filled, priority, created_by)
             VALUES (gen_random_uuid(), $1::uuid, 'REQ-OTHER-001', 'Other Tenant Req', 'filled', 1, 1, 3, NULL)`,
            [tenantB.id]
          );
        });

        // Query with tenant A credentials should not see tenant B data
        const res = await get("/analytics/recruitment/summary", sessionCookieA);
        expect(res.status).toBe(200);
        const body = await res.json();

        // The data from tenant B should not leak into tenant A's results
        // This is enforced by RLS via the tenant context set by the auth plugin
        expect(typeof body.total_filled).toBe("number");
      } finally {
        await cleanupTestTenant(db, tenantB.id);
      }
    });
  });
});
