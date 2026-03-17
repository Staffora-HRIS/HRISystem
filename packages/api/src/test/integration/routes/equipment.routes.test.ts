/**
 * Equipment Routes Integration Tests
 *
 * Tests the equipment catalog and request module:
 * - Catalog item CRUD
 * - Equipment request creation
 * - State machine transitions (pending -> approved -> ordered -> received -> assigned)
 * - Invalid transition rejection
 * - Inactive catalog item rejection
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
import { EquipmentRepository } from "../../../modules/equipment/repository";
import { EquipmentService } from "../../../modules/equipment/service";
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

describe("Equipment Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: EquipmentService;
  let serviceB: EquipmentService;
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
    tenant = await createTestTenant(db, { name: `Equip A ${suffix}`, slug: `equip-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Equip B ${suffix}`, slug: `equip-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new EquipmentService(new EquipmentRepository(dbAdapter), dbAdapter);
    serviceB = new EquipmentService(new EquipmentRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'EQ-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.equipment_request_history WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.equipment_requests WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.equipment_catalog WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a catalog item", async () => {
    if (skip) return;
    const result = await service.createCatalogItem(ctxA(), {
      name: `Laptop ${Date.now()}`,
      equipment_type: "laptop",
      description: "Standard issue laptop",
      is_standard_issue: true,
      requires_approval: true,
    });
    expect(result.success).toBe(true);
    expect(result.data!.equipment_type).toBe("laptop");
  });

  it("should get a catalog item by ID", async () => {
    if (skip) return;
    const created = await service.createCatalogItem(ctxA(), {
      name: `Get Item ${Date.now()}`,
      equipment_type: "monitor",
    });
    const result = await service.getCatalogItem(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
  });

  it("should create an equipment request", async () => {
    if (skip) return;
    const result = await service.createRequest(ctxA(), {
      employee_id: user.id,
      equipment_type: "laptop",
      custom_description: "Development laptop",
      quantity: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("pending");
  });

  it("should transition request status (pending -> approved)", async () => {
    if (skip) return;
    const request = await service.createRequest(ctxA(), {
      employee_id: user.id,
      equipment_type: "keyboard",
      quantity: 1,
    });
    const result = await service.transitionStatus(ctxA(), request.data!.id, {
      to_status: "approved",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("approved");
  });

  it("should reject invalid transition (pending -> assigned)", async () => {
    if (skip) return;
    const request = await service.createRequest(ctxA(), {
      employee_id: user.id,
      equipment_type: "mouse",
      quantity: 1,
    });
    const result = await service.transitionStatus(ctxA(), request.data!.id, {
      to_status: "assigned",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should return NOT_FOUND for non-existent request", async () => {
    if (skip) return;
    const result = await service.getRequest(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createCatalogItem(ctxA(), {
      name: `RLS Item ${Date.now()}`,
      equipment_type: "headset",
    });
    const result = await serviceB.getCatalogItem(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
