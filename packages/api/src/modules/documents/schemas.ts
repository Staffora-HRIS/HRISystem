/**
 * Documents Module - TypeBox Schemas
 *
 * Defines validation schemas for document management operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const DocumentCategorySchema = t.Union([
  t.Literal("contract"),
  t.Literal("id"),
  t.Literal("certificate"),
  t.Literal("policy"),
  t.Literal("onboarding"),
  t.Literal("performance"),
  t.Literal("training"),
  t.Literal("tax"),
  t.Literal("other"),
]);

export const DocumentStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("expired"),
  t.Literal("archived"),
]);

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateDocumentSchema = t.Object({
  employee_id: t.Optional(t.String({ format: "uuid" })),
  category: DocumentCategorySchema,
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  file_name: t.String({ minLength: 1, maxLength: 255 }),
  file_size: t.Number({ minimum: 1 }),
  mime_type: t.String({ minLength: 1, maxLength: 100 }),
  expires_at: t.Optional(t.String({ format: "date" })),
  tags: t.Optional(t.Array(t.String({ maxLength: 50 }))),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const UpdateDocumentSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    description: t.String({ maxLength: 1000 }),
    category: DocumentCategorySchema,
    expires_at: t.Union([t.String({ format: "date" }), t.Null()]),
    tags: t.Array(t.String({ maxLength: 50 })),
    status: DocumentStatusSchema,
  })
);

export const DocumentFiltersSchema = t.Object({
  employee_id: t.Optional(t.String({ format: "uuid" })),
  category: t.Optional(DocumentCategorySchema),
  status: t.Optional(DocumentStatusSchema),
  expiring_within_days: t.Optional(t.Number({ minimum: 1 })),
  search: t.Optional(t.String()),
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const DocumentResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  employee_id: t.Union([t.String(), t.Null()]),
  employee_name: t.Optional(t.String()),
  category: DocumentCategorySchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  file_key: t.String(),
  file_name: t.String(),
  file_size: t.Number(),
  mime_type: t.String(),
  version: t.Number(),
  status: DocumentStatusSchema,
  expires_at: t.Union([t.String(), t.Null()]),
  tags: t.Array(t.String()),
  uploaded_by: t.String(),
  uploaded_by_name: t.Optional(t.String()),
  download_url: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export const DocumentVersionResponseSchema = t.Object({
  id: t.String(),
  document_id: t.String(),
  version: t.Number(),
  file_key: t.String(),
  file_size: t.Number(),
  uploaded_by: t.String(),
  uploaded_by_name: t.Optional(t.String()),
  created_at: t.String(),
});

export const UploadUrlResponseSchema = t.Object({
  upload_url: t.String(),
  file_key: t.String(),
  expires_at: t.String(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type DocumentCategory = Static<typeof DocumentCategorySchema>;
export type DocumentStatus = Static<typeof DocumentStatusSchema>;
export type CreateDocument = Static<typeof CreateDocumentSchema>;
export type UpdateDocument = Static<typeof UpdateDocumentSchema>;
export type DocumentFilters = Static<typeof DocumentFiltersSchema>;
export type DocumentResponse = Static<typeof DocumentResponseSchema>;
export type DocumentVersionResponse = Static<typeof DocumentVersionResponseSchema>;
export type UploadUrlResponse = Static<typeof UploadUrlResponseSchema>;
