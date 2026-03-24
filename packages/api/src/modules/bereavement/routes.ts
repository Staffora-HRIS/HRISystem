/**
 * Parental Bereavement Leave Module - Elysia Routes
 *
 * Defines the API endpoints for Parental Bereavement Leave (Jack's Law).
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - bereavement: read, write
 *
 * Endpoints:
 * - GET    /bereavement          - List bereavement leave records (paginated)
 * - GET    /bereavement/:id      - Get a single record by ID
 * - POST   /bereavement          - Create a new bereavement leave request
 * - PUT    /bereavement/:id      - Update a pending record
 * - PATCH  /bereavement/:id/status - Approve, activate, or complete a record
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { BereavementRepository } from "./repository";
import { BereavementService } from "./service";
import {
  CreateBereavementLeaveSchema,
  UpdateBereavementLeaveSchema,
  BereavementStatusTransitionSchema,
  BereavementLeaveResponseSchema,
  BereavementLeaveListResponseSchema,
  BereavementLeaveFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateBereavementLeave,
  type UpdateBereavementLeave,
  type BereavementStatusTransition,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface BereavementPluginContext {
  bereavementService: BereavementService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface BereavementRouteContext extends BereavementPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Module-specific error codes mapped to HTTP status codes
 */
const bereavementErrorStatusMap: Record<string, number> = {
  LEAVE_EXCEEDS_MAXIMUM: 400,
  LEAVE_BEFORE_DEATH: 400,
  LEAVE_OUTSIDE_WINDOW: 400,
  SPBP_NOT_ELIGIBLE: 400,
};

/**
 * Create bereavement routes plugin
 */
export const bereavementRoutes = new Elysia({ prefix: "/bereavement", name: "bereavement-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new BereavementRepository(db);
    const service = new BereavementService(repository, db);

    return { bereavementService: service };
  })

  // ===========================================================================
  // GET /bereavement - List bereavement leave records
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { bereavementService, query, tenantContext } = ctx as unknown as BereavementRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await bereavementService.list(
        tenantContext,
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
      beforeHandle: [requirePermission("bereavement", "read")],
      query: t.Composite([
        t.Partial(BereavementLeaveFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: BereavementLeaveListResponseSchema,
      detail: {
        tags: ["Bereavement"],
        summary: "List parental bereavement leave records",
        description:
          "List parental bereavement leave records with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /bereavement/:id - Get bereavement leave record by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { bereavementService, params, tenantContext, error } = ctx as unknown as BereavementRouteContext;
      const result = await bereavementService.getById(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bereavementErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("bereavement", "read")],
      params: IdParamsSchema,
      response: {
        200: BereavementLeaveResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bereavement"],
        summary: "Get bereavement leave record by ID",
        description: "Get a single parental bereavement leave record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /bereavement - Create bereavement leave request
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { bereavementService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as BereavementRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bereavementService.create(tenantContext, body as unknown as CreateBereavementLeave);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bereavementErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "bereavement.leave.created",
          resourceType: "parental_bereavement_leave",
          resourceId: result.data!.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("bereavement", "write")],
      body: CreateBereavementLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BereavementLeaveResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bereavement"],
        summary: "Create parental bereavement leave request",
        description:
          "Create a new parental bereavement leave request. " +
          "Validates against the 2-week maximum, 56-week window, and SPBP eligibility rules.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /bereavement/:id - Update bereavement leave record
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const { bereavementService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BereavementRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bereavementService.getById(tenantContext, params.id);

      const result = await bereavementService.update(tenantContext, params.id, body as unknown as UpdateBereavementLeave);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bereavementErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "bereavement.leave.updated",
          resourceType: "parental_bereavement_leave",
          resourceId: params.id,
          oldValues: oldResult.data as unknown as Record<string, unknown>,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("bereavement", "write")],
      params: IdParamsSchema,
      body: UpdateBereavementLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BereavementLeaveResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bereavement"],
        summary: "Update parental bereavement leave record",
        description:
          "Update a parental bereavement leave record. " +
          "Only records in 'pending' status can be updated.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /bereavement/:id/status - Transition bereavement leave status
  // ===========================================================================
  .patch(
    "/:id/status",
    async (ctx) => {
      const { bereavementService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as BereavementRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bereavementService.getById(tenantContext, params.id);
      const typedBody = body as unknown as BereavementStatusTransition;

      const result = await bereavementService.transitionStatus(tenantContext, params.id, typedBody);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bereavementErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the status transition
      if (audit) {
        await audit.log({
          action: `bereavement.leave.${typedBody.status}`,
          resourceType: "parental_bereavement_leave",
          resourceId: params.id,
          oldValues: oldResult.data as unknown as Record<string, unknown>,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: {
            idempotencyKey,
            requestId,
            previousStatus: oldResult.data?.status,
            newStatus: typedBody.status,
            reason: typedBody.reason,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("bereavement", "write")],
      params: IdParamsSchema,
      body: BereavementStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BereavementLeaveResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bereavement"],
        summary: "Transition bereavement leave status",
        description:
          "Approve, activate, or complete a parental bereavement leave record. " +
          "Valid transitions: pending -> approved -> active -> completed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Alias routes: /requests — frontend calls /bereavement/requests
  // These delegate to the same service methods as the root routes above.
  // ===========================================================================

  // GET /bereavement/requests - Alias for GET /bereavement/
  .get(
    "/requests",
    async (ctx) => {
      const { bereavementService, query, tenantContext } = ctx as unknown as BereavementRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await bereavementService.list(
        tenantContext,
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
      beforeHandle: [requirePermission("bereavement", "read")],
      query: t.Composite([
        t.Partial(BereavementLeaveFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: BereavementLeaveListResponseSchema,
      detail: {
        tags: ["Bereavement"],
        summary: "List parental bereavement leave records (alias)",
        description:
          "Alias for GET /bereavement — list parental bereavement leave records with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /bereavement/requests - Alias for POST /bereavement/
  .post(
    "/requests",
    async (ctx) => {
      const { bereavementService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as BereavementRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bereavementService.create(tenantContext, body as unknown as CreateBereavementLeave);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bereavementErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "bereavement.leave.created",
          resourceType: "parental_bereavement_leave",
          resourceId: result.data!.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("bereavement", "write")],
      body: CreateBereavementLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BereavementLeaveResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bereavement"],
        summary: "Create parental bereavement leave request (alias)",
        description:
          "Alias for POST /bereavement — create a new parental bereavement leave request. " +
          "Validates against the 2-week maximum, 56-week window, and SPBP eligibility rules.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BereavementRoutes = typeof bereavementRoutes;
