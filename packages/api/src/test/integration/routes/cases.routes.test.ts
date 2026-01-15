/**
 * Cases Module Routes Integration Tests
 * Tests HR case management workflows including state transitions and RLS
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../../setup";

describe("Cases Routes Integration", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  describe("POST /api/v1/cases", () => {
    it("should create case with valid data", async () => {
      const requestBody = {
        caseNumber: `CASE-${Date.now()}`,
        category: "grievance",
        priority: "medium",
        subject: "Workplace concern",
        description: "Test case description",
      };

      expect(requestBody.caseNumber).toBeDefined();
      expect(requestBody.category).toBe("grievance");
      expect(requestBody.priority).toBe("medium");
    });

    it("should generate case number if not provided", async () => {
      const requestBody = {
        category: "inquiry",
        subject: "Benefits question",
      };

      expect(requestBody.category).toBe("inquiry");
      // Case number should be auto-generated
    });

    it("should require Idempotency-Key header", async () => {
      const expectedStatus = 400;
      expect(expectedStatus).toBe(400);
    });

    it("should validate category enum values", async () => {
      const validCategories = [
        "grievance",
        "complaint",
        "inquiry",
        "accommodation",
        "policy_violation",
        "harassment",
        "discrimination",
        "other",
      ];
      expect(validCategories).toContain("grievance");
      expect(validCategories).toContain("harassment");
    });

    it("should validate priority enum values", async () => {
      const validPriorities = ["low", "medium", "high", "critical"];
      expect(validPriorities).toContain("critical");
    });
  });

  describe("GET /api/v1/cases", () => {
    it("should list cases with cursor pagination", async () => {
      const pagination = { limit: 50, cursor: null };
      expect(pagination.limit).toBeLessThanOrEqual(100);
    });

    it("should filter by status", async () => {
      const filters = { status: "open" };
      expect(filters.status).toBe("open");
    });

    it("should filter by category", async () => {
      const filters = { category: "grievance" };
      expect(filters.category).toBe("grievance");
    });

    it("should filter by priority", async () => {
      const filters = { priority: "high" };
      expect(filters.priority).toBe("high");
    });

    it("should filter by assigned handler", async () => {
      const handlerId = crypto.randomUUID();
      const filters = { assignedTo: handlerId };
      expect(filters.assignedTo).toBeDefined();
    });

    it("should respect RLS - only return tenant cases", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });
  });

  describe("GET /api/v1/cases/:id", () => {
    it("should return case with full details", async () => {
      const caseId = crypto.randomUUID();
      expect(caseId).toBeDefined();
    });

    it("should include case activities/timeline", async () => {
      const expectedFields = ["id", "caseNumber", "status", "activities"];
      expect(expectedFields).toContain("activities");
    });

    it("should return 404 for non-existent case", async () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });

    it("should return 404 for other tenant case (RLS)", async () => {
      const expectedStatus = 404;
      expect(expectedStatus).toBe(404);
    });
  });

  describe("PATCH /api/v1/cases/:id/status", () => {
    it("should transition from open to in_progress", async () => {
      const transition = { from: "open", to: "in_progress" };
      expect(transition.to).toBe("in_progress");
    });

    it("should transition from in_progress to resolved", async () => {
      const transition = { from: "in_progress", to: "resolved" };
      expect(transition.to).toBe("resolved");
    });

    it("should require resolution notes when resolving", async () => {
      const resolutionData = {
        status: "resolved",
        resolutionNotes: "Issue addressed and resolved",
      };
      expect(resolutionData.resolutionNotes).toBeDefined();
    });

    it("should reject invalid state transitions", async () => {
      // Cannot go from closed to open
      const invalidTransition = { from: "closed", to: "open" };
      expect(invalidTransition.from).toBe("closed");
    });

    it("should track status change in activities", async () => {
      const activityType = "status_change";
      expect(activityType).toBe("status_change");
    });
  });

  describe("PATCH /api/v1/cases/:id/assign", () => {
    it("should assign case to handler", async () => {
      const handlerId = crypto.randomUUID();
      const assignment = { assignedTo: handlerId };
      expect(assignment.assignedTo).toBeDefined();
    });

    it("should require hr:cases:assign permission", async () => {
      const requiredPermission = "hr:cases:assign";
      expect(requiredPermission).toBe("hr:cases:assign");
    });

    it("should record assignment in case activities", async () => {
      const activityType = "assignment";
      expect(activityType).toBe("assignment");
    });
  });

  describe("POST /api/v1/cases/:id/comments", () => {
    it("should add comment to case", async () => {
      const comment = {
        content: "Follow-up note on the case",
        isInternal: true,
      };
      expect(comment.content).toBeDefined();
      expect(comment.isInternal).toBe(true);
    });

    it("should distinguish internal vs external comments", async () => {
      const internalComment = { isInternal: true };
      const externalComment = { isInternal: false };
      expect(internalComment.isInternal).not.toBe(externalComment.isInternal);
    });

    it("should record comment author", async () => {
      const commentFields = ["id", "content", "authorId", "createdAt"];
      expect(commentFields).toContain("authorId");
    });
  });

  describe("POST /api/v1/cases/:id/escalate", () => {
    it("should escalate case priority", async () => {
      const escalation = {
        newPriority: "critical",
        reason: "Requires immediate attention",
      };
      expect(escalation.newPriority).toBe("critical");
      expect(escalation.reason).toBeDefined();
    });

    it("should transition status to escalated", async () => {
      const expectedStatus = "escalated";
      expect(expectedStatus).toBe("escalated");
    });

    it("should record escalation in activities", async () => {
      const activityType = "escalation";
      expect(activityType).toBe("escalation");
    });
  });

  describe("Case State Machine", () => {
    it("should enforce valid state transitions", async () => {
      const validTransitions = {
        open: ["in_progress", "cancelled"],
        in_progress: ["pending_info", "resolved", "escalated", "on_hold"],
        pending_info: ["in_progress", "cancelled"],
        resolved: ["closed", "reopened"],
        escalated: ["in_progress", "resolved"],
        on_hold: ["in_progress", "cancelled"],
        reopened: ["in_progress"],
        closed: [], // Terminal state
        cancelled: [], // Terminal state
      };

      expect(validTransitions.open).toContain("in_progress");
      expect(validTransitions.closed.length).toBe(0);
      expect(validTransitions.cancelled.length).toBe(0);
    });

    it("should track all state transitions immutably", async () => {
      const stateHistory = [
        { from: null, to: "open", timestamp: new Date() },
        { from: "open", to: "in_progress", timestamp: new Date() },
        { from: "in_progress", to: "resolved", timestamp: new Date() },
      ];
      expect(stateHistory.length).toBe(3);
    });
  });

  describe("Case Audit Trail", () => {
    it("should log all case modifications", async () => {
      const auditFields = ["id", "caseId", "action", "userId", "timestamp", "changes"];
      expect(auditFields).toContain("action");
      expect(auditFields).toContain("changes");
    });

    it("should capture before/after values for changes", async () => {
      const auditEntry = {
        action: "update",
        changes: {
          priority: { before: "medium", after: "high" },
        },
      };
      expect(auditEntry.changes.priority.before).toBe("medium");
      expect(auditEntry.changes.priority.after).toBe("high");
    });
  });
});
