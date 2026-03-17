/**
 * Shared Package Re-exports
 *
 * Convenience barrel export for commonly used items from @staffora/shared.
 * Import from here to avoid long import paths throughout the API codebase.
 *
 * NOTE: Do NOT re-export TypeBox schemas from @staffora/shared — the shared
 * package uses TypeBox ^0.32 while the API uses ^0.34, causing type
 * incompatibilities. Only re-export plain TS types, state machines,
 * error codes, constants, and utility functions.
 */

// =============================================================================
// State Machine — Employee Lifecycle
// =============================================================================
export {
  EmployeeStates,
  canTransition as canTransitionEmployee,
  getValidTransitions as getValidEmployeeTransitions,
  validateTransition as validateEmployeeTransition,
  isTerminalState as isEmployeeTerminalState,
  isActiveEmployee,
  getInitialState as getEmployeeInitialState,
  isEmployeeState,
  type EmployeeState,
} from "@staffora/shared/state-machines";

// =============================================================================
// State Machine — Leave Request
// =============================================================================
export {
  LeaveRequestStates,
  canTransitionLeaveRequest,
  getValidLeaveRequestTransitions,
  validateLeaveRequestTransition,
  isLeaveRequestTerminalState,
  leaveRequestRequiresAction,
  isLeaveRequestState,
  type LeaveRequestState,
} from "@staffora/shared/state-machines";

// =============================================================================
// State Machine — Case Management
// =============================================================================
export {
  CaseStates,
  canTransitionCase,
  getValidCaseTransitions,
  validateCaseTransition,
  isCaseTerminalState,
  isCaseActive,
  isCaseState,
  type CaseState,
} from "@staffora/shared/state-machines";

// =============================================================================
// State Machine — Onboarding
// =============================================================================
export {
  OnboardingTemplateStates,
  OnboardingInstanceStates,
  OnboardingTaskStates,
  canTransitionTemplate,
  canTransitionInstance,
  canTransitionTask,
  isTemplateUsable,
  isInstanceActive,
  isTaskActionable,
  type OnboardingTemplateState,
  type OnboardingInstanceState,
  type OnboardingTaskState,
} from "@staffora/shared/state-machines";

// =============================================================================
// State Machine — Workflow
// =============================================================================
export {
  WorkflowStates,
  canTransitionWorkflow,
  isWorkflowTerminalState,
  isWorkflowActive,
  type WorkflowState,
} from "@staffora/shared/state-machines";

// =============================================================================
// State Machine — Recruitment
// =============================================================================
export {
  CandidateStages,
  isCandidateStageTerminal,
  isCandidateActive as isCandidateStageActive,
  type CandidateStage,
} from "@staffora/shared/state-machines";

// =============================================================================
// Error Codes (by module)
// =============================================================================
export {
  ErrorCodes as SharedErrorCodes,
  HRErrorCodes,
  AbsenceErrorCodes as SharedAbsenceErrorCodes,
  CaseErrorCodes,
  LMSErrorCodes,
  TalentErrorCodes,
  TimeErrorCodes,
  WorkflowErrorCodes,
  type ErrorCode as SharedErrorCode,
} from "@staffora/shared/errors";

// =============================================================================
// Constants
// =============================================================================
export {
  HttpStatus,
  CacheTTL,
  SystemRoles,
  AuditEventTypes,
  ValidationLimits,
  DateFormats,
  type SystemRole,
  type AuditEventType,
} from "@staffora/shared/constants";

// =============================================================================
// Validation Utilities
// =============================================================================
export {
  isValidUUID,
  isValidUUIDv4,
  isValidEmail,
  isValidNINO,
  isValidUKPostcode,
  isValidPhone,
  isValidSlug,
  isValidEmployeeNumber,
  sanitizeString,
  escapeHtml,
} from "@staffora/shared/utils";

// =============================================================================
// Effective Dating Utilities
// =============================================================================
export {
  validateNoOverlap,
  type EffectiveDateRange,
  type EffectiveDatedRecord,
  type OverlapValidationResult,
} from "@staffora/shared/utils";
