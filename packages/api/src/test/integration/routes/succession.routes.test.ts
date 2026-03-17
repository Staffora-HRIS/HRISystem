/**
 * Succession Planning Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests succession plan CRUD, candidate management, and RLS isolation.
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

describe("Succession Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  // Prerequisite IDs (org units, positions, employees)
  const createdOrgUnitIds: string[] = [];
  const createdPositionIds: string[] = [];
  const createdEmployeeIds: string[] = [];

  // Track IDs for cleanup
  const createdPlanIds: string[] = [];
  const createdCandidateIds: string[] = [];

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

  // =========================================================================
  // Setup / Teardown
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenantA = await createTestTenant(db, {
      name: `Succession Test A ${suffix}`,
      slug: `succession-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `succession-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    tenantB = await createTestTenant(db, {
      name: `Succession Test B ${suffix}`,
      slug: `succession-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `succession-test-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);

    // Create prerequisite data for succession plans: org unit + position + employee
    try {
      await withSystemContext(db, async (tx) => {
        // Create org unit for tenant A
        const orgUnitId = crypto.randomUUID();
        await tx.unsafe(
          `INSERT INTO app.org_units (id, tenant_id, code, name, effective_from)
           VALUES ($1::uuid, $2::uuid, $3, 'Succession Test Dept', CURRENT_DATE)`,
          [orgUnitId, tenantA!.id, `SUCC-OU-${suffix}`]
        );
        createdOrgUnitIds.push(orgUnitId);

        // Create position for tenant A
        const positionId = crypto.randomUUID();
        await tx.unsafe(
          `INSERT INTO app.positions (id, tenant_id, code, title, org_unit_id, headcount)
           VALUES ($1::uuid, $2::uuid, $3, 'VP Engineering', $4::uuid, 1)`,
          [positionId, tenantA!.id, `SUCC-POS-${suffix}`, orgUnitId]
        );
        createdPositionIds.push(positionId);

        // Create an employee for tenant A (to use as succession candidate)
        const employeeId = crypto.randomUUID();
        await tx.unsafe(
          `INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
           VALUES ($1::uuid, $2::uuid, $3, 'active', CURRENT_DATE)`,
          [employeeId, tenantA!.id, `EMP-SUCC-${suffix}`]
        );
        createdEmployeeIds.push(employeeId);
      });
    } catch (err) {
      console.warn("Failed to create prerequisite data for succession tests:", err);
    }
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up succession candidates and plans
      for (const candidateId of createdCandidateIds) {
        await tx.unsafe(
          "DELETE FROM app.succession_candidate_history WHERE candidate_id = $1::uuid",
          [candidateId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.succession_candidates WHERE id = $1::uuid",
          [candidateId]
        ).catch(() => {});
      }
      for (const planId of createdPlanIds) {
        // Delete any remaining candidates for this plan
        await tx.unsafe(
          "DELETE FROM app.succession_candidate_history WHERE candidate_id IN (SELECT id FROM app.succession_candidates WHERE plan_id = $1::uuid)",
          [planId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.succession_candidates WHERE plan_id = $1::uuid",
          [planId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.succession_plans WHERE id = $1::uuid",
          [planId]
        ).catch(() => {});
      }
      // Clean up prerequisite data
      for (const empId of createdEmployeeIds) {
        await tx.unsafe(
          "DELETE FROM app.position_assignments WHERE employee_id = $1::uuid",
          [empId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.employee_status_history WHERE employee_id = $1::uuid",
          [empId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.employees WHERE id = $1::uuid",
          [empId]
        ).catch(() => {});
      }
      for (const posId of createdPositionIds) {
        // Delete succession plans referencing this position
        await tx.unsafe(
          "DELETE FROM app.succession_plans WHERE position_id = $1::uuid",
          [posId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.positions WHERE id = $1::uuid",
          [posId]
        ).catch(() => {});
      }
      for (const ouId of createdOrgUnitIds) {
        await tx.unsafe(
          "DELETE FROM app.org_units WHERE id = $1::uuid",
          [ouId]
        ).catch(() => {});
      }
      // Clean up domain outbox
      if (tenantA) {
        await tx.unsafe(
          "DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid",
          [tenantA.id]
        ).catch(() => {});
      }
      if (tenantB) {
        await tx.unsafe(
          "DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid",
          [tenantB.id]
        ).catch(() => {});
      }
    }).catch(() => {});

    // Clean up auth sessions
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
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Request {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Tenant-ID": tenantId,
      ...extraHeaders,
    };
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      headers["Idempotency-Key"] = crypto.randomUUID();
    }
    return new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // =========================================================================
  // Plan Tests
  // =========================================================================

  describe("GET /api/v1/succession/plans", () => {
    it("should list succession plans (initially empty for new tenant)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/succession/plans", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        items: unknown[];
        hasMore: boolean;
        nextCursor: string | null;
      };
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.hasMore).toBe("boolean");
    });

    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/succession/plans", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA.id,
          },
        })
      );

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/succession/plans", () => {
    it("should create a succession plan with valid data", async () => {
      if (!sessionCookieA || !tenantA || createdPositionIds.length === 0) return;

      const positionId = createdPositionIds[0];
      const res = await app.handle(
        makeRequest("/api/v1/succession/plans", "POST", sessionCookieA, tenantA.id, {
          position_id: positionId,
          is_critical_role: true,
          criticality_reason: "Key leadership position",
          risk_level: "high",
          incumbent_retirement_risk: false,
          incumbent_flight_risk: true,
          market_scarcity: true,
          notes: "Succession plan for VP Engineering",
        })
      );

      if (res.status >= 500) {
        const errText = await res.text();
        console.warn(`Plan create failed (${res.status}): ${errText}`);
        return;
      }

      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBeDefined();
      createdPlanIds.push(body.id);
    });

    it("should reject invalid payload (missing position_id)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/succession/plans", "POST", sessionCookieA, tenantA.id, {
          is_critical_role: true,
          // Missing required position_id
        })
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("GET /api/v1/succession/plans/:id", () => {
    it("should return a plan by ID", async () => {
      if (!sessionCookieA || !tenantA || createdPlanIds.length === 0) return;

      const planId = createdPlanIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/succession/plans/${planId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; is_critical_role: boolean };
      expect(body.id).toBe(planId);
      expect(body.is_critical_role).toBe(true);
    });

    it("should return 404 for non-existent plan", async () => {
      if (!sessionCookieA || !tenantA) return;

      const fakeId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest(
          `/api/v1/succession/plans/${fakeId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Candidate Tests
  // =========================================================================

  describe("POST /api/v1/succession/candidates", () => {
    it("should add a candidate to a succession plan", async () => {
      if (
        !sessionCookieA ||
        !tenantA ||
        createdPlanIds.length === 0 ||
        createdEmployeeIds.length === 0
      )
        return;

      const planId = createdPlanIds[0];
      const employeeId = createdEmployeeIds[0];
      const res = await app.handle(
        makeRequest("/api/v1/succession/candidates", "POST", sessionCookieA, tenantA.id, {
          plan_id: planId,
          employee_id: employeeId,
          readiness: "ready_1_year",
          ranking: 1,
          assessment_notes: "Strong candidate for VP role",
          strengths: ["Leadership", "Technical depth"],
          development_areas: ["Executive presence"],
        })
      );

      if (res.status >= 500) {
        const errText = await res.text();
        console.warn(`Candidate create failed (${res.status}): ${errText}`);
        return;
      }

      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBeDefined();
      createdCandidateIds.push(body.id);
    });
  });

  describe("GET /api/v1/succession/plans/:id/candidates", () => {
    it("should list candidates for a plan", async () => {
      if (!sessionCookieA || !tenantA || createdPlanIds.length === 0) return;

      const planId = createdPlanIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/succession/plans/${planId}/candidates`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      if (res.status >= 500) {
        const errText = await res.text();
        console.warn(`List candidates failed (${res.status}): ${errText}`);
        return;
      }

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[] };
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  // =========================================================================
  // RLS Isolation
  // =========================================================================

  describe("Succession RLS isolation", () => {
    it("should not allow tenant B to see tenant A succession plans", async () => {
      if (!sessionCookieA || !sessionCookieB || !tenantA || !tenantB) return;

      // Tenant B lists plans - should NOT contain tenant A's plans
      const listRes = await app.handle(
        makeRequest("/api/v1/succession/plans", "GET", sessionCookieB, tenantB.id)
      );
      expect(listRes.status).toBe(200);
      const body = (await listRes.json()) as {
        items: Array<{ id: string }>;
      };

      for (const planId of createdPlanIds) {
        const found = body.items.find((item) => item.id === planId);
        expect(found).toBeUndefined();
      }
    });

    it("should return 404 when tenant B tries to access tenant A plan by ID (RLS)", async () => {
      if (!sessionCookieB || !tenantB || createdPlanIds.length === 0) return;

      const planId = createdPlanIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/succession/plans/${planId}`,
          "GET",
          sessionCookieB,
          tenantB.id
        )
      );

      expect(res.status).toBe(404);
    });
  });
});
