/**
 * Performance Cycle State Machine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  PerformanceCycleStates,
  canTransitionCycle,
  getValidCycleTransitions,
  getCycleTransitionMetadata,
  getCycleTransitionLabel,
  validateCycleTransition,
  isCycleTerminalState,
  isCycleInProgress,
  areRatingsLocked,
  areGoalsLocked,
  getCycleInitialState,
  isPerformanceCycleState,
  getPhaseInfo,
  getCycleStateMachineSummary,
  PHASE_INFO,
} from "../../state-machines/performance-cycle";

describe("Performance Cycle State Machine", () => {
  // ---------------------------------------------------------------------------
  // State Constants
  // ---------------------------------------------------------------------------
  describe("PerformanceCycleStates", () => {
    test("defines all expected states", () => {
      expect(PerformanceCycleStates.DRAFT).toBe("draft");
      expect(PerformanceCycleStates.ACTIVE).toBe("active");
      expect(PerformanceCycleStates.REVIEW).toBe("review");
      expect(PerformanceCycleStates.CALIBRATION).toBe("calibration");
      expect(PerformanceCycleStates.CLOSED).toBe("closed");
    });

    test("has exactly 5 states", () => {
      expect(Object.keys(PerformanceCycleStates)).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // canTransitionCycle
  // ---------------------------------------------------------------------------
  describe("canTransitionCycle", () => {
    describe("valid forward transitions", () => {
      test("draft -> active", () => {
        expect(canTransitionCycle("draft", "active")).toBe(true);
      });

      test("active -> review", () => {
        expect(canTransitionCycle("active", "review")).toBe(true);
      });

      test("review -> calibration", () => {
        expect(canTransitionCycle("review", "calibration")).toBe(true);
      });

      test("calibration -> closed", () => {
        expect(canTransitionCycle("calibration", "closed")).toBe(true);
      });
    });

    describe("valid backward transitions", () => {
      test("review -> active (reopen goal setting)", () => {
        expect(canTransitionCycle("review", "active")).toBe(true);
      });

      test("calibration -> review (reopen reviews)", () => {
        expect(canTransitionCycle("calibration", "review")).toBe(true);
      });
    });

    describe("invalid transitions", () => {
      test("draft -> review (must go through active first)", () => {
        expect(canTransitionCycle("draft", "review")).toBe(false);
      });

      test("draft -> calibration", () => {
        expect(canTransitionCycle("draft", "calibration")).toBe(false);
      });

      test("draft -> closed", () => {
        expect(canTransitionCycle("draft", "closed")).toBe(false);
      });

      test("active -> calibration (must go through review)", () => {
        expect(canTransitionCycle("active", "calibration")).toBe(false);
      });

      test("active -> closed", () => {
        expect(canTransitionCycle("active", "closed")).toBe(false);
      });

      test("active -> draft", () => {
        expect(canTransitionCycle("active", "draft")).toBe(false);
      });

      test("review -> closed (must go through calibration)", () => {
        expect(canTransitionCycle("review", "closed")).toBe(false);
      });

      test("review -> draft", () => {
        expect(canTransitionCycle("review", "draft")).toBe(false);
      });

      test("calibration -> active", () => {
        expect(canTransitionCycle("calibration", "active")).toBe(false);
      });

      test("calibration -> draft", () => {
        expect(canTransitionCycle("calibration", "draft")).toBe(false);
      });
    });

    describe("terminal state transitions", () => {
      test("closed -> any state is invalid", () => {
        for (const state of Object.values(PerformanceCycleStates)) {
          if (state !== "closed") {
            expect(canTransitionCycle("closed", state)).toBe(false);
          }
        }
      });
    });

    describe("self-transitions", () => {
      test("all self-transitions are invalid", () => {
        for (const state of Object.values(PerformanceCycleStates)) {
          expect(canTransitionCycle(state, state)).toBe(false);
        }
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getValidCycleTransitions
  // ---------------------------------------------------------------------------
  describe("getValidCycleTransitions", () => {
    test("from draft returns only active", () => {
      const transitions = getValidCycleTransitions("draft");
      expect(transitions).toHaveLength(1);
      expect(transitions).toContain("active");
    });

    test("from active returns only review", () => {
      const transitions = getValidCycleTransitions("active");
      expect(transitions).toHaveLength(1);
      expect(transitions).toContain("review");
    });

    test("from review returns calibration and active", () => {
      const transitions = getValidCycleTransitions("review");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("calibration");
      expect(transitions).toContain("active");
    });

    test("from calibration returns closed and review", () => {
      const transitions = getValidCycleTransitions("calibration");
      expect(transitions).toHaveLength(2);
      expect(transitions).toContain("closed");
      expect(transitions).toContain("review");
    });

    test("from closed returns empty array", () => {
      expect(getValidCycleTransitions("closed")).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getCycleTransitionMetadata
  // ---------------------------------------------------------------------------
  describe("getCycleTransitionMetadata", () => {
    test("draft -> active requires confirmation and sends notifications", () => {
      const meta = getCycleTransitionMetadata("draft", "active");
      expect(meta).not.toBeNull();
      expect(meta!.requiresConfirmation).toBe(true);
      expect(meta!.sendsNotifications).toBe(true);
      expect(meta!.locksPreviousPhase).toBe(false);
      expect(meta!.warningMessage).toBeDefined();
    });

    test("active -> review has minimum completion requirement", () => {
      const meta = getCycleTransitionMetadata("active", "review");
      expect(meta).not.toBeNull();
      expect(meta!.minimumCompletion).toBe(80);
      expect(meta!.locksPreviousPhase).toBe(true);
    });

    test("review -> calibration has higher minimum completion", () => {
      const meta = getCycleTransitionMetadata("review", "calibration");
      expect(meta).not.toBeNull();
      expect(meta!.minimumCompletion).toBe(90);
      expect(meta!.locksPreviousPhase).toBe(true);
    });

    test("review -> active (reopen) does not lock previous phase", () => {
      const meta = getCycleTransitionMetadata("review", "active");
      expect(meta).not.toBeNull();
      expect(meta!.locksPreviousPhase).toBe(false);
      expect(meta!.sendsNotifications).toBe(false);
    });

    test("calibration -> closed locks and sends notifications", () => {
      const meta = getCycleTransitionMetadata("calibration", "closed");
      expect(meta).not.toBeNull();
      expect(meta!.locksPreviousPhase).toBe(true);
      expect(meta!.sendsNotifications).toBe(true);
    });

    test("calibration -> review (reopen) does not lock", () => {
      const meta = getCycleTransitionMetadata("calibration", "review");
      expect(meta).not.toBeNull();
      expect(meta!.locksPreviousPhase).toBe(false);
      expect(meta!.sendsNotifications).toBe(false);
    });

    test("returns null for invalid transition", () => {
      expect(getCycleTransitionMetadata("closed", "draft")).toBeNull();
      expect(getCycleTransitionMetadata("draft", "review")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getCycleTransitionLabel
  // ---------------------------------------------------------------------------
  describe("getCycleTransitionLabel", () => {
    test("draft -> active is Launch Cycle", () => {
      expect(getCycleTransitionLabel("draft", "active")).toBe("Launch Cycle");
    });

    test("active -> review is Start Review Phase", () => {
      expect(getCycleTransitionLabel("active", "review")).toBe("Start Review Phase");
    });

    test("review -> calibration is Start Calibration", () => {
      expect(getCycleTransitionLabel("review", "calibration")).toBe("Start Calibration");
    });

    test("review -> active is Reopen Goal Setting", () => {
      expect(getCycleTransitionLabel("review", "active")).toBe("Reopen Goal Setting");
    });

    test("calibration -> closed is Close Cycle", () => {
      expect(getCycleTransitionLabel("calibration", "closed")).toBe("Close Cycle");
    });

    test("calibration -> review is Reopen Reviews", () => {
      expect(getCycleTransitionLabel("calibration", "review")).toBe("Reopen Reviews");
    });

    test("returns undefined for terminal state", () => {
      expect(getCycleTransitionLabel("closed", "draft")).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // validateCycleTransition
  // ---------------------------------------------------------------------------
  describe("validateCycleTransition", () => {
    test("returns null for valid transitions", () => {
      expect(validateCycleTransition("draft", "active")).toBeNull();
      expect(validateCycleTransition("active", "review")).toBeNull();
      expect(validateCycleTransition("review", "calibration")).toBeNull();
      expect(validateCycleTransition("calibration", "closed")).toBeNull();
    });

    test("returns null for valid backward transitions", () => {
      expect(validateCycleTransition("review", "active")).toBeNull();
      expect(validateCycleTransition("calibration", "review")).toBeNull();
    });

    test("returns error for same-state transition", () => {
      const result = validateCycleTransition("draft", "draft");
      expect(result).not.toBeNull();
      expect(result).toContain("already in draft state");
    });

    test("returns terminal state error for closed", () => {
      const result = validateCycleTransition("closed", "active");
      expect(result).not.toBeNull();
      expect(result).toContain("terminal state");
    });

    test("returns error with valid options for skipped phases", () => {
      const result = validateCycleTransition("draft", "review");
      expect(result).not.toBeNull();
      expect(result).toContain("Invalid transition");
    });
  });

  // ---------------------------------------------------------------------------
  // isCycleTerminalState
  // ---------------------------------------------------------------------------
  describe("isCycleTerminalState", () => {
    test("closed is terminal", () => {
      expect(isCycleTerminalState("closed")).toBe(true);
    });

    test("non-terminal states", () => {
      expect(isCycleTerminalState("draft")).toBe(false);
      expect(isCycleTerminalState("active")).toBe(false);
      expect(isCycleTerminalState("review")).toBe(false);
      expect(isCycleTerminalState("calibration")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isCycleInProgress
  // ---------------------------------------------------------------------------
  describe("isCycleInProgress", () => {
    test("active is in progress", () => {
      expect(isCycleInProgress("active")).toBe(true);
    });

    test("review is in progress", () => {
      expect(isCycleInProgress("review")).toBe(true);
    });

    test("calibration is in progress", () => {
      expect(isCycleInProgress("calibration")).toBe(true);
    });

    test("draft is not in progress", () => {
      expect(isCycleInProgress("draft")).toBe(false);
    });

    test("closed is not in progress", () => {
      expect(isCycleInProgress("closed")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // areRatingsLocked
  // ---------------------------------------------------------------------------
  describe("areRatingsLocked", () => {
    test("calibration has ratings locked", () => {
      expect(areRatingsLocked("calibration")).toBe(true);
    });

    test("closed has ratings locked", () => {
      expect(areRatingsLocked("closed")).toBe(true);
    });

    test("draft does not have ratings locked", () => {
      expect(areRatingsLocked("draft")).toBe(false);
    });

    test("active does not have ratings locked", () => {
      expect(areRatingsLocked("active")).toBe(false);
    });

    test("review does not have ratings locked", () => {
      expect(areRatingsLocked("review")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // areGoalsLocked
  // ---------------------------------------------------------------------------
  describe("areGoalsLocked", () => {
    test("review has goals locked", () => {
      expect(areGoalsLocked("review")).toBe(true);
    });

    test("calibration has goals locked", () => {
      expect(areGoalsLocked("calibration")).toBe(true);
    });

    test("closed has goals locked", () => {
      expect(areGoalsLocked("closed")).toBe(true);
    });

    test("draft does not have goals locked", () => {
      expect(areGoalsLocked("draft")).toBe(false);
    });

    test("active does not have goals locked", () => {
      expect(areGoalsLocked("active")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getCycleInitialState
  // ---------------------------------------------------------------------------
  describe("getCycleInitialState", () => {
    test("returns draft", () => {
      expect(getCycleInitialState()).toBe("draft");
    });
  });

  // ---------------------------------------------------------------------------
  // isPerformanceCycleState
  // ---------------------------------------------------------------------------
  describe("isPerformanceCycleState", () => {
    test("recognizes all valid states", () => {
      for (const state of Object.values(PerformanceCycleStates)) {
        expect(isPerformanceCycleState(state)).toBe(true);
      }
    });

    test("rejects invalid states", () => {
      expect(isPerformanceCycleState("unknown")).toBe(false);
      expect(isPerformanceCycleState("")).toBe(false);
      expect(isPerformanceCycleState("DRAFT")).toBe(false);
      expect(isPerformanceCycleState("open")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getPhaseInfo
  // ---------------------------------------------------------------------------
  describe("getPhaseInfo", () => {
    test("draft phase has correct info", () => {
      const info = getPhaseInfo("draft");
      expect(info.name).toBe("Draft");
      expect(info.activeParticipants).toContain("hr");
      expect(info.typicalDurationDays).toBeGreaterThan(0);
      expect(info.activities.length).toBeGreaterThan(0);
    });

    test("active phase has employees and managers", () => {
      const info = getPhaseInfo("active");
      expect(info.activeParticipants).toContain("employees");
      expect(info.activeParticipants).toContain("managers");
    });

    test("review phase has managers and hr", () => {
      const info = getPhaseInfo("review");
      expect(info.activeParticipants).toContain("managers");
      expect(info.activeParticipants).toContain("hr");
    });

    test("calibration phase includes leadership", () => {
      const info = getPhaseInfo("calibration");
      expect(info.activeParticipants).toContain("leadership");
    });

    test("closed phase has 0 duration", () => {
      const info = getPhaseInfo("closed");
      expect(info.typicalDurationDays).toBe(0);
    });

    test("all phases have descriptions", () => {
      for (const state of Object.values(PerformanceCycleStates)) {
        const info = getPhaseInfo(state);
        expect(info.description).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // PHASE_INFO
  // ---------------------------------------------------------------------------
  describe("PHASE_INFO", () => {
    test("is defined for all states", () => {
      for (const state of Object.values(PerformanceCycleStates)) {
        expect(PHASE_INFO[state]).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // getCycleStateMachineSummary
  // ---------------------------------------------------------------------------
  describe("getCycleStateMachineSummary", () => {
    test("returns correct structure", () => {
      const summary = getCycleStateMachineSummary();

      expect(summary.states).toHaveLength(5);
      expect(summary.initialState).toBe("draft");
      expect(summary.terminalStates).toEqual(["closed"]);
      expect(summary.phaseInfo).toBeDefined();
    });

    test("phaseInfo contains all states", () => {
      const summary = getCycleStateMachineSummary();
      for (const state of Object.values(PerformanceCycleStates)) {
        expect(summary.phaseInfo[state]).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Full Lifecycle Path Tests
  // ---------------------------------------------------------------------------
  describe("full lifecycle paths", () => {
    test("standard forward path: draft -> active -> review -> calibration -> closed", () => {
      expect(canTransitionCycle("draft", "active")).toBe(true);
      expect(canTransitionCycle("active", "review")).toBe(true);
      expect(canTransitionCycle("review", "calibration")).toBe(true);
      expect(canTransitionCycle("calibration", "closed")).toBe(true);
    });

    test("reopen review and proceed: calibration -> review -> calibration -> closed", () => {
      expect(canTransitionCycle("calibration", "review")).toBe(true);
      expect(canTransitionCycle("review", "calibration")).toBe(true);
      expect(canTransitionCycle("calibration", "closed")).toBe(true);
    });

    test("reopen goal setting and proceed: review -> active -> review -> calibration", () => {
      expect(canTransitionCycle("review", "active")).toBe(true);
      expect(canTransitionCycle("active", "review")).toBe(true);
      expect(canTransitionCycle("review", "calibration")).toBe(true);
    });
  });
});
