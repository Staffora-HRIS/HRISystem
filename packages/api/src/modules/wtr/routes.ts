/**
 * Working Time Regulations Module - Elysia Routes
 *
 * Defines the API endpoints for UK Working Time Regulations 1998 monitoring.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - wtr:compliance: read
 * - wtr:alerts: read, write
 * - wtr:opt_outs: read, write
 *
 * Endpoints:
 * - GET    /wtr/compliance                         Compliance dashboard report
 * - GET    /wtr/alerts                             List alerts (filterable)
 * - POST   /wtr/alerts/:id/acknowledge             Acknowledge alert
 * - GET    /wtr/opt-outs                           List opt-out agreements
 * - POST   /wtr/opt-outs                           Create opt-out agreement
 * - POST   /wtr/opt-outs/:id/revoke               Revoke opt-out agreement
 * - GET    /wtr/employees/:employeeId/status       Individual working time status
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { WTRRepository } from "./repository";
import { WTRService } from "./service";
import {
  // Request schemas
  CreateOptOutSchema,
  RevokeOptOutSchema,
  OptOutFiltersSchema,
  AlertFiltersSchema,
  // Response schemas
  OptOutResponseSchema,
  AlertResponseSchema,
  ComplianceReportSchema,
  EmployeeWorkingTimeStatusSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateOptOut,
  type RevokeOptOut,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & WTRPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface WTRPluginContext {
  wtrService: WTRService;
  wtrRepository: WTRRepository;
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
 * WTR module-specific error codes beyond the shared base set
 */
const wtrErrorStatusMap: Record<string, number> = {
  OPT_OUT_NOT_FOUND: 404,
  ALERT_NOT_FOUND: 404,
  EMPLOYEE_NOT_FOUND: 404,
  OPT_OUT_ALREADY_ACTIVE: 409,
  OPT_OUT_ALREADY_REVOKED: 409,
  ALERT_ALREADY_ACKNOWLEDGED: 409,
};

/**
 * Create WTR routes plugin
 */
export const wtrRoutes = new Elysia({ prefix: "/wtr", name: "wtr-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new WTRRepository(db);
    const service = new WTRService(repository, db);

    return { wtrService: service, wtrRepository: repository };
  })

  // ===========================================================================
  // Compliance Dashboard
  // ===========================================================================

  // GET /compliance - Compliance dashboard report
  .get(
    "/compliance",
    async (ctx) => {
      const { wtrService, tenantContext, error } = ctx as typeof ctx & WTRPluginContext;

      const result = await wtrService.getComplianceReport(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          wtrErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("wtr:compliance", "read")],
      response: {
        200: ComplianceReportSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Working Time Regulations"],
        summary: "Get compliance dashboard",
        description:
          "Returns a summary of WTR compliance status: employees over threshold, opt-outs, warnings, and unacknowledged alerts.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Alert Routes
  // ===========================================================================

  // GET /alerts - List alerts
  .get(
    "/alerts",
    async (ctx) => {
      const { wtrService, query, tenantContext } = ctx as typeof ctx & WTRPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await wtrService.listAlerts(tenantContext, filters, {
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
      beforeHandle: [requirePermission("wtr:alerts", "read")],
      query: t.Composite([
        t.Partial(AlertFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(AlertResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Working Time Regulations"],
        summary: "List WTR alerts",
        description:
          "List working time regulation alerts with optional filters (type, employee, acknowledged status) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /alerts/:id/acknowledge - Acknowledge alert
  .post(
    "/alerts/:id/acknowledge",
    async (ctx) => {
      const {
        wtrService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & WTRPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await wtrService.acknowledgeAlert(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          wtrErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "wtr.alert.acknowledged",
          resourceType: "wtr_alert",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("wtr:alerts", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: AlertResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Working Time Regulations"],
        summary: "Acknowledge WTR alert",
        description:
          "Acknowledge a working time regulation alert. Records who acknowledged it and when.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Opt-Out Routes
  // ===========================================================================

  // GET /opt-outs - List opt-out agreements
  .get(
    "/opt-outs",
    async (ctx) => {
      const { wtrService, query, tenantContext } = ctx as typeof ctx & WTRPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await wtrService.listOptOuts(tenantContext, filters, {
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
      beforeHandle: [requirePermission("wtr:opt_outs", "read")],
      query: t.Composite([
        t.Partial(OptOutFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(OptOutResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Working Time Regulations"],
        summary: "List opt-out agreements",
        description:
          "List 48-hour opt-out agreements with optional filters (employee, status) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /opt-outs - Create opt-out agreement
  .post(
    "/opt-outs",
    async (ctx) => {
      const {
        wtrService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & WTRPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await wtrService.createOptOut(tenantContext, body as CreateOptOut);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          wtrErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "wtr.opt_out.created",
          resourceType: "wtr_opt_out",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("wtr:opt_outs", "write")],
      body: CreateOptOutSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: OptOutResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Working Time Regulations"],
        summary: "Create opt-out agreement",
        description:
          "Record a new 48-hour opt-out agreement for an employee. Under UK law, workers can voluntarily opt out of the 48-hour weekly limit in writing.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /opt-outs/:id/revoke - Revoke opt-out
  .post(
    "/opt-outs/:id/revoke",
    async (ctx) => {
      const {
        wtrService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & WTRPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as RevokeOptOut;
      const result = await wtrService.revokeOptOut(
        tenantContext,
        params.id,
        typedBody
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          wtrErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "wtr.opt_out.revoked",
          resourceType: "wtr_opt_out",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, optInDate: typedBody.optInDate },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("wtr:opt_outs", "write")],
      params: IdParamsSchema,
      body: RevokeOptOutSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: OptOutResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Working Time Regulations"],
        summary: "Revoke opt-out agreement",
        description:
          "Revoke a 48-hour opt-out agreement (employee opts back in). Workers have the right to opt back in at any time with notice.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Working Time Status
  // ===========================================================================

  // GET /employees/:employeeId/status - Individual working time status
  .get(
    "/employees/:employeeId/status",
    async (ctx) => {
      const { wtrService, params, tenantContext, error } = ctx as typeof ctx & WTRPluginContext;

      const result = await wtrService.getEmployeeWorkingTimeStatus(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          wtrErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("wtr:compliance", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: EmployeeWorkingTimeStatusSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Working Time Regulations"],
        summary: "Get employee working time status",
        description:
          "Get an individual employee's working time status including average hours, opt-out status, compliance state, alerts, and weekly breakdown.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type WTRRoutes = typeof wtrRoutes;
