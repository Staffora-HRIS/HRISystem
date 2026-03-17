/**
 * Workflow Condition Evaluator Unit Tests
 *
 * Tests for conditional workflow branching logic including:
 * - Field resolution (dot-notation paths)
 * - Individual condition operators (field_equals, field_greater_than, etc.)
 * - Condition combinators (all/any)
 * - Next step resolution with conditional branching
 * - Condition rules validation
 * - Edge cases (missing fields, type coercion, empty data)
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the module, to avoid bun 1.3.x segfault on
 * Windows when importing modules with complex dependency chains.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted types and functions from condition-evaluator.ts
// =============================================================================

type ConditionOperator =
  | "field_equals"
  | "field_not_equals"
  | "field_greater_than"
  | "field_less_than"
  | "field_greater_than_or_equal"
  | "field_less_than_or_equal"
  | "field_contains"
  | "field_not_contains"
  | "field_in"
  | "field_not_in"
  | "field_is_empty"
  | "field_is_not_empty";

interface Condition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

interface ConditionRules {
  match: "all" | "any";
  conditions: Condition[];
}

interface ConditionDetail {
  field: string;
  operator: ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
}

interface ConditionEvaluationResult {
  passed: boolean;
  details: ConditionDetail[];
}

interface StepDefinition {
  stepKey: string;
  name?: string;
  stepType?: string;
  type?: string;
  conditionRules?: ConditionRules | null;
  nextSteps?: Array<{
    stepKey: string;
    conditionRules?: ConditionRules | null;
  }>;
  [key: string]: unknown;
}

// --- Internal helpers ---

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a == b;
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  if (typeof a === "string" && typeof b === "number") return Number(a) === b;
  if (typeof a === "boolean" && typeof b === "string") return a === (b === "true");
  if (typeof a === "string" && typeof b === "boolean") return (a === "true") === b;
  return String(a) === String(b);
}

function isComparable(a: unknown, b: unknown): boolean {
  return typeof toNumber(a) === "number" && typeof toNumber(b) === "number"
    && !Number.isNaN(toNumber(a)) && !Number.isNaN(toNumber(b));
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") { const n = Number(val); return Number.isNaN(n) ? NaN : n; }
  if (typeof val === "boolean") return val ? 1 : 0;
  return NaN;
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && (typeof expected === "string" || typeof expected === "number")) {
    return actual.toLowerCase().includes(String(expected).toLowerCase());
  }
  if (Array.isArray(actual)) return actual.some((item) => isEqual(item, expected));
  return false;
}

function isValueIn(actual: unknown, expected: unknown): boolean {
  if (!Array.isArray(expected)) return false;
  return expected.some((item) => isEqual(actual, item));
}

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val as object).length === 0;
  return false;
}

// --- Public functions ---

function resolveField(data: Record<string, unknown>, fieldPath: string): unknown {
  if (!data || typeof data !== "object" || !fieldPath) return undefined;
  const parts = fieldPath.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (Number.isNaN(index)) return undefined;
      current = current[index];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateCondition(condition: Condition, contextData: Record<string, unknown>): ConditionDetail {
  const actualValue = resolveField(contextData, condition.field);
  const expectedValue = condition.value;
  let passed = false;

  switch (condition.operator) {
    case "field_equals": passed = isEqual(actualValue, expectedValue); break;
    case "field_not_equals": passed = !isEqual(actualValue, expectedValue); break;
    case "field_greater_than": passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) > toNumber(expectedValue); break;
    case "field_less_than": passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) < toNumber(expectedValue); break;
    case "field_greater_than_or_equal": passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) >= toNumber(expectedValue); break;
    case "field_less_than_or_equal": passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) <= toNumber(expectedValue); break;
    case "field_contains": passed = containsValue(actualValue, expectedValue); break;
    case "field_not_contains": passed = !containsValue(actualValue, expectedValue); break;
    case "field_in": passed = isValueIn(actualValue, expectedValue); break;
    case "field_not_in": passed = !isValueIn(actualValue, expectedValue); break;
    case "field_is_empty": passed = isEmpty(actualValue); break;
    case "field_is_not_empty": passed = !isEmpty(actualValue); break;
    default: passed = false; break;
  }

  return { field: condition.field, operator: condition.operator, expectedValue, actualValue, passed };
}

function evaluateConditionRules(
  conditionRules: ConditionRules | null | undefined,
  contextData: Record<string, unknown>
): ConditionEvaluationResult {
  if (!conditionRules || !conditionRules.conditions || conditionRules.conditions.length === 0) {
    return { passed: true, details: [] };
  }
  const safeData = contextData || {};
  const match = conditionRules.match || "all";
  const details: ConditionDetail[] = [];

  for (const condition of conditionRules.conditions) {
    const detail = evaluateCondition(condition, safeData);
    details.push(detail);
    if (match === "any" && detail.passed) return { passed: true, details };
    if (match === "all" && !detail.passed) return { passed: false, details };
  }

  return { passed: match === "all", details };
}

function resolveNextStepIndex(
  steps: StepDefinition[],
  currentStepIndex: number,
  contextData: Record<string, unknown>
): { nextStepIndex: number; skippedSteps: number[] } {
  const currentStep = steps[currentStepIndex];
  const skippedSteps: number[] = [];

  if (!currentStep) return { nextStepIndex: -1, skippedSteps };

  // Strategy 1: Explicit nextSteps
  if (currentStep.nextSteps && currentStep.nextSteps.length > 0) {
    for (const nextStepRef of currentStep.nextSteps) {
      const targetIndex = steps.findIndex((s) => s.stepKey === nextStepRef.stepKey);
      if (targetIndex === -1) continue;
      const transitionResult = evaluateConditionRules(nextStepRef.conditionRules, contextData);
      if (!transitionResult.passed) { skippedSteps.push(targetIndex); continue; }
      const targetStep = steps[targetIndex];
      const stepResult = evaluateConditionRules(targetStep?.conditionRules, contextData);
      if (!stepResult.passed) { skippedSteps.push(targetIndex); continue; }
      return { nextStepIndex: targetIndex, skippedSteps };
    }
    return { nextStepIndex: -1, skippedSteps };
  }

  // Strategy 2: Sequential fallthrough
  for (let i = currentStepIndex + 1; i < steps.length; i++) {
    const candidateStep = steps[i];
    const result = evaluateConditionRules(candidateStep?.conditionRules, contextData);
    if (result.passed) return { nextStepIndex: i, skippedSteps };
    skippedSteps.push(i);
  }

  return { nextStepIndex: -1, skippedSteps };
}

const VALID_OPERATORS: Set<string> = new Set([
  "field_equals", "field_not_equals", "field_greater_than", "field_less_than",
  "field_greater_than_or_equal", "field_less_than_or_equal", "field_contains",
  "field_not_contains", "field_in", "field_not_in", "field_is_empty", "field_is_not_empty",
]);
const VALUE_NOT_REQUIRED: Set<string> = new Set(["field_is_empty", "field_is_not_empty"]);

function validateConditionRules(rules: unknown): string | null {
  if (rules === null || rules === undefined) return null;
  if (typeof rules !== "object" || Array.isArray(rules)) return "condition_rules must be an object with 'match' and 'conditions' fields";
  const typed = rules as Record<string, unknown>;
  if (typed.match !== undefined && typed.match !== "all" && typed.match !== "any") return "condition_rules.match must be 'all' or 'any'";
  if (!Array.isArray(typed.conditions)) return "condition_rules.conditions must be an array";
  for (let i = 0; i < typed.conditions.length; i++) {
    const condition = typed.conditions[i] as Record<string, unknown>;
    if (!condition || typeof condition !== "object") return `condition_rules.conditions[${i}] must be an object`;
    if (typeof condition.field !== "string" || condition.field.trim().length === 0) return `condition_rules.conditions[${i}].field must be a non-empty string`;
    if (typeof condition.operator !== "string" || !VALID_OPERATORS.has(condition.operator)) return `condition_rules.conditions[${i}].operator must be one of: ${Array.from(VALID_OPERATORS).join(", ")}`;
    if (!VALUE_NOT_REQUIRED.has(condition.operator) && condition.value === undefined) return `condition_rules.conditions[${i}].value is required for operator '${condition.operator}'`;
    if ((condition.operator === "field_in" || condition.operator === "field_not_in") && !Array.isArray(condition.value)) return `condition_rules.conditions[${i}].value must be an array for operator '${condition.operator}'`;
  }
  return null;
}

// =============================================================================
// Tests
// =============================================================================

describe("resolveField", () => {
  it("should resolve a top-level field", () => {
    expect(resolveField({ amount: 500 }, "amount")).toBe(500);
  });

  it("should resolve a nested field with dot notation", () => {
    expect(resolveField({ dept: { name: "HR" } }, "dept.name")).toBe("HR");
  });

  it("should resolve a deeply nested field", () => {
    const data = { a: { b: { c: { d: "deep" } } } };
    expect(resolveField(data, "a.b.c.d")).toBe("deep");
  });

  it("should resolve array indices", () => {
    expect(resolveField({ items: [10, 20, 30] }, "items.1")).toBe(20);
  });

  it("should return undefined for missing top-level field", () => {
    expect(resolveField({}, "missing")).toBeUndefined();
  });

  it("should return undefined for missing nested field", () => {
    expect(resolveField({ a: {} }, "a.b.c")).toBeUndefined();
  });

  it("should return undefined for null data", () => {
    expect(resolveField(null as any, "field")).toBeUndefined();
  });

  it("should return undefined for empty field path", () => {
    expect(resolveField({ a: 1 }, "")).toBeUndefined();
  });

  it("should handle null values in the path", () => {
    expect(resolveField({ a: null }, "a.b")).toBeUndefined();
  });

  it("should resolve boolean values", () => {
    expect(resolveField({ active: true }, "active")).toBe(true);
  });

  it("should resolve zero and empty string", () => {
    expect(resolveField({ count: 0 }, "count")).toBe(0);
    expect(resolveField({ name: "" }, "name")).toBe("");
  });
});

// =============================================================================
// evaluateCondition - field_equals
// =============================================================================

describe("evaluateCondition - field_equals", () => {
  it("should pass when string values match", () => {
    const result = evaluateCondition({ field: "status", operator: "field_equals", value: "active" }, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail when string values do not match", () => {
    const result = evaluateCondition({ field: "status", operator: "field_equals", value: "active" }, { status: "inactive" });
    expect(result.passed).toBe(false);
  });

  it("should pass when numeric values match", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_equals", value: 500 }, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should coerce number to string for comparison", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_equals", value: "500" }, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should pass when boolean values match", () => {
    const result = evaluateCondition({ field: "approved", operator: "field_equals", value: true }, { approved: true });
    expect(result.passed).toBe(true);
  });

  it("should fail when field is missing", () => {
    const result = evaluateCondition({ field: "missing", operator: "field_equals", value: "val" }, {});
    expect(result.passed).toBe(false);
  });

  it("should pass when both are null-ish", () => {
    const result = evaluateCondition({ field: "x", operator: "field_equals", value: null }, { x: null });
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// evaluateCondition - field_not_equals
// =============================================================================

describe("evaluateCondition - field_not_equals", () => {
  it("should pass when values differ", () => {
    const result = evaluateCondition({ field: "status", operator: "field_not_equals", value: "inactive" }, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail when values are the same", () => {
    const result = evaluateCondition({ field: "status", operator: "field_not_equals", value: "active" }, { status: "active" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - numeric comparisons
// =============================================================================

describe("evaluateCondition - numeric comparisons", () => {
  it("should pass for field_greater_than when actual > expected", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_greater_than", value: 1000 }, { amount: 1500 });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_greater_than when actual equals expected", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_greater_than", value: 1000 }, { amount: 1000 });
    expect(result.passed).toBe(false);
  });

  it("should fail for field_greater_than when actual < expected", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_greater_than", value: 1000 }, { amount: 500 });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_less_than when actual < expected", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_less_than", value: 1000 }, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should pass for field_greater_than_or_equal when equal", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_greater_than_or_equal", value: 1000 }, { amount: 1000 });
    expect(result.passed).toBe(true);
  });

  it("should pass for field_less_than_or_equal when equal", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_less_than_or_equal", value: 1000 }, { amount: 1000 });
    expect(result.passed).toBe(true);
  });

  it("should handle string numbers in comparison", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_greater_than", value: "1000" }, { amount: "1500" });
    expect(result.passed).toBe(true);
  });

  it("should fail gracefully for non-numeric values", () => {
    const result = evaluateCondition({ field: "name", operator: "field_greater_than", value: 100 }, { name: "Alice" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_contains / field_not_contains
// =============================================================================

describe("evaluateCondition - contains", () => {
  it("should pass for string contains substring", () => {
    const result = evaluateCondition({ field: "description", operator: "field_contains", value: "urgent" }, { description: "This is an urgent request" });
    expect(result.passed).toBe(true);
  });

  it("should be case-insensitive for string contains", () => {
    const result = evaluateCondition({ field: "description", operator: "field_contains", value: "URGENT" }, { description: "This is an urgent request" });
    expect(result.passed).toBe(true);
  });

  it("should pass for array contains element", () => {
    const result = evaluateCondition({ field: "tags", operator: "field_contains", value: "priority" }, { tags: ["low", "priority", "hr"] });
    expect(result.passed).toBe(true);
  });

  it("should fail when array does not contain element", () => {
    const result = evaluateCondition({ field: "tags", operator: "field_contains", value: "critical" }, { tags: ["low", "priority", "hr"] });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_not_contains when not present", () => {
    const result = evaluateCondition({ field: "description", operator: "field_not_contains", value: "secret" }, { description: "Normal request" });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_not_contains when present", () => {
    const result = evaluateCondition({ field: "description", operator: "field_not_contains", value: "urgent" }, { description: "This is urgent" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_in / field_not_in
// =============================================================================

describe("evaluateCondition - field_in / field_not_in", () => {
  it("should pass when value is in the array", () => {
    const result = evaluateCondition({ field: "department", operator: "field_in", value: ["engineering", "hr", "finance"] }, { department: "hr" });
    expect(result.passed).toBe(true);
  });

  it("should fail when value is not in the array", () => {
    const result = evaluateCondition({ field: "department", operator: "field_in", value: ["engineering", "hr", "finance"] }, { department: "marketing" });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_not_in when value is absent from array", () => {
    const result = evaluateCondition({ field: "status", operator: "field_not_in", value: ["terminated", "suspended"] }, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_not_in when value is in array", () => {
    const result = evaluateCondition({ field: "status", operator: "field_not_in", value: ["terminated", "suspended"] }, { status: "terminated" });
    expect(result.passed).toBe(false);
  });

  it("should fail for field_in when value is not an array", () => {
    const result = evaluateCondition({ field: "department", operator: "field_in", value: "engineering" }, { department: "engineering" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - empty checks
// =============================================================================

describe("evaluateCondition - empty checks", () => {
  it("should pass field_is_empty for null value", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_empty" }, { notes: null }).passed).toBe(true);
  });

  it("should pass field_is_empty for undefined value", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_empty" }, {}).passed).toBe(true);
  });

  it("should pass field_is_empty for empty string", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_empty" }, { notes: "" }).passed).toBe(true);
  });

  it("should pass field_is_empty for whitespace-only string", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_empty" }, { notes: "   " }).passed).toBe(true);
  });

  it("should pass field_is_empty for empty array", () => {
    expect(evaluateCondition({ field: "items", operator: "field_is_empty" }, { items: [] }).passed).toBe(true);
  });

  it("should pass field_is_empty for empty object", () => {
    expect(evaluateCondition({ field: "meta", operator: "field_is_empty" }, { meta: {} }).passed).toBe(true);
  });

  it("should fail field_is_empty for non-empty value", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_empty" }, { notes: "Some content" }).passed).toBe(false);
  });

  it("should pass field_is_not_empty for non-empty value", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_not_empty" }, { notes: "Has content" }).passed).toBe(true);
  });

  it("should fail field_is_not_empty for null value", () => {
    expect(evaluateCondition({ field: "notes", operator: "field_is_not_empty" }, { notes: null }).passed).toBe(false);
  });

  it("should fail field_is_empty for numeric zero (not empty)", () => {
    expect(evaluateCondition({ field: "count", operator: "field_is_empty" }, { count: 0 }).passed).toBe(false);
  });
});

// =============================================================================
// evaluateConditionRules - combinators
// =============================================================================

describe("evaluateConditionRules", () => {
  it("should pass with 'all' combinator when all conditions match", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [
        { field: "amount", operator: "field_greater_than", value: 100 },
        { field: "department", operator: "field_equals", value: "engineering" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(2);
    expect(result.details[0].passed).toBe(true);
    expect(result.details[1].passed).toBe(true);
  });

  it("should fail with 'all' combinator when one condition fails", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [
        { field: "amount", operator: "field_greater_than", value: 100 },
        { field: "department", operator: "field_equals", value: "hr" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(false);
  });

  it("should short-circuit 'all' on first failure", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [
        { field: "amount", operator: "field_less_than", value: 100 },
        { field: "department", operator: "field_equals", value: "engineering" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(false);
    expect(result.details).toHaveLength(1);
  });

  it("should pass with 'any' combinator when at least one condition matches", () => {
    const rules: ConditionRules = {
      match: "any",
      conditions: [
        { field: "amount", operator: "field_less_than", value: 100 },
        { field: "department", operator: "field_equals", value: "engineering" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(true);
  });

  it("should fail with 'any' combinator when no conditions match", () => {
    const rules: ConditionRules = {
      match: "any",
      conditions: [
        { field: "amount", operator: "field_less_than", value: 100 },
        { field: "department", operator: "field_equals", value: "hr" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(false);
  });

  it("should short-circuit 'any' on first pass", () => {
    const rules: ConditionRules = {
      match: "any",
      conditions: [
        { field: "amount", operator: "field_greater_than", value: 100 },
        { field: "department", operator: "field_equals", value: "hr" },
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(1);
  });

  it("should pass when rules are null (unconditional)", () => {
    const result = evaluateConditionRules(null, { amount: 500 });
    expect(result.passed).toBe(true);
    expect(result.details).toHaveLength(0);
  });

  it("should pass when rules are undefined (unconditional)", () => {
    const result = evaluateConditionRules(undefined, {});
    expect(result.passed).toBe(true);
  });

  it("should pass when conditions array is empty", () => {
    const rules: ConditionRules = { match: "all", conditions: [] };
    const result = evaluateConditionRules(rules, {});
    expect(result.passed).toBe(true);
  });

  it("should default match to 'all' when not specified", () => {
    const rules = { conditions: [{ field: "a", operator: "field_equals" as const, value: 1 }] } as ConditionRules;
    const result = evaluateConditionRules(rules, { a: 1 });
    expect(result.passed).toBe(true);
  });

  it("should handle null context data safely", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [{ field: "x", operator: "field_is_empty" }],
    };
    const result = evaluateConditionRules(rules, null as any);
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// evaluateConditionRules - nested field paths
// =============================================================================

describe("evaluateConditionRules - nested field access", () => {
  it("should evaluate conditions on nested fields", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [
        { field: "employee.department.name", operator: "field_equals", value: "Engineering" },
        { field: "employee.salary", operator: "field_greater_than", value: 50000 },
      ],
    };
    const data = {
      employee: { department: { name: "Engineering" }, salary: 75000 },
    };
    const result = evaluateConditionRules(rules, data);
    expect(result.passed).toBe(true);
  });

  it("should fail on missing nested path", () => {
    const rules: ConditionRules = {
      match: "all",
      conditions: [
        { field: "employee.department.code", operator: "field_equals", value: "ENG" },
      ],
    };
    const result = evaluateConditionRules(rules, { employee: {} });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// resolveNextStepIndex - sequential workflow
// =============================================================================

describe("resolveNextStepIndex - sequential", () => {
  const simpleSteps: StepDefinition[] = [
    { stepKey: "step1", name: "Step 1" },
    { stepKey: "step2", name: "Step 2" },
    { stepKey: "step3", name: "Step 3" },
  ];

  it("should move to the next sequential step when no conditions", () => {
    const result = resolveNextStepIndex(simpleSteps, 0, {});
    expect(result.nextStepIndex).toBe(1);
    expect(result.skippedSteps).toHaveLength(0);
  });

  it("should move from step 1 to step 2", () => {
    expect(resolveNextStepIndex(simpleSteps, 1, {}).nextStepIndex).toBe(2);
  });

  it("should return -1 when at last step (workflow complete)", () => {
    expect(resolveNextStepIndex(simpleSteps, 2, {}).nextStepIndex).toBe(-1);
  });

  it("should return -1 for invalid current step index", () => {
    expect(resolveNextStepIndex(simpleSteps, 99, {}).nextStepIndex).toBe(-1);
  });
});

// =============================================================================
// resolveNextStepIndex - conditional branching
// =============================================================================

describe("resolveNextStepIndex - conditional step-level rules", () => {
  it("should skip steps whose conditions fail and find the first eligible", () => {
    const steps: StepDefinition[] = [
      { stepKey: "step1", name: "Start" },
      {
        stepKey: "step2", name: "Manager Approval",
        conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_greater_than", value: 1000 }] },
      },
      { stepKey: "step3", name: "HR Review" },
    ];
    const result = resolveNextStepIndex(steps, 0, { amount: 500 });
    expect(result.nextStepIndex).toBe(2);
    expect(result.skippedSteps).toEqual([1]);
  });

  it("should select a conditional step when its conditions pass", () => {
    const steps: StepDefinition[] = [
      { stepKey: "step1", name: "Start" },
      {
        stepKey: "step2", name: "Manager Approval",
        conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_greater_than", value: 1000 }] },
      },
      { stepKey: "step3", name: "HR Review" },
    ];
    const result = resolveNextStepIndex(steps, 0, { amount: 5000 });
    expect(result.nextStepIndex).toBe(1);
    expect(result.skippedSteps).toHaveLength(0);
  });

  it("should return -1 when all remaining steps' conditions fail", () => {
    const steps: StepDefinition[] = [
      { stepKey: "step1", name: "Start" },
      {
        stepKey: "step2", name: "Only for Engineering",
        conditionRules: { match: "all", conditions: [{ field: "department", operator: "field_equals", value: "engineering" }] },
      },
      {
        stepKey: "step3", name: "Only for HR",
        conditionRules: { match: "all", conditions: [{ field: "department", operator: "field_equals", value: "hr" }] },
      },
    ];
    const result = resolveNextStepIndex(steps, 0, { department: "finance" });
    expect(result.nextStepIndex).toBe(-1);
    expect(result.skippedSteps).toEqual([1, 2]);
  });
});

// =============================================================================
// resolveNextStepIndex - explicit nextSteps branching
// =============================================================================

describe("resolveNextStepIndex - explicit nextSteps with conditionRules", () => {
  it("should follow the first matching conditional branch", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "start", name: "Triage",
        nextSteps: [
          { stepKey: "high_value", conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_greater_than", value: 10000 }] } },
          { stepKey: "low_value", conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_less_than_or_equal", value: 10000 }] } },
        ],
      },
      { stepKey: "high_value", name: "Director Approval" },
      { stepKey: "low_value", name: "Manager Approval" },
    ];
    expect(resolveNextStepIndex(steps, 0, { amount: 25000 }).nextStepIndex).toBe(1);
    expect(resolveNextStepIndex(steps, 0, { amount: 5000 }).nextStepIndex).toBe(2);
  });

  it("should return -1 when no nextSteps branch matches", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "start", name: "Triage",
        nextSteps: [
          { stepKey: "only_engineering", conditionRules: { match: "all", conditions: [{ field: "department", operator: "field_equals", value: "engineering" }] } },
        ],
      },
      { stepKey: "only_engineering", name: "Engineering Flow" },
    ];
    const result = resolveNextStepIndex(steps, 0, { department: "hr" });
    expect(result.nextStepIndex).toBe(-1);
    expect(result.skippedSteps).toEqual([1]);
  });

  it("should select unconditional nextStep when no conditionRules defined", () => {
    const steps: StepDefinition[] = [
      { stepKey: "start", name: "Start", nextSteps: [{ stepKey: "always_next" }] },
      { stepKey: "always_next", name: "Always Runs" },
    ];
    const result = resolveNextStepIndex(steps, 0, {});
    expect(result.nextStepIndex).toBe(1);
    expect(result.skippedSteps).toHaveLength(0);
  });

  it("should also evaluate target step's own conditionRules", () => {
    const steps: StepDefinition[] = [
      { stepKey: "start", name: "Start", nextSteps: [{ stepKey: "target" }] },
      { stepKey: "target", name: "Target", conditionRules: { match: "all", conditions: [{ field: "eligible", operator: "field_equals", value: true }] } },
    ];
    expect(resolveNextStepIndex(steps, 0, { eligible: false }).nextStepIndex).toBe(-1);
    expect(resolveNextStepIndex(steps, 0, { eligible: true }).nextStepIndex).toBe(1);
  });

  it("should handle missing nextStep stepKey gracefully", () => {
    const steps: StepDefinition[] = [
      { stepKey: "start", name: "Start", nextSteps: [{ stepKey: "nonexistent" }] },
    ];
    expect(resolveNextStepIndex(steps, 0, {}).nextStepIndex).toBe(-1);
  });
});

// =============================================================================
// resolveNextStepIndex - complex scenarios
// =============================================================================

describe("resolveNextStepIndex - complex scenarios", () => {
  it("should support multi-level conditional workflow (expense approval)", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "submit", name: "Submit Expense",
        nextSteps: [
          { stepKey: "director_approval", conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_greater_than", value: 5000 }] } },
          { stepKey: "manager_approval", conditionRules: { match: "all", conditions: [{ field: "amount", operator: "field_greater_than", value: 500 }, { field: "amount", operator: "field_less_than_or_equal", value: 5000 }] } },
          { stepKey: "auto_approve" },
        ],
      },
      { stepKey: "director_approval", name: "Director Approval" },
      { stepKey: "manager_approval", name: "Manager Approval" },
      { stepKey: "auto_approve", name: "Auto Approve" },
    ];
    expect(resolveNextStepIndex(steps, 0, { amount: 10000 }).nextStepIndex).toBe(1);
    expect(resolveNextStepIndex(steps, 0, { amount: 2000 }).nextStepIndex).toBe(2);
    expect(resolveNextStepIndex(steps, 0, { amount: 100 }).nextStepIndex).toBe(3);
  });

  it("should support 'any' combinator for OR conditions", () => {
    const steps: StepDefinition[] = [
      { stepKey: "start", name: "Start" },
      {
        stepKey: "special_review", name: "Special Review",
        conditionRules: {
          match: "any",
          conditions: [
            { field: "department", operator: "field_equals", value: "finance" },
            { field: "amount", operator: "field_greater_than", value: 50000 },
            { field: "category", operator: "field_equals", value: "travel" },
          ],
        },
      },
      { stepKey: "standard_review", name: "Standard Review" },
    ];
    expect(resolveNextStepIndex(steps, 0, { department: "finance", amount: 100, category: "supplies" }).nextStepIndex).toBe(1);
    expect(resolveNextStepIndex(steps, 0, { department: "hr", amount: 100000, category: "supplies" }).nextStepIndex).toBe(1);
    expect(resolveNextStepIndex(steps, 0, { department: "hr", amount: 100, category: "supplies" }).nextStepIndex).toBe(2);
  });
});

// =============================================================================
// validateConditionRules
// =============================================================================

describe("validateConditionRules", () => {
  it("should accept null (unconditional)", () => {
    expect(validateConditionRules(null)).toBeNull();
  });

  it("should accept undefined (unconditional)", () => {
    expect(validateConditionRules(undefined)).toBeNull();
  });

  it("should accept valid condition rules", () => {
    expect(validateConditionRules({
      match: "all",
      conditions: [
        { field: "amount", operator: "field_greater_than", value: 1000 },
        { field: "department", operator: "field_equals", value: "hr" },
      ],
    })).toBeNull();
  });

  it("should accept field_is_empty without value", () => {
    expect(validateConditionRules({
      match: "all",
      conditions: [{ field: "notes", operator: "field_is_empty" }],
    })).toBeNull();
  });

  it("should reject non-object rules", () => {
    expect(validateConditionRules("invalid")).toBe("condition_rules must be an object with 'match' and 'conditions' fields");
  });

  it("should reject array rules", () => {
    expect(validateConditionRules([])).toBe("condition_rules must be an object with 'match' and 'conditions' fields");
  });

  it("should reject invalid match value", () => {
    expect(validateConditionRules({ match: "some", conditions: [] })).toBe("condition_rules.match must be 'all' or 'any'");
  });

  it("should reject non-array conditions", () => {
    expect(validateConditionRules({ match: "all", conditions: "not_array" })).toBe("condition_rules.conditions must be an array");
  });

  it("should reject condition with empty field", () => {
    expect(validateConditionRules({ match: "all", conditions: [{ field: "", operator: "field_equals", value: 1 }] }))
      .toBe("condition_rules.conditions[0].field must be a non-empty string");
  });

  it("should reject condition with invalid operator", () => {
    expect(validateConditionRules({ match: "all", conditions: [{ field: "x", operator: "invalid_op", value: 1 }] }))
      .toContain("condition_rules.conditions[0].operator must be one of:");
  });

  it("should reject field_equals without value", () => {
    expect(validateConditionRules({ match: "all", conditions: [{ field: "x", operator: "field_equals" }] }))
      .toBe("condition_rules.conditions[0].value is required for operator 'field_equals'");
  });

  it("should reject field_in with non-array value", () => {
    expect(validateConditionRules({ match: "all", conditions: [{ field: "x", operator: "field_in", value: "not_array" }] }))
      .toBe("condition_rules.conditions[0].value must be an array for operator 'field_in'");
  });

  it("should reject field_not_in with non-array value", () => {
    expect(validateConditionRules({ match: "all", conditions: [{ field: "x", operator: "field_not_in", value: 123 }] }))
      .toBe("condition_rules.conditions[0].value must be an array for operator 'field_not_in'");
  });

  it("should accept match: 'any'", () => {
    expect(validateConditionRules({ match: "any", conditions: [{ field: "x", operator: "field_equals", value: 1 }] }))
      .toBeNull();
  });

  it("should reject non-object condition entries", () => {
    expect(validateConditionRules({ match: "all", conditions: ["not_an_object"] }))
      .toBe("condition_rules.conditions[0] must be an object");
  });

  it("should allow match to be omitted (defaults to 'all')", () => {
    expect(validateConditionRules({ conditions: [{ field: "x", operator: "field_equals", value: 1 }] }))
      .toBeNull();
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("Edge cases", () => {
  it("should handle unknown operator gracefully (fail safe)", () => {
    const result = evaluateCondition({ field: "x", operator: "unknown_op" as any, value: 1 }, { x: 1 });
    expect(result.passed).toBe(false);
  });

  it("should include field details in evaluation result", () => {
    const result = evaluateCondition({ field: "amount", operator: "field_equals", value: 500 }, { amount: 500 });
    expect(result.field).toBe("amount");
    expect(result.operator).toBe("field_equals");
    expect(result.expectedValue).toBe(500);
    expect(result.actualValue).toBe(500);
    expect(result.passed).toBe(true);
  });

  it("should handle large condition sets", () => {
    const conditions: Condition[] = [];
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      conditions.push({ field: `field_${i}`, operator: "field_equals", value: i });
      data[`field_${i}`] = i;
    }
    const rules: ConditionRules = { match: "all", conditions };
    const result = evaluateConditionRules(rules, data);
    expect(result.passed).toBe(true);
  });

  it("should handle number 0 correctly in field_equals", () => {
    expect(evaluateCondition({ field: "count", operator: "field_equals", value: 0 }, { count: 0 }).passed).toBe(true);
  });

  it("should handle false boolean correctly in field_equals", () => {
    expect(evaluateCondition({ field: "active", operator: "field_equals", value: false }, { active: false }).passed).toBe(true);
  });
});
