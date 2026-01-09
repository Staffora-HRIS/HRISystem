/**
 * Onboarding Types
 *
 * Type definitions for onboarding plans, instances, tasks,
 * and provisioning connectors.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Onboarding Plan Types
// =============================================================================

/** Plan status */
export type OnboardingPlanStatus = "draft" | "active" | "archived";

/** Plan type */
export type OnboardingPlanType =
  | "new_hire"
  | "rehire"
  | "transfer"
  | "promotion"
  | "contractor"
  | "intern";

/**
 * Onboarding plan template.
 */
export interface OnboardingPlan extends TenantScopedEntity {
  /** Plan name */
  name: string;
  /** Description */
  description?: string;
  /** Plan type */
  type: OnboardingPlanType;
  /** Plan status */
  status: OnboardingPlanStatus;
  /** Duration in days */
  durationDays: number;
  /** Location IDs (empty = all) */
  locationIds?: UUID[];
  /** Org unit IDs (empty = all) */
  orgUnitIds?: UUID[];
  /** Job grades (empty = all) */
  jobGrades?: string[];
  /** Employment types (empty = all) */
  employmentTypes?: string[];
  /** Tasks in this plan */
  tasks: OnboardingPlanTask[];
  /** Milestones */
  milestones?: OnboardingMilestone[];
  /** Welcome message template */
  welcomeMessage?: string;
  /** Preboarding enabled */
  preboardingEnabled: boolean;
  /** Days before start for preboarding */
  preboardingDays?: number;
  /** Created by user ID */
  createdBy: UUID;
  /** Version number */
  version: number;
}

/**
 * Onboarding plan task template.
 */
export interface OnboardingPlanTask {
  /** Task ID */
  id: UUID;
  /** Task name */
  name: string;
  /** Description */
  description?: string;
  /** Task category */
  category: OnboardingTaskCategory;
  /** Task type */
  type: OnboardingTaskType;
  /** Is required */
  isRequired: boolean;
  /** Days offset from start (negative for preboarding) */
  daysOffset: number;
  /** Duration in minutes (estimated) */
  durationMinutes?: number;
  /** Display order */
  sortOrder: number;
  /** Assignee type */
  assigneeType: "employee" | "manager" | "hr" | "buddy" | "it" | "specific_user" | "specific_role";
  /** Specific assignee user ID */
  assigneeUserId?: UUID;
  /** Specific assignee role */
  assigneeRole?: string;
  /** Dependent task IDs */
  dependsOn?: UUID[];
  /** Instructions */
  instructions?: string;
  /** Resource URLs */
  resourceUrls?: string[];
  /** Form to complete */
  formId?: UUID;
  /** Document to sign */
  documentTemplateId?: UUID;
  /** Course to complete */
  courseId?: UUID;
  /** Provisioning connector ID */
  provisioningConnectorId?: UUID;
  /** Notification settings */
  notifications?: {
    notifyOnAssign: boolean;
    reminderDays?: number[];
    escalateDays?: number;
  };
}

/** Task category */
export type OnboardingTaskCategory =
  | "paperwork"
  | "training"
  | "it_setup"
  | "facilities"
  | "introductions"
  | "compliance"
  | "benefits"
  | "general";

/** Task type */
export type OnboardingTaskType =
  | "manual"
  | "form"
  | "document_sign"
  | "course"
  | "meeting"
  | "provisioning"
  | "verification"
  | "acknowledgment";

/**
 * Onboarding milestone.
 */
export interface OnboardingMilestone {
  /** Milestone ID */
  id: UUID;
  /** Milestone name */
  name: string;
  /** Description */
  description?: string;
  /** Days offset from start */
  daysOffset: number;
  /** Required task IDs */
  requiredTaskIds: UUID[];
  /** Celebration message */
  celebrationMessage?: string;
  /** Badge to award */
  badgeId?: UUID;
}

// =============================================================================
// Onboarding Instance Types
// =============================================================================

/** Instance status */
export type OnboardingInstanceStatus =
  | "pending"
  | "preboarding"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "on_hold";

/**
 * Onboarding instance for an employee.
 */
export interface OnboardingInstance extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Plan ID */
  planId: UUID;
  /** Plan version (snapshot) */
  planVersion: number;
  /** Instance status */
  status: OnboardingInstanceStatus;
  /** Start date */
  startDate: DateString;
  /** Target completion date */
  targetCompletionDate: DateString;
  /** Actual completion date */
  completedAt?: TimestampString;
  /** Manager employee ID */
  managerId?: UUID;
  /** Buddy employee ID */
  buddyId?: UUID;
  /** HR contact user ID */
  hrContactId?: UUID;
  /** Progress percentage */
  progressPercent: number;
  /** Tasks completed count */
  tasksCompleted: number;
  /** Tasks total count */
  tasksTotal: number;
  /** Current milestone */
  currentMilestone?: string;
  /** Milestones achieved */
  milestonesAchieved: string[];
  /** Notes */
  notes?: string;
  /** Custom task additions */
  customTasks?: OnboardingPlanTask[];
  /** Workflow instance ID */
  workflowInstanceId?: UUID;
  /** Last activity timestamp */
  lastActivityAt: TimestampString;
}

// =============================================================================
// Onboarding Task Instance Types
// =============================================================================

/** Task status */
export type OnboardingTaskStatus =
  | "pending"
  | "available"
  | "in_progress"
  | "completed"
  | "skipped"
  | "blocked"
  | "overdue";

/**
 * Onboarding task instance.
 */
export interface OnboardingTask extends TenantScopedEntity {
  /** Instance ID */
  instanceId: UUID;
  /** Plan task ID */
  planTaskId: UUID;
  /** Task name */
  name: string;
  /** Description */
  description?: string;
  /** Task category */
  category: OnboardingTaskCategory;
  /** Task type */
  type: OnboardingTaskType;
  /** Task status */
  status: OnboardingTaskStatus;
  /** Is required */
  isRequired: boolean;
  /** Due date */
  dueDate: DateString;
  /** Assigned to user ID */
  assignedToId: UUID;
  /** Assigned to type */
  assignedToType: string;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Completed by user ID */
  completedBy?: UUID;
  /** Skipped reason */
  skippedReason?: string;
  /** Form submission ID */
  formSubmissionId?: UUID;
  /** Document signature ID */
  documentSignatureId?: UUID;
  /** Course assignment ID */
  courseAssignmentId?: UUID;
  /** Provisioning request ID */
  provisioningRequestId?: UUID;
  /** Notes */
  notes?: string;
  /** Verification required */
  verificationRequired: boolean;
  /** Verified by user ID */
  verifiedBy?: UUID;
  /** Verified timestamp */
  verifiedAt?: TimestampString;
}

/**
 * Onboarding task event for history.
 */
export interface OnboardingTaskEvent extends TenantScopedEntity {
  /** Task ID */
  taskId: UUID;
  /** Event type */
  eventType:
    | "created"
    | "assigned"
    | "started"
    | "completed"
    | "skipped"
    | "blocked"
    | "unblocked"
    | "reassigned"
    | "reminder_sent"
    | "escalated"
    | "verified";
  /** Event timestamp */
  eventAt: TimestampString;
  /** Actor user ID */
  actorId?: UUID;
  /** Previous status */
  fromStatus?: OnboardingTaskStatus;
  /** New status */
  toStatus?: OnboardingTaskStatus;
  /** Notes */
  notes?: string;
  /** Additional data */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Provisioning Types
// =============================================================================

/** Connector type */
export type ProvisioningConnectorType =
  | "active_directory"
  | "azure_ad"
  | "google_workspace"
  | "okta"
  | "slack"
  | "microsoft_365"
  | "salesforce"
  | "jira"
  | "github"
  | "custom_api"
  | "manual";

/** Connector status */
export type ProvisioningConnectorStatus =
  | "active"
  | "inactive"
  | "error"
  | "pending_setup";

/**
 * Provisioning connector for automated account creation.
 */
export interface ProvisioningConnector extends TenantScopedEntity {
  /** Connector name */
  name: string;
  /** Description */
  description?: string;
  /** Connector type */
  type: ProvisioningConnectorType;
  /** Status */
  status: ProvisioningConnectorStatus;
  /** Configuration (encrypted) */
  config: Record<string, unknown>;
  /** Actions supported */
  supportedActions: ("create" | "update" | "disable" | "delete")[];
  /** Attribute mappings */
  attributeMappings: Array<{
    source: string;
    target: string;
    transform?: string;
  }>;
  /** Default groups/roles to assign */
  defaultGroups?: string[];
  /** Last sync timestamp */
  lastSyncAt?: TimestampString;
  /** Last sync status */
  lastSyncStatus?: "success" | "partial" | "failed";
  /** Error message */
  errorMessage?: string;
  /** Test connection timestamp */
  lastTestedAt?: TimestampString;
  /** Created by user ID */
  createdBy: UUID;
}

/** Request status */
export type ProvisioningRequestStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "manual_required";

/**
 * Provisioning request.
 */
export interface ProvisioningRequest extends TenantScopedEntity {
  /** Onboarding task ID */
  taskId?: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Connector ID */
  connectorId: UUID;
  /** Action type */
  action: "create" | "update" | "disable" | "delete";
  /** Request status */
  status: ProvisioningRequestStatus;
  /** Input data */
  inputData: Record<string, unknown>;
  /** Output data (account details) */
  outputData?: Record<string, unknown>;
  /** Created username/email */
  createdIdentifier?: string;
  /** Error message */
  errorMessage?: string;
  /** Retry count */
  retryCount: number;
  /** Max retries */
  maxRetries: number;
  /** Next retry timestamp */
  nextRetryAt?: TimestampString;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Requires manual intervention */
  requiresManual: boolean;
  /** Manual instructions */
  manualInstructions?: string;
  /** Verified by user ID */
  verifiedBy?: UUID;
  /** Verified timestamp */
  verifiedAt?: TimestampString;
}

// =============================================================================
// Onboarding Analytics Types
// =============================================================================

/**
 * Onboarding analytics summary.
 */
export interface OnboardingAnalytics {
  /** Active onboarding count */
  activeCount: number;
  /** Completed this month */
  completedThisMonth: number;
  /** Average completion rate */
  avgCompletionRate: number;
  /** Average days to complete */
  avgDaysToComplete: number;
  /** Tasks by status */
  tasksByStatus: Record<OnboardingTaskStatus, number>;
  /** Top delayed tasks */
  topDelayedTasks: Array<{
    taskName: string;
    avgDelayDays: number;
    count: number;
  }>;
  /** Completion by department */
  completionByDepartment: Array<{
    departmentId: UUID;
    departmentName: string;
    avgCompletionRate: number;
    avgDays: number;
  }>;
  /** Feedback scores */
  feedbackScores?: {
    overall: number;
    clarity: number;
    helpfulness: number;
    timeliness: number;
  };
}

// =============================================================================
// Onboarding Survey Types
// =============================================================================

/**
 * Onboarding survey response.
 */
export interface OnboardingSurvey extends TenantScopedEntity {
  /** Instance ID */
  instanceId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Survey type */
  surveyType: "day_1" | "week_1" | "month_1" | "month_3" | "completion";
  /** Overall rating (1-5) */
  overallRating: number;
  /** Responses */
  responses: Array<{
    question: string;
    rating?: number;
    answer?: string;
  }>;
  /** Additional comments */
  comments?: string;
  /** Submitted timestamp */
  submittedAt: TimestampString;
  /** Is anonymous */
  isAnonymous: boolean;
}
