/**
 * E-Signatures Module - Repository Layer
 *
 * Handles database operations for signature request management.
 * All queries use postgres.js tagged templates with RLS enforcement.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type {
  SignatureProvider,
  SignatureStatus,
  CreateSignatureRequest,
  SignatureRequestFilters,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface SignatureRequestRow {
  id: string;
  tenantId: string;
  documentId: string;
  signerEmployeeId: string | null;
  signerEmployeeName: string | null;
  signerEmail: string;
  provider: SignatureProvider;
  providerReference: string | null;
  status: SignatureStatus;
  message: string | null;
  signatureStatement: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  signedAt: Date | null;
  declinedAt: Date | null;
  expiresAt: Date | null;
  signedDocumentUrl: string | null;
  signatureIp: string | null;
  signatureUserAgent: string | null;
  declineReason: string | null;
  reminderCount: number;
  lastReminderAt: Date | null;
  requestedBy: string;
  requestedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SignatureEventRow {
  id: string;
  signatureRequestId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  actorIp: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ESignaturesRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Find Operations
  // ===========================================================================

  async findSignatureRequests(
    context: TenantContext,
    filters: SignatureRequestFilters = {},
    pagination: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<SignatureRequestRow>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<SignatureRequestRow[]>`
        SELECT
          sr.id,
          sr.tenant_id,
          sr.document_id,
          sr.signer_employee_id,
          app.get_employee_display_name(sr.signer_employee_id) as "signerEmployeeName",
          sr.signer_email,
          sr.provider,
          sr.provider_reference,
          sr.status,
          sr.message,
          sr.signature_statement,
          sr.sent_at,
          sr.viewed_at,
          sr.signed_at,
          sr.declined_at,
          sr.expires_at,
          sr.signed_document_url,
          sr.signature_ip,
          sr.signature_user_agent,
          sr.decline_reason,
          sr.reminder_count,
          sr.last_reminder_at,
          sr.requested_by,
          app.get_user_display_name(sr.requested_by) as "requestedByName",
          sr.created_at,
          sr.updated_at
        FROM app.signature_requests sr
        WHERE sr.tenant_id = ${context.tenantId}::uuid
          ${filters.document_id ? tx`AND sr.document_id = ${filters.document_id}::uuid` : tx``}
          ${filters.signer_employee_id ? tx`AND sr.signer_employee_id = ${filters.signer_employee_id}::uuid` : tx``}
          ${filters.signer_email ? tx`AND sr.signer_email ILIKE ${"%" + filters.signer_email + "%"}` : tx``}
          ${filters.provider ? tx`AND sr.provider = ${filters.provider}` : tx``}
          ${filters.status ? tx`AND sr.status = ${filters.status}` : tx``}
          ${pagination.cursor ? tx`AND sr.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY sr.created_at DESC, sr.id
        LIMIT ${limit + 1}
      `;
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  async findSignatureRequestById(
    context: TenantContext,
    id: string
  ): Promise<SignatureRequestRow | null> {
    const rows = await this.db.withTransaction(context, async (tx) => {
      return tx<SignatureRequestRow[]>`
        SELECT
          sr.id,
          sr.tenant_id,
          sr.document_id,
          sr.signer_employee_id,
          app.get_employee_display_name(sr.signer_employee_id) as "signerEmployeeName",
          sr.signer_email,
          sr.provider,
          sr.provider_reference,
          sr.status,
          sr.message,
          sr.signature_statement,
          sr.sent_at,
          sr.viewed_at,
          sr.signed_at,
          sr.declined_at,
          sr.expires_at,
          sr.signed_document_url,
          sr.signature_ip,
          sr.signature_user_agent,
          sr.decline_reason,
          sr.reminder_count,
          sr.last_reminder_at,
          sr.requested_by,
          app.get_user_display_name(sr.requested_by) as "requestedByName",
          sr.created_at,
          sr.updated_at
        FROM app.signature_requests sr
        WHERE sr.id = ${id}::uuid
          AND sr.tenant_id = ${context.tenantId}::uuid
      `;
    });

    return rows[0] ?? null;
  }

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  async createSignatureRequest(
    tx: TransactionSql,
    context: TenantContext,
    data: CreateSignatureRequest
  ): Promise<SignatureRequestRow> {
    const rows = await tx<SignatureRequestRow[]>`
      INSERT INTO app.signature_requests (
        tenant_id, document_id, signer_employee_id, signer_email,
        provider, status, message, signature_statement,
        expires_at, requested_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.document_id}::uuid,
        ${data.signer_employee_id ?? null}::uuid,
        ${data.signer_email},
        ${data.provider ?? "internal"},
        'pending',
        ${data.message ?? null},
        ${data.signature_statement ?? "I confirm I have read and agree to this document."},
        ${data.expires_at ?? null}::timestamptz,
        ${context.userId!}::uuid
      )
      RETURNING
        id,
        tenant_id,
        document_id,
        signer_employee_id,
        signer_email,
        provider,
        provider_reference,
        status,
        message,
        signature_statement,
        sent_at,
        viewed_at,
        signed_at,
        declined_at,
        expires_at,
        signed_document_url,
        signature_ip,
        signature_user_agent,
        decline_reason,
        reminder_count,
        last_reminder_at,
        requested_by,
        created_at,
        updated_at
    `;

    return rows[0]!;
  }

  async updateSignatureRequestStatus(
    tx: TransactionSql,
    context: TenantContext,
    id: string,
    status: SignatureStatus,
    extra: Record<string, unknown> = {}
  ): Promise<SignatureRequestRow | null> {
    // Build dynamic SET clauses for extra fields
    const rows = await tx<SignatureRequestRow[]>`
      UPDATE app.signature_requests
      SET
        status = ${status},
        sent_at = COALESCE(${(extra.sentAt as Date) ?? null}::timestamptz, sent_at),
        viewed_at = COALESCE(${(extra.viewedAt as Date) ?? null}::timestamptz, viewed_at),
        signed_at = COALESCE(${(extra.signedAt as Date) ?? null}::timestamptz, signed_at),
        declined_at = COALESCE(${(extra.declinedAt as Date) ?? null}::timestamptz, declined_at),
        signature_ip = COALESCE(${(extra.signatureIp as string) ?? null}::inet, signature_ip),
        signature_user_agent = COALESCE(${(extra.signatureUserAgent as string) ?? null}, signature_user_agent),
        signed_document_url = COALESCE(${(extra.signedDocumentUrl as string) ?? null}, signed_document_url),
        decline_reason = COALESCE(${(extra.declineReason as string) ?? null}, decline_reason),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
      RETURNING
        id,
        tenant_id,
        document_id,
        signer_employee_id,
        signer_email,
        provider,
        provider_reference,
        status,
        message,
        signature_statement,
        sent_at,
        viewed_at,
        signed_at,
        declined_at,
        expires_at,
        signed_document_url,
        signature_ip,
        signature_user_agent,
        decline_reason,
        reminder_count,
        last_reminder_at,
        requested_by,
        created_at,
        updated_at
    `;

    return rows[0] ?? null;
  }

  async incrementReminderCount(
    tx: TransactionSql,
    context: TenantContext,
    id: string
  ): Promise<void> {
    await tx`
      UPDATE app.signature_requests
      SET
        reminder_count = reminder_count + 1,
        last_reminder_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
        AND tenant_id = ${context.tenantId}::uuid
    `;
  }

  // ===========================================================================
  // Event Trail
  // ===========================================================================

  async insertEvent(
    tx: TransactionSql,
    context: TenantContext,
    event: {
      signatureRequestId: string;
      fromStatus: string | null;
      toStatus: string;
      actorId: string | null;
      actorIp: string | null;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.signature_request_events (
        tenant_id, signature_request_id, from_status, to_status,
        actor_id, actor_ip, metadata
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${event.signatureRequestId}::uuid,
        ${event.fromStatus},
        ${event.toStatus},
        ${event.actorId}::uuid,
        ${event.actorIp}::inet,
        ${JSON.stringify(event.metadata ?? {})}::jsonb
      )
    `;
  }

  async findEventsByRequestId(
    context: TenantContext,
    signatureRequestId: string
  ): Promise<SignatureEventRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return tx<SignatureEventRow[]>`
        SELECT
          e.id,
          e.signature_request_id,
          e.from_status,
          e.to_status,
          e.actor_id,
          e.actor_ip,
          e.metadata,
          e.created_at
        FROM app.signature_request_events e
        WHERE e.signature_request_id = ${signatureRequestId}::uuid
          AND e.tenant_id = ${context.tenantId}::uuid
        ORDER BY e.created_at ASC
      `;
    });
  }
}
