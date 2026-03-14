/**
 * Agency Management Module
 *
 * Provides recruitment agency management and placement tracking.
 *
 * Usage:
 * ```typescript
 * import { agencyRoutes } from './modules/agencies';
 *
 * const app = new Elysia()
 *   .use(agencyRoutes);
 * ```
 */

// Export routes
export { agencyRoutes, type AgencyRoutes } from "./routes";

// Export service
export { AgencyService } from "./service";

// Export repository
export { AgencyRepository } from "./repository";

// Export schemas
export {
  CreateAgencySchema,
  UpdateAgencySchema,
  CreatePlacementSchema,
  UpdatePlacementSchema,
  AgencyResponseSchema,
  PlacementResponseSchema,
  AgencyFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  PlacementParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
