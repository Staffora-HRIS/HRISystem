/**
 * Secondment Module - TypeBox Schemas
 *
 * Defines validation schemas for secondment management API endpoints.
 * Supports tracking employee secondments between home and host departments
 * (internal) or to external organisations (external secondments).
 *
 * State machine: planned -> active -> extended/completed/cancelled
 *
 * Tables: secondments
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const SecondmentStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("extended"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type SecondmentStatus = Static<typeof SecondmentStatusSchema>;

// =============================================================================
// Terms Schema (JSONB structure)
// =============================================================================

export const SecondmentTermsSchema = t.Optional(
  t.Object({
    pay_arrangements: t.Optional(t.String({ maxLength: 5000 })),
    reporting_line: t.Optional(t.String({ maxLength: 2000 })),
    objectives: t.Optional(t.String({ maxLength: 5000 })),
    benefits_continuation: t.Optional(t.String({ maxLength: 2000 })),
    return_guarantee: t.Optional(t.Boolean()),
    notes: t.Optional(t.String({ maxLength: 10000 })),
  })
);
export type SecondmentTerms = Static<typeof SecondmentTermsSchema>;

// =============================================================================
// Secondment Schemas
// =============================================================================

export const CreateSecondmentSchema = t.Object({
  employee_id: UuidSchema,
  home_department_id: UuidSchema,
  host_department_id: UuidSchema,
  host_organisation: t.Optional(t.String({ maxLength: 255 })),
  start_date: DateSchema,
  expected_end_date: DateSchema,
  terms: SecondmentTermsSchema,
});
export type CreateSecondment = Static<typeof CreateSecondmentSchema>;

export const UpdateSecondmentSchema = t.Partial(
  t.Object({
    host_department_id: UuidSchema,
    host_organisation: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    start_date: DateSchema,
    expected_end_date: DateSchema,
    terms: t.Union([
      t.Object({
        pay_arrangements: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
        reporting_line: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        objectives: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
        benefits_continuation: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
        return_guarantee: t.Optional(t.Union([t.Boolean(), t.Null()])),
        notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
      }),
      t.Null(),
    ]),
  })
);
export type UpdateSecondment = Static<typeof UpdateSecondmentSchema>;

export const ExtendSecondmentSchema = t.Object({
  expected_end_date: DateSchema,
  reason: t.Optional(t.String({ maxLength: 5000 })),
});
export type ExtendSecondment = Static<typeof ExtendSecondmentSchema>;

export const CompleteSecondmentSchema = t.Object({
  actual_end_date: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type CompleteSecondment = Static<typeof CompleteSecondmentSchema>;

export const CancelSecondmentSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 5000 })),
});
export type CancelSecondment = Static<typeof CancelSecondmentSchema>;

export const ActivateSecondmentSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type ActivateSecondment = Static<typeof ActivateSecondmentSchema>;

/**
 * POST /secondments/:id/transition - Transition a secondment to a new status.
 *
 * Valid transitions:
 *   planned -> active / cancelled
 *   active  -> extended / completed / cancelled
 *   extended -> completed / cancelled
 */
export const SecondmentStatusTransitionSchema = t.Object({
  status: SecondmentStatusSchema,
  actual_end_date: t.Optional(DateSchema),
  expected_end_date: t.Optional(DateSchema),
  reason: t.Optional(t.String({ maxLength: 5000 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});
export type SecondmentStatusTransition = Static<typeof SecondmentStatusTransitionSchema>;

export const SecondmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  home_department_id: UuidSchema,
  home_department_name: t.Optional(t.String()),
  host_department_id: UuidSchema,
  host_department_name: t.Optional(t.String()),
  host_organisation: t.Union([t.String(), t.Null()]),
  start_date: t.String(),
  expected_end_date: t.String(),
  actual_end_date: t.Union([t.String(), t.Null()]),
  terms: t.Union([t.Object({}), t.Null()]),
  status: SecondmentStatusSchema,
  created_by: t.Union([UuidSchema, t.Null()]),
  approved_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type SecondmentResponse = Static<typeof SecondmentResponseSchema>;

export const SecondmentFiltersSchema = t.Object({
  status: t.Optional(SecondmentStatusSchema),
  employee_id: t.Optional(UuidSchema),
  home_department_id: t.Optional(UuidSchema),
  host_department_id: t.Optional(UuidSchema),
  active_on: t.Optional(t.String({ format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type SecondmentFilters = Static<typeof SecondmentFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
