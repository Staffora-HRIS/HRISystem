/**
 * SSO Module
 *
 * Enterprise SSO (SAML/OIDC) integration for multi-tenant authentication.
 * Provides:
 * - Admin CRUD for SSO provider configurations
 * - Public SSO discovery and login initiation endpoints
 * - OIDC authorization code flow with JIT user provisioning
 * - SSO login attempt auditing
 *
 * Usage:
 * ```typescript
 * import { ssoAdminRoutes, ssoPublicRoutes } from './modules/sso';
 *
 * const app = new Elysia()
 *   .group("/api/v1", (api) =>
 *     api
 *       .use(ssoAdminRoutes)
 *       .use(ssoPublicRoutes)
 *   );
 * ```
 */

// Export routes
export { ssoAdminRoutes, ssoPublicRoutes, type SsoAdminRoutes, type SsoPublicRoutes } from "./routes";

// Export service
export { SsoService } from "./service";

// Export repository
export {
  SsoConfigRepository,
  type TenantContext,
  type PaginatedResult,
  type SsoConfigRow,
  type SsoLoginAttemptRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  ProviderTypeSchema,
  CreateSsoConfigSchema,
  UpdateSsoConfigSchema,
  SsoConfigFiltersSchema,
  SsoConfigResponseSchema,
  SsoLoginInitResponseSchema,
  SsoCallbackQuerySchema,
  SsoLoginAttemptResponseSchema,
  IdParamsSchema,
  TenantSlugParamsSchema,
  SsoProviderParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type ProviderType,
  type CreateSsoConfig,
  type UpdateSsoConfig,
  type SsoConfigFilters,
  type SsoConfigResponse,
  type SsoLoginInitResponse,
  type SsoCallbackQuery,
  type SsoLoginAttemptResponse,
  type IdParams,
  type TenantSlugParams,
  type SsoProviderParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
