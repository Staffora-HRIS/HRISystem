/**
 * Gender Pay Gap Module - TypeBox Schemas
 *
 * Defines validation schemas for UK Gender Pay Gap reporting endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Covers all 6 required GPG metrics per the Equality Act 2010
 * (Gender Pay Gap Information) Regulations 2017.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Gender pay gap report status enum matching database type
 */
export const GpgReportStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("calculated"),
  t.Literal("published"),
]);

export type GpgReportStatus = Static<typeof GpgReportStatusSchema>;

/**
 * Sector type — determines snapshot date rules
 */
export const SectorTypeSchema = t.Union([
  t.Literal("private"),
  t.Literal("public"),
]);

export type SectorType = Static<typeof SectorTypeSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Date string schema (YYYY-MM-DD)
 */
export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Calculate gender pay gap request — takes explicit snapshot date
 */
export const CalculateGpgSchema = t.Object({
  snapshot_date: DateSchema,
  reporting_year: t.Number({ minimum: 2017, maximum: 2099 }),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CalculateGpg = Static<typeof CalculateGpgSchema>;

/**
 * Generate report request — auto-determines snapshot date from sector
 *
 * Snapshot dates:
 * - Private sector: 5 April of the reporting year
 * - Public sector: 31 March of the reporting year
 */
export const GenerateReportSchema = t.Object({
  reporting_year: t.Number({ minimum: 2017, maximum: 2099 }),
  sector: t.Optional(SectorTypeSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type GenerateReport = Static<typeof GenerateReportSchema>;

/**
 * Update report notes
 */
export const UpdateGpgNotesSchema = t.Object({
  notes: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
});

export type UpdateGpgNotes = Static<typeof UpdateGpgNotesSchema>;

/**
 * Publish report request (empty body, just triggers status transition)
 */
export const PublishGpgSchema = t.Object({});

export type PublishGpg = Static<typeof PublishGpgSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Report list filters
 */
export const GpgReportFiltersSchema = t.Object({
  status: t.Optional(GpgReportStatusSchema),
  reporting_year: t.Optional(t.Number({ minimum: 2017, maximum: 2099 })),
});

export type GpgReportFilters = Static<typeof GpgReportFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Full gender pay gap report response
 */
export const GpgReportResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  snapshot_date: t.String(),
  reporting_year: t.Number(),
  total_employees: t.Number(),
  male_count: t.Number(),
  female_count: t.Number(),
  mean_hourly_pay_gap: t.Union([t.Number(), t.Null()]),
  median_hourly_pay_gap: t.Union([t.Number(), t.Null()]),
  mean_bonus_gap: t.Union([t.Number(), t.Null()]),
  median_bonus_gap: t.Union([t.Number(), t.Null()]),
  male_bonus_pct: t.Union([t.Number(), t.Null()]),
  female_bonus_pct: t.Union([t.Number(), t.Null()]),
  lower_quartile_male_pct: t.Union([t.Number(), t.Null()]),
  lower_quartile_female_pct: t.Union([t.Number(), t.Null()]),
  lower_middle_quartile_male_pct: t.Union([t.Number(), t.Null()]),
  lower_middle_quartile_female_pct: t.Union([t.Number(), t.Null()]),
  upper_middle_quartile_male_pct: t.Union([t.Number(), t.Null()]),
  upper_middle_quartile_female_pct: t.Union([t.Number(), t.Null()]),
  upper_quartile_male_pct: t.Union([t.Number(), t.Null()]),
  upper_quartile_female_pct: t.Union([t.Number(), t.Null()]),
  status: GpgReportStatusSchema,
  published_at: t.Union([t.String(), t.Null()]),
  calculated_by: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type GpgReportResponse = Static<typeof GpgReportResponseSchema>;

/**
 * Report list item (summary view for list endpoints)
 */
export const GpgReportListItemSchema = t.Object({
  id: UuidSchema,
  snapshot_date: t.String(),
  reporting_year: t.Number(),
  total_employees: t.Number(),
  male_count: t.Number(),
  female_count: t.Number(),
  mean_hourly_pay_gap: t.Union([t.Number(), t.Null()]),
  median_hourly_pay_gap: t.Union([t.Number(), t.Null()]),
  mean_bonus_gap: t.Union([t.Number(), t.Null()]),
  median_bonus_gap: t.Union([t.Number(), t.Null()]),
  status: GpgReportStatusSchema,
  published_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type GpgReportListItem = Static<typeof GpgReportListItemSchema>;

/**
 * Paginated list response
 */
export const GpgReportListResponseSchema = t.Object({
  items: t.Array(GpgReportListItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Optional(t.Number()),
});

export type GpgReportListResponse = Static<typeof GpgReportListResponseSchema>;

/**
 * Year-over-year trend data for a single metric
 */
const TrendPointSchema = t.Object({
  reporting_year: t.Number(),
  value: t.Union([t.Number(), t.Null()]),
});

/**
 * Dashboard response — summary with trends across years
 */
export const GpgDashboardResponseSchema = t.Object({
  /** Latest report (if any) */
  latest_report: t.Union([GpgReportResponseSchema, t.Null()]),

  /** Total number of reports generated */
  total_reports: t.Number(),

  /** Number of published reports */
  published_reports: t.Number(),

  /** Year-over-year mean hourly pay gap trend */
  mean_pay_gap_trend: t.Array(TrendPointSchema),

  /** Year-over-year median hourly pay gap trend */
  median_pay_gap_trend: t.Array(TrendPointSchema),

  /** Year-over-year mean bonus gap trend */
  mean_bonus_gap_trend: t.Array(TrendPointSchema),

  /** Year-over-year median bonus gap trend */
  median_bonus_gap_trend: t.Array(TrendPointSchema),

  /** Quartile trend: % female in upper quartile over time */
  upper_quartile_female_trend: t.Array(TrendPointSchema),

  /** Whether the organisation meets the 250+ employee threshold */
  meets_reporting_threshold: t.Boolean(),

  /** Current total employee count */
  current_employee_count: t.Number(),
});

export type GpgDashboardResponse = Static<typeof GpgDashboardResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Idempotency key header (optional)
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
