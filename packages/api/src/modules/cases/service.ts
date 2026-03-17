/**
 * Cases Module - Service Layer
 *
 * Business logic for HR Case Management.
 * Handles validation, state transitions, and domain events.
 */

import type { TransactionSql } from "postgres";
import { CasesRepository, type TenantContext, type PaginationOptions } from "./repository";
import type {
  CreateCase,
  UpdateCase,
  CaseResponse,
  CreateComment,
  CommentResponse,
  CaseStatus,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// Valid state transitions for case status
const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["in_progress", "pending_info", "escalated", "resolved", "cancelled"],
  in_progress: ["pending_info", "escalated", "resolved", "cancelled"],
  pending_info: ["in_progress", "escalated", "resolved", "cancelled"],
  escalated: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "in_progress", "appealed"], // Can reopen or appeal
  appealed: ["in_progress", "resolved", "closed"], // Appeal review can reopen, uphold, or close
  closed: [], // Terminal state
  cancelled: [], // Terminal state
};

export class CasesService {
  constructor(
    private repository: CasesRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Case Operations
  // ===========================================================================

  async listCases(
    ctx: TenantContext,
    filters: {
      category?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      requesterId?: string;
      isOverdue?: boolean;
      search?: string;
    },
    pagination: PaginationOptions
  ) {
    return this.repository.listCases(ctx, filters, pagination);
  }

  async getCase(ctx: TenantContext, id: string): Promise<ServiceResult<CaseResponse>> {
    const hrCase = await this.repository.getCaseById(ctx, id);

    if (!hrCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    return { success: true, data: hrCase };
  }

  async getCaseByNumber(
    ctx: TenantContext,
    caseNumber: string
  ): Promise<ServiceResult<CaseResponse>> {
    const hrCase = await this.repository.getCaseByNumber(ctx, caseNumber);

    if (!hrCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    return { success: true, data: hrCase };
  }

  async getMyCases(ctx: TenantContext, employeeId: string): Promise<CaseResponse[]> {
    return this.repository.getEmployeeCases(ctx, employeeId);
  }

  async createCase(
    ctx: TenantContext,
    data: CreateCase,
    idempotencyKey?: string
  ): Promise<ServiceResult<CaseResponse>> {
    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createCase(ctx, data, tx);

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: result.id,
            eventType: "cases.case.created",
            payload: {
              case: result,
              requesterId: data.requesterId,
              category: data.category,
              priority: data.priority || "medium",
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create case",
        },
      };
    }
  }

  async updateCase(
    ctx: TenantContext,
    id: string,
    data: UpdateCase,
    idempotencyKey?: string
  ): Promise<ServiceResult<CaseResponse>> {
    const existing = await this.repository.getCaseById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    // Validate status transition if status is being changed
    if (data.status && data.status !== existing.status) {
      const validTransitions = VALID_TRANSITIONS[existing.status as CaseStatus] || [];
      if (!validTransitions.includes(data.status as CaseStatus)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition from ${existing.status} to ${data.status}`,
            details: { validTransitions },
          },
        };
      }
    }

    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateCase(ctx, id, data, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: id,
            eventType: "cases.case.updated",
            payload: {
              case: result,
              previousStatus: existing.status,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update case",
          },
        };
      }

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update case",
        },
      };
    }
  }

  async assignCase(
    ctx: TenantContext,
    id: string,
    assigneeId: string,
    note?: string
  ): Promise<ServiceResult<CaseResponse>> {
    const existing = await this.repository.getCaseById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    if (["closed", "cancelled"].includes(existing.status)) {
      return {
        success: false,
        error: {
          code: "CASE_CLOSED",
          message: "Cannot assign a closed or cancelled case",
        },
      };
    }

    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.assignCase(ctx, id, assigneeId, tx);

          if (!result) {
            return null;
          }

          // Add assignment comment if note provided
          if (note) {
            await this.repository.createComment(ctx, id, {
              content: `Case assigned: ${note}`,
              isInternal: true,
            }, tx);
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: id,
            eventType: "cases.case.assigned",
            payload: {
              caseId: id,
              assigneeId,
              previousAssigneeId: existing.assigneeId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "ASSIGN_FAILED",
            message: "Failed to assign case",
          },
        };
      }

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "ASSIGN_FAILED",
          message: error.message || "Failed to assign case",
        },
      };
    }
  }

  async escalateCase(
    ctx: TenantContext,
    id: string,
    reason: string,
    escalateTo?: string
  ): Promise<ServiceResult<CaseResponse>> {
    const existing = await this.repository.getCaseById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    if (["closed", "cancelled", "resolved"].includes(existing.status)) {
      return {
        success: false,
        error: {
          code: "CANNOT_ESCALATE",
          message: `Cannot escalate a ${existing.status} case`,
        },
      };
    }

    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.escalateCase(ctx, id, escalateTo, tx);

          if (!result) {
            return null;
          }

          // Add escalation comment
          await this.repository.createComment(ctx, id, {
            content: `Case escalated: ${reason}`,
            isInternal: true,
          }, tx);

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: id,
            eventType: "cases.case.escalated",
            payload: {
              caseId: id,
              reason,
              escalateTo,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "ESCALATE_FAILED",
            message: "Failed to escalate case",
          },
        };
      }

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "ESCALATE_FAILED",
          message: error.message || "Failed to escalate case",
        },
      };
    }
  }

  async resolveCase(
    ctx: TenantContext,
    id: string,
    resolution: string
  ): Promise<ServiceResult<CaseResponse>> {
    const existing = await this.repository.getCaseById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    if (["closed", "cancelled"].includes(existing.status)) {
      return {
        success: false,
        error: {
          code: "CANNOT_RESOLVE",
          message: `Cannot resolve a ${existing.status} case`,
        },
      };
    }

    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.resolveCase(ctx, id, resolution, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: id,
            eventType: "cases.case.resolved",
            payload: {
              caseId: id,
              resolution,
              requesterId: existing.requesterId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "RESOLVE_FAILED",
            message: "Failed to resolve case",
          },
        };
      }

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "RESOLVE_FAILED",
          message: error.message || "Failed to resolve case",
        },
      };
    }
  }

  async closeCase(ctx: TenantContext, id: string): Promise<ServiceResult<CaseResponse>> {
    const existing = await this.repository.getCaseById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    if (existing.status !== "resolved") {
      return {
        success: false,
        error: {
          code: "CANNOT_CLOSE",
          message: "Case must be resolved before closing",
        },
      };
    }

    try {
      const hrCase = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.closeCase(ctx, id, tx);

          if (!result) {
            return null;
          }

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: id,
            eventType: "cases.case.closed",
            payload: {
              caseId: id,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "CLOSE_FAILED",
            message: "Failed to close case",
          },
        };
      }

      return { success: true, data: hrCase };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CLOSE_FAILED",
          message: error.message || "Failed to close case",
        },
      };
    }
  }

  // ===========================================================================
  // Comment Operations
  // ===========================================================================

  async listComments(ctx: TenantContext, caseId: string): Promise<CommentResponse[]> {
    return this.repository.listComments(ctx, caseId);
  }

  async addComment(
    ctx: TenantContext,
    caseId: string,
    data: CreateComment
  ): Promise<ServiceResult<CommentResponse>> {
    const hrCase = await this.repository.getCaseById(ctx, caseId);
    if (!hrCase) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Case not found",
        },
      };
    }

    if (["closed", "cancelled"].includes(hrCase.status)) {
      return {
        success: false,
        error: {
          code: "CASE_CLOSED",
          message: "Cannot add comments to a closed or cancelled case",
        },
      };
    }

    try {
      const comment = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createComment(ctx, caseId, data, tx);

          // Emit domain event atomically within the same transaction
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: caseId,
            eventType: "cases.comment.added",
            payload: {
              caseId,
              commentId: result.id,
              isInternal: data.isInternal || false,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: comment };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "COMMENT_FAILED",
          message: error.message || "Failed to add comment",
        },
      };
    }
  }

  // ===========================================================================
  // Appeal Operations
  // ===========================================================================

  /**
   * File an appeal against a resolved case.
   * Only the original requester can appeal, and only resolved cases can be appealed.
   */
  async fileAppeal(
    ctx: TenantContext,
    caseId: string,
    data: { reason: string; appealReviewerId?: string }
  ): Promise<ServiceResult<any>> {
    const hrCase = await this.repository.getCaseById(ctx, caseId);
    if (!hrCase) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Case not found" } };
    }

    if (hrCase.status !== "resolved") {
      return {
        success: false,
        error: { code: "INVALID_STATUS", message: "Only resolved cases can be appealed" },
      };
    }

    if (hrCase.requesterId !== ctx.userId) {
      return {
        success: false,
        error: { code: ErrorCodes.FORBIDDEN, message: "Only the case requester can file an appeal" },
      };
    }

    try {
      const appeal = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Create the appeal record
          const [row] = await tx<Array<Record<string, any>>>`
            INSERT INTO app.case_appeals (
              id, tenant_id, case_id, appealed_by, reason, reviewer_id, status, created_at
            ) VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid, ${caseId}::uuid,
              ${ctx.userId}::uuid, ${data.reason},
              ${data.appealReviewerId ?? null}::uuid,
              'pending', now()
            )
            RETURNING id, case_id, appealed_by, reason, reviewer_id, status, outcome, decided_at, created_at
          `;

          // Transition case to appealed status
          await tx`
            UPDATE app.cases
            SET status = 'appealed', updated_at = now()
            WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          `;

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: caseId,
            eventType: "cases.appealed",
            payload: {
              caseId,
              appealId: row.id,
              appealedBy: ctx.userId,
              reviewerId: data.appealReviewerId ?? null,
            },
          });

          return row;
        }
      );

      return {
        success: true,
        data: {
          id: appeal.id,
          caseId: appeal.caseId ?? appeal.case_id,
          appealedBy: appeal.appealedBy ?? appeal.appealed_by,
          reason: appeal.reason,
          reviewerId: appeal.reviewerId ?? appeal.reviewer_id ?? null,
          status: appeal.status,
          outcome: appeal.outcome ?? null,
          decidedAt: appeal.decidedAt ?? appeal.decided_at ?? null,
          createdAt: (appeal.createdAt ?? appeal.created_at)?.toISOString?.() ?? appeal.createdAt ?? appeal.created_at,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "APPEAL_FAILED", message: error.message || "Failed to file appeal" },
      };
    }
  }

  /**
   * Get the appeal for a case (if one exists).
   */
  async getAppeal(ctx: TenantContext, caseId: string): Promise<ServiceResult<any>> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT id, case_id, appealed_by, reason, reviewer_id, status, outcome, decided_at, created_at
          FROM app.case_appeals
          WHERE case_id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }
    );

    if (rows.length === 0) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "No appeal found for this case" } };
    }

    const r = rows[0];
    return {
      success: true,
      data: {
        id: r.id,
        caseId: r.caseId ?? r.case_id,
        appealedBy: r.appealedBy ?? r.appealed_by,
        reason: r.reason,
        reviewerId: r.reviewerId ?? r.reviewer_id ?? null,
        status: r.status,
        outcome: r.outcome ?? null,
        decidedAt: (r.decidedAt ?? r.decided_at)?.toISOString?.() ?? null,
        createdAt: (r.createdAt ?? r.created_at)?.toISOString?.() ?? r.createdAt ?? r.created_at,
      },
    };
  }

  /**
   * Decide an appeal outcome (upheld, overturned, partially_upheld).
   * Only the assigned reviewer or an admin can decide.
   */
  async decideAppeal(
    ctx: TenantContext,
    caseId: string,
    data: { decision: "upheld" | "overturned" | "partially_upheld"; outcome: string }
  ): Promise<ServiceResult<any>> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT id, reviewer_id, status
          FROM app.case_appeals
          WHERE case_id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }
    );

    if (rows.length === 0) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "No pending appeal found" } };
    }

    const appeal = rows[0];

    try {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Update appeal status
          await tx`
            UPDATE app.case_appeals
            SET status = ${data.decision}, outcome = ${data.outcome}, decided_at = now()
            WHERE id = ${appeal.id}::uuid
          `;

          // Transition case based on decision
          const newCaseStatus = data.decision === "overturned" ? "in_progress" : "closed";
          await tx`
            UPDATE app.cases
            SET status = ${newCaseStatus}, updated_at = now()
            WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          `;

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: caseId,
            eventType: "cases.appeal.decided",
            payload: {
              caseId,
              appealId: appeal.id,
              decision: data.decision,
              outcome: data.outcome,
              decidedBy: ctx.userId,
            },
          });
        }
      );

      return {
        success: true,
        data: {
          appealId: appeal.id,
          caseId,
          decision: data.decision,
          outcome: data.outcome,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "APPEAL_DECISION_FAILED", message: error.message || "Failed to decide appeal" },
      };
    }
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getAnalytics(ctx: TenantContext) {
    return this.repository.getCaseAnalytics(ctx);
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
