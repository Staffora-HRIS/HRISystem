/**
 * Working Time Regulations Module
 *
 * Provides the complete API layer for UK Working Time Regulations 1998 monitoring:
 * - 48-hour opt-out agreements (voluntary, in writing)
 * - Compliance alerts (weekly hours exceeded/warning, rest violations, break violations)
 * - Compliance dashboard report
 * - Individual employee working time status
 *
 * Usage:
 * ```typescript
 * import { wtrRoutes } from './modules/wtr';
 *
 * const app = new Elysia()
 *   .use(wtrRoutes);
 * ```
 */

// Export routes
export { wtrRoutes, type WTRRoutes } from "./routes";

// Export service
export { WTRService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  WTRRepository,
  type TenantContext,
  type PaginatedResult,
  type OptOutRow,
  type AlertRow,
  type WeeklyHoursRow,
  type EmployeeHoursRow,
} from "./repository";

// Export schemas
export {
  // Constants
  WTR_CONSTANTS,
  // Enums
  WtrOptOutStatusSchema,
  WtrAlertTypeSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateOptOutSchema,
  RevokeOptOutSchema,
  OptOutFiltersSchema,
  AlertFiltersSchema,
  // Response schemas
  OptOutResponseSchema,
  AlertResponseSchema,
  EmployeeWorkingTimeStatusSchema,
  ComplianceReportSchema,
  // Types
  type WtrOptOutStatus,
  type WtrAlertType,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateOptOut,
  type RevokeOptOut,
  type OptOutFilters,
  type AlertFilters,
  type OptOutResponse,
  type AlertResponse,
  type EmployeeWorkingTimeStatus,
  type ComplianceReport,
} from "./schemas";
