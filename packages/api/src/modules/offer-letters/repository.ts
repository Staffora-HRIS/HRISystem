/**
 * Offer Letters Module - Repository Layer
 *
 * Database operations for offer letters.
 * All reads respect RLS through tenant context.
 * Writes accept a transaction handle so the caller can co-locate
 * outbox inserts inside the same transaction.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface OfferLetterRow {
  id: string;
  tenantId: string;
  candidateId: string;
  requisitionId: string;
  templateId: string | null;
  content: string;
  salaryOffered: number;
  startDate: string;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  declineReason: string | null;
  templateVariables: Record<string, string>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  candidateName?: string;
  requisitionTitle?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class OfferLetterRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Read methods
  // ---------------------------------------------------------------------------

  /**
   * List offer letters with filters and cursor-based pagination.
   */
  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      candidateId?: string;
      requisitionId?: string;
      status?: string;
      search?: string;
    } = {}
  ): Promise<PaginatedResult<OfferLetterRow>> {
    const { cursor, limit = 20, candidateId, requisitionId, status, search } = options;

    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OfferLetterRow[]>`
        SELECT
          ol.id, ol.tenant_id, ol.candidate_id, ol.requisition_id,
          ol.template_id, ol.content, ol.salary_offered, ol.start_date,
          ol.status, ol.sent_at, ol.responded_at, ol.expires_at,
          ol.decline_reason, ol.template_variables,
          ol.created_by, ol.created_at, ol.updated_at,
          c.first_name || ' ' || c.last_name AS candidate_name,
          r.title AS requisition_title
        FROM app.offer_letters ol
        JOIN app.candidates c ON c.id = ol.candidate_id
        JOIN app.requisitions r ON r.id = ol.requisition_id
        WHERE 1=1
          ${candidateId ? tx`AND ol.candidate_id = ${candidateId}::uuid` : tx``}
          ${requisitionId ? tx`AND ol.requisition_id = ${requisitionId}::uuid` : tx``}
          ${status ? tx`AND ol.status = ${status}::app.offer_letter_status` : tx``}
          ${search ? tx`AND (
            c.first_name ILIKE ${"%" + search + "%"}
            OR c.last_name ILIKE ${"%" + search + "%"}
            OR r.title ILIKE ${"%" + search + "%"}
          )` : tx``}
          ${cursor ? tx`AND ol.id > ${cursor}::uuid` : tx``}
        ORDER BY ol.created_at DESC, ol.id ASC
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Get a single offer letter by ID.
   */
  async findById(ctx: TenantContext, id: string): Promise<OfferLetterRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<OfferLetterRow[]>`
        SELECT
          ol.id, ol.tenant_id, ol.candidate_id, ol.requisition_id,
          ol.template_id, ol.content, ol.salary_offered, ol.start_date,
          ol.status, ol.sent_at, ol.responded_at, ol.expires_at,
          ol.decline_reason, ol.template_variables,
          ol.created_by, ol.created_at, ol.updated_at,
          c.first_name || ' ' || c.last_name AS candidate_name,
          r.title AS requisition_title
        FROM app.offer_letters ol
        JOIN app.candidates c ON c.id = ol.candidate_id
        JOIN app.requisitions r ON r.id = ol.requisition_id
        WHERE ol.id = ${id}::uuid
      `;
    });
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Write methods (accept transaction for outbox co-location)
  // ---------------------------------------------------------------------------

  /**
   * Insert a new offer letter row.
   */
  async create(
    tx: any,
    ctx: TenantContext,
    data: {
      candidateId: string;
      requisitionId: string;
      templateId: string | null;
      content: string;
      salaryOffered: number;
      startDate: string;
      expiresAt: string | null;
      templateVariables: Record<string, string>;
      createdBy: string | null;
    }
  ): Promise<OfferLetterRow> {
    const rows = await tx<OfferLetterRow[]>`
      INSERT INTO app.offer_letters (
        tenant_id, candidate_id, requisition_id, template_id,
        content, salary_offered, start_date, expires_at,
        template_variables, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.candidateId}::uuid,
        ${data.requisitionId}::uuid,
        ${data.templateId}::uuid,
        ${data.content},
        ${data.salaryOffered},
        ${data.startDate}::date,
        ${data.expiresAt}::timestamptz,
        ${JSON.stringify(data.templateVariables)}::jsonb,
        ${data.createdBy}::uuid
      )
      RETURNING
        id, tenant_id, candidate_id, requisition_id,
        template_id, content, salary_offered, start_date,
        status, sent_at, responded_at, expires_at,
        decline_reason, template_variables,
        created_by, created_at, updated_at
    `;
    return rows[0]!;
  }

  /**
   * Update fields on a draft offer letter.
   */
  async update(
    tx: any,
    id: string,
    data: {
      content?: string;
      salaryOffered?: number;
      startDate?: string;
      expiresAt?: string | null;
      templateVariables?: Record<string, string>;
    }
  ): Promise<OfferLetterRow | null> {
    const rows = await tx<OfferLetterRow[]>`
      UPDATE app.offer_letters SET
        content = COALESCE(${data.content ?? null}, content),
        salary_offered = COALESCE(${data.salaryOffered ?? null}, salary_offered),
        start_date = COALESCE(${data.startDate ?? null}::date, start_date),
        expires_at = CASE
          WHEN ${data.expiresAt !== undefined} THEN ${data.expiresAt ?? null}::timestamptz
          ELSE expires_at
        END,
        template_variables = CASE
          WHEN ${data.templateVariables !== undefined}
            THEN ${data.templateVariables ? JSON.stringify(data.templateVariables) : null}::jsonb
          ELSE template_variables
        END,
        updated_at = now()
      WHERE id = ${id}::uuid
        AND status = 'draft'
      RETURNING
        id, tenant_id, candidate_id, requisition_id,
        template_id, content, salary_offered, start_date,
        status, sent_at, responded_at, expires_at,
        decline_reason, template_variables,
        created_by, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Transition offer letter to 'sent' status.
   */
  async markSent(tx: any, id: string): Promise<OfferLetterRow | null> {
    const rows = await tx<OfferLetterRow[]>`
      UPDATE app.offer_letters
      SET status = 'sent', sent_at = now(), updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, candidate_id, requisition_id,
        template_id, content, salary_offered, start_date,
        status, sent_at, responded_at, expires_at,
        decline_reason, template_variables,
        created_by, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Transition offer letter to 'accepted' status.
   */
  async markAccepted(tx: any, id: string): Promise<OfferLetterRow | null> {
    const rows = await tx<OfferLetterRow[]>`
      UPDATE app.offer_letters
      SET status = 'accepted', responded_at = now(), updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, candidate_id, requisition_id,
        template_id, content, salary_offered, start_date,
        status, sent_at, responded_at, expires_at,
        decline_reason, template_variables,
        created_by, created_at, updated_at
    `;
    return rows[0] || null;
  }

  /**
   * Transition offer letter to 'declined' status.
   */
  async markDeclined(
    tx: any,
    id: string,
    reason?: string
  ): Promise<OfferLetterRow | null> {
    const rows = await tx<OfferLetterRow[]>`
      UPDATE app.offer_letters
      SET status = 'declined',
          responded_at = now(),
          decline_reason = ${reason || null},
          updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, candidate_id, requisition_id,
        template_id, content, salary_offered, start_date,
        status, sent_at, responded_at, expires_at,
        decline_reason, template_variables,
        created_by, created_at, updated_at
    `;
    return rows[0] || null;
  }

  // ---------------------------------------------------------------------------
  // Candidate data for template rendering
  // ---------------------------------------------------------------------------

  /**
   * Fetch candidate + requisition data for template variable substitution.
   * Returns a flat Record<string, string> suitable for {{placeholder}} replacement.
   */
  async getCandidateDataForRendering(
    ctx: TenantContext,
    candidateId: string,
    requisitionId: string
  ): Promise<Record<string, string> | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<Record<string, unknown>[]>`
        SELECT
          c.first_name,
          c.last_name,
          c.email,
          c.phone,
          r.title AS job_title,
          r.code AS requisition_code,
          ou.name AS org_unit_name,
          p.title AS position_title,
          e.first_name || ' ' || e.last_name AS hiring_manager_name
        FROM app.candidates c
        JOIN app.requisitions r ON r.id = c.requisition_id
        LEFT JOIN app.org_units ou ON ou.id = r.org_unit_id
        LEFT JOIN app.positions p ON p.id = r.position_id
        LEFT JOIN app.employees e ON e.id = r.hiring_manager_id
        WHERE c.id = ${candidateId}::uuid
          AND r.id = ${requisitionId}::uuid
      `;
    });

    if (!rows[0]) return null;

    const row = rows[0];
    const safeStr = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().split("T")[0]!;
      return String(val);
    };

    return {
      candidate_name: [row.firstName, row.lastName].filter(Boolean).join(" "),
      candidate_first_name: safeStr(row.firstName),
      candidate_last_name: safeStr(row.lastName),
      candidate_email: safeStr(row.email),
      candidate_phone: safeStr(row.phone),
      job_title: safeStr(row.jobTitle),
      requisition_code: safeStr(row.requisitionCode),
      org_unit_name: safeStr(row.orgUnitName),
      position_title: safeStr(row.positionTitle),
      hiring_manager_name: safeStr(row.hiringManagerName),
      today_date: new Date().toISOString().split("T")[0]!,
      current_year: String(new Date().getFullYear()),
    };
  }
}
