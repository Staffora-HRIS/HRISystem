/**
 * Bradford Factor Calculator
 *
 * The Bradford Factor is a widely used HR metric for measuring employee
 * absenteeism. It emphasises the disruptive impact of frequent short
 * absences over fewer long absences.
 *
 * Formula: B = S² × D
 *   where S = number of separate absence spells in a rolling period
 *         D = total number of days absent in the same period
 *
 * UK Typical Thresholds:
 *   0–49:    No concern
 *   50–124:  Low concern (informal discussion)
 *   125–399: Moderate concern (formal review)
 *   400–649: High concern (final warning)
 *   650+:    Serious concern (dismissal consideration)
 */

export interface AbsenceSpell {
  startDate: Date | string;
  endDate: Date | string;
}

export interface BradfordFactorResult {
  score: number;
  spells: number;
  totalDays: number;
  level: "none" | "low" | "moderate" | "high" | "serious";
  periodStart: Date;
  periodEnd: Date;
}

export interface BradfordThresholds {
  low: number;
  moderate: number;
  high: number;
  serious: number;
}

export const DEFAULT_THRESHOLDS: BradfordThresholds = {
  low: 50,
  moderate: 125,
  high: 400,
  serious: 650,
};

/**
 * Calculate the Bradford Factor for an employee given their absence spells
 * within a rolling period.
 *
 * @param absences - Array of absence spells (start/end date pairs)
 * @param periodMonths - Rolling period in months (default: 12)
 * @param referenceDate - End date of the rolling period (default: today)
 * @param thresholds - Custom thresholds (default: UK standard)
 */
export function calculateBradfordFactor(
  absences: AbsenceSpell[],
  periodMonths: number = 12,
  referenceDate: Date = new Date(),
  thresholds: BradfordThresholds = DEFAULT_THRESHOLDS
): BradfordFactorResult {
  const periodEnd = new Date(referenceDate);
  periodEnd.setHours(23, 59, 59, 999);

  const periodStart = new Date(referenceDate);
  periodStart.setMonth(periodStart.getMonth() - periodMonths);
  periodStart.setHours(0, 0, 0, 0);

  // Filter absences within the rolling period and calculate days
  const relevantSpells: Array<{ start: Date; end: Date; days: number }> = [];

  for (const absence of absences) {
    const start = new Date(absence.startDate);
    const end = new Date(absence.endDate);

    // Skip if entirely outside the period
    if (end < periodStart || start > periodEnd) continue;

    // Clamp to period boundaries
    const effectiveStart = start < periodStart ? periodStart : start;
    const effectiveEnd = end > periodEnd ? periodEnd : end;

    const days = calculateWorkingDays(effectiveStart, effectiveEnd);
    if (days > 0) {
      relevantSpells.push({ start: effectiveStart, end: effectiveEnd, days });
    }
  }

  const spells = relevantSpells.length;
  const totalDays = relevantSpells.reduce((sum, s) => sum + s.days, 0);
  const score = spells * spells * totalDays;

  let level: BradfordFactorResult["level"];
  if (score >= thresholds.serious) {
    level = "serious";
  } else if (score >= thresholds.high) {
    level = "high";
  } else if (score >= thresholds.moderate) {
    level = "moderate";
  } else if (score >= thresholds.low) {
    level = "low";
  } else {
    level = "none";
  }

  return {
    score,
    spells,
    totalDays,
    level,
    periodStart,
    periodEnd,
  };
}

/**
 * Calculate calendar days between two dates (inclusive).
 * For a more accurate calculation, weekends could be excluded,
 * but the standard Bradford Factor uses calendar days.
 */
function calculateWorkingDays(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / msPerDay) + 1);
}

/**
 * Get the Bradford Factor level description for display purposes.
 */
export function getBradfordLevelDescription(
  level: BradfordFactorResult["level"]
): string {
  switch (level) {
    case "none":
      return "No concern";
    case "low":
      return "Low concern — informal discussion recommended";
    case "moderate":
      return "Moderate concern — formal review recommended";
    case "high":
      return "High concern — final warning consideration";
    case "serious":
      return "Serious concern — dismissal consideration";
  }
}
