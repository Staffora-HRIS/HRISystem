/**
 * Salary Sacrifice Repository (Payroll Sub-Module)
 *
 * Re-exports the standalone salary-sacrifice module's repository and extends it
 * with payroll-specific methods (e.g. findActiveByEmployee for payroll calculation).
 *
 * The canonical CRUD implementation lives in modules/salary-sacrifice/repository.ts.
 * This file provides the payroll-integration surface so that the payroll service
 * can query active sacrifices during pay runs.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  SacrificeType,
  SacrificeFrequency,
  SacrificeStatus,
} from "./salary-sacrifice.schemas";

// Re-export standalone repository for direct CRUD access
export {
  SalarySacrificeRepository as SalarySacrificeBaseRepository,
  type SalarySacrificeRow as BaseSalarySacrificeRow,
  type EmployeeSalaryData,
  type PaginatedResult,
} from "../salary-sacrifice/repository";

// Import the base class so we can extend it
import { SalarySacrificeRepository as BaseRepository } from "../salary-sacrifice/repository";

// =============================================================================
// Types
// =============================================================================

export { type TenantContext };

/**
 * Row shape returned by findActiveByEmployee.
 * Mirrors the base SalarySacrificeRow but typed explicitly.
 */
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

// =============================================================================
// Extended Repository (Payroll-specific)
// =============================================================================

/**
 * Extends the base SalarySacrificeRepository with methods needed by the
 * payroll calculation engine.
 */
export class SalarySacrificeRepository extends BaseRepository {
  constructor(db: DatabaseClient) {
    super(db);
  }

  /**
   * Find all active salary sacrifices for an employee as of a given date.
   *
   * Used during payroll calculation to determine salary sacrifice deductions.
   * Returns sacrifices where:
   * - status = 'active'
   * - start_date <= asOfDate
   * - end_date IS NULL or end_date >= asOfDate
   *
   * @param ctx    Tenant context for RLS
   * @param employeeId  Employee UUID
   * @param asOfDate    Date string (YYYY-MM-DD) to check coverage against
   * @param tx          Transaction to run within (payroll calc is transactional)
   */
  async findActiveByEmployee(
    ctx: TenantContext,
    employeeId: string,
    asOfDate: string,
    tx: TransactionSql
  ): Promise<SalarySacrificeRow[]> {
    const rows = await tx`
      SELECT
        id, tenant_id, employee_id, sacrifice_type,
        amount::text AS amount, frequency, start_date, end_date,
        status, created_at, updated_at
      FROM salary_sacrifices
      WHERE employee_id = ${employeeId}::uuid
        AND status = 'active'::app.sacrifice_status
        AND start_date <= ${asOfDate}::date
        AND (end_date IS NULL OR end_date >= ${asOfDate}::date)
      ORDER BY created_at ASC
    `;
    return rows as unknown as SalarySacrificeRow[];
  }

  /**
   * Sum all active monthly sacrifice amounts for an employee as of a date.
   *
   * Annual sacrifices are normalised to monthly (amount / 12).
   * Useful for quick total-sacrifice lookups during payroll calculation
   * without loading each row individually.
   *
   * @param ctx    Tenant context for RLS
   * @param employeeId  Employee UUID
   * @param asOfDate    Date string (YYYY-MM-DD)
   * @param tx          Transaction
   */
  async sumActiveMonthlySacrifice(
    ctx: TenantContext,
    employeeId: string,
    asOfDate: string,
    tx: TransactionSql
  ): Promise<number> {
    const rows = await tx`
      SELECT COALESCE(SUM(
        CASE
          WHEN frequency = 'monthly' THEN amount
          WHEN frequency = 'annual'  THEN amount / 12
          ELSE 0
        END
      ), 0)::text AS total
      FROM salary_sacrifices
      WHERE employee_id = ${employeeId}::uuid
        AND status = 'active'::app.sacrifice_status
        AND start_date <= ${asOfDate}::date
        AND (end_date IS NULL OR end_date >= ${asOfDate}::date)
    `;

    const row = rows[0] as unknown as { total: string } | undefined;
    return parseFloat(row?.total ?? "0");
  }
}
