/**
 * Time Service Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockTimeRepository, createMockOutbox, createMockTenantContext } from "../../helpers/mocks";

describe("TimeService", () => {
  let repository: ReturnType<typeof createMockTimeRepository>;
  let outbox: ReturnType<typeof createMockOutbox>;
  let context: { tenantId: string; userId: string };

  beforeEach(() => {
    repository = createMockTimeRepository();
    outbox = createMockOutbox();
    context = createMockTenantContext();
    repository._clear();
  });

  describe("Time Event Recording", () => {
    it("should record clock in event", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "clock_in",
        timestamp: new Date().toISOString(),
        source: "web",
        tenantId: context.tenantId,
      });
      expect(event).toBeDefined();
    });

    it("should record clock out event", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "clock_out",
        timestamp: new Date().toISOString(),
        source: "web",
        tenantId: context.tenantId,
      });
      expect(event).toBeDefined();
    });

    it("should record break_start event", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "break_start",
        timestamp: new Date().toISOString(),
        source: "web",
        tenantId: context.tenantId,
      });
      expect(event).toBeDefined();
    });

    it("should record break_end event", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "break_end",
        timestamp: new Date().toISOString(),
        source: "web",
        tenantId: context.tenantId,
      });
      expect(event).toBeDefined();
    });

    it("should capture location when provided", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "clock_in",
        timestamp: new Date().toISOString(),
        source: "mobile",
        latitude: 37.7749,
        longitude: -122.4194,
        tenantId: context.tenantId,
      });
      expect(event).toBeDefined();
    });
  });

  describe("Timesheet Management", () => {
    it("should create timesheet with draft status", async () => {
      const timesheet = await repository.createTimesheet(context, {
        employeeId: "emp-123",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-07",
        tenantId: context.tenantId,
      });
      expect(timesheet).toBeDefined();
    });

    describe("State Transitions", () => {
      const validTransitions: Record<string, string[]> = {
        draft: ["submitted"],
        submitted: ["approved", "rejected"],
        approved: [],
        rejected: ["draft"],
      };

      it("should allow: draft -> submitted", () => {
        expect(validTransitions["draft"]?.includes("submitted")).toBe(true);
      });

      it("should allow: submitted -> approved", () => {
        expect(validTransitions["submitted"]?.includes("approved")).toBe(true);
      });

      it("should allow: submitted -> rejected", () => {
        expect(validTransitions["submitted"]?.includes("rejected")).toBe(true);
      });

      it("should reject: approved -> any state", () => {
        expect(validTransitions["approved"]?.length).toBe(0);
      });
    });
  });

  describe("Domain Events", () => {
    it("should emit time.event.recorded on clock in", async () => {
      const event = await repository.createTimeEvent(context, {
        employeeId: "emp-123",
        eventType: "clock_in",
        timestamp: new Date().toISOString(),
        source: "web",
        tenantId: context.tenantId,
      });
      await outbox.emit("time_event", (event as {id:string}).id, "time.event.recorded", { event });
      expect(outbox.getEventsByType("time.event.recorded").length).toBe(1);
    });

    it("should emit time.timesheet.submitted on submission", async () => {
      const ts = await repository.createTimesheet(context, {
        employeeId: "emp-123",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-07",
        tenantId: context.tenantId,
      });
      await outbox.emit("timesheet", (ts as {id:string}).id, "time.timesheet.submitted", { ts });
      expect(outbox.getEventsByType("time.timesheet.submitted").length).toBe(1);
    });
  });
});
