/**
 * Pension Auto-Enrolment Module - TypeBox Schemas
 *
 * Defines validation schemas for UK workplace pension auto-enrolment
 * API endpoints (Pensions Act 2008).
 *
 * All monetary values are in pence (integer) to avoid floating-point issues.
 * Qualifying earnings band defaults: £6,240 - £50,270 (2024/25).
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Pension scheme type matching app.pension_scheme_type
 */
export const PensionSchemeTypeSchema = t.Union([
  t.Literal("defined_contribution"),
  t.Literal("master_trust"),
]);
export type PensionSchemeType = Static<typeof PensionSchemeTypeSchema>;

/**
 * Pension scheme status matching app.pension_scheme_status
 */
export const PensionSchemeStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("closed"),
  t.Literal("suspended"),
]);
export type PensionSchemeStatus = Static<typeof PensionSchemeStatusSchema>;

/**
 * Pension enrolment status matching app.pension_enrolment_status
 */
export const PensionEnrolmentStatusSchema = t.Union([
  t.Literal("eligible"),
  t.Literal("enrolled"),
  t.Literal("opted_out"),
  t.Literal("ceased"),
  t.Literal("re_enrolled"),
  t.Literal("postponed"),
]);
export type PensionEnrolmentStatus = Static<typeof PensionEnrolmentStatusSchema>;

/**
 * Worker category for auto-enrolment assessment
 */
export const PensionWorkerCategorySchema = t.Union([
  t.Literal("eligible_jobholder"),
  t.Literal("non_eligible_jobholder"),
  t.Literal("entitled_worker"),
  t.Literal("not_applicable"),
]);
export type PensionWorkerCategory = Static<typeof PensionWorkerCategorySchema>;

/**
 * Contribution processing status matching app.pension_contribution_status
 */
export const PensionContributionStatusSchema = t.Union([
  t.Literal("calculated"),
  t.Literal("submitted"),
  t.Literal("confirmed"),
]);
export type PensionContributionStatus = Static<typeof PensionContributionStatusSchema>;

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

export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});
export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Pension Scheme Schemas
// =============================================================================

/**
 * Create pension scheme request
 */
export const CreatePensionSchemeSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  provider: t.String({ minLength: 1, maxLength: 255 }),
  scheme_type: PensionSchemeTypeSchema,
  employer_contribution_pct: t.Number({ minimum: 3.0, description: "Minimum 3% statutory" }),
  employee_contribution_pct: t.Number({ minimum: 0, description: "Employee contribution %" }),
  qualifying_earnings_lower: t.Optional(
    t.Integer({ minimum: 0, description: "Lower limit in pence (default: 624000 = £6,240)" })
  ),
  qualifying_earnings_upper: t.Optional(
    t.Integer({ minimum: 1, description: "Upper limit in pence (default: 5027000 = £50,270)" })
  ),
  is_default: t.Optional(t.Boolean()),
});
export type CreatePensionScheme = Static<typeof CreatePensionSchemeSchema>;

/**
 * Update pension scheme request
 */
export const UpdatePensionSchemeSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 255 }),
    provider: t.String({ minLength: 1, maxLength: 255 }),
    scheme_type: PensionSchemeTypeSchema,
    employer_contribution_pct: t.Number({ minimum: 3.0 }),
    employee_contribution_pct: t.Number({ minimum: 0 }),
    qualifying_earnings_lower: t.Integer({ minimum: 0 }),
    qualifying_earnings_upper: t.Integer({ minimum: 1 }),
    is_default: t.Boolean(),
    status: PensionSchemeStatusSchema,
  })
);
export type UpdatePensionScheme = Static<typeof UpdatePensionSchemeSchema>;

/**
 * Pension scheme response
 */
export const PensionSchemeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  name: t.String(),
  provider: t.String(),
  scheme_type: PensionSchemeTypeSchema,
  employer_contribution_pct: t.Number(),
  employee_contribution_pct: t.Number(),
  qualifying_earnings_lower: t.Integer(),
  qualifying_earnings_upper: t.Integer(),
  is_default: t.Boolean(),
  status: PensionSchemeStatusSchema,
  created_at: t.String(),
  updated_at: t.String(),
});
export type PensionSchemeResponse = Static<typeof PensionSchemeResponseSchema>;

// =============================================================================
// Eligibility Assessment Schemas
// =============================================================================

/**
 * Eligibility assessment response
 */
export const EligibilityAssessmentResponseSchema = t.Object({
  employee_id: UuidSchema,
  worker_category: PensionWorkerCategorySchema,
  is_eligible_for_auto_enrolment: t.Boolean(),
  can_opt_in: t.Boolean(),
  can_request_membership: t.Boolean(),
  assessed_age: t.Integer(),
  assessed_annual_earnings: t.Integer({ description: "Annualised earnings in pence" }),
  qualifying_earnings_lower: t.Integer(),
  qualifying_earnings_upper: t.Integer(),
  assessment_date: t.String(),
});
export type EligibilityAssessmentResponse = Static<typeof EligibilityAssessmentResponseSchema>;

// =============================================================================
// Pension Enrolment Schemas
// =============================================================================

/**
 * Pension enrolment response
 */
export const PensionEnrolmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  scheme_id: UuidSchema,
  worker_category: PensionWorkerCategorySchema,
  status: PensionEnrolmentStatusSchema,
  enrolment_date: t.Union([t.String(), t.Null()]),
  opt_out_deadline: t.Union([t.String(), t.Null()]),
  opted_out_at: t.Union([t.String(), t.Null()]),
  opt_out_reason: t.Union([t.String(), t.Null()]),
  re_enrolment_date: t.Union([t.String(), t.Null()]),
  postponement_end_date: t.Union([t.String(), t.Null()]),
  contributions_start_date: t.Union([t.String(), t.Null()]),
  assessed_annual_earnings: t.Union([t.Integer(), t.Null()]),
  assessed_age: t.Union([t.Integer(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
  // Joined fields (optional)
  employee_name: t.Optional(t.String()),
  scheme_name: t.Optional(t.String()),
});
export type PensionEnrolmentResponse = Static<typeof PensionEnrolmentResponseSchema>;

/**
 * Opt-out request body
 */
export const OptOutRequestSchema = t.Object({
  reason: t.Optional(t.String({ maxLength: 2000 })),
});
export type OptOutRequest = Static<typeof OptOutRequestSchema>;

/**
 * Postpone request body
 */
export const PostponeRequestSchema = t.Object({
  end_date: DateSchema,
});
export type PostponeRequest = Static<typeof PostponeRequestSchema>;

/**
 * Enrolment list query filters
 */
export const EnrolmentFiltersSchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(PensionEnrolmentStatusSchema),
  employee_id: t.Optional(UuidSchema),
});
export type EnrolmentFilters = Static<typeof EnrolmentFiltersSchema>;

// =============================================================================
// Pension Contribution Schemas
// =============================================================================

/**
 * Calculate contributions request
 */
export const CalculateContributionsRequestSchema = t.Object({
  enrolment_id: UuidSchema,
  gross_pay: t.Integer({ minimum: 0, description: "Gross pay for the period in pence" }),
  pay_period_start: DateSchema,
  pay_period_end: DateSchema,
});
export type CalculateContributionsRequest = Static<typeof CalculateContributionsRequestSchema>;

/**
 * Pension contribution response
 */
export const PensionContributionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  enrolment_id: UuidSchema,
  employee_id: UuidSchema,
  pay_period_start: t.String(),
  pay_period_end: t.String(),
  qualifying_earnings: t.Integer(),
  employer_amount: t.Integer(),
  employee_amount: t.Integer(),
  total_amount: t.Integer(),
  status: PensionContributionStatusSchema,
  created_at: t.String(),
  updated_at: t.String(),
});
export type PensionContributionResponse = Static<typeof PensionContributionResponseSchema>;

// =============================================================================
// Re-enrolment Schemas
// =============================================================================

/**
 * Re-enrolment result response
 */
export const ReEnrolmentResultSchema = t.Object({
  re_enrolled_count: t.Integer(),
  skipped_count: t.Integer(),
  enrolments: t.Array(PensionEnrolmentResponseSchema),
});
export type ReEnrolmentResult = Static<typeof ReEnrolmentResultSchema>;

// =============================================================================
// Compliance Summary Schemas
// =============================================================================

/**
 * Compliance summary response
 */
export const ComplianceSummaryResponseSchema = t.Object({
  total_employees: t.Integer(),
  eligible_count: t.Integer(),
  enrolled_count: t.Integer(),
  opted_out_count: t.Integer(),
  postponed_count: t.Integer(),
  ceased_count: t.Integer(),
  re_enrolled_count: t.Integer(),
  pending_re_enrolment_count: t.Integer(),
  total_employer_contributions: t.Integer({ description: "Total employer contributions in pence" }),
  total_employee_contributions: t.Integer({ description: "Total employee contributions in pence" }),
  schemes_count: t.Integer(),
  compliance_rate: t.Number({ description: "Percentage of eligible workers enrolled" }),
});
export type ComplianceSummaryResponse = Static<typeof ComplianceSummaryResponseSchema>;
