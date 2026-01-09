/**
 * Workflows Service
 */

import { WorkflowRepository, type TenantContext, type WorkflowDefinitionRow, type WorkflowInstanceRow, type StepInstanceRow } from "./repository";
import type { CreateWorkflowDefinition, UpdateWorkflowDefinition, CreateWorkflowInstance, ProcessStepAction, ReassignStep, WorkflowInstanceFilters } from "./schemas";

export class WorkflowService {
  constructor(private repository: WorkflowRepository) {}

  // Workflow Definitions
  async createDefinition(ctx: TenantContext, data: CreateWorkflowDefinition) {
    // Validate steps have unique keys
    const stepKeys = data.steps.map(s => s.stepKey);
    const uniqueKeys = new Set(stepKeys);
    if (uniqueKeys.size !== stepKeys.length) {
      throw new Error("VALIDATION_ERROR: Step keys must be unique");
    }

    // Validate step references
    for (const step of data.steps) {
      if (step.nextSteps) {
        for (const next of step.nextSteps) {
          if (!stepKeys.includes(next.stepKey)) {
            throw new Error(`VALIDATION_ERROR: Invalid next step reference: ${next.stepKey}`);
          }
        }
      }
    }

    const definition = await this.repository.createDefinition(ctx, {
      code: data.code,
      name: data.name,
      description: data.description,
      category: data.category,
      triggerType: data.triggerType,
      triggerConfig: data.triggerConfig as Record<string, unknown>,
      steps: data.steps as unknown as Record<string, unknown>[],
      version: data.version || 1,
    });

    return this.formatDefinition(definition);
  }

  async getDefinitionById(ctx: TenantContext, id: string) {
    const definition = await this.repository.getDefinitionById(ctx, id);
    if (!definition) {
      throw new Error("NOT_FOUND: Workflow definition not found");
    }
    return this.formatDefinition(definition);
  }

  async getDefinitionByCode(ctx: TenantContext, code: string) {
    const definition = await this.repository.getDefinitionByCode(ctx, code);
    if (!definition) {
      throw new Error("NOT_FOUND: Workflow definition not found");
    }
    return this.formatDefinition(definition);
  }

  async getDefinitions(ctx: TenantContext, filters: { category?: string; status?: string; cursor?: string; limit?: number }) {
    const result = await this.repository.getDefinitions(ctx, filters);
    return {
      data: result.data.map(d => this.formatDefinition(d)),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  async updateDefinition(ctx: TenantContext, id: string, data: UpdateWorkflowDefinition) {
    const definition = await this.repository.updateDefinition(ctx, id, {
      name: data.name,
      description: data.description,
      status: data.status,
      steps: data.steps as unknown as Record<string, unknown>[],
    });

    if (!definition) {
      throw new Error("NOT_FOUND: Workflow definition not found");
    }

    return this.formatDefinition(definition);
  }

  async activateDefinition(ctx: TenantContext, id: string) {
    const definition = await this.repository.activateDefinition(ctx, id);
    if (!definition) {
      throw new Error("NOT_FOUND: Workflow definition not found or already active");
    }
    return this.formatDefinition(definition);
  }

  // Workflow Instances
  async startWorkflow(ctx: TenantContext, data: CreateWorkflowInstance) {
    // Verify definition exists and is active
    const definition = await this.repository.getDefinitionById(ctx, data.workflowDefinitionId);
    if (!definition) {
      throw new Error("NOT_FOUND: Workflow definition not found");
    }
    if (definition.status !== "active") {
      throw new Error("VALIDATION_ERROR: Workflow definition is not active");
    }

    const instance = await this.repository.createInstance(ctx, {
      workflowDefinitionId: data.workflowDefinitionId,
      entityType: data.entityType,
      entityId: data.entityId,
      initiatorId: data.initiatorId,
      contextData: data.contextData,
    });

    return this.formatInstance(instance);
  }

  async getInstanceById(ctx: TenantContext, id: string) {
    const instance = await this.repository.getInstanceById(ctx, id);
    if (!instance) {
      throw new Error("NOT_FOUND: Workflow instance not found");
    }
    return this.formatInstance(instance);
  }

  async getInstances(ctx: TenantContext, filters: WorkflowInstanceFilters) {
    const result = await this.repository.getInstances(ctx, {
      workflowDefinitionId: filters.workflowDefinitionId,
      entityType: filters.entityType,
      entityId: filters.entityId,
      status: filters.status,
      initiatorId: filters.initiatorId,
      cursor: filters.cursor,
      limit: filters.limit,
    });

    return {
      data: result.data.map(i => this.formatInstance(i)),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }

  async getInstanceSteps(ctx: TenantContext, instanceId: string) {
    // Verify instance exists
    const instance = await this.repository.getInstanceById(ctx, instanceId);
    if (!instance) {
      throw new Error("NOT_FOUND: Workflow instance not found");
    }

    const steps = await this.repository.getStepInstances(ctx, instanceId);
    return steps.map(s => this.formatStep(s));
  }

  async getMyPendingApprovals(ctx: TenantContext, userId: string) {
    const steps = await this.repository.getMyPendingApprovals(ctx, userId);
    return steps.map(s => this.formatStep(s));
  }

  async processStep(ctx: TenantContext, stepId: string, data: ProcessStepAction, processedBy: string) {
    const step = await this.repository.processStep(ctx, stepId, {
      decision: data.decision,
      comments: data.comments,
      processedBy,
    });

    if (!step) {
      throw new Error("NOT_FOUND: Step not found or not in active state");
    }

    return this.formatStep(step);
  }

  async reassignStep(ctx: TenantContext, stepId: string, data: ReassignStep) {
    const step = await this.repository.reassignStep(ctx, stepId, data.newAssigneeId, data.reason);
    if (!step) {
      throw new Error("NOT_FOUND: Step not found or not in active state");
    }
    return this.formatStep(step);
  }

  async cancelInstance(ctx: TenantContext, id: string, reason?: string) {
    const instance = await this.repository.cancelInstance(ctx, id, reason);
    if (!instance) {
      throw new Error("NOT_FOUND: Workflow instance not found or cannot be cancelled");
    }
    return this.formatInstance(instance);
  }

  // Formatters
  private formatDefinition(row: WorkflowDefinitionRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      description: row.description,
      category: row.category,
      triggerType: row.triggerType,
      triggerConfig: row.triggerConfig,
      steps: row.steps,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private formatInstance(row: WorkflowInstanceRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      workflowDefinitionId: row.workflowDefinitionId,
      workflowName: row.workflowName,
      entityType: row.entityType,
      entityId: row.entityId,
      initiatorId: row.initiatorId,
      status: row.status,
      currentStepKey: row.currentStepKey,
      contextData: row.contextData,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() || null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private formatStep(row: StepInstanceRow) {
    return {
      id: row.id,
      workflowInstanceId: row.workflowInstanceId,
      stepKey: row.stepKey,
      stepType: row.stepType,
      stepName: row.stepName,
      status: row.status,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      dueAt: row.dueAt?.toISOString() || null,
      startedAt: row.startedAt?.toISOString() || null,
      completedAt: row.completedAt?.toISOString() || null,
      decision: row.decision,
      comments: row.comments,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
