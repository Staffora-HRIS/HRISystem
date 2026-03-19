/**
 * Global Mobility Module - TypeBox Schemas
 *
 * Defines validation schemas for international assignment tracking API endpoints.
 * Tables: international_assignments, assignment_costs
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
  pattern: "^\d{4}-\d{2}-\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const AssignmentTypeSchema = t.Union([
  t.Literal("short_term"),
  t.Literal("long_term"),
  t.Literal("permanent_transfer"),
  t.Literal("commuter"),
]);
export type AssignmentType = Static<typeof AssignmentTypeSchema>;

export const AssignmentStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("extended"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type AssignmentStatus = Static<typeof AssignmentStatusSchema>;
