/**
 * Health & Safety Module - TypeBox Schemas
 *
 * Defines validation schemas for all Health & Safety API endpoints.
 * Covers UK statutory requirements:
 * - Accident book / incident recording
 * - RIDDOR (Reporting of Injuries, Diseases and Dangerous Occurrences)
 * - Risk assessments
 * - DSE (Display Screen Equipment) assessments
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Incident severity levels
 */
export const IncidentSeveritySchema = t.Union([
  t.Literal("minor"),
  t.Literal("moderate"),
  t.Literal("major"),
  t.Literal("fatal"),
]);

export type IncidentSeverity = Static<typeof IncidentSeveritySchema>;

/**
 * Incident status workflow: reported -> investigating -> resolved -> closed
 */
export const IncidentStatusSchema = t.Union([
  t.Literal("reported"),
  t.Literal("investigating"),
  t.Literal("resolved"),
  t.Literal("closed"),
]);

export type IncidentStatus = Static<typeof IncidentStatusSchema>;

/**
 * Risk assessment status workflow: draft -> active -> review_due -> archived
 */
export const RiskAssessmentStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("review_due"),
  t.Literal("archived"),
]);

export type RiskAssessmentStatus = Static<typeof RiskAssessmentStatusSchema>;

/**
 * Overall risk level
 */
export const RiskLevelSchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

export type RiskLevel = Static<typeof RiskLevelSchema>;

/**
 * DSE assessment status
 */
export const DSEStatusSchema = t.Union([
  t.Literal("completed"),
  t.Literal("actions_pending"),
  t.Literal("review_due"),
]);

export type DSEStatus = Static<typeof DSEStatusSchema>;

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

export const DateTimeSchema = t.String({
  format: "date-time",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

// =============================================================================
// Hazard Schema (for risk assessment hazard matrix)
// =============================================================================

export const HazardEntrySchema = t.Object({
  hazard: t.String({ minLength: 1, maxLength: 500 }),
  who_at_risk: t.String({ minLength: 1, maxLength: 500 }),
  existing_controls: t.String({ maxLength: 2000 }),
  risk_level: RiskLevelSchema,
  additional_controls: t.Optional(t.String({ maxLength: 2000 })),
});

export type HazardEntry = Static<typeof HazardEntrySchema>;

// =============================================================================
// Incident Schemas
// =============================================================================

/**
 * Create incident (report an accident/near-miss)
 */
export const CreateIncidentSchema = t.Object({
  reported_by_employee_id: t.Optional(UuidSchema),
  injured_employee_id: t.Optional(UuidSchema),
  incident_date: DateTimeSchema,
  location: t.Optional(t.String({ maxLength: 255 })),
  description: t.String({ minLength: 1, maxLength: 10000 }),
  severity: IncidentSeveritySchema,
  injury_type: t.Optional(t.String({ maxLength: 100 })),
  body_part_affected: t.Optional(t.String({ maxLength: 100 })),
  treatment_given: t.Optional(t.String({ maxLength: 5000 })),
  witness_names: t.Optional(t.Array(t.String({ maxLength: 200 }))),
  riddor_reportable: t.Optional(t.Boolean()),
});

export type CreateIncident = Static<typeof CreateIncidentSchema>;

/**
 * Update incident (investigation, corrective actions, RIDDOR details)
 */
export const UpdateIncidentSchema = t.Partial(
  t.Object({
    location: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    description: t.String({ minLength: 1, maxLength: 10000 }),
    severity: IncidentSeveritySchema,
    injury_type: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    body_part_affected: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    treatment_given: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    witness_names: t.Array(t.String({ maxLength: 200 })),
    status: IncidentStatusSchema,
    investigation_findings: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    corrective_actions: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    riddor_reportable: t.Boolean(),
    riddor_reference: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    riddor_reported_date: t.Union([DateSchema, t.Null()]),
  })
);

export type UpdateIncident = Static<typeof UpdateIncidentSchema>;

/**
 * Incident filters for list endpoint
 */
export const IncidentFiltersSchema = t.Object({
  status: t.Optional(IncidentStatusSchema),
  severity: t.Optional(IncidentSeveritySchema),
  riddor_reportable: t.Optional(t.Boolean()),
  injured_employee_id: t.Optional(UuidSchema),
  date_from: t.Optional(DateSchema),
  date_to: t.Optional(DateSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type IncidentFilters = Static<typeof IncidentFiltersSchema>;

/**
 * Incident response
 */
export const IncidentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  reported_by_employee_id: t.Union([UuidSchema, t.Null()]),
  injured_employee_id: t.Union([UuidSchema, t.Null()]),
  incident_date: t.String(),
  reported_date: t.String(),
  location: t.Union([t.String(), t.Null()]),
  description: t.String(),
  severity: IncidentSeveritySchema,
  injury_type: t.Union([t.String(), t.Null()]),
  body_part_affected: t.Union([t.String(), t.Null()]),
  treatment_given: t.Union([t.String(), t.Null()]),
  witness_names: t.Union([t.Array(t.String()), t.Null()]),
  status: IncidentStatusSchema,
  investigation_findings: t.Union([t.String(), t.Null()]),
  corrective_actions: t.Union([t.String(), t.Null()]),
  riddor_reportable: t.Boolean(),
  riddor_reference: t.Union([t.String(), t.Null()]),
  riddor_reported_date: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type IncidentResponse = Static<typeof IncidentResponseSchema>;

// =============================================================================
// Risk Assessment Schemas
// =============================================================================

/**
 * Create risk assessment
 */
export const CreateRiskAssessmentSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  area_or_activity: t.Optional(t.String({ maxLength: 255 })),
  assessor_employee_id: t.Optional(UuidSchema),
  assessment_date: DateSchema,
  review_date: DateSchema,
  hazards: t.Optional(t.Array(HazardEntrySchema)),
  overall_risk_level: t.Optional(RiskLevelSchema),
});

export type CreateRiskAssessment = Static<typeof CreateRiskAssessmentSchema>;

/**
 * Update risk assessment
 */
export const UpdateRiskAssessmentSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    area_or_activity: t.Union([t.String({ maxLength: 255 }), t.Null()]),
    assessor_employee_id: t.Union([UuidSchema, t.Null()]),
    assessment_date: DateSchema,
    review_date: DateSchema,
    status: RiskAssessmentStatusSchema,
    hazards: t.Array(HazardEntrySchema),
    overall_risk_level: RiskLevelSchema,
  })
);

export type UpdateRiskAssessment = Static<typeof UpdateRiskAssessmentSchema>;

/**
 * Risk assessment filters for list endpoint
 */
export const RiskAssessmentFiltersSchema = t.Object({
  status: t.Optional(RiskAssessmentStatusSchema),
  overall_risk_level: t.Optional(RiskLevelSchema),
  assessor_employee_id: t.Optional(UuidSchema),
  overdue: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type RiskAssessmentFilters = Static<typeof RiskAssessmentFiltersSchema>;

/**
 * Risk assessment response
 */
export const RiskAssessmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  area_or_activity: t.Union([t.String(), t.Null()]),
  assessor_employee_id: t.Union([UuidSchema, t.Null()]),
  assessment_date: t.String(),
  review_date: t.String(),
  status: RiskAssessmentStatusSchema,
  hazards: t.Any(),
  overall_risk_level: RiskLevelSchema,
  approved_by: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type RiskAssessmentResponse = Static<typeof RiskAssessmentResponseSchema>;

// =============================================================================
// DSE Assessment Schemas
// =============================================================================

/**
 * Create DSE assessment
 */
export const CreateDSEAssessmentSchema = t.Object({
  employee_id: UuidSchema,
  assessment_date: DateSchema,
  next_review_date: t.Optional(DateSchema),
  assessor_employee_id: t.Optional(UuidSchema),
  workstation_adequate: t.Optional(t.Boolean()),
  chair_adjustable: t.Optional(t.Boolean()),
  screen_position_ok: t.Optional(t.Boolean()),
  lighting_adequate: t.Optional(t.Boolean()),
  breaks_taken: t.Optional(t.Boolean()),
  eye_test_offered: t.Optional(t.Boolean()),
  issues_found: t.Optional(t.String({ maxLength: 5000 })),
  actions_required: t.Optional(t.String({ maxLength: 5000 })),
  status: t.Optional(DSEStatusSchema),
});

export type CreateDSEAssessment = Static<typeof CreateDSEAssessmentSchema>;

/**
 * Update DSE assessment
 */
export const UpdateDSEAssessmentSchema = t.Partial(
  t.Object({
    next_review_date: t.Union([DateSchema, t.Null()]),
    assessor_employee_id: t.Union([UuidSchema, t.Null()]),
    workstation_adequate: t.Boolean(),
    chair_adjustable: t.Boolean(),
    screen_position_ok: t.Boolean(),
    lighting_adequate: t.Boolean(),
    breaks_taken: t.Boolean(),
    eye_test_offered: t.Boolean(),
    issues_found: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    actions_required: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    status: DSEStatusSchema,
  })
);

export type UpdateDSEAssessment = Static<typeof UpdateDSEAssessmentSchema>;

/**
 * DSE assessment filters
 */
export const DSEAssessmentFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(DSEStatusSchema),
  overdue: t.Optional(t.Boolean()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type DSEAssessmentFilters = Static<typeof DSEAssessmentFiltersSchema>;

/**
 * DSE assessment response
 */
export const DSEAssessmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  assessment_date: t.String(),
  next_review_date: t.Union([t.String(), t.Null()]),
  assessor_employee_id: t.Union([UuidSchema, t.Null()]),
  workstation_adequate: t.Union([t.Boolean(), t.Null()]),
  chair_adjustable: t.Union([t.Boolean(), t.Null()]),
  screen_position_ok: t.Union([t.Boolean(), t.Null()]),
  lighting_adequate: t.Union([t.Boolean(), t.Null()]),
  breaks_taken: t.Union([t.Boolean(), t.Null()]),
  eye_test_offered: t.Union([t.Boolean(), t.Null()]),
  issues_found: t.Union([t.String(), t.Null()]),
  actions_required: t.Union([t.String(), t.Null()]),
  status: DSEStatusSchema,
  created_at: t.String(),
  updated_at: t.String(),
});

export type DSEAssessmentResponse = Static<typeof DSEAssessmentResponseSchema>;

// =============================================================================
// Dashboard Schema
// =============================================================================

export const DashboardResponseSchema = t.Object({
  open_incidents: t.Number(),
  investigating_incidents: t.Number(),
  riddor_reportable_total: t.Number(),
  riddor_unreported: t.Number(),
  active_risk_assessments: t.Number(),
  overdue_risk_reviews: t.Number(),
  high_critical_risks: t.Number(),
  dse_actions_pending: t.Number(),
  dse_reviews_due: t.Number(),
});

export type DashboardResponse = Static<typeof DashboardResponseSchema>;
