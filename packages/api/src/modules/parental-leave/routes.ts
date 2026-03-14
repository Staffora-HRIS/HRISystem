/**
 * Unpaid Parental Leave Module - Elysia Routes
 *
 * API endpoints for managing UK unpaid parental leave entitlements and bookings.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - parental_leave: read, write
 * - parental_leave:approve: write (for approve/reject)
 *
 * Endpoints:
 * POST   /entitlements               - Register a child for parental leave
 * GET    /entitlements/:employeeId    - Get entitlements for an employee
 * POST   /bookings                   - Create a parental leave booking
 * GET    /bookings                   - List bookings with filters
 * PATCH  /bookings/:id/approve       - Approve a booking
 * PATCH  /bookings/:id/reject        - Reject a booking
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ParentalLeaveRepository } from "./repository";
import { ParentalLeaveService, BookingValidationError } from "./service";
import {
  CreateEntitlementSchema,
  EntitlementResponseSchema,
  EmployeeIdParamsSchema,
  CreateBookingSchema,
  BookingResponseSchema,
  BookingFiltersSchema,
  BookingDecisionSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateEntitlement,
  type CreateBooking,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface ParentalLeavePluginContext {
  parentalLeaveService: ParentalLeaveService;
  parentalLeaveRepository: ParentalLeaveRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface ParentalLeaveRouteContext extends ParentalLeavePluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Module-specific error codes beyond the shared base set
 */
const parentalLeaveErrorStatusMap: Record<string, number> = {
  INSUFFICIENT_LEAVE_BALANCE: 400,
  LIMIT_EXCEEDED: 400,
};

/**
 * Audit action constants for this module
 */
const AUDIT_ACTIONS = {
  ENTITLEMENT_CREATED: "parental_leave.entitlement.created",
  BOOKING_CREATED: "parental_leave.booking.created",
  BOOKING_APPROVED: "parental_leave.booking.approved",
  BOOKING_REJECTED: "parental_leave.booking.rejected",
} as const;

/**
 * Create parental leave routes plugin
 */
export const parentalLeaveRoutes = new Elysia({
  prefix: "/parental-leave",
  name: "parental-leave-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ParentalLeaveRepository(db);
    const service = new ParentalLeaveService(repository, db);

    return { parentalLeaveService: service, parentalLeaveRepository: repository };
  })

  // ===========================================================================
  // Entitlement Routes
  // ===========================================================================

  // POST /entitlements - Register a child for parental leave
  .post(
    "/entitlements",
    async (ctx) => {
      const { parentalLeaveService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as ParentalLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await parentalLeaveService.createEntitlement(
        tenantContext,
        body as unknown as CreateEntitlement,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          parentalLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: AUDIT_ACTIONS.ENTITLEMENT_CREATED,
          resourceType: "parental_leave_entitlement",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("parental_leave", "write")],
      body: CreateEntitlementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Parental Leave"],
        summary: "Register child for parental leave",
        description:
          "Register a child to create a parental leave entitlement (18 weeks per child, UK law)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /entitlements/:employeeId - Get entitlements for an employee
  .get(
    "/entitlements/:employeeId",
    async (ctx) => {
      const { parentalLeaveService, params, tenantContext, error } = ctx as unknown as ParentalLeaveRouteContext;
      const result = await parentalLeaveService.getEntitlements(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          parentalLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("parental_leave", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Array(EntitlementResponseSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Parental Leave"],
        summary: "Get employee parental leave entitlements",
        description:
          "Returns all parental leave entitlements for the specified employee, including per-child usage and eligibility",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Booking Routes
  // ===========================================================================

  // POST /bookings - Create a parental leave booking
  .post(
    "/bookings",
    async (ctx) => {
      const { parentalLeaveService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as ParentalLeaveRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      try {
        const result = await parentalLeaveService.createBooking(
          tenantContext,
          body as unknown as CreateBooking,
          idempotencyKey
        );

        if (!result.success) {
          const status = mapErrorToStatus(
            result.error?.code || "INTERNAL_ERROR",
            parentalLeaveErrorStatusMap
          );
          return error(status, { error: result.error });
        }

        // Audit log the creation
        if (audit) {
          await audit.log({
            action: AUDIT_ACTIONS.BOOKING_CREATED,
            resourceType: "parental_leave_booking",
            resourceId: result.data!.id,
            newValues: result.data,
            metadata: { idempotencyKey, requestId },
          });
        }

        set.status = 201;
        return result.data;
      } catch (err: unknown) {
        // Handle BookingValidationError thrown inside transaction
        if (err instanceof BookingValidationError) {
          const status = mapErrorToStatus(
            err.code,
            parentalLeaveErrorStatusMap
          );
          return error(status, {
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
          });
        }
        throw err;
      }
    },
    {
      beforeHandle: [requirePermission("parental_leave", "write")],
      body: CreateBookingSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BookingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Parental Leave"],
        summary: "Create parental leave booking",
        description:
          "Book parental leave. Validates: min 1-week blocks, max 4 weeks/year/child, 21 days notice, child under 18",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /bookings - List bookings
  .get(
    "/bookings",
    async (ctx) => {
      const { parentalLeaveService, query, tenantContext } = ctx as unknown as ParentalLeaveRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await parentalLeaveService.listBookings(
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
      beforeHandle: [requirePermission("parental_leave", "read")],
      query: t.Composite([
        t.Partial(BookingFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(BookingResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Parental Leave"],
        summary: "List parental leave bookings",
        description:
          "List parental leave bookings with optional filters by employee, entitlement, or status",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /bookings/:id/approve - Approve a booking
  .patch(
    "/bookings/:id/approve",
    async (ctx) => {
      const { parentalLeaveService, params, body, tenantContext, audit, requestId, error } =
        ctx as unknown as ParentalLeaveRouteContext;

      const result = await parentalLeaveService.approveBooking(
        tenantContext,
        params.id,
        body || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          parentalLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the approval
      if (audit) {
        await audit.log({
          action: AUDIT_ACTIONS.BOOKING_APPROVED,
          resourceType: "parental_leave_booking",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("parental_leave", "write")],
      params: IdParamsSchema,
      body: t.Optional(BookingDecisionSchema),
      response: {
        200: BookingResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Parental Leave"],
        summary: "Approve parental leave booking",
        description:
          "Approve a requested parental leave booking. Also increments weeks_used on the entitlement.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /bookings/:id/reject - Reject a booking
  .patch(
    "/bookings/:id/reject",
    async (ctx) => {
      const { parentalLeaveService, params, body, tenantContext, audit, requestId, error } =
        ctx as unknown as ParentalLeaveRouteContext;

      const result = await parentalLeaveService.rejectBooking(
        tenantContext,
        params.id,
        body || {}
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          parentalLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the rejection
      if (audit) {
        await audit.log({
          action: AUDIT_ACTIONS.BOOKING_REJECTED,
          resourceType: "parental_leave_booking",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("parental_leave", "write")],
      params: IdParamsSchema,
      body: t.Optional(BookingDecisionSchema),
      response: {
        200: BookingResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Parental Leave"],
        summary: "Reject parental leave booking",
        description: "Reject a requested parental leave booking with optional notes.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ParentalLeaveRoutes = typeof parentalLeaveRoutes;
