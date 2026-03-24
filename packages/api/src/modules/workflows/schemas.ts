/**
 * Workflows Module Schemas
 *
 * Defines workflow definitions, instances, steps, and transitions.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Condition Rules Schemas (for conditional workflow branching)
// =============================================================================

export const ConditionOperatorSchema = t.Union([
  t.Literal("field_equals"),
  t.Literal("field_not_equals"),
  t.Literal("field_greater_than"),
  t.Literal("field_less_than"),
  t.Literal("field_greater_than_or_equal"),
  t.Literal("field_less_than_or_equal"),
  t.Literal("field_contains"),
  t.Literal("field_not_contains"),
  t.Literal("field_in"),
  t.Literal("field_not_in"),
  t.Literal("field_is_empty"),
  t.Literal("field_is_not_empty"),
]);
export type ConditionOperator = Static<typeof ConditionOperatorSchema>;

export const ConditionSchema = t.Object({
  field: t.String({ minLength: 1, maxLength: 200, description: "Dot-notation path to the field in context data" }),
  operator: ConditionOperatorSchema,
  value: t.Optional(t.Unknown({ description: "Value to compare against. Not required for field_is_empty/field_is_not_empty." })),
});
export type ConditionSchemaType = Static<typeof ConditionSchema>;

export const ConditionRulesSchema = t.Object({
  match: t.Union([t.Literal("all"), t.Literal("any")], { default: "all", description: "Combinator: 'all' = AND, 'any' = OR" }),
  conditions: t.Array(ConditionSchema, { minItems: 1, description: "Array of conditions to evaluate" }),
});
export type ConditionRulesSchemaType = Static<typeof ConditionRulesSchema>;

// Enums
export const WorkflowStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("active"),
  t.Literal("inactive"),
  t.Literal("archived"),
]);
export type WorkflowStatus = Static<typeof WorkflowStatusSchema>;

export const InstanceStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("cancelled"),
  t.Literal("failed"),
]);
export type InstanceStatus = Static<typeof InstanceStatusSchema>;

export const StepTypeSchema = t.Union([
  t.Literal("approval"),
  t.Literal("notification"),
  t.Literal("task"),
  t.Literal("condition"),
  t.Literal("parallel"),
  t.Literal("subprocess"),
]);
export type StepType = Static<typeof StepTypeSchema>;

export const StepStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("active"),
  t.Literal("completed"),
  t.Literal("skipped"),
  t.Literal("failed"),
]);
export type StepStatus = Static<typeof StepStatusSchema>;

export const ApprovalDecisionSchema = t.Union([
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("returned"),
]);
export type ApprovalDecision = Static<typeof ApprovalDecisionSchema>;

// Common
export const UuidSchema = t.String({ format: "uuid" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  category: t.Optional(t.String({ maxLength: 50 })),
  status: t.Optional(t.Union([t.Literal("active"), t.Literal("inactive")])),
});

// Workflow Definition Schemas
export const WorkflowStepConfigSchema = t.Object({
  stepKey: t.String({ minLength: 1, maxLength: 50 }),
  stepType: StepTypeSchema,
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  assigneeType: t.Optional(t.Union([
    t.Literal("user"),
    t.Literal("role"),
    t.Literal("manager"),
    t.Literal("dynamic"),
  ])),
  assigneeValue: t.Optional(t.String()),
  timeoutHours: t.Optional(t.Number({ minimum: 1, maximum: 720 })),
  escalationConfig: t.Optional(t.Object({
    escalateAfterHours: t.Number(),
    escalateTo: t.String(),
  })),
  conditions: t.Optional(t.Array(t.Object({
    field: t.String(),
    operator: t.String(),
    value: t.Unknown(),
  }))),
  conditionRules: t.Optional(ConditionRulesSchema),
  nextSteps: t.Optional(t.Array(t.Object({
    stepKey: t.String(),
    condition: t.Optional(t.String()),
    conditionRules: t.Optional(ConditionRulesSchema),
  }))),
});
export type WorkflowStepConfig = Static<typeof WorkflowStepConfigSchema>;

export const CreateWorkflowDefinitionSchema = t.Object({
  code: t.String({ minLength: 1, maxLength: 50 }),
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  category: t.String({ minLength: 1, maxLength: 50 }),
  triggerType: t.Union([
    t.Literal("manual"),
    t.Literal("event"),
    t.Literal("scheduled"),
  ]),
  triggerConfig: t.Optional(t.Object({
    eventType: t.Optional(t.String()),
    schedule: t.Optional(t.String()),
  })),
  steps: t.Array(WorkflowStepConfigSchema, { minItems: 1 }),
  version: t.Optional(t.Number({ default: 1 })),
});
export type CreateWorkflowDefinition = Static<typeof CreateWorkflowDefinitionSchema>;

export const UpdateWorkflowDefinitionSchema = t.Partial(t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.String({ maxLength: 1000 }),
  status: WorkflowStatusSchema,
  steps: t.Array(WorkflowStepConfigSchema),
}));
export type UpdateWorkflowDefinition = Static<typeof UpdateWorkflowDefinitionSchema>;

export const WorkflowDefinitionResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  code: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  category: t.String(),
  triggerType: t.String(),
  triggerConfig: t.Nullable(t.Unknown()),
  steps: t.Array(t.Unknown()),
  status: WorkflowStatusSchema,
  version: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type WorkflowDefinitionResponse = Static<typeof WorkflowDefinitionResponseSchema>;

// Workflow Instance Schemas
export const CreateWorkflowInstanceSchema = t.Object({
  workflowDefinitionId: UuidSchema,
  entityType: t.String({ minLength: 1, maxLength: 50 }),
  entityId: UuidSchema,
  initiatorId: UuidSchema,
  contextData: t.Optional(t.Record(t.String(), t.Unknown())),
});
export type CreateWorkflowInstance = Static<typeof CreateWorkflowInstanceSchema>;

export const WorkflowInstanceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  workflowDefinitionId: UuidSchema,
  workflowName: t.String(),
  entityType: t.String(),
  entityId: UuidSchema,
  initiatorId: UuidSchema,
  status: InstanceStatusSchema,
  currentStepKey: t.Nullable(t.String()),
  contextData: t.Nullable(t.Unknown()),
  startedAt: t.String(),
  completedAt: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});
export type WorkflowInstanceResponse = Static<typeof WorkflowInstanceResponseSchema>;

export const WorkflowInstanceFiltersSchema = t.Object({
  workflowDefinitionId: t.Optional(UuidSchema),
  entityType: t.Optional(t.String()),
  entityId: t.Optional(UuidSchema),
  status: t.Optional(InstanceStatusSchema),
  initiatorId: t.Optional(UuidSchema),
  ...PaginationQuerySchema.properties,
});
export type WorkflowInstanceFilters = Static<typeof WorkflowInstanceFiltersSchema>;

// Step Instance Schemas
export const StepInstanceResponseSchema = t.Object({
  id: UuidSchema,
  workflowInstanceId: UuidSchema,
  stepKey: t.String(),
  stepType: StepTypeSchema,
  stepName: t.String(),
  status: StepStatusSchema,
  assigneeId: t.Nullable(UuidSchema),
  assigneeName: t.Nullable(t.String()),
  dueAt: t.Nullable(t.String()),
  startedAt: t.Nullable(t.String()),
  completedAt: t.Nullable(t.String()),
  decision: t.Nullable(ApprovalDecisionSchema),
  comments: t.Nullable(t.String()),
  createdAt: t.String(),
});
export type StepInstanceResponse = Static<typeof StepInstanceResponseSchema>;

// Action Schemas
export const ProcessStepActionSchema = t.Object({
  decision: ApprovalDecisionSchema,
  comments: t.Optional(t.String({ maxLength: 1000 })),
  delegateTo: t.Optional(UuidSchema),
});
export type ProcessStepAction = Static<typeof ProcessStepActionSchema>;

export const ReassignStepSchema = t.Object({
  newAssigneeId: UuidSchema,
  reason: t.Optional(t.String({ maxLength: 500 })),
});
export type ReassignStep = Static<typeof ReassignStepSchema>;

// Params
export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const StepIdParamsSchema = t.Object({
  id: UuidSchema,
  stepId: UuidSchema,
});
export type StepIdParams = Static<typeof StepIdParamsSchema>;

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String({ minLength: 1 }),
});
export type IdempotencyHeader = Static<typeof IdempotencyHeaderSchema>;

// =============================================================================
// SLA Escalation History
// =============================================================================

export const EscalationHistoryQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  workflow_instance_id: t.Optional(t.String({ format: "uuid" })),
  task_id: t.Optional(t.String({ format: "uuid" })),
});

export type EscalationHistoryQuery = Static<typeof EscalationHistoryQuerySchema>;
