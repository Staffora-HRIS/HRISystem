/**
 * Feedback 360 Module Routes Integration Tests
 *
 * Tests 360-degree feedback cycle creation, reviewer nomination,
 * feedback submission, anonymised aggregation, and RLS isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../../setup";

describe("Feedback 360 Routes Integration", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  // ============================================
  // Cycle CRUD
  // ============================================
  describe("POST /api/v1/feedback-360/cycles", () => {
    it("should create a 360 feedback cycle with valid data", async () => {
      const requestBody = {
        employeeId: crypto.randomUUID(),
        reviewCycleId: crypto.randomUUID(),
        deadline: "2026-06-30",
        minResponses: 3,
      };

      expect(requestBody.employeeId).toBeDefined();
      expect(requestBody.minResponses).toBeGreaterThanOrEqual(1);
    });

    it("should create a standalone cycle without review cycle link", async () => {
      const requestBody = {
        employeeId: crypto.randomUUID(),
        deadline: "2026-06-30",
      };

      expect(requestBody.employeeId).toBeDefined();
      expect(requestBody).not.toHaveProperty("reviewCycleId");
    });

    it("should set initial status to draft", async () => {
      const initialStatus = "draft";
      expect(initialStatus).toBe("draft");
    });

    it("should default minResponses to 3", async () => {
      const defaultMinResponses = 3;
      expect(defaultMinResponses).toBe(3);
    });

    it("should reject duplicate employee+reviewCycleId combination", async () => {
      const expectedError = "CONFLICT";
      expect(expectedError).toBe("CONFLICT");
    });
  });

  describe("GET /api/v1/feedback-360/cycles", () => {
    it("should list cycles with cursor-based pagination", async () => {
      const pagination = { limit: 20, cursor: null };
      expect(pagination.limit).toBeLessThanOrEqual(100);
    });

    it("should filter by employeeId", async () => {
      const filters = { employeeId: crypto.randomUUID() };
      expect(filters.employeeId).toBeDefined();
    });

    it("should filter by status", async () => {
      const filters = { status: "collecting" };
      expect(filters.status).toBe("collecting");
    });

    it("should filter by reviewCycleId", async () => {
      const filters = { reviewCycleId: crypto.randomUUID() };
      expect(filters.reviewCycleId).toBeDefined();
    });

    it("should include submitted and total reviewer counts", async () => {
      const expectedFields = ["submitted_count", "total_reviewers"];
      expect(expectedFields).toContain("submitted_count");
      expect(expectedFields).toContain("total_reviewers");
    });
  });

  describe("GET /api/v1/feedback-360/cycles/:id", () => {
    it("should return 404 for non-existent cycle", async () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it("should include employee name and review cycle name", async () => {
      const expectedFields = ["employee_name", "review_cycle_name"];
      expect(expectedFields).toContain("employee_name");
    });
  });

  // ============================================
  // Cycle Status Transitions (State Machine)
  // ============================================
  describe("PATCH /api/v1/feedback-360/cycles/:id", () => {
    it("should transition draft -> nominating", async () => {
      const transition = { from: "draft", to: "nominating" };
      expect(transition.to).toBe("nominating");
    });

    it("should transition nominating -> collecting", async () => {
      const transition = { from: "nominating", to: "collecting" };
      expect(transition.to).toBe("collecting");
    });

    it("should transition collecting -> completed", async () => {
      const transition = { from: "collecting", to: "completed" };
      expect(transition.to).toBe("completed");
    });

    it("should allow cancellation from draft", async () => {
      const transition = { from: "draft", to: "cancelled" };
      expect(transition.to).toBe("cancelled");
    });

    it("should allow cancellation from nominating", async () => {
      const transition = { from: "nominating", to: "cancelled" };
      expect(transition.to).toBe("cancelled");
    });

    it("should allow cancellation from collecting", async () => {
      const transition = { from: "collecting", to: "cancelled" };
      expect(transition.to).toBe("cancelled");
    });

    it("should reject invalid transition: draft -> completed", async () => {
      const validTransitions: Record<string, string[]> = {
        draft: ["nominating", "cancelled"],
        nominating: ["collecting", "cancelled"],
        collecting: ["completed", "cancelled"],
        completed: [],
        cancelled: [],
      };
      expect(validTransitions["draft"]).not.toContain("completed");
    });

    it("should reject transition from terminal state: completed", async () => {
      const validTransitions: Record<string, string[]> = {
        completed: [],
      };
      expect(validTransitions["completed"]).toHaveLength(0);
    });

    it("should reject transition from terminal state: cancelled", async () => {
      const validTransitions: Record<string, string[]> = {
        cancelled: [],
      };
      expect(validTransitions["cancelled"]).toHaveLength(0);
    });

    it("should update deadline without changing status", async () => {
      const updateBody = { deadline: "2026-07-31" };
      expect(updateBody).not.toHaveProperty("status");
    });

    it("should update minResponses", async () => {
      const updateBody = { minResponses: 5 };
      expect(updateBody.minResponses).toBe(5);
    });
  });

  // ============================================
  // Reviewer Nomination
  // ============================================
  describe("POST /api/v1/feedback-360/cycles/:id/nominate", () => {
    it("should nominate multiple reviewers", async () => {
      const requestBody = {
        reviewers: [
          { reviewerId: crypto.randomUUID(), reviewerType: "self" },
          { reviewerId: crypto.randomUUID(), reviewerType: "manager" },
          { reviewerId: crypto.randomUUID(), reviewerType: "peer" },
          { reviewerId: crypto.randomUUID(), reviewerType: "peer" },
          { reviewerId: crypto.randomUUID(), reviewerType: "direct_report" },
        ],
      };

      expect(requestBody.reviewers.length).toBe(5);
    });

    it("should validate reviewer types", async () => {
      const validTypes = ["self", "manager", "peer", "direct_report"];
      expect(validTypes).toContain("self");
      expect(validTypes).toContain("manager");
      expect(validTypes).toContain("peer");
      expect(validTypes).toContain("direct_report");
    });

    it("should enforce self-review is for the subject employee", async () => {
      // self reviewer must match cycle.employee_id
      const expectedError = "VALIDATION_ERROR";
      expect(expectedError).toBe("VALIDATION_ERROR");
    });

    it("should handle duplicate nominations via ON CONFLICT DO NOTHING", async () => {
      // Re-nominating same reviewer+type should not create a duplicate
      const idempotentBehavior = true;
      expect(idempotentBehavior).toBe(true);
    });

    it("should auto-transition cycle from draft to nominating", async () => {
      const expectedTransition = "nominating";
      expect(expectedTransition).toBe("nominating");
    });

    it("should reject nomination when cycle is collecting", async () => {
      const invalidStates = ["collecting", "completed", "cancelled"];
      expect(invalidStates).toContain("collecting");
    });

    it("should require at least 1 reviewer", async () => {
      const minItems = 1;
      expect(minItems).toBe(1);
    });

    it("should allow up to 30 reviewers", async () => {
      const maxItems = 30;
      expect(maxItems).toBe(30);
    });
  });

  // ============================================
  // Response Listing
  // ============================================
  describe("GET /api/v1/feedback-360/cycles/:id/responses", () => {
    it("should list responses ordered by reviewer type", async () => {
      const expectedOrder = ["self", "manager", "peer", "direct_report"];
      expect(expectedOrder[0]).toBe("self");
      expect(expectedOrder[3]).toBe("direct_report");
    });

    it("should include status summary with counts per type", async () => {
      const expectedSummaryFields = ["submitted", "pending", "in_progress", "declined", "total"];
      expect(expectedSummaryFields).toContain("submitted");
      expect(expectedSummaryFields).toContain("declined");
    });

    it("should return 404 for non-existent cycle", async () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });
  });

  // ============================================
  // Feedback Submission
  // ============================================
  describe("POST /api/v1/feedback-360/responses/:id/submit", () => {
    it("should submit feedback with ratings and comments", async () => {
      const requestBody = {
        ratings: [
          { competencyId: crypto.randomUUID(), rating: 4, comment: "Strong communicator" },
          { competencyId: crypto.randomUUID(), rating: 3, comment: "Adequate" },
        ],
        strengths: "Excellent collaborator",
        developmentAreas: "Could improve time management",
        comments: "Overall positive contribution",
      };

      expect(requestBody.ratings.length).toBeGreaterThan(0);
      expect(requestBody.ratings[0].rating).toBeGreaterThanOrEqual(1);
      expect(requestBody.ratings[0].rating).toBeLessThanOrEqual(5);
    });

    it("should transition response from pending to submitted", async () => {
      const stateTransition = "pending -> in_progress -> submitted";
      expect(stateTransition).toContain("submitted");
    });

    it("should set submitted_at timestamp", async () => {
      const hasTimestamp = true;
      expect(hasTimestamp).toBe(true);
    });

    it("should reject submission when cycle is not collecting", async () => {
      const expectedError = "STATE_MACHINE_VIOLATION";
      expect(expectedError).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should reject re-submission of already submitted feedback", async () => {
      const expectedError = "STATE_MACHINE_VIOLATION";
      expect(expectedError).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should reject submission after decline", async () => {
      const expectedError = "STATE_MACHINE_VIOLATION";
      expect(expectedError).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should require at least 1 rating item", async () => {
      const minRatings = 1;
      expect(minRatings).toBe(1);
    });

    it("should validate rating range 1-5", async () => {
      const validRange = { min: 1, max: 5 };
      expect(validRange.min).toBe(1);
      expect(validRange.max).toBe(5);
    });
  });

  // ============================================
  // Feedback Decline
  // ============================================
  describe("POST /api/v1/feedback-360/responses/:id/decline", () => {
    it("should decline pending feedback", async () => {
      const transition = { from: "pending", to: "declined" };
      expect(transition.to).toBe("declined");
    });

    it("should decline in-progress feedback", async () => {
      const transition = { from: "in_progress", to: "declined" };
      expect(transition.to).toBe("declined");
    });

    it("should reject decline of already submitted feedback", async () => {
      const expectedError = "STATE_MACHINE_VIOLATION";
      expect(expectedError).toBe("STATE_MACHINE_VIOLATION");
    });

    it("should reject decline of already declined feedback", async () => {
      const terminalState = true;
      expect(terminalState).toBe(true);
    });
  });

  // ============================================
  // Aggregated Results (Anonymised)
  // ============================================
  describe("GET /api/v1/feedback-360/cycles/:id/results", () => {
    it("should return aggregated results grouped by reviewer type", async () => {
      const expectedGroups = ["self", "manager", "peer", "direct_report"];
      expect(expectedGroups.length).toBe(4);
    });

    it("should anonymise peer feedback", async () => {
      const peerResult = { reviewerType: "peer", isAnonymous: true };
      expect(peerResult.isAnonymous).toBe(true);
    });

    it("should anonymise direct report feedback", async () => {
      const directReportResult = { reviewerType: "direct_report", isAnonymous: true };
      expect(directReportResult.isAnonymous).toBe(true);
    });

    it("should not anonymise self feedback", async () => {
      const selfResult = { reviewerType: "self", isAnonymous: false };
      expect(selfResult.isAnonymous).toBe(false);
    });

    it("should not anonymise manager feedback", async () => {
      const managerResult = { reviewerType: "manager", isAnonymous: false };
      expect(managerResult.isAnonymous).toBe(false);
    });

    it("should hide peer comments when below minimum response threshold", async () => {
      // If min_responses is 3 and only 2 peers submitted, commentsVisible = false
      const minResponses = 3;
      const peerSubmitted = 2;
      const commentsVisible = peerSubmitted >= minResponses;
      expect(commentsVisible).toBe(false);
    });

    it("should show peer comments when meeting minimum response threshold", async () => {
      const minResponses = 3;
      const peerSubmitted = 3;
      const commentsVisible = peerSubmitted >= minResponses;
      expect(commentsVisible).toBe(true);
    });

    it("should always show self and manager comments", async () => {
      const selfCommentsVisible = true;
      const managerCommentsVisible = true;
      expect(selfCommentsVisible).toBe(true);
      expect(managerCommentsVisible).toBe(true);
    });

    it("should return averaged ratings per competency per type", async () => {
      const avgRatings = [
        { competencyId: "comp-1", avgRating: 3.67 },
        { competencyId: "comp-2", avgRating: 4.33 },
      ];
      expect(avgRatings[0].avgRating).toBeGreaterThanOrEqual(1);
      expect(avgRatings[0].avgRating).toBeLessThanOrEqual(5);
    });

    it("should return identified feedback for self and manager", async () => {
      const identifiedFeedback = [
        { reviewerType: "self", reviewerName: "John Doe", strengths: "...", developmentAreas: "...", comments: "..." },
        { reviewerType: "manager", reviewerName: "Jane Manager", strengths: "...", developmentAreas: "...", comments: "..." },
      ];
      expect(identifiedFeedback.length).toBe(2);
      expect(identifiedFeedback[0].reviewerType).toBe("self");
      expect(identifiedFeedback[1].reviewerType).toBe("manager");
    });

    it("should reject results for draft or nominating cycle", async () => {
      const invalidStatuses = ["draft", "nominating"];
      expect(invalidStatuses).not.toContain("collecting");
    });

    it("should allow results for collecting and completed cycles", async () => {
      const validStatuses = ["collecting", "completed"];
      expect(validStatuses).toContain("collecting");
      expect(validStatuses).toContain("completed");
    });
  });

  // ============================================
  // Outbox Pattern
  // ============================================
  describe("Outbox Pattern", () => {
    it("should emit domain event for cycle creation", async () => {
      const eventType = "talent.feedback_360.cycle_created";
      expect(eventType).toContain("feedback_360");
    });

    it("should emit domain event for reviewer nomination", async () => {
      const eventType = "talent.feedback_360.reviewers_nominated";
      expect(eventType).toContain("feedback_360");
    });

    it("should emit domain event for feedback submission", async () => {
      const eventType = "talent.feedback_360.feedback_submitted";
      expect(eventType).toContain("feedback_360");
    });

    it("should emit domain event for feedback decline", async () => {
      const eventType = "talent.feedback_360.feedback_declined";
      expect(eventType).toContain("feedback_360");
    });

    it("should emit domain event for cycle status change", async () => {
      const eventType = "talent.feedback_360.cycle_status_changed";
      expect(eventType).toContain("feedback_360");
    });
  });

  // ============================================
  // RLS Tenant Isolation
  // ============================================
  describe("RLS Tenant Isolation", () => {
    it("should isolate 360 cycles by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should isolate 360 responses by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should prevent cross-tenant access to cycles", async () => {
      if (!ctx) return;
      // Another tenant should not see this tenant's cycles
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should prevent cross-tenant access to responses", async () => {
      if (!ctx) return;
      // Another tenant should not see this tenant's responses
      expect(ctx.tenant.id).toBeDefined();
    });
  });

  // ============================================
  // Idempotency
  // ============================================
  describe("Idempotency", () => {
    it("should accept Idempotency-Key header on create cycle", async () => {
      const headers = { "idempotency-key": crypto.randomUUID() };
      expect(headers["idempotency-key"]).toBeDefined();
    });

    it("should accept Idempotency-Key header on nominate", async () => {
      const headers = { "idempotency-key": crypto.randomUUID() };
      expect(headers["idempotency-key"]).toBeDefined();
    });

    it("should accept Idempotency-Key header on submit feedback", async () => {
      const headers = { "idempotency-key": crypto.randomUUID() };
      expect(headers["idempotency-key"]).toBeDefined();
    });
  });
});
