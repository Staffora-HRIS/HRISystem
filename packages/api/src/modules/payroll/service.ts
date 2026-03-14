/**
 * Payroll Integration Module - Service Layer
 *
 * Implements business logic for payroll runs, payroll calculation,
 * payroll export, and employee tax detail management.
 *
 * Key rules:
 * - Payroll runs follow a strict status lifecycle (draft -> calculating -> review -> approved -> submitted -> paid)
 * - Calculation gathers employees, time data, absence data, and computes gross/deductions/net
 * - Tax details are effective-dated with overlap prevention
 * - All writes emit domain events in the same transaction
 * - Export produces CSV or JSON for external payroll providers
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  PayrollRepository,
  PayrollRunRow,
  PayrollLineRow,
  TaxDetailsRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreatePayrollRun,
  PayrollRunFilters,
  PayrollRunResponse,
  PayrollRunDetailResponse,
  PayrollLineResponse,
  TaxDetailsResponse,
  UpsertTaxDetails,
  ExportFormat,
  PayrollRunStatus,
} from "./schemas";
import { PAYROLL_STATUS_TRANSITIONS } from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type PayrollEventType =
  | "payroll.run.created"
  | "payroll.run.calculated"
  | "payroll.run.approved"
  | "payroll.run.submitted"
  | "payroll.run.status_changed"
  | "payroll.run.exported"
  | "payroll.tax_details.updated";

// =============================================================================
// UK Tax/NI Calculation Helpers (simplified)
// =============================================================================

/**
 * Calculate monthly income tax based on tax code (simplified PAYE).
 * This is a simplified calculation for demonstration. A production
 * system would integrate with HMRC APIs or a full tax calculation engine.
 */
function calculateMonthlyIncomeTax(annualSalary: number, taxCode: string | null): number {
  if (!taxCode) return 0;

  // Parse personal allowance from tax code (e.g., 1257L -> 12570)
  const numericMatch = taxCode.match(/^([SK]?)(\d+)/);
  let personalAllowance = 12570; // default 2025/26
  if (numericMatch) {
    personalAllowance = parseInt(numericMatch[2], 10) * 10;
  }

  // Special codes
  if (taxCode === "BR") return (annualSalary * 0.20) / 12;
  if (taxCode === "D0") return (annualSalary * 0.40) / 12;
  if (taxCode === "D1") return (annualSalary * 0.45) / 12;
  if (taxCode === "NT") return 0;

  // K codes (negative personal allowance)
  const isKCode = taxCode.startsWith("K");
  const taxableIncome = isKCode
    ? annualSalary + personalAllowance
    : Math.max(0, annualSalary - personalAllowance);

  // 2025/26 UK tax bands
  let tax = 0;
  const bands = [
    { limit: 37700, rate: 0.20 },
    { limit: 125140, rate: 0.40 },
    { limit: Infinity, rate: 0.45 },
  ];

  let remaining = taxableIncome;
  for (const band of bands) {
    if (remaining <= 0) break;
    const taxableInBand = Math.min(remaining, band.limit);
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
  }

  return Math.round((tax / 12) * 100) / 100;
}

/**
 * Calculate monthly employee NI contributions (simplified).
 * Based on 2025/26 NI thresholds for category A.
 */
function calculateMonthlyEmployeeNI(annualSalary: number, _niCategory: string | null): number {
  const monthlySalary = annualSalary / 12;
  const monthlyPrimaryThreshold = 1048; // 2025/26 approx
  const monthlyUpperLimit = 4189; // 2025/26 approx

  if (monthlySalary <= monthlyPrimaryThreshold) return 0;

  let ni = 0;
  const band1 = Math.min(monthlySalary, monthlyUpperLimit) - monthlyPrimaryThreshold;
  ni += Math.max(0, band1) * 0.08; // 8% main rate

  if (monthlySalary > monthlyUpperLimit) {
    ni += (monthlySalary - monthlyUpperLimit) * 0.02; // 2% above UEL
  }

  return Math.round(ni * 100) / 100;
}

/**
 * Calculate monthly employer NI contributions (simplified).
 */
function calculateMonthlyEmployerNI(annualSalary: number): number {
  const monthlySalary = annualSalary / 12;
  const monthlySecondaryThreshold = 758; // 2025/26 approx

  if (monthlySalary <= monthlySecondaryThreshold) return 0;

  const ni = (monthlySalary - monthlySecondaryThreshold) * 0.138; // 13.8%
  return Math.round(ni * 100) / 100;
}

/**
 * Calculate monthly student loan repayment (simplified).
 */
function calculateMonthlyStudentLoan(annualSalary: number, plan: string): number {
  if (plan === "none") return 0;

  const thresholds: Record<string, { threshold: number; rate: number }> = {
    plan1: { threshold: 22015, rate: 0.09 },
    plan2: { threshold: 27295, rate: 0.09 },
    plan4: { threshold: 27660, rate: 0.09 },
    plan5: { threshold: 25000, rate: 0.09 },
    postgrad: { threshold: 21000, rate: 0.06 },
  };

  const config = thresholds[plan];
  if (!config) return 0;

  if (annualSalary <= config.threshold) return 0;

  const repayment = ((annualSalary - config.threshold) * config.rate) / 12;
  return Math.round(repayment * 100) / 100;
}

// =============================================================================
// Service
// =============================================================================

export class PayrollService {
  constructor(
    private repository: PayrollRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateType: string,
    aggregateId: string,
    eventType: PayrollEventType,
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
  // Mappers
  // ===========================================================================

  private mapRunToResponse(row: PayrollRunRow): PayrollRunResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      pay_period_start: row.payPeriodStart instanceof Date
        ? row.payPeriodStart.toISOString().split("T")[0]
        : String(row.payPeriodStart),
      pay_period_end: row.payPeriodEnd instanceof Date
        ? row.payPeriodEnd.toISOString().split("T")[0]
        : String(row.payPeriodEnd),
      pay_date: row.payDate instanceof Date
        ? row.payDate.toISOString().split("T")[0]
        : String(row.payDate),
      status: row.status,
      run_type: row.runType,
      employee_count: row.employeeCount,
      total_gross: String(row.totalGross),
      total_deductions: String(row.totalDeductions),
      total_net: String(row.totalNet),
      total_employer_costs: String(row.totalEmployerCosts),
      approved_by: row.approvedBy,
      approved_at: row.approvedAt
        ? row.approvedAt instanceof Date
          ? row.approvedAt.toISOString()
          : String(row.approvedAt)
        : null,
      submitted_at: row.submittedAt
        ? row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : String(row.submittedAt)
        : null,
      notes: row.notes,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private mapLineToResponse(row: PayrollLineRow): PayrollLineResponse {
    return {
      id: row.id,
      payroll_run_id: row.payrollRunId,
      employee_id: row.employeeId,
      employee_name: row.employeeName,
      employee_number: row.employeeNumber,
      basic_pay: String(row.basicPay),
      overtime_pay: String(row.overtimePay),
      bonus_pay: String(row.bonusPay),
      total_gross: String(row.totalGross),
      tax_deduction: String(row.taxDeduction),
      ni_employee: String(row.niEmployee),
      ni_employer: String(row.niEmployer),
      pension_employee: String(row.pensionEmployee),
      pension_employer: String(row.pensionEmployer),
      student_loan: String(row.studentLoan),
      other_deductions: String(row.otherDeductions),
      total_deductions: String(row.totalDeductions),
      net_pay: String(row.netPay),
      tax_code: row.taxCode,
      ni_category: row.niCategory,
      payment_method: row.paymentMethod as PayrollLineResponse["payment_method"],
    };
  }

  private mapTaxDetailsToResponse(row: TaxDetailsRow): TaxDetailsResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      tax_code: row.taxCode,
      ni_number: row.niNumber,
      ni_category: row.niCategory,
      student_loan_plan: row.studentLoanPlan as TaxDetailsResponse["student_loan_plan"],
      effective_from: row.effectiveFrom instanceof Date
        ? row.effectiveFrom.toISOString().split("T")[0]
        : String(row.effectiveFrom),
      effective_to: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo.toISOString().split("T")[0]
          : String(row.effectiveTo)
        : null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  // ===========================================================================
  // Status Transition Validation
  // ===========================================================================

  private canTransition(from: PayrollRunStatus, to: PayrollRunStatus): boolean {
    const allowed = PAYROLL_STATUS_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }

  // ===========================================================================
  // Payroll Runs
  // ===========================================================================

  /**
   * Create a new payroll run.
   *
   * Validates:
   * - pay_period_end >= pay_period_start
   * - pay_date >= pay_period_start
   * - No existing non-draft run for same period and type
   */
  async createPayrollRun(
    context: TenantContext,
    data: CreatePayrollRun,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayrollRunResponse>> {
    if (data.pay_period_end < data.pay_period_start) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "pay_period_end must be on or after pay_period_start",
          details: {
            pay_period_start: data.pay_period_start,
            pay_period_end: data.pay_period_end,
          },
        },
      };
    }

    if (data.pay_date < data.pay_period_start) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "pay_date must be on or after pay_period_start",
          details: {
            pay_date: data.pay_date,
            pay_period_start: data.pay_period_start,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const runType = data.run_type ?? "monthly";
      const exists = await this.repository.hasExistingRunForPeriod(
        context,
        data.pay_period_start,
        data.pay_period_end,
        runType,
        tx
      );

      if (exists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `A non-draft payroll run already exists for this period (${data.pay_period_start} to ${data.pay_period_end}) with type "${runType}"`,
            details: {
              pay_period_start: data.pay_period_start,
              pay_period_end: data.pay_period_end,
              run_type: runType,
            },
          },
        };
      }

      const row = await this.repository.createPayrollRun(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "payroll_run",
        row.id,
        "payroll.run.created",
        { run: this.mapRunToResponse(row) }
      );

      return {
        success: true,
        data: this.mapRunToResponse(row),
      };
    });
  }

  /**
   * Get a payroll run by ID.
   */
  async getPayrollRun(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayrollRunResponse>> {
    const row = await this.repository.findPayrollRunById(context, id);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${id} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapRunToResponse(row),
    };
  }

  /**
   * Get a payroll run with line details.
   */
  async getPayrollRunDetail(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<PayrollRunDetailResponse>> {
    const run = await this.repository.findPayrollRunById(context, id);
    if (!run) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${id} not found`,
        },
      };
    }

    const lines = await this.repository.findPayrollLinesByRunId(context, id);

    return {
      success: true,
      data: {
        ...this.mapRunToResponse(run),
        lines: lines.map((l) => this.mapLineToResponse(l)),
      },
    };
  }

  /**
   * List payroll runs with filters and pagination.
   */
  async listPayrollRuns(
    context: TenantContext,
    filters: PayrollRunFilters = {}
  ): Promise<PaginatedServiceResult<PayrollRunResponse>> {
    const result = await this.repository.listPayrollRuns(context, filters);
    return {
      items: result.items.map((row) => this.mapRunToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Calculate payroll for a run.
   *
   * This transitions the run from draft -> calculating -> review,
   * gathers all active employees, pulls their compensation, timesheet
   * overtime, bonuses, and tax details, then computes each line.
   *
   * Validates:
   * - Run exists
   * - Run is in "draft" status
   */
  async calculatePayroll(
    context: TenantContext,
    runId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayrollRunDetailResponse>> {
    const run = await this.repository.findPayrollRunById(context, runId);
    if (!run) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${runId} not found`,
        },
      };
    }

    if (!this.canTransition(run.status, "calculating")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot calculate payroll run in "${run.status}" status. Run must be in "draft" status.`,
          details: {
            currentStatus: run.status,
            allowedTransitions: PAYROLL_STATUS_TRANSITIONS[run.status],
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Transition to calculating
      await this.repository.updatePayrollRunStatus(
        context,
        runId,
        "calculating",
        tx
      );

      // Clear existing lines (for recalculation)
      await this.repository.deletePayrollLinesByRunId(runId, tx);

      // Get the pay period end date for "as of" lookups
      const periodEnd = run.payPeriodEnd instanceof Date
        ? run.payPeriodEnd.toISOString().split("T")[0]
        : String(run.payPeriodEnd);
      const periodStart = run.payPeriodStart instanceof Date
        ? run.payPeriodStart.toISOString().split("T")[0]
        : String(run.payPeriodStart);

      // Gather data
      const employees = await this.repository.getActiveEmployeesForPeriod(
        context,
        periodEnd,
        tx
      );
      const overtimeMap = await this.repository.getOvertimeHoursForPeriod(
        context,
        periodStart,
        periodEnd,
        tx
      );

      // Try to get bonuses (table may not exist in all environments)
      let bonusMap = new Map<string, number>();
      try {
        bonusMap = await this.repository.getBonusPaymentsForPeriod(
          context,
          periodStart,
          periodEnd,
          tx
        );
      } catch {
        // bonus_payments table may not exist yet — skip
      }

      // Calculate totals
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalEmployerCosts = 0;

      for (const emp of employees) {
        const annualSalary = parseFloat(emp.currentSalary || "0");
        const monthlyBasic = Math.round((annualSalary / 12) * 100) / 100;

        // Overtime: assume hourly rate = annual / (52 * 37.5) * 1.5
        const overtimeHours = overtimeMap.get(emp.id) || 0;
        const hourlyRate = annualSalary / (52 * 37.5);
        const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5 * 100) / 100;

        // Bonus
        const bonusPay = bonusMap.get(emp.id) || 0;

        // Gross
        const gross = Math.round((monthlyBasic + overtimePay + bonusPay) * 100) / 100;

        // Tax details
        const taxDetails = await this.repository.findTaxDetailsAsOfDate(
          context,
          emp.id,
          periodEnd,
          tx
        );

        const taxCode = taxDetails?.taxCode ?? null;
        const niCategory = taxDetails?.niCategory ?? "A";
        const studentLoanPlan = taxDetails?.studentLoanPlan ?? "none";

        // Calculate deductions
        const taxDeduction = calculateMonthlyIncomeTax(annualSalary + (overtimePay + bonusPay) * 12, taxCode);
        const niEmployee = calculateMonthlyEmployeeNI(annualSalary + (overtimePay + bonusPay) * 12, niCategory);
        const niEmployer = calculateMonthlyEmployerNI(annualSalary + (overtimePay + bonusPay) * 12);
        const studentLoan = calculateMonthlyStudentLoan(annualSalary + (overtimePay + bonusPay) * 12, studentLoanPlan);

        // Pension (simplified: 5% employee, 3% employer as auto-enrolment minimum)
        const pensionEmployee = Math.round(gross * 0.05 * 100) / 100;
        const pensionEmployer = Math.round(gross * 0.03 * 100) / 100;

        const deductions = Math.round((taxDeduction + niEmployee + pensionEmployee + studentLoan) * 100) / 100;
        const netPay = Math.round((gross - deductions) * 100) / 100;
        const employerCosts = Math.round((niEmployer + pensionEmployer) * 100) / 100;

        await this.repository.insertPayrollLine(
          context,
          {
            payrollRunId: runId,
            employeeId: emp.id,
            basicPay: monthlyBasic.toFixed(2),
            overtimePay: overtimePay.toFixed(2),
            bonusPay: bonusPay.toFixed(2),
            totalGross: gross.toFixed(2),
            taxDeduction: taxDeduction.toFixed(2),
            niEmployee: niEmployee.toFixed(2),
            niEmployer: niEmployer.toFixed(2),
            pensionEmployee: pensionEmployee.toFixed(2),
            pensionEmployer: pensionEmployer.toFixed(2),
            studentLoan: studentLoan.toFixed(2),
            otherDeductions: "0.00",
            totalDeductions: deductions.toFixed(2),
            netPay: netPay.toFixed(2),
            taxCode,
            niCategory,
            paymentMethod: "bacs",
          },
          tx
        );

        totalGross += gross;
        totalDeductions += deductions;
        totalNet += netPay;
        totalEmployerCosts += employerCosts;
      }

      // Transition to review with totals
      const updatedRun = await this.repository.updatePayrollRunStatus(
        context,
        runId,
        "review",
        tx,
        {
          employeeCount: employees.length,
          totalGross: totalGross.toFixed(2),
          totalDeductions: totalDeductions.toFixed(2),
          totalNet: totalNet.toFixed(2),
          totalEmployerCosts: totalEmployerCosts.toFixed(2),
        }
      );

      if (!updatedRun) {
        return {
          success: false,
          error: {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to update payroll run after calculation",
          },
        };
      }

      // Get lines for response
      const lines = await this.repository.findPayrollLinesByRunId(context, runId);

      await this.emitEvent(
        tx,
        context,
        "payroll_run",
        runId,
        "payroll.run.calculated",
        {
          run: this.mapRunToResponse(updatedRun),
          employeeCount: employees.length,
          totalGross: totalGross.toFixed(2),
          totalNet: totalNet.toFixed(2),
        }
      );

      return {
        success: true,
        data: {
          ...this.mapRunToResponse(updatedRun),
          lines: lines.map((l) => this.mapLineToResponse(l)),
        },
      };
    });
  }

  /**
   * Approve a payroll run.
   *
   * Validates:
   * - Run exists
   * - Run is in "review" status
   */
  async approvePayrollRun(
    context: TenantContext,
    runId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PayrollRunResponse>> {
    const run = await this.repository.findPayrollRunById(context, runId);
    if (!run) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${runId} not found`,
        },
      };
    }

    if (!this.canTransition(run.status, "approved")) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot approve payroll run in "${run.status}" status. Run must be in "review" status.`,
          details: {
            currentStatus: run.status,
            allowedTransitions: PAYROLL_STATUS_TRANSITIONS[run.status],
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const updatedRun = await this.repository.updatePayrollRunStatus(
        context,
        runId,
        "approved",
        tx,
        {
          approvedBy: context.userId,
          approvedAt: new Date(),
        }
      );

      if (!updatedRun) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Payroll run ${runId} not found`,
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "payroll_run",
        runId,
        "payroll.run.approved",
        {
          run: this.mapRunToResponse(updatedRun),
          approvedBy: context.userId,
        }
      );

      return {
        success: true,
        data: this.mapRunToResponse(updatedRun),
      };
    });
  }

  /**
   * Export payroll data as CSV or JSON.
   *
   * Validates:
   * - Run exists
   * - Run has been calculated (has lines)
   */
  async exportPayrollData(
    context: TenantContext,
    runId: string,
    format: ExportFormat
  ): Promise<ServiceResult<{ content: string; contentType: string; filename: string }>> {
    const run = await this.repository.findPayrollRunById(context, runId);
    if (!run) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${runId} not found`,
        },
      };
    }

    const lines = await this.repository.findPayrollLinesByRunId(context, runId);
    if (lines.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Payroll run has no calculated lines. Run calculation first.",
        },
      };
    }

    const periodStart = run.payPeriodStart instanceof Date
      ? run.payPeriodStart.toISOString().split("T")[0]
      : String(run.payPeriodStart);
    const periodEnd = run.payPeriodEnd instanceof Date
      ? run.payPeriodEnd.toISOString().split("T")[0]
      : String(run.payPeriodEnd);

    if (format === "json") {
      const exportData = {
        payroll_run: this.mapRunToResponse(run),
        lines: lines.map((l) => this.mapLineToResponse(l)),
        exported_at: new Date().toISOString(),
      };

      // Emit export event (fire-and-forget, no need for transaction)
      try {
        await this.db.withTransaction(context, async (tx) => {
          await this.emitEvent(tx, context, "payroll_run", runId, "payroll.run.exported", {
            format: "json",
            lineCount: lines.length,
          });
        });
      } catch {
        // Non-critical: export event emission failure should not block export
      }

      return {
        success: true,
        data: {
          content: JSON.stringify(exportData, null, 2),
          contentType: "application/json",
          filename: `payroll-${periodStart}-${periodEnd}.json`,
        },
      };
    }

    // CSV export
    const csvHeaders = [
      "Employee Number",
      "Employee Name",
      "Basic Pay",
      "Overtime Pay",
      "Bonus Pay",
      "Total Gross",
      "Tax Deduction",
      "Employee NI",
      "Employee Pension",
      "Student Loan",
      "Other Deductions",
      "Total Deductions",
      "Net Pay",
      "Employer NI",
      "Employer Pension",
      "Tax Code",
      "NI Category",
      "Payment Method",
    ].join(",");

    const csvRows = lines.map((l) => {
      return [
        this.escapeCsv(l.employeeNumber || ""),
        this.escapeCsv(l.employeeName || ""),
        l.basicPay,
        l.overtimePay,
        l.bonusPay,
        l.totalGross,
        l.taxDeduction,
        l.niEmployee,
        l.pensionEmployee,
        l.studentLoan,
        l.otherDeductions,
        l.totalDeductions,
        l.netPay,
        l.niEmployer,
        l.pensionEmployer,
        this.escapeCsv(l.taxCode || ""),
        this.escapeCsv(l.niCategory || ""),
        this.escapeCsv(l.paymentMethod),
      ].join(",");
    });

    const csvContent = [csvHeaders, ...csvRows].join("\n");

    try {
      await this.db.withTransaction(context, async (tx) => {
        await this.emitEvent(tx, context, "payroll_run", runId, "payroll.run.exported", {
          format: "csv",
          lineCount: lines.length,
        });
      });
    } catch {
      // Non-critical
    }

    return {
      success: true,
      data: {
        content: csvContent,
        contentType: "text/csv",
        filename: `payroll-${periodStart}-${periodEnd}.csv`,
      },
    };
  }

  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // ===========================================================================
  // Employee Tax Details
  // ===========================================================================

  /**
   * Update (create) employee tax details.
   *
   * Validates:
   * - effective_to >= effective_from (if provided)
   * - No overlapping tax detail records for this employee
   */
  async updateTaxDetails(
    context: TenantContext,
    employeeId: string,
    data: UpsertTaxDetails,
    _idempotencyKey?: string
  ): Promise<ServiceResult<TaxDetailsResponse>> {
    if (data.effective_to && data.effective_to < data.effective_from) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "effective_to must be on or after effective_from",
          details: {
            effective_from: data.effective_from,
            effective_to: data.effective_to,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const hasOverlap = await this.repository.hasOverlappingTaxDetails(
        context,
        employeeId,
        data.effective_from,
        data.effective_to,
        tx
      );

      if (hasOverlap) {
        return {
          success: false,
          error: {
            code: "EFFECTIVE_DATE_OVERLAP" as const,
            message: "Employee already has tax details that overlap with the given date range",
            details: {
              employee_id: employeeId,
              effective_from: data.effective_from,
              effective_to: data.effective_to,
            },
          },
        };
      }

      const row = await this.repository.createTaxDetails(
        context,
        employeeId,
        data,
        tx
      );

      await this.emitEvent(
        tx,
        context,
        "employee_tax_details",
        row.id,
        "payroll.tax_details.updated",
        {
          taxDetails: this.mapTaxDetailsToResponse(row),
          employeeId,
        }
      );

      return {
        success: true,
        data: this.mapTaxDetailsToResponse(row),
      };
    });
  }

  /**
   * Get current tax details for an employee.
   */
  async getTaxDetails(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<{ current: TaxDetailsResponse | null; history: TaxDetailsResponse[] }>> {
    const current = await this.repository.findCurrentTaxDetails(context, employeeId);
    const history = await this.repository.findTaxDetailsHistory(context, employeeId);

    return {
      success: true,
      data: {
        current: current ? this.mapTaxDetailsToResponse(current) : null,
        history: history.map((r) => this.mapTaxDetailsToResponse(r)),
      },
    };
  }

  /**
   * Get payslip data for an employee from a specific run.
   */
  async getPayslipData(
    context: TenantContext,
    employeeId: string,
    runId: string
  ): Promise<ServiceResult<{ run: PayrollRunResponse; line: PayrollLineResponse }>> {
    const run = await this.repository.findPayrollRunById(context, runId);
    if (!run) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll run ${runId} not found`,
        },
      };
    }

    const line = await this.repository.findPayrollLineByRunAndEmployee(
      context,
      runId,
      employeeId
    );

    if (!line) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `No payslip data found for employee ${employeeId} in payroll run ${runId}`,
        },
      };
    }

    return {
      success: true,
      data: {
        run: this.mapRunToResponse(run),
        line: this.mapLineToResponse(line),
      },
    };
  }
}
