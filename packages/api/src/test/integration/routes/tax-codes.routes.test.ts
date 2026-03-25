/**
 * Tax Codes Routes Integration Tests
 *
 * Tests the tax codes module to verify:
 * - Tax code CRUD for employees
 * - UK HMRC tax code format validation
 * - Cumulative/week1-month1 mutual exclusivity validation
 * - Effective date overlap prevention (create and update)
 * - Date range validation
 * - Current tax code lookup for payroll processing
 * - Expanded source types (hmrc, manual, p45, p46, starter_declaration)
 * - Notes field support
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
      max: 5, idle_timeout: 20, connect_timeout: 10,
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

  // ===========================================================================
  // Tax Code CRUD
  // ===========================================================================

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
      expect(result.data!.source).toBe("manual");
    });

    it("should create a tax code with notes", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id,
        tax_code: "BR",
        effective_from: "2040-04-06",
        effective_to: "2040-12-31",
        source: "p45",
        notes: "Tax code from P45 received 2026-04-01",
      });
      expect(result.success).toBe(true);
      expect(result.data!.notes).toBe("Tax code from P45 received 2026-04-01");
      expect(result.data!.source).toBe("p45");
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

    it("should update a tax code with notes", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "NT", effective_from: "2041-01-01", effective_to: "2041-06-30",
      });
      const result = await service.updateTaxCode(ctxA(), created.data!.id, {
        notes: "Updated per HMRC P6 notice dated 2026-04-10",
      });
      expect(result.success).toBe(true);
      expect(result.data!.notes).toBe("Updated per HMRC P6 notice dated 2026-04-10");
    });
  });

  // ===========================================================================
  // Tax Code Format Validation
  // ===========================================================================

  describe("UK Tax Code Format Validation", () => {
    it("should accept standard tax codes: 1257L", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L", effective_from: "2042-01-01", effective_to: "2042-06-30",
      });
      expect(result.success).toBe(true);
    });

    it("should accept Scottish tax codes: S1257L", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "S1257L", effective_from: "2042-07-01", effective_to: "2042-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("should accept Welsh tax codes: C1257L", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "C1257L", effective_from: "2043-01-01", effective_to: "2043-06-30",
      });
      expect(result.success).toBe(true);
    });

    it("should accept K codes: K100", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "K100", effective_from: "2043-07-01", effective_to: "2043-12-31",
      });
      expect(result.success).toBe(true);
    });

    it("should accept fixed rate codes: BR, D0, D1, NT", async () => {
      if (skip) return;
      for (const code of ["BR", "D0", "D1", "NT"]) {
        const from = `20${44 + ["BR", "D0", "D1", "NT"].indexOf(code)}-01-01`;
        const to = `20${44 + ["BR", "D0", "D1", "NT"].indexOf(code)}-06-30`;
        const result = await service.createTaxCode(ctxA(), {
          employee_id: user.id, tax_code: code, effective_from: from, effective_to: to,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should accept 0T code", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "0T", effective_from: "2048-01-01", effective_to: "2048-06-30",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid tax code format", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "INVALID",
        effective_from: "2049-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_TAX_CODE_FORMAT");
    });

    it("should reject invalid tax code format on update", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2050-01-01", effective_to: "2050-06-30",
      });
      const result = await service.updateTaxCode(ctxA(), created.data!.id, {
        tax_code: "ZZZZZ",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_TAX_CODE_FORMAT");
    });
  });

  // ===========================================================================
  // Source Types
  // ===========================================================================

  describe("Source Types", () => {
    it("should accept p45 source", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2051-01-01", effective_to: "2051-06-30",
        source: "p45",
      });
      expect(result.success).toBe(true);
      expect(result.data!.source).toBe("p45");
    });

    it("should accept starter_declaration source", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2051-07-01", effective_to: "2051-12-31",
        source: "starter_declaration",
      });
      expect(result.success).toBe(true);
      expect(result.data!.source).toBe("starter_declaration");
    });

    it("should accept hmrc source", async () => {
      if (skip) return;
      const result = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2052-01-01", effective_to: "2052-06-30",
        source: "hmrc",
      });
      expect(result.success).toBe(true);
      expect(result.data!.source).toBe("hmrc");
    });
  });

  // ===========================================================================
  // Get Current Tax Code
  // ===========================================================================

  describe("Get Current Tax Code", () => {
    it("should return the current tax code for an employee", async () => {
      if (skip) return;
      // Create a tax code effective from well in the past with no end date (open-ended)
      await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2020-01-01",
        source: "manual",
      });
      const result = await service.getCurrentTaxCode(ctxA(), user.id);
      expect(result.success).toBe(true);
      expect(result.data!.tax_code).toBe("1257L");
    });

    it("should return the current tax code as of a specific date", async () => {
      if (skip) return;
      await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "BR",
        effective_from: "2053-01-01", effective_to: "2053-06-30",
      });
      const result = await service.getCurrentTaxCode(ctxA(), user.id, "2053-03-15");
      expect(result.success).toBe(true);
      expect(result.data!.tax_code).toBe("BR");
    });

    it("should return NO_CURRENT_TAX_CODE when no tax code is effective", async () => {
      if (skip) return;
      // Use tenant B's user who has no tax codes
      const result = await serviceB.getCurrentTaxCode(ctxB(), userB.id, "2025-01-01");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NO_CURRENT_TAX_CODE");
    });
  });

  // ===========================================================================
  // Validation Rules
  // ===========================================================================

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

    it("should reject overlapping tax codes on create", async () => {
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

    it("should reject overlapping tax codes on update when dates change", async () => {
      if (skip) return;
      // Create two non-overlapping records
      await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2054-01-01", effective_to: "2054-06-30",
      });
      const second = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "BR",
        effective_from: "2054-07-01", effective_to: "2054-12-31",
      });
      // Try to move the second record's dates to overlap with the first
      const result = await service.updateTaxCode(ctxA(), second.data!.id, {
        effective_from: "2054-03-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EFFECTIVE_DATE_OVERLAP");
    });
  });

  // ===========================================================================
  // RLS Tenant Isolation
  // ===========================================================================

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A tax codes", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2032-04-06", effective_to: "2032-12-31",
        notes: "RLS test record",
      });
      const result = await serviceB.getTaxCodeById(ctxB(), created.data!.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  // ===========================================================================
  // Outbox Events
  // ===========================================================================

  describe("Outbox Events", () => {
    it("should emit domain event on tax code creation", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
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

    it("should emit domain event on tax code update", async () => {
      if (skip) return;
      const created = await service.createTaxCode(ctxA(), {
        employee_id: user.id, tax_code: "1257L",
        effective_from: "2055-01-01", effective_to: "2055-06-30",
      });
      await service.updateTaxCode(ctxA(), created.data!.id, { tax_code: "BR" });

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'employee_tax_code' AND aggregate_id = ${created.data!.id}::uuid
        ORDER BY created_at DESC
      `;
      expect(outbox.some(e => e.event_type === "payroll.tax_code.updated")).toBe(true);
    });
  });
});
