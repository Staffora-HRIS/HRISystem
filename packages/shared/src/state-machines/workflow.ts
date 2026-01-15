/**
 * Workflow State Machine
 *
 * Defines the valid states and transitions for workflow/approval processes.
 * Supports multi-step approval chains, escalation, and delegation.
 */

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible workflow states.
 */
export const WorkflowStates = {
  /** Workflow has been created but not started */
  DRAFT: "draft",
  /** Workflow is active and awaiting action */
  PENDING: "pending",
  /** Workflow step is being reviewed */
  IN_REVIEW: "in_review",
  /** Workflow is waiting for additional approvers */
  AWAITING_APPROVAL: "awaiting_approval",
  /** Current step has been approved, moving to next */
  STEP_APPROVED: "step_approved",
  /** Current step has been rejected */
  STEP_REJECTED: "step_rejected",
  /** Workflow has been escalated to higher authority */
  ESCALATED: "escalated",
  /** Workflow has been delegated to another approver */
  DELEGATED: "delegated",
  /** Workflow requires additional information */
  ON_HOLD: "on_hold",
  /** All steps completed successfully */
  APPROVED: "approved",
  /** Workflow has been rejected at any step */
  REJECTED: "rejected",
  /** Workflow was cancelled before completion */
  CANCELLED: "cancelled",
  /** Workflow expired due to timeout */
  EXPIRED: "expired",
} as const;

export type WorkflowState = (typeof WorkflowStates)[keyof typeof WorkflowStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the workflow state machine.
 */
const WORKFLOW_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  // From draft: can be submitted (pending) or cancelled
  [WorkflowStates.DRAFT]: [
    WorkflowStates.PENDING,
    WorkflowStates.CANCELLED,
  ],

  // From pending: can be reviewed, escalated, put on hold, or cancelled
  [WorkflowStates.PENDING]: [
    WorkflowStates.IN_REVIEW,
    WorkflowStates.ESCALATED,
    WorkflowStates.ON_HOLD,
    WorkflowStates.CANCELLED,
    WorkflowStates.EXPIRED,
  ],

  // From in_review: can await approval, be approved, rejected, escalated, or delegated
  [WorkflowStates.IN_REVIEW]: [
    WorkflowStates.AWAITING_APPROVAL,
    WorkflowStates.STEP_APPROVED,
    WorkflowStates.STEP_REJECTED,
    WorkflowStates.ESCALATED,
    WorkflowStates.DELEGATED,
    WorkflowStates.ON_HOLD,
    WorkflowStates.CANCELLED,
  ],

  // From awaiting_approval: same as in_review
  [WorkflowStates.AWAITING_APPROVAL]: [
    WorkflowStates.STEP_APPROVED,
    WorkflowStates.STEP_REJECTED,
    WorkflowStates.ESCALATED,
    WorkflowStates.DELEGATED,
    WorkflowStates.ON_HOLD,
    WorkflowStates.CANCELLED,
    WorkflowStates.EXPIRED,
  ],

  // From step_approved: move to next step or complete
  [WorkflowStates.STEP_APPROVED]: [
    WorkflowStates.PENDING, // Next step
    WorkflowStates.APPROVED, // All steps done
  ],

  // From step_rejected: can be revised or finally rejected
  [WorkflowStates.STEP_REJECTED]: [
    WorkflowStates.PENDING, // Revision submitted
    WorkflowStates.REJECTED, // Final rejection
  ],

  // From escalated: can be resolved or rejected
  [WorkflowStates.ESCALATED]: [
    WorkflowStates.IN_REVIEW,
    WorkflowStates.STEP_APPROVED,
    WorkflowStates.STEP_REJECTED,
    WorkflowStates.ON_HOLD,
    WorkflowStates.CANCELLED,
  ],

  // From delegated: same as escalated
  [WorkflowStates.DELEGATED]: [
    WorkflowStates.IN_REVIEW,
    WorkflowStates.AWAITING_APPROVAL,
    WorkflowStates.CANCELLED,
  ],

  // From on_hold: can resume or cancel
  [WorkflowStates.ON_HOLD]: [
    WorkflowStates.PENDING,
    WorkflowStates.IN_REVIEW,
    WorkflowStates.CANCELLED,
    WorkflowStates.EXPIRED,
  ],

  // Terminal states
  [WorkflowStates.APPROVED]: [],
  [WorkflowStates.REJECTED]: [],
  [WorkflowStates.CANCELLED]: [],
  [WorkflowStates.EXPIRED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const WORKFLOW_TRANSITION_LABELS: Record<
  WorkflowState,
  Partial<Record<WorkflowState, string>>
> = {
  [WorkflowStates.DRAFT]: {
    [WorkflowStates.PENDING]: "Submit for Approval",
    [WorkflowStates.CANCELLED]: "Discard Draft",
  },
  [WorkflowStates.PENDING]: {
    [WorkflowStates.IN_REVIEW]: "Start Review",
    [WorkflowStates.ESCALATED]: "Escalate",
    [WorkflowStates.ON_HOLD]: "Put On Hold",
    [WorkflowStates.CANCELLED]: "Cancel",
    [WorkflowStates.EXPIRED]: "Mark Expired",
  },
  [WorkflowStates.IN_REVIEW]: {
    [WorkflowStates.AWAITING_APPROVAL]: "Request Approval",
    [WorkflowStates.STEP_APPROVED]: "Approve Step",
    [WorkflowStates.STEP_REJECTED]: "Reject Step",
    [WorkflowStates.ESCALATED]: "Escalate",
    [WorkflowStates.DELEGATED]: "Delegate",
    [WorkflowStates.ON_HOLD]: "Put On Hold",
    [WorkflowStates.CANCELLED]: "Cancel",
  },
  [WorkflowStates.AWAITING_APPROVAL]: {
    [WorkflowStates.STEP_APPROVED]: "Approve",
    [WorkflowStates.STEP_REJECTED]: "Reject",
    [WorkflowStates.ESCALATED]: "Escalate",
    [WorkflowStates.DELEGATED]: "Delegate",
    [WorkflowStates.ON_HOLD]: "Put On Hold",
    [WorkflowStates.CANCELLED]: "Cancel",
    [WorkflowStates.EXPIRED]: "Mark Expired",
  },
  [WorkflowStates.STEP_APPROVED]: {
    [WorkflowStates.PENDING]: "Proceed to Next Step",
    [WorkflowStates.APPROVED]: "Complete Workflow",
  },
  [WorkflowStates.STEP_REJECTED]: {
    [WorkflowStates.PENDING]: "Submit Revision",
    [WorkflowStates.REJECTED]: "Final Rejection",
  },
  [WorkflowStates.ESCALATED]: {
    [WorkflowStates.IN_REVIEW]: "Return to Review",
    [WorkflowStates.STEP_APPROVED]: "Approve (Escalated)",
    [WorkflowStates.STEP_REJECTED]: "Reject (Escalated)",
    [WorkflowStates.ON_HOLD]: "Put On Hold",
    [WorkflowStates.CANCELLED]: "Cancel",
  },
  [WorkflowStates.DELEGATED]: {
    [WorkflowStates.IN_REVIEW]: "Accept Delegation",
    [WorkflowStates.AWAITING_APPROVAL]: "Await Delegatee",
    [WorkflowStates.CANCELLED]: "Cancel",
  },
  [WorkflowStates.ON_HOLD]: {
    [WorkflowStates.PENDING]: "Resume",
    [WorkflowStates.IN_REVIEW]: "Resume Review",
    [WorkflowStates.CANCELLED]: "Cancel",
    [WorkflowStates.EXPIRED]: "Mark Expired",
  },
  [WorkflowStates.APPROVED]: {},
  [WorkflowStates.REJECTED]: {},
  [WorkflowStates.CANCELLED]: {},
  [WorkflowStates.EXPIRED]: {},
};

/**
 * Metadata about transitions that may require additional information.
 */
export interface WorkflowTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition requires specifying a user (delegate, escalate) */
  requiresTargetUser: boolean;
  /** Whether this transition sends notification to requester */
  notifiesRequester: boolean;
  /** Whether this transition sends notification to approvers */
  notifiesApprovers: boolean;
  /** Whether this transition affects SLA metrics */
  affectsSLA: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TRANSITION_METADATA: Record<string, WorkflowTransitionMetadata> = {
  "draft->pending": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.submitted",
  },
  "draft->cancelled": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: false,
    affectsSLA: false,
    auditAction: "workflow.draft_discarded",
  },
  "pending->in_review": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.review_started",
  },
  "pending->escalated": {
    requiresReason: true,
    requiresTargetUser: true,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.escalated",
  },
  "pending->on_hold": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.on_hold",
  },
  "pending->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "pending->expired": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.expired",
  },
  "in_review->awaiting_approval": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.approval_requested",
  },
  "in_review->step_approved": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.step_approved",
  },
  "in_review->step_rejected": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.step_rejected",
  },
  "in_review->escalated": {
    requiresReason: true,
    requiresTargetUser: true,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.escalated",
  },
  "in_review->delegated": {
    requiresReason: false,
    requiresTargetUser: true,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.delegated",
  },
  "in_review->on_hold": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.on_hold",
  },
  "in_review->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "awaiting_approval->step_approved": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.step_approved",
  },
  "awaiting_approval->step_rejected": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.step_rejected",
  },
  "awaiting_approval->escalated": {
    requiresReason: true,
    requiresTargetUser: true,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.escalated",
  },
  "awaiting_approval->delegated": {
    requiresReason: false,
    requiresTargetUser: true,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.delegated",
  },
  "awaiting_approval->on_hold": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.on_hold",
  },
  "awaiting_approval->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "awaiting_approval->expired": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.expired",
  },
  "step_approved->pending": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.next_step",
  },
  "step_approved->approved": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.completed",
  },
  "step_rejected->pending": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.revision_submitted",
  },
  "step_rejected->rejected": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: false,
    auditAction: "workflow.finally_rejected",
  },
  "escalated->in_review": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: false,
    auditAction: "workflow.returned_from_escalation",
  },
  "escalated->step_approved": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.escalation_approved",
  },
  "escalated->step_rejected": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.escalation_rejected",
  },
  "escalated->on_hold": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.on_hold",
  },
  "escalated->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "delegated->in_review": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.delegation_accepted",
  },
  "delegated->awaiting_approval": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: false,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.delegated_awaiting",
  },
  "delegated->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "on_hold->pending": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: true,
    auditAction: "workflow.resumed",
  },
  "on_hold->in_review": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: false,
    affectsSLA: true,
    auditAction: "workflow.resumed_review",
  },
  "on_hold->cancelled": {
    requiresReason: true,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.cancelled",
  },
  "on_hold->expired": {
    requiresReason: false,
    requiresTargetUser: false,
    notifiesRequester: true,
    notifiesApprovers: true,
    affectsSLA: false,
    auditAction: "workflow.expired",
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 */
export function canTransitionWorkflow(
  fromState: WorkflowState,
  toState: WorkflowState
): boolean {
  const validTargets = WORKFLOW_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 */
export function getValidWorkflowTransitions(
  currentState: WorkflowState
): WorkflowState[] {
  return WORKFLOW_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 */
export function getWorkflowTransitionMetadata(
  fromState: WorkflowState,
  toState: WorkflowState
): WorkflowTransitionMetadata | null {
  if (!canTransitionWorkflow(fromState, toState)) {
    return null;
  }
  return TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 */
export function getWorkflowTransitionLabel(
  fromState: WorkflowState,
  toState: WorkflowState
): string | undefined {
  return WORKFLOW_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 */
export function validateWorkflowTransition(
  fromState: WorkflowState,
  toState: WorkflowState
): string | null {
  if (fromState === toState) {
    return `Workflow is already in ${fromState} state`;
  }

  if (!canTransitionWorkflow(fromState, toState)) {
    const validTargets = getValidWorkflowTransitions(fromState);

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
export function isWorkflowTerminalState(state: WorkflowState): boolean {
  return getValidWorkflowTransitions(state).length === 0;
}

/**
 * Check if workflow is active (requires action).
 */
export function isWorkflowActive(state: WorkflowState): boolean {
  const activeStates: WorkflowState[] = [
    WorkflowStates.DRAFT,
    WorkflowStates.PENDING,
    WorkflowStates.IN_REVIEW,
    WorkflowStates.AWAITING_APPROVAL,
    WorkflowStates.STEP_APPROVED,
    WorkflowStates.STEP_REJECTED,
    WorkflowStates.ESCALATED,
    WorkflowStates.DELEGATED,
    WorkflowStates.ON_HOLD,
  ];
  return activeStates.includes(state);
}

/**
 * Check if workflow requires approval action.
 */
export function workflowRequiresApproval(state: WorkflowState): boolean {
  const approvalStates: WorkflowState[] = [
    WorkflowStates.PENDING,
    WorkflowStates.IN_REVIEW,
    WorkflowStates.AWAITING_APPROVAL,
    WorkflowStates.ESCALATED,
    WorkflowStates.DELEGATED,
  ];
  return approvalStates.includes(state);
}

/**
 * Get the initial state for a new workflow.
 */
export function getWorkflowInitialState(): WorkflowState {
  return WorkflowStates.DRAFT;
}

/**
 * Type guard to check if a string is a valid workflow state.
 */
export function isWorkflowState(state: string): state is WorkflowState {
  return Object.values(WorkflowStates).includes(state as WorkflowState);
}

/**
 * Get a summary of the state machine.
 */
export function getWorkflowStateMachineSummary(): {
  states: WorkflowState[];
  transitions: Record<WorkflowState, WorkflowState[]>;
  terminalStates: WorkflowState[];
  initialState: WorkflowState;
} {
  const states = Object.values(WorkflowStates);
  const terminalStates = states.filter(isWorkflowTerminalState);

  return {
    states,
    transitions: { ...WORKFLOW_TRANSITIONS },
    terminalStates,
    initialState: getWorkflowInitialState(),
  };
}
