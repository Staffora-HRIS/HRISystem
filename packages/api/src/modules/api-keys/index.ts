/**
 * API Keys Module
 *
 * Provides the API layer for API key generation, rotation, revocation,
 * and scope restriction for machine-to-machine authentication.
 *
 * Usage:
 * ```typescript
 * import { apiKeyRoutes } from './modules/api-keys';
 *
 * const app = new Elysia()
 *   .use(apiKeyRoutes);
 * ```
 */

// Export routes
export { apiKeyRoutes, type ApiKeyRoutes } from "./routes";

// Export service (for auth middleware integration)
export { ApiKeyService, isStaforaApiKey } from "./service";

// Export repository
export {
  ApiKeyRepository,
  type TenantContext,
  type PaginatedResult,
  type ApiKeyRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  ApiKeyResponseSchema,
  ApiKeyCreatedResponseSchema,
  ApiKeyFiltersSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateApiKey,
  type UpdateApiKey,
  type ApiKeyResponse,
  type ApiKeyCreatedResponse,
  type ApiKeyFilters,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
