/**
 * Total Reward Statement Module - Service Layer
 *
 * Implements business logic for generating total reward statements that
 * combine compensation, benefits, pension, and holiday entitlement data
 * into a single comprehensive view of an employee's total package.
 *
 * Data sources:
 * - compensation_history: base salary, currency, pay frequency
 * - payroll_lines/payroll_runs: bonus pay, overtime pay, pension contributions
 * - benefit_enrollments/benefit_plans: active benefit values
 * - pension_enrolments/pension_schemes: pension scheme details and rates
 * - leave_balances/leave_types: holiday entitlement in days
 *
 * All mutating operations emit domain events via the outbox pattern.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  TotalRewardRepository,
  TotalRewardStatementRow,
} from "./repository";
import type {
  ServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  TotalRewardStatementResponse,
  BreakdownDetail,
  BenefitItem,
  PdfRequestResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/**
 * UK statutory minimum holiday entitlement in days for full-time workers
 */
const DEFAULT_HOLIDAY_DAYS = 28;

/**
 * Standard working days per year (for daily rate calculation)
 */
const WORKING_DAYS_PER_YEAR = 260;

// =============================================================================
// Service
// =============================================================================

export class TotalRewardService {
  constructor(
    private repository: TotalRewardRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Generate Total Reward Statement
  // ===========================================================================

  /**
   * Generate a total reward statement for an employee.
   *
   * Gathers data from compensation, payroll, benefits, pension, and leave
   * modules to produce a comprehensive total reward statement.
   *
   * If `useCache` is true and a statement exists for the given period,
   * the cached version is returned.
   */
  async generateStatement(
    context: TenantContext,
    employeeId: string,
    options: {
      periodStart?: string;
      periodEnd?: string;
      useCache?: boolean;
    } = {}
  ): Promise<ServiceResult<TotalRewardStatementResponse>> {
    try {
      // Default to current UK tax year (6 Apr to 5 Apr)
      const now = new Date();
      const periodStart = options.periodStart || this.getUkTaxYearStart(now);
      const periodEnd = options.periodEnd || this.getUkTaxYearEnd(now);

      // Check for cached statement if requested
      if (options.useCache) {
        const cached = await this.repository.findCachedStatement(
          context,
          employeeId,
          periodStart,
          periodEnd
        );

        if (cached) {
          return {
            success: true,
            data: this.mapStatementToResponse(cached),
          };
        }
      }

      // Verify employee exists and is accessible under RLS
      const employee = await this.repository.getEmployeeBasicData(
        context,
        employeeId
      );

      if (!employee) {
        return {
          success: false,
          error: {
            code: ErrorCodes.EMPLOYEE_NOT_FOUND,
            message: "Employee not found",
          },
        };
      }

      // Gather all compensation data in parallel
      const [
        compensation,
        payrollSummary,
        benefitEnrollments,
        pensionEnrolment,
        holidayEntitlement,
      ] = await Promise.all([
        this.repository.getCurrentCompensation(context, employeeId),
        this.repository.getPayrollSummary(context, employeeId, periodStart, periodEnd),
        this.repository.getActiveBenefitEnrollments(context, employeeId, periodEnd),
        this.repository.getPensionEnrolment(context, employeeId),
        this.repository.getHolidayEntitlement(
          context,
          employeeId,
          this.extractYear(periodStart)
        ),
      ]);

      // Calculate summary values
      const baseSalary = compensation
        ? parseFloat(compensation.baseSalary)
        : 0;
      const currency = compensation?.currency || "GBP";
      const payFrequency = compensation?.payFrequency || "monthly";

      // Annualise the base salary if needed
      const annualBaseSalary = this.annualise(baseSalary, payFrequency);

      const bonusPay = parseFloat(payrollSummary.totalBonusPay);
      const overtimePay = parseFloat(payrollSummary.totalOvertimePay);

      // Pension: use payroll actuals if available, else estimate from rates
      let pensionEmployer = parseFloat(payrollSummary.totalPensionEmployer);
      let pensionEmployee = parseFloat(payrollSummary.totalPensionEmployee);

      // If no payroll data, estimate from pension scheme rates
      if (pensionEmployer === 0 && pensionEmployee === 0 && pensionEnrolment) {
        const employerPct = parseFloat(pensionEnrolment.employerContributionPct || "0") / 100;
        const employeePct = parseFloat(pensionEnrolment.employeeContributionPct || "0") / 100;
        pensionEmployer = annualBaseSalary * employerPct;
        pensionEmployee = annualBaseSalary * employeePct;
      }

      // Benefits: aggregate employer and employee contributions (monthly * 12 to annualise)
      let benefitsEmployer = 0;
      let benefitsEmployee = 0;
      const benefitItems: BenefitItem[] = [];

      for (const enrollment of benefitEnrollments) {
        const emplerContrib = parseFloat(enrollment.employerContribution) * 12;
        const empleeContrib = parseFloat(enrollment.employeeContribution) * 12;
        benefitsEmployer += emplerContrib;
        benefitsEmployee += empleeContrib;

        benefitItems.push({
          name: enrollment.planName,
          category: enrollment.planCategory,
          employer_contribution: emplerContrib.toFixed(2),
          employee_contribution: empleeContrib.toFixed(2),
          total_value: (emplerContrib + empleeContrib).toFixed(2),
        });
      }

      // Holiday entitlement value
      const holidayDays = holidayEntitlement?.entitled || DEFAULT_HOLIDAY_DAYS;
      const dailyRate = annualBaseSalary / WORKING_DAYS_PER_YEAR;
      const holidayEntitlementValue = holidayDays * dailyRate;

      // Total package = employer's total cost
      // Base salary + bonus + overtime + employer pension + employer benefits + holiday value
      const totalPackageValue =
        annualBaseSalary +
        bonusPay +
        overtimePay +
        pensionEmployer +
        benefitsEmployer +
        holidayEntitlementValue;

      // Build detailed breakdown
      const breakdownDetail: BreakdownDetail = {
        compensation: {
          base_salary: annualBaseSalary.toFixed(2),
          pay_frequency: payFrequency,
          currency,
        },
        variable_pay: [
          ...(bonusPay > 0
            ? [{ type: "bonus", amount: bonusPay.toFixed(2), description: "Bonus/variable pay" }]
            : []),
          ...(overtimePay > 0
            ? [{ type: "overtime", amount: overtimePay.toFixed(2), description: "Overtime pay" }]
            : []),
        ],
        pension: {
          scheme_name: pensionEnrolment?.schemeName || null,
          employer_contribution_pct: pensionEnrolment?.employerContributionPct || null,
          employee_contribution_pct: pensionEnrolment?.employeeContributionPct || null,
          employer_amount: pensionEmployer.toFixed(2),
          employee_amount: pensionEmployee.toFixed(2),
        },
        benefits: benefitItems,
        holiday: {
          entitlement_days: holidayDays,
          daily_rate: dailyRate.toFixed(2),
          total_value: holidayEntitlementValue.toFixed(2),
        },
      };

      // Persist the statement in a transaction with outbox event
      const statement = await this.db.withTransaction(context, async (tx) => {
        const stmt = await this.repository.createStatement(tx, context, {
          employeeId,
          statementDate: new Date().toISOString().split("T")[0]!,
          periodStart,
          periodEnd,
          baseSalary: annualBaseSalary,
          bonusPay,
          overtimePay,
          pensionEmployer,
          pensionEmployee,
          benefitsEmployer,
          benefitsEmployee,
          holidayEntitlementValue,
          totalPackageValue,
          currency,
          breakdownDetail: breakdownDetail as unknown as Record<string, unknown>,
          generatedBy: context.userId || null,
        });

        await emitDomainEvent(tx, {
          tenantId: context.tenantId,
          aggregateType: "total_reward_statement",
          aggregateId: stmt.id,
          eventType: "rewards.total_reward_statement.generated",
          payload: {
            statementId: stmt.id,
            employeeId,
            periodStart,
            periodEnd,
            totalPackageValue: totalPackageValue.toFixed(2),
          },
          userId: context.userId,
        });

        return stmt;
      });

      // Enrich with employee name/number
      const response = this.mapStatementToResponse(statement);
      response.employee_name = `${employee.firstName} ${employee.lastName}`;
      response.employee_number = employee.employeeNumber;

      return { success: true, data: response };
    } catch (error) {
      console.error("[TotalRewardService] generateStatement error:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to generate total reward statement",
        },
      };
    }
  }

  // ===========================================================================
  // Get Statement By ID
  // ===========================================================================

  /**
   * Retrieve a previously generated total reward statement by ID
   */
  async getStatementById(
    context: TenantContext,
    id: string
  ): Promise<ServiceResult<TotalRewardStatementResponse>> {
    try {
      const statement = await this.repository.findStatementById(context, id);

      if (!statement) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Total reward statement not found",
          },
        };
      }

      return {
        success: true,
        data: this.mapStatementToResponse(statement),
      };
    } catch (error) {
      console.error("[TotalRewardService] getStatementById error:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to retrieve total reward statement",
        },
      };
    }
  }

  // ===========================================================================
  // Request PDF Generation
  // ===========================================================================

  /**
   * Request PDF generation for a total reward statement.
   *
   * If no statement exists yet for the employee and period, one is generated first.
   * The PDF generation is handled asynchronously by the pdf-worker via the outbox.
   */
  async requestPdfGeneration(
    context: TenantContext,
    employeeId: string,
    options: {
      periodStart?: string;
      periodEnd?: string;
    } = {}
  ): Promise<ServiceResult<PdfRequestResponse>> {
    try {
      // First, generate (or fetch cached) the statement data
      const stmtResult = await this.generateStatement(context, employeeId, {
        ...options,
        useCache: true,
      });

      if (!stmtResult.success || !stmtResult.data) {
        return {
          success: false,
          error: stmtResult.error || {
            code: ErrorCodes.INTERNAL_ERROR,
            message: "Failed to generate statement for PDF",
          },
        };
      }

      const statementId = stmtResult.data.id;

      // Update status and emit PDF generation event in a single transaction
      await this.db.withTransaction(context, async (tx) => {
        await this.repository.updateStatementStatus(
          tx,
          statementId,
          "pdf_requested"
        );

        await emitDomainEvent(tx, {
          tenantId: context.tenantId,
          aggregateType: "total_reward_statement",
          aggregateId: statementId,
          eventType: "rewards.total_reward_statement.pdf_requested",
          payload: {
            statementId,
            employeeId,
            statementData: stmtResult.data,
          },
          userId: context.userId,
        });
      });

      return {
        success: true,
        data: {
          statement_id: statementId,
          status: "pdf_requested" as const,
          message:
            "PDF generation has been queued. The document will be available shortly.",
        },
      };
    } catch (error) {
      console.error("[TotalRewardService] requestPdfGeneration error:", error);
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to request PDF generation",
        },
      };
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Get the start date of the UK tax year containing the given date.
   * UK tax year runs from 6 April to 5 April.
   */
  private getUkTaxYearStart(date: Date): string {
    // If we're on or after 6 April, this calendar year is the tax year start.
    // If before 6 April, the previous calendar year is the tax year start.
    const month = date.getMonth(); // 0-indexed (0=Jan, 3=Apr)
    const day = date.getDate();
    const year =
      month > 3 || (month === 3 && day >= 6)
        ? date.getFullYear()
        : date.getFullYear() - 1;
    return `${year}-04-06`;
  }

  /**
   * Get the end date of the UK tax year containing the given date.
   */
  private getUkTaxYearEnd(date: Date): string {
    const month = date.getMonth();
    const day = date.getDate();
    const startYear =
      month > 3 || (month === 3 && day >= 6)
        ? date.getFullYear()
        : date.getFullYear() - 1;
    return `${startYear + 1}-04-05`;
  }

  /**
   * Extract the year from a date string (YYYY-MM-DD)
   */
  private extractYear(dateStr: string): number {
    return parseInt(dateStr.substring(0, 4), 10);
  }

  /**
   * Annualise a salary based on pay frequency
   */
  private annualise(amount: number, frequency: string): number {
    switch (frequency.toLowerCase()) {
      case "monthly":
        return amount * 12;
      case "weekly":
        return amount * 52;
      case "fortnightly":
      case "bi_weekly":
        return amount * 26;
      case "four_weekly":
        return amount * 13;
      case "annual":
      case "yearly":
        return amount;
      default:
        // If unknown, assume annual
        return amount;
    }
  }

  /**
   * Map a database row to the API response shape
   */
  private mapStatementToResponse(
    row: TotalRewardStatementRow
  ): TotalRewardStatementResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      employee_name: row.employeeName,
      employee_number: row.employeeNumber,

      statement_date: row.statementDate instanceof Date
        ? row.statementDate.toISOString().split("T")[0]!
        : String(row.statementDate),
      period_start: row.periodStart instanceof Date
        ? row.periodStart.toISOString().split("T")[0]!
        : String(row.periodStart),
      period_end: row.periodEnd instanceof Date
        ? row.periodEnd.toISOString().split("T")[0]!
        : String(row.periodEnd),

      base_salary: row.baseSalary,
      bonus_pay: row.bonusPay,
      overtime_pay: row.overtimePay,
      pension_employer: row.pensionEmployer,
      pension_employee: row.pensionEmployee,
      benefits_employer: row.benefitsEmployer,
      benefits_employee: row.benefitsEmployee,
      holiday_entitlement_value: row.holidayEntitlementValue,
      total_package_value: row.totalPackageValue,

      currency: row.currency,
      breakdown_detail: row.breakdownDetail as unknown as BreakdownDetail,

      status: row.status,
      pdf_document_id: row.pdfDocumentId,

      generated_by: row.generatedBy,
      published_at: row.publishedAt
        ? row.publishedAt instanceof Date
          ? row.publishedAt.toISOString()
          : String(row.publishedAt)
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
}
