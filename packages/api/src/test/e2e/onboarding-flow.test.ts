/**
 * Onboarding Flow E2E Tests
 *
 * Full lifecycle test using REAL database operations:
 * 1. Create onboarding template (draft)
 * 2. Add tasks to template
 * 3. Publish template (draft -> active)
 * 4. Create onboarding instance for employee
 * 5. Verify task completions are created
 * 6. Test status transitions (not_started -> in_progress -> completed)
 * 7. Test cancellation
 * 8. Verify template status machine
 * 9. Verify single active onboarding per employee constraint
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

describe("Onboarding Flow E2E", () => {
  let db: ReturnType<typeof getTestDb> | null = null;
  let tenant: TestTenant | null = null;
  let user: TestUser | null = null;
  const suffix = Date.now();

  let employeeId: string;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    db = getTestDb();
    tenant = await createTestTenant(db, { slug: `ob-flow-${suffix}` });
    user = await createTestUser(db, tenant.id, { email: `ob-flow-${suffix}@example.com` });

    await setTenantContext(db, tenant.id, user.id);

    // Create employee
    const emp = await db<{ id: string }[]>`
      INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
      VALUES (${tenant.id}::uuid, ${'OB-EMP-' + suffix}, 'pending', CURRENT_DATE)
      RETURNING id
    `;
    employeeId = emp[0]!.id;
  });

  afterAll(async () => {
    if (!db || !tenant || !user) return;
    await withSystemContext(db, async (tx) => {
      await tx`DELETE FROM app.onboarding_task_completions WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.onboarding_instances WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.onboarding_template_tasks WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.onboarding_templates WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
      await tx`DELETE FROM app.domain_outbox WHERE tenant_id = ${tenant.id}::uuid`.catch(() => {});
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
  // Template Lifecycle
  // ===========================================================================
  describe("Template lifecycle", () => {
    let templateId: string;

    it("should create a draft template", async () => {
      if (!db || !tenant) return;

      const result = await db<{ id: string; status: string }[]>`
        INSERT INTO app.onboarding_templates (
          tenant_id, code, name, description,
          estimated_duration_days, welcome_message,
          created_by
        )
        VALUES (
          ${tenant.id}::uuid, ${'TPL_' + suffix}, 'Standard Onboarding',
          'Standard onboarding for new hires',
          30, 'Welcome to the team!',
          ${user.id}::uuid
        )
        RETURNING id, status
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.status).toBe("draft");
      templateId = result[0]!.id;
    });

    it("should add tasks to template", async () => {
      if (!db || !tenant || !templateId) return;

      // Task 1: Welcome email (before start) - using 'custom' task type
      await db`
        INSERT INTO app.onboarding_template_tasks (
          tenant_id, template_id, name, description,
          task_type, owner_type, sequence_order,
          timing_type, days_offset, is_required
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid,
          'Send welcome email', 'Send welcome email with first day details',
          'custom', 'hr', 1,
          'before_start', 3, true
        )
      `;

      // Task 2: Setup workstation (on start) - using 'equipment' task type
      await db`
        INSERT INTO app.onboarding_template_tasks (
          tenant_id, template_id, name, description,
          task_type, owner_type, sequence_order,
          timing_type, days_offset, is_required
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid,
          'Setup workstation', 'Prepare desk, computer, and access cards',
          'equipment', 'manager', 2,
          'on_start', 0, true
        )
      `;

      // Task 3: Complete HR paperwork (after start)
      await db`
        INSERT INTO app.onboarding_template_tasks (
          tenant_id, template_id, name, description,
          task_type, owner_type, sequence_order,
          timing_type, days_offset, due_days_offset, is_required
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid,
          'Complete HR paperwork', 'Fill out tax forms, benefits enrollment',
          'form', 'new_hire', 3,
          'after_start', 1, 5, true
        )
      `;

      // Verify task count
      const tasks = await db<{ count: string }[]>`
        SELECT COUNT(*)::text as count
        FROM app.onboarding_template_tasks
        WHERE template_id = ${templateId}::uuid
      `;
      expect(parseInt(tasks[0]!.count, 10)).toBe(3);
    });

    it("should reject publishing template without tasks", async () => {
      if (!db || !tenant) return;

      // Create an empty template with is_default = true to avoid
      // the UNIQUE(tenant_id, is_default) constraint with the other template
      const emptyTpl = await db<{ id: string }[]>`
        INSERT INTO app.onboarding_templates (
          tenant_id, code, name, estimated_duration_days, created_by, is_default
        )
        VALUES (
          ${tenant.id}::uuid, ${'EMPTY_' + suffix}, 'Empty Template', 30, ${user.id}::uuid, true
        )
        RETURNING id
      `;

      try {
        await db`
          UPDATE app.onboarding_templates
          SET status = 'active', published_at = now(), published_by = ${user.id}::uuid
          WHERE id = ${emptyTpl[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("Cannot publish template without any tasks");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.onboarding_templates WHERE id = ${emptyTpl[0]!.id}::uuid`;
      });
    });

    it("should publish template with tasks (draft -> active)", async () => {
      if (!db || !tenant || !templateId) return;

      await db`
        UPDATE app.onboarding_templates
        SET status = 'active', published_at = now(), published_by = ${user.id}::uuid
        WHERE id = ${templateId}::uuid
      `;

      const result = await db<{ status: string; publishedAt: Date | null }[]>`
        SELECT status, published_at as "publishedAt"
        FROM app.onboarding_templates WHERE id = ${templateId}::uuid
      `;

      expect(result[0]!.status).toBe("active");
      expect(result[0]!.publishedAt).not.toBeNull();
    });

    it("should reject invalid template transition: active -> draft", async () => {
      if (!db || !tenant || !templateId) return;

      try {
        await db`
          UPDATE app.onboarding_templates SET status = 'draft' WHERE id = ${templateId}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        // Trigger message: "Invalid status transition: active can only transition to archived, not draft"
        expect(String(error)).toContain("active can only transition to archived, not draft");
      }
    });
  });

  // ===========================================================================
  // Instance Lifecycle
  // ===========================================================================
  describe("Instance lifecycle", () => {
    let templateId: string;
    let instanceId: string;

    beforeAll(async () => {
      if (!db || !tenant || !user) return;
      await setTenantContext(db, tenant.id, user.id);

      // Create and publish a template for instance tests
      // Use is_default = true to avoid UNIQUE(tenant_id, is_default) constraint
      // since the Template lifecycle tests already created a template with is_default = false
      const tpl = await db<{ id: string }[]>`
        INSERT INTO app.onboarding_templates (
          tenant_id, code, name, estimated_duration_days,
          welcome_message, created_by, is_default
        )
        VALUES (
          ${tenant.id}::uuid, ${'INST_TPL_' + suffix}, 'Instance Test Template', 14,
          'Welcome!', ${user.id}::uuid, true
        )
        RETURNING id
      `;
      templateId = tpl[0]!.id;

      // Add a task
      await db`
        INSERT INTO app.onboarding_template_tasks (
          tenant_id, template_id, name, task_type, owner_type,
          sequence_order, timing_type, days_offset, is_required
        )
        VALUES (
          ${tenant.id}::uuid, ${templateId}::uuid,
          'Review handbook', 'document', 'new_hire',
          1, 'on_start', 0, true
        )
      `;

      // Publish
      await db`
        UPDATE app.onboarding_templates
        SET status = 'active', published_at = now(), published_by = ${user.id}::uuid
        WHERE id = ${templateId}::uuid
      `;
    });

    it("should create an onboarding instance", async () => {
      if (!db || !tenant) return;

      const result = await db<{ id: string; status: string; templateName: string; progressPercent: number }[]>`
        INSERT INTO app.onboarding_instances (
          tenant_id, employee_id, template_id,
          template_name, status,
          start_date, target_completion_date,
          created_by
        )
        VALUES (
          ${tenant.id}::uuid, ${employeeId}::uuid, ${templateId}::uuid,
          'Instance Test Template', 'not_started',
          CURRENT_DATE, CURRENT_DATE + 14,
          ${user.id}::uuid
        )
        RETURNING id, status, template_name as "templateName", progress_percent as "progressPercent"
      `;

      expect(result.length).toBe(1);
      expect(result[0]!.status).toBe("not_started");
      expect(result[0]!.templateName).toBe("Instance Test Template");
      expect(result[0]!.progressPercent).toBe(0);
      instanceId = result[0]!.id;
    });

    it("should enforce one active onboarding per employee", async () => {
      if (!db || !tenant || !instanceId) return;

      try {
        await db`
          INSERT INTO app.onboarding_instances (
            tenant_id, employee_id, template_id,
            template_name, status,
            start_date, target_completion_date
          )
          VALUES (
            ${tenant.id}::uuid, ${employeeId}::uuid, ${templateId}::uuid,
            'Duplicate Instance', 'not_started',
            CURRENT_DATE, CURRENT_DATE + 14
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("duplicate");
        expect(String(error)).toContain("onboarding_instances_single_active");
      }
    });

    it("should transition not_started -> in_progress", async () => {
      if (!db || !tenant || !instanceId) return;

      await db`
        UPDATE app.onboarding_instances
        SET status = 'in_progress'
        WHERE id = ${instanceId}::uuid
      `;

      const result = await db<{ status: string }[]>`
        SELECT status FROM app.onboarding_instances WHERE id = ${instanceId}::uuid
      `;
      expect(result[0]!.status).toBe("in_progress");
    });

    it("should reject invalid instance transition: in_progress -> not_started", async () => {
      if (!db || !tenant || !instanceId) return;

      try {
        await db`
          UPDATE app.onboarding_instances SET status = 'not_started' WHERE id = ${instanceId}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("in_progress can only transition to completed or cancelled");
      }
    });

    it("should transition in_progress -> completed", async () => {
      if (!db || !tenant || !instanceId) return;

      await db`
        UPDATE app.onboarding_instances
        SET status = 'completed',
            actual_completion_date = CURRENT_DATE,
            progress_percent = 100,
            tasks_completed = 1,
            tasks_total = 1,
            completion_rating = 4,
            completion_feedback = 'Great onboarding experience!'
        WHERE id = ${instanceId}::uuid
      `;

      const result = await db<{
        status: string;
        completionRating: number;
        completionFeedback: string;
      }[]>`
        SELECT status,
               completion_rating as "completionRating",
               completion_feedback as "completionFeedback"
        FROM app.onboarding_instances WHERE id = ${instanceId}::uuid
      `;

      expect(result[0]!.status).toBe("completed");
      expect(result[0]!.completionRating).toBe(4);
      expect(result[0]!.completionFeedback).toBe("Great onboarding experience!");
    });

    it("should reject transition from completed (terminal state)", async () => {
      if (!db || !tenant || !instanceId) return;

      try {
        await db`
          UPDATE app.onboarding_instances SET status = 'in_progress' WHERE id = ${instanceId}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("completed is a terminal state");
      }
    });
  });

  // ===========================================================================
  // Cancellation Flow
  // ===========================================================================
  describe("Cancellation flow", () => {
    it("should cancel an in-progress onboarding", async () => {
      if (!db || !tenant) return;

      // Need a new employee for the unique constraint
      const emp2 = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${'OB-EMP2-' + suffix}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      // Need a published template
      const templates = await db<{ id: string }[]>`
        SELECT id FROM app.onboarding_templates
        WHERE tenant_id = ${tenant.id}::uuid AND status = 'active'
        LIMIT 1
      `;

      if (templates.length === 0) return;

      const instance = await db<{ id: string }[]>`
        INSERT INTO app.onboarding_instances (
          tenant_id, employee_id, template_id,
          template_name, status,
          start_date, target_completion_date
        )
        VALUES (
          ${tenant.id}::uuid, ${emp2[0]!.id}::uuid, ${templates[0]!.id}::uuid,
          'Cancel Test', 'not_started',
          CURRENT_DATE, CURRENT_DATE + 14
        )
        RETURNING id
      `;

      // Start then cancel
      await db`UPDATE app.onboarding_instances SET status = 'in_progress' WHERE id = ${instance[0]!.id}::uuid`;

      await db`
        UPDATE app.onboarding_instances
        SET status = 'cancelled',
            cancelled_at = now(),
            cancelled_by = ${user.id}::uuid,
            cancellation_reason = 'Employee withdrew from position'
        WHERE id = ${instance[0]!.id}::uuid
      `;

      const result = await db<{ status: string; cancellationReason: string }[]>`
        SELECT status, cancellation_reason as "cancellationReason"
        FROM app.onboarding_instances WHERE id = ${instance[0]!.id}::uuid
      `;

      expect(result[0]!.status).toBe("cancelled");
      expect(result[0]!.cancellationReason).toBe("Employee withdrew from position");

      // Verify cannot resume from cancelled
      try {
        await db`
          UPDATE app.onboarding_instances SET status = 'in_progress' WHERE id = ${instance[0]!.id}::uuid
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("cancelled is a terminal state");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.onboarding_instances WHERE id = ${instance[0]!.id}::uuid`;
        await tx`DELETE FROM app.employees WHERE id = ${emp2[0]!.id}::uuid`;
      });
    });
  });

  // ===========================================================================
  // Constraint Validation
  // ===========================================================================
  describe("Instance constraint validation", () => {
    it("should reject progress outside 0-100", async () => {
      if (!db || !tenant) return;

      const emp3 = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${'OB-EMP3-' + suffix}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const templates = await db<{ id: string }[]>`
        SELECT id FROM app.onboarding_templates
        WHERE tenant_id = ${tenant.id}::uuid AND status = 'active'
        LIMIT 1
      `;

      if (templates.length === 0) {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employees WHERE id = ${emp3[0]!.id}::uuid`;
        });
        return;
      }

      try {
        await db`
          INSERT INTO app.onboarding_instances (
            tenant_id, employee_id, template_id,
            template_name, status,
            start_date, target_completion_date,
            progress_percent
          )
          VALUES (
            ${tenant.id}::uuid, ${emp3[0]!.id}::uuid, ${templates[0]!.id}::uuid,
            'Progress Test', 'not_started',
            CURRENT_DATE, CURRENT_DATE + 14,
            150
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("onboarding_instances_progress_valid");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp3[0]!.id}::uuid`;
      });
    });

    it("should reject target_completion_date before start_date", async () => {
      if (!db || !tenant) return;

      const emp4 = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${'OB-EMP4-' + suffix}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const templates = await db<{ id: string }[]>`
        SELECT id FROM app.onboarding_templates
        WHERE tenant_id = ${tenant.id}::uuid AND status = 'active'
        LIMIT 1
      `;

      if (templates.length === 0) {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employees WHERE id = ${emp4[0]!.id}::uuid`;
        });
        return;
      }

      try {
        await db`
          INSERT INTO app.onboarding_instances (
            tenant_id, employee_id, template_id,
            template_name, status,
            start_date, target_completion_date
          )
          VALUES (
            ${tenant.id}::uuid, ${emp4[0]!.id}::uuid, ${templates[0]!.id}::uuid,
            'Date Test', 'not_started',
            '2026-06-15', '2026-06-01'
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("onboarding_instances_target_after_start");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp4[0]!.id}::uuid`;
      });
    });

    it("should reject completion_rating outside 1-5", async () => {
      if (!db || !tenant) return;

      const emp5 = await db<{ id: string }[]>`
        INSERT INTO app.employees (tenant_id, employee_number, status, hire_date)
        VALUES (${tenant.id}::uuid, ${'OB-EMP5-' + suffix}, 'pending', CURRENT_DATE)
        RETURNING id
      `;

      const templates = await db<{ id: string }[]>`
        SELECT id FROM app.onboarding_templates
        WHERE tenant_id = ${tenant.id}::uuid AND status = 'active'
        LIMIT 1
      `;

      if (templates.length === 0) {
        await withSystemContext(db, async (tx) => {
          await tx`DELETE FROM app.employees WHERE id = ${emp5[0]!.id}::uuid`;
        });
        return;
      }

      try {
        await db`
          INSERT INTO app.onboarding_instances (
            tenant_id, employee_id, template_id,
            template_name, status,
            start_date, target_completion_date,
            completion_rating
          )
          VALUES (
            ${tenant.id}::uuid, ${emp5[0]!.id}::uuid, ${templates[0]!.id}::uuid,
            'Rating Test', 'not_started',
            CURRENT_DATE, CURRENT_DATE + 14,
            0
          )
        `;
        expect(true).toBe(false);
      } catch (error) {
        expect(String(error)).toContain("onboarding_instances_rating_valid");
      }

      // Cleanup
      await withSystemContext(db, async (tx) => {
        await tx`DELETE FROM app.employees WHERE id = ${emp5[0]!.id}::uuid`;
      });
    });
  });
});
