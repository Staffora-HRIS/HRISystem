/**
 * Talent Module Routes
 *
 * Defines the API endpoints for Talent Management operations.
 * All routes delegate to TalentService for business logic.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - goals: read, write, delete
 * - reviews: read, write
 * - review_cycles: read, write
 * - competencies: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { TalentRepository } from "./repository";
import { TalentService } from "./service";
import {
  // Schemas
  CreateGoalSchema,
  UpdateGoalSchema,
  GoalFiltersSchema,
  CreateReviewCycleSchema,
  CreateReviewSchema,
  SubmitSelfReviewSchema,
  SubmitManagerReviewSchema,
  CreateCompetencySchema,
  IdParamsSchema,
  UuidSchema,
  PaginationQuerySchema,
  GoalStatusSchema,
  ReviewStatusSchema,
} from "./schemas";

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Goal response schema
 */
const GoalResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.Union([t.String(), t.Null()]),
  weight: t.Number(),
  target_date: t.String(),
  status: GoalStatusSchema,
  progress: t.Number(),
  metrics: t.Union([t.Array(t.Any()), t.Null()]),
  parent_goal_id: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

/**
 * Review cycle response schema
 */
const ReviewCycleResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  period_start: t.String(),
  period_end: t.String(),
  self_review_deadline: t.String(),
  manager_review_deadline: t.String(),
  calibration_deadline: t.Union([t.String(), t.Null()]),
  status: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
});

/**
 * Review response schema
 */
const ReviewResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  review_cycle_id: UuidSchema,
  cycle_name: t.Optional(t.String()),
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  reviewer_id: UuidSchema,
  status: ReviewStatusSchema,
  self_review: t.Union([t.Any(), t.Null()]),
  manager_review: t.Union([t.Any(), t.Null()]),
  final_rating: t.Union([t.Number(), t.Null()]),
  self_review_submitted_at: t.Union([t.String(), t.Null()]),
  manager_review_submitted_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

/**
 * Competency response schema
 */
const CompetencyResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.String(),
  levels: t.Array(t.Any()),
  created_at: t.String(),
  updated_at: t.String(),
});

/**
 * Idempotency header schema (optional)
 */
const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/** Module-specific error code overrides */
const TALENT_ERROR_CODES: Record<string, number> = {
  INVALID_GOAL: 400,
  INVALID_REVIEW_CYCLE: 400,
  INVALID_REVIEW: 400,
  INVALID_COMPETENCY: 400,
  REVIEW_NOT_IN_CORRECT_STATE: 400,
  GOAL_NOT_ACTIVE: 400,
  CYCLE_NOT_ACTIVE: 400,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

// =============================================================================
// Talent Routes
// =============================================================================

export const talentRoutes = new Elysia({ prefix: "/talent", name: "talent-routes" })

  // ===========================================================================
  // Plugin Setup - Derive tenant context, service, and repository
  // ===========================================================================
  .derive((ctx) => {
    const { db, tenant, user } = ctx as any;
    const repository = new TalentRepository(db);
    const service = new TalentService(repository, db);
    const tenantContext = {
      tenantId: (tenant as any)?.id || "",
      userId: (user as any)?.id,
    };
    return { talentService: service, talentRepository: repository, tenantContext };
  })

  // ===========================================================================
  // Goal Routes
  // ===========================================================================

  // GET /goals - List goals
  .get(
    "/goals",
    async (ctx) => {
      const { talentService, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20, ...filters } = query;

      try {
        const result = await talentService.listGoals(
          tenantContext,
          filters,
          { cursor, limit: Number(limit) }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("goals", "read")],
      query: t.Partial(GoalFiltersSchema),
      response: {
        200: t.Object({
          items: t.Array(GoalResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Goals"],
        summary: "List goals",
        description: "List goals with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /goals/:id - Get goal by ID
  .get(
    "/goals/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, error } = ctx as any;

      const result = await talentService.getGoal(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("goals", "read")],
      params: IdParamsSchema,
      response: {
        200: GoalResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Goals"],
        summary: "Get goal by ID",
        description: "Get a single goal by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /goals - Create goal
  .post(
    "/goals",
    async (ctx) => {
      const { talentService, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.createGoal(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the creation
      if (audit) {
        await (audit as any).log({
          action: "talent.goal.created",
          resourceType: "goal",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("goals", "write")],
      body: CreateGoalSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: GoalResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Goals"],
        summary: "Create goal",
        description: "Create a new goal for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /goals/:id - Update goal
  .patch(
    "/goals/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.updateGoal(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the update
      if (audit) {
        await (audit as any).log({
          action: "talent.goal.updated",
          resourceType: "goal",
          resourceId: params.id,
          oldValues: result.data.oldGoal,
          newValues: result.data.goal,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data.goal;
    },
    {
      beforeHandle: [requirePermission("goals", "write")],
      params: IdParamsSchema,
      body: UpdateGoalSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: GoalResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Goals"],
        summary: "Update goal",
        description: "Update an existing goal",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /goals/:id - Delete goal
  .delete(
    "/goals/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.deleteGoal(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the deletion
      if (audit) {
        await (audit as any).log({
          action: "talent.goal.deleted",
          resourceType: "goal",
          resourceId: params.id,
          oldValues: result.data.oldGoal,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Goal deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("goals", "delete")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: t.Object({
          success: t.Literal(true),
          message: t.String(),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Goals"],
        summary: "Delete goal",
        description: "Soft delete a goal (mark as cancelled)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Review Cycle Routes
  // ===========================================================================

  // GET /review-cycles - List review cycles
  .get(
    "/review-cycles",
    async (ctx) => {
      const { talentService, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const result = await talentService.listReviewCycles(
          tenantContext,
          { cursor, limit: Number(limit) }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("review_cycles", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(ReviewCycleResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Review Cycles"],
        summary: "List review cycles",
        description: "List review cycles with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /review-cycles/:id - Get review cycle by ID
  .get(
    "/review-cycles/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, error } = ctx as any;

      const result = await talentService.getReviewCycle(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("review_cycles", "read")],
      params: IdParamsSchema,
      response: {
        200: ReviewCycleResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Review Cycles"],
        summary: "Get review cycle by ID",
        description: "Get a single review cycle by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /review-cycles - Create review cycle
  .post(
    "/review-cycles",
    async (ctx) => {
      const { talentService, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.createReviewCycle(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the creation
      if (audit) {
        await (audit as any).log({
          action: "talent.review_cycle.created",
          resourceType: "review_cycle",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("review_cycles", "write")],
      body: CreateReviewCycleSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReviewCycleResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Review Cycles"],
        summary: "Create review cycle",
        description: "Create a new review cycle",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Review Routes
  // ===========================================================================

  // GET /reviews - List reviews
  .get(
    "/reviews",
    async (ctx) => {
      const { talentService, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const result = await talentService.listReviews(
          tenantContext,
          { cursor, limit: Number(limit) }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("reviews", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(ReviewResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Reviews"],
        summary: "List reviews",
        description: "List reviews with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /reviews/:id - Get review by ID
  .get(
    "/reviews/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, error } = ctx as any;

      const result = await talentService.getReview(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reviews", "read")],
      params: IdParamsSchema,
      response: {
        200: ReviewResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Reviews"],
        summary: "Get review by ID",
        description: "Get a single review by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /reviews - Create review
  .post(
    "/reviews",
    async (ctx) => {
      const { talentService, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.createReview(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the creation
      if (audit) {
        await (audit as any).log({
          action: "talent.review.created",
          resourceType: "review",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reviews", "write")],
      body: CreateReviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReviewResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Reviews"],
        summary: "Create review",
        description: "Create a new review for an employee in a review cycle",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /reviews/:id/self-review - Submit self review
  .post(
    "/reviews/:id/self-review",
    async (ctx) => {
      const { talentService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.submitSelfReview(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the submission
      if (audit) {
        await (audit as any).log({
          action: "talent.review.self_review_submitted",
          resourceType: "review",
          resourceId: params.id,
          oldValues: { status: result.data.oldReview.status },
          newValues: { status: result.data.review.status, selfRating: (body as any).selfRating },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data.review;
    },
    {
      beforeHandle: [requirePermission("reviews", "write")],
      params: IdParamsSchema,
      body: SubmitSelfReviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReviewResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Reviews"],
        summary: "Submit self review",
        description: "Submit the self-review portion of a performance review",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /reviews/:id/manager-review - Submit manager review
  .post(
    "/reviews/:id/manager-review",
    async (ctx) => {
      const { talentService, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.submitManagerReview(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the submission
      if (audit) {
        await (audit as any).log({
          action: "talent.review.manager_review_submitted",
          resourceType: "review",
          resourceId: params.id,
          oldValues: { status: result.data.oldReview.status },
          newValues: {
            status: result.data.review.status,
            managerRating: (body as any).managerRating,
            promotionRecommendation: (body as any).promotionRecommendation,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data.review;
    },
    {
      beforeHandle: [requirePermission("reviews", "write")],
      params: IdParamsSchema,
      body: SubmitManagerReviewSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReviewResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Reviews"],
        summary: "Submit manager review",
        description: "Submit the manager review portion of a performance review",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Competency Routes
  // ===========================================================================

  // GET /competencies - List competencies
  .get(
    "/competencies",
    async (ctx) => {
      const { talentService, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const result = await talentService.listCompetencies(
          tenantContext,
          { cursor, limit: Number(limit) }
        );

        return {
          items: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: ErrorCodes.INTERNAL_ERROR, message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("competencies", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(CompetencyResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Competencies"],
        summary: "List competencies",
        description: "List competencies with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /competencies/:id - Get competency by ID
  .get(
    "/competencies/:id",
    async (ctx) => {
      const { talentService, tenantContext, params, error } = ctx as any;

      const result = await talentService.getCompetency(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("competencies", "read")],
      params: IdParamsSchema,
      response: {
        200: CompetencyResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Competencies"],
        summary: "Get competency by ID",
        description: "Get a single competency by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /competencies - Create competency
  .post(
    "/competencies",
    async (ctx) => {
      const { talentService, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await talentService.createCompetency(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, TALENT_ERROR_CODES), {
          error: result.error,
        });
      }

      // Audit log the creation
      if (audit) {
        await (audit as any).log({
          action: "talent.competency.created",
          resourceType: "competency",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("competencies", "write")],
      body: CreateCompetencySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CompetencyResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - Competencies"],
        summary: "Create competency",
        description: "Create a new competency definition",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TalentRoutes = typeof talentRoutes;
