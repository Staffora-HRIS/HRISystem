/**
 * Unit tests for UK Leave Carryover Rules (EU/Additional Split).
 *
 * Tests the pure calculateLeaveCarryover function without database access.
 * Verifies the EU 4-week / Additional 1.6-week split and protected
 * carryover reasons.
 */

import { describe, test, expect } from "bun:test";
import {
  calculateLeaveCarryover,
  PROTECTED_CARRYOVER_REASONS,
  type CarryoverInput,
} from "../../../lib/uk-leave-carryover";

// =============================================================================
// Test Helpers
// =============================================================================

function makeInput(overrides: Partial<CarryoverInput> = {}): CarryoverInput {
  return {
    unusedDays: 10,
    contractedDaysPerWeek: 5,
    leaveYear: 2025,
    protectedReason: null,
    maxContractualCarryover: 0,
    totalAnnualEntitlement: 28,
    ...overrides,
  };
}

// =============================================================================
// Basic carryover calculations
// =============================================================================

describe("calculateLeaveCarryover", () => {
  describe("no protected reason, no contractual carryover", () => {
    test("forfeits all unused days for full-time worker", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          contractedDaysPerWeek: 5,
          maxContractualCarryover: 0,
        })
      );

      expect(result.euCarryover).toBe(0);
      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.contractualCarryover).toBe(0);
      expect(result.totalCarryover).toBe(0);
      expect(result.forfeitedDays).toBe(10);
      expect(result.protectedReasonApplied).toBe(false);
    });

    test("handles zero unused days", () => {
      const result = calculateLeaveCarryover(
        makeInput({ unusedDays: 0 })
      );

      expect(result.totalCarryover).toBe(0);
      expect(result.forfeitedDays).toBe(0);
      expect(result.explanation).toContain("No unused leave");
    });

    test("handles negative unused days", () => {
      const result = calculateLeaveCarryover(
        makeInput({ unusedDays: -5 })
      );

      expect(result.totalCarryover).toBe(0);
      expect(result.forfeitedDays).toBe(0);
    });
  });

  describe("EU entitlement split", () => {
    test("correctly calculates EU and additional portions for full-time", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 28,
          contractedDaysPerWeek: 5,
        })
      );

      // EU portion: 4 weeks * 5 days = 20 days
      expect(result.euEntitlementDays).toBe(20);
      // Additional: 1.6 weeks * 5 days = 8 days
      expect(result.additionalEntitlementDays).toBe(8);
    });

    test("correctly calculates portions for part-time (3 days/week)", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 17,
          contractedDaysPerWeek: 3,
          totalAnnualEntitlement: 17,
        })
      );

      // EU portion: 4 * 3 = 12 days
      expect(result.euEntitlementDays).toBe(12);
      // Additional: 1.6 * 3 = 4.8, ceil = 5 days
      expect(result.additionalEntitlementDays).toBe(5);
    });

    test("caps statutory at 28 days for 6-day workers", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 28,
          contractedDaysPerWeek: 6,
          totalAnnualEntitlement: 28,
        })
      );

      // 6 * 4 = 24 EU days, 6 * 1.6 = 9.6 -> ceil 10 additional
      // Total would be 34, but capped at 28
      // EU: min(24, 28) = 24, Additional: 28 - 24 = 4
      expect(result.euEntitlementDays).toBe(24);
      expect(result.additionalEntitlementDays).toBe(4);
    });
  });

  describe("protected carryover (sickness, maternity, etc.)", () => {
    test("carries over EU portion when sick", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 15,
          protectedReason: "sickness",
          maxContractualCarryover: 0,
        })
      );

      expect(result.protectedReasonApplied).toBe(true);
      // All 15 unused days fall within the EU portion (20 days)
      expect(result.euCarryover).toBe(15);
      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.totalCarryover).toBe(15);
      expect(result.forfeitedDays).toBe(0);
    });

    test("carries over up to EU entitlement on maternity", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 25,
          protectedReason: "maternity",
          maxContractualCarryover: 0,
        })
      );

      // EU entitlement is 20 days. 25 unused: 20 EU + 5 additional
      // Protected carryover allows up to 20 EU days
      expect(result.euCarryover).toBe(20);
      // Additional 5 days are forfeited (no contractual carryover)
      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.totalCarryover).toBe(20);
      expect(result.forfeitedDays).toBe(5);
    });

    test("limits EU carryover to protectedDaysUntaken", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 20,
          protectedReason: "sickness",
          protectedDaysUntaken: 8,
          maxContractualCarryover: 0,
        })
      );

      // Only 8 days were prevented by sickness
      expect(result.euCarryover).toBe(8);
      expect(result.totalCarryover).toBe(8);
      expect(result.forfeitedDays).toBe(12);
    });

    test("all protected reasons are recognized", () => {
      for (const reason of PROTECTED_CARRYOVER_REASONS) {
        const result = calculateLeaveCarryover(
          makeInput({
            unusedDays: 5,
            protectedReason: reason,
          })
        );
        expect(result.protectedReasonApplied).toBe(true);
        expect(result.euCarryover).toBe(5);
      }
    });

    test("paternity leave allows EU carryover", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          protectedReason: "paternity",
        })
      );

      expect(result.protectedReasonApplied).toBe(true);
      expect(result.euCarryover).toBe(10);
    });

    test("adoption leave allows EU carryover", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          protectedReason: "adoption",
        })
      );

      expect(result.protectedReasonApplied).toBe(true);
      expect(result.euCarryover).toBe(10);
    });

    test("shared_parental leave allows EU carryover", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          protectedReason: "shared_parental",
        })
      );

      expect(result.protectedReasonApplied).toBe(true);
      expect(result.euCarryover).toBe(10);
    });
  });

  describe("contractual carryover (additional 1.6 weeks)", () => {
    test("carries over additional statutory when employer allows", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 28,
          maxContractualCarryover: 5,
        })
      );

      // No protected reason, so EU = 0
      // Additional: 8 days unused, but only 5 allowed by contractual
      expect(result.euCarryover).toBe(0);
      expect(result.additionalStatutoryCarryover).toBe(5);
      expect(result.contractualCarryover).toBe(0);
      expect(result.totalCarryover).toBe(5);
      expect(result.forfeitedDays).toBe(23);
    });

    test("distributes contractual allowance to additional then contractual", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 35,
          totalAnnualEntitlement: 35, // 28 statutory + 7 contractual
          maxContractualCarryover: 10,
        })
      );

      // unused: 20 EU + 8 additional + 7 contractual = 35
      // No protected reason -> EU carryover = 0
      // Contractual allowance = 10:
      //   - additional: min(8, 10) = 8, remaining allowance = 2
      //   - contractual: min(7, 2) = 2
      expect(result.euCarryover).toBe(0);
      expect(result.additionalStatutoryCarryover).toBe(8);
      expect(result.contractualCarryover).toBe(2);
      expect(result.totalCarryover).toBe(10);
      expect(result.forfeitedDays).toBe(25);
    });

    test("combines protected EU carryover with contractual carryover", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 35,
          totalAnnualEntitlement: 35,
          protectedReason: "sickness",
          maxContractualCarryover: 10,
        })
      );

      // EU: 20 days, all protected -> 20 carried over
      // Additional: 8 days, contractual allowance = 10
      //   -> additional carryover = min(8, 10) = 8
      // Contractual (above-statutory): 7 days, remaining = 10-8 = 2
      //   -> contractual carryover = min(7, 2) = 2
      expect(result.euCarryover).toBe(20);
      expect(result.additionalStatutoryCarryover).toBe(8);
      expect(result.contractualCarryover).toBe(2);
      expect(result.totalCarryover).toBe(30);
      expect(result.forfeitedDays).toBe(5);
    });

    test("handles zero contractual carryover allowance", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 28,
          maxContractualCarryover: 0,
        })
      );

      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.contractualCarryover).toBe(0);
      expect(result.totalCarryover).toBe(0);
    });
  });

  describe("part-time workers", () => {
    test("calculates correct portions for 3-day worker", () => {
      // 3 days/week: EU = 4*3=12, Additional = ceil(1.6*3) = 5
      // Total statutory = 17 (under 28 cap)
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 12,
          contractedDaysPerWeek: 3,
          totalAnnualEntitlement: 17,
          protectedReason: "sickness",
          maxContractualCarryover: 3,
        })
      );

      // 12 unused: 12 EU (all within EU portion of 12 days)
      expect(result.euCarryover).toBe(12);
      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.totalCarryover).toBe(12);
      expect(result.euEntitlementDays).toBe(12);
      expect(result.additionalEntitlementDays).toBe(5);
    });

    test("handles 2-day worker", () => {
      // 2 days/week: EU = 4*2=8, Additional = ceil(1.6*2)=ceil(3.2)=4
      // Total = 12, under cap
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 12,
          contractedDaysPerWeek: 2,
          totalAnnualEntitlement: 12,
        })
      );

      expect(result.euEntitlementDays).toBe(8);
      expect(result.additionalEntitlementDays).toBe(4);
    });
  });

  describe("above-statutory contractual leave", () => {
    test("handles above-statutory leave with no carryover", () => {
      // Employee has 33 days total (28 statutory + 5 contractual)
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          totalAnnualEntitlement: 33,
          maxContractualCarryover: 0,
        })
      );

      expect(result.contractualEntitlementDays).toBe(5);
      expect(result.contractualCarryover).toBe(0);
      expect(result.forfeitedDays).toBe(10);
    });

    test("carries over contractual leave per employer policy", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 33,
          totalAnnualEntitlement: 33,
          maxContractualCarryover: 15,
        })
      );

      // 20 EU + 8 additional + 5 contractual = 33
      // No protected reason: EU = 0
      // Contractual allowance of 15:
      //   additional: min(8, 15) = 8, remaining = 7
      //   contractual: min(5, 7) = 5
      expect(result.additionalStatutoryCarryover).toBe(8);
      expect(result.contractualCarryover).toBe(5);
      expect(result.totalCarryover).toBe(13);
      expect(result.forfeitedDays).toBe(20); // 20 EU days forfeited
    });
  });

  describe("edge cases", () => {
    test("defaults to 5 days/week when contractedDaysPerWeek is 0", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          contractedDaysPerWeek: 0,
        })
      );

      expect(result.euEntitlementDays).toBe(20);
      expect(result.additionalEntitlementDays).toBe(8);
    });

    test("unusedDays less than EU portion only affects EU bucket", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 5,
          protectedReason: "sickness",
        })
      );

      expect(result.euCarryover).toBe(5);
      expect(result.additionalStatutoryCarryover).toBe(0);
      expect(result.contractualCarryover).toBe(0);
      expect(result.totalCarryover).toBe(5);
      expect(result.forfeitedDays).toBe(0);
    });

    test("protectedDaysUntaken of 0 means no EU carryover despite reason", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 15,
          protectedReason: "maternity",
          protectedDaysUntaken: 0,
        })
      );

      expect(result.euCarryover).toBe(0);
      expect(result.protectedReasonApplied).toBe(true);
    });
  });

  describe("explanation text", () => {
    test("includes protected reason in explanation", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          protectedReason: "sickness",
        })
      );

      expect(result.explanation).toContain("sickness");
      expect(result.explanation).toContain("Reg 13");
    });

    test("mentions forfeited days", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 10,
          maxContractualCarryover: 0,
        })
      );

      expect(result.explanation).toContain("forfeited");
    });

    test("mentions employer agreement for additional carryover", () => {
      const result = calculateLeaveCarryover(
        makeInput({
          unusedDays: 25,
          maxContractualCarryover: 5,
        })
      );

      expect(result.explanation).toContain("employer agreement");
    });
  });
});
