/**
 * Integration Tests for Tenant Context 500 Error Fix
 * 
 * These tests verify that routes return proper 400 errors (not 500) when:
 * 1. User has no tenant associations
 * 2. Session has no currentTenantId set
 * 3. Database errors occur during tenant resolution
 * 
 * Root cause: getSessionTenant was throwing database errors that bubbled up as 500s
 * Fix: Added try-catch in getSessionTenant to return null gracefully, letting
 *      requirePermission handle the missing tenant with a proper 400 error.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../../app";
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
import * as bcrypt from "bcryptjs";
import { buildCookieHeader } from "../helpers/cookies";

describe("Tenant Context 500 Error Fix", () => {
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

    // Create Better Auth user and account
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

    // Get session ID
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

  describe("Routes should return 400 (not 500) when tenant context is missing", () => {
    it("security/audit-log should return 400 when no tenant context", async () => {
      if (!isInfraAvailable() || !sessionCookie || !db || !sessionId) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      // Ensure session has NO currentTenantId
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app."session" SET "currentTenantId" = NULL WHERE id = $1::text`,
          [sessionId]
        );
      });

      // Also remove user from all tenants temporarily to ensure fallback fails
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app.user_tenants SET status = 'removed' WHERE user_id = $1::uuid`,
          [user!.id]
        );
      });

      try {
        const res = await app.handle(
          new Request("http://localhost/api/v1/security/audit-log?limit=10", {
            method: "GET",
            headers: { Cookie: sessionCookie! },
          })
        );

        // Should be 400 (missing tenant) or 403 (permission denied), NOT 500
        expect(res.status).not.toBe(500);
        expect([400, 403]).toContain(res.status);

        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(body.error.code).toBeDefined();
      } finally {
        // Restore user tenant association
        await withSystemContext(db!, async (tx) => {
          await tx.unsafe(
            `UPDATE app.user_tenants SET status = 'active' WHERE user_id = $1::uuid`,
            [user!.id]
          );
        });
      }
    });

    it("security/roles should return 400 when no tenant context", async () => {
      if (!isInfraAvailable() || !sessionCookie || !db || !sessionId) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app."session" SET "currentTenantId" = NULL WHERE id = $1::text`,
          [sessionId]
        );
        await tx.unsafe(
          `UPDATE app.user_tenants SET status = 'removed' WHERE user_id = $1::uuid`,
          [user!.id]
        );
      });

      try {
        const res = await app.handle(
          new Request("http://localhost/api/v1/security/roles", {
            method: "GET",
            headers: { Cookie: sessionCookie! },
          })
        );

        expect(res.status).not.toBe(500);
        expect([400, 403]).toContain(res.status);
      } finally {
        await withSystemContext(db!, async (tx) => {
          await tx.unsafe(
            `UPDATE app.user_tenants SET status = 'active' WHERE user_id = $1::uuid`,
            [user!.id]
          );
        });
      }
    });

    it("security/users should return 400 when no tenant context", async () => {
      if (!isInfraAvailable() || !sessionCookie || !db || !sessionId) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app."session" SET "currentTenantId" = NULL WHERE id = $1::text`,
          [sessionId]
        );
        await tx.unsafe(
          `UPDATE app.user_tenants SET status = 'removed' WHERE user_id = $1::uuid`,
          [user!.id]
        );
      });

      try {
        const res = await app.handle(
          new Request("http://localhost/api/v1/security/users?limit=10", {
            method: "GET",
            headers: { Cookie: sessionCookie! },
          })
        );

        expect(res.status).not.toBe(500);
        expect([400, 403]).toContain(res.status);
      } finally {
        await withSystemContext(db!, async (tx) => {
          await tx.unsafe(
            `UPDATE app.user_tenants SET status = 'active' WHERE user_id = $1::uuid`,
            [user!.id]
          );
        });
      }
    });

    it("hr/employees should return 400 when no tenant context", async () => {
      if (!isInfraAvailable() || !sessionCookie || !db || !sessionId) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app."session" SET "currentTenantId" = NULL WHERE id = $1::text`,
          [sessionId]
        );
        await tx.unsafe(
          `UPDATE app.user_tenants SET status = 'removed' WHERE user_id = $1::uuid`,
          [user!.id]
        );
      });

      try {
        const res = await app.handle(
          new Request("http://localhost/api/v1/hr/employees?limit=10", {
            method: "GET",
            headers: { Cookie: sessionCookie! },
          })
        );

        expect(res.status).not.toBe(500);
        expect([400, 403]).toContain(res.status);
      } finally {
        await withSystemContext(db!, async (tx) => {
          await tx.unsafe(
            `UPDATE app.user_tenants SET status = 'active' WHERE user_id = $1::uuid`,
            [user!.id]
          );
        });
      }
    });

    it("hr/positions should return 400 when no tenant context", async () => {
      if (!isInfraAvailable() || !sessionCookie || !db || !sessionId) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      await withSystemContext(db, async (tx) => {
        await tx.unsafe(
          `UPDATE app."session" SET "currentTenantId" = NULL WHERE id = $1::text`,
          [sessionId]
        );
        await tx.unsafe(
          `UPDATE app.user_tenants SET status = 'removed' WHERE user_id = $1::uuid`,
          [user!.id]
        );
      });

      try {
        const res = await app.handle(
          new Request("http://localhost/api/v1/hr/positions?limit=10", {
            method: "GET",
            headers: { Cookie: sessionCookie! },
          })
        );

        expect(res.status).not.toBe(500);
        expect([400, 403]).toContain(res.status);
      } finally {
        await withSystemContext(db!, async (tx) => {
          await tx.unsafe(
            `UPDATE app.user_tenants SET status = 'active' WHERE user_id = $1::uuid`,
            [user!.id]
          );
        });
      }
    });
  });

  describe("Routes should work correctly when tenant context IS available", () => {
    it("security/audit-log should return 200 when tenant is set", async () => {
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

      const res = await app.handle(
        new Request("http://localhost/api/v1/security/audit-log?limit=10", {
          method: "GET",
          headers: { Cookie: sessionCookie! },
        })
      );

      // Should NOT be 500 (internal error) or 400 (missing tenant)
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(400);
    });

    it("security/roles should return 200 when tenant is set", async () => {
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
          headers: { Cookie: sessionCookie! },
        })
      );

      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(400);
    });
  });

  describe("getSessionTenant error handling", () => {
    it("should return null (not throw) when userId is invalid UUID format", async () => {
      if (!isInfraAvailable() || !db) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      // Create AuthService directly to test the method
      const { AuthService } = await import("../../plugins/auth-better");
      
      // Create a mock db wrapper
      const dbWrapper = {
        query: async <T>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> => {
          return (await (db as any)(strings, ...values)) as T[];
        },
      };
      
      const authService = new AuthService(dbWrapper as any);
      
      // Call with invalid UUID - should return null, not throw
      const result = await authService.getSessionTenant("test-session-id", "not-a-valid-uuid");
      expect(result).toBeNull();
    });

    it("should return null when session does not exist", async () => {
      if (!isInfraAvailable() || !db) {
        console.log("Skipping: infrastructure not available");
        return;
      }

      const { AuthService } = await import("../../plugins/auth-better");
      
      const dbWrapper = {
        query: async <T>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> => {
          return (await (db as any)(strings, ...values)) as T[];
        },
      };
      
      const authService = new AuthService(dbWrapper as any);
      
      // Call with non-existent session - should return null
      const result = await authService.getSessionTenant("non-existent-session-id");
      expect(result).toBeNull();
    });
  });
});
