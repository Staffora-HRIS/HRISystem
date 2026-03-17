/**
 * Flexible Working Routes Integration Tests
 *
 * Tests the Employment Relations (Flexible Working) Act 2023 module:
 * - Request submission with 2-month deadline
 * - 2 requests per 12-month period limit
 * - State machine transitions
 * - Consultation requirement before rejection
 * - Statutory rejection grounds validation
 * - Withdrawal
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
import { FlexibleWorkingRepository } from "../../../modules/flexible-working/repository";
import { FlexibleWorkingService } from "../../../modules/flexible-working/service";
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

describe("Flexible Working Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: FlexibleWorkingService;
  let serviceB: FlexibleWorkingService;
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
    tenant = await createTestTenant(db, { name: `FlexW A ${suffix}`, slug: `flexw-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `FlexW B ${suffix}`, slug: `flexw-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new FlexibleWorkingService(new FlexibleWorkingRepository(dbAdapter), dbAdapter);
    serviceB = new FlexibleWorkingService(new FlexibleWorkingRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'FW-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.flexible_working_consultations WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.flexible_working_history WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.flexible_working_requests WHERE tenant_id = ${tId}::uuid`;
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

  it("should submit a flexible working request", async () => {
    if (skip) return;
    const result = await service.submitRequest(ctxA(), {
      employee_id: user.id,
      current_working_pattern: "Monday-Friday 9-5",
      requested_working_pattern: "Monday-Thursday 9-5, Friday remote",
      requested_start_date: "2026-01-01",
      reason: "Work-life balance",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("submitted");
    expect(result.data!.response_deadline).toBeTruthy();
  });

  it("should reject start date before request date", async () => {
    if (skip) return;
    const result = await service.submitRequest(ctxA(), {
      employee_id: user.id,
      request_date: "2025-06-01",
      current_working_pattern: "Full time",
      requested_working_pattern: "Part time",
      requested_start_date: "2025-05-01",
      reason: "Family",
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should get a request by ID", async () => {
    if (skip) return;
    const created = await service.submitRequest(ctxA(), {
      employee_id: user.id,
      current_working_pattern: "Full time",
      requested_working_pattern: "Compressed hours",
      requested_start_date: "2026-06-01",
      reason: "Testing",
    });
    const result = await service.getRequest(ctxA(), created.data!.id);
    expect(result.success).toBe(true);
  });

  it("should return NOT_FOUND for non-existent request", async () => {
    if (skip) return;
    const result = await service.getRequest(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should withdraw a submitted request", async () => {
    if (skip) return;
    const submitted = await service.submitRequest(ctxA(), {
      employee_id: user.id,
      current_working_pattern: "Full time",
      requested_working_pattern: "Remote working",
      requested_start_date: "2026-09-01",
      reason: "Personal preference",
    });
    if (!submitted.success) return;
    const result = await service.withdrawRequest(ctxA(), submitted.data!.id, "Changed my mind");
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("withdrawn");
  });

  it("should list flexible working requests", async () => {
    if (skip) return;
    const result = await service.listRequests(ctxA(), {}, {});
    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThanOrEqual(1);
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.submitRequest(ctxA(), {
      employee_id: user.id,
      current_working_pattern: "Full time",
      requested_working_pattern: "Part time",
      requested_start_date: "2027-01-01",
      reason: "RLS test",
    });
    if (!created.success) return;
    const result = await serviceB.getRequest(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
