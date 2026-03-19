/**
 * HR Service Unit Tests
 *
 * Tests for Core HR business logic including:
 * - Employee state machine transitions (via actual shared state machine)
 * - State machine completeness and correctness
 * - Transition metadata requirements
 *
 * Refactored to import and test the actual state machine from @staffora/shared
 * instead of re-implementing transition logic locally.
 */

import { describe, it, expect } from "bun:test";
import {
  canTransition,
  getValidTransitions,
  validateTransition,
  isTerminalState,
  isActiveEmployee,
  getInitialState,
  isEmployeeState,
  getStateMachineSummary,
  getTransitionMetadata,
  EmployeeStates,
  type EmployeeState,
} from "@staffora/shared/state-machines";

describe("HRService", () => {
  // ===========================================================================
  // Employee State Machine (actual shared implementation)
  // ===========================================================================

  describe("Employee Status Transitions", () => {
    describe("valid transitions", () => {
      it("should allow: pending -> active", () => {
        expect(canTransition("pending", "active")).toBe(true);
      });

      it("should allow: pending -> terminated (cancelled hire)", () => {
        expect(canTransition("pending", "terminated")).toBe(true);
      });

      it("should allow: active -> on_leave", () => {
        expect(canTransition("active", "on_leave")).toBe(true);
      });

      it("should allow: active -> terminated", () => {
        expect(canTransition("active", "terminated")).toBe(true);
      });

      it("should allow: on_leave -> active", () => {
        expect(canTransition("on_leave", "active")).toBe(true);
      });

      it("should allow: on_leave -> terminated", () => {
        expect(canTransition("on_leave", "terminated")).toBe(true);
      });
    });

    describe("invalid transitions", () => {
      it("should reject: terminated -> any state (terminal)", () => {
        const targets: EmployeeState[] = ["pending", "active", "on_leave"];
        for (const target of targets) {
          expect(canTransition("terminated", target)).toBe(false);
        }
      });

      it("should reject: pending -> on_leave (must activate first)", () => {
        expect(canTransition("pending", "on_leave")).toBe(false);
      });

      it("should reject: active -> pending (cannot revert)", () => {
        expect(canTransition("active", "pending")).toBe(false);
      });

      it("should reject: on_leave -> pending (cannot revert)", () => {
        expect(canTransition("on_leave", "pending")).toBe(false);
      });
    });

    describe("getValidTransitions", () => {
      it("should return [active, terminated] for pending", () => {
        const transitions = getValidTransitions("pending");
        expect(transitions).toContain("active");
        expect(transitions).toContain("terminated");
        expect(transitions).toHaveLength(2);
      });

      it("should return [on_leave, terminated] for active", () => {
        const transitions = getValidTransitions("active");
        expect(transitions).toContain("on_leave");
        expect(transitions).toContain("terminated");
        expect(transitions).toHaveLength(2);
      });

      it("should return [active, terminated] for on_leave", () => {
        const transitions = getValidTransitions("on_leave");
        expect(transitions).toContain("active");
        expect(transitions).toContain("terminated");
        expect(transitions).toHaveLength(2);
      });

      it("should return empty array for terminated", () => {
        expect(getValidTransitions("terminated")).toHaveLength(0);
      });
    });

    describe("validateTransition", () => {
      it("should return null for valid transition", () => {
        expect(validateTransition("pending", "active")).toBeNull();
      });

      it("should return error for invalid transition", () => {
        const error = validateTransition("pending", "on_leave");
        expect(error).not.toBeNull();
        expect(error).toContain("Invalid transition");
      });

      it("should return error for same-state transition", () => {
        const error = validateTransition("active", "active");
        expect(error).not.toBeNull();
        expect(error).toContain("already in");
      });

      it("should return terminal state error for terminated", () => {
        const error = validateTransition("terminated", "active");
        expect(error).not.toBeNull();
        expect(error).toContain("terminal state");
      });
    });
  });

  // ===========================================================================
  // State Machine Properties
  // ===========================================================================

  describe("State Machine Properties", () => {
    it("should have pending as the initial state", () => {
      expect(getInitialState()).toBe("pending");
    });

    it("should recognize terminated as a terminal state", () => {
      expect(isTerminalState("terminated")).toBe(true);
    });

    it("should not recognize active as a terminal state", () => {
      expect(isTerminalState("active")).toBe(false);
    });

    it("should recognize active as an active employee state", () => {
      expect(isActiveEmployee("active")).toBe(true);
    });

    it("should recognize on_leave as an active employee state", () => {
      expect(isActiveEmployee("on_leave")).toBe(true);
    });

    it("should not recognize pending as an active employee state", () => {
      expect(isActiveEmployee("pending")).toBe(false);
    });

    it("should not recognize terminated as an active employee state", () => {
      expect(isActiveEmployee("terminated")).toBe(false);
    });

    it("should validate known state strings", () => {
      expect(isEmployeeState("pending")).toBe(true);
      expect(isEmployeeState("active")).toBe(true);
      expect(isEmployeeState("on_leave")).toBe(true);
      expect(isEmployeeState("terminated")).toBe(true);
    });

    it("should reject unknown state strings", () => {
      expect(isEmployeeState("invalid")).toBe(false);
      expect(isEmployeeState("")).toBe(false);
      expect(isEmployeeState("deleted")).toBe(false);
    });
  });

  // ===========================================================================
  // Transition Metadata
  // ===========================================================================

  describe("Transition Metadata", () => {
    it("should require effective date for pending -> active", () => {
      const meta = getTransitionMetadata("pending", "active");
      expect(meta).not.toBeNull();
      expect(meta!.requiresEffectiveDate).toBe(true);
    });

    it("should require reason for active -> terminated", () => {
      const meta = getTransitionMetadata("active", "terminated");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
    });

    it("should trigger offboarding for active -> terminated", () => {
      const meta = getTransitionMetadata("active", "terminated");
      expect(meta).not.toBeNull();
      expect(meta!.triggersOffboarding).toBe(true);
    });

    it("should not require reason for pending -> active", () => {
      const meta = getTransitionMetadata("pending", "active");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(false);
    });

    it("should return null for invalid transitions", () => {
      const meta = getTransitionMetadata("terminated", "active");
      expect(meta).toBeNull();
    });
  });

  // ===========================================================================
  // State Machine Summary
  // ===========================================================================

  describe("State Machine Summary", () => {
    it("should include all four states", () => {
      const summary = getStateMachineSummary();
      expect(summary.states).toHaveLength(4);
      expect(summary.states).toContain("pending");
      expect(summary.states).toContain("active");
      expect(summary.states).toContain("on_leave");
      expect(summary.states).toContain("terminated");
    });

    it("should identify terminated as the only terminal state", () => {
      const summary = getStateMachineSummary();
      expect(summary.terminalStates).toEqual(["terminated"]);
    });

    it("should set pending as the initial state", () => {
      const summary = getStateMachineSummary();
      expect(summary.initialState).toBe("pending");
    });

    it("should have transitions for every defined state", () => {
      const summary = getStateMachineSummary();
      for (const state of summary.states) {
        expect(summary.transitions[state]).toBeDefined();
        expect(Array.isArray(summary.transitions[state])).toBe(true);
      }
    });
  });
});
