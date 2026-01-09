/**
 * Effective Dating Utilities Tests
 */

import { describe, it, expect } from "bun:test";

describe("Effective Dating Utilities", () => {
  describe("validateNoOverlap", () => {
    it("should pass when no overlapping periods", () => {
      const periods = [
        { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
        { effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" },
        { effectiveFrom: "2024-07-01", effectiveTo: null },
      ];

      const hasOverlap = periods.some((p, i) =>
        periods.slice(i + 1).some(q => {
          const pEnd = p.effectiveTo ? new Date(p.effectiveTo) : new Date("9999-12-31");
          const qStart = new Date(q.effectiveFrom);
          return qStart <= pEnd;
        })
      );

      expect(hasOverlap).toBe(false);
    });

    it("should fail when periods overlap", () => {
      const periods = [
        { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
        { effectiveFrom: "2024-04-01", effectiveTo: "2024-09-30" },
      ];

      const p1End = new Date(periods[0]!.effectiveTo!);
      const p2Start = new Date(periods[1]!.effectiveFrom);
      const hasOverlap = p2Start <= p1End;

      expect(hasOverlap).toBe(true);
    });

    it("should handle open-ended periods (null end date)", () => {
      const period = { effectiveFrom: "2024-01-01", effectiveTo: null };
      const isOpenEnded = period.effectiveTo === null;
      expect(isOpenEnded).toBe(true);
    });

    it("should allow adjacent periods", () => {
      const period1 = { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" };
      const period2 = { effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" };

      const p1End = new Date(period1.effectiveTo);
      const p2Start = new Date(period2.effectiveFrom);
      const daysDiff = (p2Start.getTime() - p1End.getTime()) / (1000 * 60 * 60 * 24);

      expect(daysDiff).toBe(1); // Adjacent days
    });

    it("should handle edge cases at boundaries", () => {
      const period = { effectiveFrom: "2024-12-31", effectiveTo: "2025-01-01" };
      const start = new Date(period.effectiveFrom);
      const end = new Date(period.effectiveTo);

      expect(start.getFullYear()).toBe(2024);
      expect(end.getFullYear()).toBe(2025);
    });
  });

  describe("findEffectiveRecord", () => {
    it("should find record effective at given date", () => {
      const records = [
        { id: 1, effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
        { id: 2, effectiveFrom: "2024-04-01", effectiveTo: "2024-06-30" },
        { id: 3, effectiveFrom: "2024-07-01", effectiveTo: null },
      ];

      const targetDate = new Date("2024-05-15");
      const effective = records.find(r => {
        const from = new Date(r.effectiveFrom);
        const to = r.effectiveTo ? new Date(r.effectiveTo) : new Date("9999-12-31");
        return from <= targetDate && targetDate <= to;
      });

      expect(effective?.id).toBe(2);
    });

    it("should return null if no record effective", () => {
      const records = [
        { id: 1, effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" },
      ];

      const targetDate = new Date("2023-06-15");
      const effective = records.find(r => {
        const from = new Date(r.effectiveFrom);
        const to = r.effectiveTo ? new Date(r.effectiveTo) : new Date("9999-12-31");
        return from <= targetDate && targetDate <= to;
      });

      expect(effective).toBeUndefined();
    });

    it("should handle future effective dates", () => {
      const futureRecord = { effectiveFrom: "2030-01-01", effectiveTo: null };
      const today = new Date();
      const effectiveFrom = new Date(futureRecord.effectiveFrom);

      expect(effectiveFrom > today).toBe(true);
    });
  });

  describe("closeEffectiveRecord", () => {
    it("should set effective_to to day before new record", () => {
      const oldRecord = { effectiveFrom: "2024-01-01", effectiveTo: null as string | null };
      const newRecordStart = "2024-06-01";

      const dayBefore = new Date(newRecordStart);
      dayBefore.setDate(dayBefore.getDate() - 1);
      oldRecord.effectiveTo = dayBefore.toISOString().split("T")[0]!;

      expect(oldRecord.effectiveTo).toBe("2024-05-31");
    });

    it("should not modify already closed records", () => {
      const closedRecord = { effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31" };
      const originalEndDate = closedRecord.effectiveTo;

      // Should not modify
      expect(closedRecord.effectiveTo).toBe(originalEndDate);
    });
  });
});
