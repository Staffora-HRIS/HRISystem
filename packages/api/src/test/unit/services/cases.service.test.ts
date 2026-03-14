/**
 * Cases Service Unit Tests
 *
 * Tests for HR Case Management business logic including:
 * - State machine transitions (open -> in_progress -> resolved -> closed)
 * - Invalid transition rejection
 * - Case assignment and escalation rules
 * - Comment rules on open/closed cases
 * - Resolution and closing workflows
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/cases/service.ts)
// =============================================================================

type CaseStatus = "open" | "in_progress" | "pending_info" | "escalated" | "resolved" | "closed" | "cancelled";

const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["in_progress", "pending_info", "escalated", "resolved", "cancelled"],
  in_progress: ["pending_info", "escalated", "resolved", "cancelled"],
  pending_info: ["in_progress", "escalated", "resolved", "cancelled"],
  escalated: ["in_progress", "resolved", "cancelled"],
  resolved: ["closed", "in_progress"], // Can reopen
  closed: [], // Terminal state
  cancelled: [], // Terminal state
};

import type { ServiceResult } from "../../../types/service-result";

interface CaseData {
  id: string;
  caseNumber?: string;
  status: CaseStatus;
  category?: string;
  priority?: string;
  subject?: string;
  description?: string;
  requesterId?: string;
  assigneeId?: string | null;
  resolution?: string;
  resolvedAt?: Date;
  closedAt?: Date;
  escalatedTo?: string;
}

// Service logic extracted into testable functions
function validateStatusTransition(
  currentStatus: CaseStatus,
  newStatus: CaseStatus
): ServiceResult<null> {
  const validTransitions = VALID_TRANSITIONS[currentStatus] || [];
  if (!validTransitions.includes(newStatus)) {
    return {
      success: false,
      error: {
        code: "STATE_MACHINE_VIOLATION",
        message: `Cannot transition from ${currentStatus} to ${newStatus}`,
        details: { validTransitions },
      },
    };
  }
  return { success: true };
}

function validateCaseExists(hrCase: CaseData | null): ServiceResult<CaseData> {
  if (!hrCase) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Case not found" },
    };
  }
  return { success: true, data: hrCase };
}

function canAssignCase(status: CaseStatus): ServiceResult<null> {
  if (["closed", "cancelled"].includes(status)) {
    return {
      success: false,
      error: {
        code: "CASE_CLOSED",
        message: "Cannot assign a closed or cancelled case",
      },
    };
  }
  return { success: true };
}

function canEscalateCase(status: CaseStatus): ServiceResult<null> {
  if (["closed", "cancelled", "resolved"].includes(status)) {
    return {
      success: false,
      error: {
        code: "CANNOT_ESCALATE",
        message: `Cannot escalate a ${status} case`,
      },
    };
  }
  return { success: true };
}

function canResolveCase(status: CaseStatus): ServiceResult<null> {
  if (["closed", "cancelled"].includes(status)) {
    return {
      success: false,
      error: {
        code: "CANNOT_RESOLVE",
        message: `Cannot resolve a ${status} case`,
      },
    };
  }
  return { success: true };
}

function canCloseCase(status: CaseStatus): ServiceResult<null> {
  if (status !== "resolved") {
    return {
      success: false,
      error: {
        code: "CANNOT_CLOSE",
        message: "Case must be resolved before closing",
      },
    };
  }
  return { success: true };
}

function canAddComment(status: CaseStatus): ServiceResult<null> {
  if (["closed", "cancelled"].includes(status)) {
    return {
      success: false,
      error: {
        code: "CASE_CLOSED",
        message: "Cannot add comments to a closed or cancelled case",
      },
    };
  }
  return { success: true };
}

// =============================================================================
// Tests
// =============================================================================

describe("CasesService", () => {
  // ===========================================================================
  // Case Lookup
  // ===========================================================================

  describe("Case Lookup", () => {
    it("should return NOT_FOUND when case does not exist", () => {
      const result = validateCaseExists(null);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should return case data when found", () => {
      const hrCase: CaseData = {
        id: "case1",
        caseNumber: "CASE-001",
        status: "open",
        category: "grievance",
      };

      const result = validateCaseExists(hrCase);

      expect(result.success).toBe(true);
      expect(result.data?.caseNumber).toBe("CASE-001");
    });
  });

  // ===========================================================================
  // State Machine Transitions
  // ===========================================================================

  describe("State Machine", () => {
    describe("valid transitions", () => {
      it("should allow open -> in_progress", () => {
        const result = validateStatusTransition("open", "in_progress");
        expect(result.success).toBe(true);
      });

      it("should allow open -> escalated", () => {
        const result = validateStatusTransition("open", "escalated");
        expect(result.success).toBe(true);
      });

      it("should allow open -> cancelled", () => {
        const result = validateStatusTransition("open", "cancelled");
        expect(result.success).toBe(true);
      });

      it("should allow open -> resolved", () => {
        const result = validateStatusTransition("open", "resolved");
        expect(result.success).toBe(true);
      });

      it("should allow open -> pending_info", () => {
        const result = validateStatusTransition("open", "pending_info");
        expect(result.success).toBe(true);
      });

      it("should allow in_progress -> resolved", () => {
        const result = validateStatusTransition("in_progress", "resolved");
        expect(result.success).toBe(true);
      });

      it("should allow in_progress -> escalated", () => {
        const result = validateStatusTransition("in_progress", "escalated");
        expect(result.success).toBe(true);
      });

      it("should allow in_progress -> cancelled", () => {
        const result = validateStatusTransition("in_progress", "cancelled");
        expect(result.success).toBe(true);
      });

      it("should allow resolved -> closed", () => {
        const result = validateStatusTransition("resolved", "closed");
        expect(result.success).toBe(true);
      });

      it("should allow resolved -> in_progress (reopen)", () => {
        const result = validateStatusTransition("resolved", "in_progress");
        expect(result.success).toBe(true);
      });

      it("should allow escalated -> in_progress", () => {
        const result = validateStatusTransition("escalated", "in_progress");
        expect(result.success).toBe(true);
      });

      it("should allow escalated -> resolved", () => {
        const result = validateStatusTransition("escalated", "resolved");
        expect(result.success).toBe(true);
      });

      it("should allow pending_info -> in_progress", () => {
        const result = validateStatusTransition("pending_info", "in_progress");
        expect(result.success).toBe(true);
      });
    });

    describe("invalid transitions", () => {
      it("should reject closed -> any state (terminal)", () => {
        const targets: CaseStatus[] = ["open", "in_progress", "escalated", "resolved", "cancelled", "pending_info"];
        for (const target of targets) {
          const result = validateStatusTransition("closed", target);
          expect(result.success).toBe(false);
          expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
        }
      });

      it("should reject cancelled -> any state (terminal)", () => {
        const targets: CaseStatus[] = ["open", "in_progress", "escalated", "resolved", "closed", "pending_info"];
        for (const target of targets) {
          const result = validateStatusTransition("cancelled", target);
          expect(result.success).toBe(false);
          expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
        }
      });

      it("should reject open -> closed (must resolve first)", () => {
        const result = validateStatusTransition("open", "closed");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
      });

      it("should reject in_progress -> closed (must resolve first)", () => {
        const result = validateStatusTransition("in_progress", "closed");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("STATE_MACHINE_VIOLATION");
      });

      it("should include valid transitions in error details", () => {
        const result = validateStatusTransition("closed", "open");

        expect(result.error?.details).toBeDefined();
        expect(result.error?.details.validTransitions).toEqual([]);
      });

      it("should include available transitions for non-terminal states", () => {
        const result = validateStatusTransition("open", "closed");

        expect(result.error?.details.validTransitions).toContain("in_progress");
        expect(result.error?.details.validTransitions).toContain("escalated");
        expect(result.error?.details.validTransitions).not.toContain("closed");
      });
    });

    describe("transition completeness", () => {
      it("should have entries for all defined statuses", () => {
        const allStatuses: CaseStatus[] = [
          "open", "in_progress", "pending_info", "escalated",
          "resolved", "closed", "cancelled",
        ];

        for (const status of allStatuses) {
          expect(VALID_TRANSITIONS[status]).toBeDefined();
          expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
        }
      });

      it("should have terminal states with no outgoing transitions", () => {
        expect(VALID_TRANSITIONS.closed).toHaveLength(0);
        expect(VALID_TRANSITIONS.cancelled).toHaveLength(0);
      });

      it("should not allow any state to transition to open", () => {
        for (const [_status, targets] of Object.entries(VALID_TRANSITIONS)) {
          expect(targets).not.toContain("open");
        }
      });
    });
  });

  // ===========================================================================
  // Case Assignment Rules
  // ===========================================================================

  describe("Case Assignment", () => {
    it("should allow assigning open case", () => {
      const result = canAssignCase("open");
      expect(result.success).toBe(true);
    });

    it("should allow assigning in_progress case", () => {
      const result = canAssignCase("in_progress");
      expect(result.success).toBe(true);
    });

    it("should allow assigning escalated case", () => {
      const result = canAssignCase("escalated");
      expect(result.success).toBe(true);
    });

    it("should reject assigning closed case", () => {
      const result = canAssignCase("closed");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CASE_CLOSED");
    });

    it("should reject assigning cancelled case", () => {
      const result = canAssignCase("cancelled");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CASE_CLOSED");
    });
  });

  // ===========================================================================
  // Case Escalation Rules
  // ===========================================================================

  describe("Case Escalation", () => {
    it("should allow escalating open case", () => {
      const result = canEscalateCase("open");
      expect(result.success).toBe(true);
    });

    it("should allow escalating in_progress case", () => {
      const result = canEscalateCase("in_progress");
      expect(result.success).toBe(true);
    });

    it("should allow escalating pending_info case", () => {
      const result = canEscalateCase("pending_info");
      expect(result.success).toBe(true);
    });

    it("should reject escalating closed case", () => {
      const result = canEscalateCase("closed");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANNOT_ESCALATE");
    });

    it("should reject escalating cancelled case", () => {
      const result = canEscalateCase("cancelled");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANNOT_ESCALATE");
    });

    it("should reject escalating resolved case", () => {
      const result = canEscalateCase("resolved");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CANNOT_ESCALATE");
    });
  });

  // ===========================================================================
  // Resolution and Closing Rules
  // ===========================================================================

  describe("Resolution and Closing", () => {
    describe("resolveCase rules", () => {
      it("should allow resolving open case", () => {
        const result = canResolveCase("open");
        expect(result.success).toBe(true);
      });

      it("should allow resolving in_progress case", () => {
        const result = canResolveCase("in_progress");
        expect(result.success).toBe(true);
      });

      it("should allow resolving escalated case", () => {
        const result = canResolveCase("escalated");
        expect(result.success).toBe(true);
      });

      it("should reject resolving closed case", () => {
        const result = canResolveCase("closed");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_RESOLVE");
      });

      it("should reject resolving cancelled case", () => {
        const result = canResolveCase("cancelled");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_RESOLVE");
      });
    });

    describe("closeCase rules", () => {
      it("should allow closing resolved case", () => {
        const result = canCloseCase("resolved");
        expect(result.success).toBe(true);
      });

      it("should reject closing open case", () => {
        const result = canCloseCase("open");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_CLOSE");
        expect(result.error?.message).toBe("Case must be resolved before closing");
      });

      it("should reject closing in_progress case", () => {
        const result = canCloseCase("in_progress");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_CLOSE");
      });

      it("should reject closing escalated case", () => {
        const result = canCloseCase("escalated");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_CLOSE");
      });

      it("should reject closing cancelled case", () => {
        const result = canCloseCase("cancelled");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("CANNOT_CLOSE");
      });
    });
  });

  // ===========================================================================
  // Comment Rules
  // ===========================================================================

  describe("Comment Rules", () => {
    it("should allow comments on open case", () => {
      const result = canAddComment("open");
      expect(result.success).toBe(true);
    });

    it("should allow comments on in_progress case", () => {
      const result = canAddComment("in_progress");
      expect(result.success).toBe(true);
    });

    it("should allow comments on escalated case", () => {
      const result = canAddComment("escalated");
      expect(result.success).toBe(true);
    });

    it("should allow comments on resolved case", () => {
      const result = canAddComment("resolved");
      expect(result.success).toBe(true);
    });

    it("should reject comments on closed case", () => {
      const result = canAddComment("closed");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CASE_CLOSED");
    });

    it("should reject comments on cancelled case", () => {
      const result = canAddComment("cancelled");

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("CASE_CLOSED");
    });
  });
});
