/**
 * Parental Bereavement Leave Module - Repository Layer
 *
 * Provides data access methods for parental bereavement leave records.
 * All methods respect RLS through tenant context (db.withTransaction).
 * Uses cursor-based pagination for list operations.
 *
 * Table: app.parental_bereavement_leave
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateBereavementLeave,
  UpdateBereavementLeave,
  BereavementLeaveFilters,
  BereavementStatus,
  PaginationQuery,
} from "./schemas";

export type { TenantContext };

// =============================================================================
// Types
// =============================================================================

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Database row type for parental_bereavement_leave table.
 * Column names are camelCase due to postgres.js column transform.
 */
export interface BereavementLeaveRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  childName: string;
  dateOfDeath: Date;
  leaveStartDate: Date;
  leaveEndDate: Date;
  spbpEligible: boolean;
  spbpRateWeekly: string | null; // numeric comes as string from postgres.js
  status: BereavementStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class BereavementRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * List parental bereavement leave records with cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    filters: BereavementLeaveFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<BereavementLeaveRow>> {
    const limit = pagination.limit ?? 20;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<BereavementLeaveRow[]>`
        SELECT
          id,
          tenant_id,
          employee_id,
          child_name,
          date_of_death,
          leave_start_date,
          leave_end_date,
          spbp_eligible,
          spbp_rate_weekly,
          status,
          notes,
          created_at,
          updated_at
        FROM parental_bereavement_leave
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}` : tx``}
          ${filters.date_of_death_from ? tx`AND date_of_death >= ${filters.date_of_death_from}` : tx``}
          ${filters.date_of_death_to ? tx`AND date_of_death <= ${filters.date_of_death_to}` : tx``}
          ${pagination.cursor ? tx`AND id < ${pagination.cursor}` : tx``}
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit + 1}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single bereavement leave record by ID.
   */
  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<BereavementLeaveRow | null> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<BereavementLeaveRow[]>`
        SELECT
          id,
          tenant_id,
          employee_id,
          child_name,
          date_of_death,
          leave_start_date,
          leave_end_date,
          spbp_eligible,
          spbp_rate_weekly,
          status,
          notes,
          created_at,
          updated_at
        FROM parental_bereavement_leave
        WHERE id = ${id}
      `;

      return rows.length > 0 ? rows[0]! : null;
    });
  }

  /**
   * Count total leave days taken for an employee for a specific bereavement
   * (identified by date_of_death). Used for validating the 2-week maximum
   * across multiple leave blocks.
   */
  async countLeaveDaysForBereavement(
    ctx: TenantContext,
    tx: TransactionSql<Record<string, unknown>>,
    employeeId: string,
    dateOfDeath: string,
    excludeId?: string
  ): Promise<number> {
    const rows = await tx<{ totalDays: string }[]>`
      SELECT COALESCE(SUM(leave_end_date - leave_start_date), 0) AS total_days
      FROM parental_bereavement_leave
      WHERE employee_id = ${employeeId}
        AND date_of_death = ${dateOfDeath}
        ${excludeId ? tx`AND id != ${excludeId}` : tx``}
    `;

    return Number(rows[0]?.totalDays ?? 0);
  }

  /**
   * Create a new parental bereavement leave record.
   * Returns the created row.
   */
  async create(
    ctx: TenantContext,
    tx: TransactionSql<Record<string, unknown>>,
    data: CreateBereavementLeave
  ): Promise<BereavementLeaveRow> {
    const id = crypto.randomUUID();

    const rows = await tx<BereavementLeaveRow[]>`
      INSERT INTO parental_bereavement_leave (
        id,
        tenant_id,
        employee_id,
        child_name,
        date_of_death,
        leave_start_date,
        leave_end_date,
        spbp_eligible,
        spbp_rate_weekly,
        status,
        notes,
        created_at,
        updated_at
      ) VALUES (
        ${id},
        ${ctx.tenantId},
        ${data.employee_id},
        ${data.child_name},
        ${data.date_of_death},
        ${data.leave_start_date},
        ${data.leave_end_date},
        ${data.spbp_eligible ?? false},
        ${data.spbp_rate_weekly ?? null},
        'pending',
        ${data.notes ?? null},
        now(),
        now()
      )
      RETURNING
        id,
        tenant_id,
        employee_id,
        child_name,
        date_of_death,
        leave_start_date,
        leave_end_date,
        spbp_eligible,
        spbp_rate_weekly,
        status,
        notes,
        created_at,
        updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an existing parental bereavement leave record.
   * Only allowed when status is 'pending'.
   */
  async update(
    ctx: TenantContext,
    tx: TransactionSql<Record<string, unknown>>,
    id: string,
    data: UpdateBereavementLeave
  ): Promise<BereavementLeaveRow | null> {
    // Build SET clause dynamically using conditional fragments
    const rows = await tx<BereavementLeaveRow[]>`
      UPDATE parental_bereavement_leave
      SET
        ${data.child_name !== undefined ? tx`child_name = ${data.child_name},` : tx``}
        ${data.date_of_death !== undefined ? tx`date_of_death = ${data.date_of_death},` : tx``}
        ${data.leave_start_date !== undefined ? tx`leave_start_date = ${data.leave_start_date},` : tx``}
        ${data.leave_end_date !== undefined ? tx`leave_end_date = ${data.leave_end_date},` : tx``}
        ${data.spbp_eligible !== undefined ? tx`spbp_eligible = ${data.spbp_eligible},` : tx``}
        ${data.spbp_rate_weekly !== undefined ? tx`spbp_rate_weekly = ${data.spbp_rate_weekly},` : tx``}
        ${data.notes !== undefined ? tx`notes = ${data.notes},` : tx``}
        updated_at = now()
      WHERE id = ${id}
        AND status = 'pending'
      RETURNING
        id,
        tenant_id,
        employee_id,
        child_name,
        date_of_death,
        leave_start_date,
        leave_end_date,
        spbp_eligible,
        spbp_rate_weekly,
        status,
        notes,
        created_at,
        updated_at
    `;

    return rows.length > 0 ? rows[0]! : null;
  }

  /**
   * Update the status of a bereavement leave record.
   */
  async updateStatus(
    ctx: TenantContext,
    tx: TransactionSql<Record<string, unknown>>,
    id: string,
    newStatus: string,
    currentStatus: string
  ): Promise<BereavementLeaveRow | null> {
    const rows = await tx<BereavementLeaveRow[]>`
      UPDATE parental_bereavement_leave
      SET
        status = ${newStatus},
        updated_at = now()
      WHERE id = ${id}
        AND status = ${currentStatus}
      RETURNING
        id,
        tenant_id,
        employee_id,
        child_name,
        date_of_death,
        leave_start_date,
        leave_end_date,
        spbp_eligible,
        spbp_rate_weekly,
        status,
        notes,
        created_at,
        updated_at
    `;

    return rows.length > 0 ? rows[0]! : null;
  }

  /**
   * Write a domain event to the outbox within a transaction.
   */
  async writeOutboxEvent(
    tx: TransactionSql<Record<string, unknown>>,
    tenantId: string,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await tx`
      INSERT INTO domain_outbox (
        id,
        tenant_id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        created_at
      ) VALUES (
        ${crypto.randomUUID()},
        ${tenantId},
        'parental_bereavement_leave',
        ${aggregateId},
        ${eventType},
        ${JSON.stringify(payload)}::jsonb,
        now()
      )
    `;
  }
}
