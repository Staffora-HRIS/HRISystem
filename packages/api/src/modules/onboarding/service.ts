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
  TaskDependency,
  CreateComplianceCheck,
  UpdateComplianceCheck,
  ComplianceCheckResponse,
  CreateTemplateComplianceRequirement,
  UpdateTemplateComplianceRequirement,
  TemplateComplianceRequirementResponse,
  ComplianceDashboardResponse,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

/**
 * Error thrown when a task completion is blocked by unmet dependencies.
 * Used internally to propagate dependency violation details through transactions.
 */
class DependencyNotMetError extends Error {
  constructor(
    message: string,
    public readonly blockingTasks: { templateTaskId: string; taskName: string; status: string }[]
  ) {
    super(message);
    this.name = "DependencyNotMetError";
  }
}

/**
 * Error thrown when onboarding completion is blocked by outstanding compliance checks.
 * Used internally to propagate the violation through the transaction boundary.
 */
class ComplianceNotSatisfiedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplianceNotSatisfiedError";
  }
}

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

          // Auto-create compliance checks from template requirements (TODO-254)
          const autoCreatedChecks = await this.repository.autoCreateComplianceChecks(
            ctx, result.id, data.employeeId, data.templateId, data.startDate, tx
          );

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: result.id,
            eventType: "onboarding.started",
            payload: {
              instance: result,
              employeeId: data.employeeId,
              templateId: data.templateId,
              complianceChecksCreated: autoCreatedChecks.length,
              actor: ctx.userId,
            },
          });

          // Emit individual events for each auto-created compliance check
          for (const check of autoCreatedChecks) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "onboarding_instance",
              aggregateId: result.id,
              eventType: "onboarding.compliance_check.auto_created",
              payload: {
                onboardingId: result.id,
                checkId: check.id,
                checkType: check.checkType,
                employeeId: data.employeeId,
                actor: ctx.userId,
              },
            });
          }

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

    // Block manual completion if required compliance checks are not satisfied
    if (data.status === "completed") {
      const complianceSatisfied = await this.repository.isComplianceSatisfied(ctx, id);
      if (!complianceSatisfied) {
        return {
          success: false,
          error: {
            code: "COMPLIANCE_CHECKS_OUTSTANDING",
            message: "Cannot complete onboarding: one or more required compliance checks have not been passed or waived",
          },
        };
      }
    }

    try {
      const instance = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Re-check compliance inside the transaction for race-condition safety
          if (data.status === "completed") {
            const txComplianceSatisfied = await this.repository.isComplianceSatisfied(ctx, id, tx);
            if (!txComplianceSatisfied) {
              throw new ComplianceNotSatisfiedError(
                "Cannot complete onboarding: required compliance checks are outstanding"
              );
            }
          }

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
      if (error instanceof ComplianceNotSatisfiedError) {
        return {
          success: false,
          error: {
            code: "COMPLIANCE_CHECKS_OUTSTANDING",
            message: error.message,
          },
        };
      }
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

    // -----------------------------------------------------------------------
    // Dependency enforcement: check that all prerequisite tasks are completed
    // -----------------------------------------------------------------------
    const incompleteDeps = await this.repository.getIncompleteTaskDependencies(
      ctx,
      instanceId,
      taskId
    );

    if (incompleteDeps.length > 0) {
      const blockingNames = incompleteDeps.map((d) => d.taskName).join(", ");
      return {
        success: false,
        error: {
          code: "DEPENDENCY_NOT_MET",
          message: `Cannot complete task: the following prerequisite tasks must be completed first: ${blockingNames}`,
          details: {
            blockingTasks: incompleteDeps.map((d) => ({
              templateTaskId: d.templateTaskId,
              name: d.taskName,
              status: d.status,
            })),
          },
        },
      };
    }

    try {
      const updatedTask = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Re-check dependencies inside the transaction for race-condition safety
          const txIncompleteDeps = await this.repository.getIncompleteTaskDependencies(
            ctx,
            instanceId,
            taskId,
            tx
          );

          if (txIncompleteDeps.length > 0) {
            const blockingNames = txIncompleteDeps.map((d) => d.taskName).join(", ");
            throw new DependencyNotMetError(
              `Prerequisite tasks not completed: ${blockingNames}`,
              txIncompleteDeps
            );
          }

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
      if (error instanceof DependencyNotMetError) {
        return {
          success: false,
          error: {
            code: "DEPENDENCY_NOT_MET",
            message: error.message,
            details: {
              blockingTasks: error.blockingTasks.map((d) => ({
                templateTaskId: d.templateTaskId,
                name: d.taskName,
                status: d.status,
              })),
            },
          },
        };
      }
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
  // Task Dependency Operations
  // ===========================================================================

  /**
   * List all dependencies for a template task.
   */
  async listTaskDependencies(
    ctx: TenantContext,
    taskId: string
  ): Promise<ServiceResult<{ dependencies: TaskDependency[]; count: number }>> {
    try {
      const dependencies = await this.repository.listTaskDependencies(ctx, taskId);
      return {
        success: true,
        data: { dependencies, count: dependencies.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to list task dependencies",
        },
      };
    }
  }

  /**
   * List all dependencies for all tasks in a template.
   */
  async listTemplateDependencies(
    ctx: TenantContext,
    templateId: string
  ): Promise<ServiceResult<{ dependencies: TaskDependency[]; count: number }>> {
    const template = await this.repository.getTemplateById(ctx, templateId);
    if (!template) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding template not found",
        },
      };
    }

    try {
      const dependencies = await this.repository.listTemplateDependencies(ctx, templateId);
      return {
        success: true,
        data: { dependencies, count: dependencies.length },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to list template dependencies",
        },
      };
    }
  }

  /**
   * Add a dependency between two template tasks.
   * Validates that both tasks exist in the same template and that no circular
   * dependency would be created (the DB trigger also enforces this).
   */
  async addTaskDependency(
    ctx: TenantContext,
    data: { taskId: string; dependsOnTaskId: string }
  ): Promise<ServiceResult<TaskDependency>> {
    if (data.taskId === data.dependsOnTaskId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "A task cannot depend on itself",
        },
      };
    }

    try {
      const dependency = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.addTaskDependency(ctx, data, tx);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_template_task",
            aggregateId: data.taskId,
            eventType: "onboarding.task_dependency.added",
            payload: {
              taskId: data.taskId,
              dependsOnTaskId: data.dependsOnTaskId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: dependency };
    } catch (error: any) {
      // Handle DB-level constraint violations
      if (error.message?.includes("Circular dependency")) {
        return {
          success: false,
          error: {
            code: "CIRCULAR_DEPENDENCY",
            message: "Adding this dependency would create a circular chain",
          },
        };
      }
      if (error.message?.includes("same template")) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Both tasks must belong to the same template",
          },
        };
      }
      if (error.message?.includes("duplicate key") || error.message?.includes("unique constraint")) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "This dependency relationship already exists",
          },
        };
      }
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to add task dependency",
        },
      };
    }
  }

  /**
   * Remove a dependency between two template tasks.
   */
  async removeTaskDependency(
    ctx: TenantContext,
    taskId: string,
    dependsOnTaskId: string
  ): Promise<ServiceResult<{ removed: boolean }>> {
    try {
      const removed = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.removeTaskDependency(
            ctx,
            taskId,
            dependsOnTaskId,
            tx
          );

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "onboarding_template_task",
              aggregateId: taskId,
              eventType: "onboarding.task_dependency.removed",
              payload: {
                taskId,
                dependsOnTaskId,
                actor: ctx.userId,
              },
            });
          }

          return result;
        }
      );

      if (!removed) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Dependency relationship not found",
          },
        };
      }

      return { success: true, data: { removed: true } };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: error.message || "Failed to remove task dependency",
        },
      };
    }
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
  ): Promise<ServiceResult<{ items: ComplianceCheckResponse[]; complianceSatisfied: boolean }>> {
    const instance = await this.repository.getInstanceById(ctx, onboardingId);
    if (!instance) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    const result = await this.repository.listComplianceChecks(ctx, onboardingId);
    return { success: true, data: result };
  }

  /**
   * Create a compliance check for an onboarding instance.
   */
  async createComplianceCheck(
    ctx: TenantContext,
    onboardingId: string,
    data: CreateComplianceCheck
  ): Promise<ServiceResult<ComplianceCheckResponse>> {
    const instance = await this.repository.getInstanceById(ctx, onboardingId);
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
          message: `Cannot add compliance checks to a ${instance.status} onboarding`,
        },
      };
    }

    try {
      const check = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createComplianceCheck(
            ctx,
            onboardingId,
            instance.employeeId,
            data,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: onboardingId,
            eventType: "onboarding.compliance_check.created",
            payload: {
              onboardingId,
              checkId: result.id,
              checkType: data.checkType,
              employeeId: instance.employeeId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: check };
    } catch (error: any) {
      // Handle unique constraint violation (duplicate check type)
      if (error.message?.includes("unique constraint") || error.message?.includes("duplicate key")) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: `A ${data.checkType} compliance check already exists for this onboarding`,
          },
        };
      }
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create compliance check",
        },
      };
    }
  }

  /**
   * Update a compliance check (status, notes, etc.).
   * When a check transitions to passed/waived, the service re-evaluates
   * whether the entire onboarding can auto-complete.
   */
  async updateComplianceCheck(
    ctx: TenantContext,
    onboardingId: string,
    checkId: string,
    data: UpdateComplianceCheck
  ): Promise<ServiceResult<ComplianceCheckResponse>> {
    const instance = await this.repository.getInstanceById(ctx, onboardingId);
    if (!instance) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Onboarding instance not found",
        },
      };
    }

    const existing = await this.repository.getComplianceCheckById(ctx, checkId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Compliance check not found",
        },
      };
    }

    if (existing.onboardingId !== onboardingId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Compliance check does not belong to this onboarding",
        },
      };
    }

    // Waiver requires a reason
    if (data.status === "waived" && !data.waiverReason) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "A waiver reason is required when waiving a compliance check",
        },
      };
    }

    try {
      const updated = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateComplianceCheck(ctx, checkId, data, tx);

          if (!result) {
            return null;
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "onboarding_instance",
            aggregateId: onboardingId,
            eventType: "onboarding.compliance_check.updated",
            payload: {
              onboardingId,
              checkId,
              checkType: existing.checkType,
              previousStatus: existing.status,
              newStatus: result.status,
              employeeId: instance.employeeId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update compliance check",
          },
        };
      }

      return { success: true, data: updated };
    } catch (error: any) {
      // Handle DB-level status transition violations
      if (error.message?.includes("Invalid compliance check status transition")) {
        return {
          success: false,
          error: {
            code: "STATE_MACHINE_VIOLATION",
            message: error.message,
          },
        };
      }
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update compliance check",
        },
      };
    }
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
