/**
 * Unit Tests for AuthService.getSessionTenant
 * 
 * Regression test for the snake_case/camelCase SQL alias bug.
 * 
 * Bug: The SQL query used `as current_tenant_id` but TypeScript accessed
 * `sessionRows[0]?.currentTenantId`, causing tenant resolution to always
 * return null and breaking all tenant-scoped API routes with 500 errors.
 * 
 * Fix: Changed SQL alias to `as "currentTenantId"` to match TypeScript access.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
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
import { AuthService } from "../../plugins/auth-better";

describe("AuthService.getSessionTenant (Unit Test)", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  let authService: AuthService | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);

    await setTenantContext(db, tenant.id, user.id);

    // Create a DatabaseClient-compatible wrapper for the raw postgres connection
    // AuthService expects a db object with .query() and .withSystemContext() methods
    const dbWrapper = {
      query: async <T>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> => {
        return (await (db as any)(strings, ...values)) as T[];
      },
      withSystemContext: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
        return await withSystemContext(db!, fn);
      },
    };
    
    // Create the AuthService instance with the wrapped db
    authService = new AuthService(dbWrapper as any);

    // Create Better Auth user for testing
    // Note: user_tenants record is already created by createTestUser, no need to duplicate
    await withSystemContext(db, async (tx) => {
      // Create Better Auth user
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
    });
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

  it("should return currentTenantId from session when explicitly set", async () => {
    if (!isInfraAvailable() || !db || !authService || !tenant || !user) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Create a test session with currentTenantId set
    const testSessionId = `test-session-${Date.now()}`;
    
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `
          INSERT INTO app."session" (id, "userId", token, "expiresAt", "currentTenantId")
          VALUES ($1::text, $2::text, $3, now() + interval '1 day', $4::uuid)
        `.trim(),
        [testSessionId, user!.id, `token-${testSessionId}`, tenant!.id]
      );
    });

    try {
      // Call getSessionTenant - this was returning null before the fix
      const result = await authService.getSessionTenant(testSessionId, user!.id);

      // After the fix, it should return the tenant ID
      expect(result).toBe(tenant!.id);
    } finally {
      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(`DELETE FROM app."session" WHERE id = $1::text`, [testSessionId]);
      });
    }
  });

  it("should fall back to primary tenant when session has no currentTenantId", async () => {
    if (!isInfraAvailable() || !db || !authService || !tenant || !user) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    // Create a test session WITHOUT currentTenantId
    const testSessionId = `test-session-fallback-${Date.now()}`;
    
    await withSystemContext(db, async (tx) => {
      await tx.unsafe(
        `
          INSERT INTO app."session" (id, "userId", token, "expiresAt", "currentTenantId")
          VALUES ($1::text, $2::text, $3, now() + interval '1 day', NULL)
        `.trim(),
        [testSessionId, user!.id, `token-${testSessionId}`]
      );
    });

    try {
      // Call getSessionTenant - should fall back to user's primary tenant
      const result = await authService.getSessionTenant(testSessionId, user!.id);

      // Should return the primary tenant
      expect(result).toBe(tenant!.id);
    } finally {
      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx.unsafe(`DELETE FROM app."session" WHERE id = $1::text`, [testSessionId]);
      });
    }
  });

  it("should return null when session not found and no userId provided", async () => {
    if (!isInfraAvailable() || !authService) {
      console.log("Skipping: infrastructure not available");
      return;
    }

    const result = await authService.getSessionTenant("non-existent-session-id");
    expect(result).toBeNull();
  });
});
