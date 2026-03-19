/**
 * Total Reward Statement Module - Repository Layer
 *
 * Provides data access methods for total reward statements and the
 * underlying compensation, benefits, pension, and leave data needed
 * to generate them.
 *
 * All queries respect RLS through tenant context.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { TotalRewardStatementStatus } from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

export interface TotalRewardStatementRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  statementDate: Date;
  periodStart: Date;
  periodEnd: Date;
  baseSalary: string;
  bonusPay: string;
  overtimePay: string;
  pensionEmployer: string;
  pensionEmployee: string;
  benefitsEmployer: string;
  benefitsEmployee: string;
  holidayEntitlementValue: string;
  totalPackageValue: string;
  currency: string;
  breakdownDetail: Record<string, unknown>;
  status: TotalRewardStatementStatus;
  pdfDocumentId: string | null;
  generatedBy: string | null;
  publishedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  employeeName?: string;
  employeeNumber?: string;
}

export interface CompensationData extends Row {
  baseSalary: string;
  currency: string;
  payFrequency: string;
}

export interface PayrollSummaryData extends Row {
  totalBonusPay: string;
  totalOvertimePay: string;
  totalPensionEmployer: string;
  totalPensionEmployee: string;
}

export interface BenefitEnrollmentData extends Row {
  planName: string;
  planCategory: string;
  employerContribution: string;
  employeeContribution: string;
  totalContribution: string;
}

export interface PensionEnrolmentData extends Row {
  schemeName: string;
  employerContributionPct: string;
  employeeContributionPct: string;
}

export interface LeaveEntitlementData extends Row {
  entitled: number;
  leaveTypeName: string;
}

export interface EmployeeBasicData extends Row {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  hireDate: Date;
  status: string;
}

// =============================================================================
// Repository
// =============================================================================

export class TotalRewardRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Statement CRUD
  // ===========================================================================

  /**
   * Find an existing cached statement for the given employee and period
   */
  async findCachedStatement(
    context: TenantContext,
    employeeId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<TotalRewardStatementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<TotalRewardStatementRow[]>`
        SELECT
          trs.id, trs.tenant_id, trs.employee_id,
          trs.statement_date, trs.period_start, trs.period_end,
          trs.base_salary::text, trs.bonus_pay::text, trs.overtime_pay::text,
          trs.pension_employer::text, trs.pension_employee::text,
          trs.benefits_employer::text, trs.benefits_employee::text,
          trs.holiday_entitlement_value::text, trs.total_package_value::text,
          trs.currency, trs.breakdown_detail, trs.status,
          trs.pdf_document_id, trs.generated_by, trs.published_at,
          trs.notes, trs.created_at, trs.updated_at,
          app.get_employee_display_name(trs.employee_id) as employee_name,
          e.employee_number
        FROM app.total_reward_statements trs
        JOIN app.employees e ON trs.employee_id = e.id
        WHERE trs.employee_id = ${employeeId}::uuid
          AND trs.period_start = ${periodStart}::date
          AND trs.period_end = ${periodEnd}::date
        ORDER BY trs.created_at DESC
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find a statement by ID
   */
  async findStatementById(
    context: TenantContext,
    id: string
  ): Promise<TotalRewardStatementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<TotalRewardStatementRow[]>`
        SELECT
          trs.id, trs.tenant_id, trs.employee_id,
          trs.statement_date, trs.period_start, trs.period_end,
          trs.base_salary::text, trs.bonus_pay::text, trs.overtime_pay::text,
          trs.pension_employer::text, trs.pension_employee::text,
          trs.benefits_employer::text, trs.benefits_employee::text,
          trs.holiday_entitlement_value::text, trs.total_package_value::text,
          trs.currency, trs.breakdown_detail, trs.status,
          trs.pdf_document_id, trs.generated_by, trs.published_at,
          trs.notes, trs.created_at, trs.updated_at,
          app.get_employee_display_name(trs.employee_id) as employee_name,
          e.employee_number
        FROM app.total_reward_statements trs
        JOIN app.employees e ON trs.employee_id = e.id
        WHERE trs.id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create a new total reward statement within a transaction
   */
  async createStatement(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      employeeId: string;
      statementDate: string;
      periodStart: string;
      periodEnd: string;
      baseSalary: number;
      bonusPay: number;
      overtimePay: number;
      pensionEmployer: number;
      pensionEmployee: number;
      benefitsEmployer: number;
      benefitsEmployee: number;
      holidayEntitlementValue: number;
      totalPackageValue: number;
      currency: string;
      breakdownDetail: Record<string, unknown>;
      generatedBy: string | null;
    }
  ): Promise<TotalRewardStatementRow> {
    const id = crypto.randomUUID();
    const [row] = await tx<TotalRewardStatementRow[]>`
      INSERT INTO app.total_reward_statements (
        id, tenant_id, employee_id,
        statement_date, period_start, period_end,
        base_salary, bonus_pay, overtime_pay,
        pension_employer, pension_employee,
        benefits_employer, benefits_employee,
        holiday_entitlement_value, total_package_value,
        currency, breakdown_detail, status, generated_by
      ) VALUES (
        ${id}::uuid, ${context.tenantId}::uuid, ${data.employeeId}::uuid,
        ${data.statementDate}::date, ${data.periodStart}::date, ${data.periodEnd}::date,
        ${data.baseSalary}, ${data.bonusPay}, ${data.overtimePay},
        ${data.pensionEmployer}, ${data.pensionEmployee},
        ${data.benefitsEmployer}, ${data.benefitsEmployee},
        ${data.holidayEntitlementValue}, ${data.totalPackageValue},
        ${data.currency}, ${JSON.stringify(data.breakdownDetail)}::jsonb,
        'generated', ${data.generatedBy}
      )
      RETURNING
        id, tenant_id, employee_id,
        statement_date, period_start, period_end,
        base_salary::text, bonus_pay::text, overtime_pay::text,
        pension_employer::text, pension_employee::text,
        benefits_employer::text, benefits_employee::text,
        holiday_entitlement_value::text, total_package_value::text,
        currency, breakdown_detail, status,
        pdf_document_id, generated_by, published_at,
        notes, created_at, updated_at
    `;

    return row;
  }

  /**
   * Update statement status (e.g., to pdf_requested)
   */
  async updateStatementStatus(
    tx: TransactionSql,
    id: string,
    status: TotalRewardStatementStatus
  ): Promise<TotalRewardStatementRow | null> {
    const rows = await tx<TotalRewardStatementRow[]>`
      UPDATE app.total_reward_statements
      SET status = ${status}::app.total_reward_statement_status,
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        statement_date, period_start, period_end,
        base_salary::text, bonus_pay::text, overtime_pay::text,
        pension_employer::text, pension_employee::text,
        benefits_employer::text, benefits_employee::text,
        holiday_entitlement_value::text, total_package_value::text,
        currency, breakdown_detail, status,
        pdf_document_id, generated_by, published_at,
        notes, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Data Gathering Queries
  // ===========================================================================

  /**
   * Get basic employee data to verify the employee exists and is accessible
   */
  async getEmployeeBasicData(
    context: TenantContext,
    employeeId: string
  ): Promise<EmployeeBasicData | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeeBasicData[]>`
        SELECT e.id, e.employee_number,
               ep.first_name, ep.last_name,
               e.hire_date, e.status
        FROM app.employees e
        JOIN app.employee_personal_details ep
          ON e.id = ep.employee_id AND ep.effective_to IS NULL
        WHERE e.id = ${employeeId}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Get the current compensation record for the employee
   */
  async getCurrentCompensation(
    context: TenantContext,
    employeeId: string
  ): Promise<CompensationData | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<CompensationData[]>`
        SELECT
          base_salary::text,
          currency,
          pay_frequency
        FROM app.compensation_history
        WHERE employee_id = ${employeeId}::uuid
          AND effective_to IS NULL
        ORDER BY effective_from DESC
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Get payroll totals for bonus, overtime, pension within a date range.
   * Aggregates from payroll_lines for all paid payroll runs in the period.
   */
  async getPayrollSummary(
    context: TenantContext,
    employeeId: string,
    periodStart: string,
    periodEnd: string
  ): Promise<PayrollSummaryData> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PayrollSummaryData[]>`
        SELECT
          COALESCE(SUM(pl.bonus_pay), 0)::text as total_bonus_pay,
          COALESCE(SUM(pl.overtime_pay), 0)::text as total_overtime_pay,
          COALESCE(SUM(pl.pension_employer), 0)::text as total_pension_employer,
          COALESCE(SUM(pl.pension_employee), 0)::text as total_pension_employee
        FROM app.payroll_lines pl
        JOIN app.payroll_runs pr ON pl.payroll_run_id = pr.id
        WHERE pl.employee_id = ${employeeId}::uuid
          AND pr.status IN ('approved', 'submitted', 'paid')
          AND pr.pay_period_start >= ${periodStart}::date
          AND pr.pay_period_end <= ${periodEnd}::date
      `;
      return rows;
    });

    return result[0] || {
      totalBonusPay: "0",
      totalOvertimePay: "0",
      totalPensionEmployer: "0",
      totalPensionEmployee: "0",
    };
  }

  /**
   * Get active benefit enrollments for the employee, including plan costs
   */
  async getActiveBenefitEnrollments(
    context: TenantContext,
    employeeId: string,
    asOfDate: string
  ): Promise<BenefitEnrollmentData[]> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<BenefitEnrollmentData[]>`
        SELECT
          bp.name as plan_name,
          bp.category as plan_category,
          COALESCE(be.employer_contribution, 0)::text as employer_contribution,
          COALESCE(be.employee_contribution, 0)::text as employee_contribution,
          (COALESCE(be.employer_contribution, 0) + COALESCE(be.employee_contribution, 0))::text as total_contribution
        FROM app.benefit_enrollments be
        INNER JOIN app.benefit_plans bp ON be.plan_id = bp.id
        WHERE be.employee_id = ${employeeId}::uuid
          AND be.status = 'active'
          AND be.effective_from <= ${asOfDate}::date
          AND (be.effective_to IS NULL OR be.effective_to > ${asOfDate}::date)
        ORDER BY bp.category, bp.name
      `;
      return rows;
    });

    return result;
  }

  /**
   * Get the employee's pension enrolment details (scheme name, contribution rates)
   */
  async getPensionEnrolment(
    context: TenantContext,
    employeeId: string
  ): Promise<PensionEnrolmentData | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<PensionEnrolmentData[]>`
        SELECT
          ps.name as scheme_name,
          ps.employer_contribution_pct::text,
          ps.employee_contribution_pct::text
        FROM app.pension_enrolments pe
        JOIN app.pension_schemes ps ON pe.scheme_id = ps.id
        WHERE pe.employee_id = ${employeeId}::uuid
          AND pe.status IN ('enrolled', 're_enrolled')
        ORDER BY pe.enrolment_date DESC
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Get annual leave entitlement for the current year.
   * Returns the entitlement in days for the "Annual Leave" (or equivalent) leave type.
   */
  async getHolidayEntitlement(
    context: TenantContext,
    employeeId: string,
    year: number
  ): Promise<LeaveEntitlementData | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<LeaveEntitlementData[]>`
        SELECT
          lb.entitled,
          lt.name as leave_type_name
        FROM app.leave_balances lb
        JOIN app.leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = ${employeeId}::uuid
          AND lb.year = ${year}
          AND lt.is_paid = true
          AND lt.code IN ('annual', 'annual_leave', 'holiday', 'AL')
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }
}
