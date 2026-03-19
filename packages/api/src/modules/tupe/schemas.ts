/**
 * TUPE Transfers Module - TypeBox Schemas
 *
 * Defines validation schemas for TUPE (Transfer of Undertakings Protection
 * of Employment) transfer management API endpoints.
 *
 * UK Legal Context:
 * TUPE Regulations 2006 (as amended 2014) protect employees when a business
 * or undertaking transfers to a new employer. This module tracks:
 * - Transfer planning and consultation phases
 * - Affected employee identification and consent
 * - Completion of the transfer process
 *
 * State machine for transfer status:
 *   planning -> consultation
 *   consultation -> in_progress | cancelled
 *   in_progress -> completed | cancelled
 *   completed -> (terminal)
 *   cancelled -> (terminal)
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * TUPE transfer status enum matching database type.
 *
 * State machine:
 *   planning     -> consultation
 *   consultation -> in_progress | cancelled
 *   in_progress  -> completed | cancelled
 *   completed    -> (terminal)
 *   cancelled    -> (terminal)
 */
export const TupeTransferStatusSchema = t.Union([
  t.Literal("planning"),
  t.Literal("consultation"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export type TupeTransferStatus = Static<typeof TupeTransferStatusSchema>;

/**
 * TUPE affected employee consent status enum matching database type.
 */
export const TupeConsentStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("consented"),
  t.Literal("objected"),
]);

export type TupeConsentStatus = Static<typeof TupeConsentStatusSchema>;

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
// Transfer Request Schemas
// =============================================================================

/**
 * Create TUPE transfer request
 */
export const CreateTupeTransferSchema = t.Object({
  transferName: t.String({ minLength: 1, maxLength: 500 }),
  transferorOrg: t.String({ minLength: 1, maxLength: 500 }),
  transfereeOrg: t.String({ minLength: 1, maxLength: 500 }),
  transferDate: DateSchema,
  notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type CreateTupeTransfer = Static<typeof CreateTupeTransferSchema>;

/**
 * Update TUPE transfer request
 */
export const UpdateTupeTransferSchema = t.Object({
  transferName: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  transferorOrg: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  transfereeOrg: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
  transferDate: t.Optional(DateSchema),
  status: t.Optional(TupeTransferStatusSchema),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type UpdateTupeTransfer = Static<typeof UpdateTupeTransferSchema>;

/**
 * TUPE transfer filters for list endpoint
 */
export const TupeTransferFiltersSchema = t.Object({
  status: t.Optional(TupeTransferStatusSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type TupeTransferFilters = Static<typeof TupeTransferFiltersSchema>;

// =============================================================================
// Affected Employee Request Schemas
// =============================================================================

/**
 * Add affected employee to a TUPE transfer
 */
export const AddAffectedEmployeeSchema = t.Object({
  employeeId: UuidSchema,
  notes: t.Optional(t.String({ maxLength: 10000 })),
});

export type AddAffectedEmployee = Static<typeof AddAffectedEmployeeSchema>;

/**
 * Update consent status for an affected employee
 */
export const UpdateConsentSchema = t.Object({
  consentStatus: TupeConsentStatusSchema,
  newTermsAccepted: t.Optional(t.Boolean()),
  notes: t.Optional(t.Union([t.String({ maxLength: 10000 }), t.Null()])),
});

export type UpdateConsent = Static<typeof UpdateConsentSchema>;

// =============================================================================
// Transfer Response Schemas
// =============================================================================

/**
 * TUPE transfer response
 */
export const TupeTransferResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  transferName: t.String(),
  transferorOrg: t.String(),
  transfereeOrg: t.String(),
  transferDate: t.String(),
  status: TupeTransferStatusSchema,
  employeeCount: t.Number(),
  notes: t.Union([t.String(), t.Null()]),
  createdBy: t.Union([UuidSchema, t.Null()]),
  updatedBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type TupeTransferResponse = Static<typeof TupeTransferResponseSchema>;

/**
 * TUPE transfer list response
 */
export const TupeTransferListResponseSchema = t.Object({
  items: t.Array(TupeTransferResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type TupeTransferListResponse = Static<typeof TupeTransferListResponseSchema>;

// =============================================================================
// Affected Employee Response Schemas
// =============================================================================

/**
 * TUPE affected employee response
 */
export const TupeAffectedEmployeeResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  transferId: UuidSchema,
  employeeId: UuidSchema,
  employeeName: t.Optional(t.String()),
  consentStatus: TupeConsentStatusSchema,
  newTermsAccepted: t.Boolean(),
  transferCompleted: t.Boolean(),
  notes: t.Union([t.String(), t.Null()]),
  createdBy: t.Union([UuidSchema, t.Null()]),
  updatedBy: t.Union([UuidSchema, t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export type TupeAffectedEmployeeResponse = Static<typeof TupeAffectedEmployeeResponseSchema>;

/**
 * TUPE affected employee list response
 */
export const TupeAffectedEmployeeListResponseSchema = t.Object({
  items: t.Array(TupeAffectedEmployeeResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type TupeAffectedEmployeeListResponse = Static<typeof TupeAffectedEmployeeListResponseSchema>;

// =============================================================================
// Status History Response Schema
// =============================================================================

/**
 * Status history entry response
 */
export const StatusHistoryEntrySchema = t.Object({
  id: UuidSchema,
  fromStatus: t.Union([t.String(), t.Null()]),
  toStatus: t.String(),
  changedBy: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

export type StatusHistoryEntry = Static<typeof StatusHistoryEntrySchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const TransferEmployeeParamsSchema = t.Object({
  id: UuidSchema,
  empId: UuidSchema,
});

export type TransferEmployeeParams = Static<typeof TransferEmployeeParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
