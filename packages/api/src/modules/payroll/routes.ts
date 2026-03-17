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
  LockPayrollPeriodSchema,
  UnlockPayrollPeriodSchema,
  PeriodLockStatusQuerySchema,
  PeriodLockResponseSchema,
  JournalEntryResponseSchema,
  GenerateJournalEntriesSchema,
  JournalEntriesQuerySchema,
  JournalEntriesListResponseSchema,
  // Types
  type CreatePayrollRun,
  type UpsertTaxDetails,
  type ExportPayroll,
  type PayrollRunFilters,
  type LockPayrollPeriod,
  type UnlockPayrollPeriod,
  type PeriodLockStatusQuery,
  type GenerateJournalEntries,
  type JournalEntriesQuery,
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
  )

  // ===========================================================================
  // Pay Schedules
  // ===========================================================================

  .get(
    "/pay-schedules",
    async (ctx) => {
      const { payrollService, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const result = await payrollService.getPaySchedules(tenantContext!);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      detail: { tags: ["Payroll"], summary: "List pay schedules" },
    }
  )

  .post(
    "/pay-schedules",
    async (ctx) => {
      const { payrollService, tenantContext, body, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const { name, frequency, payDayOfWeek, payDayOfMonth, taxWeekStart, isDefault } = body as any;
      const result = await payrollService.createPaySchedule(tenantContext!, {
        name, frequency, payDayOfWeek, payDayOfMonth, taxWeekStart, isDefault,
      });
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      detail: { tags: ["Payroll"], summary: "Create pay schedule" },
    }
  )

  .get(
    "/pay-schedules/:id",
    async (ctx) => {
      const { payrollService, tenantContext, params, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const result = await payrollService.getPayScheduleById(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Payroll"], summary: "Get pay schedule by ID" },
    }
  )

  .put(
    "/pay-schedules/:id",
    async (ctx) => {
      const { payrollService, tenantContext, params, body, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const result = await payrollService.updatePaySchedule(tenantContext!, params.id, body as any);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      detail: { tags: ["Payroll"], summary: "Update pay schedule" },
    }
  )

  // ===========================================================================
  // Employee Pay Assignments
  // ===========================================================================

  .post(
    "/employees/:id/pay-assignment",
    async (ctx) => {
      const { payrollService, tenantContext, params, body, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const { payScheduleId, effectiveFrom, effectiveTo } = body as any;
      const result = await payrollService.assignEmployeeToSchedule(tenantContext!, {
        employeeId: params.id,
        payScheduleId,
        effectiveFrom,
        effectiveTo,
      });
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      detail: { tags: ["Payroll"], summary: "Assign employee to pay schedule" },
    }
  )

  .get(
    "/employees/:id/pay-assignments",
    async (ctx) => {
      const { payrollService, tenantContext, params, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const result = await payrollService.getEmployeePayAssignments(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Payroll"], summary: "Get employee pay schedule assignments" },
    }
  )

  .get(
    "/employees/:id/pay-assignment/current",
    async (ctx) => {
      const { payrollService, tenantContext, params, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;
      const result = await payrollService.getCurrentPayAssignment(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Payroll"], summary: "Get current pay schedule assignment for employee" },
    }
  )

  // ===========================================================================
  // Payroll Period Lock Routes
  // ===========================================================================

  // POST /period-locks — Lock a payroll period
  .post(
    "/period-locks",
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

      const result = await payrollService.lockPayrollPeriod(
        tenantContext!,
        body as unknown as LockPayrollPeriod,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.period.locked",
          resourceType: "payroll_period_lock",
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
      body: LockPayrollPeriodSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PeriodLockResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Lock a payroll period",
        description:
          "Lock a payroll period to prevent modifications to time entries, absence records, and compensation changes within the locked date range. Only one active lock can exist per date range.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /period-locks/:id/unlock — Unlock a payroll period (with mandatory reason)
  .post(
    "/period-locks/:id/unlock",
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

      const result = await payrollService.unlockPayrollPeriod(
        tenantContext!,
        params.id,
        body as unknown as UnlockPayrollPeriod,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.period.unlocked",
          resourceType: "payroll_period_lock",
          resourceId: result.data!.id,
          oldValues: { is_locked: true },
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: {
            unlock_reason: (body as unknown as UnlockPayrollPeriod).unlock_reason,
            idempotencyKey,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      body: UnlockPayrollPeriodSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PeriodLockResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Unlock a payroll period",
        description:
          "Unlock a previously locked payroll period. Requires a mandatory reason for audit purposes. Once unlocked, modifications to data within the period will be permitted again.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /period-locks — Get payroll period lock status
  .get(
    "/period-locks",
    async (ctx) => {
      const { payrollService, query, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const filters = {
        periodStart: query.period_start as string | undefined,
        periodEnd: query.period_end as string | undefined,
        activeOnly: query.active_only === "true",
      };

      const result = await payrollService.getPeriodLockStatus(
        tenantContext!,
        filters
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      query: t.Partial(PeriodLockStatusQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(PeriodLockResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get payroll period lock status",
        description:
          "List payroll period locks with optional filters. Use active_only=true to see only currently locked periods. Optionally filter by period_start and period_end to find locks overlapping with a specific date range.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /period-locks/:id — Get a single period lock by ID
  .get(
    "/period-locks/:id",
    async (ctx) => {
      const { payrollService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const result = await payrollService.getPeriodLockById(
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
        200: PeriodLockResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get period lock by ID",
        description: "Get a single payroll period lock record by its ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Journal Entry Routes (TODO-233)
  // ===========================================================================

  // POST /runs/:id/journal-entries — Generate journal entries from a payroll run
  .post(
    "/runs/:id/journal-entries",
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
      const typedBody = body as unknown as GenerateJournalEntries;

      const result = await payrollService.generateJournalEntries(
        tenantContext!,
        params.id,
        typedBody.cost_centre_id ?? null,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      if (audit) {
        await audit.log({
          action: "payroll.journal_entries.generated",
          resourceType: "payroll_run",
          resourceId: params.id,
          newValues: {
            entryCount: result.data!.length,
            costCentreId: typedBody.cost_centre_id ?? null,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      body: GenerateJournalEntriesSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: t.Object({ items: t.Array(JournalEntryResponseSchema) }),
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Generate journal entries from payroll run",
        description:
          "Generate double-entry accounting journal entries from an approved, submitted, or paid payroll run. " +
          "Creates debit entries for salary expenses, employer NI, and employer pension, plus credit entries " +
          "for PAYE tax, NI liabilities, pension liabilities, student loan, and net wages payable. " +
          "Journal entries can only be generated once per payroll run.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /runs/:id/journal-entries — Get journal entries for a specific payroll run
  .get(
    "/runs/:id/journal-entries",
    async (ctx) => {
      const { payrollService, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const result = await payrollService.getJournalEntriesByRunId(
        tenantContext!,
        params.id
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      response: {
        200: t.Object({ items: t.Array(JournalEntryResponseSchema) }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get journal entries for a payroll run",
        description:
          "Retrieve all journal entries generated for a specific payroll run. " +
          "Returns an empty array if no journals have been generated yet.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /journal-entries — List journal entries with filters (by period, account, cost centre)
  .get(
    "/journal-entries",
    async (ctx) => {
      const { payrollService, query, tenantContext, requestId, set } =
        ctx as typeof ctx & PayrollPluginContext;

      const filters: JournalEntriesQuery = {
        payroll_run_id: query.payroll_run_id,
        period_start: query.period_start,
        period_end: query.period_end,
        account_code: query.account_code,
        cost_centre_id: query.cost_centre_id,
        cursor: query.cursor,
        limit: query.limit !== undefined ? Number(query.limit) : undefined,
      };

      const result = await payrollService.listJournalEntries(
        tenantContext!,
        filters
      );

      if (!result.success) {
        return mapServiceError(result.error!, set, requestId, payrollErrorOverrides);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      query: t.Partial(JournalEntriesQuerySchema),
      response: {
        200: JournalEntriesListResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List journal entries",
        description:
          "List payroll journal entries with optional filters for payroll_run_id, " +
          "date range (period_start/period_end), account_code, and cost_centre_id. " +
          "Returns entries with a debit/credit summary and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PayrollRoutes = typeof payrollRoutes;
