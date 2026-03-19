/**
 * Payslips Module - Repository Layer
 *
 * Data access for payslip templates and payslips.
 * All methods respect RLS through tenant context.
 *
 * Enhanced for TODO-128: Payslip generation from payroll runs,
 * YTD totals, deduction/addition detail, distribution tracking.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreatePayslipTemplate,
  UpdatePayslipTemplate,
  CreatePayslip,
  PayslipStatus,
  PayslipFilters,
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

export interface PayslipTemplateRow extends Row {
  id: string;
  tenantId: string;
  name: string;
  layoutConfig: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayslipRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  payrollRunId: string | null;
  payPeriodId: string | null;
  payPeriodStart: Date | null;
  payPeriodEnd: Date | null;
  employeeName: string | null;
  employeeNumber: string | null;
  grossPay: number;
  netPay: number;
  taxDeducted: number;
  niEmployee: number;
  niEmployer: number;
  pensionEmployee: number;
  pensionEmployer: number;
  studentLoan: number;
  deductions: unknown[];
  additions: unknown[];
  otherDeductions: unknown[];
  otherAdditions: unknown[];
  taxCode: string | null;
  niNumber: string | null;
  niCategory: string | null;
  paymentMethod: string | null;
  paymentDate: Date;
  status: PayslipStatus;
  ytdGrossPay: number;
  ytdTaxDeducted: number;
  ytdNiEmployee: number;
  ytdNiEmployer: number;
  ytdPensionEmployee: number;
  ytdPensionEmployer: number;
  ytdStudentLoan: number;
  ytdNetPay: number;
  generatedAt: Date | null;
  generatedBy: string | null;
  distributedAt: Date | null;
  distributedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollLineForPayslipRow extends Row {
  id: string;
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
  employeeName: string;
  employeeNumber: string;
  niNumber: string | null;
}

// Full payslip column list for SELECT statements
const PAYSLIP_COLS = `
  id, tenant_id, employee_id, payroll_run_id, pay_period_id,
  pay_period_start, pay_period_end,
  employee_name, employee_number,
  gross_pay, net_pay, tax_deducted,
  ni_employee, ni_employer,
  pension_employee, pension_employer,
  student_loan,
  deductions, additions,
  other_deductions, other_additions,
  tax_code, ni_number, ni_category,
  payment_method, payment_date, status,
  ytd_gross_pay, ytd_tax_deducted,
  ytd_ni_employee, ytd_ni_employer,
  ytd_pension_employee, ytd_pension_employer,
  ytd_student_loan, ytd_net_pay,
  generated_at, generated_by,
  distributed_at, distributed_by,
  created_at, updated_at
`;

// =============================================================================
// Repository
// =============================================================================

export class PayslipRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Payslip Templates
  // ===========================================================================

  async createTemplate(
    ctx: TenantContext,
    data: CreatePayslipTemplate,
    tx: TransactionSql
  ): Promise<PayslipTemplateRow> {
    const [row] = await tx`
      INSERT INTO payslip_templates (
        tenant_id, name, layout_config
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.name},
        ${JSON.stringify(data.layout_config ?? {})}::jsonb
      )
      RETURNING id, tenant_id, name, layout_config, created_at, updated_at
    `;
    return row as unknown as PayslipTemplateRow;
  }

  async findTemplateById(
    ctx: TenantContext,
    id: string
  ): Promise<PayslipTemplateRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT id, tenant_id, name, layout_config, created_at, updated_at
        FROM payslip_templates
        WHERE id = ${id}::uuid
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PayslipTemplateRow;
  }

  async findAllTemplates(
    ctx: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<PayslipTemplateRow>> {
    const limit = pagination.limit ?? 20;
    const fetchLimit = limit + 1;
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (pagination.cursor) {
        return await tx`
          SELECT id, tenant_id, name, layout_config, created_at, updated_at
          FROM payslip_templates
          WHERE created_at < ${new Date(pagination.cursor)}::timestamptz
          ORDER BY created_at DESC
          LIMIT ${fetchLimit}
        `;
      }
      return await tx`
        SELECT id, tenant_id, name, layout_config, created_at, updated_at
        FROM payslip_templates
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;
    });
    const items = rows.slice(0, limit) as unknown as PayslipTemplateRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;
    return { items, nextCursor, hasMore };
  }

  async updateTemplate(
    ctx: TenantContext,
    id: string,
    data: UpdatePayslipTemplate,
    tx: TransactionSql
  ): Promise<PayslipTemplateRow | null> {
    const [row] = await tx`
      UPDATE payslip_templates
      SET
        name = COALESCE(${data.name ?? null}, name),
        layout_config = CASE
          WHEN ${data.layout_config !== undefined} THEN ${JSON.stringify(data.layout_config ?? {})}::jsonb
          ELSE layout_config
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, name, layout_config, created_at, updated_at
    `;
    if (!row) return null;
    return row as unknown as PayslipTemplateRow;
  }

  async templateNameExists(
    ctx: TenantContext,
    name: string,
    excludeId?: string
  ): Promise<boolean> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      if (excludeId) {
        return await tx`
          SELECT 1 FROM payslip_templates
          WHERE name = ${name} AND id != ${excludeId}::uuid
          LIMIT 1
        `;
      }
      return await tx`
        SELECT 1 FROM payslip_templates WHERE name = ${name} LIMIT 1
      `;
    });
    return rows.length > 0;
  }

  // ===========================================================================
  // Payslips - Core CRUD
  // ===========================================================================

  async createPayslip(
    ctx: TenantContext,
    data: CreatePayslip,
    tx: TransactionSql
  ): Promise<PayslipRow> {
    const [row] = await tx`
      INSERT INTO payslips (
        tenant_id, employee_id, payroll_run_id, pay_period_id,
        pay_period_start, pay_period_end,
        gross_pay, net_pay, tax_deducted,
        ni_employee, ni_employer,
        pension_employee, pension_employer,
        student_loan,
        deductions, additions,
        other_deductions, other_additions,
        tax_code, ni_number, ni_category,
        payment_method, payment_date, status,
        generated_at, generated_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.payroll_run_id ?? null}::uuid,
        ${data.pay_period_id ?? null}::uuid,
        ${data.pay_period_start ?? null}::date,
        ${data.pay_period_end ?? null}::date,
        ${data.gross_pay},
        ${data.net_pay},
        ${data.tax_deducted},
        ${data.ni_employee},
        ${data.ni_employer},
        ${data.pension_employee ?? 0},
        ${data.pension_employer ?? 0},
        ${data.student_loan ?? 0},
        ${JSON.stringify(data.deductions ?? [])}::jsonb,
        ${JSON.stringify(data.additions ?? [])}::jsonb,
        ${JSON.stringify(data.other_deductions ?? [])}::jsonb,
        ${JSON.stringify(data.other_additions ?? [])}::jsonb,
        ${data.tax_code ?? null},
        ${data.ni_number ?? null},
        ${data.ni_category ?? null},
        ${data.payment_method ?? "bacs"}::app.payslip_payment_method,
        ${data.payment_date}::date,
        ${data.status ?? "draft"}::app.payslip_status,
        now(),
        ${ctx.userId ?? null}::uuid
      )
      RETURNING ${tx.unsafe(PAYSLIP_COLS)}
    `;
    return row as unknown as PayslipRow;
  }

  async findPayslipById(
    ctx: TenantContext,
    id: string
  ): Promise<PayslipRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PAYSLIP_COLS)}
        FROM payslips WHERE id = ${id}::uuid
      `;
    });
    if (rows.length === 0) return null;
    return rows[0] as unknown as PayslipRow;
  }

  async findPayslipsByEmployee(
    ctx: TenantContext,
    employeeId: string,
    filters: PayslipFilters = {}
  ): Promise<PaginatedResult<PayslipRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PAYSLIP_COLS)}
        FROM payslips
        WHERE employee_id = ${employeeId}::uuid
          ${filters.status ? tx`AND status = ${filters.status}::app.payslip_status` : tx``}
          ${filters.payroll_run_id ? tx`AND payroll_run_id = ${filters.payroll_run_id}::uuid` : tx``}
          ${filters.payment_date_from ? tx`AND payment_date >= ${filters.payment_date_from}::date` : tx``}
          ${filters.payment_date_to ? tx`AND payment_date <= ${filters.payment_date_to}::date` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });
    const items = rows.slice(0, limit) as unknown as PayslipRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;
    return { items, nextCursor, hasMore };
  }

  async findPayslipsForAdmin(
    ctx: TenantContext,
    filters: PayslipFilters = {}
  ): Promise<PaginatedResult<PayslipRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return await tx`
        SELECT ${tx.unsafe(PAYSLIP_COLS)}
        FROM payslips
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.payroll_run_id ? tx`AND payroll_run_id = ${filters.payroll_run_id}::uuid` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.payslip_status` : tx``}
          ${filters.payment_date_from ? tx`AND payment_date >= ${filters.payment_date_from}::date` : tx``}
          ${filters.payment_date_to ? tx`AND payment_date <= ${filters.payment_date_to}::date` : tx``}
          ${filters.pay_period_start ? tx`AND pay_period_start >= ${filters.pay_period_start}::date` : tx``}
          ${filters.pay_period_end ? tx`AND pay_period_end <= ${filters.pay_period_end}::date` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });
    const items = rows.slice(0, limit) as unknown as PayslipRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;
    return { items, nextCursor, hasMore };
  }

  async updatePayslipStatus(
    ctx: TenantContext,
    id: string,
    status: PayslipStatus,
    tx: TransactionSql
  ): Promise<PayslipRow | null> {
    const [row] = await tx`
      UPDATE payslips
      SET status = ${status}::app.payslip_status, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING ${tx.unsafe(PAYSLIP_COLS)}
    `;
    if (!row) return null;
    return row as unknown as PayslipRow;
  }

  async payslipExistsForPeriod(
    ctx: TenantContext,
    employeeId: string,
    payPeriodId: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM payslips
      WHERE employee_id = ${employeeId}::uuid AND pay_period_id = ${payPeriodId}::uuid
      LIMIT 1
    `;
    return rows.length > 0;
  }

  // ===========================================================================
  // Bulk Generation from Payroll Run
  // ===========================================================================

  async getPayrollRunForGeneration(
    ctx: TenantContext,
    payrollRunId: string,
    tx: TransactionSql
  ): Promise<{
    id: string;
    status: string;
    payPeriodStart: Date;
    payPeriodEnd: Date;
    payDate: Date;
  } | null> {
    const rows = await tx`
      SELECT id, status, pay_period_start, pay_period_end, pay_date
      FROM payroll_runs WHERE id = ${payrollRunId}::uuid
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as {
      id: string; status: string;
      payPeriodStart: Date; payPeriodEnd: Date; payDate: Date;
    };
  }

  async getPayrollLinesForPayslips(
    ctx: TenantContext,
    payrollRunId: string,
    tx: TransactionSql
  ): Promise<PayrollLineForPayslipRow[]> {
    const rows = await tx`
      SELECT
        pl.id,
        pl.employee_id,
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
        pl.tax_code,
        pl.ni_category,
        pl.payment_method,
        COALESCE(ep.first_name || ' ' || ep.last_name, 'Unknown') AS employee_name,
        COALESCE(e.employee_number, '') AS employee_number,
        td.ni_number
      FROM payroll_lines pl
      JOIN employees e ON e.id = pl.employee_id
      LEFT JOIN employee_personal ep
        ON ep.employee_id = pl.employee_id AND ep.effective_to IS NULL
      LEFT JOIN employee_tax_details td
        ON td.employee_id = pl.employee_id AND td.effective_to IS NULL
      WHERE pl.payroll_run_id = ${payrollRunId}::uuid
      ORDER BY ep.last_name ASC, ep.first_name ASC
    `;
    return rows as unknown as PayrollLineForPayslipRow[];
  }

  async payslipExistsForRun(
    ctx: TenantContext,
    payrollRunId: string,
    employeeId: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const rows = await tx`
      SELECT 1 FROM payslips
      WHERE payroll_run_id = ${payrollRunId}::uuid AND employee_id = ${employeeId}::uuid
      LIMIT 1
    `;
    return rows.length > 0;
  }

  async insertGeneratedPayslip(
    ctx: TenantContext,
    data: {
      employeeId: string;
      payrollRunId: string;
      payPeriodStart: string;
      payPeriodEnd: string;
      employeeName: string;
      employeeNumber: string;
      grossPay: number;
      netPay: number;
      taxDeducted: number;
      niEmployee: number;
      niEmployer: number;
      pensionEmployee: number;
      pensionEmployer: number;
      studentLoan: number;
      deductions: unknown[];
      additions: unknown[];
      taxCode: string | null;
      niNumber: string | null;
      niCategory: string | null;
      paymentMethod: string;
      paymentDate: string;
      ytdGrossPay: number;
      ytdTaxDeducted: number;
      ytdNiEmployee: number;
      ytdNiEmployer: number;
      ytdPensionEmployee: number;
      ytdPensionEmployer: number;
      ytdStudentLoan: number;
      ytdNetPay: number;
    },
    tx: TransactionSql
  ): Promise<PayslipRow> {
    const [row] = await tx`
      INSERT INTO payslips (
        tenant_id, employee_id, payroll_run_id,
        pay_period_start, pay_period_end,
        employee_name, employee_number,
        gross_pay, net_pay, tax_deducted,
        ni_employee, ni_employer,
        pension_employee, pension_employer,
        student_loan,
        deductions, additions,
        other_deductions, other_additions,
        tax_code, ni_number, ni_category,
        payment_method, payment_date, status,
        ytd_gross_pay, ytd_tax_deducted,
        ytd_ni_employee, ytd_ni_employer,
        ytd_pension_employee, ytd_pension_employer,
        ytd_student_loan, ytd_net_pay,
        generated_at, generated_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.payrollRunId}::uuid,
        ${data.payPeriodStart}::date,
        ${data.payPeriodEnd}::date,
        ${data.employeeName},
        ${data.employeeNumber},
        ${data.grossPay},
        ${data.netPay},
        ${data.taxDeducted},
        ${data.niEmployee},
        ${data.niEmployer},
        ${data.pensionEmployee},
        ${data.pensionEmployer},
        ${data.studentLoan},
        ${JSON.stringify(data.deductions)}::jsonb,
        ${JSON.stringify(data.additions)}::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        ${data.taxCode},
        ${data.niNumber},
        ${data.niCategory},
        ${data.paymentMethod}::app.payslip_payment_method,
        ${data.paymentDate}::date,
        'generated'::app.payslip_status,
        ${data.ytdGrossPay},
        ${data.ytdTaxDeducted},
        ${data.ytdNiEmployee},
        ${data.ytdNiEmployer},
        ${data.ytdPensionEmployee},
        ${data.ytdPensionEmployer},
        ${data.ytdStudentLoan},
        ${data.ytdNetPay},
        now(),
        ${ctx.userId ?? null}::uuid
      )
      RETURNING ${tx.unsafe(PAYSLIP_COLS)}
    `;
    return row as unknown as PayslipRow;
  }

  // ===========================================================================
  // YTD Calculation
  // ===========================================================================

  async getYtdTotals(
    ctx: TenantContext,
    employeeId: string,
    paymentDate: string,
    tx: TransactionSql
  ): Promise<{
    grossPay: number; taxDeducted: number;
    niEmployee: number; niEmployer: number;
    pensionEmployee: number; pensionEmployer: number;
    studentLoan: number; netPay: number;
  }> {
    const date = new Date(paymentDate);
    const year = date.getMonth() >= 3 && !(date.getMonth() === 3 && date.getDate() < 6)
      ? date.getFullYear()
      : date.getFullYear() - 1;
    const taxYearStart = `${year}-04-06`;
    const rows = await tx`
      SELECT
        COALESCE(SUM(gross_pay), 0)::numeric AS gross_pay,
        COALESCE(SUM(tax_deducted), 0)::numeric AS tax_deducted,
        COALESCE(SUM(ni_employee), 0)::numeric AS ni_employee,
        COALESCE(SUM(ni_employer), 0)::numeric AS ni_employer,
        COALESCE(SUM(pension_employee), 0)::numeric AS pension_employee,
        COALESCE(SUM(pension_employer), 0)::numeric AS pension_employer,
        COALESCE(SUM(student_loan), 0)::numeric AS student_loan,
        COALESCE(SUM(net_pay), 0)::numeric AS net_pay
      FROM payslips
      WHERE employee_id = ${employeeId}::uuid
        AND payment_date >= ${taxYearStart}::date
        AND payment_date < ${paymentDate}::date
    `;
    const r = rows[0] as unknown as Record<string, string>;
    return {
      grossPay: Number(r.grossPay || 0),
      taxDeducted: Number(r.taxDeducted || 0),
      niEmployee: Number(r.niEmployee || 0),
      niEmployer: Number(r.niEmployer || 0),
      pensionEmployee: Number(r.pensionEmployee || 0),
      pensionEmployer: Number(r.pensionEmployer || 0),
      studentLoan: Number(r.studentLoan || 0),
      netPay: Number(r.netPay || 0),
    };
  }

  // ===========================================================================
  // Distribution
  // ===========================================================================

  async distributePayslips(
    ctx: TenantContext,
    payslipIds: string[],
    tx: TransactionSql
  ): Promise<{ distributedCount: number; alreadyDistributed: number }> {
    const rows = await tx`
      UPDATE payslips
      SET status = 'distributed'::app.payslip_status,
          distributed_at = now(),
          distributed_by = ${ctx.userId ?? null}::uuid,
          updated_at = now()
      WHERE id = ANY(${payslipIds}::uuid[])
        AND status IN ('approved', 'issued')
      RETURNING id
    `;
    return {
      distributedCount: rows.length,
      alreadyDistributed: payslipIds.length - rows.length,
    };
  }

  async getDistributablePayslipIds(
    ctx: TenantContext,
    payrollRunId: string,
    tx: TransactionSql
  ): Promise<string[]> {
    const rows = await tx`
      SELECT id FROM payslips
      WHERE payroll_run_id = ${payrollRunId}::uuid AND status IN ('approved', 'issued')
      ORDER BY employee_name ASC
    `;
    return (rows as unknown as Array<{ id: string }>).map((r) => r.id);
  }

  async getDistributedPayslipRecipients(
    ctx: TenantContext,
    payslipIds: string[],
    tx: TransactionSql
  ): Promise<Array<{ payslipId: string; employeeId: string; employeeName: string }>> {
    const rows = await tx`
      SELECT p.id AS payslip_id, p.employee_id,
             COALESCE(p.employee_name, 'Employee') AS employee_name
      FROM payslips p WHERE p.id = ANY(${payslipIds}::uuid[])
    `;
    return rows as unknown as Array<{
      payslipId: string; employeeId: string; employeeName: string;
    }>;
  }

  // ===========================================================================
  // Portal: Employee's own payslips
  // ===========================================================================

  async findMyPayslips(
    ctx: TenantContext,
    filters: PayslipFilters = {}
  ): Promise<PaginatedResult<PayslipRow>> {
    const limit = filters.limit ?? 20;
    const fetchLimit = limit + 1;
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      const empRows = await tx`
        SELECT id FROM employees WHERE user_id = ${ctx.userId}::uuid LIMIT 1
      `;
      if (empRows.length === 0) return [];
      const employeeId = (empRows[0] as unknown as { id: string }).id;
      return await tx`
        SELECT ${tx.unsafe(PAYSLIP_COLS)}
        FROM payslips
        WHERE employee_id = ${employeeId}::uuid
          AND status IN ('issued', 'distributed')
          ${filters.payment_date_from ? tx`AND payment_date >= ${filters.payment_date_from}::date` : tx``}
          ${filters.payment_date_to ? tx`AND payment_date <= ${filters.payment_date_to}::date` : tx``}
          ${filters.cursor ? tx`AND created_at < ${new Date(filters.cursor)}::timestamptz` : tx``}
        ORDER BY payment_date DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });
    const items = rows.slice(0, limit) as unknown as PayslipRow[];
    const hasMore = rows.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1].createdAt.toISOString()
      : null;
    return { items, nextCursor, hasMore };
  }
}
