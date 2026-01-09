/**
 * Performance Cycle State Machine
 *
 * Defines the valid states and transitions for performance review cycles.
 * Ensures business rules around performance cycle progression are enforced.
 */

import type { PerformanceCycleStatus } from "../types/talent";

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible performance cycle states.
 */
export const PerformanceCycleStates = {
  /** Cycle is being configured, not yet started */
  DRAFT: "draft",
  /** Cycle is active, goals can be set, self-assessments in progress */
  ACTIVE: "active",
  /** Manager reviews are in progress */
  REVIEW: "review",
  /** Ratings are being calibrated across the organization */
  CALIBRATION: "calibration",
  /** Cycle is complete, results are final */
  CLOSED: "closed",
} as const;

export type PerformanceCycleState =
  (typeof PerformanceCycleStates)[keyof typeof PerformanceCycleStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the performance cycle state machine.
 * Key is the source state, value is array of valid target states.
 */
const CYCLE_TRANSITIONS: Record<PerformanceCycleState, PerformanceCycleState[]> = {
  // From draft: can only activate (start the cycle)
  [PerformanceCycleStates.DRAFT]: [PerformanceCycleStates.ACTIVE],

  // From active: move to review phase when goal setting period ends
  [PerformanceCycleStates.ACTIVE]: [PerformanceCycleStates.REVIEW],

  // From review: move to calibration after manager reviews
  [PerformanceCycleStates.REVIEW]: [
    PerformanceCycleStates.CALIBRATION,
    PerformanceCycleStates.ACTIVE, // Allow going back if needed
  ],

  // From calibration: close the cycle when calibration is complete
  [PerformanceCycleStates.CALIBRATION]: [
    PerformanceCycleStates.CLOSED,
    PerformanceCycleStates.REVIEW, // Allow going back if needed
  ],

  // From closed: no valid transitions (terminal state)
  [PerformanceCycleStates.CLOSED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const CYCLE_TRANSITION_LABELS: Record<
  PerformanceCycleState,
  Partial<Record<PerformanceCycleState, string>>
> = {
  [PerformanceCycleStates.DRAFT]: {
    [PerformanceCycleStates.ACTIVE]: "Launch Cycle",
  },
  [PerformanceCycleStates.ACTIVE]: {
    [PerformanceCycleStates.REVIEW]: "Start Review Phase",
  },
  [PerformanceCycleStates.REVIEW]: {
    [PerformanceCycleStates.CALIBRATION]: "Start Calibration",
    [PerformanceCycleStates.ACTIVE]: "Reopen Goal Setting",
  },
  [PerformanceCycleStates.CALIBRATION]: {
    [PerformanceCycleStates.CLOSED]: "Close Cycle",
    [PerformanceCycleStates.REVIEW]: "Reopen Reviews",
  },
  [PerformanceCycleStates.CLOSED]: {},
};

/**
 * Metadata about transitions that may require additional information.
 */
export interface CycleTransitionMetadata {
  /** Whether this transition requires confirmation */
  requiresConfirmation: boolean;
  /** Whether this transition sends notifications */
  sendsNotifications: boolean;
  /** Whether this transition locks previous phase data */
  locksPreviousPhase: boolean;
  /** Warning message to display before transition */
  warningMessage?: string;
  /** Minimum completion percentage required for transition */
  minimumCompletion?: number;
}

const CYCLE_TRANSITION_METADATA: Record<
  string,
  CycleTransitionMetadata
> = {
  "draft->active": {
    requiresConfirmation: true,
    sendsNotifications: true,
    locksPreviousPhase: false,
    warningMessage:
      "Launching the cycle will notify all participants. Make sure all configuration is complete.",
  },
  "active->review": {
    requiresConfirmation: true,
    sendsNotifications: true,
    locksPreviousPhase: true,
    warningMessage:
      "Moving to review phase will lock goal setting. Employees will no longer be able to modify their goals.",
    minimumCompletion: 80, // At least 80% of employees should have goals set
  },
  "review->calibration": {
    requiresConfirmation: true,
    sendsNotifications: true,
    locksPreviousPhase: true,
    warningMessage:
      "Moving to calibration will lock manager reviews. Make sure all reviews are complete.",
    minimumCompletion: 90, // At least 90% of reviews should be complete
  },
  "review->active": {
    requiresConfirmation: true,
    sendsNotifications: false,
    locksPreviousPhase: false,
    warningMessage:
      "Reopening goal setting will unlock goals for modification. This is an exceptional action.",
  },
  "calibration->closed": {
    requiresConfirmation: true,
    sendsNotifications: true,
    locksPreviousPhase: true,
    warningMessage:
      "Closing the cycle will finalize all ratings and make results available to employees.",
  },
  "calibration->review": {
    requiresConfirmation: true,
    sendsNotifications: false,
    locksPreviousPhase: false,
    warningMessage:
      "Reopening reviews will allow managers to modify their assessments. This is an exceptional action.",
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 *
 * @param fromState - Current cycle state
 * @param toState - Target cycle state
 * @returns True if the transition is allowed
 *
 * @example
 * ```typescript
 * if (canTransitionCycle("active", "review")) {
 *   // Move to review phase
 * }
 * ```
 */
export function canTransitionCycle(
  fromState: PerformanceCycleStatus,
  toState: PerformanceCycleStatus
): boolean {
  const validTargets = CYCLE_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 *
 * @param currentState - Current cycle state
 * @returns Array of valid target states
 *
 * @example
 * ```typescript
 * const validMoves = getValidCycleTransitions("review");
 * // ["calibration", "active"]
 * ```
 */
export function getValidCycleTransitions(
  currentState: PerformanceCycleStatus
): PerformanceCycleState[] {
  return CYCLE_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 *
 * @param fromState - Current state
 * @param toState - Target state
 * @returns Transition metadata or null if transition is invalid
 */
export function getCycleTransitionMetadata(
  fromState: PerformanceCycleStatus,
  toState: PerformanceCycleStatus
): CycleTransitionMetadata | null {
  if (!canTransitionCycle(fromState, toState)) {
    return null;
  }
  return CYCLE_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 *
 * @param fromState - Current state
 * @param toState - Target state
 * @returns Transition label or undefined if invalid
 */
export function getCycleTransitionLabel(
  fromState: PerformanceCycleStatus,
  toState: PerformanceCycleStatus
): string | undefined {
  return CYCLE_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 *
 * @param fromState - Current cycle state
 * @param toState - Target cycle state
 * @returns null if valid, error message if invalid
 */
export function validateCycleTransition(
  fromState: PerformanceCycleStatus,
  toState: PerformanceCycleStatus
): string | null {
  if (fromState === toState) {
    return `Cycle is already in ${fromState} state`;
  }

  if (!canTransitionCycle(fromState, toState)) {
    const validTargets = getValidCycleTransitions(fromState);

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
export function isCycleTerminalState(state: PerformanceCycleStatus): boolean {
  return getValidCycleTransitions(state).length === 0;
}

/**
 * Check if a cycle is in an active phase (not draft or closed).
 *
 * @param state - The cycle state
 * @returns True if cycle is in an active phase
 */
export function isCycleInProgress(state: PerformanceCycleStatus): boolean {
  return (
    state === PerformanceCycleStates.ACTIVE ||
    state === PerformanceCycleStates.REVIEW ||
    state === PerformanceCycleStates.CALIBRATION
  );
}

/**
 * Check if ratings are locked (in calibration or closed).
 *
 * @param state - The cycle state
 * @returns True if ratings cannot be modified
 */
export function areRatingsLocked(state: PerformanceCycleStatus): boolean {
  return (
    state === PerformanceCycleStates.CALIBRATION ||
    state === PerformanceCycleStates.CLOSED
  );
}

/**
 * Check if goals are locked (past active phase).
 *
 * @param state - The cycle state
 * @returns True if goals cannot be modified
 */
export function areGoalsLocked(state: PerformanceCycleStatus): boolean {
  return (
    state === PerformanceCycleStates.REVIEW ||
    state === PerformanceCycleStates.CALIBRATION ||
    state === PerformanceCycleStates.CLOSED
  );
}

/**
 * Get the initial state for a new performance cycle.
 *
 * @returns The initial cycle state
 */
export function getCycleInitialState(): PerformanceCycleState {
  return PerformanceCycleStates.DRAFT;
}

// =============================================================================
// State Machine Type Guard
// =============================================================================

/**
 * Type guard to check if a string is a valid performance cycle state.
 *
 * @param state - The string to check
 * @returns True if the string is a valid cycle state
 */
export function isPerformanceCycleState(
  state: string
): state is PerformanceCycleState {
  return Object.values(PerformanceCycleStates).includes(
    state as PerformanceCycleState
  );
}

// =============================================================================
// Phase Information
// =============================================================================

/**
 * Information about each phase of the performance cycle.
 */
export interface PhaseInfo {
  /** Phase name */
  name: string;
  /** Phase description */
  description: string;
  /** Who is actively participating in this phase */
  activeParticipants: ("employees" | "managers" | "hr" | "leadership")[];
  /** What activities happen in this phase */
  activities: string[];
  /** Typical duration in days */
  typicalDurationDays: number;
}

export const PHASE_INFO: Record<PerformanceCycleState, PhaseInfo> = {
  [PerformanceCycleStates.DRAFT]: {
    name: "Draft",
    description: "Cycle configuration and setup",
    activeParticipants: ["hr"],
    activities: [
      "Configure cycle parameters",
      "Set up competencies and rating scales",
      "Define participant eligibility",
      "Set key dates and deadlines",
    ],
    typicalDurationDays: 14,
  },
  [PerformanceCycleStates.ACTIVE]: {
    name: "Goal Setting & Self-Assessment",
    description: "Employees set goals and complete self-assessments",
    activeParticipants: ["employees", "managers"],
    activities: [
      "Create and align individual goals",
      "Link goals to team and company objectives",
      "Complete self-assessment",
      "Gather peer feedback (if enabled)",
    ],
    typicalDurationDays: 30,
  },
  [PerformanceCycleStates.REVIEW]: {
    name: "Manager Review",
    description: "Managers complete performance reviews",
    activeParticipants: ["managers", "hr"],
    activities: [
      "Review employee self-assessments",
      "Assess goal achievement",
      "Evaluate competency performance",
      "Provide initial ratings and feedback",
    ],
    typicalDurationDays: 21,
  },
  [PerformanceCycleStates.CALIBRATION]: {
    name: "Calibration",
    description: "Leadership calibrates ratings across the organization",
    activeParticipants: ["managers", "hr", "leadership"],
    activities: [
      "Review rating distributions",
      "Identify and discuss outliers",
      "Ensure fairness and consistency",
      "Finalize ratings",
    ],
    typicalDurationDays: 14,
  },
  [PerformanceCycleStates.CLOSED]: {
    name: "Closed",
    description: "Cycle complete, results available",
    activeParticipants: ["employees", "managers"],
    activities: [
      "Release results to employees",
      "Conduct review discussions",
      "Create development plans",
      "Link to compensation decisions",
    ],
    typicalDurationDays: 0, // Terminal state
  },
};

/**
 * Get information about a phase.
 *
 * @param state - The cycle state
 * @returns Phase information
 */
export function getPhaseInfo(state: PerformanceCycleStatus): PhaseInfo {
  return PHASE_INFO[state];
}

// =============================================================================
// State Machine Summary
// =============================================================================

/**
 * Get a summary of the state machine for documentation or debugging.
 *
 * @returns State machine summary object
 */
export function getCycleStateMachineSummary(): {
  states: PerformanceCycleState[];
  transitions: Record<PerformanceCycleState, PerformanceCycleState[]>;
  terminalStates: PerformanceCycleState[];
  initialState: PerformanceCycleState;
  phaseInfo: Record<PerformanceCycleState, PhaseInfo>;
} {
  const states = Object.values(PerformanceCycleStates);
  const terminalStates = states.filter(isCycleTerminalState);

  return {
    states,
    transitions: { ...CYCLE_TRANSITIONS },
    terminalStates,
    initialState: getCycleInitialState(),
    phaseInfo: { ...PHASE_INFO },
  };
}
