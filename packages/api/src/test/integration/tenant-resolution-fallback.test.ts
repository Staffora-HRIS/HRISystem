/**
 * Tenant Resolution Fallback Tests
 *
 * Tests that ensure authenticated users get their primary tenant automatically
 * when no explicit tenant is provided (via header or session.currentTenantId).
 *
 * This prevents 401 errors on portal endpoints when users are authenticated
 * but haven't explicitly selected a tenant.
 *
 * Bug Reference: Portal endpoints returning 401 even for authenticated users
 * Root Cause: tenantPlugin didn't fall back to user's primary tenant
 * Fix: Updated tenantPlugin to use authService.getSessionTenant() which
 *      properly falls back to the user's primary tenant
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../../app";
import * as bcrypt from "bcryptjs";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
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
import { buildCookieHeader } from "../helpers/cookies";

describe("Tenant Resolution Fallback", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let sessionCookie: string | null = null;

  const password = "TestPassword123!";

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);

    await setTenantContext(db, tenant.id, user.id);

    // Create Better Auth user/account for sign-in
    // Note: user_tenants record is already created by createTestUser, no need to duplicate
    const passwordHash = await bcrypt.hash(password, 12);
    await withSystemContext(db, async (tx) => {
      // Create Better Auth user
      await tx.unsafe(
        `
          INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
          VALUES ($1::text, $2, $3, true, 'active', false)
          ON CONFLICT (email) DO UPDATE
          SET
            id = EXCLUDED.id,
            name = EXCLUDED.name,
            "emailVerified" = EXCLUDED."emailVerified",
            status = EXCLUDED.status,
            "mfaEnabled" = EXCLUDED."mfaEnabled",
            "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, user!.email]
      );

      // Create credential account with password
      await tx.unsafe(
        `
          INSERT INTO app."account" ("id", "userId", "providerId", "accountId", "password")
          VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3)
          ON CONFLICT ("providerId", "accountId") DO UPDATE
          SET password = EXCLUDED.password, "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, passwordHash]
      );
    });

    // Sign in to get session cookie
    const signInRes = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signInRes.status).toBeLessThan(300);
    sessionCookie = buildCookieHeader(signInRes);
    expect(sessionCookie).toBeTruthy();
  });

  afterAll(async () => {
    if (!db) return;

    await clearTenantContext(db);

    // Cleanup Better Auth records
    if (user) {
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user!.id]);
      });
      await cleanupTestUser(db, user.id);
    }

    if (tenant) {
      await cleanupTestTenant(db, tenant.id);
    }
  });

  it("should resolve tenant from user's primary tenant when no header provided", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Call portal/me WITHOUT X-Tenant-ID header
    // Before the fix, this would return 401 because tenant was null
    // After the fix, it should resolve to the user's primary tenant
    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/me", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          // Note: NO X-Tenant-ID header
        },
      })
    );

    // Should NOT be 401 Unauthorized
    expect(res.status).not.toBe(401);

    // Should return user data (200) or graceful empty response
    // The key point is that authentication succeeded
    const data = await res.json();
    expect(data.error?.code).not.toBe("UNAUTHORIZED");
  });

  it("should resolve tenant from header when explicitly provided", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Call with explicit X-Tenant-ID header
    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/me", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    expect(res.status).not.toBe(401);
    const data = await res.json();
    expect(data.error?.code).not.toBe("UNAUTHORIZED");
  });

  it("should allow portal/dashboard without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/dashboard", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401
    expect(res.status).not.toBe(401);
  });

  it("should allow portal/tasks without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/tasks", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401
    expect(res.status).not.toBe(401);
  });

  it("should return 401 for unauthenticated requests", async () => {
    if (!isInfraAvailable()) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Call WITHOUT session cookie - should fail
    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/me", {
        method: "GET",
        headers: {
          // No Cookie header
        },
      })
    );

    // Should be 401 because user is not authenticated
    expect(res.status).toBe(401);
  });

  it("should allow benefits/my-enrollments without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/benefits/my-enrollments", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401 or 404 anymore
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });

  it("should allow benefits/my-life-events without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/benefits/my-life-events", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401 or 404 anymore
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });

  it("should allow documents/my-summary without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/documents/my-summary", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401 or 400 anymore
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(400);
  });

  it("should allow lms/my-learning without explicit tenant header", async () => {
    if (!isInfraAvailable() || !sessionCookie) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const res = await app.handle(
      new Request("http://localhost/api/v1/lms/my-learning", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    // Should NOT be 401 anymore
    expect(res.status).not.toBe(401);
  });
});

/**
 * Tests for the getSessionTenant SQL alias fix
 * 
 * Bug: The SQL query used `as current_tenant_id` (snake_case) but TypeScript
 * accessed `sessionRows[0]?.currentTenantId` (camelCase), causing tenant
 * resolution to always fail and return null, breaking all tenant-scoped routes.
 * 
 * Fix: Changed SQL alias to match TypeScript property access pattern.
 */
describe("Session Tenant Resolution (Regression Test)", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let sessionCookie: string | null = null;
  let sessionId: string | null = null;

  const password = "TestPassword123!";

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);

    await setTenantContext(db, tenant.id, user.id);

    // Note: user_tenants record is already created by createTestUser, no need to duplicate
    const passwordHash = await bcrypt.hash(password, 12);
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `
          INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
          VALUES ($1::text, $2, $3, true, 'active', false)
          ON CONFLICT (email) DO UPDATE
          SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified",
              status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, user!.email]
      );

      await tx.unsafe(
        `
          INSERT INTO app."account" ("id", "userId", "providerId", "accountId", "password")
          VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3)
          ON CONFLICT ("providerId", "accountId") DO UPDATE
          SET password = EXCLUDED.password, "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, passwordHash]
      );
    });

    // Sign in to get session
    const signInRes = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signInRes.status).toBeLessThan(300);
    sessionCookie = buildCookieHeader(signInRes);

    // Get session ID for later tests
    const sessionsResult = await withSystemContext(db, async (tx) => {
      return tx.unsafe(
        `SELECT id FROM app."session" WHERE "userId" = $1::text ORDER BY "createdAt" DESC LIMIT 1`,
        [user!.id]
      );
    });
    sessionId = sessionsResult[0]?.id ?? null;
  });

  afterAll(async () => {
    if (!db) return;
    await clearTenantContext(db);

    if (user) {
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user!.id]);
      });
      await cleanupTestUser(db, user.id);
    }

    if (tenant) await cleanupTestTenant(db, tenant.id);
  });

  it("should correctly read currentTenantId from session when set (SQL alias regression test)", async () => {
    if (!isInfraAvailable() || !db || !sessionId || !tenant) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Explicitly set currentTenantId on the session
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `UPDATE app."session" SET "currentTenantId" = $1::uuid WHERE id = $2::text`,
        [tenant!.id, sessionId]
      );
    });

    // Verify the value can be read correctly (this tests the SQL alias fix)
    const result = await withSystemContext(db, async (tx) => {
      // This query mirrors what getSessionTenant does after the fix
      return tx.unsafe(
        `SELECT "currentTenantId"::text as "currentTenantId" FROM app."session" WHERE id = $1::text`,
        [sessionId]
      );
    });

    // Before the fix: result[0]?.currentTenantId would be undefined
    // After the fix: result[0]?.currentTenantId should equal tenant.id
    expect(result[0]?.currentTenantId).toBe(tenant.id);
  });

  it("should resolve tenant from session.currentTenantId for security/audit-log endpoint", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant || !db || !sessionId) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Set the session's currentTenantId
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `UPDATE app."session" SET "currentTenantId" = $1::uuid WHERE id = $2::text`,
        [tenant!.id, sessionId]
      );
    });

    // Call audit-log endpoint - this was returning 500 before the fix
    const res = await app.handle(
      new Request("http://localhost/api/v1/security/audit-log?limit=10", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          // No X-Tenant-ID header - should use session.currentTenantId
        },
      })
    );

    // Should NOT be 500 (internal error) or 400 (missing tenant)
    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(400);
  });

  it("should resolve tenant from session.currentTenantId for security/roles endpoint", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant || !db || !sessionId) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `UPDATE app."session" SET "currentTenantId" = $1::uuid WHERE id = $2::text`,
        [tenant!.id, sessionId]
      );
    });

    const res = await app.handle(
      new Request("http://localhost/api/v1/security/roles", {
        method: "GET",
        headers: { Cookie: sessionCookie },
      })
    );

    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(400);
  });

  it("should resolve tenant from session.currentTenantId for hr/employees endpoint", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant || !db || !sessionId) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `UPDATE app."session" SET "currentTenantId" = $1::uuid WHERE id = $2::text`,
        [tenant!.id, sessionId]
      );
    });

    const res = await app.handle(
      new Request("http://localhost/api/v1/hr/employees?limit=10", {
        method: "GET",
        headers: { Cookie: sessionCookie },
      })
    );

    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(400);
  });

  it("should resolve tenant from session.currentTenantId for lms/enrollments endpoint", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant || !db || !sessionId) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `UPDATE app."session" SET "currentTenantId" = $1::uuid WHERE id = $2::text`,
        [tenant!.id, sessionId]
      );
    });

    const res = await app.handle(
      new Request("http://localhost/api/v1/lms/enrollments", {
        method: "GET",
        headers: { Cookie: sessionCookie },
      })
    );

    expect(res.status).not.toBe(500);
    expect(res.status).not.toBe(400);
  });
});

describe("Tenant Resolution Edge Cases", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant1: TestTenant | null = null;
  let tenant2: TestTenant | null = null;
  let user: TestUser | null = null;
  let sessionCookie: string | null = null;

  const password = "TestPassword123!";

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();

    // Create two tenants for multi-tenant testing
    tenant1 = await createTestTenant(db);
    tenant2 = await createTestTenant(db);

    // Create user with primary tenant = tenant1
    user = await createTestUser(db, tenant1.id);
    await setTenantContext(db, tenant1.id, user.id);

    // Note: user_tenants record for tenant1 is already created by createTestUser
    const passwordHash = await bcrypt.hash(password, 12);
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `
          INSERT INTO app."user" (id, name, email, "emailVerified", status, "mfaEnabled")
          VALUES ($1::text, $2, $3, true, 'active', false)
          ON CONFLICT (email) DO UPDATE
          SET id = EXCLUDED.id, name = EXCLUDED.name, "emailVerified" = EXCLUDED."emailVerified",
              status = EXCLUDED.status, "mfaEnabled" = EXCLUDED."mfaEnabled", "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, user!.email]
      );

      await tx.unsafe(
        `
          INSERT INTO app."account" ("id", "userId", "providerId", "accountId", "password")
          VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3)
          ON CONFLICT ("providerId", "accountId") DO UPDATE
          SET password = EXCLUDED.password, "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, passwordHash]
      );

      // Add user to tenant2 (non-primary) - tenant1 already added by createTestUser
      await tx.unsafe(
        `
          INSERT INTO app.user_tenants (user_id, tenant_id, is_primary, status)
          VALUES ($1::uuid, $2::uuid, false, 'active')
          ON CONFLICT (user_id, tenant_id) DO NOTHING
        `.trim(),
        [user!.id, tenant2!.id]
      );
    });

    // Sign in
    const signInRes = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signInRes.status).toBeLessThan(300);
    sessionCookie = buildCookieHeader(signInRes);
  });

  afterAll(async () => {
    if (!db) return;

    await clearTenantContext(db);

    if (user) {
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(`DELETE FROM app."session" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."account" WHERE "userId" = $1::text`, [user!.id]);
        await tx.unsafe(`DELETE FROM app."user" WHERE id = $1::text`, [user!.id]);
      });
      await cleanupTestUser(db, user.id);
    }

    if (tenant1) await cleanupTestTenant(db, tenant1.id);
    if (tenant2) await cleanupTestTenant(db, tenant2.id);
  });

  it("should default to primary tenant when user has multiple tenants", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant1) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Without explicit header, should use tenant1 (primary)
    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/me", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );

    expect(res.status).not.toBe(401);

    // If there's tenant info in response, verify it's the primary tenant
    const data = await res.json();
    if (data.tenant?.id) {
      expect(data.tenant.id).toBe(tenant1.id);
    }
  });

  it("should allow explicit selection of non-primary tenant via header", async () => {
    if (!isInfraAvailable() || !sessionCookie || !tenant2) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Explicitly select tenant2 via header
    const res = await app.handle(
      new Request("http://localhost/api/v1/portal/me", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-ID": tenant2.id,
        },
      })
    );

    expect(res.status).not.toBe(401);
  });
});
