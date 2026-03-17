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

// =============================================================================
// Recruitment Cost Schemas
// =============================================================================

export const RecruitmentCostCategorySchema = t.Union([
  t.Literal("agency_fee"),
  t.Literal("job_board"),
  t.Literal("advertising"),
  t.Literal("relocation"),
  t.Literal("assessment"),
  t.Literal("background_check"),
  t.Literal("travel"),
  t.Literal("signing_bonus"),
  t.Literal("referral_bonus"),
  t.Literal("other"),
]);

export const CreateRecruitmentCostSchema = t.Object({
  requisitionId: UuidSchema,
  category: RecruitmentCostCategorySchema,
  description: t.Optional(t.String({ maxLength: 1000 })),
  amount: t.Number({ minimum: 0.01 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3, default: "GBP" })),
  incurredDate: t.Optional(t.String({ format: "date" })),
  externalReference: t.Optional(t.String({ maxLength: 255 })),
});

export const UpdateRecruitmentCostSchema = t.Partial(
  t.Object({
    category: RecruitmentCostCategorySchema,
    description: t.Union([t.String({ maxLength: 1000 }), t.Null()]),
    amount: t.Number({ minimum: 0.01 }),
    currency: t.String({ minLength: 3, maxLength: 3 }),
    incurredDate: t.String({ format: "date" }),
    externalReference: t.Union([t.String({ maxLength: 255 }), t.Null()]),
  })
);

// =============================================================================
// Recruitment Analytics Schemas
// =============================================================================

export const RecruitmentAnalyticsQuerySchema = t.Object({
  startDate: t.Optional(t.String({ format: "date", description: "Start of date range (default: 90 days ago)" })),
  endDate: t.Optional(t.String({ format: "date", description: "End of date range (default: today)" })),
  orgUnitId: t.Optional(UuidSchema),
  requisitionId: t.Optional(UuidSchema),
});

// --- Time-to-Fill ---

export const TimeToFillItemSchema = t.Object({
  requisition_id: t.String(),
  requisition_code: t.String(),
  requisition_title: t.String(),
  status: t.String(),
  opened_at: t.Union([t.String(), t.Null()]),
  filled_at: t.Union([t.String(), t.Null()]),
  days_to_fill: t.Union([t.Number(), t.Null()]),
});

export const TimeToFillSummarySchema = t.Object({
  items: t.Array(TimeToFillItemSchema),
  average_days_to_fill: t.Number(),
  median_days_to_fill: t.Number(),
  min_days_to_fill: t.Union([t.Number(), t.Null()]),
  max_days_to_fill: t.Union([t.Number(), t.Null()]),
  total_filled: t.Number(),
});

// --- Cost-per-Hire ---

export const CostPerHireSummarySchema = t.Object({
  total_costs: t.Number(),
  total_hires: t.Number(),
  cost_per_hire: t.Number(),
  currency: t.String(),
  costs_by_category: t.Array(
    t.Object({
      category: t.String(),
      total_amount: t.Number(),
      percentage: t.Number(),
    })
  ),
});

// --- Source Effectiveness ---

export const SourceEffectivenessItemSchema = t.Object({
  source: t.String(),
  total_candidates: t.Number(),
  hired_count: t.Number(),
  rejected_count: t.Number(),
  in_pipeline_count: t.Number(),
  conversion_rate: t.Number(),
  avg_days_to_hire: t.Union([t.Number(), t.Null()]),
});

export const SourceEffectivenessSummarySchema = t.Object({
  items: t.Array(SourceEffectivenessItemSchema),
  total_candidates: t.Number(),
  total_hired: t.Number(),
  overall_conversion_rate: t.Number(),
});

// --- Pipeline Conversion ---

export const PipelineConversionStageSchema = t.Object({
  stage: t.String(),
  entered_count: t.Number(),
  progressed_count: t.Number(),
  conversion_rate: t.Number(),
  avg_days_in_stage: t.Union([t.Number(), t.Null()]),
});

export const PipelineConversionSummarySchema = t.Object({
  stages: t.Array(PipelineConversionStageSchema),
  overall_hire_rate: t.Number(),
});

// --- Full Analytics Response ---

export const RecruitmentAnalyticsResponseSchema = t.Object({
  time_to_fill: TimeToFillSummarySchema,
  cost_per_hire: CostPerHireSummarySchema,
  source_effectiveness: SourceEffectivenessSummarySchema,
  pipeline_conversion: PipelineConversionSummarySchema,
  period: t.Object({
    start_date: t.String(),
    end_date: t.String(),
  }),
});
