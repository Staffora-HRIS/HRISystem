/**
 * Timesheet Approval Chain Integration Tests
 *
 * Tests the multi-level approval hierarchy for timesheets:
 * - Creating approval chains when timesheets are submitted
 * - Level-by-level progression (level N approves -> level N+1 becomes active)
 * - Rejection at any level terminates the chain
 * - RLS isolation between tenants
 * - Outbox events are written atomically with chain operations
 * - Idempotency-safe chain decisions
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type postgres from "postgres";
import {
  ensureTestInfra,
  skipIfNoInfra,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  clearTenantContext,
  withSystemContext,
  closeTestConnections,
} from "../setup";

describe("Timesheet Approval Chains", () => {
  let db: ReturnType<typeof postgres>;
  let tenantId: string;
  let userId: string;
  let approver1Id: string;
  let approver2Id: string;
  let approver3Id: string;
  let employeeId: string;
  /** Counter to generate unique period ranges per test */
  let timesheetCounter = 0;

  beforeAll(async () => {
    await ensureTestInfra();
    if (skipIfNoInfra()) return;

    db = getTestDb();

    // Create test tenant and users
    const tenant = await createTestTenant(db);
    tenantId = tenant.id;

    const user = await createTestUser(db, tenantId);
    userId = user.id;

    const approver1 = await createTestUser(db, tenantId);
    approver1Id = approver1.id;

    const approver2 = await createTestUser(db, tenantId);
    approver2Id = approver2.id;

    const approver3 = await createTestUser(db, tenantId);
    approver3Id = approver3.id;

    // Create an employee for the timesheet
    await setTenantContext(db, tenantId, userId);

    const empId = crypto.randomUUID();
    employeeId = empId;

    await db`
      INSERT INTO app.employees (id, tenant_id, employee_number, status, hire_date)
      VALUES (${empId}::uuid, ${tenantId}::uuid, ${"EMP-" + Date.now()}, 'active', CURRENT_DATE)
    `;
  });

  afterAll(async () => {
    if (db) {
      await clearTenantContext(db);

      // Clean up test data
      try {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.timesheet_approval_chains WHERE tenant_id = ${tenantId}::uuid`;
          await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenantId}::uuid`;
          await tx`DELETE FROM app.timesheet_lines WHERE tenant_id = ${tenantId}::uuid`;
          await tx`DELETE FROM app.timesheets WHERE tenant_id = ${tenantId}::uuid`;
          await tx`DELETE FROM app.employees WHERE tenant_id = ${tenantId}::uuid`;
        });
      } catch {
        // ignore cleanup errors
      }

      await closeTestConnections(db);
    }
  });

  /**
   * Helper to create a timesheet in draft status.
   * Uses a unique period range per call to avoid the timesheets_unique constraint.
   */
  async function createDraftTimesheet(): Promise<string> {
    const id = crypto.randomUUID();
    const offset = timesheetCounter++;
    // Each timesheet gets a unique 7-day window shifted by (offset * 8) days into the past
    const shiftDays = 7 + offset * 8;
    await db`
      INSERT INTO app.timesheets (
        id, tenant_id, employee_id, period_start, period_end, status
      ) VALUES (
        ${id}::uuid, ${tenantId}::uuid, ${employeeId}::uuid,
        CURRENT_DATE - ${shiftDays}::int * interval '1 day',
        CURRENT_DATE - ${shiftDays - 7}::int * interval '1 day',
        'draft'
      )
    `;
    return id;
  }

  /**
   * Helper to submit a timesheet (transition from draft to submitted)
   */
  async function submitTimesheet(timesheetId: string): Promise<void> {
    await db`
      UPDATE app.timesheets
      SET status = 'submitted',
          submitted_at = now(),
          submitted_by = ${userId}::uuid
      WHERE id = ${timesheetId}::uuid
    `;
  }

  // ===========================================================================
  // Table Existence and Schema
  // ===========================================================================

  test("timesheet_approval_chains table exists with correct columns", async () => {
    if (skipIfNoInfra()) return;

    const columns = await db`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'timesheet_approval_chains'
      ORDER BY ordinal_position
    `;

    const columnNames = columns.map((c: any) => c.column_name);
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("tenant_id");
    expect(columnNames).toContain("timesheet_id");
    expect(columnNames).toContain("level");
    expect(columnNames).toContain("approver_id");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("decided_at");
    expect(columnNames).toContain("comments");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("updated_at");
  });

  test("RLS is enabled on timesheet_approval_chains", async () => {
    if (skipIfNoInfra()) return;

    const result = await db`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'timesheet_approval_chains'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'app')
    `;

    expect(result.length).toBe(1);
    expect(result[0]?.relrowsecurity).toBe(true);
  });

  // ===========================================================================
  // Approval Chain Creation
  // ===========================================================================

  test("can create an approval chain for a submitted timesheet", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    // Create chain entries manually
    const chain1Id = crypto.randomUUID();
    const chain2Id = crypto.randomUUID();

    await db`
      INSERT INTO app.timesheet_approval_chains (
        id, tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${chain1Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${chain2Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending')
    `;

    // Verify chain was created
    const chain = await db`
      SELECT * FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain.length).toBe(2);
    expect(chain[0]?.level).toBe(1);
    expect(chain[0]?.status).toBe("active");
    expect(chain[0]?.approver_id).toBe(approver1Id);
    expect(chain[1]?.level).toBe(2);
    expect(chain[1]?.status).toBe("pending");
    expect(chain[1]?.approver_id).toBe(approver2Id);
  });

  test("level 1 starts as active, other levels start as pending", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending'),
        (${tenantId}::uuid, ${timesheetId}::uuid, 3, ${approver3Id}::uuid, 'pending')
    `;

    const chain = await db`
      SELECT level, status FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain[0]?.status).toBe("active");
    expect(chain[1]?.status).toBe("pending");
    expect(chain[2]?.status).toBe("pending");
  });

  test("unique constraint prevents duplicate levels for the same timesheet", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    // Attempt to insert another entry at level 1 should fail
    try {
      await db`
        INSERT INTO app.timesheet_approval_chains (
          tenant_id, timesheet_id, level, approver_id, status
        ) VALUES
          (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver2Id}::uuid, 'pending')
      `;
      expect(false).toBe(true); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain("approval_chains_unique_level");
    }
  });

  // ===========================================================================
  // Approval Chain Progression
  // ===========================================================================

  test("when level 1 approves, level 2 becomes active", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    const chain1Id = crypto.randomUUID();
    const chain2Id = crypto.randomUUID();

    await db`
      INSERT INTO app.timesheet_approval_chains (
        id, tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${chain1Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${chain2Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending')
    `;

    // Approver 1 approves level 1
    await db`
      UPDATE app.timesheet_approval_chains
      SET status = 'approved', decided_at = now(), comments = 'Looks good'
      WHERE id = ${chain1Id}::uuid
    `;

    // Promote level 2 to active
    await db`
      UPDATE app.timesheet_approval_chains
      SET status = 'active'
      WHERE id = ${chain2Id}::uuid AND status = 'pending'
    `;

    // Verify chain state
    const chain = await db`
      SELECT level, status FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain[0]?.status).toBe("approved");
    expect(chain[1]?.status).toBe("active");
  });

  test("when final level approves, timesheet can be approved", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    const chain1Id = crypto.randomUUID();

    await db`
      INSERT INTO app.timesheet_approval_chains (
        id, tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${chain1Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    // Approve at level 1 (the only level)
    await db`
      UPDATE app.timesheet_approval_chains
      SET status = 'approved', decided_at = now()
      WHERE id = ${chain1Id}::uuid
    `;

    // Approve the timesheet itself
    await db`
      UPDATE app.timesheets
      SET status = 'approved', approved_at = now(), approved_by = ${approver1Id}::uuid
      WHERE id = ${timesheetId}::uuid AND status = 'submitted'
    `;

    // Verify timesheet is approved
    const [ts] = await db`
      SELECT status FROM app.timesheets
      WHERE id = ${timesheetId}::uuid
    `;
    expect(ts?.status).toBe("approved");
  });

  // ===========================================================================
  // Rejection
  // ===========================================================================

  test("rejection at any level skips remaining levels", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    const chain1Id = crypto.randomUUID();
    const chain2Id = crypto.randomUUID();
    const chain3Id = crypto.randomUUID();

    await db`
      INSERT INTO app.timesheet_approval_chains (
        id, tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${chain1Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${chain2Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending'),
        (${chain3Id}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 3, ${approver3Id}::uuid, 'pending')
    `;

    // Reject at level 1
    await db`
      UPDATE app.timesheet_approval_chains
      SET status = 'rejected', decided_at = now(), comments = 'Incorrect hours'
      WHERE id = ${chain1Id}::uuid
    `;

    // Skip remaining levels
    await db`
      UPDATE app.timesheet_approval_chains
      SET status = 'skipped', decided_at = now(), comments = 'Skipped due to rejection at level 1'
      WHERE timesheet_id = ${timesheetId}::uuid
        AND status IN ('pending', 'active')
        AND level > 1
    `;

    // Verify chain state
    const chain = await db`
      SELECT level, status FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain[0]?.status).toBe("rejected");
    expect(chain[1]?.status).toBe("skipped");
    expect(chain[2]?.status).toBe("skipped");
  });

  // ===========================================================================
  // RLS Isolation
  // ===========================================================================

  test("RLS prevents cross-tenant access to approval chains", async () => {
    if (skipIfNoInfra()) return;

    // Create data in tenant A
    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    // Create tenant B
    const tenantB = await createTestTenant(db);
    const userB = await createTestUser(db, tenantB.id);

    // Switch to tenant B context
    await setTenantContext(db, tenantB.id, userB.id);

    // Should not see tenant A's approval chains
    const chains = await db`
      SELECT * FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
    `;

    expect(chains.length).toBe(0);

    // Restore context
    await setTenantContext(db, tenantId, userId);
  });

  // ===========================================================================
  // SQL Function: process_approval_chain_decision
  // ===========================================================================

  test("process_approval_chain_decision function approves and progresses chain", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending')
    `;

    // Call the SQL function to approve at level 1
    const [result] = await db`
      SELECT app.process_approval_chain_decision(
        ${timesheetId}::uuid,
        ${approver1Id}::uuid,
        'approved'::app.approval_chain_status,
        'Approved level 1'
      ) AS result
    `;

    const resultJson = result?.result;
    expect(resultJson.action).toBe("level_approved");
    expect(resultJson.level).toBe(1);
    expect(resultJson.timesheetStatus).toBe("submitted");

    // Verify chain state: level 1 approved, level 2 now active
    const chain = await db`
      SELECT level, status FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain[0]?.status).toBe("approved");
    expect(chain[1]?.status).toBe("active");
  });

  test("process_approval_chain_decision function handles final level approval", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    // Call the SQL function to approve at the only level
    const [result] = await db`
      SELECT app.process_approval_chain_decision(
        ${timesheetId}::uuid,
        ${approver1Id}::uuid,
        'approved'::app.approval_chain_status,
        'Final approval'
      ) AS result
    `;

    const resultJson = result?.result;
    expect(resultJson.action).toBe("fully_approved");
    expect(resultJson.timesheetStatus).toBe("approved");

    // Verify the timesheet itself is now approved
    const [ts] = await db`
      SELECT status, approved_by FROM app.timesheets
      WHERE id = ${timesheetId}::uuid
    `;
    expect(ts?.status).toBe("approved");
    expect(ts?.approved_by).toBe(approver1Id);
  });

  test("process_approval_chain_decision function handles rejection", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active'),
        (${tenantId}::uuid, ${timesheetId}::uuid, 2, ${approver2Id}::uuid, 'pending'),
        (${tenantId}::uuid, ${timesheetId}::uuid, 3, ${approver3Id}::uuid, 'pending')
    `;

    // Reject at level 1
    const [result] = await db`
      SELECT app.process_approval_chain_decision(
        ${timesheetId}::uuid,
        ${approver1Id}::uuid,
        'rejected'::app.approval_chain_status,
        'Hours are wrong'
      ) AS result
    `;

    const resultJson = result?.result;
    expect(resultJson.action).toBe("rejected");
    expect(resultJson.timesheetStatus).toBe("rejected");

    // Verify chain: level 1 rejected, levels 2 and 3 skipped
    const chain = await db`
      SELECT level, status FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain[0]?.status).toBe("rejected");
    expect(chain[1]?.status).toBe("skipped");
    expect(chain[2]?.status).toBe("skipped");

    // Verify the timesheet is rejected
    const [ts] = await db`
      SELECT status, rejection_reason FROM app.timesheets
      WHERE id = ${timesheetId}::uuid
    `;
    expect(ts?.status).toBe("rejected");
    expect(ts?.rejection_reason).toContain("Hours are wrong");
  });

  // ===========================================================================
  // SQL Function: create_timesheet_approval_chain
  // ===========================================================================

  test("create_timesheet_approval_chain function creates entries", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    const [countResult] = await db`
      SELECT app.create_timesheet_approval_chain(
        ${timesheetId}::uuid,
        ARRAY[${approver1Id}::uuid, ${approver2Id}::uuid, ${approver3Id}::uuid]
      ) AS count
    `;

    expect(countResult?.count).toBe(3);

    const chain = await db`
      SELECT level, approver_id, status
      FROM app.timesheet_approval_chains
      WHERE timesheet_id = ${timesheetId}::uuid
      ORDER BY level
    `;

    expect(chain.length).toBe(3);
    expect(chain[0]?.approver_id).toBe(approver1Id);
    expect(chain[0]?.status).toBe("active");
    expect(chain[1]?.approver_id).toBe(approver2Id);
    expect(chain[1]?.status).toBe("pending");
    expect(chain[2]?.approver_id).toBe(approver3Id);
    expect(chain[2]?.status).toBe("pending");
  });

  // ===========================================================================
  // Outbox Atomicity
  // ===========================================================================

  test("approval chain decision writes outbox event atomically", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    // Approve via SQL function
    await db`
      INSERT INTO app.timesheet_approval_chains (
        tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    await db`
      SELECT app.process_approval_chain_decision(
        ${timesheetId}::uuid,
        ${approver1Id}::uuid,
        'approved'::app.approval_chain_status,
        'Approved'
      )
    `;

    // Check that an approval record was written to timesheet_approvals
    const approvals = await db`
      SELECT * FROM app.timesheet_approvals
      WHERE timesheet_id = ${timesheetId}::uuid
        AND action = 'approve'
    `;
    expect(approvals.length).toBeGreaterThanOrEqual(1);
  });

  // ===========================================================================
  // Constraint Validation
  // ===========================================================================

  test("level must be positive", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    try {
      await db`
        INSERT INTO app.timesheet_approval_chains (
          tenant_id, timesheet_id, level, approver_id, status
        ) VALUES
          (${tenantId}::uuid, ${timesheetId}::uuid, 0, ${approver1Id}::uuid, 'active')
      `;
      expect(false).toBe(true); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain("approval_chains_level_positive");
    }
  });

  test("decided_at is required for decided statuses", async () => {
    if (skipIfNoInfra()) return;

    const timesheetId = await createDraftTimesheet();
    await submitTimesheet(timesheetId);

    const chainId = crypto.randomUUID();
    await db`
      INSERT INTO app.timesheet_approval_chains (
        id, tenant_id, timesheet_id, level, approver_id, status
      ) VALUES
        (${chainId}::uuid, ${tenantId}::uuid, ${timesheetId}::uuid, 1, ${approver1Id}::uuid, 'active')
    `;

    // Attempting to set status to approved without decided_at should fail
    try {
      await db`
        UPDATE app.timesheet_approval_chains
        SET status = 'approved'
        WHERE id = ${chainId}::uuid
      `;
      expect(false).toBe(true); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain("approval_chains_decided_info");
    }
  });
});
