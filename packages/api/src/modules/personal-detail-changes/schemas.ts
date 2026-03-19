/**
 * Personal Detail Changes Module - TypeBox Schemas
 *
 * Validation schemas for portal change request submission, listing,
 * and manager/HR approval endpoints (TODO-150).
 *
 * Sensitive fields: name, address, bank details, emergency contacts
 * Non-sensitive fields: phone, personal_email (updated directly)
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/**
 * Sensitive fields that REQUIRE manager/HR approval.
 */
export const SENSITIVE_FIELDS = new Set([
  "first_name",
  "last_name",
  "middle_name",
  "preferred_name",
  "address_line_1",
  "address_line_2",
  "city",
  "county",
  "postcode",
  "country",
  "bank_name",
  "account_holder_name",
  "sort_code",
  "account_number",
  "building_society_ref",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "emergency_contact_email",
]);

/**
 * Non-sensitive fields that can be updated immediately without approval.
 */
export const NON_SENSITIVE_FIELDS = new Set([
  "phone",
  "mobile",
  "personal_email",
]);

/**
 * All allowed field names (union of sensitive + non-sensitive)
 */
export const ALL_ALLOWED_FIELDS = new Set([
  ...SENSITIVE_FIELDS,
  ...NON_SENSITIVE_FIELDS,
]);

// =============================================================================
// Enums
// =============================================================================

export const PersonalDetailChangeStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);

export type PersonalDetailChangeStatus = Static<typeof PersonalDetailChangeStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Submit a personal detail change request (employee self-service).
 */
export const SubmitChangeRequestSchema = t.Object({
  field_name: t.String({
    minLength: 1,
    maxLength: 100,
    description: "Name of the field to change (e.g., first_name, phone, sort_code)",
  }),
  old_value: t.Optional(t.Union([t.String(), t.Null()])),
  new_value: t.String({
    minLength: 1,
    description: "The requested new value for the field",
  }),
});

export type SubmitChangeRequest = Static<typeof SubmitChangeRequestSchema>;

/**
 * Review (approve or reject) a pending change request (manager/HR).
 */
export const ReviewChangeRequestSchema = t.Object({
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  reviewer_notes: t.Optional(
    t.String({
      maxLength: 1000,
      description: "Optional notes explaining the decision",
    })
  ),
});

export type ReviewChangeRequest = Static<typeof ReviewChangeRequestSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ChangeRequestResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  field_name: t.String(),
  old_value: t.Union([t.String(), t.Null()]),
  new_value: t.String(),
  status: PersonalDetailChangeStatusSchema,
  reviewed_by: t.Union([UuidSchema, t.Null()]),
  reviewed_at: t.Union([t.String(), t.Null()]),
  reviewer_notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  employee_name: t.Optional(t.String()),
  reviewer_name: t.Optional(t.String()),
});

export type ChangeRequestResponse = Static<typeof ChangeRequestResponseSchema>;

export const ChangeRequestListResponseSchema = t.Object({
  items: t.Array(ChangeRequestResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ChangeRequestListResponse = Static<typeof ChangeRequestListResponseSchema>;

// =============================================================================
// Query Schemas
// =============================================================================

export const MyChangeRequestsQuerySchema = t.Composite([
  t.Partial(PaginationQuerySchema),
  t.Object({
    status: t.Optional(PersonalDetailChangeStatusSchema),
  }),
]);

export const PendingReviewQuerySchema = t.Composite([
  t.Partial(PaginationQuerySchema),
  t.Object({
    employee_id: t.Optional(UuidSchema),
  }),
]);
