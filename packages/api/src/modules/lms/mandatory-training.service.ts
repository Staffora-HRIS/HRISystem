/**
 * Mandatory Training - Service Layer
 *
 * Business logic for mandatory training rules and assignments.
 * Handles validation, bulk assignment, and outbox events.
 */

import type { TransactionSql } from "postgres";
import type { TenantContext } from "../../types/service-result";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { MandatoryTrainingRepository, type PaginationOptions } from "./mandatory-training.repository";
import type {
  CreateMandatoryTrainingRule,
  UpdateMandatoryTrainingRule,
  MandatoryTrainingRuleResponse,
  MandatoryTrainingAssignmentResponse,
  BulkAssignResponse,
} from "./mandatory-training.schemas";

export class MandatoryTrainingService {
  constructor(
    private repository: MandatoryTrainingRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Rule Operations
  // ===========================================================================

  async listRules(
    ctx: TenantContext,
    filters: {
      courseId?: string;
      appliesTo?: string;
      isActive?: boolean;
    },
    pagination: PaginationOptions
  ) {
    return this.repository.listRules(ctx, filters, pagination);
  }

  async getRule(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<MandatoryTrainingRuleResponse>> {
    const rule = await this.repository.getRuleById(ctx, id);

    if (!rule) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Mandatory training rule not found",
        },
      };
    }

    return { success: true, data: rule };
  }

  async createRule(
    ctx: TenantContext,
    data: CreateMandatoryTrainingRule
  ): Promise<ServiceResult<MandatoryTrainingRuleResponse>> {
    // Validate escalation_days < deadline_days
    if (data.escalationDays >= data.deadlineDays) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Escalation days must be less than deadline days",
        },
      };
    }

    // Validate department_id when applies_to = 'department'
    if (data.appliesTo === "department" && !data.departmentId) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Department ID is required when applies_to is 'department'",
        },
      };
    }

    // Validate role when applies_to = 'role'
    if (data.appliesTo === "role" && !data.role) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Role is required when applies_to is 'role'",
        },
      };
    }

    try {
      const rule = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createRule(ctx, data, tx);

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "mandatory_training_rule",
            aggregateId: result.id,
            eventType: "lms.mandatory_training_rule.created",
            payload: { rule: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: rule };
    } catch (error: any) {
      // Check for unique constraint violation (duplicate rule)
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        return {
          success: false,
          error: {
            code: "CONFLICT",
            message: "A mandatory training rule for this course and scope already exists",
          },
        };
      }

      // Check for foreign key violation (invalid course_id or department_id)
      if (error.code === "23503") {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Referenced course or department does not exist",
          },
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to create mandatory training rule",
        },
      };
    }
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    data: UpdateMandatoryTrainingRule
  ): Promise<ServiceResult<MandatoryTrainingRuleResponse>> {
    const existing = await this.repository.getRuleById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Mandatory training rule not found",
        },
      };
    }

    // Validate escalation_days < deadline_days with merged values
    const effectiveDeadlineDays = data.deadlineDays ?? existing.deadlineDays;
    const effectiveEscalationDays = data.escalationDays ?? existing.escalationDays;
    if (effectiveEscalationDays >= effectiveDeadlineDays) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Escalation days must be less than deadline days",
        },
      };
    }

    try {
      const rule = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateRule(ctx, id, data, tx);

          if (!result) return null;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "mandatory_training_rule",
            aggregateId: id,
            eventType: "lms.mandatory_training_rule.updated",
            payload: {
              rule: result,
              previousValues: existing,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!rule) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Failed to update mandatory training rule",
          },
        };
      }

      return { success: true, data: rule };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to update mandatory training rule",
        },
      };
    }
  }

  async deleteRule(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<boolean>> {
    const existing = await this.repository.getRuleById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Mandatory training rule not found",
        },
      };
    }

    try {
      const deleted = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.deleteRule(ctx, id, tx);

          if (result) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "mandatory_training_rule",
              aggregateId: id,
              eventType: "lms.mandatory_training_rule.deleted",
              payload: { ruleId: id, rule: existing, actor: ctx.userId },
            });
          }

          return result;
        }
      );

      return { success: deleted, data: deleted };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to delete mandatory training rule",
        },
      };
    }
  }

  // ===========================================================================
  // Assignment Operations
  // ===========================================================================

  async listAssignments(
    ctx: TenantContext,
    filters: {
      ruleId?: string;
      employeeId?: string;
      courseId?: string;
      status?: string;
    },
    pagination: PaginationOptions
  ) {
    return this.repository.listAssignments(ctx, filters, pagination);
  }

  /**
   * Bulk assign a mandatory training rule to all matching employees.
   * Skips employees who already have an active assignment for this rule.
   */
  async bulkAssign(
    ctx: TenantContext,
    ruleId: string
  ): Promise<ServiceResult<BulkAssignResponse>> {
    const rule = await this.repository.getRuleById(ctx, ruleId);
    if (!rule) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Mandatory training rule not found",
        },
      };
    }

    if (!rule.isActive) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Cannot assign from an inactive rule",
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Find all matching employees
          const employees = await this.repository.findMatchingEmployees(
            ctx,
            {
              appliesTo: rule.appliesTo,
              departmentId: rule.departmentId,
              role: rule.role,
            },
            tx
          );

          const assignments: MandatoryTrainingAssignmentResponse[] = [];
          let skippedCount = 0;

          for (const employee of employees) {
            // Check for existing active assignment
            const hasActive = await this.repository.hasActiveAssignment(
              ctx,
              ruleId,
              employee.id,
              tx
            );

            if (hasActive) {
              skippedCount++;
              continue;
            }

            // Calculate deadline
            const deadlineAt = new Date();
            deadlineAt.setDate(deadlineAt.getDate() + rule.deadlineDays);

            const assignment = await this.repository.createAssignment(
              ctx,
              {
                ruleId,
                employeeId: employee.id,
                courseId: rule.courseId,
                deadlineAt,
              },
              tx
            );

            assignments.push(assignment);
          }

          // Emit bulk assignment event
          if (assignments.length > 0) {
            await this.emitDomainEvent(tx, ctx, {
              aggregateType: "mandatory_training_rule",
              aggregateId: ruleId,
              eventType: "lms.mandatory_training.bulk_assigned",
              payload: {
                ruleId,
                courseId: rule.courseId,
                assignedCount: assignments.length,
                skippedCount,
                assignmentIds: assignments.map((a) => a.id),
                actor: ctx.userId,
              },
            });
          }

          return {
            assignedCount: assignments.length,
            skippedCount,
            assignments,
          };
        }
      );

      return { success: true, data: result };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error.message || "Failed to bulk assign mandatory training",
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
