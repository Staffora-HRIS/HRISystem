/**
 * Leave Request State Machine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  LeaveRequestStates,
  canTransitionLeaveRequest,
  getValidLeaveRequestTransitions,
  getLeaveRequestTransitionMetadata,
  getLeaveRequestTransitionLabel,
  validateLeaveRequestTransition,
  isLeaveRequestTerminalState,
  leaveRequestRequiresAction,
  getLeaveRequestInitialState,
  isLeaveRequestState,
  getLeaveRequestStateMachineSummary,
} from "../../state-machines/leave-request";

describe("Leave Request State Machine", () => {
  // ---------------------------------------------------------------------------
  // State Constants
  // ---------------------------------------------------------------------------
  describe("LeaveRequestStates", () => {
    test("defines all expected states", () => {
      expect(LeaveRequestStates.PENDING).toBe("pending");
      expect(LeaveRequestStates.UNDER_REVIEW).toBe("under_review");
      expect(LeaveRequestStates.APPROVED).toBe("approved");
      expect(LeaveRequestStates.REJECTED).toBe("rejected");
      expect(LeaveRequestStates.CANCELLED).toBe("cancelled");
      expect(LeaveRequestStates.IN_PROGRESS).toBe("in_progress");
      expect(LeaveRequestStates.COMPLETED).toBe("completed");
    });

    test("has exactly 7 states", () => {
      expect(Object.keys(LeaveRequestStates)).toHaveLength(7);
    });
  });

  // ---------------------------------------------------------------------------
  // canTransitionLeaveRequest
  // ---------------------------------------------------------------------------
  describe("canTransitionLeaveRequest", () => {
    describe("valid transitions from pending", () => {
      test("pending -> under_review", () => {
        expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      });

      test("pending -> approved (quick approve)", () => {
        expect(canTransitionLeaveRequest("pending", "approved")).toBe(true);
      });

      test("pending -> rejected", () => {
        expect(canTransitionLeaveRequest("pending", "rejected")).toBe(true);
      });

      test("pending -> cancelled", () => {
        expect(canTransitionLeaveRequest("pending", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from under_review", () => {
      test("under_review -> approved", () => {
        expect(canTransitionLeaveRequest("under_review", "approved")).toBe(true);
      });

      test("under_review -> rejected", () => {
        expect(canTransitionLeaveRequest("under_review", "rejected")).toBe(true);
      });

      test("under_review -> cancelled", () => {
        expect(canTransitionLeaveRequest("under_review", "cancelled")).toBe(true);
      });

      test("under_review -> pending (revision request)", () => {
        expect(canTransitionLeaveRequest("under_review", "pending")).toBe(true);
      });
    });

    describe("valid transitions from approved", () => {
      test("approved -> in_progress", () => {
        expect(canTransitionLeaveRequest("approved", "in_progress")).toBe(true);
      });

      test("approved -> cancelled", () => {
        expect(canTransitionLeaveRequest("approved", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from in_progress", () => {
      test("in_progress -> completed", () => {
        expect(canTransitionLeaveRequest("in_progress", "completed")).toBe(true);
      });

      test("in_progress -> cancelled (early return)", () => {
        expect(canTransitionLeaveRequest("in_progress", "cancelled")).toBe(true);
      });
    });

    describe("terminal state transitions (should all fail)", () => {
      test("rejected -> any state", () => {
        expect(canTransitionLeaveRequest("rejected", "pending")).toBe(false);
        expect(canTransitionLeaveRequest("rejected", "approved")).toBe(false);
        expect(canTransitionLeaveRequest("rejected", "cancelled")).toBe(false);
      });

      test("cancelled -> any state", () => {
        expect(canTransitionLeaveRequest("cancelled", "pending")).toBe(false);
        expect(canTransitionLeaveRequest("cancelled", "approved")).toBe(false);
      });

      test("completed -> any state", () => {
        expect(canTransitionLeaveRequest("completed", "pending")).toBe(false);
        expect(canTransitionLeaveRequest("completed", "in_progress")).toBe(false);
      });
    });

    describe("invalid non-terminal transitions", () => {
      test("pending -> in_progress (must go through approved first)", () => {
        expect(canTransitionLeaveRequest("pending", "in_progress")).toBe(false);
      });

      test("pending -> completed", () => {
        expect(canTransitionLeaveRequest("pending", "completed")).toBe(false);
      });

      test("approved -> rejected", () => {
        expect(canTransitionLeaveRequest("approved", "rejected")).toBe(false);
      });

      test("approved -> pending", () => {
        expect(canTransitionLeaveRequest("approved", "pending")).toBe(false);
      });

      test("in_progress -> approved", () => {
        expect(canTransitionLeaveRequest("in_progress", "approved")).toBe(false);
      });
    });

    describe("self-transitions", () => {
      test("all self-transitions are invalid", () => {
        for (const state of Object.values(LeaveRequestStates)) {
          expect(canTransitionLeaveRequest(state, state)).toBe(false);
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getValidLeaveRequestTransitions
  // ---------------------------------------------------------------------------
  describe("getValidLeaveRequestTransitions", () => {
    test("from pending returns 4 options", () => {
      const transitions = getValidLeaveRequestTransitions("pending");
      expect(transitions).toHaveLength(4);
      expect(transitions).toContain("under_review");
      expect(transitions).toContain("approved");
      expect(transitions).toContain("rejected");
      expect(transitions).toContain("cancelled");
    });

    test("from under_review returns 4 options", () => {
      const transitions = getValidLeaveRequestTransitions("under_review");
      expect(transitions).toHaveLength(4);
      expect(transitions).toContain("approved");
      expect(transitions).toContain("rejected");
      expect(transitions).toContain("cancelled");
      expect(transitions).toContain("pending");
    });

    test("from approved returns 2 options", () => {
      const transitions = getValidLeaveRequestTransitions("approved");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("in_progress");
      expect(transitions).toContain("cancelled");
    });

    test("from in_progress returns 2 options", () => {
      const transitions = getValidLeaveRequestTransitions("in_progress");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("completed");
      expect(transitions).toContain("cancelled");
    });

    test("from rejected returns empty array", () => {
      expect(getValidLeaveRequestTransitions("rejected")).toEqual([]);
    });

    test("from cancelled returns empty array", () => {
      expect(getValidLeaveRequestTransitions("cancelled")).toEqual([]);
    });

    test("from completed returns empty array", () => {
      expect(getValidLeaveRequestTransitions("completed")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getLeaveRequestTransitionMetadata
  // ---------------------------------------------------------------------------
  describe("getLeaveRequestTransitionMetadata", () => {
    test("pending -> approved affects balance (quick approve)", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "approved");
      expect(meta).not.toBeNull();
      expect(meta!.affectsBalance).toBe(true);
      expect(meta!.notifiesEmployee).toBe(true);
      expect(meta!.auditAction).toBe("leave.quick_approved");
    });

    test("pending -> rejected requires reason", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "rejected");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
    });

    test("pending -> cancelled does not require reason", () => {
      const meta = getLeaveRequestTransitionMetadata("pending", "cancelled");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(false);
      expect(meta!.notifiesEmployee).toBe(false);
    });

    test("under_review -> pending requires reason (revision request)", () => {
      const meta = getLeaveRequestTransitionMetadata("under_review", "pending");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.auditAction).toBe("leave.revision_requested");
    });

    test("approved -> cancelled affects balance and requires reason", () => {
      const meta = getLeaveRequestTransitionMetadata("approved", "cancelled");
      expect(meta).not.toBeNull();
      expect(meta!.affectsBalance).toBe(true);
      expect(meta!.requiresReason).toBe(true);
    });

    test("in_progress -> cancelled is early return with balance effect", () => {
      const meta = getLeaveRequestTransitionMetadata("in_progress", "cancelled");
      expect(meta).not.toBeNull();
      expect(meta!.affectsBalance).toBe(true);
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.auditAction).toBe("leave.early_return");
    });

    test("returns null for invalid transition", () => {
      expect(getLeaveRequestTransitionMetadata("rejected", "pending")).toBeNull();
      expect(getLeaveRequestTransitionMetadata("pending", "in_progress")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getLeaveRequestTransitionLabel
  // ---------------------------------------------------------------------------
  describe("getLeaveRequestTransitionLabel", () => {
    test("pending -> under_review is Submit for Review", () => {
      expect(getLeaveRequestTransitionLabel("pending", "under_review")).toBe("Submit for Review");
    });

    test("pending -> approved is Quick Approve", () => {
      expect(getLeaveRequestTransitionLabel("pending", "approved")).toBe("Quick Approve");
    });

    test("under_review -> pending is Request Revision", () => {
      expect(getLeaveRequestTransitionLabel("under_review", "pending")).toBe("Request Revision");
    });

    test("approved -> in_progress is Start Leave", () => {
      expect(getLeaveRequestTransitionLabel("approved", "in_progress")).toBe("Start Leave");
    });

    test("in_progress -> cancelled is Early Return", () => {
      expect(getLeaveRequestTransitionLabel("in_progress", "cancelled")).toBe("Early Return");
    });

    test("returns undefined for invalid/terminal transitions", () => {
      expect(getLeaveRequestTransitionLabel("rejected", "pending")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateLeaveRequestTransition
  // ---------------------------------------------------------------------------
  describe("validateLeaveRequestTransition", () => {
    test("returns null for valid transitions", () => {
      expect(validateLeaveRequestTransition("pending", "approved")).toBeNull();
      expect(validateLeaveRequestTransition("approved", "in_progress")).toBeNull();
      expect(validateLeaveRequestTransition("in_progress", "completed")).toBeNull();
    });

    test("returns error for same-state transition", () => {
      const result = validateLeaveRequestTransition("pending", "pending");
      expect(result).not.toBeNull();
      expect(result).toContain("already in pending state");
    });

    test("returns terminal state error for terminal states", () => {
      const result = validateLeaveRequestTransition("rejected", "pending");
      expect(result).not.toBeNull();
      expect(result).toContain("terminal state");
    });

    test("returns error with valid options for invalid non-terminal transition", () => {
      const result = validateLeaveRequestTransition("pending", "in_progress");
      expect(result).not.toBeNull();
      expect(result).toContain("Invalid transition");
    });
  });

  // ---------------------------------------------------------------------------
  // isLeaveRequestTerminalState
  // ---------------------------------------------------------------------------
  describe("isLeaveRequestTerminalState", () => {
    test("rejected is terminal", () => {
      expect(isLeaveRequestTerminalState("rejected")).toBe(true);
    });

    test("cancelled is terminal", () => {
      expect(isLeaveRequestTerminalState("cancelled")).toBe(true);
    });

    test("completed is terminal", () => {
      expect(isLeaveRequestTerminalState("completed")).toBe(true);
    });

    test("pending is not terminal", () => {
      expect(isLeaveRequestTerminalState("pending")).toBe(false);
    });

    test("under_review is not terminal", () => {
      expect(isLeaveRequestTerminalState("under_review")).toBe(false);
    });

    test("approved is not terminal", () => {
      expect(isLeaveRequestTerminalState("approved")).toBe(false);
    });

    test("in_progress is not terminal", () => {
      expect(isLeaveRequestTerminalState("in_progress")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // leaveRequestRequiresAction
  // ---------------------------------------------------------------------------
  describe("leaveRequestRequiresAction", () => {
    test("pending requires action", () => {
      expect(leaveRequestRequiresAction("pending")).toBe(true);
    });

    test("under_review requires action", () => {
      expect(leaveRequestRequiresAction("under_review")).toBe(true);
    });

    test("approved does not require action", () => {
      expect(leaveRequestRequiresAction("approved")).toBe(false);
    });

    test("in_progress does not require action", () => {
      expect(leaveRequestRequiresAction("in_progress")).toBe(false);
    });

    test("rejected does not require action", () => {
      expect(leaveRequestRequiresAction("rejected")).toBe(false);
    });

    test("completed does not require action", () => {
      expect(leaveRequestRequiresAction("completed")).toBe(false);
    });

    test("cancelled does not require action", () => {
      expect(leaveRequestRequiresAction("cancelled")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getLeaveRequestInitialState
  // ---------------------------------------------------------------------------
  describe("getLeaveRequestInitialState", () => {
    test("returns pending", () => {
      expect(getLeaveRequestInitialState()).toBe("pending");
    });
  });

  // ---------------------------------------------------------------------------
  // isLeaveRequestState
  // ---------------------------------------------------------------------------
  describe("isLeaveRequestState", () => {
    test("recognizes all valid states", () => {
      for (const state of Object.values(LeaveRequestStates)) {
        expect(isLeaveRequestState(state)).toBe(true);
      }
    });

    test("rejects invalid states", () => {
      expect(isLeaveRequestState("unknown")).toBe(false);
      expect(isLeaveRequestState("")).toBe(false);
      expect(isLeaveRequestState("PENDING")).toBe(false);
      expect(isLeaveRequestState("draft")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getLeaveRequestStateMachineSummary
  // ---------------------------------------------------------------------------
  describe("getLeaveRequestStateMachineSummary", () => {
    test("returns correct structure", () => {
      const summary = getLeaveRequestStateMachineSummary();

      expect(summary.states).toHaveLength(7);
      expect(summary.initialState).toBe("pending");
      expect(summary.terminalStates).toContain("rejected");
      expect(summary.terminalStates).toContain("cancelled");
      expect(summary.terminalStates).toContain("completed");
      expect(summary.terminalStates).toHaveLength(3);
    });

    test("transitions object contains all states as keys", () => {
      const summary = getLeaveRequestStateMachineSummary();
      for (const state of Object.values(LeaveRequestStates)) {
        expect(summary.transitions[state]).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Full Lifecycle Path Tests
  // ---------------------------------------------------------------------------
  describe("full lifecycle paths", () => {
    test("happy path: pending -> under_review -> approved -> in_progress -> completed", () => {
      expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      expect(canTransitionLeaveRequest("under_review", "approved")).toBe(true);
      expect(canTransitionLeaveRequest("approved", "in_progress")).toBe(true);
      expect(canTransitionLeaveRequest("in_progress", "completed")).toBe(true);
    });

    test("quick approve path: pending -> approved -> in_progress -> completed", () => {
      expect(canTransitionLeaveRequest("pending", "approved")).toBe(true);
      expect(canTransitionLeaveRequest("approved", "in_progress")).toBe(true);
      expect(canTransitionLeaveRequest("in_progress", "completed")).toBe(true);
    });

    test("rejection path: pending -> under_review -> rejected", () => {
      expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      expect(canTransitionLeaveRequest("under_review", "rejected")).toBe(true);
    });

    test("cancellation from any non-terminal state", () => {
      expect(canTransitionLeaveRequest("pending", "cancelled")).toBe(true);
      expect(canTransitionLeaveRequest("under_review", "cancelled")).toBe(true);
      expect(canTransitionLeaveRequest("approved", "cancelled")).toBe(true);
      expect(canTransitionLeaveRequest("in_progress", "cancelled")).toBe(true);
    });

    test("revision path: pending -> under_review -> pending -> under_review -> approved", () => {
      expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      expect(canTransitionLeaveRequest("under_review", "pending")).toBe(true);
      expect(canTransitionLeaveRequest("pending", "under_review")).toBe(true);
      expect(canTransitionLeaveRequest("under_review", "approved")).toBe(true);
    });
  });
});
