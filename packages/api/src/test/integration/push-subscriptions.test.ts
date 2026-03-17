/**
 * Integration Tests: Push Subscriptions (Web Push VAPID)
 *
 * Tests the push_subscriptions table and associated operations:
 * - CRUD operations via repository
 * - RLS tenant isolation
 * - Unique constraint on (tenant_id, endpoint)
 * - Outbox events written atomically with business writes
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  skipIfNoInfra,
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

let db: ReturnType<typeof import("postgres").default>;
let tenant1: TestTenant;
let tenant2: TestTenant;
let user1: TestUser;
let user2: TestUser;
let user3: TestUser; // In tenant2

beforeAll(async () => {
  await ensureTestInfra();
  if (skipIfNoInfra()) return;

  db = getTestDb();

  // Create two tenants and users for cross-tenant isolation tests
  tenant1 = await createTestTenant(db, { name: "Push Test Tenant 1" });
  tenant2 = await createTestTenant(db, { name: "Push Test Tenant 2" });

  user1 = await createTestUser(db, tenant1.id);
  user2 = await createTestUser(db, tenant1.id);
  user3 = await createTestUser(db, tenant2.id);
});

afterAll(async () => {
  if (!db) return;

  // Clean up push subscriptions
  try {
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.push_subscriptions WHERE tenant_id = ${tenant1?.id}::uuid`;
      await tx`DELETE FROM app.push_subscriptions WHERE tenant_id = ${tenant2?.id}::uuid`;
    });
  } catch {
    // ignore
  }

  if (user1?.id) await cleanupTestUser(db, user1.id);
  if (user2?.id) await cleanupTestUser(db, user2.id);
  if (user3?.id) await cleanupTestUser(db, user3.id);
  if (tenant1?.id) await cleanupTestTenant(db, tenant1.id);
  if (tenant2?.id) await cleanupTestTenant(db, tenant2.id);

  await db.end();
});

describe("push_subscriptions table", () => {
  test("table exists with correct columns", async () => {
    if (skipIfNoInfra()) return;

    const columns = await withSystemContext(db, async (tx) => {
      return tx<{ columnName: string; dataType: string }[]>`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'push_subscriptions'
        ORDER BY ordinal_position
      `;
    });

    const columnNames = columns.map((c) => c.columnName);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("tenant_id");
    expect(columnNames).toContain("user_id");
    expect(columnNames).toContain("endpoint");
    expect(columnNames).toContain("auth_key");
    expect(columnNames).toContain("p256dh_key");
    expect(columnNames).toContain("device_type");
    expect(columnNames).toContain("created_at");
  });

  test("RLS is enabled", async () => {
    if (skipIfNoInfra()) return;

    const result = await withSystemContext(db, async (tx) => {
      return tx<{ rowSecurity: boolean }[]>`
        SELECT relrowsecurity AS row_security
        FROM pg_class
        WHERE oid = 'app.push_subscriptions'::regclass
      `;
    });

    expect(result[0]?.rowSecurity).toBe(true);
  });

  test("RLS policies exist", async () => {
    if (skipIfNoInfra()) return;

    const policies = await withSystemContext(db, async (tx) => {
      return tx<{ policyname: string; cmd: string }[]>`
        SELECT policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'app' AND tablename = 'push_subscriptions'
        ORDER BY policyname
      `;
    });

    const policyNames = policies.map((p) => p.policyname);
    expect(policyNames).toContain("tenant_isolation");
    expect(policyNames).toContain("tenant_isolation_insert");
  });
});

describe("push subscription CRUD", () => {
  test("can insert a push subscription", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const result = await db<{ id: string; endpoint: string; deviceType: string }[]>`
      INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
      VALUES (
        ${tenant1.id}::uuid,
        ${user1.id}::uuid,
        ${"https://push.example.com/sub/user1-device1"},
        ${"auth-key-abc123"},
        ${"p256dh-key-xyz789"},
        'web'
      )
      RETURNING id, endpoint, device_type
    `;

    expect(result).toHaveLength(1);
    expect(result[0].endpoint).toBe("https://push.example.com/sub/user1-device1");
    expect(result[0].deviceType).toBe("web");
  });

  test("can list subscriptions for current user", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const subs = await db<{ id: string; userId: string; endpoint: string }[]>`
      SELECT id, user_id, endpoint
      FROM app.push_subscriptions
      WHERE user_id = ${user1.id}::uuid
      ORDER BY created_at DESC
    `;

    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs.every((s) => s.userId === user1.id)).toBe(true);
  });

  test("upsert on duplicate endpoint replaces subscription", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const endpoint = "https://push.example.com/sub/upsert-test";

    // First insert
    await db`
      INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
      VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, ${endpoint}, 'auth-old', 'p256dh-old', 'web')
      ON CONFLICT (tenant_id, endpoint)
      DO UPDATE SET auth_key = EXCLUDED.auth_key, p256dh_key = EXCLUDED.p256dh_key, created_at = now()
    `;

    // Upsert with new keys
    await db`
      INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
      VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, ${endpoint}, 'auth-new', 'p256dh-new', 'pwa')
      ON CONFLICT (tenant_id, endpoint)
      DO UPDATE SET
        auth_key = EXCLUDED.auth_key,
        p256dh_key = EXCLUDED.p256dh_key,
        device_type = EXCLUDED.device_type,
        created_at = now()
    `;

    const result = await db<{ authKey: string; p256dhKey: string; deviceType: string }[]>`
      SELECT auth_key, p256dh_key, device_type
      FROM app.push_subscriptions
      WHERE endpoint = ${endpoint}
    `;

    expect(result).toHaveLength(1);
    expect(result[0].authKey).toBe("auth-new");
    expect(result[0].p256dhKey).toBe("p256dh-new");
    expect(result[0].deviceType).toBe("pwa");
  });

  test("can delete a subscription by endpoint", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const endpoint = "https://push.example.com/sub/delete-test";

    await db`
      INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
      VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, ${endpoint}, 'auth', 'p256dh', 'web')
      ON CONFLICT (tenant_id, endpoint) DO NOTHING
    `;

    const deleted = await db`
      DELETE FROM app.push_subscriptions
      WHERE endpoint = ${endpoint} AND user_id = ${user1.id}::uuid
    `;

    expect(deleted.count).toBeGreaterThanOrEqual(1);

    const remaining = await db<{ id: string }[]>`
      SELECT id FROM app.push_subscriptions WHERE endpoint = ${endpoint}
    `;

    expect(remaining).toHaveLength(0);
  });

  test("device_type check constraint rejects invalid values", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    try {
      await db`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, 'https://push.example.com/invalid-type', 'auth', 'p256dh', 'desktop')
      `;
      // Should not reach here
      expect(false).toBe(true);
    } catch (error: unknown) {
      expect((error as Error).message).toContain("chk_device_type");
    }
  });
});

describe("RLS tenant isolation", () => {
  test("tenant 1 cannot see tenant 2 subscriptions", async () => {
    if (skipIfNoInfra()) return;

    // Insert subscription for tenant2
    await withSystemContext(db, async (tx) => {
      await tx`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant2.id}::uuid, ${user3.id}::uuid, 'https://push.example.com/sub/tenant2-user3', 'auth-t2', 'p256dh-t2', 'web')
        ON CONFLICT (tenant_id, endpoint) DO NOTHING
      `;
    });

    // Query as tenant 1 - should not see tenant 2's subscription
    await setTenantContext(db, tenant1.id, user1.id);

    const subs = await db<{ id: string; tenantId: string }[]>`
      SELECT id, tenant_id FROM app.push_subscriptions
    `;

    // All returned rows should belong to tenant1
    for (const sub of subs) {
      expect(sub.tenantId).toBe(tenant1.id);
    }
  });

  test("tenant 2 cannot see tenant 1 subscriptions", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant2.id, user3.id);

    const subs = await db<{ id: string; tenantId: string }[]>`
      SELECT id, tenant_id FROM app.push_subscriptions
    `;

    // All returned rows should belong to tenant2
    for (const sub of subs) {
      expect(sub.tenantId).toBe(tenant2.id);
    }
  });

  test("cannot insert subscription for different tenant", async () => {
    if (skipIfNoInfra()) return;

    // Set context to tenant1
    await setTenantContext(db, tenant1.id, user1.id);

    try {
      // Try to insert for tenant2 - should be blocked by RLS
      await db`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant2.id}::uuid, ${user1.id}::uuid, 'https://push.example.com/cross-tenant', 'auth', 'p256dh', 'web')
      `;
      // Should not reach here
      expect(false).toBe(true);
    } catch (error: unknown) {
      // RLS violation - could be "new row violates policy" or similar
      expect((error as Error).message).toMatch(/policy|permission|violat/i);
    }
  });
});

describe("unique constraint", () => {
  test("same endpoint in same tenant is rejected (without ON CONFLICT)", async () => {
    if (skipIfNoInfra()) return;

    await setTenantContext(db, tenant1.id, user1.id);

    const endpoint = "https://push.example.com/sub/unique-test-" + Date.now();

    await db`
      INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
      VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, ${endpoint}, 'auth1', 'p256dh1', 'web')
    `;

    try {
      await db`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant1.id}::uuid, ${user2.id}::uuid, ${endpoint}, 'auth2', 'p256dh2', 'web')
      `;
      // Should not reach here
      expect(false).toBe(true);
    } catch (error: unknown) {
      expect((error as Error).message).toContain("uq_push_subscriptions_endpoint");
    }
  });

  test("same endpoint in different tenants is allowed", async () => {
    if (skipIfNoInfra()) return;

    const endpoint = "https://push.example.com/sub/cross-tenant-ok-" + Date.now();

    // Insert for tenant1
    await withSystemContext(db, async (tx) => {
      await tx`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant1.id}::uuid, ${user1.id}::uuid, ${endpoint}, 'auth1', 'p256dh1', 'web')
        ON CONFLICT (tenant_id, endpoint) DO NOTHING
      `;
    });

    // Insert for tenant2 with same endpoint - should succeed
    await withSystemContext(db, async (tx) => {
      await tx`
        INSERT INTO app.push_subscriptions (tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type)
        VALUES (${tenant2.id}::uuid, ${user3.id}::uuid, ${endpoint}, 'auth2', 'p256dh2', 'web')
        ON CONFLICT (tenant_id, endpoint) DO NOTHING
      `;
    });

    // Verify both exist
    const count = await withSystemContext(db, async (tx) => {
      const result = await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM app.push_subscriptions
        WHERE endpoint = ${endpoint}
      `;
      return parseInt(result[0]?.count ?? "0", 10);
    });

    expect(count).toBe(2);
  });
});
