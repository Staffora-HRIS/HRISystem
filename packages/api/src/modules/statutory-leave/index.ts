/**
 * Statutory Leave Module
 *
 * UK statutory leave management for:
 * - Maternity Leave & Statutory Maternity Pay (SMP)
 * - Paternity Leave & Statutory Paternity Pay (SPP)
 * - Shared Parental Leave & Pay (ShPL / ShPP)
 * - Adoption Leave & Pay
 *
 * Usage:
 * ```typescript
 * import { statutoryLeaveRoutes } from './modules/statutory-leave';
 *
 * const app = new Elysia()
 *   .use(statutoryLeaveRoutes);
 * ```
 */

// Export routes
export { statutoryLeaveRoutes, type StatutoryLeaveRoutes } from "./routes";

// Export service
export { StatutoryLeaveService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  StatutoryLeaveRepository,
  type TenantContext,
  type PaginatedResult,
  type StatutoryLeaveRow,
  type StatutoryLeaveListRow,
  type PayPeriodRow,
  type KITDayRow,
  type EmployeeServiceRow,
} from "./repository";

// Export schemas
export {
  // Enums
  StatutoryLeaveTypeSchema,
  StatutoryLeaveStatusSchema,
  StatutoryPayTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  // Create/Update
  CreateStatutoryLeaveSchema,
  UpdateStatutoryLeaveSchema,
  CurtailLeaveSchema,
  CreateKITDaySchema,
  // Filters
  StatutoryLeaveFiltersSchema,
  // Response
  StatutoryLeaveResponseSchema,
  StatutoryLeaveListItemSchema,
  StatutoryLeaveListResponseSchema,
  PayPeriodResponseSchema,
  KITDayResponseSchema,
  PayCalculationResponseSchema,
  EligibilityResponseSchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type StatutoryLeaveType,
  type StatutoryLeaveStatus,
  type StatutoryPayType,
  type CreateStatutoryLeave,
  type UpdateStatutoryLeave,
  type CurtailLeave,
  type CreateKITDay,
  type StatutoryLeaveFilters,
  type PaginationQuery,
  type StatutoryLeaveResponse,
  type StatutoryLeaveListItem,
  type StatutoryLeaveListResponse,
  type PayPeriodResponse,
  type KITDayResponse,
  type PayCalculationResponse,
  type EligibilityResponse,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
