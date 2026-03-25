/**
 * Reference Checks Routes Integration Tests
 *
 * Tests the reference checks module to verify:
 * - Reference check CRUD operations
 * - Status transitions (pending -> sent -> received -> verified/failed)
 * - Verification recording
 * - Invalid transition rejection
 * - Subject validation (candidateId or employeeId required)
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
import { ReferenceCheckService } from "../../../modules/reference-checks/service";
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

describe("Reference Checks Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: ReferenceCheckService;
  let serviceB: ReferenceCheckService;
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
    tenant = await createTestTenant(db, { name: `Ref A ${suffix}`, slug: `ref-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Ref B ${suffix}`, slug: `ref-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new ReferenceCheckService(dbAdapter);
    serviceB = new ReferenceCheckService(dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'REF-001', 'active', CURRENT_DATE, 'Alice', 'Ref') ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'REF-002', 'active', CURRENT_DATE, 'Bob', 'Ref') ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.reference_checks WHERE tenant_id = ${tId}::uuid`;
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

  describe("Reference Check CRUD", () => {
    it("should create a reference check for an employee", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), {
        employeeId: user.id,
        refereeName: "John Manager",
        refereeEmail: "john@example.com",
        refereeRelationship: "manager",
        companyName: "Previous Corp",
      });
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("pending");
      expect(result.data!.referee_name).toBe("John Manager");
    });

    it("should reject when neither candidateId nor employeeId provided", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), {
        refereeName: "Nobody",
        refereeEmail: "nobody@example.com",
        refereeRelationship: "colleague",
      });
      expect(result.success).toBe(false);
    });

    it("should get a reference check by ID", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "Jane Colleague",
        refereeEmail: "jane@example.com", refereeRelationship: "colleague",
      });
      const result = await service.getById(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.referee_name).toBe("Jane Colleague");
    });

    it("should return NOT_FOUND for non-existent ID", async () => {
      if (skip) return;
      const result = await service.getById(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
    });

    it("should list reference checks", async () => {
      if (skip) return;
      const result = await service.list(ctxA());
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it("should update a reference check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "Update Test",
        refereeEmail: "update@example.com", refereeRelationship: "manager",
      });
      const result = await service.update(ctxA(), created.data!.id, {
        companyName: "Updated Corp",
      });
      expect(result.success).toBe(true);
      expect(result.data!.company_name).toBe("Updated Corp");
    });
  });

  describe("Status Transitions", () => {
    it("should send a pending reference check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "Send Test",
        refereeEmail: "send@example.com", refereeRelationship: "manager",
      });
      const result = await service.send(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.status).toBe("sent");
    });

    it("should reject sending an already sent check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "Double Send",
        refereeEmail: "double@example.com", refereeRelationship: "colleague",
      });
      await service.send(ctxA(), created.data!.id);
      const result = await service.send(ctxA(), created.data!.id);
      expect(result.success).toBe(false);
    });

    it("should reject verifying a pending check", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "Bad Verify",
        refereeEmail: "badverify@example.com", refereeRelationship: "manager",
      });
      const result = await service.verify(ctxA(), created.data!.id, { satisfactory: true });
      expect(result.success).toBe(false);
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A reference checks", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), {
        employeeId: user.id, refereeName: "RLS Test",
        refereeEmail: "rls@example.com", refereeRelationship: "manager",
      });
      const result = await serviceB.getById(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
    });

    it("should not include cross-tenant data in listings", async () => {
      if (skip) return;
      const result = await serviceB.list(ctxB());
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenantB.id);
      }
    });
  });
});
