/**
 * Case Management State Machine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  CaseStates,
  canTransitionCase,
  getValidCaseTransitions,
  getCaseTransitionMetadata,
  getCaseTransitionLabel,
  validateCaseTransition,
  isCaseTerminalState,
  isCaseActive,
  getCaseInitialState,
  isCaseState,
  getCaseStateMachineSummary,
} from "../../state-machines/case";

describe("Case Management State Machine", () => {
  // ---------------------------------------------------------------------------
  // State Constants
  // ---------------------------------------------------------------------------
  describe("CaseStates", () => {
    test("defines all expected states", () => {
      expect(CaseStates.OPEN).toBe("open");
      expect(CaseStates.IN_PROGRESS).toBe("in_progress");
      expect(CaseStates.PENDING_INFO).toBe("pending_info");
      expect(CaseStates.ESCALATED).toBe("escalated");
      expect(CaseStates.RESOLVED).toBe("resolved");
      expect(CaseStates.CLOSED).toBe("closed");
      expect(CaseStates.CANCELLED).toBe("cancelled");
    });

    test("has exactly 7 states", () => {
      expect(Object.keys(CaseStates)).toHaveLength(7);
    });
  });

  // ---------------------------------------------------------------------------
  // canTransitionCase
  // ---------------------------------------------------------------------------
  describe("canTransitionCase", () => {
    describe("valid transitions from open", () => {
      test("open -> in_progress", () => {
        expect(canTransitionCase("open", "in_progress")).toBe(true);
      });

      test("open -> escalated", () => {
        expect(canTransitionCase("open", "escalated")).toBe(true);
      });

      test("open -> cancelled", () => {
        expect(canTransitionCase("open", "cancelled")).toBe(true);
      });

      test("open -> resolved (quick resolution)", () => {
        expect(canTransitionCase("open", "resolved")).toBe(true);
      });
    });

    describe("valid transitions from in_progress", () => {
      test("in_progress -> pending_info", () => {
        expect(canTransitionCase("in_progress", "pending_info")).toBe(true);
      });

      test("in_progress -> escalated", () => {
        expect(canTransitionCase("in_progress", "escalated")).toBe(true);
      });

      test("in_progress -> resolved", () => {
        expect(canTransitionCase("in_progress", "resolved")).toBe(true);
      });

      test("in_progress -> cancelled", () => {
        expect(canTransitionCase("in_progress", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from pending_info", () => {
      test("pending_info -> in_progress (info received)", () => {
        expect(canTransitionCase("pending_info", "in_progress")).toBe(true);
      });

      test("pending_info -> escalated", () => {
        expect(canTransitionCase("pending_info", "escalated")).toBe(true);
      });

      test("pending_info -> resolved", () => {
        expect(canTransitionCase("pending_info", "resolved")).toBe(true);
      });

      test("pending_info -> cancelled", () => {
        expect(canTransitionCase("pending_info", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from escalated", () => {
      test("escalated -> in_progress (de-escalate)", () => {
        expect(canTransitionCase("escalated", "in_progress")).toBe(true);
      });

      test("escalated -> resolved", () => {
        expect(canTransitionCase("escalated", "resolved")).toBe(true);
      });

      test("escalated -> cancelled", () => {
        expect(canTransitionCase("escalated", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from resolved", () => {
      test("resolved -> closed", () => {
        expect(canTransitionCase("resolved", "closed")).toBe(true);
      });

      test("resolved -> in_progress (reopen)", () => {
        expect(canTransitionCase("resolved", "in_progress")).toBe(true);
      });
    });

    describe("terminal state transitions (should all fail)", () => {
      test("closed -> any state", () => {
        for (const state of Object.values(CaseStates)) {
          if (state !== "closed") {
            expect(canTransitionCase("closed", state)).toBe(false);
          }
        }
      });

      test("cancelled -> any state", () => {
        for (const state of Object.values(CaseStates)) {
          if (state !== "cancelled") {
            expect(canTransitionCase("cancelled", state)).toBe(false);
          }
        }
      });
    });

    describe("invalid non-terminal transitions", () => {
      test("open -> pending_info (must be in_progress first)", () => {
        expect(canTransitionCase("open", "pending_info")).toBe(false);
      });

      test("open -> closed (must resolve first)", () => {
        expect(canTransitionCase("open", "closed")).toBe(false);
      });

      test("escalated -> pending_info", () => {
        expect(canTransitionCase("escalated", "pending_info")).toBe(false);
      });

      test("resolved -> escalated", () => {
        expect(canTransitionCase("resolved", "escalated")).toBe(false);
      });
    });

    describe("self-transitions", () => {
      test("all self-transitions are invalid", () => {
        for (const state of Object.values(CaseStates)) {
          expect(canTransitionCase(state, state)).toBe(false);
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getValidCaseTransitions
  // ---------------------------------------------------------------------------
  describe("getValidCaseTransitions", () => {
    test("from open returns 4 options", () => {
      const transitions = getValidCaseTransitions("open");
      expect(transitions).toHaveLength(4);
      expect(transitions).toContain("in_progress");
      expect(transitions).toContain("escalated");
      expect(transitions).toContain("cancelled");
      expect(transitions).toContain("resolved");
    });

    test("from in_progress returns 4 options", () => {
      const transitions = getValidCaseTransitions("in_progress");
      expect(transitions).toHaveLength(4);
    });

    test("from pending_info returns 4 options", () => {
      const transitions = getValidCaseTransitions("pending_info");
      expect(transitions).toHaveLength(4);
    });

    test("from escalated returns 3 options", () => {
      const transitions = getValidCaseTransitions("escalated");
      expect(transitions).toHaveLength(3);
    });

    test("from resolved returns 2 options", () => {
      const transitions = getValidCaseTransitions("resolved");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("closed");
      expect(transitions).toContain("in_progress");
    });

    test("from closed returns empty array", () => {
      expect(getValidCaseTransitions("closed")).toEqual([]);
    });

    test("from cancelled returns empty array", () => {
      expect(getValidCaseTransitions("cancelled")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getCaseTransitionMetadata
  // ---------------------------------------------------------------------------
  describe("getCaseTransitionMetadata", () => {
    test("open -> in_progress requires assignment and affects SLA", () => {
      const meta = getCaseTransitionMetadata("open", "in_progress");
      expect(meta).not.toBeNull();
      expect(meta!.requiresAssignment).toBe(true);
      expect(meta!.affectsSLA).toBe(true);
      expect(meta!.auditAction).toBe("case.assigned");
    });

    test("open -> escalated requires reason and allows priority change", () => {
      const meta = getCaseTransitionMetadata("open", "escalated");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.allowsPriorityChange).toBe(true);
    });

    test("in_progress -> pending_info requires reason", () => {
      const meta = getCaseTransitionMetadata("in_progress", "pending_info");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.notifiesRequester).toBe(true);
    });

    test("resolved -> closed does not require reason", () => {
      const meta = getCaseTransitionMetadata("resolved", "closed");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(false);
      expect(meta!.auditAction).toBe("case.closed");
    });

    test("resolved -> in_progress (reopen) requires reason", () => {
      const meta = getCaseTransitionMetadata("resolved", "in_progress");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.auditAction).toBe("case.reopened");
    });

    test("escalated -> in_progress (de-escalate) requires assignment", () => {
      const meta = getCaseTransitionMetadata("escalated", "in_progress");
      expect(meta).not.toBeNull();
      expect(meta!.requiresAssignment).toBe(true);
      expect(meta!.requiresReason).toBe(true);
    });

    test("returns null for invalid transition", () => {
      expect(getCaseTransitionMetadata("closed", "open")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getCaseTransitionLabel
  // ---------------------------------------------------------------------------
  describe("getCaseTransitionLabel", () => {
    test("open -> in_progress is Assign & Start", () => {
      expect(getCaseTransitionLabel("open", "in_progress")).toBe("Assign & Start");
    });

    test("open -> resolved is Quick Resolve", () => {
      expect(getCaseTransitionLabel("open", "resolved")).toBe("Quick Resolve");
    });

    test("in_progress -> pending_info is Request Information", () => {
      expect(getCaseTransitionLabel("in_progress", "pending_info")).toBe("Request Information");
    });

    test("resolved -> closed is Close Case", () => {
      expect(getCaseTransitionLabel("resolved", "closed")).toBe("Close Case");
    });

    test("resolved -> in_progress is Reopen", () => {
      expect(getCaseTransitionLabel("resolved", "in_progress")).toBe("Reopen");
    });

    test("escalated -> in_progress is De-escalate", () => {
      expect(getCaseTransitionLabel("escalated", "in_progress")).toBe("De-escalate");
    });

    test("returns undefined for terminal state transitions", () => {
      expect(getCaseTransitionLabel("closed", "open")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateCaseTransition
  // ---------------------------------------------------------------------------
  describe("validateCaseTransition", () => {
    test("returns null for valid transitions", () => {
      expect(validateCaseTransition("open", "in_progress")).toBeNull();
      expect(validateCaseTransition("in_progress", "resolved")).toBeNull();
      expect(validateCaseTransition("resolved", "closed")).toBeNull();
    });

    test("returns error for same-state transition", () => {
      const result = validateCaseTransition("open", "open");
      expect(result).not.toBeNull();
      expect(result).toContain("already in open state");
    });

    test("returns terminal state error", () => {
      const result = validateCaseTransition("closed", "open");
      expect(result).not.toBeNull();
      expect(result).toContain("terminal state");
    });

    test("returns error listing valid transitions for invalid non-terminal transition", () => {
      const result = validateCaseTransition("open", "closed");
      expect(result).not.toBeNull();
      expect(result).toContain("Invalid transition");
    });
  });

  // ---------------------------------------------------------------------------
  // isCaseTerminalState
  // ---------------------------------------------------------------------------
  describe("isCaseTerminalState", () => {
    test("closed is terminal", () => {
      expect(isCaseTerminalState("closed")).toBe(true);
    });

    test("cancelled is terminal", () => {
      expect(isCaseTerminalState("cancelled")).toBe(true);
    });

    test("non-terminal states", () => {
      expect(isCaseTerminalState("open")).toBe(false);
      expect(isCaseTerminalState("in_progress")).toBe(false);
      expect(isCaseTerminalState("pending_info")).toBe(false);
      expect(isCaseTerminalState("escalated")).toBe(false);
      expect(isCaseTerminalState("resolved")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isCaseActive
  // ---------------------------------------------------------------------------
  describe("isCaseActive", () => {
    test("open is active", () => {
      expect(isCaseActive("open")).toBe(true);
    });

    test("in_progress is active", () => {
      expect(isCaseActive("in_progress")).toBe(true);
    });

    test("pending_info is active", () => {
      expect(isCaseActive("pending_info")).toBe(true);
    });

    test("escalated is active", () => {
      expect(isCaseActive("escalated")).toBe(true);
    });

    test("resolved is not active", () => {
      expect(isCaseActive("resolved")).toBe(false);
    });

    test("closed is not active", () => {
      expect(isCaseActive("closed")).toBe(false);
    });

    test("cancelled is not active", () => {
      expect(isCaseActive("cancelled")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getCaseInitialState
  // ---------------------------------------------------------------------------
  describe("getCaseInitialState", () => {
    test("returns open", () => {
      expect(getCaseInitialState()).toBe("open");
    });
  });

  // ---------------------------------------------------------------------------
  // isCaseState
  // ---------------------------------------------------------------------------
  describe("isCaseState", () => {
    test("recognizes all valid states", () => {
      for (const state of Object.values(CaseStates)) {
        expect(isCaseState(state)).toBe(true);
      }
    });

    test("rejects invalid states", () => {
      expect(isCaseState("unknown")).toBe(false);
      expect(isCaseState("")).toBe(false);
      expect(isCaseState("OPEN")).toBe(false);
      expect(isCaseState("new")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getCaseStateMachineSummary
  // ---------------------------------------------------------------------------
  describe("getCaseStateMachineSummary", () => {
    test("returns correct structure", () => {
      const summary = getCaseStateMachineSummary();

      expect(summary.states).toHaveLength(7);
      expect(summary.initialState).toBe("open");
      expect(summary.terminalStates).toContain("closed");
      expect(summary.terminalStates).toContain("cancelled");
      expect(summary.terminalStates).toHaveLength(2);
    });

    test("transitions object contains all states as keys", () => {
      const summary = getCaseStateMachineSummary();
      for (const state of Object.values(CaseStates)) {
        expect(summary.transitions[state]).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Full Lifecycle Path Tests
  // ---------------------------------------------------------------------------
  describe("full lifecycle paths", () => {
    test("happy path: open -> in_progress -> resolved -> closed", () => {
      expect(canTransitionCase("open", "in_progress")).toBe(true);
      expect(canTransitionCase("in_progress", "resolved")).toBe(true);
      expect(canTransitionCase("resolved", "closed")).toBe(true);
    });

    test("quick resolve: open -> resolved -> closed", () => {
      expect(canTransitionCase("open", "resolved")).toBe(true);
      expect(canTransitionCase("resolved", "closed")).toBe(true);
    });

    test("escalation path: open -> escalated -> resolved -> closed", () => {
      expect(canTransitionCase("open", "escalated")).toBe(true);
      expect(canTransitionCase("escalated", "resolved")).toBe(true);
      expect(canTransitionCase("resolved", "closed")).toBe(true);
    });

    test("info request path: in_progress -> pending_info -> in_progress -> resolved", () => {
      expect(canTransitionCase("in_progress", "pending_info")).toBe(true);
      expect(canTransitionCase("pending_info", "in_progress")).toBe(true);
      expect(canTransitionCase("in_progress", "resolved")).toBe(true);
    });

    test("reopen path: resolved -> in_progress -> resolved -> closed", () => {
      expect(canTransitionCase("resolved", "in_progress")).toBe(true);
      expect(canTransitionCase("in_progress", "resolved")).toBe(true);
      expect(canTransitionCase("resolved", "closed")).toBe(true);
    });
  });
});
