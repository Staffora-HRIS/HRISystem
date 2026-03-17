/**
 * Employee Change Requests Module - Repository Layer
 *
 * Database operations for employee self-service change requests.
 * All queries respect RLS via tenant context.
 */

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface ChangeRequestRow {
  id: string;
  tenantId: string;
  employeeId: string;
  fieldCategory: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  requiresApproval: boolean;
  status: string;
  reviewerId: string | null;
  reviewerNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  employeeName?: string;
  reviewerName?: string;
}

export class ChangeRequestRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Create
  // ===========================================================================

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      fieldCategory: string;
      fieldName: string;
      oldValue: string | null;
      newValue: string;
      requiresApproval: boolean;
    }
  ): Promise<ChangeRequestRow> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        // Insert change request
        const [cr] = await tx`
          INSERT INTO app.employee_change_requests (
            tenant_id, employee_id, field_category, field_name,
            old_value, new_value, requires_approval,
            status
          )
          VALUES (
            ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
            ${data.fieldCategory}::app.field_category, ${data.fieldName},
            ${data.oldValue}, ${data.newValue}, ${data.requiresApproval},
            ${data.requiresApproval ? "pending" : "approved"}::app.change_request_status
          )
          RETURNING *
        `;

        // Write to outbox
        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id,
            event_type, payload, created_at
          )
          VALUES (
            ${crypto.randomUUID()}, ${ctx.tenantId}::uuid,
            'employee_change_request', ${cr.id},
            ${data.requiresApproval ? "hr.change_request.created" : "hr.change_request.auto_approved"},
            ${JSON.stringify({
              changeRequestId: cr.id,
              employeeId: data.employeeId,
              fieldCategory: data.fieldCategory,
              fieldName: data.fieldName,
              requiresApproval: data.requiresApproval,
              actor: ctx.userId,
            })}::jsonb,
            now()
          )
        `;

        return [cr];
      }
    );

    return row;
  }

  // ===========================================================================
  // Read
  // ===========================================================================

  async findById(ctx: TenantContext, id: string): Promise<ChangeRequestRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cr.*,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
            ru.name AS reviewer_name
          FROM app.employee_change_requests cr
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = cr.employee_id
            AND ep.tenant_id = cr.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app."user" ru
            ON ru.id = cr.reviewer_id::text
          WHERE cr.id = ${id}::uuid
            AND cr.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return row || null;
  }

  async listByEmployee(
    ctx: TenantContext,
    employeeId: string,
    filters: { status?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<{ items: ChangeRequestRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(pagination.limit || 20, 100);

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cr.*,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
          FROM app.employee_change_requests cr
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = cr.employee_id
            AND ep.tenant_id = cr.tenant_id
            AND ep.effective_to IS NULL
          WHERE cr.tenant_id = ${ctx.tenantId}::uuid
            AND cr.employee_id = ${employeeId}::uuid
            ${filters.status ? tx`AND cr.status = ${filters.status}::app.change_request_status` : tx``}
            ${pagination.cursor ? tx`AND cr.id < ${pagination.cursor}::uuid` : tx``}
          ORDER BY cr.created_at DESC, cr.id DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async listPendingForReview(
    ctx: TenantContext,
    filters: { employeeId?: string; fieldCategory?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<{ items: ChangeRequestRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = Math.min(pagination.limit || 20, 100);

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cr.*,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
          FROM app.employee_change_requests cr
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = cr.employee_id
            AND ep.tenant_id = cr.tenant_id
            AND ep.effective_to IS NULL
          WHERE cr.tenant_id = ${ctx.tenantId}::uuid
            AND cr.status = 'pending'
            AND cr.requires_approval = true
            ${filters.employeeId ? tx`AND cr.employee_id = ${filters.employeeId}::uuid` : tx``}
            ${filters.fieldCategory ? tx`AND cr.field_category = ${filters.fieldCategory}::app.field_category` : tx``}
            ${pagination.cursor ? tx`AND cr.id < ${pagination.cursor}::uuid` : tx``}
          ORDER BY cr.created_at ASC, cr.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Update
  // ===========================================================================

  async review(
    ctx: TenantContext,
    id: string,
    data: {
      status: "approved" | "rejected";
      reviewerId: string;
      reviewerNotes?: string;
    }
  ): Promise<ChangeRequestRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [cr] = await tx`
          UPDATE app.employee_change_requests
          SET
            status = ${data.status}::app.change_request_status,
            reviewer_id = ${data.reviewerId}::uuid,
            reviewer_notes = ${data.reviewerNotes || null},
            reviewed_at = now()
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
          RETURNING *
        `;

        if (cr) {
          // Write to outbox
          await tx`
            INSERT INTO app.domain_outbox (
              id, tenant_id, aggregate_type, aggregate_id,
              event_type, payload, created_at
            )
            VALUES (
              ${crypto.randomUUID()}, ${ctx.tenantId}::uuid,
              'employee_change_request', ${cr.id},
              ${data.status === "approved" ? "hr.change_request.approved" : "hr.change_request.rejected"},
              ${JSON.stringify({
                changeRequestId: cr.id,
                employeeId: cr.employeeId,
                fieldCategory: cr.fieldCategory,
                fieldName: cr.fieldName,
                status: data.status,
                reviewerId: data.reviewerId,
                actor: ctx.userId,
              })}::jsonb,
              now()
            )
          `;
        }

        return [cr];
      }
    );

    return row || null;
  }

  async cancel(ctx: TenantContext, id: string, employeeId: string): Promise<ChangeRequestRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [cr] = await tx`
          UPDATE app.employee_change_requests
          SET status = 'cancelled'::app.change_request_status
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND status = 'pending'
          RETURNING *
        `;

        return [cr];
      }
    );

    return row || null;
  }

  // ===========================================================================
  // Employee lookup helper
  // ===========================================================================

  async getEmployeeByUserId(ctx: TenantContext): Promise<{ id: string; firstName: string; lastName: string } | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            e.id,
            ep.first_name,
            ep.last_name
          FROM app.employees e
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = e.id
            AND ep.tenant_id = e.tenant_id
            AND ep.effective_to IS NULL
          WHERE e.user_id = ${ctx.userId}::uuid
            AND e.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return row || null;
  }

  // ===========================================================================
  // Counts
  // ===========================================================================

  async countPendingByEmployee(ctx: TenantContext, employeeId: string): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*)::int AS count
          FROM app.employee_change_requests
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND status = 'pending'
        `;
      }
    );

    return result?.count || 0;
  }

  async countPendingForReview(ctx: TenantContext): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*)::int AS count
          FROM app.employee_change_requests
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
            AND requires_approval = true
        `;
      }
    );

    return result?.count || 0;
  }
}
