/**
 * DBS Checks Repository
 *
 * Database operations for DBS (Disclosure and Barring Service) checks
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface DbsCheck {
  id: string;
  tenant_id: string;
  employee_id: string;
  check_level: "basic" | "standard" | "enhanced" | "enhanced_barred";
  certificate_number: string | null;
  issue_date: string | null;
  dbs_update_service_registered: boolean;
  update_service_id: string | null;
  status: "pending" | "submitted" | "received" | "clear" | "flagged" | "expired";
  result: string | null;
  expiry_date: string | null;
  checked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
}

// =============================================================================
// DBS Checks Repository
// =============================================================================

export class DbsCheckRepository {
  constructor(private db: DatabaseClient) {}

  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      employeeId?: string;
      status?: string;
      checkLevel?: string;
      search?: string;
    } = {}
  ): Promise<{ items: DbsCheck[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, employeeId, status, checkLevel, search } = options;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<DbsCheck[]>`
          SELECT
            dc.id, dc.tenant_id, dc.employee_id,
            dc.check_level, dc.certificate_number, dc.issue_date,
            dc.dbs_update_service_registered, dc.update_service_id,
            dc.status, dc.result, dc.expiry_date,
            dc.checked_by, dc.notes,
            dc.created_at, dc.updated_at,
            app.get_employee_display_name(e.id) as employee_name
          FROM app.dbs_checks dc
          LEFT JOIN app.employees e ON e.id = dc.employee_id
          WHERE dc.tenant_id = ${ctx.tenantId}::uuid
          ${employeeId ? tx`AND dc.employee_id = ${employeeId}::uuid` : tx``}
          ${status ? tx`AND dc.status = ${status}::app.dbs_check_status` : tx``}
          ${checkLevel ? tx`AND dc.check_level = ${checkLevel}::app.dbs_check_level` : tx``}
          ${search ? tx`AND (dc.certificate_number ILIKE ${"%" + search + "%"} OR dc.update_service_id ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND dc.id > ${cursor}::uuid` : tx``}
          ORDER BY dc.created_at DESC, dc.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getById(ctx: TenantContext, id: string): Promise<DbsCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<DbsCheck[]>`
        SELECT
          dc.id, dc.tenant_id, dc.employee_id,
          dc.check_level, dc.certificate_number, dc.issue_date,
          dc.dbs_update_service_registered, dc.update_service_id,
          dc.status, dc.result, dc.expiry_date,
          dc.checked_by, dc.notes,
          dc.created_at, dc.updated_at,
          app.get_employee_display_name(e.id) as employee_name
        FROM app.dbs_checks dc
        LEFT JOIN app.employees e ON e.id = dc.employee_id
        WHERE dc.id = ${id}::uuid AND dc.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      checkLevel: string;
      notes?: string;
    }
  ): Promise<DbsCheck> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<DbsCheck[]>`
        INSERT INTO app.dbs_checks (
          tenant_id, employee_id, check_level, notes
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.employeeId}::uuid,
          ${data.checkLevel}::app.dbs_check_level,
          ${data.notes || null}
        )
        RETURNING id, tenant_id, employee_id,
          check_level, certificate_number, issue_date,
          dbs_update_service_registered, update_service_id,
          status, result, expiry_date,
          checked_by, notes,
          created_at, updated_at
      `;
    });
    return rows[0];
  }

  async update(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      checkLevel: string;
      certificateNumber: string | null;
      issueDate: string | null;
      dbsUpdateServiceRegistered: boolean;
      updateServiceId: string | null;
      result: string | null;
      expiryDate: string | null;
      notes: string | null;
    }>
  ): Promise<DbsCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<DbsCheck[]>`
        UPDATE app.dbs_checks SET
          check_level = COALESCE(${data.checkLevel}::app.dbs_check_level, check_level),
          certificate_number = COALESCE(${data.certificateNumber}, certificate_number),
          issue_date = COALESCE(${data.issueDate}::date, issue_date),
          dbs_update_service_registered = COALESCE(${data.dbsUpdateServiceRegistered}, dbs_update_service_registered),
          update_service_id = COALESCE(${data.updateServiceId}, update_service_id),
          result = COALESCE(${data.result}, result),
          expiry_date = COALESCE(${data.expiryDate}::date, expiry_date),
          notes = COALESCE(${data.notes}, notes),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, employee_id,
          check_level, certificate_number, issue_date,
          dbs_update_service_registered, update_service_id,
          status, result, expiry_date,
          checked_by, notes,
          created_at, updated_at
      `;
    });
    return rows[0] || null;
  }

  async updateStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    extraFields?: Partial<{
      certificateNumber: string;
      issueDate: string;
      result: string;
      expiryDate: string;
      dbsUpdateServiceRegistered: boolean;
      updateServiceId: string;
      checkedBy: string;
    }>
  ): Promise<DbsCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<DbsCheck[]>`
        UPDATE app.dbs_checks SET
          status = ${status}::app.dbs_check_status,
          certificate_number = COALESCE(${extraFields?.certificateNumber || null}, certificate_number),
          issue_date = COALESCE(${extraFields?.issueDate || null}::date, issue_date),
          result = COALESCE(${extraFields?.result || null}, result),
          expiry_date = COALESCE(${extraFields?.expiryDate || null}::date, expiry_date),
          dbs_update_service_registered = COALESCE(${extraFields?.dbsUpdateServiceRegistered ?? null}, dbs_update_service_registered),
          update_service_id = COALESCE(${extraFields?.updateServiceId || null}, update_service_id),
          checked_by = COALESCE(${extraFields?.checkedBy || null}::uuid, checked_by),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, employee_id,
          check_level, certificate_number, issue_date,
          dbs_update_service_registered, update_service_id,
          status, result, expiry_date,
          checked_by, notes,
          created_at, updated_at
      `;
    });
    return rows[0] || null;
  }
}
