/**
 * Core HR Module - TypeBox Schemas
 *
 * Defines validation schemas for all Core HR API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Employee status enum matching database type
 */
export const EmployeeStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("on_leave"),
  t.Literal("terminated"),
]);

export type EmployeeStatus = Static<typeof EmployeeStatusSchema>;

/**
 * Contract type enum
 */
export const ContractTypeSchema = t.Union([
  t.Literal("permanent"),
  t.Literal("fixed_term"),
  t.Literal("contractor"),
  t.Literal("intern"),
  t.Literal("temporary"),
]);

export type ContractType = Static<typeof ContractTypeSchema>;

/**
 * Employment type enum
 */
export const EmploymentTypeSchema = t.Union([
  t.Literal("full_time"),
  t.Literal("part_time"),
]);

export type EmploymentType = Static<typeof EmploymentTypeSchema>;

/**
 * Gender enum
 */
export const GenderSchema = t.Union([
  t.Literal("male"),
  t.Literal("female"),
  t.Literal("other"),
  t.Literal("prefer_not_to_say"),
]);

export type Gender = Static<typeof GenderSchema>;

/**
 * Marital status enum
 */
export const MaritalStatusSchema = t.Union([
  t.Literal("single"),
  t.Literal("married"),
  t.Literal("divorced"),
  t.Literal("widowed"),
  t.Literal("domestic_partnership"),
]);

export type MaritalStatus = Static<typeof MaritalStatusSchema>;

/**
 * NI (National Insurance) category enum
 * Determines contribution rates for payroll
 */
export const NiCategorySchema = t.Union([
  t.Literal("A"),
  t.Literal("B"),
  t.Literal("C"),
  t.Literal("D"),
  t.Literal("E"),
  t.Literal("F"),
  t.Literal("H"),
  t.Literal("J"),
  t.Literal("L"),
  t.Literal("M"),
  t.Literal("N"),
  t.Literal("S"),
  t.Literal("V"),
  t.Literal("X"),
  t.Literal("Z"),
]);

export type NiCategory = Static<typeof NiCategorySchema>;

/**
 * Address type enum
 */
export const AddressTypeSchema = t.Union([
  t.Literal("home"),
  t.Literal("work"),
  t.Literal("mailing"),
  t.Literal("emergency"),
]);

export type AddressType = Static<typeof AddressTypeSchema>;

/**
 * Contact type enum
 */
export const ContactTypeSchema = t.Union([
  t.Literal("phone"),
  t.Literal("mobile"),
  t.Literal("email"),
  t.Literal("emergency"),
]);

export type ContactType = Static<typeof ContactTypeSchema>;

/**
 * Pay frequency enum
 */
export const PayFrequencySchema = t.Union([
  t.Literal("monthly"),
  t.Literal("bi_weekly"),
  t.Literal("weekly"),
  t.Literal("semi_monthly"),
  t.Literal("annual"),
]);

export type PayFrequency = Static<typeof PayFrequencySchema>;

/**
 * Reporting relationship type
 */
export const RelationshipTypeSchema = t.Union([
  t.Literal("direct"),
  t.Literal("dotted"),
  t.Literal("matrix"),
]);

export type RelationshipType = Static<typeof RelationshipTypeSchema>;

/**
 * History dimension for queries
 */
export const HistoryDimensionSchema = t.Union([
  t.Literal("personal"),
  t.Literal("contract"),
  t.Literal("position"),
  t.Literal("compensation"),
  t.Literal("manager"),
  t.Literal("status"),
]);

export type HistoryDimension = Static<typeof HistoryDimensionSchema>;

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

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends ReturnType<typeof t.Object>>(
  itemSchema: T
) =>
  t.Object({
    items: t.Array(itemSchema),
    nextCursor: t.Union([t.String(), t.Null()]),
    hasMore: t.Boolean(),
    total: t.Optional(t.Number()),
  });

// =============================================================================
// Org Unit Schemas
// =============================================================================

/**
 * Create org unit request
 */
export const CreateOrgUnitSchema = t.Object({
  parent_id: t.Optional(UuidSchema),
  code: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[A-Z0-9][A-Z0-9_-]*$",
  }),
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  manager_position_id: t.Optional(UuidSchema),
  cost_center_id: t.Optional(UuidSchema),
  effective_from: DateSchema,
});

export type CreateOrgUnit = Static<typeof CreateOrgUnitSchema>;

/**
 * Update org unit request
 */
export const UpdateOrgUnitSchema = t.Partial(
  t.Object({
    parent_id: t.Union([UuidSchema, t.Null()]),
    code: t.String({
      minLength: 1,
      maxLength: 50,
      pattern: "^[A-Z0-9][A-Z0-9_-]*$",
    }),
    name: t.String({ minLength: 1, maxLength: 255 }),
    description: t.Union([t.String({ maxLength: 2000 }), t.Null()]),
    manager_position_id: t.Union([UuidSchema, t.Null()]),
    cost_center_id: t.Union([UuidSchema, t.Null()]),
    is_active: t.Boolean(),
  })
);

export type UpdateOrgUnit = Static<typeof UpdateOrgUnitSchema>;

/**
 * Org unit response
 */
export const OrgUnitResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  parent_id: t.Union([UuidSchema, t.Null()]),
  code: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  level: t.Number(),
  path: t.Union([t.String(), t.Null()]),
  manager_position_id: t.Union([UuidSchema, t.Null()]),
  cost_center_id: t.Union([UuidSchema, t.Null()]),
  is_active: t.Boolean(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type OrgUnitResponse = Static<typeof OrgUnitResponseSchema>;

/**
 * Org unit filters for list endpoint
 */
export const OrgUnitFiltersSchema = t.Object({
  parent_id: t.Optional(t.Union([UuidSchema, t.Null()])),
  is_active: t.Optional(t.Boolean()),
  level: t.Optional(t.Number({ minimum: 0 })),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type OrgUnitFilters = Static<typeof OrgUnitFiltersSchema>;

/**
 * Org unit hierarchy node
 */
export const OrgUnitHierarchyNodeSchema: ReturnType<typeof t.Object> = t.Object({
  id: UuidSchema,
  code: t.String(),
  name: t.String(),
  level: t.Number(),
  parent_id: t.Union([UuidSchema, t.Null()]),
  is_active: t.Boolean(),
  children: t.Array(t.Any()), // Self-referential
});

export type OrgUnitHierarchyNode = Static<typeof OrgUnitHierarchyNodeSchema>;

// =============================================================================
// Position Schemas
// =============================================================================

/**
 * Create position request
 */
export const CreatePositionSchema = t.Object({
  code: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[A-Z0-9][A-Z0-9_-]*$",
  }),
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  org_unit_id: UuidSchema,
  job_grade: t.Optional(t.String({ maxLength: 20 })),
  min_salary: t.Optional(t.Number({ minimum: 0 })),
  max_salary: t.Optional(t.Number({ minimum: 0 })),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
  is_manager: t.Optional(t.Boolean()),
  headcount: t.Optional(t.Number({ minimum: 1, default: 1 })),
  reports_to_position_id: t.Optional(UuidSchema),
});

export type CreatePosition = Static<typeof CreatePositionSchema>;

/**
 * Update position request
 */
export const UpdatePositionSchema = t.Partial(
  t.Object({
    code: t.String({
      minLength: 1,
      maxLength: 50,
      pattern: "^[A-Z0-9][A-Z0-9_-]*$",
    }),
    title: t.String({ minLength: 1, maxLength: 255 }),
    description: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    org_unit_id: UuidSchema,
    job_grade: t.Union([t.String({ maxLength: 20 }), t.Null()]),
    min_salary: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    max_salary: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    currency: t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" }),
    is_manager: t.Boolean(),
    headcount: t.Number({ minimum: 1 }),
    reports_to_position_id: t.Union([UuidSchema, t.Null()]),
    is_active: t.Boolean(),
  })
);

export type UpdatePosition = Static<typeof UpdatePositionSchema>;

/**
 * Position response
 */
export const PositionResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  code: t.String(),
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  org_unit_id: t.Union([UuidSchema, t.Null()]),
  org_unit_name: t.Optional(t.String()),
  job_grade: t.Union([t.String(), t.Null()]),
  min_salary: t.Union([t.Number(), t.Null()]),
  max_salary: t.Union([t.Number(), t.Null()]),
  currency: t.String(),
  is_manager: t.Boolean(),
  headcount: t.Number(),
  current_headcount: t.Optional(t.Number()),
  reports_to_position_id: t.Union([UuidSchema, t.Null()]),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type PositionResponse = Static<typeof PositionResponseSchema>;

/**
 * Position filters for list endpoint
 */
export const PositionFiltersSchema = t.Object({
  org_unit_id: t.Optional(UuidSchema),
  is_active: t.Optional(t.Boolean()),
  is_manager: t.Optional(t.Boolean()),
  job_grade: t.Optional(t.String()),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type PositionFilters = Static<typeof PositionFiltersSchema>;

// =============================================================================
// Employee Schemas
// =============================================================================

/**
 * Personal information for employee creation
 */
export const EmployeePersonalInputSchema = t.Object({
  first_name: t.String({ minLength: 1, maxLength: 100 }),
  last_name: t.String({ minLength: 1, maxLength: 100 }),
  middle_name: t.Optional(t.String({ maxLength: 100 })),
  preferred_name: t.Optional(t.String({ maxLength: 100 })),
  date_of_birth: t.Optional(DateSchema),
  gender: t.Optional(GenderSchema),
  marital_status: t.Optional(MaritalStatusSchema),
  nationality: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
});

export type EmployeePersonalInput = Static<typeof EmployeePersonalInputSchema>;

/**
 * Contract information for employee creation
 */
export const EmployeeContractInputSchema = t.Object({
  hire_date: DateSchema,
  contract_type: ContractTypeSchema,
  employment_type: EmploymentTypeSchema,
  fte: t.Number({ minimum: 0.01, maximum: 1 }),
  working_hours_per_week: t.Optional(t.Number({ minimum: 1, maximum: 168 })),
  probation_end_date: t.Optional(DateSchema),
  notice_period_days: t.Optional(t.Number({ minimum: 0 })),
});

export type EmployeeContractInput = Static<typeof EmployeeContractInputSchema>;

/**
 * Position assignment for employee creation
 */
export const EmployeePositionInputSchema = t.Object({
  position_id: UuidSchema,
  org_unit_id: UuidSchema,
  is_primary: t.Optional(t.Boolean({ default: true })),
});

export type EmployeePositionInput = Static<typeof EmployeePositionInputSchema>;

/**
 * Compensation for employee creation
 */
export const EmployeeCompensationInputSchema = t.Object({
  base_salary: t.Number({ minimum: 0 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
  pay_frequency: t.Optional(PayFrequencySchema),
});

export type EmployeeCompensationInput = Static<typeof EmployeeCompensationInputSchema>;

/**
 * Contact method
 */
export const EmployeeContactInputSchema = t.Object({
  contact_type: ContactTypeSchema,
  value: t.String({ minLength: 1, maxLength: 255 }),
  is_primary: t.Optional(t.Boolean()),
});

export type EmployeeContactInput = Static<typeof EmployeeContactInputSchema>;

/**
 * UK postcode pattern (validated at service level for GB addresses)
 * Accepts formats: A9 9AA, A99 9AA, A9A 9AA, AA9 9AA, AA99 9AA, AA9A 9AA
 */
export const UkPostcodeSchema = t.String({
  maxLength: 10,
  description: "UK postcode (e.g., SW1A 1AA, M1 1AA, EC2A 4BX)",
});

/**
 * Address input (for employee creation - inline addresses)
 * Uses new UK-aligned column names
 */
export const EmployeeAddressInputSchema = t.Object({
  address_type: AddressTypeSchema,
  address_line_1: t.String({ minLength: 1, maxLength: 255 }),
  address_line_2: t.Optional(t.String({ maxLength: 255 })),
  city: t.String({ minLength: 1, maxLength: 100 }),
  county: t.Optional(t.String({ maxLength: 100 })),
  postcode: t.Optional(UkPostcodeSchema),
  country: t.Optional(t.String({ minLength: 2, maxLength: 3, default: "GB" })),
  is_primary: t.Optional(t.Boolean()),
});

export type EmployeeAddressInput = Static<typeof EmployeeAddressInputSchema>;

/**
 * Create address request (effective-dated)
 */
export const CreateEmployeeAddressSchema = t.Object({
  address_type: AddressTypeSchema,
  address_line_1: t.String({ minLength: 1, maxLength: 255 }),
  address_line_2: t.Optional(t.String({ maxLength: 255 })),
  city: t.String({ minLength: 1, maxLength: 100 }),
  county: t.Optional(t.String({ maxLength: 100 })),
  postcode: t.Optional(UkPostcodeSchema),
  country: t.Optional(t.String({ minLength: 2, maxLength: 3, default: "GB" })),
  effective_from: DateSchema,
  effective_to: t.Optional(t.Union([DateSchema, t.Null()])),
  is_primary: t.Optional(t.Boolean()),
});

export type CreateEmployeeAddress = Static<typeof CreateEmployeeAddressSchema>;

/**
 * Update address request (effective-dated)
 */
export const UpdateEmployeeAddressSchema = t.Object({
  effective_from: DateSchema,
  address_type: t.Optional(AddressTypeSchema),
  address_line_1: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  address_line_2: t.Optional(t.Union([t.String({ maxLength: 255 }), t.Null()])),
  city: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  county: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  postcode: t.Optional(t.Union([UkPostcodeSchema, t.Null()])),
  country: t.Optional(t.String({ minLength: 2, maxLength: 3 })),
  is_primary: t.Optional(t.Boolean()),
});

export type UpdateEmployeeAddress = Static<typeof UpdateEmployeeAddressSchema>;

/**
 * Close (soft-delete) address request
 */
export const CloseEmployeeAddressSchema = t.Object({
  close_date: DateSchema,
});

export type CloseEmployeeAddress = Static<typeof CloseEmployeeAddressSchema>;

/**
 * Address response
 */
export const EmployeeAddressResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  address_type: AddressTypeSchema,
  address_line_1: t.String(),
  address_line_2: t.Union([t.String(), t.Null()]),
  city: t.String(),
  county: t.Union([t.String(), t.Null()]),
  postcode: t.Union([t.String(), t.Null()]),
  country: t.String(),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  is_primary: t.Boolean(),
  is_current: t.Boolean(),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EmployeeAddressResponse = Static<typeof EmployeeAddressResponseSchema>;

/**
 * Address list response
 */
export const EmployeeAddressListResponseSchema = t.Object({
  items: t.Array(EmployeeAddressResponseSchema),
});

export type EmployeeAddressListResponse = Static<typeof EmployeeAddressListResponseSchema>;

/**
 * Address history query filters
 */
export const AddressHistoryQuerySchema = t.Object({
  address_type: t.Optional(AddressTypeSchema),
  from: t.Optional(DateSchema),
  to: t.Optional(DateSchema),
});

export type AddressHistoryQuery = Static<typeof AddressHistoryQuerySchema>;

/**
 * Employee address ID params
 */
export const EmployeeAddressIdParamsSchema = t.Object({
  id: UuidSchema,
  addressId: UuidSchema,
});

export type EmployeeAddressIdParams = Static<typeof EmployeeAddressIdParamsSchema>;

/**
 * Create employee request (full hire)
 */
export const CreateEmployeeSchema = t.Object({
  personal: EmployeePersonalInputSchema,
  contract: EmployeeContractInputSchema,
  position: EmployeePositionInputSchema,
  compensation: EmployeeCompensationInputSchema,
  manager_id: t.Optional(UuidSchema),
  contacts: t.Optional(t.Array(EmployeeContactInputSchema)),
  addresses: t.Optional(t.Array(EmployeeAddressInputSchema)),
  employee_number: t.Optional(t.String({ maxLength: 50 })),
});

export type CreateEmployee = Static<typeof CreateEmployeeSchema>;

/**
 * Update employee personal info (effective-dated)
 */
export const UpdateEmployeePersonalSchema = t.Object({
  effective_from: DateSchema,
  first_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  last_name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  middle_name: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  preferred_name: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  date_of_birth: t.Optional(t.Union([DateSchema, t.Null()])),
  gender: t.Optional(t.Union([GenderSchema, t.Null()])),
  marital_status: t.Optional(t.Union([MaritalStatusSchema, t.Null()])),
  nationality: t.Optional(t.Union([t.String({ minLength: 3, maxLength: 3 }), t.Null()])),
});

export type UpdateEmployeePersonal = Static<typeof UpdateEmployeePersonalSchema>;

/**
 * Update employee contract (effective-dated)
 */
export const UpdateEmployeeContractSchema = t.Object({
  effective_from: DateSchema,
  contract_type: t.Optional(ContractTypeSchema),
  employment_type: t.Optional(EmploymentTypeSchema),
  fte: t.Optional(t.Number({ minimum: 0.01, maximum: 1 })),
  working_hours_per_week: t.Optional(t.Union([t.Number({ minimum: 1, maximum: 168 }), t.Null()])),
  probation_end_date: t.Optional(t.Union([DateSchema, t.Null()])),
  notice_period_days: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
});

export type UpdateEmployeeContract = Static<typeof UpdateEmployeeContractSchema>;

/**
 * Update employee position (transfer/promotion)
 */
export const UpdateEmployeePositionSchema = t.Object({
  effective_from: DateSchema,
  position_id: UuidSchema,
  org_unit_id: UuidSchema,
  is_primary: t.Optional(t.Boolean()),
  assignment_reason: t.Optional(t.String({ maxLength: 100 })),
});

export type UpdateEmployeePosition = Static<typeof UpdateEmployeePositionSchema>;

/**
 * Update employee compensation (effective-dated)
 */
export const UpdateEmployeeCompensationSchema = t.Object({
  effective_from: DateSchema,
  base_salary: t.Number({ minimum: 0 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })),
  pay_frequency: t.Optional(PayFrequencySchema),
  change_reason: t.Optional(t.String({ maxLength: 100 })),
});

export type UpdateEmployeeCompensation = Static<typeof UpdateEmployeeCompensationSchema>;

/**
 * Update employee manager (effective-dated)
 */
export const UpdateEmployeeManagerSchema = t.Object({
  effective_from: DateSchema,
  manager_id: UuidSchema,
  relationship_type: t.Optional(RelationshipTypeSchema),
  is_primary: t.Optional(t.Boolean()),
});

export type UpdateEmployeeManager = Static<typeof UpdateEmployeeManagerSchema>;

/**
 * Update employee NI category
 */
export const UpdateNiCategorySchema = t.Object({
  ni_category: NiCategorySchema,
});

export type UpdateNiCategory = Static<typeof UpdateNiCategorySchema>;

/**
 * Employee status transition
 */
export const EmployeeStatusTransitionSchema = t.Object({
  to_status: EmployeeStatusSchema,
  effective_date: DateSchema,
  reason: t.Optional(t.String({ maxLength: 500 })),
});

export type EmployeeStatusTransition = Static<typeof EmployeeStatusTransitionSchema>;

/**
 * Employee termination request
 */
export const EmployeeTerminationSchema = t.Object({
  termination_date: DateSchema,
  reason: t.String({ minLength: 1, maxLength: 500 }),
});

export type EmployeeTermination = Static<typeof EmployeeTerminationSchema>;

/**
 * Current personal info in response
 */
export const EmployeePersonalResponseSchema = t.Object({
  first_name: t.String(),
  last_name: t.String(),
  middle_name: t.Union([t.String(), t.Null()]),
  preferred_name: t.Union([t.String(), t.Null()]),
  full_name: t.String(),
  display_name: t.String(),
  date_of_birth: t.Union([t.String(), t.Null()]),
  gender: t.Union([GenderSchema, t.Null()]),
  marital_status: t.Union([MaritalStatusSchema, t.Null()]),
  nationality: t.Union([t.String(), t.Null()]),
  effective_from: t.String(),
});

export type EmployeePersonalResponse = Static<typeof EmployeePersonalResponseSchema>;

/**
 * Current contract in response
 */
export const EmployeeContractResponseSchema = t.Object({
  contract_type: ContractTypeSchema,
  employment_type: EmploymentTypeSchema,
  fte: t.Number(),
  working_hours_per_week: t.Union([t.Number(), t.Null()]),
  probation_end_date: t.Union([t.String(), t.Null()]),
  notice_period_days: t.Union([t.Number(), t.Null()]),
  effective_from: t.String(),
});

export type EmployeeContractResponse = Static<typeof EmployeeContractResponseSchema>;

/**
 * Current position assignment in response
 */
export const EmployeePositionResponseSchema = t.Object({
  position_id: UuidSchema,
  position_code: t.String(),
  position_title: t.String(),
  org_unit_id: UuidSchema,
  org_unit_name: t.String(),
  job_grade: t.Union([t.String(), t.Null()]),
  is_primary: t.Boolean(),
  effective_from: t.String(),
});

export type EmployeePositionResponse = Static<typeof EmployeePositionResponseSchema>;

/**
 * Current compensation in response
 */
export const EmployeeCompensationResponseSchema = t.Object({
  base_salary: t.Number(),
  currency: t.String(),
  pay_frequency: t.String(),
  annual_salary: t.Number(),
  effective_from: t.String(),
});

export type EmployeeCompensationResponse = Static<typeof EmployeeCompensationResponseSchema>;

/**
 * Current manager in response
 */
export const EmployeeManagerResponseSchema = t.Object({
  manager_id: UuidSchema,
  manager_number: t.String(),
  manager_name: t.String(),
  relationship_type: t.String(),
  is_primary: t.Boolean(),
  effective_from: t.String(),
});

export type EmployeeManagerResponse = Static<typeof EmployeeManagerResponseSchema>;

/**
 * Full employee response
 */
export const EmployeeResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_number: t.String(),
  user_id: t.Union([UuidSchema, t.Null()]),
  status: EmployeeStatusSchema,
  hire_date: t.String(),
  termination_date: t.Union([t.String(), t.Null()]),
  termination_reason: t.Union([t.String(), t.Null()]),
  tenure_years: t.Union([t.Number(), t.Null()]),
  personal: t.Optional(EmployeePersonalResponseSchema),
  contract: t.Optional(EmployeeContractResponseSchema),
  position: t.Optional(EmployeePositionResponseSchema),
  compensation: t.Optional(EmployeeCompensationResponseSchema),
  manager: t.Optional(t.Union([EmployeeManagerResponseSchema, t.Null()])),
  created_at: t.String(),
  updated_at: t.String(),
});

export type EmployeeResponse = Static<typeof EmployeeResponseSchema>;

/**
 * Employee list item (summary)
 */
export const EmployeeListItemSchema = t.Object({
  id: UuidSchema,
  employee_number: t.String(),
  status: EmployeeStatusSchema,
  hire_date: t.String(),
  full_name: t.String(),
  display_name: t.String(),
  position_title: t.Union([t.String(), t.Null()]),
  org_unit_name: t.Union([t.String(), t.Null()]),
  manager_name: t.Union([t.String(), t.Null()]),
});

export type EmployeeListItem = Static<typeof EmployeeListItemSchema>;

/**
 * Employee list response
 */
export const EmployeeListResponseSchema = t.Object({
  items: t.Array(EmployeeListItemSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
  total: t.Optional(t.Number()),
});

export type EmployeeListResponse = Static<typeof EmployeeListResponseSchema>;

/**
 * Employee filters for list endpoint
 */
export const EmployeeFiltersSchema = t.Object({
  status: t.Optional(EmployeeStatusSchema),
  org_unit_id: t.Optional(UuidSchema),
  manager_id: t.Optional(UuidSchema),
  position_id: t.Optional(UuidSchema),
  search: t.Optional(t.String({ minLength: 1 })),
  hire_date_from: t.Optional(DateSchema),
  hire_date_to: t.Optional(DateSchema),
});

export type EmployeeFilters = Static<typeof EmployeeFiltersSchema>;

// =============================================================================
// History Schemas
// =============================================================================

/**
 * Employee history query
 */
export const EmployeeHistoryQuerySchema = t.Object({
  dimension: HistoryDimensionSchema,
  from: t.Optional(DateSchema),
  to: t.Optional(DateSchema),
});

export type EmployeeHistoryQuery = Static<typeof EmployeeHistoryQuerySchema>;

/**
 * Generic history record
 */
export const HistoryRecordSchema = t.Object({
  id: UuidSchema,
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  data: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
  created_by: t.Union([UuidSchema, t.Null()]),
});

export type HistoryRecord = Static<typeof HistoryRecordSchema>;

/**
 * History response
 */
export const EmployeeHistoryResponseSchema = t.Object({
  employee_id: UuidSchema,
  dimension: HistoryDimensionSchema,
  records: t.Array(HistoryRecordSchema),
});

export type EmployeeHistoryResponse = Static<typeof EmployeeHistoryResponseSchema>;

// =============================================================================
// Cost Center Schemas (for reference)
// =============================================================================

/**
 * Cost center response
 */
export const CostCenterResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  code: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  parent_id: t.Union([UuidSchema, t.Null()]),
  is_active: t.Boolean(),
  created_at: t.String(),
  updated_at: t.String(),
});

export type CostCenterResponse = Static<typeof CostCenterResponseSchema>;

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
 * Employee number parameter
 */
export const EmployeeNumberParamsSchema = t.Object({
  employeeNumber: t.String({ minLength: 1 }),
});

export type EmployeeNumberParams = Static<typeof EmployeeNumberParamsSchema>;

/**
 * History dimension parameter
 */
export const HistoryDimensionParamsSchema = t.Object({
  id: UuidSchema,
  dimension: HistoryDimensionSchema,
});

export type HistoryDimensionParams = Static<typeof HistoryDimensionParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Idempotency key header
 */
export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1, maxLength: 100 }),
});

export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

/**
 * Optional idempotency key header (for backwards compatibility)
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;

// =============================================================================
// Employee Position Assignment Schemas (Concurrent Employment)
// =============================================================================

/**
 * Assign additional position to employee request.
 * Used for concurrent employment where an employee holds multiple positions.
 */
export const AssignEmployeePositionSchema = t.Object({
  position_id: UuidSchema,
  org_unit_id: UuidSchema,
  is_primary: t.Optional(t.Boolean({ default: false })),
  fte_percentage: t.Number({
    minimum: 0.01,
    maximum: 100,
    description: "Percentage of FTE this position represents (0.01-100)",
  }),
  effective_from: DateSchema,
  assignment_reason: t.Optional(t.String({ maxLength: 100 })),
});

export type AssignEmployeePosition = Static<typeof AssignEmployeePositionSchema>;

/**
 * Update an existing position assignment
 */
export const UpdateEmployeePositionAssignmentSchema = t.Partial(
  t.Object({
    is_primary: t.Boolean(),
    fte_percentage: t.Number({ minimum: 0.01, maximum: 100 }),
    effective_from: DateSchema,
    effective_to: t.Union([DateSchema, t.Null()]),
  })
);

export type UpdateEmployeePositionAssignment = Static<typeof UpdateEmployeePositionAssignmentSchema>;

/**
 * Employee position assignment response (includes FTE)
 */
export const EmployeePositionAssignmentResponseSchema = t.Object({
  id: UuidSchema,
  employee_id: UuidSchema,
  position_id: UuidSchema,
  position_code: t.String(),
  position_title: t.String(),
  org_unit_id: UuidSchema,
  org_unit_name: t.String(),
  is_primary: t.Boolean(),
  fte_percentage: t.Number(),
  assignment_reason: t.Union([t.String(), t.Null()]),
  effective_from: t.String(),
  effective_to: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});

export type EmployeePositionAssignmentResponse = Static<typeof EmployeePositionAssignmentResponseSchema>;

/**
 * List of employee positions response with FTE summary
 */
export const EmployeePositionsListResponseSchema = t.Object({
  employee_id: UuidSchema,
  total_fte_percentage: t.Number(),
  max_fte_percentage: t.Number(),
  positions: t.Array(EmployeePositionAssignmentResponseSchema),
});

export type EmployeePositionsListResponse = Static<typeof EmployeePositionsListResponseSchema>;

/**
 * Employee position assignment ID params
 */
export const EmployeePositionParamsSchema = t.Object({
  id: UuidSchema,
  assignmentId: UuidSchema,
});

export type EmployeePositionParams = Static<typeof EmployeePositionParamsSchema>;

// =============================================================================
// Rehire Schemas
// =============================================================================

/**
 * Rehire employee request.
 * Rehires a terminated employee, creating a new employment record that
 * links to the previous terminated record for history preservation.
 */
export const RehireEmployeeSchema = t.Object({
  rehire_date: DateSchema,
  contract: EmployeeContractInputSchema,
  position: EmployeePositionInputSchema,
  compensation: EmployeeCompensationInputSchema,
  manager_id: t.Optional(UuidSchema),
  reason: t.Optional(t.String({ maxLength: 500 })),
});

export type RehireEmployee = Static<typeof RehireEmployeeSchema>;

/**
 * Employment record response
 */
export const EmploymentRecordResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employment_number: t.Number(),
  start_date: t.String(),
  end_date: t.Union([t.String(), t.Null()]),
  termination_reason: t.Union([t.String(), t.Null()]),
  is_current: t.Boolean(),
  previous_employment_id: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
});

export type EmploymentRecordResponse = Static<typeof EmploymentRecordResponseSchema>;

/**
 * Rehire response: the updated employee plus employment history chain
 */
export const RehireResponseSchema = t.Object({
  employee: EmployeeResponseSchema,
  employment_records: t.Array(EmploymentRecordResponseSchema),
});

export type RehireResponse = Static<typeof RehireResponseSchema>;
