/**
 * DPIA Module - Service Layer
 *
 * Implements business logic for UK GDPR Article 35 DPIA workflow.
 * Enforces the state machine and emits domain events via the outbox pattern.
 *
 * State machine:
 *   draft -> in_review -> approved
 *                      -> rejected
 *
 * - DPIAs can only be edited in 'draft' status.
 * - Risks can be added to DPIAs in 'draft' or 'in_review' status.
 * - Approval/rejection can only happen from 'in_review' status.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  DpiaRepository,
  DpiaRow,
  DpiaRiskRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateDpia,
  UpdateDpia,
  AddRisk,
  DpiaFilters,
  PaginationQuery,
  DpiaResponse,
  DpiaRiskResponse,
} from "./schemas";

// =============================================================================
// Valid State Transitions
// =============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

function canTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

function getValidTransitions(from: string): string[] {
  return VALID_TRANSITIONS[from] || [];
}

// =============================================================================
// Service
// =============================================================================

export class DpiaService {
  constructor(
    private repository: DpiaRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // createDpia
  // ===========================================================================

  async createDpia(
    ctx: TenantContext,
    data: CreateDpia,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DpiaResponse>> {
    try {
      const dpia = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createDpia(tx, ctx, data);

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "dpia",
            aggregateId: result.id,
            eventType: "compliance.dpia.created",
            payload: {
              dpia: {
                id: result.id,
                title: result.title,
                processingActivityId: result.processingActivityId,
              },
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.mapDpiaToResponse(dpia) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create DPIA",
        },
      };
    }
  }

  // ===========================================================================
  // updateDpia - only in draft status
  // ===========================================================================

  async updateDpia(
    ctx: TenantContext,
    dpiaId: string,
    data: UpdateDpia,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DpiaResponse>> {
    const existing = await this.repository.getDpiaById(ctx, dpiaId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    // Can only edit in draft status
    if (existing.status !== "draft") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot update DPIA in '${existing.status}' status. Only 'draft' DPIAs can be edited.`,
          details: {
            currentStatus: existing.status,
            validTransitions: getValidTransitions(existing.status),
          },
        },
      };
    }

    try {
      const dpia = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateDpia(
            tx,
            dpiaId,
            data,
            existing.status
          );

          if (!result) {
            return null; // Concurrent modification
          }

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "dpia",
            aggregateId: dpiaId,
            eventType: "compliance.dpia.updated",
            payload: {
              dpiaId,
              updatedFields: Object.keys(data),
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!dpia) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message:
              "DPIA was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapDpiaToResponse(dpia) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to update DPIA",
        },
      };
    }
  }

  // ===========================================================================
  // submitForReview - draft -> in_review
  // ===========================================================================

  async submitForReview(
    ctx: TenantContext,
    dpiaId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DpiaResponse>> {
    const existing = await this.repository.getDpiaById(ctx, dpiaId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    if (!canTransition(existing.status, "in_review")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot submit DPIA for review from '${existing.status}' status. Must be in 'draft' status.`,
          details: {
            currentStatus: existing.status,
            validTransitions: getValidTransitions(existing.status),
          },
        },
      };
    }

    try {
      const dpia = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.submitForReview(
            tx,
            dpiaId,
            existing.status
          );

          if (!result) {
            return null;
          }

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "dpia",
            aggregateId: dpiaId,
            eventType: "compliance.dpia.submitted_for_review",
            payload: {
              dpiaId,
              title: result.title,
              previousStatus: existing.status,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!dpia) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message:
              "DPIA was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapDpiaToResponse(dpia) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to submit DPIA for review",
        },
      };
    }
  }

  // ===========================================================================
  // approveDpia - in_review -> approved / rejected
  // ===========================================================================

  async approveDpia(
    ctx: TenantContext,
    dpiaId: string,
    decision: "approved" | "rejected",
    dpoOpinion: string | null,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DpiaResponse>> {
    const existing = await this.repository.getDpiaById(ctx, dpiaId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    if (!canTransition(existing.status, decision)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot ${decision === "approved" ? "approve" : "reject"} DPIA from '${existing.status}' status. Must be in 'in_review' status.`,
          details: {
            currentStatus: existing.status,
            validTransitions: getValidTransitions(existing.status),
          },
        },
      };
    }

    try {
      const dpia = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.approveDpia(
            tx,
            dpiaId,
            decision,
            ctx.userId || "",
            dpoOpinion,
            existing.status
          );

          if (!result) {
            return null;
          }

          // Emit domain event
          const eventType =
            decision === "approved"
              ? "compliance.dpia.approved"
              : "compliance.dpia.rejected";

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "dpia",
            aggregateId: dpiaId,
            eventType,
            payload: {
              dpiaId,
              title: result.title,
              decision,
              approvedBy: ctx.userId,
              dpoOpinion: dpoOpinion || result.dpoOpinion,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!dpia) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message:
              "DPIA was modified concurrently. Please retry.",
          },
        };
      }

      return { success: true, data: this.mapDpiaToResponse(dpia) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : `Failed to ${decision === "approved" ? "approve" : "reject"} DPIA`,
        },
      };
    }
  }

  // ===========================================================================
  // addRisk - only for draft or in_review DPIAs
  // ===========================================================================

  async addRisk(
    ctx: TenantContext,
    dpiaId: string,
    data: AddRisk,
    _idempotencyKey?: string
  ): Promise<ServiceResult<DpiaRiskResponse>> {
    const existing = await this.repository.getDpiaById(ctx, dpiaId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    // Risks can be added in draft or in_review
    if (existing.status !== "draft" && existing.status !== "in_review") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot add risks to DPIA in '${existing.status}' status. Must be in 'draft' or 'in_review' status.`,
          details: {
            currentStatus: existing.status,
          },
        },
      };
    }

    try {
      const risk = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createRisk(
            tx,
            ctx,
            dpiaId,
            data
          );

          // Emit domain event
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "dpia",
            aggregateId: dpiaId,
            eventType: "compliance.dpia.risk_added",
            payload: {
              dpiaId,
              riskId: result.id,
              riskDescription: data.risk_description,
              likelihood: data.likelihood,
              impact: data.impact,
              riskScore: data.risk_score,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.mapRiskToResponse(risk) };
    } catch (error: unknown) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Failed to add risk to DPIA",
        },
      };
    }
  }

  // ===========================================================================
  // List & Get operations
  // ===========================================================================

  async listDpias(
    ctx: TenantContext,
    filters: DpiaFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedServiceResult<DpiaResponse>> {
    const result = await this.repository.listDpias(ctx, filters, pagination);

    return {
      items: result.items.map((row) => this.mapDpiaToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getDpia(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<DpiaResponse>> {
    const dpia = await this.repository.getDpiaById(ctx, id);

    if (!dpia) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    // Load associated risks
    const risks = await this.repository.listRisks(ctx, id);
    const response = this.mapDpiaToResponse(dpia);
    response.risks = risks.map((r) => this.mapRiskToResponse(r));

    return { success: true, data: response };
  }

  async listRisks(
    ctx: TenantContext,
    dpiaId: string
  ): Promise<ServiceResult<DpiaRiskResponse[]>> {
    const dpia = await this.repository.getDpiaById(ctx, dpiaId);
    if (!dpia) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "DPIA not found",
        },
      };
    }

    const risks = await this.repository.listRisks(ctx, dpiaId);
    return {
      success: true,
      data: risks.map((r) => this.mapRiskToResponse(r)),
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private toISOStringOrNull(
    value: Date | string | null | undefined
  ): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }

  private mapDpiaToResponse(row: DpiaRow): DpiaResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      processing_activity_id: row.processingActivityId,
      title: row.title,
      description: row.description,
      necessity_assessment: row.necessityAssessment,
      risk_assessment: row.riskAssessment,
      mitigation_measures: row.mitigationMeasures,
      dpo_opinion: row.dpoOpinion,
      status: row.status as DpiaResponse["status"],
      approved_by: row.approvedBy,
      approved_at: this.toISOStringOrNull(row.approvedAt),
      review_date: row.reviewDate,
      created_by: row.createdBy,
      created_at: this.toISOStringOrNull(row.createdAt) || "",
      updated_at: this.toISOStringOrNull(row.updatedAt) || "",
    };
  }

  private mapRiskToResponse(row: DpiaRiskRow): DpiaRiskResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      dpia_id: row.dpiaId,
      risk_description: row.riskDescription,
      likelihood: row.likelihood as DpiaRiskResponse["likelihood"],
      impact: row.impact as DpiaRiskResponse["impact"],
      risk_score: row.riskScore,
      mitigation: row.mitigation,
      residual_risk: row.residualRisk as DpiaRiskResponse["residual_risk"],
      created_at: this.toISOStringOrNull(row.createdAt) || "",
    };
  }

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
