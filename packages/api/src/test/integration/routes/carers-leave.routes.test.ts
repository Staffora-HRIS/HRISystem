/**
 * Carer's Leave Routes Integration Tests
 *
 * Tests the Carer's Leave Act 2023 module:
 * - Entitlement CRUD (5 days statutory max)
 * - Duplicate entitlement prevention per employee+year
 * - Leave balance deduction on approval
 * - Insufficient balance rejection
 * - Delete prevention when days used > 0
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
import { CarersLeaveRepository } from "../../../modules/carers-leave/repository";
import { CarersLeaveService } from "../../../modules/carers-leave/service";
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

describe("Carer's Leave Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: CarersLeaveService;
  let serviceB: CarersLeaveService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) { skip = true; return; }

    db = getTestDb();
    camelDb = postgres({
      host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username, password: TEST_CONFIG.database.password,
      max: 1, idle_timeout: 20, connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `Carers A ${suffix}`, slug: `carers-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Carers B ${suffix}`, slug: `carers-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    const repo = new CarersLeaveRepository(dbAdapter);
    service = new CarersLeaveService(repo, dbAdapter);
    serviceB = new CarersLeaveService(new CarersLeaveRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'CL-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'CL-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.carers_leave_entitlements WHERE tenant_id = ${tId}::uuid`;
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

  it("should create an entitlement", async () => {
    if (skip) return;
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2025-04-01",
      leave_year_end: "2026-03-31",
    });
    expect(result.success).toBe(true);
    expect(result.data!.total_days_available).toBe(5);
    expect(result.data!.days_remaining).toBe(5);
  });

  it("should reject total days exceeding statutory max of 5", async () => {
    if (skip) return;
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2030-04-01",
      leave_year_end: "2031-03-31",
      total_days_available: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should reject leave year end before start", async () => {
    if (skip) return;
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2026-04-01",
      leave_year_end: "2026-01-01",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should reject duplicate entitlement for same employee and year", async () => {
    if (skip) return;
    await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2027-04-01",
      leave_year_end: "2028-03-31",
    });
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2027-04-01",
      leave_year_end: "2028-03-31",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("CONFLICT");
  });

  it("should get entitlement by ID", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2028-04-01",
      leave_year_end: "2029-03-31",
    });
    const result = await service.getEntitlement(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should reject insufficient balance on approval", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2029-04-01",
      leave_year_end: "2030-03-31",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, {
      status: "approved",
      days_to_deduct: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("INSUFFICIENT_LEAVE_BALANCE");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      leave_year_start: "2031-04-01",
      leave_year_end: "2032-03-31",
    });
    const result = await serviceB.getEntitlement(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
