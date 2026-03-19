/**
 * Reports Module - Elysia Routes
 *
 * API endpoints for the reporting engine: CRUD, execution, export,
 * field catalog, favourites, scheduling, and system templates.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { getHttpStatus } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { ReportsRepository } from "./repository";
import { ReportsService } from "./service";
import {
  CreateReportSchema,
  UpdateReportSchema,
  ExecuteReportSchema,
  ScheduleReportSchema,
  ShareReportSchema,
  IdParamsSchema,
  PaginationQuerySchema,
  FieldValuesParamsSchema,
  ExportFormatParamsSchema,
  CreateReportScheduleSchema,
  UpdateReportScheduleSchema,
  ScheduleListQuerySchema,
} from "./schemas";

// =============================================================================
// Route Context
// =============================================================================

interface ReportsPluginContext {
  reportsService: ReportsService;
  tenantContext: { tenantId: string; userId?: string } | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface ReportsRouteContext extends ReportsPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

const errorStatusMap: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_CONFIG: 400,
  FIELD_NOT_FOUND: 404,
  EXECUTION_FAILED: 500,
};

function mapErrorToStatus(code: string): number {
  return getHttpStatus(code, errorStatusMap);
}

// =============================================================================
// Routes
// =============================================================================

// Lazily-initialised service (created once per request from plugin-injected db)
function getService(ctx: any): ReportsService {
  if (!ctx._reportsService) {
    const repository = new ReportsRepository(ctx.db);
    ctx._reportsService = new ReportsService(ctx.db, repository);
  }
  return ctx._reportsService;
}

export const reportsRoutes = new Elysia({ prefix: "/reports" })

  // =========================================================================
  // Field Catalog
  // =========================================================================

  .get(
    "/fields",
    async (ctx) => {
      const { tenantContext, requestId } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getFieldCatalog(tenantContext);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      const { fields, categories } = result.data!;
      return {
        fields: fields.map((f) => ({
          fieldKey: f.fieldKey,
          displayName: f.displayName,
          description: f.description,
          category: f.category,
          dataType: f.dataType,
          enumValues: f.enumValues,
          isFilterable: f.isFilterable,
          isSortable: f.isSortable,
          isGroupable: f.isGroupable,
          isAggregatable: f.isAggregatable,
          supportedAggregations: f.supportedAggregations ?? [],
          filterOperators: f.filterOperators,
          isPii: f.isPii,
          isSensitive: f.isSensitive,
          isCalculated: f.isCalculated,
          displayOrder: f.displayOrder,
          columnWidth: f.columnWidth,
          textAlignment: f.textAlignment,
          isDefaultVisible: f.isDefaultVisible,
        })),
        categories,
      };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      detail: { tags: ["Reports"], summary: "Get available report fields" },
    }
  )

  .get(
    "/fields/categories",
    async (ctx) => {
      const { tenantContext, requestId } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getFieldCatalog(tenantContext);
      if (!result.success) {
        ctx.set.status = 500;
        return { error: { ...result.error, requestId } };
      }

      return { categories: result.data!.categories };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      detail: { tags: ["Reports"], summary: "Get field categories" },
    }
  )

  .get(
    "/fields/:fieldKey/values",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getFieldValues(tenantContext, params.fieldKey);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { values: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      detail: { tags: ["Reports"], summary: "Get distinct values for a field" },
    }
  )

  // =========================================================================
  // System Templates
  // =========================================================================

  .get(
    "/templates",
    async (ctx) => {
      const { tenantContext, requestId } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.listSystemTemplates(tenantContext);
      if (!result.success) {
        ctx.set.status = 500;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      detail: { tags: ["Reports"], summary: "List system report templates" },
    }
  )

  .post(
    "/templates/:id/create",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.createFromTemplate(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      ctx.set.status = 201;
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "create")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Create report from template" },
    }
  )

  // =========================================================================
  // Favourites
  // =========================================================================

  .get(
    "/favourites",
    async (ctx) => {
      const { tenantContext, requestId } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.listFavourites(tenantContext);
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      detail: { tags: ["Reports"], summary: "Get favourite reports" },
    }
  )

  // =========================================================================
  // Scheduled Reports
  // =========================================================================

  .get(
    "/scheduled",
    async (ctx) => {
      const { tenantContext, requestId } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.listReports(tenantContext, { status: "published" });
      if (!result.success) {
        ctx.set.status = 500;
        return { error: { ...result.error, requestId } };
      }

      // Filter to only scheduled reports
      const scheduled = (result.data?.items ?? []).filter((r) => r.isScheduled);
      return { data: scheduled };
    },
    {
      beforeHandle: [requirePermission("reports", "schedule")],
      detail: { tags: ["Reports"], summary: "List scheduled reports" },
    }
  )

  // =========================================================================
  // Report CRUD
  // =========================================================================

  .get(
    "/",
    async (ctx) => {
      const { tenantContext, requestId, query } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.listReports(tenantContext, query);
      if (!result.success) {
        ctx.set.status = 500;
        return { error: { ...result.error, requestId } };
      }

      return {
        data: result.data!.items,
        total: result.data!.total,
        nextCursor: result.data!.nextCursor,
      };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      query: PaginationQuerySchema,
      detail: { tags: ["Reports"], summary: "List reports" },
    }
  )

  .post(
    "/",
    async (ctx) => {
      const { tenantContext, requestId, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.createReport(tenantContext, body as any);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      ctx.set.status = 201;
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "create")],
      body: CreateReportSchema,
      detail: { tags: ["Reports"], summary: "Create report" },
    }
  )

  .get(
    "/:id",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Get report by ID" },
    }
  )

  .put(
    "/:id",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.updateReport(tenantContext, params.id, body as any);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "edit")],
      params: IdParamsSchema,
      body: UpdateReportSchema,
      detail: { tags: ["Reports"], summary: "Update report" },
    }
  )

  .delete(
    "/:id",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.deleteReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { success: true };
    },
    {
      beforeHandle: [requirePermission("reports", "delete")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Delete report" },
    }
  )

  .post(
    "/:id/duplicate",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.duplicateReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      ctx.set.status = 201;
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "create")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Duplicate report" },
    }
  )

  .post(
    "/:id/publish",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.publishReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "edit")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Publish report" },
    }
  )

  .post(
    "/:id/archive",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.archiveReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "edit")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Archive report" },
    }
  )

  // =========================================================================
  // Report Execution
  // =========================================================================

  .post(
    "/:id/execute",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.executeReport(tenantContext, params.id, body as any);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      body: ExecuteReportSchema,
      detail: { tags: ["Reports"], summary: "Execute report" },
    }
  )

  .post(
    "/:id/execute/preview",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.executeReport(
        tenantContext,
        params.id,
        body as any,
        { preview: true }
      );
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      body: ExecuteReportSchema,
      detail: { tags: ["Reports"], summary: "Preview report (25 rows)" },
    }
  )

  .get(
    "/:id/executions",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getExecutionHistory(tenantContext, params.id);
      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Get execution history" },
    }
  )

  // =========================================================================
  // Export
  // =========================================================================

  .post(
    "/:id/export/:format",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const format = (params as any).format as "csv" | "xlsx" | "pdf";
      const result = await reportsService.exportReport(
        tenantContext,
        params.id,
        format,
        body as any
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      const { content, contentType, filename } = result.data!;
      ctx.set.status = 200;
      return new Response(content, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: ExportFormatParamsSchema,
      detail: { tags: ["Reports"], summary: "Export report data" },
    }
  )

  // =========================================================================
  // Favourites (instance-level)
  // =========================================================================

  .post(
    "/:id/favourite",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      await reportsService.addFavourite(tenantContext, params.id);
      return { success: true };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Add to favourites" },
    }
  )

  .delete(
    "/:id/favourite",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      await reportsService.removeFavourite(tenantContext, params.id);
      return { success: true };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Remove from favourites" },
    }
  )

  // =========================================================================
  // Sharing
  // =========================================================================

  .post(
    "/:id/share",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.shareReport(tenantContext, params.id, body as any);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "share")],
      params: IdParamsSchema,
      body: ShareReportSchema,
      detail: { tags: ["Reports"], summary: "Share report" },
    }
  )

  // =========================================================================
  // Scheduling
  // =========================================================================

  .get(
    "/:id/schedule",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.getReport(tenantContext, params.id);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      const report = result.data!;
      return {
        data: {
          isScheduled: report.isScheduled,
          frequency: report.scheduleFrequency,
          cron: report.scheduleCron,
          time: report.scheduleTime,
          dayOfWeek: report.scheduleDayOfWeek,
          dayOfMonth: report.scheduleDayOfMonth,
          recipients: report.scheduleRecipients,
          exportFormat: report.scheduleExportFormat,
          lastScheduledRun: report.lastScheduledRun,
          nextScheduledRun: report.nextScheduledRun,
        },
      };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Get report schedule" },
    }
  )

  .post(
    "/:id/schedule",
    async (ctx) => {
      const { tenantContext, requestId, params, body } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await reportsService.setSchedule(tenantContext, params.id, body as any);
      if (!result.success) {
        const status = mapErrorToStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return { data: result.data };
    },
    {
      beforeHandle: [requirePermission("reports", "schedule")],
      params: IdParamsSchema,
      body: ScheduleReportSchema,
      detail: { tags: ["Reports"], summary: "Set report schedule" },
    }
  )

  .delete(
    "/:id/schedule",
    async (ctx) => {
      const { tenantContext, requestId, params } = ctx as any;
      const reportsService = getService(ctx);
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      await reportsService.removeSchedule(tenantContext, params.id);
      return { success: true };
    },
    {
      beforeHandle: [requirePermission("reports", "schedule")],
      params: IdParamsSchema,
      detail: { tags: ["Reports"], summary: "Remove report schedule" },
    }
  );

// =============================================================================
// Report Schedule CRUD Routes (dedicated table)
// =============================================================================

export const reportScheduleRoutes = new Elysia({ prefix: "/reports/schedules" })

  .get("/", async (ctx) => {
    const { tenantContext, requestId, query } = ctx as any;
    const reportsService = getService(ctx);
    if (!tenantContext) { ctx.set.status = 401; return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } }; }
    const result = await reportsService.listSchedules(tenantContext, query);
    if (!result.success) { ctx.set.status = 500; return { error: { ...result.error, requestId } }; }
    return { data: result.data!.items, total: result.data!.total, nextCursor: result.data!.nextCursor };
  }, {
    beforeHandle: [requirePermission("reports", "read")],
    query: ScheduleListQuerySchema,
    detail: { tags: ["Report Schedules"], summary: "List report schedules" },
  })

  .post("/", async (ctx) => {
    const { tenantContext, requestId, body } = ctx as any;
    const reportsService = getService(ctx);
    if (!tenantContext) { ctx.set.status = 401; return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } }; }
    const result = await reportsService.createSchedule(tenantContext, body as any);
    if (!result.success) { const status = mapErrorToStatus(result.error!.code); ctx.set.status = status; return { error: { ...result.error, requestId } }; }
    ctx.set.status = 201;
    return { data: result.data };
  }, {
    beforeHandle: [requirePermission("reports", "schedule")],
    body: CreateReportScheduleSchema,
    detail: { tags: ["Report Schedules"], summary: "Create report schedule" },
  })

  .get("/:id", async (ctx) => {
    const { tenantContext, requestId, params } = ctx as any;
    const reportsService = getService(ctx);
    if (!tenantContext) { ctx.set.status = 401; return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } }; }
    const result = await reportsService.getSchedule(tenantContext, params.id);
    if (!result.success) { const status = mapErrorToStatus(result.error!.code); ctx.set.status = status; return { error: { ...result.error, requestId } }; }
    return { data: result.data };
  }, {
    beforeHandle: [requirePermission("reports", "read")],
    params: IdParamsSchema,
    detail: { tags: ["Report Schedules"], summary: "Get report schedule by ID" },
  })

  .put("/:id", async (ctx) => {
    const { tenantContext, requestId, params, body } = ctx as any;
    const reportsService = getService(ctx);
    if (!tenantContext) { ctx.set.status = 401; return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } }; }
    const result = await reportsService.updateSchedule(tenantContext, params.id, body as any);
    if (!result.success) { const status = mapErrorToStatus(result.error!.code); ctx.set.status = status; return { error: { ...result.error, requestId } }; }
    return { data: result.data };
  }, {
    beforeHandle: [requirePermission("reports", "schedule")],
    params: IdParamsSchema,
    body: UpdateReportScheduleSchema,
    detail: { tags: ["Report Schedules"], summary: "Update report schedule" },
  })

  .delete("/:id", async (ctx) => {
    const { tenantContext, requestId, params } = ctx as any;
    const reportsService = getService(ctx);
    if (!tenantContext) { ctx.set.status = 401; return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } }; }
    const result = await reportsService.deleteSchedule(tenantContext, params.id);
    if (!result.success) { const status = mapErrorToStatus(result.error!.code); ctx.set.status = status; return { error: { ...result.error, requestId } }; }
    return { success: true };
  }, {
    beforeHandle: [requirePermission("reports", "schedule")],
    params: IdParamsSchema,
    detail: { tags: ["Report Schedules"], summary: "Delete report schedule" },
  });
