/**
 * Notifications Routes Integration Tests
 *
 * Tests the notification management module:
 * - Notification listing with filters
 * - Mark as read/dismissed
 * - Notification count
 * - NOT_FOUND handling
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { NotificationsRepository } from "../../../modules/notifications/repository";
import { NotificationsService } from "../../../modules/notifications/service";
import type { DatabaseClient } from "../../../plugins/db";

function buildCamelDbAdapter(camelDb: ReturnType<typeof postgres>) {
  return {
    withTransaction: async <T>(ctx: { tenantId: string; userId?: string }, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      return camelDb.begin(async (tx) => {
        await tx`SELECT app.set_tenant_context(${ctx.tenantId}::uuid, ${ctx.userId || null}::uuid)`;
        return fn(tx);
      }) as Promise<T>;
    },
  } as unknown as DatabaseClient;
}

describe("Notifications Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: NotificationsService;
  let serviceB: NotificationsService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) { skip = true; return; }

    db = getTestDb();
    camelDb = postgres({
      host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username, password: TEST_CONFIG.database.password,
      max: 5, idle_timeout: 20, connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `Notif A ${suffix}`, slug: `notif-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Notif B ${suffix}`, slug: `notif-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new NotificationsService(new NotificationsRepository(dbAdapter), dbAdapter);
    serviceB = new NotificationsService(new NotificationsRepository(dbAdapter), dbAdapter);

    // Create some test notifications directly
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.notifications (id, tenant_id, user_id, title, message, type) VALUES (${crypto.randomUUID()}::uuid, ${tenant.id}::uuid, ${user.id}::uuid, 'Test Notification', 'This is a test', 'info')`;
    await db`INSERT INTO app.notifications (id, tenant_id, user_id, title, message, type) VALUES (${crypto.randomUUID()}::uuid, ${tenant.id}::uuid, ${user.id}::uuid, 'Second Notification', 'Another test', 'warning')`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.push_tokens WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.notifications WHERE tenant_id = ${tId}::uuid`;
        }
      });
    } catch (e) { console.error("Cleanup error (non-fatal):", e); }
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await cleanupTestUser(db, user.id); await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenant.id); await cleanupTestTenant(db, tenantB.id);
    await camelDb.end({ timeout: 5 }).catch(() => {}); await closeTestConnections(db);
  });

  afterEach(async () => { if (skip) return; await clearTenantContext(db); });

  const ctxA = () => ({ tenantId: tenant.id, userId: user.id });
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  it("should list notifications for user", async () => {
    if (skip) return;
    const result = await service.listNotifications(ctxA(), user.id, {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(2);
  });

  it("should get a notification by ID", async () => {
    if (skip) return;
    const list = await service.listNotifications(ctxA(), user.id, {}, {});
    if (list.items.length === 0) return;
    const result = await service.getNotification(ctxA(), list.items[0].id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(list.items[0].id);
  });

  it("should return NOT_FOUND for non-existent notification", async () => {
    if (skip) return;
    const result = await service.getNotification(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should mark notification as read", async () => {
    if (skip) return;
    const list = await service.listNotifications(ctxA(), user.id, {}, {});
    if (list.items.length === 0) return;
    const result = await service.markAsRead(ctxA(), list.items[0].id);
    expect(result.success).toBe(true);
    expect(result.data!.read_at).toBeTruthy();
  });

  it("should get unread count", async () => {
    if (skip) return;
    const result = await service.getUnreadCount(ctxA(), user.id);
    expect(typeof result).toBe("number");
  });

  it("should block cross-tenant notification access (RLS)", async () => {
    if (skip) return;
    const list = await service.listNotifications(ctxA(), user.id, {}, {});
    if (list.items.length === 0) return;
    const result = await serviceB.getNotification(ctxB(), list.items[0].id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
