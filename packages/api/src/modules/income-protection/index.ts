/**
 * Income Protection Module
 *
 * Provides the API layer for income protection insurance management:
 * - Policy configuration (provider, benefit basis, deferred period, caps)
 * - Employee enrollment with automatic benefit calculation
 * - Claim tracking and premium management
 *
 * Usage:
 * ```typescript
 * import { incomeProtectionRoutes } from './modules/income-protection';
 *
 * const app = new Elysia()
 *   .use(incomeProtectionRoutes);
 * ```
 */

// Export routes
export { incomeProtectionRoutes, type IncomeProtectionRoutes } from "./routes";

// Export service
export { IncomeProtectionService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  IncomeProtectionRepository,
  type TenantContext,
  type PaginatedResult,
  type PolicyRow,
  type EnrollmentRow,
} from "./repository";

// Export schemas
export {
  PolicyStatusSchema,
  EnrollmentStatusSchema,
  BenefitBasisSchema,
  DeferredPeriodSchema,
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  PolicyIdParamsSchema,
  EnrollmentIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  CreatePolicySchema,
  UpdatePolicySchema,
  PolicyResponseSchema,
  PolicyFiltersSchema,
  CreateEnrollmentSchema,
  UpdateEnrollmentSchema,
  EnrollmentResponseSchema,
  EnrollmentFiltersSchema,
  type PolicyStatus,
  type EnrollmentStatus,
  type BenefitBasis,
  type DeferredPeriod,
  type PaginationQuery,
  type IdParams,
  type PolicyIdParams,
  type EnrollmentIdParams,
  type OptionalIdempotencyHeader,
  type CreatePolicy,
  type UpdatePolicy,
  type PolicyResponse,
  type PolicyFilters,
  type CreateEnrollment,
  type UpdateEnrollment,
  type EnrollmentResponse,
  type EnrollmentFilters,
} from "./schemas";
