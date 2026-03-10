/**
 * Workflows Repository
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
  category: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  steps: Record<string, unknown>[];
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowInstanceRow {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  workflowName: string;
  entityType: string;
  entityId: string;
  initiatorId: string;
  status: string;
  currentStepKey: string | null;
  contextData: Record<string, unknown> | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StepInstanceRow {
  id: string;
  workflowInstanceId: string;
  stepKey: string;
  stepType: string;
  stepName: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  decision: string | null;
  comments: string | null;
  createdAt: Date;
}

export class WorkflowRepository {
  constructor(private db: DatabaseClient) {}

  // Workflow Definitions
  async createDefinition(ctx: TenantContext, data: Partial<WorkflowDefinitionRow>): Promise<WorkflowDefinitionRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      const [row] = await tx<WorkflowDefinitionRow[]>`
        INSERT INTO app.workflow_definitions (
          id, tenant_id, code, name, description, category,
          trigger_type, trigger_config, steps, status, version
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.code}, ${data.name},
          ${data.description || null}, ${data.category},
          ${data.triggerType}, ${data.triggerConfig ? JSON.stringify(data.triggerConfig) : null}::jsonb,
          ${JSON.stringify(data.steps || [])}::jsonb, 'draft', ${data.version || 1}
        )
        RETURNING *
      `;

      await this.writeOutbox(tx, ctx.tenantId, "workflow_definition", id, "workflows.definition.created", { definitionId: id });
      return row as WorkflowDefinitionRow;
    });
  }

  async getDefinitionById(ctx: TenantContext, id: string): Promise<WorkflowDefinitionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT * FROM app.workflow_definitions
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as WorkflowDefinitionRow) : null;
  }

  async getDefinitionByCode(ctx: TenantContext, code: string): Promise<WorkflowDefinitionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT * FROM app.workflow_definitions
        WHERE code = ${code} AND tenant_id = ${ctx.tenantId}::uuid AND status = 'active'
        ORDER BY version DESC LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as WorkflowDefinitionRow) : null;
  }

  async getDefinitions(ctx: TenantContext, filters: { category?: string; status?: string; cursor?: string; limit?: number }): Promise<PaginatedResult<WorkflowDefinitionRow>> {
    const limit = filters.limit || 20;
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowDefinitionRow[]>`
        SELECT * FROM app.workflow_definitions
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.category ? tx`AND category = ${filters.category}` : tx``}
        ${filters.status ? tx`AND status = ${filters.status}` : tx``}
        ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY created_at DESC, id DESC
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
          status = COALESCE(${data.status}, status),
          steps = COALESCE(${data.steps ? JSON.stringify(data.steps) : null}::jsonb, steps),
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
        UPDATE app.workflow_definitions SET status = 'active', updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'draft'
        RETURNING *
      `;
      if (row) {
        await this.writeOutbox(tx, ctx.tenantId, "workflow_definition", id, "workflows.definition.activated", { definitionId: id });
      }
      return row as WorkflowDefinitionRow | null;
    });
  }

  // Workflow Instances
  async createInstance(ctx: TenantContext, data: {
    workflowDefinitionId: string;
    entityType: string;
    entityId: string;
    initiatorId: string;
    contextData?: Record<string, unknown>;
  }): Promise<WorkflowInstanceRow> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const id = crypto.randomUUID();
      
      // Get workflow definition
      const [def] = await tx<WorkflowDefinitionRow[]>`
        SELECT name, steps FROM app.workflow_definitions WHERE id = ${data.workflowDefinitionId}::uuid
      `;
      
      const firstStepKey = (def?.steps as any[])?.[0]?.stepKey || null;

      const [row] = await tx<WorkflowInstanceRow[]>`
        INSERT INTO app.workflow_instances (
          id, tenant_id, workflow_definition_id, entity_type, entity_id,
          initiator_id, status, current_step_key, context_data, started_at
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.workflowDefinitionId}::uuid,
          ${data.entityType}, ${data.entityId}::uuid, ${data.initiatorId}::uuid,
          'in_progress', ${firstStepKey}, ${data.contextData ? JSON.stringify(data.contextData) : null}::jsonb, now()
        )
        RETURNING *, (SELECT name FROM app.workflow_definitions WHERE id = workflow_definition_id) as workflow_name
      `;

      // Create first step instance
      if (def?.steps && (def.steps as any[]).length > 0) {
        const firstStep = (def.steps as any[])[0];
        await tx`
          INSERT INTO app.workflow_step_instances (
            id, workflow_instance_id, step_key, step_type, step_name, status, started_at
          ) VALUES (
            gen_random_uuid(), ${id}::uuid, ${firstStep.stepKey}, ${firstStep.stepType},
            ${firstStep.name}, 'active', now()
          )
        `;
      }

      await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", id, "workflows.instance.started", {
        instanceId: id,
        definitionId: data.workflowDefinitionId,
        entityType: data.entityType,
        entityId: data.entityId,
      });

      return row as WorkflowInstanceRow;
    });
  }

  async getInstanceById(ctx: TenantContext, id: string): Promise<WorkflowInstanceRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<WorkflowInstanceRow[]>`
        SELECT wi.*, wd.name as workflow_name
        FROM app.workflow_instances wi
        JOIN app.workflow_definitions wd ON wd.id = wi.workflow_definition_id
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
        JOIN app.workflow_definitions wd ON wd.id = wi.workflow_definition_id
        WHERE wi.tenant_id = ${ctx.tenantId}::uuid
        ${filters.workflowDefinitionId ? tx`AND wi.workflow_definition_id = ${filters.workflowDefinitionId}::uuid` : tx``}
        ${filters.entityType ? tx`AND wi.entity_type = ${filters.entityType}` : tx``}
        ${filters.entityId ? tx`AND wi.entity_id = ${filters.entityId}::uuid` : tx``}
        ${filters.status ? tx`AND wi.status = ${filters.status}` : tx``}
        ${filters.initiatorId ? tx`AND wi.initiator_id = ${filters.initiatorId}::uuid` : tx``}
        ${filters.cursor ? tx`AND wi.id < ${filters.cursor}::uuid` : tx``}
        ORDER BY wi.started_at DESC, wi.id DESC
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
        SELECT wsi.*, u.first_name || ' ' || u.last_name as assignee_name
        FROM app.workflow_step_instances wsi
        JOIN app.workflow_instances wi ON wi.id = wsi.workflow_instance_id
        LEFT JOIN app.users u ON u.id = wsi.assignee_id
        WHERE wi.tenant_id = ${ctx.tenantId}::uuid
          AND wsi.assignee_id = ${userId}::uuid
          AND wsi.status = 'active'
          AND wsi.step_type = 'approval'
        ORDER BY wsi.created_at ASC
      `;
      return rows as StepInstanceRow[];
    });
  }

  // Step Instances
  async getStepInstances(ctx: TenantContext, instanceId: string): Promise<StepInstanceRow[]> {
    return this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      const rows = await tx<StepInstanceRow[]>`
        SELECT wsi.*, u.first_name || ' ' || u.last_name as assignee_name
        FROM app.workflow_step_instances wsi
        LEFT JOIN app.users u ON u.id = wsi.assignee_id
        WHERE wsi.workflow_instance_id = ${instanceId}::uuid
        ORDER BY wsi.created_at ASC
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
        UPDATE app.workflow_step_instances SET
          status = 'completed',
          decision = ${data.decision},
          comments = ${data.comments || null},
          completed_at = now()
        WHERE id = ${stepId}::uuid AND status = 'active'
        RETURNING *
      `;

      if (step) {
        // Get instance and definition to determine next step
        const [instance] = await tx<WorkflowInstanceRow[]>`
          SELECT wi.*, wd.steps FROM app.workflow_instances wi
          JOIN app.workflow_definitions wd ON wd.id = wi.workflow_definition_id
          WHERE wi.id = ${step.workflowInstanceId}::uuid
        `;

        if (instance) {
          const steps = (instance as any).steps as any[];
          const currentStepIndex = steps.findIndex((s: any) => s.stepKey === step.stepKey);
          
          if (data.decision === 'approved' && currentStepIndex < steps.length - 1) {
            // Move to next step
            const nextStep = steps[currentStepIndex + 1];
            await tx`
              INSERT INTO app.workflow_step_instances (
                id, workflow_instance_id, step_key, step_type, step_name, status, started_at
              ) VALUES (
                gen_random_uuid(), ${instance.id}::uuid, ${nextStep.stepKey}, ${nextStep.stepType},
                ${nextStep.name}, 'active', now()
              )
            `;
            await tx`
              UPDATE app.workflow_instances SET current_step_key = ${nextStep.stepKey}, updated_at = now()
              WHERE id = ${instance.id}::uuid
            `;
          } else if (data.decision === 'approved') {
            // Workflow completed
            await tx`
              UPDATE app.workflow_instances SET status = 'completed', completed_at = now(), updated_at = now()
              WHERE id = ${instance.id}::uuid
            `;
            await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", instance.id, "workflows.instance.completed", {
              instanceId: instance.id,
              entityType: instance.entityType,
              entityId: instance.entityId,
            });
          } else if (data.decision === 'rejected') {
            // Workflow rejected
            await tx`
              UPDATE app.workflow_instances SET status = 'cancelled', completed_at = now(), updated_at = now()
              WHERE id = ${instance.id}::uuid
            `;
            await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", instance.id, "workflows.instance.rejected", {
              instanceId: instance.id,
              entityType: instance.entityType,
              entityId: instance.entityId,
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
        UPDATE app.workflow_step_instances SET
          assignee_id = ${newAssigneeId}::uuid,
          comments = COALESCE(comments || E'\n', '') || ${'Reassigned: ' + (reason || 'No reason provided')}
        WHERE id = ${stepId}::uuid AND status = 'active'
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
          completed_at = now(),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status IN ('pending', 'in_progress')
        RETURNING *
      `;

      if (row) {
        // Cancel all active steps
        await tx`
          UPDATE app.workflow_step_instances SET status = 'skipped'
          WHERE workflow_instance_id = ${id}::uuid AND status IN ('pending', 'active')
        `;

        await this.writeOutbox(tx, ctx.tenantId, "workflow_instance", id, "workflows.instance.cancelled", {
          instanceId: id,
          reason,
        });
      }

      return row as WorkflowInstanceRow | null;
    });
  }

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
