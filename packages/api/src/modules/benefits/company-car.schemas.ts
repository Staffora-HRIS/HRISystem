/**
 * Company Car & Car Allowance - TypeBox Schemas
 *
 * Defines request/response schemas for UK company car BIK tracking
 * and car allowance management. Part of the Benefits module.
 *
 * BIK calculation follows HMRC rules:
 *   BIK = list_price x appropriate_percentage (based on CO2 emissions and fuel type)
 *   Fuel BIK = fuel_benefit_charge_multiplier (fixed annually by HMRC)
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Enums
// =============================================================================

export const CarFuelType = Type.Union([
  Type.Literal("petrol"),
  Type.Literal("diesel"),
  Type.Literal("hybrid"),
  Type.Literal("electric"),
]);

export type CarFuelType = Static<typeof CarFuelType>;

// =============================================================================
// Company Car - Create Schema
// =============================================================================

export const CreateCompanyCar = Type.Object({
  employee_id: Type.String({ format: "uuid" }),
  registration: Type.String({ minLength: 1, maxLength: 20, description: "UK vehicle registration number" }),
  make: Type.String({ minLength: 1, maxLength: 100 }),
  model: Type.String({ minLength: 1, maxLength: 100 }),
  list_price: Type.Number({ minimum: 0.01, maximum: 999999999.99, description: "P11D list price in GBP" }),
  co2_emissions: Type.Integer({ minimum: 0, maximum: 999, description: "CO2 emissions in g/km" }),
  fuel_type: CarFuelType,
  date_available: Type.String({ format: "date", description: "Date car first made available to employee" }),
  date_returned: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
  private_fuel_provided: Type.Optional(Type.Boolean({ default: false })),
});

export type CreateCompanyCar = Static<typeof CreateCompanyCar>;

// =============================================================================
// Company Car - Update Schema
// =============================================================================

export const UpdateCompanyCar = Type.Object({
  registration: Type.Optional(Type.String({ minLength: 1, maxLength: 20 })),
  make: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  model: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  list_price: Type.Optional(Type.Number({ minimum: 0.01, maximum: 999999999.99 })),
  co2_emissions: Type.Optional(Type.Integer({ minimum: 0, maximum: 999 })),
  fuel_type: Type.Optional(CarFuelType),
  date_available: Type.Optional(Type.String({ format: "date" })),
  date_returned: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
  private_fuel_provided: Type.Optional(Type.Boolean()),
});

export type UpdateCompanyCar = Static<typeof UpdateCompanyCar>;

// =============================================================================
// Company Car - Response Schema
// =============================================================================

export const CompanyCarResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  employee_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  registration: Type.String(),
  make: Type.String(),
  model: Type.String(),
  list_price: Type.Number(),
  co2_emissions: Type.Integer(),
  fuel_type: CarFuelType,
  date_available: Type.String(),
  date_returned: Type.Union([Type.String(), Type.Null()]),
  private_fuel_provided: Type.Boolean(),
  created_by: Type.Union([Type.String(), Type.Null()]),
  updated_by: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type CompanyCarResponse = Static<typeof CompanyCarResponse>;

// =============================================================================
// Company Car - Filter Schema
// =============================================================================

export const CompanyCarFilters = Type.Object({
  employee_id: Type.Optional(Type.String({ format: "uuid" })),
  fuel_type: Type.Optional(CarFuelType),
  active_only: Type.Optional(Type.Boolean({ description: "Only return cars with no date_returned" })),
});

export type CompanyCarFilters = Static<typeof CompanyCarFilters>;

// =============================================================================
// Company Car - BIK Response Schema
// =============================================================================

export const CompanyCarBikResponse = Type.Object({
  car_id: Type.String({ format: "uuid" }),
  tax_year: Type.String({ description: "Tax year, e.g. 2025/26" }),
  list_price: Type.Number(),
  co2_emissions: Type.Integer(),
  fuel_type: CarFuelType,
  appropriate_percentage: Type.Number({ description: "HMRC appropriate percentage for BIK calculation" }),
  car_bik_value: Type.Number({ description: "Annual BIK value: list_price x appropriate_percentage" }),
  fuel_bik_value: Type.Union([Type.Number(), Type.Null()], { description: "Annual fuel BIK if private fuel provided, otherwise null" }),
  total_bik_value: Type.Number({ description: "Total annual BIK (car + fuel if applicable)" }),
  days_available: Type.Integer({ description: "Number of days the car was available in the tax year" }),
  pro_rata_bik_value: Type.Number({ description: "BIK value pro-rated for days available" }),
});

export type CompanyCarBikResponse = Static<typeof CompanyCarBikResponse>;

// =============================================================================
// Company Car - BIK Query Schema
// =============================================================================

export const CompanyCarBikQuery = Type.Object({
  tax_year: Type.Optional(Type.String({
    pattern: "^\\d{4}/\\d{2}$",
    description: "Tax year in format YYYY/YY, e.g. 2025/26. Defaults to current tax year.",
  })),
});

export type CompanyCarBikQuery = Static<typeof CompanyCarBikQuery>;

// =============================================================================
// Car Allowance - Create Schema
// =============================================================================

export const CreateCarAllowance = Type.Object({
  employee_id: Type.String({ format: "uuid" }),
  monthly_amount: Type.Number({ minimum: 0.01, maximum: 99999.99, description: "Monthly car allowance in GBP" }),
  effective_from: Type.String({ format: "date" }),
  effective_to: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
});

export type CreateCarAllowance = Static<typeof CreateCarAllowance>;

// =============================================================================
// Car Allowance - Update Schema
// =============================================================================

export const UpdateCarAllowance = Type.Object({
  monthly_amount: Type.Optional(Type.Number({ minimum: 0.01, maximum: 99999.99 })),
  effective_from: Type.Optional(Type.String({ format: "date" })),
  effective_to: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
});

export type UpdateCarAllowance = Static<typeof UpdateCarAllowance>;

// =============================================================================
// Car Allowance - Response Schema
// =============================================================================

export const CarAllowanceResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  employee_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  monthly_amount: Type.Number(),
  effective_from: Type.String(),
  effective_to: Type.Union([Type.String(), Type.Null()]),
  created_by: Type.Union([Type.String(), Type.Null()]),
  updated_by: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type CarAllowanceResponse = Static<typeof CarAllowanceResponse>;

// =============================================================================
// Car Allowance - Filter Schema
// =============================================================================

export const CarAllowanceFilters = Type.Object({
  employee_id: Type.Optional(Type.String({ format: "uuid" })),
  active_only: Type.Optional(Type.Boolean({ description: "Only return allowances where effective_to IS NULL" })),
});

export type CarAllowanceFilters = Static<typeof CarAllowanceFilters>;

// =============================================================================
// Pagination
// =============================================================================

export const CompanyCarPaginationQuery = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  cursor: Type.Optional(Type.String()),
});

export type CompanyCarPaginationQuery = Static<typeof CompanyCarPaginationQuery>;
