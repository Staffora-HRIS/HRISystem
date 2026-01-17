/**
 * Recruitment Module Schemas
 *
 * TypeBox schemas for recruitment API validation
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
// Requisition Schemas
// =============================================================================

export const RequisitionStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("open"),
  t.Literal("on_hold"),
  t.Literal("filled"),
  t.Literal("cancelled"),
]);

export const EmploymentTypeSchema = t.Union([
  t.Literal("full_time"),
  t.Literal("part_time"),
  t.Literal("contract"),
  t.Literal("temporary"),
]);

export const CreateRequisitionSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  positionId: t.Optional(UuidSchema),
  orgUnitId: t.Optional(UuidSchema),
  hiringManagerId: t.Optional(UuidSchema),
  employmentType: t.Optional(EmploymentTypeSchema),
  openings: t.Optional(t.Number({ minimum: 1, default: 1 })),
  priority: t.Optional(t.Number({ minimum: 1, maximum: 5, default: 3 })),
  jobDescription: t.Optional(t.String()),
  requirements: t.Optional(t.Object({
    experienceYears: t.Optional(t.Number()),
    education: t.Optional(t.String()),
    skills: t.Optional(t.Array(t.String())),
    certifications: t.Optional(t.Array(t.String())),
    niceToHave: t.Optional(t.Array(t.String())),
  })),
  targetStartDate: t.Optional(t.String({ format: "date" })),
  deadline: t.Optional(t.String({ format: "date" })),
  location: t.Optional(t.String()),
});

export const UpdateRequisitionSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 255 }),
    positionId: t.Union([UuidSchema, t.Null()]),
    orgUnitId: t.Union([UuidSchema, t.Null()]),
    hiringManagerId: t.Union([UuidSchema, t.Null()]),
    employmentType: EmploymentTypeSchema,
    openings: t.Number({ minimum: 1 }),
    priority: t.Number({ minimum: 1, maximum: 5 }),
    jobDescription: t.Union([t.String(), t.Null()]),
    requirements: t.Union([
      t.Object({
        experienceYears: t.Optional(t.Number()),
        education: t.Optional(t.String()),
        skills: t.Optional(t.Array(t.String())),
        certifications: t.Optional(t.Array(t.String())),
        niceToHave: t.Optional(t.Array(t.String())),
      }),
      t.Null(),
    ]),
    targetStartDate: t.Union([t.String({ format: "date" }), t.Null()]),
    deadline: t.Union([t.String({ format: "date" }), t.Null()]),
    location: t.Union([t.String(), t.Null()]),
    status: RequisitionStatusSchema,
  })
);

export const RequisitionFiltersSchema = t.Object({
  status: t.Optional(RequisitionStatusSchema),
  hiringManagerId: t.Optional(UuidSchema),
  orgUnitId: t.Optional(UuidSchema),
  search: t.Optional(t.String()),
});

// =============================================================================
// Candidate Schemas
// =============================================================================

export const CandidateStageSchema = t.Union([
  t.Literal("applied"),
  t.Literal("screening"),
  t.Literal("interview"),
  t.Literal("offer"),
  t.Literal("hired"),
  t.Literal("rejected"),
  t.Literal("withdrawn"),
]);

export const CandidateSourceSchema = t.Union([
  t.Literal("direct"),
  t.Literal("referral"),
  t.Literal("job_board"),
  t.Literal("agency"),
  t.Literal("linkedin"),
  t.Literal("internal"),
  t.Literal("career_site"),
  t.Literal("other"),
]);

export const CreateCandidateSchema = t.Object({
  requisitionId: UuidSchema,
  email: t.String({ format: "email" }),
  firstName: t.String({ minLength: 1, maxLength: 100 }),
  lastName: t.String({ minLength: 1, maxLength: 100 }),
  phone: t.Optional(t.String({ maxLength: 50 })),
  source: t.Optional(CandidateSourceSchema),
  resumeUrl: t.Optional(t.String()),
  linkedinUrl: t.Optional(t.String()),
  rating: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  notes: t.Optional(t.Object({
    referrerId: t.Optional(UuidSchema),
    referrerName: t.Optional(t.String()),
    agencyName: t.Optional(t.String()),
    agencyContact: t.Optional(t.String()),
    coverLetter: t.Optional(t.String()),
    tags: t.Optional(t.Array(t.String())),
  })),
});

export const UpdateCandidateSchema = t.Partial(
  t.Object({
    email: t.String({ format: "email" }),
    firstName: t.String({ minLength: 1, maxLength: 100 }),
    lastName: t.String({ minLength: 1, maxLength: 100 }),
    phone: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    source: CandidateSourceSchema,
    resumeUrl: t.Union([t.String(), t.Null()]),
    linkedinUrl: t.Union([t.String(), t.Null()]),
    rating: t.Union([t.Number({ minimum: 1, maximum: 5 }), t.Null()]),
    currentStage: CandidateStageSchema,
    notes: t.Union([
      t.Object({
        referrerId: t.Optional(UuidSchema),
        referrerName: t.Optional(t.String()),
        agencyName: t.Optional(t.String()),
        agencyContact: t.Optional(t.String()),
        coverLetter: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
      t.Null(),
    ]),
  })
);

export const AdvanceCandidateSchema = t.Object({
  newStage: CandidateStageSchema,
  reason: t.Optional(t.String()),
});

export const CandidateFiltersSchema = t.Object({
  requisitionId: t.Optional(UuidSchema),
  stage: t.Optional(CandidateStageSchema),
  source: t.Optional(CandidateSourceSchema),
  search: t.Optional(t.String()),
});
