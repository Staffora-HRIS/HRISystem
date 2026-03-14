/**
 * Jobs Catalog Module - TypeBox Schemas
 *
 * Defines validation schemas for all Jobs Catalog API endpoints.
 * Uses Elysia's built-in TypeBox for type-safe validation.
 *
 * Matches migration 0106_jobs.sql columns exactly.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Enums
// =============================================================================

/**
 * Job status enum matching database type app.job_status
 */
export const JobStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("frozen"),
  t.Literal("archived"),
]);

export type JobStatus = Static<typeof JobStatusSchema>;

/**
 * FLSA status values
 */
export const FlsaStatusSchema = t.Union([
  t.Literal("exempt"),
  t.Literal("non_exempt"),
]);

export type FlsaStatus = Static<typeof FlsaStatusSchema>;

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
// Job Schemas
// =============================================================================

/**
 * Create job request
 */
export const CreateJobSchema = t.Object({
  code: t.String({
    minLength: 1,
    maxLength: 50,
    pattern: "^[A-Z0-9][A-Z0-9_-]*$",
  }),
  title: t.String({ minLength: 1, maxLength: 200 }),
  family: t.Optional(t.String({ maxLength: 100 })),
  subfamily: t.Optional(t.String({ maxLength: 100 })),
  job_level: t.Optional(t.Number({ minimum: 0 })),
  job_grade: t.Optional(t.String({ maxLength: 20 })),
  flsa_status: t.Optional(FlsaStatusSchema),
  eeo_category: t.Optional(t.String({ maxLength: 50 })),
  summary: t.Optional(t.String({ maxLength: 10000 })),
  essential_functions: t.Optional(t.String({ maxLength: 10000 })),
  qualifications: t.Optional(t.String({ maxLength: 10000 })),
  physical_requirements: t.Optional(t.String({ maxLength: 5000 })),
  working_conditions: t.Optional(t.String({ maxLength: 5000 })),
  salary_grade_id: t.Optional(UuidSchema),
  min_salary: t.Optional(t.Number({ minimum: 0 })),
  max_salary: t.Optional(t.Number({ minimum: 0 })),
  currency: t.Optional(
    t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" })
  ),
  status: t.Optional(JobStatusSchema),
  effective_date: t.Optional(DateSchema),
});

export type CreateJob = Static<typeof CreateJobSchema>;

/**
 * Update job request (all fields optional)
 */
export const UpdateJobSchema = t.Partial(
  t.Object({
    code: t.String({
      minLength: 1,
      maxLength: 50,
      pattern: "^[A-Z0-9][A-Z0-9_-]*$",
    }),
    title: t.String({ minLength: 1, maxLength: 200 }),
    family: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    subfamily: t.Union([t.String({ maxLength: 100 }), t.Null()]),
    job_level: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    job_grade: t.Union([t.String({ maxLength: 20 }), t.Null()]),
    flsa_status: t.Union([FlsaStatusSchema, t.Null()]),
    eeo_category: t.Union([t.String({ maxLength: 50 }), t.Null()]),
    summary: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    essential_functions: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    qualifications: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
    physical_requirements: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    working_conditions: t.Union([t.String({ maxLength: 5000 }), t.Null()]),
    salary_grade_id: t.Union([UuidSchema, t.Null()]),
    min_salary: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    max_salary: t.Union([t.Number({ minimum: 0 }), t.Null()]),
    currency: t.String({ minLength: 3, maxLength: 3, pattern: "^[A-Z]{3}$" }),
    status: JobStatusSchema,
    effective_date: DateSchema,
  })
);

export type UpdateJob = Static<typeof UpdateJobSchema>;

/**
 * Job response schema
 */
export const JobResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  code: t.String(),
  title: t.String(),
  family: t.Union([t.String(), t.Null()]),
  subfamily: t.Union([t.String(), t.Null()]),
  job_level: t.Union([t.Number(), t.Null()]),
  job_grade: t.Union([t.String(), t.Null()]),
  flsa_status: t.Union([t.String(), t.Null()]),
  eeo_category: t.Union([t.String(), t.Null()]),
  summary: t.Union([t.String(), t.Null()]),
  essential_functions: t.Union([t.String(), t.Null()]),
  qualifications: t.Union([t.String(), t.Null()]),
  physical_requirements: t.Union([t.String(), t.Null()]),
  working_conditions: t.Union([t.String(), t.Null()]),
  salary_grade_id: t.Union([UuidSchema, t.Null()]),
  min_salary: t.Union([t.Number(), t.Null()]),
  max_salary: t.Union([t.Number(), t.Null()]),
  currency: t.Union([t.String(), t.Null()]),
  status: JobStatusSchema,
  effective_date: t.String(),
  created_at: t.String(),
  updated_at: t.String(),
  created_by: t.Union([UuidSchema, t.Null()]),
  updated_by: t.Union([UuidSchema, t.Null()]),
});

export type JobResponse = Static<typeof JobResponseSchema>;

/**
 * Job list item (summary for list endpoint)
 */
export const JobListItemSchema = t.Object({
  id: UuidSchema,
  code: t.String(),
  title: t.String(),
  family: t.Union([t.String(), t.Null()]),
  subfamily: t.Union([t.String(), t.Null()]),
  job_level: t.Union([t.Number(), t.Null()]),
  job_grade: t.Union([t.String(), t.Null()]),
  status: JobStatusSchema,
  min_salary: t.Union([t.Number(), t.Null()]),
  max_salary: t.Union([t.Number(), t.Null()]),
  currency: t.Union([t.String(), t.Null()]),
  effective_date: t.String(),
});

export type JobListItem = Static<typeof JobListItemSchema>;

/**
 * Job filters for list endpoint
 */
export const JobFiltersSchema = t.Object({
  status: t.Optional(JobStatusSchema),
  family: t.Optional(t.String({ minLength: 1 })),
  job_grade: t.Optional(t.String({ minLength: 1 })),
  search: t.Optional(t.String({ minLength: 1 })),
});

export type JobFilters = Static<typeof JobFiltersSchema>;

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
 * Code parameter
 */
export const CodeParamsSchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 50 }),
});

export type CodeParams = Static<typeof CodeParamsSchema>;

// =============================================================================
// Idempotency Header Schema
// =============================================================================

/**
 * Optional idempotency key header
 */
export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});

export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
