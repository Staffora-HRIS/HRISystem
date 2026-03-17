/**
 * Payroll Config Module - TypeBox Schemas
 *
 * Defines validation schemas for pay schedule, employee pay assignment,
 * and NI category API endpoints.
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Pay frequency enum matching the app.pay_frequency database type
 */
export const PayFrequencySchema = t.Union([
  t.Literal("weekly"),
  t.Literal("fortnightly"),
  t.Literal("four_weekly"),
  t.Literal("monthly"),
  t.Literal("annually"),
]);

export type PayFrequency = Static<typeof PayFrequencySchema>;

/**
 * Valid UK HMRC NI category letters
 */
export const NiCategoryLetterSchema = t.String({
  pattern: "^[ABCFHIJLMSVZ]$",
  minLength: 1,
  maxLength: 1,
  description: "HMRC National Insurance category letter",
});

export type NiCategoryLetter = Static<typeof NiCategoryLetterSchema>;

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

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Pay Schedule Schemas
// =============================================================================

/**
 * Create pay schedule request
 */
export const CreatePayScheduleSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  frequency: PayFrequencySchema,
  pay_day_of_week: t.Optional(t.Number({ minimum: 0, maximum: 6 })),
  pay_day_of_month: t.Optional(t.Number({ minimum: 1, maximum: 31 })),
  tax_week_start: t.Optional(DateSchema),
  is_default: t.Optional(t.Boolean()),
});

export type CreatePaySchedule = Static<typeof CreatePayScheduleSchema>;

/**
 * Update pay schedule request
 */
export const UpdatePayScheduleSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    frequency: PayFrequencySchema,
    pay_day_of_week: t.Union([t.Number({ minimum: 0, maximum: 6 }), t.Null()]),
    pay_day_of_month: t.Union([t.Number({ minimum: 1, maximum: 31 }), t.Null()]),
    tax_week_start: t.Union([DateSchema, t.Null()]),
    is_default: t.Boolean(),
  })
);

export type UpdatePaySchedule = Static<typeof UpdatePayScheduleSchema>;

/**
 * Pay schedule response
 */
export const PayScheduleResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  frequency: PayFrequencySchema,
  pay_day_of_week: t.Union([t.Number(), t.Null()]),
  pay_day_of_month: t.Union([t.Number(), t.Null()]),
  tax_week_start: t.Union([t.String(), t.Null()]),
  is_default: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayScheduleResponse = Static<typeof PayScheduleResponseSchema>;

// =============================================================================
// Employee Pay Assignment Schemas
// =============================================================================

/**
 * Create employee pay assignment request
 */
export const CreatePayAssignmentSchema = t.Object({
  employee_id: UuidSchema,
  pay_schedule_id: UuidSchema,
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
});

export type CreatePayAssignment = Static<typeof CreatePayAssignmentSchema>;

/**
 * Update employee pay assignment request (partial update).
 *
 * Common use cases:
 * - End an assignment by setting effective_to
 * - Change the pay schedule (reassign)
 * - Adjust effective dates
 */
export const UpdatePayAssignmentSchema = t.Partial(
  t.Object({
    pay_schedule_id: UuidSchema,
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
  })
);

export type UpdatePayAssignment = Static<typeof UpdatePayAssignmentSchema>;

/**
 * Assignment ID + Employee ID compound params for nested routes
 */
export const AssignmentIdParamsSchema = t.Object({
  employeeId: UuidSchema,
  assignmentId: UuidSchema,
});

export type AssignmentIdParams = Static<typeof AssignmentIdParamsSchema>;

/**
 * Employee pay assignment response
 */
export const PayAssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  pay_schedule_id: UuidSchema,
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Joined fields (optional, present in list queries)
  schedule_name: t.Optional(t.String()),
  schedule_frequency: t.Optional(PayFrequencySchema),
});

export type PayAssignmentResponse = Static<typeof PayAssignmentResponseSchema>;

// =============================================================================
// NI Category Schemas
// =============================================================================

/**
 * Create/set NI category request
 */
export const CreateNiCategorySchema = t.Object({
  employee_id: UuidSchema,
  category_letter: NiCategoryLetterSchema,
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});

export type CreateNiCategory = Static<typeof CreateNiCategorySchema>;

/**
 * Update NI category request (partial update)
 */
export const UpdateNiCategorySchema = t.Partial(
  t.Object({
    category_letter: NiCategoryLetterSchema,
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    notes: t.Union([t.String({ maxLength: 2000 }), t.Null()]),
  })
);

export type UpdateNiCategory = Static<typeof UpdateNiCategorySchema>;

/**
 * NI category response
 */
export const NiCategoryResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  category_letter: t.String(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type NiCategoryResponse = Static<typeof NiCategoryResponseSchema>;
