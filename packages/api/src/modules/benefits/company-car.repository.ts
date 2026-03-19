/**
 * Company Car & Car Allowance - Repository Layer
 *
 * Provides data access methods for company car tracking and car allowance management.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateCompanyCar,
  UpdateCompanyCar,
  CompanyCarFilters,
  CompanyCarPaginationQuery,
  CreateCarAllowance,
  UpdateCarAllowance,
  CarAllowanceFilters,
} from "./company-car.schemas";

// =============================================================================
// Types
// =============================================================================

export interface CompanyCarRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName?: string | null;
  registration: string;
  make: string;
  model: string;
  listPrice: string;
  co2Emissions: number;
  fuelType: string;
  dateAvailable: Date;
  dateReturned: Date | null;
  privateFuelProvided: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CarAllowanceRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName?: string | null;
  monthlyAmount: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Company Car Repository
// =============================================================================

export class CompanyCarRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Company Car - Read Operations
  // ===========================================================================

  async findCompanyCars(
    context: TenantContext,
    filters: CompanyCarFilters = {},
    pagination: CompanyCarPaginationQuery = {}
  ): Promise<PaginatedResult<CompanyCarRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CompanyCarRow[]>`
        SELECT
          cc.id, cc.tenant_id, cc.employee_id,
          app.get_employee_display_name(cc.employee_id) as employee_name,
          cc.registration, cc.make, cc.model,
          cc.list_price::text, cc.co2_emissions, cc.fuel_type,
          cc.date_available, cc.date_returned,
          cc.private_fuel_provided,
          cc.created_by, cc.updated_by,
          cc.created_at, cc.updated_at
        FROM app.company_cars cc
        WHERE 1=1
          ${filters.employee_id ? tx`AND cc.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.fuel_type ? tx`AND cc.fuel_type = ${filters.fuel_type}::app.car_fuel_type` : tx``}
          ${filters.active_only ? tx`AND cc.date_returned IS NULL` : tx``}
          ${cursor ? tx`AND cc.id > ${cursor}::uuid` : tx``}
        ORDER BY cc.created_at DESC, cc.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findCompanyCarById(
    context: TenantContext,
    id: string
  ): Promise<CompanyCarRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CompanyCarRow[]>`
        SELECT
          cc.id, cc.tenant_id, cc.employee_id,
          app.get_employee_display_name(cc.employee_id) as employee_name,
          cc.registration, cc.make, cc.model,
          cc.list_price::text, cc.co2_emissions, cc.fuel_type,
          cc.date_available, cc.date_returned,
          cc.private_fuel_provided,
          cc.created_by, cc.updated_by,
          cc.created_at, cc.updated_at
        FROM app.company_cars cc
        WHERE cc.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async findActiveCarsByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<CompanyCarRow[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CompanyCarRow[]>`
        SELECT
          cc.id, cc.tenant_id, cc.employee_id,
          app.get_employee_display_name(cc.employee_id) as employee_name,
          cc.registration, cc.make, cc.model,
          cc.list_price::text, cc.co2_emissions, cc.fuel_type,
          cc.date_available, cc.date_returned,
          cc.private_fuel_provided,
          cc.created_by, cc.updated_by,
          cc.created_at, cc.updated_at
        FROM app.company_cars cc
        WHERE cc.employee_id = ${employeeId}::uuid
          AND cc.date_returned IS NULL
        ORDER BY cc.date_available DESC
      `;
      return rows;
    });

    return result;
  }

  // ===========================================================================
  // Company Car - Write Operations
  // ===========================================================================

  async createCompanyCar(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateCompanyCar
  ): Promise<CompanyCarRow> {
    const rows = await tx<CompanyCarRow[]>`
      INSERT INTO app.company_cars (
        tenant_id, employee_id, registration, make, model,
        list_price, co2_emissions, fuel_type,
        date_available, date_returned, private_fuel_provided,
        created_by, updated_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.registration},
        ${data.make},
        ${data.model},
        ${data.list_price}::numeric,
        ${data.co2_emissions},
        ${data.fuel_type}::app.car_fuel_type,
        ${data.date_available}::date,
        ${data.date_returned || null}::date,
        ${data.private_fuel_provided ?? false},
        ${context.userId || null}::uuid,
        ${context.userId || null}::uuid
      )
      RETURNING
        id, tenant_id, employee_id,
        registration, make, model,
        list_price::text, co2_emissions, fuel_type,
        date_available, date_returned,
        private_fuel_provided,
        created_by, updated_by,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  async updateCompanyCar(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateCompanyCar
  ): Promise<CompanyCarRow | null> {
    const rows = await tx<CompanyCarRow[]>`
      UPDATE app.company_cars
      SET
        registration = COALESCE(${data.registration ?? null}, registration),
        make = COALESCE(${data.make ?? null}, make),
        model = COALESCE(${data.model ?? null}, model),
        list_price = COALESCE(${data.list_price ?? null}::numeric, list_price),
        co2_emissions = COALESCE(${data.co2_emissions ?? null}, co2_emissions),
        fuel_type = COALESCE(${data.fuel_type ?? null}::app.car_fuel_type, fuel_type),
        date_available = COALESCE(${data.date_available ?? null}::date, date_available),
        date_returned = ${data.date_returned !== undefined ? (data.date_returned || null) : null}::date,
        private_fuel_provided = COALESCE(${data.private_fuel_provided ?? null}, private_fuel_provided),
        updated_by = ${context.userId || null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        registration, make, model,
        list_price::text, co2_emissions, fuel_type,
        date_available, date_returned,
        private_fuel_provided,
        created_by, updated_by,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  async deleteCompanyCar(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.company_cars
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Car Allowance - Read Operations
  // ===========================================================================

  async findCarAllowances(
    context: TenantContext,
    filters: CarAllowanceFilters = {},
    pagination: CompanyCarPaginationQuery = {}
  ): Promise<PaginatedResult<CarAllowanceRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CarAllowanceRow[]>`
        SELECT
          ca.id, ca.tenant_id, ca.employee_id,
          app.get_employee_display_name(ca.employee_id) as employee_name,
          ca.monthly_amount::text,
          ca.effective_from, ca.effective_to,
          ca.created_by, ca.updated_by,
          ca.created_at, ca.updated_at
        FROM app.car_allowances ca
        WHERE 1=1
          ${filters.employee_id ? tx`AND ca.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.active_only ? tx`AND ca.effective_to IS NULL` : tx``}
          ${cursor ? tx`AND ca.id > ${cursor}::uuid` : tx``}
        ORDER BY ca.effective_from DESC, ca.id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findCarAllowanceById(
    context: TenantContext,
    id: string
  ): Promise<CarAllowanceRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CarAllowanceRow[]>`
        SELECT
          ca.id, ca.tenant_id, ca.employee_id,
          app.get_employee_display_name(ca.employee_id) as employee_name,
          ca.monthly_amount::text,
          ca.effective_from, ca.effective_to,
          ca.created_by, ca.updated_by,
          ca.created_at, ca.updated_at
        FROM app.car_allowances ca
        WHERE ca.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  async findOverlappingAllowances(
    tx: TransactionSql,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    excludeId?: string
  ): Promise<CarAllowanceRow[]> {
    const rows = await tx<CarAllowanceRow[]>`
      SELECT
        ca.id, ca.tenant_id, ca.employee_id,
        ca.monthly_amount::text,
        ca.effective_from, ca.effective_to,
        ca.created_by, ca.updated_by,
        ca.created_at, ca.updated_at
      FROM app.car_allowances ca
      WHERE ca.employee_id = ${employeeId}::uuid
        ${excludeId ? tx`AND ca.id != ${excludeId}::uuid` : tx``}
        AND daterange(ca.effective_from, ca.effective_to, '[]')
            && daterange(${effectiveFrom}::date, ${effectiveTo || null}::date, '[]')
    `;

    return rows;
  }

  // ===========================================================================
  // Car Allowance - Write Operations
  // ===========================================================================

  async createCarAllowance(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateCarAllowance
  ): Promise<CarAllowanceRow> {
    const rows = await tx<CarAllowanceRow[]>`
      INSERT INTO app.car_allowances (
        tenant_id, employee_id, monthly_amount,
        effective_from, effective_to,
        created_by, updated_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.monthly_amount}::numeric,
        ${data.effective_from}::date,
        ${data.effective_to || null}::date,
        ${context.userId || null}::uuid,
        ${context.userId || null}::uuid
      )
      RETURNING
        id, tenant_id, employee_id,
        monthly_amount::text,
        effective_from, effective_to,
        created_by, updated_by,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  async updateCarAllowance(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    data: UpdateCarAllowance
  ): Promise<CarAllowanceRow | null> {
    const rows = await tx<CarAllowanceRow[]>`
      UPDATE app.car_allowances
      SET
        monthly_amount = COALESCE(${data.monthly_amount ?? null}::numeric, monthly_amount),
        effective_from = COALESCE(${data.effective_from ?? null}::date, effective_from),
        effective_to = ${data.effective_to !== undefined ? (data.effective_to || null) : null}::date,
        updated_by = ${context.userId || null}::uuid,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        monthly_amount::text,
        effective_from, effective_to,
        created_by, updated_by,
        created_at, updated_at
    `;

    return rows[0] || null;
  }

  async deleteCarAllowance(
    tx: TransactionSql,
    _context: TenantContext,
    id: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.car_allowances
      WHERE id = ${id}::uuid
    `;

    return result.count > 0;
  }
}
