/**
 * Deductions Module
 *
 * Provides the API layer for payroll deduction management:
 * - Deduction type catalogue (statutory and voluntary)
 * - Employee deduction assignments with effective dating
 * - Multiple calculation methods (fixed, percentage, tiered)
 *
 * Usage:
 * ```typescript
 * import { deductionRoutes } from './modules/deductions';
 *
 * const app = new Elysia()
 *   .use(deductionRoutes);
 * ```
 */

// Export routes
export { deductionRoutes, type DeductionRoutes } from "./routes";

// Export service
export { DeductionService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  DeductionRepository,
  type TenantContext,
  type PaginatedResult,
  type DeductionTypeRow,
  type EmployeeDeductionRow,
} from "./repository";

// Export schemas
export {
  DeductionCategorySchema,
  CalculationMethodSchema,
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  CreateDeductionTypeSchema,
  UpdateDeductionTypeSchema,
  DeductionTypeResponseSchema,
  CreateEmployeeDeductionSchema,
  UpdateEmployeeDeductionSchema,
  EmployeeDeductionResponseSchema,
  type DeductionCategory,
  type CalculationMethod,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateDeductionType,
  type UpdateDeductionType,
  type DeductionTypeResponse,
  type CreateEmployeeDeduction,
  type UpdateEmployeeDeduction,
  type EmployeeDeductionResponse,
} from "./schemas";
