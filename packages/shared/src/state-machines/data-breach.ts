/**
 * Data Breach Notification State Machine
 *
 * Defines the valid states and transitions for UK GDPR data breach
 * notification workflow (Articles 33-34).
 *
 * The lifecycle supports parallel tracks:
 * - ICO notification (Article 33): must be within 72 hours
 * - Data subject notification (Article 34): when high risk to individuals
 *
 * Flow:
 *   reported -> assessing -> [ico_notified | remediation_only]
 *   ico_notified -> [subjects_notified | remediation_only]
 *   subjects_notified -> closed
 *   remediation_only -> closed
 */

// =============================================================================
// State Definition
// =============================================================================

/**
 * All possible data breach states.
 */
export const DataBreachStates = {
  /** Breach initially reported, awaiting risk assessment */
  REPORTED: "reported",
  /** Risk assessment in progress to determine severity and notification obligations */
  ASSESSING: "assessing",
  /** ICO has been notified (Article 33) */
  ICO_NOTIFIED: "ico_notified",
  /** Affected data subjects have been notified (Article 34) */
  SUBJECTS_NOTIFIED: "subjects_notified",
  /** Low risk - remediation only, no notification required */
  REMEDIATION_ONLY: "remediation_only",
  /** Breach investigation complete, lessons learned documented */
  CLOSED: "closed",
} as const;

export type DataBreachState =
  (typeof DataBreachStates)[keyof typeof DataBreachStates];

// =============================================================================
// Transition Definition
// =============================================================================

/**
 * Valid transitions for the data breach state machine.
 *
 * reported -> assessing: risk assessment started
 * assessing -> ico_notified: ICO notification required (likely risk to individuals)
 * assessing -> remediation_only: no ICO notification required (unlikely risk)
 * ico_notified -> subjects_notified: data subjects notified (high risk)
 * ico_notified -> remediation_only: no subject notification required (not high risk)
 * subjects_notified -> closed: all notifications complete, breach closed
 * remediation_only -> closed: remediation complete, breach closed
 */
const DATA_BREACH_TRANSITIONS: Record<DataBreachState, DataBreachState[]> = {
  [DataBreachStates.REPORTED]: [DataBreachStates.ASSESSING],

  [DataBreachStates.ASSESSING]: [
    DataBreachStates.ICO_NOTIFIED,
    DataBreachStates.REMEDIATION_ONLY,
  ],

  [DataBreachStates.ICO_NOTIFIED]: [
    DataBreachStates.SUBJECTS_NOTIFIED,
    DataBreachStates.REMEDIATION_ONLY,
  ],

  [DataBreachStates.SUBJECTS_NOTIFIED]: [DataBreachStates.CLOSED],

  [DataBreachStates.REMEDIATION_ONLY]: [DataBreachStates.CLOSED],

  [DataBreachStates.CLOSED]: [],
};

/**
 * Human-readable labels for each transition action.
 */
export const DATA_BREACH_TRANSITION_LABELS: Record<
  DataBreachState,
  Partial<Record<DataBreachState, string>>
> = {
  [DataBreachStates.REPORTED]: {
    [DataBreachStates.ASSESSING]: "Begin Risk Assessment",
  },
  [DataBreachStates.ASSESSING]: {
    [DataBreachStates.ICO_NOTIFIED]: "Notify ICO",
    [DataBreachStates.REMEDIATION_ONLY]: "No Notification Required",
  },
  [DataBreachStates.ICO_NOTIFIED]: {
    [DataBreachStates.SUBJECTS_NOTIFIED]: "Notify Data Subjects",
    [DataBreachStates.REMEDIATION_ONLY]: "Subject Notification Not Required",
  },
  [DataBreachStates.SUBJECTS_NOTIFIED]: {
    [DataBreachStates.CLOSED]: "Close Breach",
  },
  [DataBreachStates.REMEDIATION_ONLY]: {
    [DataBreachStates.CLOSED]: "Close Breach",
  },
  [DataBreachStates.CLOSED]: {},
};

/**
 * Metadata about transitions.
 */
export interface DataBreachTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether ICO reference is required */
  requiresIcoReference: boolean;
  /** Whether subject notification details are required */
  requiresSubjectNotification: boolean;
  /** Whether a risk assessment is required */
  requiresAssessment: boolean;
  /** Whether lessons learned / resolution is required */
  requiresResolution: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TRANSITION_METADATA: Record<string, DataBreachTransitionMetadata> = {
  "reported->assessing": {
    requiresReason: false,
    requiresIcoReference: false,
    requiresSubjectNotification: false,
    requiresAssessment: false,
    requiresResolution: false,
    auditAction: "data_breach.assessment_started",
  },
  "assessing->ico_notified": {
    requiresReason: false,
    requiresIcoReference: true,
    requiresSubjectNotification: false,
    requiresAssessment: true,
    requiresResolution: false,
    auditAction: "data_breach.ico_notified",
  },
  "assessing->remediation_only": {
    requiresReason: true,
    requiresIcoReference: false,
    requiresSubjectNotification: false,
    requiresAssessment: true,
    requiresResolution: false,
    auditAction: "data_breach.no_notification_required",
  },
  "ico_notified->subjects_notified": {
    requiresReason: false,
    requiresIcoReference: false,
    requiresSubjectNotification: true,
    requiresAssessment: false,
    requiresResolution: false,
    auditAction: "data_breach.subjects_notified",
  },
  "ico_notified->remediation_only": {
    requiresReason: true,
    requiresIcoReference: false,
    requiresSubjectNotification: false,
    requiresAssessment: false,
    requiresResolution: false,
    auditAction: "data_breach.subject_notification_not_required",
  },
  "subjects_notified->closed": {
    requiresReason: false,
    requiresIcoReference: false,
    requiresSubjectNotification: false,
    requiresAssessment: false,
    requiresResolution: true,
    auditAction: "data_breach.closed",
  },
  "remediation_only->closed": {
    requiresReason: false,
    requiresIcoReference: false,
    requiresSubjectNotification: false,
    requiresAssessment: false,
    requiresResolution: true,
    auditAction: "data_breach.closed",
  },
};

// =============================================================================
// State Machine Functions
// =============================================================================

/**
 * Check if a transition from one state to another is valid.
 */
export function canTransitionDataBreach(
  fromState: DataBreachState,
  toState: DataBreachState
): boolean {
  const validTargets = DATA_BREACH_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current state.
 */
export function getValidDataBreachTransitions(
  currentState: DataBreachState
): DataBreachState[] {
  return DATA_BREACH_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for additional requirements.
 */
export function getDataBreachTransitionMetadata(
  fromState: DataBreachState,
  toState: DataBreachState
): DataBreachTransitionMetadata | null {
  if (!canTransitionDataBreach(fromState, toState)) {
    return null;
  }
  return TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a transition.
 */
export function getDataBreachTransitionLabel(
  fromState: DataBreachState,
  toState: DataBreachState
): string | undefined {
  return DATA_BREACH_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a transition and return error message if invalid.
 */
export function validateDataBreachTransition(
  fromState: DataBreachState,
  toState: DataBreachState
): string | null {
  if (fromState === toState) {
    return `Data breach is already in '${fromState}' state`;
  }

  if (!canTransitionDataBreach(fromState, toState)) {
    const validTargets = getValidDataBreachTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from '${fromState}' state. This is a terminal state.`;
    }

    return `Invalid transition from '${fromState}' to '${toState}'. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a state is a terminal state.
 */
export function isDataBreachTerminalState(state: DataBreachState): boolean {
  return getValidDataBreachTransitions(state).length === 0;
}

/**
 * Check if breach is active (requires action).
 */
export function isDataBreachActive(state: DataBreachState): boolean {
  const activeStates: DataBreachState[] = [
    DataBreachStates.REPORTED,
    DataBreachStates.ASSESSING,
    DataBreachStates.ICO_NOTIFIED,
    DataBreachStates.SUBJECTS_NOTIFIED,
    DataBreachStates.REMEDIATION_ONLY,
  ];
  return activeStates.includes(state);
}

/**
 * Check if ICO notification is still required (not yet notified AND not in remediation_only).
 */
export function isIcoNotificationPending(state: DataBreachState): boolean {
  return (
    state === DataBreachStates.REPORTED ||
    state === DataBreachStates.ASSESSING
  );
}

/**
 * Get the initial state for a new data breach.
 */
export function getDataBreachInitialState(): DataBreachState {
  return DataBreachStates.REPORTED;
}

/**
 * Type guard to check if a string is a valid data breach state.
 */
export function isDataBreachState(state: string): state is DataBreachState {
  return Object.values(DataBreachStates).includes(state as DataBreachState);
}

/**
 * Get a summary of the state machine.
 */
export function getDataBreachStateMachineSummary(): {
  states: DataBreachState[];
  transitions: Record<DataBreachState, DataBreachState[]>;
  terminalStates: DataBreachState[];
  initialState: DataBreachState;
} {
  const states = Object.values(DataBreachStates);
  const terminalStates = states.filter(isDataBreachTerminalState);

  return {
    states,
    transitions: { ...DATA_BREACH_TRANSITIONS },
    terminalStates,
    initialState: getDataBreachInitialState(),
  };
}
