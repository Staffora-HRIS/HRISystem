/**
 * Absence Service — UK Statutory Holiday Minimum Enforcement Tests
 *
 * Tests for TODO-025: Validates that annual leave policies cannot be created
 * with entitlements below the UK statutory minimum (5.6 weeks / 28 days
 * for full-time workers, pro-rated for part-time).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { mock } from "bun:test";
import {
  AbsenceService,
  AbsenceErrorCodes,
  UK_STATUTORY,
  calculateMinimumEntitlement,
} from "../../../modules/absence/service";
import type { AbsenceRepository } from "../../../modules/absence/repository";
import type { CreateLeavePolicy } from "../../../modules/absence/schemas";

// =============================================================================
// Pure Function Tests — calculateMinimumEntitlement
// =============================================================================

describe("calculateMinimumEntitlement", () => {
  it("should return 28 days for full-time (5 days/week)", () => {
    expect(calculateMinimumEntitlement(5)).toBe(28);
  });

  it("should return 17 days for 3 days/week (ceil(3/5 * 28) = ceil(16.8) = 17)", () => {
    expect(calculateMinimumEntitlement(3)).toBe(17);
  });

  it("should return 12 days for 2 days/week (ceil(2/5 * 28) = ceil(11.2) = 12)", () => {
    expect(calculateMinimumEntitlement(2)).toBe(12);
  });

  it("should return 6 days for 1 day/week (ceil(1/5 * 28) = ceil(5.6) = 6)", () => {
    expect(calculateMinimumEntitlement(1)).toBe(6);
  });

  it("should return 23 days for 4 days/week (ceil(4/5 * 28) = ceil(22.4) = 23)", () => {
    expect(calculateMinimumEntitlement(4)).toBe(23);
  });

  it("should return 3 days for 0.5 days/week (ceil(0.5/5 * 28) = ceil(2.8) = 3)", () => {
    expect(calculateMinimumEntitlement(0.5)).toBe(3);
  });

  it("should cap at 28 days for workers doing 6 days/week", () => {
    // 6/5 * 28 = 33.6 but capped at 28
    expect(calculateMinimumEntitlement(6)).toBe(28);
  });

  it("should cap at 28 days for workers doing 7 days/week", () => {
    // 7/5 * 28 = 39.2 but capped at 28
    expect(calculateMinimumEntitlement(7)).toBe(28);
  });

  it("should accept a custom fullTimeDays parameter", () => {
    // 3 days per week with 4-day full-time week: ceil(3/4 * 28) = ceil(21) = 21
    expect(calculateMinimumEntitlement(3, 4)).toBe(21);
  });

  it("should use ceil rounding to never fall below minimum", () => {
    // 4.5/5 * 28 = 25.2, ceil = 26
    expect(calculateMinimumEntitlement(4.5)).toBe(26);
  });
});

// =============================================================================
// UK_STATUTORY Constants Tests
// =============================================================================

describe("UK_STATUTORY constants", () => {
  it("should define full-time minimum as 28 days", () => {
    expect(UK_STATUTORY.FULL_TIME_MIN_DAYS).toBe(28);
  });

  it("should define weeks entitlement as 5.6", () => {
    expect(UK_STATUTORY.WEEKS_ENTITLEMENT).toBe(5.6);
  });

  it("should define full-time hours as 40", () => {
    expect(UK_STATUTORY.FULL_TIME_HOURS).toBe(40);
  });

  it("should define full-time days as 5", () => {
    expect(UK_STATUTORY.FULL_TIME_DAYS).toBe(5);
  });

  it("should satisfy 5.6 * 5 = 28", () => {
    expect(UK_STATUTORY.WEEKS_ENTITLEMENT * UK_STATUTORY.FULL_TIME_DAYS).toBe(
      UK_STATUTORY.FULL_TIME_MIN_DAYS,
    );
  });
});

// =============================================================================
// Service-Level Tests — AbsenceService.createLeavePolicy with statutory validation
// =============================================================================

describe("AbsenceService.createLeavePolicy — statutory minimum enforcement", () => {
  let service: AbsenceService;
  let mockRepo: {
    getLeaveTypeById: ReturnType<typeof mock>;
    createLeavePolicy: ReturnType<typeof mock>;
    [key: string]: unknown;
  };
  const ctx = { tenantId: crypto.randomUUID(), userId: crypto.randomUUID() };

  function makeLeaveType(category: string) {
    return {
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      code: category === "annual" ? "ANNUAL" : "SICK",
      name: category === "annual" ? "Annual Leave" : "Sick Leave",
      category,
      description: null,
      isPaid: true,
      requiresApproval: true,
      requiresAttachment: false,
      maxConsecutiveDays: null,
      minNoticeDays: 0,
      color: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function makePolicyInput(
    overrides: Partial<CreateLeavePolicy> = {},
  ): CreateLeavePolicy {
    return {
      name: "UK Annual Leave Policy",
      leaveTypeId: crypto.randomUUID(),
      annualAllowance: 28,
      effectiveFrom: "2026-01-01",
      ...overrides,
    };
  }

  function makePolicyRow(input: CreateLeavePolicy) {
    return {
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      name: input.name,
      description: input.description ?? null,
      leaveTypeId: input.leaveTypeId,
      annualAllowance: input.annualAllowance,
      maxCarryover: input.maxCarryover ?? 0,
      accrualFrequency: input.accrualFrequency ?? null,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      eligibleAfterMonths: input.eligibleAfterMonths ?? 0,
      appliesTo: input.appliesTo ?? null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  beforeEach(() => {
    mockRepo = {
      getLeaveTypeById: mock(() => Promise.resolve(makeLeaveType("annual"))),
      createLeavePolicy: mock((ctx: unknown, data: unknown) =>
        Promise.resolve(makePolicyRow(data as CreateLeavePolicy)),
      ),
      // Stubs for other methods not used in createLeavePolicy path
      createLeaveType: mock(() => Promise.resolve(null)),
      getLeaveTypes: mock(() => Promise.resolve([])),
      deactivateLeaveType: mock(() => Promise.resolve(null)),
      getLeavePolicies: mock(() => Promise.resolve([])),
      deactivateLeavePolicy: mock(() => Promise.resolve(null)),
      createLeaveRequest: mock(() => Promise.resolve(null)),
      getLeaveRequests: mock(() =>
        Promise.resolve({ data: [], cursor: null, hasMore: false }),
      ),
      getLeaveRequestById: mock(() => Promise.resolve(null)),
      submitLeaveRequest: mock(() => Promise.resolve(null)),
      approveLeaveRequest: mock(() => Promise.resolve(null)),
      rejectLeaveRequest: mock(() => Promise.resolve(null)),
      cancelLeaveRequest: mock(() => Promise.resolve(null)),
      getLeaveBalances: mock(() => Promise.resolve([])),
    };
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);
  });

  // ---------------------------------------------------------------------------
  // Full-time scenarios
  // ---------------------------------------------------------------------------

  it("should reject annual leave policy with entitlement below 28 days (full-time)", async () => {
    const input = makePolicyInput({ annualAllowance: 20 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
    expect(result.error?.message).toContain("20 days");
    expect(result.error?.message).toContain("28 days");
    expect(result.error?.message).toContain("full-time");
    // Should NOT have called the repository to actually create the policy
    expect(mockRepo.createLeavePolicy).not.toHaveBeenCalled();
  });

  it("should reject annual leave policy with entitlement of 27 days (full-time)", async () => {
    const input = makePolicyInput({ annualAllowance: 27 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
  });

  it("should accept annual leave policy with exactly 28 days (full-time)", async () => {
    const input = makePolicyInput({ annualAllowance: 28 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
    expect(mockRepo.createLeavePolicy).toHaveBeenCalledTimes(1);
  });

  it("should accept annual leave policy with more than 28 days (full-time)", async () => {
    const input = makePolicyInput({ annualAllowance: 35 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
    expect(mockRepo.createLeavePolicy).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Part-time scenarios
  // ---------------------------------------------------------------------------

  it("should reject 3-day/week policy with entitlement below 17 days", async () => {
    const input = makePolicyInput({ annualAllowance: 15, daysPerWeek: 3 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
    expect(result.error?.message).toContain("3-day working week");
    expect(result.error?.message).toContain("pro-rata");
  });

  it("should accept 3-day/week policy with exactly 17 days", async () => {
    const input = makePolicyInput({ annualAllowance: 17, daysPerWeek: 3 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
    expect(mockRepo.createLeavePolicy).toHaveBeenCalledTimes(1);
  });

  it("should reject 2-day/week policy with entitlement below 12 days", async () => {
    const input = makePolicyInput({ annualAllowance: 10, daysPerWeek: 2 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
  });

  it("should accept 2-day/week policy with exactly 12 days", async () => {
    const input = makePolicyInput({ annualAllowance: 12, daysPerWeek: 2 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  it("should reject 1-day/week policy with entitlement below 6 days", async () => {
    const input = makePolicyInput({ annualAllowance: 5, daysPerWeek: 1 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
  });

  it("should accept 1-day/week policy with exactly 6 days", async () => {
    const input = makePolicyInput({ annualAllowance: 6, daysPerWeek: 1 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Non-annual leave types (should bypass validation)
  // ---------------------------------------------------------------------------

  it("should allow sick leave policy with any entitlement (no statutory minimum)", async () => {
    mockRepo.getLeaveTypeById = mock(() =>
      Promise.resolve(makeLeaveType("sick")),
    );
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput({ annualAllowance: 5 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
    expect(mockRepo.createLeavePolicy).toHaveBeenCalledTimes(1);
  });

  it("should allow personal leave policy with any entitlement", async () => {
    mockRepo.getLeaveTypeById = mock(() =>
      Promise.resolve(makeLeaveType("personal")),
    );
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput({ annualAllowance: 3 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  it("should allow parental leave policy with any entitlement", async () => {
    mockRepo.getLeaveTypeById = mock(() =>
      Promise.resolve(makeLeaveType("parental")),
    );
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput({ annualAllowance: 10 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  it("should allow bereavement leave policy with any entitlement", async () => {
    mockRepo.getLeaveTypeById = mock(() =>
      Promise.resolve(makeLeaveType("bereavement")),
    );
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput({ annualAllowance: 5 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  it("should allow unpaid leave policy with any entitlement", async () => {
    mockRepo.getLeaveTypeById = mock(() =>
      Promise.resolve(makeLeaveType("unpaid")),
    );
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput({ annualAllowance: 0 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Leave type not found
  // ---------------------------------------------------------------------------

  it("should return error when leave type does not exist", async () => {
    mockRepo.getLeaveTypeById = mock(() => Promise.resolve(null));
    service = new AbsenceService(mockRepo as unknown as AbsenceRepository);

    const input = makePolicyInput();
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.LEAVE_TYPE_NOT_FOUND);
    expect(mockRepo.createLeavePolicy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Default daysPerWeek behavior
  // ---------------------------------------------------------------------------

  it("should default to 5 days/week when daysPerWeek is not provided", async () => {
    // 25 days would be valid for 4-day week (min=23) but not for 5-day week (min=28)
    const input = makePolicyInput({ annualAllowance: 25 });
    // No daysPerWeek provided -- should default to 5
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
    expect(result.error?.message).toContain("full-time");
  });

  // ---------------------------------------------------------------------------
  // Error details
  // ---------------------------------------------------------------------------

  it("should include detailed breakdown in error response", async () => {
    const input = makePolicyInput({
      annualAllowance: 15,
      daysPerWeek: 3,
    });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.details).toBeDefined();
    const details = result.error?.details as Record<string, unknown>;
    expect(details.entitlementDays).toBe(15);
    expect(details.minimumEntitlementDays).toBe(17);
    expect(details.daysPerWeek).toBe(3);
    expect(details.fullTimeMinimumDays).toBe(28);
    expect(details.weeksEntitlement).toBe(5.6);
  });

  // ---------------------------------------------------------------------------
  // Edge case: zero entitlement for annual leave
  // ---------------------------------------------------------------------------

  it("should reject zero-day annual leave policy for any working pattern", async () => {
    const input = makePolicyInput({ annualAllowance: 0, daysPerWeek: 0.5 });
    const result = await service.createLeavePolicy(ctx, input);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(AbsenceErrorCodes.BELOW_STATUTORY_MINIMUM);
  });
});
