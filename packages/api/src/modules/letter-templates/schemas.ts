/**
 * Letter Templates Module - TypeBox Schemas
 *
 * Defines validation schemas for letter template API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Letter template type enum matching database type
 */
export const LetterTemplateTypeSchema = t.Union([
  t.Literal("offer_letter"),
  t.Literal("contract_variation"),
  t.Literal("disciplinary_invitation"),
  t.Literal("disciplinary_outcome"),
  t.Literal("grievance_invitation"),
  t.Literal("grievance_outcome"),
  t.Literal("reference"),
  t.Literal("probation_confirmation"),
  t.Literal("probation_extension"),
  t.Literal("termination"),
  t.Literal("redundancy"),
  t.Literal("flexible_working_response"),
  t.Literal("return_to_work"),
  t.Literal("custom"),
]);

export type LetterTemplateType = Static<typeof LetterTemplateTypeSchema>;

/**
 * Sent via enum
 */
export const SentViaSchema = t.Union([
  t.Literal("email"),
  t.Literal("portal"),
  t.Literal("print"),
]);

export type SentVia = Static<typeof SentViaSchema>;

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
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Placeholder Schema
// =============================================================================

/**
 * Placeholder definition (stored in the placeholders JSONB array)
 */
export const PlaceholderDefSchema = t.Object({
  key: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  required: t.Optional(t.Boolean()),
  default_value: t.Optional(t.String()),
});

export type PlaceholderDef = Static<typeof PlaceholderDefSchema>;

// =============================================================================
// Letter Template Schemas
// =============================================================================

/**
 * Create letter template request
 */
export const CreateLetterTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  template_type: LetterTemplateTypeSchema,
  subject: t.Optional(t.String({ maxLength: 500 })),
  body_template: t.String({ minLength: 1 }),
  placeholders: t.Optional(t.Array(PlaceholderDefSchema)),
  is_default: t.Optional(t.Boolean()),
});

export type CreateLetterTemplate = Static<typeof CreateLetterTemplateSchema>;

/**
 * Update letter template request
 */
export const UpdateLetterTemplateSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    template_type: LetterTemplateTypeSchema,
    subject: t.Union([t.String({ maxLength: 500 }), t.Null()]),
    body_template: t.String({ minLength: 1 }),
    placeholders: t.Array(PlaceholderDefSchema),
    is_default: t.Boolean(),
    active: t.Boolean(),
  })
);

export type UpdateLetterTemplate = Static<typeof UpdateLetterTemplateSchema>;

/**
 * Letter template response
 */
export const LetterTemplateResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  template_type: LetterTemplateTypeSchema,
  subject: t.Union([t.String(), t.Null()]),
  body_template: t.String(),
  placeholders: t.Array(PlaceholderDefSchema),
  is_default: t.Boolean(),
  version: t.Number(),
  active: t.Boolean(),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type LetterTemplateResponse = Static<typeof LetterTemplateResponseSchema>;

/**
 * Letter template filters for list endpoint
 */
export const LetterTemplateFiltersSchema = t.Object({
  template_type: t.Optional(LetterTemplateTypeSchema),
  active: t.Optional(t.Boolean()),
  is_default: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type LetterTemplateFilters = Static<typeof LetterTemplateFiltersSchema>;

// =============================================================================
// Generate Letter Schemas
// =============================================================================

/**
 * Generate letter request body
 */
export const GenerateLetterSchema = t.Object({
  employee_id: UuidSchema,
  placeholder_values: t.Optional(t.Record(t.String(), t.String())),
});

export type GenerateLetter = Static<typeof GenerateLetterSchema>;

/**
 * Generated letter response
 */
export const GeneratedLetterResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  template_id: UuidSchema,
  employee_id: UuidSchema,
  generated_by: t.Union([UuidSchema, t.Null()]),
  generated_at: t.String(),
  subject: t.Union([t.String(), t.Null()]),
  body: t.String(),
  placeholders_used: t.Record(t.String(), t.String()),
  pdf_file_key: t.Union([t.String(), t.Null()]),
  sent_at: t.Union([t.String(), t.Null()]),
  sent_via: t.Union([SentViaSchema, t.Null()]),
  acknowledged_at: t.Union([t.String(), t.Null()]),
});

export type GeneratedLetterResponse = Static<typeof GeneratedLetterResponseSchema>;

/**
 * Generated letters filters for list endpoint
 */
export const GeneratedLetterFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  template_id: t.Optional(UuidSchema),
  template_type: t.Optional(LetterTemplateTypeSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type GeneratedLetterFilters = Static<typeof GeneratedLetterFiltersSchema>;

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends ReturnType<typeof t.Object>>(
  itemSchema: T
) =>
  t.Object({
    items: t.Array(itemSchema),
    nextCursor: t.Union([t.String(), t.Null()]),
    hasMore: t.Boolean(),
    total: t.Optional(t.Number()),
  });
