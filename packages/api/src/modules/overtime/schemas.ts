/**
 * Overtime Module Schemas
 *
 * TypeBox schemas for request/response validation in overtime rule management
 * and overtime calculation operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });
export const DateTimeSchema = t.String({ format: "date-time" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const OvertimeDayTypeSchema = t.Union([
  t.Literal("weekday"),
  t.Literal("weekend"),
  t.Literal("bank_holiday"),
]);
export type OvertimeDayType = Static<typeof OvertimeDayTypeSchema>;

// =============================================================================
// Applies-To Scope Schema
// =============================================================================

export const AppliesToSchema = t.Optional(
  t.Object({
    departmentIds: t.Optional(t.Array(UuidSchema)),
    roleIds: t.Optional(t.Array(UuidSchema)),
  })
);
export type AppliesTo = Static<typeof AppliesToSchema>;

// =============================================================================
// Overtime Rule Schemas
// =============================================================================

export const CreateOvertimeRuleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  dayType: OvertimeDayTypeSchema,
  thresholdHoursWeekly: t.Number({ minimum: 0, maximum: 168 }),
  rateMultiplier: t.Number({ minimum: 0.01, maximum: 99.99 }),
  isActive: t.Optional(t.Boolean({ default: true })),
  appliesTo: AppliesToSchema,
  effectiveFrom: DateSchema,
  effectiveTo: t.Optional(t.Nullable(DateSchema)),
});
export type CreateOvertimeRule = Static<typeof CreateOvertimeRuleSchema>;

export const UpdateOvertimeRuleSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    description: t.Nullable(t.String({ maxLength: 2000 })),
    dayType: OvertimeDayTypeSchema,
    thresholdHoursWeekly: t.Number({ minimum: 0, maximum: 168 }),
    rateMultiplier: t.Number({ minimum: 0.01, maximum: 99.99 }),
    isActive: t.Boolean(),
    appliesTo: AppliesToSchema,
    effectiveFrom: DateSchema,
    effectiveTo: t.Nullable(DateSchema),
  })
);
export type UpdateOvertimeRule = Static<typeof UpdateOvertimeRuleSchema>;

export const OvertimeRuleResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Nullable(t.String()),
  dayType: OvertimeDayTypeSchema,
  thresholdHoursWeekly: t.Number(),
  rateMultiplier: t.Number(),
  isActive: t.Boolean(),
  appliesTo: t.Any(),
  effectiveFrom: t.String(),
  effectiveTo: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type OvertimeRuleResponse = Static<typeof OvertimeRuleResponseSchema>;

export const OvertimeRuleFiltersSchema = t.Object({
  dayType: t.Optional(OvertimeDayTypeSchema),
  isActive: t.Optional(t.BooleanString()),
  effectiveDate: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});
export type OvertimeRuleFilters = Static<typeof OvertimeRuleFiltersSchema>;

// =============================================================================
// Overtime Calculation Schemas
// =============================================================================

export const OvertimeCalculateQuerySchema = t.Object({
  employeeId: UuidSchema,
  periodStart: DateSchema,
  periodEnd: DateSchema,
});
export type OvertimeCalculateQuery = Static<typeof OvertimeCalculateQuerySchema>;

export const OvertimeCalculationBreakdownSchema = t.Object({
  ruleId: UuidSchema,
  ruleName: t.String(),
  dayType: OvertimeDayTypeSchema,
  thresholdHoursWeekly: t.Number(),
  rateMultiplier: t.Number(),
  overtimeHours: t.Number(),
  overtimePayUnits: t.Number(),
});
export type OvertimeCalculationBreakdown = Static<typeof OvertimeCalculationBreakdownSchema>;

export const OvertimeCalculationResponseSchema = t.Object({
  employeeId: UuidSchema,
  periodStart: t.String(),
  periodEnd: t.String(),
  totalHoursWorked: t.Number(),
  regularHours: t.Number(),
  totalOvertimeHours: t.Number(),
  totalOvertimePayUnits: t.Number(),
  weekdayHours: t.Number(),
  weekendHours: t.Number(),
  bankHolidayHours: t.Number(),
  breakdown: t.Array(OvertimeCalculationBreakdownSchema),
  calculatedAt: t.String(),
});
export type OvertimeCalculationResponse = Static<typeof OvertimeCalculationResponseSchema>;

// =============================================================================
// Params & Headers
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
