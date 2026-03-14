/**
 * CPD Module - TypeBox Schemas
 *
 * Validation schemas for Continuing Professional Development records.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// CPD Activity Types
// =============================================================================

export const CpdActivityTypeSchema = t.Union([
  t.Literal("course"),
  t.Literal("conference"),
  t.Literal("workshop"),
  t.Literal("self_study"),
  t.Literal("mentoring"),
  t.Literal("publication"),
  t.Literal("presentation"),
  t.Literal("professional_body"),
]);

// =============================================================================
// CPD Record Schemas
// =============================================================================

export const CreateCpdRecordSchema = t.Object({
  employeeId: UuidSchema,
  activityType: CpdActivityTypeSchema,
  title: t.String({ minLength: 1, maxLength: 500 }),
  provider: t.Optional(t.String({ maxLength: 300 })),
  hours: t.Number({ minimum: 0.01 }),
  points: t.Optional(t.Number({ minimum: 0 })),
  startDate: t.String({ format: "date" }),
  endDate: t.Optional(t.String({ format: "date" })),
  certificateKey: t.Optional(t.String({ maxLength: 500 })),
  reflection: t.Optional(t.String({ maxLength: 5000 })),
});
export type CreateCpdRecord = Static<typeof CreateCpdRecordSchema>;

export const UpdateCpdRecordSchema = t.Partial(
  t.Object({
    activityType: CpdActivityTypeSchema,
    title: t.String({ minLength: 1, maxLength: 500 }),
    provider: t.String({ maxLength: 300 }),
    hours: t.Number({ minimum: 0.01 }),
    points: t.Number({ minimum: 0 }),
    startDate: t.String({ format: "date" }),
    endDate: t.String({ format: "date" }),
    certificateKey: t.String({ maxLength: 500 }),
    reflection: t.String({ maxLength: 5000 }),
  })
);
export type UpdateCpdRecord = Static<typeof UpdateCpdRecordSchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface CpdRecordResponse {
  id: string;
  tenantId: string;
  employeeId: string;
  activityType: string;
  title: string;
  provider: string | null;
  hours: number;
  points: number;
  startDate: string;
  endDate: string | null;
  certificateKey: string | null;
  reflection: string | null;
  verified: boolean;
  verifiedBy: string | null;
  employeeName?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamsSchema = t.Object({ id: UuidSchema });
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});
