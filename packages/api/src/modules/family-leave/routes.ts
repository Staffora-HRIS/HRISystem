/**
 * Family Leave Module - Elysia Routes
 *
 * Unified API endpoints for UK family leave management:
 * maternity, paternity, shared parental, and adoption leave.
 *
 * Permission model:
 * - family_leave: read, write
 *
 * Endpoints:
 * POST   /family-leave/entitlements                          - Create entitlement
 * GET    /family-leave/entitlements                          - List entitlements
 * GET    /family-leave/entitlements/:id                      - Get detail
 * POST   /family-leave/entitlements/:id/check-eligibility    - Check eligibility
 * POST   /family-leave/entitlements/:id/calculate-pay        - Calculate statutory pay
 * POST   /family-leave/entitlements/:id/kit-day              - Record KIT/SPLIT day
 * PATCH  /family-leave/entitlements/:id/curtail              - Curtail for ShPL
 * GET    /family-leave/entitlements/:id/pay-schedule          - Get pay schedule
 * POST   /family-leave/entitlements/:id/notices              - Record formal notice
 * GET    /family-leave/dashboard                             - Compliance dashboard
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { FamilyLeaveRepository } from "./repository";
import { FamilyLeaveService } from "./service";
import {
  CreateEntitlementSchema,
  EligibilityCheckSchema,
  CreateKITDaySchema,
  CurtailLeaveSchema,
  CreateNoticeSchema,
  EntitlementFiltersSchema,
  EntitlementResponseSchema,
  EntitlementListItemSchema,
  PayScheduleResponseSchema,
  EligibilityResponseSchema,
  KITDayResponseSchema,
  NoticeResponseSchema,
  DashboardResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateEntitlement,
  type EligibilityCheck,
  type CreateKITDay,
  type CurtailLeave,
  type CreateNotice,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface FamilyLeavePluginContext {
  familyLeaveService: FamilyLeaveService;
  familyLeaveRepository: FamilyLeaveRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes beyond the shared base set
 */
const familyLeaveErrorStatusMap: Record<string, number> = {
  EMPLOYEE_NOT_FOUND: 404,
  LEAVE_NOT_FOUND: 404,
  LEAVE_NOT_ELIGIBLE: 400,
  MATB1_REQUIRED: 400,
  PATERNITY_DEADLINE_EXCEEDED: 400,
  SPL_NOTICE_INSUFFICIENT: 400,
  KIT_DAYS_EXCEEDED: 429,
  KIT_DAY_OUTSIDE_PERIOD: 400,
  CURTAILMENT_INVALID: 400,
  INSUFFICIENT_LEAVE_BALANCE: 400,
  LIMIT_EXCEEDED: 429,
};

/**
 * Create family leave routes plugin
 */
export const familyLeaveRoutes = new Elysia({
  prefix: "/family-leave",
  name: "family-leave-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new FamilyLeaveRepository(db);
    const service = new FamilyLeaveService(repository, db);
    return { familyLeaveService: service, familyLeaveRepository: repository };
  })

  // ===========================================================================
  // Dashboard (before /:id routes to avoid conflict)
  // ===========================================================================

  // GET /family-leave/dashboard - Compliance dashboard
  .get(
    "/dashboard",
    async (ctx) => {
      const { familyLeaveService, tenantContext, error } = ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.getComplianceDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "read")],
      response: {
        200: DashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Compliance dashboard",
        description:
          "Get family leave compliance dashboard: active/planned counts by type, upcoming returns, KIT day usage, and compliance alerts (missing MATB1, notices)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Create Entitlement
  // ===========================================================================

  // POST /family-leave/entitlements - Create family leave entitlement
  .post(
    "/entitlements",
    async (ctx) => {
      const { familyLeaveService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FamilyLeavePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await familyLeaveService.createEntitlement(
        tenantContext,
        body as CreateEntitlement,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "family_leave.entitlement.created",
          resourceType: "family_leave_entitlement",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "write")],
      body: CreateEntitlementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Create family leave entitlement",
        description:
          "Record pregnancy/adoption notification and create a family leave entitlement. Validates eligibility, calculates qualifying week, and generates pay schedule if earnings provided.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // List Entitlements
  // ===========================================================================

  // GET /family-leave/entitlements - List entitlements
  .get(
    "/entitlements",
    async (ctx) => {
      const { familyLeaveService, query, tenantContext } = ctx as typeof ctx & FamilyLeavePluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await familyLeaveService.listEntitlements(
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
      beforeHandle: [requirePermission("family_leave", "read")],
      query: t.Composite([
        t.Partial(EntitlementFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(EntitlementListItemSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Family Leave"],
        summary: "List family leave entitlements",
        description:
          "List family leave entitlements with optional filters by employee, type, status, and date range. Uses cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Entitlement Detail
  // ===========================================================================

  // GET /family-leave/entitlements/:id - Get detail
  .get(
    "/entitlements/:id",
    async (ctx) => {
      const { familyLeaveService, params, tenantContext, error } = ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.getEntitlement(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: EntitlementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Get family leave entitlement",
        description:
          "Get a single family leave entitlement with pay periods, KIT/SPLIT days, and formal notices",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Check Eligibility
  // ===========================================================================

  // POST /family-leave/entitlements/:id/check-eligibility - Check eligibility
  .post(
    "/entitlements/:id/check-eligibility",
    async (ctx) => {
      const { familyLeaveService, params, body, tenantContext, error } = ctx as typeof ctx & FamilyLeavePluginContext;

      // First get the entitlement to find the employee
      const entitlement = await familyLeaveService.getEntitlement(tenantContext, params.id);
      if (!entitlement.success || !entitlement.data) {
        const status = mapErrorToStatus(
          entitlement.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: entitlement.error });
      }

      const result = await familyLeaveService.checkEligibility(
        tenantContext,
        entitlement.data.employee_id,
        body as EligibilityCheck
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "read")],
      params: IdParamsSchema,
      body: t.Optional(EligibilityCheckSchema),
      response: {
        200: EligibilityResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Check eligibility",
        description:
          "Check employee eligibility for a specific family leave type based on UK employment law (26 weeks continuous employment by qualifying week, earnings above LEL)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Calculate Statutory Pay
  // ===========================================================================

  // POST /family-leave/entitlements/:id/calculate-pay - Calculate statutory pay
  .post(
    "/entitlements/:id/calculate-pay",
    async (ctx) => {
      const { familyLeaveService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.calculateStatutoryPay(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "family_leave.pay_calculated",
          resourceType: "family_leave_entitlement",
          resourceId: params.id,
          newValues: {
            total_statutory_pay: result.data!.total_statutory_pay,
            paid_weeks: result.data!.paid_weeks,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayScheduleResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Calculate statutory pay",
        description:
          "Calculate or recalculate the full 39-week SMP/SPP/ShPP statutory pay schedule. SMP: 6 weeks at 90% + 33 weeks at flat rate. SPP: 2 weeks at flat rate. ShPP: up to 37 weeks at flat rate.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Record KIT/SPLIT Day
  // ===========================================================================

  // POST /family-leave/entitlements/:id/kit-day - Record KIT/SPLIT day
  .post(
    "/entitlements/:id/kit-day",
    async (ctx) => {
      const { familyLeaveService, params, body, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.recordKITDay(
        tenantContext,
        params.id,
        body as CreateKITDay
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "family_leave.kit_day_recorded",
          resourceType: "family_leave_kit_day",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { leaveRecordId: params.id, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "write")],
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
        tags: ["Family Leave"],
        summary: "Record KIT/SPLIT day",
        description:
          "Record a Keeping In Touch (KIT) day during maternity/adoption leave (max 10) or a Shared Parental In Touch (SPLIT) day during shared parental leave (max 20)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Curtail Leave for ShPL
  // ===========================================================================

  // PATCH /family-leave/entitlements/:id/curtail - Curtail for ShPL conversion
  .patch(
    "/entitlements/:id/curtail",
    async (ctx) => {
      const { familyLeaveService, params, body, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.curtailLeave(
        tenantContext,
        params.id,
        body as CurtailLeave
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "family_leave.curtailed",
          resourceType: "family_leave_entitlement",
          resourceId: params.id,
          newValues: {
            curtailment_date: (body as CurtailLeave).curtailment_date,
            spl_weeks_available: result.data!.spl_weeks_available,
            spl_pay_weeks_available: result.data!.spl_pay_weeks_available,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "write")],
      params: IdParamsSchema,
      body: CurtailLeaveSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EntitlementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Curtail maternity/adoption leave for ShPL",
        description:
          "Curtail maternity or adoption leave to enable shared parental leave. Calculates available ShPL weeks (max 50 leave, 37 pay). Maternity must retain minimum 2-week compulsory period.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Pay Schedule
  // ===========================================================================

  // GET /family-leave/entitlements/:id/pay-schedule - Get pay schedule
  .get(
    "/entitlements/:id/pay-schedule",
    async (ctx) => {
      const { familyLeaveService, params, tenantContext, error } = ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.getPaySchedule(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "read")],
      params: IdParamsSchema,
      response: {
        200: PayScheduleResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Get pay schedule",
        description:
          "Get the week-by-week statutory pay breakdown for a family leave entitlement (SMP/SPP/ShPP)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Record Formal Notice
  // ===========================================================================

  // POST /family-leave/entitlements/:id/notices - Record formal notice
  .post(
    "/entitlements/:id/notices",
    async (ctx) => {
      const { familyLeaveService, params, body, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FamilyLeavePluginContext;

      const result = await familyLeaveService.recordNotice(
        tenantContext,
        params.id,
        body as CreateNotice
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          familyLeaveErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "family_leave.notice_recorded",
          resourceType: "family_leave_notice",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { leaveRecordId: params.id, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("family_leave", "write")],
      params: IdParamsSchema,
      body: CreateNoticeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: NoticeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Family Leave"],
        summary: "Record formal notice",
        description:
          "Record a formal notice for a family leave entitlement (MATB1 certificate, maternity notification, paternity form SC3, ShPL opt-in notice, curtailment notice)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type FamilyLeaveRoutes = typeof familyLeaveRoutes;
