/**
 * Overtime Rules Module - TypeBox Schemas
 *
 * Defines validation schemas for overtime rule configuration and
 * overtime calculation endpoints.
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Overtime calculation status lifecycle:
 *   calculated -> approved -> paid
 */
export const OvertimeCalculationStatusSchema = t.Union([
  t.Literal("calculated"),
  t.Literal("approved"),
  t.Literal("paid"),
]);

export type OvertimeCalculationStatus = Static<typeof OvertimeCalculationStatusSchema>;

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
// Overtime Rule Schemas
// =============================================================================

/**
 * Create a new overtime rule
 */
export const CreateOvertimeRuleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  thresholdHoursWeekly: t.Number({ minimum: 0, maximum: 168 }),
  rateMultiplier: t.Number({ minimum: 0.01, maximum: 10 }),
  appliesToRoles: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 100 }))),
  effectiveFrom: DateSchema,
  effectiveTo: t.Optional(t.Union([DateSchema, t.Null()])),
  isActive: t.Optional(t.Boolean({ default: true })),
});

export type CreateOvertimeRule = Static<typeof CreateOvertimeRuleSchema>;

/**
 * Update an existing overtime rule
 */
export const UpdateOvertimeRuleSchema = t.Partial(CreateOvertimeRuleSchema);

export type UpdateOvertimeRule = Static<typeof UpdateOvertimeRuleSchema>;

/**
 * Overtime rule response
 */
export const OvertimeRuleResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  thresholdHoursWeekly: t.Number(),
  rateMultiplier: t.Number(),
  appliesToRoles: t.Union([t.Array(t.String()), t.Null()]),
  effectiveFrom: t.String(),
  effectiveTo: t.Union([t.String(), t.Null()]),
  isActive: t.Boolean(),
  createdBy: t.Union([UuidSchema, t.Null()]),
  updatedBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type OvertimeRuleResponse = Static<typeof OvertimeRuleResponseSchema>;

/**
 * Overtime rule list filters
 */
export const OvertimeRuleFiltersSchema = t.Object({
  isActive: t.Optional(t.Boolean()),
  effectiveDate: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});

export type OvertimeRuleFilters = Static<typeof OvertimeRuleFiltersSchema>;

// =============================================================================
// Overtime Calculation Schemas
// =============================================================================

/**
 * Overtime calculation response
 */
export const OvertimeCalculationResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  ruleId: t.Union([UuidSchema, t.Null()]),
  periodStart: t.String(),
  periodEnd: t.String(),
  regularHours: t.Number(),
  overtimeHours: t.Number(),
  overtimeRate: t.Number(),
  hourlyRate: t.Number(),
  overtimeAmount: t.Number(),
  totalHours: t.Number(),
  status: OvertimeCalculationStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  calculatedBy: t.Union([UuidSchema, t.Null()]),
  approvedBy: t.Union([UuidSchema, t.Null()]),
  approvedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type OvertimeCalculationResponse = Static<typeof OvertimeCalculationResponseSchema>;

/**
 * Request to calculate overtime for a single employee
 */
export const CalculateOvertimeQuerySchema = t.Object({
  periodStart: DateSchema,
  periodEnd: DateSchema,
  hourlyRate: t.Optional(t.Number({ minimum: 0 })),
});

export type CalculateOvertimeQuery = Static<typeof CalculateOvertimeQuerySchema>;

/**
 * Request to batch calculate overtime for all employees in a period
 */
export const BatchCalculateOvertimeSchema = t.Object({
  periodStart: DateSchema,
  periodEnd: DateSchema,
});

export type BatchCalculateOvertime = Static<typeof BatchCalculateOvertimeSchema>;

/**
 * Batch calculation response
 */
export const BatchCalculateResponseSchema = t.Object({
  periodStart: t.String(),
  periodEnd: t.String(),
  employeesProcessed: t.Number(),
  calculationsCreated: t.Number(),
  calculations: t.Array(OvertimeCalculationResponseSchema),
});

export type BatchCalculateResponse = Static<typeof BatchCalculateResponseSchema>;

/**
 * Overtime calculation list filters
 */
export const OvertimeCalculationFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(OvertimeCalculationStatusSchema),
  periodStart: t.Optional(DateSchema),
  periodEnd: t.Optional(DateSchema),
  ...PaginationQuerySchema.properties,
});

export type OvertimeCalculationFilters = Static<typeof OvertimeCalculationFiltersSchema>;

/**
 * Approve overtime calculation request body
 */
export const ApproveOvertimeCalculationSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 1000 })),
});

export type ApproveOvertimeCalculation = Static<typeof ApproveOvertimeCalculationSchema>;

// =============================================================================
// Params Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
