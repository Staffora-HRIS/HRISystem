/**
 * Integrations Module
 *
 * Provides the API layer for managing third-party service integrations
 * (SSO providers, payroll, communication tools, e-signatures, etc.).
 *
 * Usage:
 * ```typescript
 * import { integrationsRoutes } from './modules/integrations';
 *
 * const app = new Elysia()
 *   .use(integrationsRoutes);
 * ```
 */

// Export routes
export { integrationsRoutes, type IntegrationsRoutes } from "./routes";

// Export service
export { IntegrationsService } from "./service";

// Export repository
export {
  IntegrationsRepository,
  type TenantContext,
  type PaginatedResult,
  type IntegrationRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  IntegrationStatusSchema,
  IntegrationCategorySchema,
  IntegrationResponseSchema,
  IntegrationFiltersSchema,
  ConnectIntegrationSchema,
  UpdateIntegrationConfigSchema,
  IdParamsSchema,
  ProviderParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type IntegrationStatus,
  type IntegrationCategory,
  type IntegrationResponse,
  type IntegrationFilters,
  type ConnectIntegration,
  type UpdateIntegrationConfig,
  type IdParams,
  type ProviderParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
