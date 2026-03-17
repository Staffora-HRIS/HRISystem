/**
 * Notifications Module - Repository Layer
 *
 * Database operations for notifications, deliveries, and push tokens.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  NotificationFilters,
  PaginationQuery,
  RegisterPushToken,
  WebPushSubscribe,
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

/** Raw DB row shape for notifications (after camelCase transform) */
export interface NotificationRow extends Row {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl: string | null;
  actionText: string | null;
  icon: string | null;
  data: Record<string, unknown>;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw DB row shape for push tokens */
export interface PushTokenRow extends Row {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceName: string | null;
  deviceModel: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Raw DB row shape for Web Push subscriptions */
export interface PushSubscriptionRow extends Row {
  id: string;
  tenantId: string;
  userId: string;
  endpoint: string;
  authKey: string;
  p256dhKey: string;
  deviceType: string;
  userAgent: string | null;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class NotificationsRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Notification Operations
  // ===========================================================================

  /**
   * List notifications for the current user with cursor-based pagination
   */
  async listNotifications(
    ctx: TenantContext,
    userId: string,
    filters: NotificationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<NotificationRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1; // Fetch one extra to determine hasMore

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<NotificationRow[]>`
        SELECT
          id, tenant_id, user_id,
          title, message, type,
          action_url, action_text, icon,
          data,
          read_at, dismissed_at, expires_at,
          created_at, updated_at
        FROM notifications
        WHERE user_id = ${userId}::uuid
          ${filters.type ? tx`AND type = ${filters.type}` : tx``}
          ${filters.unread_only ? tx`AND read_at IS NULL` : tx``}
          ${filters.search ? tx`AND (title ILIKE ${"%" + filters.search + "%"} OR message ILIKE ${"%" + filters.search + "%"})` : tx``}
          AND (expires_at IS NULL OR expires_at > now())
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
   * Get a single notification by ID
   */
  async getNotificationById(
    ctx: TenantContext,
    userId: string,
    id: string
  ): Promise<NotificationRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<NotificationRow[]>`
        SELECT
          id, tenant_id, user_id,
          title, message, type,
          action_url, action_text, icon,
          data,
          read_at, dismissed_at, expires_at,
          created_at, updated_at
        FROM notifications
        WHERE id = ${id}
          AND user_id = ${userId}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(
    ctx: TenantContext,
    userId: string,
    notificationId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<NotificationRow | null> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<NotificationRow[]>`
        UPDATE notifications
        SET read_at = now(), updated_at = now()
        WHERE id = ${notificationId}
          AND user_id = ${userId}
          AND read_at IS NULL
        RETURNING
          id, tenant_id, user_id,
          title, message, type,
          action_url, action_text, icon,
          data,
          read_at, dismissed_at, expires_at,
          created_at, updated_at
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Mark all unread notifications as read for a user
   */
  async markAllAsRead(
    ctx: TenantContext,
    userId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<number> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        UPDATE notifications
        SET read_at = now(), updated_at = now()
        WHERE user_id = ${userId}
          AND read_at IS NULL
      `;
      return rows.count;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Dismiss a notification (soft removal)
   */
  async dismiss(
    ctx: TenantContext,
    userId: string,
    notificationId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<NotificationRow | null> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<NotificationRow[]>`
        UPDATE notifications
        SET dismissed_at = now(), updated_at = now()
        WHERE id = ${notificationId}
          AND user_id = ${userId}
          AND dismissed_at IS NULL
        RETURNING
          id, tenant_id, user_id,
          title, message, type,
          action_url, action_text, icon,
          data,
          read_at, dismissed_at, expires_at,
          created_at, updated_at
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Delete a notification permanently
   */
  async deleteNotification(
    ctx: TenantContext,
    userId: string,
    notificationId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        DELETE FROM notifications
        WHERE id = ${notificationId}
          AND user_id = ${userId}
      `;
      return rows.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(
    ctx: TenantContext,
    userId: string
  ): Promise<number> {
    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM notifications
        WHERE user_id = ${userId}
          AND read_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
      `;
      return parseInt(rows[0]?.count ?? "0", 10);
    });
  }

  // ===========================================================================
  // Push Token Operations
  // ===========================================================================

  /**
   * Register or update a push token for a user
   */
  async registerPushToken(
    ctx: TenantContext,
    userId: string,
    data: RegisterPushToken,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<PushTokenRow> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<PushTokenRow[]>`
        INSERT INTO push_tokens (user_id, token, platform, device_name, device_model, enabled)
        VALUES (
          ${userId},
          ${data.token},
          ${data.platform},
          ${data.device_name ?? null},
          ${data.device_model ?? null},
          true
        )
        ON CONFLICT (user_id, token)
        DO UPDATE SET
          platform = EXCLUDED.platform,
          device_name = EXCLUDED.device_name,
          device_model = EXCLUDED.device_model,
          enabled = true,
          updated_at = now()
        RETURNING
          id, user_id, token, platform,
          device_name, device_model,
          enabled, expires_at,
          created_at, updated_at
      `;
      return rows[0];
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * List push tokens for a user
   */
  async listPushTokens(
    ctx: TenantContext,
    userId: string
  ): Promise<PushTokenRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<PushTokenRow[]>`
        SELECT
          id, user_id, token, platform,
          device_name, device_model,
          enabled, expires_at,
          created_at, updated_at
        FROM push_tokens
        WHERE user_id = ${userId}
          AND enabled = true
        ORDER BY created_at DESC
      `;
    });
  }

  /**
   * Remove a push token
   */
  async removePushToken(
    ctx: TenantContext,
    userId: string,
    tokenId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        DELETE FROM push_tokens
        WHERE id = ${tokenId}
          AND user_id = ${userId}
      `;
      return rows.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  // ===========================================================================
  // Web Push Subscription Operations
  // ===========================================================================

  /**
   * Create or replace a Web Push subscription for a user.
   * Uses ON CONFLICT on (tenant_id, endpoint) to upsert.
   */
  async createPushSubscription(
    ctx: TenantContext,
    userId: string,
    data: WebPushSubscribe,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<PushSubscriptionRow> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<PushSubscriptionRow[]>`
        INSERT INTO push_subscriptions (
          tenant_id, user_id, endpoint, auth_key, p256dh_key, device_type, user_agent
        )
        VALUES (
          ${ctx.tenantId}::uuid,
          ${userId}::uuid,
          ${data.endpoint},
          ${data.auth_key},
          ${data.p256dh_key},
          ${data.device_type ?? "web"},
          ${data.user_agent ?? null}
        )
        ON CONFLICT (tenant_id, endpoint)
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          auth_key = EXCLUDED.auth_key,
          p256dh_key = EXCLUDED.p256dh_key,
          device_type = EXCLUDED.device_type,
          user_agent = EXCLUDED.user_agent,
          created_at = now()
        RETURNING
          id, tenant_id, user_id, endpoint,
          auth_key, p256dh_key, device_type,
          user_agent, created_at
      `;
      return rows[0];
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Remove a Web Push subscription by endpoint.
   * Users can only delete their own subscriptions (enforced by WHERE clause + RLS).
   */
  async deletePushSubscription(
    ctx: TenantContext,
    userId: string,
    endpoint: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        DELETE FROM push_subscriptions
        WHERE endpoint = ${endpoint}
          AND user_id = ${userId}::uuid
      `;
      return rows.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Remove a Web Push subscription by ID.
   */
  async deletePushSubscriptionById(
    ctx: TenantContext,
    userId: string,
    subscriptionId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql`
        DELETE FROM push_subscriptions
        WHERE id = ${subscriptionId}::uuid
          AND user_id = ${userId}::uuid
      `;
      return rows.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * List Web Push subscriptions for a user
   */
  async listPushSubscriptions(
    ctx: TenantContext,
    userId: string
  ): Promise<PushSubscriptionRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<PushSubscriptionRow[]>`
        SELECT
          id, tenant_id, user_id, endpoint,
          auth_key, p256dh_key, device_type,
          user_agent, created_at
        FROM push_subscriptions
        WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC
      `;
    });
  }

  /**
   * Get all Web Push subscriptions for a user across all tenants.
   * Used by the notification worker to send push notifications.
   * Requires system context to bypass RLS.
   */
  async getPushSubscriptionsByUserId(
    userId: string
  ): Promise<PushSubscriptionRow[]> {
    return this.db.withSystemContext(async (tx) => {
      return tx<PushSubscriptionRow[]>`
        SELECT
          id, tenant_id, user_id, endpoint,
          auth_key, p256dh_key, device_type,
          user_agent, created_at
        FROM push_subscriptions
        WHERE user_id = ${userId}::uuid
      `;
    });
  }

  /**
   * Remove a Web Push subscription by endpoint (system context).
   * Used by the notification worker to clean up invalid subscriptions.
   */
  async deletePushSubscriptionByEndpoint(
    endpoint: string
  ): Promise<boolean> {
    return this.db.withSystemContext(async (tx) => {
      const rows = await tx`
        DELETE FROM push_subscriptions
        WHERE endpoint = ${endpoint}
      `;
      return rows.count > 0;
    });
  }
}
