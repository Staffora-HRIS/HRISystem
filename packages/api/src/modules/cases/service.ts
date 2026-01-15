/**
 * Cases Module - Service Layer
 *
 * Business logic for HR Case Management.
 * Handles validation, state transitions, and domain events.
 */

import { CasesRepository, type TenantContext, type PaginationOptions } from "./repository";
import type {
  CreateCase,
  UpdateCase,
  CaseResponse,
  CreateComment,
  CommentResponse,
  CaseStatus,
} from "./schemas";

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Valid state transitions for case status
const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["in_progress", "pending_info", "escalated", "resolved", "cancelled"],
  in_progress: ["pending_info", "escalated", "resolved", "cancelled"],
  pending_info: ["in_progress", "escalated", "resolved", "cancelled"],
  escalated: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "in_progress"], // Can reopen
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
          code: "NOT_FOUND",
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
          code: "NOT_FOUND",
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
      const hrCase = await this.repository.createCase(ctx, data);

      // Emit domain event
      await this.emitDomainEvent(ctx, {
        aggregateType: "case",
        aggregateId: hrCase.id,
        eventType: "cases.case.created",
        payload: {
          case: hrCase,
          requesterId: data.requesterId,
          category: data.category,
          priority: data.priority || "medium",
          actor: ctx.userId,
        },
      });

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
          code: "NOT_FOUND",
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
            code: "INVALID_TRANSITION",
            message: `Cannot transition from ${existing.status} to ${data.status}`,
            details: { validTransitions },
          },
        };
      }
    }

    try {
      const hrCase = await this.repository.updateCase(ctx, id, data);

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update case",
          },
        };
      }

      // Emit domain event
      await this.emitDomainEvent(ctx, {
        aggregateType: "case",
        aggregateId: id,
        eventType: "cases.case.updated",
        payload: {
          case: hrCase,
          previousStatus: existing.status,
          changes: data,
          actor: ctx.userId,
        },
      });

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
          code: "NOT_FOUND",
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
      const hrCase = await this.repository.assignCase(ctx, id, assigneeId);

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "ASSIGN_FAILED",
            message: "Failed to assign case",
          },
        };
      }

      // Add assignment comment if note provided
      if (note) {
        await this.repository.createComment(ctx, id, {
          content: `Case assigned: ${note}`,
          isInternal: true,
        });
      }

      // Emit domain event
      await this.emitDomainEvent(ctx, {
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
          code: "NOT_FOUND",
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
      const hrCase = await this.repository.escalateCase(ctx, id, escalateTo);

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "ESCALATE_FAILED",
            message: "Failed to escalate case",
          },
        };
      }

      // Add escalation comment
      await this.repository.createComment(ctx, id, {
        content: `Case escalated: ${reason}`,
        isInternal: true,
      });

      // Emit domain event
      await this.emitDomainEvent(ctx, {
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
          code: "NOT_FOUND",
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
      const hrCase = await this.repository.resolveCase(ctx, id, resolution);

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "RESOLVE_FAILED",
            message: "Failed to resolve case",
          },
        };
      }

      // Emit domain event
      await this.emitDomainEvent(ctx, {
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
          code: "NOT_FOUND",
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
      const hrCase = await this.repository.closeCase(ctx, id);

      if (!hrCase) {
        return {
          success: false,
          error: {
            code: "CLOSE_FAILED",
            message: "Failed to close case",
          },
        };
      }

      // Emit domain event
      await this.emitDomainEvent(ctx, {
        aggregateType: "case",
        aggregateId: id,
        eventType: "cases.case.closed",
        payload: {
          caseId: id,
          actor: ctx.userId,
        },
      });

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
          code: "NOT_FOUND",
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
      const comment = await this.repository.createComment(ctx, caseId, data);

      // Emit domain event
      await this.emitDomainEvent(ctx, {
        aggregateType: "case",
        aggregateId: caseId,
        eventType: "cases.comment.added",
        payload: {
          caseId,
          commentId: comment.id,
          isInternal: data.isInternal || false,
          actor: ctx.userId,
        },
      });

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
  // Analytics Operations
  // ===========================================================================

  async getAnalytics(ctx: TenantContext) {
    return this.repository.getCaseAnalytics(ctx);
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ) {
    try {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: any) => {
          return tx`
            INSERT INTO app.domain_outbox (
              id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
            ) VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
              ${event.aggregateId}::uuid, ${event.eventType},
              ${JSON.stringify(event.payload)}::jsonb, now()
            )
          `;
        }
      );
    } catch (error) {
      console.error("Failed to emit domain event:", error);
    }
  }
}
