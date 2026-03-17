/**
 * Email Tracking Module - Service Layer
 *
 * Business logic for email delivery monitoring, bounce handling,
 * and delivery statistics.
 *
 * This service provides two "faces":
 * 1. Write operations used by the notification worker (system context)
 * 2. Read operations exposed via REST API endpoints (tenant-scoped)
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  EmailTrackingRepository,
  type EmailDeliveryLogRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  EmailDeliveryFilters,
  EmailDeliveryStatus,
  EmailDeliveryLogResponse,
  EmailDeliveryStatsResponse,
  EmailDeliveryStatsQuery,
  PaginationQuery,
  BounceType,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapRowToResponse(row: EmailDeliveryLogRow): EmailDeliveryLogResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    to_address: row.toAddress,
    subject: row.subject,
    template_name: row.templateName,
    status: row.status,
    message_id: row.messageId,
    sent_at: row.sentAt?.toISOString() ?? null,
    delivered_at: row.deliveredAt?.toISOString() ?? null,
    bounced_at: row.bouncedAt?.toISOString() ?? null,
    bounce_type: row.bounceType,
    bounce_reason: row.bounceReason,
    error_message: row.errorMessage,
    retry_count: row.retryCount,
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class EmailTrackingService {
  constructor(
    private repository: EmailTrackingRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Write Operations (notification worker)
  // ===========================================================================

  /**
   * Log a new email as queued.
   * Called by the notification worker when an email job is picked up.
   */
  async logQueued(data: {
    tenantId: string;
    toAddress: string;
    subject: string;
    templateName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<EmailDeliveryLogRow> {
    return this.repository.create({
      tenantId: data.tenantId,
      toAddress: data.toAddress,
      subject: data.subject,
      templateName: data.templateName,
      status: "queued",
      metadata: data.metadata,
    });
  }

  /**
   * Update log entry to 'sent' status after successful SMTP handoff.
   */
  async logSent(id: string, messageId: string): Promise<void> {
    await this.repository.markSent(id, messageId);
  }

  /**
   * Update log entry to 'delivered' status (provider confirmation).
   */
  async logDelivered(id: string): Promise<void> {
    await this.repository.markDelivered(id);
  }

  /**
   * Update log entry to 'failed' status.
   */
  async logFailed(id: string, errorMessage: string): Promise<void> {
    await this.repository.markFailed(id, errorMessage);
  }

  /**
   * Record a bounce event from an email provider webhook.
   * Looks up the delivery log entry by message_id (provider correlation).
   */
  async recordBounce(
    messageId: string,
    bounceType: BounceType,
    bounceReason?: string
  ): Promise<ServiceResult<EmailDeliveryLogResponse>> {
    const row = await this.repository.markBounced(
      messageId,
      bounceType,
      bounceReason
    );

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: `No sent/delivered email found with message_id: ${messageId}`,
        },
      };
    }

    return { success: true, data: mapRowToResponse(row) };
  }

  // ===========================================================================
  // Read Operations (API endpoints, tenant-scoped)
  // ===========================================================================

  /**
   * List email delivery log entries with filters and cursor pagination.
   */
  async listDeliveryLog(
    ctx: TenantContext,
    filters: EmailDeliveryFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<EmailDeliveryLogResponse>> {
    const result = await this.repository.list(ctx, filters, pagination);

    return {
      items: result.items.map(mapRowToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single email delivery log entry by ID.
   */
  async getDeliveryLogEntry(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<EmailDeliveryLogResponse>> {
    const row = await this.repository.getById(ctx, id);

    if (!row) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Email delivery log entry not found",
        },
      };
    }

    return { success: true, data: mapRowToResponse(row) };
  }

  /**
   * Get delivery statistics for a time period.
   *
   * Defaults to last 30 days if no date range provided.
   * Returns counts by status and calculated rates.
   */
  async getDeliveryStats(
    ctx: TenantContext,
    query: EmailDeliveryStatsQuery
  ): Promise<ServiceResult<EmailDeliveryStatsResponse>> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dateFrom = query.date_from ?? thirtyDaysAgo.toISOString();
    const dateTo = query.date_to ?? now.toISOString();

    const stats = await this.repository.getStats(
      ctx,
      dateFrom,
      dateTo,
      query.template_name
    );

    const total = parseInt(stats.total, 10);
    const queued = parseInt(stats.queued, 10);
    const sent = parseInt(stats.sent, 10);
    const delivered = parseInt(stats.delivered, 10);
    const bounced = parseInt(stats.bounced, 10);
    const failed = parseInt(stats.failed, 10);

    // Calculate rates based on non-queued emails (emails that were actually attempted)
    const attempted = total - queued;
    const deliveryRate =
      attempted > 0 ? Math.round((delivered / attempted) * 10000) / 100 : 0;
    const bounceRate =
      attempted > 0 ? Math.round((bounced / attempted) * 10000) / 100 : 0;
    const failureRate =
      attempted > 0 ? Math.round((failed / attempted) * 10000) / 100 : 0;

    return {
      success: true,
      data: {
        total,
        queued,
        sent,
        delivered,
        bounced,
        failed,
        delivery_rate: deliveryRate,
        bounce_rate: bounceRate,
        failure_rate: failureRate,
        period: {
          from: dateFrom,
          to: dateTo,
        },
      },
    };
  }
}
