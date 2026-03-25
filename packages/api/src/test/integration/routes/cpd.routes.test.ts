/**
 * CPD (Continuing Professional Development) Routes Integration Tests
 *
 * Tests the CPD record management module:
 * - CPD record CRUD operations
 * - Verified record update prevention
 * - Verified record delete prevention
 * - Verify workflow
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
import { CpdRepository } from "../../../modules/cpd/repository";
import { CpdService } from "../../../modules/cpd/service";
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

describe("CPD Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: CpdService;
  let serviceB: CpdService;
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
    tenant = await createTestTenant(db, { name: `CPD A ${suffix}`, slug: `cpd-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `CPD B ${suffix}`, slug: `cpd-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new CpdService(new CpdRepository(dbAdapter), dbAdapter);
    serviceB = new CpdService(new CpdRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'CPD-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.cpd_records WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a CPD record", async () => {
    if (skip) return;
    const result = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "course",
      title: `CPD Course ${Date.now()}`,
      description: "Test CPD activity",
      hours: 8,
      activity_date: "2025-06-01",
    });
    expect(result.success).toBe(true);
    expect(result.data!.title).toContain("CPD Course");
  });

  it("should get a CPD record by ID", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "workshop",
      title: `Get CPD ${Date.now()}`,
      hours: 4,
      activity_date: "2025-06-15",
    });
    const result = await service.getRecord(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent record", async () => {
    if (skip) return;
    const result = await service.getRecord(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
  });

  it("should update an unverified CPD record", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "seminar",
      title: `Update CPD ${Date.now()}`,
      hours: 2,
      activity_date: "2025-07-01",
    });
    const result = await service.updateRecord(ctxA(), created.data!.id, {
      title: "Updated CPD Title",
      hours: 3,
    });
    expect(result.success).toBe(true);
  });

  it("should verify a CPD record", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "conference",
      title: `Verify CPD ${Date.now()}`,
      hours: 6,
      activity_date: "2025-07-15",
    });
    const result = await service.verifyRecord(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.verified).toBe(true);
  });

  it("should reject update on verified record", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "course",
      title: `Verified Update ${Date.now()}`,
      hours: 4,
      activity_date: "2025-08-01",
    });
    await service.verifyRecord(ctxA(), created.data!.id);
    const result = await service.updateRecord(ctxA(), created.data!.id, { title: "Should Fail" });
    expect(result.success).toBe(false);
  });

  it("should reject delete on verified record", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "course",
      title: `Verified Delete ${Date.now()}`,
      hours: 4,
      activity_date: "2025-08-15",
    });
    await service.verifyRecord(ctxA(), created.data!.id);
    const result = await service.deleteRecord(ctxA(), created.data!.id);
    expect(result.success).toBe(false);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createRecord(ctxA(), {
      employee_id: user.id,
      activity_type: "course",
      title: `RLS CPD ${Date.now()}`,
      hours: 2,
      activity_date: "2025-09-01",
    });
    const result = await serviceB.getRecord(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
  });
});
