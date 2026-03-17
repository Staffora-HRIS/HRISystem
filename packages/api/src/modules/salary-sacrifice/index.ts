/**
 * Salary Sacrifice Module
 *
 * Provides the API layer for salary sacrifice management:
 * - CRUD for salary sacrifice arrangements
 * - NMW compliance validation (sacrifice must not reduce pay below NMW)
 * - Supports pension, cycle_to_work, childcare_vouchers, electric_car, technology
 *
 * Usage:
 * ```typescript
 * import { salarySacrificeRoutes } from './modules/salary-sacrifice';
 *
 * const app = new Elysia()
 *   .use(salarySacrificeRoutes);
 * ```
 */

// Export routes
export { salarySacrificeRoutes, type SalarySacrificeRoutes } from "./routes";

// Export service
export { SalarySacrificeService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  SalarySacrificeRepository,
  type TenantContext,
  type PaginatedResult,
  type SalarySacrificeRow,
  type EmployeeSalaryData,
} from "./repository";

// Export schemas
export {
  SacrificeTypeSchema,
  SacrificeFrequencySchema,
  SacrificeStatusSchema,
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  CreateSalarySacrificeSchema,
  UpdateSalarySacrificeSchema,
  SalarySacrificeResponseSchema,
  SalarySacrificeFiltersSchema,
  type SacrificeType,
  type SacrificeFrequency,
  type SacrificeStatus,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateSalarySacrifice,
  type UpdateSalarySacrifice,
  type SalarySacrificeResponse,
  type SalarySacrificeFilters,
} from "./schemas";
