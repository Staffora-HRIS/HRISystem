/**
 * Warnings Module - Elysia Routes
 *
 * Defines the API endpoints for Employee Warning Management.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 *   GET    /warnings/employee/:employeeId  - List warnings for an employee
 *   GET    /warnings/:id                    - Get warning by ID
 *   GET    /warnings/employee/:employeeId/active - Get active warnings
 *   POST   /warnings                        - Issue a new warning
 *   POST   /warnings/:id/appeal             - Submit an appeal
 *   PATCH  /warnings/:id/appeal/resolve     - Resolve an appeal
 *   PATCH  /warnings/:id/rescind            - Rescind a warning
 *   POST   /warnings/batch-expire           - Batch expire active warnings (admin/system)
 *
 * Permission model:
 *   - warnings: read, write
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { WarningsRepository } from "./repository";
import { WarningsService } from "./service";
import {
  IssueWarningSchema,
  AppealWarningSchema,
  ResolveAppealSchema,
  RescindWarningSchema,
  WarningResponseSchema,
  WarningListResponseSchema,
  WarningStatusSchema,
  WarningLevelSchema,
  ExpiredWarningsResultSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  PaginationQuerySchema,
  WarningFiltersSchema,
  OptionalIdempotencyHeaderSchema,
  UuidSchema,
  // Types
  type IssueWarning,
  type AppealWarning,
  type ResolveAppeal,
  type RescindWarning,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & WarningsPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface WarningsPluginContext {
  warningsService: WarningsService;
  warningsRepository: WarningsRepository;
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

// =============================================================================
// Error Code Mapping
// =============================================================================

/**
 * Module-specific error code to HTTP status overrides
 */
const warningsErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  APPEAL_FAILED: 500,
  RESOLVE_FAILED: 500,
  RESCIND_FAILED: 500,
  BATCH_EXPIRE_FAILED: 500,
  STATE_MACHINE_VIOLATION: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const warningsRoutes = new Elysia({ prefix: "/warnings", name: "warnings-routes" })

  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new WarningsRepository(db);
    const service = new WarningsService(repository, db);

    return { warningsService: service, warningsRepository: repository };
  })

  // ===========================================================================
  // List Warnings by Employee
  // ===========================================================================

  // GET /warnings/employee/:employeeId - List warnings for an employee
  .get(
    "/employee/:employeeId",
    async (ctx) => {
      const { warningsService, params, query, tenantContext } = ctx as typeof ctx & WarningsPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await warningsService.listWarningsByEmployee(
        tenantContext,
        params.employeeId,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items as any[],
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("warnings", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Composite([
        t.Partial(WarningFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: WarningListResponseSchema,
      detail: {
        tags: ["Warnings"],
        summary: "List warnings for an employee",
        description:
          "List employee warnings with optional filters (status, level, search) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Active Warnings
  // ===========================================================================

  // GET /warnings/employee/:employeeId/active - Get active warnings
  .get(
    "/employee/:employeeId/active",
    async (ctx) => {
      const { warningsService, params, tenantContext, set } = ctx as typeof ctx & WarningsPluginContext;

      const result = await warningsService.getActiveWarnings(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        set.status = status;
        return { error: result.error };
      }

      return { items: result.data, count: result.data!.length };
    },
    {
      beforeHandle: [requirePermission("warnings", "read")],
      params: EmployeeIdParamsSchema,
      detail: {
        tags: ["Warnings"],
        summary: "Get active warnings for an employee",
        description:
          "Returns all currently active warnings for the specified employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get Warning by ID
  // ===========================================================================

  // GET /warnings/:id - Get warning by ID
  .get(
    "/:id",
    async (ctx) => {
      const { warningsService, params, tenantContext, error } = ctx as typeof ctx & WarningsPluginContext;

      const result = await warningsService.getWarning(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Get warning by ID",
        description: "Get a single warning with full details including employee name",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Issue Warning (Create)
  // ===========================================================================

  // POST /warnings - Issue a new warning
  .post(
    "/",
    async (ctx) => {
      const { warningsService, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & WarningsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await warningsService.issueWarning(
        tenantContext,
        body as unknown as IssueWarning,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the warning issuance (sensitive HR operation)
      if (audit) {
        await audit.log({
          action: "WARNING_ISSUED",
          resourceType: "employee_warning",
          resourceId: result.data!.id as string,
          newValues: {
            employee_id: result.data!.employee_id,
            warning_level: result.data!.warning_level,
            issued_date: result.data!.issued_date,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "write")],
      body: IssueWarningSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Issue a new warning",
        description:
          "Issue a disciplinary warning to an employee. " +
          "If expiry_date is not provided, it is auto-calculated based on the warning level " +
          "(verbal=6mo, first_written=12mo, final_written=12mo per UK ACAS guidelines).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Appeal Warning
  // ===========================================================================

  // POST /warnings/:id/appeal - Submit an appeal
  .post(
    "/:id/appeal",
    async (ctx) => {
      const { warningsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & WarningsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as AppealWarning;
      const result = await warningsService.appealWarning(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "WARNING_APPEALED",
          resourceType: "employee_warning",
          resourceId: params.id,
          newValues: {
            appeal_date: typedBody.appeal_date,
            status: "appealed",
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "write")],
      params: IdParamsSchema,
      body: AppealWarningSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Submit an appeal against a warning",
        description:
          "Submit an appeal against an active warning. " +
          "If an appeal deadline is set, the appeal date must be on or before the deadline.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Resolve Appeal
  // ===========================================================================

  // PATCH /warnings/:id/appeal/resolve - Resolve an appeal
  .patch(
    "/:id/appeal/resolve",
    async (ctx) => {
      const { warningsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & WarningsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as ResolveAppeal;
      const result = await warningsService.resolveAppeal(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "WARNING_APPEAL_RESOLVED",
          resourceType: "employee_warning",
          resourceId: params.id,
          newValues: {
            appeal_outcome: typedBody.appeal_outcome,
            status: result.data!.status,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "write")],
      params: IdParamsSchema,
      body: ResolveAppealSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Resolve an appeal",
        description:
          "Resolve a pending appeal. Outcomes: " +
          "'upheld' (warning reinstated as active), " +
          "'overturned' (warning rescinded), " +
          "'modified' (warning reinstated with changes).",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Rescind Warning
  // ===========================================================================

  // PATCH /warnings/:id/rescind - Rescind a warning
  .patch(
    "/:id/rescind",
    async (ctx) => {
      const { warningsService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & WarningsPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as RescindWarning;
      const result = await warningsService.rescindWarning(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "WARNING_RESCINDED",
          resourceType: "employee_warning",
          resourceId: params.id,
          newValues: {
            status: "rescinded",
            rescinded_reason: typedBody.rescinded_reason,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "write")],
      params: IdParamsSchema,
      body: RescindWarningSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Rescind a warning",
        description:
          "Rescind an active warning. A reason must be provided. " +
          "Only active warnings can be rescinded.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Batch Expire
  // ===========================================================================

  // POST /warnings/batch-expire - Batch expire active warnings past their expiry date
  .post(
    "/batch-expire",
    async (ctx) => {
      const { warningsService, tenantContext, audit, requestId, error } = ctx as typeof ctx & WarningsPluginContext;

      const result = await warningsService.batchExpireWarnings(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          warningsErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit && result.data!.expired_count > 0) {
        await audit.log({
          action: "WARNINGS_BATCH_EXPIRED",
          resourceType: "employee_warning",
          resourceId: "batch",
          newValues: {
            expired_count: result.data!.expired_count,
          },
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("warnings", "write")],
      response: {
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Warnings"],
        summary: "Batch expire warnings",
        description:
          "Expire all active warnings that have passed their expiry date. " +
          "Intended for scheduled job execution.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type WarningsRoutes = typeof warningsRoutes;
