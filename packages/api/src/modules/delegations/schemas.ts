/**
 * Approval Delegation Module Schemas
 *
 * TypeBox schemas for request/response validation on delegation endpoints.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });

// =============================================================================
// Delegation Scope
// =============================================================================

export const DelegationScopeSchema = t.Union([
  t.Literal("all"),
  t.Literal("leave"),
  t.Literal("expenses"),
  t.Literal("time"),
  t.Literal("purchase"),
]);
export type DelegationScope = Static<typeof DelegationScopeSchema>;

// =============================================================================
// Create Delegation
// =============================================================================

export const CreateDelegationSchema = t.Object({
  delegateId: UuidSchema,
  startDate: DateSchema,
  endDate: DateSchema,
  scope: t.Optional(DelegationScopeSchema),
  scopeFilters: t.Optional(t.Record(t.String(), t.Unknown())),
  notifyDelegator: t.Optional(t.Boolean({ default: true })),
  includePending: t.Optional(t.Boolean({ default: false })),
  delegationReason: t.Optional(t.String({ maxLength: 1000 })),
});
export type CreateDelegation = Static<typeof CreateDelegationSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const DelegationResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  delegatorId: UuidSchema,
  delegateId: UuidSchema,
  startDate: t.String(),
  endDate: t.String(),
  scope: t.String(),
  scopeFilters: t.Unknown(),
  notifyDelegator: t.Boolean(),
  includePending: t.Boolean(),
  delegationReason: t.Nullable(t.String()),
  isActive: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
  createdBy: t.Nullable(UuidSchema),
});
export type DelegationResponse = Static<typeof DelegationResponseSchema>;

export const DelegationListItemSchema = t.Object({
  delegationId: UuidSchema,
  delegateName: t.String(),
  scope: t.String(),
  startDate: t.String(),
  endDate: t.String(),
  isActive: t.Boolean(),
  usageCount: t.Number(),
});
export type DelegationListItem = Static<typeof DelegationListItemSchema>;

export const ActiveDelegationSchema = t.Object({
  delegationId: UuidSchema,
  delegateId: UuidSchema,
  delegateName: t.String(),
  scope: t.String(),
  endDate: t.String(),
});
export type ActiveDelegation = Static<typeof ActiveDelegationSchema>;

export const DelegationLogEntrySchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  delegationId: UuidSchema,
  workflowInstanceId: t.Nullable(UuidSchema),
  approvalType: t.String(),
  approvalId: UuidSchema,
  action: t.String(),
  notes: t.Nullable(t.String()),
  performedBy: UuidSchema,
  performedAt: t.String(),
});
export type DelegationLogEntry = Static<typeof DelegationLogEntrySchema>;

// =============================================================================
// Params
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;
