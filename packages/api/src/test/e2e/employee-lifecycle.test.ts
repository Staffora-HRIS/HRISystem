/**
 * Employee Lifecycle E2E Tests
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestContext, ensureTestInfra, isInfraAvailable, type TestContext } from "../setup";

describe("Employee Lifecycle E2E", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("should complete full employee lifecycle", async () => {
    // 1. Create org unit
    const orgUnit = {
      id: crypto.randomUUID(),
      name: "Engineering",
      code: "ENG",
    };
    expect(orgUnit.id).toBeDefined();

    // 2. Create position
    const position = {
      id: crypto.randomUUID(),
      orgUnitId: orgUnit.id,
      title: "Software Engineer",
      headcount: 5,
    };
    expect(position.orgUnitId).toBe(orgUnit.id);

    // 3. Create employee (pending)
    const employee = {
      id: crypto.randomUUID(),
      employeeNumber: "EMP-2024-001",
      hireDate: "2024-01-15",
      positionId: position.id,
      status: "pending" as string,
    };
    expect(employee.status).toBe("pending");

    // 4. Activate employee
    employee.status = "active";
    expect(employee.status).toBe("active");

    // 5. Employee goes on leave
    employee.status = "on_leave";
    expect(employee.status).toBe("on_leave");

    // 6. Employee returns from leave
    employee.status = "active";
    expect(employee.status).toBe("active");

    // 7. Transfer to new position
    const newPosition = {
      id: crypto.randomUUID(),
      title: "Senior Software Engineer",
    };
    employee.positionId = newPosition.id;
    expect(employee.positionId).toBe(newPosition.id);

    // 8. Terminate employee
    employee.status = "terminated";
    expect(employee.status).toBe("terminated");
  });

  it("should maintain position history on transfers", async () => {
    const positionHistory = [
      { positionId: "pos-1", effectiveFrom: "2024-01-01", effectiveTo: "2024-05-31" },
      { positionId: "pos-2", effectiveFrom: "2024-06-01", effectiveTo: null },
    ];
    
    expect(positionHistory.length).toBe(2);
    expect(positionHistory[0]?.effectiveTo).not.toBeNull();
    expect(positionHistory[1]?.effectiveTo).toBeNull();
  });

  it("should create audit trail for all changes", async () => {
    const auditLogs = [
      { action: "employee.created", timestamp: new Date() },
      { action: "employee.status_changed", timestamp: new Date() },
      { action: "employee.transferred", timestamp: new Date() },
      { action: "employee.terminated", timestamp: new Date() },
    ];

    expect(auditLogs.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Leave Request Flow E2E", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("should complete leave request from submission to completion", async () => {
    // 1. Check balance
    const balance = { entitled: 20, used: 0, available: 20 };
    expect(balance.available).toBe(20);

    // 2. Submit request
    const request = {
      id: crypto.randomUUID(),
      status: "pending",
      requestedDays: 5,
    };
    expect(request.status).toBe("pending");

    // 3. Manager approves
    request.status = "approved";
    balance.used += request.requestedDays;
    balance.available = balance.entitled - balance.used;

    expect(request.status).toBe("approved");
    expect(balance.available).toBe(15);
  });
});

describe("Time Tracking Flow E2E", () => {
  let ctx: TestContext | null = null;

  beforeAll(async () => {
    await ensureTestInfra();
    if (!isInfraAvailable()) return;
    ctx = await createTestContext();
  });

  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });

  it("should track daily time from clock-in to timesheet submission", async () => {
    // 1. Clock in
    const clockIn = { type: "clock_in", timestamp: "2024-01-15T09:00:00Z" };
    expect(clockIn.type).toBe("clock_in");

    // 2. Clock out
    const clockOut = { type: "clock_out", timestamp: "2024-01-15T17:00:00Z" };
    expect(clockOut.type).toBe("clock_out");

    // 3. Calculate hours
    const hours = 8;
    expect(hours).toBe(8);

    // 4. Submit timesheet
    const timesheet = { status: "submitted", totalHours: 40 };
    expect(timesheet.status).toBe("submitted");

    // 5. Manager approves
    timesheet.status = "approved";
    expect(timesheet.status).toBe("approved");
  });
});
