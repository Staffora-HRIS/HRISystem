/**
 * Usage Stats Module - TypeBox Schemas
 *
 * Defines validation schemas for per-tenant usage analytics endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Query Schemas
// =============================================================================

/**
 * Period granularity for usage stats
 */
export const UsagePeriodSchema = t.Union([
  t.Literal("daily"),
  t.Literal("monthly"),
]);

export type UsagePeriod = Static<typeof UsagePeriodSchema>;

/**
 * Query parameters for GET /system/usage
 */
export const UsageStatsQuerySchema = t.Object({
  period: t.Optional(UsagePeriodSchema),
  start_date: t.Optional(t.String({ format: "date" })),
  end_date: t.Optional(t.String({ format: "date" })),
  limit: t.Optional(
    t.Number({ minimum: 1, maximum: 100, default: 30 })
  ),
});

export type UsageStatsQuery = Static<typeof UsageStatsQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Module-level usage breakdown entry
 */
export const ModuleUsageEntrySchema = t.Object({
  module: t.String(),
  requests: t.Number(),
});

export type ModuleUsageEntry = Static<typeof ModuleUsageEntrySchema>;

/**
 * Single usage stats record
 */
export const UsageStatsRecordSchema = t.Object({
  id: t.String({ format: "uuid" }),
  tenant_id: t.String({ format: "uuid" }),
  period_start: t.String({ format: "date" }),
  period_end: t.String({ format: "date" }),
  active_users: t.Number(),
  api_requests: t.Number(),
  storage_bytes: t.Number(),
  employee_count: t.Number(),
  module_usage: t.Record(t.String(), t.Number()),
  created_at: t.String(),
});

export type UsageStatsRecord = Static<typeof UsageStatsRecordSchema>;

/**
 * Monthly aggregated usage record (computed from daily rows)
 */
export const MonthlyUsageStatsSchema = t.Object({
  period_start: t.String({ format: "date" }),
  period_end: t.String({ format: "date" }),
  active_users: t.Number(),
  total_api_requests: t.Number(),
  avg_daily_api_requests: t.Number(),
  max_storage_bytes: t.Number(),
  avg_employee_count: t.Number(),
  days_tracked: t.Number(),
});

export type MonthlyUsageStats = Static<typeof MonthlyUsageStatsSchema>;

/**
 * Usage stats list response
 */
export const UsageStatsResponseSchema = t.Object({
  items: t.Array(UsageStatsRecordSchema),
  period: t.String(),
  total_items: t.Number(),
});

export type UsageStatsResponse = Static<typeof UsageStatsResponseSchema>;

/**
 * Monthly usage stats list response
 */
export const MonthlyUsageStatsResponseSchema = t.Object({
  items: t.Array(MonthlyUsageStatsSchema),
  period: t.Literal("monthly"),
  total_items: t.Number(),
});

export type MonthlyUsageStatsResponse = Static<typeof MonthlyUsageStatsResponseSchema>;
