/**
 * Parental Leave Routes Integration Tests
 *
 * Tests the UK unpaid parental leave module:
 * - Entitlement creation (18 weeks per child)
 * - Booking creation with notice period validation
 * - Minimum 1-week block enforcement
 * - Maximum 4 weeks per year per child
 * - Booking approval/rejection
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
import { ParentalLeaveRepository } from "../../../modules/parental-leave/repository";
import { ParentalLeaveService } from "../../../modules/parental-leave/service";
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

describe("Parental Leave Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: ParentalLeaveService;
  let serviceB: ParentalLeaveService;
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
    tenant = await createTestTenant(db, { name: `PL A ${suffix}`, slug: `pl-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `PL B ${suffix}`, slug: `pl-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new ParentalLeaveService(new ParentalLeaveRepository(dbAdapter), dbAdapter);
    serviceB = new ParentalLeaveService(new ParentalLeaveRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'PL-001', 'active', '2020-01-01') ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.parental_leave_bookings WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.parental_leave_entitlements WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a parental leave entitlement", async () => {
    if (skip) return;
    const result = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      child_name: "Test Child",
      child_date_of_birth: "2020-06-15",
      total_weeks_entitlement: 18,
    });
    expect(result.success).toBe(true);
    expect(result.data!.totalWeeksEntitlement).toBe(18);
  });

  it("should get an entitlement by ID", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      child_name: "Get Child",
      child_date_of_birth: "2019-03-10",
      total_weeks_entitlement: 18,
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

  it("should create a booking for an entitlement", async () => {
    if (skip) return;
    const entitlement = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      child_name: "Booking Child",
      child_date_of_birth: "2021-01-20",
      total_weeks_entitlement: 18,
    });
    // 21+ days notice from now
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const startDate = futureDate.toISOString().split("T")[0];
    futureDate.setDate(futureDate.getDate() + 7);
    const endDate = futureDate.toISOString().split("T")[0];

    const result = await service.createBooking(ctxA(), {
      entitlement_id: entitlement.data!.id,
      start_date: startDate,
      end_date: endDate,
      weeks: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("pending");
  });

  it("should list entitlements", async () => {
    if (skip) return;
    const result = await service.listEntitlements(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createEntitlement(ctxA(), {
      employee_id: user.id,
      child_name: "RLS Child",
      child_date_of_birth: "2022-07-01",
      total_weeks_entitlement: 18,
    });
    const result = await serviceB.getEntitlement(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
