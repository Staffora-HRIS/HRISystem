/**
 * Shared types for the Reports module frontend.
 */

// Field catalog entry from the API
export interface FieldCatalogEntry {
  fieldKey: string;
  displayName: string;
  description: string | null;
  category: string;
  dataType: string;
  enumValues: string[] | null;
  isFilterable: boolean;
  isSortable: boolean;
  isGroupable: boolean;
  isAggregatable: boolean;
  supportedAggregations: string[];
  filterOperators: string[] | null;
  isPii: boolean;
  isSensitive: boolean;
  isCalculated: boolean;
  displayOrder: number;
  columnWidth: number;
  textAlignment: string;
  isDefaultVisible: boolean;
}

export interface FieldCategory {
  key: string;
  label: string;
  fieldCount: number;
}

export interface FieldCatalogResponse {
  fields: FieldCatalogEntry[];
  categories: FieldCategory[];
}

// Column configuration in the report builder
export interface ColumnConfig {
  field_key: string;
  alias?: string;
  width?: number;
  visible?: boolean;
  order?: number;
  aggregation?: "count" | "count_distinct" | "sum" | "avg" | "min" | "max" | null;
  format?: string | null;
  conditional_formatting?: ConditionalFormat[];
}

export interface ConditionalFormat {
  condition: string;
  value: unknown;
  style: {
    backgroundColor?: string;
    color?: string;
    fontWeight?: string;
  };
}

// Filter configuration
export interface FilterConfig {
  field_key: string;
  operator: string;
  value: unknown;
  is_parameter?: boolean;
  parameter_label?: string | null;
  logic?: "AND" | "OR";
}

// Group by / sort by
export interface GroupByConfig {
  field_key: string;
  order?: number;
}

export interface SortByConfig {
  field_key: string;
  direction?: "ASC" | "DESC";
}

// Full report config
export interface ReportConfig {
  columns: ColumnConfig[];
  filters?: FilterConfig[];
  groupBy?: GroupByConfig[];
  sortBy?: SortByConfig[];
  effectiveDate?: "current" | "as_of" | "range";
  effectiveDateValue?: unknown;
  includeTerminated?: boolean;
  distinctEmployees?: boolean;
  limit?: number | null;
  chartConfig?: unknown;
}

// Report types
export type ReportType =
  | "tabular"
  | "summary"
  | "cross_tab"
  | "chart"
  | "dashboard_widget"
  | "headcount"
  | "turnover"
  | "compliance";

export type ReportStatus = "draft" | "published" | "archived";

// Report definition from the API
export type ScheduleFrequency =
  | "daily"
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "annually"
  | "custom_cron";

export interface ScheduleRecipient {
  userId?: string;
  email: string;
  deliveryMethod?: "email" | "in_app" | "both";
}

export type ScheduleExportFormat = "csv" | "xlsx" | "pdf";

export interface ReportDefinition {
  id: string;
  name: string;
  description: string | null;
  reportType: ReportType;
  status: ReportStatus;
  category: string | null;
  tags: string[];
  config: ReportConfig;
  chartType: string | null;
  chartConfig: unknown;
  isScheduled: boolean;
  scheduleFrequency: ScheduleFrequency | null;
  scheduleCron: string | null;
  scheduleTime: string | null;
  scheduleDayOfWeek: number | null;
  scheduleDayOfMonth: number | null;
  scheduleRecipients: ScheduleRecipient[];
  scheduleExportFormat: ScheduleExportFormat | null;
  lastScheduledRun: string | null;
  nextScheduledRun: string | null;
  isPublic: boolean;
  isSystem: boolean;
  createdBy: string;
  lastRunAt: string | null;
  runCount: number;
  avgExecutionMs: number | null;
  createdAt: string;
  updatedAt: string;
}

// Report execution result
export interface ReportExecutionResult {
  columns: Array<{
    key: string;
    label: string;
    dataType: string;
    alignment?: string;
  }>;
  rows: Record<string, unknown>[];
  totalRows: number;
  executionMs: number;
  executionId: string;
}

// Filter operator labels by data type
export const FILTER_OPERATORS: Record<string, { label: string; types: string[] }> = {
  equals: { label: "Equals", types: ["string", "integer", "decimal", "date", "enum", "boolean", "email", "phone", "url"] },
  not_equals: { label: "Not equals", types: ["string", "integer", "decimal", "date", "enum", "email", "phone", "url"] },
  contains: { label: "Contains", types: ["string", "text", "email", "url"] },
  starts_with: { label: "Starts with", types: ["string", "text", "email"] },
  ends_with: { label: "Ends with", types: ["string", "text"] },
  in: { label: "Is one of", types: ["string", "enum", "integer"] },
  not_in: { label: "Is not one of", types: ["string", "enum", "integer"] },
  between: { label: "Between", types: ["integer", "decimal", "date", "datetime", "currency", "percentage"] },
  gt: { label: "Greater than", types: ["integer", "decimal", "date", "datetime", "currency", "percentage", "duration"] },
  gte: { label: "Greater or equal", types: ["integer", "decimal", "date", "datetime", "currency", "percentage", "duration"] },
  lt: { label: "Less than", types: ["integer", "decimal", "date", "datetime", "currency", "percentage", "duration"] },
  lte: { label: "Less or equal", types: ["integer", "decimal", "date", "datetime", "currency", "percentage", "duration"] },
  is_null: { label: "Is empty", types: ["string", "text", "integer", "decimal", "date", "datetime", "enum", "email", "phone", "url", "currency", "percentage", "boolean"] },
  is_not_null: { label: "Is not empty", types: ["string", "text", "integer", "decimal", "date", "datetime", "enum", "email", "phone", "url", "currency", "percentage", "boolean"] },
};

// Aggregation labels
export const AGGREGATION_LABELS: Record<string, string> = {
  count: "Count",
  count_distinct: "Count Distinct",
  sum: "Sum",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
};

// Category icons mapping
export const CATEGORY_LABELS: Record<string, string> = {
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
