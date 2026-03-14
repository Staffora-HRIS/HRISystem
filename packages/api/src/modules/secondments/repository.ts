/**
 * Secondment Module - Repository Layer
 *
 * Database operations for secondments.
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
  fromOrgUnitId: string;
  fromOrgUnitName?: string;
  toOrgUnitId: string;
  toOrgUnitName?: string;
  toExternalOrg: string | null;
  startDate: Date;
  expectedEndDate: Date;
  actualEndDate: Date | null;
  reason: string | null;
  terms: string | null;
  status: string;
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
          s.from_org_unit_id, s.to_org_unit_id,
          s.to_external_org,
          s.start_date, s.expected_end_date, s.actual_end_date,
          s.reason, s.terms, s.status, s.approved_by,
          s.created_at, s.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number,
          ou_from.name AS from_org_unit_name,
          ou_to.name AS to_org_unit_name
        FROM secondments s
        JOIN employees e ON e.id = s.employee_id AND e.tenant_id = s.tenant_id
        JOIN org_units ou_from ON ou_from.id = s.from_org_unit_id AND ou_from.tenant_id = s.tenant_id
        JOIN org_units ou_to ON ou_to.id = s.to_org_unit_id AND ou_to.tenant_id = s.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND s.status = ${filters.status}::app.secondment_status` : tx``}
          ${filters.employee_id ? tx`AND s.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.from_org_unit_id ? tx`AND s.from_org_unit_id = ${filters.from_org_unit_id}::uuid` : tx``}
          ${filters.to_org_unit_id ? tx`AND s.to_org_unit_id = ${filters.to_org_unit_id}::uuid` : tx``}
          ${filters.search ? tx`AND (
            e.first_name ILIKE ${"%" + filters.search + "%"}
            OR e.last_name ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
            OR s.to_external_org ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND s.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY s.start_date DESC, s.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getSecondmentById(
    ctx: TenantContext,
    id: string
  ): Promise<SecondmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<SecondmentRow[]>`
        SELECT
          s.id, s.tenant_id, s.employee_id,
          s.from_org_unit_id, s.to_org_unit_id,
          s.to_external_org,
          s.start_date, s.expected_end_date, s.actual_end_date,
          s.reason, s.terms, s.status, s.approved_by,
          s.created_at, s.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number,
          ou_from.name AS from_org_unit_name,
          ou_to.name AS to_org_unit_name
        FROM secondments s
        JOIN employees e ON e.id = s.employee_id AND e.tenant_id = s.tenant_id
        JOIN org_units ou_from ON ou_from.id = s.from_org_unit_id AND ou_from.tenant_id = s.tenant_id
        JOIN org_units ou_to ON ou_to.id = s.to_org_unit_id AND ou_to.tenant_id = s.tenant_id
        WHERE s.id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async getSecondmentByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<SecondmentRow | null> {
    const rows = await tx<SecondmentRow[]>`
      SELECT
        id, tenant_id, employee_id,
        from_org_unit_id, to_org_unit_id,
        to_external_org,
        start_date, expected_end_date, actual_end_date,
        reason, terms, status, approved_by,
        created_at, updated_at
      FROM secondments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async createSecondment(
    ctx: TenantContext,
    data: CreateSecondment,
    tx: TransactionSql
  ): Promise<SecondmentRow> {
    const [row] = await tx<SecondmentRow[]>`
      INSERT INTO secondments (
        tenant_id, employee_id,
        from_org_unit_id, to_org_unit_id, to_external_org,
        start_date, expected_end_date,
        reason, terms
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.from_org_unit_id}::uuid,
        ${data.to_org_unit_id}::uuid,
        ${data.to_external_org ?? null},
        ${data.start_date},
        ${data.expected_end_date},
        ${data.reason ?? null},
        ${data.terms ?? null}
      )
      RETURNING
        id, tenant_id, employee_id,
        from_org_unit_id, to_org_unit_id,
        to_external_org,
        start_date, expected_end_date, actual_end_date,
        reason, terms, status, approved_by,
        created_at, updated_at
    `;
    return row;
  }

  async updateSecondment(
    id: string,
    data: UpdateSecondment,
    tx: TransactionSql
  ): Promise<SecondmentRow | null> {
    const [row] = await tx<SecondmentRow[]>`
      UPDATE secondments
      SET
        to_org_unit_id = COALESCE(${data.to_org_unit_id ?? null}::uuid, to_org_unit_id),
        to_external_org = CASE WHEN ${data.to_external_org !== undefined} THEN ${data.to_external_org ?? null} ELSE to_external_org END,
        start_date = COALESCE(${data.start_date ?? null}::date, start_date),
        expected_end_date = COALESCE(${data.expected_end_date ?? null}::date, expected_end_date),
        actual_end_date = CASE WHEN ${data.actual_end_date !== undefined} THEN ${data.actual_end_date ?? null}::date ELSE actual_end_date END,
        reason = CASE WHEN ${data.reason !== undefined} THEN ${data.reason ?? null} ELSE reason END,
        terms = CASE WHEN ${data.terms !== undefined} THEN ${data.terms ?? null} ELSE terms END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        from_org_unit_id, to_org_unit_id,
        to_external_org,
        start_date, expected_end_date, actual_end_date,
        reason, terms, status, approved_by,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async transitionStatus(
    id: string,
    newStatus: string,
    updates: {
      approvedBy?: string | null;
      actualEndDate?: string | null;
      expectedEndDate?: string | null;
    },
    tx: TransactionSql
  ): Promise<SecondmentRow | null> {
    const [row] = await tx<SecondmentRow[]>`
      UPDATE secondments
      SET
        status = ${newStatus}::app.secondment_status,
        approved_by = CASE WHEN ${updates.approvedBy !== undefined} THEN ${updates.approvedBy ?? null} ELSE approved_by END,
        actual_end_date = CASE WHEN ${updates.actualEndDate !== undefined} THEN ${updates.actualEndDate ?? null}::date ELSE actual_end_date END,
        expected_end_date = CASE WHEN ${updates.expectedEndDate !== undefined} THEN ${updates.expectedEndDate ?? null}::date ELSE expected_end_date END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        from_org_unit_id, to_org_unit_id,
        to_external_org,
        start_date, expected_end_date, actual_end_date,
        reason, terms, status, approved_by,
        created_at, updated_at
    `;
    return row ?? null;
  }
}
