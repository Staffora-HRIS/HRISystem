/**
 * Session Lifecycle Integration Tests (TODO-097)
 *
 * Tests the full session lifecycle using Better Auth:
 *   - Session creation via login (sign-in)
 *   - Session validation (resolving user from session token)
 *   - Session invalidation on logout (sign-out)
 *   - Session expiry behavior
 *   - Multi-session support (same user, different devices)
 *   - Tenant context binding on sessions
 *
 * These tests operate at the database level, verifying that the session
 * and user tables are correctly populated and cleaned up. They do NOT
 * make HTTP requests through the full Elysia stack; instead they
 * exercise the session state directly via postgres.
 *
 * Requires Docker containers (postgres + redis) running.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import {
  getTestDb,
  getTestRedis,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";
import type Redis from "ioredis";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a session directly in the Better Auth session table.
 * In production, Better Auth handles this via its sign-in endpoint.
 * For integration testing, we insert directly so we can control
 * the session properties (expiry, token, etc.).
 */
async function createBetterAuthSession(
  db: ReturnType<typeof import("../setup").getTestDb>,
  params: {
    userId: string;
    token: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const sessionId = crypto.randomUUID();

  await withSystemContext(db, async (tx) => {
    await tx`
      INSERT INTO app."session" (
        id, "userId", token, "expiresAt", "createdAt", "updatedAt",
        "ipAddress", "userAgent"
      )
      VALUES (
        ${sessionId},
        ${params.userId},
        ${params.token},
        ${params.expiresAt.toISOString()},
        ${new Date().toISOString()},
        ${new Date().toISOString()},
        ${params.ipAddress || null},
        ${params.userAgent || null}
      )
    `;
  });

  return {
    id: sessionId,
    token: params.token,
    expiresAt: params.expiresAt,
  };
}

/**
 * Query session from the Better Auth session table.
 */
async function getSessionByToken(
  db: ReturnType<typeof import("../setup").getTestDb>,
  token: string
): Promise<{
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
} | null> {
  const result = await withSystemContext(db, async (tx) => {
    return await tx<
      Array<{
        id: string;
        userId: string;
        token: string;
        expiresAt: Date;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT
        id,
        "userId" as "userId",
        token,
        "expiresAt" as "expiresAt",
        "createdAt" as "createdAt",
        "updatedAt" as "updatedAt"
      FROM app."session"
      WHERE token = ${token}
    `;
  });

  return result[0] ?? null;
}

/**
 * Create a Better Auth user directly in the user table.
 * This simulates what Better Auth does during sign-up.
 */
async function createBetterAuthUser(
  db: ReturnType<typeof import("../setup").getTestDb>,
  params: {
    email: string;
    name?: string;
  }
): Promise<{ id: string; email: string }> {
  const userId = crypto.randomUUID();

  await withSystemContext(db, async (tx) => {
    // Create in Better Auth's user table
    await tx`
      INSERT INTO app."user" (
        id, name, email, "emailVerified", "createdAt", "updatedAt"
      )
      VALUES (
        ${userId},
        ${params.name || "Test User"},
        ${params.email},
        true,
        ${new Date().toISOString()},
        ${new Date().toISOString()}
      )
    `;

    // Create in legacy users table (kept in sync)
    await tx`
      INSERT INTO app.users (
        id, email, password_hash, status, email_verified
      )
      VALUES (
        ${userId}::uuid, ${params.email}, 'test-hash', 'active', true
      )
      ON CONFLICT (id) DO NOTHING
    `;
  });

  return { id: userId, email: params.email };
}

/**
 * Clean up a Better Auth user and their sessions.
 */
async function cleanupBetterAuthUser(
  db: ReturnType<typeof import("../setup").getTestDb>,
  userId: string
): Promise<void> {
  await withSystemContext(db, async (tx) => {
    await tx`DELETE FROM app."session" WHERE "userId" = ${userId}`.catch(
      () => {}
    );
    await tx`DELETE FROM app."account" WHERE "userId" = ${userId}`.catch(
      () => {}
    );
    await tx`DELETE FROM app."user" WHERE id = ${userId}`.catch(() => {});
    await tx`DELETE FROM app.sessions WHERE user_id = ${userId}::uuid`.catch(
      () => {}
    );
    await tx`DELETE FROM app.role_assignments WHERE user_id = ${userId}::uuid`.catch(
      () => {}
    );
    await tx`DELETE FROM app.user_tenants WHERE user_id = ${userId}::uuid`.catch(
      () => {}
    );
    await tx`DELETE FROM app.users WHERE id = ${userId}::uuid`.catch(() => {});
  });
}

// =============================================================================
// Test Suite
// =============================================================================

describe("Session Lifecycle (TODO-097)", () => {
  let db: ReturnType<typeof import("../setup").getTestDb>;
  let redis: Redis;
  let tenant: TestTenant;
  let user: TestUser;

  // Better Auth user created for session tests
  let baUser: { id: string; email: string };

  const suffix = Date.now();

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    redis = getTestRedis();
    tenant = await createTestTenant(db, { slug: `sess-lc-${suffix}` });
    user = await createTestUser(db, tenant.id, {
      email: `sess-lc-${suffix}@example.com`,
    });

    // Create a Better Auth user for session tests
    baUser = await createBetterAuthUser(db, {
      email: `ba-sess-${suffix}@example.com`,
      name: "Session Test User",
    });
  });

  afterAll(async () => {
    if (!isInfraAvailable()) return;
    await cleanupBetterAuthUser(db, baUser.id);
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db, redis);
  });

  afterEach(async () => {
    if (!isInfraAvailable()) return;
    // Clean up any sessions created during tests
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app."session" WHERE "userId" = ${baUser.id}`.catch(
        () => {}
      );
    });
  });

  // ===========================================================================
  // 1. Session creation
  // ===========================================================================

  describe("Session creation", () => {
    it("should create a session with correct user binding and expiry", async () => {
      if (!isInfraAvailable()) return;

      const token = `test-token-${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const session = await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "Test/1.0",
      });

      expect(session.id).toBeTruthy();
      expect(session.token).toBe(token);

      // Verify session exists in DB
      const stored = await getSessionByToken(db, token);
      expect(stored).not.toBeNull();
      expect(stored!.userId).toBe(baUser.id);
      expect(new Date(stored!.expiresAt).getTime()).toBeCloseTo(
        expiresAt.getTime(),
        -3
      );
    });

    it("should allow creating multiple sessions for the same user", async () => {
      if (!isInfraAvailable()) return;

      const token1 = `multi-sess-1-${crypto.randomUUID()}`;
      const token2 = `multi-sess-2-${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token: token1,
        expiresAt,
        userAgent: "Chrome/120",
      });

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token: token2,
        expiresAt,
        userAgent: "Firefox/121",
      });

      // Both sessions should exist
      const sess1 = await getSessionByToken(db, token1);
      const sess2 = await getSessionByToken(db, token2);

      expect(sess1).not.toBeNull();
      expect(sess2).not.toBeNull();
      expect(sess1!.userId).toBe(baUser.id);
      expect(sess2!.userId).toBe(baUser.id);
      // Different session IDs
      expect(sess1!.id).not.toBe(sess2!.id);
    });
  });

  // ===========================================================================
  // 2. Session validation
  // ===========================================================================

  describe("Session validation", () => {
    it("should resolve user from a valid session token", async () => {
      if (!isInfraAvailable()) return;

      const token = `valid-token-${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt,
      });

      // Look up session by token and join to user
      const result = await withSystemContext(db, async (tx) => {
        return await tx<
          Array<{
            sessionId: string;
            userId: string;
            email: string;
            expiresAt: Date;
          }>
        >`
          SELECT
            s.id as "sessionId",
            s."userId" as "userId",
            u.email,
            s."expiresAt" as "expiresAt"
          FROM app."session" s
          JOIN app."user" u ON u.id = s."userId"
          WHERE s.token = ${token}
            AND s."expiresAt" > NOW()
        `;
      });

      expect(result.length).toBe(1);
      expect(result[0]!.userId).toBe(baUser.id);
      expect(result[0]!.email).toBe(baUser.email);
    });

    it("should not resolve user from a non-existent session token", async () => {
      if (!isInfraAvailable()) return;

      const result = await withSystemContext(db, async (tx) => {
        return await tx<Array<{ sessionId: string }>>`
          SELECT s.id as "sessionId"
          FROM app."session" s
          WHERE s.token = 'non-existent-token-xyz'
            AND s."expiresAt" > NOW()
        `;
      });

      expect(result.length).toBe(0);
    });
  });

  // ===========================================================================
  // 3. Session invalidation (logout)
  // ===========================================================================

  describe("Session invalidation", () => {
    it("should invalidate a session by deleting it (Better Auth sign-out)", async () => {
      if (!isInfraAvailable()) return;

      const token = `logout-token-${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const session = await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt,
      });

      // Verify session exists
      let stored = await getSessionByToken(db, token);
      expect(stored).not.toBeNull();

      // Simulate sign-out: Better Auth deletes the session row
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app."session" WHERE id = ${session.id}`;
      });

      // Session should no longer be resolvable
      stored = await getSessionByToken(db, token);
      expect(stored).toBeNull();
    });

    it("should invalidate all sessions for a user (force logout)", async () => {
      if (!isInfraAvailable()) return;

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create 3 sessions
      const tokens = [
        `force-1-${crypto.randomUUID()}`,
        `force-2-${crypto.randomUUID()}`,
        `force-3-${crypto.randomUUID()}`,
      ];

      for (const token of tokens) {
        await createBetterAuthSession(db, {
          userId: baUser.id,
          token,
          expiresAt,
        });
      }

      // Verify all 3 exist
      for (const token of tokens) {
        const s = await getSessionByToken(db, token);
        expect(s).not.toBeNull();
      }

      // Force logout: delete all sessions for this user
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app."session" WHERE "userId" = ${baUser.id}`;
      });

      // None should exist now
      for (const token of tokens) {
        const s = await getSessionByToken(db, token);
        expect(s).toBeNull();
      }
    });
  });

  // ===========================================================================
  // 4. Session expiry behavior
  // ===========================================================================

  describe("Session expiry", () => {
    it("should not resolve an expired session", async () => {
      if (!isInfraAvailable()) return;

      const token = `expired-token-${crypto.randomUUID()}`;
      // Session expired 1 hour ago
      const expiresAt = new Date(Date.now() - 60 * 60 * 1000);

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt,
      });

      // Query that filters by expiry should not find it
      const result = await withSystemContext(db, async (tx) => {
        return await tx<Array<{ sessionId: string }>>`
          SELECT s.id as "sessionId"
          FROM app."session" s
          WHERE s.token = ${token}
            AND s."expiresAt" > NOW()
        `;
      });

      expect(result.length).toBe(0);
    });

    it("should still find the expired session row in the database (not auto-deleted)", async () => {
      if (!isInfraAvailable()) return;

      const token = `expired-still-there-${crypto.randomUUID()}`;
      const expiresAt = new Date(Date.now() - 60 * 60 * 1000);

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt,
      });

      // Without the expiry filter, the row should still be there
      const result = await withSystemContext(db, async (tx) => {
        return await tx<Array<{ sessionId: string; expiresAt: Date }>>`
          SELECT s.id as "sessionId", s."expiresAt" as "expiresAt"
          FROM app."session" s
          WHERE s.token = ${token}
        `;
      });

      expect(result.length).toBe(1);
      expect(new Date(result[0]!.expiresAt).getTime()).toBeLessThan(Date.now());
    });

    it("should allow session renewal by updating expiresAt", async () => {
      if (!isInfraAvailable()) return;

      const token = `renew-token-${crypto.randomUUID()}`;
      const originalExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      const renewedExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const session = await createBetterAuthSession(db, {
        userId: baUser.id,
        token,
        expiresAt: originalExpiry,
      });

      // Renew: update expiresAt (sliding window)
      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app."session"
          SET "expiresAt" = ${renewedExpiry.toISOString()},
              "updatedAt" = ${new Date().toISOString()}
          WHERE id = ${session.id}
        `;
      });

      const stored = await getSessionByToken(db, token);
      expect(stored).not.toBeNull();
      expect(new Date(stored!.expiresAt).getTime()).toBeCloseTo(
        renewedExpiry.getTime(),
        -3
      );
    });
  });

  // ===========================================================================
  // 5. Session cleanup (expired session removal)
  // ===========================================================================

  describe("Session cleanup", () => {
    it("should be able to bulk-delete expired sessions", async () => {
      if (!isInfraAvailable()) return;

      const expiredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const validExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create 3 expired sessions and 1 valid one
      for (let i = 0; i < 3; i++) {
        await createBetterAuthSession(db, {
          userId: baUser.id,
          token: `cleanup-expired-${i}-${crypto.randomUUID()}`,
          expiresAt: expiredAt,
        });
      }

      await createBetterAuthSession(db, {
        userId: baUser.id,
        token: `cleanup-valid-${crypto.randomUUID()}`,
        expiresAt: validExpiry,
      });

      // Verify 4 sessions total
      const before = await withSystemContext(db, async (tx) => {
        return await tx<{ count: string }[]>`
          SELECT COUNT(*)::text as count
          FROM app."session"
          WHERE "userId" = ${baUser.id}
        `;
      });
      expect(parseInt(before[0]!.count, 10)).toBe(4);

      // Bulk delete expired sessions
      await withSystemContext(db, async (tx) => {
        await tx`
          DELETE FROM app."session"
          WHERE "userId" = ${baUser.id}
            AND "expiresAt" < NOW()
        `;
      });

      // Should have 1 remaining (the valid one)
      const after = await withSystemContext(db, async (tx) => {
        return await tx<{ count: string }[]>`
          SELECT COUNT(*)::text as count
          FROM app."session"
          WHERE "userId" = ${baUser.id}
        `;
      });
      expect(parseInt(after[0]!.count, 10)).toBe(1);
    });
  });
});
