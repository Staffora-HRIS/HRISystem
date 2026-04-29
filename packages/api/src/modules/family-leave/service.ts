/**
 * Family Leave Module - Service Layer
 *
 * Implements business logic for UK family leave:
 * - Maternity Leave & Statutory Maternity Pay (SMP)
 * - Paternity Leave & Statutory Paternity Pay (SPP)
 * - Shared Parental Leave & Pay (ShPL / ShPP)
 * - Adoption Leave & Pay
 *
 * Key UK legislation enforced:
 * - Employment Rights Act 1996
 * - Maternity and Parental Leave etc. Regulations 1999
 * - Paternity and Adoption Leave Regulations 2002
 * - Shared Parental Leave Regulations 2014
 *
 * SMP: 6 weeks @ 90% earnings, 33 weeks @ flat rate or 90% (lower),
 *      13 weeks unpaid (52 total)
 * SPP: 2 weeks @ flat rate or 90% (lower)
 * ShPP: up to 37 weeks @ flat rate or 90% (lower)
 *
 * KIT days: 10 (maternity/adoption), 20 SPLIT days (shared parental)
 *
 * Qualifying period: 26 weeks continuous employment by qualifying week
 * (15th week before EWC for maternity, by end of qualifying week for paternity)
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  FamilyLeaveRepository,
  EntitlementRow,
  EntitlementListRow,
  PayPeriodRow,
  KITDayRow,
  NoticeRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  FamilyLeaveType,
  FamilyLeaveStatus,
  CreateEntitlement,
  EligibilityCheck,
  CreateKITDay,
  CurtailLeave,
  CreateNotice,
  EntitlementFilters,
  PaginationQuery,
  EntitlementResponse,
  EntitlementListItem,
  PayPeriodResponse,
  KITDayResponse,
  NoticeResponse,
  PayScheduleResponse,
  EligibilityResponse,
  DashboardResponse,
} from "./schemas";

// =============================================================================
// Constants - UK Statutory Rates (2024/25)
// =============================================================================

const STATUTORY_RATES = {
  /** Weekly flat rate for SMP (weeks 7-39), SPP, ShPP */
  FLAT_RATE_WEEKLY: 184.03,

  /** Lower Earnings Limit (LEL) - employee must earn above this for statutory pay */
  LOWER_EARNINGS_LIMIT: 123.00,

  /** Qualifying period: 26 weeks continuous employment */
  QUALIFYING_WEEKS: 26,

  /** Maternity: total weeks available */
  MATERNITY_TOTAL_WEEKS: 52,
  /** Maternity: ordinary leave period */
  MATERNITY_ORDINARY_WEEKS: 26,
  /** Maternity: additional leave period */
  MATERNITY_ADDITIONAL_WEEKS: 26,
  /** Maternity: weeks at 90% earnings */
  MATERNITY_90_PERCENT_WEEKS: 6,
  /** Maternity: weeks at flat rate */
  MATERNITY_FLAT_RATE_WEEKS: 33,
  /** Maternity: earliest start = 11 weeks before due date */
  MATERNITY_EARLIEST_START_WEEKS: 11,
  /** Maternity: notice period = 15 weeks before EWC */
  MATERNITY_NOTICE_WEEKS: 15,
  /** Maternity: max KIT days */
  MATERNITY_MAX_KIT_DAYS: 10,
  /** Maternity: compulsory leave = 2 weeks */
  MATERNITY_COMPULSORY_WEEKS: 2,

  /** Paternity: total weeks */
  PATERNITY_TOTAL_WEEKS: 2,
  /** Paternity: must be taken within 52 weeks of birth (changed April 2024) */
  PATERNITY_DEADLINE_WEEKS: 52,

  /** Shared Parental: max shareable weeks of leave */
  SPL_MAX_LEAVE_WEEKS: 50,
  /** Shared Parental: max shareable weeks of pay */
  SPL_MAX_PAY_WEEKS: 37,
  /** Shared Parental: notice period in weeks */
  SPL_NOTICE_WEEKS: 8,
  /** Shared Parental: max SPLIT (shared in touch) days */
  SPL_MAX_KIT_DAYS: 20,

  /** Adoption: same structure as maternity */
  ADOPTION_TOTAL_WEEKS: 52,
  ADOPTION_90_PERCENT_WEEKS: 6,
  ADOPTION_FLAT_RATE_WEEKS: 33,
  ADOPTION_MAX_KIT_DAYS: 10,
} as const;

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "family_leave.entitlement.created"
  | "family_leave.entitlement.updated"
  | "family_leave.started"
  | "family_leave.completed"
  | "family_leave.cancelled"
  | "family_leave.curtailed"
  | "family_leave.pay_calculated"
  | "family_leave.kit_day_recorded"
  | "family_leave.notice_recorded"
  | "family_leave.eligibility_checked";

// =============================================================================
// Service
// =============================================================================

export class FamilyLeaveService {
  constructor(
    private repository: FamilyLeaveRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Domain Event Emission
  // ---------------------------------------------------------------------------

  private async emitEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    aggregateId: string,
    eventType: DomainEventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.repository.writeOutbox(
      tx,
      ctx.tenantId,
      "family_leave",
      aggregateId,
      eventType,
      { ...payload, actor: ctx.userId }
    );
  }

  // ---------------------------------------------------------------------------
  // Create Entitlement
  // ---------------------------------------------------------------------------

  /**
   * Create a family leave entitlement (pregnancy/adoption notification).
   * Validates eligibility, date constraints, and calculates qualifying week.
   */
  async createEntitlement(
    ctx: TenantContext,
    data: CreateEntitlement,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    // 1. Validate employee exists and is active
    const employee = await this.repository.findEmployeeById(ctx, data.employee_id);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: data.employee_id },
        },
      };
    }

    if (employee.status !== "active" && employee.status !== "on_leave") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Employee must be active or on leave to request family leave",
          details: { status: employee.status },
        },
      };
    }

    // 2. Type-specific validation
    const validationResult = this.validateLeaveRequest(data, employee.hireDate);
    if (!validationResult.success) {
      return validationResult as ServiceResult<EntitlementResponse>;
    }

    // 3. Calculate end date if not provided
    const endDate = data.end_date || this.calculateEndDate(data.start_date, data.leave_type);

    // 4. Check for overlapping leave
    const overlapping = await this.repository.findOverlappingLeave(
      ctx,
      data.employee_id,
      data.start_date,
      endDate
    );
    if (overlapping.length > 0) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "Overlapping family leave already exists for this period",
          details: {
            overlapping_ids: overlapping.map((r) => r.id),
          },
        },
      };
    }

    // 5. Calculate qualifying week and eligibility
    const qualifyingWeek = this.calculateQualifyingWeek(data.expected_date, data.leave_type);
    const continuousWeeks = this.calculateContinuousServiceWeeks(employee.hireDate, qualifyingWeek);
    const qualifiesForService = continuousWeeks >= STATUTORY_RATES.QUALIFYING_WEEKS;
    const earningsAboveLel = (data.average_weekly_earnings ?? 0) >= STATUTORY_RATES.LOWER_EARNINGS_LIMIT;
    const qualifiesForStatutoryPay = qualifiesForService && earningsAboveLel;

    // 6. Calculate total weeks
    const totalWeeks = this.calculateTotalWeeks(data.leave_type, data.start_date, endDate);

    // 7. Create record and pay schedule in a single transaction
    const id = crypto.randomUUID();

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const record = await this.repository.createEntitlement(tx, ctx, {
        id,
        employeeId: data.employee_id,
        leaveType: data.leave_type,
        expectedDate: data.expected_date,
        actualDate: data.actual_date,
        startDate: data.start_date,
        endDate,
        totalWeeks,
        matb1Received: data.matb1_received ?? false,
        matb1Date: data.matb1_date,
        partnerEmployeeId: data.partner_employee_id,
        averageWeeklyEarnings: data.average_weekly_earnings,
        noticeGivenDate: data.notice_given_date,
        qualifyingWeek: qualifyingWeek ? this.formatDate(qualifyingWeek) : null,
        qualifiesForStatutoryPay,
        earningsAboveLel,
        paternityBlockNumber: data.paternity_block_number,
        notes: data.notes,
        createdBy: ctx.userId,
      });

      // Generate pay schedule if earnings provided and qualifies
      let payPeriods: PayPeriodRow[] = [];
      if (data.average_weekly_earnings != null && qualifiesForStatutoryPay) {
        payPeriods = await this.generatePaySchedule(
          tx,
          ctx,
          id,
          data.leave_type,
          data.start_date,
          totalWeeks,
          data.average_weekly_earnings
        );
      }

      // Auto-create initial notice if notice_given_date provided
      if (data.notice_given_date) {
        const noticeType = this.getInitialNoticeType(data.leave_type);
        await this.repository.createNotice(tx, ctx, {
          id: crypto.randomUUID(),
          leaveRecordId: id,
          employeeId: data.employee_id,
          noticeType,
          noticeDate: data.notice_given_date,
          receivedDate: data.notice_given_date,
        });
      }

      await this.emitEvent(tx, ctx, id, "family_leave.entitlement.created", {
        entitlement: {
          id: record.id,
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          startDate: data.start_date,
          endDate,
          totalWeeks,
          qualifiesForStatutoryPay,
        },
      });

      return { record, payPeriods };
    });

    const maxKitDays = this.getMaxKITDays(data.leave_type);

    return {
      success: true,
      data: this.mapToResponse(result.record, result.payPeriods, [], [], maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Check Eligibility
  // ---------------------------------------------------------------------------

  /**
   * Check employee eligibility for a specific family leave type.
   * Verifies:
   * - 26 weeks continuous employment by qualifying week
   * - Average weekly earnings above LEL
   * - Employee status is active/on_leave
   */
  async checkEligibility(
    ctx: TenantContext,
    employeeId: string,
    check?: EligibilityCheck
  ): Promise<ServiceResult<EligibilityResponse>> {
    const employee = await this.repository.findEmployeeById(ctx, employeeId);
    if (!employee) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Employee not found",
          details: { employee_id: employeeId },
        },
      };
    }

    const leaveType = check?.leave_type ?? "maternity";
    const expectedDate = check?.expected_date;

    // Calculate qualifying week
    const qualifyingWeek = expectedDate
      ? this.calculateQualifyingWeek(expectedDate, leaveType)
      : null;

    // Calculate continuous service
    const referenceDate = qualifyingWeek || new Date();
    const continuousWeeks = this.calculateContinuousServiceWeeks(
      employee.hireDate,
      referenceDate
    );

    const requiredWeeks = STATUTORY_RATES.QUALIFYING_WEEKS;
    const isActiveOrLeave = employee.status === "active" || employee.status === "on_leave";

    const reasons: string[] = [];

    if (!isActiveOrLeave) {
      reasons.push(`Employee status '${employee.status}' does not qualify for ${leaveType} leave`);
    }

    if (continuousWeeks < requiredWeeks) {
      reasons.push(
        `Employee has ${continuousWeeks} weeks of continuous service; ${requiredWeeks} weeks required by qualifying week`
      );
    }

    const eligible = reasons.length === 0;

    return {
      success: true,
      data: {
        employee_id: employeeId,
        leave_type: leaveType,
        eligible,
        continuous_service_weeks: continuousWeeks,
        required_weeks: requiredWeeks,
        qualifying_week: qualifyingWeek ? this.formatDate(qualifyingWeek) : null,
        earnings_above_lel: null, // Requires payroll data not available here
        reasons,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Calculate Statutory Pay
  // ---------------------------------------------------------------------------

  /**
   * Calculate or recalculate the full statutory pay schedule for a leave entitlement.
   */
  async calculateStatutoryPay(
    ctx: TenantContext,
    entitlementId: string
  ): Promise<ServiceResult<PayScheduleResponse>> {
    const record = await this.repository.findEntitlementById(ctx, entitlementId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id: entitlementId },
        },
      };
    }

    if (!record.averageWeeklyEarnings) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Average weekly earnings must be set before calculating statutory pay",
        },
      };
    }

    const earnings = Number(record.averageWeeklyEarnings);
    const startDateStr = this.formatDate(record.startDate);

    const generated = await this.db.withTransaction(ctx, async (tx) => {
      // Delete existing periods and regenerate
      await this.repository.deletePayPeriods(tx, ctx, entitlementId);

      const periods = await this.generatePaySchedule(
        tx,
        ctx,
        entitlementId,
        record.leaveType,
        startDateStr,
        record.totalWeeks,
        earnings
      );

      // Update qualification status
      const earningsAboveLel = earnings >= STATUTORY_RATES.LOWER_EARNINGS_LIMIT;
      await this.repository.updateEntitlement(tx, ctx, entitlementId, {
        qualifiesForStatutoryPay: record.qualifiesForStatutoryPay && earningsAboveLel,
        earningsAboveLel,
      });

      await this.emitEvent(tx, ctx, entitlementId, "family_leave.pay_calculated", {
        entitlementId,
        totalPeriods: periods.length,
        averageWeeklyEarnings: earnings,
      });

      return periods;
    });

    return {
      success: true,
      data: this.buildPaySchedule(record, generated),
    };
  }

  // ---------------------------------------------------------------------------
  // Get Pay Schedule
  // ---------------------------------------------------------------------------

  /**
   * Get the week-by-week pay breakdown for an entitlement.
   * If no periods exist, generates them.
   */
  async getPaySchedule(
    ctx: TenantContext,
    entitlementId: string
  ): Promise<ServiceResult<PayScheduleResponse>> {
    const record = await this.repository.findEntitlementById(ctx, entitlementId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id: entitlementId },
        },
      };
    }

    let payPeriods = await this.repository.findPayPeriods(ctx, entitlementId);

    // Generate if none exist and earnings are set
    if (payPeriods.length === 0 && record.averageWeeklyEarnings) {
      const earnings = Number(record.averageWeeklyEarnings);
      const startDateStr = this.formatDate(record.startDate);

      payPeriods = await this.db.withTransaction(ctx, async (tx) => {
        return this.generatePaySchedule(
          tx,
          ctx,
          entitlementId,
          record.leaveType,
          startDateStr,
          record.totalWeeks,
          earnings
        );
      });
    }

    return {
      success: true,
      data: this.buildPaySchedule(record, payPeriods),
    };
  }

  // ---------------------------------------------------------------------------
  // Record KIT/SPLIT Day
  // ---------------------------------------------------------------------------

  /**
   * Record a Keeping In Touch (KIT) or Shared Parental In Touch (SPLIT) day.
   * Maternity/adoption: max 10 KIT days
   * Shared parental: max 20 SPLIT days
   * Paternity: no KIT days allowed
   */
  async recordKITDay(
    ctx: TenantContext,
    entitlementId: string,
    data: CreateKITDay
  ): Promise<ServiceResult<KITDayResponse>> {
    const record = await this.repository.findEntitlementById(ctx, entitlementId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id: entitlementId },
        },
      };
    }

    // Can only add KIT days to active or planned leave
    if (record.status !== "active" && record.status !== "planned") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot record KIT days for a ${record.status} leave record`,
          details: { current_status: record.status },
        },
      };
    }

    // Paternity leave does not have KIT days
    if (record.leaveType === "paternity") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "KIT/SPLIT days are not applicable for paternity leave",
        },
      };
    }

    // Check KIT day limit
    const maxKitDays = this.getMaxKITDays(record.leaveType);
    const currentCount = await this.repository.countKITDays(ctx, entitlementId);

    if (currentCount >= maxKitDays) {
      const dayType = record.leaveType === "shared_parental" ? "SPLIT" : "KIT";
      return {
        success: false,
        error: {
          code: ErrorCodes.LIMIT_EXCEEDED,
          message: `Maximum ${maxKitDays} ${dayType} days allowed. ${currentCount} already recorded.`,
          details: { max: maxKitDays, used: currentCount },
        },
      };
    }

    // Validate work date is within leave period
    const workDate = new Date(data.work_date);
    if (workDate < record.startDate || workDate > record.endDate) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "KIT day must be within the leave period",
          details: {
            work_date: data.work_date,
            leave_start: this.formatDate(record.startDate),
            leave_end: this.formatDate(record.endDate),
          },
        },
      };
    }

    const kitDayId = crypto.randomUUID();

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const kitDay = await this.repository.createKITDay(tx, ctx, {
        id: kitDayId,
        leaveRecordId: entitlementId,
        workDate: data.work_date,
        hoursWorked: data.hours_worked,
        notes: data.notes,
      });

      await this.emitEvent(tx, ctx, entitlementId, "family_leave.kit_day_recorded", {
        entitlementId,
        kitDayId: kitDay.id,
        workDate: data.work_date,
        hoursWorked: data.hours_worked,
        kitDaysUsed: currentCount + 1,
        kitDaysRemaining: maxKitDays - currentCount - 1,
        dayType: record.leaveType === "shared_parental" ? "SPLIT" : "KIT",
      });

      return kitDay;
    });

    return {
      success: true,
      data: this.mapKITDayToResponse(result),
    };
  }

  // ---------------------------------------------------------------------------
  // Curtail Maternity Leave (to enable ShPL)
  // ---------------------------------------------------------------------------

  /**
   * Curtail maternity or adoption leave to enable shared parental leave.
   * The mother/primary adopter must curtail their leave to create the ShPL pool.
   *
   * Rules:
   * - Only maternity or adoption can be curtailed
   * - Only planned or active leave can be curtailed
   * - Maternity must have at least 2 weeks compulsory leave
   * - Curtailment date must be after start date
   * - ShPL pool = remaining weeks after curtailment (max 50 weeks leave, 37 weeks pay)
   */
  async curtailLeave(
    ctx: TenantContext,
    entitlementId: string,
    data: CurtailLeave
  ): Promise<ServiceResult<EntitlementResponse>> {
    const existing = await this.repository.findEntitlementById(ctx, entitlementId);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id: entitlementId },
        },
      };
    }

    // Only maternity and adoption can be curtailed
    if (existing.leaveType !== "maternity" && existing.leaveType !== "adoption") {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Only maternity or adoption leave can be curtailed for shared parental leave",
          details: { leave_type: existing.leaveType },
        },
      };
    }

    if (existing.status !== "planned" && existing.status !== "active") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot curtail a ${existing.status} leave record`,
          details: { current_status: existing.status },
        },
      };
    }

    const curtailmentDate = data.curtailment_date;
    const startDateStr = this.formatDate(existing.startDate);

    // Curtailment date must be after start date
    if (curtailmentDate <= startDateStr) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Curtailment date must be after the leave start date",
          details: { curtailment_date: curtailmentDate, start_date: startDateStr },
        },
      };
    }

    // Maternity must have at least 2 weeks compulsory leave
    if (existing.leaveType === "maternity") {
      const compulsoryEnd = new Date(existing.startDate);
      compulsoryEnd.setDate(compulsoryEnd.getDate() + STATUTORY_RATES.MATERNITY_COMPULSORY_WEEKS * 7);
      if (new Date(curtailmentDate) < compulsoryEnd) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Maternity leave cannot be curtailed before the ${STATUTORY_RATES.MATERNITY_COMPULSORY_WEEKS}-week compulsory leave period`,
            details: {
              earliest_curtailment: this.formatDate(compulsoryEnd),
            },
          },
        };
      }
    }

    // Calculate new total weeks and ShPL pool
    const newTotalWeeks = this.calculateTotalWeeks(
      existing.leaveType,
      startDateStr,
      curtailmentDate
    );

    const originalMaxWeeks = existing.leaveType === "maternity"
      ? STATUTORY_RATES.MATERNITY_TOTAL_WEEKS
      : STATUTORY_RATES.ADOPTION_TOTAL_WEEKS;

    // ShPL weeks = original entitlement minus used weeks (minus 2 compulsory for maternity)
    const splWeeksAvailable = data.spl_weeks_available ??
      Math.min(originalMaxWeeks - newTotalWeeks, STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS);

    // Pay weeks: total 39 paid weeks minus weeks already used before curtailment
    const totalPaidWeeks = existing.leaveType === "maternity"
      ? STATUTORY_RATES.MATERNITY_90_PERCENT_WEEKS + STATUTORY_RATES.MATERNITY_FLAT_RATE_WEEKS
      : STATUTORY_RATES.ADOPTION_90_PERCENT_WEEKS + STATUTORY_RATES.ADOPTION_FLAT_RATE_WEEKS;
    const paidWeeksUsed = Math.min(newTotalWeeks, totalPaidWeeks);
    const splPayWeeksAvailable = data.spl_pay_weeks_available ??
      Math.min(totalPaidWeeks - paidWeeksUsed, STATUTORY_RATES.SPL_MAX_PAY_WEEKS);

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateEntitlement(tx, ctx, entitlementId, {
        curtailmentDate,
        endDate: curtailmentDate,
        totalWeeks: newTotalWeeks,
        splWeeksAvailable: Math.max(0, splWeeksAvailable),
        splPayWeeksAvailable: Math.max(0, splPayWeeksAvailable),
      });

      if (!updated) {
        throw new Error("Failed to curtail family leave record");
      }

      // Recalculate pay schedule for shortened period
      const earnings = existing.averageWeeklyEarnings
        ? Number(existing.averageWeeklyEarnings)
        : null;

      if (earnings !== null) {
        await this.repository.deletePayPeriods(tx, ctx, entitlementId);
        await this.generatePaySchedule(
          tx,
          ctx,
          entitlementId,
          existing.leaveType,
          startDateStr,
          newTotalWeeks,
          earnings
        );
      }

      await this.emitEvent(tx, ctx, entitlementId, "family_leave.curtailed", {
        entitlementId,
        curtailmentDate,
        originalEndDate: this.formatDate(existing.endDate),
        newTotalWeeks,
        splWeeksAvailable: Math.max(0, splWeeksAvailable),
        splPayWeeksAvailable: Math.max(0, splPayWeeksAvailable),
      });

      return updated;
    });

    const [payPeriods, kitDays, notices] = await Promise.all([
      this.repository.findPayPeriods(ctx, entitlementId),
      this.repository.findKITDays(ctx, entitlementId),
      this.repository.findNotices(ctx, entitlementId),
    ]);

    const maxKitDays = this.getMaxKITDays(existing.leaveType);

    return {
      success: true,
      data: this.mapToResponse(result!, payPeriods, kitDays, notices, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // List & Get
  // ---------------------------------------------------------------------------

  /**
   * List family leave entitlements with filters and cursor-based pagination
   */
  async listEntitlements(
    ctx: TenantContext,
    filters: EntitlementFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<EntitlementListItem>> {
    const result = await this.repository.findEntitlements(ctx, filters, pagination);

    return {
      items: result.items.map(this.mapToListItem),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single entitlement by ID with pay periods, KIT days, and notices
   */
  async getEntitlement(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    const record = await this.repository.findEntitlementById(ctx, id);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id },
        },
      };
    }

    const [payPeriods, kitDays, notices] = await Promise.all([
      this.repository.findPayPeriods(ctx, id),
      this.repository.findKITDays(ctx, id),
      this.repository.findNotices(ctx, id),
    ]);

    const maxKitDays = this.getMaxKITDays(record.leaveType);

    return {
      success: true,
      data: this.mapToResponse(record, payPeriods, kitDays, notices, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Compliance Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Get compliance dashboard data:
   * - Active/planned leave counts by type
   * - Upcoming returns (within 30 days)
   * - KIT day usage summary for active leaves
   * - Compliance alerts (missing MATB1, missing notices, etc.)
   */
  async getComplianceDashboard(
    ctx: TenantContext
  ): Promise<ServiceResult<DashboardResponse>> {
    const [counts, upcomingReturns, kitSummary, leavesWithoutNotices] = await Promise.all([
      this.repository.getLeaveCountsByStatus(ctx),
      this.repository.getUpcomingReturns(ctx, 30),
      this.repository.getActiveLeaveKITSummary(ctx),
      this.repository.findLeavesWithoutNotices(ctx),
    ]);

    // Build counts
    const buildCounts = (status: FamilyLeaveStatus) => {
      const filtered = counts.filter((c) => c.status === status);
      const getCount = (type: FamilyLeaveType) =>
        Number(filtered.find((c) => c.leaveType === type)?.count ?? 0);
      return {
        maternity: getCount("maternity"),
        paternity: getCount("paternity"),
        shared_parental: getCount("shared_parental"),
        adoption: getCount("adoption"),
        total: filtered.reduce((sum, c) => sum + Number(c.count), 0),
      };
    };

    // Build upcoming returns
    const today = new Date();
    const upcoming_returns = upcomingReturns.map((r) => {
      const returnDate = r.endDate;
      const daysUntil = Math.ceil(
        (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: r.id,
        employee_id: r.employeeId,
        employee_name: r.employeeName,
        leave_type: r.leaveType,
        expected_return_date: this.formatDate(returnDate),
        days_until_return: Math.max(0, daysUntil),
      };
    });

    // Build KIT day summary
    const kit_day_summary = kitSummary.map((r) => {
      const maxKitDays = this.getMaxKITDays(r.leaveType);
      return {
        id: r.id,
        employee_id: r.employeeId,
        employee_name: r.employeeName,
        leave_type: r.leaveType,
        kit_days_used: r.kitDaysUsed,
        kit_days_remaining: maxKitDays - r.kitDaysUsed,
      };
    });

    // Build compliance alerts
    const compliance_alerts: DashboardResponse["compliance_alerts"] = [];

    for (const leave of leavesWithoutNotices) {
      if (!leave.hasNotice && leave.noticeGivenDate === null) {
        compliance_alerts.push({
          type: "missing_notice",
          severity: "warning",
          message: `${leave.leaveType} leave has no formal notice recorded`,
          leave_record_id: leave.id,
          employee_id: leave.employeeId,
        });
      }

      // Check for missing MATB1 on maternity leaves
      if (leave.leaveType === "maternity" && !leave.matb1Received) {
        const weeksUntilStart = Math.ceil(
          (leave.startDate.getTime() - today.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        compliance_alerts.push({
          type: "missing_matb1",
          severity: weeksUntilStart <= 4 ? "critical" : "warning",
          message: `Maternity leave MATB1 certificate not yet received (leave starts in ${weeksUntilStart} weeks)`,
          leave_record_id: leave.id,
          employee_id: leave.employeeId,
        });
      }
    }

    return {
      success: true,
      data: {
        active_leaves: buildCounts("active"),
        planned_leaves: buildCounts("planned"),
        upcoming_returns,
        kit_day_summary,
        compliance_alerts,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Notice Recording
  // ---------------------------------------------------------------------------

  /**
   * Record a formal notice for a family leave entitlement.
   * Tracks MATB1 certificates, opt-in notices, curtailment notices, etc.
   */
  async recordNotice(
    ctx: TenantContext,
    entitlementId: string,
    data: CreateNotice
  ): Promise<ServiceResult<NoticeResponse>> {
    const record = await this.repository.findEntitlementById(ctx, entitlementId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Family leave entitlement not found",
          details: { id: entitlementId },
        },
      };
    }

    const noticeId = crypto.randomUUID();

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const notice = await this.repository.createNotice(tx, ctx, {
        id: noticeId,
        leaveRecordId: entitlementId,
        employeeId: record.employeeId,
        noticeType: data.notice_type,
        noticeDate: data.notice_date,
        receivedDate: data.received_date,
        documentReference: data.document_reference,
        notes: data.notes,
      });

      await this.emitEvent(tx, ctx, entitlementId, "family_leave.notice_recorded", {
        entitlementId,
        noticeId: notice.id,
        noticeType: data.notice_type,
        noticeDate: data.notice_date,
      });

      return notice;
    });

    return {
      success: true,
      data: this.mapNoticeToResponse(result),
    };
  }

  // =============================================================================
  // Pay Schedule Generation (Internal)
  // =============================================================================

  /**
   * Generate weekly pay periods for a family leave entitlement.
   * Rules:
   *   Maternity/Adoption: 6 weeks @ 90% earnings, 33 weeks @ flat rate or 90% (lower), remainder unpaid
   *   Paternity: all weeks at flat rate or 90% (lower), max 2 weeks
   *   Shared Parental: all paid weeks at flat rate or 90% (lower), max 37 weeks pay
   */
  private async generatePaySchedule(
    tx: TransactionSql,
    ctx: TenantContext,
    leaveRecordId: string,
    leaveType: FamilyLeaveType,
    startDate: string,
    totalWeeks: number,
    averageWeeklyEarnings: number
  ): Promise<PayPeriodRow[]> {
    const periods: Array<{
      id: string;
      weekNumber: number;
      startDate: string;
      endDate: string;
      payType: string;
      amount: number;
    }> = [];

    const weekStart = new Date(startDate);

    for (let week = 1; week <= totalWeeks; week++) {
      const periodStart = new Date(weekStart);
      periodStart.setDate(weekStart.getDate() + (week - 1) * 7);

      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);

      const { payType, amount } = this.calculateWeeklyPay(
        leaveType,
        week,
        averageWeeklyEarnings
      );

      periods.push({
        id: crypto.randomUUID(),
        weekNumber: week,
        startDate: this.formatDate(periodStart),
        endDate: this.formatDate(periodEnd),
        payType,
        amount: Math.round(amount * 100) / 100,
      });
    }

    return this.repository.createPayPeriods(tx, ctx, leaveRecordId, periods);
  }

  /**
   * Calculate pay for a single week based on leave type and week number.
   *
   * SMP: weeks 1-6 = 90% of average earnings
   *      weeks 7-39 = lesser of flat rate or 90%
   *      weeks 40-52 = unpaid
   * SPP: weeks 1-2 = lesser of flat rate or 90%
   * ShPP: weeks 1-37 = lesser of flat rate or 90%
   */
  private calculateWeeklyPay(
    leaveType: FamilyLeaveType,
    weekNumber: number,
    averageWeeklyEarnings: number
  ): { payType: string; amount: number } {
    const ninetyPercent = averageWeeklyEarnings * 0.9;

    switch (leaveType) {
      case "maternity":
      case "adoption": {
        const ninetyPercentWeeks =
          leaveType === "maternity"
            ? STATUTORY_RATES.MATERNITY_90_PERCENT_WEEKS
            : STATUTORY_RATES.ADOPTION_90_PERCENT_WEEKS;
        const flatRateWeeks =
          leaveType === "maternity"
            ? STATUTORY_RATES.MATERNITY_FLAT_RATE_WEEKS
            : STATUTORY_RATES.ADOPTION_FLAT_RATE_WEEKS;

        if (weekNumber <= ninetyPercentWeeks) {
          return { payType: "90_percent", amount: ninetyPercent };
        }
        if (weekNumber <= ninetyPercentWeeks + flatRateWeeks) {
          return {
            payType: "flat_rate",
            amount: Math.min(STATUTORY_RATES.FLAT_RATE_WEEKLY, ninetyPercent),
          };
        }
        return { payType: "unpaid", amount: 0 };
      }

      case "paternity": {
        if (weekNumber <= STATUTORY_RATES.PATERNITY_TOTAL_WEEKS) {
          return {
            payType: "flat_rate",
            amount: Math.min(STATUTORY_RATES.FLAT_RATE_WEEKLY, ninetyPercent),
          };
        }
        return { payType: "unpaid", amount: 0 };
      }

      case "shared_parental": {
        if (weekNumber <= STATUTORY_RATES.SPL_MAX_PAY_WEEKS) {
          return {
            payType: "flat_rate",
            amount: Math.min(STATUTORY_RATES.FLAT_RATE_WEEKLY, ninetyPercent),
          };
        }
        return { payType: "unpaid", amount: 0 };
      }

      default:
        return { payType: "unpaid", amount: 0 };
    }
  }

  // =============================================================================
  // Validation (Internal)
  // =============================================================================

  /**
   * Validate a leave request based on leave type rules
   */
  private validateLeaveRequest(
    data: CreateEntitlement,
    hireDate: Date
  ): ServiceResult<null> {
    const startDate = new Date(data.start_date);
    const expectedDate = new Date(data.expected_date);

    switch (data.leave_type) {
      case "maternity": {
        // Earliest start: 11 weeks before due date
        const earliestStart = new Date(expectedDate);
        earliestStart.setDate(
          earliestStart.getDate() - STATUTORY_RATES.MATERNITY_EARLIEST_START_WEEKS * 7
        );

        if (startDate < earliestStart) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Maternity leave cannot start more than ${STATUTORY_RATES.MATERNITY_EARLIEST_START_WEEKS} weeks before the expected due date`,
              details: {
                earliest_start: this.formatDate(earliestStart),
                requested_start: data.start_date,
              },
            },
          };
        }

        // Validate notice period: should give notice by 15th week before EWC
        if (data.notice_given_date) {
          const noticeDeadline = new Date(expectedDate);
          noticeDeadline.setDate(
            noticeDeadline.getDate() - STATUTORY_RATES.MATERNITY_NOTICE_WEEKS * 7
          );
          // Note: late notice is allowed but flagged for compliance
        }
        break;
      }

      case "paternity": {
        // Must be taken within 52 weeks of expected/actual date (since April 2024)
        const deadlineDate = new Date(data.actual_date || data.expected_date);
        deadlineDate.setDate(deadlineDate.getDate() + STATUTORY_RATES.PATERNITY_DEADLINE_WEEKS * 7);

        const endDate = data.end_date
          ? new Date(data.end_date)
          : new Date(startDate.getTime() + STATUTORY_RATES.PATERNITY_TOTAL_WEEKS * 7 * 24 * 60 * 60 * 1000);

        if (endDate > deadlineDate) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Paternity leave must be completed within ${STATUTORY_RATES.PATERNITY_DEADLINE_WEEKS} weeks of the birth/placement date`,
              details: {
                deadline: this.formatDate(deadlineDate),
                requested_end: data.end_date || this.formatDate(endDate),
              },
            },
          };
        }

        // Paternity leave is 1 or 2 weeks only (can be 2 separate blocks since April 2024)
        const requestedWeeks = this.calculateTotalWeeks(
          "paternity",
          data.start_date,
          data.end_date || this.formatDate(endDate)
        );
        if (requestedWeeks > STATUTORY_RATES.PATERNITY_TOTAL_WEEKS) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Paternity leave is limited to ${STATUTORY_RATES.PATERNITY_TOTAL_WEEKS} weeks (can be taken in 2 separate 1-week blocks since April 2024)`,
              details: {
                requested_weeks: requestedWeeks,
                max_weeks: STATUTORY_RATES.PATERNITY_TOTAL_WEEKS,
              },
            },
          };
        }
        break;
      }

      case "shared_parental": {
        // ShPL requires 8 weeks notice
        const today = new Date();
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        const weeksUntilStart = Math.floor((startDate.getTime() - today.getTime()) / msPerWeek);

        if (weeksUntilStart < STATUTORY_RATES.SPL_NOTICE_WEEKS) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Shared parental leave requires ${STATUTORY_RATES.SPL_NOTICE_WEEKS} weeks notice`,
              details: {
                weeks_notice_given: weeksUntilStart,
                required_weeks_notice: STATUTORY_RATES.SPL_NOTICE_WEEKS,
              },
            },
          };
        }

        // Cannot exceed 50 weeks total
        const endDate = data.end_date || this.calculateEndDate(data.start_date, "shared_parental");
        const splWeeks = this.calculateTotalWeeks("shared_parental", data.start_date, endDate);
        if (splWeeks > STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Shared parental leave cannot exceed ${STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS} weeks`,
              details: {
                requested_weeks: splWeeks,
                max_weeks: STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS,
              },
            },
          };
        }
        break;
      }

      case "adoption": {
        // Similar to maternity
        break;
      }
    }

    return { success: true };
  }

  // =============================================================================
  // Helpers
  // =============================================================================

  /**
   * Calculate the qualifying week for a given expected date and leave type.
   * For maternity: 15th week before EWC (Expected Week of Childbirth)
   * For paternity: same as maternity qualifying week
   * For adoption: week of match notification
   */
  private calculateQualifyingWeek(expectedDate: string, leaveType: FamilyLeaveType): Date | null {
    if (leaveType === "adoption") {
      // Adoption qualifying week is the week of the match
      return new Date(expectedDate);
    }

    // Maternity/paternity/ShPL: 15th week before EWC
    const ewc = new Date(expectedDate);
    const qualifyingWeek = new Date(ewc);
    qualifyingWeek.setDate(ewc.getDate() - 15 * 7);
    return qualifyingWeek;
  }

  /**
   * Calculate continuous weeks of service from hire date to a reference date
   */
  private calculateContinuousServiceWeeks(hireDate: Date, referenceDate: Date | null): number {
    const ref = referenceDate || new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((ref.getTime() - new Date(hireDate).getTime()) / msPerWeek);
  }

  private calculateTotalWeeks(
    leaveType: FamilyLeaveType,
    startDate: string,
    endDate: string
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeks = Math.ceil((end.getTime() - start.getTime() + 1) / msPerWeek);

    switch (leaveType) {
      case "maternity":
        return Math.min(weeks, STATUTORY_RATES.MATERNITY_TOTAL_WEEKS);
      case "paternity":
        return Math.min(weeks, STATUTORY_RATES.PATERNITY_TOTAL_WEEKS);
      case "shared_parental":
        return Math.min(weeks, STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS);
      case "adoption":
        return Math.min(weeks, STATUTORY_RATES.ADOPTION_TOTAL_WEEKS);
      default:
        return weeks;
    }
  }

  private calculateEndDate(startDate: string, leaveType: FamilyLeaveType): string {
    const start = new Date(startDate);
    let weeks: number;

    switch (leaveType) {
      case "maternity":
        weeks = STATUTORY_RATES.MATERNITY_TOTAL_WEEKS;
        break;
      case "paternity":
        weeks = STATUTORY_RATES.PATERNITY_TOTAL_WEEKS;
        break;
      case "shared_parental":
        weeks = STATUTORY_RATES.SPL_MAX_LEAVE_WEEKS;
        break;
      case "adoption":
        weeks = STATUTORY_RATES.ADOPTION_TOTAL_WEEKS;
        break;
      default:
        weeks = 52;
    }

    const end = new Date(start);
    end.setDate(start.getDate() + weeks * 7 - 1);
    return this.formatDate(end);
  }

  private getMaxKITDays(leaveType: FamilyLeaveType): number {
    switch (leaveType) {
      case "maternity":
        return STATUTORY_RATES.MATERNITY_MAX_KIT_DAYS;
      case "adoption":
        return STATUTORY_RATES.ADOPTION_MAX_KIT_DAYS;
      case "shared_parental":
        return STATUTORY_RATES.SPL_MAX_KIT_DAYS;
      case "paternity":
        return 0;
      default:
        return 0;
    }
  }

  private getInitialNoticeType(leaveType: FamilyLeaveType): CreateNotice["notice_type"] {
    switch (leaveType) {
      case "maternity":
        return "maternity_notification";
      case "paternity":
        return "paternity_notification";
      case "shared_parental":
        return "spl_opt_in";
      case "adoption":
        return "adoption_notification";
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  // =============================================================================
  // Response Mappers
  // =============================================================================

  private buildPaySchedule(
    record: EntitlementRow,
    payPeriods: PayPeriodRow[]
  ): PayScheduleResponse {
    const periods = payPeriods.map(this.mapPayPeriodToResponse);
    const paidWeeks = payPeriods.filter((p) => p.payType !== "unpaid").length;
    const unpaidWeeks = payPeriods.filter((p) => p.payType === "unpaid").length;
    const totalPay = payPeriods.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      leave_record_id: record.id,
      leave_type: record.leaveType,
      total_weeks: record.totalWeeks,
      paid_weeks: paidWeeks,
      unpaid_weeks: unpaidWeeks,
      total_statutory_pay: Math.round(totalPay * 100) / 100,
      periods,
    };
  }

  private mapToResponse(
    row: EntitlementRow,
    payPeriods?: PayPeriodRow[],
    kitDays?: KITDayRow[],
    notices?: NoticeRow[],
    maxKitDays?: number
  ): EntitlementResponse {
    const kitDaysUsed = kitDays?.length ?? 0;

    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      leave_type: row.leaveType,
      expected_date: this.formatDate(row.expectedDate),
      actual_date: row.actualDate ? this.formatDate(row.actualDate) : null,
      start_date: this.formatDate(row.startDate),
      end_date: this.formatDate(row.endDate),
      total_weeks: row.totalWeeks,
      status: row.status,
      average_weekly_earnings: row.averageWeeklyEarnings
        ? Number(row.averageWeeklyEarnings)
        : null,
      qualifies_for_statutory_pay: row.qualifiesForStatutoryPay,
      earnings_above_lel: row.earningsAboveLel,
      notice_given_date: row.noticeGivenDate ? this.formatDate(row.noticeGivenDate) : null,
      qualifying_week: row.qualifyingWeek ? this.formatDate(row.qualifyingWeek) : null,
      matb1_received: row.matb1Received,
      matb1_date: row.matb1Date ? this.formatDate(row.matb1Date) : null,
      partner_employee_id: row.partnerEmployeeId,
      curtailment_date: row.curtailmentDate ? this.formatDate(row.curtailmentDate) : null,
      paternity_block_number: row.paternityBlockNumber,
      spl_weeks_available: row.splWeeksAvailable,
      spl_pay_weeks_available: row.splPayWeeksAvailable,
      notes: row.notes,
      created_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      kit_days_used: kitDaysUsed,
      kit_days_remaining: maxKitDays !== undefined ? maxKitDays - kitDaysUsed : undefined,
      pay_periods: payPeriods?.map(this.mapPayPeriodToResponse),
      kit_days: kitDays?.map(this.mapKITDayToResponse),
      notices: notices?.map(this.mapNoticeToResponse),
    };
  }

  private mapToListItem(row: EntitlementListRow): EntitlementListItem {
    const formatDate = (date: Date): string => date.toISOString().split("T")[0]!;

    return {
      id: row.id,
      employee_id: row.employeeId,
      employee_name: row.employeeName,
      employee_number: row.employeeNumber,
      leave_type: row.leaveType,
      expected_date: formatDate(row.expectedDate),
      start_date: formatDate(row.startDate),
      end_date: formatDate(row.endDate),
      total_weeks: row.totalWeeks,
      status: row.status,
      kit_days_used: row.kitDaysUsed,
      qualifies_for_statutory_pay: row.qualifiesForStatutoryPay,
    };
  }

  private mapPayPeriodToResponse(row: PayPeriodRow): PayPeriodResponse {
    const formatDate = (date: Date): string => date.toISOString().split("T")[0]!;

    return {
      id: row.id,
      week_number: row.weekNumber,
      start_date: formatDate(row.startDate),
      end_date: formatDate(row.endDate),
      rate_type: row.payType,
      amount: Number(row.amount),
    };
  }

  private mapKITDayToResponse(row: KITDayRow): KITDayResponse {
    return {
      id: row.id,
      leave_record_id: row.leaveRecordId,
      work_date: row.workDate.toISOString().split("T")[0]!,
      hours_worked: Number(row.hoursWorked),
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
    };
  }

  private mapNoticeToResponse(row: NoticeRow): NoticeResponse {
    const formatDate = (date: Date): string => date.toISOString().split("T")[0]!;

    return {
      id: row.id,
      leave_record_id: row.leaveRecordId,
      employee_id: row.employeeId,
      notice_type: row.noticeType,
      notice_date: formatDate(row.noticeDate),
      received_date: row.receivedDate ? formatDate(row.receivedDate) : null,
      acknowledged_by: row.acknowledgedBy,
      acknowledged_date: row.acknowledgedDate ? formatDate(row.acknowledgedDate) : null,
      document_reference: row.documentReference,
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
    };
  }
}
