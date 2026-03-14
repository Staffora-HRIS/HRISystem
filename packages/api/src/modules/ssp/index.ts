/**
 * SSP (Statutory Sick Pay) Module
 *
 * Provides the complete API layer for UK Statutory Sick Pay management including:
 * - SSP Records (periods of incapacity for work)
 * - Daily payment logs
 * - Eligibility and entitlement checks
 * - PIW (Period of Incapacity for Work) linking
 *
 * Usage:
 * ```typescript
 * import { sspRoutes } from './modules/ssp';
 *
 * const app = new Elysia()
 *   .use(sspRoutes);
 * ```
 */

// Export routes
export { sspRoutes, type SSPRoutes } from "./routes";

// Export service
export { SSPService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  SSPRepository,
  type TenantContext,
  type PaginatedResult,
  type SSPRecordRow,
  type SSPDailyLogRow,
} from "./repository";

// Export schemas
export {
  // Constants
  SSP_CONSTANTS,
  // Enums
  SSPRecordStatusSchema,
  SSPDayTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  QualifyingDaysPatternSchema,
  // Request schemas
  CreateSSPRecordSchema,
  UpdateSSPRecordSchema,
  EndSSPRecordSchema,
  SSPRecordFiltersSchema,
  // Response schemas
  SSPRecordResponseSchema,
  SSPRecordDetailResponseSchema,
  SSPDailyLogResponseSchema,
  SSPEligibilityResponseSchema,
  SSPEntitlementResponseSchema,
  // Types
  type SSPRecordStatus,
  type SSPDayType,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type QualifyingDaysPattern,
  type CreateSSPRecord,
  type UpdateSSPRecord,
  type EndSSPRecord,
  type SSPRecordFilters,
  type SSPRecordResponse,
  type SSPRecordDetailResponse,
  type SSPDailyLogResponse,
  type SSPEligibilityResponse,
  type SSPEntitlementResponse,
} from "./schemas";
