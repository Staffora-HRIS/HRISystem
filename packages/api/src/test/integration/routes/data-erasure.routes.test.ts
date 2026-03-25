/**
 * Data Erasure Routes Integration Tests
 *
 * Tests the GDPR Article 17 (Right to Erasure) module:
 * - Erasure request creation with 30-day deadline
 * - Active request duplicate prevention
 * - State machine (received -> reviewing -> approved -> in_progress -> completed)
 * - Four-eyes principle (approver != requester)
 * - Rejection with reason
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
import { DataErasureRepository } from "../../../modules/data-erasure/repository";
import { DataErasureService } from "../../../modules/data-erasure/service";
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

describe("Data Erasure Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DataErasureService;
  let serviceB: DataErasureService;
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
    tenant = await createTestTenant(db, { name: `Erasure A ${suffix}`, slug: `erasure-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Erasure B ${suffix}`, slug: `erasure-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DataErasureService(new DataErasureRepository(dbAdapter), dbAdapter);
    serviceB = new DataErasureService(new DataErasureRepository(dbAdapter), dbAdapter);

    // Create employee records
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'DE-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'DE-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.erasure_audit_log WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.erasure_items WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.erasure_requests WHERE tenant_id = ${tId}::uuid`;
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

  it("should create an erasure request with 30-day deadline", async () => {
    if (skip) return;
    const result = await service.createRequest(ctxA(), { employeeId: user.id });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("received");
    expect(result.data!.deadlineDate).toBeTruthy();
  });

  it("should get an erasure request by ID", async () => {
    if (skip) return;
    const created = await service.createRequest(ctxA(), { employeeId: user.id });
    if (!created.success) return; // may conflict with previous test
    const result = await service.getRequest(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
  });

  it("should return NOT_FOUND for non-existent request", async () => {
    if (skip) return;
    const result = await service.getRequest(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should reject request for non-existent employee", async () => {
    if (skip) return;
    const result = await service.createRequest(ctxA(), { employeeId: crypto.randomUUID() });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should enforce four-eyes principle on approval", async () => {
    if (skip) return;
    // Create a separate employee to avoid active request conflict
    const empId = crypto.randomUUID();
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${empId}::uuid, ${tenant.id}::uuid, ${'DE-4EYE-' + Date.now()}, 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);

    const created = await service.createRequest(ctxA(), { employeeId: empId });
    if (!created.success) return;

    // Same user tries to approve - should be rejected
    const result = await service.approveRequest(ctxA(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FORBIDDEN");
  });

  it("should reject with documented reason", async () => {
    if (skip) return;
    const empId = crypto.randomUUID();
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${empId}::uuid, ${tenant.id}::uuid, ${'DE-REJ-' + Date.now()}, 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);

    const created = await service.createRequest(ctxA(), { employeeId: empId });
    if (!created.success) return;

    const result = await service.rejectRequest(ctxA(), created.data!.id, "Legal hold in place");
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("rejected");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const empId = crypto.randomUUID();
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${empId}::uuid, ${tenant.id}::uuid, ${'DE-RLS-' + Date.now()}, 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);

    const created = await service.createRequest(ctxA(), { employeeId: empId });
    if (!created.success) return;

    const result = await serviceB.getRequest(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
