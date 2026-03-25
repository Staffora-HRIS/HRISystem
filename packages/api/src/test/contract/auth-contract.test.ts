/**
 * Auth Module — API Contract Tests
 *
 * Verifies that the authentication endpoints return responses whose shapes
 * match the declared TypeBox schemas.
 *
 * Endpoints tested:
 *   GET  /api/v1/auth/me                — current user with session and tenant info
 *   POST /api/auth/sign-in/email        — Better Auth email sign-in
 *   POST /api/auth/sign-in/email        — invalid credentials (error shape)
 *   GET  /api/v1/auth/tenants           — list accessible tenants
 *   POST /api/v1/auth/switch-tenant     — switch tenant context
 *
 * Prerequisites: Docker containers running (postgres + redis), migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import * as bcrypt from "bcryptjs";
import { app } from "../../app";
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
} from "../setup";
import { buildCookieHeader } from "../helpers/cookies";
import {
  assertRequiredFields,
  assertErrorResponse,
} from "./contract-helper";

// ============================================================================
// Constants
// ============================================================================

const TEST_PASSWORD = "AuthContractTest123!";

describe("Auth Module — API Contract Tests", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let sessionCookie: string = "";

  /**
   * Bootstrap a Better Auth user and obtain a session cookie.
   */
  async function bootstrapAuthUser(
    t: TestTenant,
    u: TestUser
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

    await withSystemContext(db!, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin', 'Platform super administrator (contract tests)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );

      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = 'a0000000-0000-0000-0000-000000000001'::uuid
         )`,
        [t.id, u.id]
      );

      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [u.id, u.email, u.email]
      );

      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [u.id, u.email, passwordHash]
      );
    });

    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password: TEST_PASSWORD }),
      })
    );

    expect(signIn.status).toBe(200);
    const cookie = buildCookieHeader(signIn);
    expect(cookie).toContain("staffora.session_token=");
    return cookie;
  }

  /** Build an authenticated Request against /api/v1. */
  function makeRequest(
    path: string,
    method: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Request {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      "X-Tenant-ID": tenant!.id,
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

  // ==========================================================================
  // Setup / Teardown
  // ==========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    tenant = await createTestTenant(db, {
      name: `Auth Contract ${suffix}`,
      slug: `auth-contract-${suffix}`,
    });
    user = await createTestUser(db, tenant.id, {
      email: `auth-contract-${suffix}@example.com`,
    });
    sessionCookie = await bootstrapAuthUser(tenant, user);
  });

  afterAll(async () => {
    if (!db) return;

    await withSystemContext(db, async (tx) => {
      if (tenant?.id) {
        await tx.unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tenant.id]).catch(() => {});
      }
      if (user) {
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user.id]).catch(() => {});
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user.id]).catch(() => {});
      }
    }).catch(() => {});

    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);

    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  // ==========================================================================
  // POST /api/auth/sign-in/email — Better Auth Sign-In
  // ==========================================================================

  describe("POST /api/auth/sign-in/email", () => {
    it("should return a session response with user and session objects", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // Better Auth sign-in returns { user, session, ... }
      // Verify the top-level structure
      expect(body.user).toBeDefined();
      expect(body.session).toBeDefined();

      // Verify user sub-object has required fields
      const userObj = body.user as Record<string, unknown>;
      assertRequiredFields(userObj, {
        id: "string",
        email: "string",
      }, "POST /api/auth/sign-in/email — user");

      // Verify session sub-object has required fields
      const sessionObj = body.session as Record<string, unknown>;
      assertRequiredFields(sessionObj, {
        id: "string",
        userId: "string",
      }, "POST /api/auth/sign-in/email — session");

      // Session token must be set via cookie
      const cookie = buildCookieHeader(res);
      expect(cookie).toContain("staffora.session_token=");
    });

    it("should return 401 for invalid credentials", async () => {
      if (!user) return;

      const res = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            password: "WrongPassword999!",
          }),
        })
      );

      // Better Auth returns 401 for bad credentials
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("should return error for non-existent user", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "nonexistent-user-contract-test@example.com",
            password: "SomePassword123!",
          }),
        })
      );

      // Should be a client error (4xx)
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ==========================================================================
  // GET /api/v1/auth/me — Current User Info
  // ==========================================================================

  describe("GET /api/v1/auth/me", () => {
    it("should return MeResponseSchema shape with user, session, tenants", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/me", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      // Top-level fields from MeResponseSchema
      expect(body.user).toBeDefined();
      expect(body.session).toBeDefined();
      expect(Array.isArray(body.tenants)).toBe(true);
      // currentTenant can be an object or null
      expect(body.currentTenant === null || typeof body.currentTenant === "object").toBe(true);
    });

    it("should return user object with required fields", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/me", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };

      assertRequiredFields(body.user, {
        id: "string",
        email: "string",
        emailVerified: "boolean",
      }, "GET /api/v1/auth/me — user");

      // name can be string or null
      expect(
        typeof body.user.name === "string" || body.user.name === null
      ).toBe(true);
    });

    it("should return session object with required fields", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/me", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { session: Record<string, unknown> };

      assertRequiredFields(body.session, {
        id: "string",
        userId: "string",
        expiresAt: "string",
      }, "GET /api/v1/auth/me — session");
    });

    it("should return tenant objects with required fields", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/me", "GET")
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { tenants: Record<string, unknown>[] };

      expect(body.tenants.length).toBeGreaterThanOrEqual(1);

      for (const t of body.tenants) {
        assertRequiredFields(t, {
          id: "string",
          name: "string",
          slug: "string",
          isPrimary: "boolean",
        }, "GET /api/v1/auth/me — tenant");
      }
    });

    it("should return 401 without authentication", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/me", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/v1/auth/tenants — List User Tenants
  // ==========================================================================

  describe("GET /api/v1/auth/tenants", () => {
    it("should return an array of tenant objects", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/tenants", "GET")
      );

      expect(res.status).toBe(200);
      const body = await res.json();

      expect(Array.isArray(body)).toBe(true);
      const tenants = body as Record<string, unknown>[];
      expect(tenants.length).toBeGreaterThanOrEqual(1);

      for (const t of tenants) {
        assertRequiredFields(t, {
          id: "string",
          name: "string",
          slug: "string",
          isPrimary: "boolean",
          role: "string",
        }, "GET /api/v1/auth/tenants — item");
      }
    });

    it("should return 401 without authentication", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/tenants", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // POST /api/v1/auth/switch-tenant — Switch Tenant
  // ==========================================================================

  describe("POST /api/v1/auth/switch-tenant", () => {
    it("should return success response with tenantId", async () => {
      if (!tenant || !user) return;

      const res = await app.handle(
        makeRequest("/api/v1/auth/switch-tenant", "POST", {
          tenantId: tenant.id,
        })
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;

      assertRequiredFields(body, {
        success: "boolean",
        tenantId: "string",
      }, "POST /api/v1/auth/switch-tenant");

      expect(body.success).toBe(true);
      expect(body.tenantId).toBe(tenant.id);
    });

    it("should return 403 for inaccessible tenant", async () => {
      if (!tenant || !user) return;

      const fakeId = "00000000-0000-0000-0000-ffffffffffff";
      const res = await app.handle(
        makeRequest("/api/v1/auth/switch-tenant", "POST", {
          tenantId: fakeId,
        })
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      assertErrorResponse(body, "POST /api/v1/auth/switch-tenant — forbidden");
    });

    it("should return 401 without authentication", async () => {
      if (!tenant) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/auth/switch-tenant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenant.id,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ tenantId: tenant.id }),
        })
      );

      expect(res.status).toBe(401);
    });
  });
});
