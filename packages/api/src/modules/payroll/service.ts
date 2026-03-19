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
import { SalarySacrificeRepository } from "./salary-sacrifice.repository";
import type {
  PayrollRepository,
  PayrollRunRow,
  PayrollLineRow,
  TaxDetailsRow,
  PayScheduleRow,
  PayAssignmentRow,
  FpsEmployeeDataRow,
  YtdTotalsRow,
  RtiSubmissionRow,
  PeriodLockRow,
  JournalEntryRow,
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
  LockPayrollPeriod,
  UnlockPayrollPeriod,
  PeriodLockResponse,
  JournalEntryResponse,
  JournalEntriesQuery,
  HolidayPayRateResponse,
} from "./schemas";
import { PAYROLL_STATUS_TRANSITIONS } from "./schemas";
import {
  calculateHolidayDayRate,
  MAX_LOOKBACK_WEEKS,
  type WeeklyEarnings,
} from "@staffora/shared/utils";

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
  | "payroll.tax_details.updated"
  | "payroll.period.locked"
  | "payroll.period.unlocked"
  | "payroll.journal_entries.generated"
  | "payroll.holiday_pay.calculated";

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

        // Gross (before salary sacrifice)
        const gross = Math.round((monthlyBasic + overtimePay + bonusPay) * 100) / 100;

        // Salary sacrifice (TODO-232): reduces gross pay before tax/NI calculation
        // UK salary sacrifice reduces both taxable income and NI-able income
        let totalMonthlySacrifice = 0;
        try {
          const sacrificeRepo = new SalarySacrificeRepository(this.db);
          const activeSacrifices = await sacrificeRepo.findActiveByEmployee(
            context,
            emp.id,
            periodEnd,
            tx
          );
          for (const sacrifice of activeSacrifices) {
            const amount = parseFloat(sacrifice.amount);
            totalMonthlySacrifice += sacrifice.frequency === "annual" ? amount / 12 : amount;
          }
        } catch {
          // salary_sacrifices table may not exist in all environments -- skip
        }
        totalMonthlySacrifice = Math.round(totalMonthlySacrifice * 100) / 100;

        // Adjusted annual income for tax/NI (reduced by salary sacrifice)
        const adjustedAnnualForTaxNI = Math.max(0, annualSalary - (totalMonthlySacrifice * 12)) + (overtimePay + bonusPay) * 12;

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

        // Calculate deductions on adjusted (post-sacrifice) income
        const taxDeduction = calculateMonthlyIncomeTax(adjustedAnnualForTaxNI, taxCode);
        const niEmployee = calculateMonthlyEmployeeNI(adjustedAnnualForTaxNI, niCategory);
        const niEmployer = calculateMonthlyEmployerNI(adjustedAnnualForTaxNI);
        const studentLoan = calculateMonthlyStudentLoan(adjustedAnnualForTaxNI, studentLoanPlan);

        // Pension (simplified: 5% employee, 3% employer as auto-enrolment minimum)
        const pensionEmployee = Math.round(gross * 0.05 * 100) / 100;
        const pensionEmployer = Math.round(gross * 0.03 * 100) / 100;

        const deductions = Math.round((taxDeduction + niEmployee + pensionEmployee + studentLoan + totalMonthlySacrifice) * 100) / 100;
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
            otherDeductions: totalMonthlySacrifice.toFixed(2),
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

  // =========================================================================
  // Pay Schedules
  // =========================================================================

  async createPaySchedule(
    context: TenantContext,
    data: { name: string; frequency: string; payDayOfWeek?: number | null; payDayOfMonth?: number | null; taxWeekStart?: string | null; isDefault?: boolean }
  ): Promise<ServiceResult<unknown>> {
    try {
      const schedule = await this.repository.createPaySchedule(context, data);
      return { success: true, data: this.mapScheduleToResponse(schedule) };
    } catch (error: any) {
      if (error.message?.includes("duplicate key") || error.message?.includes("unique")) {
        return { success: false, error: { code: ErrorCodes.CONFLICT, message: "A pay schedule with that name already exists" } };
      }
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create pay schedule" } };
    }
  }

  async getPaySchedules(context: TenantContext): Promise<ServiceResult<unknown[]>> {
    try {
      const schedules = await this.repository.getPaySchedules(context);
      return { success: true, data: schedules.map((s) => this.mapScheduleToResponse(s)) };
    } catch {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch pay schedules" } };
    }
  }

  async getPayScheduleById(context: TenantContext, id: string): Promise<ServiceResult<unknown>> {
    try {
      const schedule = await this.repository.getPayScheduleById(context, id);
      if (!schedule) {
        return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Pay schedule not found" } };
      }
      return { success: true, data: this.mapScheduleToResponse(schedule) };
    } catch {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch pay schedule" } };
    }
  }

  async updatePaySchedule(
    context: TenantContext,
    id: string,
    data: Partial<{ name: string; payDayOfWeek: number | null; payDayOfMonth: number | null; taxWeekStart: string | null; isDefault: boolean }>
  ): Promise<ServiceResult<unknown>> {
    try {
      const schedule = await this.repository.updatePaySchedule(context, id, data);
      if (!schedule) {
        return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Pay schedule not found" } };
      }
      return { success: true, data: this.mapScheduleToResponse(schedule) };
    } catch {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to update pay schedule" } };
    }
  }

  // =========================================================================
  // Employee Pay Assignments
  // =========================================================================

  async assignEmployeeToSchedule(
    context: TenantContext,
    data: { employeeId: string; payScheduleId: string; effectiveFrom: string; effectiveTo?: string | null }
  ): Promise<ServiceResult<unknown>> {
    try {
      const assignment = await this.repository.assignEmployeeToSchedule(context, data);
      return { success: true, data: this.mapAssignmentToResponse(assignment) };
    } catch (error: any) {
      if (error.message?.includes("excl_pay_assignment_overlap")) {
        return { success: false, error: { code: ErrorCodes.CONFLICT, message: "Overlapping pay schedule assignment for this employee" } };
      }
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to assign employee to pay schedule" } };
    }
  }

  async getEmployeePayAssignments(context: TenantContext, employeeId: string): Promise<ServiceResult<unknown[]>> {
    try {
      const assignments = await this.repository.getEmployeePayAssignments(context, employeeId);
      return { success: true, data: assignments.map((a) => this.mapAssignmentToResponse(a)) };
    } catch {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch pay assignments" } };
    }
  }

  async getCurrentPayAssignment(context: TenantContext, employeeId: string): Promise<ServiceResult<unknown>> {
    try {
      const assignment = await this.repository.getCurrentPayAssignment(context, employeeId);
      if (!assignment) {
        return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "No current pay schedule assignment found" } };
      }
      return { success: true, data: this.mapAssignmentToResponse(assignment) };
    } catch {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch current pay assignment" } };
    }
  }

  // =========================================================================
  // Formatters
  // =========================================================================

  private mapScheduleToResponse(row: PayScheduleRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      frequency: row.frequency,
      payDayOfWeek: row.payDayOfWeek,
      payDayOfMonth: row.payDayOfMonth,
      taxWeekStart: row.taxWeekStart instanceof Date ? row.taxWeekStart.toISOString().split("T")[0] : row.taxWeekStart,
      isDefault: row.isDefault,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    };
  }

  private mapAssignmentToResponse(row: PayAssignmentRow) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      payScheduleId: row.payScheduleId,
      scheduleName: row.scheduleName ?? null,
      scheduleFrequency: row.scheduleFrequency ?? null,
      effectiveFrom: row.effectiveFrom instanceof Date ? row.effectiveFrom.toISOString().split("T")[0] : row.effectiveFrom,
      effectiveTo: row.effectiveTo instanceof Date ? row.effectiveTo.toISOString().split("T")[0] : row.effectiveTo,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
  }

  // =========================================================================
  // Payroll Period Locks
  // =========================================================================

  private mapPeriodLockToResponse(row: PeriodLockRow): PeriodLockResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      period_start: row.periodStart instanceof Date
        ? row.periodStart.toISOString().split("T")[0]
        : String(row.periodStart),
      period_end: row.periodEnd instanceof Date
        ? row.periodEnd.toISOString().split("T")[0]
        : String(row.periodEnd),
      locked_at: row.lockedAt instanceof Date
        ? row.lockedAt.toISOString()
        : String(row.lockedAt),
      locked_by: row.lockedBy,
      unlock_reason: row.unlockReason,
      unlocked_at: row.unlockedAt
        ? row.unlockedAt instanceof Date
          ? row.unlockedAt.toISOString()
          : String(row.unlockedAt)
        : null,
      unlocked_by: row.unlockedBy,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      is_locked: row.unlockedAt === null,
    };
  }

  /**
   * Lock a payroll period.
   *
   * Validates:
   * - period_end >= period_start
   * - No existing active lock overlaps with the given date range
   *   (handled by the DB exclusion constraint, but we check here for a
   *    clear error message)
   * - User ID is present (required as locked_by)
   */
  async lockPayrollPeriod(
    context: TenantContext,
    data: LockPayrollPeriod,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PeriodLockResponse>> {
    if (data.period_end < data.period_start) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "period_end must be on or after period_start",
          details: {
            period_start: data.period_start,
            period_end: data.period_end,
          },
        },
      };
    }

    if (!context.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "User identity is required to lock a payroll period",
        },
      };
    }

    // Check for existing active locks that overlap
    const existingLocks = await this.repository.findActiveLocksForPeriod(
      context,
      data.period_start,
      data.period_end
    );

    if (existingLocks.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "An active payroll period lock already exists that overlaps with the given date range",
          details: {
            period_start: data.period_start,
            period_end: data.period_end,
            existing_locks: existingLocks.map((l) => ({
              id: l.id,
              period_start: l.periodStart instanceof Date
                ? l.periodStart.toISOString().split("T")[0]
                : String(l.periodStart),
              period_end: l.periodEnd instanceof Date
                ? l.periodEnd.toISOString().split("T")[0]
                : String(l.periodEnd),
            })),
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createPeriodLock(context, data, tx);

      await this.emitEvent(
        tx,
        context,
        "payroll_period_lock",
        row.id,
        "payroll.period.locked",
        {
          lock: this.mapPeriodLockToResponse(row),
          period_start: data.period_start,
          period_end: data.period_end,
        }
      );

      return {
        success: true,
        data: this.mapPeriodLockToResponse(row),
      };
    });
  }

  /**
   * Unlock a payroll period.
   *
   * Validates:
   * - Lock exists
   * - Lock is currently active (not already unlocked)
   * - User ID is present (required as unlocked_by)
   * - Unlock reason is provided
   */
  async unlockPayrollPeriod(
    context: TenantContext,
    lockId: string,
    data: UnlockPayrollPeriod,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PeriodLockResponse>> {
    if (!context.userId) {
      return {
        success: false,
        error: {
          code: ErrorCodes.UNAUTHORIZED,
          message: "User identity is required to unlock a payroll period",
        },
      };
    }

    const existing = await this.repository.findPeriodLockById(context, lockId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll period lock ${lockId} not found`,
        },
      };
    }

    if (existing.unlockedAt !== null) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "This payroll period is already unlocked",
          details: {
            lock_id: lockId,
            unlocked_at: existing.unlockedAt instanceof Date
              ? existing.unlockedAt.toISOString()
              : String(existing.unlockedAt),
            unlocked_by: existing.unlockedBy,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.unlockPeriodLock(
        context,
        lockId,
        data.unlock_reason,
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "Failed to unlock period. It may have already been unlocked by another user.",
          },
        };
      }

      await this.emitEvent(
        tx,
        context,
        "payroll_period_lock",
        row.id,
        "payroll.period.unlocked",
        {
          lock: this.mapPeriodLockToResponse(row),
          unlock_reason: data.unlock_reason,
        }
      );

      return {
        success: true,
        data: this.mapPeriodLockToResponse(row),
      };
    });
  }

  /**
   * Get the lock status for a payroll period.
   *
   * Returns all locks (active and historical) that overlap with the
   * given date range, or all locks if no date range is provided.
   */
  async getPeriodLockStatus(
    context: TenantContext,
    filters: {
      periodStart?: string;
      periodEnd?: string;
      activeOnly?: boolean;
    } = {}
  ): Promise<ServiceResult<PeriodLockResponse[]>> {
    const rows = await this.repository.listPeriodLocks(context, filters);

    return {
      success: true,
      data: rows.map((r) => this.mapPeriodLockToResponse(r)),
    };
  }

  /**
   * Get a single period lock by ID.
   */
  async getPeriodLockById(
    context: TenantContext,
    lockId: string
  ): Promise<ServiceResult<PeriodLockResponse>> {
    const row = await this.repository.findPeriodLockById(context, lockId);
    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Payroll period lock ${lockId} not found`,
        },
      };
    }

    return {
      success: true,
      data: this.mapPeriodLockToResponse(row),
    };
  }

  // =========================================================================
  // Journal Entries (TODO-233)
  // =========================================================================

  private mapJournalEntryToResponse(row: JournalEntryRow): JournalEntryResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      payroll_run_id: row.payrollRunId,
      entry_date: row.entryDate instanceof Date
        ? row.entryDate.toISOString().split("T")[0]
        : String(row.entryDate),
      account_code: row.accountCode,
      description: row.description,
      debit: String(row.debit),
      credit: String(row.credit),
      cost_centre_id: row.costCentreId,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }

  /**
   * Generate journal entries from an approved/submitted/paid payroll run.
   *
   * Produces double-entry accounting lines for:
   * - Gross pay (debit to salary expense)
   * - Employer NI (debit to employer NI expense)
   * - Employer pension (debit to employer pension expense)
   * - PAYE tax (credit to HMRC PAYE liability)
   * - Employee NI (credit to HMRC NI liability)
   * - Employee pension (credit to pension liability)
   * - Student loan (credit to SLC liability)
   * - Net pay (credit to wages payable / bank)
   * - Employer NI (credit to HMRC employer NI liability)
   * - Employer pension (credit to pension liability - employer)
   *
   * Validates:
   * - Payroll run exists
   * - Payroll run is in an approved, submitted, or paid status
   * - Journal entries have not already been generated for this run
   */
  async generateJournalEntries(
    context: TenantContext,
    runId: string,
    costCentreId: string | null = null,
    _idempotencyKey?: string
  ): Promise<ServiceResult<JournalEntryResponse[]>> {
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

    // Only allow journal generation from approved, submitted, or paid runs
    const allowedStatuses: PayrollRunStatus[] = ["approved", "submitted", "paid"];
    if (!allowedStatuses.includes(run.status)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot generate journal entries for a payroll run in "${run.status}" status. Run must be approved, submitted, or paid.`,
          details: {
            currentStatus: run.status,
            allowedStatuses,
          },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      // Prevent duplicate journal generation
      const alreadyGenerated = await this.repository.hasJournalEntriesForRun(
        context,
        runId,
        tx
      );

      if (alreadyGenerated) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `Journal entries have already been generated for payroll run ${runId}`,
            details: { payroll_run_id: runId },
          },
        };
      }

      // Get all payroll lines for aggregation
      const lines = await this.repository.findPayrollLinesByRunId(context, runId);

      if (lines.length === 0) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Payroll run has no calculated lines. Cannot generate journal entries.",
          },
        };
      }

      // Determine entry date from the payroll run pay date
      const entryDate = run.payDate instanceof Date
        ? run.payDate.toISOString().split("T")[0]
        : String(run.payDate);

      // Aggregate totals across all lines
      let totalGross = 0;
      let totalTax = 0;
      let totalNiEmployee = 0;
      let totalNiEmployer = 0;
      let totalPensionEmployee = 0;
      let totalPensionEmployer = 0;
      let totalStudentLoan = 0;
      let totalNetPay = 0;

      for (const line of lines) {
        totalGross += parseFloat(String(line.totalGross) || "0");
        totalTax += parseFloat(String(line.taxDeduction) || "0");
        totalNiEmployee += parseFloat(String(line.niEmployee) || "0");
        totalNiEmployer += parseFloat(String(line.niEmployer) || "0");
        totalPensionEmployee += parseFloat(String(line.pensionEmployee) || "0");
        totalPensionEmployer += parseFloat(String(line.pensionEmployer) || "0");
        totalStudentLoan += parseFloat(String(line.studentLoan) || "0");
        totalNetPay += parseFloat(String(line.netPay) || "0");
      }

      // Build journal entry lines (double-entry: debits = credits)
      // Standard UK payroll nominal codes pattern:
      //   7000 - Gross Salary Expense
      //   7002 - Employer NI Expense
      //   7004 - Employer Pension Expense
      //   2210 - PAYE Tax Liability (HMRC)
      //   2211 - Employee NI Liability (HMRC)
      //   2212 - Employer NI Liability (HMRC)
      //   2220 - Pension Liability - Employee
      //   2221 - Pension Liability - Employer
      //   2230 - Student Loan Liability (SLC)
      //   2250 - Net Wages Payable

      const journalLines: Array<{
        payrollRunId: string;
        entryDate: string;
        accountCode: string;
        description: string;
        debit: string;
        credit: string;
        costCentreId: string | null;
      }> = [];

      const periodStart = run.payPeriodStart instanceof Date
        ? run.payPeriodStart.toISOString().split("T")[0]
        : String(run.payPeriodStart);
      const periodEnd = run.payPeriodEnd instanceof Date
        ? run.payPeriodEnd.toISOString().split("T")[0]
        : String(run.payPeriodEnd);
      const periodDesc = `Payroll ${periodStart} to ${periodEnd}`;

      // DEBIT entries (expenses)
      if (totalGross > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "7000",
          description: `Gross salaries - ${periodDesc}`,
          debit: totalGross.toFixed(2),
          credit: "0.00",
          costCentreId,
        });
      }

      if (totalNiEmployer > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "7002",
          description: `Employer NI contributions - ${periodDesc}`,
          debit: totalNiEmployer.toFixed(2),
          credit: "0.00",
          costCentreId,
        });
      }

      if (totalPensionEmployer > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "7004",
          description: `Employer pension contributions - ${periodDesc}`,
          debit: totalPensionEmployer.toFixed(2),
          credit: "0.00",
          costCentreId,
        });
      }

      // CREDIT entries (liabilities)
      if (totalTax > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2210",
          description: `PAYE tax liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalTax.toFixed(2),
          costCentreId,
        });
      }

      if (totalNiEmployee > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2211",
          description: `Employee NI liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalNiEmployee.toFixed(2),
          costCentreId,
        });
      }

      if (totalNiEmployer > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2212",
          description: `Employer NI liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalNiEmployer.toFixed(2),
          costCentreId,
        });
      }

      if (totalPensionEmployee > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2220",
          description: `Employee pension contributions liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalPensionEmployee.toFixed(2),
          costCentreId,
        });
      }

      if (totalPensionEmployer > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2221",
          description: `Employer pension contributions liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalPensionEmployer.toFixed(2),
          costCentreId,
        });
      }

      if (totalStudentLoan > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2230",
          description: `Student loan repayments liability - ${periodDesc}`,
          debit: "0.00",
          credit: totalStudentLoan.toFixed(2),
          costCentreId,
        });
      }

      if (totalNetPay > 0) {
        journalLines.push({
          payrollRunId: runId,
          entryDate,
          accountCode: "2250",
          description: `Net wages payable - ${periodDesc}`,
          debit: "0.00",
          credit: totalNetPay.toFixed(2),
          costCentreId,
        });
      }

      // Insert all journal entries in the same transaction
      const rows = await this.repository.insertJournalEntries(
        context,
        journalLines,
        tx
      );

      // Emit domain event in the same transaction
      await this.emitEvent(
        tx,
        context,
        "payroll_run",
        runId,
        "payroll.journal_entries.generated",
        {
          payrollRunId: runId,
          entryCount: rows.length,
          entryDate,
          costCentreId,
        }
      );

      return {
        success: true,
        data: rows.map((r) => this.mapJournalEntryToResponse(r)),
      };
    });
  }

  /**
   * Get journal entries for a specific payroll run.
   */
  async getJournalEntriesByRunId(
    context: TenantContext,
    runId: string
  ): Promise<ServiceResult<JournalEntryResponse[]>> {
    // Verify run exists
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

    const rows = await this.repository.findJournalEntriesByRunId(context, runId);
    return {
      success: true,
      data: rows.map((r) => this.mapJournalEntryToResponse(r)),
    };
  }

  /**
   * List journal entries with optional filters and cursor-based pagination.
   * Returns entries plus a debit/credit summary for the matching set.
   */
  async listJournalEntries(
    context: TenantContext,
    filters: JournalEntriesQuery
  ): Promise<ServiceResult<{
    items: JournalEntryResponse[];
    summary: { total_debits: string; total_credits: string; is_balanced: boolean };
    nextCursor: string | null;
    hasMore: boolean;
  }>> {
    const [result, totals] = await Promise.all([
      this.repository.listJournalEntries(context, filters),
      this.repository.getJournalEntriesTotals(context, filters),
    ]);

    const totalDebits = parseFloat(totals.totalDebits);
    const totalCredits = parseFloat(totals.totalCredits);
    // Balanced if debits equal credits (within rounding tolerance)
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      success: true,
      data: {
        items: result.items.map((r) => this.mapJournalEntryToResponse(r)),
        summary: {
          total_debits: totalDebits.toFixed(2),
          total_credits: totalCredits.toFixed(2),
          is_balanced: isBalanced,
        },
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  // ===========================================================================
  // Holiday Pay 52-Week Reference Period (TODO-113)
  // ===========================================================================

  /**
   * Calculate the holiday pay daily rate for an employee using the UK
   * 52-week reference period (Employment Rights Act 1996).
   *
   * Steps:
   * 1. Determine the look-back window (up to 104 weeks from today)
   * 2. Fetch weekly earnings from payroll runs + bonus payments
   * 3. Map DB rows to WeeklyEarnings format for the shared calculator
   * 4. Run the 52-week reference period calculation
   * 5. Persist an audit record of the calculation
   * 6. Return the full breakdown
   */
  async getHolidayPayRate(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<HolidayPayRateResponse>> {
    try {
      // 1. Determine the look-back window
      const today = new Date();
      const toDate = today.toISOString().slice(0, 10);

      const lookbackStart = new Date(today);
      lookbackStart.setDate(lookbackStart.getDate() - MAX_LOOKBACK_WEEKS * 7);
      const fromDate = lookbackStart.toISOString().slice(0, 10);

      // 2. Fetch weekly earnings data from the repository
      const weeklyRows = await this.repository.getWeeklyEarningsForHolidayPay(
        context,
        employeeId,
        fromDate,
        toDate
      );

      // 3. Get working days per week from the employee's contract
      const workingDaysPerWeek = await this.repository.getWorkingDaysPerWeek(
        context,
        employeeId
      );

      // 4. Map DB rows to the shared WeeklyEarnings format
      const earnings: WeeklyEarnings[] = weeklyRows.map((row) => ({
        weekStart: row.weekStart instanceof Date
          ? row.weekStart.toISOString().slice(0, 10)
          : String(row.weekStart),
        weekEnd: row.weekEnd instanceof Date
          ? row.weekEnd.toISOString().slice(0, 10)
          : String(row.weekEnd),
        basicPay: parseFloat(String(row.basicPay)) || 0,
        overtimePay: parseFloat(String(row.overtimePay)) || 0,
        commission: parseFloat(String(row.commission)) || 0,
        regularBonus: parseFloat(String(row.regularBonus)) || 0,
      }));

      // 5. Run the shared 52-week reference period calculation
      const calcResult = calculateHolidayDayRate(earnings, workingDaysPerWeek);

      // 6. Persist an audit record within a transaction + domain event
      await this.db.withTransaction(context, async (tx) => {
        await this.repository.saveHolidayPayCalculation(
          context,
          {
            employeeId,
            averageWeeklyPay: calcResult.averageWeeklyPay.toFixed(2),
            averageDailyRate: calcResult.averageDailyRate.toFixed(2),
            qualifyingWeeks: calcResult.qualifyingWeeks,
            totalWeeksExamined: calcResult.totalWeeksExamined,
            isIncomplete: calcResult.isIncomplete,
            workingDaysPerWeek,
            breakdownBasicPay: calcResult.breakdown.averageBasicPay.toFixed(2),
            breakdownOvertimePay: calcResult.breakdown.averageOvertimePay.toFixed(2),
            breakdownCommission: calcResult.breakdown.averageCommission.toFixed(2),
            breakdownRegularBonus: calcResult.breakdown.averageRegularBonus.toFixed(2),
            referenceStart: calcResult.referenceStart,
            referenceEnd: calcResult.referenceEnd,
          },
          tx
        );

        await this.emitEvent(
          tx,
          context,
          "employee",
          employeeId,
          "payroll.holiday_pay.calculated",
          {
            employeeId,
            averageWeeklyPay: calcResult.averageWeeklyPay,
            averageDailyRate: calcResult.averageDailyRate,
            qualifyingWeeks: calcResult.qualifyingWeeks,
            isIncomplete: calcResult.isIncomplete,
          }
        );
      });

      // 7. Build the weekly data array for the response
      const weeklyData = earnings
        .filter(
          (w) =>
            w.basicPay + w.overtimePay + w.commission + w.regularBonus > 0
        )
        .slice(0, calcResult.qualifyingWeeks)
        .map((w) => ({
          week_start: w.weekStart,
          week_end: w.weekEnd,
          basic_pay: w.basicPay.toFixed(2),
          overtime_pay: w.overtimePay.toFixed(2),
          commission: w.commission.toFixed(2),
          regular_bonus: w.regularBonus.toFixed(2),
          total: (
            w.basicPay +
            w.overtimePay +
            w.commission +
            w.regularBonus
          ).toFixed(2),
        }));

      return {
        success: true,
        data: {
          employee_id: employeeId,
          average_weekly_pay: calcResult.averageWeeklyPay.toFixed(2),
          average_daily_rate: calcResult.averageDailyRate.toFixed(2),
          qualifying_weeks: calcResult.qualifyingWeeks,
          total_weeks_examined: calcResult.totalWeeksExamined,
          is_incomplete: calcResult.isIncomplete,
          working_days_per_week: workingDaysPerWeek,
          breakdown: {
            average_basic_pay: calcResult.breakdown.averageBasicPay.toFixed(2),
            average_overtime_pay: calcResult.breakdown.averageOvertimePay.toFixed(2),
            average_commission: calcResult.breakdown.averageCommission.toFixed(2),
            average_regular_bonus: calcResult.breakdown.averageRegularBonus.toFixed(2),
          },
          weekly_data: weeklyData,
          reference_start: calcResult.referenceStart,
          reference_end: calcResult.referenceEnd,
          calculated_at: new Date().toISOString(),
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: `Failed to calculate holiday pay rate: ${message}`,
        },
      };
    }
  }
}
