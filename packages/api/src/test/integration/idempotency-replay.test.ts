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
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

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

function buildCookieHeader(response: Response): string {
  const anyHeaders = response.headers as any;
  let setCookies: string[];

  if (typeof anyHeaders.getSetCookie === "function") {
    setCookies = anyHeaders.getSetCookie() as string[];
  } else {
    const raw = response.headers.get("Set-Cookie") ?? "";
    setCookies = raw ? splitCombinedSetCookieHeader(raw) : [];
  }

  return setCookies
    .map((cookie) => cookie.split(";")[0] ?? cookie)
    .filter(Boolean)
    .join("; ");
}

describe("Idempotency (end-to-end)", () => {
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

    // Keep a valid UUID in session config to avoid RLS policies casting empty strings to uuid.
    await setTenantContext(db, tenant.id, user.id);

    await withSystemContext(db, async (tx) => {
      const roles = (await tx.unsafe(
        "SELECT id FROM app.roles WHERE name = 'super_admin' AND tenant_id IS NULL LIMIT 1"
      )) as Array<{ id: string }>;

      let superAdminRoleId = roles[0]?.id;
      if (!superAdminRoleId) {
        const createdId = "a0000000-0000-0000-0000-000000000001";
        await tx.unsafe(
          `
            INSERT INTO app.roles (id, tenant_id, name, description, is_system, permissions)
            VALUES ($1::uuid, NULL, 'super_admin', 'Platform super administrator (test)', true, '{"*:*": true}'::jsonb)
            ON CONFLICT (tenant_id, name) DO UPDATE
            SET permissions = EXCLUDED.permissions
          `.trim(),
          [createdId]
        );

        const reread = (await tx.unsafe(
          "SELECT id FROM app.roles WHERE name = 'super_admin' AND tenant_id IS NULL LIMIT 1"
        )) as Array<{ id: string }>;
        superAdminRoleId = reread[0]?.id;
      }
      if (!superAdminRoleId) return;

      await tx.unsafe(
        `
          INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
          SELECT $1::uuid, $2::uuid, $3::uuid, '{}'::jsonb
          WHERE NOT EXISTS (
            SELECT 1
            FROM app.role_assignments
            WHERE tenant_id = $1::uuid
              AND user_id = $2::uuid
              AND role_id = $3::uuid
          )
        `.trim(),
        [tenant!.id, user!.id, superAdminRoleId]
      );
    });

    await withSystemContext(db, async (tx) => {
      const assigned = (await tx.unsafe(
        "SELECT role_id::text as id FROM app.role_assignments WHERE tenant_id = $1::uuid AND user_id = $2::uuid ORDER BY assigned_at DESC LIMIT 1",
        [tenant!.id, user!.id]
      )) as Array<{ id: string }>;

      const assignedRoleId = assigned[0]?.id;
      if (!assignedRoleId) return;

      await tx.unsafe(
        "UPDATE app.roles SET permissions = permissions || '{\"org:read\": true, \"org:write\": true}'::jsonb WHERE id = $1::uuid",
        [assignedRoleId]
      );
    });

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

    const signIn = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password }),
      })
    );

    expect(signIn.status).toBe(200);
    sessionCookie = buildCookieHeader(signIn);
    expect(sessionCookie).toContain("hris.session_token=");

    const sessionRes = await app.handle(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: {
          Cookie: sessionCookie,
        },
      })
    );
    expect(sessionRes.status).toBe(200);
    const sessionData = (await sessionRes.json()) as any;

    const authedUserId = sessionData?.user?.id as string | undefined;
    expect(authedUserId).toBe(user.id);

    await withSystemContext(db, async (tx) => {
      const assigned = (await tx.unsafe(
        `
          SELECT r.name
          FROM app.role_assignments ra
          JOIN app.roles r ON r.id = ra.role_id
          WHERE ra.tenant_id = $1::uuid
            AND ra.user_id = $2::uuid
        `.trim(),
        [tenant!.id, authedUserId]
      )) as Array<{ name: string }>;

      if (assigned.some((r) => r.name === "super_admin")) return;

      // If the authenticated user id doesn't have the assignment (shouldn't happen),
      // re-apply it to make the test deterministic.
      await tx.unsafe(
        `
          INSERT INTO app.role_assignments (tenant_id, user_id, role_id, constraints)
          SELECT $1::uuid, $2::uuid, $3::uuid, '{}'::jsonb
          WHERE NOT EXISTS (
            SELECT 1
            FROM app.role_assignments
            WHERE tenant_id = $1::uuid
              AND user_id = $2::uuid
              AND role_id = $3::uuid
          )
        `.trim(),
        [tenant!.id, authedUserId, "a0000000-0000-0000-0000-000000000001"]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    if (user) await cleanupTestUser(db, user.id);
    if (tenant) await cleanupTestTenant(db, tenant.id);
    await clearTenantContext(db);
    await closeTestConnections(db);
  });

  it("returns cached response on replay and avoids duplicate writes", async () => {
    if (!db || !tenant || !user || !sessionCookie) return;

    const tenantId = tenant.id;

    const now = Date.now();
    const idempotencyKey = `itest-${now}`;
    const code = `OU_${now}`;

    const payload = {
      code,
      name: `Test Org Unit ${now}`,
      effective_from: "2026-01-01",
    };

    const reqHeaders = {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
      "X-Tenant-ID": tenant.id,
      "Idempotency-Key": idempotencyKey,
    };

    const first = await app.handle(
      new Request("http://localhost/api/v1/hr/org-units", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload),
      })
    );

    if (first.status !== 201) {
      const text = await first.text();
      throw new Error(`Expected 201, got ${first.status}: ${text}`);
    }

    const firstBody = (await first.json()) as any;
    expect(firstBody?.id).toBeTruthy();

    const second = await app.handle(
      new Request("http://localhost/api/v1/hr/org-units", {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(payload),
      })
    );

    if (second.status !== 201) {
      const text = await second.text();
      throw new Error(`Expected 201, got ${second.status}: ${text}`);
    }

    const secondBody = (await second.json()) as any;
    expect(secondBody?.id).toBe(firstBody.id);

    const counts = await withSystemContext(db, async (tx) => {
      const rows = (await tx.unsafe(
        "SELECT COUNT(*)::text as count FROM app.org_units WHERE tenant_id = $1::uuid AND code = $2",
        [tenantId, code]
      )) as Array<{ count: string }>;

      return rows;
    });

    expect(parseInt(counts[0]?.count ?? "0", 10)).toBe(1);
  });
});
