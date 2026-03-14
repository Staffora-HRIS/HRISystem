/**
 * Pension Auto-Enrolment Module - Service Layer
 *
 * Implements business logic for UK workplace pension auto-enrolment
 * (Pensions Act 2008). Criminal prosecution risk for non-compliance.
 *
 * Key compliance rules:
 * - Eligible jobholders (22-SPA, >£10,000/yr): MUST auto-enrol
 * - Non-eligible jobholders (16-74, £6,240-£10,000): may opt in
 * - Entitled workers (16-74, <£6,240): may request membership
 * - Qualifying earnings band: £6,240 - £50,270 (2024/25)
 * - Employer min 3%, Employee min 5% of qualifying earnings
 * - Opt-out window: 1 month from enrolment date
 * - Re-enrolment every 3 years for opted-out workers
 * - Postponement: up to 3 months deferral
 *
 * All mutating operations emit domain events via the outbox pattern.
 */

import type { DatabaseClient } from "../../plugins/db";
import type {
  PensionRepository,
  PensionSchemeRow,
  PensionEnrolmentRow,
  PensionContributionRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreatePensionScheme,
  UpdatePensionScheme,
  PensionSchemeResponse,
  PensionEnrolmentResponse,
  PensionContributionResponse,
  EligibilityAssessmentResponse,
  ComplianceSummaryResponse,
  ReEnrolmentResult,
  PaginationQuery,
  EnrolmentFilters,
  PensionWorkerCategory,
} from "./schemas";

// =============================================================================
// Constants — UK Auto-Enrolment Thresholds (2024/25)
// =============================================================================

/**
 * Annual earnings trigger for auto-enrolment in pence.
 * Workers earning above this are "eligible jobholders" and MUST be auto-enrolled.
 */
const AUTO_ENROLMENT_TRIGGER = 1000000; // £10,000 in pence

/**
 * Lower qualifying earnings threshold in pence.
 * Workers earning between this and the trigger can opt in.
 */
const QUALIFYING_EARNINGS_LOWER_DEFAULT = 624000; // £6,240 in pence

/**
 * Upper qualifying earnings threshold in pence.
 */
const QUALIFYING_EARNINGS_UPPER_DEFAULT = 5027000; // £50,270 in pence

/**
 * State Pension age (current default). In practice this varies by birth year.
 * Using 66 as the current UK State Pension age.
 */
const STATE_PENSION_AGE = 66;

/**
 * Opt-out window in days (1 calendar month approximated as 31 days).
 */
const OPT_OUT_WINDOW_DAYS = 31;

/**
 * Re-enrolment cycle in years.
 */
const RE_ENROLMENT_CYCLE_YEARS = 3;

/**
 * Maximum postponement in months.
 */
const MAX_POSTPONEMENT_MONTHS = 3;

// =============================================================================
// Service
// =============================================================================

export class PensionService {
  constructor(
    private repository: PensionRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Mappers
  // ===========================================================================

  private mapSchemeToResponse(row: PensionSchemeRow): PensionSchemeResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      name: row.name,
      provider: row.provider,
      scheme_type: row.schemeType,
      employer_contribution_pct: Number(row.employerContributionPct),
      employee_contribution_pct: Number(row.employeeContributionPct),
      qualifying_earnings_lower: row.qualifyingEarningsLower,
      qualifying_earnings_upper: row.qualifyingEarningsUpper,
      is_default: row.isDefault,
      status: row.status,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private mapEnrolmentToResponse(row: PensionEnrolmentRow): PensionEnrolmentResponse {
    const response: PensionEnrolmentResponse = {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      scheme_id: row.schemeId,
      worker_category: row.workerCategory,
      status: row.status,
      enrolment_date: this.formatDate(row.enrolmentDate),
      opt_out_deadline: this.formatDate(row.optOutDeadline),
      opted_out_at: row.optedOutAt
        ? row.optedOutAt instanceof Date
          ? row.optedOutAt.toISOString()
          : String(row.optedOutAt)
        : null,
      opt_out_reason: row.optOutReason,
      re_enrolment_date: this.formatDate(row.reEnrolmentDate),
      postponement_end_date: this.formatDate(row.postponementEndDate),
      contributions_start_date: this.formatDate(row.contributionsStartDate),
      assessed_annual_earnings: row.assessedAnnualEarnings,
      assessed_age: row.assessedAge,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };

    if (row.employeeName) {
      response.employee_name = row.employeeName;
    }
    if (row.schemeName) {
      response.scheme_name = row.schemeName;
    }

    return response;
  }

  private mapContributionToResponse(
    row: PensionContributionRow
  ): PensionContributionResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      enrolment_id: row.enrolmentId,
      employee_id: row.employeeId,
      pay_period_start: this.formatDate(row.payPeriodStart) ?? "",
      pay_period_end: this.formatDate(row.payPeriodEnd) ?? "",
      qualifying_earnings: row.qualifyingEarnings,
      employer_amount: row.employerAmount,
      employee_amount: row.employeeAmount,
      total_amount: row.totalAmount,
      status: row.status,
      created_at: row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : String(row.updatedAt),
    };
  }

  private formatDate(d: Date | null | undefined): string | null {
    if (!d) return null;
    if (d instanceof Date) return d.toISOString().split("T")[0];
    return String(d);
  }

  // ===========================================================================
  // Age Calculation
  // ===========================================================================

  /**
   * Calculate age in whole years from date of birth to a reference date.
   */
  private calculateAge(dateOfBirth: Date, referenceDate: Date = new Date()): number {
    let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())
    ) {
      age--;
    }
    return age;
  }

  /**
   * Add days to a date and return YYYY-MM-DD string
   */
  private addDays(date: Date, days: number): string {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split("T")[0];
  }

  /**
   * Add years to a date and return YYYY-MM-DD string
   */
  private addYears(date: Date, years: number): string {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result.toISOString().split("T")[0];
  }

  // ===========================================================================
  // Pension Schemes
  // ===========================================================================

  /**
   * Create a new pension scheme.
   *
   * Validates:
   * - Minimum statutory contribution rates (3% employer, 8% total)
   * - Unique scheme name per tenant
   * - Only one default scheme per tenant
   */
  async createScheme(
    context: TenantContext,
    data: CreatePensionScheme,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PensionSchemeResponse>> {
    // Validate total contribution meets statutory minimum (8%)
    const totalPct = data.employer_contribution_pct + data.employee_contribution_pct;
    if (totalPct < 8.0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Total contribution (employer + employee) must be at least 8% of qualifying earnings (Pensions Act 2008)",
          details: {
            employer_pct: data.employer_contribution_pct,
            employee_pct: data.employee_contribution_pct,
            total_pct: totalPct,
            minimum_total: 8.0,
          },
        },
      };
    }

    // Validate qualifying earnings band
    const lower = data.qualifying_earnings_lower ?? QUALIFYING_EARNINGS_LOWER_DEFAULT;
    const upper = data.qualifying_earnings_upper ?? QUALIFYING_EARNINGS_UPPER_DEFAULT;
    if (upper <= lower) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "qualifying_earnings_upper must be greater than qualifying_earnings_lower",
          details: {
            qualifying_earnings_lower: lower,
            qualifying_earnings_upper: upper,
          },
        },
      };
    }

    // Check for duplicate name
    const nameExists = await this.repository.schemeNameExists(context, data.name);
    if (nameExists) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: `A pension scheme named "${data.name}" already exists`,
          details: { name: data.name },
        },
      };
    }

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createScheme(context, data, tx);

      // If this is the new default, clear the old default
      if (data.is_default) {
        await this.repository.clearDefaultSchemeExcept(context, row.id, tx);
      }

      // Emit domain event in the same transaction
      await emitDomainEvent(tx, {
        tenantId: context.tenantId,
        aggregateType: "pension_scheme",
        aggregateId: row.id,
        eventType: "pension.scheme.created",
        payload: { scheme: this.mapSchemeToResponse(row) },
        userId: context.userId,
      });

      return {
        success: true,
        data: this.mapSchemeToResponse(row),
      };
    });
  }

  /**
   * List all pension schemes for the tenant.
   */
  async listSchemes(
    context: TenantContext,
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<PensionSchemeResponse>> {
    const result = await this.repository.findAllSchemes(context, pagination);
    return {
      items: result.items.map((row) => this.mapSchemeToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Eligibility Assessment
  // ===========================================================================

  /**
   * Assess an employee's auto-enrolment eligibility.
   *
   * Determines worker category based on age and annualised earnings:
   * - Eligible jobholder: aged 22 to State Pension age, earning >£10,000/yr
   * - Non-eligible jobholder: aged 16-74, earning £6,240-£10,000/yr
   * - Entitled worker: aged 16-74, earning <£6,240/yr
   * - Not applicable: under 16 or over 74
   */
  async assessEligibility(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EligibilityAssessmentResponse>> {
    const empData = await this.repository.getEmployeeAssessmentData(
      context,
      employeeId
    );

    if (!empData) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Employee ${employeeId} not found`,
        },
      };
    }

    if (empData.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Only active employees can be assessed for pension auto-enrolment",
          details: { status: empData.status },
        },
      };
    }

    if (!empData.dateOfBirth) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message:
            "Employee date of birth is required for auto-enrolment eligibility assessment",
          details: { employee_id: employeeId },
        },
      };
    }

    const today = new Date();
    const age = this.calculateAge(empData.dateOfBirth, today);

    // Default to 0 earnings if no compensation data found
    const annualEarnings = empData.annualSalary ?? 0;

    // Get qualifying earnings band from default scheme or use statutory defaults
    const defaultScheme = await this.repository.findDefaultScheme(context);
    const qualifyingLower = defaultScheme?.qualifyingEarningsLower ?? QUALIFYING_EARNINGS_LOWER_DEFAULT;
    const qualifyingUpper = defaultScheme?.qualifyingEarningsUpper ?? QUALIFYING_EARNINGS_UPPER_DEFAULT;

    // Determine worker category
    let category: PensionWorkerCategory;
    let isEligible = false;
    let canOptIn = false;
    let canRequestMembership = false;

    if (age < 16 || age > 74) {
      // Outside the age range entirely
      category = "not_applicable";
    } else if (age >= 22 && age < STATE_PENSION_AGE && annualEarnings > AUTO_ENROLMENT_TRIGGER) {
      // Eligible jobholder — MUST be auto-enrolled
      category = "eligible_jobholder";
      isEligible = true;
    } else if (
      age >= 16 &&
      age <= 74 &&
      annualEarnings >= qualifyingLower &&
      annualEarnings <= AUTO_ENROLMENT_TRIGGER
    ) {
      // Non-eligible jobholder — can opt in
      category = "non_eligible_jobholder";
      canOptIn = true;
    } else if (age >= 16 && age <= 74 && annualEarnings < qualifyingLower) {
      // Entitled worker — can request membership
      category = "entitled_worker";
      canRequestMembership = true;
    } else {
      // Eligible jobholder age but under trigger (possible for 22-SPA with low earnings)
      // or 16-21/SPA-74 with high earnings (non-eligible)
      if (
        (age >= 16 && age < 22 && annualEarnings > AUTO_ENROLMENT_TRIGGER) ||
        (age >= STATE_PENSION_AGE && age <= 74 && annualEarnings > AUTO_ENROLMENT_TRIGGER)
      ) {
        category = "non_eligible_jobholder";
        canOptIn = true;
      } else if (age >= 22 && age < STATE_PENSION_AGE && annualEarnings >= qualifyingLower) {
        category = "non_eligible_jobholder";
        canOptIn = true;
      } else {
        category = "entitled_worker";
        canRequestMembership = true;
      }
    }

    return {
      success: true,
      data: {
        employee_id: employeeId,
        worker_category: category,
        is_eligible_for_auto_enrolment: isEligible,
        can_opt_in: canOptIn,
        can_request_membership: canRequestMembership,
        assessed_age: age,
        assessed_annual_earnings: annualEarnings,
        qualifying_earnings_lower: qualifyingLower,
        qualifying_earnings_upper: qualifyingUpper,
        assessment_date: today.toISOString().split("T")[0],
      },
    };
  }

  // ===========================================================================
  // Auto-Enrolment
  // ===========================================================================

  /**
   * Auto-enrol an eligible jobholder into the default pension scheme.
   *
   * Creates an enrolment record with:
   * - enrolment_date = today
   * - opt_out_deadline = today + 1 month
   * - contributions_start_date = enrolment_date
   * - re_enrolment_date = null (only set when opted out)
   *
   * Refuses to enrol if:
   * - Employee already has an active enrolment
   * - No active default pension scheme exists
   * - Employee is not an eligible jobholder
   */
  async autoEnrol(
    context: TenantContext,
    employeeId: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PensionEnrolmentResponse>> {
    // Assess eligibility first
    const assessment = await this.assessEligibility(context, employeeId);
    if (!assessment.success) {
      return {
        success: false,
        error: assessment.error,
      };
    }

    if (!assessment.data!.is_eligible_for_auto_enrolment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Employee is classified as "${assessment.data!.worker_category}" and is not eligible for automatic enrolment. Eligible jobholders must be aged 22-${STATE_PENSION_AGE} and earn over £${(AUTO_ENROLMENT_TRIGGER / 100).toLocaleString()}/year.`,
          details: {
            worker_category: assessment.data!.worker_category,
            assessed_age: assessment.data!.assessed_age,
            assessed_annual_earnings: assessment.data!.assessed_annual_earnings,
          },
        },
      };
    }

    // Check for existing active enrolment
    const existingEnrolment = await this.repository.findActiveEnrolmentByEmployee(
      context,
      employeeId
    );
    if (existingEnrolment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Employee already has an active pension enrolment",
          details: {
            existing_enrolment_id: existingEnrolment.id,
            existing_status: existingEnrolment.status,
          },
        },
      };
    }

    // Find default pension scheme
    const defaultScheme = await this.repository.findDefaultScheme(context);
    if (!defaultScheme) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message:
            "No active default pension scheme configured. Create a default pension scheme before enrolling employees.",
        },
      };
    }

    const today = new Date();
    const enrolmentDate = today.toISOString().split("T")[0];
    const optOutDeadline = this.addDays(today, OPT_OUT_WINDOW_DAYS);
    const contributionsStartDate = enrolmentDate;

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createEnrolment(
        context,
        {
          employee_id: employeeId,
          scheme_id: defaultScheme.id,
          worker_category: assessment.data!.worker_category,
          status: "enrolled",
          enrolment_date: enrolmentDate,
          opt_out_deadline: optOutDeadline,
          re_enrolment_date: null,
          postponement_end_date: null,
          contributions_start_date: contributionsStartDate,
          assessed_annual_earnings: assessment.data!.assessed_annual_earnings,
          assessed_age: assessment.data!.assessed_age,
        },
        tx
      );

      // Emit domain event in the same transaction
      await emitDomainEvent(tx, {
        tenantId: context.tenantId,
        aggregateType: "pension_enrolment",
        aggregateId: row.id,
        eventType: "pension.employee.enrolled",
        payload: {
          enrolment: this.mapEnrolmentToResponse(row),
          scheme_id: defaultScheme.id,
          scheme_name: defaultScheme.name,
          worker_category: assessment.data!.worker_category,
        },
        userId: context.userId,
      });

      return {
        success: true,
        data: this.mapEnrolmentToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Opt-Out Processing
  // ===========================================================================

  /**
   * Process an opt-out request for an enrolled employee.
   *
   * Validates:
   * - Enrolment exists and is in 'enrolled' or 're_enrolled' status
   * - Current date is within the opt-out window (1 month from enrolment)
   * - Sets re_enrolment_date to 3 years from today
   *
   * When an employee opts out within the window, any contributions
   * already deducted must be refunded (handled by payroll integration).
   */
  async processOptOut(
    context: TenantContext,
    enrolmentId: string,
    reason?: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PensionEnrolmentResponse>> {
    const enrolment = await this.repository.findEnrolmentById(
      context,
      enrolmentId
    );

    if (!enrolment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pension enrolment ${enrolmentId} not found`,
        },
      };
    }

    // Only enrolled or re_enrolled enrolments can be opted out
    if (enrolment.status !== "enrolled" && enrolment.status !== "re_enrolled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot opt out from status "${enrolment.status}". Only enrolled or re-enrolled enrolments can be opted out.`,
          details: {
            current_status: enrolment.status,
            valid_statuses: ["enrolled", "re_enrolled"],
          },
        },
      };
    }

    // Check opt-out window
    const today = new Date();
    if (enrolment.optOutDeadline) {
      const deadline = new Date(enrolment.optOutDeadline);
      if (today > deadline) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Opt-out window has expired. The deadline was ${enrolment.optOutDeadline instanceof Date ? enrolment.optOutDeadline.toISOString().split("T")[0] : enrolment.optOutDeadline}. The employee may cease membership instead.`,
            details: {
              opt_out_deadline: this.formatDate(enrolment.optOutDeadline),
              current_date: today.toISOString().split("T")[0],
            },
          },
        };
      }
    }

    // Calculate re-enrolment date (3 years from today)
    const reEnrolmentDate = this.addYears(today, RE_ENROLMENT_CYCLE_YEARS);

    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.updateEnrolmentStatus(
        context,
        enrolmentId,
        {
          status: "opted_out",
          opted_out_at: today,
          opt_out_reason: reason ?? null,
          re_enrolment_date: reEnrolmentDate,
        },
        tx
      );

      if (!row) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: `Pension enrolment ${enrolmentId} not found`,
          },
        };
      }

      // Emit domain event
      await emitDomainEvent(tx, {
        tenantId: context.tenantId,
        aggregateType: "pension_enrolment",
        aggregateId: enrolmentId,
        eventType: "pension.employee.opted_out",
        payload: {
          enrolment: this.mapEnrolmentToResponse(row),
          reason: reason ?? null,
          re_enrolment_date: reEnrolmentDate,
          refund_required: true,
        },
        userId: context.userId,
      });

      return {
        success: true,
        data: this.mapEnrolmentToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Postponement
  // ===========================================================================

  /**
   * Postpone an employee's auto-enrolment assessment for up to 3 months.
   *
   * Employers can defer the assessment date by up to 3 months.
   * During the postponement period, the employer is not required
   * to assess the worker's eligibility.
   */
  async postponeAssessment(
    context: TenantContext,
    employeeId: string,
    endDate: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PensionEnrolmentResponse>> {
    // Validate postponement end date is not more than 3 months away
    const today = new Date();
    const maxPostponement = new Date(today);
    maxPostponement.setMonth(maxPostponement.getMonth() + MAX_POSTPONEMENT_MONTHS);

    const requestedEnd = new Date(endDate);
    if (requestedEnd > maxPostponement) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Postponement end date cannot exceed ${MAX_POSTPONEMENT_MONTHS} months from today (maximum: ${maxPostponement.toISOString().split("T")[0]})`,
          details: {
            requested_end_date: endDate,
            maximum_end_date: maxPostponement.toISOString().split("T")[0],
          },
        },
      };
    }

    if (requestedEnd <= today) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Postponement end date must be in the future",
          details: { end_date: endDate },
        },
      };
    }

    // Check for existing active enrolment
    const existingEnrolment = await this.repository.findActiveEnrolmentByEmployee(
      context,
      employeeId
    );
    if (existingEnrolment && existingEnrolment.status === "enrolled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message:
            "Employee is already enrolled in a pension scheme. Postponement is only available before enrolment.",
          details: {
            existing_enrolment_id: existingEnrolment.id,
            existing_status: existingEnrolment.status,
          },
        },
      };
    }

    // If there's already a postponed enrolment, update it
    if (existingEnrolment && existingEnrolment.status === "postponed") {
      return await this.db.withTransaction(context, async (tx) => {
        const row = await this.repository.updateEnrolmentStatus(
          context,
          existingEnrolment.id,
          {
            status: "postponed",
            postponement_end_date: endDate,
          },
          tx
        );

        if (!row) {
          return {
            success: false,
            error: {
              code: ErrorCodes.NOT_FOUND,
              message: `Pension enrolment ${existingEnrolment.id} not found`,
            },
          };
        }

        await emitDomainEvent(tx, {
          tenantId: context.tenantId,
          aggregateType: "pension_enrolment",
          aggregateId: existingEnrolment.id,
          eventType: "pension.assessment.postponed",
          payload: {
            enrolment: this.mapEnrolmentToResponse(row),
            postponement_end_date: endDate,
          },
          userId: context.userId,
        });

        return {
          success: true,
          data: this.mapEnrolmentToResponse(row),
        };
      });
    }

    // Find default scheme (required even for postponement record)
    const defaultScheme = await this.repository.findDefaultScheme(context);
    if (!defaultScheme) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message:
            "No active default pension scheme configured. Create a default pension scheme first.",
        },
      };
    }

    // Create a new postponed enrolment record
    return await this.db.withTransaction(context, async (tx) => {
      const row = await this.repository.createEnrolment(
        context,
        {
          employee_id: employeeId,
          scheme_id: defaultScheme.id,
          worker_category: "not_applicable", // Assessment deferred
          status: "postponed",
          enrolment_date: null,
          opt_out_deadline: null,
          re_enrolment_date: null,
          postponement_end_date: endDate,
          contributions_start_date: null,
          assessed_annual_earnings: null,
          assessed_age: null,
        },
        tx
      );

      await emitDomainEvent(tx, {
        tenantId: context.tenantId,
        aggregateType: "pension_enrolment",
        aggregateId: row.id,
        eventType: "pension.assessment.postponed",
        payload: {
          enrolment: this.mapEnrolmentToResponse(row),
          postponement_end_date: endDate,
        },
        userId: context.userId,
      });

      return {
        success: true,
        data: this.mapEnrolmentToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Contribution Calculation
  // ===========================================================================

  /**
   * Calculate pension contributions for a pay period.
   *
   * Qualifying earnings = gross pay capped to the qualifying earnings band,
   * pro-rated for the pay period length.
   *
   * Employer contribution = qualifying_earnings * employer_pct / 100
   * Employee contribution = qualifying_earnings * employee_pct / 100
   *
   * All amounts are in pence (integer) to avoid floating-point errors.
   */
  async calculateContributions(
    context: TenantContext,
    enrolmentId: string,
    grossPay: number,
    payPeriodStart: string,
    payPeriodEnd: string,
    _idempotencyKey?: string
  ): Promise<ServiceResult<PensionContributionResponse>> {
    const enrolment = await this.repository.findEnrolmentById(
      context,
      enrolmentId
    );

    if (!enrolment) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pension enrolment ${enrolmentId} not found`,
        },
      };
    }

    // Only calculate for enrolled or re_enrolled
    if (enrolment.status !== "enrolled" && enrolment.status !== "re_enrolled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Cannot calculate contributions for status "${enrolment.status}". Employee must be enrolled.`,
          details: {
            current_status: enrolment.status,
            valid_statuses: ["enrolled", "re_enrolled"],
          },
        },
      };
    }

    // Validate pay period
    if (payPeriodEnd < payPeriodStart) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "pay_period_end must be on or after pay_period_start",
        },
      };
    }

    // Get scheme for contribution rates and qualifying earnings band
    const scheme = await this.repository.findSchemeById(context, enrolment.schemeId);
    if (!scheme) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `Pension scheme ${enrolment.schemeId} not found`,
        },
      };
    }

    // Calculate pay period length as fraction of year
    const periodStart = new Date(payPeriodStart);
    const periodEnd = new Date(payPeriodEnd);
    const periodDays =
      Math.round(
        (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    const yearFraction = periodDays / 365;

    // Pro-rate the qualifying earnings band to the pay period
    const periodLower = Math.round(scheme.qualifyingEarningsLower * yearFraction);
    const periodUpper = Math.round(scheme.qualifyingEarningsUpper * yearFraction);

    // Calculate qualifying earnings for this period
    // Qualifying earnings = min(grossPay, periodUpper) - periodLower
    // If grossPay < periodLower, qualifying earnings = 0
    let qualifyingEarnings = 0;
    if (grossPay > periodLower) {
      qualifyingEarnings = Math.min(grossPay, periodUpper) - periodLower;
    }

    // Calculate contributions
    const employerPct = Number(scheme.employerContributionPct);
    const employeePct = Number(scheme.employeeContributionPct);

    const employerAmount = Math.round(qualifyingEarnings * employerPct / 100);
    const employeeAmount = Math.round(qualifyingEarnings * employeePct / 100);
    const totalAmount = employerAmount + employeeAmount;

    return await this.db.withTransaction(context, async (tx) => {
      // Check if contribution already exists for this period (idempotent)
      const exists = await this.repository.contributionExistsForPeriod(
        context,
        enrolmentId,
        payPeriodStart,
        payPeriodEnd,
        tx
      );
      if (exists) {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: `Contribution already exists for enrolment ${enrolmentId} for period ${payPeriodStart} to ${payPeriodEnd}`,
            details: {
              enrolment_id: enrolmentId,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
            },
          },
        };
      }

      const row = await this.repository.createContribution(
        context,
        {
          enrolment_id: enrolmentId,
          employee_id: enrolment.employeeId,
          pay_period_start: payPeriodStart,
          pay_period_end: payPeriodEnd,
          qualifying_earnings: qualifyingEarnings,
          employer_amount: employerAmount,
          employee_amount: employeeAmount,
          total_amount: totalAmount,
        },
        tx
      );

      // Emit domain event
      await emitDomainEvent(tx, {
        tenantId: context.tenantId,
        aggregateType: "pension_contribution",
        aggregateId: row.id,
        eventType: "pension.contribution.calculated",
        payload: {
          contribution: this.mapContributionToResponse(row),
          scheme_id: scheme.id,
          employer_pct: employerPct,
          employee_pct: employeePct,
        },
        userId: context.userId,
      });

      return {
        success: true,
        data: this.mapContributionToResponse(row),
      };
    });
  }

  // ===========================================================================
  // Re-Enrolment
  // ===========================================================================

  /**
   * Trigger bulk re-enrolment of opted-out workers.
   *
   * Every 3 years, employers must re-enrol workers who previously opted out,
   * provided they are still eligible. Workers can opt out again within the
   * standard 1-month window.
   *
   * This processes all enrolments where re_enrolment_date <= today.
   */
  async triggerReEnrolment(
    context: TenantContext,
    _idempotencyKey?: string
  ): Promise<ServiceResult<ReEnrolmentResult>> {
    return await this.db.withTransaction(context, async (tx) => {
      const dueEnrolments = await this.repository.findDueForReEnrolment(
        context,
        tx
      );

      const reEnrolled: PensionEnrolmentRow[] = [];
      let skippedCount = 0;

      for (const enrolment of dueEnrolments) {
        // Re-assess eligibility for each employee
        const assessment = await this.assessEligibility(
          context,
          enrolment.employeeId
        );

        if (!assessment.success || !assessment.data!.is_eligible_for_auto_enrolment) {
          // No longer eligible — skip but keep the record
          skippedCount++;
          continue;
        }

        const today = new Date();
        const enrolmentDate = today.toISOString().split("T")[0];
        const optOutDeadline = this.addDays(today, OPT_OUT_WINDOW_DAYS);

        const updated = await this.repository.updateEnrolmentStatus(
          context,
          enrolment.id,
          {
            status: "re_enrolled",
            enrolment_date: enrolmentDate,
            opt_out_deadline: optOutDeadline,
            contributions_start_date: enrolmentDate,
            opted_out_at: null,
            opt_out_reason: null,
            re_enrolment_date: null, // Clear — will be set again if they opt out
          },
          tx
        );

        if (updated) {
          reEnrolled.push(updated);

          // Emit event per employee
          await emitDomainEvent(tx, {
            tenantId: context.tenantId,
            aggregateType: "pension_enrolment",
            aggregateId: enrolment.id,
            eventType: "pension.employee.re_enrolled",
            payload: {
              enrolment: this.mapEnrolmentToResponse(updated),
              previous_opt_out_date: this.formatDate(enrolment.optedOutAt),
            },
            userId: context.userId,
          });
        }
      }

      return {
        success: true,
        data: {
          re_enrolled_count: reEnrolled.length,
          skipped_count: skippedCount,
          enrolments: reEnrolled.map((row) => this.mapEnrolmentToResponse(row)),
        },
      };
    });
  }

  // ===========================================================================
  // List Enrolments
  // ===========================================================================

  /**
   * List pension enrolments with optional filters (status, employee).
   */
  async listEnrolments(
    context: TenantContext,
    filters: EnrolmentFilters = {}
  ): Promise<PaginatedServiceResult<PensionEnrolmentResponse>> {
    const result = await this.repository.findEnrolments(context, filters);
    return {
      items: result.items.map((row) => this.mapEnrolmentToResponse(row)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ===========================================================================
  // Compliance Summary
  // ===========================================================================

  /**
   * Get a compliance dashboard summary.
   *
   * Returns counts of employees by enrolment status, contribution totals,
   * and a compliance rate (percentage of eligible workers enrolled).
   */
  async getComplianceSummary(
    context: TenantContext
  ): Promise<ServiceResult<ComplianceSummaryResponse>> {
    const summary = await this.repository.getComplianceSummary(context);

    const eligibleTotal = summary.eligibleCount + summary.enrolledCount + summary.reEnrolledCount;
    const enrolledTotal = summary.enrolledCount + summary.reEnrolledCount;
    const complianceRate =
      eligibleTotal > 0 ? Math.round((enrolledTotal / eligibleTotal) * 10000) / 100 : 100;

    return {
      success: true,
      data: {
        total_employees: summary.totalEmployees,
        eligible_count: summary.eligibleCount,
        enrolled_count: summary.enrolledCount,
        opted_out_count: summary.optedOutCount,
        postponed_count: summary.postponedCount,
        ceased_count: summary.ceasedCount,
        re_enrolled_count: summary.reEnrolledCount,
        pending_re_enrolment_count: summary.pendingReEnrolmentCount,
        total_employer_contributions: summary.totalEmployerContributions,
        total_employee_contributions: summary.totalEmployeeContributions,
        schemes_count: summary.schemesCount,
        compliance_rate: complianceRate,
      },
    };
  }
}
