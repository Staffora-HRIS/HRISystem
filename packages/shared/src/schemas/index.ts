/**
 * TypeBox Schemas
 *
 * Reusable TypeBox schemas for API validation.
 * These schemas can be used with Fastify, Elysia, or other frameworks
 * that support JSON Schema validation.
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * UUID schema with format validation.
 */
export const UUIDSchema = Type.String({
  format: "uuid",
  description: "Unique identifier in UUID format",
});
export type UUIDSchemaType = Static<typeof UUIDSchema>;

/**
 * Date string schema (YYYY-MM-DD).
 */
export const DateSchema = Type.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "Date in ISO 8601 format (YYYY-MM-DD)",
});
export type DateSchemaType = Static<typeof DateSchema>;

/**
 * Timestamp string schema (ISO 8601).
 */
export const TimestampSchema = Type.String({
  format: "date-time",
  description: "Timestamp in ISO 8601 format",
});
export type TimestampSchemaType = Static<typeof TimestampSchema>;

/**
 * Email schema with format validation.
 */
export const EmailSchema = Type.String({
  format: "email",
  maxLength: 255,
  description: "Valid email address",
});
export type EmailSchemaType = Static<typeof EmailSchema>;

/**
 * URL schema with format validation.
 */
export const UrlSchema = Type.String({
  format: "uri",
  description: "Valid URL",
});
export type UrlSchemaType = Static<typeof UrlSchema>;

// =============================================================================
// Pagination Schemas
// =============================================================================

/**
 * Standard pagination query parameters.
 */
export const PaginationSchema = Type.Object({
  page: Type.Optional(
    Type.Integer({
      minimum: 1,
      default: 1,
      description: "Page number (1-indexed)",
    })
  ),
  pageSize: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      default: 20,
      description: "Number of items per page",
    })
  ),
});
export type PaginationSchemaType = Static<typeof PaginationSchema>;

/**
 * Cursor-based pagination query parameters.
 */
export const CursorPaginationSchema = Type.Object({
  cursor: Type.Optional(
    Type.String({
      description: "Cursor for pagination",
    })
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      default: 20,
      description: "Number of items to return",
    })
  ),
  direction: Type.Optional(
    Type.Union([Type.Literal("forward"), Type.Literal("backward")], {
      default: "forward",
      description: "Pagination direction",
    })
  ),
});
export type CursorPaginationSchemaType = Static<typeof CursorPaginationSchema>;

/**
 * Pagination response metadata.
 */
export const PaginationMetaSchema = Type.Object({
  page: Type.Integer({ description: "Current page number" }),
  pageSize: Type.Integer({ description: "Items per page" }),
  totalItems: Type.Integer({ description: "Total number of items" }),
  totalPages: Type.Integer({ description: "Total number of pages" }),
  hasNextPage: Type.Boolean({ description: "Whether there is a next page" }),
  hasPreviousPage: Type.Boolean({
    description: "Whether there is a previous page",
  }),
});
export type PaginationMetaSchemaType = Static<typeof PaginationMetaSchema>;

// =============================================================================
// Sort Schemas
// =============================================================================

/**
 * Sort direction enum.
 */
export const SortDirectionSchema = Type.Union(
  [Type.Literal("asc"), Type.Literal("desc")],
  {
    default: "asc",
    description: "Sort direction",
  }
);
export type SortDirectionSchemaType = Static<typeof SortDirectionSchema>;

/**
 * Generic sort parameters.
 */
export const SortSchema = Type.Object({
  sortBy: Type.Optional(Type.String({ description: "Field to sort by" })),
  sortDirection: Type.Optional(SortDirectionSchema),
});
export type SortSchemaType = Static<typeof SortSchema>;

// =============================================================================
// API Response Schemas
// =============================================================================

/**
 * Create a paginated response schema for a given item schema.
 */
export function createPaginatedResponseSchema<T extends ReturnType<typeof Type.Object>>(
  itemSchema: T,
  description?: string
) {
  return Type.Object(
    {
      data: Type.Array(itemSchema, { description: "Array of items" }),
      pagination: PaginationMetaSchema,
    },
    { description: description || "Paginated response" }
  );
}

/**
 * Create a single item response schema.
 */
export function createSingleResponseSchema<T extends ReturnType<typeof Type.Object>>(
  itemSchema: T,
  description?: string
) {
  return Type.Object(
    {
      success: Type.Literal(true),
      data: itemSchema,
    },
    { description: description || "Single item response" }
  );
}

/**
 * API error response schema.
 */
export const ApiErrorSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.Object({
    code: Type.String({ description: "Error code" }),
    message: Type.String({ description: "Human-readable error message" }),
    details: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Additional error details",
      })
    ),
    fieldErrors: Type.Optional(
      Type.Record(Type.String(), Type.Array(Type.String()), {
        description: "Field-level validation errors",
      })
    ),
    requestId: Type.Optional(
      Type.String({ description: "Request ID for tracing" })
    ),
  }),
});
export type ApiErrorSchemaType = Static<typeof ApiErrorSchema>;

// =============================================================================
// Date Range Schema
// =============================================================================

/**
 * Date range schema for effective dating.
 */
export const DateRangeSchema = Type.Object({
  effectiveFrom: DateSchema,
  effectiveTo: Type.Union([DateSchema, Type.Null()], {
    description: "End date (null for currently effective)",
  }),
});
export type DateRangeSchemaType = Static<typeof DateRangeSchema>;

// =============================================================================
// Common Entity Schemas
// =============================================================================

/**
 * Base entity schema with audit fields.
 */
export const BaseEntitySchema = Type.Object({
  id: UUIDSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type BaseEntitySchemaType = Static<typeof BaseEntitySchema>;

/**
 * Tenant-scoped entity schema.
 */
export const TenantScopedEntitySchema = Type.Object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type TenantScopedEntitySchemaType = Static<typeof TenantScopedEntitySchema>;

// =============================================================================
// Money Schema
// =============================================================================

/**
 * Monetary amount schema.
 */
export const MoneySchema = Type.Object({
  amount: Type.Integer({
    description: "Amount in smallest currency unit (e.g., cents)",
  }),
  currency: Type.String({
    pattern: "^[A-Z]{3}$",
    description: "ISO 4217 currency code",
  }),
});
export type MoneySchemaType = Static<typeof MoneySchema>;

// =============================================================================
// Employee Status Schema
// =============================================================================

/**
 * Employee status enum schema.
 */
export const EmployeeStatusSchema = Type.Union(
  [
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("on_leave"),
    Type.Literal("terminated"),
  ],
  { description: "Employee lifecycle status" }
);
export type EmployeeStatusSchemaType = Static<typeof EmployeeStatusSchema>;

// =============================================================================
// Auth Schemas
// =============================================================================

/**
 * Login request schema.
 */
export const LoginRequestSchema = Type.Object({
  email: EmailSchema,
  password: Type.String({
    minLength: 1,
    description: "User password",
  }),
  tenantSlug: Type.Optional(
    Type.String({ description: "Tenant identifier" })
  ),
  rememberMe: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Extend session duration",
    })
  ),
});
export type LoginRequestSchemaType = Static<typeof LoginRequestSchema>;

/**
 * MFA verify request schema.
 */
export const MfaVerifyRequestSchema = Type.Object({
  code: Type.String({
    minLength: 6,
    maxLength: 8,
    description: "MFA verification code",
  }),
  method: Type.Union(
    [
      Type.Literal("totp"),
      Type.Literal("sms"),
      Type.Literal("email"),
      Type.Literal("backup_codes"),
    ],
    { description: "MFA method" }
  ),
  sessionId: UUIDSchema,
  rememberDevice: Type.Optional(
    Type.Boolean({
      default: false,
      description: "Remember this device",
    })
  ),
});
export type MfaVerifyRequestSchemaType = Static<typeof MfaVerifyRequestSchema>;

// =============================================================================
// ID Parameter Schema
// =============================================================================

/**
 * Standard ID path parameter schema.
 */
export const IdParamSchema = Type.Object({
  id: UUIDSchema,
});
export type IdParamSchemaType = Static<typeof IdParamSchema>;

// =============================================================================
// Search/Filter Schema
// =============================================================================

/**
 * Generic search query parameter.
 */
export const SearchQuerySchema = Type.Object({
  q: Type.Optional(
    Type.String({
      minLength: 1,
      maxLength: 100,
      description: "Search query string",
    })
  ),
});
export type SearchQuerySchemaType = Static<typeof SearchQuerySchema>;

/**
 * Date filter parameters.
 */
export const DateFilterSchema = Type.Object({
  startDate: Type.Optional(DateSchema),
  endDate: Type.Optional(DateSchema),
});
export type DateFilterSchemaType = Static<typeof DateFilterSchema>;

// =============================================================================
// Bulk Operation Schemas
// =============================================================================

/**
 * Bulk IDs request schema.
 */
export const BulkIdsSchema = Type.Object({
  ids: Type.Array(UUIDSchema, {
    minItems: 1,
    maxItems: 100,
    description: "Array of IDs",
  }),
});
export type BulkIdsSchemaType = Static<typeof BulkIdsSchema>;

/**
 * Bulk operation result schema.
 */
export const BulkResultSchema = Type.Object({
  success: Type.Array(UUIDSchema, { description: "Successfully processed IDs" }),
  failed: Type.Array(
    Type.Object({
      id: UUIDSchema,
      error: Type.String(),
    }),
    { description: "Failed operations" }
  ),
  totalProcessed: Type.Integer(),
  totalSuccess: Type.Integer(),
  totalFailed: Type.Integer(),
});
export type BulkResultSchemaType = Static<typeof BulkResultSchema>;

// =============================================================================
// File Upload Schema
// =============================================================================

/**
 * File metadata schema.
 */
export const FileMetadataSchema = Type.Object({
  fileName: Type.String({ description: "Original file name" }),
  fileSize: Type.Integer({
    minimum: 0,
    description: "File size in bytes",
  }),
  mimeType: Type.String({ description: "MIME type" }),
  url: Type.Optional(UrlSchema),
});
export type FileMetadataSchemaType = Static<typeof FileMetadataSchema>;
