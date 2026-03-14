/**
 * DSAR Module - Elysia Routes
 *
 * Defines the API endpoints for DSAR (Data Subject Access Request) operations.
 * All routes require authentication and the 'dsar' permission.
 *
 * UK GDPR compliance: Articles 15-20 (access, rectification, erasure, portability).
 *
 * Permission model:
 * - dsar: read  — View DSAR requests, data items, audit logs, dashboard
 * - dsar: write — Create, verify, gather, redact, extend, complete, reject
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DSARRepository } from "./repository";
import { DSARService } from "./service";
import {
  // Request schemas
  CreateDsarRequestSchema,
  VerifyIdentitySchema,
  ExtendDeadlineSchema,
  RejectDsarRequestSchema,
  CompleteDsarRequestSchema,
  UpdateDataItemSchema,
  // Param schemas
  IdParamsSchema,
  GatherModuleParamsSchema,
  DataItemParamsSchema,
  // Filter / pagination schemas
  DsarRequestFiltersSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  // Response schemas
  DsarRequestResponseSchema,
  DsarRequestDetailResponseSchema,
  DsarRequestListResponseSchema,
  DsarDataItemResponseSchema,
  DsarAuditLogEntrySchema,
  DsarDashboardSchema,
  // Types
  type CreateDsarRequest,
  type UpdateDataItem,
  type ExtendDeadline,
  type RejectDsarRequest,
  type CompleteDsarRequest,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & DSARPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface DSARPluginContext {
  dsarService: DSARService;
  dsarRepository: DSARRepository;
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
 * DSAR module-specific error codes beyond the shared base set
 */
const dsarErrorStatusMap: Record<string, number> = {
  IDENTITY_NOT_VERIFIED: 403,
  ALREADY_EXTENDED: 409,
  PENDING_ITEMS: 400,
};

/**
 * Create DSAR routes plugin
 */
export const dsarRoutes = new Elysia({ prefix: "/dsar", name: "dsar-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DSARRepository(db);
    const service = new DSARService(repository, db);

    return { dsarService: service, dsarRepository: repository };
  })

  // ===========================================================================
  // Dashboard / Stats
  // ===========================================================================

  // GET /requests/dashboard - DSAR statistics
  .get(
    "/requests/dashboard",
    async (ctx) => {
      const { dsarService, tenantContext, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.getDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "read")],
      response: {
        200: DsarDashboardSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Get DSAR dashboard statistics",
        description: "Returns aggregate statistics: open, completed, overdue, average response time",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /requests/overdue - List overdue DSARs
  .get(
    "/requests/overdue",
    async (ctx) => {
      const { dsarService, tenantContext, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.getOverdueRequests(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("dsar", "read")],
      response: {
        200: t.Object({
          items: t.Array(DsarRequestResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "List overdue DSAR requests",
        description: "Returns all DSAR requests that have passed their deadline (including extended deadline)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DSAR Request CRUD
  // ===========================================================================

  // GET /requests - List DSAR requests
  .get(
    "/requests",
    async (ctx) => {
      const { dsarService, query, tenantContext } = ctx as typeof ctx & DSARPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await dsarService.listRequests(
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
      beforeHandle: [requirePermission("dsar", "read")],
      query: t.Composite([
        t.Partial(DsarRequestFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: DsarRequestListResponseSchema,
      detail: {
        tags: ["DSAR"],
        summary: "List DSAR requests",
        description: "List DSAR requests with optional filters (status, employee, type, overdue) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requests - Create a new DSAR request
  .post(
    "/requests",
    async (ctx) => {
      const { dsarService, body, tenantContext, audit, requestId, error, set } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.createRequest(tenantContext, body as unknown as CreateDsarRequest);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.created",
          resourceType: "dsar_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      body: CreateDsarRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: DsarRequestResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Create a new DSAR request",
        description: "Creates a new Data Subject Access Request. Auto-calculates 30-day deadline from received date.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /requests/:id - Get DSAR request detail (with data items and audit log)
  .get(
    "/requests/:id",
    async (ctx) => {
      const { dsarService, params, tenantContext, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.getRequestDetail(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "read")],
      params: IdParamsSchema,
      response: {
        200: DsarRequestDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Get DSAR request detail",
        description: "Returns the full DSAR request including all data items and the complete audit trail",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DSAR Workflow Actions
  // ===========================================================================

  // POST /requests/:id/verify-identity - Verify data subject identity
  .post(
    "/requests/:id/verify-identity",
    async (ctx) => {
      const { dsarService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.verifyIdentity(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.identity_verified",
          resourceType: "dsar_request",
          resourceId: params.id,
          newValues: { identityVerified: true },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: IdParamsSchema,
      body: t.Optional(VerifyIdentitySchema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DsarRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Verify data subject identity",
        description: "Marks the data subject identity as verified. Required before data gathering can begin. Automatically transitions status from 'received' to 'in_progress'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requests/:id/gather/:moduleName - Trigger data gathering for a module
  .post(
    "/requests/:id/gather/:moduleName",
    async (ctx) => {
      const { dsarService, params, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.gatherModuleData(
        tenantContext,
        params.id,
        params.moduleName
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.data_gathered",
          resourceType: "dsar_request",
          resourceId: params.id,
          newValues: { moduleName: params.moduleName, itemCount: result.data?.length },
          metadata: { requestId },
        });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: GatherModuleParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: t.Object({
          items: t.Array(DsarDataItemResponseSchema),
        }),
        400: ErrorResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Gather data from a module",
        description: "Triggers data gathering for a specific HRIS module (e.g., hr, absence, time). Creates data items for each data category. Identity must be verified first.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /requests/:id/data-items/:itemId - Update a data item (redact/exclude)
  .patch(
    "/requests/:id/data-items/:itemId",
    async (ctx) => {
      const { dsarService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const typedBody = body as unknown as UpdateDataItem;
      const result = await dsarService.updateDataItem(
        tenantContext,
        params.id,
        params.itemId,
        typedBody
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: `gdpr.dsar.data_${typedBody.status}`,
          resourceType: "dsar_data_item",
          resourceId: params.itemId,
          newValues: typedBody,
          metadata: { requestId, dsarRequestId: params.id },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: DataItemParamsSchema,
      body: UpdateDataItemSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DsarDataItemResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Update a data item",
        description: "Mark a data item as redacted or excluded with a documented reason. GDPR allows redaction of third-party personal data.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requests/:id/extend - Extend DSAR deadline
  .post(
    "/requests/:id/extend",
    async (ctx) => {
      const { dsarService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const typedBody = body as unknown as ExtendDeadline;
      const result = await dsarService.extendDeadline(tenantContext, params.id, typedBody);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.extended",
          resourceType: "dsar_request",
          resourceId: params.id,
          newValues: {
            extendedDeadlineDate: result.data?.extendedDeadlineDate,
            extensionReason: typedBody.reason,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: IdParamsSchema,
      body: ExtendDeadlineSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DsarRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Extend DSAR deadline",
        description: "Extend the response deadline by up to 60 additional days (UK GDPR Article 12(3)). A reason is required. Total response period cannot exceed 90 days from receipt.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requests/:id/complete - Complete DSAR request
  .post(
    "/requests/:id/complete",
    async (ctx) => {
      const { dsarService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.completeRequest(
        tenantContext,
        params.id,
        (body as unknown as CompleteDsarRequest)?.notes
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.completed",
          resourceType: "dsar_request",
          resourceId: params.id,
          newValues: { completedDate: result.data?.completedDate },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: IdParamsSchema,
      body: t.Optional(CompleteDsarRequestSchema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DsarRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Complete DSAR request",
        description: "Finalizes the DSAR response. All data items must be in a terminal state (gathered, redacted, or excluded).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /requests/:id/reject - Reject DSAR request
  .post(
    "/requests/:id/reject",
    async (ctx) => {
      const { dsarService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & DSARPluginContext;

      const typedBody = body as unknown as RejectDsarRequest;
      const result = await dsarService.rejectRequest(
        tenantContext,
        params.id,
        typedBody.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.dsar.rejected",
          resourceType: "dsar_request",
          resourceId: params.id,
          newValues: { rejectionReason: typedBody.reason },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("dsar", "write")],
      params: IdParamsSchema,
      body: RejectDsarRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DsarRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Reject DSAR request",
        description: "Reject a DSAR request with documented reason (UK GDPR Article 12(5) — manifestly unfounded or excessive)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Audit Log
  // ===========================================================================

  // GET /requests/:id/audit-log - Get DSAR audit trail
  .get(
    "/requests/:id/audit-log",
    async (ctx) => {
      const { dsarService, params, tenantContext, error } = ctx as typeof ctx & DSARPluginContext;

      const result = await dsarService.getAuditLog(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", dsarErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("dsar", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(DsarAuditLogEntrySchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["DSAR"],
        summary: "Get DSAR audit trail",
        description: "Returns the complete immutable audit trail for a DSAR request, ordered chronologically",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DSARRoutes = typeof dsarRoutes;
