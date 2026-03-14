/**
 * Payroll Integration Module - Elysia Routes
 *
 * Defines the API endpoints for payroll runs, calculation, export,
 * employee tax details, and payslip retrieval.
 *
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - payroll:runs: read, write
 * - payroll:tax_details: read, write
 * - payroll:export: read
 * - payroll:payslips: read
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { mapServiceError } from "../../lib/route-errors";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PayrollRepository } from "./repository";
import { PayrollService } from "./service";
import {
  // Schemas
  CreatePayrollRunSchema,
  PayrollRunResponseSchema,
  PayrollRunDetailResponseSchema,
  PayrollRunFiltersSchema,
  PayrollLineResponseSchema,
  UpsertTaxDetailsSchema,
  TaxDetailsResponseSchema,
  ExportPayrollSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  PayslipParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreatePayrollRun,
  type UpsertTaxDetails,
  type ExportPayroll,
  type PayrollRunFilters,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PayrollPluginContext {
  payrollService: PayrollService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error code to HTTP status overrides
 */
const payrollErrorOverrides: Record<string, number> = {
  EFFECTIVE_DATE_OVERLAP: 409,
};

/**
 * Create Payroll routes plugin
 */
export const payrollRoutes = new Elysia({
  prefix: "/payroll",
  name: "payroll-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PayrollRepository(db);
    const service = new PayrollService(repository, db);
    return { payrollService: service };
  })

  // ===========================================================================
  // Payroll Run Routes
  // ===========================================================================

  // POST /runs — Create payroll run
  .post(
    "/runs",
    async (ctx) => {
      const {
        payrollService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PayrollPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.createPayrollRun(
        tenantContext!,
        body as unknown as CreatePayrollRun,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.run.created",
          resourceType: "payroll_run",
          resourceId: result.data!.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      body: CreatePayrollRunSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PayrollRunResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Create payroll run",
        description:
          "Create a new payroll run for a pay period. Validates period dates and checks for duplicate runs.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /runs — List payroll runs
  .get(
    "/runs",
    async (ctx) => {
      const { payrollService, query, tenantContext } =
        ctx as typeof ctx & PayrollPluginContext;

      const filters: PayrollRunFilters = {
        cursor: query.cursor,
        limit: query.limit !== undefined ? Number(query.limit) : undefined,
        status: query.status as PayrollRunFilters["status"],
        run_type: query.run_type as PayrollRunFilters["run_type"],
      };

      const result = await payrollService.listPayrollRuns(tenantContext!, filters);

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      query: t.Partial(PayrollRunFiltersSchema),
      response: {
        200: t.Object({
          items: t.Array(PayrollRunResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List payroll runs",
        description:
          "List payroll runs with optional status and type filters. Supports cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /runs/:id — Get payroll run detail (with lines)
  .get(
    "/runs/:id",
    async (ctx) => {
      const { payrollService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const result = await payrollService.getPayrollRunDetail(
        tenantContext!,
        params.id
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      response: {
        200: PayrollRunDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get payroll run detail",
        description:
          "Get a payroll run with all employee line items.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /runs/:id/calculate — Calculate payroll
  .post(
    "/runs/:id/calculate",
    async (ctx) => {
      const {
        payrollService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PayrollPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.calculatePayroll(
        tenantContext!,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.run.calculated",
          resourceType: "payroll_run",
          resourceId: params.id,
          newValues: {
            employeeCount: result.data!.employee_count,
            totalGross: result.data!.total_gross,
            totalNet: result.data!.total_net,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayrollRunDetailResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Calculate payroll",
        description:
          "Calculate payroll for all active employees. Gathers compensation, overtime, bonuses, and tax details. Transitions run from draft -> review.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /runs/:id/approve — Approve payroll run
  .patch(
    "/runs/:id/approve",
    async (ctx) => {
      const {
        payrollService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PayrollPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.approvePayrollRun(
        tenantContext!,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.run.approved",
          resourceType: "payroll_run",
          resourceId: params.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PayrollRunResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Approve payroll run",
        description:
          "Approve a payroll run that is in review status. Records the approver and timestamp.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /runs/:id/export — Export payroll data
  .post(
    "/runs/:id/export",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PayrollPluginContext;

      const typedBody = body as unknown as ExportPayroll;
      const result = await payrollService.exportPayrollData(
        tenantContext!,
        params.id,
        typedBody.format
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.run.exported",
          resourceType: "payroll_run",
          resourceId: params.id,
          metadata: {
            format: typedBody.format,
            filename: result.data!.filename,
            requestId,
          },
        });
      }

      // Set appropriate content type and disposition headers
      set.headers["content-type"] = result.data!.contentType;
      set.headers["content-disposition"] =
        `attachment; filename="${result.data!.filename}"`;

      return result.data!.content;
    },
    {
      beforeHandle: [requirePermission("payroll:export", "read")],
      params: IdParamsSchema,
      body: ExportPayrollSchema,
      response: {
        200: t.String(),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Export payroll data",
        description:
          "Export payroll run data as CSV or JSON for external payroll provider integration.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Tax Details Routes
  // ===========================================================================

  // PUT /employees/:id/tax-details — Update tax details
  .put(
    "/employees/:id/tax-details",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PayrollPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.updateTaxDetails(
        tenantContext!,
        params.id,
        body as unknown as UpsertTaxDetails,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.tax_details.updated",
          resourceType: "employee_tax_details",
          resourceId: result.data!.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: {
            employeeId: params.id,
            idempotencyKey,
            requestId,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:tax_details", "write")],
      params: EmployeeIdParamsSchema,
      body: UpsertTaxDetailsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: TaxDetailsResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Update employee tax details",
        description:
          "Create a new effective-dated tax detail record for an employee. Validates against overlapping records. Stores tax code, NI number, NI category, and student loan plan.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:id/tax-details — Get tax details
  .get(
    "/employees/:id/tax-details",
    async (ctx) => {
      const { payrollService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const result = await payrollService.getTaxDetails(
        tenantContext!,
        params.id
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:tax_details", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Object({
          current: t.Union([TaxDetailsResponseSchema, t.Null()]),
          history: t.Array(TaxDetailsResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get employee tax details",
        description:
          "Get current and historical tax details for an employee, including tax code, NI number, NI category, and student loan plan.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Payslip Route
  // ===========================================================================

  // GET /employees/:id/payslips/:runId — Get payslip data
  .get(
    "/employees/:id/payslips/:runId",
    async (ctx) => {
      const { payrollService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const result = await payrollService.getPayslipData(
        tenantContext!,
        params.id,
        params.runId
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:payslips", "read")],
      params: PayslipParamsSchema,
      response: {
        200: t.Object({
          run: PayrollRunResponseSchema,
          line: PayrollLineResponseSchema,
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get employee payslip",
        description:
          "Get individual payslip data for an employee from a specific payroll run.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PayrollRoutes = typeof payrollRoutes;
