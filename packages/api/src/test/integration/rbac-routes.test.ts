/**
 * RBAC Route-Level Integration Tests (TODO-095)
 *
 * Verifies that permission checks enforced via requirePermission() in route
 * beforeHandle guards actually block unauthorised access at the HTTP level.
 *
 * Test matrix:
 * - User WITHOUT required permission gets 403 on protected endpoints
 * - User WITH the correct permission gets 200
 * - Super admin (wildcard *:*) has full access
 * - Regular employee role is restricted to granted permissions only
 * - Cross-tenant RBAC: permissions from tenant A do not apply in tenant B
 *
 * Endpoints tested:
 * - HR: GET /api/v1/hr/employees (employees:read)
 * - HR: GET /api/v1/hr/org-units (org:read)
 * - Security (admin): GET /api/v1/security/audit-log (audit:read)
 * - Security (admin): GET /api/v1/security/roles (roles:read)
 * - Security (admin): POST /api/v1/security/roles (roles:write)
 * - Analytics: GET /api/v1/analytics/dashboard/executive (analytics:read)
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("RBAC Route-Level Integration", () => {
  let db: ReturnType<typeof getTestDb> | null = null;

  // Tenant A users
  let tenantA: TestTenant | null = null;
  let superAdminUser: TestUser | null = null;
  let superAdminCookie: string | null = null;

  let hrOnlyUser: TestUser | null = null;
  let hrOnlyCookie: string | null = null;
  let hrOnlyRoleId: string | null = null;

  let noPermsUser: TestUser | null = null;
  let noPermsCookie: string | null = null;
  let noPermsRoleId: string | null = null;

  // Tenant B (for cross-tenant tests)
  let tenantB: TestTenant | null = null;
  let tenantBAdmin: TestUser | null = null;
  let tenantBCookie: string | null = null;
  let tenantBRoleId: string | null = null;

  const password = "TestPassword123!";

  // Track IDs for cleanup
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];

  // =========================================================================
  // Helper: bootstrap a Better Auth user (db + sign-in)
  // =========================================================================

  async function bootstrapAuthUser(
    tenant: TestTenant,
    user: TestUser,
    roleId: string
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(password, 12);

    await withSystemContext(db!, async (tx) => {
      // Assign the specified role to this user for the tenant
      await tx.unsafe(
        `INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
         SELECT $1::uuid, $2::uuid, $3::uuid, '{}'::jsonb
         WHERE NOT EXISTS (
           SELECT 1 FROM app.role_assignments
           WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND role_id = $3::uuid
         )`,
        [tenant.id, user.id, roleId]
      );

      // Insert into Better Auth "user" table
      await tx.unsafe(
        `INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
         VALUES ($1::text, $2, $3, true, 'active', false)
         ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name,
           "emailVerified" = EXCLUDED."emailVerified", status = EXCLUDED.status,
           "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()`,
        [user.id, user.email, user.email]
      );

      // Insert into Better Auth "account" table (credential provider)
      await tx.unsafe(
        `INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
         ON CONFLICT ("providerId", "accountId") DO UPDATE SET password = EXCLUDED.password, "updatedAt" = now()`,
        [user.id, user.email, passwordHash]
      );
    });

    // Sign in via the app
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

  /** Build a Request with auth cookie, tenant header, and idempotency key. */
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
  // Setup / Teardown
  // =========================================================================

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    const suffix = Date.now();

    // --- Ensure super_admin system role exists ---
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ('a0000000-0000-0000-0000-000000000001'::uuid, NULL, 'super_admin',
                 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions`
      );
    });

    // =====================================================================
    // Tenant A with three users of different permission levels
    // =====================================================================
    tenantA = await createTestTenant(db, {
      name: `RBAC Test A ${suffix}`,
      slug: `rbac-test-a-${suffix}`,
    });

    // --- User 1: Super Admin (wildcard *:*) ---
    superAdminUser = await createTestUser(db, tenantA.id, {
      email: `rbac-super-${suffix}@example.com`,
    });
    createdUserIds.push(superAdminUser.id);
    superAdminCookie = await bootstrapAuthUser(
      tenantA,
      superAdminUser,
      "a0000000-0000-0000-0000-000000000001"
    );

    // --- User 2: HR-only role (employees:read, employees:write, org:read) ---
    // Create a tenant-scoped role with limited permissions
    hrOnlyRoleId = crypto.randomUUID();
    createdRoleIds.push(hrOnlyRoleId);
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ($1::uuid, $2::uuid, 'hr_reader', 'HR read-only role (test)',
                 false, '{"employees:read": true, "employees:write": true, "org:read": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions, id = EXCLUDED.id`,
        [hrOnlyRoleId, tenantA.id]
      );
    });

    hrOnlyUser = await createTestUser(db, tenantA.id, {
      email: `rbac-hr-${suffix}@example.com`,
    });
    createdUserIds.push(hrOnlyUser.id);

    // Remove the super_admin assignment that createTestUser adds by default
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `DELETE FROM app.role_assignments WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [tenantA.id, hrOnlyUser!.id]
      );
    });

    hrOnlyCookie = await bootstrapAuthUser(tenantA, hrOnlyUser, hrOnlyRoleId);

    // --- User 3: No permissions role ---
    noPermsRoleId = crypto.randomUUID();
    createdRoleIds.push(noPermsRoleId);
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ($1::uuid, $2::uuid, 'no_perms', 'Empty permissions role (test)',
                 false, '{}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions, id = EXCLUDED.id`,
        [noPermsRoleId, tenantA.id]
      );
    });

    noPermsUser = await createTestUser(db, tenantA.id, {
      email: `rbac-noperms-${suffix}@example.com`,
    });
    createdUserIds.push(noPermsUser.id);

    // Remove the super_admin assignment that createTestUser adds by default
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `DELETE FROM app.role_assignments WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [tenantA.id, noPermsUser!.id]
      );
    });

    noPermsCookie = await bootstrapAuthUser(tenantA, noPermsUser, noPermsRoleId);

    // =====================================================================
    // Tenant B: admin user with HR permissions but different tenant
    // =====================================================================
    tenantB = await createTestTenant(db, {
      name: `RBAC Test B ${suffix}`,
      slug: `rbac-test-b-${suffix}`,
    });

    tenantBRoleId = crypto.randomUUID();
    createdRoleIds.push(tenantBRoleId);
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
         VALUES ($1::uuid, $2::uuid, 'hr_admin_b', 'HR admin for tenant B (test)',
                 false, '{"employees:read": true, "employees:write": true, "org:read": true, "org:write": true, "audit:read": true, "roles:read": true, "roles:write": true, "analytics:read": true}'::jsonb)
         ON CONFLICT (tenant_id, name) DO UPDATE SET permissions = EXCLUDED.permissions, id = EXCLUDED.id`,
        [tenantBRoleId, tenantB.id]
      );
    });

    tenantBAdmin = await createTestUser(db, tenantB.id, {
      email: `rbac-admin-b-${suffix}@example.com`,
    });
    createdUserIds.push(tenantBAdmin.id);

    // Remove the super_admin assignment that createTestUser adds by default
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `DELETE FROM app.role_assignments WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
        [tenantB.id, tenantBAdmin!.id]
      );
    });

    tenantBCookie = await bootstrapAuthUser(tenantB, tenantBAdmin, tenantBRoleId);
  });

  afterAll(async () => {
    if (!db) return;

    // Clean up Better Auth records and role assignments
    await withSystemContext(db, async (tx) => {
      for (const userId of createdUserIds) {
        await tx
          .unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [userId])
          .catch(() => {});
        await tx
          .unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [userId])
          .catch(() => {});
        await tx
          .unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [userId])
          .catch(() => {});
      }

      // Clean up test-specific domain outbox entries
      for (const tId of [tenantA?.id, tenantB?.id]) {
        if (tId) {
          await tx
            .unsafe("DELETE FROM app.domain_outbox WHERE tenant_id = $1::uuid", [tId])
            .catch(() => {});
        }
      }

      // Clean up role assignments then roles
      for (const roleId of createdRoleIds) {
        await tx
          .unsafe("DELETE FROM app.role_assignments WHERE role_id = $1::uuid", [roleId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.role_permissions WHERE role_id = $1::uuid", [roleId])
          .catch(() => {});
        await tx
          .unsafe("DELETE FROM app.roles WHERE id = $1::uuid", [roleId])
          .catch(() => {});
      }
    }).catch(() => {});

    // Clean up test users and tenants
    for (const userId of createdUserIds) {
      await cleanupTestUser(db!, userId);
    }
    if (tenantA) await cleanupTestTenant(db, tenantA.id);
    if (tenantB) await cleanupTestTenant(db, tenantB.id);

    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  // =========================================================================
  // 1. Unauthenticated requests get 401
  // =========================================================================

  describe("Unauthenticated requests", () => {
    it("should return 401 for GET /api/v1/hr/employees without auth", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/hr/employees", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantA.id,
          },
        })
      );

      expect(res.status).toBe(401);
    });

    it("should return 401 for GET /api/v1/security/audit-log without auth", async () => {
      if (!tenantA) return;

      const res = await app.handle(
        new Request("http://localhost/api/v1/security/audit-log", {
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

  // =========================================================================
  // 2. Super admin has full access to all endpoints
  // =========================================================================

  describe("Super admin (wildcard *:*) access", () => {
    it("should allow super admin to GET /api/v1/hr/employees", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("should allow super admin to GET /api/v1/hr/org-units", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/org-units", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("should allow super admin to GET /api/v1/security/audit-log", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/audit-log", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("should allow super admin to GET /api/v1/security/roles", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/roles", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("should allow super admin to GET /api/v1/analytics/dashboard/executive", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/dashboard/executive",
          "GET",
          superAdminCookie,
          tenantA.id
        )
      );

      // 200 = success; analytics may return empty data but should not be 403
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // 3. HR-only role: can access HR endpoints, blocked from admin endpoints
  // =========================================================================

  describe("HR-only role (employees:read, employees:write, org:read)", () => {
    it("should allow HR user to GET /api/v1/hr/employees", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", hrOnlyCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: unknown[]; hasMore: boolean };
      expect(Array.isArray(body.items)).toBe(true);
    });

    it("should allow HR user to GET /api/v1/hr/org-units", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/org-units", "GET", hrOnlyCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("should block HR user from GET /api/v1/security/audit-log (requires audit:read)", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/audit-log", "GET", hrOnlyCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block HR user from GET /api/v1/security/roles (requires roles:read)", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/roles", "GET", hrOnlyCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block HR user from POST /api/v1/security/roles (requires roles:write)", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/security/roles",
          "POST",
          hrOnlyCookie,
          tenantA.id,
          { name: "should-be-blocked", description: "This should not be created" }
        )
      );

      expect(res.status).toBe(403);
    });

    it("should block HR user from GET /api/v1/analytics/dashboard/executive (requires analytics:read)", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/dashboard/executive",
          "GET",
          hrOnlyCookie,
          tenantA.id
        )
      );

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 4. No-permissions role: blocked from all protected endpoints
  // =========================================================================

  describe("No-permissions role (empty permissions)", () => {
    it("should block user from GET /api/v1/hr/employees", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block user from GET /api/v1/hr/org-units", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/org-units", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block user from GET /api/v1/security/audit-log", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/audit-log", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block user from GET /api/v1/security/roles", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/roles", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("should block user from POST /api/v1/security/roles", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/security/roles",
          "POST",
          noPermsCookie,
          tenantA.id,
          { name: "blocked-role", description: "Should not be created" }
        )
      );

      expect(res.status).toBe(403);
    });

    it("should block user from GET /api/v1/analytics/dashboard/executive", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/dashboard/executive",
          "GET",
          noPermsCookie,
          tenantA.id
        )
      );

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Verify 403 response body contains PERMISSION_DENIED error code
  // =========================================================================

  describe("403 response body format", () => {
    it("should return PERMISSION_DENIED error code in response body", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("PERMISSION_DENIED");
      expect(body.error.message).toContain("Permission denied");
    });
  });

  // =========================================================================
  // 6. Cross-tenant RBAC isolation
  // =========================================================================

  describe("Cross-tenant RBAC isolation", () => {
    it("tenant B admin can access HR in tenant B", async () => {
      if (!tenantBCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", tenantBCookie, tenantB.id)
      );

      expect(res.status).toBe(200);
    });

    it("tenant B admin can access audit-log in tenant B", async () => {
      if (!tenantBCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/audit-log", "GET", tenantBCookie, tenantB.id)
      );

      expect(res.status).toBe(200);
    });

    it("tenant B admin permissions do NOT apply when requesting with tenant A header", async () => {
      if (!tenantBCookie || !tenantA) return;

      // Tenant B admin sends request with tenant A ID.
      // The tenant plugin should either reject (no membership) or the RBAC
      // should not find any role_assignments for this user in tenant A.
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", tenantBCookie, tenantA.id)
      );

      // Should NOT be 200 -- either 400 (invalid tenant), 403, or similar
      expect(res.status).not.toBe(200);
      // The user has no role assignments in tenant A, so should be blocked
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("tenant A super admin cannot use tenant B context (no membership)", async () => {
      if (!superAdminCookie || !tenantB) return;

      // Super admin from tenant A tries to access tenant B.
      // The tenant plugin verifies user_tenants membership, so this should fail.
      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", superAdminCookie, tenantB.id)
      );

      // Should NOT be 200 -- tenant resolution should fail
      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it("tenant A HR user has no permissions in tenant B", async () => {
      if (!hrOnlyCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest("/api/v1/hr/employees", "GET", hrOnlyCookie, tenantB.id)
      );

      // Should be blocked: user is not a member of tenant B
      expect(res.status).not.toBe(200);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // =========================================================================
  // 7. Admin-only endpoints: security management
  // =========================================================================

  describe("Admin-only endpoints access control", () => {
    it("super admin can list security users", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/users", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("HR-only user cannot list security users (requires users:read)", async () => {
      if (!hrOnlyCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/users", "GET", hrOnlyCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("no-perms user cannot list security users", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/users", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });

    it("super admin can list permissions catalog", async () => {
      if (!superAdminCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/permissions", "GET", superAdminCookie, tenantA.id)
      );

      expect(res.status).toBe(200);
    });

    it("no-perms user cannot list permissions catalog", async () => {
      if (!noPermsCookie || !tenantA) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/permissions", "GET", noPermsCookie, tenantA.id)
      );

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 8. Tenant B admin with correct permissions can access those endpoints
  // =========================================================================

  describe("Tenant B admin with specific permissions", () => {
    it("tenant B admin can GET /api/v1/security/roles in tenant B", async () => {
      if (!tenantBCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest("/api/v1/security/roles", "GET", tenantBCookie, tenantB.id)
      );

      expect(res.status).toBe(200);
    });

    it("tenant B admin can GET /api/v1/analytics/dashboard/executive in tenant B", async () => {
      if (!tenantBCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/analytics/dashboard/executive",
          "GET",
          tenantBCookie,
          tenantB.id
        )
      );

      expect(res.status).toBe(200);
    });

    it("tenant B admin can POST /api/v1/security/roles in tenant B", async () => {
      if (!tenantBCookie || !tenantB) return;

      const res = await app.handle(
        makeRequest(
          "/api/v1/security/roles",
          "POST",
          tenantBCookie,
          tenantB.id,
          { name: `rbac-test-role-${Date.now()}`, description: "Created by RBAC test" }
        )
      );

      // Should succeed (roles:write is granted)
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      if (body.id) {
        createdRoleIds.push(body.id);
      }
    });
  });
});
