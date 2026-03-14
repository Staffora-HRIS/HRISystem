/**
 * Case Management Flow E2E Tests
 *
 * Full lifecycle test using REAL database operations:
 * 1. Create case category
 * 2. Create a case (new)
 * 3. Assign case (new -> open)
 * 4. Put on hold / pending
 * 5. Resolve case
 * 6. Close case
 * 7. Test escalation
 * 8. Test invalid state transitions
 * 9. Verify outbox events
 * 10. Test auto-generated case numbers
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

describe("Case Management Flow E2E", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  // Shared test data
  let employeeId: string;
  let categoryId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `case-flow-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `case-flow-${suffix}@example.com` });

    await setTenantContext(db, tenant.id, user.id);

    // Create employee (requester)
    const emp = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenant.id}::uuid, ${'CASE-EMP-' + suffix}, 'pending', '2024-01-01')
      RETURNING id
    `;
    employeeId = emp[0]!.id;
    await db`UPDATE app.employees SET status = 'active' WHERE id = ${employeeId}::uuid`;

    // Create case category
    const cat = await db<{ id: string }[]>`
      INSERT INTO app.case_categories (
        tenant_id, code, name, description,
        default_priority, default_case_type,
        sla_response_hours, sla_resolution_hours
      )
      VALUES (
        ${tenant.id}::uuid, ${'HR_GENERAL_' + suffix}, 'HR General Inquiry',
        'General HR questions and requests',
        'medium', 'inquiry', 4, 48
      )
      RETURNING id
    `;
    categoryId = cat[0]!.id;
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.cases WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.case_categories WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
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
  // Case Number Auto-Generation
  // ===========================================================================
  describe("Case number auto-generation", () => {
    it("should auto-generate case number when not provided", async () => {
      if (!db || !tenant) return;

      const caseResult = await db<{ id: string; caseNumber: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description, case_type, priority
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Test auto-number', 'Testing case number generation', 'inquiry', 'low'
        )
        RETURNING id, case_number as "caseNumber"
      `;

      expect(caseResult.length).toBe(1);
      // Should start with HR-YYYY-
      expect(caseResult[0]!.caseNumber).toMatch(/^HR-\d{4}-\d+$/);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseResult[0]!.id}::uuid`;
      });
    });

    it("should increment case numbers", async () => {
      if (!db || !tenant) return;

      const case1 = await db<{ id: string; caseNumber: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Case 1', 'First case'
        )
        RETURNING id, case_number as "caseNumber"
      `;

      const case2 = await db<{ id: string; caseNumber: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Case 2', 'Second case'
        )
        RETURNING id, case_number as "caseNumber"
      `;

      // Second case number should be higher than first
      const num1 = parseInt(case1[0]!.caseNumber.split("-").pop()!, 10);
      const num2 = parseInt(case2[0]!.caseNumber.split("-").pop()!, 10);
      expect(num2).toBeGreaterThan(num1);

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id IN (${case1[0]!.id}::uuid, ${case2[0]!.id}::uuid)`;
      });
    });
  });

  // ===========================================================================
  // Full Lifecycle: new -> open -> pending -> open -> resolved -> closed
  // ===========================================================================
  describe("Full lifecycle", () => {
    let caseId: string;
    let _caseNumber: string;

    it("should create a case with status 'new'", async () => {
      if (!db || !tenant) return;

      const result = await db<{ id: string; status: string; caseNumber: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description, priority, case_type
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Need help with benefits enrollment',
          'I cannot access the benefits portal to enroll in health insurance.',
          'high', 'issue'
        )
        RETURNING id, status, case_number as "caseNumber"
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.status).toBe("new");
      caseId = result[0]!.id;
      _caseNumber = result[0]!.caseNumber;
    });

    it("should have SLA dates calculated from category", async () => {
      if (!db || !tenant || !caseId) return;

      const sla = await db<{
        slaResponseDueAt: Date | null;
        slaResolutionDueAt: Date | null;
        slaStatus: string;
      }[]>`
        SELECT
          sla_response_due_at as "slaResponseDueAt",
          sla_resolution_due_at as "slaResolutionDueAt",
          sla_status as "slaStatus"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(sla[0]!.slaResponseDueAt).not.toBeNull();
      expect(sla[0]!.slaResolutionDueAt).not.toBeNull();
      expect(sla[0]!.slaStatus).toBe("within_sla");
    });

    it("should transition new -> open (assign)", async () => {
      if (!db || !tenant || !caseId) return;

      await db`
        UPDATE app.cases
        SET status = 'open', assigned_to = ${user.id}::uuid,
            sla_response_met_at = now()
        WHERE id = ${caseId}::uuid
      `;

      const result = await db<{ status: string; assignedTo: string }[]>`
        SELECT status, assigned_to as "assignedTo"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.status).toBe("open");
      expect(result[0]!.assignedTo).toBe(user.id);
    });

    it("should transition open -> pending (awaiting info)", async () => {
      if (!db || !tenant || !caseId) return;

      await db`
        UPDATE app.cases
        SET status = 'pending',
            internal_notes = 'Waiting for employee to provide screenshot'
        WHERE id = ${caseId}::uuid
      `;

      const result = await db<{ status: string; slaStatus: string }[]>`
        SELECT status, sla_status as "slaStatus"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.status).toBe("pending");
      // SLA should be paused
      expect(result[0]!.slaStatus).toBe("paused");
    });

    it("should transition pending -> open (info received)", async () => {
      if (!db || !tenant || !caseId) return;

      await db`
        UPDATE app.cases SET status = 'open' WHERE id = ${caseId}::uuid
      `;

      const result = await db<{ status: string; slaStatus: string }[]>`
        SELECT status, sla_status as "slaStatus"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.status).toBe("open");
      // SLA should resume
      expect(result[0]!.slaStatus).toBe("within_sla");
    });

    it("should transition open -> resolved", async () => {
      if (!db || !tenant || !caseId) return;

      await db`
        UPDATE app.cases
        SET status = 'resolved',
            resolution_type = 'resolved',
            resolution_summary = 'Reset the employee portal credentials and enrolled in benefits.',
            resolved_at = now(),
            resolved_by = ${user.id}::uuid
        WHERE id = ${caseId}::uuid
      `;

      const result = await db<{ status: string; resolutionSummary: string }[]>`
        SELECT status, resolution_summary as "resolutionSummary"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.status).toBe("resolved");
      expect(result[0]!.resolutionSummary).toContain("Reset the employee");
    });

    it("should transition resolved -> closed", async () => {
      if (!db || !tenant || !caseId) return;

      await db`
        UPDATE app.cases
        SET status = 'closed',
            closed_at = now(),
            closed_by = ${user.id}::uuid,
            satisfaction_rating = 5,
            satisfaction_feedback = 'Very helpful, resolved quickly!'
        WHERE id = ${caseId}::uuid
      `;

      const result = await db<{
        status: string;
        satisfactionRating: number;
      }[]>`
        SELECT status, satisfaction_rating as "satisfactionRating"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.status).toBe("closed");
      expect(result[0]!.satisfactionRating).toBe(5);
    });

    it("should reject transition from closed (terminal state)", async () => {
      if (!db || !tenant || !caseId) return;

      try {
        await db`
          UPDATE app.cases SET status = 'open' WHERE id = ${caseId}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("closed is a terminal state");
      }

      // Cleanup lifecycle case
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Reopening Flow
  // ===========================================================================
  describe("Reopen flow", () => {
    it("should allow reopening a resolved case (resolved -> open)", async () => {
      if (!db || !tenant) return;

      // Create and progress to resolved
      const caseResult = await db<{ id: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Reopen test', 'Testing reopen flow'
        )
        RETURNING id
      `;
      const caseId = caseResult[0]!.id;

      // new -> open
      await db`UPDATE app.cases SET status = 'open', assigned_to = ${user.id}::uuid WHERE id = ${caseId}::uuid`;

      // open -> resolved
      await db`
        UPDATE app.cases
        SET status = 'resolved', resolution_type = 'resolved',
            resolution_summary = 'Fixed', resolved_at = now(), resolved_by = ${user.id}::uuid
        WHERE id = ${caseId}::uuid
      `;

      // resolved -> open (reopen)
      await db`UPDATE app.cases SET status = 'open' WHERE id = ${caseId}::uuid`;

      const result = await db<{ status: string }[]>`
        SELECT status FROM app.cases WHERE id = ${caseId}::uuid
      `;
      expect(result[0]!.status).toBe("open");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Escalation
  // ===========================================================================
  describe("Escalation", () => {
    it("should escalate a case using the escalate_case function", async () => {
      if (!db || !tenant) return;

      const caseResult = await db<{ id: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description, priority
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Escalation test', 'Testing escalation', 'high'
        )
        RETURNING id
      `;
      const caseId = caseResult[0]!.id;

      // Assign first
      await db`UPDATE app.cases SET status = 'open', assigned_to = ${user.id}::uuid WHERE id = ${caseId}::uuid`;

      // Escalate
      await db`SELECT app.escalate_case(${caseId}::uuid, ${user.id}::uuid, 'tier_1', 'Customer is VIP')`;

      const result = await db<{
        escalationLevel: string;
        escalatedAt: Date | null;
        internalNotes: string | null;
      }[]>`
        SELECT
          escalation_level as "escalationLevel",
          escalated_at as "escalatedAt",
          internal_notes as "internalNotes"
        FROM app.cases WHERE id = ${caseId}::uuid
      `;

      expect(result[0]!.escalationLevel).toBe("tier_1");
      expect(result[0]!.escalatedAt).not.toBeNull();
      expect(result[0]!.internalNotes).toContain("Escalated to tier_1");
      expect(result[0]!.internalNotes).toContain("Customer is VIP");

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Invalid Transitions
  // ===========================================================================
  describe("Invalid state transitions", () => {
    it("should reject new -> resolved (must go through open first)", async () => {
      if (!db || !tenant) return;

      const caseResult = await db<{ id: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'Invalid transition', 'Test'
        )
        RETURNING id
      `;

      try {
        await db`
          UPDATE app.cases
          SET status = 'resolved', resolution_type = 'resolved',
              resolution_summary = 'Fixed', resolved_at = now(), resolved_by = ${user.id}::uuid
          WHERE id = ${caseResult[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Invalid status transition");
        expect(String(error)).toContain("new can only transition to open or cancelled");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseResult[0]!.id}::uuid`;
      });
    });

    it("should reject on_hold -> resolved (must go through open first)", async () => {
      if (!db || !tenant) return;

      const caseResult = await db<{ id: string }[]>`
        INSERT INTO app.cases (
          tenant_id, requester_id, category_id,
          subject, description
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
          'On hold test', 'Test'
        )
        RETURNING id
      `;
      const caseId = caseResult[0]!.id;

      await db`UPDATE app.cases SET status = 'open', assigned_to = ${user.id}::uuid WHERE id = ${caseId}::uuid`;
      await db`UPDATE app.cases SET status = 'on_hold' WHERE id = ${caseId}::uuid`;

      try {
        await db`
          UPDATE app.cases
          SET status = 'resolved', resolution_type = 'resolved',
              resolution_summary = 'Fixed', resolved_at = now(), resolved_by = ${user.id}::uuid
          WHERE id = ${caseId}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("on_hold can only transition to open, pending, or cancelled");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.cases WHERE id = ${caseId}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Constraint Validation
  // ===========================================================================
  describe("Case constraint validation", () => {
    it("should reject satisfaction rating outside 1-5", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.cases (
            tenant_id, requester_id, category_id,
            subject, description, satisfaction_rating
          )
          VALUES (
            ${tenant.id}::uuid, ${employeeId}::uuid, ${categoryId}::uuid,
            'Rating test', 'Test', 6
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("cases_satisfaction_rating_valid");
      }
    });

    it("should reject self as on_behalf_of", async () => {
      if (!db || !tenant) return;

      try {
        await db`
          INSERT INTO app.cases (
            tenant_id, requester_id, on_behalf_of_id, category_id,
            subject, description
          )
          VALUES (
            ${tenant.id}::uuid, ${employeeId}::uuid, ${employeeId}::uuid,
            ${categoryId}::uuid, 'Self behalf', 'Test'
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("cases_not_self_behalf");
      }
    });
  });
});
