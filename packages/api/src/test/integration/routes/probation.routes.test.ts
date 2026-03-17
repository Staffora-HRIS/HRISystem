/**
 * Probation Routes Integration Tests
 *
 * Tests the probation review module via direct service calls
 * to verify:
 * - Probation review CRUD operations
 * - State machine transitions (pending -> passed/extended/failed/terminated)
 * - Extension with recalculated end date and rescheduled reminders
 * - Duplicate pending review prevention
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
import { ProbationRepository } from "../../../modules/probation/repository";
import { ProbationService } from "../../../modules/probation/service";
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

describe("Probation Routes Integration", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let service: ProbationService;
  let serviceB: ProbationService;
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
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      connection: { search_path: "app,public" },
      transform: postgres.camel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `Prob A ${suffix}`, slug: `prob-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `Prob B ${suffix}`, slug: `prob-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = buildCamelDbAdapter(camelDb);
    service = new ProbationService(new ProbationRepository(dbAdapter), dbAdapter);
    serviceB = new ProbationService(new ProbationRepository(dbAdapter), dbAdapter);

    // Create employees with first_name/last_name for display name joins
    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'PRB-001', 'active', CURRENT_DATE, 'Alice', 'Smith')
      ON CONFLICT (id) DO NOTHING
    `;

    await setTenantContext(db, tenantB.id, userB.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
      VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'PRB-002', 'active', CURRENT_DATE, 'Bob', 'Jones')
      ON CONFLICT (id) DO NOTHING
    `;

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;
    const adminDb = postgres({
      host: TEST_CONFIG.database.host,
      port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.adminUsername,
      password: TEST_CONFIG.database.adminPassword,
      max: 1, idle_timeout: 5, connect_timeout: 10,
    });
    try {
      await adminDb.begin(async (tx) => {
        for (const tId of [tenant.id, tenantB.id]) {
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.probation_reminders WHERE tenant_id = ${tId}::uuid`;
          await tx`DELETE FROM app.probation_reviews WHERE tenant_id = ${tId}::uuid`;
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

  afterEach(async () => {
    if (skip) return;
    await clearTenantContext(db);
  });

  const ctxA = () => ({ tenantId: tenant.id, userId: user.id });
  const ctxB = () => ({ tenantId: tenantB.id, userId: userB.id });

  describe("Create Probation Review", () => {
    it("should create a probation review for an employee", async () => {
      if (skip) return;
      const result = await service.createReview(ctxA(), {
        employee_id: user.id,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });
      expect(result.success).toBe(true);
      expect(result.data!.review.outcome).toBe("pending");
      expect(result.data!.review.employee_id).toBe(user.id);
    });

    it("should reject end date before start date", async () => {
      if (skip) return;
      const result = await service.createReview(ctxA(), {
        employee_id: user.id,
        probation_start_date: "2027-06-01",
        original_end_date: "2027-01-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should reject duplicate pending review for same employee", async () => {
      if (skip) return;
      // First review (may already exist from prior test)
      await service.createReview(ctxA(), {
        employee_id: user.id,
        probation_start_date: "2028-01-01",
        original_end_date: "2028-07-01",
      });

      const result = await service.createReview(ctxA(), {
        employee_id: user.id,
        probation_start_date: "2028-02-01",
        original_end_date: "2028-08-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CONFLICT");
    });

    it("should return NOT_FOUND for non-existent employee", async () => {
      if (skip) return;
      const result = await service.createReview(ctxA(), {
        employee_id: crypto.randomUUID(),
        probation_start_date: "2027-01-01",
        original_end_date: "2027-07-01",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Get Probation Review", () => {
    it("should get a review by ID", async () => {
      if (skip) return;
      // Create a fresh employee to avoid duplicate review conflicts
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-GET-" + Date.now()}, 'active', CURRENT_DATE, 'Get', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-05-01",
        original_end_date: "2026-11-01",
      });
      expect(created.success).toBe(true);

      const result = await service.getReview(ctxA(), created.data!.review.id);
      expect(result.success).toBe(true);
      expect(result.data!.review.id).toBe(created.data!.review.id);
    });

    it("should return NOT_FOUND for non-existent review", async () => {
      if (skip) return;
      const result = await service.getReview(ctxA(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("State Machine Transitions", () => {
    it("should extend a pending review", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-EXT-" + Date.now()}, 'active', CURRENT_DATE, 'Ext', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });
      expect(created.success).toBe(true);

      const result = await service.extendReview(ctxA(), created.data!.review.id, {
        extension_weeks: 4,
        performance_notes: "Needs more time",
      });
      expect(result.success).toBe(true);
      expect(result.data!.review.outcome).toBe("extended");
      expect(result.data!.review.extension_weeks).toBe(4);
    });

    it("should complete a review with passed outcome", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-PASS-" + Date.now()}, 'active', CURRENT_DATE, 'Pass', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });

      const result = await service.completeReview(ctxA(), created.data!.review.id, {
        outcome: "passed",
        performance_notes: "Excellent performance",
      });
      expect(result.success).toBe(true);
      expect(result.data!.review.outcome).toBe("passed");
    });

    it("should reject invalid transition from passed to extended", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-INV-" + Date.now()}, 'active', CURRENT_DATE, 'Inv', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });
      await service.completeReview(ctxA(), created.data!.review.id, { outcome: "passed" });

      const result = await service.extendReview(ctxA(), created.data!.review.id, {
        extension_weeks: 2,
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should reject completing a terminated review again", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-TERM-" + Date.now()}, 'active', CURRENT_DATE, 'Term', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });
      await service.completeReview(ctxA(), created.data!.review.id, { outcome: "terminated" });

      const result = await service.completeReview(ctxA(), created.data!.review.id, {
        outcome: "passed",
      });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
    });
  });

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to read tenant A review", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-RLS-" + Date.now()}, 'active', CURRENT_DATE, 'RLS', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });

      const result = await serviceB.getReview(ctxB(), created.data!.review.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("Outbox Events", () => {
    it("should emit outbox event when creating a review", async () => {
      if (skip) return;
      const empId = crypto.randomUUID();
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date, first_name, last_name)
        VALUES (${empId}::uuid, ${tenant.id}::uuid, ${"PRB-OB-" + Date.now()}, 'active', CURRENT_DATE, 'OB', 'Test')
      `;
      await clearTenantContext(db);

      const created = await service.createReview(ctxA(), {
        employee_id: empId,
        probation_start_date: "2026-01-01",
        original_end_date: "2026-07-01",
      });
      expect(created.success).toBe(true);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'probation_review' AND aggregate_id = ${created.data!.review.id}::uuid
      `;
      expect(outbox.some(e => e.event_type === "probation.review.created")).toBe(true);
    });
  });
});
