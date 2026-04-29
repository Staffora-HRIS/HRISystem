/**
 * Cases Service Unit Tests
 *
 * Tests for HR Case Management business logic including:
 * - State machine transitions (via actual shared state machine)
 * - Terminal state enforcement
 * - Transition metadata requirements
 * - Case lifecycle completeness
 *
 * Refactored to import and test the actual state machine from @staffora/shared
 * instead of re-implementing transition logic locally.
 */

import { describe, it, expect } from "bun:test";
import {
  canTransitionCase,
  getValidCaseTransitions,
  validateCaseTransition,
  isCaseTerminalState,
  isCaseActive,
  getCaseInitialState,
  isCaseState,
  getCaseStateMachineSummary,
  getCaseTransitionMetadata,
  type CaseState,
} from "@staffora/shared/state-machines";

describe("CasesService", () => {
  // ===========================================================================
  // State Machine Transitions
  // ===========================================================================

  describe("State Machine", () => {
    describe("valid transitions from open", () => {
      it("should allow open -> in_progress", () => {
        expect(canTransitionCase("open", "in_progress")).toBe(true);
      });

      it("should allow open -> escalated", () => {
        expect(canTransitionCase("open", "escalated")).toBe(true);
      });

      it("should allow open -> cancelled", () => {
        expect(canTransitionCase("open", "cancelled")).toBe(true);
      });

      it("should allow open -> resolved (quick resolution)", () => {
        expect(canTransitionCase("open", "resolved")).toBe(true);
      });
    });

    describe("valid transitions from in_progress", () => {
      it("should allow in_progress -> pending_info", () => {
        expect(canTransitionCase("in_progress", "pending_info")).toBe(true);
      });

      it("should allow in_progress -> escalated", () => {
        expect(canTransitionCase("in_progress", "escalated")).toBe(true);
      });

      it("should allow in_progress -> resolved", () => {
        expect(canTransitionCase("in_progress", "resolved")).toBe(true);
      });

      it("should allow in_progress -> cancelled", () => {
        expect(canTransitionCase("in_progress", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from pending_info", () => {
      it("should allow pending_info -> in_progress", () => {
        expect(canTransitionCase("pending_info", "in_progress")).toBe(true);
      });

      it("should allow pending_info -> escalated", () => {
        expect(canTransitionCase("pending_info", "escalated")).toBe(true);
      });

      it("should allow pending_info -> resolved", () => {
        expect(canTransitionCase("pending_info", "resolved")).toBe(true);
      });

      it("should allow pending_info -> cancelled", () => {
        expect(canTransitionCase("pending_info", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from escalated", () => {
      it("should allow escalated -> in_progress (de-escalate)", () => {
        expect(canTransitionCase("escalated", "in_progress")).toBe(true);
      });

      it("should allow escalated -> resolved", () => {
        expect(canTransitionCase("escalated", "resolved")).toBe(true);
      });

      it("should allow escalated -> cancelled", () => {
        expect(canTransitionCase("escalated", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from resolved", () => {
      it("should allow resolved -> closed", () => {
        expect(canTransitionCase("resolved", "closed")).toBe(true);
      });

      it("should allow resolved -> in_progress (reopen)", () => {
        expect(canTransitionCase("resolved", "in_progress")).toBe(true);
      });

      it("should allow resolved -> appealed", () => {
        expect(canTransitionCase("resolved", "appealed")).toBe(true);
      });
    });

    describe("valid transitions from appealed", () => {
      it("should allow appealed -> in_progress (overturned)", () => {
        expect(canTransitionCase("appealed", "in_progress")).toBe(true);
      });

      it("should allow appealed -> resolved (upheld)", () => {
        expect(canTransitionCase("appealed", "resolved")).toBe(true);
      });

      it("should allow appealed -> closed (final)", () => {
        expect(canTransitionCase("appealed", "closed")).toBe(true);
      });
    });

    describe("invalid transitions", () => {
      it("should reject closed -> any state (terminal)", () => {
        const targets: CaseState[] = ["open", "in_progress", "escalated", "resolved", "cancelled", "pending_info", "appealed"];
        for (const target of targets) {
          expect(canTransitionCase("closed", target)).toBe(false);
        }
      });

      it("should reject cancelled -> any state (terminal)", () => {
        const targets: CaseState[] = ["open", "in_progress", "escalated", "resolved", "closed", "pending_info", "appealed"];
        for (const target of targets) {
          expect(canTransitionCase("cancelled", target)).toBe(false);
        }
      });

      it("should reject open -> closed (must resolve first)", () => {
        expect(canTransitionCase("open", "closed")).toBe(false);
      });

      it("should reject in_progress -> closed (must resolve first)", () => {
        expect(canTransitionCase("in_progress", "closed")).toBe(false);
      });

      it("should reject appealed -> cancelled", () => {
        expect(canTransitionCase("appealed", "cancelled")).toBe(false);
      });

      it("should reject appealed -> escalated", () => {
        expect(canTransitionCase("appealed", "escalated")).toBe(false);
      });

      it("should reject appealed -> appealed (self-transition)", () => {
        expect(canTransitionCase("appealed", "appealed")).toBe(false);
      });
    });

    describe("getValidCaseTransitions", () => {
      it("should return correct transitions for open", () => {
        const transitions = getValidCaseTransitions("open");
        expect(transitions).toContain("in_progress");
        expect(transitions).toContain("escalated");
        expect(transitions).toContain("cancelled");
        expect(transitions).toContain("resolved");
        expect(transitions).not.toContain("closed");
      });

      it("should return empty array for closed", () => {
        expect(getValidCaseTransitions("closed")).toHaveLength(0);
      });

      it("should return empty array for cancelled", () => {
        expect(getValidCaseTransitions("cancelled")).toHaveLength(0);
      });
    });

    describe("validateCaseTransition", () => {
      it("should return null for valid transition", () => {
        expect(validateCaseTransition("open", "in_progress")).toBeNull();
      });

      it("should return error for invalid transition", () => {
        const error = validateCaseTransition("open", "closed");
        expect(error).not.toBeNull();
        expect(error).toContain("Invalid transition");
      });

      it("should return same-state error", () => {
        const error = validateCaseTransition("open", "open");
        expect(error).not.toBeNull();
        expect(error).toContain("already in");
      });

      it("should return terminal state error for closed", () => {
        const error = validateCaseTransition("closed", "open");
        expect(error).not.toBeNull();
        expect(error).toContain("terminal state");
      });

      it("should include valid transitions in error for non-terminal states", () => {
        const error = validateCaseTransition("open", "closed");
        expect(error).not.toBeNull();
        expect(error).toContain("in_progress");
        expect(error).toContain("escalated");
      });
    });

    describe("transition completeness", () => {
      it("should have entries for all defined statuses", () => {
        const allStatuses: CaseState[] = [
          "open", "in_progress", "pending_info", "escalated",
          "resolved", "appealed", "closed", "cancelled",
        ];

        for (const status of allStatuses) {
          const transitions = getValidCaseTransitions(status);
          expect(transitions).toBeDefined();
          expect(Array.isArray(transitions)).toBe(true);
        }
      });

      it("should have terminal states with no outgoing transitions", () => {
        expect(getValidCaseTransitions("closed")).toHaveLength(0);
        expect(getValidCaseTransitions("cancelled")).toHaveLength(0);
      });

      it("should not allow any state to transition to open", () => {
        const summary = getCaseStateMachineSummary();
        for (const state of summary.states) {
          const transitions = getValidCaseTransitions(state);
          expect(transitions).not.toContain("open");
        }
      });
    });
  });

  // ===========================================================================
  // State Properties
  // ===========================================================================

  describe("State Properties", () => {
    it("should have open as the initial state", () => {
      expect(getCaseInitialState()).toBe("open");
    });

    it("should recognize closed as terminal", () => {
      expect(isCaseTerminalState("closed")).toBe(true);
    });

    it("should recognize cancelled as terminal", () => {
      expect(isCaseTerminalState("cancelled")).toBe(true);
    });

    it("should not recognize open as terminal", () => {
      expect(isCaseTerminalState("open")).toBe(false);
    });

    it("should recognize open as active", () => {
      expect(isCaseActive("open")).toBe(true);
    });

    it("should recognize in_progress as active", () => {
      expect(isCaseActive("in_progress")).toBe(true);
    });

    it("should recognize pending_info as active", () => {
      expect(isCaseActive("pending_info")).toBe(true);
    });

    it("should recognize escalated as active", () => {
      expect(isCaseActive("escalated")).toBe(true);
    });

    it("should not recognize closed as active", () => {
      expect(isCaseActive("closed")).toBe(false);
    });

    it("should not recognize cancelled as active", () => {
      expect(isCaseActive("cancelled")).toBe(false);
    });

    it("should validate known case states", () => {
      expect(isCaseState("open")).toBe(true);
      expect(isCaseState("in_progress")).toBe(true);
      expect(isCaseState("closed")).toBe(true);
      expect(isCaseState("appealed")).toBe(true);
    });

    it("should reject unknown state strings", () => {
      expect(isCaseState("invalid")).toBe(false);
      expect(isCaseState("")).toBe(false);
      expect(isCaseState("reopened")).toBe(false);
    });
  });

  // ===========================================================================
  // Transition Metadata
  // ===========================================================================

  describe("Transition Metadata", () => {
    it("should require assignment for open -> in_progress", () => {
      const meta = getCaseTransitionMetadata("open", "in_progress");
      expect(meta).not.toBeNull();
      expect(meta!.requiresAssignment).toBe(true);
    });

    it("should require reason for escalation", () => {
      const meta = getCaseTransitionMetadata("open", "escalated");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
    });

    it("should notify requester on resolution", () => {
      const meta = getCaseTransitionMetadata("in_progress", "resolved");
      expect(meta).not.toBeNull();
      expect(meta!.notifiesRequester).toBe(true);
    });

    it("should affect SLA on assignment", () => {
      const meta = getCaseTransitionMetadata("open", "in_progress");
      expect(meta).not.toBeNull();
      expect(meta!.affectsSLA).toBe(true);
    });

    it("should return null for invalid transition metadata", () => {
      const meta = getCaseTransitionMetadata("closed", "open");
      expect(meta).toBeNull();
    });
  });

  // ===========================================================================
  // State Machine Summary
  // ===========================================================================

  describe("State Machine Summary", () => {
    it("should include all eight states", () => {
      const summary = getCaseStateMachineSummary();
      expect(summary.states).toHaveLength(8);
      expect(summary.states).toContain("open");
      expect(summary.states).toContain("in_progress");
      expect(summary.states).toContain("pending_info");
      expect(summary.states).toContain("escalated");
      expect(summary.states).toContain("resolved");
      expect(summary.states).toContain("appealed");
      expect(summary.states).toContain("closed");
      expect(summary.states).toContain("cancelled");
    });

    it("should identify closed and cancelled as terminal states", () => {
      const summary = getCaseStateMachineSummary();
      expect(summary.terminalStates).toContain("closed");
      expect(summary.terminalStates).toContain("cancelled");
      expect(summary.terminalStates).toHaveLength(2);
    });

    it("should set open as the initial state", () => {
      const summary = getCaseStateMachineSummary();
      expect(summary.initialState).toBe("open");
    });
  });
});
