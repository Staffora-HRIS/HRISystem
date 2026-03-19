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
import {
  canTransitionCase,
  getValidCaseTransitions,
  CaseStates,
  isCaseTerminalState,
  type CaseState,
} from "@staffora/shared/state-machines";

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
      if (!canTransitionCase(existing.status as CaseState, data.status as CaseState)) {
        const validTransitions = getValidCaseTransitions(existing.status as CaseState);
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

    if (isCaseTerminalState(existing.status as CaseState)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CASE_CLOSED,
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

    if (!canTransitionCase(existing.status as CaseState, CaseStates.ESCALATED)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
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

    if (!canTransitionCase(existing.status as CaseState, CaseStates.RESOLVED)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
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

    if (!canTransitionCase(existing.status as CaseState, CaseStates.CLOSED)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
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

    if (isCaseTerminalState(hrCase.status as CaseState)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CASE_CLOSED,
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
   *
   * ACAS Code of Practice compliance:
   * - Para 26: Employee has right to appeal against a disciplinary decision.
   * - Para 27: Appeal must be heard by a different, ideally more senior, manager.
   *
   * Validation:
   * - Only resolved cases can be appealed.
   * - If a hearing officer is specified, they must NOT be the original decision maker
   *   (the user who resolved the case, or the assigned handler).
   */
  async fileAppeal(
    ctx: TenantContext,
    caseId: string,
    data: { reason: string; appealGrounds?: string; hearingOfficerId?: string; hearingDate?: string }
  ): Promise<ServiceResult<any>> {
    const hrCase = await this.repository.getCaseById(ctx, caseId);
    if (!hrCase) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Case not found" } };
    }

    if (hrCase.status !== CaseStates.RESOLVED) {
      return {
        success: false,
        error: { code: ErrorCodes.STATE_MACHINE_VIOLATION, message: "Only resolved cases can be appealed" },
      };
    }

    // Determine the original decision maker (resolved_by, falling back to assigned_to)
    const originalDecisionMakerId = await this.getOriginalDecisionMaker(ctx, caseId);

    // ACAS Code para 27: hearing officer must be different from original decision maker
    if (data.hearingOfficerId && originalDecisionMakerId) {
      if (data.hearingOfficerId === originalDecisionMakerId) {
        return {
          success: false,
          error: {
            code: ErrorCodes.FORBIDDEN,
            message: "Appeal hearing officer must be a different person from the original decision maker (ACAS Code of Practice, paragraph 27)",
            details: {
              originalDecisionMakerId,
              hearingOfficerId: data.hearingOfficerId,
              acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 27",
            },
          },
        };
      }
    }

    // Check for existing pending appeal
    const existingAppeal = await this.getExistingPendingAppeal(ctx, caseId);
    if (existingAppeal) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "A pending appeal already exists for this case",
          details: { existingAppealId: existingAppeal.id },
        },
      };
    }

    // Look up appellant employee ID from requester
    const appellantEmployeeId = hrCase.requesterId;

    try {
      const appeal = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Create the appeal record with full ACAS-compliant fields
          const [row] = await tx<Array<Record<string, any>>>`
            INSERT INTO app.case_appeals (
              id, tenant_id, case_id, appealed_by, reason, appeal_grounds,
              hearing_officer_id, original_decision_maker_id,
              appellant_employee_id, hearing_date,
              status, appeal_date, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid, ${caseId}::uuid,
              ${ctx.userId}::uuid, ${data.reason}, ${data.appealGrounds ?? null},
              ${data.hearingOfficerId ?? null}::uuid, ${originalDecisionMakerId}::uuid,
              ${appellantEmployeeId}::uuid, ${data.hearingDate ?? null}::timestamptz,
              'pending', now(), now(), now()
            )
            RETURNING *
          `;

          // Transition case to appealed status
          await tx`
            UPDATE app.cases
            SET status = 'appealed', updated_at = now()
            WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          `;

          // Emit domain event: appeal filed
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: caseId,
            eventType: "cases.appeal.filed",
            payload: {
              caseId,
              appealId: row.id,
              appealedBy: ctx.userId,
              appellantEmployeeId,
              originalDecisionMakerId,
              hearingOfficerId: data.hearingOfficerId ?? null,
              hearingDate: data.hearingDate ?? null,
            },
          });

          return row;
        }
      );

      return { success: true, data: this.mapAppealRow(appeal) };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "APPEAL_FAILED", message: error.message || "Failed to file appeal" },
      };
    }
  }

  /**
   * Get the most recent appeal for a case.
   */
  async getAppeal(ctx: TenantContext, caseId: string): Promise<ServiceResult<any>> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT *
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

    return { success: true, data: this.mapAppealRow(rows[0]) };
  }

  /**
   * List all appeals for a case (history).
   */
  async listAppeals(ctx: TenantContext, caseId: string): Promise<ServiceResult<any[]>> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT *
          FROM app.case_appeals
          WHERE case_id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY created_at DESC
        `;
      }
    );

    return { success: true, data: rows.map((r: any) => this.mapAppealRow(r)) };
  }

  /**
   * Decide an appeal outcome (upheld, overturned, partially_upheld).
   *
   * ACAS Code para 27: the person deciding the appeal MUST be different
   * from the original decision maker.
   *
   * Outcomes:
   * - upheld: original decision stands, case moves to closed
   * - partially_upheld: original decision modified, case moves to closed
   * - overturned: original decision reversed, case reopens to in_progress
   */
  async decideAppeal(
    ctx: TenantContext,
    caseId: string,
    data: {
      decision: "upheld" | "overturned" | "partially_upheld";
      outcomeNotes: string;
      hearingOfficerId?: string;
    }
  ): Promise<ServiceResult<any>> {
    // Fetch the pending appeal
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT *
          FROM app.case_appeals
          WHERE case_id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }
    );

    if (rows.length === 0) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "No pending appeal found for this case" } };
    }

    const appeal = rows[0];
    const originalDecisionMakerId = appeal.originalDecisionMakerId;

    // Determine the hearing officer: explicit parameter > appeal record > current user
    const hearingOfficerId = data.hearingOfficerId
      ?? appeal.hearingOfficerId
      ?? ctx.userId;

    // ACAS Code para 27: the person deciding MUST be different from the original decision maker
    if (originalDecisionMakerId && hearingOfficerId === originalDecisionMakerId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "Appeal must be decided by a different person from the original decision maker (ACAS Code of Practice, paragraph 27)",
          details: {
            originalDecisionMakerId,
            hearingOfficerId,
            acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 27",
          },
        },
      };
    }

    // Also check: the current user deciding must not be the original decision maker
    if (originalDecisionMakerId && ctx.userId === originalDecisionMakerId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "You cannot decide this appeal because you were the original decision maker (ACAS Code of Practice, paragraph 27)",
          details: {
            originalDecisionMakerId,
            currentUserId: ctx.userId,
            acasReference: "ACAS Code of Practice on Disciplinary and Grievance Procedures, paragraph 27",
          },
        },
      };
    }

    try {
      const updatedAppeal = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          // Update appeal with decision
          const [row] = await tx<Array<Record<string, any>>>`
            UPDATE app.case_appeals
            SET status = ${data.decision},
                outcome = ${data.outcomeNotes},
                outcome_notes = ${data.outcomeNotes},
                hearing_officer_id = ${hearingOfficerId}::uuid,
                decided_at = now(),
                updated_at = now()
            WHERE id = ${appeal.id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            RETURNING *
          `;

          // Transition case based on decision
          // Overturned -> reopen for further review; upheld/partially -> close
          const newCaseStatus = data.decision === "overturned" ? "in_progress" : "closed";
          await tx`
            UPDATE app.cases
            SET status = ${newCaseStatus}, updated_at = now()
            WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          `;

          // Emit domain event: appeal decided
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "case",
            aggregateId: caseId,
            eventType: "cases.appeal.decided",
            payload: {
              caseId,
              appealId: appeal.id,
              decision: data.decision,
              outcomeNotes: data.outcomeNotes,
              decidedBy: ctx.userId,
              hearingOfficerId,
              originalDecisionMakerId,
              newCaseStatus,
            },
          });

          return row;
        }
      );

      return { success: true, data: this.mapAppealRow(updatedAppeal) };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "APPEAL_DECISION_FAILED", message: error.message || "Failed to decide appeal" },
      };
    }
  }

  // ===========================================================================
  // Appeal Helpers
  // ===========================================================================

  /**
   * Determine the original decision maker for a case.
   * Uses resolved_by first, then assigned_to as fallback.
   */
  private async getOriginalDecisionMaker(ctx: TenantContext, caseId: string): Promise<string | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT resolved_by, assigned_to
          FROM app.cases
          WHERE id = ${caseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    if (rows.length === 0) return null;
    return rows[0].resolvedBy || rows[0].assignedTo || null;
  }

  /**
   * Check if there is already a pending appeal for this case.
   */
  private async getExistingPendingAppeal(ctx: TenantContext, caseId: string): Promise<any | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT id FROM app.case_appeals
          WHERE case_id = ${caseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
          LIMIT 1
        `;
      }
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Map a case_appeals DB row (camelCase from postgres.js) to API response shape.
   */
  private mapAppealRow(row: Record<string, any>): Record<string, any> {
    return {
      id: row.id,
      caseId: row.caseId,
      appealedBy: row.appealedBy,
      appellantEmployeeId: row.appellantEmployeeId ?? null,
      reason: row.reason,
      appealGrounds: row.appealGrounds ?? null,
      reviewerId: row.reviewerId ?? null,
      hearingOfficerId: row.hearingOfficerId ?? null,
      originalDecisionMakerId: row.originalDecisionMakerId ?? null,
      hearingDate: row.hearingDate?.toISOString?.() ?? row.hearingDate ?? null,
      status: row.status,
      outcome: row.outcome ?? null,
      outcomeNotes: row.outcomeNotes ?? null,
      decidedAt: row.decidedAt?.toISOString?.() ?? null,
      appealDate: row.appealDate?.toISOString?.() ?? null,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
    };
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
