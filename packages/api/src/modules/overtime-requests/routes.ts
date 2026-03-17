/**
 * Overtime Requests Module - Elysia Routes
 *
 * Defines the API endpoints for the Overtime Authorisation Workflow.
 *
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - overtime_requests: read, write
 *
 * Endpoints:
 * - POST   /overtime-requests                   - Submit a new overtime request
 * - GET    /overtime-requests/my                 - List my overtime requests (employee self-service)
 * - GET    /overtime-requests/pending            - List pending requests (manager view)
 * - GET    /overtime-requests/:id                - Get request by ID
 * - PATCH  /overtime-requests/:id/approve        - Approve request
 * - PATCH  /overtime-requests/:id/reject         - Reject request
 * - PATCH  /overtime-requests/:id/cancel         - Cancel request (employee)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { OvertimeRequestRepository } from "./repository";
import { OvertimeRequestService } from "./service";
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
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface OvertimeRequestPluginContext {
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
 * Create overtime request routes plugin
 */
export const overtimeRequestRoutes = new Elysia({
  prefix: "/overtime-requests",
  name: "overtime-requests-routes",
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
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "Submit overtime request",
        description:
          "Submit a new overtime authorisation request. Created in pending status awaiting manager approval.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /my - List my overtime requests (employee self-service)
  // ===========================================================================
  .get(
    "/my",
    async (ctx) => {
      const { otService, query, tenantContext } =
        ctx as typeof ctx & OvertimeRequestPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      // Use the authenticated user's ID to filter their own requests
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
        tags: ["Overtime"],
        summary: "List my overtime requests",
        description:
          "List overtime requests for the authenticated employee with optional filters and cursor-based pagination.",
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
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "List pending overtime requests (manager)",
        description:
          "List all pending overtime requests awaiting approval. Requires write permission (manager/approver role).",
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
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "Get overtime request by ID",
        description: "Get a single overtime request by UUID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/approve - Approve request
  // ===========================================================================
  .patch(
    "/:id/approve",
    async (ctx) => {
      const { otService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "Approve overtime request",
        description:
          "Approve a pending overtime request. Optionally update the actual hours at approval time. Approver cannot be the requesting employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/reject - Reject request
  // ===========================================================================
  .patch(
    "/:id/reject",
    async (ctx) => {
      const { otService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "Reject overtime request",
        description:
          "Reject a pending overtime request. A rejection reason is required. Approver cannot be the requesting employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/cancel - Cancel request (employee self-service)
  // ===========================================================================
  .patch(
    "/:id/cancel",
    async (ctx) => {
      const { otService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & OvertimeRequestPluginContext;
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
        tags: ["Overtime"],
        summary: "Cancel overtime request",
        description:
          "Cancel a pending overtime request. Only pending requests can be cancelled.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type OvertimeRequestRoutes = typeof overtimeRequestRoutes;
