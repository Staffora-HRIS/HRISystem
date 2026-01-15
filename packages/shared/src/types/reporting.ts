/**
 * Reporting Types
 *
 * Type definitions for report definitions, metrics,
 * exports, and dashboard caching.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Report Definition Types
// =============================================================================

/** Report status */
export type ReportDefinitionStatus = "draft" | "published" | "deprecated" | "archived";

/** Report category */
export type ReportCategory =
  | "hr"
  | "time_attendance"
  | "absence"
  | "performance"
  | "recruiting"
  | "learning"
  | "compliance"
  | "analytics"
  | "custom";

/** Data source type */
export type DataSourceType =
  | "employees"
  | "timesheets"
  | "leave_requests"
  | "performance_reviews"
  | "candidates"
  | "courses"
  | "cases"
  | "custom_query";

/** Column data type */
export type ColumnDataType =
  | "string"
  | "number"
  | "decimal"
  | "date"
  | "datetime"
  | "boolean"
  | "currency"
  | "percentage"
  | "duration";

/**
 * Report definition.
 */
export interface ReportDefinition extends TenantScopedEntity {
  /** Report name */
  name: string;
  /** Description */
  description?: string;
  /** Report code (unique identifier) */
  code: string;
  /** Category */
  category: ReportCategory;
  /** Status */
  status: ReportDefinitionStatus;
  /** Is system report */
  isSystem: boolean;
  /** Is public (available to all users with access) */
  isPublic: boolean;
  /** Owner user ID */
  ownerId: UUID;
  /** Data sources */
  dataSources: ReportDataSource[];
  /** Columns/fields */
  columns: ReportColumn[];
  /** Default filters */
  defaultFilters?: ReportFilter[];
  /** Default sort */
  defaultSort?: ReportSort[];
  /** Grouping configuration */
  grouping?: ReportGrouping;
  /** Aggregations */
  aggregations?: ReportAggregation[];
  /** Chart configuration */
  chartConfig?: ReportChartConfig;
  /** Allowed export formats */
  allowedExportFormats: ExportFormat[];
  /** Schedule configuration */
  schedule?: ReportSchedule;
  /** Parameters/prompts */
  parameters?: ReportParameter[];
  /** Row limit */
  rowLimit?: number;
  /** Cache duration in seconds */
  cacheDurationSeconds?: number;
  /** Last modified by user ID */
  lastModifiedBy: UUID;
  /** Tags */
  tags?: string[];
  /** Access roles (empty = owner only) */
  accessRoles?: string[];
  /** Access user IDs */
  accessUserIds?: UUID[];
}

/**
 * Report data source configuration.
 */
export interface ReportDataSource {
  /** Source ID */
  id: string;
  /** Source type */
  type: DataSourceType;
  /** Source name/alias */
  alias: string;
  /** Custom SQL query (if custom_query) */
  customQuery?: string;
  /** Entity name */
  entityName?: string;
  /** Join configuration */
  joins?: Array<{
    targetSourceId: string;
    type: "inner" | "left" | "right";
    sourceField: string;
    targetField: string;
  }>;
  /** Base filters */
  baseFilters?: ReportFilter[];
}

/**
 * Report column definition.
 */
export interface ReportColumn {
  /** Column ID */
  id: string;
  /** Data source ID */
  sourceId: string;
  /** Field name/path */
  fieldName: string;
  /** Display label */
  label: string;
  /** Data type */
  dataType: ColumnDataType;
  /** Format pattern */
  format?: string;
  /** Is visible by default */
  isVisible: boolean;
  /** Is sortable */
  isSortable: boolean;
  /** Is filterable */
  isFilterable: boolean;
  /** Is groupable */
  isGroupable: boolean;
  /** Can aggregate */
  canAggregate: boolean;
  /** Default width */
  width?: number;
  /** Display order */
  sortOrder: number;
  /** Calculation expression */
  calculation?: string;
  /** Conditional formatting */
  conditionalFormatting?: Array<{
    condition: string;
    style: Record<string, string>;
  }>;
  /** Drill-down configuration */
  drillDown?: {
    reportId: UUID;
    parameterMapping: Record<string, string>;
  };
}

/**
 * Report filter.
 */
export interface ReportFilter {
  /** Column ID */
  columnId: string;
  /** Operator */
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "starts_with"
    | "ends_with"
    | "in"
    | "not_in"
    | "between"
    | "is_null"
    | "is_not_null";
  /** Filter value(s) */
  value: unknown;
  /** Is user-adjustable */
  isUserAdjustable: boolean;
}

/**
 * Report sort configuration.
 */
export interface ReportSort {
  /** Column ID */
  columnId: string;
  /** Direction */
  direction: "asc" | "desc";
}

/**
 * Report grouping configuration.
 */
export interface ReportGrouping {
  /** Group by column IDs */
  groupByColumns: string[];
  /** Show subtotals */
  showSubtotals: boolean;
  /** Show grand total */
  showGrandTotal: boolean;
  /** Expand groups by default */
  expandGroups: boolean;
}

/** Aggregation function */
export type AggregationFunction =
  | "sum"
  | "avg"
  | "min"
  | "max"
  | "count"
  | "count_distinct"
  | "median"
  | "std_dev";

/**
 * Report aggregation.
 */
export interface ReportAggregation {
  /** Column ID to aggregate */
  columnId: string;
  /** Aggregation function */
  function: AggregationFunction;
  /** Result label */
  label: string;
  /** Format pattern */
  format?: string;
}

/**
 * Report chart configuration.
 */
export interface ReportChartConfig {
  /** Chart type */
  type:
    | "bar"
    | "line"
    | "area"
    | "pie"
    | "donut"
    | "scatter"
    | "heatmap"
    | "treemap"
    | "funnel"
    | "gauge";
  /** Title */
  title?: string;
  /** X-axis configuration */
  xAxis?: {
    columnId: string;
    label?: string;
  };
  /** Y-axis configuration */
  yAxis?: {
    columnId: string;
    label?: string;
    aggregation?: AggregationFunction;
  };
  /** Series configuration */
  series?: Array<{
    columnId: string;
    label?: string;
    color?: string;
    aggregation?: AggregationFunction;
  }>;
  /** Legend position */
  legendPosition?: "top" | "bottom" | "left" | "right" | "none";
  /** Show data labels */
  showDataLabels: boolean;
  /** Stacked */
  stacked?: boolean;
  /** Color scheme */
  colorScheme?: string;
}

/**
 * Report schedule configuration.
 */
export interface ReportSchedule {
  /** Is enabled */
  enabled: boolean;
  /** Frequency */
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  /** Day of week (for weekly, 0-6) */
  dayOfWeek?: number;
  /** Day of month (for monthly/quarterly) */
  dayOfMonth?: number;
  /** Time (HH:mm) */
  time: string;
  /** Timezone */
  timezone: string;
  /** Export format */
  exportFormat: ExportFormat;
  /** Recipients (email addresses) */
  recipients: string[];
  /** Email subject */
  emailSubject?: string;
  /** Email body */
  emailBody?: string;
  /** Include empty report */
  includeEmpty: boolean;
  /** Next run timestamp */
  nextRunAt?: TimestampString;
  /** Last run timestamp */
  lastRunAt?: TimestampString;
  /** Last run status */
  lastRunStatus?: "success" | "failed" | "no_data";
}

/**
 * Report parameter definition.
 */
export interface ReportParameter {
  /** Parameter ID */
  id: string;
  /** Parameter name */
  name: string;
  /** Display label */
  label: string;
  /** Data type */
  dataType: "string" | "number" | "date" | "date_range" | "select" | "multi_select";
  /** Is required */
  required: boolean;
  /** Default value */
  defaultValue?: unknown;
  /** Options (for select types) */
  options?: Array<{ value: string; label: string }>;
  /** Options query (for dynamic options) */
  optionsQuery?: string;
  /** Dependent on parameter */
  dependsOn?: string;
  /** Help text */
  helpText?: string;
}

// =============================================================================
// Metric Definition Types
// =============================================================================

/** Metric category */
export type MetricCategory =
  | "headcount"
  | "turnover"
  | "absence"
  | "time"
  | "performance"
  | "recruiting"
  | "learning"
  | "diversity"
  | "compensation"
  | "engagement";

/** Metric trend direction preference */
export type TrendPreference = "higher_better" | "lower_better" | "neutral";

/**
 * Metric definition for KPIs and dashboards.
 */
export interface MetricDefinition extends TenantScopedEntity {
  /** Metric name */
  name: string;
  /** Metric code */
  code: string;
  /** Description */
  description?: string;
  /** Category */
  category: MetricCategory;
  /** Calculation expression/query */
  calculation: string;
  /** Data type */
  dataType: ColumnDataType;
  /** Format pattern */
  format?: string;
  /** Unit label */
  unit?: string;
  /** Trend preference */
  trendPreference: TrendPreference;
  /** Target value */
  targetValue?: number;
  /** Warning threshold */
  warningThreshold?: number;
  /** Critical threshold */
  criticalThreshold?: number;
  /** Dimensions for drill-down */
  dimensions?: string[];
  /** Time granularity */
  timeGranularity?: "day" | "week" | "month" | "quarter" | "year";
  /** Is system metric */
  isSystem: boolean;
  /** Is active */
  isActive: boolean;
  /** Cache duration in seconds */
  cacheDurationSeconds?: number;
  /** Tags */
  tags?: string[];
}

// =============================================================================
// Export Types
// =============================================================================

/** Export format */
export type ExportFormat = "csv" | "xlsx" | "pdf" | "json" | "xml";

/** Export status */
export type ExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "expired";

/**
 * Report export request.
 */
export interface ReportExport extends TenantScopedEntity {
  /** Report definition ID */
  reportDefinitionId: UUID;
  /** Export status */
  status: ExportStatus;
  /** Export format */
  format: ExportFormat;
  /** Applied filters */
  filters?: ReportFilter[];
  /** Applied parameters */
  parameters?: Record<string, unknown>;
  /** Requested by user ID */
  requestedBy: UUID;
  /** Requested timestamp */
  requestedAt: TimestampString;
  /** Started processing timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** File URL (when completed) */
  fileUrl?: string;
  /** File size in bytes */
  fileSize?: number;
  /** Row count */
  rowCount?: number;
  /** Error message */
  errorMessage?: string;
  /** Expires at */
  expiresAt?: TimestampString;
  /** Is scheduled */
  isScheduled: boolean;
  /** Schedule run ID */
  scheduleRunId?: UUID;
}

// =============================================================================
// Dashboard Cache Types
// =============================================================================

/**
 * Dashboard cache entry.
 */
export interface DashboardCache extends TenantScopedEntity {
  /** Cache key */
  cacheKey: string;
  /** Metric or widget ID */
  metricId?: UUID;
  /** Report ID */
  reportId?: UUID;
  /** Dashboard ID */
  dashboardId?: UUID;
  /** Cached data */
  data: Record<string, unknown>;
  /** Filters applied */
  filters?: Record<string, unknown>;
  /** Parameters applied */
  parameters?: Record<string, unknown>;
  /** Time range */
  timeRange?: {
    start: DateString;
    end: DateString;
  };
  /** Computed timestamp */
  computedAt: TimestampString;
  /** Expires at */
  expiresAt: TimestampString;
  /** Computation time in ms */
  computationTimeMs: number;
  /** Hit count */
  hitCount: number;
  /** Last accessed */
  lastAccessedAt: TimestampString;
}

// =============================================================================
// Dashboard Types
// =============================================================================

/** Widget type */
export type WidgetType =
  | "metric"
  | "chart"
  | "table"
  | "list"
  | "text"
  | "image"
  | "embedded";

/**
 * Dashboard definition.
 */
export interface Dashboard extends TenantScopedEntity {
  /** Dashboard name */
  name: string;
  /** Description */
  description?: string;
  /** Is default dashboard */
  isDefault: boolean;
  /** Is public */
  isPublic: boolean;
  /** Owner user ID */
  ownerId: UUID;
  /** Layout configuration */
  layout: {
    columns: number;
    rowHeight: number;
  };
  /** Widgets */
  widgets: DashboardWidget[];
  /** Global filters */
  globalFilters?: ReportFilter[];
  /** Refresh interval in seconds */
  refreshIntervalSeconds?: number;
  /** Access roles */
  accessRoles?: string[];
  /** Access user IDs */
  accessUserIds?: UUID[];
  /** Tags */
  tags?: string[];
}

/**
 * Dashboard widget.
 */
export interface DashboardWidget {
  /** Widget ID */
  id: UUID;
  /** Widget type */
  type: WidgetType;
  /** Widget title */
  title: string;
  /** Position */
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Metric ID (for metric widgets) */
  metricId?: UUID;
  /** Report ID (for chart/table widgets) */
  reportId?: UUID;
  /** Chart configuration override */
  chartConfig?: Partial<ReportChartConfig>;
  /** Custom content (for text/image widgets) */
  customContent?: string;
  /** Embedded URL */
  embeddedUrl?: string;
  /** Widget-specific filters */
  filters?: ReportFilter[];
  /** Drill-through report ID */
  drillThroughReportId?: UUID;
  /** Refresh interval override */
  refreshIntervalSeconds?: number;
}
