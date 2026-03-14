/**
 * Workflow State Machine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  WorkflowStates,
  canTransitionWorkflow,
  getValidWorkflowTransitions,
  getWorkflowTransitionMetadata,
  getWorkflowTransitionLabel,
  validateWorkflowTransition,
  isWorkflowTerminalState,
  isWorkflowActive,
  workflowRequiresApproval,
  getWorkflowInitialState,
  isWorkflowState,
  getWorkflowStateMachineSummary,
} from "../../state-machines/workflow";

describe("Workflow State Machine", () => {
  // ---------------------------------------------------------------------------
  // State Constants
  // ---------------------------------------------------------------------------
  describe("WorkflowStates", () => {
    test("defines all expected states", () => {
      expect(WorkflowStates.DRAFT).toBe("draft");
      expect(WorkflowStates.PENDING).toBe("pending");
      expect(WorkflowStates.IN_REVIEW).toBe("in_review");
      expect(WorkflowStates.AWAITING_APPROVAL).toBe("awaiting_approval");
      expect(WorkflowStates.STEP_APPROVED).toBe("step_approved");
      expect(WorkflowStates.STEP_REJECTED).toBe("step_rejected");
      expect(WorkflowStates.ESCALATED).toBe("escalated");
      expect(WorkflowStates.DELEGATED).toBe("delegated");
      expect(WorkflowStates.ON_HOLD).toBe("on_hold");
      expect(WorkflowStates.APPROVED).toBe("approved");
      expect(WorkflowStates.REJECTED).toBe("rejected");
      expect(WorkflowStates.CANCELLED).toBe("cancelled");
      expect(WorkflowStates.EXPIRED).toBe("expired");
    });

    test("has exactly 13 states", () => {
      expect(Object.keys(WorkflowStates)).toHaveLength(13);
    });
  });

  // ---------------------------------------------------------------------------
  // canTransitionWorkflow
  // ---------------------------------------------------------------------------
  describe("canTransitionWorkflow", () => {
    describe("valid transitions from draft", () => {
      test("draft -> pending", () => {
        expect(canTransitionWorkflow("draft", "pending")).toBe(true);
      });

      test("draft -> cancelled", () => {
        expect(canTransitionWorkflow("draft", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from pending", () => {
      test("pending -> in_review", () => {
        expect(canTransitionWorkflow("pending", "in_review")).toBe(true);
      });

      test("pending -> escalated", () => {
        expect(canTransitionWorkflow("pending", "escalated")).toBe(true);
      });

      test("pending -> on_hold", () => {
        expect(canTransitionWorkflow("pending", "on_hold")).toBe(true);
      });

      test("pending -> cancelled", () => {
        expect(canTransitionWorkflow("pending", "cancelled")).toBe(true);
      });

      test("pending -> expired", () => {
        expect(canTransitionWorkflow("pending", "expired")).toBe(true);
      });
    });

    describe("valid transitions from in_review", () => {
      test("in_review -> awaiting_approval", () => {
        expect(canTransitionWorkflow("in_review", "awaiting_approval")).toBe(true);
      });

      test("in_review -> step_approved", () => {
        expect(canTransitionWorkflow("in_review", "step_approved")).toBe(true);
      });

      test("in_review -> step_rejected", () => {
        expect(canTransitionWorkflow("in_review", "step_rejected")).toBe(true);
      });

      test("in_review -> escalated", () => {
        expect(canTransitionWorkflow("in_review", "escalated")).toBe(true);
      });

      test("in_review -> delegated", () => {
        expect(canTransitionWorkflow("in_review", "delegated")).toBe(true);
      });

      test("in_review -> on_hold", () => {
        expect(canTransitionWorkflow("in_review", "on_hold")).toBe(true);
      });

      test("in_review -> cancelled", () => {
        expect(canTransitionWorkflow("in_review", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from step_approved", () => {
      test("step_approved -> pending (next step)", () => {
        expect(canTransitionWorkflow("step_approved", "pending")).toBe(true);
      });

      test("step_approved -> approved (all steps done)", () => {
        expect(canTransitionWorkflow("step_approved", "approved")).toBe(true);
      });
    });

    describe("valid transitions from step_rejected", () => {
      test("step_rejected -> pending (revision submitted)", () => {
        expect(canTransitionWorkflow("step_rejected", "pending")).toBe(true);
      });

      test("step_rejected -> rejected (final rejection)", () => {
        expect(canTransitionWorkflow("step_rejected", "rejected")).toBe(true);
      });
    });

    describe("valid transitions from escalated", () => {
      test("escalated -> in_review", () => {
        expect(canTransitionWorkflow("escalated", "in_review")).toBe(true);
      });

      test("escalated -> step_approved", () => {
        expect(canTransitionWorkflow("escalated", "step_approved")).toBe(true);
      });

      test("escalated -> step_rejected", () => {
        expect(canTransitionWorkflow("escalated", "step_rejected")).toBe(true);
      });

      test("escalated -> on_hold", () => {
        expect(canTransitionWorkflow("escalated", "on_hold")).toBe(true);
      });

      test("escalated -> cancelled", () => {
        expect(canTransitionWorkflow("escalated", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from delegated", () => {
      test("delegated -> in_review", () => {
        expect(canTransitionWorkflow("delegated", "in_review")).toBe(true);
      });

      test("delegated -> awaiting_approval", () => {
        expect(canTransitionWorkflow("delegated", "awaiting_approval")).toBe(true);
      });

      test("delegated -> cancelled", () => {
        expect(canTransitionWorkflow("delegated", "cancelled")).toBe(true);
      });
    });

    describe("valid transitions from on_hold", () => {
      test("on_hold -> pending", () => {
        expect(canTransitionWorkflow("on_hold", "pending")).toBe(true);
      });

      test("on_hold -> in_review", () => {
        expect(canTransitionWorkflow("on_hold", "in_review")).toBe(true);
      });

      test("on_hold -> cancelled", () => {
        expect(canTransitionWorkflow("on_hold", "cancelled")).toBe(true);
      });

      test("on_hold -> expired", () => {
        expect(canTransitionWorkflow("on_hold", "expired")).toBe(true);
      });
    });

    describe("terminal state transitions", () => {
      const terminalStates = ["approved", "rejected", "cancelled", "expired"] as const;

      for (const terminal of terminalStates) {
        test(`${terminal} -> any state is invalid`, () => {
          for (const state of Object.values(WorkflowStates)) {
            if (state !== terminal) {
              expect(canTransitionWorkflow(terminal, state)).toBe(false);
            }
          }
        });
      }
    });

    describe("self-transitions", () => {
      test("all self-transitions are invalid", () => {
        for (const state of Object.values(WorkflowStates)) {
          expect(canTransitionWorkflow(state, state)).toBe(false);
        }
      });
    });

    describe("invalid non-terminal transitions", () => {
      test("draft -> in_review (must go through pending)", () => {
        expect(canTransitionWorkflow("draft", "in_review")).toBe(false);
      });

      test("draft -> approved", () => {
        expect(canTransitionWorkflow("draft", "approved")).toBe(false);
      });

      test("pending -> approved (must go through step_approved)", () => {
        expect(canTransitionWorkflow("pending", "approved")).toBe(false);
      });

      test("step_approved -> cancelled", () => {
        expect(canTransitionWorkflow("step_approved", "cancelled")).toBe(false);
      });

      test("delegated -> step_approved", () => {
        expect(canTransitionWorkflow("delegated", "step_approved")).toBe(false);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getValidWorkflowTransitions
  // ---------------------------------------------------------------------------
  describe("getValidWorkflowTransitions", () => {
    test("from draft returns 2 options", () => {
      const transitions = getValidWorkflowTransitions("draft");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("pending");
      expect(transitions).toContain("cancelled");
    });

    test("from pending returns 5 options", () => {
      const transitions = getValidWorkflowTransitions("pending");
      expect(transitions).toHaveLength(5);
    });

    test("from in_review returns 7 options", () => {
      const transitions = getValidWorkflowTransitions("in_review");
      expect(transitions).toHaveLength(7);
    });

    test("from awaiting_approval returns 7 options", () => {
      const transitions = getValidWorkflowTransitions("awaiting_approval");
      expect(transitions).toHaveLength(7);
    });

    test("from step_approved returns 2 options", () => {
      const transitions = getValidWorkflowTransitions("step_approved");
      expect(transitions).toHaveLength(2);
    });

    test("from step_rejected returns 2 options", () => {
      const transitions = getValidWorkflowTransitions("step_rejected");
      expect(transitions).toHaveLength(2);
    });

    test("from escalated returns 5 options", () => {
      const transitions = getValidWorkflowTransitions("escalated");
      expect(transitions).toHaveLength(5);
    });

    test("from delegated returns 3 options", () => {
      const transitions = getValidWorkflowTransitions("delegated");
      expect(transitions).toHaveLength(3);
    });

    test("from on_hold returns 4 options", () => {
      const transitions = getValidWorkflowTransitions("on_hold");
      expect(transitions).toHaveLength(4);
    });

    test("terminal states return empty arrays", () => {
      expect(getValidWorkflowTransitions("approved")).toEqual([]);
      expect(getValidWorkflowTransitions("rejected")).toEqual([]);
      expect(getValidWorkflowTransitions("cancelled")).toEqual([]);
      expect(getValidWorkflowTransitions("expired")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getWorkflowTransitionMetadata
  // ---------------------------------------------------------------------------
  describe("getWorkflowTransitionMetadata", () => {
    test("draft -> pending notifies approvers", () => {
      const meta = getWorkflowTransitionMetadata("draft", "pending");
      expect(meta).not.toBeNull();
      expect(meta!.notifiesApprovers).toBe(true);
      expect(meta!.requiresReason).toBe(false);
      expect(meta!.auditAction).toBe("workflow.submitted");
    });

    test("draft -> cancelled does not notify anyone", () => {
      const meta = getWorkflowTransitionMetadata("draft", "cancelled");
      expect(meta).not.toBeNull();
      expect(meta!.notifiesApprovers).toBe(false);
      expect(meta!.notifiesRequester).toBe(false);
    });

    test("in_review -> delegated requires target user", () => {
      const meta = getWorkflowTransitionMetadata("in_review", "delegated");
      expect(meta).not.toBeNull();
      expect(meta!.requiresTargetUser).toBe(true);
    });

    test("pending -> escalated requires reason and target user", () => {
      const meta = getWorkflowTransitionMetadata("pending", "escalated");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.requiresTargetUser).toBe(true);
    });

    test("in_review -> step_rejected requires reason", () => {
      const meta = getWorkflowTransitionMetadata("in_review", "step_rejected");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
    });

    test("step_approved -> approved notifies requester", () => {
      const meta = getWorkflowTransitionMetadata("step_approved", "approved");
      expect(meta).not.toBeNull();
      expect(meta!.notifiesRequester).toBe(true);
      expect(meta!.auditAction).toBe("workflow.completed");
    });

    test("step_rejected -> rejected requires reason", () => {
      const meta = getWorkflowTransitionMetadata("step_rejected", "rejected");
      expect(meta).not.toBeNull();
      expect(meta!.requiresReason).toBe(true);
      expect(meta!.auditAction).toBe("workflow.finally_rejected");
    });

    test("returns null for invalid transition", () => {
      expect(getWorkflowTransitionMetadata("approved", "pending")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getWorkflowTransitionLabel
  // ---------------------------------------------------------------------------
  describe("getWorkflowTransitionLabel", () => {
    test("draft -> pending is Submit for Approval", () => {
      expect(getWorkflowTransitionLabel("draft", "pending")).toBe("Submit for Approval");
    });

    test("draft -> cancelled is Discard Draft", () => {
      expect(getWorkflowTransitionLabel("draft", "cancelled")).toBe("Discard Draft");
    });

    test("step_approved -> approved is Complete Workflow", () => {
      expect(getWorkflowTransitionLabel("step_approved", "approved")).toBe("Complete Workflow");
    });

    test("step_rejected -> rejected is Final Rejection", () => {
      expect(getWorkflowTransitionLabel("step_rejected", "rejected")).toBe("Final Rejection");
    });

    test("returns undefined for terminal state transitions", () => {
      expect(getWorkflowTransitionLabel("approved", "pending")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateWorkflowTransition
  // ---------------------------------------------------------------------------
  describe("validateWorkflowTransition", () => {
    test("returns null for valid transitions", () => {
      expect(validateWorkflowTransition("draft", "pending")).toBeNull();
      expect(validateWorkflowTransition("pending", "in_review")).toBeNull();
      expect(validateWorkflowTransition("step_approved", "approved")).toBeNull();
    });

    test("returns error for same-state transition", () => {
      const result = validateWorkflowTransition("draft", "draft");
      expect(result).not.toBeNull();
      expect(result).toContain("already in draft state");
    });

    test("returns terminal state error for terminal states", () => {
      const result = validateWorkflowTransition("approved", "pending");
      expect(result).not.toBeNull();
      expect(result).toContain("terminal state");
    });

    test("returns error for each terminal state", () => {
      const terminals = ["approved", "rejected", "cancelled", "expired"] as const;
      for (const terminal of terminals) {
        const result = validateWorkflowTransition(terminal, "draft");
        expect(result).not.toBeNull();
        expect(result).toContain("terminal state");
      }
    });

    test("returns error listing valid transitions for invalid non-terminal transition", () => {
      const result = validateWorkflowTransition("draft", "approved");
      expect(result).not.toBeNull();
      expect(result).toContain("Invalid transition");
    });
  });

  // ---------------------------------------------------------------------------
  // isWorkflowTerminalState
  // ---------------------------------------------------------------------------
  describe("isWorkflowTerminalState", () => {
    test("terminal states", () => {
      expect(isWorkflowTerminalState("approved")).toBe(true);
      expect(isWorkflowTerminalState("rejected")).toBe(true);
      expect(isWorkflowTerminalState("cancelled")).toBe(true);
      expect(isWorkflowTerminalState("expired")).toBe(true);
    });

    test("non-terminal states", () => {
      expect(isWorkflowTerminalState("draft")).toBe(false);
      expect(isWorkflowTerminalState("pending")).toBe(false);
      expect(isWorkflowTerminalState("in_review")).toBe(false);
      expect(isWorkflowTerminalState("awaiting_approval")).toBe(false);
      expect(isWorkflowTerminalState("step_approved")).toBe(false);
      expect(isWorkflowTerminalState("step_rejected")).toBe(false);
      expect(isWorkflowTerminalState("escalated")).toBe(false);
      expect(isWorkflowTerminalState("delegated")).toBe(false);
      expect(isWorkflowTerminalState("on_hold")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isWorkflowActive
  // ---------------------------------------------------------------------------
  describe("isWorkflowActive", () => {
    test("active states", () => {
      expect(isWorkflowActive("draft")).toBe(true);
      expect(isWorkflowActive("pending")).toBe(true);
      expect(isWorkflowActive("in_review")).toBe(true);
      expect(isWorkflowActive("awaiting_approval")).toBe(true);
      expect(isWorkflowActive("step_approved")).toBe(true);
      expect(isWorkflowActive("step_rejected")).toBe(true);
      expect(isWorkflowActive("escalated")).toBe(true);
      expect(isWorkflowActive("delegated")).toBe(true);
      expect(isWorkflowActive("on_hold")).toBe(true);
    });

    test("inactive states", () => {
      expect(isWorkflowActive("approved")).toBe(false);
      expect(isWorkflowActive("rejected")).toBe(false);
      expect(isWorkflowActive("cancelled")).toBe(false);
      expect(isWorkflowActive("expired")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // workflowRequiresApproval
  // ---------------------------------------------------------------------------
  describe("workflowRequiresApproval", () => {
    test("states requiring approval", () => {
      expect(workflowRequiresApproval("pending")).toBe(true);
      expect(workflowRequiresApproval("in_review")).toBe(true);
      expect(workflowRequiresApproval("awaiting_approval")).toBe(true);
      expect(workflowRequiresApproval("escalated")).toBe(true);
      expect(workflowRequiresApproval("delegated")).toBe(true);
    });

    test("states not requiring approval", () => {
      expect(workflowRequiresApproval("draft")).toBe(false);
      expect(workflowRequiresApproval("step_approved")).toBe(false);
      expect(workflowRequiresApproval("step_rejected")).toBe(false);
      expect(workflowRequiresApproval("on_hold")).toBe(false);
      expect(workflowRequiresApproval("approved")).toBe(false);
      expect(workflowRequiresApproval("rejected")).toBe(false);
      expect(workflowRequiresApproval("cancelled")).toBe(false);
      expect(workflowRequiresApproval("expired")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getWorkflowInitialState
  // ---------------------------------------------------------------------------
  describe("getWorkflowInitialState", () => {
    test("returns draft", () => {
      expect(getWorkflowInitialState()).toBe("draft");
    });
  });

  // ---------------------------------------------------------------------------
  // isWorkflowState
  // ---------------------------------------------------------------------------
  describe("isWorkflowState", () => {
    test("recognizes all valid states", () => {
      for (const state of Object.values(WorkflowStates)) {
        expect(isWorkflowState(state)).toBe(true);
      }
    });

    test("rejects invalid states", () => {
      expect(isWorkflowState("unknown")).toBe(false);
      expect(isWorkflowState("")).toBe(false);
      expect(isWorkflowState("DRAFT")).toBe(false);
      expect(isWorkflowState("open")).toBe(false);
      expect(isWorkflowState("active")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getWorkflowStateMachineSummary
  // ---------------------------------------------------------------------------
  describe("getWorkflowStateMachineSummary", () => {
    test("returns correct structure", () => {
      const summary = getWorkflowStateMachineSummary();

      expect(summary.states).toHaveLength(13);
      expect(summary.initialState).toBe("draft");
      expect(summary.terminalStates).toHaveLength(4);
      expect(summary.terminalStates).toContain("approved");
      expect(summary.terminalStates).toContain("rejected");
      expect(summary.terminalStates).toContain("cancelled");
      expect(summary.terminalStates).toContain("expired");
    });

    test("transitions object contains all states as keys", () => {
      const summary = getWorkflowStateMachineSummary();
      for (const state of Object.values(WorkflowStates)) {
        expect(summary.transitions[state]).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Full Lifecycle Path Tests
  // ---------------------------------------------------------------------------
  describe("full lifecycle paths", () => {
    test("simple approval: draft -> pending -> in_review -> step_approved -> approved", () => {
      expect(canTransitionWorkflow("draft", "pending")).toBe(true);
      expect(canTransitionWorkflow("pending", "in_review")).toBe(true);
      expect(canTransitionWorkflow("in_review", "step_approved")).toBe(true);
      expect(canTransitionWorkflow("step_approved", "approved")).toBe(true);
    });

    test("multi-step approval: step_approved -> pending -> in_review -> step_approved -> approved", () => {
      expect(canTransitionWorkflow("step_approved", "pending")).toBe(true);
      expect(canTransitionWorkflow("pending", "in_review")).toBe(true);
      expect(canTransitionWorkflow("in_review", "step_approved")).toBe(true);
      expect(canTransitionWorkflow("step_approved", "approved")).toBe(true);
    });

    test("rejection with revision: step_rejected -> pending -> in_review -> step_approved -> approved", () => {
      expect(canTransitionWorkflow("step_rejected", "pending")).toBe(true);
      expect(canTransitionWorkflow("pending", "in_review")).toBe(true);
      expect(canTransitionWorkflow("in_review", "step_approved")).toBe(true);
      expect(canTransitionWorkflow("step_approved", "approved")).toBe(true);
    });

    test("final rejection: step_rejected -> rejected", () => {
      expect(canTransitionWorkflow("step_rejected", "rejected")).toBe(true);
    });

    test("escalation path: pending -> escalated -> step_approved -> approved", () => {
      expect(canTransitionWorkflow("pending", "escalated")).toBe(true);
      expect(canTransitionWorkflow("escalated", "step_approved")).toBe(true);
      expect(canTransitionWorkflow("step_approved", "approved")).toBe(true);
    });

    test("delegation path: in_review -> delegated -> in_review -> step_approved", () => {
      expect(canTransitionWorkflow("in_review", "delegated")).toBe(true);
      expect(canTransitionWorkflow("delegated", "in_review")).toBe(true);
      expect(canTransitionWorkflow("in_review", "step_approved")).toBe(true);
    });

    test("hold and resume: pending -> on_hold -> pending -> in_review", () => {
      expect(canTransitionWorkflow("pending", "on_hold")).toBe(true);
      expect(canTransitionWorkflow("on_hold", "pending")).toBe(true);
      expect(canTransitionWorkflow("pending", "in_review")).toBe(true);
    });

    test("expiration from on_hold: on_hold -> expired", () => {
      expect(canTransitionWorkflow("on_hold", "expired")).toBe(true);
    });
  });
});
