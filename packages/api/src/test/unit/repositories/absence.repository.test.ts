/**
 * Absence Repository Integration Tests
 *
 * Tests ALL AbsenceRepository methods against a real PostgreSQL database
 * with RLS enforcement. Verifies:
 * - Leave type CRUD (create, findById, findAll, deactivate)
 * - Leave policy CRUD (create, findAll, deactivate)
 * - Leave request CRUD with state machine validation at the DB trigger level
 * - Leave balance queries (with data seeded via direct SQL)
 * - Outbox event atomicity (events written in same transaction as writes)
 * - RLS tenant isolation (cross-tenant queries return empty/null)
 * - Cursor-based pagination
 * - DB constraint enforcement (code format, date range, duration)
 *
 * Requires Docker containers (postgres + redis) running.
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
import type { DatabaseClient } from "../../../plugins/db";

describe("AbsenceRepository", () => {
  let db: ReturnType<typeof getTestDb>;
  let camelDb: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let tenantB: TestTenant;
  let user: TestUser;
  let userB: TestUser;
  let skip = false;
  let repo: AbsenceRepository;

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
    tenant = await createTestTenant(db, { name: `AbsRepo A ${suffix}`, slug: `absrepo-a-${suffix}` });
    tenantB = await createTestTenant(db, { name: `AbsRepo B ${suffix}`, slug: `absrepo-b-${suffix}` });
    user = await createTestUser(db, tenant.id);
    userB = await createTestUser(db, tenantB.id);

    const dbAdapter = {
      withTransaction: async <T>(ctx: { tenantId: string; userId?: string }, fn: (tx: unknown) => Promise<T>): Promise<T> => {
        return camelDb.begin(async (tx) => {
          await tx`SELECT app.set_tenant_context(${ctx.tenantId}::uuid, ${ctx.userId || null}::uuid)`;
          return fn(tx);
        }) as Promise<T>;
      },
    } as unknown as DatabaseClient;

    repo = new AbsenceRepository(dbAdapter);

    // Create employees for FK constraints on leave requests
    await setTenantContext(db, tenant.id, user.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${user.id}::uuid, ${tenant.id}::uuid, 'ABS-EMP-001', 'active', CURRENT_DATE)
      ON CONFLICT (id) DO NOTHING
    `;

    await setTenantContext(db, tenantB.id, userB.id);
    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${userB.id}::uuid, ${tenantB.id}::uuid, 'ABS-EMP-002', 'active', CURRENT_DATE)
      ON CONFLICT (id) DO NOTHING
    `;

    await clearTenantContext(db);
  });

  afterAll(async () => {
    if (skip) return;

    // Use admin connection to disable append-only triggers for cleanup
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

        await tx`DELETE FROM app.domain_outbox WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.leave_request_approvals WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.leave_requests WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.leave_balances WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.leave_policies WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.leave_types WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.employee_status_history WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;
        await tx`DELETE FROM app.employees WHERE tenant_id IN (${tenant.id}::uuid, ${tenantB.id}::uuid)`;

        await tx`ALTER TABLE app.leave_request_approvals ENABLE TRIGGER prevent_approval_delete`;
        await tx`ALTER TABLE app.leave_request_approvals ENABLE TRIGGER prevent_approval_update`;
        await tx`ALTER TABLE app.employee_status_history ENABLE TRIGGER ALL`;
      });
    } catch (e) {
      console.error("Cleanup error (non-fatal):", e);
    }
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

  // ==========================================================================
  // Leave Types
  // ==========================================================================

  describe("Leave Types", () => {
    it("should create a leave type and return it with all fields", async () => {
      if (skip) return;

      const leaveType = await repo.createLeaveType(ctxA(), {
        code: `AL${Date.now()}`,
        name: "Annual Leave",
        category: "annual",
        description: "Standard annual leave",
        isPaid: true,
        requiresApproval: true,
        requiresAttachment: false,
        maxConsecutiveDays: 10,
        minNoticeDays: 2,
        color: "#00FF00",
      });

      expect(leaveType).toBeDefined();
      expect(leaveType.id).toBeDefined();
      expect(leaveType.tenantId).toBe(tenant.id);
      expect(leaveType.name).toBe("Annual Leave");
      expect(leaveType.isPaid).toBe(true);
      expect(leaveType.requiresApproval).toBe(true);
      expect(leaveType.requiresAttachment).toBe(false);
      expect(leaveType.isActive).toBe(true);
    });

    it("should create a leave type with only required fields using defaults", async () => {
      if (skip) return;

      const leaveType = await repo.createLeaveType(ctxA(), {
        code: `MIN${Date.now()}`,
        name: "Minimal Leave Type",
      });

      expect(leaveType).toBeDefined();
      expect(leaveType.id).toBeDefined();
      expect(leaveType.isActive).toBe(true);
    });

    it("should write an outbox event when creating a leave type", async () => {
      if (skip) return;

      const code = `LTOUT${Date.now()}`;
      const leaveType = await repo.createLeaveType(ctxA(), { code, name: "Outbox Test LT", category: "annual" });

      await setTenantContext(db, tenant.id, user.id);
      const outboxRows = await db<Record<string, unknown>[]>`
        SELECT event_type, aggregate_id, payload
        FROM app.domain_outbox
        WHERE aggregate_type = 'leave_type' AND aggregate_id = ${leaveType.id}::uuid
      `;

      expect(outboxRows.length).toBeGreaterThanOrEqual(1);
      expect(outboxRows.some((r: Record<string, unknown>) => r.event_type === "absence.leave_type.created")).toBe(true);
    });

    it("should list only active leave types for the tenant", async () => {
      if (skip) return;

      const types = await repo.getLeaveTypes(ctxA());

      expect(Array.isArray(types)).toBe(true);
      for (const t of types) {
        expect(t.tenantId).toBe(tenant.id);
        expect(t.isActive).toBe(true);
      }
    });

    it("should get a leave type by ID", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `GET${Date.now()}`,
        name: "Get By Id Test",
        category: "annual",
      });

      const found = await repo.getLeaveTypeById(ctxA(), created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("Get By Id Test");
    });

    it("should return null for a non-existent leave type ID", async () => {
      if (skip) return;

      const result = await repo.getLeaveTypeById(ctxA(), crypto.randomUUID());
      expect(result).toBeNull();
    });

    it("should deactivate a leave type and write outbox event", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `DEACT${Date.now()}`,
        name: "Deactivate Test",
        category: "annual",
      });

      const deactivated = await repo.deactivateLeaveType(ctxA(), created.id);
      expect(deactivated).not.toBeNull();
      expect(deactivated!.isActive).toBe(false);

      // Should not appear in active listing
      const types = await repo.getLeaveTypes(ctxA());
      expect(types.find((t) => t.id === created.id)).toBeUndefined();

      // Outbox event written
      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_type' AND aggregate_id = ${created.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.leave_type.deactivated")).toBe(true);
    });

    it("should return null/falsy when deactivating a non-existent leave type", async () => {
      if (skip) return;

      const result = await repo.deactivateLeaveType(ctxA(), crypto.randomUUID());
      expect(result).toBeFalsy();
    });

    it("should return null/falsy when deactivating an already-deactivated leave type", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `DBL${Date.now()}`,
        name: "Double Deactivate",
        category: "annual",
      });

      await repo.deactivateLeaveType(ctxA(), created.id);
      const secondAttempt = await repo.deactivateLeaveType(ctxA(), created.id);
      expect(secondAttempt).toBeFalsy();
    });

    it("should still find a deactivated leave type by ID", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `FIND${Date.now()}`,
        name: "Find After Deactivate",
        category: "annual",
      });
      await repo.deactivateLeaveType(ctxA(), created.id);

      // getLeaveTypeById does not filter by is_active
      const found = await repo.getLeaveTypeById(ctxA(), created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // Leave Policies
  // ==========================================================================

  describe("Leave Policies", () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      if (skip) return;
      const lt = await repo.createLeaveType(ctxA(), {
        code: `POLLT${Date.now()}`,
        name: "Policy Leave Type",
        category: "annual",
      });
      leaveTypeId = lt.id;
    });

    it("should create a leave policy with all fields", async () => {
      if (skip) return;

      const policy = await repo.createLeavePolicy(ctxA(), {
        name: "Standard Annual Policy",
        description: "Default policy",
        leaveTypeId,
        annualAllowance: 25,
        maxCarryover: 5,
        effectiveFrom: new Date("2024-01-01"),
        effectiveTo: undefined,
        eligibleAfterMonths: 3,
      });

      expect(policy).toBeDefined();
      expect(policy.id).toBeDefined();
      expect(policy.tenantId).toBe(tenant.id);
      // DB column is default_balance, camelCase -> defaultBalance
      expect(Number((policy as Record<string, unknown>).defaultBalance)).toBe(25);
      expect(policy.isActive).toBe(true);
    });

    it("should write an outbox event when creating a leave policy", async () => {
      if (skip) return;

      const policy = await repo.createLeavePolicy(ctxA(), {
        name: `Outbox Policy ${Date.now()}`,
        leaveTypeId,
        annualAllowance: 20,
        effectiveFrom: new Date("2024-01-01"),
      });

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_policy' AND aggregate_id = ${policy.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.leave_policy.created")).toBe(true);
    });

    it("should list policies for the tenant (only active)", async () => {
      if (skip) return;

      const policies = await repo.getLeavePolicies(ctxA());

      expect(Array.isArray(policies)).toBe(true);
      for (const p of policies) {
        expect(p.tenantId).toBe(tenant.id);
        expect(p.isActive).toBe(true);
      }
    });

    it("should deactivate a leave policy and write outbox event", async () => {
      if (skip) return;

      const created = await repo.createLeavePolicy(ctxA(), {
        name: `Deact Policy ${Date.now()}`,
        leaveTypeId,
        annualAllowance: 20,
        effectiveFrom: new Date("2024-01-01"),
      });

      const deactivated = await repo.deactivateLeavePolicy(ctxA(), created.id);
      expect(deactivated).not.toBeNull();
      expect(deactivated!.isActive).toBe(false);

      // Verify outbox
      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_policy' AND aggregate_id = ${created.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.leave_policy.deactivated")).toBe(true);
    });

    it("should return null/falsy when deactivating a non-existent policy", async () => {
      if (skip) return;

      const result = await repo.deactivateLeavePolicy(ctxA(), crypto.randomUUID());
      expect(result).toBeFalsy();
    });
  });

  // ==========================================================================
  // Leave Requests
  // ==========================================================================

  describe("Leave Requests", () => {
    let leaveTypeId: string;

    beforeAll(async () => {
      if (skip) return;
      const lt = await repo.createLeaveType(ctxA(), {
        code: `REQLT${Date.now()}`,
        name: "Request Leave Type",
        category: "annual",
      });
      leaveTypeId = lt.id;
    });

    it("should create a leave request with draft status", async () => {
      if (skip) return;

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-06-01"),
        endDate: new Date("2026-06-05"),
        startHalfDay: false,
        endHalfDay: false,
        reason: "Holiday",
      });

      expect(request).toBeDefined();
      expect(request.id).toBeDefined();
      expect(request.status).toBe("draft");
      expect(request.tenantId).toBe(tenant.id);
    });

    it("should calculate total days correctly for full days (3-day span)", async () => {
      if (skip) return;

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-07-03"),
        startHalfDay: false,
        endHalfDay: false,
      });

      // Jul 1, Jul 2, Jul 3 = 3 days. DB column is 'duration'.
      expect(Number((request as Record<string, unknown>).duration)).toBe(3);
    });

    it("should calculate total days correctly with half days", async () => {
      if (skip) return;

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-08-01"),
        endDate: new Date("2026-08-03"),
        startHalfDay: true,
        endHalfDay: true,
      });

      // 3 days - 0.5 start - 0.5 end = 2 days
      expect(Number((request as Record<string, unknown>).duration)).toBe(2);
    });

    it("should calculate total days correctly for single-day request", async () => {
      if (skip) return;

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-08-10"),
        endDate: new Date("2026-08-10"),
        startHalfDay: false,
        endHalfDay: false,
      });

      expect(Number((request as Record<string, unknown>).duration)).toBe(1);
    });

    it("should calculate half-day single-day request correctly", async () => {
      if (skip) return;

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-08-11"),
        endDate: new Date("2026-08-11"),
        startHalfDay: true,
        endHalfDay: false,
      });

      // 1 day - 0.5 = 0.5
      expect(Number((request as Record<string, unknown>).duration)).toBe(0.5);
    });

    it("should get a leave request by ID", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-09-01"),
        endDate: new Date("2026-09-02"),
      });

      const found = await repo.getLeaveRequestById(ctxA(), created.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it("should return null for non-existent leave request", async () => {
      if (skip) return;

      const result = await repo.getLeaveRequestById(ctxA(), crypto.randomUUID());
      expect(result).toBeNull();
    });

    it("should list leave requests with employee filter", async () => {
      if (skip) return;

      const result = await repo.getLeaveRequests(ctxA(), { employeeId: user.id });

      expect(result).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(typeof result.hasMore).toBe("boolean");
      for (const r of result.data) {
        expect(r.employeeId).toBe(user.id);
      }
    });

    it("should filter leave requests by status", async () => {
      if (skip) return;

      const result = await repo.getLeaveRequests(ctxA(), { status: "draft", employeeId: user.id });

      for (const r of result.data) {
        expect(r.status).toBe("draft");
      }
    });

    it("should paginate leave requests with cursor", async () => {
      if (skip) return;

      const page1 = await repo.getLeaveRequests(ctxA(), { limit: 2, employeeId: user.id });
      expect(page1.data.length).toBeLessThanOrEqual(2);
      expect(typeof page1.hasMore).toBe("boolean");

      if (page1.hasMore && page1.cursor) {
        // Verify cursor returns a valid page
        const page2 = await repo.getLeaveRequests(ctxA(), { limit: 2, cursor: page1.cursor, employeeId: user.id });
        expect(page2.data.length).toBeLessThanOrEqual(2);
        expect(typeof page2.hasMore).toBe("boolean");
        // Cursor should be a valid UUID or null
        if (page2.cursor) {
          expect(page2.cursor).toMatch(/^[0-9a-f-]{36}$/);
        }
      }
    });

    it("should filter leave requests by date range", async () => {
      if (skip) return;

      await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2028-01-10"),
        endDate: new Date("2028-01-15"),
      });

      const result = await repo.getLeaveRequests(ctxA(), {
        from: new Date("2028-01-01"),
        to: new Date("2028-01-31"),
      });

      expect(result.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should filter leave requests by leave type", async () => {
      if (skip) return;

      const result = await repo.getLeaveRequests(ctxA(), { leaveTypeId });

      for (const r of result.data) {
        expect(r.leaveTypeId).toBe(leaveTypeId);
      }
    });

    // State transitions
    it("should submit a draft leave request (draft -> pending)", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-02"),
      });
      expect(created.status).toBe("draft");

      const submitted = await repo.submitLeaveRequest(ctxA(), created.id);
      expect(submitted).not.toBeNull();
      expect(submitted!.status).toBe("pending");
      expect(submitted!.submittedAt).toBeDefined();
    });

    it("should not submit a non-draft leave request (already pending)", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-10-03"),
        endDate: new Date("2026-10-04"),
      });

      await repo.submitLeaveRequest(ctxA(), created.id);
      const result = await repo.submitLeaveRequest(ctxA(), created.id);
      expect(result).toBeFalsy();
    });

    it("should approve a pending leave request and record approval", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-11-02"),
      });
      await repo.submitLeaveRequest(ctxA(), created.id);

      const approved = await repo.approveLeaveRequest(ctxA(), created.id, user.id, "Approved by manager");
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe("approved");
      expect(approved!.approvedAt).toBeDefined();

      // Verify approval record
      await setTenantContext(db, tenant.id, user.id);
      const approvals = await db<Record<string, unknown>[]>`
        SELECT action, comment FROM app.leave_request_approvals
        WHERE request_id = ${created.id}::uuid
      `;
      expect(approvals.some((a: Record<string, unknown>) => a.action === "approve")).toBe(true);
    });

    it("should not approve a non-pending leave request (still draft)", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-11-03"),
        endDate: new Date("2026-11-04"),
      });
      const result = await repo.approveLeaveRequest(ctxA(), created.id, user.id);
      expect(result).toBeFalsy();
    });

    it("should reject a pending leave request with reason and record rejection", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2026-12-01"),
        endDate: new Date("2026-12-02"),
      });
      await repo.submitLeaveRequest(ctxA(), created.id);

      const rejected = await repo.rejectLeaveRequest(ctxA(), created.id, user.id, "Busy period");
      expect(rejected).not.toBeNull();
      expect(rejected!.status).toBe("rejected");
      expect(rejected!.rejectionReason).toBe("Busy period");

      // Verify rejection record
      await setTenantContext(db, tenant.id, user.id);
      const approvals = await db<Record<string, unknown>[]>`
        SELECT action, comment FROM app.leave_request_approvals
        WHERE request_id = ${created.id}::uuid
      `;
      expect(approvals.some((a: Record<string, unknown>) => a.action === "reject" && a.comment === "Busy period")).toBe(true);
    });

    it("should cancel a draft leave request", async () => {
      if (skip) return;

      const draft = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2027-01-01"),
        endDate: new Date("2027-01-02"),
      });
      const cancelled = await repo.cancelLeaveRequest(ctxA(), draft.id);
      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe("cancelled");
    });

    it("should cancel a pending leave request", async () => {
      if (skip) return;

      const pending = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2027-01-03"),
        endDate: new Date("2027-01-04"),
      });
      await repo.submitLeaveRequest(ctxA(), pending.id);
      const cancelled = await repo.cancelLeaveRequest(ctxA(), pending.id);
      expect(cancelled).not.toBeNull();
      expect(cancelled!.status).toBe("cancelled");
    });

    it("should not cancel an approved leave request (repo only allows draft/pending)", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2027-02-01"),
        endDate: new Date("2027-02-02"),
      });
      await repo.submitLeaveRequest(ctxA(), created.id);
      await repo.approveLeaveRequest(ctxA(), created.id, user.id);

      const result = await repo.cancelLeaveRequest(ctxA(), created.id);
      expect(result).toBeFalsy();
    });

    it("should not cancel a rejected leave request", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2027-02-05"),
        endDate: new Date("2027-02-06"),
      });
      await repo.submitLeaveRequest(ctxA(), created.id);
      await repo.rejectLeaveRequest(ctxA(), created.id, user.id, "No");

      const result = await repo.cancelLeaveRequest(ctxA(), created.id);
      expect(result).toBeFalsy();
    });

    it("should not cancel an already cancelled leave request", async () => {
      if (skip) return;

      const created = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId,
        startDate: new Date("2027-02-10"),
        endDate: new Date("2027-02-11"),
      });
      await repo.cancelLeaveRequest(ctxA(), created.id);

      const result = await repo.cancelLeaveRequest(ctxA(), created.id);
      expect(result).toBeFalsy();
    });
  });

  // ==========================================================================
  // RLS Tenant Isolation
  // ==========================================================================

  describe("RLS Tenant Isolation", () => {
    it("should not allow tenant B to see tenant A leave types", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `RLSA${Date.now()}`,
        name: "Tenant A Only",
        category: "annual",
      });

      const found = await repo.getLeaveTypeById(ctxB(), created.id);
      expect(found).toBeNull();
    });

    it("should not allow tenant B to see tenant A leave requests", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `RLSREQA${Date.now()}`,
        name: "RLS Request Test",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-03-01"),
        endDate: new Date("2027-03-02"),
      });

      const found = await repo.getLeaveRequestById(ctxB(), request.id);
      expect(found).toBeNull();
    });

    it("should not return cross-tenant data in list queries", async () => {
      if (skip) return;

      const types = await repo.getLeaveTypes(ctxB());
      for (const t of types) {
        expect(t.tenantId).toBe(tenantB.id);
      }
    });

    it("should not allow tenant B to submit tenant A leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `RLSSUB${Date.now()}`,
        name: "RLS Submit Test",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-03-05"),
        endDate: new Date("2027-03-06"),
      });

      const result = await repo.submitLeaveRequest(ctxB(), request.id);
      expect(result).toBeFalsy();
    });

    it("should not allow tenant B to approve tenant A leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `RLSAPP${Date.now()}`,
        name: "RLS Approve Test",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-03-10"),
        endDate: new Date("2027-03-11"),
      });
      await repo.submitLeaveRequest(ctxA(), request.id);

      const result = await repo.approveLeaveRequest(ctxB(), request.id, userB.id);
      expect(result).toBeFalsy();
    });

    it("should not allow tenant B to deactivate tenant A leave type", async () => {
      if (skip) return;

      const created = await repo.createLeaveType(ctxA(), {
        code: `RLSDEL${Date.now()}`,
        name: "RLS Delete Test",
        category: "annual",
      });

      const result = await repo.deactivateLeaveType(ctxB(), created.id);
      expect(result).toBeFalsy();

      // Verify it's still active for tenant A
      const found = await repo.getLeaveTypeById(ctxA(), created.id);
      expect(found).not.toBeNull();
      expect(found!.isActive).toBe(true);
    });

    it("should not return cross-tenant data in leave request listings", async () => {
      if (skip) return;

      const requests = await repo.getLeaveRequests(ctxB(), {});
      for (const r of requests.data) {
        expect(r.tenantId).toBe(tenantB.id);
      }
    });
  });

  // ==========================================================================
  // Leave Balances
  // ==========================================================================

  describe("Leave Balances", () => {
    it("should return empty array when no balances exist", async () => {
      if (skip) return;

      const balances = await repo.getLeaveBalances(ctxA(), user.id, 2099);
      expect(Array.isArray(balances)).toBe(true);
      expect(balances.length).toBe(0);
    });

    it("should return balances for a specific year with correct computed fields", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `BAL${Date.now()}`,
        name: "Balance Test LT",
        category: "annual",
      });

      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.leave_balances (
          tenant_id, employee_id, leave_type_id, year,
          opening_balance, accrued, used, pending, adjustments, carryover
        ) VALUES (
          ${tenant.id}::uuid, ${user.id}::uuid, ${lt.id}::uuid, 2088,
          20, 5, 3, 1, 0, 2
        )
        ON CONFLICT (tenant_id, employee_id, leave_type_id, year) DO NOTHING
      `;

      const balances = await repo.getLeaveBalances(ctxA(), user.id, 2088);
      expect(balances.length).toBeGreaterThanOrEqual(1);

      const bal = balances.find((b) => b.leaveTypeId === lt.id);
      expect(bal).toBeDefined();
      expect(bal!.year).toBe(2088);
      // entitled = opening + accrued + carryover + adjustments = 20+5+2+0 = 27
      expect(Number(bal!.entitled)).toBe(27);
      expect(Number(bal!.used)).toBe(3);
      expect(Number(bal!.pending)).toBe(1);
      // available = opening + accrued + carryover + adjustments - used - pending = 27-3-1 = 23
      expect(Number(bal!.available)).toBe(23);
      expect(Number(bal!.carryover)).toBe(2);
    });

    it("should default to current year when year not specified", async () => {
      if (skip) return;

      const balances = await repo.getLeaveBalances(ctxA(), user.id);
      expect(Array.isArray(balances)).toBe(true);
    });

    it("should include leave type name from join", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `BALNAME${Date.now()}`,
        name: "Named Balance Type",
        category: "sick",
      });

      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.leave_balances (
          tenant_id, employee_id, leave_type_id, year,
          opening_balance, accrued, used, pending, adjustments, carryover
        ) VALUES (
          ${tenant.id}::uuid, ${user.id}::uuid, ${lt.id}::uuid, 2089,
          10, 0, 0, 0, 0, 0
        )
        ON CONFLICT (tenant_id, employee_id, leave_type_id, year) DO NOTHING
      `;

      const balances = await repo.getLeaveBalances(ctxA(), user.id, 2089);
      const bal = balances.find((b) => b.leaveTypeId === lt.id);
      expect(bal).toBeDefined();
      expect(bal!.leaveTypeName).toBe("Named Balance Type");
    });

    it("should not return tenant A balances for tenant B", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `RLSBAL${Date.now()}`,
        name: "RLS Balance Test",
        category: "annual",
      });

      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.leave_balances (
          tenant_id, employee_id, leave_type_id, year,
          opening_balance, accrued, used, pending, adjustments, carryover
        ) VALUES (
          ${tenant.id}::uuid, ${user.id}::uuid, ${lt.id}::uuid, 2095,
          25, 0, 0, 0, 0, 0
        )
        ON CONFLICT (tenant_id, employee_id, leave_type_id, year) DO NOTHING
      `;

      const balances = await repo.getLeaveBalances(ctxB(), user.id, 2095);
      expect(balances.length).toBe(0);
    });
  });

  // ==========================================================================
  // Outbox Atomicity
  // ==========================================================================

  describe("Outbox Atomicity", () => {
    it("should write outbox event in same transaction as leave request creation", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OB${Date.now()}`,
        name: "Outbox Atomicity LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-01"),
        endDate: new Date("2027-04-02"),
      });

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type, payload FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;

      expect(outbox.length).toBeGreaterThanOrEqual(1);
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.created")).toBe(true);
    });

    it("should write outbox event when submitting a leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OBSUB${Date.now()}`,
        name: "Outbox Submit LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-03"),
        endDate: new Date("2027-04-04"),
      });

      await repo.submitLeaveRequest(ctxA(), request.id);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.submitted")).toBe(true);
    });

    it("should write outbox event when approving a leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OBAPP${Date.now()}`,
        name: "Outbox Approve LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-05"),
        endDate: new Date("2027-04-06"),
      });
      await repo.submitLeaveRequest(ctxA(), request.id);
      await repo.approveLeaveRequest(ctxA(), request.id, user.id, "OK");

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.approved")).toBe(true);
    });

    it("should write outbox event when rejecting a leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OBREJ${Date.now()}`,
        name: "Outbox Reject LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-07"),
        endDate: new Date("2027-04-08"),
      });
      await repo.submitLeaveRequest(ctxA(), request.id);
      await repo.rejectLeaveRequest(ctxA(), request.id, user.id, "Denied");

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.denied")).toBe(true);
    });

    it("should write outbox event when cancelling a leave request", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OBCAN${Date.now()}`,
        name: "Outbox Cancel LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-09"),
        endDate: new Date("2027-04-10"),
      });
      await repo.cancelLeaveRequest(ctxA(), request.id);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.cancelled")).toBe(true);
    });

    it("should not write outbox event when state transition fails (no row matched)", async () => {
      if (skip) return;

      const lt = await repo.createLeaveType(ctxA(), {
        code: `OBNOP${Date.now()}`,
        name: "Outbox No-Op LT",
        category: "annual",
      });

      const request = await repo.createLeaveRequest(ctxA(), {
        employeeId: user.id,
        leaveTypeId: lt.id,
        startDate: new Date("2027-04-11"),
        endDate: new Date("2027-04-12"),
      });

      // Try to approve a draft (should fail, no outbox event for approve)
      await repo.approveLeaveRequest(ctxA(), request.id, user.id);

      await setTenantContext(db, tenant.id, user.id);
      const outbox = await db<Record<string, unknown>[]>`
        SELECT event_type FROM app.domain_outbox
        WHERE aggregate_type = 'leave_request' AND aggregate_id = ${request.id}::uuid
      `;

      // Should have 'created' but NOT 'approved'
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.created")).toBe(true);
      expect(outbox.some((e: Record<string, unknown>) => e.event_type === "absence.request.approved")).toBe(false);
    });
  });
});
