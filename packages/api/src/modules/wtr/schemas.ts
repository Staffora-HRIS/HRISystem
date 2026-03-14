/**
 * Working Time Regulations Module - TypeBox Schemas
 *
 * Defines validation schemas for all WTR API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK Working Time Regulations 1998:
 * - Maximum 48-hour average working week (17-week reference period)
 * - Workers can opt out voluntarily in writing
 * - Minimum daily rest: 11 consecutive hours in each 24-hour period
 * - Minimum weekly rest: 24 hours uninterrupted in each 7-day period (or 48 in 14 days)
 * - Rest breaks: 20 minutes if daily working time > 6 hours
 * - Night workers: max 8 hours average in each 24 hours (17-week period)
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/**
 * UK Working Time Regulations configuration constants
 */
export const WTR_CONSTANTS = {
  /** Maximum average weekly hours (without opt-out) */
  MAX_WEEKLY_HOURS: 48,
  /** Warning threshold for weekly hours */
  WARNING_WEEKLY_HOURS: 44,
  /** Reference period in weeks for average calculation */
  REFERENCE_PERIOD_WEEKS: 17,
  /** Minimum daily rest period in hours */
  MIN_DAILY_REST_HOURS: 11,
  /** Minimum weekly rest period in hours */
  MIN_WEEKLY_REST_HOURS: 24,
  /** Alternative fortnightly rest period in hours (48 hours in 14 days) */
  MIN_FORTNIGHTLY_REST_HOURS: 48,
  /** Minimum break after 6 hours of work, in minutes */
  MIN_BREAK_MINUTES: 20,
  /** Daily working threshold before break is required, in hours */
  BREAK_THRESHOLD_HOURS: 6,
  /** Night worker maximum average hours per 24-hour period */
  NIGHT_WORKER_MAX_HOURS: 8,
  /** Maximum notice period in weeks for opt-in (revoking opt-out) */
  MAX_OPT_IN_NOTICE_WEEKS: 13,
} as const;

// =============================================================================
// Enums
// =============================================================================

/**
 * WTR opt-out status enum matching database type
 */
export const WtrOptOutStatusSchema = t.Union(
  [t.Literal("active"), t.Literal("revoked")],
  { description: "Opt-out agreement status" }
);
export type WtrOptOutStatus = Static<typeof WtrOptOutStatusSchema>;

/**
 * WTR alert type enum matching database type
 */
export const WtrAlertTypeSchema = t.Union(
  [
    t.Literal("weekly_hours_exceeded"),
    t.Literal("weekly_hours_warning"),
    t.Literal("daily_rest_violation"),
    t.Literal("weekly_rest_violation"),
    t.Literal("break_violation"),
    t.Literal("night_worker_exceeded"),
  ],
  { description: "Type of working time regulation alert" }
);
export type WtrAlertType = Static<typeof WtrAlertTypeSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  description: "UUID v4 identifier",
});

export const DateSchema = t.String({
  format: "date",
  description: "ISO 8601 date (YYYY-MM-DD)",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ description: "Cursor for pagination" })),
  limit: t.Optional(
    t.Number({ minimum: 1, maximum: 100, description: "Items per page" })
  ),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});
export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});
export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;

// =============================================================================
// Opt-Out Request Schemas
// =============================================================================

/**
 * Schema for creating a new opt-out agreement
 */
export const CreateOptOutSchema = t.Object({
  employeeId: UuidSchema,
  optOutDate: DateSchema,
  noticePeriodWeeks: t.Optional(
    t.Number({
      minimum: 0,
      maximum: 13,
      default: 0,
      description:
        "Notice period in weeks if the employee later revokes (max 13 / ~3 months)",
    })
  ),
  signedDocumentKey: t.Optional(
    t.String({
      maxLength: 500,
      description: "Reference to signed opt-out document",
    })
  ),
});
export type CreateOptOut = Static<typeof CreateOptOutSchema>;

/**
 * Schema for revoking an opt-out (opting back in)
 */
export const RevokeOptOutSchema = t.Object({
  optInDate: DateSchema,
});
export type RevokeOptOut = Static<typeof RevokeOptOutSchema>;

// =============================================================================
// Opt-Out Filter Schemas
// =============================================================================

export const OptOutFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(WtrOptOutStatusSchema),
});
export type OptOutFilters = Static<typeof OptOutFiltersSchema>;

// =============================================================================
// Alert Filter Schemas
// =============================================================================

export const AlertFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  alertType: t.Optional(WtrAlertTypeSchema),
  acknowledged: t.Optional(t.Boolean()),
  from: t.Optional(DateSchema),
  to: t.Optional(DateSchema),
});
export type AlertFilters = Static<typeof AlertFiltersSchema>;

// =============================================================================
// Opt-Out Response Schemas
// =============================================================================

export const OptOutResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  optedOut: t.Boolean(),
  optOutDate: t.String(),
  optInDate: t.Union([t.String(), t.Null()]),
  noticePeriodWeeks: t.Number(),
  signedDocumentKey: t.Union([t.String(), t.Null()]),
  status: WtrOptOutStatusSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type OptOutResponse = Static<typeof OptOutResponseSchema>;

// =============================================================================
// Alert Response Schemas
// =============================================================================

export const AlertResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  alertType: WtrAlertTypeSchema,
  referencePeriodStart: t.String(),
  referencePeriodEnd: t.String(),
  actualValue: t.Number(),
  thresholdValue: t.Number(),
  details: t.Record(t.String(), t.Unknown()),
  acknowledged: t.Boolean(),
  acknowledgedBy: t.Union([UuidSchema, t.Null()]),
  acknowledgedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});
export type AlertResponse = Static<typeof AlertResponseSchema>;

// =============================================================================
// Compliance Report Response Schemas
// =============================================================================

export const EmployeeWorkingTimeStatusSchema = t.Object({
  employeeId: UuidSchema,
  employeeName: t.Union([t.String(), t.Null()]),
  employeeNumber: t.Union([t.String(), t.Null()]),
  averageWeeklyHours: t.Number(),
  referencePeriodWeeks: t.Number(),
  referencePeriodStart: t.String(),
  referencePeriodEnd: t.String(),
  hasOptOut: t.Boolean(),
  optOutStatus: t.Union([WtrOptOutStatusSchema, t.Null()]),
  isCompliant: t.Boolean(),
  alerts: t.Array(AlertResponseSchema),
  weeklyBreakdown: t.Array(
    t.Object({
      weekStart: t.String(),
      weekEnd: t.String(),
      totalHours: t.Number(),
    })
  ),
});
export type EmployeeWorkingTimeStatus = Static<
  typeof EmployeeWorkingTimeStatusSchema
>;

export const ComplianceReportSchema = t.Object({
  totalEmployees: t.Number(),
  employeesOverThreshold: t.Number(),
  employeesWithOptOut: t.Number(),
  employeesInWarningZone: t.Number(),
  unacknowledgedAlerts: t.Number(),
  alertsByType: t.Record(t.String(), t.Number()),
  referencePeriodStart: t.String(),
  referencePeriodEnd: t.String(),
  generatedAt: t.String(),
});
export type ComplianceReport = Static<typeof ComplianceReportSchema>;
