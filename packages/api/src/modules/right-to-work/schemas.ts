/**
 * Right to Work Module - TypeBox Schemas
 *
 * Defines validation schemas for all RTW API endpoints.
 * UK employers must verify every employee's right to work before employment starts.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * RTW check type matching database enum
 */
export const RTWCheckTypeSchema = t.Union([
  t.Literal("manual_list_a"),
  t.Literal("manual_list_b"),
  t.Literal("online_share_code"),
  t.Literal("idvt"),
]);

export type RTWCheckType = Static<typeof RTWCheckTypeSchema>;

/**
 * RTW status matching database enum
 */
export const RTWStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("verified"),
  t.Literal("expired"),
  t.Literal("failed"),
  t.Literal("follow_up_required"),
]);

export type RTWStatus = Static<typeof RTWStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create RTW check request
 */
export const CreateRTWCheckSchema = t.Object({
  employee_id: UuidSchema,
  check_type: RTWCheckTypeSchema,
  check_date: DateSchema,
  document_type: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  document_reference: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  document_expiry_date: t.Optional(DateSchema),
  share_code: t.Optional(t.String({ minLength: 1, maxLength: 20 })),
  restriction_details: t.Optional(t.String({ maxLength: 5000 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateRTWCheck = Static<typeof CreateRTWCheckSchema>;

/**
 * Update RTW check request
 */
export const UpdateRTWCheckSchema = t.Partial(
  t.Object({
    check_date: DateSchema,
    document_type: t.Union([t.String({ minLength: 1, maxLength: 100 }), t.Null()]),
    document_reference: t.Union([t.String({ minLength: 1, maxLength: 255 }), t.Null()]),
    document_expiry_date: t.Union([DateSchema, t.Null()]),
    share_code: t.Union([t.String({ minLength: 1, maxLength: 20 }), t.Null()]),
    follow_up_date: t.Union([DateSchema, t.Null()]),
    restriction_details: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);

export type UpdateRTWCheck = Static<typeof UpdateRTWCheckSchema>;

/**
 * Verify check request (optional notes on verification)
 */
export const VerifyCheckSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type VerifyCheck = Static<typeof VerifyCheckSchema>;

/**
 * Fail check request (reason required)
 */
export const FailCheckSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 5000 }),
});

export type FailCheck = Static<typeof FailCheckSchema>;

/**
 * Document upload metadata
 */
export const CreateRTWDocumentSchema = t.Object({
  document_name: t.String({ minLength: 1, maxLength: 255 }),
  document_type: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  file_key: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  file_size_bytes: t.Optional(t.Number({ minimum: 0 })),
  mime_type: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type CreateRTWDocument = Static<typeof CreateRTWDocumentSchema>;

// =============================================================================
// Query / Filter Schemas
// =============================================================================

/**
 * RTW check list filters
 */
export const RTWCheckFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(RTWStatusSchema),
  check_type: t.Optional(RTWCheckTypeSchema),
  expiring_before: t.Optional(DateSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type RTWCheckFilters = Static<typeof RTWCheckFiltersSchema>;

/**
 * Expiring checks query
 */
export const ExpiringChecksQuerySchema = t.Object({
  days_ahead: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 28 })),
});

export type ExpiringChecksQuery = Static<typeof ExpiringChecksQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * RTW check response
 */
export const RTWCheckResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  check_type: RTWCheckTypeSchema,
  check_date: t.String(),
  checked_by_user_id: UuidSchema,
  status: RTWStatusSchema,
  document_type: t.Union([t.String(), t.Null()]),
  document_reference: t.Union([t.String(), t.Null()]),
  document_expiry_date: t.Union([t.String(), t.Null()]),
  share_code: t.Union([t.String(), t.Null()]),
  follow_up_date: t.Union([t.String(), t.Null()]),
  follow_up_completed: t.Boolean(),
  right_to_work_confirmed: t.Boolean(),
  restriction_details: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type RTWCheckResponse = Static<typeof RTWCheckResponseSchema>;

/**
 * RTW check list item (summary for list endpoints)
 */
export const RTWCheckListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  check_type: RTWCheckTypeSchema,
  check_date: t.String(),
  status: RTWStatusSchema,
  document_type: t.Union([t.String(), t.Null()]),
  document_expiry_date: t.Union([t.String(), t.Null()]),
  follow_up_date: t.Union([t.String(), t.Null()]),
  right_to_work_confirmed: t.Boolean(),
});

export type RTWCheckListItem = Static<typeof RTWCheckListItemSchema>;

/**
 * RTW document response
 */
export const RTWDocumentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  rtw_check_id: UuidSchema,
  document_name: t.String(),
  document_type: t.Union([t.String(), t.Null()]),
  file_key: t.Union([t.String(), t.Null()]),
  file_size_bytes: t.Union([t.Number(), t.Null()]),
  mime_type: t.Union([t.String(), t.Null()]),
  uploaded_by: t.Union([UuidSchema, t.Null()]),
  uploaded_at: t.String(),
});

export type RTWDocumentResponse = Static<typeof RTWDocumentResponseSchema>;

/**
 * Employee RTW status response
 */
export const EmployeeRTWStatusResponseSchema = t.Object({
  employee_id: UuidSchema,
  has_valid_check: t.Boolean(),
  latest_check: t.Union([RTWCheckResponseSchema, t.Null()]),
  requires_follow_up: t.Boolean(),
  next_follow_up_date: t.Union([t.String(), t.Null()]),
  total_checks: t.Number(),
});

export type EmployeeRTWStatusResponse = Static<typeof EmployeeRTWStatusResponseSchema>;

/**
 * Compliance dashboard response
 */
export const ComplianceDashboardResponseSchema = t.Object({
  total_employees: t.Number(),
  verified_count: t.Number(),
  pending_count: t.Number(),
  expired_count: t.Number(),
  failed_count: t.Number(),
  follow_up_required_count: t.Number(),
  no_check_count: t.Number(),
  expiring_soon_count: t.Number(),
  compliance_rate: t.Number(),
});

export type ComplianceDashboardResponse = Static<typeof ComplianceDashboardResponseSchema>;

// =============================================================================
// Param Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
