/**
 * Background Checks Module - TypeBox Schemas
 *
 * Defines validation schemas for background check provider integration API endpoints.
 * Supports DBS, credit, employment history, education, and reference checks via
 * external screening providers. TODO-194.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Background check type matching database enum.
 *
 * - dbs: Disclosure and Barring Service (UK)
 * - credit: Credit check
 * - employment_history: Employment history verification
 * - education: Education / qualifications verification
 * - references: Reference checks
 */
export const BackgroundCheckTypeSchema = t.Union([
  t.Literal("dbs"),
  t.Literal("credit"),
  t.Literal("employment_history"),
  t.Literal("education"),
  t.Literal("references"),
]);

export type BackgroundCheckType = Static<typeof BackgroundCheckTypeSchema>;

/**
 * Background check request status matching database enum.
 *
 * Lifecycle:
 *   pending     -> in_progress  (sent to provider)
 *   pending     -> failed       (failed to send)
 *   in_progress -> completed    (provider returned result)
 *   in_progress -> failed       (provider reported failure / timeout)
 */
export const BackgroundCheckStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("failed"),
]);

export type BackgroundCheckStatus = Static<typeof BackgroundCheckStatusSchema>;

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
// Param Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Request a new background check from an external provider.
 */
export const RequestBackgroundCheckSchema = t.Object({
  employee_id: UuidSchema,
  check_type: BackgroundCheckTypeSchema,
  provider: t.String({
    minLength: 1,
    maxLength: 200,
    description: "Name of the external screening provider",
  }),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type RequestBackgroundCheck = Static<typeof RequestBackgroundCheckSchema>;

/**
 * Webhook callback payload from the external provider.
 * Uses a flexible schema since different providers return different payloads.
 * The provider_reference is used to locate the matching request.
 */
export const WebhookCallbackSchema = t.Object({
  provider_reference: t.String({
    minLength: 1,
    maxLength: 500,
    description: "The provider-assigned reference ID for this check",
  }),
  status: t.Union([t.Literal("completed"), t.Literal("failed")], {
    description: "Final status of the check from the provider",
  }),
  result: t.Optional(
    t.Record(t.String(), t.Unknown(), {
      description: "Provider-specific result payload",
    })
  ),
});

export type WebhookCallback = Static<typeof WebhookCallbackSchema>;

// =============================================================================
// Filter / Query Schemas
// =============================================================================

/**
 * Background check list filters.
 */
export const BackgroundCheckFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(BackgroundCheckStatusSchema),
  check_type: t.Optional(BackgroundCheckTypeSchema),
  provider: t.Optional(t.String({ minLength: 1 })),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type BackgroundCheckFilters = Static<typeof BackgroundCheckFiltersSchema>;

// =============================================================================
// Webhook Params Schema
// =============================================================================

/**
 * Webhook route includes the provider name as a path parameter.
 */
export const WebhookParamsSchema = t.Object({
  provider: t.String({
    minLength: 1,
    maxLength: 200,
    description: "Provider name to route the webhook callback to",
  }),
});

export type WebhookParams = Static<typeof WebhookParamsSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Full background check request response.
 */
export const BackgroundCheckResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  checkType: BackgroundCheckTypeSchema,
  provider: t.String(),
  providerReference: t.Union([t.String(), t.Null()]),
  status: BackgroundCheckStatusSchema,
  result: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  requestedAt: t.String(),
  completedAt: t.Union([t.String(), t.Null()]),
  requestedBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type BackgroundCheckResponse = Static<typeof BackgroundCheckResponseSchema>;

/**
 * List item (includes joined employee name for display).
 */
export const BackgroundCheckListItemSchema = t.Object({
  id: UuidSchema,
  employeeId: UuidSchema,
  employeeName: t.Union([t.String(), t.Null()]),
  checkType: BackgroundCheckTypeSchema,
  provider: t.String(),
  providerReference: t.Union([t.String(), t.Null()]),
  status: BackgroundCheckStatusSchema,
  requestedAt: t.String(),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export type BackgroundCheckListItem = Static<typeof BackgroundCheckListItemSchema>;
