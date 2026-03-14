/**
 * DSAR Module - TypeBox Schemas
 *
 * Defines validation schemas for all DSAR (Data Subject Access Request) API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * UK GDPR compliance: Articles 15-20 (access, rectification, erasure, portability).
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * DSAR request type enum matching database type
 */
export const DsarRequestTypeSchema = t.Union([
  t.Literal("access"),
  t.Literal("rectification"),
  t.Literal("erasure"),
  t.Literal("portability"),
]);

export type DsarRequestType = Static<typeof DsarRequestTypeSchema>;

/**
 * DSAR request status enum matching database type
 */
export const DsarRequestStatusSchema = t.Union([
  t.Literal("received"),
  t.Literal("in_progress"),
  t.Literal("data_gathering"),
  t.Literal("review"),
  t.Literal("completed"),
  t.Literal("rejected"),
  t.Literal("extended"),
]);

export type DsarRequestStatus = Static<typeof DsarRequestStatusSchema>;

/**
 * DSAR response format enum
 */
export const DsarResponseFormatSchema = t.Union([
  t.Literal("json"),
  t.Literal("csv"),
  t.Literal("pdf"),
]);

export type DsarResponseFormat = Static<typeof DsarResponseFormatSchema>;

/**
 * DSAR data item status enum
 */
export const DsarDataItemStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("gathered"),
  t.Literal("redacted"),
  t.Literal("excluded"),
]);

export type DsarDataItemStatus = Static<typeof DsarDataItemStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String(),
});

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new DSAR request
 */
export const CreateDsarRequestSchema = t.Object({
  employee_id: UuidSchema,
  request_type: DsarRequestTypeSchema,
  response_format: t.Optional(DsarResponseFormatSchema),
  received_date: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 5000 })),
});

export type CreateDsarRequest = Static<typeof CreateDsarRequestSchema>;

/**
 * Verify data subject identity
 */
export const VerifyIdentitySchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type VerifyIdentity = Static<typeof VerifyIdentitySchema>;

/**
 * Extend DSAR deadline
 */
export const ExtendDeadlineSchema = t.Object({
  reason: t.String({ minLength: 10, maxLength: 2000 }),
  extended_days: t.Optional(t.Numeric({ minimum: 1, maximum: 60 })),
});

export type ExtendDeadline = Static<typeof ExtendDeadlineSchema>;

/**
 * Reject DSAR request
 */
export const RejectDsarRequestSchema = t.Object({
  reason: t.String({ minLength: 10, maxLength: 2000 }),
});

export type RejectDsarRequest = Static<typeof RejectDsarRequestSchema>;

/**
 * Complete DSAR request
 */
export const CompleteDsarRequestSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CompleteDsarRequest = Static<typeof CompleteDsarRequestSchema>;

/**
 * Update data item (redact or exclude)
 */
export const UpdateDataItemSchema = t.Object({
  status: t.Union([t.Literal("redacted"), t.Literal("excluded")]),
  redaction_notes: t.String({ minLength: 1, maxLength: 2000 }),
});

export type UpdateDataItem = Static<typeof UpdateDataItemSchema>;

/**
 * Gather data from a module
 */
export const GatherModuleParamsSchema = t.Object({
  id: UuidSchema,
  moduleName: t.String({ minLength: 1, maxLength: 50 }),
});

export type GatherModuleParams = Static<typeof GatherModuleParamsSchema>;

/**
 * Data item params (request + item)
 */
export const DataItemParamsSchema = t.Object({
  id: UuidSchema,
  itemId: UuidSchema,
});

export type DataItemParams = Static<typeof DataItemParamsSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing DSAR requests
 */
export const DsarRequestFiltersSchema = t.Object({
  status: t.Optional(DsarRequestStatusSchema),
  employee_id: t.Optional(UuidSchema),
  request_type: t.Optional(DsarRequestTypeSchema),
  overdue: t.Optional(t.BooleanString()),
  search: t.Optional(t.String()),
});

export type DsarRequestFilters = Static<typeof DsarRequestFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * DSAR audit log entry response
 */
export const DsarAuditLogEntrySchema = t.Object({
  id: t.String(),
  dsarRequestId: t.String(),
  action: t.String(),
  performedBy: t.String(),
  details: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  createdAt: t.String(),
});

export type DsarAuditLogEntry = Static<typeof DsarAuditLogEntrySchema>;

/**
 * DSAR data item response
 */
export const DsarDataItemResponseSchema = t.Object({
  id: t.String(),
  dsarRequestId: t.String(),
  moduleName: t.String(),
  dataCategory: t.String(),
  status: DsarDataItemStatusSchema,
  recordCount: t.Number(),
  dataExport: t.Union([t.Unknown(), t.Null()]),
  redactionNotes: t.Union([t.String(), t.Null()]),
  gatheredBy: t.Union([t.String(), t.Null()]),
  gatheredAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type DsarDataItemResponse = Static<typeof DsarDataItemResponseSchema>;

/**
 * DSAR request response (summary)
 */
export const DsarRequestResponseSchema = t.Object({
  id: t.String(),
  tenantId: t.String(),
  employeeId: t.String(),
  requestedByUserId: t.String(),
  requestType: DsarRequestTypeSchema,
  status: DsarRequestStatusSchema,
  receivedDate: t.String(),
  deadlineDate: t.String(),
  extendedDeadlineDate: t.Union([t.String(), t.Null()]),
  extensionReason: t.Union([t.String(), t.Null()]),
  completedDate: t.Union([t.String(), t.Null()]),
  responseFormat: DsarResponseFormatSchema,
  identityVerified: t.Boolean(),
  identityVerifiedDate: t.Union([t.String(), t.Null()]),
  identityVerifiedBy: t.Union([t.String(), t.Null()]),
  rejectionReason: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type DsarRequestResponse = Static<typeof DsarRequestResponseSchema>;

/**
 * DSAR request detail response (with data items and audit log)
 */
export const DsarRequestDetailResponseSchema = t.Object({
  ...DsarRequestResponseSchema.properties,
  dataItems: t.Array(DsarDataItemResponseSchema),
  auditLog: t.Array(DsarAuditLogEntrySchema),
});

export type DsarRequestDetailResponse = Static<typeof DsarRequestDetailResponseSchema>;

/**
 * DSAR list response
 */
export const DsarRequestListResponseSchema = t.Object({
  items: t.Array(DsarRequestResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type DsarRequestListResponse = Static<typeof DsarRequestListResponseSchema>;

/**
 * DSAR dashboard stats
 */
export const DsarDashboardSchema = t.Object({
  totalOpen: t.Number(),
  totalCompleted: t.Number(),
  totalRejected: t.Number(),
  totalOverdue: t.Number(),
  avgResponseDays: t.Union([t.Number(), t.Null()]),
  byStatus: t.Record(t.String(), t.Number()),
  byType: t.Record(t.String(), t.Number()),
});

export type DsarDashboard = Static<typeof DsarDashboardSchema>;
