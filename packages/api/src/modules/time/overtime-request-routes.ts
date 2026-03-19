/**
 * Time Module - Overtime Request Routes (TODO-250)
 *
 * Mounts overtime authorisation workflow endpoints under the /time prefix.
 * This provides a unified API surface for time-related operations:
 *
 *   POST   /api/v1/time/overtime-requests              - Submit overtime request
 *   GET    /api/v1/time/overtime-requests               - List own requests
 *   GET    /api/v1/time/overtime-requests/pending       - Manager: pending approvals
 *   GET    /api/v1/time/overtime-requests/:id           - Get request by ID
 *   POST   /api/v1/time/overtime-requests/:id/approve   - Approve request
 *   POST   /api/v1/time/overtime-requests/:id/reject    - Reject request
 *   POST   /api/v1/time/overtime-requests/:id/cancel    - Cancel request
 *
 * State machine:  pending -> approved / rejected / cancelled
 *
 * These routes delegate to the OvertimeRequestService, sharing the same
 * repository, outbox events, and RLS enforcement as the standalone module.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { OvertimeRequestRepository } from "../overtime-requests/repository";
import { OvertimeRequestService } from "../overtime-requests/service";
import {
  CreateOvertimeRequestSchema,
  ApproveOvertimeRequestSchema,
  RejectOvertimeRequestSchema,
  OvertimeRequestResponseSchema,
  OvertimeRequestFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateOvertimeRequest,
  type ApproveOvertimeRequest,
  type RejectOvertimeRequest,
} from "../overtime-requests/schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface OvertimeRouteContext {
  otService: OvertimeRequestService;
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
 * Overtime request routes mounted under /time prefix.
 * Uses POST for approve/reject per TODO-250 specification.
 */
export const timeOvertimeRoutes = new Elysia({
  prefix: "/time/overtime-requests",
  name: "time-overtime-requests-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new OvertimeRequestRepository(db);
    const service = new OvertimeRequestService(repository, db);
    return { otService: service };
  })

  // ===========================================================================
  // POST / - Submit a new overtime request
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { otService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & OvertimeRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await otService.createRequest(
        tenantContext,
        body as unknown as CreateOvertimeRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "overtime_request.created",
          resourceType: "overtime_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "write")],
      body: CreateOvertimeRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: OvertimeRequestResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Time", "Overtime"],
        summary: "Submit overtime authorisation request",
        description:
          "Submit a new overtime authorisation request. Supports pre_approval (before overtime) " +
          "and post_approval (retroactive authorisation). Created in pending status awaiting manager approval.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET / - List own overtime requests (employee self-service)
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { otService, query, tenantContext } =
        ctx as typeof ctx & OvertimeRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const employeeId = tenantContext?.userId || "";

      const result = await otService.listMyRequests(
        tenantContext,
        employeeId,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "read")],
      query: t.Composite([
        t.Partial(OvertimeRequestFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(OvertimeRequestResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Time", "Overtime"],
        summary: "List own overtime requests",
        description:
          "List overtime authorisation requests for the authenticated employee. " +
          "Supports filtering by status, type, authorisation_type, and date range.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /pending - List pending requests (manager view)
  // ===========================================================================
  .get(
    "/pending",
    async (ctx) => {
      const { otService, query, tenantContext } =
        ctx as typeof ctx & OvertimeRouteContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const approverId = tenantContext?.userId || "";

      const result = await otService.listPendingRequests(
        tenantContext,
        approverId,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "write")],
      query: t.Partial(PaginationQuerySchema),
      response: t.Object({
        items: t.Array(OvertimeRequestResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Time", "Overtime"],
        summary: "List pending overtime requests (manager)",
        description:
          "List all pending overtime authorisation requests awaiting approval. " +
          "Requires write permission (manager/approver role).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get request by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { otService, params, tenantContext, error } =
        ctx as typeof ctx & OvertimeRouteContext;
      const result = await otService.getRequest(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "read")],
      params: IdParamsSchema,
      response: {
        200: OvertimeRequestResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Time", "Overtime"],
        summary: "Get overtime request by ID",
        description: "Get a single overtime authorisation request by UUID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /:id/approve - Approve request (TODO-250: uses POST)
  // ===========================================================================
  .post(
    "/:id/approve",
    async (ctx) => {
      const { otService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await otService.approveRequest(
        tenantContext,
        params.id,
        body as unknown as ApproveOvertimeRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "overtime_request.approved",
          resourceType: "overtime_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "write")],
      params: IdParamsSchema,
      body: ApproveOvertimeRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: OvertimeRequestResponseSchema,
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Time", "Overtime"],
        summary: "Approve overtime request",
        description:
          "Approve a pending overtime authorisation request. Optionally update actual hours " +
          "and provide manager notes. Approver cannot be the requesting employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /:id/reject - Reject request (TODO-250: uses POST)
  // ===========================================================================
  .post(
    "/:id/reject",
    async (ctx) => {
      const { otService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await otService.rejectRequest(
        tenantContext,
        params.id,
        body as unknown as RejectOvertimeRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "overtime_request.rejected",
          resourceType: "overtime_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            rejection_reason: (body as unknown as RejectOvertimeRequest).rejection_reason,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "write")],
      params: IdParamsSchema,
      body: RejectOvertimeRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: OvertimeRequestResponseSchema,
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Time", "Overtime"],
        summary: "Reject overtime request",
        description:
          "Reject a pending overtime authorisation request. A rejection reason is required. " +
          "Approver cannot be the requesting employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /:id/cancel - Cancel request (employee self-service)
  // ===========================================================================
  .post(
    "/:id/cancel",
    async (ctx) => {
      const { otService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await otService.cancelRequest(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "overtime_request.cancelled",
          resourceType: "overtime_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("overtime_requests", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: OvertimeRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Time", "Overtime"],
        summary: "Cancel overtime request",
        description:
          "Cancel a pending overtime authorisation request. Only pending requests can be cancelled.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TimeOvertimeRoutes = typeof timeOvertimeRoutes;
