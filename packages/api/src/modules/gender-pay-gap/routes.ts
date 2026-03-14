/**
 * Gender Pay Gap Module - Elysia Routes
 *
 * Defines the API endpoints for UK Gender Pay Gap reporting.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 *   POST   /api/v1/gender-pay-gap/reports             — Generate new report for a year
 *   GET    /api/v1/gender-pay-gap/reports              — List reports
 *   GET    /api/v1/gender-pay-gap/reports/:id          — Get report detail with all metrics
 *   PATCH  /api/v1/gender-pay-gap/reports/:id/publish  — Mark as published
 *   GET    /api/v1/gender-pay-gap/dashboard            — Summary dashboard with trends
 *
 * Permission model:
 *   - analytics: read  (list, get report, dashboard)
 *   - analytics: write (generate/calculate, publish reports)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { GenderPayGapRepository } from "./repository";
import { GenderPayGapService } from "./service";
import {
  GenerateReportSchema,
  CalculateGpgSchema,
  GpgReportResponseSchema,
  GpgReportListResponseSchema,
  GpgReportFiltersSchema,
  GpgDashboardResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type GenerateReport,
  type CalculateGpg,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & GpgPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface GpgPluginContext {
  gpgService: GenderPayGapService;
  gpgRepository: GenderPayGapRepository;
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
 * Module-specific error codes mapping
 */
const gpgErrorStatusMap: Record<string, number> = {
  INSUFFICIENT_DATA: 400,
};

// =============================================================================
// Route Definitions
// =============================================================================

/**
 * Create Gender Pay Gap routes plugin
 */
export const genderPayGapRoutes = new Elysia({ prefix: "/gender-pay-gap", name: "gender-pay-gap-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new GenderPayGapRepository(db);
    const service = new GenderPayGapService(repository, db);
    return { gpgService: service, gpgRepository: repository };
  })

  // ===========================================================================
  // POST /reports - Generate a new GPG report for a year
  // ===========================================================================
  .post(
    "/reports",
    async (ctx) => {
      const { gpgService, tenantContext, body, set, audit } = ctx as typeof ctx & GpgPluginContext;
      const typedBody = body as GenerateReport;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const result = await gpgService.generateReport(
          tenantContext,
          typedBody
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, gpgErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: AuditActions.REPORT_GENERATED,
            resourceType: "gender_pay_gap_report",
            resourceId: result.data!.id,
            newValues: {
              reporting_year: typedBody.reporting_year,
              sector: typedBody.sector || "private",
              total_employees: result.data!.total_employees,
              mean_hourly_pay_gap: result.data!.mean_hourly_pay_gap,
              median_hourly_pay_gap: result.data!.median_hourly_pay_gap,
              mean_bonus_gap: result.data!.mean_bonus_gap,
              median_bonus_gap: result.data!.median_bonus_gap,
            },
          });
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      body: GenerateReportSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("analytics", "write")],
      response: {
        201: GpgReportResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "Generate gender pay gap report",
        description:
          "Generates a gender pay gap report for the given reporting year. " +
          "Automatically determines snapshot date from sector (private: 5 April, public: 31 March). " +
          "Calculates all 6 required GPG metrics: mean/median hourly pay gap, " +
          "mean/median bonus gap, bonus proportions, and pay quartile distribution. " +
          "If a non-published report already exists for the reporting year, it will be recalculated.",
      },
    }
  )

  // ===========================================================================
  // POST /calculate - Calculate GPG with explicit snapshot date (advanced)
  // ===========================================================================
  .post(
    "/calculate",
    async (ctx) => {
      const { gpgService, tenantContext, body, set, audit } = ctx as typeof ctx & GpgPluginContext;
      const typedBody = body as CalculateGpg;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const result = await gpgService.calculateReport(
          tenantContext,
          typedBody
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, gpgErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: AuditActions.REPORT_GENERATED,
            resourceType: "gender_pay_gap_report",
            resourceId: result.data!.id,
            newValues: {
              reporting_year: typedBody.reporting_year,
              snapshot_date: typedBody.snapshot_date,
              total_employees: result.data!.total_employees,
              mean_hourly_pay_gap: result.data!.mean_hourly_pay_gap,
              median_hourly_pay_gap: result.data!.median_hourly_pay_gap,
              mean_bonus_gap: result.data!.mean_bonus_gap,
              median_bonus_gap: result.data!.median_bonus_gap,
            },
          });
        }

        set.status = 201;
        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      body: CalculateGpgSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("analytics", "write")],
      response: {
        201: GpgReportResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "Calculate gender pay gap (advanced)",
        description:
          "Calculates the gender pay gap report for an explicit snapshot date. " +
          "Use this for custom analysis. For standard UK reporting, use POST /reports instead. " +
          "Queries all employees active on the snapshot date with gender and compensation data. " +
          "If a non-published report already exists for the reporting year, it will be recalculated.",
      },
    }
  )

  // ===========================================================================
  // GET /reports - List gender pay gap reports
  // ===========================================================================
  .get(
    "/reports",
    async (ctx) => {
      const { gpgService, tenantContext, query, set } = ctx as typeof ctx & GpgPluginContext;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const { cursor, limit: rawLimit, ...filters } = query;
        const limit = rawLimit !== undefined ? Number(rawLimit) : undefined;
        const result = await gpgService.listReports(
          tenantContext,
          filters,
          { cursor, limit }
        );
        return result;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      query: t.Intersect([PaginationQuerySchema, GpgReportFiltersSchema]),
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: GpgReportListResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "List gender pay gap reports",
        description:
          "Returns a paginated list of gender pay gap reports for the current tenant. " +
          "Supports filtering by status and reporting year. " +
          "Use for historical report browsing and trend overview.",
      },
    }
  )

  // ===========================================================================
  // GET /dashboard - Summary dashboard with trends
  // ===========================================================================
  .get(
    "/dashboard",
    async (ctx) => {
      const { gpgService, tenantContext, set } = ctx as typeof ctx & GpgPluginContext;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const result = await gpgService.getDashboard(tenantContext);

        if (!result.success) {
          set.status = 500;
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: GpgDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "Gender pay gap dashboard",
        description:
          "Returns a dashboard summary with the latest report, report counts, " +
          "year-over-year trend data for all key metrics (mean/median pay gap, " +
          "mean/median bonus gap, upper quartile female representation), " +
          "the 250+ employee reporting threshold check, and current headcount.",
      },
    }
  )

  // ===========================================================================
  // GET /reports/:id - Get a single report with all metrics
  // ===========================================================================
  .get(
    "/reports/:id",
    async (ctx) => {
      const { gpgService, tenantContext, params, set } = ctx as typeof ctx & GpgPluginContext;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const result = await gpgService.getReport(tenantContext, params.id);

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code);
          return { error: result.error };
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("analytics", "read")],
      response: {
        200: GpgReportResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "Get gender pay gap report",
        description:
          "Returns a single gender pay gap report by ID with all 6 required metrics: " +
          "mean/median hourly pay gap, mean/median bonus gap, " +
          "male/female bonus proportions, and pay quartile breakdown.",
      },
    }
  )

  // ===========================================================================
  // PATCH /reports/:id/publish - Publish a calculated report
  // ===========================================================================
  .patch(
    "/reports/:id/publish",
    async (ctx) => {
      const { gpgService, tenantContext, params, set, audit } = ctx as typeof ctx & GpgPluginContext;

      try {
        if (!tenantContext) {
          set.status = 401;
          return { error: { code: "UNAUTHORIZED", message: "Tenant context required" } };
        }

        const result = await gpgService.publishReport(
          tenantContext,
          params.id
        );

        if (!result.success) {
          set.status = mapErrorToStatus(result.error!.code, gpgErrorStatusMap);
          return { error: result.error };
        }

        // Audit log
        if (audit) {
          await audit.log({
            action: AuditActions.REPORT_EXPORTED,
            resourceType: "gender_pay_gap_report",
            resourceId: result.data!.id,
            newValues: {
              action: "publish",
              reporting_year: result.data!.reporting_year,
              published_at: result.data!.published_at,
              mean_hourly_pay_gap: result.data!.mean_hourly_pay_gap,
              median_hourly_pay_gap: result.data!.median_hourly_pay_gap,
              mean_bonus_gap: result.data!.mean_bonus_gap,
              median_bonus_gap: result.data!.median_bonus_gap,
            },
          });
        }

        return result.data;
      } catch (error: unknown) {
        set.status = 500;
        const message = error instanceof Error ? error.message : "Internal error";
        return { error: { code: "INTERNAL_ERROR", message } };
      }
    },
    {
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("analytics", "write")],
      response: {
        200: GpgReportResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Gender Pay Gap"],
        summary: "Publish gender pay gap report",
        description:
          "Publishes a calculated gender pay gap report. " +
          "Only reports in 'calculated' status can be published. " +
          "Once published, the report cannot be modified or recalculated. " +
          "Records the publish timestamp for compliance audit trail.",
      },
    }
  );

export type GenderPayGapRoutes = typeof genderPayGapRoutes;
