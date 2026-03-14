/**
 * Employee Photos Module - TypeBox Schemas
 *
 * Defines validation schemas for employee photo management endpoints.
 * Table: employee_photos
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Upload (create/replace) employee photo request.
 * The actual file upload is handled externally (e.g. presigned URL);
 * this endpoint stores the file reference metadata.
 */
export const UploadPhotoSchema = t.Object({
  file_key: t.String({ minLength: 1, maxLength: 500 }),
  original_filename: t.Optional(t.String({ maxLength: 255 })),
  mime_type: t.Optional(
    t.String({
      maxLength: 100,
      pattern: "^image\\/(jpeg|png|gif|webp|svg\\+xml|bmp)$",
    })
  ),
  file_size_bytes: t.Optional(t.Number({ minimum: 0 })),
});

export type UploadPhoto = Static<typeof UploadPhotoSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Employee photo response
 */
export const PhotoResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  file_key: t.String(),
  original_filename: t.Union([t.String(), t.Null()]),
  mime_type: t.Union([t.String(), t.Null()]),
  file_size_bytes: t.Union([t.Number(), t.Null()]),
  uploaded_by: t.Union([UuidSchema, t.Null()]),
  uploaded_at: t.String(),
  updated_at: t.String(),
});

export type PhotoResponse = Static<typeof PhotoResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
