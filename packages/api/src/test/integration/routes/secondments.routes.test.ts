/**
 * Secondments Routes Integration Tests
 *
 * Tests the secondment management module:
 * - Secondment CRUD operations
 * - Date validation (end after start)
 * - State machine (proposed -> approved -> active -> completed)
 * - Invalid transition rejection
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
import { SecondmentRepository } from "../../../modules/secondments/repository";
import { SecondmentService } from "../../../modules/secondments/service";
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

describe("Secondments Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: SecondmentService;
  let serviceB: SecondmentService;
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
    tenant = await createTestTenant(db, { name: `Sec A ${suffix}`, slug: `sec-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Sec B ${suffix}`, slug: `sec-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new SecondmentService(new SecondmentRepository(dbAdapter), dbAdapter);
    serviceB = new SecondmentService(new SecondmentRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'SEC-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.secondments WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a secondment", async () => {
    if (skip) return;
    const result = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "Partner Corp",
      start_date: "2025-07-01",
      expected_end_date: "2025-12-31",
      reason: "Knowledge sharing initiative",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("proposed");
  });

  it("should get a secondment by ID", async () => {
    if (skip) return;
    const created = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "Get Corp",
      start_date: "2025-08-01",
      expected_end_date: "2026-01-31",
      reason: "Testing",
    });
    const result = await service.getSecondment(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
    expect(result.data!.id).toBe(created.data!.id);
  });

  it("should return NOT_FOUND for non-existent secondment", async () => {
    if (skip) return;
    const result = await service.getSecondment(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should reject end date before start date", async () => {
    if (skip) return;
    const result = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "Invalid Dates",
      start_date: "2025-12-01",
      expected_end_date: "2025-06-01",
      reason: "Should fail",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should transition status (proposed -> approved)", async () => {
    if (skip) return;
    const created = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "Approve Corp",
      start_date: "2025-09-01",
      expected_end_date: "2026-02-28",
      reason: "Transition test",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, {
      to_status: "approved",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("approved");
  });

  it("should reject invalid transition (proposed -> completed)", async () => {
    if (skip) return;
    const created = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "Invalid Trans",
      start_date: "2025-10-01",
      expected_end_date: "2026-03-31",
      reason: "Invalid transition test",
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, {
      to_status: "completed",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should list secondments", async () => {
    if (skip) return;
    const result = await service.listSecondments(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.createSecondment(ctxA(), {
      employee_id: user.id,
      to_external_org: "RLS Corp",
      start_date: "2025-11-01",
      expected_end_date: "2026-04-30",
      reason: "RLS test",
    });
    const result = await serviceB.getSecondment(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
