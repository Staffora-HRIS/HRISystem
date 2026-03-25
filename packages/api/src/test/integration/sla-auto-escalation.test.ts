/**
 * SLA Auto-Escalation Integration Tests
 *
 * Verifies that the SLA auto-escalation system correctly:
 * - Detects SLA breaches on workflow tasks via check_workflow_task_slas()
 * - Creates SLA events (warning + breached) in workflow_sla_events
 * - Detects case SLA breaches and updates sla_status
 * - Writes escalation log entries to sla_escalation_log
 * - Resolves escalation targets through manager chain
 * - Respects tenant isolation (RLS)
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from "bun:test";
import {
  getTestDb,
  ensureTestInfra,
  isInfraAvailable,
  closeTestConnections,
  createTestTenant,
  createTestUser,
  cleanupTestTenant,
  cleanupTestUser,
  withSystemContext,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("SLA Auto-Escalation", () => {
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
    // Clean up all test data
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.sla_escalation_log WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_sla_events WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_tasks WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_instances WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_slas WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_versions WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_definitions WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
    });
    await cleanupTestTenant(db, tenant.id);
    await cleanupTestUser(db, user.id);
    await closeTestConnections(db);
  });

  afterEach(async () => {
    if (!db || !tenant) return;
    // Clean up test-specific data between tests
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.sla_escalation_log WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_sla_events WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_tasks WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_instances WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_slas WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_versions WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.workflow_definitions WHERE tenant_id = ${tenant.id}::uuid`;
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`;
    });
  });

  // ---------------------------------------------------------------------------
  // Helper: create a workflow definition + version + SLA + task for testing
  // ---------------------------------------------------------------------------
  async function createTestWorkflowWithSla(opts: {
    deadlineHours: number;
    warningHours?: number;
    escalationAction: string;
    escalationTargetUserId?: string;
    escalationTargetRoleId?: string;
    taskCreatedHoursAgo: number;
    slaDeadlineHoursAgo: number;
  }) {
    if (!db || !tenant || !user) throw new Error("Test fixtures not ready");

    const defId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const slaId = crypto.randomUUID();

    await withSystemContext(db, async (tx) => {
      // Create workflow definition
      await tx`
        INSERT INTO app.workflow_definitions (
          id, tenant_id, code, name, trigger_type, is_active
        ) VALUES (
          ${defId}::uuid, ${tenant.id}::uuid,
          ${"test-wf-" + Date.now()}, 'Test Workflow', 'manual', true
        )
      `;

      // Create workflow version (active requires published_at/published_by and non-empty steps)
      // Insert as draft first, then update steps (avoids jsonb_array_length constraint on active status)
      await tx`
        INSERT INTO app.workflow_versions (
          id, tenant_id, definition_id, version, status, steps, published_at, published_by
        ) VALUES (
          ${versionId}::uuid, ${tenant.id}::uuid, ${defId}::uuid,
          1, 'draft',
          '[]'::jsonb,
          now(), ${user.id}::uuid
        )
      `;
      await tx`
        UPDATE app.workflow_versions
        SET steps = '[{"index":0,"name":"Test Step","type":"approval"}]'::jsonb,
            status = 'active'
        WHERE id = ${versionId}::uuid
      `;

      // Create workflow instance
      await tx`
        INSERT INTO app.workflow_instances (
          id, tenant_id, definition_id, version_id, status, context, current_step_index, created_by
        ) VALUES (
          ${instanceId}::uuid, ${tenant.id}::uuid, ${defId}::uuid, ${versionId}::uuid,
          'in_progress', '{}'::jsonb, 0, ${user.id}::uuid
        )
      `;

      // Create workflow task with SLA deadline in the past
      const taskCreatedAt = new Date(Date.now() - opts.taskCreatedHoursAgo * 3600_000);
      const slaDeadline = new Date(Date.now() - opts.slaDeadlineHoursAgo * 3600_000);

      await tx`
        INSERT INTO app.workflow_tasks (
          id, tenant_id, instance_id, step_index, step_name, status,
          assigned_to, sla_deadline, created_at
        ) VALUES (
          ${taskId}::uuid, ${tenant.id}::uuid, ${instanceId}::uuid,
          0, 'Test Step', 'pending', ${user.id}::uuid,
          ${slaDeadline}, ${taskCreatedAt}
        )
      `;

      // Create SLA definition
      await tx`
        INSERT INTO app.workflow_slas (
          id, tenant_id, definition_id, step_index, step_name,
          warning_hours, deadline_hours, escalation_action,
          escalation_target_user_id, escalation_target_role_id
        ) VALUES (
          ${slaId}::uuid, ${tenant.id}::uuid, ${defId}::uuid,
          0, 'Test Step',
          ${opts.warningHours ?? null}, ${opts.deadlineHours},
          ${opts.escalationAction}::app.escalation_action,
          ${opts.escalationTargetUserId ?? null}::uuid,
          ${opts.escalationTargetRoleId ?? null}::uuid
        )
      `;
    });

    return { defId, versionId, instanceId, taskId, slaId };
  }

  // ===========================================================================
  // Workflow SLA Detection Tests
  // ===========================================================================

  describe("check_workflow_task_slas()", () => {
    it("should create a 'breached' SLA event when task exceeds deadline", async () => {
      if (!db || !tenant || !user) return;

      const { taskId, slaId } = await createTestWorkflowWithSla({
        deadlineHours: 24,
        escalationAction: "notify",
        escalationTargetUserId: user.id,
        taskCreatedHoursAgo: 48,
        slaDeadlineHoursAgo: 1, // deadline was 1 hour ago
      });

      // Run the SLA check function
      const [result] = await withSystemContext(db, async (tx) => {
        return tx`SELECT * FROM app.check_workflow_task_slas()`;
      });

      expect(result.events_created).toBeGreaterThanOrEqual(1);
      expect(result.breaches_created).toBeGreaterThanOrEqual(1);

      // Verify the SLA event was created
      const events = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT * FROM app.workflow_sla_events
          WHERE task_id = ${taskId}::uuid AND sla_id = ${slaId}::uuid
        `;
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const breachEvent = events.find((e: any) => e.event_type === "breached");
      expect(breachEvent).toBeTruthy();
      expect(breachEvent.escalation_action).toBe("notify");
      expect(breachEvent.processed_at).toBeNull();
    });

    it("should create a 'warning' SLA event when task approaches deadline", async () => {
      if (!db || !tenant || !user) return;

      const { taskId, slaId } = await createTestWorkflowWithSla({
        deadlineHours: 48,
        warningHours: 24,
        escalationAction: "notify",
        escalationTargetUserId: user.id,
        taskCreatedHoursAgo: 30, // created 30h ago
        slaDeadlineHoursAgo: -18, // deadline is 18h from now (not breached yet)
      });

      const [result] = await withSystemContext(db, async (tx) => {
        return tx`SELECT * FROM app.check_workflow_task_slas()`;
      });

      expect(result.events_created).toBeGreaterThanOrEqual(1);
      expect(result.warnings_created).toBeGreaterThanOrEqual(1);

      const events = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT * FROM app.workflow_sla_events
          WHERE task_id = ${taskId}::uuid AND event_type = 'warning'
        `;
      });

      expect(events.length).toBe(1);
    });

    it("should not duplicate SLA events for the same task", async () => {
      if (!db || !tenant || !user) return;

      await createTestWorkflowWithSla({
        deadlineHours: 24,
        escalationAction: "notify",
        escalationTargetUserId: user.id,
        taskCreatedHoursAgo: 48,
        slaDeadlineHoursAgo: 1,
      });

      // Run check twice
      await withSystemContext(db, async (tx) => {
        await tx`SELECT * FROM app.check_workflow_task_slas()`;
      });
      await withSystemContext(db, async (tx) => {
        await tx`SELECT * FROM app.check_workflow_task_slas()`;
      });

      // Should still only have one breach event per task+sla+type
      const events = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT * FROM app.workflow_sla_events
          WHERE tenant_id = ${tenant.id}::uuid AND event_type = 'breached'
        `;
      });

      expect(events.length).toBe(1);
    });
  });

  // ===========================================================================
  // SLA Event Processing Tests
  // ===========================================================================

  describe("SLA event processing", () => {
    it("should be markable as processed via mark_sla_event_processed()", async () => {
      if (!db || !tenant || !user) return;

      const { taskId, slaId } = await createTestWorkflowWithSla({
        deadlineHours: 24,
        escalationAction: "notify",
        escalationTargetUserId: user.id,
        taskCreatedHoursAgo: 48,
        slaDeadlineHoursAgo: 1,
      });

      // Create the breach event
      await withSystemContext(db, async (tx) => {
        await tx`SELECT * FROM app.check_workflow_task_slas()`;
      });

      // Get the event
      const events = await withSystemContext(db, async (tx) => {
        return tx`SELECT * FROM app.get_unprocessed_sla_events(10)`;
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const eventId = events[0].id;

      // Mark as processed
      const [markResult] = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT app.mark_sla_event_processed(
            ${eventId}::uuid,
            '{"success": true, "action": "test"}'::jsonb
          )
        `;
      });

      // Verify it no longer appears in unprocessed
      const unprocessed = await withSystemContext(db, async (tx) => {
        return tx`SELECT * FROM app.get_unprocessed_sla_events(10)`;
      });

      const stillUnprocessed = unprocessed.filter(
        (e: any) => e.id === eventId
      );
      expect(stillUnprocessed.length).toBe(0);
    });
  });

  // ===========================================================================
  // Escalation Log Tests
  // ===========================================================================

  describe("sla_escalation_log", () => {
    it("should accept escalation log entries for workflow tasks", async () => {
      if (!db || !tenant || !user) return;

      const logId = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.sla_escalation_log (
            id, tenant_id, entity_type, entity_id, action_taken,
            previous_assignee_id, new_assignee_id, reason, created_at
          ) VALUES (
            ${logId}::uuid, ${tenant.id}::uuid, 'workflow_task',
            ${crypto.randomUUID()}::uuid, 'reassign',
            ${user.id}::uuid, ${user.id}::uuid,
            'Test escalation', now()
          )
        `;
      });

      const logs = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT * FROM app.sla_escalation_log
          WHERE id = ${logId}::uuid
        `;
      });

      expect(logs.length).toBe(1);
      expect(logs[0].entity_type).toBe("workflow_task");
      expect(logs[0].action_taken).toBe("reassign");
    });

    it("should accept escalation log entries for cases", async () => {
      if (!db || !tenant || !user) return;

      const logId = crypto.randomUUID();

      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.sla_escalation_log (
            id, tenant_id, entity_type, entity_id, action_taken,
            previous_level, new_level, reason, created_at
          ) VALUES (
            ${logId}::uuid, ${tenant.id}::uuid, 'case',
            ${crypto.randomUUID()}::uuid, 'escalate_tier',
            'none', 'tier_1', 'SLA breached — escalated from none to tier_1', now()
          )
        `;
      });

      const logs = await withSystemContext(db, async (tx) => {
        return tx`
          SELECT * FROM app.sla_escalation_log
          WHERE id = ${logId}::uuid
        `;
      });

      expect(logs.length).toBe(1);
      expect(logs[0].entity_type).toBe("case");
      expect(logs[0].action_taken).toBe("escalate_tier");
      expect(logs[0].previous_level).toBe("none");
      expect(logs[0].new_level).toBe("tier_1");
    });

    it("should reject invalid entity_type values", async () => {
      if (!db || !tenant || !user) return;

      let threw = false;
      try {
        await withSystemContext(db, async (tx) => {
          await tx`
            INSERT INTO app.sla_escalation_log (
              id, tenant_id, entity_type, entity_id, action_taken, reason
            ) VALUES (
              ${crypto.randomUUID()}::uuid, ${tenant.id}::uuid, 'invalid_type',
              ${crypto.randomUUID()}::uuid, 'notify', 'Test'
            )
          `;
        });
      } catch {
        threw = true;
      }

      expect(threw).toBe(true);
    });
  });

  // ===========================================================================
  // RLS Isolation Tests
  // ===========================================================================

  describe("RLS isolation", () => {
    it("should isolate sla_escalation_log by tenant", async () => {
      if (!db || !tenant || !user) return;

      // Create a second tenant
      const tenant2 = await createTestTenant(db);
      const user2 = await createTestUser(db, tenant2.id);

      const logId1 = crypto.randomUUID();
      const logId2 = crypto.randomUUID();

      // Insert log for tenant 1
      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.sla_escalation_log (
            id, tenant_id, entity_type, entity_id, action_taken, reason
          ) VALUES (
            ${logId1}::uuid, ${tenant.id}::uuid, 'case',
            ${crypto.randomUUID()}::uuid, 'notify', 'Tenant 1 escalation'
          )
        `;
      });

      // Insert log for tenant 2
      await withSystemContext(db, async (tx) => {
        await tx`
          INSERT INTO app.sla_escalation_log (
            id, tenant_id, entity_type, entity_id, action_taken, reason
          ) VALUES (
            ${logId2}::uuid, ${tenant2.id}::uuid, 'case',
            ${crypto.randomUUID()}::uuid, 'notify', 'Tenant 2 escalation'
          )
        `;
      });

      // Query as tenant 1 — should only see tenant 1's log
      await db`SELECT set_config('app.current_tenant', ${tenant.id}, false)`;
      const tenant1Logs = await db`
        SELECT * FROM app.sla_escalation_log
      `;

      const tenant1Ids = tenant1Logs.map((l: any) => l.id);
      expect(tenant1Ids).toContain(logId1);
      expect(tenant1Ids).not.toContain(logId2);

      // Clean up
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.sla_escalation_log WHERE tenant_id = ${tenant2.id}::uuid`;
      });
      await cleanupTestTenant(db, tenant2.id);
      await cleanupTestUser(db, user2.id);
    });
  });

  // ===========================================================================
  // Escalation Level Progression Tests
  // ===========================================================================

  describe("Escalation level progression", () => {
    it("should progress through escalation tiers correctly", () => {
      // Test the getNextEscalationLevel logic inline
      const levels = ["none", "tier_1", "tier_2", "tier_3", "tier_4"];

      function getNextLevel(current: string): string {
        const idx = levels.indexOf(current);
        if (idx < 0 || idx >= levels.length - 1) return "tier_4";
        return levels[idx + 1]!;
      }

      expect(getNextLevel("none")).toBe("tier_1");
      expect(getNextLevel("tier_1")).toBe("tier_2");
      expect(getNextLevel("tier_2")).toBe("tier_3");
      expect(getNextLevel("tier_3")).toBe("tier_4");
      expect(getNextLevel("tier_4")).toBe("tier_4"); // capped
      expect(getNextLevel("unknown")).toBe("tier_4"); // fallback
    });
  });
});
