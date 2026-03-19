/**
 * Overtime Requests Module
 *
 * Provides the complete API layer for overtime authorisation workflow:
 * - Employees submit overtime requests (planned, unplanned, emergency)
 * - Managers approve or reject with reason
 * - Employees can cancel pending requests
 * - Full audit trail via domain events (outbox pattern)
 *
 * State machine:
 *   pending -> approved / rejected / cancelled
 *
 * Usage:
 * ```typescript
 * import { overtimeRequestRoutes } from './modules/overtime-requests';
 *
 * const app = new Elysia()
 *   .use(overtimeRequestRoutes);
 * ```
 */

// Export routes
export { overtimeRequestRoutes, type OvertimeRequestRoutes } from "./routes";

// Export service
export { OvertimeRequestService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  OvertimeRequestRepository,
  type TenantContext,
  type PaginatedResult,
  type OvertimeRequestRow,
} from "./repository";

// Export schemas
export {
  // Enums
  OvertimeRequestTypeSchema,
  OvertimeAuthorisationTypeSchema,
  OvertimeRequestStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateOvertimeRequestSchema,
  ApproveOvertimeRequestSchema,
  RejectOvertimeRequestSchema,
  // Filter schemas
  OvertimeRequestFiltersSchema,
  // Response schemas
  OvertimeRequestResponseSchema,
  // Types
  type OvertimeRequestType,
  type OvertimeAuthorisationType,
  type OvertimeRequestStatus,
  type PaginationQuery,
  type IdParams,
  type OptionalIdempotencyHeader,
  type CreateOvertimeRequest,
  type ApproveOvertimeRequest,
  type RejectOvertimeRequest,
  type OvertimeRequestFilters,
  type OvertimeRequestResponse,
} from "./schemas";
