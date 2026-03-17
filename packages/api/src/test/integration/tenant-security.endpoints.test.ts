import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../../app";
import * as bcrypt from "bcryptjs";
import { getBetterAuth } from "../../lib/better-auth";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
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
import { buildCookieHeader } from "../helpers/cookies";

describe("Tenant + Security endpoints", () => {
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

    // Create an application user record (app.users) and RBAC bindings (role_assignments, user_tenants)
    user = await createTestUser(db, tenant.id);

    // Keep a valid UUID in session config to avoid RLS policies casting empty strings to uuid.
    await setTenantContext(db, tenant.id, user.id);

    // Create Better Auth user/account so we can sign-in via /api/auth
    const passwordHash = await bcrypt.hash(password, 12);
    await withSystemContext(db, async (tx) => {
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

      await tx.unsafe(
        `
          INSERT INTO app."account" (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, $1::text, 'credential', $2, $3, now(), now())
          ON CONFLICT ("providerId", "accountId") DO UPDATE
          SET password = EXCLUDED.password, "updatedAt" = now()
        `.trim(),
        [user!.id, user!.email, passwordHash]
      );
    });

    // Authenticate via Better Auth endpoint to obtain staffora.* cookies
    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signIn.status).toBe(200);

    sessionCookie = buildCookieHeader(signIn);
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie!).toContain("staffora.session_token=");

    const sessionRes = await app.handle(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: {
          Cookie: sessionCookie!,
        },
      })
    );

    expect(sessionRes.status).toBe(200);
    const sessionBody = await sessionRes.json();
    expect(sessionBody?.session).toBeTruthy();

    const auth = getBetterAuth();
    const direct = await auth.handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: { Cookie: sessionCookie! },
      })
    );
    expect(direct.status).toBe(200);
    const directBody = await direct.json();
    expect(directBody?.session).toBeTruthy();
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  it("GET /api/v1/auth/tenants returns tenant list for authenticated user", async () => {
    if (!db || !tenant || !user || !sessionCookie) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/tenants", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${text}`);
    }

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);

    const ids = (data as any[]).map((t) => t.id);
    expect(ids).toContain(tenant.id);
  });

  it("GET /api/v1/tenant/current returns the current tenant", async () => {
    if (!db || !tenant || !user || !sessionCookie) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/tenant/current", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${text}`);
    }

    const data = await res.json();
    expect(data.id).toBe(tenant.id);
    expect(data.slug).toBe(tenant.slug);
  });

  it("GET /api/v1/security/my-permissions returns permissions + roles", async () => {
    if (!db || !tenant || !user || !sessionCookie) return;

    const res = await app.handle(
      new Request("http://localhost/api/v1/security/my-permissions", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
          "X-Tenant-ID": tenant.id,
        },
      })
    );

    if (res.status !== 200) {
      const text = await res.text();
      throw new Error(`Expected 200, got ${res.status}: ${text}`);
    }

    const data = await res.json();
    expect(Array.isArray(data.permissions)).toBe(true);
    expect(Array.isArray(data.roles)).toBe(true);
  });

  it("GET /api/v1/security/my-permissions returns 401 when unauthenticated", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/security/my-permissions", {
        method: "GET",
      })
    );

    expect(res.status).toBe(401);
  });

  it("GET /api/v1/auth/tenants returns 401 when unauthenticated", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/tenants", {
        method: "GET",
      })
    );

    expect(res.status).toBe(401);
  });
});
