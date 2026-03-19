/**
 * Overtime Rules Module
 *
 * Provides overtime rule configuration with effective dating and
 * overtime calculation based on employee timesheet hours.
 *
 * Features:
 *   - CRUD for overtime rules (threshold hours, rate multiplier, effective dates)
 *   - Single-employee and batch overtime calculation
 *   - Calculation approval workflow (calculated -> approved -> paid)
 *   - Effective-date overlap prevention
 *   - Domain events via outbox pattern
 *
 * Usage:
 * ```typescript
 * import { overtimeRulesRoutes } from './modules/overtime-rules';
 *
 * const app = new Elysia()
 *   .use(overtimeRulesRoutes);
 * ```
 */

// Export routes
export { overtimeRulesRoutes, type OvertimeRulesRoutes } from "./routes";

// Export service
export { OvertimeRulesService, OvertimeRuleErrorCodes } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  OvertimeRulesRepository,
  type TenantContext,
  type PaginatedResult,
  type OvertimeRuleRow,
  type OvertimeCalculationRow,
  type EmployeeHoursRow,
} from "./repository";

// Export schemas
export {
  // Enums
  OvertimeCalculationStatusSchema,
  // Common
  UuidSchema,
  DateSchema,
  DateTimeSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  IdempotencyHeaderSchema,
  OptionalIdempotencyHeaderSchema,
  // Request schemas
  CreateOvertimeRuleSchema,
  UpdateOvertimeRuleSchema,
  CalculateOvertimeQuerySchema,
  BatchCalculateOvertimeSchema,
  ApproveOvertimeCalculationSchema,
  // Filter schemas
  OvertimeRuleFiltersSchema,
  OvertimeCalculationFiltersSchema,
  // Response schemas
  OvertimeRuleResponseSchema,
  OvertimeCalculationResponseSchema,
  BatchCalculateResponseSchema,
  // Types
  type OvertimeCalculationStatus,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type IdempotencyHeader,
  type OptionalIdempotencyHeader,
  type CreateOvertimeRule,
  type UpdateOvertimeRule,
  type CalculateOvertimeQuery,
  type BatchCalculateOvertime,
  type ApproveOvertimeCalculation,
  type OvertimeRuleFilters,
  type OvertimeCalculationFilters,
  type OvertimeRuleResponse,
  type OvertimeCalculationResponse,
  type BatchCalculateResponse,
} from "./schemas";
