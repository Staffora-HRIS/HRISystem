/**
 * Consent Management Module - TypeBox Schemas
 *
 * Defines validation schemas for GDPR consent management endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Legal basis for data processing (GDPR Article 6)
 */
export const LegalBasisSchema = t.Union([
  t.Literal("consent"),
  t.Literal("legitimate_interest"),
  t.Literal("contract"),
  t.Literal("legal_obligation"),
]);

export type LegalBasis = Static<typeof LegalBasisSchema>;

/**
 * Consent record status
 */
export const ConsentStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("granted"),
  t.Literal("withdrawn"),
  t.Literal("expired"),
]);

export type ConsentStatus = Static<typeof ConsentStatusSchema>;

/**
 * How consent was collected
 */
export const ConsentMethodSchema = t.Union([
  t.Literal("web_form"),
  t.Literal("paper"),
  t.Literal("email"),
  t.Literal("onboarding"),
  t.Literal("api"),
]);

export type ConsentMethod = Static<typeof ConsentMethodSchema>;

/**
 * Consent audit actions
 */
export const ConsentAuditActionSchema = t.Union([
  t.Literal("granted"),
  t.Literal("withdrawn"),
  t.Literal("expired"),
  t.Literal("renewed"),
  t.Literal("purpose_updated"),
]);

export type ConsentAuditAction = Static<typeof ConsentAuditActionSchema>;

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
// Consent Purpose Schemas
// =============================================================================

/**
 * Create consent purpose request
 */
export const CreateConsentPurposeSchema = t.Object({
  code: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[a-z][a-z0-9_]*$",
    description: "Unique code for the purpose (lowercase, underscores allowed)",
  }),
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.String({
    minLength: 1,
    maxLength: 5000,
    description: "Clear description of what data is processed and why",
  }),
  legal_basis: LegalBasisSchema,
  data_categories: t.Array(t.String({ minLength: 1, maxLength: 100 }), {
    minItems: 1,
    description: "Categories of personal data processed (e.g., 'contact_details', 'health_data')",
  }),
  retention_period_days: t.Optional(t.Number({
    minimum: 1,
    description: "How long data is retained after consent withdrawal (days)",
  })),
  is_required: t.Optional(t.Boolean({
    default: false,
    description: "If true, processing does not depend on consent (e.g., legal obligation)",
  })),
});

export type CreateConsentPurpose = Static<typeof CreateConsentPurposeSchema>;

/**
 * Update consent purpose request
 * Updating name, description, data_categories, or retention triggers a version bump
 */
export const UpdateConsentPurposeSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ minLength: 1, maxLength: 5000 }),
    data_categories: t.Array(t.String({ minLength: 1, maxLength: 100 }), { minItems: 1 }),
    retention_period_days: t.Union([t.Number({ minimum: 1 }), t.Null()]),
    is_required: t.Boolean(),
    is_active: t.Boolean(),
  })
);

export type UpdateConsentPurpose = Static<typeof UpdateConsentPurposeSchema>;

/**
 * Consent purpose response
 */
export const ConsentPurposeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  code: t.String(),
  name: t.String(),
  description: t.String(),
  legal_basis: LegalBasisSchema,
  data_categories: t.Array(t.String()),
  retention_period_days: t.Union([t.Number(), t.Null()]),
  is_required: t.Boolean(),
  is_active: t.Boolean(),
  version: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ConsentPurposeResponse = Static<typeof ConsentPurposeResponseSchema>;

/**
 * Consent purpose filters
 */
export const ConsentPurposeFiltersSchema = t.Object({
  is_active: t.Optional(t.Boolean()),
  legal_basis: t.Optional(LegalBasisSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type ConsentPurposeFilters = Static<typeof ConsentPurposeFiltersSchema>;

// =============================================================================
// Consent Record Schemas
// =============================================================================

/**
 * Grant consent request
 */
export const GrantConsentSchema = t.Object({
  employee_id: UuidSchema,
  consent_purpose_id: UuidSchema,
  consent_method: ConsentMethodSchema,
  expires_at: t.Optional(t.String({
    format: "date-time",
    description: "Optional expiry date for the consent (ISO 8601)",
  })),
});

export type GrantConsent = Static<typeof GrantConsentSchema>;

/**
 * Withdraw consent request
 */
export const WithdrawConsentSchema = t.Object({
  employee_id: UuidSchema,
  consent_purpose_id: UuidSchema,
  withdrawal_reason: t.Optional(t.String({ maxLength: 2000 })),
});

export type WithdrawConsent = Static<typeof WithdrawConsentSchema>;

/**
 * Consent record response
 */
export const ConsentRecordResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  consent_purpose_id: UuidSchema,
  purpose_code: t.Optional(t.String()),
  purpose_name: t.Optional(t.String()),
  purpose_version: t.Number(),
  current_purpose_version: t.Optional(t.Number()),
  status: ConsentStatusSchema,
  granted_at: t.Union([t.String(), t.Null()]),
  withdrawn_at: t.Union([t.String(), t.Null()]),
  consent_method: t.Union([ConsentMethodSchema, t.Null()]),
  ip_address: t.Union([t.String(), t.Null()]),
  withdrawal_reason: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
  requires_reconsent: t.Optional(t.Boolean()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ConsentRecordResponse = Static<typeof ConsentRecordResponseSchema>;

/**
 * Consent record filters
 */
export const ConsentRecordFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  consent_purpose_id: t.Optional(UuidSchema),
  status: t.Optional(ConsentStatusSchema),
});

export type ConsentRecordFilters = Static<typeof ConsentRecordFiltersSchema>;

// =============================================================================
// Consent Check Response
// =============================================================================

/**
 * Quick consent check response
 */
export const ConsentCheckResponseSchema = t.Object({
  has_consent: t.Boolean(),
  status: t.Union([ConsentStatusSchema, t.Null()]),
  purpose_code: t.String(),
  purpose_name: t.String(),
  requires_reconsent: t.Boolean(),
  granted_at: t.Union([t.String(), t.Null()]),
  expires_at: t.Union([t.String(), t.Null()]),
});

export type ConsentCheckResponse = Static<typeof ConsentCheckResponseSchema>;

// =============================================================================
// Dashboard
// =============================================================================

/**
 * Consent dashboard response
 */
export const ConsentDashboardResponseSchema = t.Object({
  total_purposes: t.Number(),
  active_purposes: t.Number(),
  total_records: t.Number(),
  by_status: t.Object({
    pending: t.Number(),
    granted: t.Number(),
    withdrawn: t.Number(),
    expired: t.Number(),
  }),
  requiring_reconsent: t.Number(),
  expiring_soon: t.Number(),
});

export type ConsentDashboardResponse = Static<typeof ConsentDashboardResponseSchema>;

// =============================================================================
// Consent Audit Log
// =============================================================================

/**
 * Consent audit log entry response
 */
export const ConsentAuditLogResponseSchema = t.Object({
  id: UuidSchema,
  consent_record_id: UuidSchema,
  action: ConsentAuditActionSchema,
  performed_by: t.Union([UuidSchema, t.Null()]),
  details: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
});

export type ConsentAuditLogResponse = Static<typeof ConsentAuditLogResponseSchema>;

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

/**
 * Employee ID parameter
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

/**
 * Employee + purpose code parameters
 */
export const ConsentCheckParamsSchema = t.Object({
  employeeId: UuidSchema,
  purposeCode: t.String({ minLength: 1, maxLength: 50 }),
});

export type ConsentCheckParams = Static<typeof ConsentCheckParamsSchema>;

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
