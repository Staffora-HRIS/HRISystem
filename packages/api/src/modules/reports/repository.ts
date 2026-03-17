/**
 * Reports Module - Repository Layer
 *
 * Data access for report definitions, executions, favourites, and the field catalog.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";

// =============================================================================
// Types
// =============================================================================

export interface FieldCatalogRow extends Row {
  id: string;
  fieldKey: string;
  displayName: string;
  description: string | null;
  category: string;
  sourceTable: string;
  sourceColumn: string;
  dataType: string;
  enumValues: string[] | null;
  joinPath: Array<{ table: string; alias: string; on: string; type: string }>;
  isEffectiveDated: boolean;
  effectiveDateColumn: string | null;
  isAggregatable: boolean;
  supportedAggregations: string[];
  isGroupable: boolean;
  isFilterable: boolean;
  filterOperators: string[] | null;
  defaultFilterOperator: string | null;
  isSortable: boolean;
  requiredPermission: string | null;
  fieldPermissionKey: string | null;
  isPii: boolean;
  isSensitive: boolean;
  gdprConsentRequired: boolean;
  isCalculated: boolean;
  calculationExpression: string | null;
  displayOrder: number;
  isDefaultVisible: boolean;
  columnWidth: number;
  textAlignment: string;
  formatPattern: string | null;
  currencyCode: string | null;
  decimalPlaces: number | null;
}

export interface ReportDefinitionRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  reportType: string;
  status: string;
  category: string | null;
  tags: string[];
  config: Record<string, unknown>;
  chartType: string | null;
  chartConfig: Record<string, unknown> | null;
  isScheduled: boolean;
  scheduleFrequency: string | null;
  scheduleCron: string | null;
  scheduleTime: string | null;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
  scheduleRecipients: unknown[];
  scheduleExportFormat: string | null;
  lastScheduledRun: Date | null;
  nextScheduledRun: Date | null;
  createdBy: string;
  isPublic: boolean;
  isSystem: boolean;
  sharedWith: unknown[];
  requiredPermission: string | null;
  version: number;
  lastRunAt: Date | null;
  runCount: number;
  avgExecutionMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportExecutionRow extends Row {
  id: string;
  tenantId: string;
  reportId: string;
  executedBy: string;
  executedAt: Date;
  executionMs: number | null;
  rowCount: number | null;
  parameters: Record<string, unknown> | null;
  resultCacheKey: string | null;
  resultExpiresAt: Date | null;
  exportFormat: string | null;
  exportFileKey: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ReportFavouriteRow extends Row {
  id: string;
  tenantId: string;
  userId: string;
  reportId: string;
  pinnedOrder: number | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class ReportsRepository {
  constructor(private db: DatabaseClient) {}

  // =========================================================================
  // Field Catalog
  // =========================================================================

  async getFieldCatalog(tx: TransactionSql): Promise<FieldCatalogRow[]> {
    return await tx`
      SELECT
        id, field_key, display_name, description, category,
        source_table, source_column, data_type, enum_values,
        join_path, is_effective_dated, effective_date_column,
        is_aggregatable, supported_aggregations, is_groupable,
        is_filterable, filter_operators, default_filter_operator,
        is_sortable, required_permission, field_permission_key,
        is_pii, is_sensitive, gdpr_consent_required,
        is_calculated, calculation_expression,
        display_order, is_default_visible, column_width, text_alignment,
        format_pattern, currency_code, decimal_places
      FROM reporting_field_catalog
      WHERE is_active = true
      ORDER BY display_order, display_name
    ` as FieldCatalogRow[];
  }

  async getFieldByKey(tx: TransactionSql, fieldKey: string): Promise<FieldCatalogRow | null> {
    const rows = await tx`
      SELECT
        id, field_key, display_name, description, category,
        source_table, source_column, data_type, enum_values,
        join_path, is_effective_dated, effective_date_column,
        is_aggregatable, supported_aggregations, is_groupable,
        is_filterable, filter_operators, default_filter_operator,
        is_sortable, required_permission, field_permission_key,
        is_pii, is_sensitive, gdpr_consent_required,
        is_calculated, calculation_expression,
        display_order, is_default_visible, column_width, text_alignment,
        format_pattern, currency_code, decimal_places
      FROM reporting_field_catalog
      WHERE field_key = ${fieldKey} AND is_active = true
    ` as FieldCatalogRow[];
    return rows[0] ?? null;
  }

  async getFieldDistinctValues(
    tx: TransactionSql,
    field: FieldCatalogRow,
    limit: number = 100
  ): Promise<string[]> {
    // For enum fields, return the enum values directly
    if (field.enumValues && field.enumValues.length > 0) {
      return field.enumValues;
    }

    // For non-calculated fields, query distinct values
    // Table/column names come from the trusted field catalog, not user input
    if (!field.isCalculated) {
      const sql = `SELECT DISTINCT "${field.sourceColumn}"::text AS val FROM "${field.sourceTable}" WHERE "${field.sourceColumn}" IS NOT NULL ORDER BY val LIMIT $1`;
      const rows = await tx.unsafe(sql, [limit]) as any[];
      return rows.map((r: { val: string }) => r.val);
    }

    return [];
  }

  // =========================================================================
  // Report Definitions
  // =========================================================================

  async listReports(
    tx: TransactionSql,
    userId: string,
    filters: {
      status?: string;
      category?: string;
      type?: string;
      search?: string;
      limit?: number;
      cursor?: string;
    }
  ): Promise<{ rows: ReportDefinitionRow[]; total: number }> {
    const limit = Math.min(filters.limit ?? 50, 100);

    // Build conditions: user's own + shared + public
    const rows = await tx`
      SELECT
        rd.*,
        COUNT(*) OVER() AS total_count
      FROM report_definitions rd
      WHERE (
        rd.created_by = ${userId}
        OR rd.is_public = true
        OR rd.shared_with @> ${JSON.stringify([{ userId }])}::jsonb
      )
      ${filters.status ? tx`AND rd.status = ${filters.status}` : tx``}
      ${filters.category ? tx`AND rd.category = ${filters.category}` : tx``}
      ${filters.type ? tx`AND rd.report_type = ${filters.type}` : tx``}
      ${filters.search ? tx`AND (rd.name ILIKE ${"%" + filters.search + "%"} OR rd.description ILIKE ${"%" + filters.search + "%"})` : tx``}
      ${filters.cursor ? tx`AND rd.id < ${filters.cursor}` : tx``}
      ORDER BY rd.updated_at DESC, rd.id DESC
      LIMIT ${limit}
    ` as (ReportDefinitionRow & { totalCount: number })[];

    const total = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).totalCount ?? 0) : 0;
    return { rows: rows as ReportDefinitionRow[], total };
  }

  async getReportById(tx: TransactionSql, id: string): Promise<ReportDefinitionRow | null> {
    const rows = await tx`
      SELECT
        id, tenant_id, name, description, report_type, status, category, tags, config,
        chart_type, chart_config, is_scheduled, schedule_frequency, schedule_cron,
        schedule_time, schedule_day_of_week, schedule_day_of_month, schedule_recipients,
        schedule_export_format, last_scheduled_run, next_scheduled_run, created_by,
        is_public, is_system, shared_with, required_permission, version,
        last_run_at, run_count, avg_execution_ms, created_at, updated_at
      FROM report_definitions WHERE id = ${id}
    ` as ReportDefinitionRow[];
    return rows[0] ?? null;
  }

  async createReport(
    tx: TransactionSql,
    tenantId: string,
    userId: string,
    data: {
      name: string;
      description?: string;
      reportType?: string;
      category?: string;
      tags?: string[];
      config: Record<string, unknown>;
      chartType?: string;
      chartConfig?: unknown;
      isPublic?: boolean;
      isSystem?: boolean;
    }
  ): Promise<ReportDefinitionRow> {
    const [row] = await tx`
      INSERT INTO report_definitions (
        tenant_id, name, description, report_type, category,
        tags, config, chart_type, chart_config,
        is_public, is_system, created_by
      ) VALUES (
        ${tenantId},
        ${data.name},
        ${data.description ?? null},
        ${data.reportType ?? "tabular"},
        ${data.category ?? null},
        ${JSON.stringify(data.tags ?? [])}::jsonb,
        ${JSON.stringify(data.config)}::jsonb,
        ${data.chartType ?? null},
        ${data.chartConfig ? JSON.stringify(data.chartConfig) : null}::jsonb,
        ${data.isPublic ?? false},
        ${data.isSystem ?? false},
        ${userId}
      )
      RETURNING *
    ` as ReportDefinitionRow[];
    return row;
  }

  async updateReport(
    tx: TransactionSql,
    id: string,
    data: Record<string, unknown>
  ): Promise<ReportDefinitionRow | null> {
    // Build SET clause from provided fields
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.reportType !== undefined) updates.reportType = data.reportType;
    if (data.category !== undefined) updates.category = data.category;
    if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);
    if (data.config !== undefined) updates.config = JSON.stringify(data.config);
    if (data.chartType !== undefined) updates.chartType = data.chartType;
    if (data.chartConfig !== undefined) updates.chartConfig = data.chartConfig ? JSON.stringify(data.chartConfig) : null;
    if (data.isPublic !== undefined) updates.isPublic = data.isPublic;

    if (Object.keys(updates).length === 0) return this.getReportById(tx, id);

    // Build SET clause dynamically using postgres.js helper
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, val] of Object.entries(updates)) {
      // Convert camelCase keys to snake_case for SQL
      const snakeKey = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      setClauses.push(`"${snakeKey}" = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }
    values.push(id);

    const sql = `UPDATE report_definitions SET ${setClauses.join(", ")}, version = version + 1 WHERE id = $${paramIdx} RETURNING *`;
    const [row] = await tx.unsafe(sql, values as any[]) as ReportDefinitionRow[];
    return row ?? null;
  }

  async deleteReport(tx: TransactionSql, id: string): Promise<boolean> {
    const result = await tx`
      DELETE FROM report_definitions WHERE id = ${id}
    `;
    return result.count > 0;
  }

  async updateReportStatus(
    tx: TransactionSql,
    id: string,
    status: string
  ): Promise<ReportDefinitionRow | null> {
    const [row] = await tx`
      UPDATE report_definitions
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    ` as ReportDefinitionRow[];
    return row ?? null;
  }

  async duplicateReport(
    tx: TransactionSql,
    sourceId: string,
    tenantId: string,
    userId: string,
    newName: string
  ): Promise<ReportDefinitionRow | null> {
    const source = await this.getReportById(tx, sourceId);
    if (!source) return null;

    return this.createReport(tx, tenantId, userId, {
      name: newName,
      description: source.description ?? undefined,
      reportType: source.reportType,
      category: source.category ?? undefined,
      tags: source.tags,
      config: source.config,
      chartType: source.chartType ?? undefined,
      chartConfig: source.chartConfig,
      isPublic: false,
    });
  }

  // =========================================================================
  // Report Executions
  // =========================================================================

  async createExecution(
    tx: TransactionSql,
    data: {
      tenantId: string;
      reportId: string;
      executedBy: string;
      executionMs: number;
      rowCount: number;
      parameters?: Record<string, unknown>;
      status?: string;
      errorMessage?: string;
    }
  ): Promise<ReportExecutionRow> {
    const [row] = await tx`
      INSERT INTO report_executions (
        tenant_id, report_id, executed_by, execution_ms,
        row_count, parameters, status, error_message
      ) VALUES (
        ${data.tenantId}, ${data.reportId}, ${data.executedBy},
        ${data.executionMs}, ${data.rowCount},
        ${data.parameters ? JSON.stringify(data.parameters) : null}::jsonb,
        ${data.status ?? "completed"},
        ${data.errorMessage ?? null}
      )
      RETURNING *
    ` as ReportExecutionRow[];
    return row;
  }

  async updateReportRunStats(
    tx: TransactionSql,
    reportId: string,
    executionMs: number
  ): Promise<void> {
    await tx`
      UPDATE report_definitions
      SET
        last_run_at = now(),
        run_count = run_count + 1,
        avg_execution_ms = CASE
          WHEN avg_execution_ms IS NULL THEN ${executionMs}
          ELSE (avg_execution_ms * run_count + ${executionMs}) / (run_count + 1)
        END
      WHERE id = ${reportId}
    `;
  }

  async listExecutions(
    tx: TransactionSql,
    reportId: string,
    limit: number = 20
  ): Promise<ReportExecutionRow[]> {
    return await tx`
      SELECT
        id, tenant_id, report_id, executed_by, executed_at, execution_ms,
        row_count, parameters, result_cache_key, result_expires_at,
        export_format, export_file_key, status, error_message, created_at
      FROM report_executions
      WHERE report_id = ${reportId}
      ORDER BY executed_at DESC
      LIMIT ${limit}
    ` as ReportExecutionRow[];
  }

  // =========================================================================
  // Favourites
  // =========================================================================

  async addFavourite(
    tx: TransactionSql,
    tenantId: string,
    userId: string,
    reportId: string
  ): Promise<ReportFavouriteRow> {
    const [row] = await tx`
      INSERT INTO report_favourites (tenant_id, user_id, report_id)
      VALUES (${tenantId}, ${userId}, ${reportId})
      ON CONFLICT (tenant_id, user_id, report_id) DO NOTHING
      RETURNING *
    ` as ReportFavouriteRow[];
    return row;
  }

  async removeFavourite(
    tx: TransactionSql,
    tenantId: string,
    userId: string,
    reportId: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM report_favourites
      WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND report_id = ${reportId}
    `;
    return result.count > 0;
  }

  async listFavourites(
    tx: TransactionSql,
    tenantId: string,
    userId: string
  ): Promise<ReportDefinitionRow[]> {
    return await tx`
      SELECT rd.* FROM report_definitions rd
      INNER JOIN report_favourites rf ON rf.report_id = rd.id
      WHERE rf.tenant_id = ${tenantId} AND rf.user_id = ${userId}
      ORDER BY rf.pinned_order NULLS LAST, rf.created_at DESC
    ` as ReportDefinitionRow[];
  }

  // =========================================================================
  // Schedule
  // =========================================================================

  async setSchedule(
    tx: TransactionSql,
    reportId: string,
    schedule: {
      frequency: string;
      cron?: string;
      time?: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      recipients: unknown[];
      exportFormat?: string;
    }
  ): Promise<ReportDefinitionRow | null> {
    const [row] = await tx`
      UPDATE report_definitions
      SET
        is_scheduled = true,
        schedule_frequency = ${schedule.frequency},
        schedule_cron = ${schedule.cron ?? null},
        schedule_time = ${schedule.time ?? null},
        schedule_day_of_week = ${schedule.dayOfWeek ?? null},
        schedule_day_of_month = ${schedule.dayOfMonth ?? null},
        schedule_recipients = ${JSON.stringify(schedule.recipients)}::jsonb,
        schedule_export_format = ${schedule.exportFormat ?? "xlsx"}
      WHERE id = ${reportId}
      RETURNING *
    ` as ReportDefinitionRow[];
    return row ?? null;
  }

  async removeSchedule(tx: TransactionSql, reportId: string): Promise<boolean> {
    const result = await tx`
      UPDATE report_definitions
      SET
        is_scheduled = false,
        schedule_frequency = NULL,
        schedule_cron = NULL,
        schedule_time = NULL,
        schedule_day_of_week = NULL,
        schedule_day_of_month = NULL,
        schedule_recipients = '[]'::jsonb,
        schedule_export_format = NULL,
        next_scheduled_run = NULL
      WHERE id = ${reportId}
    `;
    return result.count > 0;
  }

  async recordScheduleHistory(
    tx: TransactionSql,
    data: {
      tenantId: string;
      reportId: string;
      action: "created" | "updated" | "removed";
      frequency?: string;
      cron?: string;
      time?: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      recipients?: unknown[];
      exportFormat?: string;
      changedBy: string;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO report_schedule_history (
        tenant_id, report_id, action, frequency, cron_expression,
        schedule_time, day_of_week, day_of_month, recipients,
        export_format, changed_by
      ) VALUES (
        ${data.tenantId}, ${data.reportId}, ${data.action},
        ${data.frequency ?? null}, ${data.cron ?? null},
        ${data.time ?? null}, ${data.dayOfWeek ?? null},
        ${data.dayOfMonth ?? null},
        ${JSON.stringify(data.recipients ?? [])}::jsonb,
        ${data.exportFormat ?? null}, ${data.changedBy}
      )
    `;
  }

  async getScheduledReportsDue(tx: TransactionSql): Promise<ReportDefinitionRow[]> {
    return await tx`
      SELECT
        id, tenant_id, name, description, report_type, status, category, tags, config,
        chart_type, chart_config, is_scheduled, schedule_frequency, schedule_cron,
        schedule_time, schedule_day_of_week, schedule_day_of_month, schedule_recipients,
        schedule_export_format, last_scheduled_run, next_scheduled_run, created_by,
        is_public, is_system, shared_with, required_permission, version,
        last_run_at, run_count, avg_execution_ms, created_at, updated_at
      FROM report_definitions
      WHERE is_scheduled = true
        AND next_scheduled_run IS NOT NULL
        AND next_scheduled_run <= now()
      ORDER BY next_scheduled_run ASC
      LIMIT 50
    ` as ReportDefinitionRow[];
  }

  // =========================================================================
  // System Templates
  // =========================================================================

  async listSystemTemplates(tx: TransactionSql): Promise<ReportDefinitionRow[]> {
    return await tx`
      SELECT
        id, tenant_id, name, description, report_type, status, category, tags, config,
        chart_type, chart_config, is_scheduled, schedule_frequency, schedule_cron,
        schedule_time, schedule_day_of_week, schedule_day_of_month, schedule_recipients,
        schedule_export_format, last_scheduled_run, next_scheduled_run, created_by,
        is_public, is_system, shared_with, required_permission, version,
        last_run_at, run_count, avg_execution_ms, created_at, updated_at
      FROM report_definitions
      WHERE is_system = true
      ORDER BY category, name
    ` as ReportDefinitionRow[];
  }

  async ensureSystemTemplatesSeeded(
    tx: TransactionSql,
    tenantId: string,
    userId: string
  ): Promise<void> {
    await tx`SELECT app.seed_system_report_templates(${tenantId}, ${userId})`;
  }
}
