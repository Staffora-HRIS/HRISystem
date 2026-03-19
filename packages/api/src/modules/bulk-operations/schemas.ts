/**
 * Bulk Operations Module - TypeBox Schemas
 *
 * Defines validation schemas for all Bulk Operations API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Bulk operations accept arrays of individual operations and return
 * per-item success/failure results. Maximum batch size is 100 items
 * to prevent overly large transactions.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of items allowed in a single bulk request */
export const MAX_BULK_BATCH_SIZE = 100;

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

// =============================================================================
// Employee Enums (matching HR module)
// =============================================================================

const ContractTypeSchema = t.Union([
  t.Literal("permanent"),
  t.Literal("fixed_term"),
  t.Literal("contractor"),
  t.Literal("intern"),
  t.Literal("temporary"),
]);

const EmploymentTypeSchema = t.Union([
  t.Literal("full_time"),
  t.Literal("part_time"),
]);

const GenderSchema = t.Union([
  t.Literal("male"),
  t.Literal("female"),
  t.Literal("other"),
  t.Literal("prefer_not_to_say"),
]);

const MaritalStatusSchema = t.Union([
  t.Literal("single"),
  t.Literal("married"),
  t.Literal("divorced"),
  t.Literal("widowed"),
  t.Literal("domestic_partnership"),
]);

const PayFrequencySchema = t.Union([
  t.Literal("monthly"),
  t.Literal("bi_weekly"),
  t.Literal("weekly"),
  t.Literal("semi_monthly"),
  t.Literal("annual"),
]);

// =============================================================================
// Bulk Item Result Schema (shared across all bulk endpoints)
// =============================================================================

/**
 * Result for a single item in a bulk operation.
 * Either success is true with data, or success is false with error.
 */
export const BulkItemResultSchema = t.Object({
  index: t.Number({ description: "Zero-based index of the item in the request array" }),
  success: t.Boolean(),
  id: t.Optional(t.String({ description: "ID of the created/updated resource" })),
  data: t.Optional(t.Unknown({ description: "Response data on success" })),
  error: t.Optional(
    t.Object({
      code: t.String(),
      message: t.String(),
      details: t.Optional(t.Record(t.String(), t.Unknown())),
    })
  ),
});

export type BulkItemResult = Static<typeof BulkItemResultSchema>;

/**
 * Aggregate response for a bulk operation.
 */
export const BulkResponseSchema = t.Object({
  total: t.Number({ description: "Total number of items processed" }),
  succeeded: t.Number({ description: "Number of items that succeeded" }),
  failed: t.Number({ description: "Number of items that failed" }),
  results: t.Array(BulkItemResultSchema),
});

export type BulkResponse = Static<typeof BulkResponseSchema>;

// =============================================================================
// Bulk Create Employees
// =============================================================================

/**
 * A single employee creation payload in a bulk request.
 * Mirrors the shape of the HR module's CreateEmployeeSchema but as an
 * array item with an optional external reference for the caller.
 */
export const BulkCreateEmployeeItemSchema = t.Object({
  /** Optional caller-supplied reference to correlate results */
  ref: t.Optional(t.String({ maxLength: 100 })),
  personal: t.Object({
    first_name: t.String({ minLength: 1, maxLength: 100 }),
    last_name: t.String({ minLength: 1, maxLength: 100 }),
    middle_name: t.Optional(t.String({ maxLength: 100 })),
    preferred_name: t.Optional(t.String({ maxLength: 100 })),
    date_of_birth: t.Optional(DateSchema),
    gender: t.Optional(GenderSchema),
    marital_status: t.Optional(MaritalStatusSchema),
    nationality: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
  }),
  contract: t.Object({
    hire_date: DateSchema,
    contract_type: ContractTypeSchema,
    employment_type: EmploymentTypeSchema,
    fte: t.Number({ minimum: 0.01, maximum: 1 }),
    working_hours_per_week: t.Optional(t.Number({ minimum: 1, maximum: 168 })),
    probation_end_date: t.Optional(DateSchema),
    notice_period_days: t.Optional(t.Number({ minimum: 0 })),
  }),
  position: t.Object({
    position_id: UuidSchema,
    org_unit_id: UuidSchema,
    is_primary: t.Optional(t.Boolean({ default: true })),
  }),
  compensation: t.Object({
    base_salary: t.Number({ minimum: 0 }),
    currency: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
    pay_frequency: t.Optional(PayFrequencySchema),
  }),
  manager_id: t.Optional(UuidSchema),
  employee_number: t.Optional(t.String({ maxLength: 50 })),
});

export type BulkCreateEmployeeItem = Static<typeof BulkCreateEmployeeItemSchema>;

/**
 * Request body for POST /api/v1/bulk/employees
 */
export const BulkCreateEmployeesRequestSchema = t.Object({
  employees: t.Array(BulkCreateEmployeeItemSchema, {
    minItems: 1,
    maxItems: MAX_BULK_BATCH_SIZE,
  }),
});

export type BulkCreateEmployeesRequest = Static<typeof BulkCreateEmployeesRequestSchema>;

// =============================================================================
// Bulk Update Employees
// =============================================================================

/**
 * A single employee update payload in a bulk request.
 * Requires employee_id to identify the target, and supports updating
 * personal, contract, and compensation fields (effective-dated).
 */
export const BulkUpdateEmployeeItemSchema = t.Object({
  /** Optional caller-supplied reference to correlate results */
  ref: t.Optional(t.String({ maxLength: 100 })),
  employee_id: UuidSchema,
  /** Effective date for the changes */
  effective_from: DateSchema,
  personal: t.Optional(
    t.Object({
      first_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      last_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      middle_name: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
      preferred_name: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
      date_of_birth: t.Optional(t.Union([DateSchema, t.Null()])),
      gender: t.Optional(t.Union([GenderSchema, t.Null()])),
      marital_status: t.Optional(t.Union([MaritalStatusSchema, t.Null()])),
      nationality: t.Optional(t.Union([t.String({ minLength: 3, maxLength: 3 }), t.Null()])),
    })
  ),
  contract: t.Optional(
    t.Object({
      contract_type: t.Optional(ContractTypeSchema),
      employment_type: t.Optional(EmploymentTypeSchema),
      fte: t.Optional(t.Number({ minimum: 0.01, maximum: 1 })),
      working_hours_per_week: t.Optional(t.Union([t.Number({ minimum: 1, maximum: 168 }), t.Null()])),
      probation_end_date: t.Optional(t.Union([DateSchema, t.Null()])),
      notice_period_days: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
    })
  ),
  compensation: t.Optional(
    t.Object({
      base_salary: t.Number({ minimum: 0 }),
      currency: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
      pay_frequency: t.Optional(PayFrequencySchema),
    })
  ),
});

export type BulkUpdateEmployeeItem = Static<typeof BulkUpdateEmployeeItemSchema>;

/**
 * Request body for PATCH /api/v1/bulk/employees
 */
export const BulkUpdateEmployeesRequestSchema = t.Object({
  employees: t.Array(BulkUpdateEmployeeItemSchema, {
    minItems: 1,
    maxItems: MAX_BULK_BATCH_SIZE,
  }),
});

export type BulkUpdateEmployeesRequest = Static<typeof BulkUpdateEmployeesRequestSchema>;

// =============================================================================
// Bulk Leave Request Actions
// =============================================================================

/**
 * A single leave request action (approve or reject) in a bulk request.
 */
export const BulkLeaveRequestActionItemSchema = t.Object({
  /** Optional caller-supplied reference to correlate results */
  ref: t.Optional(t.String({ maxLength: 100 })),
  leave_request_id: UuidSchema,
  action: t.Union([t.Literal("approve"), t.Literal("reject")]),
  comments: t.Optional(t.String({ maxLength: 500 })),
});

export type BulkLeaveRequestActionItem = Static<typeof BulkLeaveRequestActionItemSchema>;

/**
 * Request body for POST /api/v1/bulk/leave-requests
 */
export const BulkLeaveRequestActionsRequestSchema = t.Object({
  actions: t.Array(BulkLeaveRequestActionItemSchema, {
    minItems: 1,
    maxItems: MAX_BULK_BATCH_SIZE,
  }),
});

export type BulkLeaveRequestActionsRequest = Static<typeof BulkLeaveRequestActionsRequestSchema>;

// =============================================================================
// Generic Bulk Operation Schemas (POST /api/v1/bulk)
// =============================================================================

export const BulkOperationMethodSchema = t.Union([
  t.Literal("PUT"),
  t.Literal("PATCH"),
  t.Literal("DELETE"),
  t.Literal("POST"),
]);

export type BulkOperationMethod = Static<typeof BulkOperationMethodSchema>;

export const ALLOWED_BULK_PATH_PREFIXES = [
  "/api/v1/employees",
  "/api/v1/absence",
  "/api/v1/time",
  "/api/v1/talent",
  "/api/v1/lms",
  "/api/v1/onboarding",
  "/api/v1/benefits",
  "/api/v1/payroll",
  "/api/v1/cases",
  "/api/v1/documents",
  "/api/v1/competencies",
  "/api/v1/recruitment",
  "/api/v1/jobs",
  "/api/v1/equipment",
  "/api/v1/notifications",
  "/api/v1/bank-details",
  "/api/v1/emergency-contacts",
  "/api/v1/dbs-checks",
  "/api/v1/background-checks",
  "/api/v1/warnings",
  "/api/v1/probation",
  "/api/v1/training-budgets",
] as const;

export const GenericBulkOperationItemSchema = t.Object({
  method: BulkOperationMethodSchema,
  path: t.String({ minLength: 1, maxLength: 500 }),
  body: t.Optional(t.Record(t.String(), t.Unknown())),
  ref: t.Optional(t.String({ maxLength: 100 })),
});

export type GenericBulkOperationItem = Static<typeof GenericBulkOperationItemSchema>;

export const GenericBulkRequestSchema = t.Object({
  operations: t.Array(GenericBulkOperationItemSchema, {
    minItems: 1,
    maxItems: MAX_BULK_BATCH_SIZE,
  }),
});

export type GenericBulkRequest = Static<typeof GenericBulkRequestSchema>;

export const GenericBulkOperationResultSchema = t.Object({
  index: t.Number(),
  method: t.String(),
  path: t.String(),
  ref: t.Optional(t.String()),
  status: t.Number(),
  success: t.Boolean(),
  data: t.Optional(t.Unknown()),
  error: t.Optional(
    t.Object({
      code: t.String(),
      message: t.String(),
      details: t.Optional(t.Record(t.String(), t.Unknown())),
    })
  ),
});

export type GenericBulkOperationResult = Static<typeof GenericBulkOperationResultSchema>;

export const GenericBulkResponseSchema = t.Object({
  total: t.Number(),
  succeeded: t.Number(),
  failed: t.Number(),
  results: t.Array(GenericBulkOperationResultSchema),
});

export type GenericBulkResponse = Static<typeof GenericBulkResponseSchema>;

// =============================================================================
// Headers
// =============================================================================

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1, maxLength: 100 }),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;
