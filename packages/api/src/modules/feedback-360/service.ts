/**
 * Feedback 360 Module - Service Layer
 *
 * Business logic for 360-degree feedback.
 * Handles cycle lifecycle, reviewer nomination, feedback submission,
 * and anonymised result aggregation.
 */

import { Feedback360Repository, type TenantContext, type PaginationOptions, type PaginatedResult } from "./repository";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

type TransactionSql = any;

/** Valid status transitions for a 360 cycle */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["nominating", "cancelled"],
  nominating: ["collecting", "cancelled"],
  collecting: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export class Feedback360Service {
  constructor(
    private repository: Feedback360Repository,
    private db: any
  ) {}

  // ===========================================================================
  // Cycle Operations
  // ===========================================================================

  async listCycles(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      reviewCycleId?: string;
      status?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    return this.repository.listCycles(ctx, filters, pagination);
  }

  async getCycle(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const cycle = await this.repository.getCycleById(ctx, id);

    if (!cycle) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
      };
    }

    return { success: true, data: cycle };
  }

  async createCycle(ctx: TenantContext, data: {
    employeeId: string;
    reviewCycleId?: string;
    deadline?: string;
    minResponses?: number;
  }): Promise<ServiceResult<any>> {
    try {
      const cycle = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createCycle(ctx, data);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "feedback_360_cycle",
            aggregateId: result.id,
            eventType: "talent.feedback_360.cycle_created",
            payload: { cycle: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: cycle };
    } catch (error: any) {
      // Handle unique constraint violation
      if (error.code === "23505") {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "A 360 feedback cycle already exists for this employee in the specified review cycle",
          },
        };
      }
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to create 360 feedback cycle" },
      };
    }
  }

  async updateCycleStatus(
    ctx: TenantContext,
    id: string,
    newStatus: string
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getCycleById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
      };
    }

    // Validate transition at service level (DB trigger also enforces)
    const allowed = VALID_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition 360 cycle from '${existing.status}' to '${newStatus}'. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
          details: {
            currentStatus: existing.status,
            requestedStatus: newStatus,
            allowedTransitions: allowed,
          },
        },
      };
    }

    try {
      const cycle = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateCycleStatus(ctx, id, newStatus);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "feedback_360_cycle",
            aggregateId: id,
            eventType: "talent.feedback_360.cycle_status_changed",
            payload: {
              cycleId: id,
              previousStatus: existing.status,
              newStatus,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { cycle, oldCycle: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: error.message || "Failed to update 360 cycle status",
        },
      };
    }
  }

  // ===========================================================================
  // Reviewer Nomination
  // ===========================================================================

  async nominateReviewers(
    ctx: TenantContext,
    cycleId: string,
    reviewers: Array<{ reviewerId: string; reviewerType: string }>
  ): Promise<ServiceResult<any>> {
    const cycle = await this.repository.getCycleById(ctx, cycleId);
    if (!cycle) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
      };
    }

    // Nomination is allowed in draft or nominating status
    if (!["draft", "nominating"].includes(cycle.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot nominate reviewers when cycle is in '${cycle.status}' status. Must be 'draft' or 'nominating'.`,
        },
      };
    }

    // Validate self-review is for the correct employee
    for (const r of reviewers) {
      if (r.reviewerType === "self" && r.reviewerId !== cycle.employeeId) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Self-review reviewer must be the cycle's subject employee",
            details: { reviewerId: r.reviewerId, employeeId: cycle.employeeId },
          },
        };
      }
    }

    try {
      const responses = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createResponses(ctx, cycleId, reviewers);

          // If cycle is still in draft, move to nominating
          if (cycle.status === "draft") {
            await this.repository.updateCycleStatus(ctx, cycleId, "nominating");
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "feedback_360_cycle",
            aggregateId: cycleId,
            eventType: "talent.feedback_360.reviewers_nominated",
            payload: {
              cycleId,
              reviewers: reviewers.map((r) => ({
                reviewerId: r.reviewerId,
                reviewerType: r.reviewerType,
              })),
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { responses, count: responses.length } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to nominate reviewers" },
      };
    }
  }

  // ===========================================================================
  // Response Operations
  // ===========================================================================

  async listResponses(ctx: TenantContext, cycleId: string): Promise<ServiceResult<any>> {
    const cycle = await this.repository.getCycleById(ctx, cycleId);
    if (!cycle) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
      };
    }

    const responses = await this.repository.listResponsesByCycle(ctx, cycleId);
    const counts = await this.repository.getResponseCountsByType(ctx, cycleId);

    return {
      success: true,
      data: { responses, summary: counts },
    };
  }

  async submitFeedback(
    ctx: TenantContext,
    responseId: string,
    data: {
      ratings: any[];
      strengths?: string;
      developmentAreas?: string;
      comments?: string;
    }
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getResponseById(ctx, responseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback response not found" },
      };
    }

    if (existing.status === "submitted") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Feedback has already been submitted",
        },
      };
    }

    if (existing.status === "declined") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "Cannot submit feedback after declining",
        },
      };
    }

    // Verify the parent cycle is in collecting status
    const cycle = await this.repository.getCycleById(ctx, existing.cycleId);
    if (!cycle || cycle.status !== "collecting") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: "360 feedback cycle is not currently accepting feedback",
        },
      };
    }

    try {
      const response = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.submitResponse(ctx, responseId, data);

          if (!result) {
            throw new Error("Failed to submit feedback - response may already be submitted or in an invalid state");
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "feedback_360_response",
            aggregateId: responseId,
            eventType: "talent.feedback_360.feedback_submitted",
            payload: {
              responseId,
              cycleId: existing.cycleId,
              reviewerType: existing.reviewerType,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { response, oldResponse: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: error.message || "Failed to submit 360 feedback",
        },
      };
    }
  }

  async declineFeedback(
    ctx: TenantContext,
    responseId: string
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getResponseById(ctx, responseId);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback response not found" },
      };
    }

    if (!["pending", "in_progress"].includes(existing.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot decline feedback when response is in '${existing.status}' status`,
        },
      };
    }

    try {
      const response = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.declineResponse(ctx, responseId);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "feedback_360_response",
            aggregateId: responseId,
            eventType: "talent.feedback_360.feedback_declined",
            payload: {
              responseId,
              cycleId: existing.cycleId,
              reviewerType: existing.reviewerType,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { response, oldResponse: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "UPDATE_FAILED", message: error.message || "Failed to decline 360 feedback" },
      };
    }
  }

  // ===========================================================================
  // Aggregated Results (Anonymised)
  // ===========================================================================

  async getAggregatedResults(
    ctx: TenantContext,
    cycleId: string
  ): Promise<ServiceResult<any>> {
    const cycle = await this.repository.getCycleById(ctx, cycleId);
    if (!cycle) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
      };
    }

    // Results only available once cycle is completed or collecting
    if (!["collecting", "completed"].includes(cycle.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Aggregated results are only available when cycle is 'collecting' or 'completed', not '${cycle.status}'`,
        },
      };
    }

    try {
      const aggregated = await this.repository.getAggregatedResults(ctx, cycleId);
      const counts = await this.repository.getResponseCountsByType(ctx, cycleId);

      // Build anonymised result set
      const results = aggregated.map((row: any) => {
        const isAnonymous = ["peer", "direct_report"].includes(row.reviewerType);

        return {
          reviewerType: row.reviewerType,
          responseCount: Number(row.responseCount),
          avgRatings: row.avgRatings,
          commentsVisible: row.commentsVisible,
          isAnonymous,
        };
      });

      // Fetch non-anonymous individual comments for self & manager
      const selfManagerResponses: any[] = [];
      if (["collecting", "completed"].includes(cycle.status)) {
        const allResponses = await this.repository.listResponsesByCycle(ctx, cycleId);
        for (const resp of allResponses) {
          if (["self", "manager"].includes(resp.reviewerType) && resp.status === "submitted") {
            const full = await this.repository.getResponseById(ctx, resp.id);
            if (full) {
              selfManagerResponses.push({
                reviewerType: full.reviewerType,
                reviewerName: full.reviewerName,
                strengths: full.strengths,
                developmentAreas: full.developmentAreas,
                comments: full.comments,
              });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          cycleId,
          employeeId: cycle.employeeId,
          status: cycle.status,
          results,
          summary: counts,
          identifiedFeedback: selfManagerResponses,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "INTERNAL_ERROR", message: error.message || "Failed to aggregate 360 feedback results" },
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
