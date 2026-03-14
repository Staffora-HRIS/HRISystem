/**
 * Notifications Module - TypeBox Schemas
 *
 * Defines validation schemas for all Notification API endpoints.
 * Tables: notifications, notification_deliveries, push_tokens
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const NotificationTypeSchema = t.String({ minLength: 1, maxLength: 100 });
export type NotificationType = Static<typeof NotificationTypeSchema>;

export const DeliveryChannelSchema = t.Union([
  t.Literal("email"),
  t.Literal("in_app"),
  t.Literal("push"),
]);
export type DeliveryChannel = Static<typeof DeliveryChannelSchema>;

export const PushPlatformSchema = t.Union([
  t.Literal("ios"),
  t.Literal("android"),
  t.Literal("web"),
]);
export type PushPlatform = Static<typeof PushPlatformSchema>;

// =============================================================================
// Notification Schemas
// =============================================================================

/**
 * Notification response
 */
export const NotificationResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  user_id: UuidSchema,
  title: t.String(),
  message: t.String(),
  type: t.String(),
  action_url: t.Union([t.String(), t.Null()]),
  action_text: t.Union([t.String(), t.Null()]),
  icon: t.Union([t.String(), t.Null()]),
  data: t.Record(t.String(), t.Unknown()),
  read_at: t.Union([t.String(), t.Null()]),
  dismissed_at: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type NotificationResponse = Static<typeof NotificationResponseSchema>;

/**
 * Notification list filters
 */
export const NotificationFiltersSchema = t.Object({
  type: t.Optional(t.String({ minLength: 1 })),
  unread_only: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type NotificationFilters = Static<typeof NotificationFiltersSchema>;

/**
 * Mark notification as read request (single)
 */
export const MarkReadSchema = t.Object({
  notification_id: UuidSchema,
});

export type MarkRead = Static<typeof MarkReadSchema>;

/**
 * Dismiss notification request
 */
export const DismissNotificationSchema = t.Object({
  notification_id: UuidSchema,
});

export type DismissNotification = Static<typeof DismissNotificationSchema>;

/**
 * Unread count response
 */
export const UnreadCountResponseSchema = t.Object({
  count: t.Number(),
});

export type UnreadCountResponse = Static<typeof UnreadCountResponseSchema>;

/**
 * Mark all read response
 */
export const MarkAllReadResponseSchema = t.Object({
  count: t.Number(),
});

export type MarkAllReadResponse = Static<typeof MarkAllReadResponseSchema>;

// =============================================================================
// Push Token Schemas
// =============================================================================

/**
 * Register push token request
 */
export const RegisterPushTokenSchema = t.Object({
  token: t.String({ minLength: 1 }),
  platform: PushPlatformSchema,
  device_name: t.Optional(t.String({ maxLength: 255 })),
  device_model: t.Optional(t.String({ maxLength: 255 })),
});

export type RegisterPushToken = Static<typeof RegisterPushTokenSchema>;

/**
 * Push token response
 */
export const PushTokenResponseSchema = t.Object({
  id: UuidSchema,
  user_id: UuidSchema,
  token: t.String(),
  platform: PushPlatformSchema,
  device_name: t.Union([t.String(), t.Null()]),
  device_model: t.Union([t.String(), t.Null()]),
  enabled: t.Boolean(),
  expires_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PushTokenResponse = Static<typeof PushTokenResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
