/**
 * Leave Request State Machine
 *
 * Defines the valid states and transitions for leave request management.
 * Ensures business rules around leave approvals are enforced.
 */

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible leave request states.
 */
export const LeaveRequestStates = {
  /** Leave request has been submitted and awaiting review */
  PENDING: "pending",
  /** Request is being reviewed by approver(s) */
  UNDER_REVIEW: "under_review",
  /** Request has been approved */
  APPROVED: "approved",
  /** Request has been rejected */
  REJECTED: "rejected",
  /** Request was cancelled by the requester */
  CANCELLED: "cancelled",
  /** Leave is currently in progress */
  IN_PROGRESS: "in_progress",
  /** Leave has been completed */
  COMPLETED: "completed",
} as const;

export type LeaveRequestState = (typeof LeaveRequestStates)[keyof typeof LeaveRequestStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the leave request state machine.
 * Key is the source state, value is array of valid target states.
 */
const LEAVE_REQUEST_TRANSITIONS: Record<LeaveRequestState, LeaveRequestState[]> = {
  // From pending: can go to review, approved, rejected, or cancelled
  [LeaveRequestStates.PENDING]: [
    LeaveRequestStates.UNDER_REVIEW,
    LeaveRequestStates.APPROVED,
    LeaveRequestStates.REJECTED,
    LeaveRequestStates.CANCELLED,
  ],

  // From under_review: can be approved, rejected, or cancelled
  [LeaveRequestStates.UNDER_REVIEW]: [
    LeaveRequestStates.APPROVED,
    LeaveRequestStates.REJECTED,
    LeaveRequestStates.CANCELLED,
    LeaveRequestStates.PENDING, // Send back for revision
  ],

  // From approved: can start leave, be cancelled
  [LeaveRequestStates.APPROVED]: [
    LeaveRequestStates.IN_PROGRESS,
    LeaveRequestStates.CANCELLED,
  ],

  // From rejected: no valid transitions (terminal state) - must submit new request
  [LeaveRequestStates.REJECTED]: [],

  // From cancelled: no valid transitions (terminal state)
  [LeaveRequestStates.CANCELLED]: [],

  // From in_progress: can be completed or cancelled (early return)
  [LeaveRequestStates.IN_PROGRESS]: [
    LeaveRequestStates.COMPLETED,
    LeaveRequestStates.CANCELLED,
  ],

  // From completed: no valid transitions (terminal state)
  [LeaveRequestStates.COMPLETED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const LEAVE_REQUEST_TRANSITION_LABELS: Record<
  LeaveRequestState,
  Partial<Record<LeaveRequestState, string>>
> = {
  [LeaveRequestStates.PENDING]: {
    [LeaveRequestStates.UNDER_REVIEW]: "Submit for Review",
    [LeaveRequestStates.APPROVED]: "Quick Approve",
    [LeaveRequestStates.REJECTED]: "Reject",
    [LeaveRequestStates.CANCELLED]: "Cancel Request",
  },
  [LeaveRequestStates.UNDER_REVIEW]: {
    [LeaveRequestStates.APPROVED]: "Approve",
    [LeaveRequestStates.REJECTED]: "Reject",
    [LeaveRequestStates.CANCELLED]: "Cancel",
    [LeaveRequestStates.PENDING]: "Request Revision",
  },
  [LeaveRequestStates.APPROVED]: {
    [LeaveRequestStates.IN_PROGRESS]: "Start Leave",
    [LeaveRequestStates.CANCELLED]: "Cancel Leave",
  },
  [LeaveRequestStates.REJECTED]: {},
  [LeaveRequestStates.CANCELLED]: {},
  [LeaveRequestStates.IN_PROGRESS]: {
    [LeaveRequestStates.COMPLETED]: "Complete Leave",
    [LeaveRequestStates.CANCELLED]: "Early Return",
  },
  [LeaveRequestStates.COMPLETED]: {},
};

/**
 * Metadata about transitions that may require additional information.
 */
export interface LeaveTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition affects leave balance */
  affectsBalance: boolean;
  /** Whether this transition sends notification to employee */
  notifiesEmployee: boolean;
  /** Whether this transition requires approval chain */
  requiresApprovalChain: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TRANSITION_METADATA: Record<string, LeaveTransitionMetadata> = {
  "pending->under_review": {
    requiresReason: false,
    affectsBalance: false,
    notifiesEmployee: true,
    requiresApprovalChain: true,
    auditAction: "leave.submitted_for_review",
  },
  "pending->approved": {
    requiresReason: false,
    affectsBalance: true,
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.quick_approved",
  },
  "pending->rejected": {
    requiresReason: true,
    affectsBalance: false,
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.rejected",
  },
  "pending->cancelled": {
    requiresReason: false,
    affectsBalance: false,
    notifiesEmployee: false,
    requiresApprovalChain: false,
    auditAction: "leave.cancelled",
  },
  "under_review->approved": {
    requiresReason: false,
    affectsBalance: true,
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.approved",
  },
  "under_review->rejected": {
    requiresReason: true,
    affectsBalance: false,
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.rejected",
  },
  "under_review->cancelled": {
    requiresReason: false,
    affectsBalance: false,
    notifiesEmployee: false,
    requiresApprovalChain: false,
    auditAction: "leave.cancelled",
  },
  "under_review->pending": {
    requiresReason: true,
    affectsBalance: false,
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.revision_requested",
  },
  "approved->in_progress": {
    requiresReason: false,
    affectsBalance: false,
    notifiesEmployee: false,
    requiresApprovalChain: false,
    auditAction: "leave.started",
  },
  "approved->cancelled": {
    requiresReason: true,
    affectsBalance: true, // Returns balance
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.cancelled",
  },
  "in_progress->completed": {
    requiresReason: false,
    affectsBalance: false,
    notifiesEmployee: false,
    requiresApprovalChain: false,
    auditAction: "leave.completed",
  },
  "in_progress->cancelled": {
    requiresReason: true,
    affectsBalance: true, // Partial return
    notifiesEmployee: true,
    requiresApprovalChain: false,
    auditAction: "leave.early_return",
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 */
export function canTransitionLeaveRequest(
  fromState: LeaveRequestState,
  toState: LeaveRequestState
): boolean {
  const validTargets = LEAVE_REQUEST_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 */
export function getValidLeaveRequestTransitions(
  currentState: LeaveRequestState
): LeaveRequestState[] {
  return LEAVE_REQUEST_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 */
export function getLeaveRequestTransitionMetadata(
  fromState: LeaveRequestState,
  toState: LeaveRequestState
): LeaveTransitionMetadata | null {
  if (!canTransitionLeaveRequest(fromState, toState)) {
    return null;
  }
  return TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 */
export function getLeaveRequestTransitionLabel(
  fromState: LeaveRequestState,
  toState: LeaveRequestState
): string | undefined {
  return LEAVE_REQUEST_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 */
export function validateLeaveRequestTransition(
  fromState: LeaveRequestState,
  toState: LeaveRequestState
): string | null {
  if (fromState === toState) {
    return `Leave request is already in ${fromState} state`;
  }

  if (!canTransitionLeaveRequest(fromState, toState)) {
    const validTargets = getValidLeaveRequestTransitions(fromState);

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
export function isLeaveRequestTerminalState(state: LeaveRequestState): boolean {
  return getValidLeaveRequestTransitions(state).length === 0;
}

/**
 * Check if leave request requires action (not in terminal state).
 */
export function leaveRequestRequiresAction(state: LeaveRequestState): boolean {
  const actionStates: LeaveRequestState[] = [
    LeaveRequestStates.PENDING,
    LeaveRequestStates.UNDER_REVIEW,
  ];
  return actionStates.includes(state);
}

/**
 * Get the initial state for a new leave request.
 */
export function getLeaveRequestInitialState(): LeaveRequestState {
  return LeaveRequestStates.PENDING;
}

/**
 * Type guard to check if a string is a valid leave request state.
 */
export function isLeaveRequestState(state: string): state is LeaveRequestState {
  return Object.values(LeaveRequestStates).includes(state as LeaveRequestState);
}

/**
 * Get a summary of the state machine.
 */
export function getLeaveRequestStateMachineSummary(): {
  states: LeaveRequestState[];
  transitions: Record<LeaveRequestState, LeaveRequestState[]>;
  terminalStates: LeaveRequestState[];
  initialState: LeaveRequestState;
} {
  const states = Object.values(LeaveRequestStates);
  const terminalStates = states.filter(isLeaveRequestTerminalState);

  return {
    states,
    transitions: { ...LEAVE_REQUEST_TRANSITIONS },
    terminalStates,
    initialState: getLeaveRequestInitialState(),
  };
}
