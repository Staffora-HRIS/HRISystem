/* eslint-disable no-redeclare */
/**
 * Benefits Module - TypeBox Schemas
 *
 * Defines request/response schemas for Benefits Administration.
 */

import { Type, type Static } from "@sinclair/typebox";

// =============================================================================
// Enums
// =============================================================================

export const BenefitCategory = Type.Union([
  Type.Literal("health"),
  Type.Literal("dental"),
  Type.Literal("vision"),
  Type.Literal("life"),
  Type.Literal("disability"),
  Type.Literal("retirement"),
  Type.Literal("childcare_vouchers"),
  Type.Literal("cycle_to_work"),
  Type.Literal("wellness"),
  Type.Literal("commuter"),
  Type.Literal("education"),
  Type.Literal("childcare"),
  Type.Literal("legal"),
  Type.Literal("other"),
]);

export type BenefitCategory = Static<typeof BenefitCategory>;

export const ContributionType = Type.Union([
  Type.Literal("employee_only"),
  Type.Literal("employer_only"),
  Type.Literal("shared"),
  Type.Literal("voluntary"),
]);

export type ContributionType = Static<typeof ContributionType>;

export const CoverageLevel = Type.Union([
  Type.Literal("employee_only"),
  Type.Literal("employee_spouse"),
  Type.Literal("employee_children"),
  Type.Literal("family"),
]);

export type CoverageLevel = Static<typeof CoverageLevel>;

export const EnrollmentStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("active"),
  Type.Literal("waived"),
  Type.Literal("terminated"),
  Type.Literal("cancelled"),
]);

export type EnrollmentStatus = Static<typeof EnrollmentStatus>;

export const LifeEventType = Type.Union([
  Type.Literal("marriage"),
  Type.Literal("divorce"),
  Type.Literal("birth"),
  Type.Literal("adoption"),
  Type.Literal("death_of_dependent"),
  Type.Literal("loss_of_coverage"),
  Type.Literal("gain_of_coverage"),
  Type.Literal("employment_change"),
  Type.Literal("address_change"),
  Type.Literal("legal_separation"),
  Type.Literal("pension_commencement"),
  Type.Literal("other"),
]);

export type LifeEventType = Static<typeof LifeEventType>;

export const LifeEventStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
  Type.Literal("expired"),
]);

export type LifeEventStatus = Static<typeof LifeEventStatus>;

// =============================================================================
// Carrier Schemas
// =============================================================================

export const CreateCarrier = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  code: Type.Optional(Type.String({ maxLength: 50 })),
  contact_email: Type.Optional(Type.String({ format: "email" })),
  contact_phone: Type.Optional(Type.String({ maxLength: 50 })),
  website: Type.Optional(Type.String({ maxLength: 500 })),
  address: Type.Optional(Type.Object({
    street: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    state: Type.Optional(Type.String()),
    postal_code: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
  })),
  notes: Type.Optional(Type.String()),
});

export type CreateCarrier = Static<typeof CreateCarrier>;

export const UpdateCarrier = Type.Partial(CreateCarrier);
export type UpdateCarrier = Static<typeof UpdateCarrier>;

export const CarrierResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  name: Type.String(),
  code: Type.Union([Type.String(), Type.Null()]),
  contact_email: Type.Union([Type.String(), Type.Null()]),
  contact_phone: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  address: Type.Any(),
  notes: Type.Union([Type.String(), Type.Null()]),
  is_active: Type.Boolean(),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type CarrierResponse = Static<typeof CarrierResponse>;

// =============================================================================
// Plan Schemas
// =============================================================================

export const PlanCost = Type.Object({
  coverage_level: CoverageLevel,
  employee_cost: Type.Number({ minimum: 0 }),
  employer_cost: Type.Number({ minimum: 0 }),
});

export type PlanCost = Static<typeof PlanCost>;

export const CreatePlan = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  plan_code: Type.Optional(Type.String({ maxLength: 50 })),
  category: BenefitCategory,
  carrier_id: Type.Optional(Type.String({ format: "uuid" })),
  description: Type.Optional(Type.String()),
  contribution_type: ContributionType,
  effective_from: Type.String({ format: "date" }),
  effective_to: Type.Optional(Type.String({ format: "date" })),
  waiting_period_days: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  costs: Type.Optional(Type.Array(PlanCost)),
  deductible_individual: Type.Optional(Type.Number({ minimum: 0 })),
  deductible_family: Type.Optional(Type.Number({ minimum: 0 })),
  out_of_pocket_max_individual: Type.Optional(Type.Number({ minimum: 0 })),
  out_of_pocket_max_family: Type.Optional(Type.Number({ minimum: 0 })),
  eligibility_rules: Type.Optional(Type.Object({})),
  coverage_details: Type.Optional(Type.Object({})),
});

export type CreatePlan = Static<typeof CreatePlan>;

export const UpdatePlan = Type.Partial(CreatePlan);
export type UpdatePlan = Static<typeof UpdatePlan>;

export const PlanResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  tenant_id: Type.String({ format: "uuid" }),
  name: Type.String(),
  plan_code: Type.Union([Type.String(), Type.Null()]),
  category: BenefitCategory,
  carrier_id: Type.Union([Type.String(), Type.Null()]),
  carrier_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  description: Type.Union([Type.String(), Type.Null()]),
  contribution_type: ContributionType,
  effective_from: Type.String(),
  effective_to: Type.Union([Type.String(), Type.Null()]),
  waiting_period_days: Type.Integer(),
  is_active: Type.Boolean(),
  costs: Type.Optional(Type.Array(Type.Object({
    coverage_level: CoverageLevel,
    employee_cost: Type.Number(),
    employer_cost: Type.Number(),
    total_cost: Type.Number(),
  }))),
  created_at: Type.String(),
  updated_at: Type.String(),
});

export type PlanResponse = Static<typeof PlanResponse>;

export const PlanFilters = Type.Object({
  category: Type.Optional(BenefitCategory),
  is_active: Type.Optional(Type.Boolean()),
  search: Type.Optional(Type.String()),
});

export type PlanFilters = Static<typeof PlanFilters>;

// =============================================================================
// Dependent Schemas
// =============================================================================

export const CreateDependent = Type.Object({
  first_name: Type.String({ minLength: 1, maxLength: 100 }),
  middle_name: Type.Optional(Type.String({ maxLength: 100 })),
  last_name: Type.String({ minLength: 1, maxLength: 100 }),
  relationship: Type.Union([
    Type.Literal("spouse"),
    Type.Literal("child"),
    Type.Literal("domestic_partner"),
    Type.Literal("stepchild"),
    Type.Literal("foster_child"),
    Type.Literal("legal_ward"),
  ]),
  date_of_birth: Type.String({ format: "date" }),
  gender: Type.Optional(Type.Union([
    Type.Literal("male"),
    Type.Literal("female"),
    Type.Literal("other"),
    Type.Literal("prefer_not_to_say"),
  ])),
  id_last_four: Type.Optional(Type.String({ minLength: 4, maxLength: 4 })),
  disabled: Type.Optional(Type.Boolean()),
  full_time_student: Type.Optional(Type.Boolean()),
});

export type CreateDependent = Static<typeof CreateDependent>;

export const UpdateDependent = Type.Partial(CreateDependent);
export type UpdateDependent = Static<typeof UpdateDependent>;

export const DependentResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  first_name: Type.String(),
  middle_name: Type.Union([Type.String(), Type.Null()]),
  last_name: Type.String(),
  full_name: Type.String(),
  relationship: Type.String(),
  date_of_birth: Type.String(),
  age: Type.Integer(),
  gender: Type.Union([Type.String(), Type.Null()]),
  disabled: Type.Boolean(),
  full_time_student: Type.Boolean(),
  is_active: Type.Boolean(),
  created_at: Type.String(),
});

export type DependentResponse = Static<typeof DependentResponse>;

// =============================================================================
// Enrollment Schemas
// =============================================================================

export const CreateEnrollment = Type.Object({
  employee_id: Type.String({ format: "uuid" }),
  plan_id: Type.String({ format: "uuid" }),
  coverage_level: CoverageLevel,
  effective_from: Type.String({ format: "date" }),
  covered_dependents: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
  enrollment_type: Type.Optional(Type.Union([
    Type.Literal("new_hire"),
    Type.Literal("open_enrollment"),
    Type.Literal("life_event"),
  ])),
  life_event_id: Type.Optional(Type.String({ format: "uuid" })),
});

export type CreateEnrollment = Static<typeof CreateEnrollment>;

export const UpdateEnrollment = Type.Object({
  coverage_level: Type.Optional(CoverageLevel),
  covered_dependents: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
  effective_to: Type.Optional(Type.String({ format: "date" })),
});

export type UpdateEnrollment = Static<typeof UpdateEnrollment>;

export const WaiveEnrollment = Type.Object({
  plan_id: Type.String({ format: "uuid" }),
  waiver_reason: Type.String({ minLength: 1 }),
  waiver_other_coverage: Type.Optional(Type.String()),
});

export type WaiveEnrollment = Static<typeof WaiveEnrollment>;

export const EnrollmentResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  plan_id: Type.String({ format: "uuid" }),
  plan_name: Type.String(),
  plan_category: BenefitCategory,
  coverage_level: CoverageLevel,
  status: EnrollmentStatus,
  effective_from: Type.String(),
  effective_to: Type.Union([Type.String(), Type.Null()]),
  employee_contribution: Type.Number(),
  employer_contribution: Type.Number(),
  total_contribution: Type.Number(),
  covered_dependents: Type.Array(Type.Object({
    id: Type.String(),
    name: Type.String(),
    relationship: Type.String(),
  })),
  enrollment_type: Type.String(),
  created_at: Type.String(),
});

export type EnrollmentResponse = Static<typeof EnrollmentResponse>;

export const EnrollmentFilters = Type.Object({
  employee_id: Type.Optional(Type.String({ format: "uuid" })),
  plan_id: Type.Optional(Type.String({ format: "uuid" })),
  status: Type.Optional(EnrollmentStatus),
  category: Type.Optional(BenefitCategory),
});

export type EnrollmentFilters = Static<typeof EnrollmentFilters>;

// =============================================================================
// Life Event Schemas
// =============================================================================

export const CreateLifeEvent = Type.Object({
  event_type: LifeEventType,
  event_date: Type.String({ format: "date" }),
  description: Type.Optional(Type.String()),
  documentation: Type.Optional(Type.Array(Type.Object({
    document_id: Type.String({ format: "uuid" }),
    document_name: Type.String(),
  }))),
});

export type CreateLifeEvent = Static<typeof CreateLifeEvent>;

export const ReviewLifeEvent = Type.Object({
  status: Type.Union([Type.Literal("approved"), Type.Literal("rejected")]),
  rejection_reason: Type.Optional(Type.String()),
});

export type ReviewLifeEvent = Static<typeof ReviewLifeEvent>;

export const LifeEventResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  employee_id: Type.String({ format: "uuid" }),
  employee_name: Type.Optional(Type.String()),
  event_type: LifeEventType,
  event_date: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  enrollment_window_start: Type.String(),
  enrollment_window_end: Type.String(),
  days_remaining: Type.Integer(),
  status: LifeEventStatus,
  documentation: Type.Any(),
  reviewed_by: Type.Union([Type.String(), Type.Null()]),
  reviewed_at: Type.Union([Type.String(), Type.Null()]),
  created_at: Type.String(),
});

export type LifeEventResponse = Static<typeof LifeEventResponse>;

// =============================================================================
// Open Enrollment Schemas
// =============================================================================

export const CreateOpenEnrollment = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String()),
  start_date: Type.String({ format: "date" }),
  end_date: Type.String({ format: "date" }),
  coverage_effective_date: Type.String({ format: "date" }),
  plan_year_start: Type.String({ format: "date" }),
  plan_year_end: Type.String({ format: "date" }),
  eligible_plan_ids: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
});

export type CreateOpenEnrollment = Static<typeof CreateOpenEnrollment>;

export const OpenEnrollmentResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  description: Type.Union([Type.String(), Type.Null()]),
  start_date: Type.String(),
  end_date: Type.String(),
  coverage_effective_date: Type.String(),
  plan_year_start: Type.String(),
  plan_year_end: Type.String(),
  is_active: Type.Boolean(),
  days_remaining: Type.Optional(Type.Integer()),
  completion_rate: Type.Optional(Type.Number()),
  created_at: Type.String(),
});

export type OpenEnrollmentResponse = Static<typeof OpenEnrollmentResponse>;

export const ElectionChoice = Type.Object({
  plan_id: Type.String({ format: "uuid" }),
  action: Type.Union([
    Type.Literal("enroll"),
    Type.Literal("waive"),
    Type.Literal("continue"),
  ]),
  coverage_level: Type.Optional(CoverageLevel),
  dependents: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
});

export type ElectionChoice = Static<typeof ElectionChoice>;

export const SubmitElections = Type.Object({
  elections: Type.Array(ElectionChoice),
  acknowledgements: Type.Object({
    tobacco_use: Type.Boolean(),
    terms_accepted: Type.Boolean(),
    gdpr_health_data_acknowledged: Type.Boolean(),
  }),
  employee_notes: Type.Optional(Type.String()),
});

export type SubmitElections = Static<typeof SubmitElections>;

// =============================================================================
// Cost Summary
// =============================================================================

export const BenefitCostSummary = Type.Object({
  category: BenefitCategory,
  employee_total: Type.Number(),
  employer_total: Type.Number(),
  grand_total: Type.Number(),
});

export type BenefitCostSummary = Static<typeof BenefitCostSummary>;

// =============================================================================
// Pagination
// =============================================================================

export const PaginationQuery = Type.Object({
  limit: Type.Optional(Type.String({ pattern: "^[0-9]+$" })),
  cursor: Type.Optional(Type.String()),
});

export type PaginationQuery = Static<typeof PaginationQuery>;
