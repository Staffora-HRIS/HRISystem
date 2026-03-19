/**
 * Feature Flags Module - TypeBox Schemas
 *
 * Validation schemas for feature flag management endpoints.
 * Feature flags are stored in the tenant settings JSONB column
 * under the `featureFlags` key.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const FeatureFlagKeySchema = t.String({
  minLength: 1,
  maxLength: 100,
  pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
});

// =============================================================================
// Create / Update Feature Flag
// =============================================================================

export const CreateFeatureFlagSchema = t.Object({
  /** Unique key for the feature flag (camelCase convention) */
  key: FeatureFlagKeySchema,
  /** Human-readable name */
  name: t.String({ minLength: 1, maxLength: 255 }),
  /** Description of what this flag controls */
  description: t.Optional(t.String({ maxLength: 1000 })),
  /** Whether the flag is enabled */
  enabled: t.Boolean(),
  /** Optional metadata (rollout percentage, user targeting, etc.) */
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type CreateFeatureFlag = Static<typeof CreateFeatureFlagSchema>;

export const UpdateFeatureFlagSchema = t.Object({
  /** Human-readable name */
  name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  /** Description of what this flag controls */
  description: t.Optional(t.String({ maxLength: 1000 })),
  /** Whether the flag is enabled */
  enabled: t.Optional(t.Boolean()),
  /** Optional metadata (rollout percentage, user targeting, etc.) */
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type UpdateFeatureFlag = Static<typeof UpdateFeatureFlagSchema>;

// =============================================================================
// Params / Query
// =============================================================================

export const FeatureFlagKeyParamsSchema = t.Object({
  key: FeatureFlagKeySchema,
});
export type FeatureFlagKeyParams = Static<typeof FeatureFlagKeyParamsSchema>;

export const ListFeatureFlagsQuerySchema = t.Object({
  enabled: t.Optional(t.String({ pattern: "^(true|false)$" })),
});
export type ListFeatureFlagsQuery = Static<typeof ListFeatureFlagsQuerySchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface FeatureFlagResponse {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
}

export interface FeatureFlagListResponse {
  items: FeatureFlagResponse[];
  total: number;
}
