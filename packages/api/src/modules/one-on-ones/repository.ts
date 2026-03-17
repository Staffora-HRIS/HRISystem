/**
 * One-on-One Meetings Module - Repository Layer
 *
 * Database operations for 1:1 meeting notes.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 * Uses parameterized queries throughout — no tx.unsafe().
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateOneOnOne,
  UpdateOneOnOne,
  OneOnOneFilters,
  PaginationQuery,
  ActionItem,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Raw DB row for one_on_one_meetings */
export interface OneOnOneRow extends Row {
  id: string;
  tenantId: string;
  managerId: string;
  employeeId: string;
  meetingDate: Date;
  status: string;
  notes: string | null;
  actionItems: ActionItem[];
  nextMeetingDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields (optional)
  managerName?: string;
  employeeName?: string;
  employeeNumber?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class OneOnOneRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // List Operations
  // ===========================================================================

  /**
   * List 1:1 meetings for a manager with cursor-based pagination.
   * Joins employee data for display names.
   */
  async listForManager(
    ctx: TenantContext,
    managerId: string,
    filters: OneOnOneFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<OneOnOneRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<OneOnOneRow[]>`
        SELECT
          m.id, m.tenant_id, m.manager_id, m.employee_id,
          m.meeting_date, m.status, m.notes,
          m.action_items, m.next_meeting_date,
          m.created_at, m.updated_at,
          CONCAT(mgr.first_name, ' ', mgr.last_name) AS manager_name,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
          emp.employee_number
        FROM one_on_one_meetings m
        JOIN employees emp ON emp.id = m.employee_id AND emp.tenant_id = m.tenant_id
        JOIN employees mgr ON mgr.id = m.manager_id AND mgr.tenant_id = m.tenant_id
        WHERE m.manager_id = ${managerId}::uuid
          ${filters.employee_id ? tx`AND m.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.status ? tx`AND m.status = ${filters.status}::app.one_on_one_status` : tx``}
          ${filters.from_date ? tx`AND m.meeting_date >= ${filters.from_date}::date` : tx``}
          ${filters.to_date ? tx`AND m.meeting_date <= ${filters.to_date}::date` : tx``}
          ${pagination.cursor ? tx`AND m.id < ${pagination.cursor}::uuid` : tx``}
        ORDER BY m.meeting_date DESC, m.id DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * List 1:1 meeting history for a specific employee (as seen by their manager).
   */
  async listForEmployee(
    ctx: TenantContext,
    employeeId: string,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<OneOnOneRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<OneOnOneRow[]>`
        SELECT
          m.id, m.tenant_id, m.manager_id, m.employee_id,
          m.meeting_date, m.status, m.notes,
          m.action_items, m.next_meeting_date,
          m.created_at, m.updated_at,
          CONCAT(mgr.first_name, ' ', mgr.last_name) AS manager_name,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
          emp.employee_number
        FROM one_on_one_meetings m
        JOIN employees emp ON emp.id = m.employee_id AND emp.tenant_id = m.tenant_id
        JOIN employees mgr ON mgr.id = m.manager_id AND mgr.tenant_id = m.tenant_id
        WHERE m.employee_id = ${employeeId}::uuid
          ${pagination.cursor ? tx`AND m.id < ${pagination.cursor}::uuid` : tx``}
        ORDER BY m.meeting_date DESC, m.id DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].id
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  // ===========================================================================
  // Get Operations
  // ===========================================================================

  /**
   * Get a single 1:1 meeting by ID with joined names.
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<OneOnOneRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OneOnOneRow[]>`
        SELECT
          m.id, m.tenant_id, m.manager_id, m.employee_id,
          m.meeting_date, m.status, m.notes,
          m.action_items, m.next_meeting_date,
          m.created_at, m.updated_at,
          CONCAT(mgr.first_name, ' ', mgr.last_name) AS manager_name,
          CONCAT(emp.first_name, ' ', emp.last_name) AS employee_name,
          emp.employee_number
        FROM one_on_one_meetings m
        JOIN employees emp ON emp.id = m.employee_id AND emp.tenant_id = m.tenant_id
        JOIN employees mgr ON mgr.id = m.manager_id AND mgr.tenant_id = m.tenant_id
        WHERE m.id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Create a 1:1 meeting within an existing transaction.
   */
  async create(
    ctx: TenantContext,
    managerId: string,
    data: CreateOneOnOne,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<OneOnOneRow> {
    const actionItems = JSON.stringify(data.action_items ?? []);
    const status = data.status ?? "scheduled";

    const rows = await tx<OneOnOneRow[]>`
      INSERT INTO one_on_one_meetings (
        tenant_id, manager_id, employee_id,
        meeting_date, status, notes,
        action_items, next_meeting_date
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${managerId}::uuid,
        ${data.employee_id}::uuid,
        ${data.meeting_date},
        ${status}::app.one_on_one_status,
        ${data.notes ?? null},
        ${actionItems}::jsonb,
        ${data.next_meeting_date ?? null}
      )
      RETURNING
        id, tenant_id, manager_id, employee_id,
        meeting_date, status, notes,
        action_items, next_meeting_date,
        created_at, updated_at
    `;
    return rows[0];
  }

  /**
   * Update a 1:1 meeting within an existing transaction.
   */
  async update(
    id: string,
    data: UpdateOneOnOne,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<OneOnOneRow | null> {
    // Build dynamic update — only set fields that are provided
    const actionItemsJson = data.action_items !== undefined
      ? JSON.stringify(data.action_items)
      : null;

    const rows = await tx<OneOnOneRow[]>`
      UPDATE one_on_one_meetings
      SET
        meeting_date = COALESCE(${data.meeting_date ?? null}, meeting_date),
        status = COALESCE(${data.status ?? null}::app.one_on_one_status, status),
        notes = CASE
          WHEN ${data.notes !== undefined} THEN ${data.notes ?? null}
          ELSE notes
        END,
        action_items = CASE
          WHEN ${actionItemsJson !== null} THEN ${actionItemsJson}::jsonb
          ELSE action_items
        END,
        next_meeting_date = CASE
          WHEN ${data.next_meeting_date !== undefined} THEN ${data.next_meeting_date ?? null}::date
          ELSE next_meeting_date
        END
      WHERE id = ${id}
      RETURNING
        id, tenant_id, manager_id, employee_id,
        meeting_date, status, notes,
        action_items, next_meeting_date,
        created_at, updated_at
    `;
    return rows[0] ?? null;
  }

  /**
   * Delete a 1:1 meeting within an existing transaction.
   */
  async delete(
    id: string,
    tx: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM one_on_one_meetings
      WHERE id = ${id}
    `;
    return result.count > 0;
  }
}
