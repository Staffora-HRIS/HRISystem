/**
 * Portal Routes Integration Tests
 *
 * Real integration tests that hit the Elysia app via app.handle().
 * Tests portal profile, dashboard summary, my-team, tasks,
 * 401 without auth, and basic tenant scoping.
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

describe("Portal Routes Integration", () => {
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
      name: `Portal Test A ${suffix}`,
      slug: `portal-test-a-${suffix}`,
    });
    userA = await createTestUser(db, tenantA.id, {
      email: `portal-test-a-${suffix}@example.com`,
    });
    sessionCookieA = await bootstrapAuthUser(tenantA, userA);

    tenantB = await createTestTenant(db, {
      name: `Portal Test B ${suffix}`,
      slug: `portal-test-b-${suffix}`,
    });
    userB = await createTestUser(db, tenantB.id, {
      email: `portal-test-b-${suffix}@example.com`,
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

  describe("GET /api/v1/portal/me", () => {
    it("should return profile for authenticated user", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/portal/me", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      // Should contain user data and tenant data
      expect(body).toHaveProperty("user");
      expect(body).toHaveProperty("tenant");

      const user = body.user as Record<string, unknown>;
      expect(user.id).toBe(userA!.id);
      expect(user.email).toBe(userA!.email);

      const tenant = body.tenant as Record<string, unknown>;
      expect(tenant.id).toBe(tenantA!.id);
    });

    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/portal/me", {
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

  describe("GET /api/v1/portal/dashboard", () => {
    it("should return dashboard summary", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/portal/dashboard", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("summary");

      const summary = body.summary as Record<string, unknown>;
      expect(summary).toHaveProperty("pendingTasks");
      expect(summary).toHaveProperty("pendingApprovals");
      expect(summary).toHaveProperty("teamMembers");
    });

    it("should return 401 without authentication", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/portal/dashboard", {
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

  describe("GET /api/v1/portal/my-team", () => {
    it("should return team data (empty for user without direct reports)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/portal/my-team", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { team: unknown[]; count: number };
      expect(Array.isArray(body.team)).toBe(true);
      expect(typeof body.count).toBe("number");
      // A new test user with no employees should have 0 direct reports
      expect(body.count).toBe(0);
    });
  });

  describe("GET /api/v1/portal/tasks", () => {
    it("should return tasks data (empty for new user)", async () => {
      if (!sessionCookieA || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/portal/tasks", "GET", sessionCookieA, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { tasks: unknown[]; count: number };
      expect(Array.isArray(body.tasks)).toBe(true);
      expect(typeof body.count).toBe("number");
    });
  });

  describe("Portal tenant scoping", () => {
    it("tenant A profile should show tenant A data, not tenant B data", async () => {
      if (!sessionCookieA || !sessionCookieB || !tenantA || !tenantB) return;

      // Tenant A gets their profile
      const resA = await app.handle(
        makeRequest("/api/v1/portal/me", "GET", sessionCookieA, tenantA.id)
      );
      expect(resA.status).toBe(200);
      const bodyA = (await resA.json()) as {
        tenant: { id: string; name: string };
        user: { id: string };
      };
      expect(bodyA.tenant.id).toBe(tenantA.id);
      expect(bodyA.user.id).toBe(userA!.id);

      // Tenant B gets their profile
      const resB = await app.handle(
        makeRequest("/api/v1/portal/me", "GET", sessionCookieB, tenantB.id)
      );
      expect(resB.status).toBe(200);
      const bodyB = (await resB.json()) as {
        tenant: { id: string; name: string };
        user: { id: string };
      };
      expect(bodyB.tenant.id).toBe(tenantB.id);
      expect(bodyB.user.id).toBe(userB!.id);

      // They should be different tenants
      expect(bodyA.tenant.id).not.toBe(bodyB.tenant.id);
    });
  });
});
