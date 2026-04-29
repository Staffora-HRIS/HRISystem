/**
 * Reference Checks Module Routes
 *
 * API endpoints for reference check operations
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { handleServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { ReferenceCheckService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  CreateReferenceCheckSchema,
  UpdateReferenceCheckSchema,
  VerifyReferenceCheckSchema,
  ReferenceCheckFiltersSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string } | null;
  user: { id: string } | null;
}

interface ReferenceCheckPluginContext {
  referenceCheckService: ReferenceCheckService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Routes
// =============================================================================

export const referenceCheckRoutes = new Elysia({ prefix: "/reference-checks", name: "reference-check-routes" })

  // Derive services
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const service = new ReferenceCheckService(db);
    const tenantContext = tenant
      ? { tenantId: tenant.id, userId: user?.id }
      : null;
    return { referenceCheckService: service, tenantContext };
  })

  // GET / - List reference checks
  .get(
    "/",
    async (ctx) => {
      const { referenceCheckService, query, tenantContext, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      try {
        const result = await referenceCheckService.list(tenantContext, {
          cursor: query.cursor as string | undefined,
          limit: Number(query.limit) || undefined,
          candidateId: query.candidateId as string | undefined,
          employeeId: query.employeeId as string | undefined,
          status: query.status as string | undefined,
          search: query.search as string | undefined,
        });

        return {
          referenceChecks: result.items,
          count: result.items.length,
          ...result,
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
        t.Partial(ReferenceCheckFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "List reference checks",
        description: "List reference checks with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get reference check by ID
  .get(
    "/:id",
    async (ctx) => {
      const { referenceCheckService, params, tenantContext, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      const result = await referenceCheckService.getById(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "Get reference check by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Create reference check
  .post(
    "/",
    async (ctx) => {
      const { referenceCheckService, body, tenantContext, audit, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      const result = await referenceCheckService.create(
        tenantContext,
        body as Parameters<typeof referenceCheckService.create>[1]
      );

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.reference_check.created",
          resourceType: "reference_check",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateReferenceCheckSchema,
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "Create reference check",
        description: "Create a new reference check request",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /:id - Update reference check
  .patch(
    "/:id",
    async (ctx) => {
      const { referenceCheckService, params, body, tenantContext, audit, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      const result = await referenceCheckService.update(tenantContext, params.id, body);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.reference_check.updated",
          resourceType: "reference_check",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateReferenceCheckSchema,
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "Update reference check",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /:id/send - Send reference request
  .post(
    "/:id/send",
    async (ctx) => {
      const { referenceCheckService, params, tenantContext, audit, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      const result = await referenceCheckService.send(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.reference_check.sent",
          resourceType: "reference_check",
          resourceId: result.data.id,
          newValues: { status: "sent" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "Send reference request",
        description: "Mark reference check as sent to referee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /:id/verify - Verify reference check
  .post(
    "/:id/verify",
    async (ctx) => {
      const { referenceCheckService, params, body, tenantContext, audit, error } = ctx as typeof ctx & ReferenceCheckPluginContext;

      const typedBody = body as { verificationNotes?: string; satisfactory: boolean };
      const result = await referenceCheckService.verify(tenantContext, params.id, typedBody);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.reference_check.verified",
          resourceType: "reference_check",
          resourceId: result.data.id,
          newValues: { status: "verified", satisfactory: typedBody.satisfactory },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: VerifyReferenceCheckSchema,
      detail: {
        tags: ["Recruitment - Reference Checks"],
        summary: "Verify reference check",
        description: "Mark reference as verified with satisfactory/unsatisfactory result",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ReferenceCheckRoutes = typeof referenceCheckRoutes;
