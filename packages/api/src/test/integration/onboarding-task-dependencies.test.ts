/**
 * Onboarding Task Dependencies Integration Tests (TODO-253)
 *
 * Tests the onboarding task dependency chain feature:
 * - Creating dependencies between template tasks
 * - Circular dependency prevention
 * - Same-template enforcement
 * - Unique constraint enforcement
 * - Dependency enforcement during task completion
 * - RLS tenant isolation for dependency records
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  ensureTestInfra,
  isInfraAvailable,
  getTestDb,
  createTestTenant,
  createTestUser,
  setTenantContext,
  withSystemContext,
  cleanupTestTenant,
  cleanupTestUser,
  type TestTenant,
  type TestUser,
} from "../setup";

describe("Onboarding Task Dependencies (TODO-253)", () => {
  let db: ReturnType<typeof import("postgres").default>;
  let tenant: TestTenant;
  let user: TestUser;
  let tenant2: TestTenant;
  let user2: TestUser;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;

    db = getTestDb();
    tenant = await createTestTenant(db);
    user = await createTestUser(db, tenant.id);

    // Second tenant for RLS isolation tests
    tenant2 = await createTestTenant(db);
    user2 = await createTestUser(db, tenant2.id);
  });

  afterAll(async () => {
    if (!isInfraAvailable()) return;

    try {
      await cleanupTestUser(db, user.id);
      await cleanupTestTenant(db, tenant.id);
      await cleanupTestUser(db, user2.id);
      await cleanupTestTenant(db, tenant2.id);
    } catch {
      // Ignore cleanup errors
    }

    if (db) await db.end();
  });

  // =========================================================================
  // Helper: Create an onboarding template with tasks
  // =========================================================================
  async function createTemplateWithTasks(
    tenantId: string,
    userId: string,
    taskCount: number = 3
  ): Promise<{ templateId: string; taskIds: string[] }> {
    let templateId: string = "";
    const taskIds: string[] = [];

    await withSystemContext(db, async (tx) => {
      const [tpl] = await tx`
        INSERT INTO app.onboarding_templates (
          id, tenant_id, code, name, status, estimated_duration_days, created_by,
          published_at, published_by
        ) VALUES (
          gen_random_uuid(), ${tenantId}::uuid,
          ${"dep-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)},
          'Dependency Test Template',
          'active', 30, ${userId}::uuid, now(), ${userId}::uuid
        )
        RETURNING id
      `;
      templateId = tpl.id;

      for (let i = 0; i < taskCount; i++) {
        const [task] = await tx`
          INSERT INTO app.onboarding_template_tasks (
            id, tenant_id, template_id, name, description,
            task_type, owner_type, sequence_order, is_required
          ) VALUES (
            gen_random_uuid(), ${tenantId}::uuid, ${templateId}::uuid,
            ${"Task " + (i + 1)}, ${"Description for task " + (i + 1)},
            'custom', 'new_hire', ${i}, true
          )
          RETURNING id
        `;
        taskIds.push(task.id);
      }
    });

    return { templateId, taskIds };
  }

  // =========================================================================
  // 1. Basic CRUD for task dependencies
  // =========================================================================
  describe("Basic dependency CRUD", () => {
    it("should create a dependency between two tasks", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id);
      await setTenantContext(db, tenant.id, user.id);

      const [dep] = await db`
        INSERT INTO app.onboarding_task_dependencies (
          id, tenant_id, task_id, depends_on_task_id
        ) VALUES (
          gen_random_uuid(), ${tenant.id}::uuid,
          ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
        )
        RETURNING *
      `;

      expect(dep.task_id).toBe(taskIds[1]);
      expect(dep.depends_on_task_id).toBe(taskIds[0]);
      expect(dep.tenant_id).toBe(tenant.id);
      expect(dep.created_at).toBeDefined();
    });

    it("should delete a dependency", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id);
      await setTenantContext(db, tenant.id, user.id);

      await db`
        INSERT INTO app.onboarding_task_dependencies (
          id, tenant_id, task_id, depends_on_task_id
        ) VALUES (
          gen_random_uuid(), ${tenant.id}::uuid,
          ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
        )
      `;

      const deleted = await db`
        DELETE FROM app.onboarding_task_dependencies
        WHERE task_id = ${taskIds[1]}::uuid
          AND depends_on_task_id = ${taskIds[0]}::uuid
          AND tenant_id = ${tenant.id}::uuid
        RETURNING id
      `;

      expect(deleted.length).toBe(1);

      // Verify it's gone
      const remaining = await db`
        SELECT * FROM app.onboarding_task_dependencies
        WHERE task_id = ${taskIds[1]}::uuid
          AND depends_on_task_id = ${taskIds[0]}::uuid
      `;
      expect(remaining.length).toBe(0);
    });

    it("should list dependencies for a task", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 4);
      await setTenantContext(db, tenant.id, user.id);

      // Task 4 depends on Task 1 and Task 2
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES
          (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[3]}::uuid, ${taskIds[0]}::uuid),
          (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[3]}::uuid, ${taskIds[1]}::uuid)
      `;

      const deps = await db`
        SELECT d.*, t.name AS depends_on_task_name
        FROM app.onboarding_task_dependencies d
        JOIN app.onboarding_template_tasks t ON t.id = d.depends_on_task_id
        WHERE d.task_id = ${taskIds[3]}::uuid
        ORDER BY t.sequence_order ASC
      `;

      expect(deps.length).toBe(2);
      expect(deps[0].depends_on_task_id).toBe(taskIds[0]);
      expect(deps[1].depends_on_task_id).toBe(taskIds[1]);
    });
  });

  // =========================================================================
  // 2. Constraint enforcement
  // =========================================================================
  describe("Constraint enforcement", () => {
    it("should reject self-referencing dependency", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id);
      await setTenantContext(db, tenant.id, user.id);

      let error: any = null;
      try {
        await db`
          INSERT INTO app.onboarding_task_dependencies (
            id, tenant_id, task_id, depends_on_task_id
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${taskIds[0]}::uuid, ${taskIds[0]}::uuid
          )
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("onboarding_task_deps_no_self_ref");
    });

    it("should enforce unique constraint on (tenant_id, task_id, depends_on_task_id)", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id);
      await setTenantContext(db, tenant.id, user.id);

      await db`
        INSERT INTO app.onboarding_task_dependencies (
          id, tenant_id, task_id, depends_on_task_id
        ) VALUES (
          gen_random_uuid(), ${tenant.id}::uuid,
          ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
        )
      `;

      let error: any = null;
      try {
        await db`
          INSERT INTO app.onboarding_task_dependencies (
            id, tenant_id, task_id, depends_on_task_id
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
          )
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("onboarding_task_deps_unique");
    });

    it("should reject tasks from different templates", async () => {
      if (!isInfraAvailable()) return;

      const tpl1 = await createTemplateWithTasks(tenant.id, user.id, 2);
      const tpl2 = await createTemplateWithTasks(tenant.id, user.id, 2);
      await setTenantContext(db, tenant.id, user.id);

      let error: any = null;
      try {
        await db`
          INSERT INTO app.onboarding_task_dependencies (
            id, tenant_id, task_id, depends_on_task_id
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${tpl1.taskIds[0]}::uuid, ${tpl2.taskIds[0]}::uuid
          )
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("same template");
    });
  });

  // =========================================================================
  // 3. Circular dependency prevention
  // =========================================================================
  describe("Circular dependency prevention", () => {
    it("should reject direct circular dependency (A -> B -> A)", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 2);
      await setTenantContext(db, tenant.id, user.id);

      // A depends on B
      await db`
        INSERT INTO app.onboarding_task_dependencies (
          id, tenant_id, task_id, depends_on_task_id
        ) VALUES (
          gen_random_uuid(), ${tenant.id}::uuid,
          ${taskIds[0]}::uuid, ${taskIds[1]}::uuid
        )
      `;

      // Try B depends on A -- should fail
      let error: any = null;
      try {
        await db`
          INSERT INTO app.onboarding_task_dependencies (
            id, tenant_id, task_id, depends_on_task_id
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
          )
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Circular dependency");
    });

    it("should reject transitive circular dependency (A -> B -> C -> A)", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 3);
      await setTenantContext(db, tenant.id, user.id);

      // A depends on B
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[0]}::uuid, ${taskIds[1]}::uuid)
      `;

      // B depends on C
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[2]}::uuid)
      `;

      // Try C depends on A -- should fail (creates cycle)
      let error: any = null;
      try {
        await db`
          INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
          VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[2]}::uuid, ${taskIds[0]}::uuid)
        `;
      } catch (e: any) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Circular dependency");
    });

    it("should allow valid non-circular chains (A -> B, A -> C, B -> C)", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 3);
      await setTenantContext(db, tenant.id, user.id);

      // A depends on B (A needs B done first)
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[0]}::uuid, ${taskIds[1]}::uuid)
      `;

      // A depends on C
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[0]}::uuid, ${taskIds[2]}::uuid)
      `;

      // B depends on C (this forms a diamond, not a cycle)
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[2]}::uuid)
      `;

      // Verify all three exist
      const deps = await db`
        SELECT * FROM app.onboarding_task_dependencies
        WHERE tenant_id = ${tenant.id}::uuid
          AND (task_id = ${taskIds[0]}::uuid OR task_id = ${taskIds[1]}::uuid)
      `;
      expect(deps.length).toBe(3);
    });
  });

  // =========================================================================
  // 4. RLS tenant isolation
  // =========================================================================
  describe("RLS tenant isolation", () => {
    it("should not allow tenant2 to see tenant1 dependencies", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 2);

      // Create dependency under tenant1
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[0]}::uuid)
      `;

      // Switch to tenant2 context and try to read
      await setTenantContext(db, tenant2.id, user2.id);
      const rows = await db`
        SELECT * FROM app.onboarding_task_dependencies
        WHERE task_id = ${taskIds[1]}::uuid
      `;

      expect(rows.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. Circular dependency detection function
  // =========================================================================
  describe("has_circular_onboarding_task_dependency function", () => {
    it("should return false when no cycle exists", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 3);
      await setTenantContext(db, tenant.id, user.id);

      // A depends on B
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[0]}::uuid, ${taskIds[1]}::uuid)
      `;

      // Check if adding B -> C would create a cycle (should be false)
      const [result] = await db`
        SELECT app.has_circular_onboarding_task_dependency(
          ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[2]}::uuid
        ) AS is_circular
      `;

      expect(result.is_circular).toBe(false);
    });

    it("should return true when cycle would be created", async () => {
      if (!isInfraAvailable()) return;

      const { taskIds } = await createTemplateWithTasks(tenant.id, user.id, 2);
      await setTenantContext(db, tenant.id, user.id);

      // A depends on B
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[0]}::uuid, ${taskIds[1]}::uuid)
      `;

      // Check if adding B -> A would create a cycle (should be true)
      const [result] = await db`
        SELECT app.has_circular_onboarding_task_dependency(
          ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[0]}::uuid
        ) AS is_circular
      `;

      expect(result.is_circular).toBe(true);
    });
  });

  // =========================================================================
  // 6. Service-level dependency enforcement during task completion
  // =========================================================================
  describe("Service-level dependency enforcement", () => {
    it("should block task completion when dependencies are not met", async () => {
      if (!isInfraAvailable()) return;

      // This test creates a template with tasks and dependencies,
      // then creates an onboarding instance, and verifies that the
      // service correctly checks dependencies.

      const { OnboardingRepository } = await import("../../modules/onboarding/repository");
      const { OnboardingService } = await import("../../modules/onboarding/service");

      // Create template with tasks
      const { templateId, taskIds } = await createTemplateWithTasks(tenant.id, user.id, 3);

      // Add dependency: Task 2 depends on Task 1
      await setTenantContext(db, tenant.id, user.id);
      await db`
        INSERT INTO app.onboarding_task_dependencies (id, tenant_id, task_id, depends_on_task_id)
        VALUES (gen_random_uuid(), ${tenant.id}::uuid, ${taskIds[1]}::uuid, ${taskIds[0]}::uuid)
      `;

      // Create an employee for the instance
      let employeeId: string = "";
      await withSystemContext(db, async (tx) => {
        const [emp] = await tx`
          INSERT INTO app.employees (
            id, tenant_id, employee_number, first_name, last_name,
            email, status, hire_date
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${"EMP-" + Date.now()}, 'Test', 'Employee',
            ${"test-dep-" + Date.now() + "@example.com"}, 'active',
            CURRENT_DATE
          )
          RETURNING id
        `;
        employeeId = emp.id;
      });

      // Create onboarding instance with task completions
      await setTenantContext(db, tenant.id, user.id);

      let instanceId: string = "";
      await withSystemContext(db, async (tx) => {
        const [inst] = await tx`
          INSERT INTO app.onboarding_instances (
            id, tenant_id, employee_id, template_id, template_name,
            status, start_date, target_completion_date, created_by
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${employeeId}::uuid,
            ${templateId}::uuid, 'Dependency Test Template',
            'in_progress', CURRENT_DATE, CURRENT_DATE + 30,
            ${user.id}::uuid
          )
          RETURNING id
        `;
        instanceId = inst.id;

        // Create task completions for each template task
        for (let i = 0; i < taskIds.length; i++) {
          await tx`
            INSERT INTO app.onboarding_task_completions (
              id, tenant_id, instance_id, template_task_id,
              task_id, name, description, task_type, owner_type,
              status, available_date, is_required
            ) VALUES (
              gen_random_uuid(), ${tenant.id}::uuid, ${instanceId}::uuid,
              ${taskIds[i]}::uuid,
              ${"task-" + i}, ${"Task " + (i + 1)}, ${"Description " + (i + 1)},
              'custom', 'new_hire',
              'pending', CURRENT_DATE, true
            )
          `;
        }
      });

      // Create a mock db wrapper that provides withTransaction
      const mockDb = {
        withTransaction: async (ctx: any, fn: any) => {
          await setTenantContext(db, ctx.tenantId, ctx.userId);
          return fn(db);
        },
      };

      const repository = new OnboardingRepository(mockDb);
      const service = new OnboardingService(repository, mockDb);
      const ctx = { tenantId: tenant.id, userId: user.id };

      // Try to complete Task 2 (which depends on Task 1) - should fail
      const result = await service.completeTask(ctx, instanceId, "task-1");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("DEPENDENCY_NOT_MET");
      expect(result.error?.message).toContain("prerequisite");
      expect(result.error?.details?.blockingTasks).toBeDefined();
    });

    it("should allow task completion when all dependencies are met", async () => {
      if (!isInfraAvailable()) return;

      const { OnboardingRepository } = await import("../../modules/onboarding/repository");
      const { OnboardingService } = await import("../../modules/onboarding/service");

      // Create template with tasks, no dependencies on Task 1
      const { templateId, taskIds } = await createTemplateWithTasks(tenant.id, user.id, 2);

      // Create an employee
      let employeeId: string = "";
      await withSystemContext(db, async (tx) => {
        const [emp] = await tx`
          INSERT INTO app.employees (
            id, tenant_id, employee_number, first_name, last_name,
            email, status, hire_date
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid,
            ${"EMP-OK-" + Date.now()}, 'Test', 'Employee',
            ${"test-ok-" + Date.now() + "@example.com"}, 'active',
            CURRENT_DATE
          )
          RETURNING id
        `;
        employeeId = emp.id;
      });

      // Create onboarding instance
      let instanceId: string = "";
      await withSystemContext(db, async (tx) => {
        const [inst] = await tx`
          INSERT INTO app.onboarding_instances (
            id, tenant_id, employee_id, template_id, template_name,
            status, start_date, target_completion_date, created_by
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${employeeId}::uuid,
            ${templateId}::uuid, 'No-Dep Test Template',
            'in_progress', CURRENT_DATE, CURRENT_DATE + 30,
            ${user.id}::uuid
          )
          RETURNING id
        `;
        instanceId = inst.id;

        for (let i = 0; i < taskIds.length; i++) {
          await tx`
            INSERT INTO app.onboarding_task_completions (
              id, tenant_id, instance_id, template_task_id,
              task_id, name, description, task_type, owner_type,
              status, available_date, is_required
            ) VALUES (
              gen_random_uuid(), ${tenant.id}::uuid, ${instanceId}::uuid,
              ${taskIds[i]}::uuid,
              ${"task-" + i}, ${"Task " + (i + 1)}, ${"Desc " + (i + 1)},
              'custom', 'new_hire',
              'pending', CURRENT_DATE, true
            )
          `;
        }
      });

      const mockDb = {
        withTransaction: async (ctx: any, fn: any) => {
          await setTenantContext(db, ctx.tenantId, ctx.userId);
          return fn(db);
        },
      };

      const repository = new OnboardingRepository(mockDb);
      const service = new OnboardingService(repository, mockDb);
      const ctx = { tenantId: tenant.id, userId: user.id };

      // Task 1 has no dependencies, so it should succeed
      const result = await service.completeTask(ctx, instanceId, "task-0");

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe("completed");
    });
  });
});
