/**
 * Recruitment State Machines
 *
 * Defines the valid states and transitions for:
 * - Requisition lifecycle (draft -> open -> filled/cancelled)
 * - Candidate pipeline stages (applied -> screening -> interview -> offer -> hired)
 * - Offer lifecycle (draft -> pending_approval -> approved -> extended -> accepted)
 *
 * Based on enum types defined in migration 0056_talent_enums.sql.
 */

// =============================================================================
// Requisition State Machine
// =============================================================================

/**
 * All possible requisition lifecycle states.
 * Based on app.requisition_status enum in migration 0056.
 */
export const RequisitionStates = {
  /** Being created, not yet approved */
  DRAFT: "draft",
  /** Approved and actively recruiting */
  OPEN: "open",
  /** Temporarily paused (budget freeze, re-org, etc.) */
  ON_HOLD: "on_hold",
  /** All openings have been filled */
  FILLED: "filled",
  /** No longer needed, permanently closed */
  CANCELLED: "cancelled",
} as const;

export type RequisitionState = (typeof RequisitionStates)[keyof typeof RequisitionStates];

/**
 * Valid transitions for the requisition state machine.
 * Matches the transition rules documented in migration 0056.
 */
const REQUISITION_TRANSITIONS: Record<RequisitionState, RequisitionState[]> = {
  // From draft: can be opened (approved) or cancelled
  [RequisitionStates.DRAFT]: [
    RequisitionStates.OPEN,
    RequisitionStates.CANCELLED,
  ],

  // From open: can go on hold, be filled, or cancelled
  [RequisitionStates.OPEN]: [
    RequisitionStates.ON_HOLD,
    RequisitionStates.FILLED,
    RequisitionStates.CANCELLED,
  ],

  // From on_hold: can resume (open) or be cancelled
  [RequisitionStates.ON_HOLD]: [
    RequisitionStates.OPEN,
    RequisitionStates.CANCELLED,
  ],

  // From filled: terminal state
  [RequisitionStates.FILLED]: [],

  // From cancelled: terminal state
  [RequisitionStates.CANCELLED]: [],
};

/**
 * Human-readable labels for each requisition transition action.
 */
export const REQUISITION_TRANSITION_LABELS: Record<
  RequisitionState,
  Partial<Record<RequisitionState, string>>
> = {
  [RequisitionStates.DRAFT]: {
    [RequisitionStates.OPEN]: "Approve & Open",
    [RequisitionStates.CANCELLED]: "Cancel Requisition",
  },
  [RequisitionStates.OPEN]: {
    [RequisitionStates.ON_HOLD]: "Put on Hold",
    [RequisitionStates.FILLED]: "Mark as Filled",
    [RequisitionStates.CANCELLED]: "Cancel Requisition",
  },
  [RequisitionStates.ON_HOLD]: {
    [RequisitionStates.OPEN]: "Resume Recruiting",
    [RequisitionStates.CANCELLED]: "Cancel Requisition",
  },
  [RequisitionStates.FILLED]: {},
  [RequisitionStates.CANCELLED]: {},
};

/**
 * Metadata about requisition transitions.
 */
export interface RequisitionTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition requires approval */
  requiresApproval: boolean;
  /** Whether this transition notifies the hiring manager */
  notifiesHiringManager: boolean;
  /** Whether this transition affects active candidates */
  affectsCandidates: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const REQUISITION_TRANSITION_METADATA: Record<string, RequisitionTransitionMetadata> = {
  "draft->open": {
    requiresReason: false,
    requiresApproval: true,
    notifiesHiringManager: true,
    affectsCandidates: false,
    auditAction: "requisition.opened",
  },
  "draft->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: false,
    auditAction: "requisition.cancelled",
  },
  "open->on_hold": {
    requiresReason: true,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: true,
    auditAction: "requisition.put_on_hold",
  },
  "open->filled": {
    requiresReason: false,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: true,
    auditAction: "requisition.filled",
  },
  "open->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: true,
    auditAction: "requisition.cancelled",
  },
  "on_hold->open": {
    requiresReason: false,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: false,
    auditAction: "requisition.resumed",
  },
  "on_hold->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesHiringManager: true,
    affectsCandidates: true,
    auditAction: "requisition.cancelled",
  },
};

// -- Requisition State Machine Functions --

/**
 * Check if a requisition transition is valid.
 */
export function canTransitionRequisition(
  fromState: RequisitionState,
  toState: RequisitionState
): boolean {
  const validTargets = REQUISITION_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current requisition state.
 */
export function getValidRequisitionTransitions(
  currentState: RequisitionState
): RequisitionState[] {
  return REQUISITION_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for a requisition transition.
 */
export function getRequisitionTransitionMetadata(
  fromState: RequisitionState,
  toState: RequisitionState
): RequisitionTransitionMetadata | null {
  if (!canTransitionRequisition(fromState, toState)) {
    return null;
  }
  return REQUISITION_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a requisition transition.
 */
export function getRequisitionTransitionLabel(
  fromState: RequisitionState,
  toState: RequisitionState
): string | undefined {
  return REQUISITION_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a requisition transition and return error message if invalid.
 */
export function validateRequisitionTransition(
  fromState: RequisitionState,
  toState: RequisitionState
): string | null {
  if (fromState === toState) {
    return `Requisition is already in ${fromState} state`;
  }

  if (!canTransitionRequisition(fromState, toState)) {
    const validTargets = getValidRequisitionTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a requisition state is a terminal state.
 */
export function isRequisitionTerminalState(state: RequisitionState): boolean {
  return getValidRequisitionTransitions(state).length === 0;
}

/**
 * Check if a requisition is actively accepting candidates.
 */
export function isRequisitionActive(state: RequisitionState): boolean {
  return state === RequisitionStates.OPEN;
}

/**
 * Get the initial state for a new requisition.
 */
export function getRequisitionInitialState(): RequisitionState {
  return RequisitionStates.DRAFT;
}

/**
 * Type guard to check if a string is a valid requisition state.
 */
export function isRequisitionState(state: string): state is RequisitionState {
  return Object.values(RequisitionStates).includes(state as RequisitionState);
}

/**
 * Get a summary of the requisition state machine.
 */
export function getRequisitionStateMachineSummary(): {
  states: RequisitionState[];
  transitions: Record<RequisitionState, RequisitionState[]>;
  terminalStates: RequisitionState[];
  initialState: RequisitionState;
} {
  const states = Object.values(RequisitionStates);
  const terminalStates = states.filter(isRequisitionTerminalState);

  return {
    states,
    transitions: { ...REQUISITION_TRANSITIONS },
    terminalStates,
    initialState: getRequisitionInitialState(),
  };
}

// =============================================================================
// Candidate Stage State Machine
// =============================================================================

/**
 * All possible candidate pipeline stages.
 * Based on app.candidate_stage enum in migration 0056.
 */
export const CandidateStages = {
  /** Initial application received */
  APPLIED: "applied",
  /** Resume/application screening */
  SCREENING: "screening",
  /** In interview process */
  INTERVIEW: "interview",
  /** Offer stage (pending, extended, negotiating) */
  OFFER: "offer",
  /** Accepted and onboarding */
  HIRED: "hired",
  /** Not selected at any stage */
  REJECTED: "rejected",
  /** Candidate withdrew from process */
  WITHDRAWN: "withdrawn",
} as const;

export type CandidateStage = (typeof CandidateStages)[keyof typeof CandidateStages];

/**
 * Valid transitions for the candidate stage state machine.
 * Candidates generally move forward through the pipeline, with rejection
 * and withdrawal possible from any active stage.
 */
const CANDIDATE_STAGE_TRANSITIONS: Record<CandidateStage, CandidateStage[]> = {
  // From applied: can advance to screening, or be rejected/withdrawn
  [CandidateStages.APPLIED]: [
    CandidateStages.SCREENING,
    CandidateStages.REJECTED,
    CandidateStages.WITHDRAWN,
  ],

  // From screening: can advance to interview, or be rejected/withdrawn
  [CandidateStages.SCREENING]: [
    CandidateStages.INTERVIEW,
    CandidateStages.REJECTED,
    CandidateStages.WITHDRAWN,
  ],

  // From interview: can advance to offer, or be rejected/withdrawn
  [CandidateStages.INTERVIEW]: [
    CandidateStages.OFFER,
    CandidateStages.REJECTED,
    CandidateStages.WITHDRAWN,
  ],

  // From offer: can be hired, rejected (declined), or withdrawn
  [CandidateStages.OFFER]: [
    CandidateStages.HIRED,
    CandidateStages.REJECTED,
    CandidateStages.WITHDRAWN,
  ],

  // From hired: terminal state
  [CandidateStages.HIRED]: [],

  // From rejected: terminal state
  [CandidateStages.REJECTED]: [],

  // From withdrawn: terminal state
  [CandidateStages.WITHDRAWN]: [],
};

/**
 * Human-readable labels for each candidate stage transition action.
 */
export const CANDIDATE_STAGE_TRANSITION_LABELS: Record<
  CandidateStage,
  Partial<Record<CandidateStage, string>>
> = {
  [CandidateStages.APPLIED]: {
    [CandidateStages.SCREENING]: "Move to Screening",
    [CandidateStages.REJECTED]: "Reject",
    [CandidateStages.WITHDRAWN]: "Mark as Withdrawn",
  },
  [CandidateStages.SCREENING]: {
    [CandidateStages.INTERVIEW]: "Advance to Interview",
    [CandidateStages.REJECTED]: "Reject",
    [CandidateStages.WITHDRAWN]: "Mark as Withdrawn",
  },
  [CandidateStages.INTERVIEW]: {
    [CandidateStages.OFFER]: "Extend Offer",
    [CandidateStages.REJECTED]: "Reject",
    [CandidateStages.WITHDRAWN]: "Mark as Withdrawn",
  },
  [CandidateStages.OFFER]: {
    [CandidateStages.HIRED]: "Mark as Hired",
    [CandidateStages.REJECTED]: "Offer Declined",
    [CandidateStages.WITHDRAWN]: "Mark as Withdrawn",
  },
  [CandidateStages.HIRED]: {},
  [CandidateStages.REJECTED]: {},
  [CandidateStages.WITHDRAWN]: {},
};

/**
 * Metadata about candidate stage transitions.
 */
export interface CandidateStageTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition sends notification to the candidate */
  notifiesCandidate: boolean;
  /** Whether this transition sends notification to the hiring manager */
  notifiesHiringManager: boolean;
  /** Whether this transition triggers an integration (e.g., onboarding) */
  triggersIntegration: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const CANDIDATE_STAGE_TRANSITION_METADATA: Record<string, CandidateStageTransitionMetadata> = {
  "applied->screening": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: false,
    triggersIntegration: false,
    auditAction: "candidate.moved_to_screening",
  },
  "applied->rejected": {
    requiresReason: true,
    notifiesCandidate: true,
    notifiesHiringManager: false,
    triggersIntegration: false,
    auditAction: "candidate.rejected",
  },
  "applied->withdrawn": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.withdrawn",
  },
  "screening->interview": {
    requiresReason: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.moved_to_interview",
  },
  "screening->rejected": {
    requiresReason: true,
    notifiesCandidate: true,
    notifiesHiringManager: false,
    triggersIntegration: false,
    auditAction: "candidate.rejected",
  },
  "screening->withdrawn": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.withdrawn",
  },
  "interview->offer": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.moved_to_offer",
  },
  "interview->rejected": {
    requiresReason: true,
    notifiesCandidate: true,
    notifiesHiringManager: false,
    triggersIntegration: false,
    auditAction: "candidate.rejected",
  },
  "interview->withdrawn": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.withdrawn",
  },
  "offer->hired": {
    requiresReason: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    triggersIntegration: true,
    auditAction: "candidate.hired",
  },
  "offer->rejected": {
    requiresReason: true,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.offer_declined",
  },
  "offer->withdrawn": {
    requiresReason: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    triggersIntegration: false,
    auditAction: "candidate.withdrawn",
  },
};

// -- Candidate Stage State Machine Functions --

/**
 * Check if a candidate stage transition is valid.
 */
export function canTransitionCandidateStage(
  fromStage: CandidateStage,
  toStage: CandidateStage
): boolean {
  const validTargets = CANDIDATE_STAGE_TRANSITIONS[fromStage];
  return validTargets?.includes(toStage) ?? false;
}

/**
 * Get all valid transitions from the current candidate stage.
 */
export function getValidCandidateStageTransitions(
  currentStage: CandidateStage
): CandidateStage[] {
  return CANDIDATE_STAGE_TRANSITIONS[currentStage] ?? [];
}

/**
 * Get transition metadata for a candidate stage transition.
 */
export function getCandidateStageTransitionMetadata(
  fromStage: CandidateStage,
  toStage: CandidateStage
): CandidateStageTransitionMetadata | null {
  if (!canTransitionCandidateStage(fromStage, toStage)) {
    return null;
  }
  return CANDIDATE_STAGE_TRANSITION_METADATA[`${fromStage}->${toStage}`] ?? null;
}

/**
 * Get human-readable label for a candidate stage transition.
 */
export function getCandidateStageTransitionLabel(
  fromStage: CandidateStage,
  toStage: CandidateStage
): string | undefined {
  return CANDIDATE_STAGE_TRANSITION_LABELS[fromStage]?.[toStage];
}

/**
 * Validate a candidate stage transition and return error message if invalid.
 */
export function validateCandidateStageTransition(
  fromStage: CandidateStage,
  toStage: CandidateStage
): string | null {
  if (fromStage === toStage) {
    return `Candidate is already in ${fromStage} stage`;
  }

  if (!canTransitionCandidateStage(fromStage, toStage)) {
    const validTargets = getValidCandidateStageTransitions(fromStage);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromStage} stage. This is a terminal stage.`;
    }

    return `Invalid transition from ${fromStage} to ${toStage}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a candidate stage is a terminal stage.
 */
export function isCandidateStageTerminal(stage: CandidateStage): boolean {
  return getValidCandidateStageTransitions(stage).length === 0;
}

/**
 * Check if a candidate is still active in the pipeline.
 */
export function isCandidateActive(stage: CandidateStage): boolean {
  const activeStages: CandidateStage[] = [
    CandidateStages.APPLIED,
    CandidateStages.SCREENING,
    CandidateStages.INTERVIEW,
    CandidateStages.OFFER,
  ];
  return activeStages.includes(stage);
}

/**
 * Get the initial stage for a new candidate.
 */
export function getCandidateInitialStage(): CandidateStage {
  return CandidateStages.APPLIED;
}

/**
 * Type guard to check if a string is a valid candidate stage.
 */
export function isCandidateStage(stage: string): stage is CandidateStage {
  return Object.values(CandidateStages).includes(stage as CandidateStage);
}

/**
 * Get a summary of the candidate stage state machine.
 */
export function getCandidateStageStateMachineSummary(): {
  stages: CandidateStage[];
  transitions: Record<CandidateStage, CandidateStage[]>;
  terminalStages: CandidateStage[];
  initialStage: CandidateStage;
} {
  const stages = Object.values(CandidateStages);
  const terminalStages = stages.filter(isCandidateStageTerminal);

  return {
    stages,
    transitions: { ...CANDIDATE_STAGE_TRANSITIONS },
    terminalStages,
    initialStage: getCandidateInitialStage(),
  };
}

// =============================================================================
// Offer Status State Machine
// =============================================================================

/**
 * All possible offer lifecycle states.
 * Based on app.offer_status enum in migration 0056.
 */
export const OfferStates = {
  /** Being prepared */
  DRAFT: "draft",
  /** Submitted for internal approval */
  PENDING_APPROVAL: "pending_approval",
  /** Approved, ready to extend */
  APPROVED: "approved",
  /** Sent to candidate */
  EXTENDED: "extended",
  /** Candidate accepted */
  ACCEPTED: "accepted",
  /** Candidate declined */
  REJECTED: "rejected",
  /** Offer expired without response */
  EXPIRED: "expired",
  /** Offer withdrawn by company */
  CANCELLED: "cancelled",
} as const;

export type OfferState = (typeof OfferStates)[keyof typeof OfferStates];

/**
 * Valid transitions for the offer status state machine.
 * Matches the transition rules documented in migration 0056.
 */
const OFFER_TRANSITIONS: Record<OfferState, OfferState[]> = {
  // From draft: submit for approval or cancel
  [OfferStates.DRAFT]: [
    OfferStates.PENDING_APPROVAL,
    OfferStates.CANCELLED,
  ],

  // From pending_approval: can be approved or cancelled
  [OfferStates.PENDING_APPROVAL]: [
    OfferStates.APPROVED,
    OfferStates.CANCELLED,
  ],

  // From approved: can be extended (sent to candidate) or cancelled
  [OfferStates.APPROVED]: [
    OfferStates.EXTENDED,
    OfferStates.CANCELLED,
  ],

  // From extended: candidate accepts, rejects, or offer expires/is cancelled
  [OfferStates.EXTENDED]: [
    OfferStates.ACCEPTED,
    OfferStates.REJECTED,
    OfferStates.EXPIRED,
    OfferStates.CANCELLED,
  ],

  // From accepted: terminal state
  [OfferStates.ACCEPTED]: [],

  // From rejected: terminal state
  [OfferStates.REJECTED]: [],

  // From expired: terminal state
  [OfferStates.EXPIRED]: [],

  // From cancelled: terminal state
  [OfferStates.CANCELLED]: [],
};

/**
 * Human-readable labels for each offer transition action.
 */
export const OFFER_TRANSITION_LABELS: Record<
  OfferState,
  Partial<Record<OfferState, string>>
> = {
  [OfferStates.DRAFT]: {
    [OfferStates.PENDING_APPROVAL]: "Submit for Approval",
    [OfferStates.CANCELLED]: "Cancel Offer",
  },
  [OfferStates.PENDING_APPROVAL]: {
    [OfferStates.APPROVED]: "Approve Offer",
    [OfferStates.CANCELLED]: "Cancel Offer",
  },
  [OfferStates.APPROVED]: {
    [OfferStates.EXTENDED]: "Extend to Candidate",
    [OfferStates.CANCELLED]: "Withdraw Offer",
  },
  [OfferStates.EXTENDED]: {
    [OfferStates.ACCEPTED]: "Candidate Accepted",
    [OfferStates.REJECTED]: "Candidate Declined",
    [OfferStates.EXPIRED]: "Mark as Expired",
    [OfferStates.CANCELLED]: "Withdraw Offer",
  },
  [OfferStates.ACCEPTED]: {},
  [OfferStates.REJECTED]: {},
  [OfferStates.EXPIRED]: {},
  [OfferStates.CANCELLED]: {},
};

/**
 * Metadata about offer transitions.
 */
export interface OfferTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition requires approval */
  requiresApproval: boolean;
  /** Whether this transition notifies the candidate */
  notifiesCandidate: boolean;
  /** Whether this transition notifies the hiring manager */
  notifiesHiringManager: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const OFFER_TRANSITION_METADATA: Record<string, OfferTransitionMetadata> = {
  "draft->pending_approval": {
    requiresReason: false,
    requiresApproval: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    auditAction: "offer.submitted_for_approval",
  },
  "draft->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesCandidate: false,
    notifiesHiringManager: false,
    auditAction: "offer.cancelled",
  },
  "pending_approval->approved": {
    requiresReason: false,
    requiresApproval: true,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    auditAction: "offer.approved",
  },
  "pending_approval->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    auditAction: "offer.cancelled",
  },
  "approved->extended": {
    requiresReason: false,
    requiresApproval: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    auditAction: "offer.extended",
  },
  "approved->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    auditAction: "offer.cancelled",
  },
  "extended->accepted": {
    requiresReason: false,
    requiresApproval: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    auditAction: "offer.accepted",
  },
  "extended->rejected": {
    requiresReason: true,
    requiresApproval: false,
    notifiesCandidate: false,
    notifiesHiringManager: true,
    auditAction: "offer.declined",
  },
  "extended->expired": {
    requiresReason: false,
    requiresApproval: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    auditAction: "offer.expired",
  },
  "extended->cancelled": {
    requiresReason: true,
    requiresApproval: false,
    notifiesCandidate: true,
    notifiesHiringManager: true,
    auditAction: "offer.withdrawn",
  },
};

// -- Offer State Machine Functions --

/**
 * Check if an offer transition is valid.
 */
export function canTransitionOffer(
  fromState: OfferState,
  toState: OfferState
): boolean {
  const validTargets = OFFER_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current offer state.
 */
export function getValidOfferTransitions(
  currentState: OfferState
): OfferState[] {
  return OFFER_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for an offer transition.
 */
export function getOfferTransitionMetadata(
  fromState: OfferState,
  toState: OfferState
): OfferTransitionMetadata | null {
  if (!canTransitionOffer(fromState, toState)) {
    return null;
  }
  return OFFER_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for an offer transition.
 */
export function getOfferTransitionLabel(
  fromState: OfferState,
  toState: OfferState
): string | undefined {
  return OFFER_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate an offer transition and return error message if invalid.
 */
export function validateOfferTransition(
  fromState: OfferState,
  toState: OfferState
): string | null {
  if (fromState === toState) {
    return `Offer is already in ${fromState} state`;
  }

  if (!canTransitionOffer(fromState, toState)) {
    const validTargets = getValidOfferTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if an offer state is a terminal state.
 */
export function isOfferTerminalState(state: OfferState): boolean {
  return getValidOfferTransitions(state).length === 0;
}

/**
 * Check if an offer is still active (can be acted upon).
 */
export function isOfferActive(state: OfferState): boolean {
  const activeStates: OfferState[] = [
    OfferStates.DRAFT,
    OfferStates.PENDING_APPROVAL,
    OfferStates.APPROVED,
    OfferStates.EXTENDED,
  ];
  return activeStates.includes(state);
}

/**
 * Get the initial state for a new offer.
 */
export function getOfferInitialState(): OfferState {
  return OfferStates.DRAFT;
}

/**
 * Type guard to check if a string is a valid offer state.
 */
export function isOfferState(state: string): state is OfferState {
  return Object.values(OfferStates).includes(state as OfferState);
}

/**
 * Get a summary of the offer state machine.
 */
export function getOfferStateMachineSummary(): {
  states: OfferState[];
  transitions: Record<OfferState, OfferState[]>;
  terminalStates: OfferState[];
  initialState: OfferState;
} {
  const states = Object.values(OfferStates);
  const terminalStates = states.filter(isOfferTerminalState);

  return {
    states,
    transitions: { ...OFFER_TRANSITIONS },
    terminalStates,
    initialState: getOfferInitialState(),
  };
}
