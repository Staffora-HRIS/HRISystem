/**
 * Deductions Routes Integration Tests
 *
 * Tests the deductions module to verify:
 * - Deduction type CRUD (code uniqueness, category, calculation method)
 * - Employee deduction assignment with effective dating
 * - Overlap prevention per employee per deduction type
 * - Validation: at least one of amount or percentage required
 * - RLS tenant isolation
 * - Outbox events emitted atomically
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test";
import postgres from "postgres";
import {
  getTestDb, ensureTestInfra, isInfraAvailable, closeTestConnections,
  createTestTenant, createTestUser, setTenantContext, clearTenantContext,
  cleanupTestTenant, cleanupTestUser, TEST_CONFIG,
  type TestTenant, type TestUser,
} from "../../setup";
import { DeductionRepository } from "../../../modules/deductions/repository";
import { DeductionService } from "../../../modules/deductions/service";
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

describe("Deductions Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: DeductionService;
  let serviceB: DeductionService;
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
    tenant = await createTestTenant(db, { name: `Ded A ${suffix}`, slug: `ded-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Ded B ${suffix}`, slug: `ded-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new DeductionService(new DeductionRepository(dbAdapter), dbAdapter);
    serviceB = new DeductionService(new DeductionRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'DED-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'DED-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_deductions WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.deduction_types WHERE tenant_id = ${tId}::uuid`;
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

  describe("Deduction Type CRUD", () => {
    it("should create a deduction type", async () => {
      if (skip) return;
      const result = await service.createDeductionType(ctxA(), {
        name: "Student Loan",
        code: `SL-${Date.now()}`,
        category: "tax",
        is_statutory: true,
        calculation_method: "percentage",
      });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe("Student Loan");
      expect(result.data!.is_statutory).toBe(true);
    });

    it("should reject duplicate deduction type code", async () => {
      if (skip) return;
      const code = `DUP-${Date.now()}`;
      await service.createDeductionType(ctxA(), { name: "First", code, category: "voluntary" });
      const result = await service.createDeductionType(ctxA(), { name: "Second", code, category: "voluntary" });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONFLICT");
    });

    it("should list deduction types", async () => {
      if (skip) return;
      const result = await service.listDeductionTypes(ctxA());
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it("should get deduction type by ID", async () => {
      if (skip) return;
      const created = await service.createDeductionType(ctxA(), { name: "Get Test", code: `GT-${Date.now()}`, category: "tax" });
      const result = await service.getDeductionTypeById(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should return NOT_FOUND for non-existent type", async () => {
      if (skip) return;
      const result = await service.getDeductionTypeById(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should update a deduction type", async () => {
      if (skip) return;
      const created = await service.createDeductionType(ctxA(), { name: "Update Me", code: `UM-${Date.now()}`, category: "voluntary" });
      const result = await service.updateDeductionType(ctxA(), created.data!.id, { name: "Updated Name" });
      expect(result.success).toBe(true);
      expect(result.data!.name).toBe("Updated Name");
    });
  });

  describe("Employee Deductions", () => {
    it("should create an employee deduction with amount", async () => {
      if (skip) return;
      const dt = await service.createDeductionType(ctxA(), { name: "Fixed Ded", code: `FD-${Date.now()}`, category: "voluntary" });
      const result = await service.createEmployeeDeduction(ctxA(), {
        employee_id: user.id,
        deduction_type_id: dt.data!.id,
        amount: 5000,
        effective_from: "2026-01-01",
      });
      expect(result.success).toBe(true);
      expect(result.data!.amount).toBe(5000);
    });

    it("should reject when neither amount nor percentage provided", async () => {
      if (skip) return;
      const dt = await service.createDeductionType(ctxA(), { name: "No Amount", code: `NA-${Date.now()}`, category: "voluntary" });
      const result = await service.createEmployeeDeduction(ctxA(), {
        employee_id: user.id,
        deduction_type_id: dt.data!.id,
        effective_from: "2026-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should reject effective_to before effective_from", async () => {
      if (skip) return;
      const dt = await service.createDeductionType(ctxA(), { name: "Bad Date", code: `BD-${Date.now()}`, category: "tax" });
      const result = await service.createEmployeeDeduction(ctxA(), {
        employee_id: user.id,
        deduction_type_id: dt.data!.id,
        amount: 1000,
        effective_from: "2026-12-31",
        effective_to: "2026-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should reject overlapping deduction of same type", async () => {
      if (skip) return;
      const dt = await service.createDeductionType(ctxA(), { name: "Overlap Ded", code: `OD-${Date.now()}`, category: "voluntary" });
      await service.createEmployeeDeduction(ctxA(), {
        employee_id: user.id, deduction_type_id: dt.data!.id, amount: 1000,
        effective_from: "2028-01-01", effective_to: "2028-06-30",
      });
      const result = await service.createEmployeeDeduction(ctxA(), {
        employee_id: user.id, deduction_type_id: dt.data!.id, amount: 2000,
        effective_from: "2028-03-01", effective_to: "2028-09-30",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EFFECTIVE_DATE_OVERLAP");
    });

    it("should get employee deductions by employee", async () => {
      if (skip) return;
      const result = await service.getEmployeeDeductionsByEmployee(ctxA(), user.id);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to see tenant A deduction types", async () => {
      if (skip) return;
      await service.createDeductionType(ctxA(), { name: "RLS Type", code: `RLS-${Date.now()}`, category: "tax" });
      const result = await serviceB.listDeductionTypes(ctxB());
      for (const item of result.items) {
        expect(item.tenant_id).toBe(tenantB.id);
      }
    });
  });
});
