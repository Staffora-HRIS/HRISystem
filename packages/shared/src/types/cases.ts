/**
 * Case Management Types
 *
 * Type definitions for HR cases, case types, statuses,
 * participants, comments, attachments, and SLA tracking.
 */

import type {
  UUID,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Case Type Definitions
// =============================================================================

/** Case type category */
export type CaseTypeCategory =
  | "hr_inquiry"
  | "benefits"
  | "payroll"
  | "compliance"
  | "employee_relations"
  | "accommodation"
  | "grievance"
  | "policy_question"
  | "leave_management"
  | "onboarding"
  | "offboarding"
  | "other";

/**
 * Case type definition.
 */
export interface CaseType extends TenantScopedEntity {
  /** Case type code */
  code: string;
  /** Case type name */
  name: string;
  /** Description */
  description?: string;
  /** Category */
  category: CaseTypeCategory;
  /** Default priority */
  defaultPriority: CasePriority;
  /** Is restricted (confidential) */
  isRestricted: boolean;
  /** Allowed access roles */
  allowedRoles?: string[];
  /** Default assignee role */
  defaultAssigneeRole?: string;
  /** Default assignee user ID */
  defaultAssigneeId?: UUID;
  /** SLA configuration */
  slaConfig?: CaseSLAConfig;
  /** Workflow ID to trigger */
  workflowId?: UUID;
  /** Required fields */
  requiredFields?: string[];
  /** Custom form fields */
  customFields?: CaseCustomField[];
  /** Is active */
  isActive: boolean;
  /** Display order */
  sortOrder: number;
  /** Allowed statuses */
  allowedStatuses?: CaseStatus[];
  /** Status transitions */
  statusTransitions?: Array<{
    from: CaseStatus;
    to: CaseStatus[];
  }>;
}

/**
 * Custom field definition for cases.
 */
export interface CaseCustomField {
  /** Field ID */
  id: string;
  /** Field name */
  name: string;
  /** Field label */
  label: string;
  /** Field type */
  type: "text" | "textarea" | "number" | "date" | "select" | "multiselect" | "checkbox";
  /** Is required */
  required: boolean;
  /** Options (for select/multiselect) */
  options?: Array<{ value: string; label: string }>;
  /** Placeholder text */
  placeholder?: string;
  /** Help text */
  helpText?: string;
  /** Validation pattern */
  validationPattern?: string;
  /** Display order */
  sortOrder: number;
}

// =============================================================================
// Case Status Types
// =============================================================================

/** Case status */
export type CaseStatus =
  | "new"
  | "open"
  | "in_progress"
  | "pending_info"
  | "escalated"
  | "on_hold"
  | "resolved"
  | "closed"
  | "cancelled";

/** Case priority */
export type CasePriority = "low" | "medium" | "high" | "critical";

// =============================================================================
// Case Entity Types
// =============================================================================

/**
 * HR case entity.
 */
export interface Case extends TenantScopedEntity {
  /** Case number (human-readable) */
  caseNumber: string;
  /** Case type ID */
  caseTypeId: UUID;
  /** Subject/title */
  subject: string;
  /** Description */
  description: string;
  /** Current status */
  status: CaseStatus;
  /** Priority */
  priority: CasePriority;
  /** Is restricted/confidential */
  isRestricted: boolean;
  /** Requester employee ID */
  requesterId: UUID;
  /** On behalf of employee ID (if different from requester) */
  onBehalfOfId?: UUID;
  /** Assigned to user ID */
  assignedToId?: UUID;
  /** Assigned to team/group */
  assignedToTeam?: string;
  /** Escalated to user ID */
  escalatedToId?: UUID;
  /** Escalation level */
  escalationLevel: number;
  /** Source channel */
  source: "web" | "email" | "phone" | "chat" | "walk_in" | "manager_referral";
  /** Related case IDs */
  relatedCaseIds?: UUID[];
  /** Parent case ID (for sub-cases) */
  parentCaseId?: UUID;
  /** Tags */
  tags?: string[];
  /** Custom field values */
  customFieldValues?: Record<string, unknown>;
  /** Resolution summary */
  resolutionSummary?: string;
  /** Resolution category */
  resolutionCategory?: string;
  /** Satisfaction rating (1-5) */
  satisfactionRating?: number;
  /** Satisfaction feedback */
  satisfactionFeedback?: string;
  /** SLA due timestamp */
  slaDueAt?: TimestampString;
  /** First response timestamp */
  firstResponseAt?: TimestampString;
  /** Resolved timestamp */
  resolvedAt?: TimestampString;
  /** Closed timestamp */
  closedAt?: TimestampString;
  /** Reopened count */
  reopenedCount: number;
  /** Last activity timestamp */
  lastActivityAt: TimestampString;
  /** Workflow instance ID */
  workflowInstanceId?: UUID;
}

// =============================================================================
// Case Participant Types
// =============================================================================

/** Participant role */
export type CaseParticipantRole =
  | "requester"
  | "subject"
  | "assignee"
  | "watcher"
  | "approver"
  | "contributor";

/**
 * Case participant.
 */
export interface CaseParticipant extends TenantScopedEntity {
  /** Case ID */
  caseId: UUID;
  /** User ID */
  userId?: UUID;
  /** Employee ID */
  employeeId?: UUID;
  /** External email (for non-employees) */
  externalEmail?: string;
  /** Participant role */
  role: CaseParticipantRole;
  /** Is primary for this role */
  isPrimary: boolean;
  /** Added timestamp */
  addedAt: TimestampString;
  /** Added by user ID */
  addedBy: UUID;
  /** Removed timestamp */
  removedAt?: TimestampString;
  /** Can edit case */
  canEdit: boolean;
  /** Can view restricted info */
  canViewRestricted: boolean;
  /** Notification preferences */
  notifyOnUpdate: boolean;
  /** Notify on status change */
  notifyOnStatusChange: boolean;
  /** Notify on comment */
  notifyOnComment: boolean;
}

// =============================================================================
// Case Comment Types
// =============================================================================

/** Comment visibility */
export type CommentVisibility = "public" | "internal" | "private";

/**
 * Case comment.
 */
export interface CaseComment extends TenantScopedEntity {
  /** Case ID */
  caseId: UUID;
  /** Author user ID */
  authorId: UUID;
  /** Comment content */
  content: string;
  /** Visibility */
  visibility: CommentVisibility;
  /** Is system-generated */
  isSystem: boolean;
  /** Parent comment ID (for replies) */
  parentCommentId?: UUID;
  /** Mentioned user IDs */
  mentionedUserIds?: UUID[];
  /** Edited timestamp */
  editedAt?: TimestampString;
  /** Deleted timestamp */
  deletedAt?: TimestampString;
  /** Attachment IDs */
  attachmentIds?: UUID[];
}

// =============================================================================
// Case Attachment Types
// =============================================================================

/**
 * Case attachment.
 */
export interface CaseAttachment extends TenantScopedEntity {
  /** Case ID */
  caseId: UUID;
  /** Comment ID (if attached to comment) */
  commentId?: UUID;
  /** File name */
  fileName: string;
  /** Original file name */
  originalFileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type */
  mimeType: string;
  /** Storage path/URL */
  storagePath: string;
  /** Is confidential */
  isConfidential: boolean;
  /** Uploaded by user ID */
  uploadedBy: UUID;
  /** Upload timestamp */
  uploadedAt: TimestampString;
  /** Virus scan status */
  scanStatus: "pending" | "clean" | "infected" | "error";
  /** Scan timestamp */
  scannedAt?: TimestampString;
  /** Description */
  description?: string;
}

// =============================================================================
// Case History Types
// =============================================================================

/** Status change event */
export interface CaseStatusHistory extends TenantScopedEntity {
  /** Case ID */
  caseId: UUID;
  /** Previous status */
  fromStatus: CaseStatus | null;
  /** New status */
  toStatus: CaseStatus;
  /** Changed by user ID */
  changedBy: UUID;
  /** Change timestamp */
  changedAt: TimestampString;
  /** Reason for change */
  reason?: string;
  /** Duration in previous status (minutes) */
  durationMinutes?: number;
}

// =============================================================================
// Case SLA Types
// =============================================================================

/**
 * SLA configuration for case types.
 */
export interface CaseSLAConfig {
  /** First response target (hours) */
  firstResponseHours: number;
  /** Resolution target (hours) by priority */
  resolutionHours: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Business hours only */
  businessHoursOnly: boolean;
  /** Business hours start */
  businessHoursStart?: string;
  /** Business hours end */
  businessHoursEnd?: string;
  /** Exclude weekends */
  excludeWeekends: boolean;
  /** Exclude holidays */
  excludeHolidays: boolean;
  /** Escalation rules */
  escalationRules?: Array<{
    /** Percentage of SLA elapsed */
    thresholdPercent: number;
    /** Action to take */
    action: "notify" | "escalate" | "reassign";
    /** Target user/role */
    target?: string;
    /** Notification template */
    notificationTemplate?: string;
  }>;
}

/**
 * SLA event tracking.
 */
export interface CaseSLAEvent extends TenantScopedEntity {
  /** Case ID */
  caseId: UUID;
  /** Event type */
  eventType:
    | "sla_started"
    | "sla_paused"
    | "sla_resumed"
    | "sla_warning"
    | "sla_breached"
    | "sla_met"
    | "first_response";
  /** Event timestamp */
  eventAt: TimestampString;
  /** SLA type */
  slaType: "first_response" | "resolution";
  /** Target timestamp */
  targetAt?: TimestampString;
  /** Actual timestamp (for met/breached) */
  actualAt?: TimestampString;
  /** Duration at event (minutes) */
  elapsedMinutes: number;
  /** Target duration (minutes) */
  targetMinutes: number;
  /** Triggered action */
  triggeredAction?: string;
  /** Notes */
  notes?: string;
}

// =============================================================================
// Case Template Types
// =============================================================================

/**
 * Case response template.
 */
export interface CaseTemplate extends TenantScopedEntity {
  /** Template name */
  name: string;
  /** Description */
  description?: string;
  /** Case type IDs (empty = all) */
  caseTypeIds?: UUID[];
  /** Subject template */
  subjectTemplate?: string;
  /** Content template */
  contentTemplate: string;
  /** Template variables */
  variables?: string[];
  /** Category */
  category?: string;
  /** Is active */
  isActive: boolean;
  /** Usage count */
  usageCount: number;
  /** Created by user ID */
  createdBy: UUID;
}

// =============================================================================
// Case Queue Types
// =============================================================================

/**
 * Case queue for routing and assignment.
 */
export interface CaseQueue extends TenantScopedEntity {
  /** Queue name */
  name: string;
  /** Description */
  description?: string;
  /** Case type IDs handled by this queue */
  caseTypeIds: UUID[];
  /** Queue members (user IDs) */
  memberIds: UUID[];
  /** Queue manager user ID */
  managerId?: UUID;
  /** Assignment strategy */
  assignmentStrategy: "round_robin" | "least_busy" | "manual" | "skill_based";
  /** Auto-assign enabled */
  autoAssign: boolean;
  /** Max cases per member */
  maxCasesPerMember?: number;
  /** Is active */
  isActive: boolean;
  /** Business hours */
  businessHours?: {
    timezone: string;
    schedule: Array<{
      day: number; // 0-6, Sunday = 0
      start: string; // HH:mm
      end: string; // HH:mm
    }>;
  };
}

// =============================================================================
// Case Metrics Types
// =============================================================================

/**
 * Case metrics summary.
 */
export interface CaseMetrics {
  /** Total cases */
  totalCases: number;
  /** Open cases */
  openCases: number;
  /** Cases by status */
  byStatus: Record<CaseStatus, number>;
  /** Cases by priority */
  byPriority: Record<CasePriority, number>;
  /** Average resolution time (hours) */
  avgResolutionTimeHours: number;
  /** Average first response time (hours) */
  avgFirstResponseTimeHours: number;
  /** SLA compliance rate (percentage) */
  slaComplianceRate: number;
  /** Customer satisfaction average */
  avgSatisfactionRating: number;
  /** Cases created in period */
  createdInPeriod: number;
  /** Cases resolved in period */
  resolvedInPeriod: number;
  /** Reopened rate (percentage) */
  reopenedRate: number;
}
