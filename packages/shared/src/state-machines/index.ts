/**
 * State Machines
 *
 * Re-exports all state machine definitions and utilities.
 * State machines define valid states and transitions for key domain entities.
 */

// Employee lifecycle state machine
export {
  EmployeeStates,
  type EmployeeState,
  canTransition,
  getValidTransitions,
  getTransitionMetadata,
  getTransitionLabel,
  validateTransition,
  isTerminalState,
  isActiveEmployee,
  getInitialState,
  isEmployeeState,
  getStateMachineSummary,
  type TransitionMetadata,
  EMPLOYEE_TRANSITION_LABELS,
} from "./employee";

// Performance cycle state machine
export {
  PerformanceCycleStates,
  type PerformanceCycleState,
  canTransitionCycle,
  getValidCycleTransitions,
  getCycleTransitionMetadata,
  getCycleTransitionLabel,
  validateCycleTransition,
  isCycleTerminalState,
  isCycleInProgress,
  areRatingsLocked,
  areGoalsLocked,
  getCycleInitialState,
  isPerformanceCycleState,
  getPhaseInfo,
  getCycleStateMachineSummary,
  type CycleTransitionMetadata,
  type PhaseInfo,
  CYCLE_TRANSITION_LABELS,
  PHASE_INFO,
} from "./performance-cycle";

// Leave request state machine
export {
  LeaveRequestStates,
  type LeaveRequestState,
  canTransitionLeaveRequest,
  getValidLeaveRequestTransitions,
  getLeaveRequestTransitionMetadata,
  getLeaveRequestTransitionLabel,
  validateLeaveRequestTransition,
  isLeaveRequestTerminalState,
  leaveRequestRequiresAction,
  getLeaveRequestInitialState,
  isLeaveRequestState,
  getLeaveRequestStateMachineSummary,
  type LeaveTransitionMetadata,
  LEAVE_REQUEST_TRANSITION_LABELS,
} from "./leave-request";

// Case state machine
export {
  CaseStates,
  type CaseState,
  canTransitionCase,
  getValidCaseTransitions,
  getCaseTransitionMetadata,
  getCaseTransitionLabel,
  validateCaseTransition,
  isCaseTerminalState,
  isCaseActive,
  getCaseInitialState,
  isCaseState,
  getCaseStateMachineSummary,
  type CaseTransitionMetadata,
  CASE_TRANSITION_LABELS,
} from "./case";

// Workflow state machine
export {
  WorkflowStates,
  type WorkflowState,
  canTransitionWorkflow,
  getValidWorkflowTransitions,
  getWorkflowTransitionMetadata,
  getWorkflowTransitionLabel,
  validateWorkflowTransition,
  isWorkflowTerminalState,
  isWorkflowActive,
  workflowRequiresApproval,
  getWorkflowInitialState,
  isWorkflowState,
  getWorkflowStateMachineSummary,
  type WorkflowTransitionMetadata,
  WORKFLOW_TRANSITION_LABELS,
} from "./workflow";
