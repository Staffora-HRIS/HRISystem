/**
 * Shift Swap Module Schemas
 *
 * TypeBox schemas for request/response validation in shift swap operations.
 * Supports the two-phase approval workflow:
 *   pending_target -> pending_manager -> approved/rejected
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const ShiftSwapStatusSchema = t.Union([
  t.Literal("pending_target"),
  t.Literal("pending_manager"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("cancelled"),
]);
export type ShiftSwapStatus = Static<typeof ShiftSwapStatusSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateTimeSchema = t.String({ format: "date-time" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Params
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateShiftSwapRequestSchema = t.Object({
  /** The shift assignment the requester wants to swap away */
  requesterAssignmentId: UuidSchema,
  /** The shift assignment the requester wants in return */
  targetAssignmentId: UuidSchema,
  /** The employee being asked to swap (owner of targetAssignmentId) */
  targetEmployeeId: UuidSchema,
  /** Optional reason for the swap request */
  reason: t.Optional(t.String({ maxLength: 500 })),
});
export type CreateShiftSwapRequest = Static<typeof CreateShiftSwapRequestSchema>;

export const RespondToSwapSchema = t.Object({
  /** Optional notes from the target employee */
  notes: t.Optional(t.String({ maxLength: 500 })),
});
export type RespondToSwap = Static<typeof RespondToSwapSchema>;

export const ManagerApprovalSchema = t.Object({
  /** Optional notes from the manager */
  notes: t.Optional(t.String({ maxLength: 500 })),
});
export type ManagerApproval = Static<typeof ManagerApprovalSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const ShiftSwapFiltersSchema = t.Object({
  /** Filter by status */
  status: t.Optional(ShiftSwapStatusSchema),
  /** Filter to only show swaps where the user is the requester */
  asRequester: t.Optional(t.Boolean()),
  /** Filter to only show swaps where the user is the target */
  asTarget: t.Optional(t.Boolean()),
  ...PaginationQuerySchema.properties,
});
export type ShiftSwapFilters = Static<typeof ShiftSwapFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const ShiftSwapResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  requesterId: UuidSchema,
  requesterAssignmentId: UuidSchema,
  targetEmployeeId: UuidSchema,
  targetAssignmentId: UuidSchema,
  status: ShiftSwapStatusSchema,
  reason: t.Nullable(t.String()),
  targetAccepted: t.Nullable(t.Boolean()),
  targetResponseAt: t.Nullable(t.String()),
  targetResponseNotes: t.Nullable(t.String()),
  approvedBy: t.Nullable(UuidSchema),
  approvedAt: t.Nullable(t.String()),
  approvalNotes: t.Nullable(t.String()),
  managerResponseAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type ShiftSwapResponse = Static<typeof ShiftSwapResponseSchema>;
