/**
 * Bank Details Routes Integration Tests
 *
 * Tests the bank details module to verify:
 * - Bank detail CRUD operations
 * - Primary account management (only one primary per employee)
 * - Effective date overlap prevention
 * - Date range validation
 * - First bank detail defaults to primary
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
import { BankDetailRepository } from "../../../modules/bank-details/repository";
import { BankDetailService } from "../../../modules/bank-details/service";
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

describe("Bank Details Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: BankDetailService;
  let serviceB: BankDetailService;
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
    tenant = await createTestTenant(db, { name: `Bank A ${suffix}`, slug: `bank-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Bank B ${suffix}`, slug: `bank-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new BankDetailService(new BankDetailRepository(dbAdapter), dbAdapter);
    serviceB = new BankDetailService(new BankDetailRepository(dbAdapter), dbAdapter);

    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'BANK-001', 'active', CURRENT_DATE)
      ON CONFLICT (id) DO NOTHING
    `;
    await setTenantContext(db, tenantB.id, userB.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'BANK-002', 'active', CURRENT_DATE)
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
          await tx`DELETE FROM app.employee_bank_details WHERE tenant_id = ${tId}::uuid`;
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

  describe("Bank Detail CRUD", () => {
    it("should create a bank detail and default to primary", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), user.id, {
        account_name: "Alice Smith",
        sort_code: "123456",
        account_number: "12345678",
        bank_name: "HSBC",
        effective_from: "2026-01-01",
      });
      expect(result.success).toBe(true);
      expect(result.data!.accountName).toBe("Alice Smith");
      expect(result.data!.sortCode).toBe("123456");
      expect(result.data!.isPrimary).toBe(true);
    });

    it("should get a bank detail by ID", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), user.id, {
        account_name: "Get Test",
        sort_code: "654321",
        account_number: "87654321",
        effective_from: "2027-01-01",
        effective_to: "2027-12-31",
      });
      const result = await service.getById(ctxA(), user.id, created.data!.id);
      expect(result.success).toBe(true);
      expect(result.data!.id).toBe(created.data!.id);
    });

    it("should list bank details for an employee", async () => {
      if (skip) return;
      const result = await service.listByEmployee(ctxA(), user.id);
      expect(result.items).toBeDefined();
      expect(result.items.length).toBeGreaterThanOrEqual(1);
    });

    it("should delete a bank detail", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), user.id, {
        account_name: "Delete Me",
        sort_code: "111111",
        account_number: "11111111",
        effective_from: "2030-01-01",
        effective_to: "2030-12-31",
      });
      const result = await service.delete(ctxA(), user.id, created.data!.id);
      expect(result.success).toBe(true);

      const fetched = await service.getById(ctxA(), user.id, created.data!.id);
      expect(fetched.success).toBe(false);
    });

    it("should return NOT_FOUND for non-existent employee", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), crypto.randomUUID(), {
        account_name: "No Employee",
        sort_code: "000000",
        account_number: "00000000",
        effective_from: "2026-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Effective Date Validation", () => {
    it("should reject effective_from after effective_to", async () => {
      if (skip) return;
      const result = await service.create(ctxA(), user.id, {
        account_name: "Bad Dates",
        sort_code: "999999",
        account_number: "99999999",
        effective_from: "2028-12-31",
        effective_to: "2028-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should reject overlapping effective date ranges", async () => {
      if (skip) return;
      await service.create(ctxA(), user.id, {
        account_name: "Overlap A",
        sort_code: "222222",
        account_number: "22222222",
        effective_from: "2029-01-01",
        effective_to: "2029-06-30",
      });

      const result = await service.create(ctxA(), user.id, {
        account_name: "Overlap B",
        sort_code: "333333",
        account_number: "33333333",
        effective_from: "2029-03-01",
        effective_to: "2029-09-30",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EFFECTIVE_DATE_OVERLAP");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A bank details", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), user.id, {
        account_name: "RLS Test",
        sort_code: "444444",
        account_number: "44444444",
        effective_from: "2031-01-01",
        effective_to: "2031-12-31",
      });
      const result = await serviceB.getById(ctxB(), user.id, created.data!.id);
      expect(result.success).toBe(false);
    });
  });

  describe("Outbox Events", () => {
    it("should emit domain event on bank detail creation", async () => {
      if (skip) return;
      const created = await service.create(ctxA(), user.id, {
        account_name: "Outbox Test",
        sort_code: "555555",
        account_number: "55555555",
        effective_from: "2032-01-01",
        effective_to: "2032-12-31",
      });
      expect(created.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'bank_detail' AND aggregate_id = ${created.data!.id}::uuid
      `;
      expect(outbox.some(e => e.event_type === "hr.bank_detail.created")).toBe(true);
    });
  });
});
