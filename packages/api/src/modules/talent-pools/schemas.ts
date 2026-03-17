/**
 * Talent Pools Module - TypeBox Schemas
 *
 * Defines validation schemas for talent pool operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const TalentPoolStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("archived"),
]);
export type TalentPoolStatus = Static<typeof TalentPoolStatusSchema>;

export const TalentPoolReadinessSchema = t.Union([
  t.Literal("ready_now"),
  t.Literal("ready_1_year"),
  t.Literal("ready_2_years"),
  t.Literal("development_needed"),
  t.Literal("not_assessed"),
]);
export type TalentPoolReadiness = Static<typeof TalentPoolReadinessSchema>;

// =============================================================================
// Common
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateTalentPoolSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String({ maxLength: 100 })),
  criteria: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type CreateTalentPool = Static<typeof CreateTalentPoolSchema>;

export const UpdateTalentPoolSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ maxLength: 2000 }),
    category: t.String({ maxLength: 100 }),
    status: TalentPoolStatusSchema,
    criteria: t.Record(t.String(), t.Unknown()),
  })
);
export type UpdateTalentPool = Static<typeof UpdateTalentPoolSchema>;

export const AddMemberSchema = t.Object({
  employee_id: t.String({ format: "uuid" }),
  readiness: t.Optional(TalentPoolReadinessSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});
export type AddMember = Static<typeof AddMemberSchema>;

export const UpdateMemberSchema = t.Partial(
  t.Object({
    readiness: TalentPoolReadinessSchema,
    notes: t.String({ maxLength: 2000 }),
  })
);
export type UpdateMember = Static<typeof UpdateMemberSchema>;

export const PoolFiltersSchema = t.Object({
  status: t.Optional(TalentPoolStatusSchema),
  category: t.Optional(t.String()),
  search: t.Optional(t.String()),
});
export type PoolFilters = Static<typeof PoolFiltersSchema>;

export const MemberFiltersSchema = t.Object({
  readiness: t.Optional(TalentPoolReadinessSchema),
});
export type MemberFilters = Static<typeof MemberFiltersSchema>;

// =============================================================================
// Params Schemas
// =============================================================================

export const IdParamsSchema = t.Object({ id: UuidSchema });
export type IdParams = Static<typeof IdParamsSchema>;

export const PoolMemberParamsSchema = t.Object({
  poolId: UuidSchema,
  memberId: UuidSchema,
});
export type PoolMemberParams = Static<typeof PoolMemberParamsSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

export const TalentPoolResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  name: t.String(),
  description: t.Optional(t.Union([t.String(), t.Null()])),
  category: t.Optional(t.Union([t.String(), t.Null()])),
  status: TalentPoolStatusSchema,
  criteria: t.Optional(t.Record(t.String(), t.Unknown())),
  member_count: t.Number(),
  ready_now_count: t.Number(),
  created_by: t.Optional(t.Union([t.String(), t.Null()])),
  created_at: t.String(),
  updated_at: t.String(),
});
export type TalentPoolResponse = Static<typeof TalentPoolResponseSchema>;

export const TalentPoolMemberResponseSchema = t.Object({
  id: t.String(),
  pool_id: t.String(),
  employee_id: t.String(),
  employee_name: t.String(),
  current_position: t.Optional(t.Union([t.String(), t.Null()])),
  current_department: t.Optional(t.Union([t.String(), t.Null()])),
  readiness: TalentPoolReadinessSchema,
  notes: t.Optional(t.Union([t.String(), t.Null()])),
  is_active: t.Boolean(),
  added_by: t.Optional(t.Union([t.String(), t.Null()])),
  created_at: t.String(),
  updated_at: t.String(),
});
export type TalentPoolMemberResponse = Static<typeof TalentPoolMemberResponseSchema>;

// =============================================================================
// Type Exports
// =============================================================================

export type PaginationQuery = Static<typeof PaginationQuerySchema>;
