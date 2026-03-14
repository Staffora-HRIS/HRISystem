/**
 * Reports Module - Service Layer
 *
 * Business logic for report CRUD, execution, field catalog access,
 * and permission enforcement.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { ReportsRepository, FieldCatalogRow, ReportDefinitionRow } from "./repository";
import { ReportQueryEngine } from "./query-engine";
import type { QueryResult } from "./query-engine";
import type {
  CreateReport,
  UpdateReport,
  ExecuteReport,
  ScheduleReport,
  ShareReport,
  PaginationQuery,
  ReportConfig,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export type PaginatedServiceResult<T> = ServiceResult<{
  items: T[];
  total: number;
  nextCursor?: string;
}>;

// =============================================================================
// Service
// =============================================================================

export class ReportsService {
  private fieldCatalogCache: FieldCatalogRow[] | null = null;
  private fieldCatalogCacheTime: number = 0;
  private readonly CATALOG_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

  constructor(
    private db: DatabaseClient,
    private repository: ReportsRepository
  ) {}

  // =========================================================================
  // Field Catalog
  // =========================================================================

  async getFieldCatalog(
    ctx: TenantContext,
    userPermissions?: Set<string>
  ): Promise<ServiceResult<{
    fields: FieldCatalogRow[];
    categories: Array<{ key: string; label: string; fieldCount: number }>;
  }>> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Use in-memory cache for the catalog (it rarely changes)
      let catalog: FieldCatalogRow[];
      if (
        this.fieldCatalogCache &&
        Date.now() - this.fieldCatalogCacheTime < this.CATALOG_CACHE_TTL
      ) {
        catalog = this.fieldCatalogCache;
      } else {
        catalog = await this.repository.getFieldCatalog(tx);
        this.fieldCatalogCache = catalog;
        this.fieldCatalogCacheTime = Date.now();
      }

      // Filter by user permissions
      let filteredFields = catalog;
      if (userPermissions) {
        filteredFields = catalog.filter((field) => {
          // Check required permission
          if (field.requiredPermission && !userPermissions.has(field.requiredPermission)) {
            return false;
          }
          // Check PII access
          if (field.isPii && !userPermissions.has("employees:read_pii")) {
            return false;
          }
          return true;
        });
      }

      // Build categories
      const categoryMap = new Map<string, number>();
      for (const field of filteredFields) {
        categoryMap.set(
          field.category,
          (categoryMap.get(field.category) ?? 0) + 1
        );
      }

      const categoryLabels: Record<string, string> = {
        personal: "Personal",
        employment: "Employment",
        position: "Position",
        organization: "Organisation",
        compensation: "Compensation",
        time_attendance: "Time & Attendance",
        leave_absence: "Leave & Absence",
        performance: "Performance",
        learning: "Learning & Development",
        benefits: "Benefits",
        compliance: "Compliance",
        recruitment: "Recruitment",
        onboarding: "Onboarding",
        documents: "Documents",
        cases: "Cases",
        payroll: "Payroll",
        succession: "Succession",
        equipment: "Equipment",
        health_safety: "Health & Safety",
        gdpr: "Diversity & GDPR",
        disciplinary: "Disciplinary",
        workflow: "Workflow",
      };

      const categories = Array.from(categoryMap.entries())
        .map(([key, count]) => ({
          key,
          label: categoryLabels[key] ?? key,
          fieldCount: count,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      return {
        success: true,
        data: { fields: filteredFields, categories },
      };
    });
  }

  async getFieldValues(
    ctx: TenantContext,
    fieldKey: string
  ): Promise<ServiceResult<string[]>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const field = await this.repository.getFieldByKey(tx, fieldKey);
      if (!field) {
        return {
          success: false,
          error: { code: "FIELD_NOT_FOUND", message: `Field '${fieldKey}' not found in catalog` },
        };
      }

      const values = await this.repository.getFieldDistinctValues(tx, field);
      return { success: true, data: values };
    });
  }

  // =========================================================================
  // Report CRUD
  // =========================================================================

  async listReports(
    ctx: TenantContext,
    query: PaginationQuery
  ): Promise<PaginatedServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Ensure system templates exist for this tenant
      if (ctx.userId) {
        await this.repository.ensureSystemTemplatesSeeded(tx, ctx.tenantId, ctx.userId);
      }

      const { rows, total } = await this.repository.listReports(tx, ctx.userId!, {
        status: query.status,
        category: query.category,
        type: query.type,
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        cursor: query.cursor,
      });

      const nextCursor =
        rows.length > 0 ? rows[rows.length - 1].id : undefined;

      return {
        success: true,
        data: { items: rows, total, nextCursor },
      };
    });
  }

  async getReport(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.getReportById(tx, id);
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      // Check access: owner, shared, or public
      if (
        report.createdBy !== ctx.userId &&
        !report.isPublic &&
        !this.isSharedWith(report, ctx.userId!)
      ) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "You do not have access to this report" },
        };
      }

      return { success: true, data: report };
    });
  }

  async createReport(
    ctx: TenantContext,
    data: CreateReport
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      // Validate field keys in config
      const validation = await this.validateReportConfig(tx, data.config);
      if (!validation.valid) {
        return {
          success: false,
          error: { code: "INVALID_CONFIG", message: validation.message! },
        };
      }

      const report = await this.repository.createReport(tx, ctx.tenantId, ctx.userId!, {
        name: data.name,
        description: data.description,
        reportType: data.report_type,
        category: data.category,
        tags: data.tags,
        config: data.config as unknown as Record<string, unknown>,
        chartType: data.chart_type,
        chartConfig: data.chart_config,
        isPublic: data.is_public,
      });

      // Outbox event
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${ctx.tenantId}, 'report', ${report.id},
          'reports.report.created',
          ${JSON.stringify({ reportId: report.id, name: report.name, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return { success: true, data: report };
    });
  }

  async updateReport(
    ctx: TenantContext,
    id: string,
    data: UpdateReport
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getReportById(tx, id);
      if (!existing) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      // Only owner or shared-with-edit can update
      if (existing.createdBy !== ctx.userId && !this.hasEditAccess(existing, ctx.userId!)) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "You cannot edit this report" },
        };
      }

      // Cannot edit system reports
      if (existing.isSystem) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "System reports cannot be edited. Duplicate it instead." },
        };
      }

      // Validate config if provided
      if (data.config) {
        const validation = await this.validateReportConfig(tx, data.config);
        if (!validation.valid) {
          return {
            success: false,
            error: { code: "INVALID_CONFIG", message: validation.message! },
          };
        }
      }

      const updated = await this.repository.updateReport(
        tx,
        id,
        data as unknown as Record<string, unknown>
      );

      return { success: true, data: updated! };
    });
  }

  async deleteReport(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getReportById(tx, id);
      if (!existing) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      if (existing.createdBy !== ctx.userId) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "Only the report owner can delete it" },
        };
      }

      if (existing.isSystem) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "System reports cannot be deleted" },
        };
      }

      await this.repository.deleteReport(tx, id);
      return { success: true };
    });
  }

  async duplicateReport(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getReportById(tx, id);
      if (!existing) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      const newName = `${existing.name} (Copy)`;
      const duplicate = await this.repository.duplicateReport(
        tx,
        id,
        ctx.tenantId,
        ctx.userId!,
        newName
      );

      return { success: true, data: duplicate! };
    });
  }

  async publishReport(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.updateReportStatus(tx, id, "published");
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }
      return { success: true, data: report };
    });
  }

  async archiveReport(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.updateReportStatus(tx, id, "archived");
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }
      return { success: true, data: report };
    });
  }

  // =========================================================================
  // Report Execution
  // =========================================================================

  async executeReport(
    ctx: TenantContext,
    id: string,
    params: ExecuteReport = {},
    options: { preview?: boolean } = {}
  ): Promise<ServiceResult<QueryResult & { executionId: string }>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.getReportById(tx, id);
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      // Load field catalog
      const catalog = await this.repository.getFieldCatalog(tx);
      const engine = new ReportQueryEngine(catalog);

      const config = report.config as unknown as ReportConfig;

      // Apply runtime parameters
      if (params.parameters && config.filters) {
        for (const filter of config.filters) {
          if (filter.is_parameter && params.parameters[filter.field_key] !== undefined) {
            filter.value = params.parameters[filter.field_key];
          }
        }
      }

      try {
        const result = await engine.execute(
          tx,
          {
            columns: config.columns,
            filters: config.filters,
            groupBy: config.groupBy,
            sortBy: config.sortBy,
            includeTerminated: config.includeTerminated,
            distinctEmployees: config.distinctEmployees,
            limit: options.preview ? 25 : config.limit,
          },
          {
            preview: options.preview,
          }
        );

        // Record execution
        const execution = await this.repository.createExecution(tx, {
          tenantId: ctx.tenantId,
          reportId: id,
          executedBy: ctx.userId!,
          executionMs: result.executionMs,
          rowCount: result.totalRows,
          parameters: params.parameters,
        });

        // Update run stats
        await this.repository.updateReportRunStats(tx, id, result.executionMs);

        return {
          success: true,
          data: { ...result, executionId: execution.id },
        };
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Query execution failed";

        // Record failed execution
        await this.repository.createExecution(tx, {
          tenantId: ctx.tenantId,
          reportId: id,
          executedBy: ctx.userId!,
          executionMs: 0,
          rowCount: 0,
          parameters: params.parameters,
          status: "failed",
          errorMessage: errorMsg,
        });

        return {
          success: false,
          error: { code: "EXECUTION_FAILED", message: errorMsg },
        };
      }
    });
  }

  async exportReport(
    ctx: TenantContext,
    id: string,
    format: "csv" | "xlsx" | "pdf",
    params: { parameters?: Record<string, unknown> } = {}
  ): Promise<ServiceResult<{ content: string; contentType: string; filename: string }>> {
    // Execute the full report (no row limit)
    const execResult = await this.executeReport(ctx, id, params);
    if (!execResult.success) return execResult as any;

    const { columns, rows } = execResult.data!;

    // Build filename from report definition
    const report = await this.db.withTransaction(ctx, async (tx) => {
      return this.repository.getReportById(tx, id);
    });
    const baseName = (report?.name ?? "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const dateSuffix = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const colHeaders = columns.map((c: any) => c.label ?? c.key);
      const colKeys = columns.map((c: any) => c.key ?? c.field_key);
      const headerRow = colHeaders
        .map((h: string) => `"${h.replace(/"/g, '""')}"`)
        .join(",");
      const dataRows = rows.map((row: any) =>
        colKeys
          .map((k: string) => {
            const val = row[k] ?? "";
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(",")
      );
      const csv = [headerRow, ...dataRows].join("\n");

      return {
        success: true,
        data: {
          content: csv,
          contentType: "text/csv",
          filename: `${baseName}-${dateSuffix}.csv`,
        },
      };
    }

    // For xlsx/pdf: return CSV as fallback (full xlsx/pdf generation requires
    // additional libraries like exceljs or puppeteer — can be added later)
    const colHeaders = columns.map((c: any) => c.label ?? c.key);
    const colKeys = columns.map((c: any) => c.key ?? c.field_key);
    const headerRow = colHeaders
      .map((h: string) => `"${h.replace(/"/g, '""')}"`)
      .join(",");
    const dataRows = rows.map((row: any) =>
      colKeys
        .map((k: string) => {
          const val = row[k] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [headerRow, ...dataRows].join("\n");
    const ext = format === "xlsx" ? "csv" : format;

    return {
      success: true,
      data: {
        content: csv,
        contentType: format === "xlsx" ? "text/csv" : "text/csv",
        filename: `${baseName}-${dateSuffix}.${ext}`,
      },
    };
  }

  async getExecutionHistory(
    ctx: TenantContext,
    reportId: string
  ): Promise<ServiceResult<unknown[]>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const executions = await this.repository.listExecutions(tx, reportId);
      return { success: true, data: executions };
    });
  }

  // =========================================================================
  // Favourites
  // =========================================================================

  async addFavourite(
    ctx: TenantContext,
    reportId: string
  ): Promise<ServiceResult<void>> {
    return this.db.withTransaction(ctx, async (tx) => {
      await this.repository.addFavourite(tx, ctx.tenantId, ctx.userId!, reportId);
      return { success: true };
    });
  }

  async removeFavourite(
    ctx: TenantContext,
    reportId: string
  ): Promise<ServiceResult<void>> {
    return this.db.withTransaction(ctx, async (tx) => {
      await this.repository.removeFavourite(tx, ctx.tenantId, ctx.userId!, reportId);
      return { success: true };
    });
  }

  async listFavourites(
    ctx: TenantContext
  ): Promise<ServiceResult<ReportDefinitionRow[]>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const favs = await this.repository.listFavourites(
        tx,
        ctx.tenantId,
        ctx.userId!
      );
      return { success: true, data: favs };
    });
  }

  // =========================================================================
  // Sharing
  // =========================================================================

  async shareReport(
    ctx: TenantContext,
    id: string,
    data: ShareReport
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.getReportById(tx, id);
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      if (report.createdBy !== ctx.userId) {
        return {
          success: false,
          error: { code: "FORBIDDEN", message: "Only the report owner can share it" },
        };
      }

      const updated = await this.repository.updateReport(tx, id, {
        sharedWith: data.shared_with,
      });

      return { success: true, data: updated! };
    });
  }

  // =========================================================================
  // Scheduling
  // =========================================================================

  async setSchedule(
    ctx: TenantContext,
    id: string,
    schedule: ScheduleReport
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.db.withTransaction(ctx, async (tx) => {
      const report = await this.repository.getReportById(tx, id);
      if (!report) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: "Report not found" },
        };
      }

      const updated = await this.repository.setSchedule(tx, id, {
        frequency: schedule.frequency,
        cron: schedule.cron,
        time: schedule.time,
        dayOfWeek: schedule.day_of_week,
        dayOfMonth: schedule.day_of_month,
        recipients: schedule.recipients,
        exportFormat: schedule.export_format,
      });

      return { success: true, data: updated! };
    });
  }

  async removeSchedule(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    return this.db.withTransaction(ctx, async (tx) => {
      await this.repository.removeSchedule(tx, id);
      return { success: true };
    });
  }

  // =========================================================================
  // System Templates
  // =========================================================================

  async listSystemTemplates(
    ctx: TenantContext
  ): Promise<ServiceResult<ReportDefinitionRow[]>> {
    return this.db.withTransaction(ctx, async (tx) => {
      await this.repository.ensureSystemTemplatesSeeded(tx, ctx.tenantId, ctx.userId!);
      const templates = await this.repository.listSystemTemplates(tx);
      return { success: true, data: templates };
    });
  }

  async createFromTemplate(
    ctx: TenantContext,
    templateId: string
  ): Promise<ServiceResult<ReportDefinitionRow>> {
    return this.duplicateReport(ctx, templateId);
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private isSharedWith(report: ReportDefinitionRow, userId: string): boolean {
    if (!report.sharedWith || !Array.isArray(report.sharedWith)) return false;
    return report.sharedWith.some(
      (s: unknown) => (s as { userId: string }).userId === userId
    );
  }

  private hasEditAccess(report: ReportDefinitionRow, userId: string): boolean {
    if (!report.sharedWith || !Array.isArray(report.sharedWith)) return false;
    return report.sharedWith.some(
      (s: unknown) =>
        (s as { userId: string; permission: string }).userId === userId &&
        (s as { userId: string; permission: string }).permission === "edit"
    );
  }

  private async validateReportConfig(
    tx: unknown,
    config: ReportConfig
  ): Promise<{ valid: boolean; message?: string }> {
    if (!config.columns || config.columns.length === 0) {
      return { valid: false, message: "Report must have at least one column" };
    }

    if (config.columns.length > 50) {
      return { valid: false, message: "Maximum 50 columns per report" };
    }

    // Validate field keys exist in catalog
    const catalog = this.fieldCatalogCache ?? [];
    const catalogKeys = new Set(catalog.map((f) => f.fieldKey));

    for (const col of config.columns) {
      if (!catalogKeys.has(col.field_key)) {
        return {
          valid: false,
          message: `Unknown field: ${col.field_key}`,
        };
      }
    }

    for (const filter of config.filters ?? []) {
      if (!catalogKeys.has(filter.field_key)) {
        return {
          valid: false,
          message: `Unknown filter field: ${filter.field_key}`,
        };
      }
    }

    return { valid: true };
  }
}
