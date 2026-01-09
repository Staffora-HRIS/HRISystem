/**
 * State Machine Integration Tests
 *
 * Verifies that state machine transitions are enforced and audited.
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
import {
  canTransition,
  getValidTransitions,
  validateTransition,
  isTerminalState,
  EmployeeStates,
} from "@hris/shared";

describe("State Machine", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
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

  describe("Employee Lifecycle State Machine (Unit)", () => {
    describe("canTransition", () => {
      it("should allow pending -> active", () => {
        expect(canTransition("pending", "active")).toBe(true);
      });

      it("should allow active -> on_leave", () => {
        expect(canTransition("active", "on_leave")).toBe(true);
      });

      it("should allow active -> terminated", () => {
        expect(canTransition("active", "terminated")).toBe(true);
      });

      it("should allow on_leave -> active", () => {
        expect(canTransition("on_leave", "active")).toBe(true);
      });

      it("should allow on_leave -> terminated", () => {
        expect(canTransition("on_leave", "terminated")).toBe(true);
      });

      it("should NOT allow pending -> on_leave", () => {
        expect(canTransition("pending", "on_leave")).toBe(false);
      });

      it("should NOT allow terminated -> any state", () => {
        expect(canTransition("terminated", "active")).toBe(false);
        expect(canTransition("terminated", "pending")).toBe(false);
        expect(canTransition("terminated", "on_leave")).toBe(false);
      });

      it("should NOT allow active -> pending", () => {
        expect(canTransition("active", "pending")).toBe(false);
      });
    });

    describe("getValidTransitions", () => {
      it("should return valid transitions from pending", () => {
        const transitions = getValidTransitions("pending");
        expect(transitions).toContain("active");
        expect(transitions).toContain("terminated");
        expect(transitions.length).toBe(2);
      });

      it("should return valid transitions from active", () => {
        const transitions = getValidTransitions("active");
        expect(transitions).toContain("on_leave");
        expect(transitions).toContain("terminated");
        expect(transitions.length).toBe(2);
      });

      it("should return empty array for terminated", () => {
        const transitions = getValidTransitions("terminated");
        expect(transitions.length).toBe(0);
      });
    });

    describe("validateTransition", () => {
      it("should return null for valid transition", () => {
        expect(validateTransition("pending", "active")).toBeNull();
      });

      it("should return error for same state", () => {
        const error = validateTransition("active", "active");
        expect(error).toContain("already in");
      });

      it("should return error for invalid transition", () => {
        const error = validateTransition("pending", "on_leave");
        expect(error).toContain("Invalid transition");
      });

      it("should return error for terminal state", () => {
        const error = validateTransition("terminated", "active");
        expect(error).toContain("terminal state");
      });
    });

    describe("isTerminalState", () => {
      it("should identify terminated as terminal", () => {
        expect(isTerminalState("terminated")).toBe(true);
      });

      it("should identify other states as non-terminal", () => {
        expect(isTerminalState("pending")).toBe(false);
        expect(isTerminalState("active")).toBe(false);
        expect(isTerminalState("on_leave")).toBe(false);
      });
    });
  });

  describe("Employee Status Transitions (Integration)", () => {
    let employeeId: string;

    beforeEach(async () => {
      // Skip if fixtures not available
      if (!db || !tenant || !user) return;
      // Create test employee in pending status
      const result = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${"SM-TEST-" + Date.now()}, 'pending', CURRENT_DATE)
        RETURNING id
      `;
      employeeId = result[0]!.id;
    });

    afterEach(async () => {
      if (!db || !employeeId) return;
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${employeeId}::uuid`;
      });
    });

    it("should allow valid status transition with history", async () => {
      if (!db || !employeeId) return;
      // Transition from pending to active
      const validTransition = canTransition("pending", "active");
      expect(validTransition).toBe(true);

      // Update employee status
      await db`
        UPDATE app.employees
        SET status = 'active'
        WHERE id = ${employeeId}::uuid
      `;

      // History is auto-recorded by trigger on employees table

      // Verify status
      const employee = await db<{ status: string }[]>`
        SELECT status FROM app.employees WHERE id = ${employeeId}::uuid
      `;
      expect(employee[0]!.status).toBe("active");

      // Verify history
      const history = await db<{ fromStatus: string; toStatus: string }[]>`
        SELECT from_status as "fromStatus", to_status as "toStatus"
        FROM app.employee_status_history
        WHERE employee_id = ${employeeId}::uuid
          AND from_status IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      expect(history.length).toBe(1);
      expect(history[0]!.fromStatus).toBe("pending");
      expect(history[0]!.toStatus).toBe("active");
    });

    it("should reject invalid status transition", async () => {
      if (!db) return;
      // Try invalid transition: pending -> on_leave
      const validTransition = canTransition("pending", "on_leave");
      expect(validTransition).toBe(false);

      // Application should prevent this update
      const validationError = validateTransition("pending", "on_leave");
      expect(validationError).not.toBeNull();
      expect(validationError).toContain("Invalid transition");
    });

    it("should track multiple transitions", async () => {
      if (!db || !employeeId) return;
      // Transitions are recorded automatically by trigger on employees table

      // Transition: pending -> active
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

      // Transition: active -> on_leave
      await db`UPDATE app.employees SET status = 'on_leave' WHERE id = ${employeeId}::uuid`;

      // Transition: on_leave -> active
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

      // Verify current status
      const employee = await db<{ status: string }[]>`
        SELECT status FROM app.employees WHERE id = ${employeeId}::uuid
      `;
      expect(employee[0]!.status).toBe("active");

      // Verify full history
      const history = await db<{ fromStatus: string; toStatus: string }[]>`
        SELECT from_status as "fromStatus", to_status as "toStatus"
        FROM app.employee_status_history
        WHERE employee_id = ${employeeId}::uuid
          AND from_status IS NOT NULL
        ORDER BY created_at ASC
      `;

      expect(history.length).toBe(3);
      expect(history[0]!.fromStatus).toBe("pending");
      expect(history[0]!.toStatus).toBe("active");
      expect(history[1]!.fromStatus).toBe("active");
      expect(history[1]!.toStatus).toBe("on_leave");
      expect(history[2]!.fromStatus).toBe("on_leave");
      expect(history[2]!.toStatus).toBe("active");
    });

    it("should prevent transitions from terminal state", async () => {
      if (!db || !employeeId) return;
      // First activate the employee
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

      // Then terminate
      await db`
        UPDATE app.employees
        SET status = 'terminated', termination_date = CURRENT_DATE, termination_reason = 'Resignation'
        WHERE id = ${employeeId}::uuid
      `;

      // Verify terminated is terminal
      expect(isTerminalState("terminated")).toBe(true);

      // Application should prevent any transition from terminated
      expect(canTransition("terminated", "active")).toBe(false);
      expect(canTransition("terminated", "pending")).toBe(false);
      expect(canTransition("terminated", "on_leave")).toBe(false);
    });

    it("should store transition reason", async () => {
      if (!db || !employeeId) return;
      // Activate first
      await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

      // Terminate with reason
      const terminationReason = "Voluntary resignation - accepted new position";
      await db`
        UPDATE app.employees
        SET status = 'terminated', termination_date = CURRENT_DATE, termination_reason = ${terminationReason}
        WHERE id = ${employeeId}::uuid
      `;

      // Verify reason stored in history
      const history = await db<{ reason: string | null }[]>`
        SELECT reason
        FROM app.employee_status_history
        WHERE employee_id = ${employeeId}::uuid AND to_status = 'terminated'
      `;

      expect(history[0]!.reason).toBe(terminationReason);

      // Verify reason stored on employee
      const employee = await db<{ terminationReason: string | null }[]>`
        SELECT termination_reason as "terminationReason"
        FROM app.employees WHERE id = ${employeeId}::uuid
      `;
      expect(employee[0]!.terminationReason).toBe(terminationReason);
    });
  });

  describe("State transitions emit outbox events", () => {
    let employeeId: string;

    beforeEach(async () => {
      // Skip if fixtures not available
      if (!db || !tenant || !user) return;
      const result = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${"SM-OUTBOX-" + Date.now()}, 'pending', CURRENT_DATE)
        RETURNING id
      `;
      employeeId = result[0]!.id;
    });

    afterEach(async () => {
      if (!db || !employeeId) return;
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE aggregate_id = ${employeeId}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${employeeId}::uuid`;
      });
    });

    it("should emit status_changed event on transition", async () => {
      // Skip if fixtures not available
      if (!db || !tenant || !employeeId) return;
      // Perform transition with outbox event in same transaction
      await db.begin(async (tx) => {
        // Update status
        await tx`
          UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid
        `;

        // History is auto-recorded by trigger on employees table

        // Emit outbox event
        await tx`
          INSERT INTO app.domain_outbox (
            tenant_id, aggregate_type, aggregate_id, event_type, payload
          )
          VALUES (
            ${tenant.id}::uuid, 'employee', ${employeeId}::uuid,
            'hr.employee.status_changed',
            jsonb_build_object(
              'employeeId', ${employeeId}::uuid,
              'fromStatus', 'pending',
              'toStatus', 'active',
              'effectiveDate', to_char(CURRENT_DATE, 'YYYY-MM-DD')
            )
          )
        `;
      });

      // Verify outbox event
      const outboxEvents = await db<{ eventType: string; fromStatus: string; toStatus: string }[]>`
        SELECT
          event_type as "eventType",
          payload->>'fromStatus' as "fromStatus",
          payload->>'toStatus' as "toStatus"
        FROM app.domain_outbox
        WHERE aggregate_id = ${employeeId}::uuid
      `;

      expect(outboxEvents.length).toBe(1);
      expect(outboxEvents[0]!.eventType).toBe("hr.employee.status_changed");
      expect(outboxEvents[0]!.fromStatus).toBe("pending");
      expect(outboxEvents[0]!.toStatus).toBe("active");
    });
  });
});
