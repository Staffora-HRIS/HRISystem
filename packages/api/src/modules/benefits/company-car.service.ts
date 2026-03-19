/**
 * Company Car & Car Allowance - Service Layer
 *
 * Implements business logic for UK company car tracking, BIK (Benefit in Kind)
 * calculation per HMRC rules, and car allowance management with effective dating.
 *
 * BIK Calculation (HMRC 2025/26 tax year):
 *   Car BIK = list_price x appropriate_percentage (determined by CO2 and fuel type)
 *   Fuel BIK = fuel_benefit_charge_multiplier (fixed at GBP 27,800 for 2025/26)
 *   Pro-rata: BIK is proportioned by days available in the tax year
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  CompanyCarRepository,
  CompanyCarRow,
  CarAllowanceRow,
} from "./company-car.repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateCompanyCar,
  UpdateCompanyCar,
  CompanyCarFilters,
  CompanyCarPaginationQuery,
  CompanyCarResponse,
  CompanyCarBikResponse,
  CompanyCarBikQuery,
  CarFuelType,
  CreateCarAllowance,
  UpdateCarAllowance,
  CarAllowanceFilters,
  CarAllowanceResponse,
} from "./company-car.schemas";

// =============================================================================
// HMRC BIK Appropriate Percentage Tables (2025/26 Tax Year)
// =============================================================================

interface BikBand {
  maxCo2: number;
  petrol: number;
  diesel: number;
  hybrid: number;
  electric: number;
}

const BIK_BANDS_2025_26: BikBand[] = [
  { maxCo2: 0,   petrol: 2,  diesel: 2,  hybrid: 2,  electric: 2 },
  { maxCo2: 50,  petrol: 15, diesel: 19, hybrid: 5,  electric: 2 },
  { maxCo2: 54,  petrol: 15, diesel: 19, hybrid: 15, electric: 2 },
  { maxCo2: 59,  petrol: 16, diesel: 20, hybrid: 16, electric: 2 },
  { maxCo2: 64,  petrol: 17, diesel: 21, hybrid: 17, electric: 2 },
  { maxCo2: 69,  petrol: 18, diesel: 22, hybrid: 18, electric: 2 },
  { maxCo2: 74,  petrol: 19, diesel: 23, hybrid: 19, electric: 2 },
  { maxCo2: 79,  petrol: 20, diesel: 24, hybrid: 20, electric: 2 },
  { maxCo2: 84,  petrol: 21, diesel: 25, hybrid: 21, electric: 2 },
  { maxCo2: 89,  petrol: 22, diesel: 26, hybrid: 22, electric: 2 },
  { maxCo2: 94,  petrol: 23, diesel: 27, hybrid: 23, electric: 2 },
  { maxCo2: 99,  petrol: 24, diesel: 28, hybrid: 24, electric: 2 },
  { maxCo2: 104, petrol: 25, diesel: 29, hybrid: 25, electric: 2 },
  { maxCo2: 109, petrol: 26, diesel: 30, hybrid: 26, electric: 2 },
  { maxCo2: 114, petrol: 27, diesel: 31, hybrid: 27, electric: 2 },
  { maxCo2: 119, petrol: 28, diesel: 32, hybrid: 28, electric: 2 },
  { maxCo2: 124, petrol: 29, diesel: 33, hybrid: 29, electric: 2 },
  { maxCo2: 129, petrol: 30, diesel: 34, hybrid: 30, electric: 2 },
  { maxCo2: 134, petrol: 31, diesel: 35, hybrid: 31, electric: 2 },
  { maxCo2: 139, petrol: 32, diesel: 36, hybrid: 32, electric: 2 },
  { maxCo2: 144, petrol: 33, diesel: 37, hybrid: 33, electric: 2 },
  { maxCo2: 149, petrol: 34, diesel: 37, hybrid: 34, electric: 2 },
  { maxCo2: 154, petrol: 35, diesel: 37, hybrid: 35, electric: 2 },
  { maxCo2: 159, petrol: 36, diesel: 37, hybrid: 36, electric: 2 },
  { maxCo2: 164, petrol: 37, diesel: 37, hybrid: 37, electric: 2 },
  { maxCo2: 169, petrol: 37, diesel: 37, hybrid: 37, electric: 2 },
  { maxCo2: Infinity, petrol: 37, diesel: 37, hybrid: 37, electric: 2 },
];

/** HMRC fuel benefit charge multiplier for 2025/26. */
const FUEL_BENEFIT_MULTIPLIER_2025_26 = 27800;

// =============================================================================
// Domain Event Types
// =============================================================================

type CompanyCarEventType =
  | "benefits.company_car.created"
  | "benefits.company_car.updated"
  | "benefits.company_car.deleted"
  | "benefits.car_allowance.created"
  | "benefits.car_allowance.updated"
  | "benefits.car_allowance.deleted";

// =============================================================================
// Company Car Service
// =============================================================================

export class CompanyCarService {
  constructor(
    private repository: CompanyCarRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    aggregateType: string,
    eventType: CompanyCarEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id,
        event_type, payload, created_at
      )
      VALUES (
        gen_random_uuid(),
        ${context.tenantId}::uuid,
        ${aggregateType},
        ${aggregateId}::uuid,
        ${eventType},
        ${JSON.stringify({ ...payload, actor: context.userId })}::jsonb,
        now()
      )
    `;
  }

  // ===========================================================================
  // Company Car - List
  // ===========================================================================

  async listCompanyCars(
    context: TenantContext,
    filters: CompanyCarFilters = {},
    pagination: CompanyCarPaginationQuery = {}
  ): Promise<PaginatedServiceResult<CompanyCarResponse>> {
    const result = await this.repository.findCompanyCars(context, filters, pagination);
    return {
      items: result.items.map(this.mapCarToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Company Car - Get by ID
  // ===========================================================================

  async getCompanyCar(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<CompanyCarResponse>> {
    const car = await this.repository.findCompanyCarById(context, id);
    if (!car) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Company car not found", details: { id } },
      };
    }
    return { success: true, data: this.mapCarToResponse(car) };
  }

  // ===========================================================================
  // Company Car - Get active cars for employee
  // ===========================================================================

  async getEmployeeActiveCars(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<CompanyCarResponse[]>> {
    const cars = await this.repository.findActiveCarsByEmployee(context, employeeId);
    return { success: true, data: cars.map(this.mapCarToResponse) };
  }

  // ===========================================================================
  // Company Car - Create
  // ===========================================================================

  async createCompanyCar(
    context: TenantContext,
    data: CreateCompanyCar
  ): Promise<ServiceResult<CompanyCarResponse>> {
    if (data.date_returned && new Date(data.date_returned) < new Date(data.date_available)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Date returned must be on or after date available",
          details: { date_available: data.date_available, date_returned: data.date_returned },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const car = await this.repository.createCompanyCar(tx, context, data);
      await this.emitEvent(tx, context, car.id, "company_car", "benefits.company_car.created", {
        carId: car.id, employeeId: data.employee_id, registration: data.registration,
        make: data.make, model: data.model, listPrice: data.list_price,
        co2Emissions: data.co2_emissions, fuelType: data.fuel_type,
      });
      return car;
    });

    return { success: true, data: this.mapCarToResponse(result) };
  }

  // ===========================================================================
  // Company Car - Update
  // ===========================================================================

  async updateCompanyCar(
    context: TenantContext,
    id: string,
    data: UpdateCompanyCar
  ): Promise<ServiceResult<CompanyCarResponse>> {
    const existing = await this.repository.findCompanyCarById(context, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Company car not found", details: { id } },
      };
    }

    const dateAvailable = data.date_available || existing.dateAvailable.toISOString().split("T")[0]!;
    const dateReturned = data.date_returned !== undefined
      ? data.date_returned
      : (existing.dateReturned?.toISOString().split("T")[0] ?? null);

    if (dateReturned && new Date(dateReturned) < new Date(dateAvailable)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Date returned must be on or after date available",
          details: { date_available: dateAvailable, date_returned: dateReturned },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const car = await this.repository.updateCompanyCar(tx, context, id, data);
      if (car) {
        await this.emitEvent(tx, context, id, "company_car", "benefits.company_car.updated", {
          car: this.mapCarToResponse(car), changes: data,
        });
      }
      return car;
    });

    if (!result) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Company car not found after update", details: { id } },
      };
    }
    return { success: true, data: this.mapCarToResponse(result) };
  }

  // ===========================================================================
  // Company Car - Delete
  // ===========================================================================

  async deleteCompanyCar(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findCompanyCarById(context, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Company car not found", details: { id } },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteCompanyCar(tx, context, id);
      await this.emitEvent(tx, context, id, "company_car", "benefits.company_car.deleted", {
        carId: id, employeeId: existing.employeeId,
        registration: existing.registration, make: existing.make, model: existing.model,
      });
    });
    return { success: true };
  }

  // ===========================================================================
  // Company Car - BIK Calculation
  // ===========================================================================

  async calculateBik(
    context: TenantContext,
    carId: string,
    query: CompanyCarBikQuery = {}
  ): Promise<ServiceResult<CompanyCarBikResponse>> {
    const car = await this.repository.findCompanyCarById(context, carId);
    if (!car) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Company car not found", details: { id: carId } },
      };
    }

    const taxYear = query.tax_year || this.getCurrentTaxYear();
    const { start: taxYearStart, end: taxYearEnd } = this.parseTaxYear(taxYear);
    if (!taxYearStart || !taxYearEnd) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid tax year format. Expected YYYY/YY, e.g. 2025/26",
          details: { tax_year: query.tax_year },
        },
      };
    }

    const co2 = car.co2Emissions;
    const fuelType = car.fuelType as CarFuelType;
    const listPrice = parseFloat(car.listPrice);
    const privateFuel = car.privateFuelProvided;

    const appropriatePercentage = this.getAppropriatePercentage(co2, fuelType);
    const fullYearCarBik = Math.round((listPrice * appropriatePercentage / 100) * 100) / 100;
    const fullYearFuelBik = privateFuel
      ? Math.round((FUEL_BENEFIT_MULTIPLIER_2025_26 * appropriatePercentage / 100) * 100) / 100
      : null;
    const fullYearTotalBik = fullYearCarBik + (fullYearFuelBik ?? 0);

    const carAvailable = car.dateAvailable;
    const carReturned = car.dateReturned;
    const periodStart = carAvailable > taxYearStart ? carAvailable : taxYearStart;
    const periodEnd = carReturned && carReturned < taxYearEnd ? carReturned : taxYearEnd;

    let daysAvailable: number;
    if (periodStart > periodEnd) {
      daysAvailable = 0;
    } else {
      daysAvailable = this.daysBetween(periodStart, periodEnd) + 1;
    }
    const totalDaysInYear = this.daysBetween(taxYearStart, taxYearEnd) + 1;
    const proRataBik = totalDaysInYear > 0
      ? Math.round((fullYearTotalBik * daysAvailable / totalDaysInYear) * 100) / 100
      : 0;

    return {
      success: true,
      data: {
        car_id: car.id, tax_year: taxYear, list_price: listPrice,
        co2_emissions: co2, fuel_type: fuelType,
        appropriate_percentage: appropriatePercentage,
        car_bik_value: fullYearCarBik, fuel_bik_value: fullYearFuelBik,
        total_bik_value: fullYearTotalBik, days_available: daysAvailable,
        pro_rata_bik_value: proRataBik,
      },
    };
  }

  // ===========================================================================
  // Car Allowance - List
  // ===========================================================================

  async listCarAllowances(
    context: TenantContext,
    filters: CarAllowanceFilters = {},
    pagination: CompanyCarPaginationQuery = {}
  ): Promise<PaginatedServiceResult<CarAllowanceResponse>> {
    const result = await this.repository.findCarAllowances(context, filters, pagination);
    return {
      items: result.items.map(this.mapAllowanceToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Car Allowance - Get by ID
  // ===========================================================================

  async getCarAllowance(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<CarAllowanceResponse>> {
    const allowance = await this.repository.findCarAllowanceById(context, id);
    if (!allowance) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Car allowance not found", details: { id } },
      };
    }
    return { success: true, data: this.mapAllowanceToResponse(allowance) };
  }

  // ===========================================================================
  // Car Allowance - Create (with overlap validation)
  // ===========================================================================

  async createCarAllowance(
    context: TenantContext,
    data: CreateCarAllowance
  ): Promise<ServiceResult<CarAllowanceResponse>> {
    if (data.effective_to && new Date(data.effective_to) < new Date(data.effective_from)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Effective to date must be on or after effective from date",
          details: { effective_from: data.effective_from, effective_to: data.effective_to },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const overlaps = await this.repository.findOverlappingAllowances(
        tx, data.employee_id, data.effective_from, data.effective_to
      );
      if (overlaps.length > 0) {
        throw new EffectiveDateOverlapError(
          "Car allowance dates overlap with an existing allowance",
          {
            employee_id: data.employee_id,
            requested_from: data.effective_from,
            requested_to: data.effective_to,
            overlapping_ids: overlaps.map((o) => o.id),
          }
        );
      }

      const allowance = await this.repository.createCarAllowance(tx, context, data);
      await this.emitEvent(tx, context, allowance.id, "car_allowance", "benefits.car_allowance.created", {
        allowanceId: allowance.id, employeeId: data.employee_id,
        monthlyAmount: data.monthly_amount, effectiveFrom: data.effective_from, effectiveTo: data.effective_to,
      });
      return allowance;
    });

    return { success: true, data: this.mapAllowanceToResponse(result as CarAllowanceRow) };
  }

  // ===========================================================================
  // Car Allowance - Update (with overlap validation)
  // ===========================================================================

  async updateCarAllowance(
    context: TenantContext,
    id: string,
    data: UpdateCarAllowance
  ): Promise<ServiceResult<CarAllowanceResponse>> {
    const existing = await this.repository.findCarAllowanceById(context, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Car allowance not found", details: { id } },
      };
    }

    const effectiveFrom = data.effective_from || existing.effectiveFrom.toISOString().split("T")[0]!;
    const effectiveTo = data.effective_to !== undefined
      ? data.effective_to
      : (existing.effectiveTo?.toISOString().split("T")[0] ?? null);

    if (effectiveTo && new Date(effectiveTo) < new Date(effectiveFrom)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Effective to date must be on or after effective from date",
          details: { effective_from: effectiveFrom, effective_to: effectiveTo },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const overlaps = await this.repository.findOverlappingAllowances(
        tx, existing.employeeId, effectiveFrom, effectiveTo, id
      );
      if (overlaps.length > 0) {
        throw new EffectiveDateOverlapError(
          "Car allowance dates overlap with an existing allowance",
          {
            employee_id: existing.employeeId,
            requested_from: effectiveFrom,
            requested_to: effectiveTo,
            overlapping_ids: overlaps.map((o) => o.id),
          }
        );
      }

      const allowance = await this.repository.updateCarAllowance(tx, context, id, data);
      if (allowance) {
        await this.emitEvent(tx, context, id, "car_allowance", "benefits.car_allowance.updated", {
          allowance: this.mapAllowanceToResponse(allowance), changes: data,
        });
      }
      return allowance;
    });

    if (!result) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Car allowance not found after update", details: { id } },
      };
    }
    return { success: true, data: this.mapAllowanceToResponse(result as CarAllowanceRow) };
  }

  // ===========================================================================
  // Car Allowance - Delete
  // ===========================================================================

  async deleteCarAllowance(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.findCarAllowanceById(context, id);
    if (!existing) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "Car allowance not found", details: { id } },
      };
    }

    await this.db.withTransaction(context, async (tx) => {
      await this.repository.deleteCarAllowance(tx, context, id);
      await this.emitEvent(tx, context, id, "car_allowance", "benefits.car_allowance.deleted", {
        allowanceId: id, employeeId: existing.employeeId, monthlyAmount: parseFloat(existing.monthlyAmount),
      });
    });
    return { success: true };
  }

  // ===========================================================================
  // BIK Helpers
  // ===========================================================================

  private getAppropriatePercentage(co2: number, fuelType: CarFuelType): number {
    for (const band of BIK_BANDS_2025_26) {
      if (co2 <= band.maxCo2) {
        return band[fuelType];
      }
    }
    return 37;
  }

  private getCurrentTaxYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    if (month < 4 || (month === 4 && day < 6)) {
      const startYear = year - 1;
      const endYear = year % 100;
      return `${startYear}/${endYear.toString().padStart(2, "0")}`;
    }
    const endYear = (year + 1) % 100;
    return `${year}/${endYear.toString().padStart(2, "0")}`;
  }

  private parseTaxYear(taxYear: string): { start: Date | null; end: Date | null } {
    const match = taxYear.match(/^(\d{4})\/(\d{2})$/);
    if (!match) return { start: null, end: null };
    const startYear = parseInt(match[1]!, 10);
    const start = new Date(startYear, 3, 6);
    const end = new Date(startYear + 1, 3, 5);
    return { start, end };
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 86400000;
    const startMs = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endMs = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.floor((endMs - startMs) / msPerDay);
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private mapCarToResponse(row: CompanyCarRow): CompanyCarResponse {
    return {
      id: row.id, tenant_id: row.tenantId, employee_id: row.employeeId,
      employee_name: row.employeeName ?? null, registration: row.registration,
      make: row.make, model: row.model,
      list_price: parseFloat(row.listPrice), co2_emissions: row.co2Emissions,
      fuel_type: row.fuelType as CarFuelType,
      date_available: row.dateAvailable.toISOString().split("T")[0]!,
      date_returned: row.dateReturned?.toISOString().split("T")[0] ?? null,
      private_fuel_provided: row.privateFuelProvided,
      created_by: row.createdBy, updated_by: row.updatedBy,
      created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    };
  }

  private mapAllowanceToResponse(row: CarAllowanceRow): CarAllowanceResponse {
    return {
      id: row.id, tenant_id: row.tenantId, employee_id: row.employeeId,
      employee_name: row.employeeName ?? null,
      monthly_amount: parseFloat(row.monthlyAmount),
      effective_from: row.effectiveFrom.toISOString().split("T")[0]!,
      effective_to: row.effectiveTo?.toISOString().split("T")[0] ?? null,
      created_by: row.createdBy, updated_by: row.updatedBy,
      created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    };
  }
}

// =============================================================================
// Custom Errors
// =============================================================================

export class EffectiveDateOverlapError extends Error {
  public readonly code = "EFFECTIVE_DATE_OVERLAP";
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "EffectiveDateOverlapError";
    this.details = details;
  }
}
