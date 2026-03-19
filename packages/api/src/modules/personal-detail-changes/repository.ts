/**
 * Personal Detail Changes Module - Repository Layer
 *
 * Database operations for personal detail change requests (TODO-150).
 * All queries respect RLS via tenant context set by db.withTransaction.
 */

import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Row type
// =============================================================================

export interface PersonalDetailChangeRow {
  id: string;
  tenantId: string;
  employeeId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewerNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  employeeName?: string;
  reviewerName?: string;
}

// =============================================================================
// Repository
// =============================================================================

export class PersonalDetailChangeRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Employee lookup
  // ===========================================================================

  async getEmployeeByUserId(
    ctx: TenantContext
  ): Promise<{ id: string; firstName: string; lastName: string } | null> {
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
  // Create
  // ===========================================================================

  async create(
    ctx: TenantContext,
    data: {
      employeeId: string;
      fieldName: string;
      oldValue: string | null;
      newValue: string;
      autoApproved: boolean;
    }
  ): Promise<PersonalDetailChangeRow> {
    const status = data.autoApproved ? "approved" : "pending";

    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [cr] = await tx`
          INSERT INTO app.personal_detail_change_requests (
            tenant_id, employee_id, field_name,
            old_value, new_value, status
          )
          VALUES (
            ${ctx.tenantId}::uuid, ${data.employeeId}::uuid,
            ${data.fieldName}, ${data.oldValue}, ${data.newValue},
            ${status}::app.personal_detail_change_status
          )
          RETURNING *
        `;

        const eventType = data.autoApproved
          ? "portal.personal_detail_change.auto_approved"
          : "portal.personal_detail_change.submitted";

        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id,
            event_type, payload, created_at
          )
          VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid,
            'personal_detail_change_request', ${cr.id},
            ${eventType},
            ${JSON.stringify({
              changeRequestId: cr.id,
              employeeId: data.employeeId,
              fieldName: data.fieldName,
              autoApproved: data.autoApproved,
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
  // Read - Employee portal
  // ===========================================================================

  async listByEmployee(
    ctx: TenantContext,
    employeeId: string,
    filters: { status?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<{
    items: PersonalDetailChangeRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(pagination.limit || 20, 100);

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT cr.*
          FROM app.personal_detail_change_requests cr
          WHERE cr.tenant_id = ${ctx.tenantId}::uuid
            AND cr.employee_id = ${employeeId}::uuid
            ${filters.status
              ? tx`AND cr.status = ${filters.status}::app.personal_detail_change_status`
              : tx``}
            ${pagination.cursor
              ? tx`AND cr.id < ${pagination.cursor}::uuid`
              : tx``}
          ORDER BY cr.created_at DESC, cr.id DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  // ===========================================================================
  // Read - Manager / HR review
  // ===========================================================================

  async listPendingForReview(
    ctx: TenantContext,
    filters: { employeeId?: string },
    pagination: { cursor?: string; limit?: number }
  ): Promise<{
    items: PersonalDetailChangeRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = Math.min(pagination.limit || 20, 100);

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cr.*,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name
          FROM app.personal_detail_change_requests cr
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = cr.employee_id
            AND ep.tenant_id = cr.tenant_id
            AND ep.effective_to IS NULL
          WHERE cr.tenant_id = ${ctx.tenantId}::uuid
            AND cr.status = 'pending'
            ${filters.employeeId
              ? tx`AND cr.employee_id = ${filters.employeeId}::uuid`
              : tx``}
            ${pagination.cursor
              ? tx`AND cr.id > ${pagination.cursor}::uuid`
              : tx``}
          ORDER BY cr.created_at ASC, cr.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async findById(
    ctx: TenantContext,
    id: string
  ): Promise<PersonalDetailChangeRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            cr.*,
            CONCAT(ep.first_name, ' ', ep.last_name) AS employee_name,
            ru.name AS reviewer_name
          FROM app.personal_detail_change_requests cr
          LEFT JOIN app.employee_personal ep
            ON ep.employee_id = cr.employee_id
            AND ep.tenant_id = cr.tenant_id
            AND ep.effective_to IS NULL
          LEFT JOIN app."user" ru
            ON ru.id = cr.reviewed_by::text
          WHERE cr.id = ${id}::uuid
            AND cr.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return row || null;
  }

  // ===========================================================================
  // Update - Review (approve / reject)
  // ===========================================================================

  async review(
    ctx: TenantContext,
    id: string,
    data: {
      status: "approved" | "rejected";
      reviewerId: string;
      reviewerNotes?: string;
    }
  ): Promise<PersonalDetailChangeRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [cr] = await tx`
          UPDATE app.personal_detail_change_requests
          SET
            status = ${data.status}::app.personal_detail_change_status,
            reviewed_by = ${data.reviewerId}::uuid,
            reviewer_notes = ${data.reviewerNotes || null},
            reviewed_at = now()
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
          RETURNING *
        `;

        if (cr) {
          const eventType =
            data.status === "approved"
              ? "portal.personal_detail_change.approved"
              : "portal.personal_detail_change.rejected";

          await tx`
            INSERT INTO app.domain_outbox (
              id, tenant_id, aggregate_type, aggregate_id,
              event_type, payload, created_at
            )
            VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid,
              'personal_detail_change_request', ${cr.id},
              ${eventType},
              ${JSON.stringify({
                changeRequestId: cr.id,
                employeeId: cr.employeeId,
                fieldName: cr.fieldName,
                oldValue: cr.oldValue,
                newValue: cr.newValue,
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

  // ===========================================================================
  // Update - Cancel
  // ===========================================================================

  async cancel(
    ctx: TenantContext,
    id: string,
    employeeId: string
  ): Promise<PersonalDetailChangeRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [cr] = await tx`
          UPDATE app.personal_detail_change_requests
          SET status = 'cancelled'::app.personal_detail_change_status
          WHERE id = ${id}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
            AND employee_id = ${employeeId}::uuid
            AND status = 'pending'
          RETURNING *
        `;

        if (cr) {
          await tx`
            INSERT INTO app.domain_outbox (
              id, tenant_id, aggregate_type, aggregate_id,
              event_type, payload, created_at
            )
            VALUES (
              gen_random_uuid(), ${ctx.tenantId}::uuid,
              'personal_detail_change_request', ${cr.id},
              'portal.personal_detail_change.cancelled',
              ${JSON.stringify({
                changeRequestId: cr.id,
                employeeId: cr.employeeId,
                fieldName: cr.fieldName,
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

  // ===========================================================================
  // Counts
  // ===========================================================================

  async countPendingByEmployee(
    ctx: TenantContext,
    employeeId: string
  ): Promise<number> {
    const [result] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT COUNT(*)::int AS count
          FROM app.personal_detail_change_requests
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
          FROM app.personal_detail_change_requests
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND status = 'pending'
        `;
      }
    );

    return result?.count || 0;
  }

  // ===========================================================================
  // Field Application
  // ===========================================================================

  async applyFieldChange(
    ctx: TenantContext,
    employeeId: string,
    fieldName: string,
    newValue: string
  ): Promise<void> {
    await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        // Contact fields -> employee_contacts table
        if (fieldName === "phone" || fieldName === "mobile" || fieldName === "personal_email") {
          const columnMap: Record<string, string> = {
            phone: "personal_phone",
            mobile: "mobile_phone",
            personal_email: "personal_email",
          };
          const column = columnMap[fieldName]!;

          await tx`
            UPDATE app.employee_contacts
            SET ${tx.unsafe(column)} = ${newValue},
                updated_at = now()
            WHERE employee_id = ${employeeId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
              AND is_primary = true
          `;
          return;
        }

        // Name fields -> employee_personal table
        if (["first_name", "last_name", "middle_name", "preferred_name"].includes(fieldName)) {
          await tx`
            UPDATE app.employee_personal
            SET ${tx.unsafe(fieldName)} = ${newValue},
                updated_at = now()
            WHERE employee_id = ${employeeId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
              AND effective_to IS NULL
          `;
          return;
        }

        // Address fields -> employee_addresses table
        if (["address_line_1", "address_line_2", "city", "county", "postcode", "country"].includes(fieldName)) {
          await tx`
            UPDATE app.employee_addresses
            SET ${tx.unsafe(fieldName)} = ${newValue},
                updated_at = now()
            WHERE employee_id = ${employeeId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
              AND effective_to IS NULL
              AND is_primary = true
          `;
          return;
        }

        // Bank detail fields -> employee_bank_details table
        if (["bank_name", "account_holder_name", "sort_code", "account_number", "building_society_ref"].includes(fieldName)) {
          await tx`
            UPDATE app.employee_bank_details
            SET ${tx.unsafe(fieldName)} = ${newValue},
                updated_at = now()
            WHERE employee_id = ${employeeId}::uuid
              AND tenant_id = ${ctx.tenantId}::uuid
              AND is_primary = true
          `;
          return;
        }

        // Emergency contact fields -> emergency_contacts table
        if (fieldName.startsWith("emergency_contact_")) {
          const ecColumnMap: Record<string, string> = {
            emergency_contact_name: "name",
            emergency_contact_relationship: "relationship",
            emergency_contact_phone: "phone",
            emergency_contact_email: "email",
          };
          const column = ecColumnMap[fieldName];
          if (column) {
            await tx`
              UPDATE app.emergency_contacts
              SET ${tx.unsafe(column)} = ${newValue},
                  updated_at = now()
              WHERE employee_id = ${employeeId}::uuid
                AND tenant_id = ${ctx.tenantId}::uuid
                AND is_primary = true
            `;
          }
        }
      }
    );
  }
}
