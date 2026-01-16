/**
 * Competencies Module - TypeBox Schemas
 *
 * Validation schemas for competency management.
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Enums
// =============================================================================

export const CompetencyCategorySchema = Type.Union([
  Type.Literal("technical"),
  Type.Literal("leadership"),
  Type.Literal("core"),
  Type.Literal("functional"),
  Type.Literal("behavioral"),
  Type.Literal("management"),
]);

export type CompetencyCategory = Static<typeof CompetencyCategorySchema>;

// =============================================================================
// Competency Schemas
// =============================================================================

export const CompetencyLevelSchema = Type.Object({
  level: Type.Number({ minimum: 1, maximum: 5 }),
  name: Type.String(),
  description: Type.String(),
});

export const CreateCompetencySchema = Type.Object({
  code: Type.String({ minLength: 1, maxLength: 50 }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  category: CompetencyCategorySchema,
  description: Type.Optional(Type.String()),
  levels: Type.Optional(Type.Array(CompetencyLevelSchema)),
  assessment_criteria: Type.Optional(Type.Array(Type.String())),
  behavioral_indicators: Type.Optional(Type.Array(Type.String())),
});

export type CreateCompetency = Static<typeof CreateCompetencySchema>;

export const UpdateCompetencySchema = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: 100 }),
    category: CompetencyCategorySchema,
    description: Type.String(),
    levels: Type.Array(CompetencyLevelSchema),
    assessment_criteria: Type.Array(Type.String()),
    behavioral_indicators: Type.Array(Type.String()),
    is_active: Type.Boolean(),
  })
);

export type UpdateCompetency = Static<typeof UpdateCompetencySchema>;

// =============================================================================
// Job Competency Schemas
// =============================================================================

export const CreateJobCompetencySchema = Type.Object({
  job_id: Type.String({ format: "uuid" }),
  competency_id: Type.String({ format: "uuid" }),
  required_level: Type.Number({ minimum: 1, maximum: 5 }),
  is_required: Type.Optional(Type.Boolean()),
  weight: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
});

export type CreateJobCompetency = Static<typeof CreateJobCompetencySchema>;

export const UpdateJobCompetencySchema = Type.Partial(
  Type.Object({
    required_level: Type.Number({ minimum: 1, maximum: 5 }),
    is_required: Type.Boolean(),
    weight: Type.Number({ minimum: 1, maximum: 10 }),
  })
);

export type UpdateJobCompetency = Static<typeof UpdateJobCompetencySchema>;

// =============================================================================
// Position Competency Schemas
// =============================================================================

export const CreatePositionCompetencySchema = Type.Object({
  position_id: Type.String({ format: "uuid" }),
  competency_id: Type.String({ format: "uuid" }),
  required_level: Type.Number({ minimum: 1, maximum: 5 }),
  is_required: Type.Optional(Type.Boolean()),
  weight: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
});

export type CreatePositionCompetency = Static<typeof CreatePositionCompetencySchema>;

export const UpdatePositionCompetencySchema = Type.Partial(
  Type.Object({
    required_level: Type.Number({ minimum: 1, maximum: 5 }),
    is_required: Type.Boolean(),
    weight: Type.Number({ minimum: 1, maximum: 10 }),
  })
);

export type UpdatePositionCompetency = Static<typeof UpdatePositionCompetencySchema>;

// =============================================================================
// Employee Competency Schemas
// =============================================================================

export const CreateEmployeeCompetencySchema = Type.Object({
  employee_id: Type.String({ format: "uuid" }),
  competency_id: Type.String({ format: "uuid" }),
  current_level: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
  target_level: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
  self_assessment_level: Type.Optional(Type.Number({ minimum: 1, maximum: 5 })),
  assessment_notes: Type.Optional(Type.String()),
  assessment_source: Type.Optional(Type.String()),
  next_assessment_due: Type.Optional(Type.String({ format: "date" })),
});

export type CreateEmployeeCompetency = Static<typeof CreateEmployeeCompetencySchema>;

export const UpdateEmployeeCompetencySchema = Type.Partial(
  Type.Object({
    current_level: Type.Number({ minimum: 1, maximum: 5 }),
    target_level: Type.Number({ minimum: 1, maximum: 5 }),
    self_assessment_level: Type.Number({ minimum: 1, maximum: 5 }),
    manager_assessment_level: Type.Number({ minimum: 1, maximum: 5 }),
    assessment_notes: Type.String(),
    assessment_source: Type.String(),
    next_assessment_due: Type.String({ format: "date" }),
    evidence: Type.Array(Type.Object({
      type: Type.String(),
      description: Type.String(),
      date: Type.Optional(Type.String({ format: "date" })),
      url: Type.Optional(Type.String()),
    })),
  })
);

export type UpdateEmployeeCompetency = Static<typeof UpdateEmployeeCompetencySchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

export const CompetencyFiltersSchema = Type.Object({
  category: Type.Optional(CompetencyCategorySchema),
  is_active: Type.Optional(Type.Boolean()),
  search: Type.Optional(Type.String()),
});

export type CompetencyFilters = Static<typeof CompetencyFiltersSchema>;

export const EmployeeCompetencyFiltersSchema = Type.Object({
  employee_id: Type.Optional(Type.String({ format: "uuid" })),
  competency_id: Type.Optional(Type.String({ format: "uuid" })),
  has_gap: Type.Optional(Type.Boolean()),
  assessment_due_days: Type.Optional(Type.Number()),
});

export type EmployeeCompetencyFilters = Static<typeof EmployeeCompetencyFiltersSchema>;
