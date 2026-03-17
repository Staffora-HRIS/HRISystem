/**
 * Beneficiary Nominations Module
 *
 * Provides the complete API layer for managing employee beneficiary nominations.
 * Supports designation of beneficiaries per benefit type with percentage
 * allocation validation (total per benefit type must not exceed 100%).
 *
 * Usage:
 * ```typescript
 * import { beneficiaryNominationRoutes } from './modules/beneficiary-nominations';
 *
 * const app = new Elysia()
 *   .use(beneficiaryNominationRoutes);
 * ```
 */

// Export routes
export { beneficiaryNominationRoutes, type BeneficiaryNominationRoutes } from "./routes";

// Export service
export { BeneficiaryNominationService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  BeneficiaryNominationRepository,
  type TenantContext,
  type PaginatedResult,
  type BeneficiaryNominationRow,
  type PercentageSumRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Constants
  BENEFIT_TYPES,
  RELATIONSHIPS,
  // Request
  CreateBeneficiaryNominationSchema,
  UpdateBeneficiaryNominationSchema,
  NominationFiltersSchema,
  // Response
  BeneficiaryNominationResponseSchema,
  BeneficiaryNominationListResponseSchema,
  PercentageSummarySchema,
  PercentageSummaryListSchema,
  // Types
  type BenefitType,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateBeneficiaryNomination,
  type UpdateBeneficiaryNomination,
  type NominationFilters,
  type BeneficiaryNominationResponse,
  type BeneficiaryNominationListResponse,
  type PercentageSummary,
  type PercentageSummaryList,
} from "./schemas";
