/**
 * Contract Amendments Module
 *
 * Provides the API layer for employment contract amendment tracking,
 * including notification compliance per the Employment Rights Act 1996, s.4.
 *
 * Usage:
 * ```typescript
 * import { contractAmendmentRoutes } from './modules/contract-amendments';
 *
 * const app = new Elysia()
 *   .use(contractAmendmentRoutes);
 * ```
 */

// Export routes
export { contractAmendmentRoutes, type ContractAmendmentRoutes } from "./routes";

// Export service
export { ContractAmendmentService } from "./service";

// Export repository
export {
  ContractAmendmentRepository,
  type TenantContext,
  type PaginatedResult,
  type ContractAmendmentRow,
} from "./repository";

// Export schemas
export {
  // Enums
  AmendmentTypeSchema,
  // Request schemas
  CreateContractAmendmentSchema,
  UpdateContractAmendmentSchema,
  AmendmentStatusTransitionSchema,
  // Response schemas
  ContractAmendmentResponseSchema,
  ContractAmendmentListResponseSchema,
  // Filter schemas
  ContractAmendmentFiltersSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Route params
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type AmendmentType,
  type CreateContractAmendment,
  type UpdateContractAmendment,
  type AmendmentStatusTransition,
  type ContractAmendmentResponse,
  type ContractAmendmentListResponse,
  type ContractAmendmentFilters,
  type PaginationQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
