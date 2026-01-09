/**
 * Employee Lifecycle State Machine
 *
 * Defines the valid states and transitions for employee lifecycle management.
 * Ensures business rules around employee status changes are enforced.
 */

import type { EmployeeStatus } from "../types/hr";

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible employee lifecycle states.
 */
export const EmployeeStates = {
  /** Employee record created but not yet started */
  PENDING: "pending",
  /** Employee is actively working */
  ACTIVE: "active",
  /** Employee is on approved leave (maternity, medical, sabbatical, etc.) */
  ON_LEAVE: "on_leave",
  /** Employee has been terminated (resigned, dismissed, retired, etc.) */
  TERMINATED: "terminated",
} as const;

export type EmployeeState = (typeof EmployeeStates)[keyof typeof EmployeeStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the employee lifecycle state machine.
 * Key is the source state, value is array of valid target states.
 */
const EMPLOYEE_TRANSITIONS: Record<EmployeeState, EmployeeState[]> = {
  // From pending: can only activate or terminate (declined offer, no-show)
  [EmployeeStates.PENDING]: [EmployeeStates.ACTIVE, EmployeeStates.TERMINATED],

  // From active: can go on leave or be terminated
  [EmployeeStates.ACTIVE]: [EmployeeStates.ON_LEAVE, EmployeeStates.TERMINATED],

  // From on_leave: can return to active or be terminated
  [EmployeeStates.ON_LEAVE]: [EmployeeStates.ACTIVE, EmployeeStates.TERMINATED],

  // From terminated: no valid transitions (terminal state)
  // Note: Rehires should create a new employee record
  [EmployeeStates.TERMINATED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const EMPLOYEE_TRANSITION_LABELS: Record<
  EmployeeState,
  Partial<Record<EmployeeState, string>>
> = {
  [EmployeeStates.PENDING]: {
    [EmployeeStates.ACTIVE]: "Activate",
    [EmployeeStates.TERMINATED]: "Cancel Hire",
  },
  [EmployeeStates.ACTIVE]: {
    [EmployeeStates.ON_LEAVE]: "Start Leave",
    [EmployeeStates.TERMINATED]: "Terminate",
  },
  [EmployeeStates.ON_LEAVE]: {
    [EmployeeStates.ACTIVE]: "Return from Leave",
    [EmployeeStates.TERMINATED]: "Terminate",
  },
  [EmployeeStates.TERMINATED]: {},
};

/**
 * Metadata about transitions that may require additional information.
 */
export interface TransitionMetadata {
  /** Whether this transition requires a reason */
  requiresReason: boolean;
  /** Whether this transition requires an effective date */
  requiresEffectiveDate: boolean;
  /** Whether this transition requires manager approval */
  requiresApproval: boolean;
  /** Whether this transition triggers offboarding workflow */
  triggersOffboarding: boolean;
}

const TRANSITION_METADATA: Record<
  string,
  TransitionMetadata
> = {
  "pending->active": {
    requiresReason: false,
    requiresEffectiveDate: true,
    requiresApproval: false,
    triggersOffboarding: false,
  },
  "pending->terminated": {
    requiresReason: true,
    requiresEffectiveDate: false,
    requiresApproval: false,
    triggersOffboarding: false,
  },
  "active->on_leave": {
    requiresReason: true,
    requiresEffectiveDate: true,
    requiresApproval: true,
    triggersOffboarding: false,
  },
  "active->terminated": {
    requiresReason: true,
    requiresEffectiveDate: true,
    requiresApproval: true,
    triggersOffboarding: true,
  },
  "on_leave->active": {
    requiresReason: false,
    requiresEffectiveDate: true,
    requiresApproval: false,
    triggersOffboarding: false,
  },
  "on_leave->terminated": {
    requiresReason: true,
    requiresEffectiveDate: true,
    requiresApproval: true,
    triggersOffboarding: true,
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 *
 * @param fromState - Current employee state
 * @param toState - Target employee state
 * @returns True if the transition is allowed
 *
 * @example
 * ```typescript
 * if (canTransition("active", "on_leave")) {
 *   // Process leave request
 * }
 * ```
 */
export function canTransition(
  fromState: EmployeeStatus,
  toState: EmployeeStatus
): boolean {
  const validTargets = EMPLOYEE_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 *
 * @param currentState - Current employee state
 * @returns Array of valid target states
 *
 * @example
 * ```typescript
 * const validMoves = getValidTransitions("active");
 * // ["on_leave", "terminated"]
 * ```
 */
export function getValidTransitions(currentState: EmployeeStatus): EmployeeState[] {
  return EMPLOYEE_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 *
 * @param fromState - Current state
 * @param toState - Target state
 * @returns Transition metadata or null if transition is invalid
 */
export function getTransitionMetadata(
  fromState: EmployeeStatus,
  toState: EmployeeStatus
): TransitionMetadata | null {
  if (!canTransition(fromState, toState)) {
    return null;
  }
  return TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 *
 * @param fromState - Current state
 * @param toState - Target state
 * @returns Transition label or undefined if invalid
 */
export function getTransitionLabel(
  fromState: EmployeeStatus,
  toState: EmployeeStatus
): string | undefined {
  return EMPLOYEE_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 *
 * @param fromState - Current employee state
 * @param toState - Target employee state
 * @returns null if valid, error message if invalid
 */
export function validateTransition(
  fromState: EmployeeStatus,
  toState: EmployeeStatus
): string | null {
  if (fromState === toState) {
    return `Employee is already in ${fromState} state`;
  }

  if (!canTransition(fromState, toState)) {
    const validTargets = getValidTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a state is a terminal state (no further transitions possible).
 *
 * @param state - The state to check
 * @returns True if this is a terminal state
 */
export function isTerminalState(state: EmployeeStatus): boolean {
  return getValidTransitions(state).length === 0;
}

/**
 * Check if an employee is considered active (working or on leave).
 *
 * @param state - The employee state
 * @returns True if employee is active or on leave
 */
export function isActiveEmployee(state: EmployeeStatus): boolean {
  return (
    state === EmployeeStates.ACTIVE || state === EmployeeStates.ON_LEAVE
  );
}

/**
 * Get the initial state for a new employee.
 *
 * @returns The initial employee state
 */
export function getInitialState(): EmployeeState {
  return EmployeeStates.PENDING;
}

// =============================================================================
// State Machine Type Guard
// =============================================================================

/**
 * Type guard to check if a string is a valid employee state.
 *
 * @param state - The string to check
 * @returns True if the string is a valid employee state
 */
export function isEmployeeState(state: string): state is EmployeeState {
  return Object.values(EmployeeStates).includes(state as EmployeeState);
}

// =============================================================================
// State Machine Summary
// =============================================================================

/**
 * Get a summary of the state machine for documentation or debugging.
 *
 * @returns State machine summary object
 */
export function getStateMachineSummary(): {
  states: EmployeeState[];
  transitions: Record<EmployeeState, EmployeeState[]>;
  terminalStates: EmployeeState[];
  initialState: EmployeeState;
} {
  const states = Object.values(EmployeeStates);
  const terminalStates = states.filter(isTerminalState);

  return {
    states,
    transitions: { ...EMPLOYEE_TRANSITIONS },
    terminalStates,
    initialState: getInitialState(),
  };
}
