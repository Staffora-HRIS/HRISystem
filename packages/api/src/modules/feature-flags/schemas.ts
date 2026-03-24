/**
 * Feature Flags Module - TypeBox Schemas
 *
 * Defines validation schemas for all feature flag CRUD endpoints.
 * Table: app.feature_flags
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
 * Create feature flag request body
 */
export const CreateFeatureFlagSchema = t.Object({
  name: t.String({
    minLength: 1,
    maxLength: 255,
    pattern: "^[a-z0-9][a-z0-9._-]*$",
    description:
      "Flag name. Must start with a lowercase letter or digit and contain only lowercase letters, digits, dots, hyphens, and underscores.",
  }),
  description: t.Optional(
    t.Union([t.String({ maxLength: 1000 }), t.Null()], {
      description: "Human-readable description of the flag's purpose",
    })
  ),
  enabled: t.Optional(
    t.Boolean({ description: "Whether the flag is enabled (default: false)" })
  ),
  percentage: t.Optional(
    t.Number({
      minimum: 0,
      maximum: 100,
      description: "Percentage of users who see this flag (0-100, default: 100)",
    })
  ),
  roles: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 100 }), {
      description:
        "Role names that can see this flag. Empty array = all roles.",
    })
  ),
  metadata: t.Optional(
    t.Record(t.String(), t.Unknown(), {
      description: "Arbitrary metadata for flag configuration",
    })
  ),
});

export type CreateFeatureFlag = Static<typeof CreateFeatureFlagSchema>;

/**
 * Update feature flag request body (partial)
 */
export const UpdateFeatureFlagSchema = t.Partial(
  t.Object({
    name: t.String({
      minLength: 1,
      maxLength: 255,
      pattern: "^[a-z0-9][a-z0-9._-]*$",
    }),
    description: t.Union([t.String({ maxLength: 1000 }), t.Null()]),
    enabled: t.Boolean(),
    percentage: t.Number({ minimum: 0, maximum: 100 }),
    roles: t.Array(t.String({ minLength: 1, maxLength: 100 })),
    metadata: t.Record(t.String(), t.Unknown()),
  })
);

export type UpdateFeatureFlag = Static<typeof UpdateFeatureFlagSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Feature flag response object
 */
export const FeatureFlagResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  enabled: t.Boolean(),
  percentage: t.Number(),
  roles: t.Array(t.String()),
  metadata: t.Record(t.String(), t.Unknown()),
  createdBy: t.Union([t.String(), t.Null()]),
  updatedBy: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type FeatureFlagResponse = Static<typeof FeatureFlagResponseSchema>;

/**
 * Feature flag evaluation response (for frontend hooks)
 */
export const FeatureFlagEvalResponseSchema = t.Object({
  flags: t.Record(t.String(), t.Boolean(), {
    description: "Map of flag name to boolean enabled state for the current user",
  }),
});

export type FeatureFlagEvalResponse = Static<typeof FeatureFlagEvalResponseSchema>;

// =============================================================================
// Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const FlagNameQuerySchema = t.Object({
  flags: t.Optional(
    t.String({
      description:
        "Comma-separated list of flag names to evaluate. If omitted, all flags are evaluated.",
    })
  ),
});

export type FlagNameQuery = Static<typeof FlagNameQuerySchema>;

/**
 * POST body schema for evaluating feature flags.
 * Accepts flag names in a JSON body instead of query string to avoid
 * leaking flag names in URL logs, browser history, and CDN access logs.
 */
export const FlagEvalBodySchema = t.Object({
  flags: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 255 }), {
      description:
        "Array of flag names to evaluate. If omitted or empty, all flags are evaluated.",
    })
  ),
});

export type FlagEvalBody = Static<typeof FlagEvalBodySchema>;
