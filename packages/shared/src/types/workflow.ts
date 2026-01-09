/**
 * Workflow Types
 *
 * Type definitions for workflow definitions, instances, tasks,
 * transitions, and SLAs.
 */

import type {
  UUID,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Workflow Definition Types
// =============================================================================

/** Workflow status */
export type WorkflowStatus = "draft" | "active" | "deprecated" | "archived";

/** Workflow trigger type */
export type WorkflowTrigger =
  | "manual"
  | "event"
  | "schedule"
  | "api"
  | "record_change";

/** Workflow category */
export type WorkflowCategory =
  | "approval"
  | "onboarding"
  | "offboarding"
  | "leave"
  | "expense"
  | "performance"
  | "recruitment"
  | "case"
  | "general";

/**
 * Workflow definition (blueprint).
 */
export interface WorkflowDefinition extends TenantScopedEntity {
  /** Workflow name */
  name: string;
  /** Description */
  description?: string;
  /** Workflow code (unique identifier) */
  code: string;
  /** Category */
  category: WorkflowCategory;
  /** Current status */
  status: WorkflowStatus;
  /** Current active version number */
  currentVersion: number;
  /** Trigger type */
  trigger: WorkflowTrigger;
  /** Event type that triggers this workflow */
  triggerEvent?: string;
  /** Schedule expression (for scheduled workflows) */
  scheduleExpression?: string;
  /** Entity type this workflow applies to */
  entityType?: string;
  /** Whether workflow is system-defined */
  isSystem: boolean;
  /** Created by user ID */
  createdBy: UUID;
  /** Tags for categorization */
  tags?: string[];
  /** Default SLA configuration */
  defaultSla?: WorkflowSLAConfig;
}

/**
 * Workflow version (immutable snapshot).
 */
export interface WorkflowVersion extends TenantScopedEntity {
  /** Parent workflow definition ID */
  workflowDefinitionId: UUID;
  /** Version number */
  version: number;
  /** Version status */
  status: "draft" | "active" | "deprecated";
  /** Steps in this workflow */
  steps: WorkflowStep[];
  /** Transitions between steps */
  transitions: WorkflowTransition[];
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Variables available in workflow */
  variables?: WorkflowVariable[];
  /** Published timestamp */
  publishedAt?: TimestampString;
  /** Published by user ID */
  publishedBy?: UUID;
  /** Change notes */
  changeNotes?: string;
}

/** Step type */
export type WorkflowStepType =
  | "start"
  | "end"
  | "approval"
  | "task"
  | "notification"
  | "decision"
  | "parallel_gateway"
  | "join_gateway"
  | "timer"
  | "script"
  | "integration"
  | "subprocess";

/**
 * Workflow step definition.
 */
export interface WorkflowStep {
  /** Step ID (unique within workflow) */
  id: string;
  /** Step name */
  name: string;
  /** Step type */
  type: WorkflowStepType;
  /** Description */
  description?: string;
  /** Step configuration */
  config: WorkflowStepConfig;
  /** Position in designer (x, y) */
  position?: { x: number; y: number };
  /** Whether step is required */
  isRequired: boolean;
  /** SLA override for this step */
  sla?: WorkflowSLAConfig;
}

/**
 * Step configuration (varies by type).
 */
export interface WorkflowStepConfig {
  /** For approval steps: assignee configuration */
  assignee?: {
    type: "user" | "role" | "manager" | "dynamic" | "pool";
    value?: string;
    expression?: string;
    poolMembers?: string[];
  };
  /** For notification steps: notification config */
  notification?: {
    template: string;
    recipients: string[];
    channels: ("email" | "in_app" | "sms")[];
  };
  /** For decision steps: conditions */
  conditions?: Array<{
    expression: string;
    targetStepId: string;
  }>;
  /** For timer steps: duration or date */
  timer?: {
    type: "duration" | "date" | "expression";
    value: string;
  };
  /** For script steps: script configuration */
  script?: {
    language: "javascript" | "python";
    code: string;
  };
  /** For integration steps: integration config */
  integration?: {
    type: string;
    endpoint?: string;
    method?: string;
    payload?: Record<string, unknown>;
  };
  /** For subprocess: subprocess workflow ID */
  subprocessWorkflowId?: UUID;
  /** Form configuration for user input */
  form?: {
    fields: Array<{
      name: string;
      type: string;
      label: string;
      required: boolean;
      options?: Array<{ value: string; label: string }>;
    }>;
  };
  /** Completion conditions */
  completionConditions?: {
    /** For parallel approval: all/any/percentage */
    mode: "all" | "any" | "percentage";
    percentage?: number;
  };
}

/**
 * Workflow variable definition.
 */
export interface WorkflowVariable {
  /** Variable name */
  name: string;
  /** Variable type */
  type: "string" | "number" | "boolean" | "date" | "object" | "array";
  /** Default value */
  defaultValue?: unknown;
  /** Description */
  description?: string;
  /** Whether variable is required */
  required: boolean;
}

/**
 * Workflow transition between steps.
 */
export interface WorkflowTransition {
  /** Transition ID */
  id: string;
  /** Source step ID */
  fromStepId: string;
  /** Target step ID */
  toStepId: string;
  /** Transition label */
  label?: string;
  /** Condition expression (optional) */
  condition?: string;
  /** Action to trigger transition */
  action?: string;
  /** Priority for condition evaluation */
  priority: number;
}

// =============================================================================
// Workflow Instance Types
// =============================================================================

/** Instance status */
export type WorkflowInstanceStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "terminated";

/**
 * Workflow instance (running workflow).
 */
export interface WorkflowInstance extends TenantScopedEntity {
  /** Workflow definition ID */
  workflowDefinitionId: UUID;
  /** Workflow version ID */
  workflowVersionId: UUID;
  /** Instance status */
  status: WorkflowInstanceStatus;
  /** Entity type */
  entityType?: string;
  /** Entity ID */
  entityId?: UUID;
  /** Current step ID(s) */
  currentStepIds: string[];
  /** Instance variables/context */
  context: Record<string, unknown>;
  /** Input data */
  inputData?: Record<string, unknown>;
  /** Output data (upon completion) */
  outputData?: Record<string, unknown>;
  /** Started timestamp */
  startedAt: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Started by user ID */
  startedBy: UUID;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Parent instance ID (if subprocess) */
  parentInstanceId?: UUID;
  /** SLA due date */
  slaDueAt?: TimestampString;
  /** Whether SLA is breached */
  slaBreached: boolean;
  /** Correlation ID for related instances */
  correlationId?: string;
}

// =============================================================================
// Workflow Task Types
// =============================================================================

/** Task status */
export type WorkflowTaskStatus =
  | "pending"
  | "assigned"
  | "in_progress"
  | "completed"
  | "skipped"
  | "failed"
  | "escalated"
  | "delegated"
  | "timed_out";

/** Task priority */
export type WorkflowTaskPriority = "low" | "normal" | "high" | "urgent";

/**
 * Workflow task (work item).
 */
export interface WorkflowTask extends TenantScopedEntity {
  /** Instance ID */
  workflowInstanceId: UUID;
  /** Step ID */
  stepId: string;
  /** Step name */
  stepName: string;
  /** Task status */
  status: WorkflowTaskStatus;
  /** Task priority */
  priority: WorkflowTaskPriority;
  /** Assigned user ID */
  assignedToId?: UUID;
  /** Assigned role */
  assignedToRole?: string;
  /** Pool of potential assignees */
  assigneePool?: UUID[];
  /** Claimed by user ID */
  claimedBy?: UUID;
  /** Claimed timestamp */
  claimedAt?: TimestampString;
  /** Due date */
  dueAt?: TimestampString;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Completion action */
  completionAction?: string;
  /** Form data submitted */
  formData?: Record<string, unknown>;
  /** Comments */
  comments?: string;
  /** Outcome */
  outcome?: string;
  /** Delegated from user ID */
  delegatedFromId?: UUID;
  /** Delegation reason */
  delegationReason?: string;
  /** Escalation level */
  escalationLevel: number;
  /** SLA due timestamp */
  slaDueAt?: TimestampString;
  /** Reminder sent */
  reminderSentAt?: TimestampString;
}

// =============================================================================
// Workflow SLA Types
// =============================================================================

/** SLA action type */
export type SLAActionType =
  | "notify"
  | "escalate"
  | "reassign"
  | "auto_complete"
  | "terminate";

/**
 * SLA configuration.
 */
export interface WorkflowSLAConfig {
  /** Target duration in hours */
  targetDurationHours: number;
  /** Warning threshold percentage */
  warningThresholdPercent: number;
  /** Escalation threshold percentage */
  escalationThresholdPercent: number;
  /** Actions to take on warning */
  warningActions?: SLAAction[];
  /** Actions to take on breach */
  breachActions?: SLAAction[];
  /** Whether to exclude weekends */
  excludeWeekends: boolean;
  /** Whether to exclude holidays */
  excludeHolidays: boolean;
  /** Business hours start (HH:mm) */
  businessHoursStart?: string;
  /** Business hours end (HH:mm) */
  businessHoursEnd?: string;
}

/**
 * SLA action.
 */
export interface SLAAction {
  /** Action type */
  type: SLAActionType;
  /** Action configuration */
  config: {
    /** For notify: recipients */
    recipients?: string[];
    /** For notify: notification template */
    template?: string;
    /** For escalate: escalation level */
    escalationLevel?: number;
    /** For reassign: new assignee */
    assigneeId?: UUID;
    /** For auto_complete: completion action */
    completionAction?: string;
  };
}

/**
 * SLA event record.
 */
export interface WorkflowSLAEvent extends TenantScopedEntity {
  /** Instance ID */
  workflowInstanceId: UUID;
  /** Task ID (if task-level SLA) */
  workflowTaskId?: UUID;
  /** Event type */
  eventType: "warning" | "breach" | "met";
  /** Event timestamp */
  eventAt: TimestampString;
  /** Target duration */
  targetDurationHours: number;
  /** Actual duration */
  actualDurationHours: number;
  /** Actions taken */
  actionsTaken: SLAAction[];
}

// =============================================================================
// Workflow History Types
// =============================================================================

/** History event type */
export type WorkflowHistoryEventType =
  | "instance_started"
  | "instance_completed"
  | "instance_failed"
  | "instance_cancelled"
  | "step_entered"
  | "step_completed"
  | "task_created"
  | "task_assigned"
  | "task_claimed"
  | "task_completed"
  | "task_delegated"
  | "task_escalated"
  | "variable_changed"
  | "sla_warning"
  | "sla_breach"
  | "comment_added"
  | "error_occurred";

/**
 * Workflow history event for audit trail.
 */
export interface WorkflowHistoryEvent extends TenantScopedEntity {
  /** Instance ID */
  workflowInstanceId: UUID;
  /** Task ID (if task-related) */
  workflowTaskId?: UUID;
  /** Event type */
  eventType: WorkflowHistoryEventType;
  /** Event timestamp */
  eventAt: TimestampString;
  /** Step ID */
  stepId?: string;
  /** Actor user ID */
  actorId?: UUID;
  /** Event details */
  details: Record<string, unknown>;
  /** Old value (for changes) */
  oldValue?: unknown;
  /** New value (for changes) */
  newValue?: unknown;
}
