/**
 * Calendar Sync Module - TypeBox Schemas
 *
 * Defines validation schemas for the Calendar Sync API endpoints.
 * Tables: calendar_connections
 *
 * Endpoints:
 * - GET  /calendar/connections           — List user's calendar connections
 * - POST /calendar/ical/enable           — Enable iCal feed (generates unique token)
 * - POST /calendar/ical/regenerate       — Regenerate iCal feed token
 * - DELETE /calendar/ical                — Disable iCal feed
 * - GET  /calendar/ical/:token           — Public iCal feed (no auth required)
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

// =============================================================================
// Enums
// =============================================================================

export const CalendarProviderSchema = t.Union([
  t.Literal("google"),
  t.Literal("outlook"),
  t.Literal("ical"),
]);
export type CalendarProvider = Static<typeof CalendarProviderSchema>;

// =============================================================================
// Connection Response
// =============================================================================

/**
 * Calendar connection response (never exposes tokens)
 */
export const CalendarConnectionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  user_id: UuidSchema,
  provider: CalendarProviderSchema,
  calendar_id: t.Union([t.String(), t.Null()]),
  sync_enabled: t.Boolean(),
  last_synced_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type CalendarConnectionResponse = Static<
  typeof CalendarConnectionResponseSchema
>;

// =============================================================================
// iCal Enable Response (includes the feed URL)
// =============================================================================

/**
 * Response when enabling the iCal feed — includes the generated feed URL.
 */
export const IcalEnableResponseSchema = t.Object({
  id: UuidSchema,
  provider: t.Literal("ical"),
  sync_enabled: t.Boolean(),
  feed_url: t.String({ minLength: 1 }),
  created_at: t.String(),
  updated_at: t.String(),
});

export type IcalEnableResponse = Static<typeof IcalEnableResponseSchema>;

// =============================================================================
// iCal Feed Token Params
// =============================================================================

/**
 * Path parameter for the public iCal feed endpoint.
 * The token is a 64-character hex string (not a UUID).
 */
export const IcalTokenParamsSchema = t.Object({
  token: t.String({ minLength: 32, maxLength: 128 }),
});

export type IcalTokenParams = Static<typeof IcalTokenParamsSchema>;

// =============================================================================
// API Route Parameter Schemas
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
