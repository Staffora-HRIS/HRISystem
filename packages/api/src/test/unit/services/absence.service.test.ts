/**
 * Absence Service Unit Tests
 *
 * Tests for leave request state machine business logic including:
 * - Valid and invalid leave request transitions
 * - Terminal state enforcement
 * - Transition metadata (balance effects, notifications)
 * - Leave request lifecycle completeness
 *
 * Refactored to import and test the actual state machine from @staffora/shared
 * instead of re-implementing transition logic locally.
 */

import { describe, it, expect } from "bun:test";
import {
  canTransitionLeaveRequest,
  getValidLeaveRequestTransitions,
  validateLeaveRequestTransition,
  isLeaveRequestTerminalState,
  leaveRequestRequiresAction,
  getLeaveRequestInitialState,
  isLeaveRequestState,
  getLeaveRequestStateMachineSummary,
  getLeaveRequestTransitionMetadata,
} from "@staffora/shared/state-machines";

describe("AbsenceService", () => {
  // ===========================================================================
  // Leave Request State Machine
  // ===========================================================================

  describe("Leave Request State Transitions", () => {
    describe("valid transitions from pending", () => {
      it("should allow: pending -> under_review", () => {
        expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      });

      it("should allow: pending -> approved (quick approve)", () => {
        expect(canTransitionLeaveRequest("pending", "approved")).toBe(true);
      });

      it("should allow: pending -> rejected", () => {
        expect(canTransitionLeaveRequest("pending", "rejected")).toBe(true);
      });

      it("should allow: pending -> cancelled", () => {
        expect(canTransitionLeaveRequest("pending", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from under_review", () => {
      it("should allow: under_review -> approved", () => {
        expect(canTransitionLeaveRequest("under_review", "approved")).toBe(true);
      });

      it("should allow: under_review -> rejected", () => {
        expect(canTransitionLeaveRequest("under_review", "rejected")).toBe(true);
      });

      it("should allow: under_review -> cancelled", () => {
        expect(canTransitionLeaveRequest("under_review", "cancelled")).toBe(true);
      });

      it("should allow: under_review -> pending (revision requested)", () => {
        expect(canTransitionLeaveRequest("under_review", "pending")).toBe(true);
      });
    });

    describe("valid transitions from approved", () => {
      it("should allow: approved -> in_progress", () => {
        expect(canTransitionLeaveRequest("approved", "in_progress")).toBe(true);
      });

      it("should allow: approved -> cancelled", () => {
        expect(canTransitionLeaveRequest("approved", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from in_progress", () => {
      it("should allow: in_progress -> completed", () => {
        expect(canTransitionLeaveRequest("in_progress", "completed")).toBe(true);
      });

      it("should allow: in_progress -> cancelled (early return)", () => {
        expect(canTransitionLeaveRequest("in_progress", "cancelled")).toBe(true);
      });
    });

    describe("terminal states", () => {
      it("should reject: rejected -> any state", () => {
        expect(getValidLeaveRequestTransitions("rejected")).toHaveLength(0);
      });

      it("should reject: cancelled -> any state", () => {
        expect(getValidLeaveRequestTransitions("cancelled")).toHaveLength(0);
      });

      it("should reject: completed -> any state", () => {
        expect(getValidLeaveRequestTransitions("completed")).toHaveLength(0);
      });
    });

    describe("invalid transitions", () => {
      it("should reject: pending -> in_progress (must approve first)", () => {
        expect(canTransitionLeaveRequest("pending", "in_progress")).toBe(false);
      });

      it("should reject: pending -> completed (must approve and start first)", () => {
        expect(canTransitionLeaveRequest("pending", "completed")).toBe(false);
      });

      it("should reject: approved -> rejected (too late)", () => {
        expect(canTransitionLeaveRequest("approved", "rejected")).toBe(false);
      });
    });
  });

  // ===========================================================================
  // Validation and Error Messages
  // ===========================================================================

  describe("Transition Validation", () => {
    it("should return null for valid transition", () => {
      expect(validateLeaveRequestTransition("pending", "approved")).toBeNull();
    });

    it("should return error for invalid transition", () => {
      const error = validateLeaveRequestTransition("pending", "completed");
      expect(error).not.toBeNull();
      expect(error).toContain("Invalid transition");
    });

    it("should return same-state error", () => {
      const error = validateLeaveRequestTransition("pending", "pending");
      expect(error).not.toBeNull();
      expect(error).toContain("already in");
    });

    it("should return terminal state error for rejected", () => {
      const error = validateLeaveRequestTransition("rejected", "pending");
      expect(error).not.toBeNull();
      expect(error).toContain("terminal state");
    });

    it("should include valid transitions in error message", () => {
      const error = validateLeaveRequestTransition("pending", "completed");
      expect(error).not.toBeNull();
      expect(error).toContain("approved");
    });
  });

  // ===========================================================================
  // State Properties
  // ===========================================================================

  describe("State Properties", () => {
    it("should have pending as the initial state", () => {
      expect(getLeaveRequestInitialState()).toBe("pending");
    });

    it("should recognize rejected as terminal", () => {
      expect(isLeaveRequestTerminalState("rejected")).toBe(true);
    });

    it("should recognize cancelled as terminal", () => {
      expect(isLeaveRequestTerminalState("cancelled")).toBe(true);
    });

    it("should recognize completed as terminal", () => {
      expect(isLeaveRequestTerminalState("completed")).toBe(true);
    });

    it("should not recognize pending as terminal", () => {
      expect(isLeaveRequestTerminalState("pending")).toBe(false);
    });

    it("should recognize pending as requiring action", () => {
      expect(leaveRequestRequiresAction("pending")).toBe(true);
    });

    it("should recognize under_review as requiring action", () => {
      expect(leaveRequestRequiresAction("under_review")).toBe(true);
    });

    it("should not recognize approved as requiring action", () => {
      expect(leaveRequestRequiresAction("approved")).toBe(false);
    });

    it("should validate known leave request states", () => {
      expect(isLeaveRequestState("pending")).toBe(true);
      expect(isLeaveRequestState("under_review")).toBe(true);
      expect(isLeaveRequestState("approved")).toBe(true);
      expect(isLeaveRequestState("rejected")).toBe(true);
      expect(isLeaveRequestState("cancelled")).toBe(true);
      expect(isLeaveRequestState("in_progress")).toBe(true);
      expect(isLeaveRequestState("completed")).toBe(true);
    });

    it("should reject unknown state strings", () => {
      expect(isLeaveRequestState("invalid")).toBe(false);
      expect(isLeaveRequestState("")).toBe(false);
      expect(isLeaveRequestState("draft")).toBe(false);
    });
  });

  // ===========================================================================
  // Transition Metadata
  // ===========================================================================

  describe("Transition Metadata", () => {
    it("should affect balance on approval", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "approved");
      expect(meta).not.toBeNull();
      expect(meta!.affectsBalance).toBe(true);
    });

    it("should require reason for rejection", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "rejected");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
    });

    it("should notify employee on approval", () => {
      const meta = getLeaveRequestTransitionMetadata("under_review", "approved");
      expect(meta).not.toBeNull();
      expect(meta!.notifiesEmployee).toBe(true);
    });

    it("should affect balance on cancellation of approved leave (returns balance)", () => {
      const meta = getLeaveRequestTransitionMetadata("approved", "cancelled");
      expect(meta).not.toBeNull();
      expect(meta!.affectsBalance).toBe(true);
    });

    it("should not require approval chain for quick approve", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "approved");
      expect(meta).not.toBeNull();
      expect(meta!.requiresApprovalChain).toBe(false);
    });

    it("should require approval chain for under_review submission", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "under_review");
      expect(meta).not.toBeNull();
      expect(meta!.requiresApprovalChain).toBe(true);
    });

    it("should return null for invalid transition metadata", () => {
      const meta = getLeaveRequestTransitionMetadata("rejected", "pending");
      expect(meta).toBeNull();
    });
  });

  // ===========================================================================
  // State Machine Summary
  // ===========================================================================

  describe("State Machine Summary", () => {
    it("should include all seven states", () => {
      const summary = getLeaveRequestStateMachineSummary();
      expect(summary.states).toHaveLength(7);
      expect(summary.states).toContain("pending");
      expect(summary.states).toContain("under_review");
      expect(summary.states).toContain("approved");
      expect(summary.states).toContain("rejected");
      expect(summary.states).toContain("cancelled");
      expect(summary.states).toContain("in_progress");
      expect(summary.states).toContain("completed");
    });

    it("should identify three terminal states", () => {
      const summary = getLeaveRequestStateMachineSummary();
      expect(summary.terminalStates).toContain("rejected");
      expect(summary.terminalStates).toContain("cancelled");
      expect(summary.terminalStates).toContain("completed");
      expect(summary.terminalStates).toHaveLength(3);
    });

    it("should set pending as the initial state", () => {
      const summary = getLeaveRequestStateMachineSummary();
      expect(summary.initialState).toBe("pending");
    });
  });
});
