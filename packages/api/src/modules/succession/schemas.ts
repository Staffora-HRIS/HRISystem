/**
 * Succession Planning Module - TypeBox Schemas
 *
 * Defines validation schemas for succession planning operations.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const ReadinessLevelSchema = t.Union([
  t.Literal("ready_now"),
  t.Literal("ready_1_year"),
  t.Literal("ready_2_years"),
  t.Literal("development_needed"),
  t.Literal("not_ready"),
]);

export const RiskLevelSchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

// =============================================================================
// Request Schemas
// =============================================================================

export const CreateSuccessionPlanSchema = t.Object({
  position_id: t.String({ format: "uuid" }),
  is_critical_role: t.Boolean({ default: false }),
  criticality_reason: t.Optional(t.String({ maxLength: 1000 })),
  risk_level: t.Optional(RiskLevelSchema),
  incumbent_retirement_risk: t.Optional(t.Boolean()),
  incumbent_flight_risk: t.Optional(t.Boolean()),
  market_scarcity: t.Optional(t.Boolean()),
  notes: t.Optional(t.String({ maxLength: 2000 })),
  next_review_date: t.Optional(t.String({ format: "date" })),
});

export const UpdateSuccessionPlanSchema = t.Partial(
  t.Object({
    is_critical_role: t.Boolean(),
    criticality_reason: t.String({ maxLength: 1000 }),
    risk_level: RiskLevelSchema,
    incumbent_retirement_risk: t.Boolean(),
    incumbent_flight_risk: t.Boolean(),
    market_scarcity: t.Boolean(),
    notes: t.String({ maxLength: 2000 }),
    next_review_date: t.Union([t.String({ format: "date" }), t.Null()]),
  })
);

export const CreateCandidateSchema = t.Object({
  plan_id: t.String({ format: "uuid" }),
  employee_id: t.String({ format: "uuid" }),
  readiness: ReadinessLevelSchema,
  ranking: t.Optional(t.Number({ minimum: 1 })),
  assessment_notes: t.Optional(t.String({ maxLength: 2000 })),
  strengths: t.Optional(t.Array(t.String({ maxLength: 200 }))),
  development_areas: t.Optional(t.Array(t.String({ maxLength: 200 }))),
});

export const UpdateCandidateSchema = t.Partial(
  t.Object({
    readiness: ReadinessLevelSchema,
    ranking: t.Number({ minimum: 1 }),
    assessment_notes: t.String({ maxLength: 2000 }),
    strengths: t.Array(t.String({ maxLength: 200 })),
    development_areas: t.Array(t.String({ maxLength: 200 })),
  })
);

export const PlanFiltersSchema = t.Object({
  is_critical: t.Optional(t.Boolean()),
  risk_level: t.Optional(RiskLevelSchema),
  org_unit_id: t.Optional(t.String({ format: "uuid" })),
  has_ready_successor: t.Optional(t.Boolean()),
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Response Schemas
// =============================================================================

export const SuccessionPlanResponseSchema = t.Object({
  id: t.String(),
  tenant_id: t.String(),
  position_id: t.String(),
  position_title: t.String(),
  org_unit_id: t.Optional(t.String()),
  org_unit_name: t.Optional(t.String()),
  incumbent_id: t.Optional(t.String()),
  incumbent_name: t.Optional(t.String()),
  is_critical_role: t.Boolean(),
  criticality_reason: t.Optional(t.String()),
  risk_level: RiskLevelSchema,
  incumbent_retirement_risk: t.Boolean(),
  incumbent_flight_risk: t.Boolean(),
  market_scarcity: t.Boolean(),
  notes: t.Optional(t.String()),
  candidate_count: t.Number(),
  ready_now_count: t.Number(),
  last_reviewed_at: t.Optional(t.String()),
  next_review_date: t.Optional(t.String()),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export const CandidateResponseSchema = t.Object({
  id: t.String(),
  plan_id: t.String(),
  employee_id: t.String(),
  employee_name: t.String(),
  current_position: t.Optional(t.String()),
  current_department: t.Optional(t.String()),
  readiness: ReadinessLevelSchema,
  ranking: t.Number(),
  assessment_notes: t.Optional(t.String()),
  strengths: t.Array(t.String()),
  development_areas: t.Array(t.String()),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export const SuccessionGapResponseSchema = t.Object({
  position_id: t.String(),
  position_title: t.String(),
  org_unit_name: t.Optional(t.String()),
  risk_level: RiskLevelSchema,
  gap_severity: t.Union([
    t.Literal("critical"),
    t.Literal("high"),
    t.Literal("medium"),
    t.Literal("low"),
  ]),
  candidate_count: t.Number(),
  ready_now_count: t.Number(),
});

export const SuccessionPipelineResponseSchema = t.Object({
  position_id: t.String(),
  position_title: t.String(),
  org_unit_name: t.Optional(t.String()),
  is_critical: t.Boolean(),
  risk_level: RiskLevelSchema,
  incumbent_name: t.Optional(t.String()),
  candidate_count: t.Number(),
  ready_now_count: t.Number(),
  ready_1_year_count: t.Number(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type ReadinessLevel = Static<typeof ReadinessLevelSchema>;
export type RiskLevel = Static<typeof RiskLevelSchema>;
export type CreateSuccessionPlan = Static<typeof CreateSuccessionPlanSchema>;
export type UpdateSuccessionPlan = Static<typeof UpdateSuccessionPlanSchema>;
export type CreateCandidate = Static<typeof CreateCandidateSchema>;
export type UpdateCandidate = Static<typeof UpdateCandidateSchema>;
export type PlanFilters = Static<typeof PlanFiltersSchema>;
export type SuccessionPlanResponse = Static<typeof SuccessionPlanResponseSchema>;
export type CandidateResponse = Static<typeof CandidateResponseSchema>;
export type SuccessionGapResponse = Static<typeof SuccessionGapResponseSchema>;
export type SuccessionPipelineResponse = Static<typeof SuccessionPipelineResponseSchema>;
