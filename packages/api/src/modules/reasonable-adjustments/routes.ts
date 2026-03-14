/**
 * Reasonable Adjustments Module - Elysia Routes
 *
 * Defines the API endpoints for Reasonable Adjustments tracking.
 * Equality Act 2010 (ss.20-22) requires employers to make
 * reasonable adjustments for disabled employees.
 *
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - reasonable_adjustments: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ReasonableAdjustmentsRepository } from "./repository";
import { ReasonableAdjustmentsService } from "./service";
import {
  // Request schemas
  CreateAdjustmentSchema,
  AssessAdjustmentSchema,
  DecideAdjustmentSchema,
  ImplementAdjustmentSchema,
  AdjustmentFiltersSchema,
  // Response schemas
  AdjustmentResponseSchema,
  AdjustmentListItemSchema,
  DueReviewItemSchema,
  // Common schemas
  IdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateAdjustment,
  type AssessAdjustment,
  type DecideAdjustment,
  type ImplementAdjustment,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & AdjustmentsPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface AdjustmentsPluginContext {
  adjustmentService: ReasonableAdjustmentsService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes beyond the shared base set
 */
const adjustmentErrorStatusMap: Record<string, number> = {
  INVALID_EMPLOYEE: 400,
};

/**
 * Create Reasonable Adjustments routes plugin
 */
export const reasonableAdjustmentsRoutes = new Elysia({
  prefix: "/reasonable-adjustments",
  name: "reasonable-adjustments-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ReasonableAdjustmentsRepository(db);
    const service = new ReasonableAdjustmentsService(repository, db);
    return { adjustmentService: service };
  })

  // ===========================================================================
  // POST / - Create a new reasonable adjustment request
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { adjustmentService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & AdjustmentsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await adjustmentService.create(
        tenantContext,
        body as CreateAdjustment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "hr.reasonable_adjustment.created",
          resourceType: "reasonable_adjustment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "write")],
      body: CreateAdjustmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: AdjustmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Create reasonable adjustment request",
        description:
          "Create a new reasonable adjustment request for an employee under the Equality Act 2010",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET / - List reasonable adjustments
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { adjustmentService, query, tenantContext } = ctx as typeof ctx & AdjustmentsPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await adjustmentService.list(tenantContext, filters, {
        cursor,
        limit: parsedLimit,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "read")],
      query: t.Composite([
        t.Partial(AdjustmentFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(AdjustmentListItemSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "List reasonable adjustments",
        description:
          "List reasonable adjustments with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /due-reviews - Adjustments due for review
  // ===========================================================================
  .get(
    "/due-reviews",
    async (ctx) => {
      const { adjustmentService, tenantContext, error } = ctx as typeof ctx & AdjustmentsPluginContext;

      const result = await adjustmentService.getDueReviews(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "read")],
      response: {
        200: t.Array(DueReviewItemSchema),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Get adjustments due for review",
        description:
          "Returns implemented adjustments whose review date is on or before today",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get single adjustment
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { adjustmentService, params, tenantContext, error } = ctx as typeof ctx & AdjustmentsPluginContext;
      const result = await adjustmentService.getById(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "read")],
      params: IdParamsSchema,
      response: {
        200: AdjustmentResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Get reasonable adjustment by ID",
        description: "Get a single reasonable adjustment record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/assess - Assess an adjustment
  // ===========================================================================
  .patch(
    "/:id/assess",
    async (ctx) => {
      const { adjustmentService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & AdjustmentsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await adjustmentService.getById(tenantContext, params.id);

      const result = await adjustmentService.assess(
        tenantContext,
        params.id,
        body as AssessAdjustment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "hr.reasonable_adjustment.assessed",
          resourceType: "reasonable_adjustment",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "write")],
      params: IdParamsSchema,
      body: AssessAdjustmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: AdjustmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Assess adjustment",
        description:
          "Record an assessment for a reasonable adjustment request (transitions to under_review)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/decide - Approve or reject an adjustment
  // ===========================================================================
  .patch(
    "/:id/decide",
    async (ctx) => {
      const { adjustmentService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & AdjustmentsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await adjustmentService.getById(tenantContext, params.id);

      const typedBody = body as DecideAdjustment;
      const result = await adjustmentService.decide(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: typedBody.decision === "approved"
            ? "hr.reasonable_adjustment.approved"
            : "hr.reasonable_adjustment.rejected",
          resourceType: "reasonable_adjustment",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, decision: typedBody.decision },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "write")],
      params: IdParamsSchema,
      body: DecideAdjustmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: AdjustmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Decide on adjustment",
        description:
          "Approve or reject a reasonable adjustment (transitions from under_review to approved/rejected)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/implement - Mark adjustment as implemented
  // ===========================================================================
  .patch(
    "/:id/implement",
    async (ctx) => {
      const { adjustmentService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & AdjustmentsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await adjustmentService.getById(tenantContext, params.id);

      const result = await adjustmentService.implement(
        tenantContext,
        params.id,
        body as ImplementAdjustment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "hr.reasonable_adjustment.implemented",
          resourceType: "reasonable_adjustment",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "write")],
      params: IdParamsSchema,
      body: ImplementAdjustmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: AdjustmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Implement adjustment",
        description:
          "Mark a reasonable adjustment as implemented (transitions from approved to implemented)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/withdraw - Withdraw an adjustment
  // ===========================================================================
  .patch(
    "/:id/withdraw",
    async (ctx) => {
      const { adjustmentService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & AdjustmentsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await adjustmentService.getById(tenantContext, params.id);

      const result = await adjustmentService.withdraw(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          adjustmentErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "hr.reasonable_adjustment.withdrawn",
          resourceType: "reasonable_adjustment",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reasonable_adjustments", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: AdjustmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Reasonable Adjustments"],
        summary: "Withdraw adjustment",
        description:
          "Withdraw a reasonable adjustment request (only from requested or under_review status)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ReasonableAdjustmentsRoutes = typeof reasonableAdjustmentsRoutes;
