/**
 * Email Tracking Module - TypeBox Schemas
 *
 * Defines validation schemas for all Email Delivery Monitoring API endpoints.
 * Table: email_delivery_log
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const EmailDeliveryStatusSchema = t.Union([
  t.Literal("queued"),
  t.Literal("sent"),
  t.Literal("delivered"),
  t.Literal("bounced"),
  t.Literal("failed"),
]);

export type EmailDeliveryStatus = Static<typeof EmailDeliveryStatusSchema>;

export const BounceTypeSchema = t.Union([
  t.Literal("hard"),
  t.Literal("soft"),
  t.Literal("complaint"),
]);

export type BounceType = Static<typeof BounceTypeSchema>;

// =============================================================================
// Email Delivery Log Response
// =============================================================================

export const EmailDeliveryLogResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  to_address: t.String(),
  subject: t.String(),
  template_name: t.Union([t.String(), t.Null()]),
  status: EmailDeliveryStatusSchema,
  message_id: t.Union([t.String(), t.Null()]),
  sent_at: t.Union([t.String(), t.Null()]),
  delivered_at: t.Union([t.String(), t.Null()]),
  bounced_at: t.Union([t.String(), t.Null()]),
  bounce_type: t.Union([t.String(), t.Null()]),
  bounce_reason: t.Union([t.String(), t.Null()]),
  error_message: t.Union([t.String(), t.Null()]),
  retry_count: t.Number(),
  metadata: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EmailDeliveryLogResponse = Static<
  typeof EmailDeliveryLogResponseSchema
>;

// =============================================================================
// List Filters
// =============================================================================

export const EmailDeliveryFiltersSchema = t.Object({
  status: t.Optional(EmailDeliveryStatusSchema),
  to_address: t.Optional(t.String({ minLength: 1 })),
  template_name: t.Optional(t.String({ minLength: 1 })),
  date_from: t.Optional(
    t.String({ format: "date-time", description: "ISO 8601 date-time" })
  ),
  date_to: t.Optional(
    t.String({ format: "date-time", description: "ISO 8601 date-time" })
  ),
  search: t.Optional(
    t.String({
      minLength: 1,
      description: "Search in to_address, subject, or template_name",
    })
  ),
});

export type EmailDeliveryFilters = Static<typeof EmailDeliveryFiltersSchema>;

// =============================================================================
// Delivery Stats Response
// =============================================================================

export const EmailDeliveryStatsResponseSchema = t.Object({
  total: t.Number(),
  queued: t.Number(),
  sent: t.Number(),
  delivered: t.Number(),
  bounced: t.Number(),
  failed: t.Number(),
  delivery_rate: t.Number({ description: "Percentage of delivered out of total non-queued" }),
  bounce_rate: t.Number({ description: "Percentage of bounced out of total non-queued" }),
  failure_rate: t.Number({ description: "Percentage of failed out of total non-queued" }),
  period: t.Object({
    from: t.String(),
    to: t.String(),
  }),
});

export type EmailDeliveryStatsResponse = Static<
  typeof EmailDeliveryStatsResponseSchema
>;

// =============================================================================
// Stats Query
// =============================================================================

export const EmailDeliveryStatsQuerySchema = t.Object({
  date_from: t.Optional(
    t.String({ format: "date-time", description: "ISO 8601 start of period" })
  ),
  date_to: t.Optional(
    t.String({ format: "date-time", description: "ISO 8601 end of period" })
  ),
  template_name: t.Optional(t.String({ minLength: 1 })),
});

export type EmailDeliveryStatsQuery = Static<
  typeof EmailDeliveryStatsQuerySchema
>;

// =============================================================================
// Bounce Update (for webhook processing)
// =============================================================================

export const RecordBounceSchema = t.Object({
  message_id: t.String({ minLength: 1 }),
  bounce_type: BounceTypeSchema,
  bounce_reason: t.Optional(t.String()),
});

export type RecordBounce = Static<typeof RecordBounceSchema>;

// =============================================================================
// Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(
    t.String({ minLength: 1, maxLength: 100 })
  ),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;
