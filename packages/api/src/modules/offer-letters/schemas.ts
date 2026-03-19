/**
 * Offer Letters Module - TypeBox Schemas
 *
 * Defines validation schemas for offer letter API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Offer letter status enum matching the database type app.offer_letter_status.
 * State machine: draft -> sent -> accepted / declined / expired
 */
export const OfferLetterStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("sent"),
  t.Literal("accepted"),
  t.Literal("declined"),
  t.Literal("expired"),
]);

export type OfferLetterStatus = Static<typeof OfferLetterStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  description: "UUID identifier",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Offer Letter Schemas
// =============================================================================

/**
 * Create offer letter request body.
 *
 * If template_id is supplied, the content will be generated from the template
 * using the provided template_variables merged with auto-resolved candidate/
 * requisition data. If no template_id is given, raw content must be supplied.
 */
export const CreateOfferLetterSchema = t.Object({
  candidateId: UuidSchema,
  requisitionId: UuidSchema,
  templateId: t.Optional(UuidSchema),
  content: t.Optional(t.String({ minLength: 1, description: "Raw HTML content; required when templateId is omitted" })),
  salaryOffered: t.Number({ minimum: 0.01, description: "Salary amount (positive decimal)" }),
  startDate: t.String({ format: "date", description: "Proposed start date (YYYY-MM-DD)" }),
  expiresAt: t.Optional(t.String({ format: "date-time", description: "Expiry timestamp (ISO 8601)" })),
  templateVariables: t.Optional(t.Record(t.String(), t.String(), { description: "Extra variables for template rendering" })),
});

export type CreateOfferLetter = Static<typeof CreateOfferLetterSchema>;

/**
 * Update a draft offer letter.
 * Only drafts may be updated.
 */
export const UpdateOfferLetterSchema = t.Partial(
  t.Object({
    content: t.String({ minLength: 1 }),
    salaryOffered: t.Number({ minimum: 0.01 }),
    startDate: t.String({ format: "date" }),
    expiresAt: t.Union([t.String({ format: "date-time" }), t.Null()]),
    templateVariables: t.Record(t.String(), t.String()),
  })
);

export type UpdateOfferLetter = Static<typeof UpdateOfferLetterSchema>;

/**
 * Decline offer body (optional reason).
 */
export const DeclineOfferLetterSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 2000 })),
});

export type DeclineOfferLetter = Static<typeof DeclineOfferLetterSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const OfferLetterResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  candidateId: UuidSchema,
  requisitionId: UuidSchema,
  templateId: t.Union([UuidSchema, t.Null()]),
  content: t.String(),
  salaryOffered: t.Number(),
  startDate: t.String(),
  status: OfferLetterStatusSchema,
  sentAt: t.Union([t.String(), t.Null()]),
  respondedAt: t.Union([t.String(), t.Null()]),
  expiresAt: t.Union([t.String(), t.Null()]),
  declineReason: t.Union([t.String(), t.Null()]),
  templateVariables: t.Record(t.String(), t.String()),
  createdBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
  // Joined fields (optional, populated when joined)
  candidateName: t.Optional(t.String()),
  requisitionTitle: t.Optional(t.String()),
});

export type OfferLetterResponse = Static<typeof OfferLetterResponseSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const OfferLetterFiltersSchema = t.Object({
  candidateId: t.Optional(UuidSchema),
  requisitionId: t.Optional(UuidSchema),
  status: t.Optional(OfferLetterStatusSchema),
  search: t.Optional(t.String()),
});

export type OfferLetterFilters = Static<typeof OfferLetterFiltersSchema>;
