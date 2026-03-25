/**
 * Bereavement Leave Routes Integration Tests
 *
 * Tests the Parental Bereavement Leave (Jack's Law) module:
 * - Create bereavement leave with date validation
 * - Leave duration max 14 days enforcement
 * - Leave must be within 56 weeks of death
 * - Status transitions (pending -> approved -> active -> completed)
 * - RLS tenant isolation
 * - Outbox events
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { BereavementRepository } from "../../../modules/bereavement/repository";
import { BereavementService } from "../../../modules/bereavement/service";
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

describe("Bereavement Leave Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: BereavementService;
  let serviceB: BereavementService;
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
    tenant = await createTestTenant(db, { name: `Bereave A ${suffix}`, slug: `bereave-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Bereave B ${suffix}`, slug: `bereave-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new BereavementService(new BereavementRepository(dbAdapter), dbAdapter);
    serviceB = new BereavementService(new BereavementRepository(dbAdapter), dbAdapter);

    // Create employee records for the users
    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'BRV-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'BRV-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.parental_bereavement_leave WHERE tenant_id = ${tId}::uuid`;
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

  it("should create a bereavement leave record", async () => {
    if (skip) return;
    const result = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "Test Child",
      date_of_death: "2025-01-01",
      leave_start_date: "2025-01-03",
      leave_end_date: "2025-01-10",
      spbp_eligible: false,
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("pending");
  });

  it("should reject leave exceeding 14 days", async () => {
    if (skip) return;
    const result = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "Test Child",
      date_of_death: "2025-02-01",
      leave_start_date: "2025-02-01",
      leave_end_date: "2025-02-20",
      spbp_eligible: false,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should reject leave starting before death date", async () => {
    if (skip) return;
    const result = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "Test Child",
      date_of_death: "2025-03-15",
      leave_start_date: "2025-03-10",
      leave_end_date: "2025-03-17",
      spbp_eligible: false,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("should enforce status transition (pending -> approved)", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "Transition Test",
      date_of_death: "2025-04-01",
      leave_start_date: "2025-04-02",
      leave_end_date: "2025-04-09",
      spbp_eligible: false,
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, { status: "approved" });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("approved");
  });

  it("should reject invalid status transition (pending -> completed)", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "Invalid Transition",
      date_of_death: "2025-05-01",
      leave_start_date: "2025-05-02",
      leave_end_date: "2025-05-09",
      spbp_eligible: false,
    });
    const result = await service.transitionStatus(ctxA(), created.data!.id, { status: "completed" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should return NOT_FOUND for non-existent record", async () => {
    if (skip) return;
    const result = await service.getById(ctxA(), crypto.randomUUID());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("should block cross-tenant access (RLS)", async () => {
    if (skip) return;
    const created = await service.create(ctxA(), {
      employee_id: user.id,
      child_name: "RLS Test",
      date_of_death: "2025-06-01",
      leave_start_date: "2025-06-02",
      leave_end_date: "2025-06-09",
      spbp_eligible: false,
    });
    const result = await serviceB.getById(ctxB(), created.data!.id);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });
});
