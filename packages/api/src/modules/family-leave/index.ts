/**
 * Family Leave Module
 *
 * UK family leave management for:
 * - Maternity Leave & Statutory Maternity Pay (SMP)
 * - Paternity Leave & Statutory Paternity Pay (SPP)
 * - Shared Parental Leave & Pay (ShPL / ShPP)
 * - Adoption Leave & Pay
 *
 * Provides a unified API over the statutory_leave_records schema
 * with enhanced compliance tracking, notice management, and
 * a compliance dashboard.
 *
 * Usage:
 * ```typescript
 * import { familyLeaveRoutes } from './modules/family-leave';
 *
 * const app = new Elysia()
 *   .use(familyLeaveRoutes);
 * ```
 */

// Export routes
export { familyLeaveRoutes, type FamilyLeaveRoutes } from "./routes";

// Export service
export { FamilyLeaveService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  FamilyLeaveRepository,
  type TenantContext,
  type PaginatedResult,
  type EntitlementRow,
  type EntitlementListRow,
  type PayPeriodRow,
  type KITDayRow,
  type NoticeRow,
  type EmployeeServiceRow,
} from "./repository";

// Export schemas
export {
  // Enums
  FamilyLeaveTypeSchema,
  FamilyLeaveStatusSchema,
  PayRateTypeSchema,
  NoticeTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Create/Update
  CreateEntitlementSchema,
  EligibilityCheckSchema,
  CreateKITDaySchema,
  CurtailLeaveSchema,
  CreateNoticeSchema,
  // Filters
  EntitlementFiltersSchema,
  // Response
  EntitlementResponseSchema,
  EntitlementListItemSchema,
  PayPeriodResponseSchema,
  KITDayResponseSchema,
  NoticeResponseSchema,
  PayScheduleResponseSchema,
  EligibilityResponseSchema,
  DashboardResponseSchema,
  // Types
  type FamilyLeaveType,
  type FamilyLeaveStatus,
  type PayRateType,
  type NoticeType,
  type CreateEntitlement,
  type EligibilityCheck,
  type CreateKITDay,
  type CurtailLeave,
  type CreateNotice,
  type PaginationQuery,
  type EntitlementFilters,
  type EntitlementResponse,
  type EntitlementListItem,
  type PayPeriodResponse,
  type KITDayResponse,
  type NoticeResponse,
  type PayScheduleResponse,
  type EligibilityResponse,
  type DashboardResponse,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
