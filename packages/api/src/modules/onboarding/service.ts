/**
 * Onboarding Module - Service Layer
 *
 * Business logic for Employee Onboarding.
 * Handles validation, task workflows, and domain events.
 */

import type { TransactionSql } from "postgres";
import { OnboardingRepository, type TenantContext, type PaginationOptions } from "./repository";
import type {
  CreateTemplate,
  UpdateTemplate,
  TemplateResponse,
  CreateInstance,
  UpdateInstance,
  InstanceResponse,
  InstanceTask,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

export class OnboardingService {
  constructor(
    private repository: OnboardingRepository,
    private db: any
  ) {}

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
  ) {
    return this.repository.listTemplates(ctx, filters, pagination);
  }

  async getTemplate(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<TemplateResponse & { tasks: any[] }>> {
    const template = await this.repository.getTemplateById(ctx, id);

    if (!template) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding template not found",
        },
      };
    }

    return { success: true, data: template };
  }

  async createTemplate(
    ctx: TenantContext,
    data: CreateTemplate,
    idempotencyKey?: string
  ): Promise<ServiceResult<TemplateResponse>> {
    try {
      const template = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createTemplate(ctx, data, tx);

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_template",
            aggregateId: result.id,
            eventType: "onboarding.template.created",
            payload: {
              template: result,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: template };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create template",
        },
      };
    }
  }

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    data: UpdateTemplate,
    idempotencyKey?: string
  ): Promise<ServiceResult<TemplateResponse>> {
    const existing = await this.repository.getTemplateById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding template not found",
        },
      };
    }

    try {
      const template = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateTemplate(ctx, id, data, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_template",
            aggregateId: id,
            eventType: "onboarding.template.updated",
            payload: {
              template: result,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!template) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update template",
          },
        };
      }

      return { success: true, data: template };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update template",
        },
      };
    }
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
  ) {
    return this.repository.listInstances(ctx, filters, pagination);
  }

  async getInstance(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<InstanceResponse & { tasks: InstanceTask[] }>> {
    const instance = await this.repository.getInstanceById(ctx, id);

    if (!instance) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    return { success: true, data: instance };
  }

  async getMyOnboarding(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<(InstanceResponse & { tasks: InstanceTask[] }) | null>> {
    const instance = await this.repository.getEmployeeOnboarding(ctx, employeeId);
    return { success: true, data: instance };
  }

  async startOnboarding(
    ctx: TenantContext,
    data: CreateInstance,
    idempotencyKey?: string
  ): Promise<ServiceResult<InstanceResponse>> {
    // Get template with tasks
    const template = await this.repository.getTemplateById(ctx, data.templateId);
    if (!template) {
      return {
        success: false,
        error: {
          code: "TEMPLATE_NOT_FOUND",
          message: "Onboarding template not found",
        },
      };
    }

    if (template.status !== "active") {
      return {
        success: false,
        error: {
          code: "TEMPLATE_INACTIVE",
          message: "Cannot use an inactive template",
        },
      };
    }

    // Check if employee already has active onboarding
    const existingOnboarding = await this.repository.getEmployeeOnboarding(
      ctx,
      data.employeeId
    );
    if (existingOnboarding) {
      return {
        success: false,
        error: {
          code: "ALREADY_ONBOARDING",
          message: "Employee already has an active onboarding process",
        },
      };
    }

    try {
      const instance = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createInstance(ctx, data, template.tasks || [], tx);

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: result.id,
            eventType: "onboarding.started",
            payload: {
              instance: result,
              employeeId: data.employeeId,
              templateId: data.templateId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: instance };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "START_FAILED",
          message: error.message || "Failed to start onboarding",
        },
      };
    }
  }

  async updateInstance(
    ctx: TenantContext,
    id: string,
    data: UpdateInstance,
    idempotencyKey?: string
  ): Promise<ServiceResult<InstanceResponse>> {
    const existing = await this.repository.getInstanceById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    if (["completed", "cancelled"].includes(existing.status)) {
      return {
        success: false,
        error: {
          code: "INSTANCE_CLOSED",
          message: `Cannot update a ${existing.status} onboarding`,
        },
      };
    }

    try {
      const instance = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateInstance(ctx, id, data, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: id,
            eventType: "onboarding.updated",
            payload: {
              instanceId: id,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!instance) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update onboarding instance",
          },
        };
      }

      return { success: true, data: instance };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update onboarding",
        },
      };
    }
  }

  // ===========================================================================
  // Task Operations
  // ===========================================================================

  async completeTask(
    ctx: TenantContext,
    instanceId: string,
    taskId: string,
    notes?: string,
    formData?: Record<string, unknown>
  ): Promise<ServiceResult<InstanceTask>> {
    const instance = await this.repository.getInstanceById(ctx, instanceId);
    if (!instance) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    if (["completed", "cancelled"].includes(instance.status)) {
      return {
        success: false,
        error: {
          code: "INSTANCE_CLOSED",
          message: "Cannot complete tasks on a closed onboarding",
        },
      };
    }

    const task = instance.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      return {
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found in this onboarding",
        },
      };
    }

    if (task.status === "completed") {
      return {
        success: false,
        error: {
          code: "ALREADY_COMPLETED",
          message: "Task is already completed",
        },
      };
    }

    try {
      const updatedTask = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.completeTask(
            ctx,
            instanceId,
            taskId,
            notes,
            formData,
            tx
          );

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: instanceId,
            eventType: "onboarding.task.completed",
            payload: {
              instanceId,
              taskId,
              employeeId: instance.employeeId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updatedTask) {
        return {
          success: false,
          error: {
            code: "COMPLETE_FAILED",
            message: "Failed to complete task",
          },
        };
      }

      return { success: true, data: updatedTask };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "COMPLETE_FAILED",
          message: error.message || "Failed to complete task",
        },
      };
    }
  }

  async skipTask(
    ctx: TenantContext,
    instanceId: string,
    taskId: string,
    reason: string
  ): Promise<ServiceResult<InstanceTask>> {
    const instance = await this.repository.getInstanceById(ctx, instanceId);
    if (!instance) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    const task = instance.tasks.find((t) => t.taskId === taskId);
    if (!task) {
      return {
        success: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: "Task not found in this onboarding",
        },
      };
    }

    if (task.required) {
      return {
        success: false,
        error: {
          code: "CANNOT_SKIP_REQUIRED",
          message: "Cannot skip a required task",
        },
      };
    }

    try {
      const updatedTask = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.skipTask(ctx, instanceId, taskId, reason, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: instanceId,
            eventType: "onboarding.task.skipped",
            payload: {
              instanceId,
              taskId,
              reason,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updatedTask) {
        return {
          success: false,
          error: {
            code: "SKIP_FAILED",
            message: "Failed to skip task",
          },
        };
      }

      return { success: true, data: updatedTask };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "SKIP_FAILED",
          message: error.message || "Failed to skip task",
        },
      };
    }
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getAnalytics(ctx: TenantContext) {
    return this.repository.getOnboardingAnalytics(ctx);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }
}
