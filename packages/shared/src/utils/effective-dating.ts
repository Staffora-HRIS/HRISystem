/**
 * Effective Dating Utilities
 *
 * Utilities for managing effective-dated records in the HRIS system.
 * Effective dating allows tracking changes over time with non-overlapping
 * date ranges per employee per dimension.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A date range for effective dating
 */
export interface EffectiveDateRange {
  /** Start date (inclusive) */
  effectiveFrom: Date | string;
  /** End date (inclusive), null means "current" or "no end date" */
  effectiveTo: Date | string | null;
}

/**
 * An existing record with effective dates
 */
export interface EffectiveDatedRecord extends EffectiveDateRange {
  /** Record ID for exclusion during updates */
  id: string;
}

/**
 * Result of overlap validation
 */
export interface OverlapValidationResult {
  /** Whether validation passed (no overlaps found) */
  valid: boolean;
  /** List of overlapping records if any */
  overlappingRecords: EffectiveDatedRecord[];
  /** Human-readable error message if invalid */
  errorMessage: string | null;
}

/**
 * Dimension types for effective dating
 */
export type EffectiveDatingDimension =
  | "personal"
  | "contract"
  | "position"
  | "compensation"
  | "manager"
  | "status"
  | "custom";

import { startOfDay, endOfDay } from "./dates";

// =============================================================================
// Date Normalization
// =============================================================================

/**
 * Normalize a date input to a Date object
 */
function normalizeDate(date: Date | string | null | undefined): Date | null {
  if (date === null || date === undefined) {
    return null;
  }
  if (date instanceof Date) {
    return date;
  }
  return new Date(date);
}

// =============================================================================
// Overlap Detection
// =============================================================================

/**
 * Check if two date ranges overlap.
 *
 * Two ranges overlap if:
 * - Both ranges are valid (from <= to or to is null)
 * - Range A starts before Range B ends (or B has no end)
 * - Range B starts before Range A ends (or A has no end)
 *
 * @param rangeA - First date range
 * @param rangeB - Second date range
 * @returns True if ranges overlap
 *
 * @example
 * ```typescript
 * // Overlapping ranges
 * rangesOverlap(
 *   { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
 *   { effectiveFrom: "2024-03-01", effectiveTo: "2024-12-31" }
 * ); // true
 *
 * // Non-overlapping (adjacent)
 * rangesOverlap(
 *   { effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
 *   { effectiveFrom: "2024-07-01", effectiveTo: "2024-12-31" }
 * ); // false
 * ```
 */
export function rangesOverlap(rangeA: EffectiveDateRange, rangeB: EffectiveDateRange): boolean {
  const aFrom = normalizeDate(rangeA.effectiveFrom);
  const aTo = normalizeDate(rangeA.effectiveTo);
  const bFrom = normalizeDate(rangeB.effectiveFrom);
  const bTo = normalizeDate(rangeB.effectiveTo);

  if (!aFrom || !bFrom) {
    return false; // Invalid range
  }

  // Normalize to start of day for comparison
  const aStart = startOfDay(aFrom);
  const bStart = startOfDay(bFrom);
  const aEnd = aTo ? endOfDay(aTo) : null;
  const bEnd = bTo ? endOfDay(bTo) : null;

  // Check overlap conditions:
  // A starts before B ends (or B has no end)
  const aStartsBeforeBEnds = bEnd === null || aStart <= bEnd;
  // B starts before A ends (or A has no end)
  const bStartsBeforeAEnds = aEnd === null || bStart <= aEnd;

  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/**
 * Validate that a new date range does not overlap with existing records.
 *
 * This is the primary function for enforcing the "no overlap per employee
 * per dimension" rule in effective-dated HR data.
 *
 * @param employeeId - The employee ID (for error messages)
 * @param dimension - The type of effective-dated data (for error messages)
 * @param newRange - The new date range to validate
 * @param existingRecords - Array of existing records to check against
 * @param excludeId - Optional ID to exclude (for updates)
 * @returns Validation result with overlap details
 *
 * @example
 * ```typescript
 * const existingPositions = [
 *   { id: "1", effectiveFrom: "2024-01-01", effectiveTo: "2024-06-30" },
 *   { id: "2", effectiveFrom: "2024-07-01", effectiveTo: null },
 * ];
 *
 * // Check new position assignment
 * const result = validateNoOverlap(
 *   "emp-123",
 *   "position",
 *   { effectiveFrom: "2024-03-01", effectiveTo: "2024-09-30" },
 *   existingPositions
 * );
 *
 * if (!result.valid) {
 *   console.error(result.errorMessage);
 *   // "Position assignment for employee emp-123 would overlap with 2 existing records"
 * }
 * ```
 */
export function validateNoOverlap(
  employeeId: string,
  dimension: EffectiveDatingDimension | string,
  newRange: EffectiveDateRange,
  existingRecords: EffectiveDatedRecord[],
  excludeId?: string
): OverlapValidationResult {
  // Filter out the record being updated (if any)
  const recordsToCheck = excludeId
    ? existingRecords.filter((r) => r.id !== excludeId)
    : existingRecords;

  // Find all overlapping records
  const overlappingRecords = recordsToCheck.filter((existing) =>
    rangesOverlap(newRange, existing)
  );

  if (overlappingRecords.length === 0) {
    return {
      valid: true,
      overlappingRecords: [],
      errorMessage: null,
    };
  }

  // Build descriptive error message
  const dimensionLabel = formatDimensionLabel(dimension);
  const errorMessage =
    overlappingRecords.length === 1
      ? `${dimensionLabel} for employee ${employeeId} would overlap with an existing record ` +
        `(${formatEffectiveDateRange(overlappingRecords[0]!)})`
      : `${dimensionLabel} for employee ${employeeId} would overlap with ${overlappingRecords.length} existing records`;

  return {
    valid: false,
    overlappingRecords,
    errorMessage,
  };
}

/**
 * Check if a date falls within a date range.
 *
 * @param date - The date to check
 * @param range - The date range
 * @returns True if date is within range (inclusive)
 */
export function dateInRange(date: Date | string, range: EffectiveDateRange): boolean {
  const checkDate = normalizeDate(date);
  const rangeFrom = normalizeDate(range.effectiveFrom);
  const rangeTo = normalizeDate(range.effectiveTo);

  if (!checkDate || !rangeFrom) {
    return false;
  }

  const normalized = startOfDay(checkDate);
  const start = startOfDay(rangeFrom);
  const end = rangeTo ? endOfDay(rangeTo) : null;

  return normalized >= start && (end === null || normalized <= end);
}

/**
 * Find the record that is effective on a given date.
 *
 * @param records - Array of effective-dated records
 * @param date - The date to find the effective record for (defaults to today)
 * @returns The effective record or null if none found
 */
export function findEffectiveRecord<T extends EffectiveDateRange>(
  records: T[],
  date: Date | string = new Date()
): T | null {
  const checkDate = normalizeDate(date);
  if (!checkDate) return null;

  for (const record of records) {
    if (dateInRange(checkDate, record)) {
      return record;
    }
  }
  return null;
}

/**
 * Find the current (open-ended) record.
 *
 * @param records - Array of effective-dated records
 * @returns The current record (effectiveTo is null) or null if none found
 */
export function findCurrentRecord<T extends EffectiveDateRange>(
  records: T[]
): T | null {
  return records.find((r) => r.effectiveTo === null) ?? null;
}

// =============================================================================
// Date Range Manipulation
// =============================================================================

/**
 * Close an existing record's date range (set effectiveTo).
 * Returns the new effectiveTo value that should be set.
 *
 * @param newRecordStartDate - When the new record starts
 * @returns The date that should be set as effectiveTo on the old record
 */
export function calculateEndDate(newRecordStartDate: Date | string): Date {
  const startDate = normalizeDate(newRecordStartDate);
  if (!startDate) {
    throw new Error("Invalid start date");
  }

  // End date is the day before the new record starts
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() - 1);
  return endDate;
}

/**
 * Validate that a date range is valid (from <= to).
 *
 * @param range - The date range to validate
 * @returns True if valid
 */
export function isValidEffectiveDateRange(range: EffectiveDateRange): boolean {
  const from = normalizeDate(range.effectiveFrom);
  const to = normalizeDate(range.effectiveTo);

  if (!from) {
    return false; // effectiveFrom is required
  }

  if (to === null) {
    return true; // Open-ended ranges are valid
  }

  return startOfDay(from) <= endOfDay(to);
}

/**
 * Sort records by effective date (most recent first).
 *
 * @param records - Array of effective-dated records
 * @returns Sorted array (most recent first)
 */
export function sortByEffectiveDate<T extends EffectiveDateRange>(
  records: T[],
  direction: "asc" | "desc" = "desc"
): T[] {
  return [...records].sort((a, b) => {
    const aDate = normalizeDate(a.effectiveFrom);
    const bDate = normalizeDate(b.effectiveFrom);

    if (!aDate || !bDate) return 0;

    const comparison = bDate.getTime() - aDate.getTime();
    return direction === "desc" ? comparison : -comparison;
  });
}

// =============================================================================
// SQL Query Helpers
// =============================================================================

/**
 * Generate SQL condition for finding overlapping records.
 * Use this in repository queries to check for overlaps at the database level.
 *
 * @returns SQL fragment for overlap detection
 *
 * @example
 * ```sql
 * -- Using with postgres.js
 * const overlaps = await sql`
 *   SELECT * FROM employee_positions
 *   WHERE employee_id = ${employeeId}
 *     AND ${getOverlapConditionSQL('effective_from', 'effective_to', newFrom, newTo)}
 *     ${excludeId ? sql`AND id != ${excludeId}` : sql``}
 * `;
 * ```
 */
export function getOverlapConditionDescription(): string {
  return `
    -- Overlap condition: new range overlaps with existing range if:
    -- 1. New starts before existing ends (or existing has no end)
    -- 2. Existing starts before new ends (or new has no end)
    --
    -- SQL pattern:
    -- (
    --   (existing_effective_to IS NULL OR new_effective_from <= existing_effective_to)
    --   AND
    --   (new_effective_to IS NULL OR existing_effective_from <= new_effective_to)
    -- )
  `.trim();
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format a dimension type for display
 */
function formatDimensionLabel(dimension: string): string {
  const labels: Record<string, string> = {
    personal: "Personal information",
    contract: "Contract",
    position: "Position assignment",
    compensation: "Compensation",
    manager: "Reporting line",
    status: "Status",
  };
  return labels[dimension] ?? `${dimension} record`;
}

/**
 * Format a date range for display
 */
function formatEffectiveDateRange(range: EffectiveDateRange): string {
  const from = normalizeDate(range.effectiveFrom);
  const to = normalizeDate(range.effectiveTo);

  if (!from) return "invalid range";

  const fromStr = from.toISOString().split("T")[0];
  const toStr = to ? to.toISOString().split("T")[0] : "present";

  return `${fromStr} to ${toStr}`;
}

// =============================================================================
// Async Overlap Validation (for use with database queries)
// =============================================================================

/**
 * Options for async overlap validation
 */
export interface AsyncOverlapCheckOptions {
  /** Function to fetch existing records */
  fetchExistingRecords: () => Promise<EffectiveDatedRecord[]>;
  /** Employee ID (for error messages) */
  employeeId: string;
  /** Dimension type (for error messages) */
  dimension: EffectiveDatingDimension | string;
  /** The new date range to validate */
  newRange: EffectiveDateRange;
  /** Optional ID to exclude (for updates) */
  excludeId?: string;
}

/**
 * Validate overlap asynchronously by fetching existing records first.
 * Use this when you need to query the database for existing records.
 *
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = await validateNoOverlapAsync({
 *   fetchExistingRecords: () => repository.getEmployeePositions(employeeId),
 *   employeeId: "emp-123",
 *   dimension: "position",
 *   newRange: { effectiveFrom: "2024-01-01", effectiveTo: null },
 *   excludeId: updateId,
 * });
 *
 * if (!result.valid) {
 *   throw new EffectiveDateOverlapError(result.errorMessage);
 * }
 * ```
 */
export async function validateNoOverlapAsync(
  options: AsyncOverlapCheckOptions
): Promise<OverlapValidationResult> {
  const existingRecords = await options.fetchExistingRecords();

  return validateNoOverlap(
    options.employeeId,
    options.dimension,
    options.newRange,
    existingRecords,
    options.excludeId
  );
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when an effective date overlap is detected
 */
export class EffectiveDateOverlapError extends Error {
  public readonly code = "EFFECTIVE_DATE_OVERLAP";
  public readonly overlappingRecords: EffectiveDatedRecord[];

  constructor(
    message: string,
    overlappingRecords: EffectiveDatedRecord[] = []
  ) {
    super(message);
    this.name = "EffectiveDateOverlapError";
    this.overlappingRecords = overlappingRecords;
  }
}

/**
 * Error thrown when a date range is invalid
 */
export class InvalidEffectiveDateRangeError extends Error {
  public readonly code = "INVALID_DATE_RANGE";

  constructor(message: string) {
    super(message);
    this.name = "InvalidEffectiveDateRangeError";
  }
}
