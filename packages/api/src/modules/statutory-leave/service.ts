/**
 * Statutory Leave Module - Service Layer
 *
 * Implements business logic for UK statutory leave:
 * - Maternity Leave & Statutory Maternity Pay (SMP)
 * - Paternity Leave & Statutory Paternity Pay (SPP)
 * - Shared Parental Leave & Pay (ShPL / ShPP)
 * - Adoption Leave & Pay
 *
 * Enforces UK employment law rules, eligibility checks,
 * pay calculations, and KIT day limits.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  StatutoryLeaveRepository,
  StatutoryLeaveRow,
  StatutoryLeaveListRow,
  PayPeriodRow,
  KITDayRow,
} from "./repository";
import type { ServiceResult, PaginatedServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  StatutoryLeaveType,
  StatutoryLeaveStatus,
  StatutoryPayType,
  CreateStatutoryLeave,
  UpdateStatutoryLeave,
  CurtailLeave,
  CreateKITDay,
  StatutoryLeaveFilters,
  PaginationQuery,
  StatutoryLeaveResponse,
  StatutoryLeaveListItem,
  PayPeriodResponse,
  KITDayResponse,
  PayCalculationResponse,
  EligibilityResponse,
} from "./schemas";

// =============================================================================
// Constants - UK Statutory Rates (2024/25 tax year)
// =============================================================================

/**
 * Configurable statutory pay rates.
 * These should ultimately be managed via tenant configuration,
 * but are set as defaults based on current UK legislation.
 */
const STATUTORY_RATES = {
  /** Weekly flat rate for SMP (weeks 7-39), SPP, ShPP */
  FLAT_RATE_WEEKLY: 184.03,

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
  /** Maternity: max KIT days */
  MATERNITY_MAX_KIT_DAYS: 10,

  /** Paternity: total weeks */
  PATERNITY_TOTAL_WEEKS: 2,
  /** Paternity: must be taken within 56 days of birth */
  PATERNITY_DEADLINE_DAYS: 56,

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
// Valid State Transitions
// =============================================================================

const VALID_STATUS_TRANSITIONS: Record<StatutoryLeaveStatus, StatutoryLeaveStatus[]> = {
  planned: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "statutory_leave.created"
  | "statutory_leave.updated"
  | "statutory_leave.started"
  | "statutory_leave.completed"
  | "statutory_leave.cancelled"
  | "statutory_leave.curtailed"
  | "statutory_leave.pay_calculated"
  | "statutory_leave.kit_day_recorded";

// =============================================================================
// Service
// =============================================================================

export class StatutoryLeaveService {
  constructor(
    private repository: StatutoryLeaveRepository,
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
      "statutory_leave",
      aggregateId,
      eventType,
      { ...payload, actor: ctx.userId }
    );
  }

  // ---------------------------------------------------------------------------
  // List / Get
  // ---------------------------------------------------------------------------

  /**
   * List statutory leave records with filters and pagination
   */
  async listLeaveRecords(
    ctx: TenantContext,
    filters: StatutoryLeaveFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<StatutoryLeaveListItem>> {
    const result = await this.repository.findLeaveRecords(ctx, filters, pagination);

    return {
      items: result.items.map(this.mapToListItem),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single statutory leave record by ID with pay periods and KIT days
   */
  async getLeaveRecord(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    const record = await this.repository.findLeaveRecordById(ctx, id);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id },
        },
      };
    }

    // Fetch pay periods and KIT days
    const [payPeriods, kitDays] = await Promise.all([
      this.repository.findPayPeriods(ctx, id),
      this.repository.findKITDays(ctx, id),
    ]);

    const maxKitDays = this.getMaxKITDays(record.leaveType);

    return {
      success: true,
      data: this.mapToResponse(record, payPeriods, kitDays, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Create Statutory Leave
  // ---------------------------------------------------------------------------

  /**
   * Create a new statutory leave record.
   * Validates eligibility, date constraints, and generates pay schedule.
   */
  async createLeaveRecord(
    ctx: TenantContext,
    data: CreateStatutoryLeave,
    _idempotencyKey?: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
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
          message: "Employee must be active or on leave to request statutory leave",
          details: { status: employee.status },
        },
      };
    }

    // 2. Type-specific validation
    const validationResult = this.validateLeaveRequest(data, employee.hireDate);
    if (!validationResult.success) {
      return validationResult;
    }

    // 3. Check for overlapping leave
    const endDate = data.end_date || this.calculateEndDate(data.start_date, data.leave_type);
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
          message: "Overlapping statutory leave already exists for this period",
          details: {
            overlapping_ids: overlapping.map((r) => r.id),
          },
        },
      };
    }

    // 4. Calculate total weeks
    const totalWeeks = this.calculateTotalWeeks(data.leave_type, data.start_date, endDate);

    // 5. Create record and pay schedule in a single transaction
    const id = crypto.randomUUID();

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const record = await this.repository.createLeaveRecord(tx, ctx, {
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
        notes: data.notes,
        createdBy: ctx.userId,
      });

      // Generate pay schedule if average weekly earnings provided
      let payPeriods: PayPeriodRow[] = [];
      if (data.average_weekly_earnings !== undefined && data.average_weekly_earnings !== null) {
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

      // Emit domain event
      await this.emitEvent(tx, ctx, id, "statutory_leave.created", {
        leaveRecord: {
          id: record.id,
          employeeId: record.employeeId,
          leaveType: record.leaveType,
          startDate: data.start_date,
          endDate,
          totalWeeks,
        },
      });

      return { record, payPeriods };
    });

    const maxKitDays = this.getMaxKITDays(data.leave_type);

    return {
      success: true,
      data: this.mapToResponse(result.record, result.payPeriods, [], maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Update Statutory Leave
  // ---------------------------------------------------------------------------

  /**
   * Update a statutory leave record (only if planned or active)
   */
  async updateLeaveRecord(
    ctx: TenantContext,
    id: string,
    data: UpdateStatutoryLeave,
    _idempotencyKey?: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    const existing = await this.repository.findLeaveRecordById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id },
        },
      };
    }

    if (existing.status === "completed" || existing.status === "cancelled") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot update a ${existing.status} leave record`,
          details: { current_status: existing.status },
        },
      };
    }

    // Recalculate total weeks if dates changed
    const startDate = data.start_date || this.formatDate(existing.startDate);
    const endDate = data.end_date || this.formatDate(existing.endDate);
    const totalWeeks = this.calculateTotalWeeks(existing.leaveType, startDate, endDate);

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateLeaveRecord(tx, ctx, id, {
        expectedDate: data.expected_date,
        actualDate: data.actual_date,
        startDate: data.start_date,
        endDate: data.end_date,
        totalWeeks,
        matb1Received: data.matb1_received,
        matb1Date: data.matb1_date,
        averageWeeklyEarnings: data.average_weekly_earnings,
        notes: data.notes,
      });

      if (!updated) {
        throw new Error("Failed to update statutory leave record");
      }

      // Recalculate pay schedule if earnings changed
      if (data.average_weekly_earnings !== undefined) {
        await this.repository.deletePayPeriods(tx, ctx, id);
        if (data.average_weekly_earnings !== null) {
          await this.generatePaySchedule(
            tx,
            ctx,
            id,
            existing.leaveType,
            startDate,
            totalWeeks,
            data.average_weekly_earnings
          );
        }
      }

      await this.emitEvent(tx, ctx, id, "statutory_leave.updated", {
        leaveRecordId: id,
        changes: data,
      });

      return updated;
    });

    // Refetch with pay periods and KIT days
    const [payPeriods, kitDays] = await Promise.all([
      this.repository.findPayPeriods(ctx, id),
      this.repository.findKITDays(ctx, id),
    ]);

    const maxKitDays = this.getMaxKITDays(existing.leaveType);

    return {
      success: true,
      data: this.mapToResponse(result, payPeriods, kitDays, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Status Transitions
  // ---------------------------------------------------------------------------

  /**
   * Start a statutory leave (transition planned -> active)
   */
  async startLeave(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    return this.transitionStatus(ctx, id, "active", "statutory_leave.started");
  }

  /**
   * Complete a statutory leave (transition active -> completed)
   */
  async completeLeave(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    return this.transitionStatus(ctx, id, "completed", "statutory_leave.completed");
  }

  /**
   * Cancel a statutory leave (transition planned/active -> cancelled)
   */
  async cancelLeave(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    return this.transitionStatus(ctx, id, "cancelled", "statutory_leave.cancelled");
  }

  /**
   * Generic status transition handler
   */
  private async transitionStatus(
    ctx: TenantContext,
    id: string,
    toStatus: StatutoryLeaveStatus,
    eventType: DomainEventType
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    const existing = await this.repository.findLeaveRecordById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id },
        },
      };
    }

    // Validate transition
    const validTransitions = VALID_STATUS_TRANSITIONS[existing.status];
    if (!validTransitions.includes(toStatus)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${existing.status}' to '${toStatus}'`,
          details: {
            current_status: existing.status,
            requested_status: toStatus,
            valid_transitions: validTransitions,
          },
        },
      };
    }

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateLeaveRecord(tx, ctx, id, {
        status: toStatus,
      });

      if (!updated) {
        throw new Error("Failed to update statutory leave record status");
      }

      await this.emitEvent(tx, ctx, id, eventType, {
        leaveRecordId: id,
        fromStatus: existing.status,
        toStatus,
      });

      return updated;
    });

    const [payPeriods, kitDays] = await Promise.all([
      this.repository.findPayPeriods(ctx, id),
      this.repository.findKITDays(ctx, id),
    ]);

    const maxKitDays = this.getMaxKITDays(existing.leaveType);

    return {
      success: true,
      data: this.mapToResponse(result, payPeriods, kitDays, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // Curtailment (Maternity -> Shared Parental conversion)
  // ---------------------------------------------------------------------------

  /**
   * Curtail maternity leave to enable shared parental leave.
   * The mother must curtail her maternity leave to create ShPL entitlement.
   */
  async curtailLeave(
    ctx: TenantContext,
    id: string,
    data: CurtailLeave
  ): Promise<ServiceResult<StatutoryLeaveResponse>> {
    const existing = await this.repository.findLeaveRecordById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id },
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
      const twoWeeksAfterStart = new Date(existing.startDate);
      twoWeeksAfterStart.setDate(twoWeeksAfterStart.getDate() + 14);
      if (new Date(curtailmentDate) < twoWeeksAfterStart) {
        return {
          success: false,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Maternity leave cannot be curtailed before the 2-week compulsory leave period",
            details: {
              earliest_curtailment: this.formatDate(twoWeeksAfterStart),
            },
          },
        };
      }
    }

    // Recalculate weeks up to curtailment
    const newTotalWeeks = this.calculateTotalWeeks(
      existing.leaveType,
      startDateStr,
      curtailmentDate
    );

    const result = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateLeaveRecord(tx, ctx, id, {
        curtailmentDate,
        endDate: curtailmentDate,
        totalWeeks: newTotalWeeks,
      });

      if (!updated) {
        throw new Error("Failed to curtail statutory leave record");
      }

      // Recalculate pay schedule for shortened period
      const earnings = existing.averageWeeklyEarnings
        ? Number(existing.averageWeeklyEarnings)
        : null;

      if (earnings !== null) {
        await this.repository.deletePayPeriods(tx, ctx, id);
        await this.generatePaySchedule(
          tx,
          ctx,
          id,
          existing.leaveType,
          startDateStr,
          newTotalWeeks,
          earnings
        );
      }

      await this.emitEvent(tx, ctx, id, "statutory_leave.curtailed", {
        leaveRecordId: id,
        curtailmentDate,
        originalEndDate: this.formatDate(existing.endDate),
        newTotalWeeks,
      });

      return updated;
    });

    const [payPeriods, kitDays] = await Promise.all([
      this.repository.findPayPeriods(ctx, id),
      this.repository.findKITDays(ctx, id),
    ]);

    const maxKitDays = this.getMaxKITDays(existing.leaveType);

    return {
      success: true,
      data: this.mapToResponse(result, payPeriods, kitDays, maxKitDays),
    };
  }

  // ---------------------------------------------------------------------------
  // KIT Days
  // ---------------------------------------------------------------------------

  /**
   * Record a Keeping In Touch (KIT) day.
   * Maternity/adoption: max 10 KIT days
   * Shared parental: max 20 SPLIT days
   */
  async recordKITDay(
    ctx: TenantContext,
    leaveId: string,
    data: CreateKITDay
  ): Promise<ServiceResult<KITDayResponse>> {
    const record = await this.repository.findLeaveRecordById(ctx, leaveId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id: leaveId },
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
          message: "KIT days are not applicable for paternity leave",
        },
      };
    }

    // Check KIT day limit
    const maxKitDays = this.getMaxKITDays(record.leaveType);
    const currentCount = await this.repository.countKITDays(ctx, leaveId);

    if (currentCount >= maxKitDays) {
      return {
        success: false,
        error: {
          code: ErrorCodes.LIMIT_EXCEEDED,
          message: `Maximum ${maxKitDays} KIT days allowed. ${currentCount} already recorded.`,
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
        leaveRecordId: leaveId,
        workDate: data.work_date,
        hoursWorked: data.hours_worked,
        notes: data.notes,
      });

      await this.emitEvent(tx, ctx, leaveId, "statutory_leave.kit_day_recorded", {
        leaveRecordId: leaveId,
        kitDayId: kitDay.id,
        workDate: data.work_date,
        hoursWorked: data.hours_worked,
        kitDaysUsed: currentCount + 1,
        kitDaysRemaining: maxKitDays - currentCount - 1,
      });

      return kitDay;
    });

    return {
      success: true,
      data: this.mapKITDayToResponse(result),
    };
  }

  /**
   * List KIT days for a leave record
   */
  async listKITDays(
    ctx: TenantContext,
    leaveId: string
  ): Promise<ServiceResult<KITDayResponse[]>> {
    const record = await this.repository.findLeaveRecordById(ctx, leaveId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id: leaveId },
        },
      };
    }

    const kitDays = await this.repository.findKITDays(ctx, leaveId);

    return {
      success: true,
      data: kitDays.map(this.mapKITDayToResponse),
    };
  }

  // ---------------------------------------------------------------------------
  // Pay Calculation
  // ---------------------------------------------------------------------------

  /**
   * Get or calculate pay breakdown for a leave record
   */
  async getPayCalculation(
    ctx: TenantContext,
    leaveId: string
  ): Promise<ServiceResult<PayCalculationResponse>> {
    const record = await this.repository.findLeaveRecordById(ctx, leaveId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id: leaveId },
        },
      };
    }

    const payPeriods = await this.repository.findPayPeriods(ctx, leaveId);

    // If no pay periods exist but we have earnings, generate them
    if (payPeriods.length === 0 && record.averageWeeklyEarnings) {
      const earnings = Number(record.averageWeeklyEarnings);
      const startDateStr = this.formatDate(record.startDate);

      const generated = await this.db.withTransaction(ctx, async (tx) => {
        const periods = await this.generatePaySchedule(
          tx,
          ctx,
          leaveId,
          record.leaveType,
          startDateStr,
          record.totalWeeks,
          earnings
        );

        await this.emitEvent(tx, ctx, leaveId, "statutory_leave.pay_calculated", {
          leaveRecordId: leaveId,
          totalPeriods: periods.length,
        });

        return periods;
      });

      return {
        success: true,
        data: this.buildPayCalculation(record, generated),
      };
    }

    return {
      success: true,
      data: this.buildPayCalculation(record, payPeriods),
    };
  }

  /**
   * Recalculate pay for a leave record (e.g., after earnings update)
   */
  async recalculatePay(
    ctx: TenantContext,
    leaveId: string
  ): Promise<ServiceResult<PayCalculationResponse>> {
    const record = await this.repository.findLeaveRecordById(ctx, leaveId);
    if (!record) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Statutory leave record not found",
          details: { id: leaveId },
        },
      };
    }

    if (!record.averageWeeklyEarnings) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Average weekly earnings must be set before calculating pay",
        },
      };
    }

    const earnings = Number(record.averageWeeklyEarnings);
    const startDateStr = this.formatDate(record.startDate);

    const generated = await this.db.withTransaction(ctx, async (tx) => {
      await this.repository.deletePayPeriods(tx, ctx, leaveId);

      const periods = await this.generatePaySchedule(
        tx,
        ctx,
        leaveId,
        record.leaveType,
        startDateStr,
        record.totalWeeks,
        earnings
      );

      await this.emitEvent(tx, ctx, leaveId, "statutory_leave.pay_calculated", {
        leaveRecordId: leaveId,
        totalPeriods: periods.length,
        recalculated: true,
      });

      return periods;
    });

    return {
      success: true,
      data: this.buildPayCalculation(record, generated),
    };
  }

  // ---------------------------------------------------------------------------
  // Eligibility Check
  // ---------------------------------------------------------------------------

  /**
   * Check employee eligibility for all statutory leave types.
   * Requires 26 weeks continuous employment by the 15th week before expected due date.
   */
  async checkEligibility(
    ctx: TenantContext,
    employeeId: string
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

    // Calculate continuous weeks of employment from hire date to now
    const now = new Date();
    const hireDate = new Date(employee.hireDate);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const continuousWeeks = Math.floor((now.getTime() - hireDate.getTime()) / msPerWeek);
    const requiredWeeks = STATUTORY_RATES.QUALIFYING_WEEKS;

    const eligible = continuousWeeks >= requiredWeeks;
    const baseCheck = {
      continuous_weeks: continuousWeeks,
      required_weeks: requiredWeeks,
    };

    const isActiveOrLeave = employee.status === "active" || employee.status === "on_leave";

    const makeResult = (type: string) => ({
      eligible: eligible && isActiveOrLeave,
      ...baseCheck,
      ...(!(eligible && isActiveOrLeave)
        ? {
            reason: !isActiveOrLeave
              ? `Employee status '${employee.status}' does not qualify for ${type} leave`
              : `Employee has ${continuousWeeks} weeks of service; ${requiredWeeks} weeks required`,
          }
        : {}),
    });

    return {
      success: true,
      data: {
        employee_id: employeeId,
        maternity: makeResult("maternity"),
        paternity: makeResult("paternity"),
        shared_parental: makeResult("shared parental"),
        adoption: makeResult("adoption"),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Pay Schedule Generation (Internal)
  // ---------------------------------------------------------------------------

  /**
   * Generate weekly pay periods for a statutory leave record.
   * Rules:
   *   Maternity/Adoption: 6 weeks @ 90% earnings, 33 weeks @ flat rate, remainder unpaid
   *   Paternity: all weeks at flat rate (max 2 weeks)
   *   Shared Parental: all paid weeks at flat rate (max 37 weeks pay)
   */
  private async generatePaySchedule(
    tx: TransactionSql,
    ctx: TenantContext,
    leaveRecordId: string,
    leaveType: StatutoryLeaveType,
    startDate: string,
    totalWeeks: number,
    averageWeeklyEarnings: number
  ): Promise<PayPeriodRow[]> {
    const periods: Array<{
      id: string;
      weekNumber: number;
      startDate: string;
      endDate: string;
      payType: StatutoryPayType;
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
   * Calculate pay for a single week based on leave type and week number
   */
  private calculateWeeklyPay(
    leaveType: StatutoryLeaveType,
    weekNumber: number,
    averageWeeklyEarnings: number
  ): { payType: StatutoryPayType; amount: number } {
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
          // Flat rate or 90% of earnings, whichever is lower
          return {
            payType: "flat_rate",
            amount: Math.min(STATUTORY_RATES.FLAT_RATE_WEEKLY, ninetyPercent),
          };
        }
        return { payType: "unpaid", amount: 0 };
      }

      case "paternity": {
        // All paternity weeks at flat rate (max 2 weeks)
        if (weekNumber <= STATUTORY_RATES.PATERNITY_TOTAL_WEEKS) {
          return {
            payType: "flat_rate",
            amount: Math.min(STATUTORY_RATES.FLAT_RATE_WEEKLY, ninetyPercent),
          };
        }
        return { payType: "unpaid", amount: 0 };
      }

      case "shared_parental": {
        // Up to 37 weeks of pay at flat rate
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

  // ---------------------------------------------------------------------------
  // Validation (Internal)
  // ---------------------------------------------------------------------------

  /**
   * Validate a leave request based on leave type rules
   */
  private validateLeaveRequest(
    data: CreateStatutoryLeave,
    _hireDate: Date
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

        // MATB1 should ideally be received but is not a hard blocker for planning
        break;
      }

      case "paternity": {
        // Must be taken within 56 days of expected/actual date
        const deadlineDate = new Date(data.actual_date || data.expected_date);
        deadlineDate.setDate(deadlineDate.getDate() + STATUTORY_RATES.PATERNITY_DEADLINE_DAYS);

        const endDate = data.end_date
          ? new Date(data.end_date)
          : new Date(startDate.getTime() + STATUTORY_RATES.PATERNITY_TOTAL_WEEKS * 7 * 24 * 60 * 60 * 1000);

        if (endDate > deadlineDate) {
          return {
            success: false,
            error: {
              code: ErrorCodes.VALIDATION_ERROR,
              message: `Paternity leave must be completed within ${STATUTORY_RATES.PATERNITY_DEADLINE_DAYS} days of the birth/placement date`,
              details: {
                deadline: this.formatDate(deadlineDate),
                requested_end: data.end_date || this.formatDate(endDate),
              },
            },
          };
        }

        // Paternity leave is 1 or 2 weeks only
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
              message: `Paternity leave is limited to ${STATUTORY_RATES.PATERNITY_TOTAL_WEEKS} weeks`,
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
        // Similar rules to maternity
        break;
      }
    }

    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Calculate total weeks from start to end date
   */
  private calculateTotalWeeks(
    leaveType: StatutoryLeaveType,
    startDate: string,
    endDate: string
  ): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeks = Math.ceil((end.getTime() - start.getTime() + 1) / msPerWeek);

    // Enforce type-specific maximums
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

  /**
   * Calculate default end date based on leave type
   */
  private calculateEndDate(startDate: string, leaveType: StatutoryLeaveType): string {
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

  /**
   * Get maximum KIT days for a leave type
   */
  private getMaxKITDays(leaveType: StatutoryLeaveType): number {
    switch (leaveType) {
      case "maternity":
        return STATUTORY_RATES.MATERNITY_MAX_KIT_DAYS;
      case "adoption":
        return STATUTORY_RATES.ADOPTION_MAX_KIT_DAYS;
      case "shared_parental":
        return STATUTORY_RATES.SPL_MAX_KIT_DAYS;
      case "paternity":
        return 0; // No KIT days for paternity
      default:
        return 0;
    }
  }

  /**
   * Format a Date to YYYY-MM-DD string
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
  }

  // ---------------------------------------------------------------------------
  // Response Mappers
  // ---------------------------------------------------------------------------

  private buildPayCalculation(
    record: StatutoryLeaveRow,
    payPeriods: PayPeriodRow[]
  ): PayCalculationResponse {
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
      total_pay: Math.round(totalPay * 100) / 100,
      periods,
    };
  }

  private mapToResponse(
    row: StatutoryLeaveRow,
    payPeriods?: PayPeriodRow[],
    kitDays?: KITDayRow[],
    maxKitDays?: number
  ): StatutoryLeaveResponse {
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
      matb1_received: row.matb1Received,
      matb1_date: row.matb1Date ? this.formatDate(row.matb1Date) : null,
      partner_employee_id: row.partnerEmployeeId,
      curtailment_date: row.curtailmentDate ? this.formatDate(row.curtailmentDate) : null,
      status: row.status,
      average_weekly_earnings: row.averageWeeklyEarnings
        ? Number(row.averageWeeklyEarnings)
        : null,
      notes: row.notes,
      created_by: row.createdBy,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      pay_periods: payPeriods?.map(this.mapPayPeriodToResponse),
      kit_days: kitDays?.map(this.mapKITDayToResponse),
      kit_days_used: kitDaysUsed,
      kit_days_remaining: maxKitDays !== undefined ? maxKitDays - kitDaysUsed : undefined,
    };
  }

  private mapToListItem(row: StatutoryLeaveListRow): StatutoryLeaveListItem {
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
    };
  }

  private mapPayPeriodToResponse(row: PayPeriodRow): PayPeriodResponse {
    const formatDate = (date: Date): string => date.toISOString().split("T")[0]!;

    return {
      id: row.id,
      leave_record_id: row.leaveRecordId,
      week_number: row.weekNumber,
      start_date: formatDate(row.startDate),
      end_date: formatDate(row.endDate),
      pay_type: row.payType,
      amount: Number(row.amount),
      created_at: row.createdAt.toISOString(),
    };
  }

  private mapKITDayToResponse(row: KITDayRow): KITDayResponse {
    const formatDate = (date: Date): string => date.toISOString().split("T")[0]!;

    return {
      id: row.id,
      leave_record_id: row.leaveRecordId,
      work_date: formatDate(row.workDate),
      hours_worked: Number(row.hoursWorked),
      notes: row.notes,
      created_at: row.createdAt.toISOString(),
    };
  }
}
