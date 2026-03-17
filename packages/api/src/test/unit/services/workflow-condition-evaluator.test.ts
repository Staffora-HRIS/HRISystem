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
 * NOTE: These tests import the condition evaluator directly since it is
 * a pure function module with no database dependencies.
 */

import { describe, it, expect } from "bun:test";
import {
  resolveField,
  evaluateCondition,
  evaluateConditionRules,
  resolveNextStepIndex,
  validateConditionRules,
  type Condition,
  type ConditionRules,
  type StepDefinition,
} from "../../../modules/workflows/condition-evaluator";

// =============================================================================
// resolveField
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
    const condition: Condition = { field: "status", operator: "field_equals", value: "active" };
    const result = evaluateCondition(condition, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail when string values do not match", () => {
    const condition: Condition = { field: "status", operator: "field_equals", value: "active" };
    const result = evaluateCondition(condition, { status: "inactive" });
    expect(result.passed).toBe(false);
  });

  it("should pass when numeric values match", () => {
    const condition: Condition = { field: "amount", operator: "field_equals", value: 500 };
    const result = evaluateCondition(condition, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should coerce number to string for comparison", () => {
    const condition: Condition = { field: "amount", operator: "field_equals", value: "500" };
    const result = evaluateCondition(condition, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should pass when boolean values match", () => {
    const condition: Condition = { field: "approved", operator: "field_equals", value: true };
    const result = evaluateCondition(condition, { approved: true });
    expect(result.passed).toBe(true);
  });

  it("should fail when field is missing", () => {
    const condition: Condition = { field: "missing", operator: "field_equals", value: "val" };
    const result = evaluateCondition(condition, {});
    expect(result.passed).toBe(false);
  });

  it("should pass when both are null-ish", () => {
    const condition: Condition = { field: "x", operator: "field_equals", value: null };
    const result = evaluateCondition(condition, { x: null });
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// evaluateCondition - field_not_equals
// =============================================================================

describe("evaluateCondition - field_not_equals", () => {
  it("should pass when values differ", () => {
    const condition: Condition = { field: "status", operator: "field_not_equals", value: "inactive" };
    const result = evaluateCondition(condition, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail when values are the same", () => {
    const condition: Condition = { field: "status", operator: "field_not_equals", value: "active" };
    const result = evaluateCondition(condition, { status: "active" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_greater_than / field_less_than
// =============================================================================

describe("evaluateCondition - numeric comparisons", () => {
  it("should pass for field_greater_than when actual > expected", () => {
    const condition: Condition = { field: "amount", operator: "field_greater_than", value: 1000 };
    const result = evaluateCondition(condition, { amount: 1500 });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_greater_than when actual equals expected", () => {
    const condition: Condition = { field: "amount", operator: "field_greater_than", value: 1000 };
    const result = evaluateCondition(condition, { amount: 1000 });
    expect(result.passed).toBe(false);
  });

  it("should fail for field_greater_than when actual < expected", () => {
    const condition: Condition = { field: "amount", operator: "field_greater_than", value: 1000 };
    const result = evaluateCondition(condition, { amount: 500 });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_less_than when actual < expected", () => {
    const condition: Condition = { field: "amount", operator: "field_less_than", value: 1000 };
    const result = evaluateCondition(condition, { amount: 500 });
    expect(result.passed).toBe(true);
  });

  it("should pass for field_greater_than_or_equal when equal", () => {
    const condition: Condition = { field: "amount", operator: "field_greater_than_or_equal", value: 1000 };
    const result = evaluateCondition(condition, { amount: 1000 });
    expect(result.passed).toBe(true);
  });

  it("should pass for field_less_than_or_equal when equal", () => {
    const condition: Condition = { field: "amount", operator: "field_less_than_or_equal", value: 1000 };
    const result = evaluateCondition(condition, { amount: 1000 });
    expect(result.passed).toBe(true);
  });

  it("should handle string numbers in comparison", () => {
    const condition: Condition = { field: "amount", operator: "field_greater_than", value: "1000" };
    const result = evaluateCondition(condition, { amount: "1500" });
    expect(result.passed).toBe(true);
  });

  it("should fail gracefully for non-numeric values", () => {
    const condition: Condition = { field: "name", operator: "field_greater_than", value: 100 };
    const result = evaluateCondition(condition, { name: "Alice" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_contains / field_not_contains
// =============================================================================

describe("evaluateCondition - contains", () => {
  it("should pass for string contains substring", () => {
    const condition: Condition = { field: "description", operator: "field_contains", value: "urgent" };
    const result = evaluateCondition(condition, { description: "This is an urgent request" });
    expect(result.passed).toBe(true);
  });

  it("should be case-insensitive for string contains", () => {
    const condition: Condition = { field: "description", operator: "field_contains", value: "URGENT" };
    const result = evaluateCondition(condition, { description: "This is an urgent request" });
    expect(result.passed).toBe(true);
  });

  it("should pass for array contains element", () => {
    const condition: Condition = { field: "tags", operator: "field_contains", value: "priority" };
    const result = evaluateCondition(condition, { tags: ["low", "priority", "hr"] });
    expect(result.passed).toBe(true);
  });

  it("should fail when array does not contain element", () => {
    const condition: Condition = { field: "tags", operator: "field_contains", value: "critical" };
    const result = evaluateCondition(condition, { tags: ["low", "priority", "hr"] });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_not_contains when not present", () => {
    const condition: Condition = { field: "description", operator: "field_not_contains", value: "secret" };
    const result = evaluateCondition(condition, { description: "Normal request" });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_not_contains when present", () => {
    const condition: Condition = { field: "description", operator: "field_not_contains", value: "urgent" };
    const result = evaluateCondition(condition, { description: "This is urgent" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_in / field_not_in
// =============================================================================

describe("evaluateCondition - field_in / field_not_in", () => {
  it("should pass when value is in the array", () => {
    const condition: Condition = { field: "department", operator: "field_in", value: ["engineering", "hr", "finance"] };
    const result = evaluateCondition(condition, { department: "hr" });
    expect(result.passed).toBe(true);
  });

  it("should fail when value is not in the array", () => {
    const condition: Condition = { field: "department", operator: "field_in", value: ["engineering", "hr", "finance"] };
    const result = evaluateCondition(condition, { department: "marketing" });
    expect(result.passed).toBe(false);
  });

  it("should pass for field_not_in when value is absent from array", () => {
    const condition: Condition = { field: "status", operator: "field_not_in", value: ["terminated", "suspended"] };
    const result = evaluateCondition(condition, { status: "active" });
    expect(result.passed).toBe(true);
  });

  it("should fail for field_not_in when value is in array", () => {
    const condition: Condition = { field: "status", operator: "field_not_in", value: ["terminated", "suspended"] };
    const result = evaluateCondition(condition, { status: "terminated" });
    expect(result.passed).toBe(false);
  });

  it("should fail for field_in when value is not an array", () => {
    const condition: Condition = { field: "department", operator: "field_in", value: "engineering" };
    const result = evaluateCondition(condition, { department: "engineering" });
    expect(result.passed).toBe(false);
  });
});

// =============================================================================
// evaluateCondition - field_is_empty / field_is_not_empty
// =============================================================================

describe("evaluateCondition - empty checks", () => {
  it("should pass field_is_empty for null value", () => {
    const condition: Condition = { field: "notes", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { notes: null });
    expect(result.passed).toBe(true);
  });

  it("should pass field_is_empty for undefined value", () => {
    const condition: Condition = { field: "notes", operator: "field_is_empty" };
    const result = evaluateCondition(condition, {});
    expect(result.passed).toBe(true);
  });

  it("should pass field_is_empty for empty string", () => {
    const condition: Condition = { field: "notes", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { notes: "" });
    expect(result.passed).toBe(true);
  });

  it("should pass field_is_empty for whitespace-only string", () => {
    const condition: Condition = { field: "notes", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { notes: "   " });
    expect(result.passed).toBe(true);
  });

  it("should pass field_is_empty for empty array", () => {
    const condition: Condition = { field: "items", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { items: [] });
    expect(result.passed).toBe(true);
  });

  it("should pass field_is_empty for empty object", () => {
    const condition: Condition = { field: "meta", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { meta: {} });
    expect(result.passed).toBe(true);
  });

  it("should fail field_is_empty for non-empty value", () => {
    const condition: Condition = { field: "notes", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { notes: "Some content" });
    expect(result.passed).toBe(false);
  });

  it("should pass field_is_not_empty for non-empty value", () => {
    const condition: Condition = { field: "notes", operator: "field_is_not_empty" };
    const result = evaluateCondition(condition, { notes: "Has content" });
    expect(result.passed).toBe(true);
  });

  it("should fail field_is_not_empty for null value", () => {
    const condition: Condition = { field: "notes", operator: "field_is_not_empty" };
    const result = evaluateCondition(condition, { notes: null });
    expect(result.passed).toBe(false);
  });

  it("should fail field_is_empty for numeric zero (not empty)", () => {
    const condition: Condition = { field: "count", operator: "field_is_empty" };
    const result = evaluateCondition(condition, { count: 0 });
    expect(result.passed).toBe(false);
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
        { field: "amount", operator: "field_less_than", value: 100 }, // fails
        { field: "department", operator: "field_equals", value: "engineering" }, // not evaluated
      ],
    };
    const result = evaluateConditionRules(rules, { amount: 500, department: "engineering" });
    expect(result.passed).toBe(false);
    // Only the first condition should be evaluated due to short-circuit
    expect(result.details).toHaveLength(1);
  });

  it("should pass with 'any' combinator when at least one condition matches", () => {
    const rules: ConditionRules = {
      match: "any",
      conditions: [
        { field: "amount", operator: "field_less_than", value: 100 }, // fails
        { field: "department", operator: "field_equals", value: "engineering" }, // passes
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
        { field: "amount", operator: "field_greater_than", value: 100 }, // passes
        { field: "department", operator: "field_equals", value: "hr" }, // not evaluated
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
      employee: {
        department: { name: "Engineering" },
        salary: 75000,
      },
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
    const result = resolveNextStepIndex(simpleSteps, 1, {});
    expect(result.nextStepIndex).toBe(2);
  });

  it("should return -1 when at last step (workflow complete)", () => {
    const result = resolveNextStepIndex(simpleSteps, 2, {});
    expect(result.nextStepIndex).toBe(-1);
  });

  it("should return -1 for invalid current step index", () => {
    const result = resolveNextStepIndex(simpleSteps, 99, {});
    expect(result.nextStepIndex).toBe(-1);
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
        stepKey: "step2",
        name: "Manager Approval",
        conditionRules: {
          match: "all",
          conditions: [{ field: "amount", operator: "field_greater_than", value: 1000 }],
        },
      },
      { stepKey: "step3", name: "HR Review" },
    ];

    // amount is 500, so step2 condition fails, should skip to step3
    const result = resolveNextStepIndex(steps, 0, { amount: 500 });
    expect(result.nextStepIndex).toBe(2);
    expect(result.skippedSteps).toEqual([1]);
  });

  it("should select a conditional step when its conditions pass", () => {
    const steps: StepDefinition[] = [
      { stepKey: "step1", name: "Start" },
      {
        stepKey: "step2",
        name: "Manager Approval",
        conditionRules: {
          match: "all",
          conditions: [{ field: "amount", operator: "field_greater_than", value: 1000 }],
        },
      },
      { stepKey: "step3", name: "HR Review" },
    ];

    // amount is 5000, so step2 condition passes
    const result = resolveNextStepIndex(steps, 0, { amount: 5000 });
    expect(result.nextStepIndex).toBe(1);
    expect(result.skippedSteps).toHaveLength(0);
  });

  it("should return -1 when all remaining steps' conditions fail", () => {
    const steps: StepDefinition[] = [
      { stepKey: "step1", name: "Start" },
      {
        stepKey: "step2",
        name: "Only for Engineering",
        conditionRules: {
          match: "all",
          conditions: [{ field: "department", operator: "field_equals", value: "engineering" }],
        },
      },
      {
        stepKey: "step3",
        name: "Only for HR",
        conditionRules: {
          match: "all",
          conditions: [{ field: "department", operator: "field_equals", value: "hr" }],
        },
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
        stepKey: "start",
        name: "Triage",
        nextSteps: [
          {
            stepKey: "high_value",
            conditionRules: {
              match: "all",
              conditions: [{ field: "amount", operator: "field_greater_than", value: 10000 }],
            },
          },
          {
            stepKey: "low_value",
            conditionRules: {
              match: "all",
              conditions: [{ field: "amount", operator: "field_less_than_or_equal", value: 10000 }],
            },
          },
        ],
      },
      { stepKey: "high_value", name: "Director Approval" },
      { stepKey: "low_value", name: "Manager Approval" },
    ];

    // High value path
    const highResult = resolveNextStepIndex(steps, 0, { amount: 25000 });
    expect(highResult.nextStepIndex).toBe(1); // high_value

    // Low value path
    const lowResult = resolveNextStepIndex(steps, 0, { amount: 5000 });
    expect(lowResult.nextStepIndex).toBe(2); // low_value
  });

  it("should return -1 when no nextSteps branch matches", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "start",
        name: "Triage",
        nextSteps: [
          {
            stepKey: "only_engineering",
            conditionRules: {
              match: "all",
              conditions: [{ field: "department", operator: "field_equals", value: "engineering" }],
            },
          },
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
      {
        stepKey: "start",
        name: "Start",
        nextSteps: [{ stepKey: "always_next" }], // No conditionRules
      },
      { stepKey: "always_next", name: "Always Runs" },
    ];

    const result = resolveNextStepIndex(steps, 0, {});
    expect(result.nextStepIndex).toBe(1);
    expect(result.skippedSteps).toHaveLength(0);
  });

  it("should also evaluate target step's own conditionRules", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "start",
        name: "Start",
        nextSteps: [
          { stepKey: "target" }, // No transition conditionRules
        ],
      },
      {
        stepKey: "target",
        name: "Target",
        conditionRules: {
          match: "all",
          conditions: [{ field: "eligible", operator: "field_equals", value: true }],
        },
      },
    ];

    // Target's own conditionRules fail
    const failResult = resolveNextStepIndex(steps, 0, { eligible: false });
    expect(failResult.nextStepIndex).toBe(-1);
    expect(failResult.skippedSteps).toEqual([1]);

    // Target's own conditionRules pass
    const passResult = resolveNextStepIndex(steps, 0, { eligible: true });
    expect(passResult.nextStepIndex).toBe(1);
  });

  it("should handle missing nextStep stepKey gracefully", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "start",
        name: "Start",
        nextSteps: [
          { stepKey: "nonexistent" },
        ],
      },
    ];

    const result = resolveNextStepIndex(steps, 0, {});
    expect(result.nextStepIndex).toBe(-1);
  });
});

// =============================================================================
// resolveNextStepIndex - complex branching scenarios
// =============================================================================

describe("resolveNextStepIndex - complex scenarios", () => {
  it("should support multi-level conditional workflow (expense approval)", () => {
    const steps: StepDefinition[] = [
      {
        stepKey: "submit",
        name: "Submit Expense",
        nextSteps: [
          {
            stepKey: "director_approval",
            conditionRules: {
              match: "all",
              conditions: [{ field: "amount", operator: "field_greater_than", value: 5000 }],
            },
          },
          {
            stepKey: "manager_approval",
            conditionRules: {
              match: "all",
              conditions: [
                { field: "amount", operator: "field_greater_than", value: 500 },
                { field: "amount", operator: "field_less_than_or_equal", value: 5000 },
              ],
            },
          },
          {
            stepKey: "auto_approve",
            // No conditions = fallback
          },
        ],
      },
      { stepKey: "director_approval", name: "Director Approval" },
      { stepKey: "manager_approval", name: "Manager Approval" },
      { stepKey: "auto_approve", name: "Auto Approve" },
    ];

    // High amount -> director
    expect(resolveNextStepIndex(steps, 0, { amount: 10000 }).nextStepIndex).toBe(1);
    // Medium amount -> manager
    expect(resolveNextStepIndex(steps, 0, { amount: 2000 }).nextStepIndex).toBe(2);
    // Low amount -> auto approve
    expect(resolveNextStepIndex(steps, 0, { amount: 100 }).nextStepIndex).toBe(3);
  });

  it("should support 'any' combinator for OR conditions", () => {
    const steps: StepDefinition[] = [
      { stepKey: "start", name: "Start" },
      {
        stepKey: "special_review",
        name: "Special Review",
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

    // Finance department triggers special review
    expect(resolveNextStepIndex(steps, 0, { department: "finance", amount: 100, category: "supplies" }).nextStepIndex).toBe(1);
    // High amount triggers special review
    expect(resolveNextStepIndex(steps, 0, { department: "hr", amount: 100000, category: "supplies" }).nextStepIndex).toBe(1);
    // None match - falls through to standard
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
    const rules = {
      match: "all",
      conditions: [
        { field: "amount", operator: "field_greater_than", value: 1000 },
        { field: "department", operator: "field_equals", value: "hr" },
      ],
    };
    expect(validateConditionRules(rules)).toBeNull();
  });

  it("should accept field_is_empty without value", () => {
    const rules = {
      match: "all",
      conditions: [
        { field: "notes", operator: "field_is_empty" },
      ],
    };
    expect(validateConditionRules(rules)).toBeNull();
  });

  it("should reject non-object rules", () => {
    expect(validateConditionRules("invalid")).toBe("condition_rules must be an object with 'match' and 'conditions' fields");
  });

  it("should reject array rules", () => {
    expect(validateConditionRules([])).toBe("condition_rules must be an object with 'match' and 'conditions' fields");
  });

  it("should reject invalid match value", () => {
    const rules = { match: "some", conditions: [] };
    expect(validateConditionRules(rules)).toBe("condition_rules.match must be 'all' or 'any'");
  });

  it("should reject non-array conditions", () => {
    const rules = { match: "all", conditions: "not_array" };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions must be an array");
  });

  it("should reject condition with empty field", () => {
    const rules = {
      match: "all",
      conditions: [{ field: "", operator: "field_equals", value: 1 }],
    };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions[0].field must be a non-empty string");
  });

  it("should reject condition with invalid operator", () => {
    const rules = {
      match: "all",
      conditions: [{ field: "x", operator: "invalid_op", value: 1 }],
    };
    expect(validateConditionRules(rules)).toContain("condition_rules.conditions[0].operator must be one of:");
  });

  it("should reject field_equals without value", () => {
    const rules = {
      match: "all",
      conditions: [{ field: "x", operator: "field_equals" }],
    };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions[0].value is required for operator 'field_equals'");
  });

  it("should reject field_in with non-array value", () => {
    const rules = {
      match: "all",
      conditions: [{ field: "x", operator: "field_in", value: "not_array" }],
    };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions[0].value must be an array for operator 'field_in'");
  });

  it("should reject field_not_in with non-array value", () => {
    const rules = {
      match: "all",
      conditions: [{ field: "x", operator: "field_not_in", value: 123 }],
    };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions[0].value must be an array for operator 'field_not_in'");
  });

  it("should accept match: 'any'", () => {
    const rules = {
      match: "any",
      conditions: [{ field: "x", operator: "field_equals", value: 1 }],
    };
    expect(validateConditionRules(rules)).toBeNull();
  });

  it("should reject non-object condition entries", () => {
    const rules = {
      match: "all",
      conditions: ["not_an_object"],
    };
    expect(validateConditionRules(rules)).toBe("condition_rules.conditions[0] must be an object");
  });

  it("should allow match to be omitted (defaults to 'all')", () => {
    const rules = {
      conditions: [{ field: "x", operator: "field_equals", value: 1 }],
    };
    expect(validateConditionRules(rules)).toBeNull();
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe("Edge cases", () => {
  it("should handle unknown operator gracefully (fail safe)", () => {
    const condition: Condition = { field: "x", operator: "unknown_op" as any, value: 1 };
    const result = evaluateCondition(condition, { x: 1 });
    expect(result.passed).toBe(false);
  });

  it("should include field details in evaluation result", () => {
    const condition: Condition = { field: "amount", operator: "field_equals", value: 500 };
    const result = evaluateCondition(condition, { amount: 500 });
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
    const condition: Condition = { field: "count", operator: "field_equals", value: 0 };
    const result = evaluateCondition(condition, { count: 0 });
    expect(result.passed).toBe(true);
  });

  it("should handle false boolean correctly in field_equals", () => {
    const condition: Condition = { field: "active", operator: "field_equals", value: false };
    const result = evaluateCondition(condition, { active: false });
    expect(result.passed).toBe(true);
  });
});
