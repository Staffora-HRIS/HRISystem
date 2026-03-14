/**
 * Reference Checks Repository
 *
 * Database operations for reference checks
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface ReferenceCheck {
  id: string;
  tenant_id: string;
  candidate_id: string | null;
  employee_id: string | null;
  referee_name: string;
  referee_email: string;
  referee_phone: string | null;
  referee_relationship: "manager" | "colleague" | "academic" | "character";
  company_name: string | null;
  job_title: string | null;
  dates_from: string | null;
  dates_to: string | null;
  status: "pending" | "sent" | "received" | "verified" | "failed";
  sent_at: string | null;
  received_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  reference_content: string | null;
  satisfactory: boolean | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  candidate_name?: string;
  employee_name?: string;
}

// =============================================================================
// Reference Checks Repository
// =============================================================================

export class ReferenceCheckRepository {
  constructor(private db: DatabaseClient) {}

  async list(
    ctx: TenantContext,
    options: {
      cursor?: string;
      limit?: number;
      candidateId?: string;
      employeeId?: string;
      status?: string;
      search?: string;
    } = {}
  ): Promise<{ items: ReferenceCheck[]; nextCursor: string | null; hasMore: boolean }> {
    const { cursor, limit = 20, candidateId, employeeId, status, search } = options;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<ReferenceCheck[]>`
          SELECT
            rc.id, rc.tenant_id, rc.candidate_id, rc.employee_id,
            rc.referee_name, rc.referee_email, rc.referee_phone,
            rc.referee_relationship, rc.company_name, rc.job_title,
            rc.dates_from, rc.dates_to, rc.status,
            rc.sent_at, rc.received_at, rc.verified_by,
            rc.verification_notes, rc.reference_content, rc.satisfactory,
            rc.created_at, rc.updated_at
          FROM app.reference_checks rc
          WHERE rc.tenant_id = ${ctx.tenantId}::uuid
          ${candidateId ? tx`AND rc.candidate_id = ${candidateId}::uuid` : tx``}
          ${employeeId ? tx`AND rc.employee_id = ${employeeId}::uuid` : tx``}
          ${status ? tx`AND rc.status = ${status}::app.reference_check_status` : tx``}
          ${search ? tx`AND (rc.referee_name ILIKE ${"%" + search + "%"} OR rc.referee_email ILIKE ${"%" + search + "%"} OR rc.company_name ILIKE ${"%" + search + "%"})` : tx``}
          ${cursor ? tx`AND rc.id > ${cursor}::uuid` : tx``}
          ORDER BY rc.created_at DESC, rc.id ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }

  async getById(ctx: TenantContext, id: string): Promise<ReferenceCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ReferenceCheck[]>`
        SELECT
          rc.id, rc.tenant_id, rc.candidate_id, rc.employee_id,
          rc.referee_name, rc.referee_email, rc.referee_phone,
          rc.referee_relationship, rc.company_name, rc.job_title,
          rc.dates_from, rc.dates_to, rc.status,
          rc.sent_at, rc.received_at, rc.verified_by,
          rc.verification_notes, rc.reference_content, rc.satisfactory,
          rc.created_at, rc.updated_at
        FROM app.reference_checks rc
        WHERE rc.id = ${id}::uuid AND rc.tenant_id = ${ctx.tenantId}::uuid
      `;
    });
    return rows[0] || null;
  }

  async create(
    ctx: TenantContext,
    data: {
      candidateId?: string;
      employeeId?: string;
      refereeName: string;
      refereeEmail: string;
      refereePhone?: string;
      refereeRelationship: string;
      companyName?: string;
      jobTitle?: string;
      datesFrom?: string;
      datesTo?: string;
    }
  ): Promise<ReferenceCheck> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ReferenceCheck[]>`
        INSERT INTO app.reference_checks (
          tenant_id, candidate_id, employee_id,
          referee_name, referee_email, referee_phone, referee_relationship,
          company_name, job_title, dates_from, dates_to
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.candidateId || null}::uuid,
          ${data.employeeId || null}::uuid,
          ${data.refereeName},
          ${data.refereeEmail},
          ${data.refereePhone || null},
          ${data.refereeRelationship}::app.referee_relationship,
          ${data.companyName || null},
          ${data.jobTitle || null},
          ${data.datesFrom || null}::date,
          ${data.datesTo || null}::date
        )
        RETURNING id, tenant_id, candidate_id, employee_id,
          referee_name, referee_email, referee_phone, referee_relationship,
          company_name, job_title, dates_from, dates_to,
          status, sent_at, received_at, verified_by,
          verification_notes, reference_content, satisfactory,
          created_at, updated_at
      `;
    });
    return rows[0];
  }

  async update(
    ctx: TenantContext,
    id: string,
    data: Partial<{
      refereeName: string;
      refereeEmail: string;
      refereePhone: string | null;
      refereeRelationship: string;
      companyName: string | null;
      jobTitle: string | null;
      datesFrom: string | null;
      datesTo: string | null;
      referenceContent: string | null;
      verificationNotes: string | null;
      satisfactory: boolean | null;
    }>
  ): Promise<ReferenceCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ReferenceCheck[]>`
        UPDATE app.reference_checks SET
          referee_name = COALESCE(${data.refereeName}, referee_name),
          referee_email = COALESCE(${data.refereeEmail}, referee_email),
          referee_phone = COALESCE(${data.refereePhone}, referee_phone),
          referee_relationship = COALESCE(${data.refereeRelationship}::app.referee_relationship, referee_relationship),
          company_name = COALESCE(${data.companyName}, company_name),
          job_title = COALESCE(${data.jobTitle}, job_title),
          dates_from = COALESCE(${data.datesFrom}::date, dates_from),
          dates_to = COALESCE(${data.datesTo}::date, dates_to),
          reference_content = COALESCE(${data.referenceContent}, reference_content),
          verification_notes = COALESCE(${data.verificationNotes}, verification_notes),
          satisfactory = COALESCE(${data.satisfactory}, satisfactory),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, candidate_id, employee_id,
          referee_name, referee_email, referee_phone, referee_relationship,
          company_name, job_title, dates_from, dates_to,
          status, sent_at, received_at, verified_by,
          verification_notes, reference_content, satisfactory,
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
      sentAt: string;
      receivedAt: string;
      verifiedBy: string;
      verificationNotes: string;
      satisfactory: boolean;
    }>
  ): Promise<ReferenceCheck | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<ReferenceCheck[]>`
        UPDATE app.reference_checks SET
          status = ${status}::app.reference_check_status,
          sent_at = COALESCE(${extraFields?.sentAt || null}::timestamptz, sent_at),
          received_at = COALESCE(${extraFields?.receivedAt || null}::timestamptz, received_at),
          verified_by = COALESCE(${extraFields?.verifiedBy || null}::uuid, verified_by),
          verification_notes = COALESCE(${extraFields?.verificationNotes || null}, verification_notes),
          satisfactory = COALESCE(${extraFields?.satisfactory ?? null}, satisfactory),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id, tenant_id, candidate_id, employee_id,
          referee_name, referee_email, referee_phone, referee_relationship,
          company_name, job_title, dates_from, dates_to,
          status, sent_at, received_at, verified_by,
          verification_notes, reference_content, satisfactory,
          created_at, updated_at
      `;
    });
    return rows[0] || null;
  }
}
