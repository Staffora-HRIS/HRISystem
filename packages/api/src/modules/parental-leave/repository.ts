/**
 * Unpaid Parental Leave Module - Repository Layer
 *
 * Provides data access methods for parental leave entitlements and bookings.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  CreateEntitlement,
  CreateBooking,
  BookingFilters,
  BookingStatus,
  PaginationQuery,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface EntitlementRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  childName: string;
  childDateOfBirth: Date;
  totalWeeksEntitled: string; // numeric comes as string from postgres
  weeksUsed: string;
  weeksRemaining: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  entitlementId: string;
  leaveYearStart: Date;
  weeksBooked: string; // numeric comes as string from postgres
  startDate: Date;
  endDate: Date;
  status: BookingStatus;
  approvedBy: string | null;
  notes: string | null;
  childName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ParentalLeaveRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Entitlement Methods
  // ===========================================================================

  /**
   * Find entitlements for an employee
   */
  async findEntitlementsByEmployee(
    context: TenantContext,
    employeeId: string
  ): Promise<EntitlementRow[]> {
    return this.db.withTransaction(context, async (tx) => {
      return tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id, child_name, child_date_of_birth,
          total_weeks_entitled, weeks_used, weeks_remaining,
          created_at, updated_at
        FROM app.parental_leave_entitlements
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY child_date_of_birth DESC
      `;
    });
  }

  /**
   * Find entitlement by ID
   */
  async findEntitlementById(
    context: TenantContext,
    id: string
  ): Promise<EntitlementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id, child_name, child_date_of_birth,
          total_weeks_entitled, weeks_used, weeks_remaining,
          created_at, updated_at
        FROM app.parental_leave_entitlements
        WHERE id = ${id}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Find entitlement by employee and child details (for duplicate check)
   */
  async findEntitlementByChild(
    context: TenantContext,
    employeeId: string,
    childName: string,
    childDateOfBirth: string
  ): Promise<EntitlementRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<EntitlementRow[]>`
        SELECT
          id, tenant_id, employee_id, child_name, child_date_of_birth,
          total_weeks_entitled, weeks_used, weeks_remaining,
          created_at, updated_at
        FROM app.parental_leave_entitlements
        WHERE employee_id = ${employeeId}::uuid
          AND child_name = ${childName}
          AND child_date_of_birth = ${childDateOfBirth}::date
      `;
    });

    return result[0] || null;
  }

  /**
   * Create an entitlement
   */
  async createEntitlement(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateEntitlement
  ): Promise<EntitlementRow> {
    const rows = await tx<EntitlementRow[]>`
      INSERT INTO app.parental_leave_entitlements (
        tenant_id, employee_id, child_name, child_date_of_birth,
        total_weeks_entitled
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.child_name},
        ${data.child_date_of_birth}::date,
        ${data.total_weeks_entitled ?? 18}
      )
      RETURNING
        id, tenant_id, employee_id, child_name, child_date_of_birth,
        total_weeks_entitled, weeks_used, weeks_remaining,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update weeks_used on an entitlement (within a transaction)
   */
  async updateWeeksUsed(
    tx: TransactionSql,
    entitlementId: string,
    weeksToAdd: number
  ): Promise<EntitlementRow> {
    const rows = await tx<EntitlementRow[]>`
      UPDATE app.parental_leave_entitlements
      SET weeks_used = weeks_used + ${weeksToAdd}
      WHERE id = ${entitlementId}::uuid
      RETURNING
        id, tenant_id, employee_id, child_name, child_date_of_birth,
        total_weeks_entitled, weeks_used, weeks_remaining,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  // ===========================================================================
  // Booking Methods
  // ===========================================================================

  /**
   * Find bookings with filters and pagination
   */
  async findBookings(
    context: TenantContext,
    filters: BookingFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<BookingRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<BookingRow[]>`
        SELECT
          b.id, b.tenant_id, b.employee_id, b.entitlement_id,
          b.leave_year_start, b.weeks_booked, b.start_date, b.end_date,
          b.status, b.approved_by, b.notes,
          e.child_name,
          b.created_at, b.updated_at
        FROM app.parental_leave_bookings b
        LEFT JOIN app.parental_leave_entitlements e ON e.id = b.entitlement_id
        WHERE 1=1
          ${filters.employee_id ? tx`AND b.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.entitlement_id ? tx`AND b.entitlement_id = ${filters.entitlement_id}::uuid` : tx``}
          ${filters.status ? tx`AND b.status = ${filters.status}` : tx``}
          ${cursor ? tx`AND b.id > ${cursor}::uuid` : tx``}
        ORDER BY b.start_date DESC, b.id
        LIMIT ${fetchLimit}
      `;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find booking by ID
   */
  async findBookingById(
    context: TenantContext,
    id: string
  ): Promise<BookingRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      return tx<BookingRow[]>`
        SELECT
          b.id, b.tenant_id, b.employee_id, b.entitlement_id,
          b.leave_year_start, b.weeks_booked, b.start_date, b.end_date,
          b.status, b.approved_by, b.notes,
          e.child_name,
          b.created_at, b.updated_at
        FROM app.parental_leave_bookings b
        LEFT JOIN app.parental_leave_entitlements e ON e.id = b.entitlement_id
        WHERE b.id = ${id}::uuid
      `;
    });

    return result[0] || null;
  }

  /**
   * Calculate total approved/requested weeks for a given entitlement and leave year.
   * Used to enforce the 4-weeks-per-year-per-child rule.
   */
  async getWeeksBookedInYear(
    tx: TransactionSql,
    entitlementId: string,
    leaveYearStart: string,
    excludeBookingId?: string
  ): Promise<number> {
    const rows = await tx<{ total: string }[]>`
      SELECT COALESCE(SUM(weeks_booked), 0)::numeric(4,1) as total
      FROM app.parental_leave_bookings
      WHERE entitlement_id = ${entitlementId}::uuid
        AND leave_year_start = ${leaveYearStart}::date
        AND status IN ('requested', 'approved')
        ${excludeBookingId ? tx`AND id != ${excludeBookingId}::uuid` : tx``}
    `;

    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Create a booking
   */
  async createBooking(
    tx: TransactionSql,
    context: TenantContext,
    data: {
      employeeId: string;
      entitlementId: string;
      leaveYearStart: string;
      weeksBooked: number;
      startDate: string;
      endDate: string;
      notes?: string;
    }
  ): Promise<BookingRow> {
    const rows = await tx<BookingRow[]>`
      INSERT INTO app.parental_leave_bookings (
        tenant_id, employee_id, entitlement_id,
        leave_year_start, weeks_booked, start_date, end_date,
        status, notes
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.entitlementId}::uuid,
        ${data.leaveYearStart}::date,
        ${data.weeksBooked},
        ${data.startDate}::date,
        ${data.endDate}::date,
        'requested',
        ${data.notes || null}
      )
      RETURNING
        id, tenant_id, employee_id, entitlement_id,
        leave_year_start, weeks_booked, start_date, end_date,
        status, approved_by, notes,
        created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update booking status
   */
  async updateBookingStatus(
    tx: TransactionSql,
    bookingId: string,
    status: BookingStatus,
    approvedBy?: string,
    notes?: string
  ): Promise<BookingRow> {
    const rows = await tx<BookingRow[]>`
      UPDATE app.parental_leave_bookings
      SET
        status = ${status},
        approved_by = ${approvedBy || null}::uuid,
        notes = CASE
          WHEN ${notes || null}::text IS NOT NULL THEN ${notes || null}
          ELSE notes
        END
      WHERE id = ${bookingId}::uuid
      RETURNING
        id, tenant_id, employee_id, entitlement_id,
        leave_year_start, weeks_booked, start_date, end_date,
        status, approved_by, notes,
        created_at, updated_at
    `;

    return rows[0]!;
  }
}
