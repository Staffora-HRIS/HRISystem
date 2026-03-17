/**
 * Benefits Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests carrier CRUD, plan listing, and RLS isolation.
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

describe("Benefits Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

  // Track IDs for cleanup
  const createdCarrierIds: string[] = [];
  const createdPlanIds: string[] = [];

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
      name: `Benefits Test A ${suffix}`,
      slug: `benefits-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `benefits-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    tenantB = await createTestTenant(db, {
      name: `Benefits Test B ${suffix}`,
      slug: `benefits-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `benefits-test-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      // Clean up plan costs, then plans, then carriers
      for (const planId of createdPlanIds) {
        await tx.unsafe(
          "DELETE FROM app.benefit_plan_costs WHERE plan_id = $1::uuid",
          [planId]
        ).catch(() => {});
        await tx.unsafe(
          "DELETE FROM app.benefit_plans WHERE id = $1::uuid",
          [planId]
        ).catch(() => {});
      }
      for (const carrierId of createdCarrierIds) {
        await tx.unsafe(
          "DELETE FROM app.benefit_carriers WHERE id = $1::uuid",
          [carrierId]
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
  // Carrier Tests
  // =========================================================================

  describe("GET /api/v1/benefits/carriers", () => {
    it("should list carriers (initially empty for new tenant)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/benefits/carriers", "GET", sessionCookieA, tenantA.id)
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
        new Request("http://localhost/api/v1/benefits/carriers", {
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

  describe("POST /api/v1/benefits/carriers", () => {
    it("should create a carrier with valid data", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/benefits/carriers", "POST", sessionCookieA, tenantA.id, {
          name: `Test Carrier ${Date.now()}`,
          code: `TC${Date.now()}`,
          contact_email: "carrier@example.com",
        })
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.id).toBeDefined();
      expect(body.is_active).toBe(true);
      createdCarrierIds.push(body.id as string);
    });

    it("should reject invalid payload (missing required name)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/benefits/carriers", "POST", sessionCookieA, tenantA.id, {
          code: "NONAME",
        })
      );

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("GET /api/v1/benefits/carriers/:id", () => {
    it("should return a carrier by ID", async () => {
      if (!sessionCookieA || !tenantA || createdCarrierIds.length === 0) return;

      const carrierId = createdCarrierIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/benefits/carriers/${carrierId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(carrierId);
    });

    it("should return 404 for non-existent carrier", async () => {
      if (!sessionCookieA || !tenantA) return;

      const fakeId = crypto.randomUUID();
      const res = await app.handle(
        makeRequest(
          `/api/v1/benefits/carriers/${fakeId}`,
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Plan Tests
  // =========================================================================

  describe("GET /api/v1/benefits/plans", () => {
    it("should list plans for the tenant", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/benefits/plans", "GET", sessionCookieA, tenantA.id)
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
  });

  // =========================================================================
  // RLS Isolation
  // =========================================================================

  describe("Benefits RLS isolation", () => {
    it("should not allow tenant B to see tenant A carriers", async () => {
      if (!sessionCookieA || !sessionCookieB || !tenantA || !tenantB) return;

      // Create a carrier in tenant A
      const carrierName = `RLS Carrier ${Date.now()}`;
      const createRes = await app.handle(
        makeRequest("/api/v1/benefits/carriers", "POST", sessionCookieA, tenantA.id, {
          name: carrierName,
        })
      );
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { id: string };
      createdCarrierIds.push(created.id);

      // Tenant B lists carriers - should NOT contain tenant A's carrier
      const listRes = await app.handle(
        makeRequest("/api/v1/benefits/carriers", "GET", sessionCookieB, tenantB.id)
      );
      expect(listRes.status).toBe(200);
      const body = (await listRes.json()) as {
        items: Array<{ id: string }>;
      };

      const found = body.items.find((item) => item.id === created.id);
      expect(found).toBeUndefined();
    });

    it("should return 404 when tenant B tries to access tenant A carrier by ID (RLS)", async () => {
      if (!sessionCookieB || !tenantB || createdCarrierIds.length === 0) return;

      const carrierId = createdCarrierIds[0];
      const res = await app.handle(
        makeRequest(
          `/api/v1/benefits/carriers/${carrierId}`,
          "GET",
          sessionCookieB,
          tenantB.id
        )
      );

      expect(res.status).toBe(404);
    });
  });
});
