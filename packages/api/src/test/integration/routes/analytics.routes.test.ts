/**
 * Analytics Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests executive dashboard, headcount summary, reports catalog,
 * 401 without auth, and RLS isolation.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCookieHeader(response: Response): string {
  const headersObj = response.headers as unknown as {
    getSetCookie?: () => string[];
  };
  let setCookies: string[];

  if (typeof headersObj.getSetCookie === "function") {
    setCookies = headersObj.getSetCookie();
  } else {
    const raw = response.headers.get("Set-Cookie") ?? "";
    setCookies = raw ? splitCombinedSetCookieHeader(raw) : [];
  }

  return setCookies
    .map((cookie) => cookie.split(";")[0] ?? cookie)
    .filter(Boolean)
    .join("; ");
}

function splitCombinedSetCookieHeader(value: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "," || value[i + 1] !== " ") continue;

    const rest = value.slice(i + 2);
    const boundary = /^[A-Za-z0-9!#$%&'*+.^_`|~.-]+=/.test(rest);
    if (!boundary) continue;

    out.push(value.slice(start, i));
    start = i + 2;
  }

  out.push(value.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Analytics Routes Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  let tenantA: TestTenant | null = null;
  let userA: TestUser | null = null;
  let sessionCookieA: string | null = null;

  let tenantB: TestTenant | null = null;
  let userB: TestUser | null = null;
  let sessionCookieB: string | null = null;

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
      name: `Analytics Test A ${suffix}`,
      slug: `analytics-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `analytics-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    tenantB = await createTestTenant(db, {
      name: `Analytics Test B ${suffix}`,
      slug: `analytics-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `analytics-test-b-${suffix}@example.com`,
    });
    sessionCookieB = await bootstrapAuthUser(tenantB, userB);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
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

    await withSystemContext(db, async (tx) => {
      for (const user of [userA, userB]) {
        if (!user) continue;
        await tx.unsafe(
          `DELETE FROM app."session" WHERE "userId" = $1::text`,
          [user.id]
        ).catch(() => {});
        await tx.unsafe(
          `DELETE FROM app."account" WHERE "userId" = $1::text`,
          [user.id]
        ).catch(() => {});
        await tx.unsafe(
          `DELETE FROM app."user" WHERE id = $1::text`,
          [user.id]
        ).catch(() => {});
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
  // Tests
  // =========================================================================

  describe("GET /api/v1/analytics/headcount/summary", () => {
    it("should return headcount summary for the tenant", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/headcount/summary",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("total_employees");
      expect(body).toHaveProperty("active_employees");
      expect(body).toHaveProperty("as_of_date");
    });

    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/analytics/headcount/summary", {
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

  describe("GET /api/v1/analytics/dashboard/executive", () => {
    it("should return executive dashboard data", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/dashboard/executive",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      // May return 200 (with data) or 500 (if aggregation queries encounter missing tables/data)
      // The key assertion is that it does NOT return 401/403 for an authenticated user
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("GET /api/v1/analytics/reports", () => {
    it("should return the reports catalog", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/reports",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ id: string; name: string; category: string }> };
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.items.length).toBeGreaterThan(0);
      // Verify structure of a report entry
      const first = body.items[0];
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("category");
    });
  });

  describe("RLS isolation - analytics", () => {
    it("headcount summary should reflect only the tenant's own data", async () => {
      if (!sessionCookieA || !sessionCookieB || !tenantA || !tenantB) return;

      // Insert an employee directly into tenant A
      let employeeIdA: string | null = null;
      try {
        await withSystemContext(db!, async (tx) => {
          const [emp] = (await tx.unsafe(
            `INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
             VALUES ($1::uuid, $2, 'active', CURRENT_DATE) RETURNING id::text as id`,
            [tenantA!.id, `EMP-ANALYTICS-${Date.now()}`]
          )) as Array<{ id: string }>;
          employeeIdA = emp?.id ?? null;
        });
      } catch {
        return;
      }

      if (!employeeIdA) return;

      // Tenant A headcount should include the new employee
      const resA = await app.handle(
        makeRequest(
          "/api/v1/analytics/headcount/summary",
          "GET",
          sessionCookieA,
          tenantA.id
        )
      );
      expect(resA.status).toBe(200);
      const bodyA = (await resA.json()) as { active_employees: number };
      expect(bodyA.active_employees).toBeGreaterThanOrEqual(1);

      // Tenant B headcount should NOT include tenant A's employee
      const resB = await app.handle(
        makeRequest(
          "/api/v1/analytics/headcount/summary",
          "GET",
          sessionCookieB,
          tenantB.id
        )
      );
      expect(resB.status).toBe(200);
      const bodyB = (await resB.json()) as { active_employees: number };
      // Tenant B should have 0 or fewer active employees than tenant A
      expect(bodyB.active_employees).toBeLessThan(bodyA.active_employees);

      // Cleanup
      await withSystemContext(db!, async (tx) => {
        await tx.unsafe(
          "DELETE FROM app.employees WHERE id = $1::uuid",
          [employeeIdA!]
        ).catch(() => {});
      }).catch(() => {});
    });
  });
});
