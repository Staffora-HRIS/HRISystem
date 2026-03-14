/**
 * Privacy Notices Module - Elysia Routes
 *
 * Defines the API endpoints for UK GDPR privacy notice management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - privacy_notices: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PrivacyNoticeRepository } from "./repository";
import { PrivacyNoticeService } from "./service";
import {
  // Notice schemas
  CreatePrivacyNoticeSchema,
  UpdatePrivacyNoticeSchema,
  PrivacyNoticeResponseSchema,
  PrivacyNoticeFiltersSchema,
  // Acknowledgement schemas
  AcknowledgePrivacyNoticeSchema,
  AcknowledgementResponseSchema,
  // Outstanding
  OutstandingAcknowledgementSchema,
  // Compliance
  ComplianceSummaryResponseSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreatePrivacyNotice,
  type UpdatePrivacyNotice,
  type AcknowledgePrivacyNotice,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & PrivacyNoticePluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface PrivacyNoticePluginContext {
  privacyNoticeService: PrivacyNoticeService;
  privacyNoticeRepository: PrivacyNoticeRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  request: Request;
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error codes beyond the shared base set
 */
const privacyNoticeErrorStatusMap: Record<string, number> = {
  ALREADY_ACKNOWLEDGED: 409,
};

/**
 * Create Privacy Notice routes plugin
 */
export const privacyNoticeRoutes = new Elysia({ prefix: "/privacy-notices", name: "privacy-notice-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PrivacyNoticeRepository(db);
    const service = new PrivacyNoticeService(repository, db);
    return { privacyNoticeService: service, privacyNoticeRepository: repository };
  })

  // ===========================================================================
  // Privacy Notice Routes
  // ===========================================================================

  // GET / - List privacy notices
  .get(
    "/",
    async (ctx) => {
      const { privacyNoticeService, query, tenantContext } = ctx as typeof ctx & PrivacyNoticePluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await privacyNoticeService.listNotices(
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
      beforeHandle: [requirePermission("privacy_notices", "read")],
      query: t.Composite([
        t.Partial(PrivacyNoticeFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(PrivacyNoticeResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Privacy Notices"],
        summary: "List privacy notices",
        description: "List all privacy notices with optional filters and cursor pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /outstanding - Employees who haven't acknowledged current notice(s)
  .get(
    "/outstanding",
    async (ctx) => {
      const { privacyNoticeService, tenantContext, error } = ctx as typeof ctx & PrivacyNoticePluginContext;

      const result = await privacyNoticeService.getOutstanding(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "read")],
      response: {
        200: t.Array(OutstandingAcknowledgementSchema),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Outstanding acknowledgements",
        description:
          "List active employees who have not acknowledged the current privacy notice(s). " +
          "Used for compliance monitoring and follow-up.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /compliance-summary - Compliance statistics
  .get(
    "/compliance-summary",
    async (ctx) => {
      const { privacyNoticeService, tenantContext, error } = ctx as typeof ctx & PrivacyNoticePluginContext;

      const result = await privacyNoticeService.getComplianceSummary(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "read")],
      response: {
        200: ComplianceSummaryResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Compliance summary",
        description:
          "Get privacy notice compliance statistics including acknowledgement rates per notice " +
          "and overall compliance percentage. Useful for GDPR audit reporting.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get privacy notice by ID
  .get(
    "/:id",
    async (ctx) => {
      const { privacyNoticeService, params, tenantContext, error } = ctx as typeof ctx & PrivacyNoticePluginContext;
      const result = await privacyNoticeService.getNotice(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "read")],
      params: IdParamsSchema,
      response: {
        200: PrivacyNoticeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Get privacy notice",
        description: "Get a privacy notice by its ID, including full content",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Create privacy notice
  .post(
    "/",
    async (ctx) => {
      const { privacyNoticeService, body, tenantContext, audit, requestId, error, set } =
        ctx as typeof ctx & PrivacyNoticePluginContext;

      const result = await privacyNoticeService.createNotice(tenantContext, body as CreatePrivacyNotice);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "privacy_notice.created",
          resourceType: "privacy_notice",
          resourceId: result.data!.id,
          newValues: {
            title: result.data!.title,
            version: result.data!.version,
            effective_from: result.data!.effective_from,
          },
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "write")],
      body: CreatePrivacyNoticeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PrivacyNoticeResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Create privacy notice",
        description:
          "Create a new privacy notice. Automatically deactivates any previously current " +
          "notices and increments the version number. All active employees will need to " +
          "acknowledge the new notice.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /:id - Update privacy notice
  .patch(
    "/:id",
    async (ctx) => {
      const { privacyNoticeService, params, body, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & PrivacyNoticePluginContext;

      // Get current state for audit
      const oldResult = await privacyNoticeService.getNotice(tenantContext, params.id);

      const result = await privacyNoticeService.updateNotice(tenantContext, params.id, body as UpdatePrivacyNotice);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "privacy_notice.updated",
          resourceType: "privacy_notice",
          resourceId: params.id,
          oldValues: oldResult.success
            ? {
                title: oldResult.data.title,
                is_current: oldResult.data.is_current,
                effective_from: oldResult.data.effective_from,
                effective_to: oldResult.data.effective_to,
              }
            : undefined,
          newValues: {
            title: result.data!.title,
            is_current: result.data!.is_current,
            effective_from: result.data!.effective_from,
            effective_to: result.data!.effective_to,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "write")],
      params: IdParamsSchema,
      body: UpdatePrivacyNoticeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PrivacyNoticeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Update privacy notice",
        description: "Update a privacy notice. Use is_current to deactivate a notice.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /:id/acknowledge - Acknowledge a privacy notice
  .post(
    "/:id/acknowledge",
    async (ctx) => {
      const {
        privacyNoticeService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        error,
        set,
        request,
      } = ctx as typeof ctx & PrivacyNoticePluginContext;

      // Capture request metadata for GDPR proof of acknowledgement
      const ipAddress =
        request?.headers?.get?.("x-forwarded-for") ||
        request?.headers?.get?.("x-real-ip") ||
        null;
      const userAgent = request?.headers?.get?.("user-agent") || null;

      const typedBody = body as AcknowledgePrivacyNotice;
      const result = await privacyNoticeService.acknowledgeNotice(
        tenantContext,
        params.id,
        typedBody.employee_id,
        ipAddress,
        userAgent
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          privacyNoticeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "privacy_notice.acknowledged",
          resourceType: "privacy_notice_acknowledgement",
          resourceId: result.data!.id,
          newValues: {
            privacy_notice_id: params.id,
            employee_id: typedBody.employee_id,
            acknowledged_at: result.data!.acknowledged_at,
          },
          metadata: {
            requestId,
            ipAddress,
            privacyNoticeId: params.id,
            employeeId: typedBody.employee_id,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("privacy_notices", "write")],
      params: IdParamsSchema,
      body: AcknowledgePrivacyNoticeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: AcknowledgementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Privacy Notices"],
        summary: "Acknowledge privacy notice",
        description:
          "Record that an employee has acknowledged a privacy notice. " +
          "Captures IP address and user agent as proof of acknowledgement per GDPR requirements. " +
          "Returns 409 if the employee has already acknowledged this notice.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PrivacyNoticeRoutes = typeof privacyNoticeRoutes;
