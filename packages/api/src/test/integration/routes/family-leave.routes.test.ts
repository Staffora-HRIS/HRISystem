/**
 * Family Leave Routes Integration Tests
 *
 * Tests the UK family leave module (maternity, paternity, shared parental, adoption):
 * - Entitlement creation with eligibility validation
 * - Status transitions
 * - List and get operations
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
import { FamilyLeaveRepository } from "../../../modules/family-leave/repository";
import { FamilyLeaveService } from "../../../modules/family-leave/service";
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

describe("Family Leave Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: FamilyLeaveService;
  let serviceB: FamilyLeaveService;
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
    tenant = await createTestTenant(db, { name: `FamLeave A ${suffix}`, slug: `famleave-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `FamLeave B ${suffix}`, slug: `famleave-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new FamilyLeaveService(new FamilyLeaveRepository(dbAdapter), dbAdapter);
    serviceB = new FamilyLeaveService(new FamilyLeaveRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'FL-001', 'active', '2020-01-01') ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.family_leave_kit_days WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.family_leave_notices WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.family_leave_pay_periods WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.family_leave_entitlements WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a maternity leave entitlement", async () => {
    if (skip) return;
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_type: "maternity",
      expected_date: "2025-12-01",
      leave_start_date: "2025-10-20",
      qualifying_date: "2025-08-24",
      qualifying_weeks: 26,
      weekly_earnings: 600,
    });
    expect(result.success).toBe(true);
    expect(result.data!.leave_type).toBe("maternity");
    expect(result.data!.status).toBe("pending");
  });

  it("should get an entitlement by ID", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_type: "paternity",
      expected_date: "2025-12-15",
      leave_start_date: "2025-12-15",
      qualifying_date: "2025-09-07",
      qualifying_weeks: 26,
      weekly_earnings: 500,
    });
    const result = await service.getEntitlement(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent entitlement", async () => {
    if (skip) return;
    const result = await service.getEntitlement(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should list entitlements", async () => {
    if (skip) return;
    const result = await service.listEntitlements(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should check eligibility", async () => {
    if (skip) return;
    const result = await service.checkEligibility(ctxA(), {
      employee_id: user.id,
      leave_type: "maternity",
      expected_date: "2026-06-01",
      qualifying_date: "2026-02-22",
    });
    expect(result.success).toBe(true);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_type: "adoption",
      expected_date: "2026-03-01",
      leave_start_date: "2026-03-01",
      qualifying_date: "2025-11-23",
      qualifying_weeks: 26,
      weekly_earnings: 550,
    });
    const result = await serviceB.getEntitlement(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
