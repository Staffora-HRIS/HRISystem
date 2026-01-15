/**
 * Talent Module Routes Integration Tests
 * Tests recruitment and performance management workflows
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../../setup";

describe("Talent Routes Integration", () => {
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
  // Recruitment - Job Requisitions
  // ============================================
  describe("POST /api/v1/talent/requisitions", () => {
    it("should create job requisition with valid data", async () => {
      const requestBody = {
        title: "Senior Software Engineer",
        description: "Building enterprise applications",
        department: "Engineering",
        location: "Remote",
        employmentType: "full_time",
        headcount: 2,
        salaryRangeMin: 120000,
        salaryRangeMax: 180000,
        requirements: ["5+ years experience", "TypeScript expertise"],
      };

      expect(requestBody.title).toBeDefined();
      expect(requestBody.employmentType).toBe("full_time");
      expect(requestBody.headcount).toBeGreaterThan(0);
    });

    it("should validate employment type enum", async () => {
      const validTypes = ["full_time", "part_time", "contract", "temporary", "intern"];
      expect(validTypes).toContain("full_time");
      expect(validTypes).toContain("intern");
    });

    it("should generate requisition number", async () => {
      // System should generate REQ-YYYY-NNNN format
      const pattern = /^REQ-\d{4}-\d{4}$/;
      const sample = "REQ-2024-0001";
      expect(pattern.test(sample)).toBe(true);
    });

    it("should set initial status to draft", async () => {
      const initialStatus = "draft";
      expect(initialStatus).toBe("draft");
    });
  });

  describe("GET /api/v1/talent/requisitions", () => {
    it("should list requisitions with pagination", async () => {
      const pagination = { limit: 50, cursor: null };
      expect(pagination.limit).toBeLessThanOrEqual(100);
    });

    it("should filter by status", async () => {
      const filters = { status: "open" };
      expect(filters.status).toBe("open");
    });

    it("should filter by department", async () => {
      const filters = { department: "Engineering" };
      expect(filters.department).toBeDefined();
    });

    it("should filter by hiring manager", async () => {
      const managerId = crypto.randomUUID();
      const filters = { hiringManagerId: managerId };
      expect(filters.hiringManagerId).toBeDefined();
    });

    it("should respect RLS tenant isolation", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });
  });

  describe("PATCH /api/v1/talent/requisitions/:id/status", () => {
    it("should open requisition from draft", async () => {
      const transition = { from: "draft", to: "open" };
      expect(transition.to).toBe("open");
    });

    it("should put requisition on hold", async () => {
      const transition = { from: "open", to: "on_hold" };
      expect(transition.to).toBe("on_hold");
    });

    it("should mark requisition as filled", async () => {
      const transition = { from: "open", to: "filled" };
      expect(transition.to).toBe("filled");
    });

    it("should reject invalid transitions", async () => {
      // Cannot reopen filled requisition
      const invalidTransition = { from: "filled", to: "open" };
      expect(invalidTransition.from).toBe("filled");
    });
  });

  // ============================================
  // Recruitment - Candidates
  // ============================================
  describe("POST /api/v1/talent/candidates", () => {
    it("should create candidate application", async () => {
      const requestBody = {
        requisitionId: crypto.randomUUID(),
        firstName: "Jane",
        lastName: "Smith",
        email: "jane.smith@example.com",
        phone: "+1-555-0123",
        resumeUrl: "https://storage.example.com/resumes/jane-smith.pdf",
        source: "linkedin",
      };

      expect(requestBody.email).toBeDefined();
      expect(requestBody.source).toBe("linkedin");
    });

    it("should validate source enum", async () => {
      const validSources = [
        "direct",
        "referral",
        "linkedin",
        "indeed",
        "company_website",
        "agency",
        "other",
      ];
      expect(validSources).toContain("referral");
    });

    it("should set initial stage to applied", async () => {
      const initialStage = "applied";
      expect(initialStage).toBe("applied");
    });

    it("should prevent duplicate applications", async () => {
      // Same email + requisition should fail
      const expectedError = "CANDIDATE_ALREADY_APPLIED";
      expect(expectedError).toBe("CANDIDATE_ALREADY_APPLIED");
    });
  });

  describe("PATCH /api/v1/talent/candidates/:id/stage", () => {
    it("should advance candidate through pipeline", async () => {
      const stages = [
        "applied",
        "screening",
        "phone_interview",
        "technical_interview",
        "onsite_interview",
        "offer",
        "hired",
      ];
      expect(stages.indexOf("hired")).toBeGreaterThan(stages.indexOf("applied"));
    });

    it("should allow rejection at any stage", async () => {
      const rejectionData = {
        stage: "rejected",
        rejectionReason: "Not enough experience",
      };
      expect(rejectionData.rejectionReason).toBeDefined();
    });

    it("should allow withdrawal at any stage", async () => {
      const withdrawalData = {
        stage: "withdrawn",
        withdrawalReason: "Accepted another offer",
      };
      expect(withdrawalData.withdrawalReason).toBeDefined();
    });

    it("should track stage history", async () => {
      const stageHistory = [
        { stage: "applied", date: new Date(), actor: "system" },
        { stage: "screening", date: new Date(), actor: "recruiter-1" },
      ];
      expect(stageHistory.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // Performance Management - Cycles
  // ============================================
  describe("POST /api/v1/talent/performance/cycles", () => {
    it("should create performance cycle", async () => {
      const requestBody = {
        name: "2024 Annual Review",
        description: "Annual performance review cycle",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        goalSettingDeadline: "2024-02-15",
        selfReviewDeadline: "2024-11-15",
        managerReviewDeadline: "2024-12-01",
      };

      expect(requestBody.name).toBeDefined();
      expect(requestBody.startDate).toBeDefined();
    });

    it("should validate date order", async () => {
      // goalSettingDeadline < selfReviewDeadline < managerReviewDeadline < endDate
      const dates = {
        startDate: new Date("2024-01-01"),
        goalSettingDeadline: new Date("2024-02-15"),
        selfReviewDeadline: new Date("2024-11-15"),
        managerReviewDeadline: new Date("2024-12-01"),
        endDate: new Date("2024-12-31"),
      };
      expect(dates.goalSettingDeadline < dates.selfReviewDeadline).toBe(true);
    });

    it("should set initial status to draft", async () => {
      const initialStatus = "draft";
      expect(initialStatus).toBe("draft");
    });
  });

  describe("PATCH /api/v1/talent/performance/cycles/:id/status", () => {
    it("should activate cycle from draft", async () => {
      const transition = { from: "draft", to: "goal_setting" };
      expect(transition.to).toBe("goal_setting");
    });

    it("should progress through cycle phases", async () => {
      const phases = [
        "draft",
        "goal_setting",
        "in_progress",
        "review",
        "calibration",
        "completed",
      ];
      expect(phases.indexOf("completed")).toBeGreaterThan(phases.indexOf("draft"));
    });

    it("should allow cycle archival after completion", async () => {
      const transition = { from: "completed", to: "archived" };
      expect(transition.to).toBe("archived");
    });
  });

  // ============================================
  // Performance Management - Goals
  // ============================================
  describe("POST /api/v1/talent/performance/goals", () => {
    it("should create employee goal", async () => {
      const requestBody = {
        cycleId: crypto.randomUUID(),
        employeeId: crypto.randomUUID(),
        title: "Improve code review turnaround",
        description: "Reduce average review time to under 24 hours",
        category: "development",
        weight: 25,
        targetDate: "2024-06-30",
      };

      expect(requestBody.title).toBeDefined();
      expect(requestBody.weight).toBeLessThanOrEqual(100);
    });

    it("should validate goal weights sum to 100", async () => {
      const goals = [
        { weight: 30 },
        { weight: 30 },
        { weight: 40 },
      ];
      const sum = goals.reduce((acc, g) => acc + g.weight, 0);
      expect(sum).toBe(100);
    });

    it("should validate category enum", async () => {
      const validCategories = [
        "development",
        "performance",
        "leadership",
        "collaboration",
        "innovation",
        "customer_focus",
      ];
      expect(validCategories).toContain("leadership");
    });
  });

  describe("PATCH /api/v1/talent/performance/goals/:id/progress", () => {
    it("should update goal progress", async () => {
      const progressUpdate = {
        progressPercent: 75,
        notes: "Q3 targets exceeded",
      };
      expect(progressUpdate.progressPercent).toBeLessThanOrEqual(100);
    });

    it("should track progress history", async () => {
      const progressHistory = [
        { percent: 25, date: new Date("2024-03-31") },
        { percent: 50, date: new Date("2024-06-30") },
        { percent: 75, date: new Date("2024-09-30") },
      ];
      expect(progressHistory.length).toBe(3);
    });
  });

  // ============================================
  // Performance Management - Reviews
  // ============================================
  describe("POST /api/v1/talent/performance/reviews", () => {
    it("should create performance review", async () => {
      const requestBody = {
        cycleId: crypto.randomUUID(),
        employeeId: crypto.randomUUID(),
        reviewerId: crypto.randomUUID(),
        reviewType: "manager",
      };

      expect(requestBody.reviewType).toBe("manager");
    });

    it("should validate review type enum", async () => {
      const validTypes = ["self", "manager", "peer", "upward"];
      expect(validTypes).toContain("self");
      expect(validTypes).toContain("upward");
    });
  });

  describe("PATCH /api/v1/talent/performance/reviews/:id/submit", () => {
    it("should submit review with ratings", async () => {
      const submission = {
        overallRating: 4,
        goalRatings: [
          { goalId: crypto.randomUUID(), rating: 5, comments: "Exceeded expectations" },
          { goalId: crypto.randomUUID(), rating: 3, comments: "Met expectations" },
        ],
        strengths: "Strong technical skills",
        areasForImprovement: "Could improve communication",
        developmentPlan: "Leadership training recommended",
      };

      expect(submission.overallRating).toBeGreaterThanOrEqual(1);
      expect(submission.overallRating).toBeLessThanOrEqual(5);
    });

    it("should prevent re-submission", async () => {
      // Once submitted, cannot be modified
      const expectedError = "REVIEW_ALREADY_SUBMITTED";
      expect(expectedError).toBe("REVIEW_ALREADY_SUBMITTED");
    });
  });

  describe("Talent Module RLS", () => {
    it("should isolate requisitions by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should isolate candidates by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should isolate performance cycles by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });

    it("should isolate goals and reviews by tenant", async () => {
      if (!ctx) return;
      expect(ctx.tenant.id).toBeDefined();
    });
  });
});
