/**
 * Notifications Module
 *
 * Provides the API layer for in-app notifications, push tokens,
 * and notification delivery tracking.
 *
 * Usage:
 * ```typescript
 * import { notificationsRoutes } from './modules/notifications';
 *
 * const app = new Elysia()
 *   .use(notificationsRoutes);
 * ```
 */

// Export routes
export { notificationsRoutes, type NotificationsRoutes } from "./routes";

// Export service
export { NotificationsService } from "./service";

// Export repository
export {
  NotificationsRepository,
  type TenantContext,
  type PaginatedResult,
  type NotificationRow,
  type PushTokenRow,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  PaginationQuerySchema,
  NotificationTypeSchema,
  DeliveryChannelSchema,
  PushPlatformSchema,
  NotificationResponseSchema,
  NotificationFiltersSchema,
  MarkReadSchema,
  DismissNotificationSchema,
  UnreadCountResponseSchema,
  MarkAllReadResponseSchema,
  RegisterPushTokenSchema,
  PushTokenResponseSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type NotificationType,
  type DeliveryChannel,
  type PushPlatform,
  type NotificationResponse,
  type NotificationFilters,
  type MarkRead,
  type DismissNotification,
  type UnreadCountResponse,
  type MarkAllReadResponse,
  type RegisterPushToken,
  type PushTokenResponse,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
