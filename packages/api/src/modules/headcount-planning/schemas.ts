/**
 * Headcount Planning Module - TypeBox Schemas
 *
 * Defines validation schemas for headcount planning API endpoints.
 * Tables: headcount_plans, headcount_plan_items
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

export const HeadcountPlanStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("approved"),
  t.Literal("closed"),
]);
export type HeadcountPlanStatus = Static<typeof HeadcountPlanStatusSchema>;

export const HeadcountItemPrioritySchema = t.Union([
  t.Literal("critical"),
  t.Literal("high"),
  t.Literal("medium"),
  t.Literal("low"),
]);
export type HeadcountItemPriority = Static<typeof HeadcountItemPrioritySchema>;

export const HeadcountItemStatusSchema = t.Union([
  t.Literal("open"),
  t.Literal("approved"),
  t.Literal("filled"),
  t.Literal("cancelled"),
]);
export type HeadcountItemStatus = Static<typeof HeadcountItemStatusSchema>;

// =============================================================================
// Plan Schemas
// =============================================================================

export const CreatePlanSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  financial_year: t.String({
    minLength: 7,
    maxLength: 9,
    pattern: "^\\d{4}\\/\\d{4}$",
  }),
});
export type CreatePlan = Static<typeof CreatePlanSchema>;

export const UpdatePlanSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    financial_year: t.String({
      minLength: 7,
      maxLength: 9,
      pattern: "^\\d{4}\\/\\d{4}$",
    }),
    status: HeadcountPlanStatusSchema,
  })
);
export type UpdatePlan = Static<typeof UpdatePlanSchema>;

export const PlanResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  financial_year: t.String(),
  status: HeadcountPlanStatusSchema,
  created_by: t.Union([UuidSchema, t.Null()]),
  approved_by: t.Union([UuidSchema, t.Null()]),
  total_current: t.Optional(t.Number()),
  total_planned: t.Optional(t.Number()),
  total_variance: t.Optional(t.Number()),
  items_count: t.Optional(t.Number()),
  created_at: t.String(),
  updated_at: t.String(),
});
export type PlanResponse = Static<typeof PlanResponseSchema>;

export const PlanFiltersSchema = t.Object({
  status: t.Optional(HeadcountPlanStatusSchema),
  financial_year: t.Optional(t.String()),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type PlanFilters = Static<typeof PlanFiltersSchema>;

// =============================================================================
// Plan Item Schemas
// =============================================================================

export const CreatePlanItemSchema = t.Object({
  org_unit_id: UuidSchema,
  position_id: t.Optional(UuidSchema),
  job_id: t.Optional(UuidSchema),
  current_headcount: t.Number({ minimum: 0 }),
  planned_headcount: t.Number({ minimum: 0 }),
  justification: t.Optional(t.String({ maxLength: 5000 })),
  priority: t.Optional(HeadcountItemPrioritySchema),
  status: t.Optional(HeadcountItemStatusSchema),
  target_fill_date: t.Optional(DateSchema),
});
export type CreatePlanItem = Static<typeof CreatePlanItemSchema>;

export const UpdatePlanItemSchema = t.Partial(
  t.Object({
    current_headcount: t.Number({ minimum: 0 }),
    planned_headcount: t.Number({ minimum: 0 }),
    justification: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    priority: HeadcountItemPrioritySchema,
    status: HeadcountItemStatusSchema,
    target_fill_date: t.Union([DateSchema, t.Null()]),
  })
);
export type UpdatePlanItem = Static<typeof UpdatePlanItemSchema>;

export const PlanItemResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  plan_id: UuidSchema,
  org_unit_id: UuidSchema,
  org_unit_name: t.Optional(t.String()),
  position_id: t.Union([UuidSchema, t.Null()]),
  position_title: t.Optional(t.Union([t.String(), t.Null()])),
  job_id: t.Union([UuidSchema, t.Null()]),
  current_headcount: t.Number(),
  planned_headcount: t.Number(),
  variance: t.Number(),
  justification: t.Union([t.String(), t.Null()]),
  priority: HeadcountItemPrioritySchema,
  status: HeadcountItemStatusSchema,
  target_fill_date: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});
export type PlanItemResponse = Static<typeof PlanItemResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const PlanItemParamsSchema = t.Object({
  id: UuidSchema,
  itemId: UuidSchema,
});
export type PlanItemParams = Static<typeof PlanItemParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
