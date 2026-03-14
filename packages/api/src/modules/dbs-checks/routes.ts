/**
 * DBS Checks Module Routes
 *
 * API endpoints for DBS (Disclosure and Barring Service) check operations
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { handleServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import type { AuditHelper } from "../../plugins/audit";
import { DbsCheckService } from "./service";
import {
  IdParamsSchema,
  PaginationQuerySchema,
  CreateDbsCheckSchema,
  UpdateDbsCheckSchema,
  SubmitDbsCheckSchema,
  RecordDbsResultSchema,
  DbsCheckFiltersSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  db: DatabaseClient;
  tenant: { id: string } | null;
  user: { id: string } | null;
}

interface DbsCheckPluginContext {
  dbsCheckService: DbsCheckService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

// =============================================================================
// Routes
// =============================================================================

export const dbsCheckRoutes = new Elysia({ prefix: "/dbs-checks", name: "dbs-check-routes" })

  // Derive services
  .derive((ctx) => {
    const { db, tenant, user } = ctx as unknown as PluginContext;
    const service = new DbsCheckService(db);
    const tenantContext = tenant
      ? { tenantId: tenant.id, userId: user?.id }
      : null;
    return { dbsCheckService: service, tenantContext };
  })

  // GET / - List DBS checks
  .get(
    "/",
    async (ctx) => {
      const { dbsCheckService, query, tenantContext, error } = ctx as typeof ctx & DbsCheckPluginContext;

      try {
        const result = await dbsCheckService.list(tenantContext, {
          cursor: query.cursor as string | undefined,
          limit: Number(query.limit) || undefined,
          employeeId: query.employeeId as string | undefined,
          status: query.status as string | undefined,
          checkLevel: query.checkLevel as string | undefined,
          search: query.search as string | undefined,
        });

        return {
          dbsChecks: result.items,
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
        t.Partial(DbsCheckFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "List DBS checks",
        description: "List DBS checks with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /:id - Get DBS check by ID
  .get(
    "/:id",
    async (ctx) => {
      const { dbsCheckService, params, tenantContext, error } = ctx as typeof ctx & DbsCheckPluginContext;

      const result = await dbsCheckService.getById(tenantContext, params.id);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "read")],
      params: IdParamsSchema,
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "Get DBS check by ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST / - Create DBS check
  .post(
    "/",
    async (ctx) => {
      const { dbsCheckService, body, tenantContext, audit, error } = ctx as typeof ctx & DbsCheckPluginContext;

      const result = await dbsCheckService.create(
        tenantContext,
        body as Parameters<typeof dbsCheckService.create>[1]
      );

      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.dbs_check.created",
          resourceType: "dbs_check",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      body: CreateDbsCheckSchema,
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "Create DBS check",
        description: "Create a new DBS check request for an employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /:id - Update DBS check
  .patch(
    "/:id",
    async (ctx) => {
      const { dbsCheckService, params, body, tenantContext, audit, error } = ctx as typeof ctx & DbsCheckPluginContext;

      const result = await dbsCheckService.update(tenantContext, params.id, body);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.dbs_check.updated",
          resourceType: "dbs_check",
          resourceId: result.data.id,
          newValues: result.data as unknown as Record<string, unknown>,
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: UpdateDbsCheckSchema,
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "Update DBS check",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /:id/submit - Submit DBS check application
  .post(
    "/:id/submit",
    async (ctx) => {
      const { dbsCheckService, params, body, tenantContext, audit, error } = ctx as typeof ctx & DbsCheckPluginContext;

      const typedBody = body as { certificateNumber?: string; notes?: string };
      const result = await dbsCheckService.submit(tenantContext, params.id, typedBody);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.dbs_check.submitted",
          resourceType: "dbs_check",
          resourceId: result.data.id,
          newValues: { status: "submitted" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: SubmitDbsCheckSchema,
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "Submit DBS check",
        description: "Mark DBS check as submitted to DBS",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /:id/record-result - Record DBS check result
  .post(
    "/:id/record-result",
    async (ctx) => {
      const { dbsCheckService, params, body, tenantContext, audit, error } = ctx as typeof ctx & DbsCheckPluginContext;

      const typedBody = body as {
        certificateNumber: string;
        issueDate: string;
        result?: string;
        expiryDate?: string;
        dbsUpdateServiceRegistered?: boolean;
        updateServiceId?: string;
        clear: boolean;
      };
      const result = await dbsCheckService.recordResult(tenantContext, params.id, typedBody);
      if (!result.success) {
        return handleServiceError(error, (result as any).error);
      }

      if (audit) {
        await audit.log({
          action: "recruitment.dbs_check.result_recorded",
          resourceType: "dbs_check",
          resourceId: result.data.id,
          newValues: {
            status: typedBody.clear ? "clear" : "flagged",
            certificateNumber: typedBody.certificateNumber,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("recruitment", "write")],
      params: IdParamsSchema,
      body: RecordDbsResultSchema,
      detail: {
        tags: ["Recruitment - DBS Checks"],
        summary: "Record DBS result",
        description: "Record the result of a DBS check (clear or flagged)",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type DbsCheckRoutes = typeof dbsCheckRoutes;
