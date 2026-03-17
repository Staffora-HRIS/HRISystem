/**
 * Onboarding Module - TypeBox Schemas
 *
 * Validation schemas for Employee Onboarding endpoints.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });

// =============================================================================
// Status & Type Enums
// =============================================================================

export const OnboardingStatusSchema = t.Union([
  t.Literal("not_started"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);

export const TaskStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("skipped"),
  t.Literal("blocked"),
]);

export const TaskAssigneeTypeSchema = t.Union([
  t.Literal("employee"),
  t.Literal("manager"),
  t.Literal("hr"),
  t.Literal("it"),
  t.Literal("buddy"),
  t.Literal("system"),
]);

export const TaskCategorySchema = t.Union([
  t.Literal("paperwork"),
  t.Literal("training"),
  t.Literal("equipment"),
  t.Literal("access"),
  t.Literal("introduction"),
  t.Literal("compliance"),
  t.Literal("other"),
]);

// =============================================================================
// Template Task Schema
// =============================================================================

export const TemplateTaskSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  category: t.Optional(TaskCategorySchema),
  assigneeType: t.Optional(TaskAssigneeTypeSchema),
  daysFromStart: t.Optional(t.Number({ minimum: 0 })),
  daysToComplete: t.Optional(t.Number({ minimum: 1 })),
  required: t.Optional(t.Boolean()),
  order: t.Optional(t.Number()),
  dependsOn: t.Optional(t.Array(t.String())),
  documentUrl: t.Optional(t.String()),
  formFields: t.Optional(t.Array(t.Object({
    name: t.String(),
    label: t.String(),
    type: t.String(),
    required: t.Optional(t.Boolean()),
  }))),
});

// =============================================================================
// Template Schemas
// =============================================================================

export const CreateTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  departmentId: t.Optional(UuidSchema),
  positionId: t.Optional(UuidSchema),
  isDefault: t.Optional(t.Boolean()),
  tasks: t.Optional(t.Array(TemplateTaskSchema)),
});

export const UpdateTemplateSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 100 }),
    description: t.String({ maxLength: 1000 }),
    departmentId: UuidSchema,
    positionId: UuidSchema,
    isDefault: t.Boolean(),
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
    tasks: t.Array(TemplateTaskSchema),
  })
);

export const TemplateResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  departmentId: t.Union([UuidSchema, t.Null()]),
  departmentName: t.Optional(t.String()),
  positionId: t.Union([UuidSchema, t.Null()]),
  positionName: t.Optional(t.String()),
  isDefault: t.Boolean(),
  status: t.String(),
  taskCount: t.Optional(t.Number()),
  createdBy: UuidSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const TemplateWithTasksResponseSchema = t.Composite([
  TemplateResponseSchema,
  t.Object({
    tasks: t.Array(TemplateTaskSchema),
  }),
]);

// =============================================================================
// Instance Task Schema
// =============================================================================

export const InstanceTaskSchema = t.Object({
  taskId: t.String(),
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.Union([TaskCategorySchema, t.Null()]),
  assigneeType: t.Union([TaskAssigneeTypeSchema, t.Null()]),
  assigneeId: t.Union([UuidSchema, t.Null()]),
  assigneeName: t.Optional(t.String()),
  status: TaskStatusSchema,
  dueDate: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  completedBy: t.Union([UuidSchema, t.Null()]),
  completedByName: t.Optional(t.String()),
  required: t.Boolean(),
  order: t.Number(),
  notes: t.Union([t.String(), t.Null()]),
  formData: t.Optional(t.Record(t.String(), t.Unknown())),
  /** IDs of template tasks that must be completed before this task can proceed */
  dependsOnTaskIds: t.Optional(t.Array(UuidSchema)),
  /** IDs of incomplete dependency tasks currently blocking this task */
  blockedByTaskIds: t.Optional(t.Array(UuidSchema)),
});

// =============================================================================
// Instance Schemas
// =============================================================================

export const CreateInstanceSchema = t.Object({
  employeeId: UuidSchema,
  templateId: UuidSchema,
  startDate: DateSchema,
  buddyId: t.Optional(UuidSchema),
  managerId: t.Optional(UuidSchema),
  notes: t.Optional(t.String({ maxLength: 1000 })),
});

export const UpdateInstanceSchema = t.Partial(
  t.Object({
    buddyId: UuidSchema,
    managerId: UuidSchema,
    status: OnboardingStatusSchema,
    notes: t.String({ maxLength: 1000 }),
  })
);

export const InstanceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  employeeId: UuidSchema,
  employeeName: t.Optional(t.String()),
  templateId: UuidSchema,
  templateName: t.Optional(t.String()),
  status: OnboardingStatusSchema,
  startDate: t.String(),
  targetCompletionDate: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  buddyId: t.Union([UuidSchema, t.Null()]),
  buddyName: t.Optional(t.String()),
  managerId: t.Union([UuidSchema, t.Null()]),
  managerName: t.Optional(t.String()),
  progress: t.Number(),
  taskCount: t.Number(),
  completedTaskCount: t.Number(),
  notes: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const InstanceWithTasksResponseSchema = t.Composite([
  InstanceResponseSchema,
  t.Object({
    tasks: t.Array(InstanceTaskSchema),
  }),
]);

// =============================================================================
// Task Dependency Schemas
// =============================================================================

export const TaskDependencySchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  taskId: UuidSchema,
  dependsOnTaskId: UuidSchema,
  dependsOnTaskName: t.Optional(t.String()),
  createdAt: t.String(),
});

export const CreateTaskDependencySchema = t.Object({
  taskId: UuidSchema,
  dependsOnTaskId: UuidSchema,
});

export const DeleteTaskDependencySchema = t.Object({
  taskId: UuidSchema,
  dependsOnTaskId: UuidSchema,
});

export const TaskDependencyListResponseSchema = t.Object({
  dependencies: t.Array(TaskDependencySchema),
  count: t.Number(),
});

// =============================================================================
// Task Completion Schemas
// =============================================================================

export const CompleteTaskSchema = t.Object({
  notes: t.Optional(t.String({ maxLength: 500 })),
  formData: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const SkipTaskSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
});

export const ReassignTaskSchema = t.Object({
  assigneeId: UuidSchema,
  reason: t.Optional(t.String({ maxLength: 500 })),
});

// =============================================================================
// Compliance Check Schemas
// =============================================================================

export const ComplianceCheckTypeSchema = t.Union([
  t.Literal("right_to_work"),
  t.Literal("dbs"),
  t.Literal("references"),
  t.Literal("medical"),
  t.Literal("qualifications"),
]);

export const ComplianceCheckStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("passed"),
  t.Literal("failed"),
  t.Literal("waived"),
]);

export const CreateComplianceCheckSchema = t.Object({
  checkType: ComplianceCheckTypeSchema,
  required: t.Optional(t.Boolean()),
  dueDate: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export const UpdateComplianceCheckSchema = t.Partial(
  t.Object({
    status: ComplianceCheckStatusSchema,
    dueDate: DateSchema,
    notes: t.String({ maxLength: 2000 }),
    referenceNumber: t.String({ maxLength: 200 }),
    expiresAt: DateSchema,
    waiverReason: t.String({ minLength: 1, maxLength: 2000 }),
  })
);

export const ComplianceCheckResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  onboardingId: UuidSchema,
  employeeId: UuidSchema,
  checkType: ComplianceCheckTypeSchema,
  status: ComplianceCheckStatusSchema,
  required: t.Boolean(),
  dueDate: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  completedBy: t.Union([UuidSchema, t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  waivedBy: t.Union([UuidSchema, t.Null()]),
  waiverReason: t.Union([t.String(), t.Null()]),
  referenceNumber: t.Union([t.String(), t.Null()]),
  expiresAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const ComplianceCheckListResponseSchema = t.Object({
  items: t.Array(ComplianceCheckResponseSchema),
  complianceSatisfied: t.Boolean(),
});

export const ComplianceCheckIdParamsSchema = t.Object({
  id: UuidSchema,
  checkId: UuidSchema,
});

// =============================================================================
// Analytics Schemas
// =============================================================================

export const OnboardingAnalyticsResponseSchema = t.Object({
  totalInstances: t.Number(),
  inProgressCount: t.Number(),
  completedCount: t.Number(),
  averageCompletionDays: t.Union([t.Number(), t.Null()]),
  overdueTaskCount: t.Number(),
  completionRate: t.Number(),
  byTemplate: t.Array(
    t.Object({
      templateId: UuidSchema,
      templateName: t.String(),
      count: t.Number(),
      completedCount: t.Number(),
    })
  ),
});

// =============================================================================
// Pagination & Common Schemas
// =============================================================================

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

export const TemplateFiltersSchema = t.Object({
  departmentId: t.Optional(UuidSchema),
  positionId: t.Optional(UuidSchema),
  status: t.Optional(t.String()),
  search: t.Optional(t.String()),
});

export const InstanceFiltersSchema = t.Object({
  employeeId: t.Optional(UuidSchema),
  templateId: t.Optional(UuidSchema),
  status: t.Optional(OnboardingStatusSchema),
  buddyId: t.Optional(UuidSchema),
  managerId: t.Optional(UuidSchema),
  isOverdue: t.Optional(t.Boolean()),
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const TaskIdParamsSchema = t.Object({
  id: UuidSchema,
  taskId: t.String(),
});

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String(),
});

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

// =============================================================================
// List Response Schemas
// =============================================================================

export const TemplateListResponseSchema = t.Object({
  items: t.Array(TemplateResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const InstanceListResponseSchema = t.Object({
  items: t.Array(InstanceResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// Export types
export type OnboardingStatus = typeof OnboardingStatusSchema.static;
export type TaskStatus = typeof TaskStatusSchema.static;
export type TemplateTask = typeof TemplateTaskSchema.static;
export type CreateTemplate = typeof CreateTemplateSchema.static;
export type UpdateTemplate = typeof UpdateTemplateSchema.static;
export type TemplateResponse = typeof TemplateResponseSchema.static;
export type InstanceTask = typeof InstanceTaskSchema.static;
export type CreateInstance = typeof CreateInstanceSchema.static;
export type UpdateInstance = typeof UpdateInstanceSchema.static;
export type InstanceResponse = typeof InstanceResponseSchema.static;
export type TaskDependency = typeof TaskDependencySchema.static;
export type CreateTaskDependency = typeof CreateTaskDependencySchema.static;
export type ComplianceCheckType = typeof ComplianceCheckTypeSchema.static;
export type ComplianceCheckStatus = typeof ComplianceCheckStatusSchema.static;
export type CreateComplianceCheck = typeof CreateComplianceCheckSchema.static;
export type UpdateComplianceCheck = typeof UpdateComplianceCheckSchema.static;
export type ComplianceCheckResponse = typeof ComplianceCheckResponseSchema.static;
