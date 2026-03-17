/**
 * Background Checks Module Routes
 *
 * API endpoints for background check provider integration. TODO-194.
 *
 * Authenticated endpoints (require recruitment permission):
 *   POST /background-checks          - Request a new background check
 *   GET  /background-checks          - List background check requests
 *   GET  /background-checks/:id      - Get a single background check request
 *
 * Webhook endpoint (unauthenticated, verified via HMAC signature):
 *   POST /background-checks/webhooks/:provider - Provider callback
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { handleServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { BackgroundCheckService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  RequestBackgroundCheckSchema,
  WebhookCallbackSchema,
  WebhookParamsSchema,
  BackgroundCheckFiltersSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string } | null;
  user: { id: string } | null;
}

interface BackgroundCheckPluginContext {
  bgCheckService: BackgroundCheckService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Routes
// =============================================================================

export const backgroundCheckRoutes = new Elysia({ prefix: "/background-checks", name: "background-check-routes" })

  // Derive services
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const service = new BackgroundCheckService(db);
    const tenantContext = tenant
      ? { tenantId: tenant.id, userId: user?.id }
      : null;
    return { bgCheckService: service, tenantContext };
  })

  // =========================================================================
  // POST /webhooks/:provider - Provider webhook callback
  //
  // This endpoint is intentionally placed BEFORE the auth-guarded routes.
  // Webhook callbacks come from external providers and are not authenticated
  // via the normal auth flow. Security is enforced via HMAC signature
  // verification against the per-request webhook_secret.
  // =========================================================================
  .post(
    "/webhooks/:provider",
    async (ctx) => {
      const { bgCheckService, params, body, request, error } = ctx as typeof ctx & BackgroundCheckPluginContext & {
        params: { provider: string };
        body: { provider_reference: string; status: "completed" | "failed"; result?: Record<string, unknown> };
        request: Request;
      };

      const signature = request.headers.get("x-webhook-signature") || undefined;

      // For HMAC verification we need the raw body; Elysia parses it,
      // so we reconstruct from the parsed body.
      const rawBody = JSON.stringify(body);

      const result = await bgCheckService.processWebhook(
        params.provider,
        body.provider_reference,
        body.status,
        body.result || null,
        signature,
        rawBody
      );

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      return {
        success: true as const,
        message: "Webhook processed successfully",
        checkId: result.data.id,
      };
    },
    {
      params: WebhookParamsSchema,
      body: WebhookCallbackSchema,
      detail: {
        tags: ["Recruitment - Background Checks"],
        summary: "Provider webhook callback",
        description:
          "Receives status updates from external screening providers. " +
          "Authenticated via HMAC signature in X-Webhook-Signature header.",
      },
    }
  )

  // =========================================================================
  // GET / - List background check requests
  // =========================================================================
  .get(
    "/",
    async (ctx) => {
      const { bgCheckService, query, tenantContext, error } = ctx as typeof ctx & BackgroundCheckPluginContext;

      if (!tenantContext) {
        return handleServiceError(error, {
          code: ErrorCodes.MISSING_TENANT,
          message: "Tenant context is required",
        });
      }

      try {
        const result = await bgCheckService.list(tenantContext, {
          cursor: query.cursor as string | undefined,
          limit: Number(query.limit) || undefined,
          employeeId: query.employeeId as string | undefined,
          status: query.status as string | undefined,
          checkType: query.checkType as string | undefined,
          provider: query.provider as string | undefined,
          search: query.search as string | undefined,
        });

        return {
          items: result.items,
          count: result.items.length,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        };
      } catch (err: unknown) {
        return handleServiceError(error, {
          code: ErrorCodes.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      query: t.Composite([
        t.Partial(BackgroundCheckFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Background Checks"],
        summary: "List background check requests",
        description: "List background check requests with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // GET /:id - Get background check request by ID
  // =========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { bgCheckService, params, tenantContext, error } = ctx as typeof ctx & BackgroundCheckPluginContext;

      if (!tenantContext) {
        return handleServiceError(error, {
          code: ErrorCodes.MISSING_TENANT,
          message: "Tenant context is required",
        });
      }

      const result = await bgCheckService.getById(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      // Strip webhook_secret from response (sensitive)
      const { webhookSecret, ...safeData } = result.data as any;
      return safeData;
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Background Checks"],
        summary: "Get background check request by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // =========================================================================
  // POST / - Request a new background check
  // =========================================================================
  .post(
    "/",
    async (ctx) => {
      const { bgCheckService, body, tenantContext, audit, error, set } = ctx as typeof ctx & BackgroundCheckPluginContext & { set: { status: number } };

      if (!tenantContext) {
        return handleServiceError(error, {
          code: ErrorCodes.MISSING_TENANT,
          message: "Tenant context is required",
        });
      }

      const typedBody = body as {
        employee_id: string;
        check_type: string;
        provider: string;
        notes?: string;
      };

      const result = await bgCheckService.requestCheck(tenantContext, {
        employeeId: typedBody.employee_id,
        checkType: typedBody.check_type,
        provider: typedBody.provider,
        notes: typedBody.notes,
      });

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.background_check.requested",
          resourceType: "background_check_request",
          resourceId: result.data.id,
          newValues: {
            employeeId: typedBody.employee_id,
            checkType: typedBody.check_type,
            provider: typedBody.provider,
          },
        });
      }

      set.status = 201;

      // Strip webhook_secret from response (sensitive)
      const { webhookSecret, ...safeData } = result.data as any;
      return safeData;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: RequestBackgroundCheckSchema,
      detail: {
        tags: ["Recruitment - Background Checks"],
        summary: "Request a background check",
        description:
          "Request a new background check from an external screening provider. " +
          "Creates the request and simulates sending to the provider.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BackgroundCheckRoutes = typeof backgroundCheckRoutes;
