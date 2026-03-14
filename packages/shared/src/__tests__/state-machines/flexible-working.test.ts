/**
 * Flexible Working Request State Machine Tests
 *
 * Tests the state machine transitions defined for flexible working requests
 * under the Employment Relations (Flexible Working) Act 2023.
 */

import { describe, expect, it } from "bun:test";
import {
  FlexibleWorkingStates,
  canTransitionFlexibleWorking,
  getValidFlexibleWorkingTransitions,
  getFlexibleWorkingTransitionMetadata,
  getFlexibleWorkingTransitionLabel,
  validateFlexibleWorkingTransition,
  isFlexibleWorkingTerminalState,
  isFlexibleWorkingActive,
  isFlexibleWorkingState,
  getFlexibleWorkingInitialState,
  isStatutoryRejectionGround,
  getFlexibleWorkingStateMachineSummary,
  STATUTORY_REJECTION_GROUNDS,
  REJECTION_GROUND_LABELS,
  type FlexibleWorkingState,
} from "../../state-machines/flexible-working";

// =============================================================================
// State definitions
// =============================================================================

describe("FlexibleWorkingStates", () => {
  it("defines all expected states", () => {
    expect(FlexibleWorkingStates.SUBMITTED).toBe("submitted");
    expect(FlexibleWorkingStates.PENDING).toBe("pending");
    expect(FlexibleWorkingStates.UNDER_REVIEW).toBe("under_review");
    expect(FlexibleWorkingStates.CONSULTATION_SCHEDULED).toBe("consultation_scheduled");
    expect(FlexibleWorkingStates.CONSULTATION).toBe("consultation");
    expect(FlexibleWorkingStates.CONSULTATION_COMPLETE).toBe("consultation_complete");
    expect(FlexibleWorkingStates.APPROVED).toBe("approved");
    expect(FlexibleWorkingStates.REJECTED).toBe("rejected");
    expect(FlexibleWorkingStates.APPEAL).toBe("appeal");
    expect(FlexibleWorkingStates.APPEAL_APPROVED).toBe("appeal_approved");
    expect(FlexibleWorkingStates.APPEAL_REJECTED).toBe("appeal_rejected");
    expect(FlexibleWorkingStates.WITHDRAWN).toBe("withdrawn");
  });

  it("initial state is submitted", () => {
    expect(getFlexibleWorkingInitialState()).toBe("submitted");
  });
});

// =============================================================================
// State validation
// =============================================================================

describe("isFlexibleWorkingState", () => {
  it("returns true for valid states", () => {
    const allStates = Object.values(FlexibleWorkingStates);
    for (const state of allStates) {
      expect(isFlexibleWorkingState(state)).toBe(true);
    }
  });

  it("returns false for invalid states", () => {
    expect(isFlexibleWorkingState("invalid")).toBe(false);
    expect(isFlexibleWorkingState("")).toBe(false);
    expect(isFlexibleWorkingState("APPROVED")).toBe(false); // Case sensitive
  });
});

// =============================================================================
// Happy path transitions
// =============================================================================

describe("canTransitionFlexibleWorking - happy path", () => {
  it("submitted -> under_review", () => {
    expect(canTransitionFlexibleWorking("submitted", "under_review")).toBe(true);
  });

  it("submitted -> approved (direct approval)", () => {
    expect(canTransitionFlexibleWorking("submitted", "approved")).toBe(true);
  });

  it("submitted -> withdrawn", () => {
    expect(canTransitionFlexibleWorking("submitted", "withdrawn")).toBe(true);
  });

  it("under_review -> consultation_scheduled", () => {
    expect(canTransitionFlexibleWorking("under_review", "consultation_scheduled")).toBe(true);
  });

  it("under_review -> approved", () => {
    expect(canTransitionFlexibleWorking("under_review", "approved")).toBe(true);
  });

  it("consultation_scheduled -> consultation_complete", () => {
    expect(canTransitionFlexibleWorking("consultation_scheduled", "consultation_complete")).toBe(true);
  });

  it("consultation_scheduled -> approved", () => {
    expect(canTransitionFlexibleWorking("consultation_scheduled", "approved")).toBe(true);
  });

  it("consultation_complete -> approved", () => {
    expect(canTransitionFlexibleWorking("consultation_complete", "approved")).toBe(true);
  });

  it("consultation_complete -> rejected", () => {
    expect(canTransitionFlexibleWorking("consultation_complete", "rejected")).toBe(true);
  });

  it("rejected -> appeal", () => {
    expect(canTransitionFlexibleWorking("rejected", "appeal")).toBe(true);
  });

  it("appeal -> appeal_approved", () => {
    expect(canTransitionFlexibleWorking("appeal", "appeal_approved")).toBe(true);
  });

  it("appeal -> appeal_rejected", () => {
    expect(canTransitionFlexibleWorking("appeal", "appeal_rejected")).toBe(true);
  });
});

// =============================================================================
// Full lifecycle: submitted -> approved
// =============================================================================

describe("Full lifecycle - approval flow", () => {
  it("follows: submitted -> under_review -> consultation_scheduled -> consultation_complete -> approved", () => {
    const flow: FlexibleWorkingState[] = [
      "submitted",
      "under_review",
      "consultation_scheduled",
      "consultation_complete",
      "approved",
    ];

    for (let i = 0; i < flow.length - 1; i++) {
      const from = flow[i];
      const to = flow[i + 1];
      expect(canTransitionFlexibleWorking(from, to)).toBe(true);
    }
  });
});

// =============================================================================
// Full lifecycle: rejected + appeal
// =============================================================================

describe("Full lifecycle - rejection + appeal flow", () => {
  it("follows: ... -> consultation_complete -> rejected -> appeal -> appeal_approved", () => {
    expect(canTransitionFlexibleWorking("consultation_complete", "rejected")).toBe(true);
    expect(canTransitionFlexibleWorking("rejected", "appeal")).toBe(true);
    expect(canTransitionFlexibleWorking("appeal", "appeal_approved")).toBe(true);
  });

  it("follows: ... -> rejected -> appeal -> appeal_rejected", () => {
    expect(canTransitionFlexibleWorking("rejected", "appeal")).toBe(true);
    expect(canTransitionFlexibleWorking("appeal", "appeal_rejected")).toBe(true);
  });
});

// =============================================================================
// Invalid transitions (compliance enforcement)
// =============================================================================

describe("canTransitionFlexibleWorking - invalid transitions", () => {
  it("cannot reject directly from submitted (must consult first)", () => {
    expect(canTransitionFlexibleWorking("submitted", "rejected")).toBe(false);
  });

  it("cannot reject directly from under_review (must consult first)", () => {
    expect(canTransitionFlexibleWorking("under_review", "rejected")).toBe(false);
  });

  it("cannot reject from consultation_scheduled (must complete consultation)", () => {
    expect(canTransitionFlexibleWorking("consultation_scheduled", "rejected")).toBe(false);
  });

  it("cannot appeal an approved request", () => {
    expect(canTransitionFlexibleWorking("approved", "appeal")).toBe(false);
  });

  it("cannot withdraw an approved request", () => {
    expect(canTransitionFlexibleWorking("approved", "withdrawn")).toBe(false);
  });

  it("cannot withdraw a rejected request", () => {
    expect(canTransitionFlexibleWorking("rejected", "withdrawn")).toBe(false);
  });

  it("cannot transition from appeal_approved (terminal)", () => {
    expect(canTransitionFlexibleWorking("appeal_approved", "approved")).toBe(false);
    expect(canTransitionFlexibleWorking("appeal_approved", "rejected")).toBe(false);
  });

  it("cannot transition from appeal_rejected (terminal)", () => {
    expect(canTransitionFlexibleWorking("appeal_rejected", "appeal")).toBe(false);
  });

  it("cannot transition from withdrawn (terminal)", () => {
    expect(canTransitionFlexibleWorking("withdrawn", "submitted")).toBe(false);
  });
});

// =============================================================================
// Terminal states
// =============================================================================

describe("isFlexibleWorkingTerminalState", () => {
  it("approved is terminal", () => {
    expect(isFlexibleWorkingTerminalState("approved")).toBe(true);
  });

  it("appeal_approved is terminal", () => {
    expect(isFlexibleWorkingTerminalState("appeal_approved")).toBe(true);
  });

  it("appeal_rejected is terminal", () => {
    expect(isFlexibleWorkingTerminalState("appeal_rejected")).toBe(true);
  });

  it("withdrawn is terminal", () => {
    expect(isFlexibleWorkingTerminalState("withdrawn")).toBe(true);
  });

  it("rejected is NOT terminal (can appeal)", () => {
    expect(isFlexibleWorkingTerminalState("rejected")).toBe(false);
  });

  it("submitted is NOT terminal", () => {
    expect(isFlexibleWorkingTerminalState("submitted")).toBe(false);
  });

  it("under_review is NOT terminal", () => {
    expect(isFlexibleWorkingTerminalState("under_review")).toBe(false);
  });
});

// =============================================================================
// Active states
// =============================================================================

describe("isFlexibleWorkingActive", () => {
  it("submitted is active", () => {
    expect(isFlexibleWorkingActive("submitted")).toBe(true);
  });

  it("approved is not active", () => {
    expect(isFlexibleWorkingActive("approved")).toBe(false);
  });

  it("rejected is active (can still appeal)", () => {
    expect(isFlexibleWorkingActive("rejected")).toBe(true);
  });

  it("appeal is active", () => {
    expect(isFlexibleWorkingActive("appeal")).toBe(true);
  });
});

// =============================================================================
// getValidFlexibleWorkingTransitions
// =============================================================================

describe("getValidFlexibleWorkingTransitions", () => {
  it("returns valid transitions for submitted", () => {
    const transitions = getValidFlexibleWorkingTransitions("submitted");
    expect(transitions).toContain("under_review");
    expect(transitions).toContain("approved");
    expect(transitions).toContain("withdrawn");
    expect(transitions).not.toContain("rejected");
  });

  it("returns empty array for terminal states", () => {
    expect(getValidFlexibleWorkingTransitions("approved")).toEqual([]);
    expect(getValidFlexibleWorkingTransitions("appeal_approved")).toEqual([]);
    expect(getValidFlexibleWorkingTransitions("appeal_rejected")).toEqual([]);
    expect(getValidFlexibleWorkingTransitions("withdrawn")).toEqual([]);
  });

  it("consultation_complete allows approved and rejected", () => {
    const transitions = getValidFlexibleWorkingTransitions("consultation_complete");
    expect(transitions).toContain("approved");
    expect(transitions).toContain("rejected");
    expect(transitions).toContain("withdrawn");
  });
});

// =============================================================================
// validateFlexibleWorkingTransition
// =============================================================================

describe("validateFlexibleWorkingTransition", () => {
  it("returns valid for allowed transition", () => {
    const result = validateFlexibleWorkingTransition("submitted", "under_review");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns error for invalid transition", () => {
    const result = validateFlexibleWorkingTransition("submitted", "rejected");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });

  it("returns error for unknown state", () => {
    const result = validateFlexibleWorkingTransition("nonexistent" as FlexibleWorkingState, "approved");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown state");
  });
});

// =============================================================================
// Transition metadata
// =============================================================================

describe("getFlexibleWorkingTransitionMetadata", () => {
  it("returns metadata for consultation_complete -> rejected", () => {
    const meta = getFlexibleWorkingTransitionMetadata("consultation_complete", "rejected");
    expect(meta).not.toBeNull();
    expect(meta!.requiresRejectionGrounds).toBe(true);
    expect(meta!.requiresDecisionBy).toBe(true);
    expect(meta!.requiresConsultation).toBe(true);
    expect(meta!.requiresReason).toBe(true);
  });

  it("returns metadata for consultation_complete -> approved", () => {
    const meta = getFlexibleWorkingTransitionMetadata("consultation_complete", "approved");
    expect(meta).not.toBeNull();
    expect(meta!.requiresEffectiveDate).toBe(true);
    expect(meta!.requiresDecisionBy).toBe(true);
    expect(meta!.requiresRejectionGrounds).toBe(false);
  });

  it("returns metadata for appeal -> appeal_approved", () => {
    const meta = getFlexibleWorkingTransitionMetadata("appeal", "appeal_approved");
    expect(meta).not.toBeNull();
    expect(meta!.requiresEffectiveDate).toBe(true);
    expect(meta!.requiresDecisionBy).toBe(true);
  });

  it("returns null for invalid transition", () => {
    const meta = getFlexibleWorkingTransitionMetadata("submitted", "rejected");
    expect(meta).toBeNull();
  });
});

// =============================================================================
// Transition labels
// =============================================================================

describe("getFlexibleWorkingTransitionLabel", () => {
  it("returns label for valid transition", () => {
    expect(getFlexibleWorkingTransitionLabel("submitted", "under_review")).toBe("Begin Review");
    expect(getFlexibleWorkingTransitionLabel("consultation_complete", "rejected")).toBe("Reject Request");
    expect(getFlexibleWorkingTransitionLabel("rejected", "appeal")).toBe("Appeal Decision");
    expect(getFlexibleWorkingTransitionLabel("appeal", "appeal_approved")).toBe("Uphold Appeal");
  });

  it("returns null for terminal state", () => {
    expect(getFlexibleWorkingTransitionLabel("approved", "submitted")).toBeNull();
  });
});

// =============================================================================
// Statutory rejection grounds
// =============================================================================

describe("STATUTORY_REJECTION_GROUNDS", () => {
  it("contains exactly 8 statutory grounds", () => {
    expect(STATUTORY_REJECTION_GROUNDS.length).toBe(8);
  });

  it("includes all 8 grounds from ERA 1996, s.80G(1)(b)", () => {
    expect(STATUTORY_REJECTION_GROUNDS).toContain("burden_of_additional_costs");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("detrimental_effect_customer_demand");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("inability_to_reorganise");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("inability_to_recruit");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("detrimental_impact_quality");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("detrimental_impact_performance");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("insufficient_work");
    expect(STATUTORY_REJECTION_GROUNDS).toContain("planned_structural_changes");
  });
});

describe("isStatutoryRejectionGround", () => {
  it("returns true for all valid grounds", () => {
    for (const ground of STATUTORY_REJECTION_GROUNDS) {
      expect(isStatutoryRejectionGround(ground)).toBe(true);
    }
  });

  it("returns false for invalid grounds", () => {
    expect(isStatutoryRejectionGround("other_specified")).toBe(false);
    expect(isStatutoryRejectionGround("personal_dislike")).toBe(false);
    expect(isStatutoryRejectionGround("")).toBe(false);
  });
});

describe("REJECTION_GROUND_LABELS", () => {
  it("has labels for all 8 grounds", () => {
    expect(Object.keys(REJECTION_GROUND_LABELS).length).toBe(8);
    for (const ground of STATUTORY_REJECTION_GROUNDS) {
      expect(REJECTION_GROUND_LABELS[ground]).toBeDefined();
      expect(typeof REJECTION_GROUND_LABELS[ground]).toBe("string");
    }
  });
});

// =============================================================================
// State machine summary
// =============================================================================

describe("getFlexibleWorkingStateMachineSummary", () => {
  it("returns a valid summary", () => {
    const summary = getFlexibleWorkingStateMachineSummary();
    expect(summary.states.length).toBeGreaterThan(0);
    expect(summary.terminalStates).toContain("approved");
    expect(summary.terminalStates).toContain("appeal_approved");
    expect(summary.terminalStates).toContain("appeal_rejected");
    expect(summary.terminalStates).toContain("withdrawn");
    expect(summary.terminalStates).not.toContain("rejected"); // Can appeal
    expect(Object.keys(summary.transitions).length).toBe(summary.states.length);
  });
});

// =============================================================================
// Backwards compatibility with "pending" / "consultation" states
// =============================================================================

describe("Backwards compatibility", () => {
  it("pending -> under_review is valid", () => {
    expect(canTransitionFlexibleWorking("pending", "under_review")).toBe(true);
  });

  it("pending -> approved is valid", () => {
    expect(canTransitionFlexibleWorking("pending", "approved")).toBe(true);
  });

  it("pending -> withdrawn is valid", () => {
    expect(canTransitionFlexibleWorking("pending", "withdrawn")).toBe(true);
  });

  it("consultation -> consultation_complete is valid", () => {
    expect(canTransitionFlexibleWorking("consultation", "consultation_complete")).toBe(true);
  });

  it("consultation -> approved is valid", () => {
    expect(canTransitionFlexibleWorking("consultation", "approved")).toBe(true);
  });
});
