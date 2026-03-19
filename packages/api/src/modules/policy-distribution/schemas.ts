/**
 * Policy Distribution Module - TypeBox Schemas
 *
 * Defines validation schemas for all Policy Distribution API endpoints.
 * Tables: policy_distributions, policy_acknowledgements
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
// Distribution Schemas
// =============================================================================

/**
 * Distribution response (returned from API)
 */
export const DistributionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  document_id: UuidSchema,
  title: t.String(),
  distributed_at: t.String(),
  distributed_by: UuidSchema,
  target_departments: t.Array(t.String()),
  target_all: t.Boolean(),
  deadline_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type DistributionResponse = Static<typeof DistributionResponseSchema>;

/**
 * Create distribution request body
 */
export const CreateDistributionSchema = t.Object({
  document_id: UuidSchema,
  title: t.String({ minLength: 1, maxLength: 500 }),
  target_departments: t.Optional(t.Array(t.String())),
  target_all: t.Optional(t.Boolean({ default: false })),
  deadline_at: t.Optional(t.String({ format: "date-time" })),
});

export type CreateDistribution = Static<typeof CreateDistributionSchema>;

// =============================================================================
// Distribution Status Schemas
// =============================================================================

/**
 * Individual acknowledgement record within distribution status
 */
export const AcknowledgementRecordSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Union([t.String(), t.Null()]),
  acknowledged_at: t.String(),
  ip_address: t.Union([t.String(), t.Null()]),
});

export type AcknowledgementRecord = Static<typeof AcknowledgementRecordSchema>;

/**
 * Distribution status response (distribution details + acknowledgements)
 */
export const DistributionStatusResponseSchema = t.Object({
  distribution: DistributionResponseSchema,
  acknowledgements: t.Object({
    items: t.Array(AcknowledgementRecordSchema),
    total: t.Number(),
    nextCursor: t.Union([t.String(), t.Null()]),
    hasMore: t.Boolean(),
  }),
});

export type DistributionStatusResponse = Static<typeof DistributionStatusResponseSchema>;

// =============================================================================
// Acknowledgement Schemas
// =============================================================================

/**
 * Acknowledge distribution request (body; distribution ID from URL params)
 */
export const AcknowledgeDistributionSchema = t.Object({
  distribution_id: UuidSchema,
});

export type AcknowledgeDistribution = Static<typeof AcknowledgeDistributionSchema>;

/**
 * Acknowledgement response
 */
export const AcknowledgementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  distribution_id: UuidSchema,
  employee_id: UuidSchema,
  acknowledged_at: t.String(),
  ip_address: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type AcknowledgementResponse = Static<typeof AcknowledgementResponseSchema>;

// =============================================================================
// Pending Policies (Portal / Employee Self-Service)
// =============================================================================

/**
 * A single pending policy acknowledgement for the current employee
 */
export const PendingPolicySchema = t.Object({
  distribution_id: UuidSchema,
  document_id: UuidSchema,
  title: t.String(),
  distributed_at: t.String(),
  deadline_at: t.Union([t.String(), t.Null()]),
  is_overdue: t.Boolean(),
});

export type PendingPolicy = Static<typeof PendingPolicySchema>;

/**
 * Response for the pending policies endpoint
 */
export const PendingPoliciesResponseSchema = t.Object({
  items: t.Array(PendingPolicySchema),
  count: t.Number(),
});

export type PendingPoliciesResponse = Static<typeof PendingPoliciesResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;
