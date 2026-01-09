/**
 * Error Messages
 *
 * Human-readable messages corresponding to each error code.
 * These messages are suitable for display to end users.
 */

import { ErrorCodes, type ErrorCode } from "./codes";

/**
 * Mapping of error codes to human-readable messages.
 * These messages should be user-friendly and actionable where possible.
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Generic Error Messages
  [ErrorCodes.VALIDATION_ERROR]:
    "The provided data is invalid. Please check your input and try again.",
  [ErrorCodes.NOT_FOUND]: "The requested resource was not found.",
  [ErrorCodes.FORBIDDEN]:
    "You do not have permission to perform this action.",
  [ErrorCodes.UNAUTHORIZED]:
    "Authentication is required. Please log in to continue.",
  [ErrorCodes.CONFLICT]:
    "A conflict occurred. The resource may have been modified by another user.",
  [ErrorCodes.INTERNAL_ERROR]:
    "An unexpected error occurred. Please try again later or contact support.",
  [ErrorCodes.SERVICE_UNAVAILABLE]:
    "The service is temporarily unavailable. Please try again later.",

  // Authentication Error Messages
  [ErrorCodes.INVALID_CREDENTIALS]:
    "Invalid email or password. Please check your credentials and try again.",
  [ErrorCodes.SESSION_EXPIRED]:
    "Your session has expired. Please log in again to continue.",
  [ErrorCodes.MFA_REQUIRED]:
    "Multi-factor authentication is required. Please complete the verification.",
  [ErrorCodes.MFA_INVALID]:
    "Invalid verification code. Please check the code and try again.",
  [ErrorCodes.ACCOUNT_LOCKED]:
    "Your account has been locked due to multiple failed login attempts. Please contact your administrator.",
  [ErrorCodes.ACCOUNT_SUSPENDED]:
    "Your account has been suspended. Please contact your administrator for assistance.",

  // Tenant Error Messages
  [ErrorCodes.TENANT_NOT_FOUND]:
    "The organization was not found. Please verify the organization identifier.",
  [ErrorCodes.TENANT_SUSPENDED]:
    "This organization's account has been suspended. Please contact support.",
  [ErrorCodes.TENANT_ACCESS_DENIED]:
    "You do not have access to this organization.",

  // HR Error Messages
  [ErrorCodes.EFFECTIVE_DATE_OVERLAP]:
    "The effective dates overlap with an existing record. Please adjust the dates.",
  [ErrorCodes.INVALID_LIFECYCLE_TRANSITION]:
    "This status change is not allowed. Please check the employee's current status.",
  [ErrorCodes.TERMINATION_DATE_BEFORE_HIRE]:
    "The termination date cannot be before the hire date.",
  [ErrorCodes.POSITION_ALREADY_FILLED]:
    "This position is already filled by another employee.",
  [ErrorCodes.EMPLOYEE_NOT_FOUND]:
    "The employee was not found. Please verify the employee identifier.",
  [ErrorCodes.ORG_UNIT_HAS_CHILDREN]:
    "Cannot delete this organizational unit because it has child units. Please remove or reassign the child units first.",
  [ErrorCodes.CIRCULAR_REPORTING_LINE]:
    "This change would create a circular reporting relationship, which is not allowed.",

  // Time & Attendance Error Messages
  [ErrorCodes.TIMESHEET_ALREADY_APPROVED]:
    "This timesheet has already been approved and cannot be modified.",
  [ErrorCodes.CLOCK_EVENT_OUT_OF_SEQUENCE]:
    "Clock events must be in sequence. For example, you must clock in before clocking out.",
  [ErrorCodes.INVALID_TIME_ENTRY]:
    "The time entry is invalid. Please check the start and end times.",
  [ErrorCodes.SCHEDULE_CONFLICT]:
    "This schedule conflicts with an existing schedule assignment.",

  // Absence Error Messages
  [ErrorCodes.INSUFFICIENT_LEAVE_BALANCE]:
    "You do not have enough leave balance for this request.",
  [ErrorCodes.BLACKOUT_PERIOD_VIOLATION]:
    "Leave cannot be requested during this blackout period.",
  [ErrorCodes.LEAVE_REQUEST_OVERLAP]:
    "This leave request overlaps with an existing approved leave request.",
  [ErrorCodes.POLICY_NOT_FOUND]:
    "The leave policy was not found. Please contact your HR administrator.",

  // Workflow Error Messages
  [ErrorCodes.INVALID_WORKFLOW_TRANSITION]:
    "This workflow transition is not allowed from the current state.",
  [ErrorCodes.TASK_ALREADY_COMPLETED]:
    "This task has already been completed and cannot be modified.",
  [ErrorCodes.WORKFLOW_NOT_FOUND]:
    "The workflow was not found. Please verify the workflow identifier.",

  // Talent Error Messages
  [ErrorCodes.REQUISITION_CLOSED]:
    "This job requisition has been closed and is no longer accepting applications.",
  [ErrorCodes.CANDIDATE_ALREADY_EXISTS]:
    "A candidate with this information already exists in the system.",
  [ErrorCodes.OFFER_EXPIRED]:
    "This job offer has expired and is no longer valid.",

  // LMS Error Messages
  [ErrorCodes.COURSE_NOT_FOUND]:
    "The course was not found. Please verify the course identifier.",
  [ErrorCodes.PREREQUISITE_NOT_MET]:
    "You must complete the prerequisite courses before enrolling in this course.",
  [ErrorCodes.ASSIGNMENT_ALREADY_COMPLETED]:
    "This learning assignment has already been completed.",

  // Case Error Messages
  [ErrorCodes.CASE_CLOSED]:
    "This case has been closed and cannot be modified.",
  [ErrorCodes.RESTRICTED_ACCESS]:
    "You do not have access to view this case due to confidentiality restrictions.",
} as const;

/**
 * Get the human-readable message for an error code.
 * Returns a generic message if the code is not found.
 *
 * @param code - The error code to look up
 * @returns The human-readable error message
 */
export function getErrorMessage(code: ErrorCode | string): string {
  if (code in ErrorMessages) {
    return ErrorMessages[code as ErrorCode];
  }
  return "An unexpected error occurred. Please try again later.";
}
