/**
 * DPIA Module - Elysia Routes
 *
 * Defines the API endpoints for UK GDPR Article 35 DPIA management.
 * All routes require authentication and appropriate permissions.
 *
 * Routes:
 * POST   /dpia              - Create new DPIA assessment
 * GET    /dpia              - List DPIA assessments
 * GET    /dpia/:id          - Get DPIA detail with risks
 * PATCH  /dpia/:id          - Update DPIA (draft only)
 * POST   /dpia/:id/risks    - Add a risk to a DPIA
 * GET    /dpia/:id/risks    - List risks for a DPIA
 * POST   /dpia/:id/submit   - Submit for DPO review
 * POST   /dpia/:id/approve  - DPO approves or rejects
 *
 * Permission model:
 * - dpia: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DpiaRepository } from "./repository";
import { DpiaService } from "./service";
import {
  CreateDpiaSchema,
  UpdateDpiaSchema,
  AddRiskSchema,
  SubmitDpiaSchema,
  ApproveDpiaSchema,
  DpiaFiltersSchema,
  DpiaResponseSchema,
  DpiaRiskResponseSchema,
  DpiaListResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateDpia,
  type UpdateDpia,
  type AddRisk,
  type ApproveDpia,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface DpiaPluginContext {
  dpiaService: DpiaService;
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
const dpiaErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
};

/**
 * Create DPIA routes plugin.
 *
 * Prefix: /dpia (mounted under /api/v1 in app.ts)
 * Effective paths: /api/v1/dpia, /api/v1/dpia/:id, etc.
 */
export const dpiaRoutes = new Elysia({
  prefix: "/dpia",
  name: "dpia-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DpiaRepository(db);
    const service = new DpiaService(repository, db);
    return { dpiaService: service };
  })

  // ===========================================================================
  // POST /dpia - Create a new DPIA assessment
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { dpiaService, body, tenantContext, audit, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const result = await dpiaService.createDpia(
        tenantContext,
        body as CreateDpia,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.dpia.created",
          resourceType: "dpia",
          resourceId: result.data.id,
          newValues: {
            title: result.data.title,
            processing_activity_id: result.data.processing_activity_id,
          },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "write")],
      body: CreateDpiaSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DpiaResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Create a new DPIA assessment",
        description:
          "Create a new Data Protection Impact Assessment. The DPIA starts in 'draft' status. " +
          "UK GDPR Article 35 requires DPIAs for high-risk data processing activities.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dpia - List DPIA assessments
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { dpiaService, query, tenantContext } =
        ctx as typeof ctx & DpiaPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await dpiaService.listDpias(tenantContext, filters, {
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
      beforeHandle: [requirePermission("dpia", "read")],
      query: t.Composite([
        t.Partial(DpiaFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: DpiaListResponseSchema,
      detail: {
        tags: ["DPIA"],
        summary: "List DPIA assessments",
        description:
          "List DPIA assessments with optional filters (status, search, review due date) " +
          "and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dpia/:id - Get a single DPIA by ID (includes risks)
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { dpiaService, params, tenantContext, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const result = await dpiaService.getDpia(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "read")],
      params: IdParamsSchema,
      response: {
        200: DpiaResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Get DPIA by ID",
        description:
          "Get a single DPIA assessment with full details including all associated risks.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /dpia/:id - Update DPIA (draft only)
  // ===========================================================================
  .patch(
    "/:id",
    async (ctx) => {
      const { dpiaService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const typedBody = body as UpdateDpia;
      const result = await dpiaService.updateDpia(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.dpia.updated",
          resourceType: "dpia",
          resourceId: params.id,
          newValues: typedBody as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "write")],
      params: IdParamsSchema,
      body: UpdateDpiaSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DpiaResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Update DPIA assessment",
        description:
          "Update a DPIA assessment. Can only update DPIAs that are in 'draft' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /dpia/:id/risks - Add a risk to a DPIA
  // ===========================================================================
  .post(
    "/:id/risks",
    async (ctx) => {
      const { dpiaService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const typedBody = body as AddRisk;
      const result = await dpiaService.addRisk(
        tenantContext,
        params.id,
        typedBody,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.dpia.risk_added",
          resourceType: "dpia_risk",
          resourceId: result.data.id,
          newValues: {
            dpia_id: params.id,
            risk_description: typedBody.risk_description,
            likelihood: typedBody.likelihood,
            impact: typedBody.impact,
            risk_score: typedBody.risk_score,
          },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "write")],
      params: IdParamsSchema,
      body: AddRiskSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DpiaRiskResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Add risk to DPIA",
        description:
          "Add a new risk entry to a DPIA. Risks can be added when the DPIA is in " +
          "'draft' or 'in_review' status. Includes likelihood, impact, risk score, " +
          "mitigation measures, and residual risk assessment.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /dpia/:id/risks - List risks for a DPIA
  // ===========================================================================
  .get(
    "/:id/risks",
    async (ctx) => {
      const { dpiaService, params, tenantContext, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const result = await dpiaService.listRisks(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Array(DpiaRiskResponseSchema),
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "List DPIA risks",
        description:
          "Get all risks associated with a DPIA, ordered by risk score descending.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /dpia/:id/submit - Submit for DPO review
  // ===========================================================================
  .post(
    "/:id/submit",
    async (ctx) => {
      const { dpiaService, params, tenantContext, audit, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const result = await dpiaService.submitForReview(
        tenantContext,
        params.id,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "compliance.dpia.submitted_for_review",
          resourceType: "dpia",
          resourceId: params.id,
          newValues: {
            status: "in_review",
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "write")],
      params: IdParamsSchema,
      body: t.Optional(SubmitDpiaSchema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DpiaResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Submit DPIA for review",
        description:
          "Submit a draft DPIA for DPO review. Transitions the DPIA from 'draft' to " +
          "'in_review' status. The DPO can then approve or reject the assessment.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /dpia/:id/approve - DPO approves or rejects
  // ===========================================================================
  .post(
    "/:id/approve",
    async (ctx) => {
      const { dpiaService, body, params, tenantContext, audit, error } =
        ctx as typeof ctx & DpiaPluginContext;

      const typedBody = body as ApproveDpia;
      const result = await dpiaService.approveDpia(
        tenantContext,
        params.id,
        typedBody.decision,
        typedBody.dpo_opinion || null,
        ctx.headers?.["idempotency-key"]
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          dpiaErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: `compliance.dpia.${typedBody.decision}`,
          resourceType: "dpia",
          resourceId: params.id,
          newValues: {
            status: typedBody.decision,
            approved_by: result.data.approved_by,
            approved_at: result.data.approved_at,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dpia", "write")],
      params: IdParamsSchema,
      body: ApproveDpiaSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DpiaResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
      },
      detail: {
        tags: ["DPIA"],
        summary: "Approve or reject DPIA",
        description:
          "DPO approves or rejects a DPIA that is in 'in_review' status. " +
          "UK GDPR Article 35(2) requires the DPO to provide advice and monitor " +
          "the impact assessment process. The DPO can provide an opinion with the decision.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DpiaRoutes = typeof dpiaRoutes;
