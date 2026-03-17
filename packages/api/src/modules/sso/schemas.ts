/**
 * SSO Module - TypeBox Schemas
 *
 * Defines validation schemas for all SSO configuration and login endpoints.
 * Table: sso_configurations, sso_login_attempts
 *
 * Provider types:
 * - OIDC: OpenID Connect (Azure AD, Okta, Google Workspace, Auth0)
 * - SAML: SAML 2.0 (ADFS, Shibboleth, PingFederate)
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

export const ProviderTypeSchema = t.Union([
  t.Literal("saml"),
  t.Literal("oidc"),
]);

export type ProviderType = Static<typeof ProviderTypeSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create SSO configuration request body
 */
export const CreateSsoConfigSchema = t.Object({
  provider_type: ProviderTypeSchema,
  provider_name: t.String({
    minLength: 1,
    maxLength: 255,
    description: "Human-readable name for the SSO provider (e.g. 'Azure AD', 'Okta')",
  }),
  client_id: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 1024,
      description: "OIDC client ID issued by the IdP",
    })
  ),
  client_secret: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 2048,
      description: "OIDC client secret (will be encrypted at rest)",
    })
  ),
  issuer_url: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 2048,
      description: "OIDC issuer URL or SAML entity ID",
    })
  ),
  metadata_url: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 2048,
      description: "SAML metadata URL or OIDC well-known URL",
    })
  ),
  certificate: t.Optional(
    t.String({
      description: "SAML IdP X.509 signing certificate (PEM-encoded)",
    })
  ),
  attribute_mapping: t.Optional(
    t.Record(t.String(), t.String(), {
      description: "Mapping from IdP claims to Staffora user fields",
    })
  ),
  enabled: t.Optional(
    t.Boolean({
      description: "Whether this SSO configuration is active (default: false)",
    })
  ),
  auto_provision: t.Optional(
    t.Boolean({
      description: "Auto-provision users on first SSO login (default: false)",
    })
  ),
  allowed_domains: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 255 }), {
      description: "Restrict SSO to these email domains",
    })
  ),
  default_role_id: t.Optional(UuidSchema),
});

export type CreateSsoConfig = Static<typeof CreateSsoConfigSchema>;

/**
 * Update SSO configuration request body (partial)
 */
export const UpdateSsoConfigSchema = t.Partial(
  t.Object({
    provider_name: t.String({ minLength: 1, maxLength: 255 }),
    client_id: t.Union([t.String({ minLength: 1, maxLength: 1024 }), t.Null()]),
    client_secret: t.Union([t.String({ minLength: 1, maxLength: 2048 }), t.Null()]),
    issuer_url: t.Union([t.String({ minLength: 1, maxLength: 2048 }), t.Null()]),
    metadata_url: t.Union([t.String({ minLength: 1, maxLength: 2048 }), t.Null()]),
    certificate: t.Union([t.String(), t.Null()]),
    attribute_mapping: t.Record(t.String(), t.String()),
    enabled: t.Boolean(),
    auto_provision: t.Boolean(),
    allowed_domains: t.Array(t.String({ minLength: 1, maxLength: 255 })),
    default_role_id: t.Union([UuidSchema, t.Null()]),
  })
);

export type UpdateSsoConfig = Static<typeof UpdateSsoConfigSchema>;

/**
 * SSO configuration list filters
 */
export const SsoConfigFiltersSchema = t.Object({
  provider_type: t.Optional(ProviderTypeSchema),
  enabled: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1, description: "Search by provider name" })),
});

export type SsoConfigFilters = Static<typeof SsoConfigFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * SSO configuration response - never includes client_secret
 */
export const SsoConfigResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  provider_type: ProviderTypeSchema,
  provider_name: t.String(),
  client_id: t.Union([t.String(), t.Null()]),
  has_client_secret: t.Boolean({ description: "Whether a client secret is configured (never exposes the secret)" }),
  issuer_url: t.Union([t.String(), t.Null()]),
  metadata_url: t.Union([t.String(), t.Null()]),
  certificate: t.Union([t.String(), t.Null()]),
  attribute_mapping: t.Record(t.String(), t.String()),
  enabled: t.Boolean(),
  auto_provision: t.Boolean(),
  allowed_domains: t.Array(t.String()),
  default_role_id: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
});

export type SsoConfigResponse = Static<typeof SsoConfigResponseSchema>;

/**
 * SSO login initiation response (redirect URL)
 */
export const SsoLoginInitResponseSchema = t.Object({
  redirect_url: t.String({ description: "URL to redirect the user to the IdP for authentication" }),
  state: t.String({ description: "CSRF state parameter bound to this login attempt" }),
});

export type SsoLoginInitResponse = Static<typeof SsoLoginInitResponseSchema>;

/**
 * SSO callback query parameters
 */
export const SsoCallbackQuerySchema = t.Object({
  code: t.Optional(t.String({ description: "OIDC authorization code" })),
  state: t.Optional(t.String({ description: "CSRF state parameter" })),
  error: t.Optional(t.String({ description: "Error code from IdP" })),
  error_description: t.Optional(t.String({ description: "Error description from IdP" })),
});

export type SsoCallbackQuery = Static<typeof SsoCallbackQuerySchema>;

/**
 * SSO login attempt audit log response
 */
export const SsoLoginAttemptResponseSchema = t.Object({
  id: UuidSchema,
  sso_config_id: UuidSchema,
  idp_subject: t.String(),
  email: t.Union([t.String(), t.Null()]),
  user_id: t.Union([UuidSchema, t.Null()]),
  status: t.String(),
  error_message: t.Union([t.String(), t.Null()]),
  ip_address: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type SsoLoginAttemptResponse = Static<typeof SsoLoginAttemptResponseSchema>;

// =============================================================================
// Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const TenantSlugParamsSchema = t.Object({
  tenantSlug: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z0-9-]+$" }),
});

export type TenantSlugParams = Static<typeof TenantSlugParamsSchema>;

export const SsoProviderParamsSchema = t.Object({
  tenantSlug: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z0-9-]+$" }),
  configId: UuidSchema,
});

export type SsoProviderParams = Static<typeof SsoProviderParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
