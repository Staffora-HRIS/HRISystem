/**
 * Unpaid Parental Leave Module
 *
 * Provides the complete API layer for UK unpaid parental leave tracking
 * (Employment Rights Act 1996, Part VIII).
 *
 * Features:
 * - Per-child entitlement registration (18 weeks per child)
 * - Booking management with statutory validation
 * - Approval/rejection workflow
 *
 * Usage:
 * ```typescript
 * import { parentalLeaveRoutes } from './modules/parental-leave';
 *
 * const app = new Elysia()
 *   .use(parentalLeaveRoutes);
 * ```
 */

// Export routes
export { parentalLeaveRoutes, type ParentalLeaveRoutes } from "./routes";

// Export service
export { ParentalLeaveService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  ParentalLeaveRepository,
  type TenantContext,
  type PaginatedResult,
  type EntitlementRow,
  type BookingRow,
} from "./repository";

// Export schemas
export {
  // Enums
  BookingStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Entitlement
  CreateEntitlementSchema,
  EntitlementResponseSchema,
  // Booking
  CreateBookingSchema,
  BookingFiltersSchema,
  BookingResponseSchema,
  BookingDecisionSchema,
  // Types
  type BookingStatus,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateEntitlement,
  type EntitlementResponse,
  type CreateBooking,
  type BookingFilters,
  type BookingResponse,
  type BookingDecision,
} from "./schemas";
