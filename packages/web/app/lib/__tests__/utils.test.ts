/**
 * Utility Functions Tests
 *
 * Tests for all utility functions in lib/utils.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatRelativeTime,
  formatCompactNumber,
  truncate,
  getInitials,
  capitalize,
  titleCase,
  camelToWords,
  snakeToWords,
  debounce,
  throttle,
  sleep,
  groupBy,
  unique,
  sortBy,
  isEmpty,
  pick,
  omit,
  deepClone,
  generateId,
  parseQueryString,
  buildQueryString,
} from "../utils";

// ---------------------------------------------------------------------------
// cn (class merge utility)
// ---------------------------------------------------------------------------
describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const showHidden = false;
    expect(cn("base", showHidden && "hidden", "visible")).toBe("base visible");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    const result = cn("px-4", "px-6");
    expect(result).toBe("px-6");
  });

  it("handles empty arguments", () => {
    expect(cn()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe("formatRelativeTime", () => {
  it("returns 'just now' for very recent dates", () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });

  it("returns seconds ago", () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe("30 seconds ago");
  });

  it("returns singular form", () => {
    const date = new Date(Date.now() - 1000);
    expect(formatRelativeTime(date)).toBe("1 second ago");
  });

  it("returns minutes ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("5 minutes ago");
  });

  it("returns hours ago", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("3 hours ago");
  });

  it("returns days ago", () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("2 days ago");
  });

  it("returns months ago", () => {
    const date = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("2 months ago");
  });

  it("returns years ago", () => {
    const date = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("1 year ago");
  });

  it("accepts string date", () => {
    const dateStr = new Date(Date.now() - 60 * 1000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe("1 minute ago");
  });
});

// ---------------------------------------------------------------------------
// formatCompactNumber
// ---------------------------------------------------------------------------
describe("formatCompactNumber", () => {
  it("formats small numbers as-is", () => {
    expect(formatCompactNumber(42)).toBe("42");
  });

  it("formats thousands", () => {
    const result = formatCompactNumber(1200);
    expect(result).toMatch(/1\.2k/i);
  });

  it("formats millions", () => {
    const result = formatCompactNumber(3500000);
    expect(result).toMatch(/3\.5m/i);
  });

  it("formats zero", () => {
    expect(formatCompactNumber(0)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe("truncate", () => {
  it("returns original string if shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("returns exact length string unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------
describe("getInitials", () => {
  it("returns two-letter initials for two-word name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns first two chars for single-word name", () => {
    expect(getInitials("John")).toBe("JO");
  });

  it("returns first and last for three-word name", () => {
    expect(getInitials("John Michael Doe")).toBe("JD");
  });

  it("uppercases initials", () => {
    expect(getInitials("john doe")).toBe("JD");
  });

  it("handles extra whitespace", () => {
    expect(getInitials("  John    Doe  ")).toBe("JD");
  });
});

// ---------------------------------------------------------------------------
// capitalize
// ---------------------------------------------------------------------------
describe("capitalize", () => {
  it("capitalizes first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("lowercases rest", () => {
    expect(capitalize("HELLO")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// titleCase
// ---------------------------------------------------------------------------
describe("titleCase", () => {
  it("capitalizes each word", () => {
    expect(titleCase("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(titleCase("hello")).toBe("Hello");
  });

  it("handles all caps", () => {
    expect(titleCase("HELLO WORLD")).toBe("Hello World");
  });
});

// ---------------------------------------------------------------------------
// camelToWords
// ---------------------------------------------------------------------------
describe("camelToWords", () => {
  it("converts camelCase to words", () => {
    expect(camelToWords("helloWorld")).toBe("Hello World");
  });

  it("converts PascalCase to words", () => {
    expect(camelToWords("HelloWorld")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(camelToWords("hello")).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// snakeToWords
// ---------------------------------------------------------------------------
describe("snakeToWords", () => {
  it("converts snake_case to words", () => {
    expect(snakeToWords("hello_world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(snakeToWords("hello")).toBe("Hello");
  });

  it("handles multiple underscores", () => {
    expect(snakeToWords("a_b_c")).toBe("A B C");
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays function execution", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets timer on subsequent calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced(); // Reset timer
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes arguments to the function", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("arg1", "arg2");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });
});

// ---------------------------------------------------------------------------
// throttle
// ---------------------------------------------------------------------------
describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executes immediately on first call", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores calls within delay period", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows execution after delay period", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
describe("sleep", () => {
  it("resolves after specified time", async () => {
    vi.useFakeTimers();
    const promise = sleep(100);

    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// groupBy
// ---------------------------------------------------------------------------
describe("groupBy", () => {
  it("groups by key", () => {
    const items = [
      { name: "Alice", dept: "Eng" },
      { name: "Bob", dept: "Eng" },
      { name: "Charlie", dept: "HR" },
    ];

    const grouped = groupBy(items, "dept");
    expect(grouped["Eng"]).toHaveLength(2);
    expect(grouped["HR"]).toHaveLength(1);
  });

  it("groups by function", () => {
    const items = [1, 2, 3, 4, 5];
    const grouped = groupBy(items, (n) => (n % 2 === 0 ? "even" : "odd"));
    expect(grouped["even"]).toEqual([2, 4]);
    expect(grouped["odd"]).toEqual([1, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// unique
// ---------------------------------------------------------------------------
describe("unique", () => {
  it("removes duplicates from primitive array", () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it("removes duplicates by key", () => {
    const items = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 1, name: "C" },
    ];
    expect(unique(items, "id")).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });

  it("removes duplicates by function", () => {
    const items = [
      { id: 1, name: "A" },
      { id: 2, name: "B" },
      { id: 1, name: "C" },
    ];
    expect(unique(items, (i) => i.id)).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sortBy
// ---------------------------------------------------------------------------
describe("sortBy", () => {
  it("sorts ascending by key", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }];
    const sorted = sortBy(items, "n");
    expect(sorted.map((i) => i.n)).toEqual([1, 2, 3]);
  });

  it("sorts descending by key", () => {
    const items = [{ n: 3 }, { n: 1 }, { n: 2 }];
    const sorted = sortBy(items, "n", "desc");
    expect(sorted.map((i) => i.n)).toEqual([3, 2, 1]);
  });

  it("sorts by function", () => {
    const items = ["banana", "apple", "cherry"];
    const sorted = sortBy(items, (s) => s.length);
    expect(sorted).toEqual(["apple", "banana", "cherry"]);
  });

  it("does not mutate original array", () => {
    const items = [3, 1, 2];
    const sorted = sortBy(items, (n) => n);
    expect(items).toEqual([3, 1, 2]);
    expect(sorted).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// isEmpty
// ---------------------------------------------------------------------------
describe("isEmpty", () => {
  it("returns true for null", () => {
    expect(isEmpty(null)).toBe(true);
  });

  it("returns true for undefined", () => {
    expect(isEmpty(undefined)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(isEmpty("")).toBe(true);
  });

  it("returns true for whitespace string", () => {
    expect(isEmpty("   ")).toBe(true);
  });

  it("returns true for empty array", () => {
    expect(isEmpty([])).toBe(true);
  });

  it("returns true for empty object", () => {
    expect(isEmpty({})).toBe(true);
  });

  it("returns false for non-empty string", () => {
    expect(isEmpty("hello")).toBe(false);
  });

  it("returns false for non-empty array", () => {
    expect(isEmpty([1])).toBe(false);
  });

  it("returns false for non-empty object", () => {
    expect(isEmpty({ a: 1 })).toBe(false);
  });

  it("returns false for number zero", () => {
    expect(isEmpty(0)).toBe(false);
  });

  it("returns false for boolean false", () => {
    expect(isEmpty(false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------
describe("pick", () => {
  it("picks specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(pick(obj, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores missing keys", () => {
    const obj = { a: 1, b: 2 };
    // @ts-expect-error - testing invalid key
    expect(pick(obj, ["a", "missing"])).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// omit
// ---------------------------------------------------------------------------
describe("omit", () => {
  it("omits specified keys", () => {
    const obj = { a: 1, b: 2, c: 3 };
    expect(omit(obj, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("returns copy without omitted keys", () => {
    const obj = { a: 1, b: 2 };
    const result = omit(obj, ["a"]);
    expect(result).toEqual({ b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 }); // original unchanged
  });
});

// ---------------------------------------------------------------------------
// deepClone
// ---------------------------------------------------------------------------
describe("deepClone", () => {
  it("creates a deep copy", () => {
    const obj = { a: { b: { c: 1 } }, d: [1, 2, 3] };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.a).not.toBe(obj.a);
    expect(clone.d).not.toBe(obj.d);
  });

  it("handles arrays", () => {
    const arr = [1, [2, 3], { a: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------
describe("generateId", () => {
  it("generates a string of default length 8", () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  it("generates a string of custom length", () => {
    const id = generateId(16);
    expect(id).toHaveLength(16);
  });

  it("generates alphanumeric characters only", () => {
    const id = generateId(100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// parseQueryString
// ---------------------------------------------------------------------------
describe("parseQueryString", () => {
  it("parses query string to object", () => {
    expect(parseQueryString("foo=bar&baz=qux")).toEqual({
      foo: "bar",
      baz: "qux",
    });
  });

  it("handles encoded values", () => {
    expect(parseQueryString("name=John%20Doe")).toEqual({ name: "John Doe" });
  });

  it("handles empty string", () => {
    expect(parseQueryString("")).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildQueryString
// ---------------------------------------------------------------------------
describe("buildQueryString", () => {
  it("builds query string from object", () => {
    const result = buildQueryString({ foo: "bar", page: 1 });
    expect(result).toContain("foo=bar");
    expect(result).toContain("page=1");
  });

  it("skips null and undefined values", () => {
    const result = buildQueryString({ foo: "bar", baz: null, qux: undefined });
    expect(result).toBe("foo=bar");
  });

  it("converts boolean values", () => {
    const result = buildQueryString({ active: true });
    expect(result).toBe("active=true");
  });

  it("handles empty object", () => {
    expect(buildQueryString({})).toBe("");
  });
});
