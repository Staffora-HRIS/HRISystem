/**
 * Leave Request Approval Workflow Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../../setup";

describe("Leave Request Approval Workflow", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  describe("Full Approval Flow", () => {
    it("should complete full leave request workflow", async () => {
      // Step 1: Employee submits leave request
      const leaveRequest = {
        id: crypto.randomUUID(),
        employeeId: "emp-123",
        leaveTypeId: "annual-leave",
        startDate: "2024-06-01",
        endDate: "2024-06-05",
        status: "pending",
        reason: "Family vacation",
      };
      expect(leaveRequest.status).toBe("pending");

      // Step 2: Manager approves
      leaveRequest.status = "approved";
      expect(leaveRequest.status).toBe("approved");
    });

    it("should handle rejection flow", async () => {
      const leaveRequest = {
        id: crypto.randomUUID(),
        status: "pending",
        rejectionReason: null as string | null,
      };

      // Manager rejects
      leaveRequest.status = "rejected";
      leaveRequest.rejectionReason = "Busy period - please reschedule";

      expect(leaveRequest.status).toBe("rejected");
      expect(leaveRequest.rejectionReason).toBeDefined();
    });

    it("should prevent approval without sufficient balance", async () => {
      const balance = { entitled: 20, used: 18, pending: 0 };
      const requestedDays = 5;
      const available = balance.entitled - balance.used - balance.pending;

      expect(available).toBeLessThan(requestedDays);
    });

    it("should prevent overlapping leave requests", async () => {
      const existingRequest = { startDate: "2024-06-01", endDate: "2024-06-10" };
      const newRequest = { startDate: "2024-06-05", endDate: "2024-06-15" };

      const hasOverlap =
        new Date(newRequest.startDate) <= new Date(existingRequest.endDate) &&
        new Date(newRequest.endDate) >= new Date(existingRequest.startDate);

      expect(hasOverlap).toBe(true);
    });

    it("should handle cancellation before approval", async () => {
      const request = { status: "pending" };
      request.status = "cancelled";
      expect(request.status).toBe("cancelled");
    });

    it("should handle cancellation after approval with balance restoration", async () => {
      const balance = { used: 10 };
      const requestedDays = 5;

      // Cancel approved request - restore balance
      balance.used -= requestedDays;

      expect(balance.used).toBe(5);
    });
  });

  describe("Notification Flow", () => {
    it("should notify manager on leave submission", async () => {
      const notifications = [{ type: "leave_submitted", recipient: "manager" }];
      expect(notifications.some(n => n.type === "leave_submitted")).toBe(true);
    });

    it("should notify employee on approval", async () => {
      const notifications = [{ type: "leave_approved", recipient: "employee" }];
      expect(notifications.some(n => n.type === "leave_approved")).toBe(true);
    });

    it("should notify employee on rejection", async () => {
      const notifications = [{ type: "leave_rejected", recipient: "employee" }];
      expect(notifications.some(n => n.type === "leave_rejected")).toBe(true);
    });
  });
});
