/**
 * Webhooks Module - TypeBox Schemas
 *
 * Validation schemas for outbound webhook subscription and delivery endpoints.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Webhook Subscription Schemas
// =============================================================================

export const WebhookSubscriptionStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("inactive"),
]);

export const CreateWebhookSubscriptionSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  url: t.String({ minLength: 1, maxLength: 2048 }),
  secret: t.String({ minLength: 32, maxLength: 512 }),
  eventTypes: t.Array(t.String({ minLength: 1, maxLength: 255 }), {
    minItems: 1,
    maxItems: 100,
  }),
  enabled: t.Optional(t.Boolean()),
  description: t.Optional(t.String({ maxLength: 1000 })),
});

export const UpdateWebhookSubscriptionSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    url: t.String({ minLength: 1, maxLength: 2048 }),
    secret: t.String({ minLength: 32, maxLength: 512 }),
    eventTypes: t.Array(t.String({ minLength: 1, maxLength: 255 }), {
      minItems: 1,
      maxItems: 100,
    }),
    enabled: t.Boolean(),
    description: t.String({ maxLength: 1000 }),
  })
);

export const WebhookSubscriptionResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  url: t.String(),
  eventTypes: t.Array(t.String()),
  enabled: t.Boolean(),
  description: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

// =============================================================================
// Webhook Delivery Schemas
// =============================================================================

export const WebhookDeliveryStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("success"),
  t.Literal("failed"),
  t.Literal("expired"),
]);

export const WebhookDeliveryResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  subscriptionId: UuidSchema,
  eventId: t.Union([UuidSchema, t.Null()]),
  eventType: t.String(),
  payload: t.Unknown(),
  status: WebhookDeliveryStatusSchema,
  attempts: t.Number(),
  maxAttempts: t.Number(),
  lastAttemptAt: t.Union([t.String(), t.Null()]),
  nextRetryAt: t.Union([t.String(), t.Null()]),
  responseCode: t.Union([t.Number(), t.Null()]),
  responseBody: t.Union([t.String(), t.Null()]),
  errorMessage: t.Union([t.String(), t.Null()]),
  durationMs: t.Union([t.Number(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

// =============================================================================
// Pagination & Common Schemas
// =============================================================================

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const DeliveryListQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  status: t.Optional(WebhookDeliveryStatusSchema),
  eventType: t.Optional(t.String()),
});

export const SubscriptionDeliveryParamsSchema = t.Object({
  id: UuidSchema,
});

// =============================================================================
// List Response Schemas
// =============================================================================

export const WebhookSubscriptionListResponseSchema = t.Object({
  items: t.Array(WebhookSubscriptionResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const WebhookDeliveryListResponseSchema = t.Object({
  items: t.Array(WebhookDeliveryResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Export Types
// =============================================================================

// =============================================================================
// Query Schemas (used by routes)
// =============================================================================

/**
 * GET /webhooks/subscriptions - Query parameters
 */
export const ListSubscriptionsQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

/**
 * GET /webhooks/deliveries - Query parameters
 */
export const ListDeliveriesQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
  subscriptionId: t.Optional(UuidSchema),
  status: t.Optional(WebhookDeliveryStatusSchema),
  eventType: t.Optional(t.String()),
});

// =============================================================================
// Export Types
// =============================================================================

export type CreateWebhookSubscription = typeof CreateWebhookSubscriptionSchema.static;
export type UpdateWebhookSubscription = typeof UpdateWebhookSubscriptionSchema.static;
export type WebhookSubscriptionResponse = typeof WebhookSubscriptionResponseSchema.static;
export type WebhookDeliveryStatus = typeof WebhookDeliveryStatusSchema.static;
export type WebhookDeliveryResponse = typeof WebhookDeliveryResponseSchema.static;
export type ListSubscriptionsQuery = typeof ListSubscriptionsQuerySchema.static;
export type ListDeliveriesQuery = typeof ListDeliveriesQuerySchema.static;
