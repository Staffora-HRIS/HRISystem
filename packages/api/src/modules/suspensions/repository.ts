/**
 * Suspensions Module - Repository Layer
 *
 * Database operations for employee suspension management.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type { SuspensionResponse, SuspensionStatus } from "./schemas";

// =============================================================================
// DB Row Types (after camelCase transform from postgres.js)
// =============================================================================

interface SuspensionDbRow {
  id: string;
  tenantId: string;
  employeeId: string;
  caseId: string | null;
  suspensionType: string;
  startDate: Date;
  endDate: Date | null;
  reason: string;
  authorizedBy: string;
  reviewDate: Date | null;
  lastReviewedAt: Date | null;
  reviewNotes: string | null;
  status: string;
  liftedAt: Date | null;
  liftedBy: string | null;
  liftedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

// =============================================================================
// Repository
// =============================================================================

export class SuspensionsRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async createSuspension(
    tx: TransactionSql,
    ctx: TenantContext,
    data: {
      employeeId: string;
      caseId?: string;
      suspensionType: string;
      startDate: string;
      endDate?: string;
      reason: string;
      authorizedBy: string;
      reviewDate?: string;
    }
  ): Promise<SuspensionResponse> {
    const [row] = await tx<SuspensionDbRow[]>`
      INSERT INTO app.employee_suspensions (
        id, tenant_id, employee_id, case_id,
        suspension_type, start_date, end_date, reason,
        authorized_by, review_date, status, created_by
      ) VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.caseId || null}::uuid,
        ${data.suspensionType}::app.suspension_type,
        ${data.startDate}::date,
        ${data.endDate || null}::date,
        ${data.reason},
        ${data.authorizedBy}::uuid,
        ${data.reviewDate || null}::date,
        'active'::app.suspension_status,
        ${ctx.userId || null}::uuid
      )
      RETURNING *
    `;

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async getSuspensionById(
    ctx: TenantContext,
    id: string
  ): Promise<SuspensionResponse | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<SuspensionDbRow[]>`
          SELECT *
          FROM app.employee_suspensions
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async listSuspensions(
    ctx: TenantContext,
    filters: {
      employeeId?: string;
      caseId?: string;
      status?: string;
    },
    pagination: { cursor?: string; limit: number }
  ): Promise<{ items: SuspensionResponse[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = pagination.limit;
    const fetchLimit = limit + 1; // Fetch one extra to detect hasMore

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<SuspensionDbRow[]>`
          SELECT *
          FROM app.employee_suspensions
          WHERE tenant_id = ${ctx.tenantId}::uuid
            ${filters.employeeId ? tx`AND employee_id = ${filters.employeeId}::uuid` : tx``}
            ${filters.caseId ? tx`AND case_id = ${filters.caseId}::uuid` : tx``}
            ${filters.status ? tx`AND status = ${filters.status}::app.suspension_status` : tx``}
            ${pagination.cursor ? tx`AND id < ${pagination.cursor}::uuid` : tx``}
          ORDER BY created_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items: items.map((row) => this.mapRow(row)),
      nextCursor,
      hasMore,
    };
  }

  async getActiveSuspensionForEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<SuspensionResponse | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<SuspensionDbRow[]>`
          SELECT *
          FROM app.employee_suspensions
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND status = 'active'::app.suspension_status
          LIMIT 1
        `;
      }
    );

    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  // ---------------------------------------------------------------------------
  // Update Operations (within caller's transaction)
  // ---------------------------------------------------------------------------

  async liftSuspension(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      liftedReason: string;
    }
  ): Promise<SuspensionResponse> {
    const [row] = await tx<SuspensionDbRow[]>`
      UPDATE app.employee_suspensions SET
        status = 'lifted'::app.suspension_status,
        lifted_at = now(),
        lifted_by = ${ctx.userId || null}::uuid,
        lifted_reason = ${data.liftedReason},
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
        AND status = 'active'::app.suspension_status
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async extendSuspension(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      endDate: string;
      reviewDate?: string;
    }
  ): Promise<SuspensionResponse> {
    const [row] = await tx<SuspensionDbRow[]>`
      UPDATE app.employee_suspensions SET
        end_date = ${data.endDate}::date,
        review_date = COALESCE(${data.reviewDate || null}::date, review_date),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
        AND status = 'active'::app.suspension_status
      RETURNING *
    `;

    return this.mapRow(row);
  }

  async recordReview(
    tx: TransactionSql,
    ctx: TenantContext,
    id: string,
    data: {
      reviewNotes: string;
      nextReviewDate?: string;
    }
  ): Promise<SuspensionResponse> {
    const [row] = await tx<SuspensionDbRow[]>`
      UPDATE app.employee_suspensions SET
        review_notes = ${data.reviewNotes},
        last_reviewed_at = now(),
        review_date = COALESCE(${data.nextReviewDate || null}::date, review_date),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
        AND status = 'active'::app.suspension_status
      RETURNING *
    `;

    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // Suspension Expiry (called by background worker or service)
  // ---------------------------------------------------------------------------

  async expireOverdueSuspensions(
    tx: TransactionSql,
    ctx: TenantContext
  ): Promise<number> {
    const result = await tx`
      UPDATE app.employee_suspensions SET
        status = 'expired'::app.suspension_status,
        updated_at = now()
      WHERE tenant_id = ${ctx.tenantId}::uuid
        AND status = 'active'::app.suspension_status
        AND end_date IS NOT NULL
        AND end_date < CURRENT_DATE
    `;

    return result.count;
  }

  // ---------------------------------------------------------------------------
  // Row Mapping
  // ---------------------------------------------------------------------------

  private mapRow(row: SuspensionDbRow): SuspensionResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      employeeId: row.employeeId,
      caseId: row.caseId,

      suspensionType: row.suspensionType as SuspensionResponse["suspensionType"],
      startDate: row.startDate instanceof Date
        ? row.startDate.toISOString().split("T")[0]
        : String(row.startDate),
      endDate: row.endDate instanceof Date
        ? row.endDate.toISOString().split("T")[0]
        : row.endDate ? String(row.endDate) : null,
      reason: row.reason,

      authorizedBy: row.authorizedBy,

      reviewDate: row.reviewDate instanceof Date
        ? row.reviewDate.toISOString().split("T")[0]
        : row.reviewDate ? String(row.reviewDate) : null,
      lastReviewedAt: row.lastReviewedAt?.toISOString() || null,
      reviewNotes: row.reviewNotes,

      status: row.status as SuspensionResponse["status"],
      liftedAt: row.liftedAt?.toISOString() || null,
      liftedBy: row.liftedBy,
      liftedReason: row.liftedReason,

      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString() || String(row.updatedAt),
    };
  }
}
