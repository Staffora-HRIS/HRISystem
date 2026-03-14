/**
 * Pension Auto-Enrolment Module - Elysia Routes
 *
 * Defines the API endpoints for UK workplace pension auto-enrolment
 * (Pensions Act 2008). Criminal prosecution risk for non-compliance.
 *
 * Permission model:
 * - pension:schemes: read, write
 * - pension:enrolments: read, write
 * - pension:contributions: read, write
 * - pension:compliance: read
 *
 * All routes require authentication, tenant context, and appropriate RBAC.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { PensionRepository } from "./repository";
import { PensionService } from "./service";
import {
  // Schemas
  CreatePensionSchemeSchema,
  PensionSchemeResponseSchema,
  PensionEnrolmentResponseSchema,
  PensionContributionResponseSchema,
  EligibilityAssessmentResponseSchema,
  ComplianceSummaryResponseSchema,
  ReEnrolmentResultSchema,
  OptOutRequestSchema,
  PostponeRequestSchema,
  CalculateContributionsRequestSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  PensionEnrolmentStatusSchema,
  UuidSchema,
  // Types
  type CreatePensionScheme,
  type OptOutRequest,
  type PostponeRequest,
  type CalculateContributionsRequest,
  type EnrolmentFilters,
} from "./schemas";

// =============================================================================
// Route-Level Error Response Schema
// =============================================================================

const ErrorResponseSchema = t.Object({
  error: t.Object({
    code: t.String(),
    message: t.String(),
    details: t.Optional(t.Record(t.String(), t.Unknown())),
    requestId: t.String(),
  }),
});

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & PensionPluginContext` to preserve Elysia's
 * native typing while adding plugin-derived properties.
 */
interface PensionPluginContext {
  pensionService: PensionService;
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

// =============================================================================
// Routes
// =============================================================================

export const pensionRoutes = new Elysia({
  prefix: "/pension",
  name: "pension-routes",
})
  // ===========================================================================
  // Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PensionRepository(db);
    const service = new PensionService(repository, db);
    return { pensionService: service };
  })

  // ===========================================================================
  // Pension Scheme Routes
  // ===========================================================================

  // POST /pension/schemes — Create pension scheme
  .post(
    "/schemes",
    async (ctx) => {
      const { pensionService, body, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await pensionService.createScheme(
        tenantContext,
        body as unknown as CreatePensionScheme,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.scheme.created",
          resourceType: "pension_scheme",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:schemes", "write")],
      body: CreatePensionSchemeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PensionSchemeResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Create pension scheme",
        description:
          "Create a new workplace pension scheme. Minimum statutory contributions: 3% employer, 8% total (Pensions Act 2008).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /pension/schemes — List pension schemes
  .get(
    "/schemes",
    async (ctx) => {
      const { pensionService, query, tenantContext } =
        ctx as typeof ctx & PensionPluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await pensionService.listSchemes(tenantContext, {
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
      beforeHandle: [requirePermission("pension:schemes", "read")],
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(PensionSchemeResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "List pension schemes",
        description:
          "List all workplace pension schemes for the tenant with cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Eligibility Assessment Route
  // ===========================================================================

  // POST /pension/assess/:employeeId — Assess employee eligibility
  .post(
    "/assess/:employeeId",
    async (ctx) => {
      const { pensionService, params, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;

      const result = await pensionService.assessEligibility(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.eligibility.assessed",
          resourceType: "pension_enrolment",
          resourceId: params.employeeId,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: EligibilityAssessmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Assess employee eligibility",
        description:
          "Assess an employee's auto-enrolment eligibility based on age and annualised earnings. Returns worker category (eligible_jobholder, non_eligible_jobholder, entitled_worker, not_applicable).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Auto-Enrolment Route
  // ===========================================================================

  // POST /pension/enrol/:employeeId — Auto-enrol eligible employee
  .post(
    "/enrol/:employeeId",
    async (ctx) => {
      const { pensionService, params, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await pensionService.autoEnrol(
        tenantContext,
        params.employeeId,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.employee.enrolled",
          resourceType: "pension_enrolment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { employeeId: params.employeeId, idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "write")],
      params: EmployeeIdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PensionEnrolmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Auto-enrol employee",
        description:
          "Auto-enrol an eligible jobholder into the default pension scheme. Validates eligibility (age 22-SPA, earning >£10,000/yr). Sets opt-out deadline to 1 month from enrolment.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Opt-Out Route
  // ===========================================================================

  // PATCH /pension/enrolments/:id/opt-out — Process opt-out
  .patch(
    "/enrolments/:id/opt-out",
    async (ctx) => {
      const { pensionService, params, body, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as OptOutRequest;

      const result = await pensionService.processOptOut(
        tenantContext,
        params.id,
        typedBody.reason,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.employee.opted_out",
          resourceType: "pension_enrolment",
          resourceId: params.id,
          newValues: result.data,
          metadata: { reason: typedBody.reason, idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "write")],
      params: IdParamsSchema,
      body: OptOutRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PensionEnrolmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Process opt-out",
        description:
          "Process a pension opt-out within the 1-month window. Sets re-enrolment date to 3 years from today. Contributions already deducted must be refunded.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Postponement Route
  // ===========================================================================

  // POST /pension/enrolments/:id/postpone — Postpone assessment
  .post(
    "/enrolments/:id/postpone",
    async (ctx) => {
      const { pensionService, params, body, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as PostponeRequest;

      // The route uses the ID as the employeeId for postponement
      // (since postponement is employee-scoped, not enrolment-scoped)
      const result = await pensionService.postponeAssessment(
        tenantContext,
        params.id,
        typedBody.end_date,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.assessment.postponed",
          resourceType: "pension_enrolment",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { end_date: typedBody.end_date, idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "write")],
      params: IdParamsSchema,
      body: PostponeRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PensionEnrolmentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Postpone assessment",
        description:
          "Postpone an employee's auto-enrolment assessment for up to 3 months. The ID parameter is the employee ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Contribution Calculation Route
  // ===========================================================================

  // POST /pension/contributions/calculate — Calculate contributions
  .post(
    "/contributions/calculate",
    async (ctx) => {
      const { pensionService, body, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as CalculateContributionsRequest;

      const result = await pensionService.calculateContributions(
        tenantContext,
        typedBody.enrolment_id,
        typedBody.gross_pay,
        typedBody.pay_period_start,
        typedBody.pay_period_end,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.contribution.calculated",
          resourceType: "pension_contribution",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            enrolment_id: typedBody.enrolment_id,
            gross_pay: typedBody.gross_pay,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:contributions", "write")],
      body: CalculateContributionsRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PensionContributionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Calculate contributions",
        description:
          "Calculate employer and employee pension contributions for a pay period based on qualifying earnings band. All amounts in pence.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Re-Enrolment Route
  // ===========================================================================

  // POST /pension/re-enrolment — Trigger bulk re-enrolment
  .post(
    "/re-enrolment",
    async (ctx) => {
      const { pensionService, headers, tenantContext, audit, requestId, set } =
        ctx as typeof ctx & PensionPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await pensionService.triggerReEnrolment(
        tenantContext,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      if (audit) {
        await audit.log({
          action: "pension.re_enrolment.triggered",
          resourceType: "pension_enrolment",
          resourceId: "bulk",
          newValues: {
            re_enrolled_count: result.data!.re_enrolled_count,
            skipped_count: result.data!.skipped_count,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "write")],
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ReEnrolmentResultSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Trigger bulk re-enrolment",
        description:
          "Re-enrol all opted-out workers whose 3-year re-enrolment date has passed. Workers can opt out again within the standard 1-month window.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // List Enrolments Route
  // ===========================================================================

  // GET /pension/enrolments — List enrolments with filters
  .get(
    "/enrolments",
    async (ctx) => {
      const { pensionService, query, tenantContext } =
        ctx as typeof ctx & PensionPluginContext;
      const { cursor, limit, status, employee_id } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const filters: EnrolmentFilters = {
        cursor,
        limit: parsedLimit,
        status: status as EnrolmentFilters["status"],
        employee_id,
      };

      const result = await pensionService.listEnrolments(tenantContext, filters);

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("pension:enrolments", "read")],
      query: t.Partial(
        t.Object({
          cursor: t.String({ minLength: 1 }),
          limit: t.Number({ minimum: 1, maximum: 100, default: 20 }),
          status: PensionEnrolmentStatusSchema,
          employee_id: UuidSchema,
        })
      ),
      response: {
        200: t.Object({
          items: t.Array(PensionEnrolmentResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "List pension enrolments",
        description:
          "List pension enrolments with optional filters for status and employee. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Compliance Summary Route
  // ===========================================================================

  // GET /pension/compliance — Compliance dashboard summary
  .get(
    "/compliance",
    async (ctx) => {
      const { pensionService, tenantContext, set, requestId } =
        ctx as typeof ctx & PensionPluginContext;

      const result = await pensionService.getComplianceSummary(tenantContext);

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("pension:compliance", "read")],
      response: {
        200: ComplianceSummaryResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Pension"],
        summary: "Get compliance summary",
        description:
          "Get a compliance dashboard summary: eligible/enrolled/opted-out counts, contribution totals, and compliance rate. Critical for demonstrating Pensions Act 2008 compliance.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PensionRoutes = typeof pensionRoutes;
