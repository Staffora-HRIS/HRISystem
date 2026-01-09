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
