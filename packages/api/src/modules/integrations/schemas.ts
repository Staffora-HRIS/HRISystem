/**
 * Integrations Module - TypeBox Schemas
 *
 * Defines validation schemas for all Integration API endpoints.
 * Table: integrations
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
  limit: t.Optional(t.String({ pattern: "^[0-9]+$" })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const IntegrationStatusSchema = t.Union([
  t.Literal("connected"),
  t.Literal("disconnected"),
  t.Literal("error"),
]);

export type IntegrationStatus = Static<typeof IntegrationStatusSchema>;

export const IntegrationCategorySchema = t.Union([
  t.Literal("Identity & SSO"),
  t.Literal("Payroll"),
  t.Literal("Communication"),
  t.Literal("E-Signature"),
  t.Literal("Recruiting"),
  t.Literal("Calendar"),
]);

export type IntegrationCategory = Static<typeof IntegrationCategorySchema>;

// =============================================================================
// Integration Schemas
// =============================================================================

/**
 * Integration response shape returned by the API
 */
export const IntegrationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  provider: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.String(),
  status: IntegrationStatusSchema,
  last_sync_at: t.Union([t.String(), t.Null()]),
  error_message: t.Union([t.String(), t.Null()]),
  webhook_url: t.Union([t.String(), t.Null()]),
  enabled: t.Boolean(),
  connected_at: t.Union([t.String(), t.Null()]),
  connected_by: t.Union([UuidSchema, t.Null()]),
  disconnected_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type IntegrationResponse = Static<typeof IntegrationResponseSchema>;

/**
 * Integration list filters
 */
export const IntegrationFiltersSchema = t.Object({
  category: t.Optional(t.String({ minLength: 1 })),
  status: t.Optional(IntegrationStatusSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type IntegrationFilters = Static<typeof IntegrationFiltersSchema>;

/**
 * Connect (create/update) an integration
 */
export const ConnectIntegrationSchema = t.Object({
  provider: t.String({ minLength: 1, maxLength: 100 }),
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.String({ minLength: 1, maxLength: 100 }),
  config: t.Optional(t.Object({
    api_key: t.Optional(t.String()),
    api_secret: t.Optional(t.String()),
    webhook_url: t.Optional(t.String()),
  }, { additionalProperties: true })),
  webhook_url: t.Optional(t.String()),
});

export type ConnectIntegration = Static<typeof ConnectIntegrationSchema>;

/**
 * Update integration configuration
 */
export const UpdateIntegrationConfigSchema = t.Object({
  config: t.Optional(t.Object({
    api_key: t.Optional(t.String()),
    api_secret: t.Optional(t.String()),
    webhook_url: t.Optional(t.String()),
  }, { additionalProperties: true })),
  webhook_url: t.Optional(t.String()),
});

export type UpdateIntegrationConfig = Static<typeof UpdateIntegrationConfigSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const ProviderParamsSchema = t.Object({
  provider: t.String({ minLength: 1 }),
});

export type ProviderParams = Static<typeof ProviderParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Test Connection Response
// =============================================================================

/**
 * Response shape for testing an integration connection
 */
export const TestConnectionResponseSchema = t.Object({
  success: t.Boolean(),
  provider: t.String(),
  message: t.String(),
  latencyMs: t.Optional(t.Number()),
  testedAt: t.String(),
});

export type TestConnectionResponse = Static<typeof TestConnectionResponseSchema>;
