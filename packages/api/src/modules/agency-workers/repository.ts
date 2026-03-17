/**
 * Agency Workers Regulations (AWR) Module - Repository Layer
 *
 * Database operations for agency worker assignment tracking.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateAssignment,
  UpdateAssignment,
  AssignmentFilters,
  PaginationQuery,
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

export interface AssignmentRow extends Row {
  id: string;
  tenantId: string;
  workerId: string;
  agencyId: string;
  status: string;
  role: string;
  department: string | null;
  startDate: Date;
  endDate: Date | null;
  qualifyingDate: Date;
  qualified: boolean;
  hourlyRate: string; // numeric comes as string
  comparableRate: string | null;
  breaks: unknown; // jsonb
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  workerName?: string;
  agencyName?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class AgencyWorkerRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Assignment Operations
  // ===========================================================================

  async listAssignments(
    ctx: TenantContext,
    filters: AssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AssignmentRow[]>`
        SELECT
          awa.id, awa.tenant_id, awa.worker_id, awa.agency_id,
          awa.status, awa.role, awa.department,
          awa.start_date, awa.end_date,
          awa.qualifying_date, awa.qualified,
          awa.hourly_rate, awa.comparable_rate,
          awa.breaks, awa.notes,
          awa.created_at, awa.updated_at,
          CONCAT(ep.first_name, ' ', ep.last_name) AS worker_name,
          ra.name AS agency_name
        FROM agency_worker_assignments awa
        LEFT JOIN employee_personal ep ON ep.employee_id = awa.worker_id
        LEFT JOIN recruitment_agencies ra ON ra.id = awa.agency_id AND ra.tenant_id = awa.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND awa.status = ${filters.status}::app.awr_assignment_status` : tx``}
          ${filters.worker_id ? tx`AND awa.worker_id = ${filters.worker_id}::uuid` : tx``}
          ${filters.agency_id ? tx`AND awa.agency_id = ${filters.agency_id}::uuid` : tx``}
          ${filters.qualified !== undefined ? tx`AND awa.qualified = ${filters.qualified}` : tx``}
          ${filters.search ? tx`AND (
            awa.role ILIKE ${"%" + filters.search + "%"}
            OR awa.department ILIKE ${"%" + filters.search + "%"}
            OR CONCAT(ep.first_name, ' ', ep.last_name) ILIKE ${"%" + filters.search + "%"}
            OR ra.name ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND awa.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY awa.start_date DESC, awa.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getAssignmentById(
    ctx: TenantContext,
    id: string
  ): Promise<AssignmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AssignmentRow[]>`
        SELECT
          awa.id, awa.tenant_id, awa.worker_id, awa.agency_id,
          awa.status, awa.role, awa.department,
          awa.start_date, awa.end_date,
          awa.qualifying_date, awa.qualified,
          awa.hourly_rate, awa.comparable_rate,
          awa.breaks, awa.notes,
          awa.created_at, awa.updated_at,
          CONCAT(ep.first_name, ' ', ep.last_name) AS worker_name,
          ra.name AS agency_name
        FROM agency_worker_assignments awa
        LEFT JOIN employee_personal ep ON ep.employee_id = awa.worker_id
        LEFT JOIN recruitment_agencies ra ON ra.id = awa.agency_id AND ra.tenant_id = awa.tenant_id
        WHERE awa.id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async getAssignmentByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const rows = await tx<AssignmentRow[]>`
      SELECT
        id, tenant_id, worker_id, agency_id,
        status, role, department,
        start_date, end_date,
        qualifying_date, qualified,
        hourly_rate, comparable_rate,
        breaks, notes,
        created_at, updated_at
      FROM agency_worker_assignments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment & { qualifying_date: string },
    tx: TransactionSql
  ): Promise<AssignmentRow> {
    const [row] = await tx<AssignmentRow[]>`
      INSERT INTO agency_worker_assignments (
        tenant_id, worker_id, agency_id,
        role, department, start_date, end_date,
        qualifying_date, hourly_rate, comparable_rate, notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.worker_id}::uuid,
        ${data.agency_id}::uuid,
        ${data.role},
        ${data.department ?? null},
        ${data.start_date}::date,
        ${data.end_date ?? null}::date,
        ${data.qualifying_date}::date,
        ${data.hourly_rate},
        ${data.comparable_rate ?? null},
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, worker_id, agency_id,
        status, role, department,
        start_date, end_date,
        qualifying_date, qualified,
        hourly_rate, comparable_rate,
        breaks, notes,
        created_at, updated_at
    `;
    return row;
  }

  async updateAssignment(
    id: string,
    data: UpdateAssignment,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const [row] = await tx<AssignmentRow[]>`
      UPDATE agency_worker_assignments
      SET
        role = COALESCE(${data.role ?? null}, role),
        department = CASE WHEN ${data.department !== undefined} THEN ${data.department ?? null} ELSE department END,
        end_date = CASE WHEN ${data.end_date !== undefined} THEN ${data.end_date ?? null}::date ELSE end_date END,
        hourly_rate = COALESCE(${data.hourly_rate ?? null}, hourly_rate),
        comparable_rate = CASE WHEN ${data.comparable_rate !== undefined} THEN ${data.comparable_rate ?? null} ELSE comparable_rate END,
        status = COALESCE(${data.status ? data.status + '' : null}::app.awr_assignment_status, status),
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, worker_id, agency_id,
        status, role, department,
        start_date, end_date,
        qualifying_date, qualified,
        hourly_rate, comparable_rate,
        breaks, notes,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async updateBreaksAndQualifying(
    id: string,
    breaks: unknown,
    qualifyingDate: string,
    qualified: boolean,
    status: string | null,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const [row] = await tx<AssignmentRow[]>`
      UPDATE agency_worker_assignments
      SET
        breaks = ${JSON.stringify(breaks)}::jsonb,
        qualifying_date = ${qualifyingDate}::date,
        qualified = ${qualified},
        status = COALESCE(${status ? status + '' : null}::app.awr_assignment_status, status)
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, worker_id, agency_id,
        status, role, department,
        start_date, end_date,
        qualifying_date, qualified,
        hourly_rate, comparable_rate,
        breaks, notes,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async deleteAssignment(
    id: string,
    tx: TransactionSql
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM agency_worker_assignments WHERE id = ${id}::uuid
    `;
    return result.count > 0;
  }

  // ===========================================================================
  // Qualifying Soon Query
  // ===========================================================================

  async listQualifyingSoon(
    ctx: TenantContext,
    days: number,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AssignmentRow[]>`
        SELECT
          awa.id, awa.tenant_id, awa.worker_id, awa.agency_id,
          awa.status, awa.role, awa.department,
          awa.start_date, awa.end_date,
          awa.qualifying_date, awa.qualified,
          awa.hourly_rate, awa.comparable_rate,
          awa.breaks, awa.notes,
          awa.created_at, awa.updated_at,
          CONCAT(ep.first_name, ' ', ep.last_name) AS worker_name,
          ra.name AS agency_name
        FROM agency_worker_assignments awa
        LEFT JOIN employee_personal ep ON ep.employee_id = awa.worker_id
        LEFT JOIN recruitment_agencies ra ON ra.id = awa.agency_id AND ra.tenant_id = awa.tenant_id
        WHERE awa.qualified = false
          AND awa.status IN ('active', 'on_break')
          AND awa.qualifying_date <= CURRENT_DATE + ${days}::int * INTERVAL '1 day'
          AND awa.qualifying_date >= CURRENT_DATE
          ${pagination.cursor ? tx`AND awa.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY awa.qualifying_date ASC, awa.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }
}
