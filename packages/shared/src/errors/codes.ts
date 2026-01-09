/**
 * Error Codes
 *
 * Centralized error codes organized by module for the HRIS platform.
 * These codes are used to identify specific error conditions across the system.
 */

// =============================================================================
// Generic Error Codes
// =============================================================================

/** Generic error codes applicable across all modules */
export const GenericErrorCodes = {
  /** Validation error - input data failed validation */
  VALIDATION_ERROR: "VALIDATION_ERROR",
  /** Resource not found */
  NOT_FOUND: "NOT_FOUND",
  /** Access forbidden - user lacks required permissions */
  FORBIDDEN: "FORBIDDEN",
  /** Authentication required or invalid */
  UNAUTHORIZED: "UNAUTHORIZED",
  /** Resource conflict - duplicate or concurrent modification */
  CONFLICT: "CONFLICT",
  /** Internal server error */
  INTERNAL_ERROR: "INTERNAL_ERROR",
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

// =============================================================================
// Authentication Error Codes
// =============================================================================

/** Authentication and session related error codes */
export const AuthErrorCodes = {
  /** Invalid username or password */
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  /** Session has expired */
  SESSION_EXPIRED: "SESSION_EXPIRED",
  /** Multi-factor authentication is required */
  MFA_REQUIRED: "MFA_REQUIRED",
  /** Invalid MFA code provided */
  MFA_INVALID: "MFA_INVALID",
  /** Account is locked due to failed attempts */
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  /** Account has been suspended */
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",
} as const;

// =============================================================================
// Tenant Error Codes
// =============================================================================

/** Tenant related error codes */
export const TenantErrorCodes = {
  /** Tenant not found */
  TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
  /** Tenant account has been suspended */
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  /** User does not have access to the tenant */
  TENANT_ACCESS_DENIED: "TENANT_ACCESS_DENIED",
} as const;

// =============================================================================
// HR Module Error Codes
// =============================================================================

/** Core HR module error codes */
export const HRErrorCodes = {
  /** Effective date ranges overlap for the same record */
  EFFECTIVE_DATE_OVERLAP: "EFFECTIVE_DATE_OVERLAP",
  /** Invalid employee lifecycle state transition */
  INVALID_LIFECYCLE_TRANSITION: "INVALID_LIFECYCLE_TRANSITION",
  /** Termination date cannot be before hire date */
  TERMINATION_DATE_BEFORE_HIRE: "TERMINATION_DATE_BEFORE_HIRE",
  /** Position is already filled by another employee */
  POSITION_ALREADY_FILLED: "POSITION_ALREADY_FILLED",
  /** Employee not found */
  EMPLOYEE_NOT_FOUND: "EMPLOYEE_NOT_FOUND",
  /** Cannot delete org unit with child units */
  ORG_UNIT_HAS_CHILDREN: "ORG_UNIT_HAS_CHILDREN",
  /** Circular reporting relationship detected */
  CIRCULAR_REPORTING_LINE: "CIRCULAR_REPORTING_LINE",
} as const;

// =============================================================================
// Time & Attendance Error Codes
// =============================================================================

/** Time and attendance module error codes */
export const TimeErrorCodes = {
  /** Timesheet has already been approved */
  TIMESHEET_ALREADY_APPROVED: "TIMESHEET_ALREADY_APPROVED",
  /** Clock event is out of sequence (e.g., clock out before clock in) */
  CLOCK_EVENT_OUT_OF_SEQUENCE: "CLOCK_EVENT_OUT_OF_SEQUENCE",
  /** Invalid time entry data */
  INVALID_TIME_ENTRY: "INVALID_TIME_ENTRY",
  /** Schedule conflict detected */
  SCHEDULE_CONFLICT: "SCHEDULE_CONFLICT",
} as const;

// =============================================================================
// Absence Management Error Codes
// =============================================================================

/** Absence and leave management error codes */
export const AbsenceErrorCodes = {
  /** Insufficient leave balance for request */
  INSUFFICIENT_LEAVE_BALANCE: "INSUFFICIENT_LEAVE_BALANCE",
  /** Leave request falls within blackout period */
  BLACKOUT_PERIOD_VIOLATION: "BLACKOUT_PERIOD_VIOLATION",
  /** Leave request overlaps with existing approved leave */
  LEAVE_REQUEST_OVERLAP: "LEAVE_REQUEST_OVERLAP",
  /** Leave policy not found */
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
} as const;

// =============================================================================
// Workflow Error Codes
// =============================================================================

/** Workflow engine error codes */
export const WorkflowErrorCodes = {
  /** Invalid workflow state transition */
  INVALID_WORKFLOW_TRANSITION: "INVALID_WORKFLOW_TRANSITION",
  /** Task has already been completed */
  TASK_ALREADY_COMPLETED: "TASK_ALREADY_COMPLETED",
  /** Workflow definition not found */
  WORKFLOW_NOT_FOUND: "WORKFLOW_NOT_FOUND",
} as const;

// =============================================================================
// Talent Management Error Codes
// =============================================================================

/** Talent acquisition and management error codes */
export const TalentErrorCodes = {
  /** Requisition has been closed */
  REQUISITION_CLOSED: "REQUISITION_CLOSED",
  /** Candidate already exists in the system */
  CANDIDATE_ALREADY_EXISTS: "CANDIDATE_ALREADY_EXISTS",
  /** Job offer has expired */
  OFFER_EXPIRED: "OFFER_EXPIRED",
} as const;

// =============================================================================
// LMS Error Codes
// =============================================================================

/** Learning management system error codes */
export const LMSErrorCodes = {
  /** Course not found */
  COURSE_NOT_FOUND: "COURSE_NOT_FOUND",
  /** Course prerequisite not met */
  PREREQUISITE_NOT_MET: "PREREQUISITE_NOT_MET",
  /** Assignment has already been completed */
  ASSIGNMENT_ALREADY_COMPLETED: "ASSIGNMENT_ALREADY_COMPLETED",
} as const;

// =============================================================================
// Case Management Error Codes
// =============================================================================

/** HR case management error codes */
export const CaseErrorCodes = {
  /** Case has been closed */
  CASE_CLOSED: "CASE_CLOSED",
  /** Restricted access - user not authorized to view case */
  RESTRICTED_ACCESS: "RESTRICTED_ACCESS",
} as const;

// =============================================================================
// Combined Error Codes Object
// =============================================================================

/**
 * All error codes combined into a single object for easy access.
 * Use this for type-safe error code references throughout the application.
 */
export const ErrorCodes = {
  // Generic
  ...GenericErrorCodes,
  // Auth
  ...AuthErrorCodes,
  // Tenant
  ...TenantErrorCodes,
  // HR
  ...HRErrorCodes,
  // Time
  ...TimeErrorCodes,
  // Absence
  ...AbsenceErrorCodes,
  // Workflow
  ...WorkflowErrorCodes,
  // Talent
  ...TalentErrorCodes,
  // LMS
  ...LMSErrorCodes,
  // Case
  ...CaseErrorCodes,
} as const;

/** Type representing all possible error codes */
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Type for generic error codes */
export type GenericErrorCode =
  (typeof GenericErrorCodes)[keyof typeof GenericErrorCodes];

/** Type for auth error codes */
export type AuthErrorCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];

/** Type for tenant error codes */
export type TenantErrorCode =
  (typeof TenantErrorCodes)[keyof typeof TenantErrorCodes];

/** Type for HR error codes */
export type HRErrorCode = (typeof HRErrorCodes)[keyof typeof HRErrorCodes];

/** Type for time error codes */
export type TimeErrorCode = (typeof TimeErrorCodes)[keyof typeof TimeErrorCodes];

/** Type for absence error codes */
export type AbsenceErrorCode =
  (typeof AbsenceErrorCodes)[keyof typeof AbsenceErrorCodes];

/** Type for workflow error codes */
export type WorkflowErrorCode =
  (typeof WorkflowErrorCodes)[keyof typeof WorkflowErrorCodes];

/** Type for talent error codes */
export type TalentErrorCode =
  (typeof TalentErrorCodes)[keyof typeof TalentErrorCodes];

/** Type for LMS error codes */
export type LMSErrorCode = (typeof LMSErrorCodes)[keyof typeof LMSErrorCodes];

/** Type for case error codes */
export type CaseErrorCode = (typeof CaseErrorCodes)[keyof typeof CaseErrorCodes];
