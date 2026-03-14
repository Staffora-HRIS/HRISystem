/**
 * Bank Details Module
 *
 * Provides the complete API layer for managing employee bank details.
 * Bank details are sensitive sub-resources of employees with effective-dating
 * support for historical tracking.
 *
 * Usage:
 * ```typescript
 * import { bankDetailRoutes } from './modules/bank-details';
 *
 * const app = new Elysia()
 *   .use(bankDetailRoutes);
 * ```
 */

// Export routes
export { bankDetailRoutes, type BankDetailRoutes } from "./routes";

// Export service
export { BankDetailService } from "./service";
export type { ServiceResult, PaginatedServiceResult, TenantContext as ServiceTenantContext } from "../../types/service-result";

// Export repository
export {
  BankDetailRepository,
  type TenantContext,
  type PaginatedResult,
  type BankDetailRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  PaginationQuerySchema,
  // Params
  IdParamsSchema,
  EmployeeIdParamsSchema,
  EmployeeBankDetailParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Request
  CreateBankDetailSchema,
  UpdateBankDetailSchema,
  // Response
  BankDetailResponseSchema,
  BankDetailListResponseSchema,
  // Types
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type EmployeeBankDetailParams,
  type OptionalIdempotencyHeader,
  type CreateBankDetail,
  type UpdateBankDetail,
  type BankDetailResponse,
  type BankDetailListResponse,
} from "./schemas";
