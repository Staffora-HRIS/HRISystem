/**
 * Cost Centre Assignments Module - TypeBox Schemas
 *
 * Defines validation schemas for cost centre assignment API endpoints.
 * Supports effective-dated tracking of cost centre assignments for
 * employees, departments, and positions with percentage allocation.
 */

import { t, type Static } from "elysia";

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
// Enums
// =============================================================================

export const EntityTypeSchema = t.Union([
  t.Literal("employee"),
  t.Literal("department"),
  t.Literal("position"),
]);
export type EntityType = Static<typeof EntityTypeSchema>;

// =============================================================================
// Cost Centre Assignment Schemas
// =============================================================================

/**
 * Create cost centre assignment request.
 * Assigns a cost centre to an entity (employee, department, or position)
 * with an effective date and optional percentage allocation.
 */
export const CreateCostCentreAssignmentSchema = t.Object({
  entity_type: EntityTypeSchema,
  entity_id: UuidSchema,
  cost_centre_id: UuidSchema,
  percentage: t.Optional(
    t.Number({
      minimum: 0.01,
      maximum: 100,
      default: 100,
      description: "Allocation percentage (default 100). Multiple assignments for the same entity can sum to 100.",
    })
  ),
  effective_from: DateSchema,
  effective_to: t.Optional(
    t.Union([DateSchema, t.Null()], {
      description: "End date of assignment (null = open-ended/current)",
    })
  ),
});
export type CreateCostCentreAssignment = Static<typeof CreateCostCentreAssignmentSchema>;

/**
 * Update cost centre assignment request.
 * Only percentage and effective_to can be changed after creation.
 * To change cost centre or entity, close the current assignment and create a new one.
 */
export const UpdateCostCentreAssignmentSchema = t.Object({
  percentage: t.Optional(
    t.Number({
      minimum: 0.01,
      maximum: 100,
    })
  ),
  effective_to: t.Optional(
    t.Union([DateSchema, t.Null()], {
      description: "Set end date to close this assignment, or null to re-open",
    })
  ),
});
export type UpdateCostCentreAssignment = Static<typeof UpdateCostCentreAssignmentSchema>;

/**
 * Cost centre assignment response
 */
export const CostCentreAssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  entity_type: EntityTypeSchema,
  entity_id: UuidSchema,
  entity_name: t.Optional(t.Union([t.String(), t.Null()])),
  cost_centre_id: UuidSchema,
  cost_centre_code: t.Optional(t.Union([t.String(), t.Null()])),
  cost_centre_name: t.Optional(t.Union([t.String(), t.Null()])),
  percentage: t.Number(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type CostCentreAssignmentResponse = Static<typeof CostCentreAssignmentResponseSchema>;

/**
 * History filters for querying cost centre assignment changes
 */
export const CostCentreAssignmentFiltersSchema = t.Object({
  entity_type: t.Optional(EntityTypeSchema),
  entity_id: t.Optional(UuidSchema),
  cost_centre_id: t.Optional(UuidSchema),
  current_only: t.Optional(t.Boolean({ description: "If true, only return current (non-ended) assignments" })),
  effective_at: t.Optional(DateSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type CostCentreAssignmentFilters = Static<typeof CostCentreAssignmentFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Entity history params: get cost centre history for a specific entity
 */
export const EntityHistoryParamsSchema = t.Object({
  entityType: EntityTypeSchema,
  entityId: UuidSchema,
});
export type EntityHistoryParams = Static<typeof EntityHistoryParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
