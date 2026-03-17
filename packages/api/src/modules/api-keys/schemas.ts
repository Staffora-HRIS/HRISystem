/**
 * API Keys Module - TypeBox Schemas
 *
 * Defines validation schemas for all API Key management endpoints.
 * Table: api_keys
 *
 * Key format: sfra_ + 32 random bytes base64url encoded (~48 chars total)
 * Storage: SHA-256 hash of full key; prefix (first 8 chars) for display
 */

import { t, type Static } from "elysia";

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

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create API key request body
 */
export const CreateApiKeySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255, description: "Human-readable name for the API key" }),
  scopes: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 100 }), {
      description: "Permission scopes granted to this key (e.g., ['hr:read', 'time:read'])",
    })
  ),
  expires_at: t.Optional(
    t.String({
      format: "date-time",
      description: "Optional expiry timestamp in ISO 8601 format",
    })
  ),
});

export type CreateApiKey = Static<typeof CreateApiKeySchema>;

/**
 * Update API key request body (name, scopes, expiry)
 */
export const UpdateApiKeySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    scopes: t.Array(t.String({ minLength: 1, maxLength: 100 })),
    expires_at: t.Union([
      t.String({ format: "date-time" }),
      t.Null(),
    ]),
  })
);

export type UpdateApiKey = Static<typeof UpdateApiKeySchema>;

/**
 * API key list filters
 */
export const ApiKeyFiltersSchema = t.Object({
  include_revoked: t.Optional(t.Boolean({ description: "Include revoked keys in the list (default: false)" })),
  search: t.Optional(t.String({ minLength: 1, description: "Search by key name" })),
});

export type ApiKeyFilters = Static<typeof ApiKeyFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * API key response (list/get) - never includes the full key
 */
export const ApiKeyResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  key_prefix: t.String({ description: "First 8 characters of the key for identification" }),
  scopes: t.Array(t.String()),
  expires_at: t.Union([t.String(), t.Null()]),
  last_used_at: t.Union([t.String(), t.Null()]),
  revoked_at: t.Union([t.String(), t.Null()]),
  created_by: UuidSchema,
  created_at: t.String(),
  updated_at: t.String(),
});

export type ApiKeyResponse = Static<typeof ApiKeyResponseSchema>;

/**
 * API key creation response - includes the full key (shown only once)
 */
export const ApiKeyCreatedResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  key: t.String({ description: "The full API key. Store this securely - it will not be shown again." }),
  key_prefix: t.String(),
  scopes: t.Array(t.String()),
  expires_at: t.Union([t.String(), t.Null()]),
  created_by: UuidSchema,
  created_at: t.String(),
});

export type ApiKeyCreatedResponse = Static<typeof ApiKeyCreatedResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
