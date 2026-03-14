/**
 * Pension Auto-Enrolment Module
 *
 * UK workplace pension auto-enrolment (Pensions Act 2008).
 * Criminal prosecution risk for non-compliance.
 *
 * Provides:
 * - Pension scheme configuration
 * - Employee eligibility assessment
 * - Auto-enrolment of eligible jobholders
 * - Opt-out processing within statutory window
 * - Contribution calculation on qualifying earnings
 * - Bulk re-enrolment every 3 years
 * - Compliance summary dashboard
 *
 * Usage:
 * ```typescript
 * import { pensionRoutes } from './modules/pension';
 *
 * const app = new Elysia()
 *   .use(pensionRoutes);
 * ```
 */

// Export routes
export { pensionRoutes, type PensionRoutes } from "./routes";

// Export service
export { PensionService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  PensionRepository,
  type TenantContext,
  type PaginatedResult,
  type PensionSchemeRow,
  type PensionEnrolmentRow,
  type PensionContributionRow,
  type EmployeeAssessmentData,
} from "./repository";

// Export schemas
export {
  // Enums
  PensionSchemeTypeSchema,
  PensionSchemeStatusSchema,
  PensionEnrolmentStatusSchema,
  PensionWorkerCategorySchema,
  PensionContributionStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Pension Scheme
  CreatePensionSchemeSchema,
  UpdatePensionSchemeSchema,
  PensionSchemeResponseSchema,
  // Eligibility
  EligibilityAssessmentResponseSchema,
  // Enrolment
  PensionEnrolmentResponseSchema,
  OptOutRequestSchema,
  PostponeRequestSchema,
  EnrolmentFiltersSchema,
  // Contributions
  CalculateContributionsRequestSchema,
  PensionContributionResponseSchema,
  // Re-enrolment
  ReEnrolmentResultSchema,
  // Compliance
  ComplianceSummaryResponseSchema,
  // Types
  type PensionSchemeType,
  type PensionSchemeStatus,
  type PensionEnrolmentStatus,
  type PensionWorkerCategory,
  type PensionContributionStatus,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreatePensionScheme,
  type UpdatePensionScheme,
  type PensionSchemeResponse,
  type EligibilityAssessmentResponse,
  type PensionEnrolmentResponse,
  type OptOutRequest,
  type PostponeRequest,
  type EnrolmentFilters,
  type CalculateContributionsRequest,
  type PensionContributionResponse,
  type ReEnrolmentResult,
  type ComplianceSummaryResponse,
} from "./schemas";
