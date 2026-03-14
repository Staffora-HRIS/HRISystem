/**
 * Unpaid Parental Leave Module - TypeBox Schemas
 *
 * Defines validation schemas for all Parental Leave API endpoints.
 * UK Employment Rights Act 1996, Part VIII & Maternity and Parental Leave
 * etc. Regulations 1999.
 *
 * Rules enforced:
 * - 18 weeks per child (up to age 18)
 * - Minimum 1-week blocks
 * - Maximum 4 weeks per year per child
 * - 21 days' notice required
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Booking status enum matching database CHECK constraint
 */
export const BookingStatusSchema = t.Union([
  t.Literal("requested"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

export type BookingStatus = Static<typeof BookingStatusSchema>;

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

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Entitlement Schemas
// =============================================================================

/**
 * Register a child for parental leave entitlement
 */
export const CreateEntitlementSchema = t.Object({
  employee_id: UuidSchema,
  child_name: t.String({ minLength: 1, maxLength: 255 }),
  child_date_of_birth: DateSchema,
  total_weeks_entitled: t.Optional(
    t.Number({ minimum: 0, maximum: 18, default: 18 })
  ),
});

export type CreateEntitlement = Static<typeof CreateEntitlementSchema>;

/**
 * Entitlement response
 */
export const EntitlementResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  employee_id: t.String(),
  child_name: t.String(),
  child_date_of_birth: t.String(),
  total_weeks_entitled: t.Number(),
  weeks_used: t.Number(),
  weeks_remaining: t.Number(),
  child_age_years: t.Number(),
  is_eligible: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EntitlementResponse = Static<typeof EntitlementResponseSchema>;

// =============================================================================
// Booking Schemas
// =============================================================================

/**
 * Create a parental leave booking
 */
export const CreateBookingSchema = t.Object({
  employee_id: UuidSchema,
  entitlement_id: UuidSchema,
  weeks_booked: t.Number({ minimum: 1, maximum: 4 }),
  start_date: DateSchema,
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreateBooking = Static<typeof CreateBookingSchema>;

/**
 * Booking filters for list endpoint
 */
export const BookingFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  entitlement_id: t.Optional(UuidSchema),
  status: t.Optional(BookingStatusSchema),
});

export type BookingFilters = Static<typeof BookingFiltersSchema>;

/**
 * Booking response
 */
export const BookingResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  employee_id: t.String(),
  entitlement_id: t.String(),
  leave_year_start: t.String(),
  weeks_booked: t.Number(),
  start_date: t.String(),
  end_date: t.String(),
  status: t.String(),
  approved_by: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  child_name: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type BookingResponse = Static<typeof BookingResponseSchema>;

/**
 * Approve/reject booking - optional notes
 */
export const BookingDecisionSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type BookingDecision = Static<typeof BookingDecisionSchema>;
