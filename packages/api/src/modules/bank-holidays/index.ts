/**
 * Bank Holiday Module
 *
 * Provides the complete API layer for bank holiday configuration.
 * Allows tenants to manage bank holiday calendars by country and region
 * (e.g., Scotland-specific holidays like St Andrew's Day).
 *
 * Usage:
 * ```typescript
 * import { bankHolidayRoutes } from './modules/bank-holidays';
 *
 * const app = new Elysia()
 *   .use(bankHolidayRoutes);
 * ```
 */

// Export routes
export { bankHolidayRoutes, type BankHolidayRoutes } from "./routes";

// Export service
export { BankHolidayService } from "./service";

// Export repository
export {
  BankHolidayRepository,
  type TenantContext,
  type PaginatedResult,
  type BankHolidayRow,
} from "./repository";

// Export schemas
export {
  // Common
  UuidSchema,
  DateSchema,
  CountryCodeSchema,
  RegionSchema,
  PaginationQuerySchema,
  // Request
  CreateBankHolidaySchema,
  UpdateBankHolidaySchema,
  BulkBankHolidayItemSchema,
  BulkImportBankHolidaysSchema,
  // Response
  BankHolidayResponseSchema,
  BulkImportResponseSchema,
  // Filters
  BankHolidayFiltersSchema,
  // Params
  IdParamsSchema,
  // Headers
  OptionalIdempotencyHeaderSchema,
  // Types
  type PaginationQuery,
  type CreateBankHoliday,
  type UpdateBankHoliday,
  type BulkBankHolidayItem,
  type BulkImportBankHolidays,
  type BankHolidayResponse,
  type BulkImportResponse,
  type BankHolidayFilters,
  type IdParams,
  type OptionalIdempotencyHeader,
} from "./schemas";
