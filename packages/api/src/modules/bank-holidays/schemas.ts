/**
 * Bank Holiday Module - TypeBox Schemas
 *
 * Defines validation schemas for all Bank Holiday API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Table: app.bank_holidays
 * Columns: id, tenant_id, name, date, country_code, region, created_at
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Date string schema (YYYY-MM-DD)
 */
export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

/**
 * ISO 3166-1 alpha-2 country code (e.g., GB, IE)
 */
export const CountryCodeSchema = t.String({
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});

/**
 * Region code for sub-national holidays.
 * UK regions: ENG (England), SCT (Scotland), WLS (Wales), NIR (Northern Ireland).
 * NULL means the holiday applies to the whole country.
 */
export const RegionSchema = t.String({
  minLength: 1,
  maxLength: 10,
  pattern: "^[A-Z]{2,10}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create bank holiday request
 */
export const CreateBankHolidaySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  date: DateSchema,
  country_code: t.Optional(CountryCodeSchema),
  region: t.Optional(t.Union([RegionSchema, t.Null()])),
});

export type CreateBankHoliday = Static<typeof CreateBankHolidaySchema>;

/**
 * Update bank holiday request
 */
export const UpdateBankHolidaySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    date: DateSchema,
    country_code: CountryCodeSchema,
    region: t.Union([RegionSchema, t.Null()]),
  })
);

export type UpdateBankHoliday = Static<typeof UpdateBankHolidaySchema>;

/**
 * Single item in a bulk import array
 */
export const BulkBankHolidayItemSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  date: DateSchema,
  country_code: t.Optional(CountryCodeSchema),
  region: t.Optional(t.Union([RegionSchema, t.Null()])),
});

export type BulkBankHolidayItem = Static<typeof BulkBankHolidayItemSchema>;

/**
 * Bulk import request body
 */
export const BulkImportBankHolidaysSchema = t.Object({
  holidays: t.Array(BulkBankHolidayItemSchema, {
    minItems: 1,
    maxItems: 200,
  }),
});

export type BulkImportBankHolidays = Static<typeof BulkImportBankHolidaysSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Bank holiday response
 */
export const BankHolidayResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  date: t.String(),
  country_code: t.String(),
  region: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type BankHolidayResponse = Static<typeof BankHolidayResponseSchema>;

/**
 * Bulk import response
 */
export const BulkImportResponseSchema = t.Object({
  imported: t.Number(),
  skipped: t.Number(),
  items: t.Array(BankHolidayResponseSchema),
});

export type BulkImportResponse = Static<typeof BulkImportResponseSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Bank holiday filters for list endpoint
 */
export const BankHolidayFiltersSchema = t.Object({
  country_code: t.Optional(CountryCodeSchema),
  region: t.Optional(RegionSchema),
  year: t.Optional(t.Number({ minimum: 2000, maximum: 2100 })),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type BankHolidayFilters = Static<typeof BankHolidayFiltersSchema>;

// =============================================================================
// Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

// =============================================================================
// Header Schemas
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
