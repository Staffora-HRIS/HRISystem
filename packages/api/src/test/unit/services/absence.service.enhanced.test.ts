/**
 * Absence Service Enhanced Unit Tests
 *
 * Tests the AbsenceService business logic layer with real database-backed
 * repository. Verifies:
 * - Leave request lifecycle (draft -> pending -> approved/rejected/cancelled)
 * - State machine enforcement (invalid transitions fail with correct error codes)
 * - Service-level error handling and result formatting
 * - Outbox event verification through repository layer
 * - Not-found handling for all entity types
 * - Leave type validation (deactivated types, non-existent types)
 * - Response formatting (dates, field presence)
 * - Leave balance querying
 * - Leave policy lifecycle
 * - Error code correctness for each failure path
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
import { AbsenceRepository } from "../../../modules/absence/repository";
import { AbsenceService, AbsenceErrorCodes } from "../../../modules/absence/service";
import type { DatabaseClient } from "../../../plugins/db";

describe("AbsenceService (Enhanced)", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let user: TestUser;
  let service: AbsenceService;
  let skip = false;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) {
      skip = true;
      return;
    }

    db = getTestDb();

    // camelCase-transformed connection so RETURNING * produces camelCase properties
    camelDb = postgres({
      host: TEST_CONFIG.database.host,
      port: TEST_CONFIG.database.port,
      database: TEST_CONFIG.database.database,
      username: TEST_CONFIG.database.username,
      password: TEST_CONFIG.database.password,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.toCamel,
    });

    const suffix = Date.now();
    tenant = await createTestTenant(db, { name: `AbsSvc ${suffix}`, slug: `abssvc-${suffix}` });
    user = await createTestUser(db, tenant.id);

    const dbAdapter = {
      withTransaction: async <T>(ctx: { tenantId: string; userId?: string }, fn: (tx: unknown) => Promise<T>): Promise<T> => {
        return camelDb.begin(async (tx) => {
          await tx`SELECT app.set_tenant_context(${ctx.tenantId}::uuid, ${ctx.userId || null}::uuid)`;
          return fn(tx);
        }) as Promise<T>;
      },
    } as unknown as DatabaseClient;

    const repo = new AbsenceRepository(dbAdapter);
    service = new AbsenceService(repo);

    // Create test employee
    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'ABSSVC-001', 'active', CURRENT_DATE)
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
      max: 1,
      idle_timeout: 5,
      connect_timeout: 10,
    });
    try {
      await adminDb.begin(async (tx) => {
        await tx`ALTER TABLE app.leave_request_approvals DISABLE TRIGGER prevent_approval_delete`;
        await tx`ALTER TABLE app.leave_request_approvals DISABLE TRIGGER prevent_approval_update`;
        await tx`ALTER TABLE app.employee_status_history DISABLE TRIGGER ALL`;
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_request_approvals WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_requests WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_policies WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.employee_status_history WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`ALTER TABLE app.leave_request_approvals ENABLE TRIGGER prevent_approval_delete`;
        await tx`ALTER TABLE app.leave_request_approvals ENABLE TRIGGER prevent_approval_update`;
        await tx`ALTER TABLE app.employee_status_history ENABLE TRIGGER ALL`;
      });
    } catch (e) {
      console.error("Cleanup error (non-fatal):", e);
    }
    await adminDb.end({ timeout: 5 }).catch(() => {});

    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await camelDb.end({ timeout: 5 }).catch(() => {});
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (skip) return;
    await clearTenantContext(db);
  });

  const ctx = () => ({ tenantId: tenant.id, userId: user.id });

  // ==========================================================================
  // Leave Type Service Operations
  // ==========================================================================

  describe("Leave Type Operations", () => {
    it("should create a leave type and return success with data", async () => {
      if (skip) return;

      const result = await service.createLeaveType(ctx(), {
        code: `SVCAL${Date.now()}`,
        name: "Annual Leave",
        isPaid: true,
        requiresApproval: true,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBeDefined();
      expect(data.name).toBe("Annual Leave");
      expect(data.isActive).toBe(true);
    });

    it("should create a leave type with minimal fields (code and name only)", async () => {
      if (skip) return;

      const result = await service.createLeaveType(ctx(), {
        code: `SVCMIN${Date.now()}`,
        name: "Minimal Type",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.id).toBeDefined();
      expect(data.name).toBe("Minimal Type");
    });

    it("should list leave types and return success", async () => {
      if (skip) return;

      const result = await service.getLeaveTypes(ctx());
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should get leave type by ID and return success", async () => {
      if (skip) return;

      const createResult = await service.createLeaveType(ctx(), {
        code: `SVCGET${Date.now()}`,
        name: "Get Test",
      });
      const created = createResult.data as Record<string, unknown>;

      const result = await service.getLeaveTypeById(ctx(), created.id);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(created.id);
    });

    it("should return LEAVE_TYPE_NOT_FOUND for non-existent ID", async () => {
      if (skip) return;

      const result = await service.getLeaveTypeById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND);
      expect(result.error?.message).toContain("not found");
    });

    it("should deactivate a leave type and return success", async () => {
      if (skip) return;

      const createResult = await service.createLeaveType(ctx(), {
        code: `SVCDEL${Date.now()}`,
        name: "Delete Test",
      });
      const created = createResult.data as Record<string, unknown>;

      const result = await service.deleteLeaveType(ctx(), created.id);
      expect(result.success).toBe(true);

      // Verify it no longer appears in active listings
      const listResult = await service.getLeaveTypes(ctx());
      const found = (listResult.data as Record<string, unknown>[]).find((t: Record<string, unknown>) => t.id === created.id);
      expect(found).toBeUndefined();
    });

    it("should return error when deactivating a non-existent leave type", async () => {
      if (skip) return;

      const result = await service.deleteLeaveType(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND);
    });

    it("should return error when deactivating an already-deactivated leave type", async () => {
      if (skip) return;

      const createResult = await service.createLeaveType(ctx(), {
        code: `SVCDBL${Date.now()}`,
        name: "Double Delete Test",
      });
      const created = createResult.data as Record<string, unknown>;
      await service.deleteLeaveType(ctx(), created.id);

      const result = await service.deleteLeaveType(ctx(), created.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND);
    });
  });

  // ==========================================================================
  // Leave Policy Service Operations
  // ==========================================================================

  describe("Leave Policy Operations", () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      if (skip) return;
      const result = await service.createLeaveType(ctx(), {
        code: `SVCPOL${Date.now()}`,
        name: "Policy Type",
      });
      leaveTypeId = (result.data as Record<string, unknown>).id;
    });

    it("should create a leave policy and return success", async () => {
      if (skip) return;

      const result = await service.createLeavePolicy(ctx(), {
        name: "Standard Policy",
        leaveTypeId,
        annualAllowance: 28,
        maxCarryover: 5,
        effectiveFrom: "2024-01-01",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should create a leave policy with all optional fields", async () => {
      if (skip) return;

      const result = await service.createLeavePolicy(ctx(), {
        name: "Full Policy",
        description: "Full policy with all fields",
        leaveTypeId,
        annualAllowance: 30,
        maxCarryover: 10,
        accrualFrequency: "monthly",
        effectiveFrom: "2025-01-01",
        effectiveTo: "2025-12-31",
        eligibleAfterMonths: 6,
      });

      expect(result.success).toBe(true);
    });

    it("should list leave policies", async () => {
      if (skip) return;

      const result = await service.getLeavePolicies(ctx());
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should deactivate a leave policy", async () => {
      if (skip) return;

      const createResult = await service.createLeavePolicy(ctx(), {
        name: `Delete Policy ${Date.now()}`,
        leaveTypeId,
        annualAllowance: 28,
        effectiveFrom: "2024-01-01",
      });
      const created = createResult.data as Record<string, unknown>;

      const result = await service.deleteLeavePolicy(ctx(), created.id);
      expect(result.success).toBe(true);
    });

    it("should return error when deactivating non-existent policy", async () => {
      if (skip) return;

      const result = await service.deleteLeavePolicy(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("LEAVE_POLICY_NOT_FOUND");
    });
  });

  // ==========================================================================
  // Leave Request Lifecycle
  // ==========================================================================

  describe("Leave Request Lifecycle", () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      if (skip) return;
      const result = await service.createLeaveType(ctx(), {
        code: `SVCLCY${Date.now()}`,
        name: "Lifecycle Type",
      });
      leaveTypeId = (result.data as Record<string, unknown>).id;
    });

    it("should create a leave request in draft status", async () => {
      if (skip) return;

      const result = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        reason: "Vacation",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.status).toBe("draft");
      expect(data.employeeId).toBe(user.id);
      expect(data.leaveTypeId).toBe(leaveTypeId);
    });

    it("should create a leave request with half days", async () => {
      if (skip) return;

      const result = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-06-10",
        endDate: "2026-06-12",
        startHalfDay: true,
        endHalfDay: true,
        reason: "Half day test",
      });

      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.startHalfDay).toBe(true);
      expect(data.endHalfDay).toBe(true);
      // 3 days - 0.5 - 0.5 = 2
      expect(Number(data.totalDays)).toBe(2);
    });

    it("should submit a draft leave request (draft -> pending)", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-07-01",
        endDate: "2026-07-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const result = await service.submitLeaveRequest(ctx(), requestId);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe("pending");
    });

    it("should approve a pending leave request (pending -> approved)", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);

      const result = await service.approveLeaveRequest(ctx(), requestId, user.id, "Approved");
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe("approved");
    });

    it("should reject a pending leave request (pending -> rejected)", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-09-01",
        endDate: "2026-09-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);

      const result = await service.rejectLeaveRequest(ctx(), requestId, user.id, "Not enough coverage");
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe("rejected");
      expect((result.data as Record<string, unknown>).rejectionReason).toBe("Not enough coverage");
    });

    it("should cancel a draft leave request", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-10-01",
        endDate: "2026-10-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const result = await service.cancelLeaveRequest(ctx(), requestId);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe("cancelled");
    });

    it("should cancel a pending leave request", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-10-03",
        endDate: "2026-10-04",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);

      const result = await service.cancelLeaveRequest(ctx(), requestId);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).status).toBe("cancelled");
    });

    it("should fail to approve a draft leave request with REQUEST_NOT_PENDING", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-11-01",
        endDate: "2026-11-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const result = await service.approveLeaveRequest(ctx(), requestId, user.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.REQUEST_NOT_PENDING);
    });

    it("should fail to reject a draft leave request with REQUEST_NOT_PENDING", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-11-03",
        endDate: "2026-11-04",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const result = await service.rejectLeaveRequest(ctx(), requestId, user.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.REQUEST_NOT_PENDING);
    });

    it("should fail to cancel an approved leave request", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-12-01",
        endDate: "2026-12-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);
      await service.approveLeaveRequest(ctx(), requestId, user.id);

      const result = await service.cancelLeaveRequest(ctx(), requestId);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND);
    });

    it("should fail to cancel a rejected leave request", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-12-05",
        endDate: "2026-12-06",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);
      await service.rejectLeaveRequest(ctx(), requestId, user.id, "No");

      const result = await service.cancelLeaveRequest(ctx(), requestId);
      expect(result.success).toBe(false);
    });

    it("should fail to submit a non-existent leave request", async () => {
      if (skip) return;

      const result = await service.submitLeaveRequest(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND);
    });

    it("should fail to approve a non-existent leave request", async () => {
      if (skip) return;

      const result = await service.approveLeaveRequest(ctx(), crypto.randomUUID(), user.id);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.REQUEST_NOT_PENDING);
    });

    it("should fail to reject a non-existent leave request", async () => {
      if (skip) return;

      const result = await service.rejectLeaveRequest(ctx(), crypto.randomUUID(), user.id, "reason");
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.REQUEST_NOT_PENDING);
    });

    it("should fail to cancel a non-existent leave request", async () => {
      if (skip) return;

      const result = await service.cancelLeaveRequest(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND);
    });

    it("should fail to double-submit (pending -> pending)", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-12-10",
        endDate: "2026-12-11",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const sub1 = await service.submitLeaveRequest(ctx(), requestId);
      expect(sub1.success).toBe(true);

      const sub2 = await service.submitLeaveRequest(ctx(), requestId);
      expect(sub2.success).toBe(false);
    });

    it("should fail to double-approve", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2026-12-15",
        endDate: "2026-12-16",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;
      await service.submitLeaveRequest(ctx(), requestId);

      const app1 = await service.approveLeaveRequest(ctx(), requestId, user.id);
      expect(app1.success).toBe(true);

      const app2 = await service.approveLeaveRequest(ctx(), requestId, user.id);
      expect(app2.success).toBe(false);
    });
  });

  // ==========================================================================
  // Leave Request Querying
  // ==========================================================================

  describe("Leave Request Querying", () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      if (skip) return;
      const result = await service.createLeaveType(ctx(), {
        code: `SVCQ${Date.now()}`,
        name: "Query Type",
      });
      leaveTypeId = (result.data as Record<string, unknown>).id;
    });

    it("should list leave requests with pagination metadata", async () => {
      if (skip) return;

      const result = await service.getLeaveRequests(ctx(), {
        employeeId: user.id,
        limit: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data!.items)).toBe(true);
      expect(typeof result.data!.hasMore).toBe("boolean");
      expect(result.data!.cursor === null || typeof result.data!.cursor === "string").toBe(true);
    });

    it("should filter leave requests by status", async () => {
      if (skip) return;

      await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-01-10",
        endDate: "2027-01-11",
      });

      const result = await service.getLeaveRequests(ctx(), {
        status: "draft",
        employeeId: user.id,
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).status).toBe("draft");
      }
    });

    it("should filter leave requests by employee", async () => {
      if (skip) return;

      const result = await service.getLeaveRequests(ctx(), {
        employeeId: user.id,
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).employeeId).toBe(user.id);
      }
    });

    it("should filter leave requests by leave type", async () => {
      if (skip) return;

      const result = await service.getLeaveRequests(ctx(), {
        leaveTypeId,
      });

      expect(result.success).toBe(true);
      for (const item of result.data!.items) {
        expect((item as Record<string, unknown>).leaveTypeId).toBe(leaveTypeId);
      }
    });

    it("should get a leave request by ID", async () => {
      if (skip) return;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-02-01",
        endDate: "2027-02-02",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      const result = await service.getLeaveRequestById(ctx(), requestId);
      expect(result.success).toBe(true);
      expect((result.data as Record<string, unknown>).id).toBe(requestId);
    });

    it("should return error for non-existent leave request", async () => {
      if (skip) return;

      const result = await service.getLeaveRequestById(ctx(), crypto.randomUUID());
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_REQUEST_NOT_FOUND);
    });
  });

  // ==========================================================================
  // Leave Balance Operations
  // ==========================================================================

  describe("Leave Balance Operations", () => {
    it("should return leave balances for an employee (empty by default)", async () => {
      if (skip) return;

      const result = await service.getLeaveBalances(ctx(), user.id);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should return leave balances for a specific year", async () => {
      if (skip) return;

      const result = await service.getLeaveBalances(ctx(), user.id, 2026);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should return balances with correct fields when data exists", async () => {
      if (skip) return;

      const ltResult = await service.createLeaveType(ctx(), {
        code: `SVCBAL${Date.now()}`,
        name: "SVC Balance Type",
      });
      const leaveTypeId = (ltResult.data as Record<string, unknown>).id;

      // Seed balance data directly
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.leave_balances (
          tenant_id, employee_id, leave_type_id, year,
          opening_balance, accrued, used, pending, adjustments, carryover
        ) VALUES (
          ${tenant.id}::uuid, ${user.id}::uuid, ${leaveTypeId}::uuid, 2087,
          15, 5, 2, 1, 3, 4
        )
        ON CONFLICT (tenant_id, employee_id, leave_type_id, year) DO NOTHING
      `;

      const result = await service.getLeaveBalances(ctx(), user.id, 2087);
      expect(result.success).toBe(true);
      const balances = result.data as Record<string, unknown>[];
      const bal = balances.find((b: Record<string, unknown>) => b.leaveTypeId === leaveTypeId);
      expect(bal).toBeDefined();
      expect(bal.year).toBe(2087);
      expect(bal.leaveTypeName).toBe("SVC Balance Type");
      // entitled = opening + accrued + carryover + adjustments = 15+5+4+3 = 27
      expect(Number(bal.entitled)).toBe(27);
      expect(Number(bal.used)).toBe(2);
      expect(Number(bal.pending)).toBe(1);
      expect(Number(bal.carryover)).toBe(4);
    });
  });

  // ==========================================================================
  // Response Formatting
  // ==========================================================================

  describe("Response Formatting", () => {
    it("should format dates as ISO date strings (YYYY-MM-DD)", async () => {
      if (skip) return;

      const leaveTypeResult = await service.createLeaveType(ctx(), {
        code: `FMT${Date.now()}`,
        name: "Format Test",
      });
      const leaveTypeId = (leaveTypeResult.data as Record<string, unknown>).id;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-03-01",
        endDate: "2027-03-02",
      });

      const data = createResult.data as Record<string, unknown>;
      expect(data.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.createdAt).toBeDefined();
    });

    it("should include all expected fields in leave type response", async () => {
      if (skip) return;

      const result = await service.createLeaveType(ctx(), {
        code: `FLD${Date.now()}`,
        name: "Field Test",
        isPaid: true,
        requiresApproval: true,
        requiresAttachment: false,
        maxConsecutiveDays: 15,
        minNoticeDays: 3,
        color: "#FF0000",
      });

      const data = result.data as Record<string, unknown>;
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("tenantId");
      expect(data).toHaveProperty("code");
      expect(data).toHaveProperty("name");
      expect(data).toHaveProperty("description");
      expect(data).toHaveProperty("isPaid");
      expect(data).toHaveProperty("requiresApproval");
      expect(data).toHaveProperty("requiresAttachment");
      expect(data).toHaveProperty("maxConsecutiveDays");
      expect(data).toHaveProperty("minNoticeDays");
      expect(data).toHaveProperty("color");
      expect(data).toHaveProperty("isActive");
      expect(data).toHaveProperty("createdAt");
      expect(data).toHaveProperty("updatedAt");
    });

    it("should include all expected fields in leave request response", async () => {
      if (skip) return;

      const ltResult = await service.createLeaveType(ctx(), {
        code: `FLDR${Date.now()}`,
        name: "Field Request Test",
      });
      const leaveTypeId = (ltResult.data as Record<string, unknown>).id;

      const result = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-04-01",
        endDate: "2027-04-02",
        reason: "Test reason",
        contactInfo: "+44123456789",
      });

      const data = result.data as Record<string, unknown>;
      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("tenantId");
      expect(data).toHaveProperty("employeeId");
      expect(data).toHaveProperty("leaveTypeId");
      expect(data).toHaveProperty("startDate");
      expect(data).toHaveProperty("endDate");
      expect(data).toHaveProperty("startHalfDay");
      expect(data).toHaveProperty("endHalfDay");
      expect(data).toHaveProperty("totalDays");
      expect(data).toHaveProperty("reason");
      expect(data).toHaveProperty("contactInfo");
      expect(data).toHaveProperty("status");
      expect(data).toHaveProperty("createdAt");
      expect(data).toHaveProperty("updatedAt");
    });

    it("should format leave type dates as ISO strings", async () => {
      if (skip) return;

      const result = await service.createLeaveType(ctx(), {
        code: `FMTLT${Date.now()}`,
        name: "Date Format Test",
      });

      const data = result.data as Record<string, unknown>;
      // createdAt and updatedAt should be ISO strings
      expect(typeof data.createdAt).toBe("string");
      expect(typeof data.updatedAt).toBe("string");
    });
  });

  // ==========================================================================
  // Outbox Verification through Service Layer
  // ==========================================================================

  describe("Outbox Events via Service", () => {
    it("should write outbox event when creating leave request through service", async () => {
      if (skip) return;

      const ltResult = await service.createLeaveType(ctx(), {
        code: `SVCOB${Date.now()}`,
        name: "Service Outbox Type",
      });
      const leaveTypeId = (ltResult.data as Record<string, unknown>).id;

      const result = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-05-01",
        endDate: "2027-05-02",
      });
      const requestId = (result.data as Record<string, unknown>).id;

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${requestId}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.created")).toBe(true);
    });

    it("should write outbox events through full lifecycle", async () => {
      if (skip) return;

      const ltResult = await service.createLeaveType(ctx(), {
        code: `SVCOBLC${Date.now()}`,
        name: "Service Outbox Lifecycle",
      });
      const leaveTypeId = (ltResult.data as Record<string, unknown>).id;

      const createResult = await service.createLeaveRequest(ctx(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: "2027-05-10",
        endDate: "2027-05-11",
      });
      const requestId = (createResult.data as Record<string, unknown>).id;

      await service.submitLeaveRequest(ctx(), requestId);
      await service.approveLeaveRequest(ctx(), requestId, user.id, "Done");

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${requestId}::uuid
        ORDER BY created_at
      `;

      const eventTypes = outbox.map((e: Record<string, unknown>) => e.event_type);
      expect(eventTypes).toContain("absence.request.created");
      expect(eventTypes).toContain("absence.request.submitted");
      expect(eventTypes).toContain("absence.request.approved");
    });
  });
});
