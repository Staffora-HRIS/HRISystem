/**
 * Payroll Submission Service (TODO-064)
 *
 * Business logic for PAYE/RTI/FPS submission operations.
 * Handles FPS/EPS creation, validation, and HMRC submission queueing.
 *
 * State machine: draft -> validated -> submitted -> accepted/rejected
 * Rejected submissions can be re-drafted: rejected -> draft
 *
 * All writes emit domain events in the same transaction (outbox pattern).
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  SubmissionRepository,
  SubmissionRow,
  SubmissionItemRow,
} from "./submission.repository";
import type { PayrollRepository, FpsEmployeeDataRow, YtdTotalsRow } from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateFpsSubmission,
  CreateEpsSubmission,
  SubmissionListQuery,
  SubmissionResponse,
  SubmissionDetailResponse,
  SubmissionItemResponse,
  SubmissionValidationResponse,
  PayrollSubmissionStatus,
} from "./schemas";
import { SUBMISSION_STATUS_TRANSITIONS } from "./schemas";

// =============================================================================
// Domain Event Types
// =============================================================================

type SubmissionEventType =
  | "payroll.submission.created"
  | "payroll.submission.validated"
  | "payroll.submission.submitted"
  | "payroll.submission.accepted"
  | "payroll.submission.rejected";

// =============================================================================
// UK Tax Year Helpers
// =============================================================================

/**
 * Get the current UK tax year in format YYYY-YY.
 * UK tax year runs from 6 April to 5 April.
 */
function getCurrentTaxYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // If before 6 April, we are in the previous year's tax year
  if (month < 4 || (month === 4 && day < 6)) {
    return `${year - 1}-${String(year).slice(2)}`;
  }
  return `${year}-${String(year + 1).slice(2)}`;
}

/**
 * Get the tax year start date (6 April) from a tax year string.
 */
function getTaxYearStartDate(taxYear: string): string {
  const startYear = parseInt(taxYear.split("-")[0], 10);
  return `${startYear}-04-06`;
}

// =============================================================================
// Service
// =============================================================================

export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private payrollRepo: PayrollRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Domain Event Emission
  // ===========================================================================

  private async emitEvent(
    tx: TransactionSql,
    context: TenantContext,
    aggregateId: string,
    eventType: SubmissionEventType,
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
        'payroll_submission',
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

  private mapSubmissionToResponse(row: SubmissionRow): SubmissionResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      submission_type: row.submissionType,
      tax_year: row.taxYear,
      period: row.period,
      status: row.status,
      payroll_run_id: row.payrollRunId,
      employer_paye_ref: row.employerPayeRef,
      accounts_office_ref: row.accountsOfficeRef,
      hmrc_correlation_id: row.hmrcCorrelationId,
      validation_errors: row.validationErrors,
      validated_at: row.validatedAt
        ? row.validatedAt instanceof Date
          ? row.validatedAt.toISOString()
          : String(row.validatedAt)
        : null,
      submitted_at: row.submittedAt
        ? row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : String(row.submittedAt)
        : null,
      submitted_by: row.submittedBy,
      response_received_at: row.responseReceivedAt
        ? row.responseReceivedAt instanceof Date
          ? row.responseReceivedAt.toISOString()
          : String(row.responseReceivedAt)
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

  private mapItemToResponse(row: SubmissionItemRow): SubmissionItemResponse {
    return {
      id: row.id,
      submission_id: row.submissionId,
      employee_id: row.employeeId,
      employee_ni_number: row.employeeNiNumber,
      employee_tax_code: row.employeeTaxCode,
      ni_category: row.niCategory,
      gross_pay: String(row.grossPay),
      tax_deducted: String(row.taxDeducted),
      ni_employee: String(row.niEmployee),
      ni_employer: String(row.niEmployer),
      student_loan: String(row.studentLoan),
      pension_employee: String(row.pensionEmployee),
      pension_employer: String(row.pensionEmployer),
      net_pay: String(row.netPay),
      taxable_pay_ytd: row.taxablePayYtd ? String(row.taxablePayYtd) : null,
      tax_deducted_ytd: row.taxDeductedYtd ? String(row.taxDeductedYtd) : null,
      ni_employee_ytd: row.niEmployeeYtd ? String(row.niEmployeeYtd) : null,
      ni_employer_ytd: row.niEmployerYtd ? String(row.niEmployerYtd) : null,
      student_loan_ytd: row.studentLoanYtd ? String(row.studentLoanYtd) : null,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    };
  }

  // ===========================================================================
  // Create FPS (Full Payment Submission)
  // ===========================================================================

  async createFpsSubmission(
    ctx: TenantContext,
    data: CreateFpsSubmission,
    idempotencyKey?: string
  ): Promise<ServiceResult<SubmissionDetailResponse>> {
    try {
      const taxYear = data.tax_year ?? getCurrentTaxYear();

      // Verify the payroll run exists and is in an appropriate status
      const run = await this.payrollRepo.findPayrollRunById(ctx, data.payroll_run_id);
      if (!run) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Payroll run not found",
          },
        };
      }

      // Only allow FPS from runs that have been calculated (review or later)
      const allowedStatuses = ["review", "approved", "submitted", "paid"];
      if (!allowedStatuses.includes(run.status)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot create FPS from a payroll run in "${run.status}" status. Run must be in review, approved, submitted, or paid status.`,
          },
        };
      }

      const result = await this.db.withTransaction(ctx, async (tx) => {
        // Check for duplicate submission
        const existing = await this.submissionRepo.findExistingSubmission(
          ctx,
          "fps",
          taxYear,
          data.period ?? null,
          data.payroll_run_id,
          tx
        );
        if (existing) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.CONFLICT,
              message: `An FPS submission already exists for tax year ${taxYear}, period ${data.period ?? "N/A"}, run ${data.payroll_run_id}. Existing submission ID: ${existing.id} (status: ${existing.status})`,
            },
          };
        }

        // Gather FPS employee data from the payroll run
        const fpsData = await this.payrollRepo.getFpsEmployeeData(ctx, data.payroll_run_id, tx);
        if (fpsData.length === 0) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: "No employee payroll lines found for this payroll run. Cannot create FPS.",
            },
          };
        }

        // Get YTD totals
        const employeeIds = fpsData.map((e) => e.employeeId);
        const taxYearStart = getTaxYearStartDate(taxYear);
        const ytdMap = await this.payrollRepo.getYtdTotals(
          ctx,
          employeeIds,
          taxYearStart,
          data.payroll_run_id,
          tx
        );

        // Build the FPS payload
        const fpsPayload = this.buildFpsPayload(fpsData, ytdMap, run, taxYear, data);

        // Create the submission record
        const submission = await this.submissionRepo.createSubmission(
          ctx,
          {
            submissionType: "fps",
            taxYear,
            period: data.period ?? null,
            payrollRunId: data.payroll_run_id,
            employerPayeRef: data.employer_paye_ref ?? null,
            accountsOfficeRef: data.accounts_office_ref ?? null,
            payload: fpsPayload,
            notes: data.notes ?? null,
          },
          tx
        );

        // Create submission items (per-employee lines)
        const items = await this.submissionRepo.createSubmissionItems(
          ctx,
          submission.id,
          fpsData.map((emp) => {
            const ytd = ytdMap.get(emp.employeeId);
            const currentGross = parseFloat(emp.totalGross) || 0;
            const currentTax = parseFloat(emp.taxDeduction) || 0;
            const currentNiEmp = parseFloat(emp.niEmployee) || 0;
            const currentNiEr = parseFloat(emp.niEmployer) || 0;
            const currentSl = parseFloat(emp.studentLoan) || 0;

            return {
              employeeId: emp.employeeId,
              grossPay: String(emp.totalGross),
              taxDeducted: String(emp.taxDeduction),
              niEmployee: String(emp.niEmployee),
              niEmployer: String(emp.niEmployer),
              studentLoan: String(emp.studentLoan),
              pensionEmployee: String(emp.pensionEmployee),
              pensionEmployer: String(emp.pensionEmployer),
              netPay: String(emp.netPay),
              employeeNiNumber: emp.niNumber ?? null,
              employeeTaxCode: emp.snapshotTaxCode ?? emp.currentTaxCode ?? null,
              niCategory: emp.snapshotNiCategory ?? emp.currentNiCategory ?? null,
              taxablePayYtd: ytd
                ? (parseFloat(ytd.taxablePayYtd) + currentGross).toFixed(2)
                : currentGross.toFixed(2),
              taxDeductedYtd: ytd
                ? (parseFloat(ytd.taxDeductedYtd) + currentTax).toFixed(2)
                : currentTax.toFixed(2),
              niEmployeeYtd: ytd
                ? (parseFloat(ytd.employeeNiYtd) + currentNiEmp).toFixed(2)
                : currentNiEmp.toFixed(2),
              niEmployerYtd: ytd
                ? (parseFloat(ytd.employerNiYtd) + currentNiEr).toFixed(2)
                : currentNiEr.toFixed(2),
              studentLoanYtd: ytd
                ? (parseFloat(ytd.studentLoanYtd) + currentSl).toFixed(2)
                : currentSl.toFixed(2),
            };
          }),
          tx
        );

        // Emit domain event
        await this.emitEvent(tx, ctx, submission.id, "payroll.submission.created", {
          submissionId: submission.id,
          submissionType: "fps",
          taxYear,
          period: data.period,
          payrollRunId: data.payroll_run_id,
          employeeCount: items.length,
        });

        return {
          success: true as const,
          submission,
          items,
        };
      });

      if ("error" in result && result.error) {
        return result as ServiceResult<SubmissionDetailResponse>;
      }

      const mapped = result as { success: true; submission: SubmissionRow; items: SubmissionItemRow[] };
      return {
        success: true,
        data: {
          ...this.mapSubmissionToResponse(mapped.submission),
          items: mapped.items.map((i) => this.mapItemToResponse(i)),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create FPS submission",
          details: { originalError: String(err) },
        },
      };
    }
  }

  // ===========================================================================
  // Create EPS (Employer Payment Summary)
  // ===========================================================================

  async createEpsSubmission(
    ctx: TenantContext,
    data: CreateEpsSubmission,
    idempotencyKey?: string
  ): Promise<ServiceResult<SubmissionResponse>> {
    try {
      const taxYear = data.tax_year ?? getCurrentTaxYear();

      // If a payroll run is linked, verify it exists
      if (data.payroll_run_id) {
        const run = await this.payrollRepo.findPayrollRunById(ctx, data.payroll_run_id);
        if (!run) {
          return {
            success: false,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: "Payroll run not found",
            },
          };
        }
      }

      const result = await this.db.withTransaction(ctx, async (tx) => {
        // Check for duplicate EPS
        const existing = await this.submissionRepo.findExistingSubmission(
          ctx,
          "eps",
          taxYear,
          data.period ?? null,
          data.payroll_run_id ?? null,
          tx
        );
        if (existing) {
          return {
            success: false as const,
            error: {
              code: ErrorCodes.CONFLICT,
              message: `An EPS submission already exists for tax year ${taxYear}, period ${data.period ?? "N/A"}. Existing submission ID: ${existing.id} (status: ${existing.status})`,
            },
          };
        }

        // Build the EPS payload
        const taxYearStart = getTaxYearStartDate(taxYear);
        const periodEnd = data.payroll_run_id
          ? (await this.payrollRepo.findPayrollRunById(ctx, data.payroll_run_id))?.payPeriodEnd
          : null;
        const periodEndStr = periodEnd instanceof Date
          ? periodEnd.toISOString().split("T")[0]
          : periodEnd
            ? String(periodEnd)
            : new Date().toISOString().split("T")[0];

        const recoverable = await this.payrollRepo.getEpsRecoverableAmounts(
          ctx,
          taxYearStart,
          periodEndStr,
          tx
        );

        const epsPayload: Record<string, unknown> = {
          submission_type: "eps",
          tax_year: taxYear,
          tax_month: data.period ?? null,
          employer_paye_ref: data.employer_paye_ref ?? null,
          accounts_office_ref: data.accounts_office_ref ?? null,
          payroll_run_id: data.payroll_run_id ?? null,
          recoverable_amounts: {
            smp_recovered: String(recoverable.smpRecovered),
            spp_recovered: String(recoverable.sppRecovered),
            sap_recovered: String(recoverable.sapRecovered),
            shpp_recovered: String(recoverable.shppRecovered),
            spbp_recovered: String(recoverable.spbpRecovered),
            nic_compensation_on_smp: String(recoverable.nicCompensationOnSmp),
            nic_compensation_on_spp: String(recoverable.nicCompensationOnSpp),
            nic_compensation_on_sap: String(recoverable.nicCompensationOnSap),
            nic_compensation_on_shpp: String(recoverable.nicCompensationOnShpp),
            nic_compensation_on_spbp: String(recoverable.nicCompensationOnSpbp),
            cis_deductions_suffered: String(recoverable.cisDeductionsSuffered),
          },
          no_payment_dates: {
            from: data.no_payment_from ?? null,
            to: data.no_payment_to ?? null,
          },
          final_submission_for_year: data.final_submission_for_year ?? false,
          generated_at: new Date().toISOString(),
        };

        // Create the submission record
        const submission = await this.submissionRepo.createSubmission(
          ctx,
          {
            submissionType: "eps",
            taxYear,
            period: data.period ?? null,
            payrollRunId: data.payroll_run_id ?? null,
            employerPayeRef: data.employer_paye_ref ?? null,
            accountsOfficeRef: data.accounts_office_ref ?? null,
            payload: epsPayload,
            notes: data.notes ?? null,
          },
          tx
        );

        // Emit domain event
        await this.emitEvent(tx, ctx, submission.id, "payroll.submission.created", {
          submissionId: submission.id,
          submissionType: "eps",
          taxYear,
          period: data.period,
          payrollRunId: data.payroll_run_id,
        });

        return { success: true as const, submission };
      });

      if ("error" in result && result.error) {
        return result as ServiceResult<SubmissionResponse>;
      }

      const mapped = result as { success: true; submission: SubmissionRow };
      return {
        success: true,
        data: this.mapSubmissionToResponse(mapped.submission),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to create EPS submission",
          details: { originalError: String(err) },
        },
      };
    }
  }

  // ===========================================================================
  // List Submissions
  // ===========================================================================

  async listSubmissions(
    ctx: TenantContext,
    filters: SubmissionListQuery
  ): Promise<PaginatedServiceResult<SubmissionResponse>> {
    const result = await this.submissionRepo.listSubmissions(ctx, filters);
    return {
      items: result.items.map((r) => this.mapSubmissionToResponse(r)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Get Submission Detail
  // ===========================================================================

  async getSubmissionDetail(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<SubmissionDetailResponse>> {
    const submission = await this.submissionRepo.findSubmissionById(ctx, id);
    if (!submission) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Payroll submission not found",
        },
      };
    }

    const items = await this.submissionRepo.findSubmissionItems(ctx, id);

    return {
      success: true,
      data: {
        ...this.mapSubmissionToResponse(submission),
        items: items.map((i) => this.mapItemToResponse(i)),
      },
    };
  }

  // ===========================================================================
  // Validate Submission
  // ===========================================================================

  async validateSubmission(
    ctx: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<SubmissionValidationResponse>> {
    try {
      const submission = await this.submissionRepo.findSubmissionById(ctx, id);
      if (!submission) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Payroll submission not found",
          },
        };
      }

      // Only draft submissions can be validated
      if (!this.canTransitionTo(submission.status as PayrollSubmissionStatus, "validated") && submission.status !== "draft") {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot validate a submission in "${submission.status}" status. Only draft submissions can be validated.`,
          },
        };
      }

      const errors: string[] = [];

      // Run validation rules based on submission type
      if (submission.submissionType === "fps") {
        const items = await this.submissionRepo.findSubmissionItems(ctx, id);
        errors.push(...this.validateFpsData(submission, items));
      } else if (submission.submissionType === "eps") {
        errors.push(...this.validateEpsData(submission));
      }

      const isValid = errors.length === 0;
      const now = new Date();

      await this.db.withTransaction(ctx, async (tx) => {
        const newStatus: PayrollSubmissionStatus = isValid ? "validated" : "draft";
        const updated = await this.submissionRepo.updateSubmissionStatus(
          ctx,
          id,
          newStatus,
          tx,
          {
            validationErrors: errors.length > 0 ? errors : null,
            validatedAt: isValid ? now : undefined,
            validatedBy: isValid ? ctx.userId : undefined,
          }
        );

        if (isValid) {
          await this.emitEvent(tx, ctx, id, "payroll.submission.validated", {
            submissionId: id,
            submissionType: submission.submissionType,
            taxYear: submission.taxYear,
          });
        }

        return updated;
      });

      return {
        success: true,
        data: {
          id,
          status: isValid ? "validated" : "draft",
          is_valid: isValid,
          errors,
          validated_at: isValid ? now.toISOString() : new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to validate submission",
          details: { originalError: String(err) },
        },
      };
    }
  }

  // ===========================================================================
  // Submit to HMRC (Queue for Processing)
  // ===========================================================================

  async submitToHmrc(
    ctx: TenantContext,
    id: string,
    idempotencyKey?: string
  ): Promise<ServiceResult<SubmissionResponse>> {
    try {
      const submission = await this.submissionRepo.findSubmissionById(ctx, id);
      if (!submission) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Payroll submission not found",
          },
        };
      }

      // Only validated submissions can be submitted
      if (!this.canTransitionTo(submission.status as PayrollSubmissionStatus, "submitted")) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot submit a submission in "${submission.status}" status. Only validated submissions can be submitted to HMRC.`,
          },
        };
      }

      const now = new Date();
      const result = await this.db.withTransaction(ctx, async (tx) => {
        const updated = await this.submissionRepo.updateSubmissionStatus(
          ctx,
          id,
          "submitted",
          tx,
          {
            submittedAt: now,
            submittedBy: ctx.userId,
          }
        );

        // Emit domain event -- a worker will pick this up and send to HMRC
        await this.emitEvent(tx, ctx, id, "payroll.submission.submitted", {
          submissionId: id,
          submissionType: submission.submissionType,
          taxYear: submission.taxYear,
          period: submission.period,
          employerPayeRef: submission.employerPayeRef,
        });

        return updated;
      });

      if (!result) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "Submission not found during update",
          },
        };
      }

      return {
        success: true,
        data: this.mapSubmissionToResponse(result),
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: "Failed to submit to HMRC",
          details: { originalError: String(err) },
        },
      };
    }
  }

  // ===========================================================================
  // State Machine Helpers
  // ===========================================================================

  private canTransitionTo(
    currentStatus: PayrollSubmissionStatus,
    targetStatus: PayrollSubmissionStatus
  ): boolean {
    const allowed = SUBMISSION_STATUS_TRANSITIONS[currentStatus] ?? [];
    return allowed.includes(targetStatus);
  }

  // ===========================================================================
  // FPS Validation Rules
  // ===========================================================================

  private validateFpsData(
    submission: SubmissionRow,
    items: SubmissionItemRow[]
  ): string[] {
    const errors: string[] = [];

    // Must have at least one employee item
    if (items.length === 0) {
      errors.push("FPS submission must contain at least one employee record");
    }

    // Employer PAYE reference is required for FPS
    if (!submission.employerPayeRef) {
      errors.push("Employer PAYE reference is required for FPS submission");
    }

    // Tax year must be set
    if (!submission.taxYear) {
      errors.push("Tax year is required for FPS submission");
    }

    // Validate each employee item
    for (const item of items) {
      // NI number is required for FPS (HMRC requirement)
      if (!item.employeeNiNumber) {
        errors.push(
          `Employee ${item.employeeId}: National Insurance number is required for FPS`
        );
      } else {
        // Validate NI number format
        const niPattern = /^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$/;
        if (!niPattern.test(item.employeeNiNumber)) {
          errors.push(
            `Employee ${item.employeeId}: Invalid NI number format "${item.employeeNiNumber}"`
          );
        }
      }

      // Tax code is required for FPS
      if (!item.employeeTaxCode) {
        errors.push(
          `Employee ${item.employeeId}: PAYE tax code is required for FPS`
        );
      }

      // Gross pay should be non-negative
      if (parseFloat(item.grossPay) < 0) {
        errors.push(
          `Employee ${item.employeeId}: Gross pay cannot be negative`
        );
      }

      // Net pay should be non-negative
      if (parseFloat(item.netPay) < 0) {
        errors.push(
          `Employee ${item.employeeId}: Net pay cannot be negative`
        );
      }
    }

    return errors;
  }

  // ===========================================================================
  // EPS Validation Rules
  // ===========================================================================

  private validateEpsData(submission: SubmissionRow): string[] {
    const errors: string[] = [];

    // Employer PAYE reference is required for EPS
    if (!submission.employerPayeRef) {
      errors.push("Employer PAYE reference is required for EPS submission");
    }

    // Accounts office reference is required for EPS
    if (!submission.accountsOfficeRef) {
      errors.push("Accounts Office Reference is required for EPS submission");
    }

    // Tax year must be set
    if (!submission.taxYear) {
      errors.push("Tax year is required for EPS submission");
    }

    return errors;
  }

  // ===========================================================================
  // FPS Payload Builder
  // ===========================================================================

  private buildFpsPayload(
    employees: FpsEmployeeDataRow[],
    ytdMap: Map<string, YtdTotalsRow>,
    run: { payPeriodStart: Date; payPeriodEnd: Date; payDate: Date; id: string },
    taxYear: string,
    data: CreateFpsSubmission
  ): Record<string, unknown> {
    const employeeRecords = employees.map((emp) => {
      const ytd = ytdMap.get(emp.employeeId);
      const currentGross = parseFloat(emp.totalGross) || 0;
      const currentTax = parseFloat(emp.taxDeduction) || 0;
      const currentNiEmp = parseFloat(emp.niEmployee) || 0;
      const currentNiEr = parseFloat(emp.niEmployer) || 0;
      const currentSl = parseFloat(emp.studentLoan) || 0;

      return {
        employee_id: emp.employeeId,
        employee_number: emp.employeeNumber,
        first_name: emp.firstName,
        last_name: emp.lastName,
        date_of_birth: emp.dateOfBirth
          ? emp.dateOfBirth instanceof Date
            ? emp.dateOfBirth.toISOString().split("T")[0]
            : String(emp.dateOfBirth)
          : null,
        gender: emp.gender,
        ni_number: emp.niNumber,
        tax_code: emp.snapshotTaxCode ?? emp.currentTaxCode,
        ni_category: emp.snapshotNiCategory ?? emp.currentNiCategory,
        hire_date: emp.hireDate instanceof Date
          ? emp.hireDate.toISOString().split("T")[0]
          : String(emp.hireDate),
        taxable_pay_in_period: String(emp.totalGross),
        tax_deducted_in_period: String(emp.taxDeduction),
        ni_contributions: {
          ni_category: emp.snapshotNiCategory ?? emp.currentNiCategory,
          gross_earnings_for_ni: String(emp.totalGross),
          employee_ni_contribution: String(emp.niEmployee),
          employer_ni_contribution: String(emp.niEmployer),
        },
        student_loan_plan: emp.studentLoanPlan,
        student_loan_deduction: String(emp.studentLoan),
        pension_employee_contribution: String(emp.pensionEmployee),
        pension_employer_contribution: String(emp.pensionEmployer),
        basic_pay: String(emp.basicPay),
        overtime_pay: String(emp.overtimePay),
        bonus_pay: String(emp.bonusPay),
        total_gross_pay: String(emp.totalGross),
        total_deductions: String(emp.totalDeductions),
        net_pay: String(emp.netPay),
        payment_method: emp.paymentMethod,
        taxable_pay_ytd: ytd
          ? (parseFloat(ytd.taxablePayYtd) + currentGross).toFixed(2)
          : currentGross.toFixed(2),
        tax_deducted_ytd: ytd
          ? (parseFloat(ytd.taxDeductedYtd) + currentTax).toFixed(2)
          : currentTax.toFixed(2),
        employee_ni_ytd: ytd
          ? (parseFloat(ytd.employeeNiYtd) + currentNiEmp).toFixed(2)
          : currentNiEmp.toFixed(2),
        employer_ni_ytd: ytd
          ? (parseFloat(ytd.employerNiYtd) + currentNiEr).toFixed(2)
          : currentNiEr.toFixed(2),
        student_loan_ytd: ytd
          ? (parseFloat(ytd.studentLoanYtd) + currentSl).toFixed(2)
          : currentSl.toFixed(2),
      };
    });

    // Compute totals
    const totals = {
      total_taxable_pay: employees.reduce((s, e) => s + (parseFloat(e.totalGross) || 0), 0).toFixed(2),
      total_tax_deducted: employees.reduce((s, e) => s + (parseFloat(e.taxDeduction) || 0), 0).toFixed(2),
      total_employee_ni: employees.reduce((s, e) => s + (parseFloat(e.niEmployee) || 0), 0).toFixed(2),
      total_employer_ni: employees.reduce((s, e) => s + (parseFloat(e.niEmployer) || 0), 0).toFixed(2),
      total_student_loan_deductions: employees.reduce((s, e) => s + (parseFloat(e.studentLoan) || 0), 0).toFixed(2),
      total_pension_employee: employees.reduce((s, e) => s + (parseFloat(e.pensionEmployee) || 0), 0).toFixed(2),
      total_pension_employer: employees.reduce((s, e) => s + (parseFloat(e.pensionEmployer) || 0), 0).toFixed(2),
      total_gross_pay: employees.reduce((s, e) => s + (parseFloat(e.totalGross) || 0), 0).toFixed(2),
      total_net_pay: employees.reduce((s, e) => s + (parseFloat(e.netPay) || 0), 0).toFixed(2),
    };

    const formatDate = (d: Date | string) =>
      d instanceof Date ? d.toISOString().split("T")[0] : String(d);

    return {
      submission_type: "fps",
      tax_year: taxYear,
      period: data.period ?? null,
      employer_paye_ref: data.employer_paye_ref ?? null,
      accounts_office_ref: data.accounts_office_ref ?? null,
      payroll_run_id: data.payroll_run_id,
      pay_period_start: formatDate(run.payPeriodStart),
      pay_period_end: formatDate(run.payPeriodEnd),
      pay_date: formatDate(run.payDate),
      employee_count: employees.length,
      employees: employeeRecords,
      totals,
      generated_at: new Date().toISOString(),
    };
  }
}
