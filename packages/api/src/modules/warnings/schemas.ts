/**
 * Warnings Module - TypeBox Schemas
 *
 * Defines validation schemas for all Warning Management API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Warning level enum matching database type
 */
export const WarningLevelSchema = t.Union([
  t.Literal("verbal"),
  t.Literal("first_written"),
  t.Literal("final_written"),
]);

export type WarningLevel = Static<typeof WarningLevelSchema>;

/**
 * Warning status enum matching database type
 */
export const WarningStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("expired"),
  t.Literal("rescinded"),
  t.Literal("appealed"),
]);

export type WarningStatus = Static<typeof WarningStatusSchema>;

/**
 * Appeal outcome enum
 */
export const AppealOutcomeSchema = t.Union([
  t.Literal("upheld"),
  t.Literal("overturned"),
  t.Literal("modified"),
]);

export type AppealOutcome = Static<typeof AppealOutcomeSchema>;

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
 * Issue warning request
 */
export const IssueWarningSchema = t.Object({
  employee_id: UuidSchema,
  case_id: t.Optional(UuidSchema),
  warning_level: WarningLevelSchema,
  issued_date: DateSchema,
  expiry_date: t.Optional(DateSchema),
  reason: t.String({ minLength: 1, maxLength: 5000 }),
  details: t.Optional(t.String({ maxLength: 10000 })),
  hearing_date: t.Optional(DateSchema),
  companion_present: t.Optional(t.Boolean()),
  companion_name: t.Optional(t.String({ maxLength: 255 })),
  appeal_deadline: t.Optional(DateSchema),
});

export type IssueWarning = Static<typeof IssueWarningSchema>;

/**
 * Appeal warning request
 */
export const AppealWarningSchema = t.Object({
  appeal_date: DateSchema,
  appeal_notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type AppealWarning = Static<typeof AppealWarningSchema>;

/**
 * Resolve appeal request (set outcome)
 */
export const ResolveAppealSchema = t.Object({
  appeal_outcome: AppealOutcomeSchema,
  appeal_notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type ResolveAppeal = Static<typeof ResolveAppealSchema>;

/**
 * Rescind warning request
 */
export const RescindWarningSchema = t.Object({
  rescinded_reason: t.String({ minLength: 1, maxLength: 5000 }),
});

export type RescindWarning = Static<typeof RescindWarningSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Warning response
 */
export const WarningResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  case_id: t.Union([UuidSchema, t.Null()]),
  warning_level: WarningLevelSchema,
  status: WarningStatusSchema,
  issued_date: t.String(),
  expiry_date: t.String(),
  issued_by: t.String(),
  reason: t.String(),
  details: t.Union([t.String(), t.Null()]),
  hearing_date: t.Union([t.String(), t.Null()]),
  companion_present: t.Boolean(),
  companion_name: t.Union([t.String(), t.Null()]),
  appeal_deadline: t.Union([t.String(), t.Null()]),
  appealed: t.Boolean(),
  appeal_date: t.Union([t.String(), t.Null()]),
  appeal_outcome: t.Union([t.String(), t.Null()]),
  appeal_notes: t.Union([t.String(), t.Null()]),
  rescinded_date: t.Union([t.String(), t.Null()]),
  rescinded_by: t.Union([t.String(), t.Null()]),
  rescinded_reason: t.Union([t.String(), t.Null()]),
  employee_name: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type WarningResponse = Static<typeof WarningResponseSchema>;

/**
 * Warning list response
 */
export const WarningListResponseSchema = t.Object({
  items: t.Array(WarningResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type WarningListResponse = Static<typeof WarningListResponseSchema>;

/**
 * Warning filters for list endpoint
 */
export const WarningFiltersSchema = t.Object({
  status: t.Optional(WarningStatusSchema),
  warning_level: t.Optional(WarningLevelSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type WarningFilters = Static<typeof WarningFiltersSchema>;

/**
 * Expired warnings batch result
 */
export const ExpiredWarningsResultSchema = t.Object({
  expired_count: t.Number(),
  warnings: t.Array(t.Object({
    id: UuidSchema,
    employee_id: UuidSchema,
    warning_level: WarningLevelSchema,
    expiry_date: t.String(),
  })),
});

export type ExpiredWarningsResult = Static<typeof ExpiredWarningsResultSchema>;

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
 * Employee ID parameter
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
