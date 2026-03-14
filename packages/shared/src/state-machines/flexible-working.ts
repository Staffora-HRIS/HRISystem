/**
 * Flexible Working Request State Machine
 *
 * Defines the valid states and transitions for flexible working requests
 * under the Employment Relations (Flexible Working) Act 2023.
 *
 * State flow:
 *   submitted -> under_review -> consultation_scheduled -> consultation_complete
 *     -> approved (with effective date, optional modifications)
 *     -> rejected (must cite 1 of 8 statutory grounds, must be after consultation)
 *   rejected -> appeal -> appeal_approved / appeal_rejected
 *   Any non-terminal state -> withdrawn (employee withdraws)
 *
 * Based on enum type defined in migration 0138_flexible_working.sql,
 * extended in 0157_flexible_working_enhancements.sql.
 */

// =============================================================================
// States
// =============================================================================

/**
 * All possible flexible working request states.
 * Maps to app.flexible_working_status enum in the database.
 */
export const FlexibleWorkingStates = {
  /** Initial submission by employee */
  SUBMITTED: "submitted",
  /** Legacy alias - mapped to SUBMITTED for backwards compat */
  PENDING: "pending",
  /** Manager/HR is reviewing the request */
  UNDER_REVIEW: "under_review",
  /** Mandatory consultation meeting scheduled */
  CONSULTATION_SCHEDULED: "consultation_scheduled",
  /** Consultation meeting completed, awaiting decision */
  CONSULTATION_COMPLETE: "consultation_complete",
  /** Legacy alias - mapped to CONSULTATION_SCHEDULED for backwards compat */
  CONSULTATION: "consultation",
  /** Request approved - new working arrangement confirmed */
  APPROVED: "approved",
  /** Request rejected with statutory grounds */
  REJECTED: "rejected",
  /** Employee has appealed a rejection */
  APPEAL: "appeal",
  /** Appeal upheld - original rejection overturned */
  APPEAL_APPROVED: "appeal_approved",
  /** Appeal dismissed - rejection stands */
  APPEAL_REJECTED: "appeal_rejected",
  /** Employee withdrew the request */
  WITHDRAWN: "withdrawn",
} as const;

export type FlexibleWorkingState =
  (typeof FlexibleWorkingStates)[keyof typeof FlexibleWorkingStates];

// =============================================================================
// Transition Map
// =============================================================================

/**
 * Valid transitions for the flexible working request state machine.
 *
 * Key legal requirements encoded:
 * - Consultation must occur before rejection (consultation_scheduled -> consultation_complete)
 * - Rejection can only come after consultation_complete
 * - Approval can come at any review stage (employer can approve without full process)
 * - Appeal is only available after rejection
 * - Withdrawal is possible until a terminal state is reached
 */
const FLEXIBLE_WORKING_TRANSITIONS: Record<FlexibleWorkingState, FlexibleWorkingState[]> = {
  [FlexibleWorkingStates.SUBMITTED]: [
    FlexibleWorkingStates.UNDER_REVIEW,
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.PENDING]: [
    FlexibleWorkingStates.UNDER_REVIEW,
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.UNDER_REVIEW]: [
    FlexibleWorkingStates.CONSULTATION_SCHEDULED,
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.CONSULTATION_SCHEDULED]: [
    FlexibleWorkingStates.CONSULTATION_COMPLETE,
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.CONSULTATION]: [
    FlexibleWorkingStates.CONSULTATION_COMPLETE,
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.CONSULTATION_COMPLETE]: [
    FlexibleWorkingStates.APPROVED,
    FlexibleWorkingStates.REJECTED,
    FlexibleWorkingStates.WITHDRAWN,
  ],
  [FlexibleWorkingStates.APPROVED]: [],
  [FlexibleWorkingStates.REJECTED]: [
    FlexibleWorkingStates.APPEAL,
  ],
  [FlexibleWorkingStates.APPEAL]: [
    FlexibleWorkingStates.APPEAL_APPROVED,
    FlexibleWorkingStates.APPEAL_REJECTED,
  ],
  [FlexibleWorkingStates.APPEAL_APPROVED]: [],
  [FlexibleWorkingStates.APPEAL_REJECTED]: [],
  [FlexibleWorkingStates.WITHDRAWN]: [],
};

// =============================================================================
// Transition Labels
// =============================================================================

/**
 * Human-readable labels for each transition action.
 */
export const FLEXIBLE_WORKING_TRANSITION_LABELS: Record<
  FlexibleWorkingState,
  Partial<Record<FlexibleWorkingState, string>>
> = {
  [FlexibleWorkingStates.SUBMITTED]: {
    [FlexibleWorkingStates.UNDER_REVIEW]: "Begin Review",
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.PENDING]: {
    [FlexibleWorkingStates.UNDER_REVIEW]: "Begin Review",
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.UNDER_REVIEW]: {
    [FlexibleWorkingStates.CONSULTATION_SCHEDULED]: "Schedule Consultation",
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.CONSULTATION_SCHEDULED]: {
    [FlexibleWorkingStates.CONSULTATION_COMPLETE]: "Complete Consultation",
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.CONSULTATION]: {
    [FlexibleWorkingStates.CONSULTATION_COMPLETE]: "Complete Consultation",
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.CONSULTATION_COMPLETE]: {
    [FlexibleWorkingStates.APPROVED]: "Approve Request",
    [FlexibleWorkingStates.REJECTED]: "Reject Request",
    [FlexibleWorkingStates.WITHDRAWN]: "Withdraw Request",
  },
  [FlexibleWorkingStates.APPROVED]: {},
  [FlexibleWorkingStates.REJECTED]: {
    [FlexibleWorkingStates.APPEAL]: "Appeal Decision",
  },
  [FlexibleWorkingStates.APPEAL]: {
    [FlexibleWorkingStates.APPEAL_APPROVED]: "Uphold Appeal",
    [FlexibleWorkingStates.APPEAL_REJECTED]: "Dismiss Appeal",
  },
  [FlexibleWorkingStates.APPEAL_APPROVED]: {},
  [FlexibleWorkingStates.APPEAL_REJECTED]: {},
  [FlexibleWorkingStates.WITHDRAWN]: {},
};

// =============================================================================
// Transition Metadata
// =============================================================================

export interface FlexibleWorkingTransitionMetadata {
  /** Whether this transition requires a reason/notes */
  requiresReason: boolean;
  /** Whether this transition requires a decision_by user */
  requiresDecisionBy: boolean;
  /** Whether this transition requires statutory rejection grounds */
  requiresRejectionGrounds: boolean;
  /** Whether this transition requires an effective date */
  requiresEffectiveDate: boolean;
  /** Whether this transition requires consultation to have occurred */
  requiresConsultation: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TRANSITION_METADATA: Record<string, FlexibleWorkingTransitionMetadata> = {
  "submitted->under_review": {
    requiresReason: false,
    requiresDecisionBy: false,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: false,
    auditAction: "flexible_working.request.review_started",
  },
  "pending->under_review": {
    requiresReason: false,
    requiresDecisionBy: false,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: false,
    auditAction: "flexible_working.request.review_started",
  },
  "under_review->consultation_scheduled": {
    requiresReason: false,
    requiresDecisionBy: false,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: false,
    auditAction: "flexible_working.request.consultation_scheduled",
  },
  "consultation_scheduled->consultation_complete": {
    requiresReason: true,
    requiresDecisionBy: false,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: true,
    auditAction: "flexible_working.request.consultation_completed",
  },
  "consultation_complete->approved": {
    requiresReason: false,
    requiresDecisionBy: true,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: true,
    requiresConsultation: true,
    auditAction: "flexible_working.request.approved",
  },
  "consultation_complete->rejected": {
    requiresReason: true,
    requiresDecisionBy: true,
    requiresRejectionGrounds: true,
    requiresEffectiveDate: false,
    requiresConsultation: true,
    auditAction: "flexible_working.request.rejected",
  },
  "rejected->appeal": {
    requiresReason: true,
    requiresDecisionBy: false,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: false,
    auditAction: "flexible_working.request.appealed",
  },
  "appeal->appeal_approved": {
    requiresReason: true,
    requiresDecisionBy: true,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: true,
    requiresConsultation: false,
    auditAction: "flexible_working.request.appeal_approved",
  },
  "appeal->appeal_rejected": {
    requiresReason: true,
    requiresDecisionBy: true,
    requiresRejectionGrounds: false,
    requiresEffectiveDate: false,
    requiresConsultation: false,
    auditAction: "flexible_working.request.appeal_rejected",
  },
};

// =============================================================================
// Statutory Rejection Grounds
// =============================================================================

/**
 * The 8 statutory grounds for refusal under ERA 1996, s.80G(1)(b).
 * An employer MUST cite one of these grounds when refusing a flexible working request.
 */
export const STATUTORY_REJECTION_GROUNDS = [
  "burden_of_additional_costs",
  "detrimental_effect_customer_demand",
  "inability_to_reorganise",
  "inability_to_recruit",
  "detrimental_impact_quality",
  "detrimental_impact_performance",
  "insufficient_work",
  "planned_structural_changes",
] as const;

export type StatutoryRejectionGround = (typeof STATUTORY_REJECTION_GROUNDS)[number];

/**
 * Human-readable labels for rejection grounds
 */
export const REJECTION_GROUND_LABELS: Record<StatutoryRejectionGround, string> = {
  burden_of_additional_costs: "Burden of additional costs",
  detrimental_effect_customer_demand: "Detrimental effect on ability to meet customer demand",
  inability_to_reorganise: "Inability to reorganise work among existing staff",
  inability_to_recruit: "Inability to recruit additional staff",
  detrimental_impact_quality: "Detrimental impact on quality",
  detrimental_impact_performance: "Detrimental impact on performance",
  insufficient_work: "Insufficiency of work during proposed periods",
  planned_structural_changes: "Planned structural changes",
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if a transition from one state to another is valid
 */
export function canTransitionFlexibleWorking(
  from: FlexibleWorkingState,
  to: FlexibleWorkingState
): boolean {
  const validTargets = FLEXIBLE_WORKING_TRANSITIONS[from];
  if (!validTargets) return false;
  return validTargets.includes(to);
}

/**
 * Get valid transitions from a given state
 */
export function getValidFlexibleWorkingTransitions(
  from: FlexibleWorkingState
): FlexibleWorkingState[] {
  return FLEXIBLE_WORKING_TRANSITIONS[from] || [];
}

/**
 * Get metadata for a specific transition
 */
export function getFlexibleWorkingTransitionMetadata(
  from: FlexibleWorkingState,
  to: FlexibleWorkingState
): FlexibleWorkingTransitionMetadata | null {
  const key = `${from}->${to}`;
  return TRANSITION_METADATA[key] || null;
}

/**
 * Get a human-readable label for a transition
 */
export function getFlexibleWorkingTransitionLabel(
  from: FlexibleWorkingState,
  to: FlexibleWorkingState
): string | null {
  const labels = FLEXIBLE_WORKING_TRANSITION_LABELS[from];
  if (!labels) return null;
  return labels[to] || null;
}

/**
 * Validate a transition, returning an error message if invalid
 */
export function validateFlexibleWorkingTransition(
  from: FlexibleWorkingState,
  to: FlexibleWorkingState
): { valid: boolean; error?: string } {
  if (!isFlexibleWorkingState(from)) {
    return { valid: false, error: `Unknown state: '${from}'` };
  }
  if (!isFlexibleWorkingState(to)) {
    return { valid: false, error: `Unknown state: '${to}'` };
  }
  if (!canTransitionFlexibleWorking(from, to)) {
    const validTargets = getValidFlexibleWorkingTransitions(from);
    return {
      valid: false,
      error: `Cannot transition from '${from}' to '${to}'. Valid transitions: ${validTargets.join(", ") || "none (terminal state)"}`,
    };
  }
  return { valid: true };
}

/**
 * Check if a state is a terminal state (no further transitions possible)
 */
export function isFlexibleWorkingTerminalState(state: FlexibleWorkingState): boolean {
  const transitions = FLEXIBLE_WORKING_TRANSITIONS[state];
  return !transitions || transitions.length === 0;
}

/**
 * Check if a state represents an active/in-progress request
 */
export function isFlexibleWorkingActive(state: FlexibleWorkingState): boolean {
  return !isFlexibleWorkingTerminalState(state);
}

/**
 * Check if a string is a valid flexible working state
 */
export function isFlexibleWorkingState(value: string): value is FlexibleWorkingState {
  return Object.values(FlexibleWorkingStates).includes(value as FlexibleWorkingState);
}

/**
 * Get the initial state for new flexible working requests
 */
export function getFlexibleWorkingInitialState(): FlexibleWorkingState {
  return FlexibleWorkingStates.SUBMITTED;
}

/**
 * Check if a state requires consultation to have been completed
 * before the request can be rejected.
 */
export function requiresConsultationBeforeRejection(state: FlexibleWorkingState): boolean {
  // Rejection can only come from consultation_complete
  return state === FlexibleWorkingStates.CONSULTATION_COMPLETE;
}

/**
 * Check if a rejection ground is one of the 8 statutory grounds
 */
export function isStatutoryRejectionGround(ground: string): ground is StatutoryRejectionGround {
  return (STATUTORY_REJECTION_GROUNDS as readonly string[]).includes(ground);
}

/**
 * Get summary of the state machine for documentation
 */
export function getFlexibleWorkingStateMachineSummary(): {
  states: string[];
  terminalStates: string[];
  transitions: Record<string, string[]>;
} {
  const states = Object.values(FlexibleWorkingStates);
  const terminalStates = states.filter(isFlexibleWorkingTerminalState);
  const transitions: Record<string, string[]> = {};
  for (const state of states) {
    transitions[state] = getValidFlexibleWorkingTransitions(state);
  }
  return { states, terminalStates, transitions };
}
