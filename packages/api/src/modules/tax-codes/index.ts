/**
 * Tax Codes Module
 *
 * Provides the API layer for employee HMRC tax code management:
 * - Effective-dated tax code records per employee
 * - Source tracking (HMRC notification, P45, P46, Starter Declaration, manual entry)
 * - Cumulative vs week1/month1 basis
 * - UK HMRC tax code format validation
 * - Current tax code lookup for payroll processing
 *
 * Usage:
 * ```typescript
 * import { taxCodeRoutes } from './modules/tax-codes';
 *
 * const app = new Elysia()
 *   .use(taxCodeRoutes);
 * ```
 */

// Export routes
export { taxCodeRoutes, type TaxCodeRoutes } from "./routes";

// Export service
export { TaxCodeService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  TaxCodeRepository,
  type TenantContext,
  type PaginatedResult,
  type TaxCodeRow,
} from "./repository";

// Export schemas
export {
  TaxCodeSourceSchema,
  TaxCodeStringSchema,
  UK_TAX_CODE_REGEX,
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  CreateTaxCodeSchema,
  UpdateTaxCodeSchema,
  TaxCodeResponseSchema,
  type TaxCodeSource,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreateTaxCode,
  type UpdateTaxCode,
  type TaxCodeResponse,
} from "./schemas";
