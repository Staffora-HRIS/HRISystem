/**
 * Income Protection Module - TypeBox Schemas
 *
 * Defines validation schemas for income protection policy and enrollment
 * API endpoints. Supports UK group income protection insurance management.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

export const PolicyStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("suspended"),
  t.Literal("terminated"),
]);

export type PolicyStatus = Static<typeof PolicyStatusSchema>;

export const EnrollmentStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("on_claim"),
  t.Literal("suspended"),
  t.Literal("terminated"),
  t.Literal("cancelled"),
]);

export type EnrollmentStatus = Static<typeof EnrollmentStatusSchema>;

export const BenefitBasisSchema = t.Union([
  t.Literal("percentage_of_salary"),
  t.Literal("fixed_amount"),
  t.Literal("tiered"),
]);

export type BenefitBasis = Static<typeof BenefitBasisSchema>;

export const DeferredPeriodSchema = t.Union([
  t.Literal("4_weeks"),
  t.Literal("8_weeks"),
  t.Literal("13_weeks"),
  t.Literal("26_weeks"),
  t.Literal("52_weeks"),
]);

export type DeferredPeriod = Static<typeof DeferredPeriodSchema>;

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

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

export const PolicyIdParamsSchema = t.Object({
  policyId: UuidSchema,
});

export type PolicyIdParams = Static<typeof PolicyIdParamsSchema>;

export const EnrollmentIdParamsSchema = t.Object({
  enrollmentId: UuidSchema,
});

export type EnrollmentIdParams = Static<typeof EnrollmentIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Policy Schemas
// =============================================================================

export const CreatePolicySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  policy_number: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  provider_name: t.String({ minLength: 1, maxLength: 255 }),
  provider_contact_email: t.Optional(t.Union([t.String({ format: "email" }), t.Null()])),
  provider_contact_phone: t.Optional(t.Union([t.String({ maxLength: 50 }), t.Null()])),
  benefit_basis: BenefitBasisSchema,
  benefit_percentage: t.Optional(t.Union([t.Number({ minimum: 0.01, maximum: 100 }), t.Null()])),
  benefit_fixed_amount: t.Optional(t.Union([t.Number({ minimum: 0.01 }), t.Null()])),
  benefit_cap: t.Optional(t.Union([t.Number({ minimum: 0.01 }), t.Null()])),
  deferred_period: DeferredPeriodSchema,
  max_benefit_age: t.Optional(t.Integer({ minimum: 50, maximum: 75, default: 65 })),
  employer_contribution_pct: t.Optional(t.Number({ minimum: 0, maximum: 100, default: 100 })),
  employee_contribution_pct: t.Optional(t.Number({ minimum: 0, maximum: 100, default: 0 })),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  eligibility_rules: t.Optional(t.Object({})),
  notes: t.Optional(t.Union([t.String(), t.Null()])),
});

export type CreatePolicy = Static<typeof CreatePolicySchema>;

export const UpdatePolicySchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    policy_number: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    provider_name: t.String({ minLength: 1, maxLength: 255 }),
    provider_contact_email: t.Union([t.String({ format: "email" }), t.Null()]),
    provider_contact_phone: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    status: PolicyStatusSchema,
    benefit_basis: BenefitBasisSchema,
    benefit_percentage: t.Union([t.Number({ minimum: 0.01, maximum: 100 }), t.Null()]),
    benefit_fixed_amount: t.Union([t.Number({ minimum: 0.01 }), t.Null()]),
    benefit_cap: t.Union([t.Number({ minimum: 0.01 }), t.Null()]),
    deferred_period: DeferredPeriodSchema,
    max_benefit_age: t.Integer({ minimum: 50, maximum: 75 }),
    employer_contribution_pct: t.Number({ minimum: 0, maximum: 100 }),
    employee_contribution_pct: t.Number({ minimum: 0, maximum: 100 }),
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    eligibility_rules: t.Object({}),
    notes: t.Union([t.String(), t.Null()]),
  })
);

export type UpdatePolicy = Static<typeof UpdatePolicySchema>;

export const PolicyResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  policy_number: t.Union([t.String(), t.Null()]),
  provider_name: t.String(),
  provider_contact_email: t.Union([t.String(), t.Null()]),
  provider_contact_phone: t.Union([t.String(), t.Null()]),
  status: t.String(),
  benefit_basis: t.String(),
  benefit_percentage: t.Union([t.Number(), t.Null()]),
  benefit_fixed_amount: t.Union([t.Number(), t.Null()]),
  benefit_cap: t.Union([t.Number(), t.Null()]),
  deferred_period: t.String(),
  max_benefit_age: t.Integer(),
  employer_contribution_pct: t.Number(),
  employee_contribution_pct: t.Number(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  eligibility_rules: t.Any(),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PolicyResponse = Static<typeof PolicyResponseSchema>;

export const PolicyFiltersSchema = t.Object({
  status: t.Optional(PolicyStatusSchema),
  search: t.Optional(t.String()),
});

export type PolicyFilters = Static<typeof PolicyFiltersSchema>;

// =============================================================================
// Enrollment Schemas
// =============================================================================

export const CreateEnrollmentSchema = t.Object({
  policy_id: UuidSchema,
  employee_id: UuidSchema,
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  annual_salary_at_enrollment: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
  employee_premium_monthly: t.Optional(t.Number({ minimum: 0, default: 0 })),
  employer_premium_monthly: t.Optional(t.Number({ minimum: 0, default: 0 })),
  notes: t.Optional(t.Union([t.String(), t.Null()])),
});

export type CreateEnrollment = Static<typeof CreateEnrollmentSchema>;

export const UpdateEnrollmentSchema = t.Partial(
  t.Object({
    status: EnrollmentStatusSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
    annual_salary_at_enrollment: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    annual_benefit_amount: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    employee_premium_monthly: t.Number({ minimum: 0 }),
    employer_premium_monthly: t.Number({ minimum: 0 }),
    claim_start_date: t.Union([DateSchema, t.Null()]),
    claim_end_date: t.Union([DateSchema, t.Null()]),
    claim_reason: t.Union([t.String(), t.Null()]),
    notes: t.Union([t.String(), t.Null()]),
  })
);

export type UpdateEnrollment = Static<typeof UpdateEnrollmentSchema>;

export const EnrollmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  policy_id: UuidSchema,
  employee_id: UuidSchema,
  status: t.String(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  annual_salary_at_enrollment: t.Union([t.Number(), t.Null()]),
  annual_benefit_amount: t.Union([t.Number(), t.Null()]),
  employee_premium_monthly: t.Number(),
  employer_premium_monthly: t.Number(),
  claim_start_date: t.Union([t.String(), t.Null()]),
  claim_end_date: t.Union([t.String(), t.Null()]),
  claim_reason: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Joined fields
  policy_name: t.Optional(t.String()),
  provider_name: t.Optional(t.String()),
});

export type EnrollmentResponse = Static<typeof EnrollmentResponseSchema>;

export const EnrollmentFiltersSchema = t.Object({
  policy_id: t.Optional(UuidSchema),
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(EnrollmentStatusSchema),
});

export type EnrollmentFilters = Static<typeof EnrollmentFiltersSchema>;
