/**
 * Leave Request Flow E2E Tests
 *
 * Full lifecycle test using REAL database operations:
 * 1. Create employee, leave type, and leave balance
 * 2. Submit leave request (draft -> pending)
 * 3. Approve leave request (pending -> approved)
 * 4. Verify balance changes
 * 5. Cancel approved leave request
 * 6. Verify balance restoration
 * 7. Test rejection flow
 * 8. Verify outbox events are written atomically
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
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
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Leave Request Flow E2E", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  // Shared test data IDs
  let employeeId: string;
  let leaveTypeId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `lr-flow-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `lr-flow-${suffix}@example.com` });

    await setTenantContext(db, tenant.id, user.id);

    // Create employee (must be active for leave requests)
    const emp = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenant.id}::uuid, ${'LR-EMP-' + suffix}, 'pending', '2024-01-01')
      RETURNING id
    `;
    employeeId = emp[0]!.id;

    // Activate employee
    await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

    // Create leave type
    const lt = await db<{ id: string }[]>`
      INSERT INTO app.leave_types (tenant_id, code, name, category, requires_approval)
      VALUES (${tenant.id}::uuid, ${'LR_ANNUAL_' + suffix}, 'Annual Leave', 'annual', true)
      RETURNING id
    `;
    leaveTypeId = lt[0]!.id;

    // Create leave balance for 2026
    await db`
      INSERT INTO app.leave_balances (tenant_id, employee_id, leave_type_id, year, opening_balance, accrued)
      VALUES (${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 2026, 5, 20)
    `;
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.leave_requests WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.leave_balances WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.leave_types WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.employee_status_history WHERE employee_id IN (
        SELECT id FROM app.employees WHERE tenant_id = ${tenant.id}::uuid
      )`.catch(() => {});
      await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
    });
    await cleanupTestUser(db, user.id);
    await cleanupTestTenant(db, tenant.id);
    await closeTestConnections(db);
  });

  beforeEach(async () => {
    if (!db || !tenant || !user) return;
    await setTenantContext(db, tenant.id, user.id);
  });

  afterEach(async () => {
    if (!db) return;
    await clearTenantContext(db);
  });

  // ===========================================================================
  // Full Submit -> Approve Flow
  // ===========================================================================
  describe("Submit and approve flow", () => {
    let requestId: string;

    it("should create a draft leave request", async () => {
      if (!db || !tenant) return;

      const result = await db<{ id: string; status: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration, reason
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
          '2026-07-01', '2026-07-05', 5, 'Summer vacation'
        )
        RETURNING id, status
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.status).toBe("draft");
      requestId = result[0]!.id;
    });

    it("should transition draft to pending (submit)", async () => {
      if (!db || !tenant || !requestId) return;

      await db`
        UPDATE app.leave_requests
        SET status = 'pending', submitted_at = now(), submitted_by = ${user.id}::uuid
        WHERE id = ${requestId}::uuid
      `;

      const result = await db<{ status: string }[]>`
        SELECT status FROM app.leave_requests WHERE id = ${requestId}::uuid
      `;

      expect(result[0]!.status).toBe("pending");
    });

    it("should reserve balance when request is pending", async () => {
      if (!db || !tenant || !requestId) return;

      // Simulate balance reservation (as the service layer would do)
      await db`
        UPDATE app.leave_balances
        SET pending = pending + 5
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;

      const balance = await db<{ pending: string; availableBalance: string }[]>`
        SELECT
          pending::text,
          available_balance::text as "availableBalance"
        FROM app.leave_balances
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;

      expect(parseFloat(balance[0]!.pending)).toBe(5);
      // available = opening(5) + accrued(20) - pending(5) = 20
      expect(parseFloat(balance[0]!.availableBalance)).toBe(20);
    });

    it("should transition pending to approved with outbox event", async () => {
      if (!db || !tenant || !requestId) return;

      await db.begin(async (tx) => {
        // Approve the request
        await tx`
          UPDATE app.leave_requests
          SET status = 'approved', approved_at = now(), approved_by = ${user.id}::uuid
          WHERE id = ${requestId}::uuid
        `;

        // Move pending to used
        await tx`
          UPDATE app.leave_balances
          SET pending = pending - 5, used = used + 5
          WHERE employee_id = ${employeeId}::uuid
            AND leave_type_id = ${leaveTypeId}::uuid
            AND year = 2026
        `;

        // Write outbox event
        await tx`
          INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
          VALUES (
            ${tenant.id}::uuid, 'leave_request', ${requestId}::uuid,
            'absence.leave_request.approved',
            ${JSON.stringify({ requestId, employeeId, days: 5 })}::jsonb
          )
        `;
      });

      // Verify request status
      const request = await db<{ status: string }[]>`
        SELECT status FROM app.leave_requests WHERE id = ${requestId}::uuid
      `;
      expect(request[0]!.status).toBe("approved");

      // Verify balance updated
      const balance = await db<{ used: string; pending: string; closingBalance: string }[]>`
        SELECT
          used::text,
          pending::text,
          closing_balance::text as "closingBalance"
        FROM app.leave_balances
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;
      expect(parseFloat(balance[0]!.used)).toBe(5);
      expect(parseFloat(balance[0]!.pending)).toBe(0);
      // closing = opening(5) + accrued(20) - used(5) = 20
      expect(parseFloat(balance[0]!.closingBalance)).toBe(20);

      // Verify outbox event was written
      const outbox = await db<{ eventType: string }[]>`
        SELECT event_type as "eventType"
        FROM app.domain_outbox
        WHERE aggregate_id = ${requestId}::uuid AND aggregate_type = 'leave_request'
      `;
      expect(outbox.length).toBe(1);
      expect(outbox[0]!.eventType).toBe("absence.leave_request.approved");
    });

    it("should allow cancellation of approved leave with balance restoration", async () => {
      if (!db || !tenant || !requestId) return;

      await db.begin(async (tx) => {
        // Cancel the approved request
        await tx`
          UPDATE app.leave_requests
          SET status = 'cancelled',
              cancelled_at = now(),
              cancelled_by = ${user.id}::uuid,
              cancellation_reason = 'Plans changed'
          WHERE id = ${requestId}::uuid
        `;

        // Restore balance
        await tx`
          UPDATE app.leave_balances
          SET used = used - 5
          WHERE employee_id = ${employeeId}::uuid
            AND leave_type_id = ${leaveTypeId}::uuid
            AND year = 2026
        `;

        // Write outbox event
        await tx`
          INSERT INTO app.domain_outbox (tenant_id, aggregate_type, aggregate_id, event_type, payload)
          VALUES (
            ${tenant.id}::uuid, 'leave_request', ${requestId}::uuid,
            'absence.leave_request.cancelled',
            ${JSON.stringify({ requestId, employeeId, restoredDays: 5 })}::jsonb
          )
        `;
      });

      // Verify request status
      const request = await db<{ status: string; cancellationReason: string }[]>`
        SELECT status, cancellation_reason as "cancellationReason"
        FROM app.leave_requests WHERE id = ${requestId}::uuid
      `;
      expect(request[0]!.status).toBe("cancelled");
      expect(request[0]!.cancellationReason).toBe("Plans changed");

      // Verify balance restored
      const balance = await db<{ used: string; closingBalance: string }[]>`
        SELECT used::text, closing_balance::text as "closingBalance"
        FROM app.leave_balances
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;
      expect(parseFloat(balance[0]!.used)).toBe(0);
      // closing = opening(5) + accrued(20) - used(0) = 25
      expect(parseFloat(balance[0]!.closingBalance)).toBe(25);
    });
  });

  // ===========================================================================
  // Rejection Flow
  // ===========================================================================
  describe("Rejection flow", () => {
    it("should transition pending to rejected with reason", async () => {
      if (!db || !tenant) return;

      // Create and submit
      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration, reason
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
          '2026-08-01', '2026-08-03', 3, 'Family event'
        )
        RETURNING id
      `;
      const lrId = lr[0]!.id;

      // Submit
      await db`
        UPDATE app.leave_requests
        SET status = 'pending', submitted_at = now()
        WHERE id = ${lrId}::uuid
      `;

      // Reserve balance
      await db`
        UPDATE app.leave_balances SET pending = pending + 3
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;

      // Reject with reason
      await db.begin(async (tx) => {
        await tx`
          UPDATE app.leave_requests
          SET status = 'rejected',
              rejected_at = now(),
              rejected_by = ${user.id}::uuid,
              rejection_reason = 'Peak period - no leave allowed'
          WHERE id = ${lrId}::uuid
        `;

        // Release pending balance
        await tx`
          UPDATE app.leave_balances SET pending = pending - 3
          WHERE employee_id = ${employeeId}::uuid
            AND leave_type_id = ${leaveTypeId}::uuid
            AND year = 2026
        `;
      });

      // Verify status
      const result = await db<{ status: string; rejectionReason: string }[]>`
        SELECT status, rejection_reason as "rejectionReason"
        FROM app.leave_requests WHERE id = ${lrId}::uuid
      `;
      expect(result[0]!.status).toBe("rejected");
      expect(result[0]!.rejectionReason).toBe("Peak period - no leave allowed");

      // Verify balance restored
      const balance = await db<{ pending: string }[]>`
        SELECT pending::text
        FROM app.leave_balances
        WHERE employee_id = ${employeeId}::uuid
          AND leave_type_id = ${leaveTypeId}::uuid
          AND year = 2026
      `;
      expect(parseFloat(balance[0]!.pending)).toBe(0);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lrId}::uuid`;
      });
    });

    it("should require rejection_reason when rejecting", async () => {
      if (!db || !tenant) return;

      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
          '2026-09-01', '2026-09-02', 2
        )
        RETURNING id
      `;

      await db`UPDATE app.leave_requests SET status = 'pending', submitted_at = now() WHERE id = ${lr[0]!.id}::uuid`;

      // Try rejecting without reason
      try {
        await db`
          UPDATE app.leave_requests
          SET status = 'rejected', rejected_at = now(), rejected_by = ${user.id}::uuid
          WHERE id = ${lr[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_requests_rejection_reason");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Overlapping Request Prevention
  // ===========================================================================
  describe("Overlapping request prevention", () => {
    it("should detect overlapping leave requests via function", async () => {
      if (!db || !tenant) return;

      // Create an approved request for Jul 10-15
      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration,
          approved_at, approved_by
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'approved',
          '2026-07-10', '2026-07-15', 4,
          now(), ${user.id}::uuid
        )
        RETURNING id
      `;

      // Check for overlap with Jul 13-18
      const overlap = await db<{ hasOverlap: boolean; overlappingRequestId: string | null }[]>`
        SELECT has_overlap as "hasOverlap", overlapping_request_id as "overlappingRequestId"
        FROM app.check_leave_request_overlap(
          ${tenant.id}::uuid, ${employeeId}::uuid,
          '2026-07-13'::date, '2026-07-18'::date
        )
      `;

      expect(overlap.length).toBe(1);
      expect(overlap[0]!.hasOverlap).toBe(true);
      expect(overlap[0]!.overlappingRequestId).toBe(lr[0]!.id);

      // Check for non-overlapping period (Jul 20-25)
      const noOverlap = await db<{ hasOverlap: boolean }[]>`
        SELECT has_overlap as "hasOverlap"
        FROM app.check_leave_request_overlap(
          ${tenant.id}::uuid, ${employeeId}::uuid,
          '2026-07-20'::date, '2026-07-25'::date
        )
      `;

      expect(noOverlap[0]!.hasOverlap).toBe(false);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Half-Day Request Constraint
  // ===========================================================================
  describe("Half-day request constraints", () => {
    it("should reject single-day request with both half-days true", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.leave_requests (
            tenant_id, employee_id, leave_type_id, status,
            start_date, end_date, duration,
            start_half_day, end_half_day
          )
          VALUES (
            ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
            '2026-10-01', '2026-10-01', 0.5,
            true, true
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("leave_requests_half_day_check");
      }
    });

    it("should allow single-day half-day request with one flag true", async () => {
      if (!db || !tenant) return;

      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration,
          start_half_day, end_half_day
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
          '2026-10-01', '2026-10-01', 0.5,
          true, false
        )
        RETURNING id
      `;

      expect(lr.length).toBe(1);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Terminal State Enforcement
  // ===========================================================================
  describe("Terminal state enforcement", () => {
    it("should prevent transition from cancelled state", async () => {
      if (!db || !tenant) return;

      const lr = await db<{ id: string }[]>`
        INSERT INTO app.leave_requests (
          tenant_id, employee_id, leave_type_id, status,
          start_date, end_date, duration
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${leaveTypeId}::uuid, 'draft',
          '2026-11-01', '2026-11-03', 3
        )
        RETURNING id
      `;

      // Cancel
      await db`
        UPDATE app.leave_requests
        SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${user.id}::uuid
        WHERE id = ${lr[0]!.id}::uuid
      `;

      // Try to resubmit
      try {
        await db`
          UPDATE app.leave_requests SET status = 'pending' WHERE id = ${lr[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("cancelled is a terminal state");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.leave_requests WHERE id = ${lr[0]!.id}::uuid`;
      });
    });
  });
});
