/**
 * Tax Codes Routes Integration Tests
 *
 * Tests the tax codes module to verify:
 * - Tax code CRUD for employees
 * - Cumulative/week1-month1 mutual exclusivity validation
 * - Effective date overlap prevention
 * - Date range validation
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
import { TaxCodeRepository } from "../../../modules/tax-codes/repository";
import { TaxCodeService } from "../../../modules/tax-codes/service";
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

describe("Tax Codes Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: TaxCodeService;
  let serviceB: TaxCodeService;
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
    tenant = await createTestTenant(db, { name: `Tax A ${suffix}`, slug: `tax-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Tax B ${suffix}`, slug: `tax-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new TaxCodeService(new TaxCodeRepository(dbAdapter), dbAdapter);
    serviceB = new TaxCodeService(new TaxCodeRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'TAX-001', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date) VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'TAX-002', 'active', CURRENT_DATE) ON CONFLICT (id) DO NOTHING`;
    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({ host: TEST_CONFIG.database.host, port: TEST_CONFIG.database.port, database: TEST_CONFIG.database.database, username: TEST_CONFIG.database.adminUsername, password: TEST_CONFIG.database.adminPassword, max: 1, idle_timeout: 5, connect_timeout: 10 });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.employee_tax_codes WHERE tenant_id = ${tId}::uuid`;
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

  describe("Tax Code CRUD", () => {
    it("should create a tax code for an employee", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id,
        tax_code: "1257L",
        is_cumulative: true,
        week1_month1: false,
        effective_from: "2026-04-06",
        source: "manual",
      });
      expect(result.success).toBe(true);
      expect(result.data!.tax_code).toBe("1257L");
      expect(result.data!.is_cumulative).toBe(true);
    });

    it("should get tax code by ID", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "BR", effective_from: "2027-04-06", effective_to: "2027-12-31",
      });
      const result = await service.getTaxCodeById(ctxA(), created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.tax_code).toBe("BR");
    });

    it("should list tax codes by employee", async () => {
      if (skip) return;
      const result = await service.getTaxCodesByEmployee(ctxA(), user.id);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(1);
    });

    it("should return NOT_FOUND for non-existent tax code", async () => {
      if (skip) return;
      const result = await service.getTaxCodeById(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should update a tax code", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "D0", effective_from: "2028-04-06", effective_to: "2028-12-31",
      });
      const result = await service.updateTaxCode(ctxA(), created.data!.id, { tax_code: "D1" });
      expect(result.success).toBe(true);
      expect(result.data!.tax_code).toBe("D1");
    });
  });

  describe("Validation Rules", () => {
    it("should reject cumulative and week1_month1 both true", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        is_cumulative: true, week1_month1: true,
        effective_from: "2029-04-06",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
      expect(result.error?.message).toContain("is_cumulative and week1_month1");
    });

    it("should reject effective_to before effective_from", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2030-12-31", effective_to: "2030-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should reject overlapping tax codes", async () => {
      if (skip) return;
      await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2031-01-01", effective_to: "2031-06-30",
      });
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "BR",
        effective_from: "2031-03-01", effective_to: "2031-09-30",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EFFECTIVE_DATE_OVERLAP");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A tax codes", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "RLS-TEST",
        effective_from: "2032-04-06", effective_to: "2032-12-31",
      });
      const result = await serviceB.getTaxCodeById(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Outbox Events", () => {
    it("should emit domain event on tax code creation", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "OB-1257L",
        effective_from: "2033-04-06", effective_to: "2033-12-31",
      });
      expect(created.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'employee_tax_code' AND aggregate_id = ${created.data!.id}::uuid
      `;
      expect(outbox.some(e => e.event_type === "payroll.tax_code.created")).toBe(true);
    });
  });
});
