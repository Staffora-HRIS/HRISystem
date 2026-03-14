/**
 * Reports Module - TypeBox Schemas
 *
 * Validation schemas for the reporting engine API endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const ReportTypeSchema = t.Union([
  t.Literal("tabular"),
  t.Literal("summary"),
  t.Literal("cross_tab"),
  t.Literal("chart"),
  t.Literal("dashboard_widget"),
  t.Literal("headcount"),
  t.Literal("turnover"),
  t.Literal("compliance"),
]);
export type ReportType = Static<typeof ReportTypeSchema>;

export const ReportStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("published"),
  t.Literal("archived"),
]);
export type ReportStatus = Static<typeof ReportStatusSchema>;

export const ScheduleFrequencySchema = t.Union([
  t.Literal("daily"),
  t.Literal("weekly"),
  t.Literal("fortnightly"),
  t.Literal("monthly"),
  t.Literal("quarterly"),
  t.Literal("annually"),
  t.Literal("custom_cron"),
]);
export type ScheduleFrequency = Static<typeof ScheduleFrequencySchema>;

// =============================================================================
// Column Config
// =============================================================================

export const ConditionalFormatSchema = t.Object({
  condition: t.String(),
  value: t.Unknown(),
  style: t.Object({
    backgroundColor: t.Optional(t.String()),
    color: t.Optional(t.String()),
    fontWeight: t.Optional(t.String()),
  }),
});

export const ColumnConfigSchema = t.Object({
  field_key: t.String({ minLength: 1 }),
  alias: t.Optional(t.String()),
  width: t.Optional(t.Number()),
  visible: t.Optional(t.Boolean()),
  order: t.Optional(t.Number()),
  aggregation: t.Optional(
    t.Union([
      t.Literal("count"),
      t.Literal("count_distinct"),
      t.Literal("sum"),
      t.Literal("avg"),
      t.Literal("min"),
      t.Literal("max"),
      t.Null(),
    ])
  ),
  format: t.Optional(t.Union([t.String(), t.Null()])),
  conditional_formatting: t.Optional(t.Array(ConditionalFormatSchema)),
});
export type ColumnConfig = Static<typeof ColumnConfigSchema>;

// =============================================================================
// Filter Config
// =============================================================================

export const FilterConfigSchema = t.Object({
  field_key: t.String({ minLength: 1 }),
  operator: t.String({ minLength: 1 }),
  value: t.Unknown(),
  is_parameter: t.Optional(t.Boolean()),
  parameter_label: t.Optional(t.Union([t.String(), t.Null()])),
  logic: t.Optional(t.Union([t.Literal("AND"), t.Literal("OR")])),
});
export type FilterConfig = Static<typeof FilterConfigSchema>;

// =============================================================================
// Group By / Sort By Config
// =============================================================================

export const GroupByConfigSchema = t.Object({
  field_key: t.String({ minLength: 1 }),
  order: t.Optional(t.Number()),
});
export type GroupByConfig = Static<typeof GroupByConfigSchema>;

export const SortByConfigSchema = t.Object({
  field_key: t.String({ minLength: 1 }),
  direction: t.Optional(t.Union([t.Literal("ASC"), t.Literal("DESC")])),
});
export type SortByConfig = Static<typeof SortByConfigSchema>;

// =============================================================================
// Report Config (the core definition)
// =============================================================================

export const ReportConfigSchema = t.Object({
  columns: t.Array(ColumnConfigSchema, { minItems: 1 }),
  filters: t.Optional(t.Array(FilterConfigSchema)),
  groupBy: t.Optional(t.Array(GroupByConfigSchema)),
  sortBy: t.Optional(t.Array(SortByConfigSchema)),
  effectiveDate: t.Optional(
    t.Union([t.Literal("current"), t.Literal("as_of"), t.Literal("range")])
  ),
  effectiveDateValue: t.Optional(t.Unknown()),
  includeTerminated: t.Optional(t.Boolean()),
  distinctEmployees: t.Optional(t.Boolean()),
  limit: t.Optional(t.Union([t.Number(), t.Null()])),
  chartConfig: t.Optional(t.Unknown()),
});
export type ReportConfig = Static<typeof ReportConfigSchema>;

// =============================================================================
// Request/Response Schemas
// =============================================================================

export const CreateReportSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String()),
  report_type: t.Optional(ReportTypeSchema),
  category: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),
  config: ReportConfigSchema,
  chart_type: t.Optional(t.String()),
  chart_config: t.Optional(t.Unknown()),
  is_public: t.Optional(t.Boolean()),
});
export type CreateReport = Static<typeof CreateReportSchema>;

export const UpdateReportSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.String()),
  report_type: t.Optional(ReportTypeSchema),
  category: t.Optional(t.String()),
  tags: t.Optional(t.Array(t.String())),
  config: t.Optional(ReportConfigSchema),
  chart_type: t.Optional(t.Union([t.String(), t.Null()])),
  chart_config: t.Optional(t.Unknown()),
  is_public: t.Optional(t.Boolean()),
});
export type UpdateReport = Static<typeof UpdateReportSchema>;

export const ExecuteReportSchema = t.Object({
  parameters: t.Optional(t.Record(t.String(), t.Unknown())),
  effectiveDateOverride: t.Optional(t.String()),
});
export type ExecuteReport = Static<typeof ExecuteReportSchema>;

export const ScheduleReportSchema = t.Object({
  frequency: ScheduleFrequencySchema,
  cron: t.Optional(t.String()),
  time: t.Optional(t.String()),
  day_of_week: t.Optional(t.Number({ minimum: 0, maximum: 6 })),
  day_of_month: t.Optional(t.Number({ minimum: 1, maximum: 31 })),
  recipients: t.Array(
    t.Object({
      userId: t.Optional(t.String()),
      email: t.String(),
      deliveryMethod: t.Optional(
        t.Union([t.Literal("email"), t.Literal("in_app"), t.Literal("both")])
      ),
    }),
    { minItems: 1 }
  ),
  export_format: t.Optional(t.Union([t.Literal("xlsx"), t.Literal("csv"), t.Literal("pdf")])),
});
export type ScheduleReport = Static<typeof ScheduleReportSchema>;

export const ShareReportSchema = t.Object({
  shared_with: t.Array(
    t.Object({
      userId: t.String(),
      permission: t.Union([t.Literal("view"), t.Literal("edit")]),
    })
  ),
});
export type ShareReport = Static<typeof ShareReportSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ReportResponseSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  reportType: t.String(),
  status: t.String(),
  category: t.Union([t.String(), t.Null()]),
  tags: t.Array(t.String()),
  config: t.Unknown(),
  chartType: t.Union([t.String(), t.Null()]),
  chartConfig: t.Unknown(),
  isScheduled: t.Boolean(),
  isPublic: t.Boolean(),
  isSystem: t.Boolean(),
  createdBy: t.String(),
  lastRunAt: t.Union([t.String(), t.Null()]),
  runCount: t.Number(),
  avgExecutionMs: t.Union([t.Number(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const ReportListResponseSchema = t.Object({
  data: t.Array(ReportResponseSchema),
  total: t.Number(),
});

export const ReportExecutionResultSchema = t.Object({
  columns: t.Array(
    t.Object({
      key: t.String(),
      label: t.String(),
      dataType: t.String(),
      alignment: t.Optional(t.String()),
    })
  ),
  rows: t.Array(t.Record(t.String(), t.Unknown())),
  totalRows: t.Number(),
  executionMs: t.Number(),
  executionId: t.String(),
});

export const FieldCatalogEntrySchema = t.Object({
  fieldKey: t.String(),
  displayName: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.String(),
  dataType: t.String(),
  enumValues: t.Union([t.Array(t.String()), t.Null()]),
  isFilterable: t.Boolean(),
  isSortable: t.Boolean(),
  isGroupable: t.Boolean(),
  isAggregatable: t.Boolean(),
  supportedAggregations: t.Array(t.String()),
  filterOperators: t.Union([t.Array(t.String()), t.Null()]),
  isPii: t.Boolean(),
  isSensitive: t.Boolean(),
  isCalculated: t.Boolean(),
  displayOrder: t.Number(),
  columnWidth: t.Number(),
  textAlignment: t.String(),
  isDefaultVisible: t.Boolean(),
});

export const FieldCatalogResponseSchema = t.Object({
  fields: t.Array(FieldCatalogEntrySchema),
  categories: t.Array(
    t.Object({
      key: t.String(),
      label: t.String(),
      fieldCount: t.Number(),
    })
  ),
});

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: t.String(),
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  search: t.Optional(t.String()),
  category: t.Optional(t.String()),
  status: t.Optional(t.String()),
  type: t.Optional(t.String()),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const FieldValuesParamsSchema = t.Object({
  fieldKey: t.String(),
});

export const ExportFormatParamsSchema = t.Object({
  id: t.String(),
  format: t.Union([t.Literal("xlsx"), t.Literal("csv"), t.Literal("pdf")]),
});
