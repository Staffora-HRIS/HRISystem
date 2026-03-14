/**
 * Contract Statements Module - TypeBox Schemas
 *
 * Defines validation schemas for UK Written Statement of Employment Particulars.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Covers all 12 legally required particulars since 6 April 2020:
 *  1. Employer's name
 *  2. Employee's name, start date, job title
 *  3. Place of work
 *  4. Pay rate and intervals
 *  5. Hours of work
 *  6. Holiday entitlement
 *  7. Sick pay and procedures
 *  8. Notice periods
 *  9. Pension arrangements
 * 10. Probationary period
 * 11. Training requirements
 * 12. Disciplinary/grievance procedures
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Statement type: section_1 = day-one particulars, section_2 = wider details
 */
export const StatementTypeSchema = t.Union([
  t.Literal("section_1"),
  t.Literal("section_2"),
]);

export type StatementType = Static<typeof StatementTypeSchema>;

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * UUID schema
 */
export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

/**
 * Date string schema (YYYY-MM-DD)
 */
export const DateSchema = t.String({
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
});

/**
 * Cursor pagination schema
 */
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});

export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Section 1 Content Schema (UK Employment Rights Act 1996 s.1)
// =============================================================================

/**
 * The structured content of a Section 1 written statement.
 * Contains all mandatory particulars required by UK law since 6 April 2020.
 */
export const StatementContentSchema = t.Object({
  // --------------------------------------------------------------------------
  // 1. Employer particulars
  // --------------------------------------------------------------------------
  employer_name: t.String(),
  employer_address: t.Optional(t.Union([t.String(), t.Null()])),

  // --------------------------------------------------------------------------
  // 2. Employee particulars and dates
  // --------------------------------------------------------------------------
  employee_name: t.String(),
  employee_address: t.Optional(t.Union([t.String(), t.Null()])),

  // --------------------------------------------------------------------------
  // Job details
  // --------------------------------------------------------------------------
  job_title: t.String(),
  job_description: t.Optional(t.Union([t.String(), t.Null()])),

  // --------------------------------------------------------------------------
  // Dates
  // --------------------------------------------------------------------------
  start_date: t.String(),
  continuous_employment_date: t.Optional(t.Union([t.String(), t.Null()])),

  // --------------------------------------------------------------------------
  // 4. Pay rate and intervals
  // --------------------------------------------------------------------------
  pay: t.Object({
    base_salary: t.Number(),
    currency: t.String(),
    pay_frequency: t.String(),
    annual_equivalent: t.Optional(t.Number()),
  }),

  // --------------------------------------------------------------------------
  // 5. Hours of work
  // --------------------------------------------------------------------------
  hours: t.Object({
    hours_per_week: t.Union([t.Number(), t.Null()]),
    fte: t.Number(),
    employment_type: t.String(),
  }),

  // --------------------------------------------------------------------------
  // 6. Holiday entitlement
  // --------------------------------------------------------------------------
  holiday_entitlement: t.Optional(
    t.Union([
      t.Object({
        days_per_year: t.Number(),
        includes_bank_holidays: t.Optional(t.Boolean()),
      }),
      t.Null(),
    ])
  ),

  // --------------------------------------------------------------------------
  // 3. Place of work / location
  // --------------------------------------------------------------------------
  location: t.Object({
    org_unit_name: t.String(),
    org_unit_code: t.String(),
  }),

  // --------------------------------------------------------------------------
  // 8. Notice periods
  // --------------------------------------------------------------------------
  notice_periods: t.Object({
    employer_notice_days: t.Union([t.Number(), t.Null()]),
    employee_notice_days: t.Union([t.Number(), t.Null()]),
  }),

  // Contract type
  contract_type: t.String(),

  // --------------------------------------------------------------------------
  // 10. Probationary period (required since April 2020)
  // --------------------------------------------------------------------------
  probation: t.Optional(
    t.Union([
      t.Object({
        end_date: t.Union([t.String(), t.Null()]),
        duration_months: t.Optional(t.Union([t.Number(), t.Null()])),
        conditions: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      t.Null(),
    ])
  ),

  // --------------------------------------------------------------------------
  // 9. Pension arrangements
  // --------------------------------------------------------------------------
  pension: t.Optional(
    t.Union([
      t.Object({
        scheme_name: t.Optional(t.Union([t.String(), t.Null()])),
        enrolled: t.Optional(t.Boolean()),
        auto_enrolment_date: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      t.Null(),
    ])
  ),

  // --------------------------------------------------------------------------
  // 7. Sick pay and procedures (required since April 2020)
  // --------------------------------------------------------------------------
  sick_pay: t.Optional(
    t.Union([
      t.Object({
        /** Whether employer offers company sick pay beyond SSP */
        company_sick_pay: t.Optional(t.Boolean()),
        /** SSP qualifying days (usually 3 waiting days) */
        ssp_qualifying_days: t.Optional(t.Union([t.Number(), t.Null()])),
        /** Reference to full sick pay policy document/location */
        policy_reference: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      t.Null(),
    ])
  ),

  // --------------------------------------------------------------------------
  // 11. Training requirements (required since April 2020)
  // --------------------------------------------------------------------------
  training_requirements: t.Optional(
    t.Union([
      t.Object({
        /** Whether mandatory training is required */
        mandatory_training_required: t.Optional(t.Boolean()),
        /** Description of training the employee must complete */
        description: t.Optional(t.Union([t.String(), t.Null()])),
        /** Whether the employer pays for mandatory training */
        employer_funded: t.Optional(t.Boolean()),
      }),
      t.Null(),
    ])
  ),

  // Collective agreements
  collective_agreements: t.Optional(t.Union([t.String(), t.Null()])),

  // --------------------------------------------------------------------------
  // 12. Disciplinary and grievance procedures
  // --------------------------------------------------------------------------
  disciplinary_procedure: t.Optional(t.Union([t.String(), t.Null()])),
  grievance_procedure: t.Optional(t.Union([t.String(), t.Null()])),
});

export type StatementContent = Static<typeof StatementContentSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Generate statement request body (employee ID comes from URL params)
 */
export const GenerateStatementBodySchema = t.Object({
  contract_id: t.Optional(UuidSchema),
  statement_type: t.Optional(StatementTypeSchema),
  template_id: t.Optional(UuidSchema),
});

export type GenerateStatementBody = Static<typeof GenerateStatementBodySchema>;

/**
 * Legacy generate statement request (kept for backward compat)
 */
export const GenerateStatementSchema = t.Object({
  employee_id: UuidSchema,
  contract_id: UuidSchema,
  statement_type: t.Optional(StatementTypeSchema),
  template_id: t.Optional(UuidSchema),
});

export type GenerateStatement = Static<typeof GenerateStatementSchema>;

/**
 * Issue statement request (marks as formally issued)
 */
export const IssueStatementSchema = t.Object({
  issued_at: t.Optional(t.String({ format: "date-time" })),
});

export type IssueStatement = Static<typeof IssueStatementSchema>;

/**
 * Acknowledge statement request
 */
export const AcknowledgeStatementSchema = t.Object({
  acknowledged_at: t.Optional(t.String({ format: "date-time" })),
});

export type AcknowledgeStatement = Static<typeof AcknowledgeStatementSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Contract statement response
 */
export const ContractStatementResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  contract_id: UuidSchema,
  statement_type: StatementTypeSchema,
  generated_at: t.String(),
  generated_by: UuidSchema,
  template_id: t.Union([UuidSchema, t.Null()]),
  content: StatementContentSchema,
  pdf_file_key: t.Union([t.String(), t.Null()]),
  issued_at: t.Union([t.String(), t.Null()]),
  acknowledged_at: t.Union([t.String(), t.Null()]),
  acknowledged_by_employee: t.Boolean(),
  version: t.Number(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type ContractStatementResponse = Static<
  typeof ContractStatementResponseSchema
>;

/**
 * Statement list item (summary)
 */
export const StatementListItemSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  contract_id: UuidSchema,
  statement_type: StatementTypeSchema,
  generated_at: t.String(),
  issued_at: t.Union([t.String(), t.Null()]),
  acknowledged_at: t.Union([t.String(), t.Null()]),
  acknowledged_by_employee: t.Boolean(),
  employee_name: t.Optional(t.String()),
});

export type StatementListItem = Static<typeof StatementListItemSchema>;

/**
 * Statement list response
 */
export const StatementListResponseSchema = t.Object({
  items: t.Array(StatementListItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export type StatementListResponse = Static<typeof StatementListResponseSchema>;

// =============================================================================
// Compliance Schemas
// =============================================================================

/**
 * Individual employee compliance status
 */
export const ComplianceEmployeeItemSchema = t.Object({
  employee_id: UuidSchema,
  employee_number: t.String(),
  employee_name: t.String(),
  hire_date: t.String(),
  status: t.String(),
  has_day_one_statement: t.Boolean(),
  statement_issued_at: t.Union([t.String(), t.Null()]),
  statement_acknowledged: t.Boolean(),
  days_since_start: t.Number(),
  is_overdue: t.Boolean(),
});

export type ComplianceEmployeeItem = Static<
  typeof ComplianceEmployeeItemSchema
>;

/**
 * Compliance status summary response
 */
export const ComplianceStatusResponseSchema = t.Object({
  total_active_employees: t.Number(),
  employees_with_statement: t.Number(),
  employees_without_statement: t.Number(),
  employees_with_acknowledged_statement: t.Number(),
  compliance_percentage: t.Number(),
  overdue_employees: t.Array(ComplianceEmployeeItemSchema),
});

export type ComplianceStatusResponse = Static<
  typeof ComplianceStatusResponseSchema
>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing statements by employee
 */
export const StatementFiltersSchema = t.Object({
  statement_type: t.Optional(StatementTypeSchema),
  issued: t.Optional(t.Boolean()),
  acknowledged: t.Optional(t.Boolean()),
});

export type StatementFilters = Static<typeof StatementFiltersSchema>;

/**
 * Filters for tenant-wide statement listing
 */
export const AllStatementsFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  statement_type: t.Optional(StatementTypeSchema),
  issued: t.Optional(t.Boolean()),
  acknowledged: t.Optional(t.Boolean()),
});

export type AllStatementsFilters = Static<typeof AllStatementsFiltersSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

/**
 * ID parameter
 */
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export type IdParams = Static<typeof IdParamsSchema>;

/**
 * Employee ID parameter (for generate endpoint)
 */
export const EmployeeIdParamsSchema = t.Object({
  employeeId: UuidSchema,
});

export type EmployeeIdParams = Static<typeof EmployeeIdParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<
  typeof OptionalIdempotencyHeaderSchema
>;
