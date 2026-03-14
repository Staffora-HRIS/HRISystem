/**
 * Notifications Module - Service Layer
 *
 * Business logic for notification management.
 * All notifications are user-scoped (each user sees only their own).
 * Emits domain events via the outbox pattern for mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  NotificationsRepository,
  type NotificationRow,
  type PushTokenRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  NotificationFilters,
  PaginationQuery,
  NotificationResponse,
  PushTokenResponse,
  RegisterPushToken,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapNotificationToResponse(row: NotificationRow): NotificationResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    user_id: row.userId,
    title: row.title,
    message: row.message,
    type: row.type,
    action_url: row.actionUrl,
    action_text: row.actionText,
    icon: row.icon,
    data: row.data,
    read_at: row.readAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapPushTokenToResponse(row: PushTokenRow): PushTokenResponse {
  return {
    id: row.id,
    user_id: row.userId,
    token: row.token,
    platform: row.platform as "ios" | "android" | "web",
    device_name: row.deviceName,
    device_model: row.deviceModel,
    enabled: row.enabled,
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class NotificationsService {
  constructor(
    private repository: NotificationsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Notification Operations
  // ===========================================================================

  /**
   * List notifications for the current user
   */
  async listNotifications(
    ctx: TenantContext,
    userId: string,
    filters: NotificationFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<NotificationResponse>> {
    const result = await this.repository.listNotifications(
      ctx,
      userId,
      filters,
      pagination
    );

    return {
      items: result.items.map(mapNotificationToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single notification by ID
   */
  async getNotification(
    ctx: TenantContext,
    userId: string,
    id: string
  ): Promise<ServiceResult<NotificationResponse>> {
    const notification = await this.repository.getNotificationById(ctx, userId, id);

    if (!notification) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Notification not found",
        },
      };
    }

    return { success: true, data: mapNotificationToResponse(notification) };
  }

  /**
   * Mark a single notification as read, with outbox event
   */
  async markAsRead(
    ctx: TenantContext,
    userId: string,
    notificationId: string
  ): Promise<ServiceResult<NotificationResponse>> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const notification = await this.repository.markAsRead(
        ctx,
        userId,
        notificationId,
        tx
      );

      if (!notification) {
        return null;
      }

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'notification',
          ${notificationId},
          'notification.read',
          ${JSON.stringify({ notificationId, userId, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return notification;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Notification not found or already read",
        },
      };
    }

    return { success: true, data: mapNotificationToResponse(result) };
  }

  /**
   * Mark all unread notifications as read for the current user
   */
  async markAllAsRead(
    ctx: TenantContext,
    userId: string
  ): Promise<ServiceResult<{ count: number }>> {
    const count = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.markAllAsRead(ctx, userId, tx);

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'notification',
          ${userId},
          'notification.all_read',
          ${JSON.stringify({ userId, count: updated, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return updated;
    });

    return { success: true, data: { count } };
  }

  /**
   * Dismiss a notification (soft removal from user's view)
   */
  async dismissNotification(
    ctx: TenantContext,
    userId: string,
    notificationId: string
  ): Promise<ServiceResult<NotificationResponse>> {
    const result = await this.db.withTransaction(ctx, async (tx) => {
      const notification = await this.repository.dismiss(
        ctx,
        userId,
        notificationId,
        tx
      );

      if (!notification) {
        return null;
      }

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'notification',
          ${notificationId},
          'notification.dismissed',
          ${JSON.stringify({ notificationId, userId, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return notification;
    });

    if (!result) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Notification not found or already dismissed",
        },
      };
    }

    return { success: true, data: mapNotificationToResponse(result) };
  }

  /**
   * Delete a notification permanently
   */
  async deleteNotification(
    ctx: TenantContext,
    userId: string,
    notificationId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const deleted = await this.db.withTransaction(ctx, async (tx) => {
      const success = await this.repository.deleteNotification(
        ctx,
        userId,
        notificationId,
        tx
      );

      if (success) {
        // Write outbox event in same transaction
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'notification',
            ${notificationId},
            'notification.deleted',
            ${JSON.stringify({ notificationId, userId, actor: ctx.userId })}::jsonb,
            now()
          )
        `;
      }

      return success;
    });

    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Notification not found",
        },
      };
    }

    return { success: true, data: { deleted: true } };
  }

  /**
   * Get unread notification count for the current user
   */
  async getUnreadCount(
    ctx: TenantContext,
    userId: string
  ): Promise<ServiceResult<{ count: number }>> {
    const count = await this.repository.getUnreadCount(ctx, userId);
    return { success: true, data: { count } };
  }

  // ===========================================================================
  // Push Token Operations
  // ===========================================================================

  /**
   * Register a push token for the current user
   */
  async registerPushToken(
    ctx: TenantContext,
    userId: string,
    data: RegisterPushToken
  ): Promise<ServiceResult<PushTokenResponse>> {
    const token = await this.db.withTransaction(ctx, async (tx) => {
      const result = await this.repository.registerPushToken(ctx, userId, data, tx);

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'push_token',
          ${result.id},
          'push_token.registered',
          ${JSON.stringify({ tokenId: result.id, userId, platform: data.platform, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return result;
    });

    return { success: true, data: mapPushTokenToResponse(token) };
  }

  /**
   * List push tokens for the current user
   */
  async listPushTokens(
    ctx: TenantContext,
    userId: string
  ): Promise<PushTokenResponse[]> {
    const tokens = await this.repository.listPushTokens(ctx, userId);
    return tokens.map(mapPushTokenToResponse);
  }

  /**
   * Remove a push token
   */
  async removePushToken(
    ctx: TenantContext,
    userId: string,
    tokenId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const deleted = await this.db.withTransaction(ctx, async (tx) => {
      const success = await this.repository.removePushToken(ctx, userId, tokenId, tx);

      if (success) {
        // Write outbox event in same transaction
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'push_token',
            ${tokenId},
            'push_token.removed',
            ${JSON.stringify({ tokenId, userId, actor: ctx.userId })}::jsonb,
            now()
          )
        `;
      }

      return success;
    });

    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Push token not found",
        },
      };
    }

    return { success: true, data: { deleted: true } };
  }
}
