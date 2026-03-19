/**
 * Tribunal Module - TypeBox Schemas
 *
 * Defines validation schemas for all Employment Tribunal Preparation API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const TribunalCaseStatusSchema = t.Union([
  t.Literal("preparation"),
  t.Literal("submitted"),
  t.Literal("hearing"),
  t.Literal("resolved"),
  t.Literal("decided"),
]);

export type TribunalCaseStatus = Static<typeof TribunalCaseStatusSchema>;

export const TribunalClaimTypeSchema = t.Union([
  t.Literal("unfair_dismissal"),
  t.Literal("constructive_dismissal"),
  t.Literal("wrongful_dismissal"),
  t.Literal("discrimination"),
  t.Literal("harassment"),
  t.Literal("victimisation"),
  t.Literal("equal_pay"),
  t.Literal("redundancy_payment"),
  t.Literal("breach_of_contract"),
  t.Literal("whistleblowing_detriment"),
  t.Literal("working_time"),
  t.Literal("unlawful_deduction_wages"),
  t.Literal("tupe"),
  t.Literal("trade_union"),
  t.Literal("other"),
]);

export type TribunalClaimType = Static<typeof TribunalClaimTypeSchema>;

export const TribunalBundleSectionSchema = t.Union([
  t.Literal("chronological"),
  t.Literal("statements"),
  t.Literal("correspondence"),
  t.Literal("policies"),
  t.Literal("contracts"),
  t.Literal("medical"),
  t.Literal("financial"),
  t.Literal("other"),
]);

export type TribunalBundleSection = Static<typeof TribunalBundleSectionSchema>;

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
// Document Schema (for JSONB documents array - legacy)
// =============================================================================

export const TribunalDocumentSchema = t.Object({
  id: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1, maxLength: 500 }),
  type: t.String({ minLength: 1, maxLength: 100 }),
  url: t.Optional(t.String({ maxLength: 2000 })),
  added_at: t.String(),
  added_by: t.Optional(t.String()),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type TribunalDocument = Static<typeof TribunalDocumentSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateTribunalCaseSchema = t.Object({
  case_id: t.Optional(UuidSchema),
  employee_id: UuidSchema,
  tribunal_reference: t.Optional(t.String({ maxLength: 100 })),
  hearing_date: t.Optional(DateSchema),
  claim_type: TribunalClaimTypeSchema,
  respondent_representative: t.Optional(t.String({ maxLength: 500 })),
  claimant_representative: t.Optional(t.String({ maxLength: 500 })),
  solicitor_reference: t.Optional(t.String({ maxLength: 200 })),
  notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type CreateTribunalCase = Static<typeof CreateTribunalCaseSchema>;

export const UpdateTribunalCaseSchema = t.Object({
  tribunal_reference: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  hearing_date: t.Optional(t.Union([DateSchema, t.Null()])),
  claim_type: t.Optional(TribunalClaimTypeSchema),
  respondent_representative: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  claimant_representative: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  solicitor_reference: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
  status: t.Optional(TribunalCaseStatusSchema),
  outcome: t.Optional(t.Union([t.String({ maxLength: 5000 }), t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type UpdateTribunalCase = Static<typeof UpdateTribunalCaseSchema>;

export const AddTribunalDocumentSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 500 }),
  type: t.String({ minLength: 1, maxLength: 100 }),
  url: t.Optional(t.String({ maxLength: 2000 })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type AddTribunalDocument = Static<typeof AddTribunalDocumentSchema>;

export const UpdateTribunalDocumentSchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  type: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  url: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});

export type UpdateTribunalDocument = Static<typeof UpdateTribunalDocumentSchema>;

// =============================================================================
// Bundle Document Schemas (structured relational table)
// =============================================================================

export const AddBundleDocumentSchema = t.Object({
  document_id: t.Optional(UuidSchema),
  title: t.String({ minLength: 1, maxLength: 500 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  page_number: t.Optional(t.Number({ minimum: 1 })),
  section: TribunalBundleSectionSchema,
  document_date: t.Optional(DateSchema),
  file_url: t.Optional(t.String({ maxLength: 2000 })),
  file_name: t.Optional(t.String({ maxLength: 500 })),
  file_size_bytes: t.Optional(t.Number({ minimum: 0 })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
  sort_order: t.Optional(t.Number({ minimum: 0, default: 0 })),
});

export type AddBundleDocument = Static<typeof AddBundleDocumentSchema>;

export const UpdateBundleDocumentSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  description: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  page_number: t.Optional(t.Union([t.Number({ minimum: 1 }), t.Null()])),
  section: t.Optional(TribunalBundleSectionSchema),
  document_date: t.Optional(t.Union([DateSchema, t.Null()])),
  file_url: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  file_name: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
  file_size_bytes: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
  notes: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  sort_order: t.Optional(t.Number({ minimum: 0 })),
});

export type UpdateBundleDocument = Static<typeof UpdateBundleDocumentSchema>;

export const BundleDocumentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  tribunal_case_id: UuidSchema,
  document_id: t.Union([UuidSchema, t.Null()]),
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  page_number: t.Union([t.Number(), t.Null()]),
  section: t.String(),
  document_date: t.Union([t.String(), t.Null()]),
  file_url: t.Union([t.String(), t.Null()]),
  file_name: t.Union([t.String(), t.Null()]),
  file_size_bytes: t.Union([t.Number(), t.Null()]),
  added_by: UuidSchema,
  added_at: t.String(),
  notes: t.Union([t.String(), t.Null()]),
  sort_order: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type BundleDocumentResponse = Static<typeof BundleDocumentResponseSchema>;

export const BundleIndexResponseSchema = t.Object({
  tribunal_case_id: UuidSchema,
  tribunal_reference: t.Union([t.String(), t.Null()]),
  claim_type: t.String(),
  hearing_date: t.Union([t.String(), t.Null()]),
  status: t.String(),
  total_documents: t.Number(),
  total_pages: t.Union([t.Number(), t.Null()]),
  total_size_bytes: t.Union([t.Number(), t.Null()]),
  sections: t.Array(
    t.Object({
      section: t.String(),
      documents: t.Array(BundleDocumentResponseSchema),
      document_count: t.Number(),
    }),
  ),
  generated_at: t.String(),
});

export type BundleIndexResponse = Static<typeof BundleIndexResponseSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const TribunalCaseResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  case_id: t.Union([UuidSchema, t.Null()]),
  employee_id: UuidSchema,
  tribunal_reference: t.Union([t.String(), t.Null()]),
  hearing_date: t.Union([t.String(), t.Null()]),
  claim_type: t.String(),
  respondent_representative: t.Union([t.String(), t.Null()]),
  claimant_representative: t.Union([t.String(), t.Null()]),
  solicitor_reference: t.Union([t.String(), t.Null()]),
  documents: t.Array(TribunalDocumentSchema),
  status: t.String(),
  outcome: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  employee_name: t.Optional(t.String()),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TribunalCaseResponse = Static<typeof TribunalCaseResponseSchema>;

export const TribunalCaseListResponseSchema = t.Object({
  items: t.Array(TribunalCaseResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type TribunalCaseListResponse = Static<typeof TribunalCaseListResponseSchema>;

export const TribunalCaseFiltersSchema = t.Object({
  status: t.Optional(TribunalCaseStatusSchema),
  claim_type: t.Optional(TribunalClaimTypeSchema),
  employee_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type TribunalCaseFilters = Static<typeof TribunalCaseFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({ id: UuidSchema });
export type IdParams = Static<typeof IdParamsSchema>;

export const DocumentIdParamsSchema = t.Object({
  id: UuidSchema,
  documentId: t.String({ minLength: 1 }),
});
export type DocumentIdParams = Static<typeof DocumentIdParamsSchema>;

export const BundleDocumentIdParamsSchema = t.Object({
  id: UuidSchema,
  bundleDocId: UuidSchema,
});
export type BundleDocumentIdParams = Static<typeof BundleDocumentIdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
