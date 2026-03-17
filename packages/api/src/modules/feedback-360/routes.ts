/**
 * Feedback 360 Module Routes
 *
 * Defines the API endpoints for 360-degree feedback operations.
 * All routes delegate to Feedback360Service for business logic.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - feedback_360_cycles: read, write
 * - feedback_360_responses: read, write
 *
 * Endpoints:
 *   GET    /feedback-360/cycles             List cycles (cursor-based pagination)
 *   GET    /feedback-360/cycles/:id         Get cycle by ID
 *   POST   /feedback-360/cycles             Create cycle
 *   PATCH  /feedback-360/cycles/:id         Update cycle (status, deadline)
 *   POST   /feedback-360/cycles/:id/nominate  Nominate reviewers
 *   GET    /feedback-360/cycles/:id/responses  List responses for a cycle
 *   POST   /feedback-360/responses/:id/submit  Submit feedback
 *   POST   /feedback-360/responses/:id/decline Decline feedback
 *   GET    /feedback-360/cycles/:id/results    Get aggregated results (anonymised)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { Feedback360Repository } from "./repository";
import { Feedback360Service } from "./service";
import {
  CreateFeedback360CycleSchema,
  UpdateFeedback360CycleSchema,
  NominateReviewersSchema,
  SubmitFeedback360Schema,
  DeclineFeedback360Schema,
  Feedback360CycleFiltersSchema,
  IdParamsSchema,
  UuidSchema,
  PaginationQuerySchema,
  Feedback360CycleStatusSchema,
  Feedback360ReviewerTypeSchema,
  Feedback360ResponseStatusSchema,
} from "./schemas";

// =============================================================================
// Response Schemas
// =============================================================================

const CycleResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  review_cycle_id: t.Union([UuidSchema, t.Null()]),
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  review_cycle_name: t.Optional(t.Union([t.String(), t.Null()])),
  status: Feedback360CycleStatusSchema,
  deadline: t.Union([t.String(), t.Null()]),
  min_responses: t.Number(),
  submitted_count: t.Optional(t.Number()),
  total_reviewers: t.Optional(t.Number()),
  created_at: t.String(),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_at: t.String(),
});

const ResponseItemSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  cycle_id: UuidSchema,
  reviewer_id: UuidSchema,
  reviewer_name: t.Optional(t.String()),
  reviewer_type: Feedback360ReviewerTypeSchema,
  status: Feedback360ResponseStatusSchema,
  submitted_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

const FullResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  cycle_id: UuidSchema,
  reviewer_id: UuidSchema,
  reviewer_name: t.Optional(t.String()),
  reviewer_type: Feedback360ReviewerTypeSchema,
  status: Feedback360ResponseStatusSchema,
  ratings: t.Any(),
  strengths: t.Union([t.String(), t.Null()]),
  development_areas: t.Union([t.String(), t.Null()]),
  comments: t.Union([t.String(), t.Null()]),
  submitted_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

/** Module-specific error code overrides */
const FEEDBACK_360_ERROR_CODES: Record<string, number> = {
  INVALID_CYCLE: 400,
  INVALID_RESPONSE: 400,
  CYCLE_NOT_COLLECTING: 400,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

// =============================================================================
// Feedback 360 Routes
// =============================================================================

export const feedback360Routes = new Elysia({ prefix: "/feedback-360", name: "feedback-360-routes" })

  // ===========================================================================
  // Plugin Setup - Derive tenant context, service, and repository
  // ===========================================================================
  .derive((ctx) => {
    const { db, tenant, user } = ctx as any;
    const repository = new Feedback360Repository(db);
    const service = new Feedback360Service(repository, db);
    const tenantContext = {
      tenantId: (tenant as any)?.id || "",
      userId: (user as any)?.id,
    };
    return { feedback360Service: service, feedback360Repository: repository, tenantContext };
  })

  // ===========================================================================
  // Cycle Routes
  // ===========================================================================

  // GET /cycles - List 360 feedback cycles
  .get(
    "/cycles",
    async (ctx) => {
      const { feedback360Service, tenantContext, query, error } = ctx as any;
      const { cursor, limit = 20, ...filters } = query;

      try {
        const result = await feedback360Service.listCycles(
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
      beforeHandle: [requirePermission("feedback_360_cycles", "read")],
      query: t.Partial(Feedback360CycleFiltersSchema),
      response: {
        200: t.Object({
          items: t.Array(CycleResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "List 360 feedback cycles",
        description: "List 360 feedback cycles with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /cycles/:id - Get cycle by ID
  .get(
    "/cycles/:id",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, error } = ctx as any;

      const result = await feedback360Service.getCycle(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("feedback_360_cycles", "read")],
      params: IdParamsSchema,
      response: {
        200: CycleResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Get 360 feedback cycle by ID",
        description: "Get a single 360 feedback cycle by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /cycles - Create cycle
  .post(
    "/cycles",
    async (ctx) => {
      const { feedback360Service, tenantContext, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await feedback360Service.createCycle(tenantContext, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      if (audit) {
        await (audit as any).log({
          action: "feedback_360.cycle.created",
          resourceType: "feedback_360_cycle",
          resourceId: result.data.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("feedback_360_cycles", "write")],
      body: CreateFeedback360CycleSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CycleResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Create 360 feedback cycle",
        description: "Create a new 360 feedback cycle for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /cycles/:id - Update cycle
  .patch(
    "/cycles/:id",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // If status is being updated, use the status transition method
      if (body.status) {
        const result = await feedback360Service.updateCycleStatus(tenantContext, params.id, body.status);

        if (!result.success) {
          return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
            error: result.error,
          });
        }

        if (audit) {
          await (audit as any).log({
            action: "feedback_360.cycle.status_changed",
            resourceType: "feedback_360_cycle",
            resourceId: params.id,
            oldValues: { status: result.data.oldCycle.status },
            newValues: { status: result.data.cycle.status },
            metadata: { idempotencyKey, requestId },
          });
        }

        return result.data.cycle;
      }

      // Otherwise, handle non-status updates (deadline, minResponses)
      const existing = await feedback360Service.getCycle(tenantContext, params.id);
      if (!existing.success) {
        return error(404, { error: existing.error });
      }

      // For now, delegate to repository for simple field updates
      const { feedback360Repository } = ctx as any;
      const updated = await feedback360Repository.updateCycle(tenantContext, params.id, body);

      if (!updated) {
        return error(404, {
          error: { code: ErrorCodes.NOT_FOUND, message: "360 feedback cycle not found" },
        });
      }

      if (audit) {
        await (audit as any).log({
          action: "feedback_360.cycle.updated",
          resourceType: "feedback_360_cycle",
          resourceId: params.id,
          oldValues: existing.data,
          newValues: updated,
          metadata: { idempotencyKey, requestId },
        });
      }

      return updated;
    },
    {
      beforeHandle: [requirePermission("feedback_360_cycles", "write")],
      params: IdParamsSchema,
      body: UpdateFeedback360CycleSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: CycleResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Update 360 feedback cycle",
        description: "Update cycle status, deadline, or minimum response count",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /cycles/:id/nominate - Nominate reviewers
  .post(
    "/cycles/:id/nominate",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await feedback360Service.nominateReviewers(
        tenantContext,
        params.id,
        body.reviewers
      );

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      if (audit) {
        await (audit as any).log({
          action: "feedback_360.reviewers.nominated",
          resourceType: "feedback_360_cycle",
          resourceId: params.id,
          newValues: { reviewerCount: result.data.count },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("feedback_360_cycles", "write")],
      params: IdParamsSchema,
      body: NominateReviewersSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: t.Object({
          responses: t.Array(t.Any()),
          count: t.Number(),
        }),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Nominate reviewers",
        description: "Nominate reviewers for a 360 feedback cycle. Creates pending response records.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /cycles/:id/responses - List responses for a cycle
  .get(
    "/cycles/:id/responses",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, error } = ctx as any;

      const result = await feedback360Service.listResponses(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("feedback_360_responses", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          responses: t.Array(ResponseItemSchema),
          summary: t.Array(t.Any()),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "List cycle responses",
        description: "List all response records for a 360 feedback cycle with status summary",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /cycles/:id/results - Get aggregated results (anonymised for peers)
  .get(
    "/cycles/:id/results",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, error } = ctx as any;

      const result = await feedback360Service.getAggregatedResults(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("feedback_360_cycles", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          cycleId: UuidSchema,
          employeeId: UuidSchema,
          status: Feedback360CycleStatusSchema,
          results: t.Array(
            t.Object({
              reviewerType: Feedback360ReviewerTypeSchema,
              responseCount: t.Number(),
              avgRatings: t.Any(),
              commentsVisible: t.Boolean(),
              isAnonymous: t.Boolean(),
            })
          ),
          summary: t.Array(t.Any()),
          identifiedFeedback: t.Array(
            t.Object({
              reviewerType: Feedback360ReviewerTypeSchema,
              reviewerName: t.Optional(t.String()),
              strengths: t.Union([t.String(), t.Null()]),
              developmentAreas: t.Union([t.String(), t.Null()]),
              comments: t.Union([t.String(), t.Null()]),
            })
          ),
        }),
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Get aggregated 360 results",
        description:
          "Get anonymised aggregated 360 feedback results. Peer and direct report feedback " +
          "is aggregated and anonymised; individual comments are only visible when the minimum " +
          "response threshold is met. Self and manager feedback is identified.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Response Routes (submit / decline individual feedback)
  // ===========================================================================

  // POST /responses/:id/submit - Submit feedback
  .post(
    "/responses/:id/submit",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await feedback360Service.submitFeedback(tenantContext, params.id, body);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      if (audit) {
        await (audit as any).log({
          action: "feedback_360.response.submitted",
          resourceType: "feedback_360_response",
          resourceId: params.id,
          oldValues: { status: result.data.oldResponse.status },
          newValues: { status: result.data.response.status },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data.response;
    },
    {
      beforeHandle: [requirePermission("feedback_360_responses", "write")],
      params: IdParamsSchema,
      body: SubmitFeedback360Schema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FullResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Submit 360 feedback",
        description: "Submit feedback for a 360 response. Cycle must be in 'collecting' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /responses/:id/decline - Decline feedback
  .post(
    "/responses/:id/decline",
    async (ctx) => {
      const { feedback360Service, tenantContext, params, body, headers, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await feedback360Service.declineFeedback(tenantContext, params.id);

      if (!result.success) {
        return error(mapErrorToStatus(result.error.code, FEEDBACK_360_ERROR_CODES), {
          error: result.error,
        });
      }

      if (audit) {
        await (audit as any).log({
          action: "feedback_360.response.declined",
          resourceType: "feedback_360_response",
          resourceId: params.id,
          oldValues: { status: result.data.oldResponse.status },
          newValues: { status: result.data.response.status },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data.response;
    },
    {
      beforeHandle: [requirePermission("feedback_360_responses", "write")],
      params: IdParamsSchema,
      body: t.Optional(DeclineFeedback360Schema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ResponseItemSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Talent - 360 Feedback"],
        summary: "Decline 360 feedback",
        description: "Decline to provide feedback for a 360 response",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type Feedback360Routes = typeof feedback360Routes;
