/**
 * Workflows Repository
 *
 * Database operations for workflow management.
 * Uses the 4-table schema: definitions, versions, instances, tasks.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginatedResult<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

export interface WorkflowDefinitionRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Joined from active workflow_version:
  steps?: Record<string, unknown>[];
  version?: number;
  versionId?: string;
  versionStatus?: string;
}

export interface WorkflowInstanceRow {
  id: string;
  tenantId: string;
  definitionId: string;
  versionId: string;
  status: string;
  context: Record<string, unknown>;
  currentStepIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  errorMessage: string | null;
  createdAt: Date;
  createdBy: string | null;
  // Joined fields:
  workflowName?: string;
}

export interface StepInstanceRow {
  id: string;
  instanceId: string;
  stepIndex: number;
  stepName: string;
  status: string;
  assignedTo: string | null;
  assigneeName: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  completionAction: string | null;
  completionComment: string | null;
  context: Record<string, unknown>;
  createdAt: Date;
}

export class WorkflowRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Workflow Definitions
  // ===========================================================================

  async createDefinition(ctx: TenantContext, data: {
    code: string;
    name: string;
    description?: string | null;
    category?: string | null;
    triggerType?: string;
    triggerConfig?: Record<string, unknown> | null;
    steps?: Record<string, unknown>[];
  }): Promise<WorkflowDefinitionRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const defId = crypto.randomUUID();

      // 1. Create the definition
      const [def] = await tx<WorkflowDefinitionRow[]>`
        INSERT INTO app.workflow_definitions (
          id, tenant_id, code, name, description, category,
          trigger_type, trigger_config, is_active
        ) VALUES (
          ${defId}::uuid, ${ctx.tenantId}::uuid, ${data.code}, ${data.name},
          ${data.description || null}, ${data.category || null},
          ${data.triggerType || 'manual'}, ${data.triggerConfig ? JSON.stringify(data.triggerConfig) : '{}'}::jsonb,
          true
        )
        RETURNING *
      `;

      // 2. Create the initial version (draft) with steps
      const [ver] = await tx`
        INSERT INTO app.workflow_versions (
          tenant_id, definition_id, status, steps
        ) VALUES (
          ${ctx.tenantId}::uuid, ${defId}::uuid, 'draft',
          ${JSON.stringify(data.steps || [])}::jsonb
        )
        RETURNING id, version, status, steps
      `;

      await this.writeOutbox(tx, ctx.tenantId, "workflow_definition", defId, "workflows.definition.created", { definitionId: defId });

      // Return combined result
      const row = def as WorkflowDefinitionRow;
      row.steps = ver.steps;
      row.version = ver.version;
      row.versionId = ver.id;
      row.versionStatus = ver.status;
      return row;
    });
  }

  async getDefinitionById(ctx: TenantContext, id: string): Promise<WorkflowDefinitionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT wd.*, wv.steps, wv.version, wv.id as version_id, wv.status as version_status
        FROM app.workflow_definitions wd
        LEFT JOIN app.workflow_versions wv ON wv.definition_id = wd.id AND wv.status = 'active'
        WHERE wd.id = ${id}::uuid AND wd.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as WorkflowDefinitionRow) : null;
  }

  async getDefinitionByCode(ctx: TenantContext, code: string): Promise<WorkflowDefinitionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT wd.*, wv.steps, wv.version, wv.id as version_id, wv.status as version_status
        FROM app.workflow_definitions wd
        LEFT JOIN app.workflow_versions wv ON wv.definition_id = wd.id AND wv.status = 'active'
        WHERE wd.code = ${code} AND wd.tenant_id = ${ctx.tenantId}::uuid AND wd.is_active = true
      `;
    });
    return rows.length > 0 ? (rows[0] as WorkflowDefinitionRow) : null;
  }

  async getDefinitions(ctx: TenantContext, filters: { category?: string; status?: string; cursor?: string; limit?: number }): Promise<PaginatedResult<WorkflowDefinitionRow>> {
    const limit = filters.limit || 20;
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT wd.*, wv.steps, wv.version, wv.id as version_id, wv.status as version_status
        FROM app.workflow_definitions wd
        LEFT JOIN app.workflow_versions wv ON wv.definition_id = wd.id AND wv.status = 'active'
        WHERE wd.tenant_id = ${ctx.tenantId}::uuid
        ${filters.category ? tx`AND wd.category = ${filters.category}` : tx``}
        ${filters.status === 'active' ? tx`AND wd.is_active = true` : filters.status === 'inactive' ? tx`AND wd.is_active = false` : tx``}
        ${filters.cursor ? tx`AND wd.id < ${filters.cursor}::uuid` : tx``}
        ORDER BY wd.created_at DESC, wd.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as WorkflowDefinitionRow[], cursor, hasMore };
  }

  async updateDefinition(ctx: TenantContext, id: string, data: Partial<WorkflowDefinitionRow>): Promise<WorkflowDefinitionRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<WorkflowDefinitionRow[]>`
        UPDATE app.workflow_definitions SET
          name = COALESCE(${data.name}, name),
          description = COALESCE(${data.description}, description),
          category = COALESCE(${data.category}, category),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;

      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "workflow_definition", id, "workflows.definition.updated", { definitionId: id });
      }
      return row as WorkflowDefinitionRow | null;
    });
  }

  async activateDefinition(ctx: TenantContext, id: string): Promise<WorkflowDefinitionRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<WorkflowDefinitionRow[]>`
        UPDATE app.workflow_definitions SET is_active = true, updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND is_active = false
        RETURNING *
      `;
      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "workflow_definition", id, "workflows.definition.activated", { definitionId: id });
      }
      return row as WorkflowDefinitionRow | null;
    });
  }

  // ===========================================================================
  // Workflow Instances
  // ===========================================================================

  async createInstance(ctx: TenantContext, data: {
    definitionId?: string;
    workflowDefinitionId?: string; // backward compat alias
    entityType?: string;
    entityId?: string;
    initiatorId?: string;
    contextData?: Record<string, unknown>;
  }): Promise<WorkflowInstanceRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const defId = data.definitionId || data.workflowDefinitionId;

      // Get active version for this definition
      const [ver] = await tx`
        SELECT wv.id as version_id, wv.steps, wd.name
        FROM app.workflow_definitions wd
        JOIN app.workflow_versions wv ON wv.definition_id = wd.id AND wv.status = 'active'
        WHERE wd.id = ${defId}::uuid AND wd.tenant_id = ${ctx.tenantId}::uuid
      `;

      if (!ver) {
        throw new Error("No active workflow version found for this definition");
      }

      const steps = ver.steps as any[];
      const createdBy = data.initiatorId || ctx.userId;

      // Build context: store entity info inside the context jsonb
      const instanceContext: Record<string, unknown> = {
        ...(data.contextData || {}),
      };
      if (data.entityType || data.entityId) {
        instanceContext.entity = {
          type: data.entityType,
          id: data.entityId,
        };
      }

      const [row] = await tx<WorkflowInstanceRow[]>`
        INSERT INTO app.workflow_instances (
          id, tenant_id, definition_id, version_id, status,
          context, current_step_index, created_by, started_at
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${defId}::uuid, ${ver.versionId}::uuid,
          'in_progress', ${JSON.stringify(instanceContext)}::jsonb, 0,
          ${createdBy}::uuid, now()
        )
        RETURNING *
      `;

      // Create first step as a workflow_task
      if (steps && steps.length > 0) {
        const firstStep = steps[0];
        await tx`
          INSERT INTO app.workflow_tasks (
            id, tenant_id, instance_id, step_index, step_name, status, assigned_to,
            context
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${id}::uuid,
            0, ${firstStep.name || 'Step 1'}, 'in_progress', ${createdBy}::uuid,
            ${JSON.stringify({ step_key: firstStep.stepKey, step_type: firstStep.type || firstStep.stepType })}::jsonb
          )
        `;
      }

      await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", id, "workflows.instance.started", {
        instanceId: id,
        definitionId: defId,
        entityType: data.entityType,
        entityId: data.entityId,
      });

      const result = row as WorkflowInstanceRow;
      result.workflowName = ver.name;
      return result;
    });
  }

  async getInstanceById(ctx: TenantContext, id: string): Promise<WorkflowInstanceRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowInstanceRow[]>`
        SELECT wi.*, wd.name as workflow_name
        FROM app.workflow_instances wi
        JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
        WHERE wi.id = ${id}::uuid AND wi.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as WorkflowInstanceRow) : null;
  }

  async getInstances(ctx: TenantContext, filters: {
    workflowDefinitionId?: string;
    entityType?: string;
    entityId?: string;
    status?: string;
    initiatorId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PaginatedResult<WorkflowInstanceRow>> {
    const limit = filters.limit || 20;
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowInstanceRow[]>`
        SELECT wi.*, wd.name as workflow_name
        FROM app.workflow_instances wi
        JOIN app.workflow_definitions wd ON wd.id = wi.definition_id
        WHERE wi.tenant_id = ${ctx.tenantId}::uuid
        ${filters.workflowDefinitionId ? tx`AND wi.definition_id = ${filters.workflowDefinitionId}::uuid` : tx``}
        ${filters.entityType ? tx`AND wi.context->'entity'->>'type' = ${filters.entityType}` : tx``}
        ${filters.entityId ? tx`AND wi.context->'entity'->>'id' = ${filters.entityId}` : tx``}
        ${filters.status ? tx`AND wi.status = ${filters.status}` : tx``}
        ${filters.initiatorId ? tx`AND wi.created_by = ${filters.initiatorId}::uuid` : tx``}
        ${filters.cursor ? tx`AND wi.id < ${filters.cursor}::uuid` : tx``}
        ORDER BY wi.created_at DESC, wi.id DESC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const cursor = hasMore && data.length > 0 ? data[data.length - 1]?.id ?? null : null;

    return { data: data as WorkflowInstanceRow[], cursor, hasMore };
  }

  async getMyPendingApprovals(ctx: TenantContext, userId: string): Promise<StepInstanceRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<StepInstanceRow[]>`
        SELECT wt.*, u.first_name || ' ' || u.last_name as assignee_name
        FROM app.workflow_tasks wt
        JOIN app.workflow_instances wi ON wi.id = wt.instance_id
        LEFT JOIN app.users u ON u.id = wt.assigned_to
        WHERE wi.tenant_id = ${ctx.tenantId}::uuid
          AND wt.assigned_to = ${userId}::uuid
          AND wt.status IN ('pending', 'assigned', 'in_progress')
          AND wt.context->>'step_type' = 'approval'
        ORDER BY wt.created_at ASC
      `;
      return rows as StepInstanceRow[];
    });
  }

  // ===========================================================================
  // Step Instances (workflow_tasks)
  // ===========================================================================

  async getStepInstances(ctx: TenantContext, instanceId: string): Promise<StepInstanceRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<StepInstanceRow[]>`
        SELECT wt.*, u.first_name || ' ' || u.last_name as assignee_name
        FROM app.workflow_tasks wt
        LEFT JOIN app.users u ON u.id = wt.assigned_to
        WHERE wt.instance_id = ${instanceId}::uuid
        ORDER BY wt.step_index ASC, wt.created_at ASC
      `;
      return rows as StepInstanceRow[];
    });
  }

  async processStep(ctx: TenantContext, stepId: string, data: {
    decision: string;
    comments?: string;
    processedBy: string;
  }): Promise<StepInstanceRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [step] = await tx<StepInstanceRow[]>`
        UPDATE app.workflow_tasks SET
          status = 'completed',
          completion_action = ${data.decision},
          completion_comment = ${data.comments || null},
          completed_at = now(),
          completed_by = ${data.processedBy}::uuid
        WHERE id = ${stepId}::uuid AND status IN ('pending', 'assigned', 'in_progress')
        RETURNING *
      `;

      if (step) {
        // Get instance and version steps to determine next step
        const [instance] = await tx`
          SELECT wi.*, wv.steps
          FROM app.workflow_instances wi
          JOIN app.workflow_versions wv ON wv.id = wi.version_id
          WHERE wi.id = ${step.instanceId}::uuid
        `;

        if (instance) {
          const steps = instance.steps as any[];
          const currentStepIndex = step.stepIndex;

          if (data.decision === 'approved' && currentStepIndex < steps.length - 1) {
            // Move to next step
            const nextStep = steps[currentStepIndex + 1];
            await tx`
              INSERT INTO app.workflow_tasks (
                id, tenant_id, instance_id, step_index, step_name, status, assigned_to,
                context
              ) VALUES (
                gen_random_uuid(), ${ctx.tenantId}::uuid, ${instance.id}::uuid,
                ${currentStepIndex + 1}, ${nextStep.name || `Step ${currentStepIndex + 2}`}, 'in_progress', ${data.processedBy}::uuid,
                ${JSON.stringify({ step_key: nextStep.stepKey, step_type: nextStep.type || nextStep.stepType })}::jsonb
              )
            `;
            await tx`
              UPDATE app.workflow_instances SET current_step_index = ${currentStepIndex + 1}
              WHERE id = ${instance.id}::uuid
            `;
          } else if (data.decision === 'approved') {
            // Workflow completed
            await tx`
              UPDATE app.workflow_instances SET status = 'completed', completed_at = now()
              WHERE id = ${instance.id}::uuid
            `;
            await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", instance.id, "workflows.instance.completed", {
              instanceId: instance.id,
              entityType: (instance.context as any)?.entity?.type,
              entityId: (instance.context as any)?.entity?.id,
            });
          } else if (data.decision === 'rejected') {
            // Workflow rejected — cancel it
            await tx`
              UPDATE app.workflow_instances SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${data.processedBy}::uuid
              WHERE id = ${instance.id}::uuid
            `;
            await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", instance.id, "workflows.instance.rejected", {
              instanceId: instance.id,
              entityType: (instance.context as any)?.entity?.type,
              entityId: (instance.context as any)?.entity?.id,
            });
          }
        }

        await this.writeOutbox(tx, ctx.tenantId, "workflow_step", stepId, "workflows.step.processed", {
          stepId,
          decision: data.decision,
          processedBy: data.processedBy,
        });
      }

      return step as StepInstanceRow | null;
    });
  }

  async reassignStep(ctx: TenantContext, stepId: string, newAssigneeId: string, reason?: string): Promise<StepInstanceRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [step] = await tx<StepInstanceRow[]>`
        UPDATE app.workflow_tasks SET
          assigned_to = ${newAssigneeId}::uuid,
          completion_comment = COALESCE(completion_comment || E'\n', '') || ${'Reassigned: ' + (reason || 'No reason provided')}
        WHERE id = ${stepId}::uuid AND status IN ('pending', 'assigned', 'in_progress')
        RETURNING *
      `;

      if (step) {
        await this.writeOutbox(tx, ctx.tenantId, "workflow_step", stepId, "workflows.step.reassigned", {
          stepId,
          newAssigneeId,
          reason,
        });
      }

      return step as StepInstanceRow | null;
    });
  }

  async cancelInstance(ctx: TenantContext, id: string, reason?: string): Promise<WorkflowInstanceRow | null> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const [row] = await tx<WorkflowInstanceRow[]>`
        UPDATE app.workflow_instances SET
          status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = ${ctx.userId}::uuid,
          error_message = ${reason || null}
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status IN ('pending', 'in_progress')
        RETURNING *
      `;

      if (row) {
        // Cancel all active tasks
        await tx`
          UPDATE app.workflow_tasks SET status = 'cancelled'
          WHERE instance_id = ${id}::uuid AND status IN ('pending', 'assigned', 'in_progress')
        `;

        await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", id, "workflows.instance.cancelled", {
          instanceId: id,
          reason,
        });
      }

      return row as WorkflowInstanceRow | null;
    });
  }

  // ===========================================================================
  // Outbox Helper
  // ===========================================================================

  private async writeOutbox(
    tx: TransactionSql,
    tenantId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload
      ) VALUES (
        ${crypto.randomUUID()}::uuid, ${tenantId}::uuid,
        ${aggregateType}, ${aggregateId}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb
      )
    `;
  }
}
