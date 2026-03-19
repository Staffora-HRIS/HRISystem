/**
 * Webhooks Module
 *
 * Provides the API layer for configurable outbound webhooks:
 * - CRUD for webhook subscriptions (URL, event types, HMAC secret)
 * - Webhook delivery log with status tracking
 * - Test event endpoint
 * - HMAC-SHA256 signed payloads
 * - Exponential backoff retry (up to 5 attempts)
 *
 * Usage:
 * ```typescript
 * import { webhookRoutes } from "./modules/webhooks";
 *
 * const app = new Elysia()
 *   .use(webhookRoutes);
 * ```
 */

// Export routes
export { webhookRoutes, type WebhookRoutes } from "./routes";

// Export service
export { WebhooksService, computeWebhookSignature, calculateNextRetryAt } from "./service";

// Export repository
export {
  WebhooksRepository,
  type TenantContext,
  type PaginationOptions,
  type PaginatedResult,
  type DeliveryFilters,
} from "./repository";

// Export schemas
export {
  UuidSchema,
  IdParamsSchema,
  CreateWebhookSubscriptionSchema,
  UpdateWebhookSubscriptionSchema,
  WebhookDeliveryStatusSchema,
  ListSubscriptionsQuerySchema,
  ListDeliveriesQuerySchema,
  type CreateWebhookSubscription,
  type UpdateWebhookSubscription,
  type WebhookDeliveryStatus,
  type WebhookSubscriptionResponse,
  type WebhookDeliveryResponse,
  type ListSubscriptionsQuery,
  type ListDeliveriesQuery,
} from "./schemas";
