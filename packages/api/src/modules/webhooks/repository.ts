/**
 * Webhooks Module - Repository Layer
 *
 * Database operations for webhook subscriptions and deliveries.
 * All queries respect RLS via tenant context.
 */

import type {
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookSubscriptionResponse,
  WebhookDeliveryResponse,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DeliveryFilters {
  status?: string;
  eventType?: string;
}

export class WebhooksRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Subscription Operations
  // ===========================================================================

  async listSubscriptions(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<WebhookSubscriptionResponse>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.webhook_subscriptions
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ${pagination.cursor ? tx`AND id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY created_at DESC, id
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapSubscriptionRow),
      nextCursor,
      hasMore,
    };
  }

  async getSubscriptionById(
    ctx: TenantContext,
    id: string
  ): Promise<WebhookSubscriptionResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.webhook_subscriptions
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapSubscriptionRow(row) : null;
  }

  async createSubscription(
    ctx: TenantContext,
    data: CreateWebhookSubscription,
    txOverride?: any
  ): Promise<WebhookSubscriptionResponse> {
    const exec = async (tx: any) => {
      return tx`
        INSERT INTO app.webhook_subscriptions (
          tenant_id, name, url, secret, event_types, enabled, description
        ) VALUES (
          ${ctx.tenantId}::uuid,
          ${data.name},
          ${data.url},
          ${data.secret},
          ${JSON.stringify(data.eventTypes)}::jsonb,
          ${data.enabled ?? true},
          ${data.description ?? null}
        )
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapSubscriptionRow(row);
  }

  async updateSubscription(
    ctx: TenantContext,
    id: string,
    data: UpdateWebhookSubscription,
    txOverride?: any
  ): Promise<WebhookSubscriptionResponse | null> {
    const exec = async (tx: any) => {
      return tx`
        UPDATE app.webhook_subscriptions SET
          name = COALESCE(${data.name ?? null}, name),
          url = COALESCE(${data.url ?? null}, url),
          secret = COALESCE(${data.secret ?? null}, secret),
          event_types = COALESCE(
            ${data.eventTypes ? JSON.stringify(data.eventTypes) : null}::jsonb,
            event_types
          ),
          enabled = COALESCE(${data.enabled ?? null}, enabled),
          description = COALESCE(${data.description ?? null}, description),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return row ? this.mapSubscriptionRow(row) : null;
  }

  async deleteSubscription(
    ctx: TenantContext,
    id: string,
    txOverride?: any
  ): Promise<boolean> {
    const exec = async (tx: any) => {
      return tx`
        DELETE FROM app.webhook_subscriptions
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING id
      `;
    };

    const rows = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return rows.length > 0;
  }

  // ===========================================================================
  // Delivery Operations
  // ===========================================================================

  async listDeliveries(
    ctx: TenantContext,
    subscriptionId: string,
    filters: DeliveryFilters,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<WebhookDeliveryResponse>> {
    const limit = pagination.limit ?? 20;

    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.webhook_deliveries
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND subscription_id = ${subscriptionId}::uuid
            ${filters.status ? tx`AND status = ${filters.status}` : tx``}
            ${filters.eventType ? tx`AND event_type = ${filters.eventType}` : tx``}
            ${pagination.cursor ? tx`AND id < ${pagination.cursor}::uuid` : tx``}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapDeliveryRow),
      nextCursor,
      hasMore,
    };
  }

  async getDeliveryById(
    ctx: TenantContext,
    id: string
  ): Promise<WebhookDeliveryResponse | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT *
          FROM app.webhook_deliveries
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return row ? this.mapDeliveryRow(row) : null;
  }

  // ===========================================================================
  // System-level Operations (used by webhook worker, bypass RLS)
  // ===========================================================================

  /**
   * Find all enabled subscriptions matching an event type across all tenants.
   * Runs in system context (bypasses RLS) because the worker processes events
   * from all tenants.
   */
  async findMatchingSubscriptions(
    tenantId: string,
    eventType: string
  ): Promise<Array<{
    id: string;
    tenantId: string;
    url: string;
    secret: string;
    eventTypes: string[];
    metadata: Record<string, unknown>;
  }>> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return tx`
        SELECT id, tenant_id, url, secret, event_types, metadata
        FROM app.webhook_subscriptions
        WHERE tenant_id = ${tenantId}::uuid
          AND enabled = true
      `;
    });

    // Filter by event type pattern matching in application layer
    // for flexibility (supports "*" and "prefix.*" patterns)
    return rows
      .map((row: any) => ({
        id: row.id,
        tenantId: row.tenantId,
        url: row.url,
        secret: row.secret,
        eventTypes: row.eventTypes as string[],
        metadata: row.metadata as Record<string, unknown>,
      }))
      .filter((sub: any) =>
        this.eventTypeMatches(eventType, sub.eventTypes)
      );
  }

  /**
   * Create a delivery record. Runs in system context for the webhook worker.
   */
  async createDelivery(data: {
    tenantId: string;
    subscriptionId: string;
    eventId: string | null;
    eventType: string;
    payload: Record<string, unknown>;
    maxAttempts?: number;
    nextRetryAt?: Date;
  }): Promise<string> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return tx`
        INSERT INTO app.webhook_deliveries (
          tenant_id, subscription_id, event_id, event_type, payload,
          status, max_attempts, next_retry_at
        ) VALUES (
          ${data.tenantId}::uuid,
          ${data.subscriptionId}::uuid,
          ${data.eventId}::uuid,
          ${data.eventType},
          ${JSON.stringify(data.payload)}::jsonb,
          'pending',
          ${data.maxAttempts ?? 5},
          ${data.nextRetryAt ?? new Date()}
        )
        RETURNING id
      `;
    });

    return rows[0].id;
  }

  /**
   * Get pending deliveries ready for retry. Runs in system context.
   */
  async getPendingDeliveries(
    batchSize: number
  ): Promise<Array<{
    id: string;
    tenantId: string;
    subscriptionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    subscriptionUrl: string;
    subscriptionSecret: string;
  }>> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return tx`
        SELECT
          d.id,
          d.tenant_id,
          d.subscription_id,
          d.event_type,
          d.payload,
          d.attempts,
          d.max_attempts,
          s.url as subscription_url,
          s.secret as subscription_secret
        FROM app.webhook_deliveries d
        JOIN app.webhook_subscriptions s ON s.id = d.subscription_id
        WHERE d.status = 'pending'
          AND d.next_retry_at <= now()
          AND d.attempts < d.max_attempts
          AND s.enabled = true
        ORDER BY d.next_retry_at ASC
        LIMIT ${batchSize}
        FOR UPDATE OF d SKIP LOCKED
      `;
    });

    return rows.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      subscriptionId: row.subscriptionId,
      eventType: row.eventType,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      subscriptionUrl: row.subscriptionUrl,
      subscriptionSecret: row.subscriptionSecret,
    }));
  }

  /**
   * Record a delivery attempt result. Runs in system context.
   */
  async recordDeliveryAttempt(
    deliveryId: string,
    result: {
      success: boolean;
      responseCode?: number;
      responseBody?: string;
      errorMessage?: string;
      durationMs?: number;
      nextRetryAt?: Date;
    }
  ): Promise<void> {
    await this.db.withSystemContext(async (tx: any) => {
      const responseBody = result.responseBody
        ? result.responseBody.substring(0, 4096)
        : null;

      await tx`
        UPDATE app.webhook_deliveries SET
          attempts = attempts + 1,
          last_attempt_at = now(),
          response_code = ${result.responseCode ?? null},
          response_body = ${responseBody},
          error_message = ${result.errorMessage ?? null},
          duration_ms = ${result.durationMs ?? null},
          status = CASE
            WHEN ${result.success} THEN 'success'
            WHEN attempts + 1 >= max_attempts THEN 'failed'
            ELSE 'pending'
          END,
          next_retry_at = CASE
            WHEN ${result.success} THEN NULL
            WHEN attempts + 1 >= max_attempts THEN NULL
            ELSE ${result.nextRetryAt ?? null}::timestamptz
          END,
          updated_at = now()
        WHERE id = ${deliveryId}::uuid
      `;
    });
  }

  /**
   * Expire old pending deliveries that have exceeded their max attempts.
   * Runs in system context. Used by the cleanup scheduler.
   */
  async expireStaleDeliveries(olderThanHours: number = 72): Promise<number> {
    const rows = await this.db.withSystemContext(async (tx: any) => {
      return tx`
        UPDATE app.webhook_deliveries
        SET status = 'expired', updated_at = now()
        WHERE status = 'pending'
          AND created_at < now() - (${olderThanHours} || ' hours')::interval
        RETURNING id
      `;
    });

    return rows.length;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Check if an event type matches any pattern in the subscription's event_types array.
   * Supports:
   *   - Exact match: "hr.employee.created"
   *   - Prefix wildcard: "hr.employee.*" matches "hr.employee.created"
   *   - Global wildcard: "*" matches everything
   */
  private eventTypeMatches(eventType: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (pattern === "*") return true;
      if (pattern === eventType) return true;
      if (pattern.endsWith(".*")) {
        const prefix = pattern.slice(0, -2);
        if (eventType.startsWith(prefix + ".")) return true;
      }
    }
    return false;
  }

  private mapSubscriptionRow(row: any): WebhookSubscriptionResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      url: row.url,
      // Never expose the secret in responses
      eventTypes: row.eventTypes as string[],
      enabled: row.enabled,
      description: row.description ?? null,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }

  private mapDeliveryRow(row: any): WebhookDeliveryResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      subscriptionId: row.subscriptionId,
      eventId: row.eventId ?? null,
      eventType: row.eventType,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      lastAttemptAt: row.lastAttemptAt?.toISOString() || row.lastAttemptAt || null,
      nextRetryAt: row.nextRetryAt?.toISOString() || row.nextRetryAt || null,
      responseCode: row.responseCode ?? null,
      responseBody: row.responseBody ?? null,
      errorMessage: row.errorMessage ?? null,
      durationMs: row.durationMs ?? null,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }
}
