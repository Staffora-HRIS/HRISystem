/**
 * Right to Work Module - Elysia Routes
 *
 * Defines the API endpoints for UK Right to Work verification.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - right_to_work: read, write, delete
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { RTWRepository } from "./repository";
import { RTWService } from "./service";
import {
  // Request schemas
  CreateRTWCheckSchema,
  UpdateRTWCheckSchema,
  VerifyCheckSchema,
  FailCheckSchema,
  CreateRTWDocumentSchema,
  // Filter / query schemas
  RTWCheckFiltersSchema,
  ExpiringChecksQuerySchema,
  PaginationQuerySchema,
  // Response schemas
  RTWCheckResponseSchema,
  RTWCheckListItemSchema,
  RTWDocumentResponseSchema,
  EmployeeRTWStatusResponseSchema,
  ComplianceDashboardResponseSchema,
  // Param schemas
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateRTWCheck,
  type FailCheck,
  type CreateRTWDocument,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & RTWPluginContext` to preserve
 * Elysia's native typing for body/params/query/error/set.
 */
interface RTWPluginContext {
  rtwService: RTWService;
  rtwRepository: RTWRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  /** Elysia error response helper */
  error: (status: number, body: unknown) => never;
}

/**
 * RTW module-specific error codes
 */
const rtwErrorStatusMap: Record<string, number> = {
  STATE_MACHINE_VIOLATION: 409,
  EMPLOYEE_NOT_FOUND: 404,
};

/**
 * Audit action constants for RTW operations
 */
const RTWAuditActions = {
  RTW_CHECK_CREATED: "rtw.check.created",
  RTW_CHECK_UPDATED: "rtw.check.updated",
  RTW_CHECK_VERIFIED: "rtw.check.verified",
  RTW_CHECK_FAILED: "rtw.check.failed",
  RTW_DOCUMENT_UPLOADED: "rtw.document.uploaded",
  RTW_DOCUMENT_DELETED: "rtw.document.deleted",
} as const;

/**
 * Create RTW routes plugin
 */
export const rightToWorkRoutes = new Elysia({ prefix: "/right-to-work", name: "right-to-work-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new RTWRepository(db);
    const service = new RTWService(repository, db);

    return { rtwService: service, rtwRepository: repository };
  })

  // ===========================================================================
  // Compliance Dashboard
  // ===========================================================================

  // GET /compliance - Compliance dashboard stats
  .get(
    "/compliance",
    async (ctx) => {
      const { rtwService, tenantContext, error } = ctx as typeof ctx & RTWPluginContext;

      const result = await rtwService.getComplianceDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      response: {
        200: ComplianceDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Get compliance dashboard",
        description: "Get tenant-wide RTW compliance statistics. Shows verified, pending, expired, and non-compliant counts.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Expiring Checks
  // ===========================================================================

  // GET /expiring - List checks expiring soon
  .get(
    "/expiring",
    async (ctx) => {
      const { rtwService, query, tenantContext } = ctx as typeof ctx & RTWPluginContext;
      const daysAhead = query.days_ahead !== undefined ? Number(query.days_ahead) : 28;

      const items = await rtwService.getExpiringChecks(tenantContext, daysAhead);

      return { items };
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      query: ExpiringChecksQuerySchema,
      response: {
        200: t.Object({
          items: t.Array(RTWCheckListItemSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "List expiring checks",
        description: "List RTW checks with documents expiring within the specified number of days (default 28).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Check CRUD Routes
  // ===========================================================================

  // GET /checks - List all checks
  .get(
    "/checks",
    async (ctx) => {
      const { rtwService, query, tenantContext } = ctx as typeof ctx & RTWPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await rtwService.listChecks(
        tenantContext,
        filters,
        { cursor: cursor as string | undefined, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      query: t.Composite([
        t.Partial(RTWCheckFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: {
        200: t.Object({
          items: t.Array(RTWCheckListItemSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "List RTW checks",
        description: "List all RTW checks with optional filters (employee, status, check type, expiring date) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /checks - Create new check
  .post(
    "/checks",
    async (ctx) => {
      const { rtwService, body, headers, tenantContext, audit, requestId, error, set } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as CreateRTWCheck;
      const result = await rtwService.createCheck(tenantContext, typedBody, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_CHECK_CREATED,
          resourceType: "rtw_check",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: typedBody.employee_id },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      body: CreateRTWCheckSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: RTWCheckResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Create RTW check",
        description: "Create a new Right to Work verification check for an employee. Automatically calculates follow-up dates for time-limited check types.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /checks/:id - Get check by ID
  .get(
    "/checks/:id",
    async (ctx) => {
      const { rtwService, params, tenantContext, error } = ctx as typeof ctx & RTWPluginContext;

      const result = await rtwService.getCheck(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      params: IdParamsSchema,
      response: {
        200: RTWCheckResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Get RTW check",
        description: "Get a single RTW check by its ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /checks/:id - Update check details
  .patch(
    "/checks/:id",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await rtwService.getCheck(tenantContext, params.id);

      const result = await rtwService.updateCheck(tenantContext, params.id, body, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_CHECK_UPDATED,
          resourceType: "rtw_check",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      params: IdParamsSchema,
      body: UpdateRTWCheckSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: RTWCheckResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Update RTW check",
        description: "Update RTW check details (document info, notes, etc.). Cannot change status via this endpoint.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /checks/:id/verify - Verify check
  .post(
    "/checks/:id/verify",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await rtwService.verifyCheck(tenantContext, params.id, body || {}, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_CHECK_VERIFIED,
          resourceType: "rtw_check",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: result.data?.employee_id },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      params: IdParamsSchema,
      body: t.Optional(VerifyCheckSchema),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: RTWCheckResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Verify RTW check",
        description: "Mark an RTW check as verified (right to work confirmed). Only valid from 'pending' or 'follow_up_required' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /checks/:id/fail - Fail check
  .post(
    "/checks/:id/fail",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as FailCheck;
      const result = await rtwService.failCheck(tenantContext, params.id, typedBody, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_CHECK_FAILED,
          resourceType: "rtw_check",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, reason: typedBody.reason, employeeId: result.data?.employee_id },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      params: IdParamsSchema,
      body: FailCheckSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: RTWCheckResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Fail RTW check",
        description: "Mark an RTW check as failed (right to work NOT confirmed). Reason is required. Only valid from 'pending' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Document Routes
  // ===========================================================================

  // GET /checks/:id/documents - List documents for a check
  .get(
    "/checks/:id/documents",
    async (ctx) => {
      const { rtwService, params, tenantContext, error } = ctx as typeof ctx & RTWPluginContext;

      const result = await rtwService.getDocuments(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({
          items: t.Array(RTWDocumentResponseSchema),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "List check documents",
        description: "List all document references attached to an RTW check.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /checks/:id/documents - Upload document metadata
  .post(
    "/checks/:id/documents",
    async (ctx) => {
      const { rtwService, params, body, headers, tenantContext, audit, requestId, error, set } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await rtwService.uploadDocument(tenantContext, params.id, body as CreateRTWDocument, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_DOCUMENT_UPLOADED,
          resourceType: "rtw_document",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, checkId: params.id },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      params: IdParamsSchema,
      body: CreateRTWDocumentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: RTWDocumentResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Upload document metadata",
        description: "Store a document reference (file key, name, type) for an RTW check. The actual file upload is handled separately via the documents/storage service.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /checks/:id/documents/:documentId - Delete document
  .delete(
    "/checks/:id/documents/:documentId",
    async (ctx) => {
      const { rtwService, params, headers, tenantContext, audit, requestId, error } = ctx as typeof ctx & RTWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current doc for audit
      const checkResult = await rtwService.getDocuments(tenantContext, params.id);

      const result = await rtwService.deleteDocument(
        tenantContext,
        params.id,
        params.documentId,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: RTWAuditActions.RTW_DOCUMENT_DELETED,
          resourceType: "rtw_document",
          resourceId: params.documentId,
          oldValues: checkResult.data?.find((d: Record<string, unknown>) => d.id === params.documentId),
          metadata: { idempotencyKey, requestId, checkId: params.id },
        });
      }

      return { success: true as const, message: "Document deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("right_to_work", "write")],
      params: t.Object({
        id: t.String({ format: "uuid", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" }),
        documentId: t.String({ format: "uuid", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" }),
      }),
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Delete document",
        description: "Delete a document reference from an RTW check.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee RTW Status
  // ===========================================================================

  // GET /employees/:employeeId/status - Get employee RTW status
  .get(
    "/employees/:employeeId/status",
    async (ctx) => {
      const { rtwService, params, tenantContext, error } = ctx as typeof ctx & RTWPluginContext;

      const result = await rtwService.getEmployeeRTWStatus(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", rtwErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("right_to_work", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: EmployeeRTWStatusResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Right to Work"],
        summary: "Get employee RTW status",
        description: "Get the current Right to Work status for an employee, including latest check details and whether follow-up is required.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type RTWRoutes = typeof rightToWorkRoutes;
