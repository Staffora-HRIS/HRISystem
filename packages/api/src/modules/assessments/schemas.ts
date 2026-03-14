/**
 * Assessments Module Schemas
 *
 * TypeBox schemas for assessment API validation
 */

import { t } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  description: "UUID identifier",
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

// =============================================================================
// Assessment Template Schemas
// =============================================================================

export const AssessmentTypeSchema = t.Union([
  t.Literal("skills_test"),
  t.Literal("psychometric"),
  t.Literal("technical"),
  t.Literal("situational"),
  t.Literal("presentation"),
]);

export const CandidateAssessmentStatusSchema = t.Union([
  t.Literal("scheduled"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export const CreateAssessmentTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  type: AssessmentTypeSchema,
  description: t.Optional(t.String()),
  questions: t.Optional(t.Array(t.Object({
    id: t.Optional(t.String()),
    text: t.String(),
    type: t.Optional(t.String()),
    options: t.Optional(t.Array(t.String())),
    points: t.Optional(t.Number()),
  }))),
  scoringCriteria: t.Optional(t.Record(t.String(), t.Any())),
  timeLimitMinutes: t.Optional(t.Number({ minimum: 1 })),
  passMark: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
});

export const UpdateAssessmentTemplateSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    type: AssessmentTypeSchema,
    description: t.Union([t.String(), t.Null()]),
    questions: t.Array(t.Object({
      id: t.Optional(t.String()),
      text: t.String(),
      type: t.Optional(t.String()),
      options: t.Optional(t.Array(t.String())),
      points: t.Optional(t.Number()),
    })),
    scoringCriteria: t.Union([t.Record(t.String(), t.Any()), t.Null()]),
    timeLimitMinutes: t.Union([t.Number({ minimum: 1 }), t.Null()]),
    passMark: t.Union([t.Number({ minimum: 0, maximum: 100 }), t.Null()]),
    active: t.Boolean(),
  })
);

export const AssessmentTemplateFiltersSchema = t.Object({
  type: t.Optional(AssessmentTypeSchema),
  active: t.Optional(t.String()),
  search: t.Optional(t.String()),
});

// =============================================================================
// Candidate Assessment Schemas
// =============================================================================

export const ScheduleCandidateAssessmentSchema = t.Object({
  candidateId: UuidSchema,
  templateId: UuidSchema,
  scheduledAt: t.Optional(t.String()),
});

export const RecordAssessmentResultSchema = t.Object({
  score: t.Number({ minimum: 0 }),
  passed: t.Boolean(),
  feedback: t.Optional(t.String()),
  answers: t.Optional(t.Record(t.String(), t.Any())),
});

export const CandidateAssessmentFiltersSchema = t.Object({
  candidateId: t.Optional(UuidSchema),
  templateId: t.Optional(UuidSchema),
  status: t.Optional(CandidateAssessmentStatusSchema),
  search: t.Optional(t.String()),
});
