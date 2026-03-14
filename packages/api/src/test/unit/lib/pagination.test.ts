/**
 * Unit tests for the shared pagination helpers.
 *
 * These tests verify the core pagination utilities without requiring
 * database or infrastructure -- pure logic tests.
 *
 * Note: TypeBox schema tests (PaginationQuerySchema, PaginatedResponseSchema,
 * PaginatedDataResponseSchema) are tested structurally to avoid Bun/Elysia
 * compatibility issues on certain platforms. The schemas are validated by
 * TypeScript compilation and by route-level integration tests.
 */

import { describe, test, expect } from "bun:test";
import {
  parsePaginationParams,
  normalizePaginationParams,
  buildPaginatedResult,
  buildPaginatedDataResult,
  buildMappedPaginatedResult,
  getFetchLimit,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../../lib/pagination";

// =============================================================================
// parsePaginationParams
// =============================================================================

describe("parsePaginationParams", () => {
  test("returns defaults when no params provided", () => {
    const result = parsePaginationParams({});
    expect(result.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(result.cursor).toBeUndefined();
    expect(result.sortBy).toBe("created_at");
    expect(result.sortOrder).toBe("desc");
  });

  test("passes through valid cursor", () => {
    const result = parsePaginationParams({ cursor: "abc-123" });
    expect(result.cursor).toBe("abc-123");
  });

  test("strips empty string cursor to undefined", () => {
    const result = parsePaginationParams({ cursor: "" });
    expect(result.cursor).toBeUndefined();
  });

  test("clamps limit to MAX_PAGE_LIMIT", () => {
    const result = parsePaginationParams({ limit: 500 });
    expect(result.limit).toBe(MAX_PAGE_LIMIT);
  });

  test("clamps limit to minimum of 1", () => {
    const result = parsePaginationParams({ limit: -5 });
    expect(result.limit).toBe(1);
  });

  test("clamps limit of 0 to default", () => {
    const result = parsePaginationParams({ limit: 0 });
    expect(result.limit).toBe(DEFAULT_PAGE_LIMIT);
  });

  test("uses provided limit when valid", () => {
    const result = parsePaginationParams({ limit: 50 });
    expect(result.limit).toBe(50);
  });

  test("respects sortOrder asc", () => {
    const result = parsePaginationParams({ sortOrder: "asc" });
    expect(result.sortOrder).toBe("asc");
  });

  test("defaults sortOrder to desc for invalid values", () => {
    // @ts-expect-error testing invalid input
    const result = parsePaginationParams({ sortOrder: "invalid" });
    expect(result.sortOrder).toBe("desc");
  });

  test("respects custom sortBy", () => {
    const result = parsePaginationParams({ sortBy: "name" });
    expect(result.sortBy).toBe("name");
  });

  test("limit boundary: exactly MAX_PAGE_LIMIT is accepted", () => {
    const result = parsePaginationParams({ limit: MAX_PAGE_LIMIT });
    expect(result.limit).toBe(MAX_PAGE_LIMIT);
  });

  test("limit boundary: exactly 1 is accepted", () => {
    const result = parsePaginationParams({ limit: 1 });
    expect(result.limit).toBe(1);
  });
});

describe("normalizePaginationParams is an alias for parsePaginationParams", () => {
  test("both functions are the same reference", () => {
    expect(normalizePaginationParams).toBe(parsePaginationParams);
  });
});

// =============================================================================
// buildPaginatedResult (items-style)
// =============================================================================

describe("buildPaginatedResult", () => {
  test("returns all rows when count <= limit", () => {
    const rows = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ];
    const result = buildPaginatedResult(rows, 5);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("trims extra row and sets hasMore when count > limit", () => {
    const rows = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
      { id: "3", name: "c" },
    ];
    const result = buildPaginatedResult(rows, 2);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("2");
  });

  test("handles empty result set", () => {
    const result = buildPaginatedResult([], 20);
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("uses custom cursor field", () => {
    const rows = [
      { id: "1", caseNumber: "CASE-001" },
      { id: "2", caseNumber: "CASE-002" },
      { id: "3", caseNumber: "CASE-003" },
    ];
    const result = buildPaginatedResult(rows, 2, "caseNumber");
    expect(result.nextCursor).toBe("CASE-002");
  });

  test("handles exactly limit rows (no extra)", () => {
    const rows = [
      { id: "1" },
      { id: "2" },
    ];
    const result = buildPaginatedResult(rows, 2);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("handles single row with limit 1 and hasMore", () => {
    const rows = [
      { id: "1" },
      { id: "2" },
    ];
    const result = buildPaginatedResult(rows, 1);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("1");
  });

  test("cursor value is stringified for non-string fields", () => {
    const rows = [
      { id: "1", seq: 42 },
      { id: "2", seq: 43 },
      { id: "3", seq: 44 },
    ];
    const result = buildPaginatedResult(rows, 2, "seq");
    expect(result.nextCursor).toBe("43");
  });

  test("preserves original row objects (no cloning)", () => {
    const row1 = { id: "1" };
    const row2 = { id: "2" };
    const result = buildPaginatedResult([row1, row2], 5);
    expect(result.items[0]).toBe(row1);
    expect(result.items[1]).toBe(row2);
  });
});

// =============================================================================
// buildPaginatedDataResult (data-style)
// =============================================================================

describe("buildPaginatedDataResult", () => {
  test("returns data-style result with no more pages", () => {
    const rows = [
      { id: "1", value: 10 },
    ];
    const result = buildPaginatedDataResult(rows, 5);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  test("returns data-style result with more pages", () => {
    const rows = [
      { id: "a", value: 1 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ];
    const result = buildPaginatedDataResult(rows, 2);
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe("b");
  });

  test("handles empty result set", () => {
    const result = buildPaginatedDataResult([], 10);
    expect(result.data).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });

  test("handles exactly limit rows", () => {
    const rows = [
      { id: "x" },
      { id: "y" },
    ];
    const result = buildPaginatedDataResult(rows, 2);
    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.cursor).toBeNull();
  });
});

// =============================================================================
// buildMappedPaginatedResult
// =============================================================================

describe("buildMappedPaginatedResult", () => {
  test("applies mapper to sliced items", () => {
    const rows = [
      { id: "1", name: "alice" },
      { id: "2", name: "bob" },
      { id: "3", name: "charlie" },
    ];
    const result = buildMappedPaginatedResult(
      rows,
      2,
      (row) => ({ displayName: row.name.toUpperCase() })
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ displayName: "ALICE" });
    expect(result.items[1]).toEqual({ displayName: "BOB" });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("2");
  });

  test("does not map the extra overflow row", () => {
    let mapCount = 0;
    const rows = [
      { id: "1", name: "a" },
      { id: "2", name: "b" },
      { id: "3", name: "c" },
    ];
    buildMappedPaginatedResult(rows, 2, (row) => {
      mapCount++;
      return { n: row.name };
    });
    expect(mapCount).toBe(2); // Only the 2 included items, not the overflow
  });

  test("handles empty result set with mapper", () => {
    const result = buildMappedPaginatedResult(
      [] as { id: string }[],
      10,
      (row) => ({ mapped: row.id })
    );
    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  test("uses custom cursor field with mapper", () => {
    const rows = [
      { id: "1", code: "ABC" },
      { id: "2", code: "DEF" },
      { id: "3", code: "GHI" },
    ];
    const result = buildMappedPaginatedResult(
      rows,
      2,
      (row) => ({ label: row.code }),
      "code"
    );
    expect(result.nextCursor).toBe("DEF");
  });

  test("mapper return type is independent of input type", () => {
    const rows = [
      { id: "1", x: 10, y: 20 },
    ];
    const result = buildMappedPaginatedResult(
      rows,
      5,
      (row) => `${row.x},${row.y}`
    );
    expect(result.items[0]).toBe("10,20");
    expect(result.hasMore).toBe(false);
  });
});

// =============================================================================
// getFetchLimit
// =============================================================================

describe("getFetchLimit", () => {
  test("returns limit + 1", () => {
    expect(getFetchLimit(20)).toBe(21);
    expect(getFetchLimit(1)).toBe(2);
    expect(getFetchLimit(100)).toBe(101);
  });
});

// =============================================================================
// Constants
// =============================================================================

describe("constants", () => {
  test("DEFAULT_PAGE_LIMIT is 20", () => {
    expect(DEFAULT_PAGE_LIMIT).toBe(20);
  });

  test("MAX_PAGE_LIMIT is 100", () => {
    expect(MAX_PAGE_LIMIT).toBe(100);
  });
});
