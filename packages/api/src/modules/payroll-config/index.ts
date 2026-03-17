/**
 * Payroll Config Module
 *
 * Provides the complete API layer for payroll configuration:
 * - Pay Schedules (frequency, pay day, tax week alignment)
 * - Employee Pay Assignments (effective-dated schedule links)
 * - NI Categories (effective-dated HMRC NI category tracking)
 *
 * Usage:
 * ```typescript
 * import { payrollConfigRoutes } from './modules/payroll-config';
 *
 * const app = new Elysia()
 *   .use(payrollConfigRoutes);
 * ```
 */

// Export routes
export { payrollConfigRoutes, type PayrollConfigRoutes } from "./routes";

// Export service
export { PayrollConfigService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  PayrollConfigRepository,
  type TenantContext,
  type PaginatedResult,
  type PayScheduleRow,
  type PayAssignmentRow,
  type NiCategoryRow,
} from "./repository";

// Export schemas
export {
  // Enums
  PayFrequencySchema,
  NiCategoryLetterSchema,
  // Common
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Pay Schedule
  CreatePayScheduleSchema,
  UpdatePayScheduleSchema,
  PayScheduleResponseSchema,
  // Pay Assignment
  CreatePayAssignmentSchema,
  UpdatePayAssignmentSchema,
  AssignmentIdParamsSchema,
  PayAssignmentResponseSchema,
  // NI Category
  CreateNiCategorySchema,
  UpdateNiCategorySchema,
  NiCategoryResponseSchema,
  // Types
  type PayFrequency,
  type NiCategoryLetter,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreatePaySchedule,
  type UpdatePaySchedule,
  type PayScheduleResponse,
  type CreatePayAssignment,
  type UpdatePayAssignment,
  type AssignmentIdParams,
  type PayAssignmentResponse,
  type CreateNiCategory,
  type UpdateNiCategory,
  type NiCategoryResponse,
} from "./schemas";
