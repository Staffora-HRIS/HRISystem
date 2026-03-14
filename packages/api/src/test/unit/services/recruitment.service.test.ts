/**
 * Recruitment Service Unit Tests
 *
 * Tests for Recruitment business logic including:
 * - Requisition status management
 * - Candidate creation validation (requisition exists, is open)
 * - Candidate stage advancement rules
 * - Special stage handling (hired, rejected events)
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/recruitment/service.ts)
// =============================================================================

import type { ServiceResult } from "../../../types/service-result";

type RequisitionStatus = "draft" | "open" | "filled" | "cancelled";
type CandidateStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";

interface Requisition {
  id: string;
  title?: string;
  status: RequisitionStatus;
}

interface Candidate {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  current_stage: CandidateStage;
  requisitionId?: string;
}

function getResourceOrNotFound<T>(resource: T | null, name: string): ServiceResult<T> {
  if (!resource) {
    return { success: false, error: { code: "NOT_FOUND", message: `${name} not found` } };
  }
  return { success: true, data: resource };
}

function validateCreateCandidate(requisition: Requisition | null): ServiceResult<null> {
  if (!requisition) {
    return { success: false, error: { code: "NOT_FOUND", message: "Requisition not found" } };
  }
  if (requisition.status !== "open") {
    return {
      success: false,
      error: { code: "REQUISITION_NOT_OPEN", message: "Requisition is not open for applications" },
    };
  }
  return { success: true };
}

function getOpenRequisitionStatus(currentStatus: RequisitionStatus): ServiceResult<RequisitionStatus> {
  if (currentStatus !== "draft") {
    return {
      success: false,
      error: { code: "INVALID_STATUS", message: "Can only open draft requisitions" },
    };
  }
  return { success: true, data: "open" };
}

function getCloseRequisitionStatus(_currentStatus: RequisitionStatus): ServiceResult<RequisitionStatus> {
  return { success: true, data: "filled" };
}

function getCancelRequisitionStatus(_currentStatus: RequisitionStatus): ServiceResult<RequisitionStatus> {
  return { success: true, data: "cancelled" };
}

function determineStageEvent(
  newStage: CandidateStage
): { eventType: string; needsDomainEvent: boolean } {
  if (newStage === "hired") {
    return { eventType: "recruitment.candidate.hired", needsDomainEvent: true };
  }
  if (newStage === "rejected") {
    return { eventType: "recruitment.candidate.rejected", needsDomainEvent: true };
  }
  return { eventType: "", needsDomainEvent: false };
}

// =============================================================================
// Tests
// =============================================================================

describe("RecruitmentService", () => {
  // ===========================================================================
  // Requisition Operations
  // ===========================================================================

  describe("Requisition Operations", () => {
    describe("getRequisition", () => {
      it("should return requisition when found", () => {
        const req: Requisition = { id: "r1", title: "Senior Engineer", status: "open" };
        const result = getResourceOrNotFound(req, "Requisition");

        expect(result.success).toBe(true);
        expect(result.data?.title).toBe("Senior Engineer");
      });

      it("should return null/NOT_FOUND for non-existent requisition", () => {
        const result = getResourceOrNotFound(null, "Requisition");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("openRequisition", () => {
      it("should open a draft requisition", () => {
        const result = getOpenRequisitionStatus("draft");

        expect(result.success).toBe(true);
        expect(result.data).toBe("open");
      });

      it("should reject opening non-draft requisition", () => {
        const result = getOpenRequisitionStatus("open");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });
    });

    describe("closeRequisition", () => {
      it("should return filled status", () => {
        const result = getCloseRequisitionStatus("open");

        expect(result.success).toBe(true);
        expect(result.data).toBe("filled");
      });
    });

    describe("cancelRequisition", () => {
      it("should return cancelled status", () => {
        const result = getCancelRequisitionStatus("open");

        expect(result.success).toBe(true);
        expect(result.data).toBe("cancelled");
      });
    });
  });

  // ===========================================================================
  // Candidate Operations
  // ===========================================================================

  describe("Candidate Operations", () => {
    describe("createCandidate", () => {
      it("should allow creating candidate for open requisition", () => {
        const req: Requisition = { id: "r1", status: "open" };
        const result = validateCreateCandidate(req);

        expect(result.success).toBe(true);
      });

      it("should reject candidate for non-existent requisition", () => {
        const result = validateCreateCandidate(null);

        expect(result.success).toBe(false);
        expect(result.error?.message).toBe("Requisition not found");
      });

      it("should reject candidate for filled requisition", () => {
        const req: Requisition = { id: "r1", status: "filled" };
        const result = validateCreateCandidate(req);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("REQUISITION_NOT_OPEN");
        expect(result.error?.message).toBe("Requisition is not open for applications");
      });

      it("should reject candidate for draft requisition", () => {
        const req: Requisition = { id: "r1", status: "draft" };
        const result = validateCreateCandidate(req);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("REQUISITION_NOT_OPEN");
      });

      it("should reject candidate for cancelled requisition", () => {
        const req: Requisition = { id: "r1", status: "cancelled" };
        const result = validateCreateCandidate(req);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("REQUISITION_NOT_OPEN");
      });
    });

    describe("getCandidate", () => {
      it("should return candidate when found", () => {
        const candidate: Candidate = {
          id: "c1",
          firstName: "John",
          lastName: "Doe",
          current_stage: "screening",
        };
        const result = getResourceOrNotFound(candidate, "Candidate");

        expect(result.success).toBe(true);
        expect(result.data?.firstName).toBe("John");
      });

      it("should return NOT_FOUND for non-existent candidate", () => {
        const result = getResourceOrNotFound(null, "Candidate");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("advanceCandidateStage - event determination", () => {
      it("should emit hired event when advancing to hired stage", () => {
        const event = determineStageEvent("hired");

        expect(event.needsDomainEvent).toBe(true);
        expect(event.eventType).toBe("recruitment.candidate.hired");
      });

      it("should emit rejected event when advancing to rejected stage", () => {
        const event = determineStageEvent("rejected");

        expect(event.needsDomainEvent).toBe(true);
        expect(event.eventType).toBe("recruitment.candidate.rejected");
      });

      it("should not emit event for normal stage advancement", () => {
        const normalStages: CandidateStage[] = ["applied", "screening", "interview", "offer"];

        for (const stage of normalStages) {
          const event = determineStageEvent(stage);
          expect(event.needsDomainEvent).toBe(false);
        }
      });
    });
  });

  // ===========================================================================
  // Status Lifecycle Validation
  // ===========================================================================

  describe("Requisition Status Lifecycle", () => {
    it("should follow draft -> open -> filled lifecycle", () => {
      // Start as draft, open it
      const openResult = getOpenRequisitionStatus("draft");
      expect(openResult.success).toBe(true);
      expect(openResult.data).toBe("open");

      // Close (fill) it
      const closeResult = getCloseRequisitionStatus("open");
      expect(closeResult.success).toBe(true);
      expect(closeResult.data).toBe("filled");
    });

    it("should allow draft -> open -> cancelled lifecycle", () => {
      const openResult = getOpenRequisitionStatus("draft");
      expect(openResult.success).toBe(true);

      const cancelResult = getCancelRequisitionStatus("open");
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.data).toBe("cancelled");
    });

    it("should only accept candidates for open requisitions", () => {
      const statuses: RequisitionStatus[] = ["draft", "open", "filled", "cancelled"];
      const expectedResults = [false, true, false, false];

      for (let i = 0; i < statuses.length; i++) {
        const req: Requisition = { id: "r1", status: statuses[i] };
        const result = validateCreateCandidate(req);
        expect(result.success).toBe(expectedResults[i]);
      }
    });
  });

  // ===========================================================================
  // Candidate Stage Events
  // ===========================================================================

  describe("Candidate Stage Events", () => {
    it("should only trigger domain events for terminal stages", () => {
      const allStages: CandidateStage[] = ["applied", "screening", "interview", "offer", "hired", "rejected"];
      const terminalStages = new Set(["hired", "rejected"]);

      for (const stage of allStages) {
        const event = determineStageEvent(stage);
        expect(event.needsDomainEvent).toBe(terminalStages.has(stage));
      }
    });

    it("should use correct event types for terminal stages", () => {
      const hiredEvent = determineStageEvent("hired");
      expect(hiredEvent.eventType).toBe("recruitment.candidate.hired");

      const rejectedEvent = determineStageEvent("rejected");
      expect(rejectedEvent.eventType).toBe("recruitment.candidate.rejected");
    });
  });
});
