/**
 * Secondment Module - Repository Layer
 *
 * Database operations for secondment tracking with home/host department
 * and external organisation support.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateSecondment,
  UpdateSecondment,
  SecondmentFilters,
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

export interface SecondmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName?: string;
  employeeNumber?: string;
  homeDepartmentId: string;
  homeDepartmentName?: string;
  hostDepartmentId: string;
  hostDepartmentName?: string;
  hostOrganisation: string | null;
  startDate: Date;
  expectedEndDate: Date;
  actualEndDate: Date | null;
  terms: Record<string, unknown> | null;
  status: string;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class SecondmentRepository {
  constructor(private db: DatabaseClient) {}

  async listSecondments(
    ctx: TenantContext,
    filters: SecondmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<SecondmentRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<SecondmentRow[]>`
        SELECT
          s.id, s.tenant_id, s.employee_id,
          s.home_department_id, s.host_department_id,
          s.host_organisation,
          s.start_date, s.expected_end_date, s.actual_end_date,
          s.terms, s.status, s.created_by, s.approved_by,
          s.created_at, s.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number,
          ou_home.name AS home_department_name,
          ou_host.name AS host_department_name
        FROM secondments s
        JOIN employees e ON e.id = s.employee_id AND e.tenant_id = s.tenant_id
        JOIN org_units ou_home ON ou_home.id = s.home_department_id AND ou_home.tenant_id = s.tenant_id
        JOIN org_units ou_host ON ou_host.id = s.host_department_id AND ou_host.tenant_id = s.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND s.status = ${filters.status}::app.secondment_status` : tx``}
          ${filters.employee_id ? tx`AND s.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.home_department_id ? tx`AND s.home_department_id = ${filters.home_department_id}::uuid` : tx``}
          ${filters.host_department_id ? tx`AND s.host_department_id = ${filters.host_department_id}::uuid` : tx``}
          ${filters.active_on ? tx`AND s.start_date <= ${filters.active_on}::date AND (s.actual_end_date IS NULL OR s.actual_end_date >= ${filters.active_on}::date) AND (s.expected_end_date >= ${filters.active_on}::date) AND s.status IN ('active', 'extended')` : tx``}
          ${filters.search ? tx`AND (
            e.first_name ILIKE ${"%" + filters.search + "%"}
            OR e.last_name ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
            OR s.host_organisation ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND s.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY s.start_date DESC, s.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
      return { items, nextCursor, hasMore };
    });
  }

  async getSecondmentById(ctx: TenantContext, id: string): Promise<SecondmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<SecondmentRow[]>`
        SELECT
          s.id, s.tenant_id, s.employee_id,
          s.home_department_id, s.host_department_id,
          s.host_organisation,
          s.start_date, s.expected_end_date, s.actual_end_date,
          s.terms, s.status, s.created_by, s.approved_by,
          s.created_at, s.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number,
          ou_home.name AS home_department_name,
          ou_host.name AS host_department_name
        FROM secondments s
        JOIN employees e ON e.id = s.employee_id AND e.tenant_id = s.tenant_id
        JOIN org_units ou_home ON ou_home.id = s.home_department_id AND ou_home.tenant_id = s.tenant_id
        JOIN org_units ou_host ON ou_host.id = s.host_department_id AND ou_host.tenant_id = s.tenant_id
        WHERE s.id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async getSecondmentByIdTx(id: string, tx: TransactionSql): Promise<SecondmentRow | null> {
    const rows = await tx<SecondmentRow[]>`
      SELECT id, tenant_id, employee_id,
        home_department_id, host_department_id, host_organisation,
        start_date, expected_end_date, actual_end_date,
        terms, status, created_by, approved_by,
        created_at, updated_at
      FROM secondments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async checkOverlappingSecondment(
    ctx: TenantContext, employeeId: string, startDate: string, expectedEndDate: string, excludeId?: string
  ): Promise<boolean> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      return tx<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM secondments
          WHERE employee_id = ${employeeId}::uuid
            AND status IN ('planned', 'active', 'extended')
            ${excludeId ? tx`AND id != ${excludeId}::uuid` : tx``}
            AND start_date < ${expectedEndDate}::date
            AND expected_end_date > ${startDate}::date
        ) AS exists
      `;
    });
    return result[0]?.exists ?? false;
  }

  async createSecondment(
    ctx: TenantContext, data: CreateSecondment, createdBy: string | undefined, tx: TransactionSql
  ): Promise<SecondmentRow> {
    const [row] = await tx<SecondmentRow[]>`
      INSERT INTO secondments (
        tenant_id, employee_id,
        home_department_id, host_department_id, host_organisation,
        start_date, expected_end_date, terms, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid, ${data.employee_id}::uuid,
        ${data.home_department_id}::uuid, ${data.host_department_id}::uuid,
        ${data.host_organisation ?? null},
        ${data.start_date}::date, ${data.expected_end_date}::date,
        ${data.terms ? JSON.stringify(data.terms) : null}::jsonb,
        ${createdBy ?? null}::uuid
      )
      RETURNING id, tenant_id, employee_id,
        home_department_id, host_department_id, host_organisation,
        start_date, expected_end_date, actual_end_date,
        terms, status, created_by, approved_by, created_at, updated_at
    `;
    return row;
  }

  async updateSecondment(id: string, data: UpdateSecondment, tx: TransactionSql): Promise<SecondmentRow | null> {
    const [row] = await tx<SecondmentRow[]>`
      UPDATE secondments SET
        host_department_id = COALESCE(${data.host_department_id ?? null}::uuid, host_department_id),
        host_organisation = CASE WHEN ${data.host_organisation !== undefined} THEN ${data.host_organisation ?? null} ELSE host_organisation END,
        start_date = COALESCE(${data.start_date ?? null}::date, start_date),
        expected_end_date = COALESCE(${data.expected_end_date ?? null}::date, expected_end_date),
        terms = CASE WHEN ${data.terms !== undefined} THEN ${data.terms ? JSON.stringify(data.terms) : null}::jsonb ELSE terms END
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id,
        home_department_id, host_department_id, host_organisation,
        start_date, expected_end_date, actual_end_date,
        terms, status, created_by, approved_by, created_at, updated_at
    `;
    return row ?? null;
  }

  async transitionStatus(
    id: string, newStatus: string,
    updates: { actualEndDate?: string | null; expectedEndDate?: string | null },
    tx: TransactionSql
  ): Promise<SecondmentRow | null> {
    const [row] = await tx<SecondmentRow[]>`
      UPDATE secondments SET
        status = ${newStatus}::app.secondment_status,
        actual_end_date = CASE WHEN ${updates.actualEndDate !== undefined} THEN ${updates.actualEndDate ?? null}::date ELSE actual_end_date END,
        expected_end_date = CASE WHEN ${updates.expectedEndDate !== undefined} THEN ${updates.expectedEndDate ?? null}::date ELSE expected_end_date END
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id,
        home_department_id, host_department_id, host_organisation,
        start_date, expected_end_date, actual_end_date,
        terms, status, created_by, approved_by, created_at, updated_at
    `;
    return row ?? null;
  }
}
