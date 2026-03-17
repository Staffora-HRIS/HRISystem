/**
 * DBS Checks Module - TypeBox Schemas
 *
 * Defines validation schemas for DBS (Disclosure and Barring Service) check API endpoints.
 *
 * UK employers may be legally required to obtain DBS checks for roles involving
 * work with children, vulnerable adults, or positions of trust. DBS certificates
 * do not technically expire, but many employers renew every 3 years as policy.
 * The DBS Update Service allows online status checking of existing certificates.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * DBS check level matching database enum.
 *
 * - basic: Unspent convictions only
 * - standard: Spent and unspent convictions, cautions, reprimands, warnings
 * - enhanced: Standard + relevant police information
 * - enhanced_barred: Enhanced + barred list check(s)
 */
export const DbsCheckLevelSchema = t.Union([
  t.Literal("basic"),
  t.Literal("standard"),
  t.Literal("enhanced"),
  t.Literal("enhanced_barred"),
]);

export type DbsCheckLevel = Static<typeof DbsCheckLevelSchema>;

/**
 * DBS check status matching database enum.
 *
 * Lifecycle:
 *   not_started -> pending   (check initiated)
 *   pending -> submitted     (application sent to DBS)
 *   submitted -> received    (certificate received)
 *   received -> clear        (no relevant information disclosed)
 *   received -> flagged      (information disclosed, requires review)
 *   clear -> expired         (certificate age exceeds policy threshold)
 *   flagged -> expired       (certificate age exceeds policy threshold)
 */
export const DbsCheckStatusSchema = t.Union([
  t.Literal("not_started"),
  t.Literal("pending"),
  t.Literal("submitted"),
  t.Literal("received"),
  t.Literal("clear"),
  t.Literal("flagged"),
  t.Literal("expired"),
]);

export type DbsCheckStatus = Static<typeof DbsCheckStatusSchema>;

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
 * Create DBS check request
 */
export const CreateDbsCheckSchema = t.Object({
  employee_id: UuidSchema,
  check_level: DbsCheckLevelSchema,
  certificate_number: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  issue_date: t.Optional(DateSchema),
  dbs_update_service_registered: t.Optional(t.Boolean()),
  update_service_id: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  renewal_due_date: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateDbsCheck = Static<typeof CreateDbsCheckSchema>;

/**
 * Update DBS check request
 */
export const UpdateDbsCheckSchema = t.Partial(
  t.Object({
    check_level: DbsCheckLevelSchema,
    certificate_number: t.Union([t.String({ minLength: 1, maxLength: 50 }), t.Null()]),
    issue_date: t.Union([DateSchema, t.Null()]),
    dbs_update_service_registered: t.Boolean(),
    update_service_id: t.Union([t.String({ minLength: 1, maxLength: 50 }), t.Null()]),
    renewal_due_date: t.Union([DateSchema, t.Null()]),
    result: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    notes: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
  })
);

export type UpdateDbsCheck = Static<typeof UpdateDbsCheckSchema>;

/**
 * Submit DBS check application
 */
export const SubmitDbsCheckSchema = t.Object({
  certificate_number: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type SubmitDbsCheck = Static<typeof SubmitDbsCheckSchema>;

/**
 * Record DBS check result (certificate received)
 */
export const RecordDbsResultSchema = t.Object({
  certificate_number: t.String({ minLength: 1, maxLength: 50 }),
  issue_date: DateSchema,
  clear: t.Boolean({
    description: "Whether the check came back clear (true) or flagged (false)",
  }),
  result: t.Optional(t.String({ maxLength: 5000 })),
  dbs_update_service_registered: t.Optional(t.Boolean()),
  update_service_id: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  renewal_due_date: t.Optional(DateSchema),
});

export type RecordDbsResult = Static<typeof RecordDbsResultSchema>;

// =============================================================================
// Filter / Query Schemas
// =============================================================================

/**
 * DBS check list filters
 */
export const DbsCheckFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(DbsCheckStatusSchema),
  check_level: t.Optional(DbsCheckLevelSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type DbsCheckFilters = Static<typeof DbsCheckFiltersSchema>;

/**
 * Expiring/renewal-due checks query
 */
export const RenewalDueQuerySchema = t.Object({
  days_ahead: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 90 })),
});

export type RenewalDueQuery = Static<typeof RenewalDueQuerySchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * DBS check full response
 */
export const DbsCheckResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  check_level: DbsCheckLevelSchema,
  certificate_number: t.Union([t.String(), t.Null()]),
  issue_date: t.Union([t.String(), t.Null()]),
  dbs_update_service_registered: t.Boolean(),
  update_service_id: t.Union([t.String(), t.Null()]),
  status: DbsCheckStatusSchema,
  result: t.Union([t.String(), t.Null()]),
  expiry_date: t.Union([t.String(), t.Null()]),
  renewal_due_date: t.Union([t.String(), t.Null()]),
  checked_by: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type DbsCheckResponse = Static<typeof DbsCheckResponseSchema>;

/**
 * DBS check list item (includes joined employee name)
 */
export const DbsCheckListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Union([t.String(), t.Null()]),
  employee_number: t.Union([t.String(), t.Null()]),
  check_level: DbsCheckLevelSchema,
  certificate_number: t.Union([t.String(), t.Null()]),
  issue_date: t.Union([t.String(), t.Null()]),
  status: DbsCheckStatusSchema,
  dbs_update_service_registered: t.Boolean(),
  renewal_due_date: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type DbsCheckListItem = Static<typeof DbsCheckListItemSchema>;
