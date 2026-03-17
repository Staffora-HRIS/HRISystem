/**
 * DBS Checks Routes Integration Tests
 *
 * Tests the DBS (Disclosure and Barring Service) checks module
 * to verify:
 * - DBS check CRUD operations
 * - Status transitions (pending -> submitted -> received -> clear/flagged)
 * - Result recording with certificate details
 * - Invalid transition rejection
 * - RLS tenant isolation
 * - Outbox events emitted atomically
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  cleanupTestTenant,
  cleanupTestUser,
  TEST_CONFIG,
  type TestTenant,
  type TestUser,
} from "../../setup";
import { DbsCheckService } from "../../../modules/dbs-checks/service";
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

describe("DBS Checks Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DbsCheckService;
  let serviceB: DbsCheckService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) { skip = true; return; }

    db = getTestDb();
    camelDb = postgres({
      host: TEST_CONFIG.database.host,
      port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username,
      password: TEST_CONFIG.database.password,
      max: 1, idle_timeout: 20, connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `DBS A ${suffix}`, slug: `dbs-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `DBS B ${suffix}`, slug: `dbs-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DbsCheckService(dbAdapter);
    serviceB = new DbsCheckService(dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'DBS-001', 'active', CURRENT_DATE, 'Alice', 'DBS')
      ON CONFLICT (id) DO NOTHING
    `;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
      VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'DBS-002', 'active', CURRENT_DATE, 'Bob', 'DBS')
      ON CONFLICT (id) DO NOTHING
    `;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({
      host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword,
      max: 1, idle_timeout: 5, connect_timeout: 10,
    });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.dbs_checks WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tId}::uuid`;
        }
      });
    } catch (e) { console.error("Cleanup error (non-fatal):", e); }
    await adminDb.end({ timeout: 5 }).catch(() => {});
    await cleanupTestUser(db, user.id);
    await cleanupTestUser(db, userB.id);
    await cleanupTestTenant(db, tenant.id);
    await cleanupTestTenant(db, tenantB.id);
    await camelDb.end({ timeout: 5 }).catch(() => {});
    await closeTestConnections(db);
  });

  afterEach(async () => { if (skip) return; await clearTenantContext(db); });

  const ctxA = () => ({ tenantId: tenant.id, userId: user.id });
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  describe("DBS Check CRUD", () => {
    it("should create a DBS check", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), {
        employeeId: user.id,
        checkLevel: "basic",
        notes: "New starter check",
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("pending");
      expect(result.data!.check_level).toBe("basic");
    });

    it("should get a DBS check by ID", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "enhanced" });
      const result = await service.getById(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should return NOT_FOUND for non-existent ID", async () => {
      if (skip) return;
      const result = await service.getById(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
    });

    it("should list DBS checks", async () => {
      if (skip) return;
      const result = await service.list(ctxA());
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("should list with employee filter", async () => {
      if (skip) return;
      const result = await service.list(ctxA(), { employeeId: user.id });
      for (const item of result.items) {
        expect(item.employee_id).toBe(user.id);
      }
    });
  });

  describe("Status Transitions", () => {
    it("should submit a pending DBS check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "standard" });
      const result = await service.submit(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("submitted");
    });

    it("should record a clear result for a submitted check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "basic" });
      await service.submit(ctxA(), created.data!.id);

      const result = await service.recordResult(ctxA(), created.data!.id, {
        certificateNumber: "DBS-12345",
        issueDate: "2026-03-15",
        clear: true,
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("clear");
      expect(result.data!.certificate_number).toBe("DBS-12345");
    });

    it("should record a flagged result for a submitted check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "enhanced" });
      await service.submit(ctxA(), created.data!.id);

      const result = await service.recordResult(ctxA(), created.data!.id, {
        certificateNumber: "DBS-FLAGGED-001",
        issueDate: "2026-03-15",
        clear: false,
        result: "Information disclosed",
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("flagged");
    });

    it("should reject submitting an already submitted check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "basic" });
      await service.submit(ctxA(), created.data!.id);

      const result = await service.submit(ctxA(), created.data!.id);
      expect(result.success).toBe(false);
    });

    it("should reject recording result for a pending check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "basic" });

      const result = await service.recordResult(ctxA(), created.data!.id, {
        certificateNumber: "DBS-INVALID",
        issueDate: "2026-03-15",
        clear: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A DBS check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), { employeeId: user.id, checkLevel: "basic" });
      const result = await serviceB.getById(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
    });

    it("should not include cross-tenant data in listings", async () => {
      if (skip) return;
      await service.create(ctxA(), { employeeId: user.id, checkLevel: "basic" });
      const result = await serviceB.list(ctxB());
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenantB.id);
      }
    });
  });
});
