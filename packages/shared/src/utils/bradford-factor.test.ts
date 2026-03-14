import { describe, it, expect } from "vitest";
import {
  calculateBradfordFactor,
  getBradfordLevelDescription,
  type AbsenceSpell,
} from "./bradford-factor";

describe("Bradford Factor Calculator", () => {
  const refDate = new Date("2025-12-31");

  it("returns zero score for no absences", () => {
    const result = calculateBradfordFactor([], 12, refDate);
    expect(result.score).toBe(0);
    expect(result.spells).toBe(0);
    expect(result.totalDays).toBe(0);
    expect(result.level).toBe("none");
  });

  it("calculates correctly for a single 1-day absence", () => {
    const absences: AbsenceSpell[] = [
      { startDate: "2025-06-15", endDate: "2025-06-15" },
    ];
    const result = calculateBradfordFactor(absences, 12, refDate);
    // S=1, D=1 → B = 1² × 1 = 1
    expect(result.score).toBe(1);
    expect(result.spells).toBe(1);
    expect(result.totalDays).toBe(1);
    expect(result.level).toBe("none");
  });

  it("calculates correctly for multiple short absences (high Bradford)", () => {
    const absences: AbsenceSpell[] = [
      { startDate: "2025-03-01", endDate: "2025-03-01" },
      { startDate: "2025-05-10", endDate: "2025-05-10" },
      { startDate: "2025-07-20", endDate: "2025-07-20" },
      { startDate: "2025-09-15", endDate: "2025-09-15" },
      { startDate: "2025-11-01", endDate: "2025-11-01" },
    ];
    const result = calculateBradfordFactor(absences, 12, refDate);
    // S=5, D=5 → B = 25 × 5 = 125
    expect(result.score).toBe(125);
    expect(result.spells).toBe(5);
    expect(result.totalDays).toBe(5);
    expect(result.level).toBe("moderate");
  });

  it("calculates correctly for one long absence (low Bradford)", () => {
    const absences: AbsenceSpell[] = [
      { startDate: "2025-06-01", endDate: "2025-06-10" },
    ];
    const result = calculateBradfordFactor(absences, 12, refDate);
    // S=1, D=10 → B = 1 × 10 = 10
    expect(result.score).toBe(10);
    expect(result.spells).toBe(1);
    expect(result.totalDays).toBe(10);
    expect(result.level).toBe("none");
  });

  it("excludes absences outside the rolling period", () => {
    const absences: AbsenceSpell[] = [
      { startDate: "2024-01-01", endDate: "2024-01-05" }, // outside 12-month window
      { startDate: "2025-06-15", endDate: "2025-06-15" }, // inside
    ];
    const result = calculateBradfordFactor(absences, 12, refDate);
    expect(result.spells).toBe(1);
    expect(result.totalDays).toBe(1);
  });

  it("handles custom thresholds", () => {
    const absences: AbsenceSpell[] = [
      { startDate: "2025-03-01", endDate: "2025-03-01" },
      { startDate: "2025-06-01", endDate: "2025-06-01" },
    ];
    const result = calculateBradfordFactor(absences, 12, refDate, {
      low: 2,
      moderate: 5,
      high: 10,
      serious: 20,
    });
    // S=2, D=2 → B = 4 × 2 = 8 (>= moderate(5) but < high(10))
    expect(result.score).toBe(8);
    expect(result.level).toBe("moderate");
  });

  it("reaches serious level with many frequent short absences", () => {
    const absences: AbsenceSpell[] = Array.from({ length: 10 }, (_, i) => ({
      startDate: `2025-${String(i + 1).padStart(2, "0")}-15`,
      endDate: `2025-${String(i + 1).padStart(2, "0")}-15`,
    }));
    const result = calculateBradfordFactor(absences, 12, refDate);
    // S=10, D=10 → B = 100 × 10 = 1000
    expect(result.score).toBe(1000);
    expect(result.level).toBe("serious");
  });
});

describe("getBradfordLevelDescription", () => {
  it("returns correct descriptions for all levels", () => {
    expect(getBradfordLevelDescription("none")).toContain("No concern");
    expect(getBradfordLevelDescription("low")).toContain("informal");
    expect(getBradfordLevelDescription("moderate")).toContain("formal review");
    expect(getBradfordLevelDescription("high")).toContain("final warning");
    expect(getBradfordLevelDescription("serious")).toContain("dismissal");
  });
});
