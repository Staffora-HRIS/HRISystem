/**
 * Statutory Leave Module - Elysia Routes
 *
 * API endpoints for UK statutory leave management:
 * maternity, paternity, shared parental, and adoption leave.
 *
 * Permission model:
 * - statutory_leave: read, write
 * - statutory_leave:pay: read
 * - statutory_leave:kit: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { StatutoryLeaveRepository } from "./repository";
import { StatutoryLeaveService } from "./service";
import {
  // Schemas
  CreateStatutoryLeaveSchema,
  UpdateStatutoryLeaveSchema,
  CurtailLeaveSchema,
  CreateKITDaySchema,
  StatutoryLeaveFiltersSchema,
  StatutoryLeaveResponseSchema,
  StatutoryLeaveListItemSchema,
  PayCalculationResponseSchema,
  KITDayResponseSchema,
  EligibilityResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateStatutoryLeave,
  type CurtailLeave,
  type CreateKITDay,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & StatutoryLeavePluginContext` to preserve
 * Elysia's native typing for body/params/query/error/set.
 */
interface StatutoryLeavePluginContext {
  statutoryLeaveService: StatutoryLeaveService;
  statutoryLeaveRepository: StatutoryLeaveRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  /** Elysia error response helper */
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes beyond the shared base set
 */
const statutoryLeaveErrorStatusMap: Record<string, number> = {
  EMPLOYEE_NOT_FOUND: 404,
  LEAVE_NOT_FOUND: 404,
  LEAVE_NOT_ELIGIBLE: 400,
  MATB1_REQUIRED: 400,
  PATERNITY_DEADLINE_EXCEEDED: 400,
  SPL_NOTICE_INSUFFICIENT: 400,
  KIT_DAYS_EXCEEDED: 429,
  KIT_DAY_OUTSIDE_PERIOD: 400,
  CURTAILMENT_INVALID: 400,
};

/**
 * Create statutory leave routes plugin
 */
export const statutoryLeaveRoutes = new Elysia({
  prefix: "/statutory-leave",
  name: "statutory-leave-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new StatutoryLeaveRepository(db);
    const service = new StatutoryLeaveService(repository, db);
    return { statutoryLeaveService: service, statutoryLeaveRepository: repository };
  })

  // ===========================================================================
  // List Statutory Leave Records
  // ===========================================================================

  // GET /statutory-leave - List records with filters and pagination
  .get(
    "/",
    async (ctx) => {
      const { statutoryLeaveService, query, tenantContext } = ctx as typeof ctx & StatutoryLeavePluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await statutoryLeaveService.listLeaveRecords(
        tenantContext,
        filters,
        { cursor: String(cursor || "") || undefined, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "read")],
      query: t.Composite([
        t.Partial(StatutoryLeaveFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(StatutoryLeaveListItemSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Statutory Leave"],
        summary: "List statutory leave records",
        description: "List statutory leave records with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Create Statutory Leave Record
  // ===========================================================================

  // POST /statutory-leave - Create new statutory leave
  .post(
    "/",
    async (ctx) => {
      const { statutoryLeaveService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & StatutoryLeavePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await statutoryLeaveService.createLeaveRecord(
        tenantContext,
        body as CreateStatutoryLeave,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "statutory_leave.created",
          resourceType: "statutory_leave",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      body: CreateStatutoryLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: StatutoryLeaveResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Create statutory leave record",
        description:
          "Create a new statutory leave record (maternity, paternity, shared parental, or adoption)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Eligibility Check (must be before /:id to avoid route conflict)
  // ===========================================================================

  // GET /statutory-leave/eligibility/:employeeId - Check eligibility
  .get(
    "/eligibility/:employeeId",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.checkEligibility(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: EligibilityResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Check eligibility",
        description:
          "Check employee eligibility for all statutory leave types based on UK employment law qualifying period (26 weeks continuous employment)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Statutory Leave Record
  // ===========================================================================

  // GET /statutory-leave/:id - Get detail with pay breakdown and KIT days
  .get(
    "/:id",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, error } = ctx as typeof ctx & StatutoryLeavePluginContext;
      const result = await statutoryLeaveService.getLeaveRecord(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Get statutory leave record",
        description: "Get a single statutory leave record with pay breakdown and KIT days",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Update Statutory Leave Record
  // ===========================================================================

  // PATCH /statutory-leave/:id - Update record
  .patch(
    "/:id",
    async (ctx) => {
      const { statutoryLeaveService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & StatutoryLeavePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await statutoryLeaveService.updateLeaveRecord(
        tenantContext,
        params.id,
        body,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.updated",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, changes: body },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      body: UpdateStatutoryLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Update statutory leave record",
        description: "Update a statutory leave record (only if planned or active)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Status Transitions
  // ===========================================================================

  // POST /statutory-leave/:id/start - Mark as started (planned -> active)
  .post(
    "/:id/start",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.startLeave(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.started",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: { status: "active" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Start statutory leave",
        description: "Transition leave record from planned to active",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /statutory-leave/:id/complete - Mark as completed (active -> completed)
  .post(
    "/:id/complete",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.completeLeave(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.completed",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: { status: "completed" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Complete statutory leave",
        description: "Transition leave record from active to completed",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /statutory-leave/:id/cancel - Cancel leave (planned/active -> cancelled)
  .post(
    "/:id/cancel",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.cancelLeave(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.cancelled",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: { status: "cancelled" },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Cancel statutory leave",
        description: "Cancel a planned or active statutory leave record",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Curtailment (Maternity/Adoption -> Shared Parental)
  // ===========================================================================

  // POST /statutory-leave/:id/curtail - Curtail maternity for ShPL conversion
  .post(
    "/:id/curtail",
    async (ctx) => {
      const { statutoryLeaveService, params, body, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & StatutoryLeavePluginContext;

      const typedBody = body as CurtailLeave;
      const result = await statutoryLeaveService.curtailLeave(
        tenantContext,
        params.id,
        typedBody
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.curtailed",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: { curtailment_date: typedBody.curtailment_date },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      body: CurtailLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: StatutoryLeaveResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Curtail maternity/adoption leave",
        description:
          "Curtail maternity or adoption leave to enable shared parental leave conversion",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Pay Calculation
  // ===========================================================================

  // GET /statutory-leave/:id/pay - Get pay calculation
  .get(
    "/:id/pay",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.getPayCalculation(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: PayCalculationResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Get pay calculation",
        description:
          "Get the weekly pay breakdown for a statutory leave record (SMP, SPP, ShPP)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /statutory-leave/:id/pay/recalculate - Force recalculate pay
  .post(
    "/:id/pay/recalculate",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.recalculatePay(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.pay_recalculated",
          resourceType: "statutory_leave",
          resourceId: params.id,
          newValues: {
            total_pay: result.data!.total_pay,
            paid_weeks: result.data!.paid_weeks,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayCalculationResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Recalculate pay",
        description: "Force recalculation of the pay schedule for a statutory leave record",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // KIT Days (Keeping In Touch)
  // ===========================================================================

  // GET /statutory-leave/:id/kit-days - List KIT days for a leave record
  .get(
    "/:id/kit-days",
    async (ctx) => {
      const { statutoryLeaveService, params, tenantContext, error } = ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.listKITDays(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Array(KITDayResponseSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "List KIT days",
        description:
          "List Keeping In Touch (KIT) days for a statutory leave record",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /statutory-leave/:id/kit-days - Record a KIT day
  .post(
    "/:id/kit-days",
    async (ctx) => {
      const { statutoryLeaveService, params, body, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & StatutoryLeavePluginContext;

      const result = await statutoryLeaveService.recordKITDay(
        tenantContext,
        params.id,
        body as CreateKITDay
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          statutoryLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "statutory_leave.kit_day_recorded",
          resourceType: "statutory_leave_kit_day",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { leaveRecordId: params.id, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("statutory_leave", "write")],
      params: IdParamsSchema,
      body: CreateKITDaySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: KITDayResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        429: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Statutory Leave"],
        summary: "Record KIT day",
        description:
          "Record a Keeping In Touch (KIT) day during statutory leave (max 10 for maternity/adoption, 20 for shared parental)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type StatutoryLeaveRoutes = typeof statutoryLeaveRoutes;
