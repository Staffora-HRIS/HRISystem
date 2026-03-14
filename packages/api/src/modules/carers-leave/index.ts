/**
 * Carer's Leave Module
 *
 * Provides the API layer for managing carer's leave entitlements
 * under the Carer's Leave Act 2023 (c. 18).
 *
 * Usage:
 * ```typescript
 * import { carersLeaveRoutes } from './modules/carers-leave';
 *
 * const app = new Elysia()
 *   .use(carersLeaveRoutes);
 * ```
 */

// Export routes
export { carersLeaveRoutes, type CarersLeaveRoutes } from "./routes";

// Export service
export { CarersLeaveService } from "./service";

// Export repository
export {
  CarersLeaveRepository,
  type TenantContext,
  type PaginatedResult,
  type EntitlementRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Entitlement
  EntitlementStatusSchema,
  CreateEntitlementSchema,
  UpdateEntitlementSchema,
  StatusTransitionSchema,
  EntitlementResponseSchema,
  EntitlementListResponseSchema,
  EntitlementFiltersSchema,
  // Params / Headers
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type EntitlementStatus,
  type PaginationQuery,
  type CreateEntitlement,
  type UpdateEntitlement,
  type StatusTransition,
  type EntitlementResponse,
  type EntitlementListResponse,
  type EntitlementFilters,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
