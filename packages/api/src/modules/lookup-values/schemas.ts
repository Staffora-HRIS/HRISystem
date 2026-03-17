/**
 * Lookup Values Module - TypeBox Schemas
 *
 * Validation schemas for tenant-configurable lookup categories and values.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Category Schemas
// =============================================================================

export const CreateCategorySchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z][a-z0-9_]*$" }),
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
});

export const UpdateCategorySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
  isActive: t.Optional(t.Boolean()),
});

export const CategoryResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  code: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  isSystem: t.Boolean(),
  isActive: t.Boolean(),
  valueCount: t.Optional(t.Number()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CategoryListResponseSchema = t.Object({
  items: t.Array(CategoryResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Value Schemas
// =============================================================================

export const CreateValueSchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z][a-z0-9_]*$" }),
  label: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  sortOrder: t.Optional(t.Number({ minimum: 0 })),
  isDefault: t.Optional(t.Boolean()),
  metadata: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const UpdateValueSchema = t.Object({
  label: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
  description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
  sortOrder: t.Optional(t.Number({ minimum: 0 })),
  isDefault: t.Optional(t.Boolean()),
  isActive: t.Optional(t.Boolean()),
  metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
});

export const ValueResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  categoryId: UuidSchema,
  categoryCode: t.Optional(t.String()),
  code: t.String(),
  label: t.String(),
  description: t.Union([t.String(), t.Null()]),
  sortOrder: t.Number(),
  isDefault: t.Boolean(),
  isActive: t.Boolean(),
  metadata: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const ValueListResponseSchema = t.Object({
  items: t.Array(ValueResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Query / Filter Schemas
// =============================================================================

export const CategoryFiltersSchema = t.Object({
  search: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

export const ValueFiltersSchema = t.Object({
  search: t.Optional(t.String()),
  isActive: t.Optional(t.Boolean()),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Params Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const CategoryIdParamsSchema = t.Object({
  categoryId: UuidSchema,
});

export const CategoryValueIdParamsSchema = t.Object({
  categoryId: UuidSchema,
  valueId: UuidSchema,
});

// =============================================================================
// Seed Data - Default System Categories
// =============================================================================

export const SYSTEM_CATEGORIES = [
  {
    code: "employment_type",
    name: "Employment Type",
    description: "Full-time, part-time, etc.",
    values: [
      { code: "full_time", label: "Full Time", sortOrder: 1 },
      { code: "part_time", label: "Part Time", sortOrder: 2 },
    ],
  },
  {
    code: "contract_type",
    name: "Contract Type",
    description: "Type of employment contract",
    values: [
      { code: "permanent", label: "Permanent", sortOrder: 1 },
      { code: "fixed_term", label: "Fixed Term", sortOrder: 2 },
      { code: "contractor", label: "Contractor", sortOrder: 3 },
      { code: "intern", label: "Intern", sortOrder: 4 },
      { code: "temporary", label: "Temporary", sortOrder: 5 },
    ],
  },
  {
    code: "termination_reason",
    name: "Termination Reason",
    description: "Reason for ending employment",
    values: [
      { code: "resignation", label: "Resignation", sortOrder: 1 },
      { code: "redundancy", label: "Redundancy", sortOrder: 2 },
      { code: "dismissal", label: "Dismissal", sortOrder: 3 },
      { code: "end_of_contract", label: "End of Contract", sortOrder: 4 },
      { code: "retirement", label: "Retirement", sortOrder: 5 },
      { code: "mutual_agreement", label: "Mutual Agreement", sortOrder: 6 },
      { code: "death_in_service", label: "Death in Service", sortOrder: 7 },
      { code: "tupe_transfer", label: "TUPE Transfer", sortOrder: 8 },
    ],
  },
  {
    code: "absence_reason",
    name: "Absence Reason",
    description: "Reason for employee absence",
    values: [
      { code: "annual_leave", label: "Annual Leave", sortOrder: 1 },
      { code: "sick_leave", label: "Sick Leave", sortOrder: 2 },
      { code: "compassionate_leave", label: "Compassionate Leave", sortOrder: 3 },
      { code: "maternity_leave", label: "Maternity Leave", sortOrder: 4 },
      { code: "paternity_leave", label: "Paternity Leave", sortOrder: 5 },
      { code: "shared_parental_leave", label: "Shared Parental Leave", sortOrder: 6 },
      { code: "adoption_leave", label: "Adoption Leave", sortOrder: 7 },
      { code: "unpaid_leave", label: "Unpaid Leave", sortOrder: 8 },
      { code: "jury_service", label: "Jury Service", sortOrder: 9 },
      { code: "study_leave", label: "Study Leave", sortOrder: 10 },
      { code: "other", label: "Other", sortOrder: 99 },
    ],
  },
  {
    code: "department_type",
    name: "Department Type",
    description: "Classification for organisational departments",
    values: [
      { code: "operational", label: "Operational", sortOrder: 1 },
      { code: "support", label: "Support", sortOrder: 2 },
      { code: "management", label: "Management", sortOrder: 3 },
      { code: "research", label: "Research & Development", sortOrder: 4 },
      { code: "sales", label: "Sales", sortOrder: 5 },
      { code: "marketing", label: "Marketing", sortOrder: 6 },
      { code: "finance", label: "Finance", sortOrder: 7 },
      { code: "hr", label: "Human Resources", sortOrder: 8 },
      { code: "it", label: "Information Technology", sortOrder: 9 },
      { code: "legal", label: "Legal", sortOrder: 10 },
    ],
  },
] as const;

// =============================================================================
// Type Exports
// =============================================================================

export type CreateCategory = typeof CreateCategorySchema.static;
export type UpdateCategory = typeof UpdateCategorySchema.static;
export type CategoryResponse = typeof CategoryResponseSchema.static;
export type CreateValue = typeof CreateValueSchema.static;
export type UpdateValue = typeof UpdateValueSchema.static;
export type ValueResponse = typeof ValueResponseSchema.static;
