/**
 * Payroll Integration Module - Repository Layer
 *
 * Provides data access methods for payroll runs, payroll lines,
 * and employee tax details. All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePayrollRun,
  PayrollRunFilters,
  PayrollRunStatus,
  PayrollRunType,
  UpsertTaxDetails,
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

export interface PayrollRunRow extends Row {
  id: string;
  tenantId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  payDate: Date;
  status: PayrollRunStatus;
  runType: PayrollRunType;
  employeeCount: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  totalEmployerCosts: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  submittedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
}

export interface PayrollLineRow extends Row {
  id: string;
  tenantId: string;
  payrollRunId: string;
  employeeId: string;
  basicPay: string;
  overtimePay: string;
  bonusPay: string;
  totalGross: string;
  taxDeduction: string;
  niEmployee: string;
  niEmployer: string;
  pensionEmployee: string;
  pensionEmployer: string;
  studentLoan: string;
  otherDeductions: string;
  totalDeductions: string;
  netPay: string;
  taxCode: string | null;
  niCategory: string | null;
  paymentMethod: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  employeeName?: string;
  employeeNumber?: string;
}

export interface TaxDetailsRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  taxCode: string;
  niNumber: string | null;
  niCategory: string;
  studentLoanPlan: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActiveEmployeeRow extends Row {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  currentSalary: string | null;
  salaryCurrency: string | null;
}

// =============================================================================
// Repository
// =============================================================================

export class PayrollRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Payroll Runs - Create
  // ===========================================================================

  async createPayrollRun(
    ctx: TenantContext,
    data: CreatePayrollRun,
    tx: TransactionSql
  ): Promise<PayrollRunRow> {
    const [row] = await tx`
      INSERT INTO payroll_runs (
        tenant_id,
        pay_period_start,
        pay_period_end,
        pay_date,
        run_type,
        notes,
        status,
        created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.pay_period_start}::date,
        ${data.pay_period_end}::date,
        ${data.pay_date}::date,
        ${data.run_type ?? "monthly"}::app.payroll_run_type,
        ${data.notes ?? null},
        'draft'::app.payroll_run_status,
        ${ctx.userId ?? null}::uuid
      )
      RETURNING
        id, tenant_id, pay_period_start, pay_period_end, pay_date,
        status, run_type, employee_count,
        total_gross, total_deductions, total_net, total_employer_costs,
        approved_by, approved_at, submitted_at, notes,
        created_at, created_by, updated_at
    `;
    return row as unknown as PayrollRunRow;
  }

  // ===========================================================================
  // Payroll Runs - Read
  // ===========================================================================

  async findPayrollRunById(
    ctx: TenantContext,
    id: string
  ): Promise<PayrollRunRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, pay_period_start, pay_period_end, pay_date,
          status, run_type, employee_count,
          total_gross, total_deductions, total_net, total_employer_costs,
          approved_by, approved_at, submitted_at, notes,
          created_at, created_by, updated_at
        FROM payroll_runs
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PayrollRunRow;
  }

  async listPayrollRuns(
    ctx: TenantContext,
    filters: PayrollRunFilters = {}
  ): Promise<PaginatedResult<PayrollRunRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, pay_period_start, pay_period_end, pay_date,
          status, run_type, employee_count,
          total_gross, total_deductions, total_net, total_employer_costs,
          approved_by, approved_at, submitted_at, notes,
          created_at, created_by, updated_at
        FROM payroll_runs
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}::app.payroll_run_status` : tx``}
          ${filters.run_type ? tx`AND run_type = ${filters.run_type}::app.payroll_run_type` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as PayrollRunRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Check if a non-draft payroll run already exists for the same period and type
   */
  async hasExistingRunForPeriod(
    ctx: TenantContext,
    periodStart: string,
    periodEnd: string,
    runType: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM payroll_runs
      WHERE pay_period_start = ${periodStart}::date
        AND pay_period_end = ${periodEnd}::date
        AND run_type = ${runType}::app.payroll_run_type
        AND status != 'draft'::app.payroll_run_status
      LIMIT 1
    `;
    return rows.length > 0;
  }

  // ===========================================================================
  // Payroll Runs - Update
  // ===========================================================================

  async updatePayrollRunStatus(
    ctx: TenantContext,
    id: string,
    status: PayrollRunStatus,
    tx: TransactionSql,
    extra?: {
      approvedBy?: string;
      approvedAt?: Date;
      submittedAt?: Date;
      employeeCount?: number;
      totalGross?: string;
      totalDeductions?: string;
      totalNet?: string;
      totalEmployerCosts?: string;
    }
  ): Promise<PayrollRunRow | null> {
    const [row] = await tx`
      UPDATE payroll_runs
      SET
        status = ${status}::app.payroll_run_status,
        approved_by = COALESCE(${extra?.approvedBy ?? null}::uuid, approved_by),
        approved_at = COALESCE(${extra?.approvedAt ?? null}::timestamptz, approved_at),
        submitted_at = COALESCE(${extra?.submittedAt ?? null}::timestamptz, submitted_at),
        employee_count = COALESCE(${extra?.employeeCount ?? null}, employee_count),
        total_gross = COALESCE(${extra?.totalGross ?? null}::numeric, total_gross),
        total_deductions = COALESCE(${extra?.totalDeductions ?? null}::numeric, total_deductions),
        total_net = COALESCE(${extra?.totalNet ?? null}::numeric, total_net),
        total_employer_costs = COALESCE(${extra?.totalEmployerCosts ?? null}::numeric, total_employer_costs)
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, pay_period_start, pay_period_end, pay_date,
        status, run_type, employee_count,
        total_gross, total_deductions, total_net, total_employer_costs,
        approved_by, approved_at, submitted_at, notes,
        created_at, created_by, updated_at
    `;

    if (!row) return null;
    return row as unknown as PayrollRunRow;
  }

  // ===========================================================================
  // Payroll Lines
  // ===========================================================================

  async findPayrollLinesByRunId(
    ctx: TenantContext,
    runId: string
  ): Promise<PayrollLineRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          pl.id, pl.tenant_id, pl.payroll_run_id, pl.employee_id,
          pl.basic_pay, pl.overtime_pay, pl.bonus_pay, pl.total_gross,
          pl.tax_deduction, pl.ni_employee, pl.ni_employer,
          pl.pension_employee, pl.pension_employer,
          pl.student_loan, pl.other_deductions, pl.total_deductions,
          pl.net_pay, pl.tax_code, pl.ni_category, pl.payment_method,
          pl.created_at, pl.updated_at,
          e.first_name || ' ' || e.last_name AS employee_name,
          e.employee_number
        FROM payroll_lines pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.payroll_run_id = ${runId}::uuid
        ORDER BY e.last_name, e.first_name
      `;
    });

    return rows as unknown as PayrollLineRow[];
  }

  async findPayrollLineByRunAndEmployee(
    ctx: TenantContext,
    runId: string,
    employeeId: string
  ): Promise<PayrollLineRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          pl.id, pl.tenant_id, pl.payroll_run_id, pl.employee_id,
          pl.basic_pay, pl.overtime_pay, pl.bonus_pay, pl.total_gross,
          pl.tax_deduction, pl.ni_employee, pl.ni_employer,
          pl.pension_employee, pl.pension_employer,
          pl.student_loan, pl.other_deductions, pl.total_deductions,
          pl.net_pay, pl.tax_code, pl.ni_category, pl.payment_method,
          pl.created_at, pl.updated_at,
          e.first_name || ' ' || e.last_name AS employee_name,
          e.employee_number
        FROM payroll_lines pl
        JOIN employees e ON e.id = pl.employee_id
        WHERE pl.payroll_run_id = ${runId}::uuid
          AND pl.employee_id = ${employeeId}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PayrollLineRow;
  }

  /**
   * Delete all lines for a run (used before recalculation)
   */
  async deletePayrollLinesByRunId(
    runId: string,
    tx: TransactionSql
  ): Promise<void> {
    await tx`
      DELETE FROM payroll_lines
      WHERE payroll_run_id = ${runId}::uuid
    `;
  }

  /**
   * Insert a payroll line for an employee
   */
  async insertPayrollLine(
    ctx: TenantContext,
    line: {
      payrollRunId: string;
      employeeId: string;
      basicPay: string;
      overtimePay: string;
      bonusPay: string;
      totalGross: string;
      taxDeduction: string;
      niEmployee: string;
      niEmployer: string;
      pensionEmployee: string;
      pensionEmployer: string;
      studentLoan: string;
      otherDeductions: string;
      totalDeductions: string;
      netPay: string;
      taxCode: string | null;
      niCategory: string | null;
      paymentMethod: string;
    },
    tx: TransactionSql
  ): Promise<PayrollLineRow> {
    const [row] = await tx`
      INSERT INTO payroll_lines (
        tenant_id, payroll_run_id, employee_id,
        basic_pay, overtime_pay, bonus_pay, total_gross,
        tax_deduction, ni_employee, ni_employer,
        pension_employee, pension_employer,
        student_loan, other_deductions, total_deductions,
        net_pay, tax_code, ni_category, payment_method
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${line.payrollRunId}::uuid,
        ${line.employeeId}::uuid,
        ${line.basicPay}::numeric,
        ${line.overtimePay}::numeric,
        ${line.bonusPay}::numeric,
        ${line.totalGross}::numeric,
        ${line.taxDeduction}::numeric,
        ${line.niEmployee}::numeric,
        ${line.niEmployer}::numeric,
        ${line.pensionEmployee}::numeric,
        ${line.pensionEmployer}::numeric,
        ${line.studentLoan}::numeric,
        ${line.otherDeductions}::numeric,
        ${line.totalDeductions}::numeric,
        ${line.netPay}::numeric,
        ${line.taxCode},
        ${line.niCategory},
        ${line.paymentMethod}::app.payment_method
      )
      RETURNING
        id, tenant_id, payroll_run_id, employee_id,
        basic_pay, overtime_pay, bonus_pay, total_gross,
        tax_deduction, ni_employee, ni_employer,
        pension_employee, pension_employer,
        student_loan, other_deductions, total_deductions,
        net_pay, tax_code, ni_category, payment_method,
        created_at, updated_at
    `;
    return row as unknown as PayrollLineRow;
  }

  // ===========================================================================
  // Active Employees (for payroll calculation)
  // ===========================================================================

  /**
   * Get all active employees for the tenant at a given date, with compensation data
   */
  async getActiveEmployeesForPeriod(
    ctx: TenantContext,
    asOfDate: string,
    tx: TransactionSql
  ): Promise<ActiveEmployeeRow[]> {
    const rows = await tx`
      SELECT
        e.id,
        e.tenant_id,
        e.first_name,
        e.last_name,
        e.employee_number,
        ch.salary AS current_salary,
        ch.currency AS salary_currency
      FROM employees e
      LEFT JOIN LATERAL (
        SELECT salary, currency
        FROM compensation_history
        WHERE employee_id = e.id
          AND effective_from <= ${asOfDate}::date
          AND (effective_to IS NULL OR effective_to >= ${asOfDate}::date)
        ORDER BY effective_from DESC
        LIMIT 1
      ) ch ON true
      WHERE e.status = 'active'
      ORDER BY e.last_name, e.first_name
    `;
    return rows as unknown as ActiveEmployeeRow[];
  }

  // ===========================================================================
  // Overtime hours from timesheets
  // ===========================================================================

  /**
   * Get total overtime hours for employees in a date range from approved timesheets
   */
  async getOvertimeHoursForPeriod(
    ctx: TenantContext,
    periodStart: string,
    periodEnd: string,
    tx: TransactionSql
  ): Promise<Map<string, number>> {
    const rows = await tx`
      SELECT
        t.employee_id,
        COALESCE(SUM(t.total_overtime_hours), 0) AS total_overtime
      FROM timesheets t
      WHERE t.status = 'approved'
        AND t.period_start >= ${periodStart}::date
        AND t.period_end <= ${periodEnd}::date
      GROUP BY t.employee_id
    `;

    const result = new Map<string, number>();
    for (const row of rows) {
      const r = row as { employeeId: string; totalOvertime: string };
      result.set(r.employeeId, parseFloat(r.totalOvertime));
    }
    return result;
  }

  // ===========================================================================
  // Bonus payments for period
  // ===========================================================================

  /**
   * Get total bonus payments for employees in a date range
   */
  async getBonusPaymentsForPeriod(
    ctx: TenantContext,
    periodStart: string,
    periodEnd: string,
    tx: TransactionSql
  ): Promise<Map<string, number>> {
    const rows = await tx`
      SELECT
        employee_id,
        COALESCE(SUM(amount), 0) AS total_bonus
      FROM bonus_payments
      WHERE payment_date >= ${periodStart}::date
        AND payment_date <= ${periodEnd}::date
      GROUP BY employee_id
    `;

    const result = new Map<string, number>();
    for (const row of rows) {
      const r = row as { employeeId: string; totalBonus: string };
      result.set(r.employeeId, parseFloat(r.totalBonus));
    }
    return result;
  }

  // ===========================================================================
  // Employee Tax Details
  // ===========================================================================

  async findCurrentTaxDetails(
    ctx: TenantContext,
    employeeId: string
  ): Promise<TaxDetailsRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id,
          tax_code, ni_number, ni_category, student_loan_plan,
          effective_from, effective_to,
          created_at, updated_at
        FROM employee_tax_details
        WHERE employee_id = ${employeeId}::uuid
          AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as TaxDetailsRow;
  }

  async findTaxDetailsHistory(
    ctx: TenantContext,
    employeeId: string
  ): Promise<TaxDetailsRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, employee_id,
          tax_code, ni_number, ni_category, student_loan_plan,
          effective_from, effective_to,
          created_at, updated_at
        FROM employee_tax_details
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY effective_from DESC
      `;
    });

    return rows as unknown as TaxDetailsRow[];
  }

  async findTaxDetailsAsOfDate(
    ctx: TenantContext,
    employeeId: string,
    asOfDate: string,
    tx: TransactionSql
  ): Promise<TaxDetailsRow | null> {
    const rows = await tx`
      SELECT
        id, tenant_id, employee_id,
        tax_code, ni_number, ni_category, student_loan_plan,
        effective_from, effective_to,
        created_at, updated_at
      FROM employee_tax_details
      WHERE employee_id = ${employeeId}::uuid
        AND effective_from <= ${asOfDate}::date
        AND (effective_to IS NULL OR effective_to >= ${asOfDate}::date)
      ORDER BY effective_from DESC
      LIMIT 1
    `;

    if (rows.length === 0) return null;
    return rows[0] as unknown as TaxDetailsRow;
  }

  async createTaxDetails(
    ctx: TenantContext,
    employeeId: string,
    data: UpsertTaxDetails,
    tx: TransactionSql
  ): Promise<TaxDetailsRow> {
    const [row] = await tx`
      INSERT INTO employee_tax_details (
        tenant_id, employee_id,
        tax_code, ni_number, ni_category, student_loan_plan,
        effective_from, effective_to
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.tax_code},
        ${data.ni_number ?? null},
        ${data.ni_category ?? "A"},
        ${data.student_loan_plan ?? "none"}::app.student_loan_plan,
        ${data.effective_from}::date,
        ${data.effective_to ?? null}::date
      )
      RETURNING
        id, tenant_id, employee_id,
        tax_code, ni_number, ni_category, student_loan_plan,
        effective_from, effective_to,
        created_at, updated_at
    `;
    return row as unknown as TaxDetailsRow;
  }

  async hasOverlappingTaxDetails(
    ctx: TenantContext,
    employeeId: string,
    effectiveFrom: string,
    effectiveTo: string | null | undefined,
    tx: TransactionSql,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM employee_tax_details
      WHERE employee_id = ${employeeId}::uuid
        ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
        AND daterange(effective_from, effective_to, '[]') &&
            daterange(${effectiveFrom}::date, ${effectiveTo ?? null}::date, '[]')
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
