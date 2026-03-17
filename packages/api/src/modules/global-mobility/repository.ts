/**
 * Global Mobility Module - Repository Layer
 *
 * Database operations for international assignments.
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
  ExpiringAssignmentsQuery,
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
  employeeId: string;
  employeeName?: string;
  employeeNumber?: string;
  assignmentType: string;
  homeCountry: string;
  hostCountry: string;
  startDate: Date;
  endDate: Date | null;
  taxEqualisation: boolean;
  housingAllowance: number | null;
  relocationPackage: Record<string, unknown> | null;
  visaStatus: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class GlobalMobilityRepository {
  constructor(private db: DatabaseClient) {}

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
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.end_date,
          ia.tax_equalisation, ia.housing_allowance,
          ia.relocation_package, ia.visa_status,
          ia.status, ia.notes,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND ia.status = ${filters.status}::app.international_assignment_status` : tx``}
          ${filters.assignment_type ? tx`AND ia.assignment_type = ${filters.assignment_type}::app.international_assignment_type` : tx``}
          ${filters.employee_id ? tx`AND ia.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.home_country ? tx`AND ia.home_country = ${filters.home_country}` : tx``}
          ${filters.host_country ? tx`AND ia.host_country = ${filters.host_country}` : tx``}
          ${filters.visa_status ? tx`AND ia.visa_status = ${filters.visa_status}::app.visa_status` : tx``}
          ${filters.search ? tx`AND (
            e.first_name ILIKE ${"%" + filters.search + "%"}
            OR e.last_name ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
            OR ia.home_country ILIKE ${"%" + filters.search + "%"}
            OR ia.host_country ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND ia.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY ia.start_date DESC, ia.id ASC
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
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.end_date,
          ia.tax_equalisation, ia.housing_allowance,
          ia.relocation_package, ia.visa_status,
          ia.status, ia.notes,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE ia.id = ${id}::uuid
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
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, end_date,
        tax_equalisation, housing_allowance,
        relocation_package, visa_status,
        status, notes,
        created_at, updated_at
      FROM international_assignments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment,
    tx: TransactionSql
  ): Promise<AssignmentRow> {
    const [row] = await tx<AssignmentRow[]>`
      INSERT INTO international_assignments (
        tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, end_date,
        tax_equalisation, housing_allowance,
        relocation_package, visa_status,
        notes
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.assignment_type}::app.international_assignment_type,
        ${data.home_country},
        ${data.host_country},
        ${data.start_date},
        ${data.end_date ?? null},
        ${data.tax_equalisation ?? false},
        ${data.housing_allowance ?? null},
        ${data.relocation_package ? JSON.stringify(data.relocation_package) : null}::jsonb,
        ${data.visa_status ?? "not_required"}::app.visa_status,
        ${data.notes ?? null}
      )
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, end_date,
        tax_equalisation, housing_allowance,
        relocation_package, visa_status,
        status, notes,
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
      UPDATE international_assignments
      SET
        assignment_type = COALESCE(${data.assignment_type ?? null}::app.international_assignment_type, assignment_type),
        home_country = COALESCE(${data.home_country ?? null}, home_country),
        host_country = COALESCE(${data.host_country ?? null}, host_country),
        start_date = COALESCE(${data.start_date ?? null}::date, start_date),
        end_date = CASE WHEN ${data.end_date !== undefined} THEN ${data.end_date ?? null}::date ELSE end_date END,
        tax_equalisation = COALESCE(${data.tax_equalisation ?? null}::boolean, tax_equalisation),
        housing_allowance = CASE WHEN ${data.housing_allowance !== undefined} THEN ${data.housing_allowance ?? null}::numeric ELSE housing_allowance END,
        relocation_package = CASE WHEN ${data.relocation_package !== undefined} THEN ${data.relocation_package ? JSON.stringify(data.relocation_package) : null}::jsonb ELSE relocation_package END,
        visa_status = COALESCE(${data.visa_status ?? null}::app.visa_status, visa_status),
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, end_date,
        tax_equalisation, housing_allowance,
        relocation_package, visa_status,
        status, notes,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async transitionStatus(
    id: string,
    newStatus: string,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const [row] = await tx<AssignmentRow[]>`
      UPDATE international_assignments
      SET status = ${newStatus}::app.international_assignment_status
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, end_date,
        tax_equalisation, housing_allowance,
        relocation_package, visa_status,
        status, notes,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async listExpiringAssignments(
    ctx: TenantContext,
    query: ExpiringAssignmentsQuery
  ): Promise<PaginatedResult<AssignmentRow>> {
    const days = query.days || 30;
    const limit = query.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AssignmentRow[]>`
        SELECT
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.end_date,
          ia.tax_equalisation, ia.housing_allowance,
          ia.relocation_package, ia.visa_status,
          ia.status, ia.notes,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE ia.status = 'active'
          AND ia.end_date IS NOT NULL
          AND ia.end_date <= CURRENT_DATE + ${days}::integer
          AND ia.end_date >= CURRENT_DATE
          ${query.cursor ? tx`AND ia.id > ${query.cursor}::uuid` : tx``}
        ORDER BY ia.end_date ASC, ia.id ASC
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
