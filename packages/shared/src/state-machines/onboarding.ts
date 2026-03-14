/**
 * Onboarding State Machines
 *
 * Defines the valid states and transitions for:
 * - Onboarding template lifecycle (draft -> active -> archived)
 * - Onboarding instance status (not_started -> in_progress -> completed/cancelled)
 * - Onboarding task completion (pending -> in_progress -> completed/skipped/blocked)
 *
 * Based on enum types defined in migration 0081_onboarding_enums.sql.
 * Transition rules validated against DB triggers in migrations 0082-0085.
 */

// =============================================================================
// Template Status State Machine
// =============================================================================

/**
 * All possible onboarding template lifecycle states.
 * Based on app.template_status enum in migration 0081.
 */
export const OnboardingTemplateStates = {
  /** Being created, not available for use */
  DRAFT: "draft",
  /** Available for assigning to new employees */
  ACTIVE: "active",
  /** No longer available for new assignments */
  ARCHIVED: "archived",
} as const;

export type OnboardingTemplateState =
  (typeof OnboardingTemplateStates)[keyof typeof OnboardingTemplateStates];

/**
 * Valid transitions for the onboarding template state machine.
 * Matches the DB trigger validate_onboarding_template_status_transition in migration 0082.
 */
const TEMPLATE_TRANSITIONS: Record<OnboardingTemplateState, OnboardingTemplateState[]> = {
  // From draft: can be published (active) or archived (never used)
  [OnboardingTemplateStates.DRAFT]: [
    OnboardingTemplateStates.ACTIVE,
    OnboardingTemplateStates.ARCHIVED,
  ],

  // From active: can only be archived (deprecated)
  [OnboardingTemplateStates.ACTIVE]: [
    OnboardingTemplateStates.ARCHIVED,
  ],

  // From archived: terminal state
  [OnboardingTemplateStates.ARCHIVED]: [],
};

/**
 * Human-readable labels for each template transition action.
 */
export const TEMPLATE_TRANSITION_LABELS: Record<
  OnboardingTemplateState,
  Partial<Record<OnboardingTemplateState, string>>
> = {
  [OnboardingTemplateStates.DRAFT]: {
    [OnboardingTemplateStates.ACTIVE]: "Publish Template",
    [OnboardingTemplateStates.ARCHIVED]: "Archive Template",
  },
  [OnboardingTemplateStates.ACTIVE]: {
    [OnboardingTemplateStates.ARCHIVED]: "Archive Template",
  },
  [OnboardingTemplateStates.ARCHIVED]: {},
};

/**
 * Metadata about template transitions.
 */
export interface TemplateTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether template must have tasks (enforced by DB trigger) */
  requiresTasks: boolean;
  /** Whether this transition affects existing onboarding instances */
  affectsInstances: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TEMPLATE_TRANSITION_METADATA: Record<string, TemplateTransitionMetadata> = {
  "draft->active": {
    requiresReason: false,
    requiresTasks: true,
    affectsInstances: false,
    auditAction: "template.published",
  },
  "draft->archived": {
    requiresReason: true,
    requiresTasks: false,
    affectsInstances: false,
    auditAction: "template.archived",
  },
  "active->archived": {
    requiresReason: true,
    requiresTasks: false,
    affectsInstances: false,
    auditAction: "template.archived",
  },
};

// -- Template State Machine Functions --

/**
 * Check if a template transition is valid.
 */
export function canTransitionTemplate(
  fromState: OnboardingTemplateState,
  toState: OnboardingTemplateState
): boolean {
  const validTargets = TEMPLATE_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current template state.
 */
export function getValidTemplateTransitions(
  currentState: OnboardingTemplateState
): OnboardingTemplateState[] {
  return TEMPLATE_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for a template transition.
 */
export function getTemplateTransitionMetadata(
  fromState: OnboardingTemplateState,
  toState: OnboardingTemplateState
): TemplateTransitionMetadata | null {
  if (!canTransitionTemplate(fromState, toState)) {
    return null;
  }
  return TEMPLATE_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a template transition.
 */
export function getTemplateTransitionLabel(
  fromState: OnboardingTemplateState,
  toState: OnboardingTemplateState
): string | undefined {
  return TEMPLATE_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a template transition and return error message if invalid.
 */
export function validateTemplateTransition(
  fromState: OnboardingTemplateState,
  toState: OnboardingTemplateState
): string | null {
  if (fromState === toState) {
    return `Template is already in ${fromState} state`;
  }

  if (!canTransitionTemplate(fromState, toState)) {
    const validTargets = getValidTemplateTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a template state is a terminal state.
 */
export function isTemplateTerminalState(state: OnboardingTemplateState): boolean {
  return getValidTemplateTransitions(state).length === 0;
}

/**
 * Check if a template is usable for new onboardings.
 */
export function isTemplateUsable(state: OnboardingTemplateState): boolean {
  return state === OnboardingTemplateStates.ACTIVE;
}

/**
 * Get the initial state for a new template.
 */
export function getTemplateInitialState(): OnboardingTemplateState {
  return OnboardingTemplateStates.DRAFT;
}

/**
 * Type guard to check if a string is a valid template state.
 */
export function isOnboardingTemplateState(state: string): state is OnboardingTemplateState {
  return Object.values(OnboardingTemplateStates).includes(state as OnboardingTemplateState);
}

/**
 * Get a summary of the template state machine.
 */
export function getTemplateStateMachineSummary(): {
  states: OnboardingTemplateState[];
  transitions: Record<OnboardingTemplateState, OnboardingTemplateState[]>;
  terminalStates: OnboardingTemplateState[];
  initialState: OnboardingTemplateState;
} {
  const states = Object.values(OnboardingTemplateStates);
  const terminalStates = states.filter(isTemplateTerminalState);

  return {
    states,
    transitions: { ...TEMPLATE_TRANSITIONS },
    terminalStates,
    initialState: getTemplateInitialState(),
  };
}

// =============================================================================
// Onboarding Instance Status State Machine
// =============================================================================

/**
 * All possible onboarding instance states.
 * Based on app.onboarding_instance_status enum in migration 0081.
 */
export const OnboardingInstanceStates = {
  /** Onboarding not yet begun */
  NOT_STARTED: "not_started",
  /** Onboarding in progress */
  IN_PROGRESS: "in_progress",
  /** All tasks completed */
  COMPLETED: "completed",
  /** Onboarding cancelled (employee didn't join, etc.) */
  CANCELLED: "cancelled",
} as const;

export type OnboardingInstanceState =
  (typeof OnboardingInstanceStates)[keyof typeof OnboardingInstanceStates];

/**
 * Valid transitions for the onboarding instance state machine.
 * Matches the DB trigger validate_onboarding_instance_status_transition in migration 0084.
 */
const INSTANCE_TRANSITIONS: Record<OnboardingInstanceState, OnboardingInstanceState[]> = {
  // From not_started: can begin (in_progress) or be cancelled
  [OnboardingInstanceStates.NOT_STARTED]: [
    OnboardingInstanceStates.IN_PROGRESS,
    OnboardingInstanceStates.CANCELLED,
  ],

  // From in_progress: can be completed or cancelled
  [OnboardingInstanceStates.IN_PROGRESS]: [
    OnboardingInstanceStates.COMPLETED,
    OnboardingInstanceStates.CANCELLED,
  ],

  // From completed: terminal state
  [OnboardingInstanceStates.COMPLETED]: [],

  // From cancelled: terminal state
  [OnboardingInstanceStates.CANCELLED]: [],
};

/**
 * Human-readable labels for each instance transition action.
 */
export const INSTANCE_TRANSITION_LABELS: Record<
  OnboardingInstanceState,
  Partial<Record<OnboardingInstanceState, string>>
> = {
  [OnboardingInstanceStates.NOT_STARTED]: {
    [OnboardingInstanceStates.IN_PROGRESS]: "Start Onboarding",
    [OnboardingInstanceStates.CANCELLED]: "Cancel Onboarding",
  },
  [OnboardingInstanceStates.IN_PROGRESS]: {
    [OnboardingInstanceStates.COMPLETED]: "Complete Onboarding",
    [OnboardingInstanceStates.CANCELLED]: "Cancel Onboarding",
  },
  [OnboardingInstanceStates.COMPLETED]: {},
  [OnboardingInstanceStates.CANCELLED]: {},
};

/**
 * Metadata about instance transitions.
 */
export interface InstanceTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether this transition requires all tasks to be completed */
  requiresAllTasksComplete: boolean;
  /** Whether this transition notifies the employee */
  notifiesEmployee: boolean;
  /** Whether this transition notifies the manager */
  notifiesManager: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const INSTANCE_TRANSITION_METADATA: Record<string, InstanceTransitionMetadata> = {
  "not_started->in_progress": {
    requiresReason: false,
    requiresAllTasksComplete: false,
    notifiesEmployee: true,
    notifiesManager: true,
    auditAction: "onboarding.started",
  },
  "not_started->cancelled": {
    requiresReason: true,
    requiresAllTasksComplete: false,
    notifiesEmployee: true,
    notifiesManager: true,
    auditAction: "onboarding.cancelled",
  },
  "in_progress->completed": {
    requiresReason: false,
    requiresAllTasksComplete: true,
    notifiesEmployee: true,
    notifiesManager: true,
    auditAction: "onboarding.completed",
  },
  "in_progress->cancelled": {
    requiresReason: true,
    requiresAllTasksComplete: false,
    notifiesEmployee: true,
    notifiesManager: true,
    auditAction: "onboarding.cancelled",
  },
};

// -- Instance State Machine Functions --

/**
 * Check if an onboarding instance transition is valid.
 */
export function canTransitionInstance(
  fromState: OnboardingInstanceState,
  toState: OnboardingInstanceState
): boolean {
  const validTargets = INSTANCE_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current instance state.
 */
export function getValidInstanceTransitions(
  currentState: OnboardingInstanceState
): OnboardingInstanceState[] {
  return INSTANCE_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for an instance transition.
 */
export function getInstanceTransitionMetadata(
  fromState: OnboardingInstanceState,
  toState: OnboardingInstanceState
): InstanceTransitionMetadata | null {
  if (!canTransitionInstance(fromState, toState)) {
    return null;
  }
  return INSTANCE_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for an instance transition.
 */
export function getInstanceTransitionLabel(
  fromState: OnboardingInstanceState,
  toState: OnboardingInstanceState
): string | undefined {
  return INSTANCE_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate an instance transition and return error message if invalid.
 */
export function validateInstanceTransition(
  fromState: OnboardingInstanceState,
  toState: OnboardingInstanceState
): string | null {
  if (fromState === toState) {
    return `Onboarding is already in ${fromState} state`;
  }

  if (!canTransitionInstance(fromState, toState)) {
    const validTargets = getValidInstanceTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if an instance state is a terminal state.
 */
export function isInstanceTerminalState(state: OnboardingInstanceState): boolean {
  return getValidInstanceTransitions(state).length === 0;
}

/**
 * Check if an onboarding instance is active (requires action).
 */
export function isInstanceActive(state: OnboardingInstanceState): boolean {
  const activeStates: OnboardingInstanceState[] = [
    OnboardingInstanceStates.NOT_STARTED,
    OnboardingInstanceStates.IN_PROGRESS,
  ];
  return activeStates.includes(state);
}

/**
 * Get the initial state for a new onboarding instance.
 */
export function getInstanceInitialState(): OnboardingInstanceState {
  return OnboardingInstanceStates.NOT_STARTED;
}

/**
 * Type guard to check if a string is a valid instance state.
 */
export function isOnboardingInstanceState(state: string): state is OnboardingInstanceState {
  return Object.values(OnboardingInstanceStates).includes(state as OnboardingInstanceState);
}

/**
 * Get a summary of the instance state machine.
 */
export function getInstanceStateMachineSummary(): {
  states: OnboardingInstanceState[];
  transitions: Record<OnboardingInstanceState, OnboardingInstanceState[]>;
  terminalStates: OnboardingInstanceState[];
  initialState: OnboardingInstanceState;
} {
  const states = Object.values(OnboardingInstanceStates);
  const terminalStates = states.filter(isInstanceTerminalState);

  return {
    states,
    transitions: { ...INSTANCE_TRANSITIONS },
    terminalStates,
    initialState: getInstanceInitialState(),
  };
}

// =============================================================================
// Onboarding Task Status State Machine
// =============================================================================

/**
 * All possible onboarding task completion states.
 * Based on app.onboarding_task_status enum in migration 0081.
 */
export const OnboardingTaskStates = {
  /** Not yet started */
  PENDING: "pending",
  /** Currently being worked on */
  IN_PROGRESS: "in_progress",
  /** Successfully completed */
  COMPLETED: "completed",
  /** Skipped (not applicable) */
  SKIPPED: "skipped",
  /** Blocked by dependency or condition */
  BLOCKED: "blocked",
} as const;

export type OnboardingTaskState =
  (typeof OnboardingTaskStates)[keyof typeof OnboardingTaskStates];

/**
 * Valid transitions for the onboarding task state machine.
 * Matches the DB trigger validate_onboarding_task_completion_status_transition in migration 0085.
 */
const TASK_TRANSITIONS: Record<OnboardingTaskState, OnboardingTaskState[]> = {
  // From pending: can start, be skipped, or become blocked
  [OnboardingTaskStates.PENDING]: [
    OnboardingTaskStates.IN_PROGRESS,
    OnboardingTaskStates.SKIPPED,
    OnboardingTaskStates.BLOCKED,
  ],

  // From in_progress: can complete, be skipped, or become blocked
  [OnboardingTaskStates.IN_PROGRESS]: [
    OnboardingTaskStates.COMPLETED,
    OnboardingTaskStates.SKIPPED,
    OnboardingTaskStates.BLOCKED,
  ],

  // From blocked: can become pending (unblocked) or be skipped
  [OnboardingTaskStates.BLOCKED]: [
    OnboardingTaskStates.PENDING,
    OnboardingTaskStates.SKIPPED,
  ],

  // From completed: terminal state
  [OnboardingTaskStates.COMPLETED]: [],

  // From skipped: terminal state
  [OnboardingTaskStates.SKIPPED]: [],
};

/**
 * Human-readable labels for each task transition action.
 */
export const TASK_TRANSITION_LABELS: Record<
  OnboardingTaskState,
  Partial<Record<OnboardingTaskState, string>>
> = {
  [OnboardingTaskStates.PENDING]: {
    [OnboardingTaskStates.IN_PROGRESS]: "Start Task",
    [OnboardingTaskStates.SKIPPED]: "Skip Task",
    [OnboardingTaskStates.BLOCKED]: "Block Task",
  },
  [OnboardingTaskStates.IN_PROGRESS]: {
    [OnboardingTaskStates.COMPLETED]: "Complete Task",
    [OnboardingTaskStates.SKIPPED]: "Skip Task",
    [OnboardingTaskStates.BLOCKED]: "Block Task",
  },
  [OnboardingTaskStates.BLOCKED]: {
    [OnboardingTaskStates.PENDING]: "Unblock Task",
    [OnboardingTaskStates.SKIPPED]: "Skip Task",
  },
  [OnboardingTaskStates.COMPLETED]: {},
  [OnboardingTaskStates.SKIPPED]: {},
};

/**
 * Metadata about task transitions.
 */
export interface TaskTransitionMetadata {
  /** Whether this transition requires a reason/comment */
  requiresReason: boolean;
  /** Whether the task must not be required (for skip) */
  requiresOptionalTask: boolean;
  /** Whether this transition notifies the assignee */
  notifiesAssignee: boolean;
  /** Whether this transition may unblock dependent tasks */
  unblocksDependents: boolean;
  /** Action type for audit logging */
  auditAction: string;
}

const TASK_TRANSITION_METADATA: Record<string, TaskTransitionMetadata> = {
  "pending->in_progress": {
    requiresReason: false,
    requiresOptionalTask: false,
    notifiesAssignee: false,
    unblocksDependents: false,
    auditAction: "task.started",
  },
  "pending->skipped": {
    requiresReason: true,
    requiresOptionalTask: true,
    notifiesAssignee: false,
    unblocksDependents: false,
    auditAction: "task.skipped",
  },
  "pending->blocked": {
    requiresReason: true,
    requiresOptionalTask: false,
    notifiesAssignee: true,
    unblocksDependents: false,
    auditAction: "task.blocked",
  },
  "in_progress->completed": {
    requiresReason: false,
    requiresOptionalTask: false,
    notifiesAssignee: false,
    unblocksDependents: true,
    auditAction: "task.completed",
  },
  "in_progress->skipped": {
    requiresReason: true,
    requiresOptionalTask: true,
    notifiesAssignee: false,
    unblocksDependents: false,
    auditAction: "task.skipped",
  },
  "in_progress->blocked": {
    requiresReason: true,
    requiresOptionalTask: false,
    notifiesAssignee: true,
    unblocksDependents: false,
    auditAction: "task.blocked",
  },
  "blocked->pending": {
    requiresReason: false,
    requiresOptionalTask: false,
    notifiesAssignee: true,
    unblocksDependents: false,
    auditAction: "task.unblocked",
  },
  "blocked->skipped": {
    requiresReason: true,
    requiresOptionalTask: true,
    notifiesAssignee: false,
    unblocksDependents: false,
    auditAction: "task.skipped",
  },
};

// -- Task State Machine Functions --

/**
 * Check if a task transition is valid.
 */
export function canTransitionTask(
  fromState: OnboardingTaskState,
  toState: OnboardingTaskState
): boolean {
  const validTargets = TASK_TRANSITIONS[fromState];
  return validTargets?.includes(toState) ?? false;
}

/**
 * Get all valid transitions from the current task state.
 */
export function getValidTaskTransitions(
  currentState: OnboardingTaskState
): OnboardingTaskState[] {
  return TASK_TRANSITIONS[currentState] ?? [];
}

/**
 * Get transition metadata for a task transition.
 */
export function getTaskTransitionMetadata(
  fromState: OnboardingTaskState,
  toState: OnboardingTaskState
): TaskTransitionMetadata | null {
  if (!canTransitionTask(fromState, toState)) {
    return null;
  }
  return TASK_TRANSITION_METADATA[`${fromState}->${toState}`] ?? null;
}

/**
 * Get human-readable label for a task transition.
 */
export function getTaskTransitionLabel(
  fromState: OnboardingTaskState,
  toState: OnboardingTaskState
): string | undefined {
  return TASK_TRANSITION_LABELS[fromState]?.[toState];
}

/**
 * Validate a task transition and return error message if invalid.
 */
export function validateTaskTransition(
  fromState: OnboardingTaskState,
  toState: OnboardingTaskState
): string | null {
  if (fromState === toState) {
    return `Task is already in ${fromState} state`;
  }

  if (!canTransitionTask(fromState, toState)) {
    const validTargets = getValidTaskTransitions(fromState);

    if (validTargets.length === 0) {
      return `Cannot transition from ${fromState} state. This is a terminal state.`;
    }

    return `Invalid transition from ${fromState} to ${toState}. Valid transitions are: ${validTargets.join(", ")}`;
  }

  return null;
}

/**
 * Check if a task state is a terminal state.
 */
export function isTaskTerminalState(state: OnboardingTaskState): boolean {
  return getValidTaskTransitions(state).length === 0;
}

/**
 * Check if a task requires action (not completed, skipped, or blocked).
 */
export function isTaskActionable(state: OnboardingTaskState): boolean {
  const actionableStates: OnboardingTaskState[] = [
    OnboardingTaskStates.PENDING,
    OnboardingTaskStates.IN_PROGRESS,
  ];
  return actionableStates.includes(state);
}

/**
 * Get the initial state for a new onboarding task.
 */
export function getTaskInitialState(): OnboardingTaskState {
  return OnboardingTaskStates.PENDING;
}

/**
 * Type guard to check if a string is a valid task state.
 */
export function isOnboardingTaskState(state: string): state is OnboardingTaskState {
  return Object.values(OnboardingTaskStates).includes(state as OnboardingTaskState);
}

/**
 * Get a summary of the task state machine.
 */
export function getTaskStateMachineSummary(): {
  states: OnboardingTaskState[];
  transitions: Record<OnboardingTaskState, OnboardingTaskState[]>;
  terminalStates: OnboardingTaskState[];
  initialState: OnboardingTaskState;
} {
  const states = Object.values(OnboardingTaskStates);
  const terminalStates = states.filter(isTaskTerminalState);

  return {
    states,
    transitions: { ...TASK_TRANSITIONS },
    terminalStates,
    initialState: getTaskInitialState(),
  };
}
