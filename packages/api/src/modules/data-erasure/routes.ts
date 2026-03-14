/**
 * Data Erasure Module - Elysia Routes
 *
 * GDPR Article 17 (Right to Erasure) API endpoints.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - data_erasure: read, write, delete, approve
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { DataErasureRepository } from "./repository";
import { DataErasureService } from "./service";
import {
  CreateErasureRequestSchema,
  ApproveErasureRequestSchema,
  RejectErasureRequestSchema,
  ErasureRequestResponseSchema,
  ErasureRequestDetailResponseSchema,
  ErasureRequestListResponseSchema,
  ErasureRequestFiltersSchema,
  RetentionConflictsResponseSchema,
  OverdueRequestsResponseSchema,
  ErasureAuditLogEntrySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  UuidSchema,
  type CreateErasureRequest,
  type ApproveErasureRequest,
  type RejectErasureRequest,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & DataErasurePluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface DataErasurePluginContext {
  erasureService: DataErasureService;
  erasureRepository: DataErasureRepository;
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

// Module-specific error code to HTTP status mapping
const erasureErrorStatusMap: Record<string, number> = {
  CONFLICT: 409,
  STATE_MACHINE_VIOLATION: 409,
  FORBIDDEN: 403,
};

/**
 * Data Erasure routes plugin
 */
export const dataErasureRoutes = new Elysia({
  prefix: "/data-erasure",
  name: "data-erasure-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DataErasureRepository(db);
    const service = new DataErasureService(repository, db);

    return { erasureService: service, erasureRepository: repository };
  })

  // ===========================================================================
  // GET /requests - List erasure requests
  // ===========================================================================
  .get(
    "/requests",
    async (ctx) => {
      const { erasureService, query, tenantContext } = ctx as typeof ctx & DataErasurePluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await erasureService.listRequests(
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
      beforeHandle: [requirePermission("data_erasure", "read")],
      query: t.Composite([
        t.Partial(ErasureRequestFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: {
        200: ErasureRequestListResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "List erasure requests",
        description:
          "List GDPR Article 17 erasure requests with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/overdue - Get overdue requests
  // ===========================================================================
  .get(
    "/requests/overdue",
    async (ctx) => {
      const { erasureService, tenantContext, error } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.getOverdueRequests(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "read")],
      response: {
        200: OverdueRequestsResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Get overdue erasure requests",
        description:
          "Get all erasure requests that have passed their 30-day GDPR deadline",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests - Create erasure request
  // ===========================================================================
  .post(
    "/requests",
    async (ctx) => {
      const {
        erasureService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & DataErasurePluginContext;

      const typedBody = body as CreateErasureRequest;
      const result = await erasureService.createRequest(tenantContext, {
        employeeId: typedBody.employee_id,
        receivedDate: typedBody.received_date,
        notes: typedBody.notes,
      });

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.erasure.requested",
          resourceType: "erasure_request",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            idempotencyKey: headers["idempotency-key"],
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "write")],
      body: CreateErasureRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ErasureRequestResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Create erasure request",
        description:
          "Create a new GDPR Article 17 erasure request for an employee. Automatically sets a 30-day deadline.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id - Get erasure request detail
  // ===========================================================================
  .get(
    "/requests/:id",
    async (ctx) => {
      const { erasureService, params, tenantContext, error } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.getRequestDetail(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "read")],
      params: IdParamsSchema,
      response: {
        200: ErasureRequestDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Get erasure request detail",
        description:
          "Get a single erasure request with its per-table items and audit log",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/approve - Approve erasure request
  // ===========================================================================
  .post(
    "/requests/:id/approve",
    async (ctx) => {
      const {
        erasureService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.approveRequest(
        tenantContext,
        params.id,
        (body as ApproveErasureRequest | undefined)?.notes
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.erasure.approved",
          resourceType: "erasure_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "approve")],
      params: IdParamsSchema,
      body: t.Optional(ApproveErasureRequestSchema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ErasureRequestResponseSchema,
        403: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Approve erasure request",
        description:
          "Approve a GDPR erasure request. Must be a different user than the requester (four-eyes principle).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/execute - Execute anonymization
  // ===========================================================================
  .post(
    "/requests/:id/execute",
    async (ctx) => {
      const {
        erasureService,
        params,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.executeErasure(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.erasure.executed",
          resourceType: "erasure_request",
          resourceId: params.id,
          newValues: {
            status: result.data!.status,
            itemCount: result.data!.items.length,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ErasureRequestDetailResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Execute erasure",
        description:
          "Execute the anonymization of employee data. Request must be in 'approved' status. " +
          "Anonymizes PII across all relevant tables and records per-table results.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/complete - Complete with certificate
  // ===========================================================================
  .post(
    "/requests/:id/complete",
    async (ctx) => {
      const {
        erasureService,
        params,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataErasurePluginContext;

      // First generate the certificate data
      const certResult = await erasureService.generateErasureCertificate(
        tenantContext,
        params.id
      );

      if (!certResult.success) {
        const status = mapErrorToStatus(
          certResult.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: certResult.error });
      }

      // In a production system, this would trigger the PDF worker to generate
      // the certificate and store it. For now, we store a reference key.
      const certificateKey = `erasure-certificates/${params.id}.json`;

      const result = await erasureService.completeRequest(
        tenantContext,
        params.id,
        certificateKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.erasure.completed",
          resourceType: "erasure_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId, certificateKey },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ErasureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Complete with certificate",
        description:
          "Generate an erasure certificate and finalize the request. " +
          "Can only be called on completed or partially completed requests.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /requests/:id/reject - Reject erasure request
  // ===========================================================================
  .post(
    "/requests/:id/reject",
    async (ctx) => {
      const {
        erasureService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & DataErasurePluginContext;

      const typedBody = body as RejectErasureRequest;
      const result = await erasureService.rejectRequest(
        tenantContext,
        params.id,
        typedBody.reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "gdpr.erasure.rejected",
          resourceType: "erasure_request",
          resourceId: params.id,
          newValues: result.data,
          metadata: { requestId, reason: typedBody.reason },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "write")],
      params: IdParamsSchema,
      body: RejectErasureRequestSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ErasureRequestResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Reject erasure request",
        description:
          "Reject a GDPR erasure request with a documented reason. " +
          "Only requests in 'received' or 'reviewing' status can be rejected.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id/audit-log - Get audit trail
  // ===========================================================================
  .get(
    "/requests/:id/audit-log",
    async (ctx) => {
      const { erasureService, params, tenantContext, error } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.getAuditLog(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { entries: result.data };
    },
    {
      beforeHandle: [requirePermission("data_erasure", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          entries: t.Array(ErasureAuditLogEntrySchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Get erasure audit log",
        description:
          "Get the complete audit trail for an erasure request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /employees/:employeeId/retention-conflicts - Check retention conflicts
  // ===========================================================================
  .get(
    "/employees/:employeeId/retention-conflicts",
    async (ctx) => {
      const { erasureService, params, tenantContext, error } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.getRetentionConflicts(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: RetentionConflictsResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Check retention conflicts",
        description:
          "Check what data cannot be fully erased for an employee due to statutory retention requirements. " +
          "Use this before creating an erasure request to understand what will be retained.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /requests/:id/certificate - Generate erasure certificate
  // ===========================================================================
  .get(
    "/requests/:id/certificate",
    async (ctx) => {
      const { erasureService, params, tenantContext, error } = ctx as typeof ctx & DataErasurePluginContext;

      const result = await erasureService.generateErasureCertificate(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          erasureErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_erasure", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          requestId: t.String(),
          employeeId: t.String(),
          issuedAt: t.String(),
          issuedBy: t.String(),
          tablesProcessed: t.Array(
            t.Object({
              tableName: t.String(),
              action: t.String(),
              recordCount: t.Number(),
              retentionReason: t.Union([t.String(), t.Null()]),
            })
          ),
          statement: t.String(),
        }),
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Erasure"],
        summary: "Generate erasure certificate",
        description:
          "Generate a certificate of erasure as proof of GDPR Article 17 compliance. " +
          "Only available for completed or partially completed requests.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DataErasureRoutes = typeof dataErasureRoutes;
