/**
 * One-on-One Meetings Module - TypeBox Schemas
 *
 * Defines validation schemas for all 1:1 Meeting API endpoints.
 * Table: one_on_one_meetings
 */

import { t, type Static } from "elysia";

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

// =============================================================================
// Enums
// =============================================================================

/**
 * Meeting status — matches app.one_on_one_status
 */
export const OneOnOneStatusSchema = t.Union([
  t.Literal("scheduled"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export type OneOnOneStatus = Static<typeof OneOnOneStatusSchema>;

// =============================================================================
// Action Item Schema
// =============================================================================

/**
 * Single action item within a meeting
 */
export const ActionItemSchema = t.Object({
  text: t.String({ minLength: 1, maxLength: 1000 }),
  assignee: t.Optional(t.Union([t.Literal("manager"), t.Literal("employee")])),
  done: t.Optional(t.Boolean({ default: false })),
});

export type ActionItem = Static<typeof ActionItemSchema>;

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Create a new 1:1 meeting
 */
export const CreateOneOnOneSchema = t.Object({
  employee_id: UuidSchema,
  meeting_date: DateSchema,
  notes: t.Optional(t.String({ maxLength: 10000 })),
  action_items: t.Optional(t.Array(ActionItemSchema, { maxItems: 50 })),
  next_meeting_date: t.Optional(DateSchema),
  status: t.Optional(OneOnOneStatusSchema),
});

export type CreateOneOnOne = Static<typeof CreateOneOnOneSchema>;

/**
 * Update an existing 1:1 meeting
 */
export const UpdateOneOnOneSchema = t.Object({
  meeting_date: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 10000 })),
  action_items: t.Optional(t.Array(ActionItemSchema, { maxItems: 50 })),
  next_meeting_date: t.Optional(t.Union([DateSchema, t.Null()])),
  status: t.Optional(OneOnOneStatusSchema),
});

export type UpdateOneOnOne = Static<typeof UpdateOneOnOneSchema>;

// =============================================================================
// Filter Schemas
// =============================================================================

/**
 * Filters for listing 1:1 meetings
 */
export const OneOnOneFiltersSchema = t.Object({
  employee_id: t.Optional(UuidSchema),
  status: t.Optional(OneOnOneStatusSchema),
  from_date: t.Optional(DateSchema),
  to_date: t.Optional(DateSchema),
});

export type OneOnOneFilters = Static<typeof OneOnOneFiltersSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * 1:1 meeting response
 */
export const OneOnOneResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  manager_id: UuidSchema,
  employee_id: UuidSchema,
  meeting_date: t.String(),
  status: OneOnOneStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  action_items: t.Array(ActionItemSchema),
  next_meeting_date: t.Union([t.String(), t.Null()]),
  // Joined fields (optional, present when listed)
  manager_name: t.Optional(t.String()),
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

export type OneOnOneResponse = Static<typeof OneOnOneResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

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
