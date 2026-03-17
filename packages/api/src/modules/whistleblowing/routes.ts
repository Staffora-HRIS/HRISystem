/**
 * Whistleblowing Module - Elysia Routes
 *
 * Defines the API endpoints for whistleblowing case management
 * with PIDA (Public Interest Disclosure Act 1998) protections.
 *
 * All routes require authentication. List and detail endpoints
 * require the 'whistleblowing' read permission (designated officers only).
 * The submit endpoint requires 'whistleblowing' write permission.
 *
 * Routes:
 * POST   /reports           - Submit a new whistleblowing report (supports anonymous)
 * GET    /reports           - List cases (designated officers only)
 * GET    /reports/:id       - Get case detail (designated officers only)
 * PATCH  /reports/:id       - Update case (status, assignment, investigation, outcome)
 * GET    /reports/:id/audit - Get case audit trail
 *
 * Permission model:
 * - whistleblowing: read (view cases, admin/officers), write (submit, update)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { WhistleblowingRepository } from "./repository";
import { WhistleblowingService } from "./service";
import {
  SubmitReportSchema,
  UpdateCaseSchema,
  WhistleblowingFiltersSchema,
  WhistleblowingCaseResponseSchema,
  WhistleblowingCaseListResponseSchema,
  WhistleblowingAuditEntryResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type SubmitReport,
  type UpdateCase,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface WhistleblowingPluginContext {
  whistleblowingService: WhistleblowingService;
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

// Module-specific error codes beyond the shared base set
const whistleblowingErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

/**
 * Create Whistleblowing routes plugin.
 *
 * Prefix: /whistleblowing (mounted under /api/v1 in app.ts)
 * Effective paths: /api/v1/whistleblowing/reports
 */
export const whistleblowingRoutes = new Elysia({
  prefix: "/whistleblowing",
  name: "whistleblowing-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new WhistleblowingRepository(db);
    const service = new WhistleblowingService(repository, db);
    return { whistleblowingService: service };
  })

  // ===========================================================================
  // POST /reports - Submit a new whistleblowing report
  // ===========================================================================
  .post(
    "/reports",
    async (ctx) => {
      const { whistleblowingService, body, tenantContext, audit, error } =
        ctx as typeof ctx & WhistleblowingPluginContext;

      const result = await whistleblowingService.submitReport(
        tenantContext,
        body as SubmitReport,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          whistleblowingErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log - do NOT log reporter identity for anonymous reports
      if (audit) {
        await audit.log({
          action: "compliance.whistleblowing.report_submitted",
          resourceType: "whistleblowing_case",
          resourceId: result.data.id,
          newValues: {
            category: result.data.category,
            confidentiality_level: result.data.confidentiality_level,
            pida_protected: result.data.pida_protected,
          },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("whistleblowing", "write")],
      body: SubmitReportSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: WhistleblowingCaseResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Whistleblowing"],
        summary: "Submit a whistleblowing report",
        description:
          "Submit a new whistleblowing report. Supports both confidential (identity known " +
          "to designated officer) and anonymous (no identity stored) reporting. " +
          "PIDA protection flag can be set for qualifying disclosures.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /reports - List whistleblowing cases (designated officers only)
  // ===========================================================================
  .get(
    "/reports",
    async (ctx) => {
      const { whistleblowingService, query, tenantContext } =
        ctx as typeof ctx & WhistleblowingPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await whistleblowingService.listCases(tenantContext, filters, {
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
      beforeHandle: [requirePermission("whistleblowing", "read")],
      query: t.Composite([
        t.Partial(WhistleblowingFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: WhistleblowingCaseListResponseSchema,
      detail: {
        tags: ["Whistleblowing"],
        summary: "List whistleblowing cases",
        description:
          "List all whistleblowing cases with optional filters. Restricted to designated " +
          "officers with whistleblowing read permission. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /reports/:id - Get whistleblowing case detail
  // ===========================================================================
  .get(
    "/reports/:id",
    async (ctx) => {
      const { whistleblowingService, params, tenantContext, error } =
        ctx as typeof ctx & WhistleblowingPluginContext;

      const result = await whistleblowingService.getCase(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          whistleblowingErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("whistleblowing", "read")],
      params: IdParamsSchema,
      response: {
        200: WhistleblowingCaseResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Whistleblowing"],
        summary: "Get whistleblowing case by ID",
        description:
          "Get a single whistleblowing case with full details. Restricted to designated " +
          "officers. For anonymous cases, reporter_id will be null.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /reports/:id - Update whistleblowing case
  // ===========================================================================
  .patch(
    "/reports/:id",
    async (ctx) => {
      const { whistleblowingService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & WhistleblowingPluginContext;

      const typedBody = body as UpdateCase;
      const result = await whistleblowingService.updateCase(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          whistleblowingErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        const auditValues: Record<string, unknown> = {};
        if (typedBody.status) auditValues.status = typedBody.status;
        if (typedBody.assigned_to !== undefined) auditValues.assigned_to = typedBody.assigned_to;
        if (typedBody.pida_protected !== undefined) auditValues.pida_protected = typedBody.pida_protected;
        if (typedBody.outcome !== undefined) auditValues.outcome = "[set]";
        // Do not log investigation_notes content in external audit for confidentiality

        await audit.log({
          action: "compliance.whistleblowing.case_updated",
          resourceType: "whistleblowing_case",
          resourceId: params.id,
          newValues: auditValues,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("whistleblowing", "write")],
      params: IdParamsSchema,
      body: UpdateCaseSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: WhistleblowingCaseResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["Whistleblowing"],
        summary: "Update whistleblowing case",
        description:
          "Update a whistleblowing case. Can change status (following the state machine), " +
          "assign to a designated officer, add investigation notes, record outcome, " +
          "or update PIDA protection flag. State transitions: " +
          "submitted -> under_review -> investigating -> resolved/dismissed -> closed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /reports/:id/audit - Get case audit trail
  // ===========================================================================
  .get(
    "/reports/:id/audit",
    async (ctx) => {
      const { whistleblowingService, params, tenantContext, error } =
        ctx as typeof ctx & WhistleblowingPluginContext;

      const result = await whistleblowingService.getAuditTrail(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          whistleblowingErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("whistleblowing", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Array(WhistleblowingAuditEntryResponseSchema),
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Whistleblowing"],
        summary: "Get case audit trail",
        description:
          "Get the full audit trail for a whistleblowing case. Records all actions " +
          "taken including submissions, status changes, assignments, and updates. " +
          "Critical for PIDA compliance evidence.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type WhistleblowingRoutes = typeof whistleblowingRoutes;
