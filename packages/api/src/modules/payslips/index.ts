/**
 * Payslips Module
 *
 * Provides the API layer for payslip management:
 * - Payslip templates (layout configuration for PDF generation)
 * - Payslip generation and retrieval
 * - Status management (draft -> approved -> issued)
 *
 * Usage:
 * ```typescript
 * import { payslipRoutes } from './modules/payslips';
 *
 * const app = new Elysia()
 *   .use(payslipRoutes);
 * ```
 */

// Export routes
export { payslipRoutes, type PayslipRoutes } from "./routes";

// Export service
export { PayslipService } from "./service";
export type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext as ServiceTenantContext,
} from "../../types/service-result";

// Export repository
export {
  PayslipRepository,
  type TenantContext,
  type PaginatedResult,
  type PayslipTemplateRow,
  type PayslipRow,
} from "./repository";

// Export schemas
export {
  PayslipStatusSchema,
  PAYSLIP_STATUS_TRANSITIONS,
  UuidSchema,
  DateSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  CreatePayslipTemplateSchema,
  UpdatePayslipTemplateSchema,
  PayslipTemplateResponseSchema,
  PayslipLineItemSchema,
  CreatePayslipSchema,
  UpdatePayslipStatusSchema,
  PayslipResponseSchema,
  PayslipFiltersSchema,
  type PayslipStatus,
  type PaginationQuery,
  type IdParams,
  type EmployeeIdParams,
  type OptionalIdempotencyHeader,
  type CreatePayslipTemplate,
  type UpdatePayslipTemplate,
  type PayslipTemplateResponse,
  type PayslipLineItem,
  type CreatePayslip,
  type UpdatePayslipStatus,
  type PayslipResponse,
  type PayslipFilters,
} from "./schemas";
