/**
 * Talent Module - Service Layer
 *
 * Business logic for Talent Management.
 * Handles validation, domain events, and audit logging.
 */

import { TalentRepository, type TenantContext, type PaginationOptions, type PaginatedResult } from "./repository";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

type TransactionSql = any;

export class TalentService {
  constructor(
    private repository: TalentRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Goal Operations
  // ===========================================================================

  async listGoals(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      status?: string;
      category?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    return this.repository.listGoals(ctx, filters, pagination);
  }

  async getGoal(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const goal = await this.repository.getGoalById(ctx, id);

    if (!goal) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Goal not found" },
      };
    }

    return { success: true, data: goal };
  }

  async createGoal(ctx: TenantContext, data: any): Promise<ServiceResult<any>> {
    try {
      const goal = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createGoal(ctx, data);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "goal",
            aggregateId: result.id,
            eventType: "talent.goal.created",
            payload: { goal: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: goal };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to create goal" },
      };
    }
  }

  async updateGoal(
    ctx: TenantContext,
    id: string,
    data: any
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getGoalById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Goal not found" },
      };
    }

    try {
      const goal = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateGoal(ctx, id, data);

          if (!result) {
            throw new Error("Failed to update goal");
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "goal",
            aggregateId: id,
            eventType: "talent.goal.updated",
            payload: { goal: result, previousValues: existing, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: { goal, oldGoal: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "UPDATE_FAILED", message: error.message || "Failed to update goal" },
      };
    }
  }

  async deleteGoal(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const existing = await this.repository.getGoalById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Goal not found" },
      };
    }

    try {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          await this.repository.softDeleteGoal(ctx, id);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "goal",
            aggregateId: id,
            eventType: "talent.goal.deleted",
            payload: { goalId: id, actor: ctx.userId },
          });
        }
      );

      return { success: true, data: { oldGoal: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "DELETE_FAILED", message: error.message || "Failed to delete goal" },
      };
    }
  }

  // ===========================================================================
  // Review Cycle Operations
  // ===========================================================================

  async listReviewCycles(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    return this.repository.listReviewCycles(ctx, pagination);
  }

  async getReviewCycle(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const cycle = await this.repository.getReviewCycleById(ctx, id);

    if (!cycle) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Review cycle not found" },
      };
    }

    return { success: true, data: cycle };
  }

  async createReviewCycle(ctx: TenantContext, data: any): Promise<ServiceResult<any>> {
    try {
      const cycle = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createReviewCycle(ctx, data);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "review_cycle",
            aggregateId: result.id,
            eventType: "talent.review_cycle.created",
            payload: { cycle: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: cycle };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to create review cycle" },
      };
    }
  }

  // ===========================================================================
  // Review Operations
  // ===========================================================================

  async listReviews(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    return this.repository.listReviews(ctx, pagination);
  }

  async getReview(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const review = await this.repository.getReviewById(ctx, id);

    if (!review) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Review not found" },
      };
    }

    return { success: true, data: review };
  }

  async createReview(ctx: TenantContext, data: any): Promise<ServiceResult<any>> {
    try {
      const review = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createReview(ctx, data);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "review",
            aggregateId: result.id,
            eventType: "talent.review.created",
            payload: { review: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: review };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to create review" },
      };
    }
  }

  async submitSelfReview(
    ctx: TenantContext,
    id: string,
    data: any
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getReviewById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Review not found" },
      };
    }

    const selfReviewData = {
      accomplishments: data.accomplishments,
      challenges: data.challenges,
      developmentAreas: data.developmentAreas,
      selfRating: data.selfRating,
      goalRatings: data.goalRatings,
      competencyRatings: data.competencyRatings,
    };

    try {
      const review = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.submitSelfReview(ctx, id, selfReviewData);

          if (!result) {
            throw new Error("Failed to submit self review");
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "review",
            aggregateId: id,
            eventType: "talent.review.self_review_submitted",
            payload: {
              reviewId: id,
              previousStatus: existing.status,
              selfRating: data.selfRating,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { review, oldReview: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "UPDATE_FAILED", message: error.message || "Failed to submit self review" },
      };
    }
  }

  async submitManagerReview(
    ctx: TenantContext,
    id: string,
    data: any
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getReviewById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Review not found" },
      };
    }

    const managerReviewData = {
      feedback: data.feedback,
      strengths: data.strengths,
      developmentAreas: data.developmentAreas,
      managerRating: data.managerRating,
      goalRatings: data.goalRatings,
      competencyRatings: data.competencyRatings,
      promotionRecommendation: data.promotionRecommendation,
    };

    try {
      const review = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.submitManagerReview(ctx, id, managerReviewData);

          if (!result) {
            throw new Error("Failed to submit manager review");
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "review",
            aggregateId: id,
            eventType: "talent.review.manager_review_submitted",
            payload: {
              reviewId: id,
              previousStatus: existing.status,
              managerRating: data.managerRating,
              promotionRecommendation: data.promotionRecommendation,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: { review, oldReview: existing } };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "UPDATE_FAILED", message: error.message || "Failed to submit manager review" },
      };
    }
  }

  // ===========================================================================
  // Competency Operations
  // ===========================================================================

  async listCompetencies(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<any>> {
    return this.repository.listCompetencies(ctx, pagination);
  }

  async getCompetency(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const competency = await this.repository.getCompetencyById(ctx, id);

    if (!competency) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Competency not found" },
      };
    }

    return { success: true, data: competency };
  }

  async createCompetency(ctx: TenantContext, data: any): Promise<ServiceResult<any>> {
    try {
      const competency = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createCompetency(ctx, data);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "competency",
            aggregateId: result.id,
            eventType: "talent.competency.created",
            payload: { competency: result, actor: ctx.userId },
          });

          return result;
        }
      );

      return { success: true, data: competency };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "CREATE_FAILED", message: error.message || "Failed to create competency" },
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
