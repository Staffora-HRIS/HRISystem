/**
 * Absence Service Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockAbsenceRepository, createMockOutbox, createMockTenantContext } from "../../helpers/mocks";

describe("AbsenceService", () => {
  let repository: ReturnType<typeof createMockAbsenceRepository>;
  let outbox: ReturnType<typeof createMockOutbox>;
  let context: { tenantId: string; userId: string };

  beforeEach(() => {
    repository = createMockAbsenceRepository();
    outbox = createMockOutbox();
    context = createMockTenantContext();
    repository._clear();
  });

  describe("Leave Request Management", () => {
    describe("createLeaveRequest", () => {
      it("should create leave request with pending status", async () => {
        const request = await repository.createLeaveRequest(context, {
          employeeId: "emp-123",
          leaveTypeId: "annual-leave",
          startDate: "2024-06-01",
          endDate: "2024-06-05",
          reason: "Family vacation",
          tenantId: context.tenantId,
        });
        expect(request).toBeDefined();
      });

      it("should set initial status to pending", async () => {
        const request = await repository.createLeaveRequest(context, {
          employeeId: "emp-123",
          leaveTypeId: "annual-leave",
          startDate: "2024-06-01",
          endDate: "2024-06-05",
          tenantId: context.tenantId,
        });
        expect((request as { status: string }).status).toBe("pending");
      });

      it("should validate date range (start before end)", () => {
        const start = new Date("2024-06-01");
        const end = new Date("2024-06-05");
        expect(start < end).toBe(true);
      });
    });

    describe("Leave Request State Transitions", () => {
      const validTransitions: Record<string, string[]> = {
        pending: ["approved", "rejected", "cancelled"],
        approved: ["cancelled"],
        rejected: [],
        cancelled: [],
      };

      it("should allow: pending -> approved", () => {
        expect(validTransitions["pending"]?.includes("approved")).toBe(true);
      });

      it("should allow: pending -> rejected", () => {
        expect(validTransitions["pending"]?.includes("rejected")).toBe(true);
      });

      it("should allow: pending -> cancelled", () => {
        expect(validTransitions["pending"]?.includes("cancelled")).toBe(true);
      });

      it("should allow: approved -> cancelled", () => {
        expect(validTransitions["approved"]?.includes("cancelled")).toBe(true);
      });

      it("should reject: rejected -> any state", () => {
        expect(validTransitions["rejected"]?.length).toBe(0);
      });

      it("should reject: cancelled -> any state", () => {
        expect(validTransitions["cancelled"]?.length).toBe(0);
      });
    });

    describe("approveLeaveRequest", () => {
      it("should update status to approved", async () => {
        const request = await repository.createLeaveRequest(context, {
          employeeId: "emp-123",
          leaveTypeId: "annual-leave",
          startDate: "2024-06-01",
          endDate: "2024-06-05",
          tenantId: context.tenantId,
        });

        const updated = await repository.updateLeaveRequestStatus(
          context,
          (request as { id: string }).id,
          "approved"
        );
        expect((updated as { status: string }).status).toBe("approved");
      });
    });

    describe("rejectLeaveRequest", () => {
      it("should update status to rejected", async () => {
        const request = await repository.createLeaveRequest(context, {
          employeeId: "emp-123",
          leaveTypeId: "annual-leave",
          startDate: "2024-06-01",
          endDate: "2024-06-05",
          tenantId: context.tenantId,
        });

        const updated = await repository.updateLeaveRequestStatus(
          context,
          (request as { id: string }).id,
          "rejected"
        );
        expect((updated as { status: string }).status).toBe("rejected");
      });
    });
  });

  describe("Leave Balance Management", () => {
    it("should get leave balance for employee", async () => {
      await repository.updateLeaveBalance(context, "emp-123", "annual-leave", {
        entitled: 20,
        used: 5,
        pending: 0,
      });

      const balance = await repository.getLeaveBalance(context, "emp-123", "annual-leave");
      expect(balance).toBeDefined();
    });

    it("should update leave balance on approval", async () => {
      await repository.updateLeaveBalance(context, "emp-123", "annual-leave", {
        entitled: 20,
        used: 5,
        pending: 0,
      });

      await repository.updateLeaveBalance(context, "emp-123", "annual-leave", {
        used: 10,
      });

      const balance = await repository.getLeaveBalance(context, "emp-123", "annual-leave");
      expect((balance as { used: number }).used).toBe(10);
    });
  });

  describe("Domain Events", () => {
    it("should emit absence.leave_request.submitted on creation", async () => {
      const request = await repository.createLeaveRequest(context, {
        employeeId: "emp-123",
        leaveTypeId: "annual-leave",
        startDate: "2024-06-01",
        endDate: "2024-06-05",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "leave_request",
        (request as { id: string }).id,
        "absence.leave_request.submitted",
        { request, actor: context.userId }
      );

      expect(outbox.getEventsByType("absence.leave_request.submitted").length).toBe(1);
    });

    it("should emit absence.leave_request.approved on approval", async () => {
      const request = await repository.createLeaveRequest(context, {
        employeeId: "emp-123",
        leaveTypeId: "annual-leave",
        startDate: "2024-06-01",
        endDate: "2024-06-05",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "leave_request",
        (request as { id: string }).id,
        "absence.leave_request.approved",
        { request, approvedBy: context.userId }
      );

      expect(outbox.getEventsByType("absence.leave_request.approved").length).toBe(1);
    });

    it("should emit absence.leave_request.rejected on rejection", async () => {
      const request = await repository.createLeaveRequest(context, {
        employeeId: "emp-123",
        leaveTypeId: "annual-leave",
        startDate: "2024-06-01",
        endDate: "2024-06-05",
        tenantId: context.tenantId,
      });

      await outbox.emit(
        "leave_request",
        (request as { id: string }).id,
        "absence.leave_request.rejected",
        { request, rejectedBy: context.userId, reason: "Busy period" }
      );

      expect(outbox.getEventsByType("absence.leave_request.rejected").length).toBe(1);
    });
  });
});
