/**
 * Carer's Leave Module - Elysia Routes
 *
 * API endpoints for managing carer's leave entitlements under the
 * Carer's Leave Act 2023 (c. 18).
 *
 * Endpoints:
 *   GET    /api/v1/carers-leave            — List entitlements (paginated)
 *   GET    /api/v1/carers-leave/:id        — Get entitlement by ID
 *   POST   /api/v1/carers-leave            — Create entitlement
 *   PUT    /api/v1/carers-leave/:id        — Update entitlement
 *   PATCH  /api/v1/carers-leave/:id/status — Approve or reject
 *   DELETE /api/v1/carers-leave/:id        — Delete entitlement
 *
 * Permission model:
 *   - carers_leave: read, write, delete
 *
 * All routes require authentication and appropriate permissions.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  DeleteSuccessSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { CarersLeaveRepository } from "./repository";
import { CarersLeaveService } from "./service";
import {
  CreateEntitlementSchema,
  UpdateEntitlementSchema,
  StatusTransitionSchema,
  EntitlementResponseSchema,
  EntitlementFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateEntitlement,
  type UpdateEntitlement,
  type StatusTransition,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface CarersLeavePluginContext {
  carersLeaveService: CarersLeaveService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface CarersLeaveRouteContext extends CarersLeavePluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

// =============================================================================
// Module-specific error code to HTTP status mapping
// =============================================================================

const carersLeaveErrorStatusMap: Record<string, number> = {
  INSUFFICIENT_LEAVE_BALANCE: 409,
};

// =============================================================================
// Audit actions for carer's leave
// =============================================================================

const CarersLeaveAuditActions = {
  ENTITLEMENT_CREATED: "carers_leave.entitlement.created",
  ENTITLEMENT_UPDATED: "carers_leave.entitlement.updated",
  ENTITLEMENT_APPROVED: "carers_leave.entitlement.approved",
  ENTITLEMENT_REJECTED: "carers_leave.entitlement.rejected",
  ENTITLEMENT_DELETED: "carers_leave.entitlement.deleted",
} as const;

// =============================================================================
// Routes
// =============================================================================

export const carersLeaveRoutes = new Elysia({
  prefix: "/carers-leave",
  name: "carers-leave-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new CarersLeaveRepository(db);
    const service = new CarersLeaveService(repository, db);

    return { carersLeaveService: service };
  })

  // ===========================================================================
  // GET / - List entitlements
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { carersLeaveService, query, tenantContext } = ctx as unknown as CarersLeaveRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await carersLeaveService.listEntitlements(
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
      beforeHandle: [requirePermission("carers_leave", "read")],
      query: t.Composite([
        t.Partial(EntitlementFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(EntitlementResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Carer's Leave"],
        summary: "List carer's leave entitlements",
        description:
          "List carer's leave entitlements with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get entitlement by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { carersLeaveService, params, tenantContext, error } =
        ctx as unknown as CarersLeaveRouteContext;
      const result = await carersLeaveService.getEntitlement(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("carers_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: EntitlementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Get carer's leave entitlement by ID",
        description: "Get a single carer's leave entitlement record by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST / - Create entitlement
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        carersLeaveService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as CarersLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await carersLeaveService.createEntitlement(
        tenantContext,
        body as unknown as CreateEntitlement,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: CarersLeaveAuditActions.ENTITLEMENT_CREATED,
          resourceType: "carers_leave_entitlement",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("carers_leave", "write")],
      body: CreateEntitlementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Create carer's leave entitlement",
        description:
          "Create a new carer's leave entitlement for an employee and leave year",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /:id - Update entitlement
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const {
        carersLeaveService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as CarersLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await carersLeaveService.getEntitlement(
        tenantContext,
        params.id
      );

      const result = await carersLeaveService.updateEntitlement(
        tenantContext,
        params.id,
        body as unknown as UpdateEntitlement,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: CarersLeaveAuditActions.ENTITLEMENT_UPDATED,
          resourceType: "carers_leave_entitlement",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("carers_leave", "write")],
      params: IdParamsSchema,
      body: UpdateEntitlementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Update carer's leave entitlement",
        description:
          "Update an existing carer's leave entitlement (e.g. adjust total for part-time)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/status - Approve or reject
  // ===========================================================================
  .patch(
    "/:id/status",
    async (ctx) => {
      const {
        carersLeaveService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as CarersLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await carersLeaveService.getEntitlement(
        tenantContext,
        params.id
      );

      const typedBody = body as unknown as StatusTransition;
      const result = await carersLeaveService.transitionStatus(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the status transition
      const auditAction =
        typedBody.status === "approved"
          ? CarersLeaveAuditActions.ENTITLEMENT_APPROVED
          : CarersLeaveAuditActions.ENTITLEMENT_REJECTED;

      if (audit) {
        await audit.log({
          action: auditAction,
          resourceType: "carers_leave_entitlement",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            transition_status: typedBody.status,
            reason: typedBody.reason,
            days_to_deduct: typedBody.days_to_deduct,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("carers_leave", "write")],
      params: IdParamsSchema,
      body: StatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Approve or reject carer's leave",
        description:
          "Approve (deducting days from balance) or reject a carer's leave request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /:id - Delete entitlement
  // ===========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const {
        carersLeaveService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as CarersLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await carersLeaveService.getEntitlement(
        tenantContext,
        params.id
      );

      const result = await carersLeaveService.deleteEntitlement(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: CarersLeaveAuditActions.ENTITLEMENT_DELETED,
          resourceType: "carers_leave_entitlement",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return {
        success: true as const,
        message: "Carer's leave entitlement deleted successfully",
      };
    },
    {
      beforeHandle: [requirePermission("carers_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Delete carer's leave entitlement",
        description:
          "Delete a carer's leave entitlement (only if no days have been used)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Alias routes: /requests — frontend calls /carers-leave/requests
  // These delegate to the same service methods as the root routes above.
  // ===========================================================================

  // GET /carers-leave/requests - Alias for GET /carers-leave/
  .get(
    "/requests",
    async (ctx) => {
      const { carersLeaveService, query, tenantContext } = ctx as unknown as CarersLeaveRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await carersLeaveService.listEntitlements(
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
      beforeHandle: [requirePermission("carers_leave", "read")],
      query: t.Composite([
        t.Partial(EntitlementFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(EntitlementResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Carer's Leave"],
        summary: "List carer's leave requests (alias)",
        description:
          "Alias for GET /carers-leave — list carer's leave entitlements with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /carers-leave/requests - Alias for POST /carers-leave/
  .post(
    "/requests",
    async (ctx) => {
      const {
        carersLeaveService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as CarersLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await carersLeaveService.createEntitlement(
        tenantContext,
        body as unknown as CreateEntitlement,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          carersLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: CarersLeaveAuditActions.ENTITLEMENT_CREATED,
          resourceType: "carers_leave_entitlement",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("carers_leave", "write")],
      body: CreateEntitlementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Carer's Leave"],
        summary: "Create carer's leave request (alias)",
        description:
          "Alias for POST /carers-leave — create a new carer's leave entitlement for an employee and leave year",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type CarersLeaveRoutes = typeof carersLeaveRoutes;
