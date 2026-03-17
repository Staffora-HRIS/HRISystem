/**
 * Employee Change Requests Module - TypeBox Schemas
 *
 * Validation schemas for employee self-service change request endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const ChangeRequestStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

export type ChangeRequestStatus = Static<typeof ChangeRequestStatusSchema>;

export const FieldCategorySchema = t.Union([
  t.Literal("personal"),
  t.Literal("bank_details"),
  t.Literal("contact"),
  t.Literal("address"),
  t.Literal("emergency_contact"),
]);

export type FieldCategory = Static<typeof FieldCategorySchema>;

// =============================================================================
// Common Schemas
// =============================================================================

const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a change request (employee self-service)
 */
export const CreateChangeRequestSchema = t.Object({
  field_category: FieldCategorySchema,
  field_name: t.String({ minLength: 1, maxLength: 100 }),
  old_value: t.Optional(t.Union([t.String(), t.Null()])),
  new_value: t.String({ minLength: 1 }),
});

export type CreateChangeRequest = Static<typeof CreateChangeRequestSchema>;

/**
 * Submit multiple field changes at once (e.g., name change = first_name + last_name)
 */
export const CreateBulkChangeRequestSchema = t.Object({
  changes: t.Array(CreateChangeRequestSchema, { minItems: 1, maxItems: 20 }),
});

export type CreateBulkChangeRequest = Static<typeof CreateBulkChangeRequestSchema>;

/**
 * Review (approve/reject) a change request
 */
export const ReviewChangeRequestSchema = t.Object({
  status: t.Union([t.Literal("approved"), t.Literal("rejected")]),
  reviewer_notes: t.Optional(t.String({ maxLength: 1000 })),
});

export type ReviewChangeRequest = Static<typeof ReviewChangeRequestSchema>;

/**
 * Filters for listing change requests
 */
export const ChangeRequestFiltersSchema = t.Object({
  status: t.Optional(ChangeRequestStatusSchema),
  employee_id: t.Optional(UuidSchema),
  field_category: t.Optional(FieldCategorySchema),
});

export type ChangeRequestFilters = Static<typeof ChangeRequestFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Change request response
 */
export const ChangeRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  field_category: FieldCategorySchema,
  field_name: t.String(),
  old_value: t.Union([t.String(), t.Null()]),
  new_value: t.String(),
  requires_approval: t.Boolean(),
  status: ChangeRequestStatusSchema,
  reviewer_id: t.Union([UuidSchema, t.Null()]),
  reviewer_notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  reviewed_at: t.Union([t.String(), t.Null()]),
  employee_name: t.Optional(t.String()),
  reviewer_name: t.Optional(t.String()),
});

export type ChangeRequestResponse = Static<typeof ChangeRequestResponseSchema>;

/**
 * Change request list response
 */
export const ChangeRequestListResponseSchema = t.Object({
  items: t.Array(ChangeRequestResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ChangeRequestListResponse = Static<typeof ChangeRequestListResponseSchema>;

// =============================================================================
// Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export { PaginationQuerySchema, UuidSchema };
