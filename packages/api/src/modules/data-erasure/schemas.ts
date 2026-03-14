/**
 * Data Erasure Module - TypeBox Schemas
 *
 * Defines validation schemas for GDPR Article 17 (Right to Erasure) endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Erasure request status enum matching database type
 */
export const ErasureRequestStatusSchema = t.Union([
  t.Literal("received"),
  t.Literal("reviewing"),
  t.Literal("approved"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("rejected"),
  t.Literal("partially_completed"),
]);

export type ErasureRequestStatus = Static<typeof ErasureRequestStatusSchema>;

/**
 * Erasure item action enum matching database type
 */
export const ErasureItemActionSchema = t.Union([
  t.Literal("anonymized"),
  t.Literal("deleted"),
  t.Literal("retained"),
  t.Literal("pending"),
]);

export type ErasureItemAction = Static<typeof ErasureItemActionSchema>;

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

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new erasure request
 */
export const CreateErasureRequestSchema = t.Object({
  employee_id: UuidSchema,
  received_date: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateErasureRequest = Static<typeof CreateErasureRequestSchema>;

/**
 * Approve an erasure request
 */
export const ApproveErasureRequestSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type ApproveErasureRequest = Static<
  typeof ApproveErasureRequestSchema
>;

/**
 * Reject an erasure request
 */
export const RejectErasureRequestSchema = t.Object({
  reason: t.String({ minLength: 5, maxLength: 2000 }),
});

export type RejectErasureRequest = Static<typeof RejectErasureRequestSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing erasure requests
 */
export const ErasureRequestFiltersSchema = t.Object({
  status: t.Optional(ErasureRequestStatusSchema),
  employee_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type ErasureRequestFilters = Static<
  typeof ErasureRequestFiltersSchema
>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Erasure audit log entry response
 */
export const ErasureAuditLogEntrySchema = t.Object({
  id: t.String(),
  erasureRequestId: t.String(),
  action: t.String(),
  performedBy: t.String(),
  details: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  createdAt: t.String(),
});

export type ErasureAuditLogEntry = Static<typeof ErasureAuditLogEntrySchema>;

/**
 * Erasure item response (per-table tracking)
 */
export const ErasureItemResponseSchema = t.Object({
  id: t.String(),
  erasureRequestId: t.String(),
  tableName: t.String(),
  moduleName: t.Union([t.String(), t.Null()]),
  recordCount: t.Number(),
  actionTaken: ErasureItemActionSchema,
  retentionReason: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type ErasureItemResponse = Static<typeof ErasureItemResponseSchema>;

/**
 * Erasure request response (summary)
 */
export const ErasureRequestResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  employeeId: t.String(),
  requestedByUserId: t.String(),
  status: ErasureRequestStatusSchema,
  receivedDate: t.String(),
  deadlineDate: t.String(),
  approvedBy: t.Union([t.String(), t.Null()]),
  approvedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  rejectionReason: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  certificateFileKey: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type ErasureRequestResponse = Static<
  typeof ErasureRequestResponseSchema
>;

/**
 * Erasure request detail response (with items and audit log)
 */
export const ErasureRequestDetailResponseSchema = t.Object({
  ...ErasureRequestResponseSchema.properties,
  items: t.Array(ErasureItemResponseSchema),
  auditLog: t.Array(ErasureAuditLogEntrySchema),
});

export type ErasureRequestDetailResponse = Static<
  typeof ErasureRequestDetailResponseSchema
>;

/**
 * Erasure request list response
 */
export const ErasureRequestListResponseSchema = t.Object({
  items: t.Array(ErasureRequestResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type ErasureRequestListResponse = Static<
  typeof ErasureRequestListResponseSchema
>;

/**
 * Retention conflict entry — data that cannot be erased
 */
export const RetentionConflictSchema = t.Object({
  tableName: t.String(),
  moduleName: t.String(),
  recordCount: t.Number(),
  reason: t.String(),
});

export type RetentionConflict = Static<typeof RetentionConflictSchema>;

/**
 * Retention conflicts response
 */
export const RetentionConflictsResponseSchema = t.Object({
  employeeId: t.String(),
  conflicts: t.Array(RetentionConflictSchema),
  canProceed: t.Boolean(),
});

export type RetentionConflictsResponse = Static<
  typeof RetentionConflictsResponseSchema
>;

/**
 * Overdue requests response
 */
export const OverdueRequestsResponseSchema = t.Object({
  items: t.Array(ErasureRequestResponseSchema),
  total: t.Number(),
});

export type OverdueRequestsResponse = Static<
  typeof OverdueRequestsResponseSchema
>;
