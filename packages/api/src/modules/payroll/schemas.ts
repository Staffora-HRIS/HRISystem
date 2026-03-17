/**
 * Payroll Integration Module - TypeBox Schemas
 *
 * Defines validation schemas for payroll runs, payroll lines,
 * employee tax details, and payroll export endpoints.
 *
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Payroll run status lifecycle
 */
export const PayrollRunStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("calculating"),
  t.Literal("review"),
  t.Literal("approved"),
  t.Literal("submitted"),
  t.Literal("paid"),
]);

export type PayrollRunStatus = Static<typeof PayrollRunStatusSchema>;

/**
 * Valid payroll run status transitions
 */
export const PAYROLL_STATUS_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft: ["calculating"],
  calculating: ["review", "draft"], // can go back to draft on failure
  review: ["approved", "draft"],    // can reject back to draft
  approved: ["submitted", "review"], // can un-approve
  submitted: ["paid"],
  paid: [],
};

/**
 * Payroll run type
 */
export const PayrollRunTypeSchema = t.Union([
  t.Literal("monthly"),
  t.Literal("weekly"),
  t.Literal("supplemental"),
]);

export type PayrollRunType = Static<typeof PayrollRunTypeSchema>;

/**
 * Student loan plan
 */
export const StudentLoanPlanSchema = t.Union([
  t.Literal("none"),
  t.Literal("plan1"),
  t.Literal("plan2"),
  t.Literal("plan4"),
  t.Literal("plan5"),
  t.Literal("postgrad"),
]);

export type StudentLoanPlan = Static<typeof StudentLoanPlanSchema>;

/**
 * Payment method
 */
export const PaymentMethodSchema = t.Union([
  t.Literal("bacs"),
  t.Literal("faster_payments"),
  t.Literal("cheque"),
  t.Literal("cash"),
]);

export type PaymentMethod = Static<typeof PaymentMethodSchema>;

/**
 * NI category letter
 */
export const NiCategorySchema = t.String({
  pattern: "^[ABCFHIJLMSVZ]$",
  minLength: 1,
  maxLength: 1,
  description: "HMRC National Insurance category letter",
});

/**
 * Export format
 */
export const ExportFormatSchema = t.Union([
  t.Literal("csv"),
  t.Literal("json"),
]);

export type ExportFormat = Static<typeof ExportFormatSchema>;

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

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Payroll Run Schemas
// =============================================================================

/**
 * Create payroll run request
 */
export const CreatePayrollRunSchema = t.Object({
  pay_period_start: DateSchema,
  pay_period_end: DateSchema,
  pay_date: DateSchema,
  run_type: t.Optional(PayrollRunTypeSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type CreatePayrollRun = Static<typeof CreatePayrollRunSchema>;

/**
 * Payroll run filters for list endpoint
 */
export const PayrollRunFiltersSchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: t.Optional(PayrollRunStatusSchema),
  run_type: t.Optional(PayrollRunTypeSchema),
});

export type PayrollRunFilters = Static<typeof PayrollRunFiltersSchema>;

/**
 * Payroll line response (per-employee breakdown)
 */
export const PayrollLineResponseSchema = t.Object({
  id: UuidSchema,
  payroll_run_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  basic_pay: t.String(),
  overtime_pay: t.String(),
  bonus_pay: t.String(),
  total_gross: t.String(),
  tax_deduction: t.String(),
  ni_employee: t.String(),
  ni_employer: t.String(),
  pension_employee: t.String(),
  pension_employer: t.String(),
  student_loan: t.String(),
  other_deductions: t.String(),
  total_deductions: t.String(),
  net_pay: t.String(),
  tax_code: t.Union([t.String(), t.Null()]),
  ni_category: t.Union([t.String(), t.Null()]),
  payment_method: PaymentMethodSchema,
});

export type PayrollLineResponse = Static<typeof PayrollLineResponseSchema>;

/**
 * Payroll run response
 */
export const PayrollRunResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  pay_period_start: t.String(),
  pay_period_end: t.String(),
  pay_date: t.String(),
  status: PayrollRunStatusSchema,
  run_type: PayrollRunTypeSchema,
  employee_count: t.Number(),
  total_gross: t.String(),
  total_deductions: t.String(),
  total_net: t.String(),
  total_employer_costs: t.String(),
  approved_by: t.Union([UuidSchema, t.Null()]),
  approved_at: t.Union([t.String(), t.Null()]),
  submitted_at: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PayrollRunResponse = Static<typeof PayrollRunResponseSchema>;

/**
 * Payroll run detail response (run + lines)
 */
export const PayrollRunDetailResponseSchema = t.Object({
  ...PayrollRunResponseSchema.properties,
  lines: t.Array(PayrollLineResponseSchema),
});

export type PayrollRunDetailResponse = Static<typeof PayrollRunDetailResponseSchema>;

// =============================================================================
// Employee Tax Details Schemas
// =============================================================================

/**
 * Create/update employee tax details request
 */
export const UpsertTaxDetailsSchema = t.Object({
  tax_code: t.String({
    minLength: 1,
    maxLength: 10,
    description: "HMRC PAYE tax code (e.g., 1257L, BR, D0, K500L, S1257L)",
  }),
  ni_number: t.Optional(t.Union([
    t.String({
      pattern: "^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$",
      description: "National Insurance number (format: XX123456A)",
    }),
    t.Null(),
  ])),
  ni_category: t.Optional(NiCategorySchema),
  student_loan_plan: t.Optional(StudentLoanPlanSchema),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
});

export type UpsertTaxDetails = Static<typeof UpsertTaxDetailsSchema>;

/**
 * Employee tax details response
 */
export const TaxDetailsResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  tax_code: t.String(),
  ni_number: t.Union([t.String(), t.Null()]),
  ni_category: t.String(),
  student_loan_plan: StudentLoanPlanSchema,
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type TaxDetailsResponse = Static<typeof TaxDetailsResponseSchema>;

// =============================================================================
// Export Schema
// =============================================================================

/**
 * Export request body
 */
export const ExportPayrollSchema = t.Object({
  format: ExportFormatSchema,
});

export type ExportPayroll = Static<typeof ExportPayrollSchema>;

// =============================================================================
// Payslip Params
// =============================================================================

export const PayslipParamsSchema = t.Object({
  id: UuidSchema,
  runId: UuidSchema,
});

export type PayslipParams = Static<typeof PayslipParamsSchema>;

export const EmployeeIdParamsSchema = t.Object({
  id: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// RTI (Real Time Information) Schemas
// =============================================================================

/**
 * RTI submission type
 */
export const RtiSubmissionTypeSchema = t.Union([
  t.Literal("fps"),
  t.Literal("eps"),
  t.Literal("nvr"),
  t.Literal("eas"),
]);

export type RtiSubmissionType = Static<typeof RtiSubmissionTypeSchema>;

/**
 * RTI submission status
 */
export const RtiSubmissionStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("generated"),
  t.Literal("submitted"),
  t.Literal("accepted"),
  t.Literal("rejected"),
  t.Literal("error"),
]);

export type RtiSubmissionStatus = Static<typeof RtiSubmissionStatusSchema>;

/**
 * RunId path parameter schema
 */
export const RunIdParamsSchema = t.Object({
  runId: UuidSchema,
});

export type RunIdParams = Static<typeof RunIdParamsSchema>;

/**
 * RTI query parameters (tax year and optional tax period)
 */
export const RtiFpsQuerySchema = t.Object({
  run_id: UuidSchema,
  tax_year: t.Optional(t.String({
    pattern: "^\\d{4}-\\d{2}$",
    description: "UK tax year in format YYYY-YY (e.g. 2025-26). Defaults to current tax year.",
  })),
  employer_paye_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Employer PAYE reference (e.g. 123/AB12345)",
  })),
  accounts_office_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Accounts Office Reference",
  })),
});

export type RtiFpsQuery = Static<typeof RtiFpsQuerySchema>;

export const RtiEpsQuerySchema = t.Object({
  run_id: t.Optional(UuidSchema),
  tax_year: t.Optional(t.String({
    pattern: "^\\d{4}-\\d{2}$",
    description: "UK tax year in format YYYY-YY (e.g. 2025-26). Defaults to current tax year.",
  })),
  tax_month: t.Optional(t.String({
    pattern: "^([1-9]|1[0-2])$",
    description: "Tax month (1-12)",
  })),
  employer_paye_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Employer PAYE reference (e.g. 123/AB12345)",
  })),
  accounts_office_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Accounts Office Reference",
  })),
});

export type RtiEpsQuery = Static<typeof RtiEpsQuerySchema>;

/**
 * Submit payroll run request body
 */
export const SubmitPayrollRunSchema = t.Object({
  employer_paye_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Employer PAYE reference for HMRC",
  })),
  accounts_office_ref: t.Optional(t.String({
    maxLength: 20,
    description: "Accounts Office Reference for HMRC",
  })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export type SubmitPayrollRun = Static<typeof SubmitPayrollRunSchema>;

// =============================================================================
// FPS (Full Payment Submission) Data Structure
// =============================================================================

/**
 * Per-employee FPS record - matches HMRC FPS data requirements.
 * Contains all data needed for a Full Payment Submission to HMRC.
 */
export const FpsEmployeeRecordSchema = t.Object({
  // Employee identification
  employee_id: UuidSchema,
  employee_number: t.String(),
  first_name: t.String(),
  last_name: t.String(),
  date_of_birth: t.Union([t.String(), t.Null()]),
  gender: t.Union([t.String(), t.Null()]),
  ni_number: t.Union([t.String(), t.Null()]),

  // Tax details
  tax_code: t.Union([t.String(), t.Null()]),
  ni_category: t.Union([t.String(), t.Null()]),

  // Employment dates
  hire_date: t.String(),

  // Pay in this period
  taxable_pay_in_period: t.String(),
  tax_deducted_in_period: t.String(),

  // NI contributions
  ni_contributions: t.Object({
    ni_category: t.Union([t.String(), t.Null()]),
    gross_earnings_for_ni: t.String(),
    employee_ni_contribution: t.String(),
    employer_ni_contribution: t.String(),
    ni_letter: t.Union([t.String(), t.Null()]),
  }),

  // Student loan
  student_loan_plan: t.Union([StudentLoanPlanSchema, t.Null()]),
  student_loan_deduction: t.String(),

  // Pension
  pension_employee_contribution: t.String(),
  pension_employer_contribution: t.String(),

  // Pay breakdown
  basic_pay: t.String(),
  overtime_pay: t.String(),
  bonus_pay: t.String(),
  total_gross_pay: t.String(),
  total_deductions: t.String(),
  net_pay: t.String(),
  payment_method: PaymentMethodSchema,

  // Year to date figures (cumulative)
  taxable_pay_ytd: t.String(),
  tax_deducted_ytd: t.String(),
  employee_ni_ytd: t.String(),
  employer_ni_ytd: t.String(),
  student_loan_ytd: t.String(),
});

export type FpsEmployeeRecord = Static<typeof FpsEmployeeRecordSchema>;

/**
 * Full FPS data structure response
 */
export const FpsDataResponseSchema = t.Object({
  // Submission metadata
  submission_type: t.Literal("fps"),
  tax_year: t.String(),
  tax_month: t.Union([t.Number(), t.Null()]),

  // Employer info
  employer_paye_ref: t.Union([t.String(), t.Null()]),
  accounts_office_ref: t.Union([t.String(), t.Null()]),

  // Pay run reference
  payroll_run_id: UuidSchema,
  pay_period_start: t.String(),
  pay_period_end: t.String(),
  pay_date: t.String(),

  // Employee records
  employee_count: t.Number(),
  employees: t.Array(FpsEmployeeRecordSchema),

  // Totals
  totals: t.Object({
    total_taxable_pay: t.String(),
    total_tax_deducted: t.String(),
    total_employee_ni: t.String(),
    total_employer_ni: t.String(),
    total_student_loan_deductions: t.String(),
    total_pension_employee: t.String(),
    total_pension_employer: t.String(),
    total_gross_pay: t.String(),
    total_net_pay: t.String(),
  }),

  // Generation metadata
  generated_at: t.String(),
});

export type FpsDataResponse = Static<typeof FpsDataResponseSchema>;

// =============================================================================
// EPS (Employer Payment Summary) Data Structure
// =============================================================================

/**
 * EPS data structure response - summarises employer-level adjustments
 * to the amounts due to HMRC for a tax period.
 */
export const EpsDataResponseSchema = t.Object({
  // Submission metadata
  submission_type: t.Literal("eps"),
  tax_year: t.String(),
  tax_month: t.Union([t.Number(), t.Null()]),

  // Employer info
  employer_paye_ref: t.Union([t.String(), t.Null()]),
  accounts_office_ref: t.Union([t.String(), t.Null()]),

  // Period summary - from the payroll run (if linked)
  payroll_run_id: t.Union([UuidSchema, t.Null()]),
  pay_period_start: t.Union([t.String(), t.Null()]),
  pay_period_end: t.Union([t.String(), t.Null()]),

  // Recoverable amounts (amounts the employer can offset against PAYE liability)
  recoverable_amounts: t.Object({
    smp_recovered: t.String(),
    spp_recovered: t.String(),
    sap_recovered: t.String(),
    shpp_recovered: t.String(),
    spbp_recovered: t.String(),
    nic_compensation_on_smp: t.String(),
    nic_compensation_on_spp: t.String(),
    nic_compensation_on_sap: t.String(),
    nic_compensation_on_shpp: t.String(),
    nic_compensation_on_spbp: t.String(),
    cis_deductions_suffered: t.String(),
  }),

  // Apprenticeship levy
  apprenticeship_levy: t.Object({
    levy_due_ytd: t.String(),
    annual_allowance: t.String(),
  }),

  // Employment allowance
  employment_allowance: t.Object({
    claimed: t.Boolean(),
    amount_ytd: t.String(),
  }),

  // Flags
  no_payment_dates: t.Object({
    from: t.Union([t.String(), t.Null()]),
    to: t.Union([t.String(), t.Null()]),
  }),
  period_of_inactivity: t.Object({
    from: t.Union([t.String(), t.Null()]),
    to: t.Union([t.String(), t.Null()]),
  }),
  final_submission_for_year: t.Boolean(),

  // Generation metadata
  generated_at: t.String(),
});

export type EpsDataResponse = Static<typeof EpsDataResponseSchema>;

// =============================================================================
// RTI Submission Record Response
// =============================================================================

/**
 * RTI submission record response
 */
export const RtiSubmissionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  payroll_run_id: UuidSchema,
  submission_type: RtiSubmissionTypeSchema,
  status: RtiSubmissionStatusSchema,
  tax_year: t.String(),
  tax_month: t.Union([t.Number(), t.Null()]),
  tax_week: t.Union([t.Number(), t.Null()]),
  employer_paye_ref: t.Union([t.String(), t.Null()]),
  accounts_office_ref: t.Union([t.String(), t.Null()]),
  generated_at: t.Union([t.String(), t.Null()]),
  submitted_at: t.Union([t.String(), t.Null()]),
  response_at: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type RtiSubmissionResponse = Static<typeof RtiSubmissionResponseSchema>;

/**
 * Payroll run export data response (for GET /runs/:runId/export)
 */
export const PayrollRunExportResponseSchema = t.Object({
  payroll_run: PayrollRunResponseSchema,
  lines: t.Array(PayrollLineResponseSchema),
  exported_at: t.String(),
});

export type PayrollRunExportResponse = Static<typeof PayrollRunExportResponseSchema>;

// =============================================================================
// Payroll Period Lock Schemas
// =============================================================================

/**
 * Lock a payroll period request body
 */
export const LockPayrollPeriodSchema = t.Object({
  period_start: DateSchema,
  period_end: DateSchema,
});

export type LockPayrollPeriod = Static<typeof LockPayrollPeriodSchema>;

/**
 * Unlock a payroll period request body (reason is mandatory for audit)
 */
export const UnlockPayrollPeriodSchema = t.Object({
  unlock_reason: t.String({
    minLength: 1,
    maxLength: 2000,
    description: "Mandatory reason for unlocking the payroll period",
  }),
});

export type UnlockPayrollPeriod = Static<typeof UnlockPayrollPeriodSchema>;

/**
 * Payroll period lock status query parameters
 */
export const PeriodLockStatusQuerySchema = t.Object({
  period_start: t.Optional(DateSchema),
  period_end: t.Optional(DateSchema),
  active_only: t.Optional(t.String({ pattern: "^(true|false)$" })),
});

export type PeriodLockStatusQuery = Static<typeof PeriodLockStatusQuerySchema>;

/**
 * Payroll period lock response
 */
export const PeriodLockResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  period_start: t.String(),
  period_end: t.String(),
  locked_at: t.String(),
  locked_by: UuidSchema,
  unlock_reason: t.Union([t.String(), t.Null()]),
  unlocked_at: t.Union([t.String(), t.Null()]),
  unlocked_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  is_locked: t.Boolean(),
});

export type PeriodLockResponse = Static<typeof PeriodLockResponseSchema>;

// =============================================================================
// Payroll Journal Entry Schemas (TODO-233)
// =============================================================================

/**
 * Journal entry response schema
 */
export const JournalEntryResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  payroll_run_id: UuidSchema,
  entry_date: t.String(),
  account_code: t.String(),
  description: t.String(),
  debit: t.String(),
  credit: t.String(),
  cost_centre_id: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
});

export type JournalEntryResponse = Static<typeof JournalEntryResponseSchema>;

/**
 * Generate journal entries request body.
 * Optional cost_centre_id to assign all generated entries to a cost centre.
 */
export const GenerateJournalEntriesSchema = t.Object({
  cost_centre_id: t.Optional(t.Union([UuidSchema, t.Null()])),
});

export type GenerateJournalEntries = Static<typeof GenerateJournalEntriesSchema>;

/**
 * Journal entries query parameters for listing by period
 */
export const JournalEntriesQuerySchema = t.Object({
  payroll_run_id: t.Optional(UuidSchema),
  period_start: t.Optional(DateSchema),
  period_end: t.Optional(DateSchema),
  account_code: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
  cost_centre_id: t.Optional(UuidSchema),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 50 })),
});

export type JournalEntriesQuery = Static<typeof JournalEntriesQuerySchema>;

/**
 * Journal entries list response with balance summary
 */
export const JournalEntriesListResponseSchema = t.Object({
  items: t.Array(JournalEntryResponseSchema),
  summary: t.Object({
    total_debits: t.String(),
    total_credits: t.String(),
    is_balanced: t.Boolean(),
  }),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});
