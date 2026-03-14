/**
 * Unpaid Parental Leave Module - Service Layer
 *
 * Implements business logic for UK unpaid parental leave.
 * Enforces statutory rules from the Employment Rights Act 1996
 * and Maternity and Parental Leave etc. Regulations 1999:
 *
 * - 18 weeks per child (up to age 18)
 * - Minimum 1-week blocks
 * - Maximum 4 weeks per year per child
 * - 21 days' notice required before start date
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  ParentalLeaveRepository,
  EntitlementRow,
  BookingRow,
} from "./repository";
import type {
  ServiceResult,
  PaginatedServiceResult,
  TenantContext,
} from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CreateEntitlement,
  CreateBooking,
  BookingFilters,
  PaginationQuery,
  EntitlementResponse,
  BookingResponse,
  BookingDecision,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Maximum weeks per child per year (UK regulation) */
const MAX_WEEKS_PER_YEAR = 4;

/** Minimum weeks per booking (must be in whole-week blocks) */
const MIN_WEEKS_PER_BOOKING = 1;

/** Minimum notice days required (21 days) */
const NOTICE_DAYS_REQUIRED = 21;

/** Maximum child age for eligibility */
const MAX_CHILD_AGE = 18;

// =============================================================================
// Domain Event Types
// =============================================================================

type DomainEventType =
  | "parental_leave.entitlement.created"
  | "parental_leave.booking.created"
  | "parental_leave.booking.approved"
  | "parental_leave.booking.rejected"
  | "parental_leave.booking.cancelled";

// =============================================================================
// Service
// =============================================================================

export class ParentalLeaveService {
  constructor(
    private repository: ParentalLeaveRepository,
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
    eventType: DomainEventType,
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
  // Entitlement Operations
  // ===========================================================================

  /**
   * Register a child for parental leave entitlement
   */
  async createEntitlement(
    context: TenantContext,
    data: CreateEntitlement,
    _idempotencyKey?: string
  ): Promise<ServiceResult<EntitlementResponse>> {
    // Validate child is under 18
    const childAge = this.calculateChildAge(data.child_date_of_birth);
    if (childAge >= MAX_CHILD_AGE) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Child must be under ${MAX_CHILD_AGE} years old. Current age: ${childAge} years.`,
          details: { child_date_of_birth: data.child_date_of_birth, age: childAge },
        },
      };
    }

    // Validate child DOB is not in the future
    const dob = new Date(data.child_date_of_birth);
    if (dob > new Date()) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Child date of birth cannot be in the future",
          details: { child_date_of_birth: data.child_date_of_birth },
        },
      };
    }

    // Check for duplicate entitlement
    const existing = await this.repository.findEntitlementByChild(
      context,
      data.employee_id,
      data.child_name,
      data.child_date_of_birth
    );
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "An entitlement already exists for this child",
          details: {
            employee_id: data.employee_id,
            child_name: data.child_name,
            child_date_of_birth: data.child_date_of_birth,
            existing_entitlement_id: existing.id,
          },
        },
      };
    }

    // Create entitlement in transaction with outbox event
    const result = await this.db.withTransaction(context, async (tx) => {
      const entitlement = await this.repository.createEntitlement(tx, context, data);

      await this.emitEvent(
        tx,
        context,
        "parental_leave_entitlement",
        entitlement.id,
        "parental_leave.entitlement.created",
        { entitlement: this.mapEntitlementToResponse(entitlement) }
      );

      return entitlement;
    });

    return {
      success: true,
      data: this.mapEntitlementToResponse(result),
    };
  }

  /**
   * Get entitlements for an employee
   */
  async getEntitlements(
    context: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<EntitlementResponse[]>> {
    const entitlements = await this.repository.findEntitlementsByEmployee(
      context,
      employeeId
    );

    return {
      success: true,
      data: entitlements.map((e) => this.mapEntitlementToResponse(e)),
    };
  }

  // ===========================================================================
  // Booking Operations
  // ===========================================================================

  /**
   * Create a parental leave booking
   *
   * Validates:
   * - Entitlement exists and belongs to the employee
   * - Child is under 18
   * - Minimum 1-week block
   * - Maximum 4 weeks per year per child
   * - Sufficient remaining entitlement
   * - 21 days' notice
   */
  async createBooking(
    context: TenantContext,
    data: CreateBooking,
    _idempotencyKey?: string
  ): Promise<ServiceResult<BookingResponse>> {
    // Validate entitlement exists
    const entitlement = await this.repository.findEntitlementById(
      context,
      data.entitlement_id
    );
    if (!entitlement) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Parental leave entitlement not found",
          details: { entitlement_id: data.entitlement_id },
        },
      };
    }

    // Validate entitlement belongs to the specified employee
    if (entitlement.employeeId !== data.employee_id) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Entitlement does not belong to the specified employee",
          details: {
            entitlement_employee_id: entitlement.employeeId,
            requested_employee_id: data.employee_id,
          },
        },
      };
    }

    // Validate child is still under 18
    const childAge = this.calculateChildAge(
      entitlement.childDateOfBirth.toISOString().split("T")[0]!
    );
    if (childAge >= MAX_CHILD_AGE) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Child is ${childAge} years old. Parental leave is only available until the child turns ${MAX_CHILD_AGE}.`,
          details: { child_age: childAge },
        },
      };
    }

    // Validate minimum 1-week block
    if (data.weeks_booked < MIN_WEEKS_PER_BOOKING) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Parental leave must be booked in blocks of at least ${MIN_WEEKS_PER_BOOKING} week(s)`,
          details: { weeks_booked: data.weeks_booked, minimum: MIN_WEEKS_PER_BOOKING },
        },
      };
    }

    // Validate sufficient remaining entitlement
    const weeksRemaining = Number(entitlement.weeksRemaining);
    if (data.weeks_booked > weeksRemaining) {
      return {
        success: false,
        error: {
          code: "INSUFFICIENT_LEAVE_BALANCE",
          message: `Insufficient parental leave balance. Requested: ${data.weeks_booked} weeks, Remaining: ${weeksRemaining} weeks.`,
          details: {
            weeks_requested: data.weeks_booked,
            weeks_remaining: weeksRemaining,
          },
        },
      };
    }

    // Validate 21 days' notice
    const startDate = new Date(data.start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysDifference = Math.floor(
      (startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDifference < NOTICE_DAYS_REQUIRED) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `At least ${NOTICE_DAYS_REQUIRED} days' notice is required. Start date is ${daysDifference} days from today.`,
          details: {
            start_date: data.start_date,
            days_notice: daysDifference,
            required_notice: NOTICE_DAYS_REQUIRED,
          },
        },
      };
    }

    // Calculate end date (weeks_booked * 7 days from start)
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + data.weeks_booked * 7 - 1);
    const endDateStr = endDate.toISOString().split("T")[0]!;

    // Calculate leave year start (based on employee's start date pattern,
    // simplified to calendar year of the booking start date)
    const leaveYearStart = `${startDate.getFullYear()}-01-01`;

    // Create booking inside transaction to enforce 4-weeks-per-year rule atomically
    const result = await this.db.withTransaction(context, async (tx) => {
      // Check max 4 weeks per year per child (inside transaction for atomicity)
      const weeksAlreadyBooked = await this.repository.getWeeksBookedInYear(
        tx,
        data.entitlement_id,
        leaveYearStart
      );

      if (weeksAlreadyBooked + data.weeks_booked > MAX_WEEKS_PER_YEAR) {
        throw new BookingValidationError(
          ErrorCodes.LIMIT_EXCEEDED,
          `Maximum ${MAX_WEEKS_PER_YEAR} weeks per year per child. Already booked: ${weeksAlreadyBooked} weeks, Requested: ${data.weeks_booked} weeks.`,
          {
            max_per_year: MAX_WEEKS_PER_YEAR,
            already_booked: weeksAlreadyBooked,
            requested: data.weeks_booked,
          }
        );
      }

      const booking = await this.repository.createBooking(tx, context, {
        employeeId: data.employee_id,
        entitlementId: data.entitlement_id,
        leaveYearStart,
        weeksBooked: data.weeks_booked,
        startDate: data.start_date,
        endDate: endDateStr,
        notes: data.notes,
      });

      await this.emitEvent(
        tx,
        context,
        "parental_leave_booking",
        booking.id,
        "parental_leave.booking.created",
        { booking: this.mapBookingToResponse(booking) }
      );

      return booking;
    });

    return {
      success: true,
      data: this.mapBookingToResponse(result),
    };
  }

  /**
   * List bookings with filters and pagination
   */
  async listBookings(
    context: TenantContext,
    filters: BookingFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedServiceResult<BookingResponse>> {
    const result = await this.repository.findBookings(context, filters, pagination);

    return {
      items: result.items.map((b) => this.mapBookingToResponse(b)),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Approve a parental leave booking.
   * Also increments weeks_used on the entitlement.
   */
  async approveBooking(
    context: TenantContext,
    bookingId: string,
    decision: BookingDecision
  ): Promise<ServiceResult<BookingResponse>> {
    const booking = await this.repository.findBookingById(context, bookingId);
    if (!booking) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Booking not found",
          details: { id: bookingId },
        },
      };
    }

    if (booking.status !== "requested") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot approve a booking with status '${booking.status}'. Only 'requested' bookings can be approved.`,
          details: { current_status: booking.status, expected_status: "requested" },
        },
      };
    }

    // Approve booking and update entitlement in same transaction
    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateBookingStatus(
        tx,
        bookingId,
        "approved",
        context.userId,
        decision.notes
      );

      // Increment weeks_used on the entitlement
      await this.repository.updateWeeksUsed(
        tx,
        booking.entitlementId,
        Number(booking.weeksBooked)
      );

      await this.emitEvent(
        tx,
        context,
        "parental_leave_booking",
        bookingId,
        "parental_leave.booking.approved",
        {
          booking: this.mapBookingToResponse(updated),
          approved_by: context.userId,
        }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapBookingToResponse(result),
    };
  }

  /**
   * Reject a parental leave booking
   */
  async rejectBooking(
    context: TenantContext,
    bookingId: string,
    decision: BookingDecision
  ): Promise<ServiceResult<BookingResponse>> {
    const booking = await this.repository.findBookingById(context, bookingId);
    if (!booking) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Booking not found",
          details: { id: bookingId },
        },
      };
    }

    if (booking.status !== "requested") {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot reject a booking with status '${booking.status}'. Only 'requested' bookings can be rejected.`,
          details: { current_status: booking.status, expected_status: "requested" },
        },
      };
    }

    const result = await this.db.withTransaction(context, async (tx) => {
      const updated = await this.repository.updateBookingStatus(
        tx,
        bookingId,
        "rejected",
        context.userId,
        decision.notes
      );

      await this.emitEvent(
        tx,
        context,
        "parental_leave_booking",
        bookingId,
        "parental_leave.booking.rejected",
        {
          booking: this.mapBookingToResponse(updated),
          rejected_by: context.userId,
        }
      );

      return updated;
    });

    return {
      success: true,
      data: this.mapBookingToResponse(result),
    };
  }

  // ===========================================================================
  // Mapping Helpers
  // ===========================================================================

  private calculateChildAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  private mapEntitlementToResponse(row: EntitlementRow): EntitlementResponse {
    const dob = row.childDateOfBirth instanceof Date
      ? row.childDateOfBirth.toISOString().split("T")[0]!
      : String(row.childDateOfBirth);
    const childAge = this.calculateChildAge(dob);

    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      child_name: row.childName,
      child_date_of_birth: dob,
      total_weeks_entitled: Number(row.totalWeeksEntitled),
      weeks_used: Number(row.weeksUsed),
      weeks_remaining: Number(row.weeksRemaining),
      child_age_years: childAge,
      is_eligible: childAge < MAX_CHILD_AGE,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }

  private mapBookingToResponse(row: BookingRow): BookingResponse {
    return {
      id: row.id,
      tenant_id: row.tenantId,
      employee_id: row.employeeId,
      entitlement_id: row.entitlementId,
      leave_year_start: row.leaveYearStart instanceof Date
        ? row.leaveYearStart.toISOString().split("T")[0]!
        : String(row.leaveYearStart),
      weeks_booked: Number(row.weeksBooked),
      start_date: row.startDate instanceof Date
        ? row.startDate.toISOString().split("T")[0]!
        : String(row.startDate),
      end_date: row.endDate instanceof Date
        ? row.endDate.toISOString().split("T")[0]!
        : String(row.endDate),
      status: row.status,
      approved_by: row.approvedBy || null,
      notes: row.notes || null,
      child_name: row.childName,
      created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
    };
  }
}

// =============================================================================
// Internal Error Type (caught by transaction, mapped to ServiceResult)
// =============================================================================

class BookingValidationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BookingValidationError";
  }
}

// Re-export for route handler catch block
export { BookingValidationError };
