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
  RtiSubmissionType,
  RtiSubmissionStatus,
  LockPayrollPeriod,
  JournalEntriesQuery,
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

export interface PayScheduleRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  frequency: string;
  payDayOfWeek: number | null;
  payDayOfMonth: number | null;
  taxWeekStart: Date | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayAssignmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  payScheduleId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  // Joined fields
  scheduleName?: string;
  scheduleFrequency?: string;
}

export interface FpsEmployeeDataRow extends Row {
  payrollLineId: string;
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: string | null;
  hireDate: Date;
  niNumber: string | null;
  currentTaxCode: string | null;
  currentNiCategory: string | null;
  studentLoanPlan: string | null;
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
  snapshotTaxCode: string | null;
  snapshotNiCategory: string | null;
  paymentMethod: string;
}

export interface YtdTotalsRow extends Row {
  employeeId: string;
  taxablePayYtd: string;
  taxDeductedYtd: string;
  employeeNiYtd: string;
  employerNiYtd: string;
  studentLoanYtd: string;
}

export interface EpsRecoverableRow extends Row {
  smpRecovered: string;
  sppRecovered: string;
  sapRecovered: string;
  shppRecovered: string;
  spbpRecovered: string;
  nicCompensationOnSmp: string;
  nicCompensationOnSpp: string;
  nicCompensationOnSap: string;
  nicCompensationOnShpp: string;
  nicCompensationOnSpbp: string;
  cisDeductionsSuffered: string;
}

export interface RtiSubmissionRow extends Row {
  id: string;
  tenantId: string;
  payrollRunId: string;
  submissionType: string;
  status: string;
  taxYear: string;
  taxMonth: number | null;
  taxWeek: number | null;
  employerPayeRef: string | null;
  accountsOfficeRef: string | null;
  generatedAt: Date | null;
  submittedAt: Date | null;
  responseAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PeriodLockRow extends Row {
  id: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  lockedAt: Date;
  lockedBy: string;
  unlockReason: string | null;
  unlockedAt: Date | null;
  unlockedBy: string | null;
  createdAt: Date;
}

export interface JournalEntryRow extends Row {
  id: string;
  tenantId: string;
  payrollRunId: string;
  entryDate: Date;
  accountCode: string;
  description: string;
  debit: string;
  credit: string;
  costCentreId: string | null;
  createdAt: Date;
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

  // =========================================================================
  // Pay Schedules
  // =========================================================================

  async createPaySchedule(
    ctx: TenantContext,
    data: {
      name: string;
      frequency: string;
      payDayOfWeek?: number | null;
      payDayOfMonth?: number | null;
      taxWeekStart?: string | null;
      isDefault?: boolean;
    }
  ): Promise<PayScheduleRow> {
    const id = crypto.randomUUID();
    const [row] = await this.db.withTransaction(ctx, async (tx) => {
      // If setting as default, unset any existing default
      if (data.isDefault) {
        await tx`
          UPDATE app.pay_schedules
          SET is_default = false, updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid AND is_default = true
        `;
      }

      return tx<PayScheduleRow[]>`
        INSERT INTO app.pay_schedules (
          id, tenant_id, name, frequency,
          pay_day_of_week, pay_day_of_month, tax_week_start, is_default
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid, ${data.name},
          ${data.frequency}::app.pay_frequency,
          ${data.payDayOfWeek ?? null}, ${data.payDayOfMonth ?? null},
          ${data.taxWeekStart ?? null}::date, ${data.isDefault ?? false}
        )
        RETURNING *
      `;
    });
    return row as PayScheduleRow;
  }

  async getPaySchedules(ctx: TenantContext): Promise<PayScheduleRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<PayScheduleRow[]>`
        SELECT id, tenant_id, name, frequency,
               pay_day_of_week, pay_day_of_month, tax_week_start,
               is_default, created_at, updated_at
        FROM app.pay_schedules
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ORDER BY is_default DESC, name
      `;
      return rows;
    });
  }

  async getPayScheduleById(ctx: TenantContext, id: string): Promise<PayScheduleRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PayScheduleRow[]>`
        SELECT id, tenant_id, name, frequency,
               pay_day_of_week, pay_day_of_month, tax_week_start,
               is_default, created_at, updated_at
        FROM app.pay_schedules
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows.length > 0 ? (rows[0] as PayScheduleRow) : null;
  }

  async updatePaySchedule(
    ctx: TenantContext,
    id: string,
    data: Partial<{ name: string; payDayOfWeek: number | null; payDayOfMonth: number | null; taxWeekStart: string | null; isDefault: boolean }>
  ): Promise<PayScheduleRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      if (data.isDefault) {
        await tx`
          UPDATE app.pay_schedules
          SET is_default = false, updated_at = now()
          WHERE tenant_id = ${ctx.tenantId}::uuid AND is_default = true AND id != ${id}::uuid
        `;
      }

      const [row] = await tx<PayScheduleRow[]>`
        UPDATE app.pay_schedules SET
          name = COALESCE(${data.name ?? null}, name),
          pay_day_of_week = COALESCE(${data.payDayOfWeek ?? null}, pay_day_of_week),
          pay_day_of_month = COALESCE(${data.payDayOfMonth ?? null}, pay_day_of_month),
          tax_week_start = COALESCE(${data.taxWeekStart ?? null}::date, tax_week_start),
          is_default = COALESCE(${data.isDefault ?? null}, is_default),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
      return (row as PayScheduleRow) ?? null;
    });
  }

  // =========================================================================
  // Employee Pay Assignments
  // =========================================================================

  async assignEmployeeToSchedule(
    ctx: TenantContext,
    data: { employeeId: string; payScheduleId: string; effectiveFrom: string; effectiveTo?: string | null }
  ): Promise<PayAssignmentRow> {
    const id = crypto.randomUUID();
    const [row] = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PayAssignmentRow[]>`
        INSERT INTO app.employee_pay_assignments (
          id, tenant_id, employee_id, pay_schedule_id, effective_from, effective_to
        ) VALUES (
          ${id}::uuid, ${ctx.tenantId}::uuid,
          ${data.employeeId}::uuid, ${data.payScheduleId}::uuid,
          ${data.effectiveFrom}::date, ${data.effectiveTo ?? null}::date
        )
        RETURNING *
      `;
    });
    return row as PayAssignmentRow;
  }

  async getEmployeePayAssignments(ctx: TenantContext, employeeId: string): Promise<PayAssignmentRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<PayAssignmentRow[]>`
        SELECT epa.id, epa.tenant_id, epa.employee_id, epa.pay_schedule_id,
               epa.effective_from, epa.effective_to, epa.created_at,
               ps.name as schedule_name, ps.frequency as schedule_frequency
        FROM app.employee_pay_assignments epa
        JOIN app.pay_schedules ps ON ps.id = epa.pay_schedule_id
        WHERE epa.tenant_id = ${ctx.tenantId}::uuid
          AND epa.employee_id = ${employeeId}::uuid
        ORDER BY epa.effective_from DESC
      `;
      return rows;
    });
  }

  async getCurrentPayAssignment(ctx: TenantContext, employeeId: string): Promise<PayAssignmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<PayAssignmentRow[]>`
        SELECT epa.id, epa.tenant_id, epa.employee_id, epa.pay_schedule_id,
               epa.effective_from, epa.effective_to, epa.created_at,
               ps.name as schedule_name, ps.frequency as schedule_frequency
        FROM app.employee_pay_assignments epa
        JOIN app.pay_schedules ps ON ps.id = epa.pay_schedule_id
        WHERE epa.tenant_id = ${ctx.tenantId}::uuid
          AND epa.employee_id = ${employeeId}::uuid
          AND epa.effective_from <= CURRENT_DATE
          AND (epa.effective_to IS NULL OR epa.effective_to >= CURRENT_DATE)
        ORDER BY epa.effective_from DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as PayAssignmentRow) : null;
  }

  // ===========================================================================
  // FPS/EPS Data Gathering for RTI
  // ===========================================================================

  /**
   * Get detailed employee payroll data for FPS generation.
   * Joins payroll_lines with employee personal details and tax details
   * to produce a complete FPS record per employee.
   */
  async getFpsEmployeeData(
    ctx: TenantContext,
    runId: string,
    tx: TransactionSql
  ): Promise<FpsEmployeeDataRow[]> {
    const rows = await tx`
      SELECT
        pl.id AS payroll_line_id,
        pl.employee_id,
        e.employee_number,
        ep.first_name,
        ep.last_name,
        ep.date_of_birth,
        ep.gender,
        e.hire_date,
        etd.ni_number,
        etd.tax_code AS current_tax_code,
        etd.ni_category AS current_ni_category,
        etd.student_loan_plan,
        pl.basic_pay,
        pl.overtime_pay,
        pl.bonus_pay,
        pl.total_gross,
        pl.tax_deduction,
        pl.ni_employee,
        pl.ni_employer,
        pl.pension_employee,
        pl.pension_employer,
        pl.student_loan,
        pl.other_deductions,
        pl.total_deductions,
        pl.net_pay,
        pl.tax_code AS snapshot_tax_code,
        pl.ni_category AS snapshot_ni_category,
        pl.payment_method
      FROM payroll_lines pl
      JOIN employees e ON e.id = pl.employee_id
      LEFT JOIN LATERAL (
        SELECT first_name, last_name, date_of_birth, gender
        FROM employee_personal
        WHERE employee_id = e.id
          AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1
      ) ep ON true
      LEFT JOIN LATERAL (
        SELECT ni_number, tax_code, ni_category, student_loan_plan
        FROM employee_tax_details
        WHERE employee_id = e.id
          AND effective_from <= CURRENT_DATE
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY effective_from DESC
        LIMIT 1
      ) etd ON true
      WHERE pl.payroll_run_id = ${runId}::uuid
      ORDER BY ep.last_name, ep.first_name
    `;
    return rows as unknown as FpsEmployeeDataRow[];
  }

  /**
   * Get year-to-date totals for employees in a given tax year.
   * The UK tax year runs from 6 April to 5 April.
   */
  async getYtdTotals(
    ctx: TenantContext,
    employeeIds: string[],
    taxYearStart: string,
    currentRunId: string,
    tx: TransactionSql
  ): Promise<Map<string, YtdTotalsRow>> {
    if (employeeIds.length === 0) return new Map();

    const rows = await tx`
      SELECT
        pl.employee_id,
        COALESCE(SUM(pl.total_gross), 0) AS taxable_pay_ytd,
        COALESCE(SUM(pl.tax_deduction), 0) AS tax_deducted_ytd,
        COALESCE(SUM(pl.ni_employee), 0) AS employee_ni_ytd,
        COALESCE(SUM(pl.ni_employer), 0) AS employer_ni_ytd,
        COALESCE(SUM(pl.student_loan), 0) AS student_loan_ytd
      FROM payroll_lines pl
      JOIN payroll_runs pr ON pr.id = pl.payroll_run_id
      WHERE pl.employee_id = ANY(${employeeIds}::uuid[])
        AND pr.pay_period_start >= ${taxYearStart}::date
        AND pr.status IN ('review', 'approved', 'submitted', 'paid')
        AND pr.id != ${currentRunId}::uuid
      GROUP BY pl.employee_id
    `;

    const result = new Map<string, YtdTotalsRow>();
    for (const row of rows) {
      const r = row as unknown as YtdTotalsRow;
      result.set(r.employeeId, r);
    }
    return result;
  }

  /**
   * Get EPS recoverable statutory payments for a period.
   * Returns zero-filled defaults (actual statutory pay tracking
   * would come from absence module integration).
   */
  async getEpsRecoverableAmounts(
    ctx: TenantContext,
    _taxYearStart: string,
    _periodEnd: string,
    tx: TransactionSql
  ): Promise<EpsRecoverableRow> {
    // In a production system, these would be gathered from the
    // statutory pay modules (SSP, SMP, SPP, SAP, ShPP, SPBP).
    // For now, return zero-filled defaults as actual statutory
    // pay tracking is out of scope for this data preparation endpoint.
    const rows = await tx`
      SELECT
        COALESCE(0, 0) AS smp_recovered,
        COALESCE(0, 0) AS spp_recovered,
        COALESCE(0, 0) AS sap_recovered,
        COALESCE(0, 0) AS shpp_recovered,
        COALESCE(0, 0) AS spbp_recovered,
        COALESCE(0, 0) AS nic_compensation_on_smp,
        COALESCE(0, 0) AS nic_compensation_on_spp,
        COALESCE(0, 0) AS nic_compensation_on_sap,
        COALESCE(0, 0) AS nic_compensation_on_shpp,
        COALESCE(0, 0) AS nic_compensation_on_spbp,
        COALESCE(0, 0) AS cis_deductions_suffered
    `;
    return (rows[0] ?? {
      smpRecovered: "0.00",
      sppRecovered: "0.00",
      sapRecovered: "0.00",
      shppRecovered: "0.00",
      spbpRecovered: "0.00",
      nicCompensationOnSmp: "0.00",
      nicCompensationOnSpp: "0.00",
      nicCompensationOnSap: "0.00",
      nicCompensationOnShpp: "0.00",
      nicCompensationOnSpbp: "0.00",
      cisDeductionsSuffered: "0.00",
    }) as unknown as EpsRecoverableRow;
  }

  // ===========================================================================
  // RTI Submission Tracking
  // ===========================================================================

  async createRtiSubmission(
    ctx: TenantContext,
    data: {
      payrollRunId: string;
      submissionType: string;
      status: string;
      taxYear: string;
      taxMonth?: number | null;
      taxWeek?: number | null;
      employerPayeRef?: string | null;
      accountsOfficeRef?: string | null;
      submissionData: Record<string, unknown>;
      generatedBy?: string | null;
      submittedBy?: string | null;
      notes?: string | null;
      generatedAt?: Date | null;
      submittedAt?: Date | null;
    },
    tx: TransactionSql
  ): Promise<RtiSubmissionRow> {
    const [row] = await tx`
      INSERT INTO payroll_rti_submissions (
        tenant_id, payroll_run_id,
        submission_type, status,
        tax_year, tax_month, tax_week,
        employer_paye_ref, accounts_office_ref,
        submission_data,
        generated_by, submitted_by,
        notes,
        generated_at, submitted_at
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.payrollRunId}::uuid,
        ${data.submissionType}::app.rti_submission_type,
        ${data.status}::app.rti_submission_status,
        ${data.taxYear},
        ${data.taxMonth ?? null},
        ${data.taxWeek ?? null},
        ${data.employerPayeRef ?? null},
        ${data.accountsOfficeRef ?? null},
        ${JSON.stringify(data.submissionData)}::jsonb,
        ${data.generatedBy ?? null}::uuid,
        ${data.submittedBy ?? null}::uuid,
        ${data.notes ?? null},
        ${data.generatedAt ?? null}::timestamptz,
        ${data.submittedAt ?? null}::timestamptz
      )
      RETURNING
        id, tenant_id, payroll_run_id,
        submission_type, status,
        tax_year, tax_month, tax_week,
        employer_paye_ref, accounts_office_ref,
        generated_at, submitted_at, response_at,
        notes, created_at, updated_at
    `;
    return row as unknown as RtiSubmissionRow;
  }

  async findRtiSubmissionsByRunId(
    ctx: TenantContext,
    runId: string
  ): Promise<RtiSubmissionRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, payroll_run_id,
          submission_type, status,
          tax_year, tax_month, tax_week,
          employer_paye_ref, accounts_office_ref,
          generated_at, submitted_at, response_at,
          notes, created_at, updated_at
        FROM payroll_rti_submissions
        WHERE payroll_run_id = ${runId}::uuid
        ORDER BY created_at DESC
      `;
    });
    return rows as unknown as RtiSubmissionRow[];
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

  // ===========================================================================
  // Payroll Period Locks (enhanced for TODO-234)
  // ===========================================================================

  /** Column list for period lock queries (includes new status/schedule/finalized fields) */
  private static readonly PERIOD_LOCK_COLS = `
    id, tenant_id, pay_schedule_id, period_start, period_end,
    status, locked_at, locked_by, unlock_reason,
    unlocked_at, unlocked_by, finalized_at, finalized_by, created_at
  `;

  /**
   * Create a new period lock with status 'locked'.
   */
  async createPeriodLock(
    ctx: TenantContext,
    data: LockPayrollPeriod,
    tx: TransactionSql
  ): Promise<PeriodLockRow> {
    const payScheduleId = data.pay_schedule_id ?? null;
    const [row] = await tx`
      INSERT INTO payroll_period_locks (
        tenant_id,
        pay_schedule_id,
        period_start,
        period_end,
        status,
        locked_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${payScheduleId}::uuid,
        ${data.period_start}::date,
        ${data.period_end}::date,
        'locked'::app.payroll_period_lock_status,
        ${ctx.userId ?? null}::uuid
      )
      RETURNING ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
    `;
    return row as unknown as PeriodLockRow;
  }

  /**
   * Find a period lock by ID.
   */
  async findPeriodLockById(
    ctx: TenantContext,
    id: string
  ): Promise<PeriodLockRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
        FROM payroll_period_locks
        WHERE id = ${id}::uuid
      `;
    });

    if (rows.length === 0) return null;
    return rows[0] as unknown as PeriodLockRow;
  }

  /**
   * Find active (locked or finalized) period locks that overlap with the given date range.
   * Optionally scoped to a specific pay_schedule_id.
   */
  async findActiveLocksForPeriod(
    ctx: TenantContext,
    periodStart: string,
    periodEnd: string,
    payScheduleId?: string | null
  ): Promise<PeriodLockRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
        FROM payroll_period_locks
        WHERE status IN ('locked', 'finalized')
          AND daterange(period_start, period_end, '[]') &&
              daterange(${periodStart}::date, ${periodEnd}::date, '[]')
          ${
            payScheduleId !== undefined
              ? payScheduleId === null
                ? tx`AND pay_schedule_id IS NULL`
                : tx`AND (pay_schedule_id = ${payScheduleId}::uuid OR pay_schedule_id IS NULL)`
              : tx``
          }
        ORDER BY period_start ASC
      `;
    });

    return rows as unknown as PeriodLockRow[];
  }

  /**
   * Find locks covering a specific date for period lock guard checks.
   * Returns locks where the date falls within [period_start, period_end]
   * and the lock is active (locked or finalized).
   * Considers both schedule-specific locks and global locks (pay_schedule_id IS NULL).
   */
  async findLocksForDate(
    ctx: TenantContext,
    date: string,
    payScheduleId?: string | null
  ): Promise<PeriodLockRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
        FROM payroll_period_locks
        WHERE status IN ('locked', 'finalized')
          AND ${date}::date >= period_start
          AND ${date}::date <= period_end
          ${
            payScheduleId
              ? tx`AND (pay_schedule_id = ${payScheduleId}::uuid OR pay_schedule_id IS NULL)`
              : tx``
          }
        ORDER BY period_start ASC
      `;
    });

    return rows as unknown as PeriodLockRow[];
  }

  /**
   * List period locks with optional filters and cursor-based pagination.
   */
  async listPeriodLocks(
    ctx: TenantContext,
    filters: {
      periodStart?: string;
      periodEnd?: string;
      payScheduleId?: string;
      status?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    } = {}
  ): Promise<PaginatedResult<PeriodLockRow>> {
    const limit = Math.min(filters.limit ?? 20, 100);
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
        FROM payroll_period_locks
        WHERE 1=1
          ${filters.activeOnly ? tx`AND status IN ('locked', 'finalized')` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.payroll_period_lock_status` : tx``}
          ${filters.payScheduleId ? tx`AND pay_schedule_id = ${filters.payScheduleId}::uuid` : tx``}
          ${filters.periodStart ? tx`AND period_end >= ${filters.periodStart}::date` : tx``}
          ${filters.periodEnd ? tx`AND period_start <= ${filters.periodEnd}::date` : tx``}
          ${filters.cursor ? tx`AND id < ${filters.cursor}::uuid` : tx``}
        ORDER BY period_start DESC, id DESC
        LIMIT ${fetchLimit}
      `;
    });

    const typedRows = rows as unknown as PeriodLockRow[];
    const hasMore = typedRows.length > limit;
    const items = hasMore ? typedRows.slice(0, limit) : typedRows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Unlock a period lock by setting status to 'open', unlocked_at, unlocked_by,
   * and unlock_reason. Only works on 'locked' status (not finalized).
   */
  async unlockPeriodLock(
    ctx: TenantContext,
    id: string,
    unlockReason: string,
    tx: TransactionSql
  ): Promise<PeriodLockRow | null> {
    const [row] = await tx`
      UPDATE payroll_period_locks
      SET
        status = 'open'::app.payroll_period_lock_status,
        unlock_reason = ${unlockReason},
        unlocked_at = now(),
        unlocked_by = ${ctx.userId ?? null}::uuid
      WHERE id = ${id}::uuid
        AND status = 'locked'
      RETURNING ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
    `;

    if (!row) return null;
    return row as unknown as PeriodLockRow;
  }

  /**
   * Finalize a period lock (permanent, cannot be unlocked).
   * Only works on 'locked' status.
   */
  async finalizePeriodLock(
    ctx: TenantContext,
    id: string,
    tx: TransactionSql
  ): Promise<PeriodLockRow | null> {
    const [row] = await tx`
      UPDATE payroll_period_locks
      SET
        status = 'finalized'::app.payroll_period_lock_status,
        finalized_at = now(),
        finalized_by = ${ctx.userId ?? null}::uuid
      WHERE id = ${id}::uuid
        AND status = 'locked'
      RETURNING ${tx.unsafe(PayrollRepository.PERIOD_LOCK_COLS)}
    `;

    if (!row) return null;
    return row as unknown as PeriodLockRow;
  }

  // ===========================================================================
  // Journal Entries (TODO-233)
  // ===========================================================================

  /**
   * Insert multiple journal entry rows in a single batch.
   * Used by the service to generate all journal lines atomically
   * within the same transaction as the outbox event.
   */
  async insertJournalEntries(
    ctx: TenantContext,
    entries: Array<{
      payrollRunId: string;
      entryDate: string;
      accountCode: string;
      description: string;
      debit: string;
      credit: string;
      costCentreId: string | null;
    }>,
    tx: TransactionSql
  ): Promise<JournalEntryRow[]> {
    if (entries.length === 0) return [];

    const rows: JournalEntryRow[] = [];
    for (const entry of entries) {
      const [row] = await tx`
        INSERT INTO payroll_journal_entries (
          tenant_id, payroll_run_id, entry_date,
          account_code, description, debit, credit,
          cost_centre_id
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${entry.payrollRunId}::uuid,
          ${entry.entryDate}::date,
          ${entry.accountCode},
          ${entry.description},
          ${entry.debit}::numeric,
          ${entry.credit}::numeric,
          ${entry.costCentreId}::uuid
        )
        RETURNING
          id, tenant_id, payroll_run_id, entry_date,
          account_code, description, debit, credit,
          cost_centre_id, created_at
      `;
      rows.push(row as unknown as JournalEntryRow);
    }
    return rows;
  }

  /**
   * Check whether journal entries already exist for a given payroll run.
   * Used to enforce idempotency: journals can only be generated once per run.
   */
  async hasJournalEntriesForRun(
    ctx: TenantContext,
    payrollRunId: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM payroll_journal_entries
      WHERE payroll_run_id = ${payrollRunId}::uuid
      LIMIT 1
    `;
    return rows.length > 0;
  }

  /**
   * Get journal entries for a specific payroll run.
   */
  async findJournalEntriesByRunId(
    ctx: TenantContext,
    runId: string
  ): Promise<JournalEntryRow[]> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, payroll_run_id, entry_date,
          account_code, description, debit, credit,
          cost_centre_id, created_at
        FROM payroll_journal_entries
        WHERE payroll_run_id = ${runId}::uuid
        ORDER BY account_code, created_at
      `;
    });
    return rows as unknown as JournalEntryRow[];
  }

  /**
   * List journal entries with filters and cursor-based pagination.
   * Supports filtering by payroll_run_id, period (entry_date range),
   * account_code, and cost_centre_id.
   */
  async listJournalEntries(
    ctx: TenantContext,
    filters: JournalEntriesQuery
  ): Promise<PaginatedResult<JournalEntryRow>> {
    const limit = filters.limit ?? 50;
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          id, tenant_id, payroll_run_id, entry_date,
          account_code, description, debit, credit,
          cost_centre_id, created_at
        FROM payroll_journal_entries
        WHERE 1=1
          ${filters.payroll_run_id ? tx`AND payroll_run_id = ${filters.payroll_run_id}::uuid` : tx``}
          ${filters.period_start ? tx`AND entry_date >= ${filters.period_start}::date` : tx``}
          ${filters.period_end ? tx`AND entry_date <= ${filters.period_end}::date` : tx``}
          ${filters.account_code ? tx`AND account_code = ${filters.account_code}` : tx``}
          ${filters.cost_centre_id ? tx`AND cost_centre_id = ${filters.cost_centre_id}::uuid` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY entry_date DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const items = rows.slice(0, limit) as unknown as JournalEntryRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get debit/credit totals for journal entries matching the given filters.
   * Used to provide the summary in the list response.
   */
  async getJournalEntriesTotals(
    ctx: TenantContext,
    filters: JournalEntriesQuery
  ): Promise<{ totalDebits: string; totalCredits: string }> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT
          COALESCE(SUM(debit), 0) AS total_debits,
          COALESCE(SUM(credit), 0) AS total_credits
        FROM payroll_journal_entries
        WHERE 1=1
          ${filters.payroll_run_id ? tx`AND payroll_run_id = ${filters.payroll_run_id}::uuid` : tx``}
          ${filters.period_start ? tx`AND entry_date >= ${filters.period_start}::date` : tx``}
          ${filters.period_end ? tx`AND entry_date <= ${filters.period_end}::date` : tx``}
          ${filters.account_code ? tx`AND account_code = ${filters.account_code}` : tx``}
          ${filters.cost_centre_id ? tx`AND cost_centre_id = ${filters.cost_centre_id}::uuid` : tx``}
      `;
    });

    const row = rows[0] as { totalDebits: string; totalCredits: string };
    return {
      totalDebits: String(row.totalDebits),
      totalCredits: String(row.totalCredits),
    };
  }
}
