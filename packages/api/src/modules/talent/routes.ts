/**
 * Talent Module Routes
 *
 * Defines the API endpoints for Talent Management operations.
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
import { AuditActions } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
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
// Types
// =============================================================================

/**
 * Tenant context for repository operations
 */
interface TenantContext {
  tenantId: string;
  userId?: string;
}

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

/**
 * Talent module-specific error codes beyond the shared base set
 */
const _talentErrorStatusMap: Record<string, number> = {
  INVALID_GOAL: 400,
  INVALID_REVIEW_CYCLE: 400,
  INVALID_REVIEW: 400,
  INVALID_COMPETENCY: 400,
  REVIEW_NOT_IN_CORRECT_STATE: 400,
  GOAL_NOT_ACTIVE: 400,
  CYCLE_NOT_ACTIVE: 400,
};

// =============================================================================
// Talent Routes
// =============================================================================

export const talentRoutes = new Elysia({ prefix: "/talent", name: "talent-routes" })

  // ===========================================================================
  // Plugin Setup - Derive tenant context
  // ===========================================================================
  .derive((ctx) => {
    const { tenant, user } = ctx as any;
    const tenantContext: TenantContext = {
      tenantId: (tenant as any)?.id || "",
      userId: (user as any)?.id,
    };
    return { tenantContext };
  })

  // ===========================================================================
  // Goal Routes
  // ===========================================================================

  // GET /goals - List goals
  .get(
    "/goals",
    async (ctx) => {
      const { db, query, tenantContext, error } = ctx as any;
      const { cursor, limit = 20, employeeId, status, category } = query;

      try {
        const goals = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT g.*, e.first_name || ' ' || e.last_name as employee_name
            FROM app.goals g
            JOIN app.employees e ON e.id = g.employee_id
            WHERE g.tenant_id = ${tenantContext.tenantId}::uuid
            ${employeeId ? tx`AND g.employee_id = ${employeeId}::uuid` : tx``}
            ${status ? tx`AND g.status = ${status}` : tx``}
            ${category ? tx`AND g.category = ${category}` : tx``}
            ${cursor ? tx`AND g.id > ${cursor}::uuid` : tx``}
            ORDER BY g.target_date ASC, g.id ASC
            LIMIT ${Number(limit) + 1}
          `;
        });

        const hasMore = goals.length > limit;
        const items = hasMore ? goals.slice(0, limit) : goals;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
          items,
          nextCursor,
          hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
    },
    {
      beforeHandle: [requirePermission("goals", "read")],
      query: t.Composite([
        t.Partial(GoalFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
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
      const { db, params, tenantContext, error } = ctx as any;
      try {
        const [goal] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT g.*, e.first_name || ' ' || e.last_name as employee_name
            FROM app.goals g
            JOIN app.employees e ON e.id = g.employee_id
            WHERE g.id = ${params.id}::uuid AND g.tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!goal) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Goal not found" },
          });
        }

        return goal;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        const [goal] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            INSERT INTO app.goals (
              id, tenant_id, employee_id, title, description, category,
              weight, target_date, metrics, parent_goal_id, status, progress
            ) VALUES (
              gen_random_uuid(), ${tenantContext.tenantId}::uuid, ${(body as any).employeeId}::uuid,
              ${(body as any).title}, ${(body as any).description || null}, ${(body as any).category || null},
              ${(body as any).weight || 0}, ${(body as any).targetDate}::date,
              ${(body as any).metrics ? JSON.stringify((body as any).metrics) : null}::jsonb,
              ${(body as any).parentGoalId || null}::uuid, 'active', 0
            )
            RETURNING *
          `;
        });

        // Audit log the creation
        if (audit) {
          await (audit as any).log({
            action: "talent.goal.created",
            resourceType: "goal",
            resourceId: goal.id,
            newValues: goal,
            metadata: { idempotencyKey, requestId },
          });
        }

        return goal;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, params, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        // Get current state for audit
        const [oldGoal] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.goals
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!oldGoal) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Goal not found" },
          });
        }

        const [goal] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            UPDATE app.goals SET
              title = COALESCE(${(body as any).title}, title),
              description = COALESCE(${(body as any).description}, description),
              category = COALESCE(${(body as any).category}, category),
              weight = COALESCE(${(body as any).weight}, weight),
              target_date = COALESCE(${(body as any).targetDate}::date, target_date),
              status = COALESCE(${(body as any).status}, status),
              progress = COALESCE(${(body as any).progress}, progress),
              metrics = COALESCE(${(body as any).metrics ? JSON.stringify((body as any).metrics) : null}::jsonb, metrics),
              updated_at = now()
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
            RETURNING *
          `;
        });

        // Audit log the update
        if (audit) {
          await (audit as any).log({
            action: "talent.goal.updated",
            resourceType: "goal",
            resourceId: params.id,
            oldValues: oldGoal,
            newValues: goal,
            metadata: { idempotencyKey, requestId },
          });
        }

        return goal;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, params, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        // Get current state for audit
        const [oldGoal] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.goals
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!oldGoal) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Goal not found" },
          });
        }

        await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            UPDATE app.goals SET
              status = 'cancelled',
              updated_at = now()
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        // Audit log the deletion
        if (audit) {
          await (audit as any).log({
            action: "talent.goal.deleted",
            resourceType: "goal",
            resourceId: params.id,
            oldValues: oldGoal,
            metadata: { idempotencyKey, requestId },
          });
        }

        return { success: true as const, message: "Goal deleted successfully" };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, query, tenantContext, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const cycles = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.review_cycles
            WHERE tenant_id = ${tenantContext.tenantId}::uuid
            ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
            ORDER BY period_end DESC, id ASC
            LIMIT ${Number(limit) + 1}
          `;
        });

        const hasMore = cycles.length > limit;
        const items = hasMore ? cycles.slice(0, limit) : cycles;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
          items,
          nextCursor,
          hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
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
      const { db, params, tenantContext, error } = ctx as any;
      try {
        const [cycle] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.review_cycles
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!cycle) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Review cycle not found" },
          });
        }

        return cycle;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        const [cycle] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            INSERT INTO app.review_cycles (
              id, tenant_id, name, description, period_start, period_end,
              self_review_deadline, manager_review_deadline, calibration_deadline, status
            ) VALUES (
              gen_random_uuid(), ${tenantContext.tenantId}::uuid, ${(body as any).name}, ${(body as any).description || null},
              ${(body as any).periodStart}::date, ${(body as any).periodEnd}::date,
              ${(body as any).selfReviewDeadline}::date, ${(body as any).managerReviewDeadline}::date,
              ${(body as any).calibrationDeadline || null}::date, 'draft'
            )
            RETURNING *
          `;
        });

        // Audit log the creation
        if (audit) {
          await (audit as any).log({
            action: "talent.review_cycle.created",
            resourceType: "review_cycle",
            resourceId: cycle.id,
            newValues: cycle,
            metadata: { idempotencyKey, requestId },
          });
        }

        return cycle;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, query, tenantContext, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const reviews = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT r.*, e.first_name || ' ' || e.last_name as employee_name,
                   rc.name as cycle_name
            FROM app.reviews r
            JOIN app.employees e ON e.id = r.employee_id
            JOIN app.review_cycles rc ON rc.id = r.review_cycle_id
            WHERE r.tenant_id = ${tenantContext.tenantId}::uuid
            ${cursor ? tx`AND r.id > ${cursor}::uuid` : tx``}
            ORDER BY r.created_at DESC, r.id ASC
            LIMIT ${Number(limit) + 1}
          `;
        });

        const hasMore = reviews.length > limit;
        const items = hasMore ? reviews.slice(0, limit) : reviews;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
          items,
          nextCursor,
          hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
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
      const { db, params, tenantContext, error } = ctx as any;
      try {
        const [review] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT r.*, e.first_name || ' ' || e.last_name as employee_name,
                   rc.name as cycle_name
            FROM app.reviews r
            JOIN app.employees e ON e.id = r.employee_id
            JOIN app.review_cycles rc ON rc.id = r.review_cycle_id
            WHERE r.id = ${params.id}::uuid AND r.tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!review) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Review not found" },
          });
        }

        return review;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        const [review] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            INSERT INTO app.reviews (
              id, tenant_id, review_cycle_id, employee_id, reviewer_id, status
            ) VALUES (
              gen_random_uuid(), ${tenantContext.tenantId}::uuid, ${(body as any).reviewCycleId}::uuid,
              ${(body as any).employeeId}::uuid, ${(body as any).reviewerId}::uuid, 'draft'
            )
            RETURNING *
          `;
        });

        // Audit log the creation
        if (audit) {
          await (audit as any).log({
            action: "talent.review.created",
            resourceType: "review",
            resourceId: review.id,
            newValues: review,
            metadata: { idempotencyKey, requestId },
          });
        }

        return review;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, params, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        // Get current state for audit
        const [oldReview] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.reviews
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!oldReview) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Review not found" },
          });
        }

        const selfReviewData = {
          accomplishments: (body as any).accomplishments,
          challenges: (body as any).challenges,
          developmentAreas: (body as any).developmentAreas,
          selfRating: (body as any).selfRating,
          goalRatings: (body as any).goalRatings,
          competencyRatings: (body as any).competencyRatings,
        };

        const [review] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            UPDATE app.reviews SET
              self_review = ${JSON.stringify(selfReviewData)}::jsonb,
              status = 'self_review',
              self_review_submitted_at = now(),
              updated_at = now()
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
            RETURNING *
          `;
        });

        // Audit log the submission
        if (audit) {
          await (audit as any).log({
            action: "talent.review.self_review_submitted",
            resourceType: "review",
            resourceId: params.id,
            oldValues: { status: oldReview.status },
            newValues: { status: review.status, selfRating: (body as any).selfRating },
            metadata: { idempotencyKey, requestId },
          });
        }

        return review;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, params, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        // Get current state for audit
        const [oldReview] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.reviews
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!oldReview) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Review not found" },
          });
        }

        const managerReviewData = {
          feedback: (body as any).feedback,
          strengths: (body as any).strengths,
          developmentAreas: (body as any).developmentAreas,
          managerRating: (body as any).managerRating,
          goalRatings: (body as any).goalRatings,
          competencyRatings: (body as any).competencyRatings,
          promotionRecommendation: (body as any).promotionRecommendation,
        };

        const [review] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            UPDATE app.reviews SET
              manager_review = ${JSON.stringify(managerReviewData)}::jsonb,
              status = 'manager_review',
              manager_review_submitted_at = now(),
              updated_at = now()
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
            RETURNING *
          `;
        });

        // Audit log the submission
        if (audit) {
          await (audit as any).log({
            action: "talent.review.manager_review_submitted",
            resourceType: "review",
            resourceId: params.id,
            oldValues: { status: oldReview.status },
            newValues: {
              status: review.status,
              managerRating: (body as any).managerRating,
              promotionRecommendation: (body as any).promotionRecommendation,
            },
            metadata: { idempotencyKey, requestId },
          });
        }

        return review;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, query, tenantContext, error } = ctx as any;
      const { cursor, limit = 20 } = query;

      try {
        const competencies = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.competencies
            WHERE tenant_id = ${tenantContext.tenantId}::uuid
            ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
            ORDER BY category, name, id ASC
            LIMIT ${Number(limit) + 1}
          `;
        });

        const hasMore = competencies.length > limit;
        const items = hasMore ? competencies.slice(0, limit) : competencies;
        const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

        return {
          items,
          nextCursor,
          hasMore,
        };
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
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
      const { db, params, tenantContext, error } = ctx as any;
      try {
        const [competency] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            SELECT * FROM app.competencies
            WHERE id = ${params.id}::uuid AND tenant_id = ${tenantContext.tenantId}::uuid
          `;
        });

        if (!competency) {
          return error(404, {
            error: { code: "NOT_FOUND", message: "Competency not found" },
          });
        }

        return competency;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
      const { db, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      try {
        const [competency] = await (db as any).withTransaction(tenantContext, async (tx: any) => {
          return tx`
            INSERT INTO app.competencies (
              id, tenant_id, name, description, category, levels
            ) VALUES (
              gen_random_uuid(), ${tenantContext.tenantId}::uuid, ${(body as any).name},
              ${(body as any).description || null}, ${(body as any).category},
              ${JSON.stringify((body as any).levels)}::jsonb
            )
            RETURNING *
          `;
        });

        // Audit log the creation
        if (audit) {
          await (audit as any).log({
            action: "talent.competency.created",
            resourceType: "competency",
            resourceId: competency.id,
            newValues: competency,
            metadata: { idempotencyKey, requestId },
          });
        }

        return competency;
      } catch (err: any) {
        return error(500, {
          error: { code: "INTERNAL_ERROR", message: err.message },
        });
      }
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
