/**
 * Flexible Working Module - Elysia Routes
 *
 * Defines the API endpoints for Flexible Working Requests under the
 * Employment Relations (Flexible Working) Act 2023.
 *
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - flexible_working: read, write
 *
 * Endpoints:
 * - POST   /flexible-working/requests                       - Submit a new request
 * - GET    /flexible-working/requests                       - List requests (with filters)
 * - GET    /flexible-working/requests/:id                   - Get request by ID (with history + consultations)
 * - PATCH  /flexible-working/requests/:id/consultation      - Schedule consultation
 * - POST   /flexible-working/requests/:id/consultations     - Record a consultation meeting
 * - GET    /flexible-working/requests/:id/consultations     - List consultation records
 * - GET    /flexible-working/requests/:id/history           - Get request history
 * - PATCH  /flexible-working/requests/:id/approve           - Approve request
 * - PATCH  /flexible-working/requests/:id/reject            - Reject request
 * - PATCH  /flexible-working/requests/:id/withdraw          - Withdraw request
 * - POST   /flexible-working/requests/:id/appeal            - Appeal rejection
 * - PATCH  /flexible-working/requests/:id/appeal/resolve    - Resolve appeal
 * - PATCH  /flexible-working/requests/:id/respond           - Combined approve/reject (legacy)
 * - GET    /flexible-working/compliance-summary             - Compliance dashboard
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { FlexibleWorkingRepository } from "./repository";
import { FlexibleWorkingService } from "./service";
import {
  SubmitRequestSchema,
  RecordConsultationSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  AppealDecisionSchema,
  ResolveAppealSchema,
  RespondToRequestSchema,
  MoveToConsultationSchema,
  WithdrawRequestSchema,
  FlexibleWorkingResponseSchema,
  ConsultationResponseSchema,
  RequestHistoryEntrySchema,
  FlexibleWorkingFiltersSchema,
  ComplianceSummarySchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type SubmitRequest,
  type RecordConsultation,
  type ApproveRequest,
  type RejectRequest,
  type AppealDecision,
  type ResolveAppeal,
  type RespondToRequest,
  type MoveToConsultation,
  type WithdrawRequest,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface FlexibleWorkingPluginContext {
  fwService: FlexibleWorkingService;
  fwRepository: FlexibleWorkingRepository;
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

const fwErrorStatusMap: Record<string, number> = {
  MAX_REQUESTS_EXCEEDED: 400,
  INVALID_REJECTION_GROUNDS: 400,
  MISSING_REJECTION_GROUNDS: 400,
  CONSULTATION_REQUIRED: 400,
};

/**
 * Create flexible working routes plugin
 */
export const flexibleWorkingRoutes = new Elysia({
  prefix: "/flexible-working",
  name: "flexible-working-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new FlexibleWorkingRepository(db);
    const service = new FlexibleWorkingService(repository, db);

    return { fwService: service, fwRepository: repository };
  })

  // ===========================================================================
  // POST /requests - Submit a new flexible working request
  // ===========================================================================
  .post(
    "/requests",
    async (ctx) => {
      const { fwService, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await fwService.submitRequest(
        tenantContext,
        body as unknown as SubmitRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.submitted",
          resourceType: "flexible_working_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      body: SubmitRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Submit flexible working request",
        description:
          "Submit a new flexible working request. Validates the 2-request-per-12-month statutory limit and calculates the 2-month response deadline. Day-one right since April 2024.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests - List flexible working requests
  // ===========================================================================
  .get(
    "/requests",
    async (ctx) => {
      const { fwService, query, tenantContext } = ctx as typeof ctx & FlexibleWorkingPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await fwService.listRequests(tenantContext, filters, {
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
      beforeHandle: [requirePermission("flexible_working", "read")],
      query: t.Composite([
        t.Partial(FlexibleWorkingFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(FlexibleWorkingResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Flexible Working"],
        summary: "List flexible working requests",
        description:
          "List all flexible working requests with optional filters (employee, status, overdue, date range) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id - Get request by ID (with full history + consultations)
  // ===========================================================================
  .get(
    "/requests/:id",
    async (ctx) => {
      const { fwService, params, tenantContext, error } = ctx as typeof ctx & FlexibleWorkingPluginContext;
      const result = await fwService.getRequest(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "read")],
      params: IdParamsSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Get flexible working request by ID",
        description:
          "Get a single flexible working request by UUID, including full consultation records and status transition history.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/consultation - Schedule consultation
  // ===========================================================================
  .patch(
    "/requests/:id/consultation",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await fwService.moveToConsultation(
        tenantContext,
        params.id,
        (body as unknown as MoveToConsultation).impact_assessment,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.consultation_scheduled",
          resourceType: "flexible_working_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: MoveToConsultationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Schedule consultation for request",
        description:
          "Move a request to consultation_scheduled status. Under the Act, employers must consult with the employee before making a decision to refuse.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/consultations - Record a consultation meeting
  // ===========================================================================
  .post(
    "/requests/:id/consultations",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await fwService.recordConsultation(
        tenantContext,
        params.id,
        body as unknown as RecordConsultation,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.consultation.recorded",
          resourceType: "flexible_working_consultation",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            flexible_working_request_id: params.id,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: RecordConsultationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ConsultationResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Record consultation meeting",
        description:
          "Record a mandatory consultation meeting with the employee. Required before the employer can refuse a request under the Employment Relations (Flexible Working) Act 2023.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id/consultations - List consultation records
  // ===========================================================================
  .get(
    "/requests/:id/consultations",
    async (ctx) => {
      const { fwRepository, params, tenantContext, error } = ctx as typeof ctx & FlexibleWorkingPluginContext;

      // Verify request exists
      const request = await fwRepository.findById(tenantContext, params.id);
      if (!request) {
        return error(404, {
          error: {
            code: "NOT_FOUND",
            message: "Flexible working request not found",
            details: { id: params.id },
          },
        });
      }

      const consultations = await fwRepository.findConsultationsByRequestId(
        tenantContext,
        params.id
      );

      return {
        items: consultations.map((c) => ({
          id: c.id,
          tenant_id: c.tenantId,
          request_id: c.requestId,
          consultation_date:
            c.consultationDate instanceof Date
              ? c.consultationDate.toISOString().split("T")[0]
              : String(c.consultationDate),
          consultation_type: c.consultationType,
          attendees: c.attendees,
          notes: c.notes,
          outcomes: c.outcomes,
          next_steps: c.nextSteps,
          recorded_by: c.recordedBy,
          created_at:
            c.createdAt instanceof Date
              ? c.createdAt.toISOString()
              : String(c.createdAt),
          updated_at:
            c.updatedAt instanceof Date
              ? c.updatedAt.toISOString()
              : String(c.updatedAt),
        })),
      };
    },
    {
      beforeHandle: [requirePermission("flexible_working", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(ConsultationResponseSchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "List consultation records",
        description: "List all consultation meeting records for a flexible working request.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id/history - Get request status history
  // ===========================================================================
  .get(
    "/requests/:id/history",
    async (ctx) => {
      const { fwRepository, params, tenantContext, error } = ctx as typeof ctx & FlexibleWorkingPluginContext;

      const request = await fwRepository.findById(tenantContext, params.id);
      if (!request) {
        return error(404, {
          error: {
            code: "NOT_FOUND",
            message: "Flexible working request not found",
            details: { id: params.id },
          },
        });
      }

      const history = await fwRepository.findHistoryByRequestId(
        tenantContext,
        params.id
      );

      return {
        items: history.map((h) => ({
          id: h.id,
          request_id: h.requestId,
          from_status: h.fromStatus,
          to_status: h.toStatus,
          changed_by: h.changedBy,
          reason: h.reason,
          metadata: h.metadata,
          created_at:
            h.createdAt instanceof Date
              ? h.createdAt.toISOString()
              : String(h.createdAt),
        })),
      };
    },
    {
      beforeHandle: [requirePermission("flexible_working", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(RequestHistoryEntrySchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Get request status history",
        description: "Get the full immutable history of status transitions for a flexible working request.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/approve - Approve request
  // ===========================================================================
  .patch(
    "/requests/:id/approve",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await fwService.getRequest(tenantContext, params.id);

      const result = await fwService.approveRequest(
        tenantContext,
        params.id,
        body as unknown as ApproveRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.approved",
          resourceType: "flexible_working_request",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: ApproveRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Approve flexible working request",
        description:
          "Approve a flexible working request with an effective date for when the new arrangement starts. Optionally include agreed modifications, contract amendment reference, and trial period.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/reject - Reject request
  // ===========================================================================
  .patch(
    "/requests/:id/reject",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await fwService.getRequest(tenantContext, params.id);

      const result = await fwService.rejectRequest(
        tenantContext,
        params.id,
        body as unknown as RejectRequest,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.rejected",
          resourceType: "flexible_working_request",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            rejection_grounds: (body as unknown as RejectRequest).rejection_grounds,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: RejectRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Reject flexible working request",
        description:
          "Reject a flexible working request. Must specify one of the 8 statutory grounds (ERA 1996, s.80G(1)(b)) and provide an explanation. Consultation must have been completed first.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/withdraw - Withdraw request
  // ===========================================================================
  .patch(
    "/requests/:id/withdraw",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await fwService.getRequest(tenantContext, params.id);

      const typedBody = body as unknown as WithdrawRequest;
      const result = await fwService.withdrawRequest(
        tenantContext,
        params.id,
        typedBody.reason,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.withdrawn",
          resourceType: "flexible_working_request",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            withdrawal_reason: typedBody.reason,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: WithdrawRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Withdraw flexible working request",
        description:
          "Withdraw a pending or in-progress flexible working request. Only possible before a terminal decision is reached.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/appeal - Appeal a rejection
  // ===========================================================================
  .post(
    "/requests/:id/appeal",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await fwService.appealDecision(
        tenantContext,
        params.id,
        body as unknown as AppealDecision,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "flexible_working.request.appealed",
          resourceType: "flexible_working_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            appeal_grounds: (body as unknown as AppealDecision).appeal_grounds,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: AppealDecisionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Appeal rejection decision",
        description:
          "Employee appeals a rejection decision. Must provide grounds for the appeal. Only possible when the request has been rejected.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/appeal/resolve - Resolve an appeal
  // ===========================================================================
  .patch(
    "/requests/:id/appeal/resolve",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await fwService.getRequest(tenantContext, params.id);

      const typedBody = body as unknown as ResolveAppeal;
      const result = await fwService.resolveAppeal(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: `flexible_working.request.${typedBody.outcome}`,
          resourceType: "flexible_working_request",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            outcome: typedBody.outcome,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: ResolveAppealSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Resolve appeal",
        description:
          "Resolve an appeal by upholding the rejection (appeal_rejected) or overturning it (appeal_approved). If overturning, an effective date is required.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /requests/:id/respond - Combined approve/reject (legacy)
  // ===========================================================================
  .patch(
    "/requests/:id/respond",
    async (ctx) => {
      const { fwService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & FlexibleWorkingPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const oldResult = await fwService.getRequest(tenantContext, params.id);

      const typedBody = body as unknown as RespondToRequest;
      const result = await fwService.respondToRequest(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: `flexible_working.request.${typedBody.decision}`,
          resourceType: "flexible_working_request",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, decision: typedBody.decision },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "write")],
      params: IdParamsSchema,
      body: RespondToRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: FlexibleWorkingResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Respond to flexible working request (legacy)",
        description:
          "Combined approve or reject endpoint. Prefer using the dedicated /approve and /reject endpoints instead.",
        security: [{ bearerAuth: [] }],
        deprecated: true,
      },
    }
  )

  // ===========================================================================
  // GET /compliance-summary - Compliance dashboard
  // ===========================================================================
  .get(
    "/compliance-summary",
    async (ctx) => {
      const { fwService, tenantContext, error } = ctx as typeof ctx & FlexibleWorkingPluginContext;

      const result = await fwService.getComplianceSummary(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          fwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("flexible_working", "read")],
      response: {
        200: ComplianceSummarySchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Flexible Working"],
        summary: "Get compliance summary",
        description:
          "Get a compliance dashboard including request counts by status, overdue responses (past the 2-month deadline), average response time, rejection grounds breakdown, and consultation compliance rate.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type FlexibleWorkingRoutes = typeof flexibleWorkingRoutes;
