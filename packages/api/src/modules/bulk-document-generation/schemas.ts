/**
 * Bulk Document Generation Module - TypeBox Schemas
 *
 * Defines validation schemas for bulk document generation endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of employees per bulk generation request */
export const MAX_BULK_GENERATE_SIZE = 500;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

// =============================================================================
// Batch Status Enum
// =============================================================================

export const BatchStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("processing"),
  t.Literal("completed"),
  t.Literal("completed_with_errors"),
  t.Literal("failed"),
]);

export type BatchStatus = Static<typeof BatchStatusSchema>;

export const BatchItemStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("processing"),
  t.Literal("completed"),
  t.Literal("failed"),
]);

export type BatchItemStatus = Static<typeof BatchItemStatusSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * POST /api/v1/documents/bulk-generate request body
 */
export const BulkGenerateRequestSchema = t.Object({
  templateId: UuidSchema,
  employeeIds: t.Array(UuidSchema, {
    minItems: 1,
    maxItems: MAX_BULK_GENERATE_SIZE,
  }),
  variables: t.Optional(t.Record(t.String(), t.String())),
});

export type BulkGenerateRequest = Static<typeof BulkGenerateRequestSchema>;

/**
 * Batch ID path parameter
 */
export const BatchIdParamsSchema = t.Object({
  batchId: UuidSchema,
});

export type BatchIdParams = Static<typeof BatchIdParamsSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Batch item response schema (individual employee within a batch)
 */
export const BatchItemResponseSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  status: BatchItemStatusSchema,
  generated_letter_id: t.Union([UuidSchema, t.Null()]),
  error_message: t.Union([t.String(), t.Null()]),
  started_at: t.Union([t.String(), t.Null()]),
  completed_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type BatchItemResponse = Static<typeof BatchItemResponseSchema>;

/**
 * Batch response schema
 */
export const BatchResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  template_id: UuidSchema,
  status: BatchStatusSchema,
  total_items: t.Number(),
  completed_items: t.Number(),
  failed_items: t.Number(),
  variables: t.Union([t.Record(t.String(), t.String()), t.Null()]),
  created_by: UuidSchema,
  created_at: t.String(),
  updated_at: t.String(),
});

export type BatchResponse = Static<typeof BatchResponseSchema>;

/**
 * Batch status response (includes items)
 */
export const BatchStatusResponseSchema = t.Object({
  batch: BatchResponseSchema,
  items: t.Array(BatchItemResponseSchema),
});

export type BatchStatusResponse = Static<typeof BatchStatusResponseSchema>;

/**
 * Bulk generation creation response
 */
export const BulkGenerateResponseSchema = t.Object({
  batch_id: UuidSchema,
  status: BatchStatusSchema,
  total_items: t.Number(),
  message: t.String(),
});

export type BulkGenerateResponse = Static<typeof BulkGenerateResponseSchema>;

// =============================================================================
// Headers
// =============================================================================

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
