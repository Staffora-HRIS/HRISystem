/**
 * Onboarding Module - Repository Layer
 *
 * Database operations for Employee Onboarding.
 * All queries respect RLS via tenant context.
 */

import type {
  CreateTemplate,
  UpdateTemplate,
  TemplateResponse,
  TemplateTask,
  CreateInstance,
  UpdateInstance,
  InstanceResponse,
  InstanceTask,
  TaskDependency,
  CreateTaskDependency,
  CreateComplianceCheck,
  UpdateComplianceCheck,
  ComplianceCheckResponse,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class OnboardingRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Template Operations
  // ===========================================================================

  async listTemplates(
    ctx: TenantContext,
    filters: {
      departmentId?: string;
      positionId?: string;
      status?: string;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<TemplateResponse>> {
    const limit = pagination.limit ?? 20;

    const templates = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            ot.*,
            ou.name as department_name,
            p.title as position_name,
            (SELECT COUNT(*) FROM app.onboarding_template_tasks ott WHERE ott.template_id = ot.id) as task_count
          FROM app.onboarding_templates ot
          LEFT JOIN app.org_units ou ON ou.id = ot.department_id
          LEFT JOIN app.positions p ON p.id = ot.position_id
          WHERE ot.tenant_id = ${ctx.tenantId}::uuid
          ${filters.departmentId ? tx`AND ot.department_id = ${filters.departmentId}::uuid` : tx``}
          ${filters.positionId ? tx`AND ot.position_id = ${filters.positionId}::uuid` : tx``}
          ${filters.status ? tx`AND ot.status = ${filters.status}` : tx``}
          ${filters.search ? tx`AND ot.name ILIKE ${'%' + filters.search + '%'}` : tx``}
          ${pagination.cursor ? tx`AND ot.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY ot.name ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = templates.length > limit;
    const items = hasMore ? templates.slice(0, limit) : templates;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapTemplateRow),
      nextCursor,
      hasMore,
    };
  }

  async getTemplateById(
    ctx: TenantContext,
    id: string
  ): Promise<(TemplateResponse & { tasks: TemplateTask[] }) | null> {
    const [template] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            ot.*,
            ou.name as department_name,
            p.title as position_name
          FROM app.onboarding_templates ot
          LEFT JOIN app.org_units ou ON ou.id = ot.department_id
          LEFT JOIN app.positions p ON p.id = ot.position_id
          WHERE ot.id = ${id}::uuid AND ot.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    if (!template) return null;

    const tasks = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            id, template_id, name, description, task_type, assignee_type,
            assignee_id, due_days_offset, is_required, "order", created_at, updated_at
          FROM app.onboarding_template_tasks
          WHERE template_id = ${id}::uuid
          ORDER BY "order" ASC, created_at ASC
        `;
      }
    );

    return {
      ...this.mapTemplateRow(template),
      tasks: tasks.map(this.mapTemplateTaskRow),
    };
  }

  async createTemplate(
    ctx: TenantContext,
    data: CreateTemplate,
    txOverride?: any
  ): Promise<TemplateResponse> {
    const exec = async (tx: any) => {
      const [created] = await tx`
        INSERT INTO app.onboarding_templates (
          id, tenant_id, name, description, department_id, position_id,
          is_default, status, created_by
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.name}, ${data.description || null},
          ${data.departmentId || null}::uuid, ${data.positionId || null}::uuid,
          ${data.isDefault || false}, 'active', ${ctx.userId}::uuid
        )
        RETURNING *
      `;

      // Create tasks if provided
      if (data.tasks && data.tasks.length > 0) {
        for (let i = 0; i < data.tasks.length; i++) {
          const task = data.tasks[i];
          await tx`
            INSERT INTO app.onboarding_template_tasks (
              id, template_id, name, description, category, assignee_type,
              days_from_start, days_to_complete, required, "order"
            ) VALUES (
              gen_random_uuid(), ${created.id}::uuid, ${task.name}, ${task.description || null},
              ${task.category || null}, ${task.assigneeType || 'employee'},
              ${task.daysFromStart || 0}, ${task.daysToComplete || null},
              ${task.required !== false}, ${task.order || i}
            )
          `;
        }
      }

      return [created];
    };

    const [template] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapTemplateRow(template);
  }

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    data: UpdateTemplate,
    txOverride?: any
  ): Promise<TemplateResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.onboarding_templates SET
          name = COALESCE(${data.name}, name),
          description = COALESCE(${data.description}, description),
          department_id = COALESCE(${data.departmentId}::uuid, department_id),
          position_id = COALESCE(${data.positionId}::uuid, position_id),
          is_default = COALESCE(${data.isDefault}, is_default),
          status = COALESCE(${data.status}, status),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [template] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return template ? this.mapTemplateRow(template) : null;
  }

  // ===========================================================================
  // Instance Operations
  // ===========================================================================

  async listInstances(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      templateId?: string;
      status?: string;
      buddyId?: string;
      managerId?: string;
      isOverdue?: boolean;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<InstanceResponse>> {
    const limit = pagination.limit ?? 20;

    const instances = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            oi.*,
            e.first_name || ' ' || e.last_name as employee_name,
            ot.name as template_name,
            b.first_name || ' ' || b.last_name as buddy_name,
            m.first_name || ' ' || m.last_name as manager_name
          FROM app.onboarding_instances oi
          JOIN app.employees e ON e.id = oi.employee_id
          JOIN app.onboarding_templates ot ON ot.id = oi.template_id
          LEFT JOIN app.employees b ON b.id = oi.buddy_id
          LEFT JOIN app.employees m ON m.id = oi.manager_id
          WHERE oi.tenant_id = ${ctx.tenantId}::uuid
          ${filters.employeeId ? tx`AND oi.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.templateId ? tx`AND oi.template_id = ${filters.templateId}::uuid` : tx``}
          ${filters.status ? tx`AND oi.status = ${filters.status}` : tx``}
          ${filters.buddyId ? tx`AND oi.buddy_id = ${filters.buddyId}::uuid` : tx``}
          ${filters.managerId ? tx`AND oi.manager_id = ${filters.managerId}::uuid` : tx``}
          ${pagination.cursor ? tx`AND oi.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY oi.start_date DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = instances.length > limit;
    const items = hasMore ? instances.slice(0, limit) : instances;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapInstanceRow),
      nextCursor,
      hasMore,
    };
  }

  async getInstanceById(
    ctx: TenantContext,
    id: string
  ): Promise<(InstanceResponse & { tasks: InstanceTask[] }) | null> {
    const [instance] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            oi.*,
            e.first_name || ' ' || e.last_name as employee_name,
            ot.name as template_name,
            b.first_name || ' ' || b.last_name as buddy_name,
            m.first_name || ' ' || m.last_name as manager_name
          FROM app.onboarding_instances oi
          JOIN app.employees e ON e.id = oi.employee_id
          JOIN app.onboarding_templates ot ON ot.id = oi.template_id
          LEFT JOIN app.employees b ON b.id = oi.buddy_id
          LEFT JOIN app.employees m ON m.id = oi.manager_id
          WHERE oi.id = ${id}::uuid AND oi.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    if (!instance) return null;

    const tasks = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            otc.*,
            a.first_name || ' ' || a.last_name as assignee_name,
            c.first_name || ' ' || c.last_name as completed_by_name
          FROM app.onboarding_task_completions otc
          LEFT JOIN app.employees a ON a.id = otc.assignee_id
          LEFT JOIN app.users c ON c.id = otc.completed_by
          WHERE otc.instance_id = ${id}::uuid
          ORDER BY otc."order" ASC
        `;
      }
    );

    return {
      ...this.mapInstanceRow(instance),
      tasks: tasks.map(this.mapInstanceTaskRow),
    };
  }

  async getEmployeeOnboarding(
    ctx: TenantContext,
    employeeId: string
  ): Promise<(InstanceResponse & { tasks: InstanceTask[] }) | null> {
    const [instance] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            oi.*,
            ot.name as template_name,
            b.first_name || ' ' || b.last_name as buddy_name,
            m.first_name || ' ' || m.last_name as manager_name
          FROM app.onboarding_instances oi
          JOIN app.onboarding_templates ot ON ot.id = oi.template_id
          LEFT JOIN app.employees b ON b.id = oi.buddy_id
          LEFT JOIN app.employees m ON m.id = oi.manager_id
          WHERE oi.employee_id = ${employeeId}::uuid
            AND oi.status NOT IN ('completed', 'cancelled')
          ORDER BY oi.start_date DESC
          LIMIT 1
        `;
      }
    );

    if (!instance) return null;

    return this.getInstanceById(ctx, instance.id);
  }

  async createInstance(
    ctx: TenantContext,
    data: CreateInstance,
    templateTasks: TemplateTask[],
    txOverride?: any
  ): Promise<InstanceResponse> {
    const exec = async (tx: any) => {
      // Create instance
      const [created] = await tx`
        INSERT INTO app.onboarding_instances (
          id, tenant_id, employee_id, template_id, status, start_date,
          buddy_id, manager_id, notes
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
          ${data.templateId}::uuid, 'not_started', ${data.startDate}::date,
          ${data.buddyId || null}::uuid, ${data.managerId || null}::uuid,
          ${data.notes || null}
        )
        RETURNING *
      `;

      // Create task completions from template tasks
      const startDate = new Date(data.startDate);
      for (let i = 0; i < templateTasks.length; i++) {
        const task = templateTasks[i];
        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() + (task.daysFromStart || 0) + (task.daysToComplete || 7));

        await tx`
          INSERT INTO app.onboarding_task_completions (
            id, instance_id, task_id, name, description, category, assignee_type,
            status, due_date, required, "order"
          ) VALUES (
            gen_random_uuid(), ${created.id}::uuid, ${'task-' + i}, ${task.name},
            ${task.description || null}, ${task.category || null},
            ${task.assigneeType || 'employee'}, 'pending',
            ${dueDate.toISOString().split('T')[0]}::date,
            ${task.required !== false}, ${task.order || i}
          )
        `;
      }

      return [created];
    };

    const [instance] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapInstanceRow(instance);
  }

  async updateInstance(
    ctx: TenantContext,
    id: string,
    data: UpdateInstance,
    txOverride?: any
  ): Promise<InstanceResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.onboarding_instances SET
          buddy_id = COALESCE(${data.buddyId}::uuid, buddy_id),
          manager_id = COALESCE(${data.managerId}::uuid, manager_id),
          status = COALESCE(${data.status}, status),
          notes = COALESCE(${data.notes}, notes),
          completed_at = CASE WHEN ${data.status} = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [instance] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return instance ? this.mapInstanceRow(instance) : null;
  }

  async completeTask(
    ctx: TenantContext,
    instanceId: string,
    taskId: string,
    notes?: string,
    formData?: Record<string, unknown>,
    txOverride?: any
  ): Promise<InstanceTask | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.onboarding_task_completions SET
          status = 'completed',
          completed_at = now(),
          completed_by = ${ctx.userId}::uuid,
          notes = COALESCE(${notes}, notes),
          form_data = COALESCE(${formData ? JSON.stringify(formData) : null}::jsonb, form_data),
          updated_at = now()
        WHERE instance_id = ${instanceId}::uuid AND task_id = ${taskId}
        RETURNING *
      `;
    };

    const [task] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    if (!task) return null;

    // Check if all required tasks are completed
    await this.checkAndUpdateInstanceStatus(ctx, instanceId, txOverride);

    return this.mapInstanceTaskRow(task);
  }

  async skipTask(
    ctx: TenantContext,
    instanceId: string,
    taskId: string,
    reason: string,
    txOverride?: any
  ): Promise<InstanceTask | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.onboarding_task_completions SET
          status = 'skipped',
          notes = ${reason},
          updated_at = now()
        WHERE instance_id = ${instanceId}::uuid AND task_id = ${taskId}
        RETURNING *
      `;
    };

    const [task] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    if (!task) return null;

    await this.checkAndUpdateInstanceStatus(ctx, instanceId, txOverride);

    return this.mapInstanceTaskRow(task);
  }

  private async checkAndUpdateInstanceStatus(ctx: TenantContext, instanceId: string, txOverride?: any) {
    const exec = async (tx: any) => {
      // Check if all required tasks are completed
      const [stats] = await tx`
        SELECT
          COUNT(*) FILTER (WHERE required = true) as required_count,
          COUNT(*) FILTER (WHERE required = true AND status IN ('completed', 'skipped')) as completed_required_count
        FROM app.onboarding_task_completions
        WHERE instance_id = ${instanceId}::uuid
      `;

      // Also check if all required compliance checks are satisfied
      const [complianceStats] = await tx`
        SELECT
          COUNT(*) FILTER (WHERE required = true) as required_count,
          COUNT(*) FILTER (WHERE required = true AND status IN ('passed', 'waived')) as satisfied_count
        FROM app.onboarding_compliance_checks
        WHERE onboarding_id = ${instanceId}::uuid
      `;

      const allTasksComplete = Number(stats.required_count) === Number(stats.completed_required_count);
      const allComplianceSatisfied = Number(complianceStats.required_count) === Number(complianceStats.satisfied_count);

      if (allTasksComplete && allComplianceSatisfied) {
        await tx`
          UPDATE app.onboarding_instances SET
            status = 'completed',
            completed_at = now(),
            updated_at = now()
          WHERE id = ${instanceId}::uuid AND status != 'completed'
        `;
      } else {
        await tx`
          UPDATE app.onboarding_instances SET
            status = 'in_progress',
            updated_at = now()
          WHERE id = ${instanceId}::uuid AND status = 'not_started'
        `;
      }
    };

    if (txOverride) {
      await exec(txOverride);
    } else {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        exec
      );
    }
  }

  // ===========================================================================
  // Employee Lookup
  // ===========================================================================

  async getEmployeeIdByUserId(ctx: TenantContext): Promise<string | null> {
    const [employee] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT id FROM app.employees
          WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return employee?.id || null;
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getOnboardingAnalytics(ctx: TenantContext) {
    const [analytics] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            COUNT(*) as total_instances,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
            AVG(EXTRACT(DAY FROM (completed_at - start_date))) FILTER (WHERE status = 'completed') as average_completion_days
          FROM app.onboarding_instances
          WHERE tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    const [overdueStats] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*) as overdue_count
          FROM app.onboarding_task_completions otc
          JOIN app.onboarding_instances oi ON oi.id = otc.instance_id
          WHERE oi.tenant_id = ${ctx.tenantId}::uuid
            AND otc.due_date < CURRENT_DATE
            AND otc.status NOT IN ('completed', 'skipped')
        `;
      }
    );

    const byTemplate = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            oi.template_id,
            ot.name as template_name,
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE oi.status = 'completed') as completed_count
          FROM app.onboarding_instances oi
          JOIN app.onboarding_templates ot ON ot.id = oi.template_id
          WHERE oi.tenant_id = ${ctx.tenantId}::uuid
          GROUP BY oi.template_id, ot.name
        `;
      }
    );

    const totalInstances = Number(analytics.total_instances) || 0;
    const completedCount = Number(analytics.completed_count) || 0;

    return {
      totalInstances,
      inProgressCount: Number(analytics.in_progress_count) || 0,
      completedCount,
      averageCompletionDays: analytics.average_completion_days
        ? Number(analytics.average_completion_days)
        : null,
      overdueTaskCount: Number(overdueStats.overdue_count) || 0,
      completionRate: totalInstances > 0 ? (completedCount / totalInstances) * 100 : 0,
      byTemplate: byTemplate.map((r: any) => ({
        templateId: r.template_id,
        templateName: r.template_name,
        count: Number(r.count),
        completedCount: Number(r.completed_count),
      })),
    };
  }

  // ===========================================================================
  // Task Dependency Operations
  // ===========================================================================

  /**
   * List all dependencies for a given template task.
   */
  async listTaskDependencies(
    ctx: TenantContext,
    taskId: string
  ): Promise<TaskDependency[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            d.id, d.tenant_id, d.task_id, d.depends_on_task_id, d.created_at,
            t.name AS depends_on_task_name
          FROM app.onboarding_task_dependencies d
          JOIN app.onboarding_template_tasks t ON t.id = d.depends_on_task_id
          WHERE d.task_id = ${taskId}::uuid
            AND d.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY t.sequence_order ASC
        `;
      }
    );

    return rows.map(this.mapTaskDependencyRow);
  }

  /**
   * List all dependencies for all tasks in a template.
   */
  async listTemplateDependencies(
    ctx: TenantContext,
    templateId: string
  ): Promise<TaskDependency[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            d.id, d.tenant_id, d.task_id, d.depends_on_task_id, d.created_at,
            t.name AS depends_on_task_name
          FROM app.onboarding_task_dependencies d
          JOIN app.onboarding_template_tasks t ON t.id = d.depends_on_task_id
          JOIN app.onboarding_template_tasks t2 ON t2.id = d.task_id
          WHERE t2.template_id = ${templateId}::uuid
            AND d.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY t2.sequence_order ASC, t.sequence_order ASC
        `;
      }
    );

    return rows.map(this.mapTaskDependencyRow);
  }

  /**
   * Add a dependency between two template tasks.
   */
  async addTaskDependency(
    ctx: TenantContext,
    data: CreateTaskDependency,
    txOverride?: any
  ): Promise<TaskDependency> {
    const exec = async (tx: any) => {
      return tx`
        INSERT INTO app.onboarding_task_dependencies (
          id, tenant_id, task_id, depends_on_task_id, created_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.taskId}::uuid, ${data.dependsOnTaskId}::uuid, now()
        )
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapTaskDependencyRow(row);
  }

  /**
   * Remove a dependency between two template tasks.
   */
  async removeTaskDependency(
    ctx: TenantContext,
    taskId: string,
    dependsOnTaskId: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        DELETE FROM app.onboarding_task_dependencies
        WHERE task_id = ${taskId}::uuid
          AND depends_on_task_id = ${dependsOnTaskId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    };

    const result = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return result.length > 0;
  }

  /**
   * Get incomplete (non-completed, non-skipped) dependencies for an instance task.
   * This looks up the template-level dependencies and checks the status of corresponding
   * instance-level task completions.
   *
   * Returns the list of template_task_ids that are still blocking.
   */
  async getIncompleteTaskDependencies(
    ctx: TenantContext,
    instanceId: string,
    taskId: string,
    txOverride?: any
  ): Promise<{ templateTaskId: string; taskName: string; status: string }[]> {
    const exec = async (tx: any) => {
      return tx`
        SELECT
          dep.depends_on_task_id AS template_task_id,
          tt.name AS task_name,
          tc.status
        FROM app.onboarding_task_completions otc_current
        JOIN app.onboarding_task_dependencies dep
          ON dep.task_id = otc_current.template_task_id
          AND dep.tenant_id = otc_current.tenant_id
        JOIN app.onboarding_template_tasks tt
          ON tt.id = dep.depends_on_task_id
        JOIN app.onboarding_task_completions tc
          ON tc.instance_id = otc_current.instance_id
          AND tc.template_task_id = dep.depends_on_task_id
        WHERE otc_current.instance_id = ${instanceId}::uuid
          AND otc_current.task_id = ${taskId}
          AND tc.status NOT IN ('completed', 'skipped')
      `;
    };

    const rows = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return rows.map((r: any) => ({
      templateTaskId: r.template_task_id,
      taskName: r.task_name,
      status: r.status,
    }));
  }

  /**
   * For a given instance, get the dependency mapping for all tasks.
   * Returns a map of taskId -> { dependsOnTaskIds, blockedByTaskIds }.
   */
  async getInstanceTaskDependencyMap(
    ctx: TenantContext,
    instanceId: string,
    txOverride?: any
  ): Promise<Map<string, { dependsOnTaskIds: string[]; blockedByTaskIds: string[] }>> {
    const exec = async (tx: any) => {
      // Get all dependencies and their completion status for this instance
      return tx`
        SELECT
          otc_current.task_id AS current_task_id,
          dep.depends_on_task_id,
          tc_dep.status AS dep_status
        FROM app.onboarding_task_completions otc_current
        JOIN app.onboarding_task_dependencies dep
          ON dep.task_id = otc_current.template_task_id
          AND dep.tenant_id = otc_current.tenant_id
        JOIN app.onboarding_task_completions tc_dep
          ON tc_dep.instance_id = otc_current.instance_id
          AND tc_dep.template_task_id = dep.depends_on_task_id
        WHERE otc_current.instance_id = ${instanceId}::uuid
      `;
    };

    const rows = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    const depMap = new Map<string, { dependsOnTaskIds: string[]; blockedByTaskIds: string[] }>();

    for (const row of rows) {
      const taskId = row.current_task_id;
      if (!depMap.has(taskId)) {
        depMap.set(taskId, { dependsOnTaskIds: [], blockedByTaskIds: [] });
      }
      const entry = depMap.get(taskId)!;
      entry.dependsOnTaskIds.push(row.depends_on_task_id);
      if (!['completed', 'skipped'].includes(row.dep_status)) {
        entry.blockedByTaskIds.push(row.depends_on_task_id);
      }
    }

    return depMap;
  }

  // ===========================================================================
  // Compliance Check Operations
  // ===========================================================================

  /**
   * List all compliance checks for an onboarding instance.
   */
  async listComplianceChecks(
    ctx: TenantContext,
    onboardingId: string
  ): Promise<{ items: ComplianceCheckResponse[]; complianceSatisfied: boolean }> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.onboarding_compliance_checks
          WHERE onboarding_id = ${onboardingId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY created_at ASC
        `;
      }
    );

    const items = rows.map(this.mapComplianceCheckRow);
    const complianceSatisfied = items
      .filter((c: ComplianceCheckResponse) => c.required)
      .every((c: ComplianceCheckResponse) => c.status === "passed" || c.status === "waived");

    return { items, complianceSatisfied };
  }

  /**
   * Get a single compliance check by ID.
   */
  async getComplianceCheckById(
    ctx: TenantContext,
    checkId: string
  ): Promise<ComplianceCheckResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.onboarding_compliance_checks
          WHERE id = ${checkId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapComplianceCheckRow(row) : null;
  }

  /**
   * Create a new compliance check for an onboarding instance.
   */
  async createComplianceCheck(
    ctx: TenantContext,
    onboardingId: string,
    employeeId: string,
    data: CreateComplianceCheck,
    txOverride?: any
  ): Promise<ComplianceCheckResponse> {
    const exec = async (tx: any) => {
      return tx`
        INSERT INTO app.onboarding_compliance_checks (
          id, tenant_id, onboarding_id, employee_id,
          check_type, status, required, due_date, notes, created_by
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${onboardingId}::uuid, ${employeeId}::uuid,
          ${data.checkType}, 'pending', ${data.required !== false},
          ${data.dueDate || null}::date, ${data.notes || null}, ${ctx.userId}::uuid
        )
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapComplianceCheckRow(row);
  }

  /**
   * Update a compliance check (status, notes, reference, waiver, etc.).
   */
  async updateComplianceCheck(
    ctx: TenantContext,
    checkId: string,
    data: UpdateComplianceCheck,
    txOverride?: any
  ): Promise<ComplianceCheckResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.onboarding_compliance_checks SET
          status = COALESCE(${data.status}, status),
          due_date = COALESCE(${data.dueDate || null}::date, due_date),
          notes = COALESCE(${data.notes}, notes),
          reference_number = COALESCE(${data.referenceNumber}, reference_number),
          expires_at = COALESCE(${data.expiresAt || null}::date, expires_at),
          completed_at = CASE
            WHEN ${data.status} IN ('passed', 'failed') AND completed_at IS NULL THEN now()
            ELSE completed_at
          END,
          completed_by = CASE
            WHEN ${data.status} IN ('passed', 'failed') AND completed_by IS NULL THEN ${ctx.userId}::uuid
            ELSE completed_by
          END,
          waived_by = CASE
            WHEN ${data.status} = 'waived' AND waived_by IS NULL THEN ${ctx.userId}::uuid
            ELSE waived_by
          END,
          waiver_reason = CASE
            WHEN ${data.status} = 'waived' THEN COALESCE(${data.waiverReason}, waiver_reason)
            ELSE waiver_reason
          END,
          updated_at = now()
        WHERE id = ${checkId}::uuid
          AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return row ? this.mapComplianceCheckRow(row) : null;
  }

  /**
   * Check if all required compliance checks for an onboarding instance are satisfied.
   */
  async isComplianceSatisfied(
    ctx: TenantContext,
    onboardingId: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        SELECT COUNT(*) as unsatisfied_count
        FROM app.onboarding_compliance_checks
        WHERE onboarding_id = ${onboardingId}::uuid
          AND required = true
          AND status NOT IN ('passed', 'waived')
      `;
    };

    const [result] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return Number(result.unsatisfied_count) === 0;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapComplianceCheckRow(row: any): ComplianceCheckResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      onboardingId: row.onboarding_id,
      employeeId: row.employee_id,
      checkType: row.check_type,
      status: row.status,
      required: row.required,
      dueDate: row.due_date?.toISOString()?.split("T")[0] || row.due_date || null,
      completedAt: row.completed_at?.toISOString() || row.completed_at || null,
      completedBy: row.completed_by || null,
      notes: row.notes || null,
      waivedBy: row.waived_by || null,
      waiverReason: row.waiver_reason || null,
      referenceNumber: row.reference_number || null,
      expiresAt: row.expires_at?.toISOString()?.split("T")[0] || row.expires_at || null,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapTaskDependencyRow(row: any): TaskDependency {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      taskId: row.task_id,
      dependsOnTaskId: row.depends_on_task_id,
      dependsOnTaskName: row.depends_on_task_name,
      createdAt: row.created_at?.toISOString() || row.created_at,
    };
  }

  private mapTemplateRow(row: any): TemplateResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      departmentId: row.department_id,
      departmentName: row.department_name,
      positionId: row.position_id,
      positionName: row.position_name,
      isDefault: row.is_default,
      status: row.status,
      taskCount: row.task_count ? Number(row.task_count) : undefined,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapTemplateTaskRow(row: any): TemplateTask {
    return {
      name: row.name,
      description: row.description,
      category: row.category,
      assigneeType: row.assignee_type,
      daysFromStart: row.days_from_start,
      daysToComplete: row.days_to_complete,
      required: row.required,
      order: row.order,
    };
  }

  private mapInstanceRow(row: any): InstanceResponse {
    const taskCount = row.task_count || 0;
    const completedTaskCount = row.completed_task_count || 0;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      templateId: row.template_id,
      templateName: row.template_name,
      status: row.status,
      startDate: row.start_date?.toISOString()?.split("T")[0] || row.start_date,
      targetCompletionDate: row.target_completion_date?.toISOString()?.split("T")[0] || row.target_completion_date,
      completedAt: row.completed_at?.toISOString() || row.completed_at,
      buddyId: row.buddy_id,
      buddyName: row.buddy_name,
      managerId: row.manager_id,
      managerName: row.manager_name,
      progress: taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0,
      taskCount: Number(taskCount),
      completedTaskCount: Number(completedTaskCount),
      notes: row.notes,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapInstanceTaskRow(row: any): InstanceTask {
    return {
      taskId: row.task_id,
      name: row.name,
      description: row.description,
      category: row.category,
      assigneeType: row.assignee_type,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      status: row.status,
      dueDate: row.due_date?.toISOString()?.split("T")[0] || row.due_date,
      completedAt: row.completed_at?.toISOString() || row.completed_at,
      completedBy: row.completed_by,
      completedByName: row.completed_by_name,
      required: row.required,
      order: row.order,
      notes: row.notes,
      formData: row.form_data,
    };
  }
}
