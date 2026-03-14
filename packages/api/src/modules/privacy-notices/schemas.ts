/**
 * Privacy Notices Module - TypeBox Schemas
 *
 * Defines validation schemas for privacy notice management endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR requires employers to provide clear privacy notices
 * to employees explaining how their personal data is processed.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Privacy Notice Schemas
// =============================================================================

/**
 * Create privacy notice request
 */
export const CreatePrivacyNoticeSchema = t.Object({
  title: t.String({
    minLength: 1,
    maxLength: 255,
    description: "Title of the privacy notice",
  }),
  content: t.String({
    minLength: 1,
    description: "Full text content of the privacy notice",
  }),
  effective_from: t.String({
    format: "date",
    description: "Date from which this notice is effective (ISO 8601 date)",
  }),
  effective_to: t.Optional(t.Union([
    t.String({ format: "date" }),
    t.Null(),
  ])),
});

export type CreatePrivacyNotice = Static<typeof CreatePrivacyNoticeSchema>;

/**
 * Update privacy notice request
 */
export const UpdatePrivacyNoticeSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    content: t.String({ minLength: 1 }),
    effective_from: t.String({ format: "date" }),
    effective_to: t.Union([t.String({ format: "date" }), t.Null()]),
    is_current: t.Boolean(),
  })
);

export type UpdatePrivacyNotice = Static<typeof UpdatePrivacyNoticeSchema>;

/**
 * Privacy notice response
 */
export const PrivacyNoticeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  title: t.String(),
  version: t.Number(),
  content: t.String(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  is_current: t.Boolean(),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PrivacyNoticeResponse = Static<typeof PrivacyNoticeResponseSchema>;

/**
 * Privacy notice filters
 */
export const PrivacyNoticeFiltersSchema = t.Object({
  is_current: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type PrivacyNoticeFilters = Static<typeof PrivacyNoticeFiltersSchema>;

// =============================================================================
// Acknowledgement Schemas
// =============================================================================

/**
 * Acknowledge privacy notice request
 */
export const AcknowledgePrivacyNoticeSchema = t.Object({
  employee_id: UuidSchema,
});

export type AcknowledgePrivacyNotice = Static<typeof AcknowledgePrivacyNoticeSchema>;

/**
 * Privacy notice acknowledgement response
 */
export const AcknowledgementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  privacy_notice_id: UuidSchema,
  employee_id: UuidSchema,
  acknowledged_at: t.String(),
  ip_address: t.Union([t.String(), t.Null()]),
  user_agent: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type AcknowledgementResponse = Static<typeof AcknowledgementResponseSchema>;

// =============================================================================
// Outstanding Acknowledgement Schemas
// =============================================================================

/**
 * Outstanding acknowledgement item - employee who has not acknowledged
 */
export const OutstandingAcknowledgementSchema = t.Object({
  employee_id: UuidSchema,
  employee_number: t.String(),
  first_name: t.String(),
  last_name: t.String(),
  email: t.Union([t.String(), t.Null()]),
  privacy_notice_id: UuidSchema,
  privacy_notice_title: t.String(),
  privacy_notice_version: t.Number(),
  effective_from: t.String(),
});

export type OutstandingAcknowledgement = Static<typeof OutstandingAcknowledgementSchema>;

// =============================================================================
// Compliance Summary Schemas
// =============================================================================

/**
 * Compliance summary response
 */
export const ComplianceSummaryResponseSchema = t.Object({
  total_current_notices: t.Number(),
  total_active_employees: t.Number(),
  total_acknowledged: t.Number(),
  total_outstanding: t.Number(),
  compliance_rate: t.Number({ description: "Percentage of employees who have acknowledged all current notices" }),
  notices: t.Array(t.Object({
    notice_id: UuidSchema,
    title: t.String(),
    version: t.Number(),
    effective_from: t.String(),
    acknowledged_count: t.Number(),
    outstanding_count: t.Number(),
    compliance_rate: t.Number(),
  })),
});

export type ComplianceSummaryResponse = Static<typeof ComplianceSummaryResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
