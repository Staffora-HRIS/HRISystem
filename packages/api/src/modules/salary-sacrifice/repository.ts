/**
 * Salary Sacrifice Module - Repository Layer
 *
 * Data access for salary sacrifice arrangements.
 * All methods respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  SacrificeType,
  SacrificeFrequency,
  SacrificeStatus,
  SalarySacrificeFilters,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface SalarySacrificeRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  sacrificeType: SacrificeType;
  amount: string;
  frequency: SacrificeFrequency;
  startDate: Date;
  endDate: Date | null;
  status: SacrificeStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Employee compensation data needed for NMW validation.
 * Loaded from the employees + compensation tables.
 */
export interface EmployeeSalaryData extends Row {
  id: string;
  tenantId: string;
  baseSalary: string | null;
  payFrequency: string | null;
  workingHoursPerWeek: string | null;
  dateOfBirth: Date | null;
}

// =============================================================================
// Repository
// =============================================================================

export class SalarySacrificeRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // CRUD Methods
  // ===========================================================================

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      sacrificeType: SacrificeType;
      amount: number;
      frequency: SacrificeFrequency;
      startDate: string;
      endDate: string | null | undefined;
    },
    tx: TransactionSql
  ): Promise<SalarySacrificeRow> {
    const [row] = await tx`
      INSERT INTO salary_sacrifices (
        tenant_id, employee_id, sacrifice_type,
        amount, frequency, start_date, end_date
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.sacrificeType}::app.sacrifice_type,
        ${data.amount},
        ${data.frequency}::app.sacrifice_frequency,
        ${data.startDate}::date,
        ${data.endDate ?? null}::date
      )
      RETURNING
        id, tenant_id, employee_id, sacrifice_type,
        amount::text AS amount, frequency, start_date, end_date,
        status, created_at, updated_at
    `;
    return row as unknown as SalarySacrificeRow;
  }

  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<SalarySacrificeRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, sacrifice_type,
          amount::text AS amount, frequency, start_date, end_date,
          status, created_at, updated_at
        FROM salary_sacrifices
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as SalarySacrificeRow;
  }

  async findAll(
    ctx: TenantContext,
    filters: SalarySacrificeFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<SalarySacrificeRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, sacrifice_type,
          amount::text AS amount, frequency, start_date, end_date,
          status, created_at, updated_at
        FROM salary_sacrifices
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.sacrifice_type ? tx`AND sacrifice_type = ${filters.sacrifice_type}::app.sacrifice_type` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.sacrifice_status` : tx``}
          ${pagination.cursor ? tx`AND created_at < ${new Date(pagination.cursor)}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as SalarySacrificeRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  async findByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<SalarySacrificeRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id, sacrifice_type,
          amount::text AS amount, frequency, start_date, end_date,
          status, created_at, updated_at
        FROM salary_sacrifices
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY created_at DESC
      `;
    });
    return rows as unknown as SalarySacrificeRow[];
  }

  async update(
    ctx: TenantContext,
    id: string,
    data: {
      sacrificeType?: SacrificeType;
      amount?: number;
      frequency?: SacrificeFrequency;
      startDate?: string;
      endDate?: string | null;
      status?: SacrificeStatus;
    },
    tx: TransactionSql
  ): Promise<SalarySacrificeRow | null> {
    const [row] = await tx`
      UPDATE salary_sacrifices
      SET
        sacrifice_type = COALESCE(${data.sacrificeType ?? null}::app.sacrifice_type, sacrifice_type),
        amount = COALESCE(${data.amount ?? null}, amount),
        frequency = COALESCE(${data.frequency ?? null}::app.sacrifice_frequency, frequency),
        start_date = COALESCE(${data.startDate ?? null}::date, start_date),
        end_date = CASE
          WHEN ${data.endDate !== undefined} THEN ${data.endDate ?? null}::date
          ELSE end_date
        END,
        status = COALESCE(${data.status ?? null}::app.sacrifice_status, status),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id, sacrifice_type,
        amount::text AS amount, frequency, start_date, end_date,
        status, created_at, updated_at
    `;

    if (!row) return null;
    return row as unknown as SalarySacrificeRow;
  }

  async delete(
    ctx: TenantContext,
    id: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const result = await tx`
      UPDATE salary_sacrifices
      SET status = 'ended'::app.sacrifice_status, updated_at = now()
      WHERE id = ${id}::uuid AND status != 'ended'
    `;
    return result.count > 0;
  }

  // ===========================================================================
  // NMW Validation Helpers
  // ===========================================================================

  /**
   * Get employee salary data for NMW validation.
   * Loads base salary, pay frequency, weekly hours, and date of birth.
   */
  async getEmployeeSalaryData(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EmployeeSalaryData | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          e.id,
          e.tenant_id,
          ec.base_salary::text AS base_salary,
          ec.pay_frequency,
          ec.working_hours_per_week::text AS working_hours_per_week,
          e.date_of_birth
        FROM employees e
        LEFT JOIN employee_compensation ec
          ON ec.employee_id = e.id
          AND ec.effective_from <= CURRENT_DATE
          AND (ec.effective_to IS NULL OR ec.effective_to > CURRENT_DATE)
        WHERE e.id = ${employeeId}::uuid
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as EmployeeSalaryData;
  }

  /**
   * Get total active monthly sacrifice amount for an employee.
   * Annual sacrifices are normalised to monthly (amount / 12).
   * Optionally exclude a specific sacrifice ID (for updates).
   */
  async getTotalActiveMonthlySacrifice(
    ctx: TenantContext,
    employeeId: string,
    excludeId?: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT COALESCE(SUM(
          CASE
            WHEN frequency = 'monthly' THEN amount
            WHEN frequency = 'annual' THEN amount / 12
            ELSE 0
          END
        ), 0)::text AS total
        FROM salary_sacrifices
        WHERE employee_id = ${employeeId}::uuid
          AND status = 'active'
          ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
      `;
    });

    const row = rows[0] as unknown as { total: string } | undefined;
    return parseFloat(row?.total ?? "0");
  }

  /**
   * Get the applicable NMW/NLW hourly rate for a given age and date.
   * Falls back to system-wide rates (tenant_id IS NULL) if no tenant rate exists.
   */
  async getApplicableNMWRate(
    ctx: TenantContext,
    age: number,
    asOfDate: string
  ): Promise<number | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT hourly_rate::text AS hourly_rate
        FROM nmw_rates
        WHERE age_from <= ${age}
          AND (age_to IS NULL OR age_to >= ${age})
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to > ${asOfDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;
    const row = rows[0] as unknown as { hourlyRate: string };
    return parseFloat(row.hourlyRate);
  }
}
