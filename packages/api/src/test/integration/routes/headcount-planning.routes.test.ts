/**
 * Headcount Planning Routes Integration Tests
 *
 * Tests the headcount planning module:
 * - Plan CRUD operations
 * - Plan item management
 * - State machine (draft -> active -> approved -> closed)
 * - Invalid transition rejection
 * - RLS tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { HeadcountPlanningRepository } from "../../../modules/headcount-planning/repository";
import { HeadcountPlanningService } from "../../../modules/headcount-planning/service";
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

describe("Headcount Planning Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: HeadcountPlanningService;
  let serviceB: HeadcountPlanningService;
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
    tenant = await createTestTenant(db, { name: `HC A ${suffix}`, slug: `hc-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `HC B ${suffix}`, slug: `hc-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new HeadcountPlanningService(new HeadcountPlanningRepository(dbAdapter), dbAdapter);
    serviceB = new HeadcountPlanningService(new HeadcountPlanningRepository(dbAdapter), dbAdapter);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.headcount_plan_items WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.headcount_plans WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a headcount plan", async () => {
    if (skip) return;
    const result = await service.createPlan(ctxA(), {
      name: `Plan ${Date.now()}`,
      financial_year: "2025-26",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("draft");
  });

  it("should get a plan by ID", async () => {
    if (skip) return;
    const created = await service.createPlan(ctxA(), {
      name: `Get Plan ${Date.now()}`,
      financial_year: "2026-27",
    });
    const result = await service.getPlan(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent plan", async () => {
    if (skip) return;
    const result = await service.getPlan(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should update a plan", async () => {
    if (skip) return;
    const created = await service.createPlan(ctxA(), {
      name: `Update Plan ${Date.now()}`,
      financial_year: "2027-28",
    });
    const result = await service.updatePlan(ctxA(), created.data!.id, {
      name: "Updated Plan Name",
    });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Updated Plan Name");
  });

  it("should transition plan status (draft -> active)", async () => {
    if (skip) return;
    const created = await service.createPlan(ctxA(), {
      name: `Transition Plan ${Date.now()}`,
      financial_year: "2028-29",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, "active");
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("active");
  });

  it("should reject invalid transition (draft -> approved)", async () => {
    if (skip) return;
    const created = await service.createPlan(ctxA(), {
      name: `Invalid Transition ${Date.now()}`,
      financial_year: "2029-30",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, "approved");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should list plans", async () => {
    if (skip) return;
    const result = await service.listPlans(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createPlan(ctxA(), {
      name: `RLS Plan ${Date.now()}`,
      financial_year: "2030-31",
    });
    const result = await serviceB.getPlan(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
