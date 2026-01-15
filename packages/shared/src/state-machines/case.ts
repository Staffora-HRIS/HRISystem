/**
 * HR Case State Machine
 *
 * Defines the valid states and transitions for HR case management.
 * Ensures business rules around case handling are enforced.
 */

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible HR case states.
 */
export const CaseStates = {
  /** Case has been opened and awaiting assignment */
  OPEN: "open",
  /** Case has been assigned and is being worked on */
  IN_PROGRESS: "in_progress",
  /** Case is waiting for additional information from requester */
  PENDING_INFO: "pending_info",
  /** Case has been escalated to higher authority */
  ESCALATED: "escalated",
  /** Case has been resolved but awaiting confirmation */
  RESOLVED: "resolved",
  /** Case has been closed after resolution confirmed */
  CLOSED: "closed",
  /** Case was cancelled (duplicate, invalid, etc.) */
  CANCELLED: "cancelled",
} as const;

export type CaseState = (typeof CaseStates)[keyof typeof CaseStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the case state machine.
 */
const CASE_TRANSITIONS: Record<CaseState, CaseState[]> = {
  // From open: can be assigned (in_progress), escalated, or cancelled
  [CaseStates.OPEN]: [
    CaseStates.IN_PROGRESS,
    CaseStates.ESCALATED,
    CaseStates.CANCELLED,
    CaseStates.RESOLVED, // Quick resolution
  ],

  // From in_progress: can request info, escalate, resolve, or cancel
  [CaseStates.IN_PROGRESS]: [
    CaseStates.PENDING_INFO,
    CaseStates.ESCALATED,
    CaseStates.RESOLVED,
    CaseStates.CANCELLED,
  ],

  // From pending_info: can resume, escalate, resolve, or cancel
  [CaseStates.PENDING_INFO]: [
    CaseStates.IN_PROGRESS,
    CaseStates.ESCALATED,
    CaseStates.RESOLVED,
    CaseStates.CANCELLED,
  ],

  // From escalated: can be de-escalated (in_progress), resolved, or cancelled
  [CaseStates.ESCALATED]: [
    CaseStates.IN_PROGRESS,
    CaseStates.RESOLVED,
    CaseStates.CANCELLED,
  ],

  // From resolved: can be closed or reopened
  [CaseStates.RESOLVED]: [
    CaseStates.CLOSED,
    CaseStates.IN_PROGRESS, // Reopen if resolution not satisfactory
  ],

  // From closed: terminal state (archive)
  [CaseStates.CLOSED]: [],

  // From cancelled: terminal state
  [CaseStates.CANCELLED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const CASE_TRANSITION_LABELS: Record<
  CaseState,
  Partial<Record<CaseState, string>>
> = {
  [CaseStates.OPEN]: {
    [CaseStates.IN_PROGRESS]: "Assign & Start",
    [CaseStates.ESCALATED]: "Escalate",
    [CaseStates.CANCELLED]: "Cancel Case",
    [CaseStates.RESOLVED]: "Quick Resolve",
  },
  [CaseStates.IN_PROGRESS]: {
    [CaseStates.PENDING_INFO]: "Request Information",
    [CaseStates.ESCALATED]: "Escalate",
    [CaseStates.RESOLVED]: "Resolve",
    [CaseStates.CANCELLED]: "Cancel",
  },
  [CaseStates.PENDING_INFO]: {
    [CaseStates.IN_PROGRESS]: "Information Received",
    [CaseStates.ESCALATED]: "Escalate",
    [CaseStates.RESOLVED]: "Resolve",
    [CaseStates.CANCELLED]: "Cancel",
  },
  [CaseStates.ESCALATED]: {
    [CaseStates.IN_PROGRESS]: "De-escalate",
    [CaseStates.RESOLVED]: "Resolve",
    [CaseStates.CANCELLED]: "Cancel",
  },
  [CaseStates.RESOLVED]: {
    [CaseStates.CLOSED]: "Close Case",
    [CaseStates.IN_PROGRESS]: "Reopen",
  },
  [CaseStates.CLOSED]: {},
  [CaseStates.CANCELLED]: {},
};

/**
 * Metadata about transitions that may require additional information.
 */
export interface CaseTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition requires assignment */
  requiresAssignment: boolean;
  /** Whether this transition sends notification to requester */
  notifiesRequester: boolean;
  /** Whether this transition affects SLA metrics */
  affectsSLA: boolean;
  /** Priority change allowed in this transition */
  allowsPriorityChange: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TRANSITION_METADATA: Record<string, CaseTransitionMetadata> = {
  "open->in_progress": {
    requiresReason: false,
    requiresAssignment: true,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.assigned",
  },
  "open->escalated": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: true,
    auditAction: "case.escalated",
  },
  "open->cancelled": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.cancelled",
  },
  "open->resolved": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.quick_resolved",
  },
  "in_progress->pending_info": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.info_requested",
  },
  "in_progress->escalated": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: true,
    auditAction: "case.escalated",
  },
  "in_progress->resolved": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.resolved",
  },
  "in_progress->cancelled": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.cancelled",
  },
  "pending_info->in_progress": {
    requiresReason: false,
    requiresAssignment: false,
    notifiesRequester: false,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.info_received",
  },
  "pending_info->escalated": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: true,
    auditAction: "case.escalated",
  },
  "pending_info->resolved": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.resolved",
  },
  "pending_info->cancelled": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.cancelled",
  },
  "escalated->in_progress": {
    requiresReason: true,
    requiresAssignment: true,
    notifiesRequester: false,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.deescalated",
  },
  "escalated->resolved": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.resolved",
  },
  "escalated->cancelled": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.cancelled",
  },
  "resolved->closed": {
    requiresReason: false,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: false,
    allowsPriorityChange: false,
    auditAction: "case.closed",
  },
  "resolved->in_progress": {
    requiresReason: true,
    requiresAssignment: false,
    notifiesRequester: true,
    affectsSLA: true,
    allowsPriorityChange: false,
    auditAction: "case.reopened",
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 */
export function canTransitionCase(
  fromState: CaseState,
  toState: CaseState
): boolean {
  const validTargets = CASE_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 */
export function getValidCaseTransitions(currentState: CaseState): CaseState[] {
  return CASE_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 */
export function getCaseTransitionMetadata(
  fromState: CaseState,
  toState: CaseState
): CaseTransitionMetadata | null {
  if (!canTransitionCase(fromState, toState)) {
    return null;
  }
  return TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 */
export function getCaseTransitionLabel(
  fromState: CaseState,
  toState: CaseState
): string | undefined {
  return CASE_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 */
export function validateCaseTransition(
  fromState: CaseState,
  toState: CaseState
): string | null {
  if (fromState === toState) {
    return `Case is already in ${fromState} state`;
  }

  if (!canTransitionCase(fromState, toState)) {
    const validTargets = getValidCaseTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a state is a terminal state.
 */
export function isCaseTerminalState(state: CaseState): boolean {
  return getValidCaseTransitions(state).length === 0;
}

/**
 * Check if case is active (requires action).
 */
export function isCaseActive(state: CaseState): boolean {
  const activeStates: CaseState[] = [
    CaseStates.OPEN,
    CaseStates.IN_PROGRESS,
    CaseStates.PENDING_INFO,
    CaseStates.ESCALATED,
  ];
  return activeStates.includes(state);
}

/**
 * Get the initial state for a new case.
 */
export function getCaseInitialState(): CaseState {
  return CaseStates.OPEN;
}

/**
 * Type guard to check if a string is a valid case state.
 */
export function isCaseState(state: string): state is CaseState {
  return Object.values(CaseStates).includes(state as CaseState);
}

/**
 * Get a summary of the state machine.
 */
export function getCaseStateMachineSummary(): {
  states: CaseState[];
  transitions: Record<CaseState, CaseState[]>;
  terminalStates: CaseState[];
  initialState: CaseState;
} {
  const states = Object.values(CaseStates);
  const terminalStates = states.filter(isCaseTerminalState);

  return {
    states,
    transitions: { ...CASE_TRANSITIONS },
    terminalStates,
    initialState: getCaseInitialState(),
  };
}
