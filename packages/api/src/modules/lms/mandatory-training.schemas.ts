/**
 * Mandatory Training - TypeBox Schemas
 *
 * Validation schemas for mandatory training rules and assignments endpoints.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Mandatory Training Rule Schemas
// =============================================================================

export const MandatoryTrainingAppliesToSchema = t.Union([
  t.Literal("all"),
  t.Literal("department"),
  t.Literal("role"),
]);

export const MandatoryTrainingStatusSchema = t.Union([
  t.Literal("assigned"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("overdue"),
]);

export const CreateMandatoryTrainingRuleSchema = t.Object({
  courseId: UuidSchema,
  appliesTo: MandatoryTrainingAppliesToSchema,
  departmentId: t.Optional(UuidSchema),
  role: t.Optional(t.String({ maxLength: 255 })),
  deadlineDays: t.Number({ minimum: 1, maximum: 365 }),
  recurrenceMonths: t.Optional(t.Union([t.Number({ minimum: 1, maximum: 120 }), t.Null()])),
  escalationDays: t.Number({ minimum: 0, maximum: 364 }),
  isActive: t.Optional(t.Boolean()),
  name: t.Optional(t.String({ maxLength: 255 })),
});

export const UpdateMandatoryTrainingRuleSchema = t.Partial(
  t.Object({
    deadlineDays: t.Number({ minimum: 1, maximum: 365 }),
    recurrenceMonths: t.Union([t.Number({ minimum: 1, maximum: 120 }), t.Null()]),
    escalationDays: t.Number({ minimum: 0, maximum: 364 }),
    isActive: t.Boolean(),
    name: t.String({ maxLength: 255 }),
  })
);

export const MandatoryTrainingRuleResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  courseId: UuidSchema,
  courseName: t.Union([t.String(), t.Null()]),
  appliesTo: MandatoryTrainingAppliesToSchema,
  departmentId: t.Union([UuidSchema, t.Null()]),
  departmentName: t.Optional(t.Union([t.String(), t.Null()])),
  role: t.Union([t.String(), t.Null()]),
  deadlineDays: t.Number(),
  recurrenceMonths: t.Union([t.Number(), t.Null()]),
  escalationDays: t.Number(),
  isActive: t.Boolean(),
  name: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
  createdBy: t.Union([UuidSchema, t.Null()]),
});

// =============================================================================
// Mandatory Training Assignment Schemas
// =============================================================================

export const MandatoryTrainingAssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  ruleId: UuidSchema,
  employeeId: UuidSchema,
  employeeName: t.Optional(t.Union([t.String(), t.Null()])),
  courseId: UuidSchema,
  courseName: t.Optional(t.Union([t.String(), t.Null()])),
  assignedAt: t.String(),
  deadlineAt: t.String(),
  completedAt: t.Union([t.String(), t.Null()]),
  status: MandatoryTrainingStatusSchema,
  reminderSent: t.Boolean(),
  reminderSentAt: t.Union([t.String(), t.Null()]),
  escalationSent: t.Boolean(),
  escalationSentAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

// =============================================================================
// Query Schemas
// =============================================================================

export const MandatoryRuleListQuerySchema = t.Object({
  courseId: t.Optional(UuidSchema),
  appliesTo: t.Optional(MandatoryTrainingAppliesToSchema),
  isActive: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const MandatoryAssignmentListQuerySchema = t.Object({
  ruleId: t.Optional(UuidSchema),
  employeeId: t.Optional(UuidSchema),
  courseId: t.Optional(UuidSchema),
  status: t.Optional(MandatoryTrainingStatusSchema),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

// =============================================================================
// Bulk Assign Response Schema
// =============================================================================

export const BulkAssignResponseSchema = t.Object({
  assignedCount: t.Number(),
  skippedCount: t.Number(),
  assignments: t.Array(MandatoryTrainingAssignmentResponseSchema),
});

// =============================================================================
// Export Types
// =============================================================================

export type CreateMandatoryTrainingRule = typeof CreateMandatoryTrainingRuleSchema.static;
export type UpdateMandatoryTrainingRule = typeof UpdateMandatoryTrainingRuleSchema.static;
export type MandatoryTrainingRuleResponse = typeof MandatoryTrainingRuleResponseSchema.static;
export type MandatoryTrainingAssignmentResponse = typeof MandatoryTrainingAssignmentResponseSchema.static;
export type BulkAssignResponse = typeof BulkAssignResponseSchema.static;
