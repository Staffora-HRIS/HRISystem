/**
 * Email Tracking Module - Repository Layer
 *
 * Database operations for the email_delivery_log table.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  EmailDeliveryFilters,
  EmailDeliveryStatus,
  PaginationQuery,
  BounceType,
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

/** Raw DB row shape for email_delivery_log (after camelCase transform) */
export interface EmailDeliveryLogRow extends Row {
  id: string;
  tenantId: string;
  toAddress: string;
  subject: string;
  templateName: string | null;
  status: EmailDeliveryStatus;
  messageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  bouncedAt: Date | null;
  bounceType: string | null;
  bounceReason: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Aggregate stats row from the stats query */
export interface EmailDeliveryStatsRow extends Row {
  total: string;
  queued: string;
  sent: string;
  delivered: string;
  bounced: string;
  failed: string;
}

// =============================================================================
// Repository
// =============================================================================

export class EmailTrackingRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Create / Insert
  // ===========================================================================

  /**
   * Insert a new email delivery log entry (called by notification worker).
   * Runs inside the provided transaction or creates one with system context.
   */
  async create(
    data: {
      tenantId: string;
      toAddress: string;
      subject: string;
      templateName?: string | null;
      status: EmailDeliveryStatus;
      messageId?: string | null;
      sentAt?: Date | null;
      errorMessage?: string | null;
      metadata?: Record<string, unknown>;
    },
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<EmailDeliveryLogRow> {
    const exec = async (
      sql: TransactionSql<Record<string, unknown>>
    ): Promise<EmailDeliveryLogRow> => {
      const rows = await sql<EmailDeliveryLogRow[]>`
        INSERT INTO email_delivery_log (
          tenant_id,
          to_address,
          subject,
          template_name,
          status,
          message_id,
          sent_at,
          error_message,
          metadata
        )
        VALUES (
          ${data.tenantId}::uuid,
          ${data.toAddress},
          ${data.subject},
          ${data.templateName ?? null},
          ${data.status}::app.email_delivery_status,
          ${data.messageId ?? null},
          ${data.sentAt ?? null},
          ${data.errorMessage ?? null},
          ${JSON.stringify(data.metadata ?? {})}::jsonb
        )
        RETURNING *
      `;
      return rows[0];
    };

    if (tx) return exec(tx);
    return this.db.withSystemContext(exec);
  }

  // ===========================================================================
  // Status Updates
  // ===========================================================================

  /**
   * Update delivery status to 'sent'
   */
  async markSent(
    id: string,
    messageId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<EmailDeliveryLogRow | null> {
    const exec = async (
      sql: TransactionSql<Record<string, unknown>>
    ): Promise<EmailDeliveryLogRow | null> => {
      const rows = await sql<EmailDeliveryLogRow[]>`
        UPDATE email_delivery_log
        SET status = 'sent'::app.email_delivery_status,
            message_id = ${messageId},
            sent_at = now(),
            updated_at = now()
        WHERE id = ${id}
          AND status = 'queued'::app.email_delivery_status
        RETURNING *
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withSystemContext(exec);
  }

  /**
   * Update delivery status to 'delivered'
   */
  async markDelivered(
    id: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<EmailDeliveryLogRow | null> {
    const exec = async (
      sql: TransactionSql<Record<string, unknown>>
    ): Promise<EmailDeliveryLogRow | null> => {
      const rows = await sql<EmailDeliveryLogRow[]>`
        UPDATE email_delivery_log
        SET status = 'delivered'::app.email_delivery_status,
            delivered_at = now(),
            updated_at = now()
        WHERE id = ${id}
          AND status = 'sent'::app.email_delivery_status
        RETURNING *
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withSystemContext(exec);
  }

  /**
   * Update delivery status to 'bounced'
   */
  async markBounced(
    messageId: string,
    bounceType: BounceType,
    bounceReason?: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<EmailDeliveryLogRow | null> {
    const exec = async (
      sql: TransactionSql<Record<string, unknown>>
    ): Promise<EmailDeliveryLogRow | null> => {
      const rows = await sql<EmailDeliveryLogRow[]>`
        UPDATE email_delivery_log
        SET status = 'bounced'::app.email_delivery_status,
            bounced_at = now(),
            bounce_type = ${bounceType},
            bounce_reason = ${bounceReason ?? null},
            updated_at = now()
        WHERE message_id = ${messageId}
          AND status IN ('sent'::app.email_delivery_status, 'delivered'::app.email_delivery_status)
        RETURNING *
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withSystemContext(exec);
  }

  /**
   * Update delivery status to 'failed'
   */
  async markFailed(
    id: string,
    errorMessage: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<EmailDeliveryLogRow | null> {
    const exec = async (
      sql: TransactionSql<Record<string, unknown>>
    ): Promise<EmailDeliveryLogRow | null> => {
      const rows = await sql<EmailDeliveryLogRow[]>`
        UPDATE email_delivery_log
        SET status = 'failed'::app.email_delivery_status,
            error_message = ${errorMessage},
            retry_count = retry_count + 1,
            updated_at = now()
        WHERE id = ${id}
          AND status IN ('queued'::app.email_delivery_status, 'sent'::app.email_delivery_status)
        RETURNING *
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withSystemContext(exec);
  }

  // ===========================================================================
  // Read Operations (tenant-scoped via RLS)
  // ===========================================================================

  /**
   * List email delivery log entries with cursor-based pagination and filters.
   */
  async list(
    ctx: TenantContext,
    filters: EmailDeliveryFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<EmailDeliveryLogRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<EmailDeliveryLogRow[]>`
        SELECT
          id, tenant_id, to_address, subject, template_name,
          status, message_id,
          sent_at, delivered_at, bounced_at,
          bounce_type, bounce_reason,
          error_message, retry_count,
          metadata,
          created_at, updated_at
        FROM email_delivery_log
        WHERE 1=1
          ${filters.status ? tx`AND status = ${filters.status}::app.email_delivery_status` : tx``}
          ${filters.to_address ? tx`AND to_address ILIKE ${"%" + filters.to_address + "%"}` : tx``}
          ${filters.template_name ? tx`AND template_name = ${filters.template_name}` : tx``}
          ${filters.date_from ? tx`AND created_at >= ${filters.date_from}::timestamptz` : tx``}
          ${filters.date_to ? tx`AND created_at <= ${filters.date_to}::timestamptz` : tx``}
          ${
            filters.search
              ? tx`AND (
                  to_address ILIKE ${"%" + filters.search + "%"}
                  OR subject ILIKE ${"%" + filters.search + "%"}
                  OR template_name ILIKE ${"%" + filters.search + "%"}
                )`
              : tx``
          }
          ${pagination.cursor ? tx`AND created_at < ${pagination.cursor}::timestamptz` : tx``}
        ORDER BY created_at DESC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      return { items, nextCursor, hasMore };
    });
  }

  /**
   * Get a single email delivery log entry by ID.
   */
  async getById(
    ctx: TenantContext,
    id: string
  ): Promise<EmailDeliveryLogRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EmailDeliveryLogRow[]>`
        SELECT
          id, tenant_id, to_address, subject, template_name,
          status, message_id,
          sent_at, delivered_at, bounced_at,
          bounce_type, bounce_reason,
          error_message, retry_count,
          metadata,
          created_at, updated_at
        FROM email_delivery_log
        WHERE id = ${id}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Get aggregate delivery statistics for a time period.
   */
  async getStats(
    ctx: TenantContext,
    dateFrom: string,
    dateTo: string,
    templateName?: string
  ): Promise<EmailDeliveryStatsRow> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<EmailDeliveryStatsRow[]>`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'queued')::text AS queued,
          COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced')::text AS bounced,
          COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
        FROM email_delivery_log
        WHERE created_at >= ${dateFrom}::timestamptz
          AND created_at <= ${dateTo}::timestamptz
          ${templateName ? tx`AND template_name = ${templateName}` : tx``}
      `;
    });

    return (
      rows[0] ?? {
        total: "0",
        queued: "0",
        sent: "0",
        delivered: "0",
        bounced: "0",
        failed: "0",
      }
    );
  }
}
