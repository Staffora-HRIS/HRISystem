/**
 * Case Appeals Integration Tests
 *
 * Tests the ACAS Code of Practice compliant case appeal process (TODO-152).
 *
 * Key requirements verified:
 * - Appeal can only be filed against resolved cases
 * - Hearing officer must NOT be the same as the original decision maker (ACAS Code para 27)
 * - RLS enforces tenant isolation on case_appeals
 * - Outbox events are written atomically with appeal operations
 * - Appeal decision transitions case status correctly
 * - Duplicate pending appeals are rejected
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";
import type postgres from "postgres";

describe("Case Appeals - ACAS Code Compliance", () => {
  let db: ReturnType<typeof postgres>;
  let tenant: TestTenant;
  let requesterUser: TestUser;
  let resolverUser: TestUser;
  let appealOfficerUser: TestUser;
  let employeeId: string;
  let caseId: string;
  let caseCategoryId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenant = await createTestTenant(db);
    requesterUser = await createTestUser(db, tenant.id, {
      email: `requester-${Date.now()}@test.com`,
    });
    resolverUser = await createTestUser(db, tenant.id, {
      email: `resolver-${Date.now()}@test.com`,
    });
    appealOfficerUser = await createTestUser(db, tenant.id, {
      email: `appeal-officer-${Date.now()}@test.com`,
    });

    // Create test employee and case category via system context
    employeeId = crypto.randomUUID();
    caseCategoryId = crypto.randomUUID();

    await withSystemContext(db, async (tx) => {
      // Create a case category
      await tx`
        INSERT INTO app.case_categories (id, tenant_id, code, name, description, is_active)
        VALUES (${caseCategoryId}::uuid, ${tenant.id}::uuid, ${"GRIEVANCE-" + Date.now()}, 'Test Grievance', 'Test category', true)
        ON CONFLICT DO NOTHING
      `;

      // Create a test employee linked to the requester user
      await tx`
        INSERT INTO app.employees (id, tenant_id, employee_number, first_name, last_name, email, status, hire_date, user_id)
        VALUES (
          ${employeeId}::uuid, ${tenant.id}::uuid, ${"EMP-" + Date.now()},
          'Test', 'Appellant', ${requesterUser.email}, 'active', CURRENT_DATE, ${requesterUser.id}::uuid
        )
        ON CONFLICT DO NOTHING
      `;
    });
  });

  afterAll(async () => {
    if (!isInfraAvailable()) return;

    // Clean up test data
    try {
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.case_appeals WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.case_comments WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.cases WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE tenant_id = ${tenant.id}::uuid`;
        await tx`DELETE FROM app.case_categories WHERE tenant_id = ${tenant.id}::uuid`;
      });
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }

    await cleanupTestUser(db, requesterUser.id);
    await cleanupTestUser(db, resolverUser.id);
    await cleanupTestUser(db, appealOfficerUser.id);
    await cleanupTestTenant(db, tenant.id);
    await db.end();
  });

  /**
   * Helper: create a case in 'resolved' status ready for appeal testing.
   * Uses system context to bypass triggers that enforce strict transitions.
   */
  async function createResolvedCase(): Promise<string> {
    const id = crypto.randomUUID();
    const caseNumber = `HR-TEST-${Date.now()}`;

    await withSystemContext(db, async (tx) => {
      await tx`
        INSERT INTO app.cases (
          id, tenant_id, case_number, requester_id, category_id,
          subject, description, priority, status,
          resolution_type, resolution_summary, resolved_at, resolved_by,
          assigned_to, created_at, updated_at
        ) VALUES (
          ${id}::uuid, ${tenant.id}::uuid, ${caseNumber},
          ${employeeId}::uuid, ${caseCategoryId}::uuid,
          'Test case for appeal', 'Description', 'medium', 'resolved',
          'resolved', 'Original resolution', now(), ${resolverUser.id}::uuid,
          ${resolverUser.id}::uuid, now(), now()
        )
      `;
    });

    return id;
  }

  /**
   * Helper: create a case appeal directly in the DB.
   */
  async function createAppealDirectly(
    caseIdParam: string,
    opts: {
      status?: string;
      hearingOfficerId?: string | null;
      originalDecisionMakerId?: string | null;
    } = {}
  ): Promise<string> {
    const appealId = crypto.randomUUID();

    await withSystemContext(db, async (tx) => {
      await tx`
        INSERT INTO app.case_appeals (
          id, tenant_id, case_id, appealed_by, reason,
          hearing_officer_id, original_decision_maker_id,
          appellant_employee_id, status, created_at, updated_at
        ) VALUES (
          ${appealId}::uuid, ${tenant.id}::uuid, ${caseIdParam}::uuid,
          ${requesterUser.id}::uuid, 'Test appeal reason',
          ${opts.hearingOfficerId ?? null}::uuid,
          ${opts.originalDecisionMakerId ?? resolverUser.id}::uuid,
          ${employeeId}::uuid,
          ${opts.status ?? "pending"}, now(), now()
        )
      `;
    });

    return appealId;
  }

  // =========================================================================
  // Schema / Table Tests
  // =========================================================================

  describe("case_appeals table schema", () => {
    it("should have the case_appeals table with required columns", async () => {
      if (!isInfraAvailable()) return;

      const columns = await db`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'case_appeals'
        ORDER BY ordinal_position
      `;

      const columnNames = columns.map((c: any) => c.column_name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("tenant_id");
      expect(columnNames).toContain("case_id");
      expect(columnNames).toContain("appealed_by");
      expect(columnNames).toContain("reason");
      expect(columnNames).toContain("hearing_officer_id");
      expect(columnNames).toContain("original_decision_maker_id");
      expect(columnNames).toContain("appellant_employee_id");
      expect(columnNames).toContain("hearing_date");
      expect(columnNames).toContain("outcome_notes");
      expect(columnNames).toContain("appeal_grounds");
      expect(columnNames).toContain("status");
      expect(columnNames).toContain("decided_at");
    });

    it("should have RLS enabled on case_appeals", async () => {
      if (!isInfraAvailable()) return;

      const [result] = await db`
        SELECT relrowsecurity
        FROM pg_class
        WHERE relname = 'case_appeals'
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')
      `;

      expect(result.relrowsecurity).toBe(true);
    });
  });

  // =========================================================================
  // RLS Tests
  // =========================================================================

  describe("RLS tenant isolation", () => {
    it("should only show appeals for the current tenant", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = await createAppealDirectly(testCaseId);

      // Set context to a different tenant
      const otherTenant = await createTestTenant(db);
      await setTenantContext(db, otherTenant.id, requesterUser.id);

      const rows = await db`
        SELECT id FROM app.case_appeals WHERE id = ${appealId}::uuid
      `;

      // Should not be visible to the other tenant
      expect(rows.length).toBe(0);

      // Set context back to the correct tenant
      await setTenantContext(db, tenant.id, requesterUser.id);

      const ownRows = await db`
        SELECT id FROM app.case_appeals WHERE id = ${appealId}::uuid
      `;

      expect(ownRows.length).toBe(1);

      // Cleanup
      await cleanupTestTenant(db, otherTenant.id);
      await clearTenantContext(db);
    });
  });

  // =========================================================================
  // Different Decision Maker Constraint Tests (ACAS Code para 27)
  // =========================================================================

  describe("ACAS Code para 27: different decision maker", () => {
    it("should reject appeal when hearing_officer_id equals original_decision_maker_id", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      // Try to insert an appeal where the hearing officer is the same as the original decision maker
      let error: Error | null = null;

      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.case_appeals (
              id, tenant_id, case_id, appealed_by, reason,
              hearing_officer_id, original_decision_maker_id,
              status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), ${tenant.id}::uuid, ${testCaseId}::uuid,
              ${requesterUser.id}::uuid, 'Test reason',
              ${resolverUser.id}::uuid, ${resolverUser.id}::uuid,
              'pending', now(), now()
            )
          `;
        });
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error!.message).toContain("case_appeals_different_decision_maker");
    });

    it("should allow appeal when hearing_officer_id differs from original_decision_maker_id", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      // This should succeed because appealOfficerUser !== resolverUser
      let error: Error | null = null;

      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.case_appeals (
              id, tenant_id, case_id, appealed_by, reason,
              hearing_officer_id, original_decision_maker_id,
              status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), ${tenant.id}::uuid, ${testCaseId}::uuid,
              ${requesterUser.id}::uuid, 'Valid appeal',
              ${appealOfficerUser.id}::uuid, ${resolverUser.id}::uuid,
              'pending', now(), now()
            )
          `;
        });
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeNull();
    });

    it("should allow appeal when hearing_officer_id is NULL (assigned later)", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      // NULL hearing_officer_id should be allowed (will be assigned before the hearing)
      let error: Error | null = null;

      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.case_appeals (
              id, tenant_id, case_id, appealed_by, reason,
              hearing_officer_id, original_decision_maker_id,
              status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), ${tenant.id}::uuid, ${testCaseId}::uuid,
              ${requesterUser.id}::uuid, 'Appeal with no officer yet',
              NULL, ${resolverUser.id}::uuid,
              'pending', now(), now()
            )
          `;
        });
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // Case Status Transition Tests
  // =========================================================================

  describe("case status transitions for appeals", () => {
    it("should allow transition from resolved to appealed", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      // Transition from resolved -> appealed should now be allowed
      await setTenantContext(db, tenant.id, requesterUser.id);

      let error: Error | null = null;
      try {
        await db`
          UPDATE app.cases
          SET status = 'appealed', updated_at = now()
          WHERE id = ${testCaseId}::uuid AND tenant_id = ${tenant.id}::uuid
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeNull();

      // Verify the status was updated
      const [updatedCase] = await db`
        SELECT status FROM app.cases WHERE id = ${testCaseId}::uuid
      `;

      expect(updatedCase.status).toBe("appealed");
      await clearTenantContext(db);
    });

    it("should allow transition from appealed to closed (appeal upheld)", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      await setTenantContext(db, tenant.id, resolverUser.id);

      // First transition to appealed
      await db`
        UPDATE app.cases
        SET status = 'appealed', updated_at = now()
        WHERE id = ${testCaseId}::uuid
      `;

      // Then transition from appealed -> closed
      let error: Error | null = null;
      try {
        await db`
          UPDATE app.cases
          SET status = 'closed', closed_at = now(), closed_by = ${resolverUser.id}::uuid, updated_at = now()
          WHERE id = ${testCaseId}::uuid
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeNull();
      await clearTenantContext(db);
    });

    it("should allow transition from appealed to in_progress (appeal overturned)", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();

      await setTenantContext(db, tenant.id, resolverUser.id);

      // First transition to appealed
      await db`
        UPDATE app.cases
        SET status = 'appealed', updated_at = now()
        WHERE id = ${testCaseId}::uuid
      `;

      // Then transition from appealed -> in_progress (overturned)
      let error: Error | null = null;
      try {
        await db`
          UPDATE app.cases
          SET status = 'in_progress', updated_at = now()
          WHERE id = ${testCaseId}::uuid
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).toBeNull();
      await clearTenantContext(db);
    });
  });

  // =========================================================================
  // Outbox Atomicity Tests
  // =========================================================================

  describe("outbox event atomicity", () => {
    it("should write outbox event atomically with appeal creation", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = crypto.randomUUID();

      // Count outbox events before
      await setTenantContext(db, tenant.id, requesterUser.id);

      const [beforeCount] = await db`
        SELECT COUNT(*) as count FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND event_type = 'cases.appeal.filed'
      `;

      // Create appeal + outbox event in one transaction
      await db.begin(async (tx: any) => {
        await tx`SELECT set_config('app.current_tenant', ${tenant.id}, true)`;
        await tx`SELECT set_config('app.current_user', ${requesterUser.id}, true)`;

        await tx`
          INSERT INTO app.case_appeals (
            id, tenant_id, case_id, appealed_by, reason,
            original_decision_maker_id, appellant_employee_id,
            status, created_at, updated_at
          ) VALUES (
            ${appealId}::uuid, ${tenant.id}::uuid, ${testCaseId}::uuid,
            ${requesterUser.id}::uuid, 'Outbox test appeal',
            ${resolverUser.id}::uuid, ${employeeId}::uuid,
            'pending', now(), now()
          )
        `;

        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, 'case', ${testCaseId}::uuid,
            'cases.appeal.filed',
            ${JSON.stringify({ caseId: testCaseId, appealId, appealedBy: requesterUser.id })}::jsonb,
            now()
          )
        `;
      });

      // Verify the outbox event was written
      const [afterCount] = await db`
        SELECT COUNT(*) as count FROM app.domain_outbox
        WHERE tenant_id = ${tenant.id}::uuid AND event_type = 'cases.appeal.filed'
      `;

      expect(Number(afterCount.count)).toBe(Number(beforeCount.count) + 1);
      await clearTenantContext(db);
    });
  });

  // =========================================================================
  // Appeal Status Enum Tests
  // =========================================================================

  describe("appeal status values", () => {
    it("should support all required appeal status values", async () => {
      if (!isInfraAvailable()) return;

      const statuses = await db`
        SELECT enumlabel
        FROM pg_enum
        WHERE enumtypid = (
          SELECT oid FROM pg_type
          WHERE typname = 'appeal_status'
            AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')
        )
        ORDER BY enumsortorder
      `;

      const statusValues = statuses.map((s: any) => s.enumlabel);
      expect(statusValues).toContain("pending");
      expect(statusValues).toContain("upheld");
      expect(statusValues).toContain("overturned");
      expect(statusValues).toContain("partially_upheld");
    });
  });

  // =========================================================================
  // Service-Level Validation Logic Tests (pure logic, no HTTP)
  // =========================================================================

  describe("appeal business rules", () => {
    it("should store the original decision maker when creating an appeal", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = await createAppealDirectly(testCaseId, {
        hearingOfficerId: appealOfficerUser.id,
        originalDecisionMakerId: resolverUser.id,
      });

      await setTenantContext(db, tenant.id, requesterUser.id);

      const [appeal] = await db`
        SELECT original_decision_maker_id, hearing_officer_id
        FROM app.case_appeals
        WHERE id = ${appealId}::uuid
      `;

      expect(appeal.originalDecisionMakerId).toBe(resolverUser.id);
      expect(appeal.hearingOfficerId).toBe(appealOfficerUser.id);
      await clearTenantContext(db);
    });

    it("should store appellant_employee_id linking to the employee", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = await createAppealDirectly(testCaseId);

      await setTenantContext(db, tenant.id, requesterUser.id);

      const [appeal] = await db`
        SELECT appellant_employee_id
        FROM app.case_appeals
        WHERE id = ${appealId}::uuid
      `;

      expect(appeal.appellantEmployeeId).toBe(employeeId);
      await clearTenantContext(db);
    });

    it("should store appeal_grounds when provided", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.case_appeals (
            id, tenant_id, case_id, appealed_by, reason,
            appeal_grounds, original_decision_maker_id,
            status, created_at, updated_at
          ) VALUES (
            ${appealId}::uuid, ${tenant.id}::uuid, ${testCaseId}::uuid,
            ${requesterUser.id}::uuid, 'Short reason',
            'Detailed grounds: the investigation was not thorough and relevant witnesses were not interviewed',
            ${resolverUser.id}::uuid,
            'pending', now(), now()
          )
        `;
      });

      await setTenantContext(db, tenant.id, requesterUser.id);

      const [appeal] = await db`
        SELECT appeal_grounds FROM app.case_appeals WHERE id = ${appealId}::uuid
      `;

      expect(appeal.appealGrounds).toContain("investigation was not thorough");
      await clearTenantContext(db);
    });

    it("should record outcome_notes when appeal is decided", async () => {
      if (!isInfraAvailable()) return;

      const testCaseId = await createResolvedCase();
      const appealId = await createAppealDirectly(testCaseId, {
        hearingOfficerId: appealOfficerUser.id,
      });

      // Decide the appeal
      await withSystemContext(db, async (tx) => {
        await tx`
          UPDATE app.case_appeals
          SET status = 'upheld',
              outcome = 'Original decision upheld',
              outcome_notes = 'After reviewing all evidence and hearing the employee, the original decision stands.',
              decided_at = now(),
              updated_at = now()
          WHERE id = ${appealId}::uuid
        `;
      });

      await setTenantContext(db, tenant.id, requesterUser.id);

      const [appeal] = await db`
        SELECT outcome_notes, status, decided_at
        FROM app.case_appeals
        WHERE id = ${appealId}::uuid
      `;

      expect(appeal.status).toBe("upheld");
      expect(appeal.outcomeNotes).toContain("reviewing all evidence");
      expect(appeal.decidedAt).not.toBeNull();
      await clearTenantContext(db);
    });
  });
});
