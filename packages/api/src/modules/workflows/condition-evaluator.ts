/**
 * Workflow Condition Evaluator
 *
 * Evaluates condition rules against workflow instance context data to determine
 * which branch a workflow should follow at runtime.
 *
 * Supports operators: field_equals, field_not_equals, field_greater_than,
 * field_less_than, field_greater_than_or_equal, field_less_than_or_equal,
 * field_contains, field_not_contains, field_in, field_not_in,
 * field_is_empty, field_is_not_empty
 *
 * Supports combinators: "all" (AND) and "any" (OR)
 */

// =============================================================================
// Types
// =============================================================================

export type ConditionOperator =
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

export interface Condition {
  /** Dot-notation path to the field in context data (e.g., "amount", "department.name") */
  field: string;
  /** The comparison operator */
  operator: ConditionOperator;
  /** The value to compare against. Not required for field_is_empty / field_is_not_empty. */
  value?: unknown;
}

export interface ConditionRules {
  /** How to combine multiple conditions: "all" = AND, "any" = OR. Defaults to "all". */
  match: "all" | "any";
  /** Array of conditions to evaluate */
  conditions: Condition[];
}

export interface ConditionEvaluationResult {
  /** Whether the conditions were met */
  passed: boolean;
  /** Detail per condition, useful for debugging and audit */
  details: ConditionDetail[];
}

export interface ConditionDetail {
  field: string;
  operator: ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
}

// =============================================================================
// Field Resolution
// =============================================================================

/**
 * Resolves a dot-notation field path against a data object.
 *
 * Examples:
 *   resolveField({ amount: 500 }, "amount") => 500
 *   resolveField({ dept: { name: "HR" } }, "dept.name") => "HR"
 *   resolveField({ items: [1,2,3] }, "items.1") => 2
 *   resolveField({}, "missing.field") => undefined
 */
export function resolveField(data: Record<string, unknown>, fieldPath: string): unknown {
  if (!data || typeof data !== "object" || !fieldPath) {
    return undefined;
  }

  const parts = fieldPath.split(".");
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const index = parseInt(part, 10);
      if (Number.isNaN(index)) {
        return undefined;
      }
      current = current[index];
    } else {
      return undefined;
    }
  }

  return current;
}

// =============================================================================
// Individual Condition Evaluation
// =============================================================================

/**
 * Evaluates a single condition against the provided context data.
 */
export function evaluateCondition(
  condition: Condition,
  contextData: Record<string, unknown>
): ConditionDetail {
  const actualValue = resolveField(contextData, condition.field);
  const expectedValue = condition.value;
  let passed = false;

  switch (condition.operator) {
    case "field_equals":
      passed = isEqual(actualValue, expectedValue);
      break;

    case "field_not_equals":
      passed = !isEqual(actualValue, expectedValue);
      break;

    case "field_greater_than":
      passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) > toNumber(expectedValue);
      break;

    case "field_less_than":
      passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) < toNumber(expectedValue);
      break;

    case "field_greater_than_or_equal":
      passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) >= toNumber(expectedValue);
      break;

    case "field_less_than_or_equal":
      passed = isComparable(actualValue, expectedValue) && toNumber(actualValue) <= toNumber(expectedValue);
      break;

    case "field_contains":
      passed = containsValue(actualValue, expectedValue);
      break;

    case "field_not_contains":
      passed = !containsValue(actualValue, expectedValue);
      break;

    case "field_in":
      passed = isValueIn(actualValue, expectedValue);
      break;

    case "field_not_in":
      passed = !isValueIn(actualValue, expectedValue);
      break;

    case "field_is_empty":
      passed = isEmpty(actualValue);
      break;

    case "field_is_not_empty":
      passed = !isEmpty(actualValue);
      break;

    default:
      // Unknown operator - condition fails safely
      passed = false;
      break;
  }

  return {
    field: condition.field,
    operator: condition.operator,
    expectedValue,
    actualValue,
    passed,
  };
}

// =============================================================================
// Condition Rules Evaluation
// =============================================================================

/**
 * Evaluates a full set of condition rules against the provided context data.
 *
 * If conditionRules is null/undefined or has no conditions, returns { passed: true }.
 * This allows unconditional steps to always proceed.
 */
export function evaluateConditionRules(
  conditionRules: ConditionRules | null | undefined,
  contextData: Record<string, unknown>
): ConditionEvaluationResult {
  // No rules means unconditional - always passes
  if (!conditionRules || !conditionRules.conditions || conditionRules.conditions.length === 0) {
    return { passed: true, details: [] };
  }

  const safeData = contextData || {};
  const match = conditionRules.match || "all";
  const details: ConditionDetail[] = [];

  for (const condition of conditionRules.conditions) {
    const detail = evaluateCondition(condition, safeData);
    details.push(detail);

    // Short-circuit for "any" mode: if one passes, the whole set passes
    if (match === "any" && detail.passed) {
      return { passed: true, details };
    }

    // Short-circuit for "all" mode: if one fails, the whole set fails
    if (match === "all" && !detail.passed) {
      return { passed: false, details };
    }
  }

  // After evaluating all conditions:
  // "all" mode: if we got here, all passed
  // "any" mode: if we got here, none passed
  const passed = match === "all";
  return { passed, details };
}

// =============================================================================
// Step Selection with Conditional Branching
// =============================================================================

export interface StepDefinition {
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

/**
 * Determines the next step(s) to execute after the current step completes.
 *
 * Resolution order:
 * 1. If the current step has nextSteps with conditionRules, evaluate each candidate.
 *    The first nextStep whose conditionRules pass (or that has no conditionRules) is selected.
 * 2. If no nextSteps are defined, fall through to the next step by index.
 * 3. If the fallback next step has conditionRules, evaluate them. If they fail, skip it
 *    and check subsequent steps until one passes or the workflow ends.
 *
 * Returns the index of the next step to execute, or -1 if the workflow should complete.
 */
export function resolveNextStepIndex(
  steps: StepDefinition[],
  currentStepIndex: number,
  contextData: Record<string, unknown>
): { nextStepIndex: number; skippedSteps: number[] } {
  const currentStep = steps[currentStepIndex];
  const skippedSteps: number[] = [];

  if (!currentStep) {
    return { nextStepIndex: -1, skippedSteps };
  }

  // Strategy 1: Explicit nextSteps with conditional routing
  if (currentStep.nextSteps && currentStep.nextSteps.length > 0) {
    for (const nextStepRef of currentStep.nextSteps) {
      const targetIndex = steps.findIndex((s) => s.stepKey === nextStepRef.stepKey);
      if (targetIndex === -1) continue;

      // Evaluate the transition-level conditionRules (on the nextSteps entry)
      const transitionResult = evaluateConditionRules(nextStepRef.conditionRules, contextData);
      if (!transitionResult.passed) {
        skippedSteps.push(targetIndex);
        continue;
      }

      // Also evaluate the target step's own conditionRules
      const targetStep = steps[targetIndex];
      const stepResult = evaluateConditionRules(targetStep?.conditionRules, contextData);
      if (!stepResult.passed) {
        skippedSteps.push(targetIndex);
        continue;
      }

      return { nextStepIndex: targetIndex, skippedSteps };
    }

    // No nextSteps candidate matched - workflow completes
    return { nextStepIndex: -1, skippedSteps };
  }

  // Strategy 2: Sequential fallthrough with condition evaluation
  for (let i = currentStepIndex + 1; i < steps.length; i++) {
    const candidateStep = steps[i];
    const result = evaluateConditionRules(candidateStep?.conditionRules, contextData);

    if (result.passed) {
      return { nextStepIndex: i, skippedSteps };
    }

    skippedSteps.push(i);
  }

  // No more steps or all remaining steps' conditions failed
  return { nextStepIndex: -1, skippedSteps };
}

// =============================================================================
// Validation
// =============================================================================

const VALID_OPERATORS: Set<string> = new Set([
  "field_equals",
  "field_not_equals",
  "field_greater_than",
  "field_less_than",
  "field_greater_than_or_equal",
  "field_less_than_or_equal",
  "field_contains",
  "field_not_contains",
  "field_in",
  "field_not_in",
  "field_is_empty",
  "field_is_not_empty",
]);

const VALUE_NOT_REQUIRED: Set<string> = new Set([
  "field_is_empty",
  "field_is_not_empty",
]);

/**
 * Validates that condition rules are well-formed.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateConditionRules(rules: unknown): string | null {
  if (rules === null || rules === undefined) {
    return null; // No rules is valid (unconditional)
  }

  if (typeof rules !== "object" || Array.isArray(rules)) {
    return "condition_rules must be an object with 'match' and 'conditions' fields";
  }

  const typed = rules as Record<string, unknown>;

  if (typed.match !== undefined && typed.match !== "all" && typed.match !== "any") {
    return "condition_rules.match must be 'all' or 'any'";
  }

  if (!Array.isArray(typed.conditions)) {
    return "condition_rules.conditions must be an array";
  }

  for (let i = 0; i < typed.conditions.length; i++) {
    const condition = typed.conditions[i] as Record<string, unknown>;

    if (!condition || typeof condition !== "object") {
      return `condition_rules.conditions[${i}] must be an object`;
    }

    if (typeof condition.field !== "string" || condition.field.trim().length === 0) {
      return `condition_rules.conditions[${i}].field must be a non-empty string`;
    }

    if (typeof condition.operator !== "string" || !VALID_OPERATORS.has(condition.operator)) {
      return `condition_rules.conditions[${i}].operator must be one of: ${Array.from(VALID_OPERATORS).join(", ")}`;
    }

    // Validate that value is provided for operators that need it
    if (!VALUE_NOT_REQUIRED.has(condition.operator) && condition.value === undefined) {
      return `condition_rules.conditions[${i}].value is required for operator '${condition.operator}'`;
    }

    // Validate that field_in / field_not_in have array values
    if ((condition.operator === "field_in" || condition.operator === "field_not_in") && !Array.isArray(condition.value)) {
      return `condition_rules.conditions[${i}].value must be an array for operator '${condition.operator}'`;
    }
  }

  return null;
}

// =============================================================================
// Internal Helpers
// =============================================================================

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return a == b;

  // Coerce numbers for comparison: "500" == 500
  if (typeof a === "number" && typeof b === "string") {
    return a === Number(b);
  }
  if (typeof a === "string" && typeof b === "number") {
    return Number(a) === b;
  }

  // Boolean string coercion
  if (typeof a === "boolean" && typeof b === "string") {
    return a === (b === "true");
  }
  if (typeof a === "string" && typeof b === "boolean") {
    return (a === "true") === b;
  }

  return String(a) === String(b);
}

function isComparable(a: unknown, b: unknown): boolean {
  return typeof toNumber(a) === "number" && typeof toNumber(b) === "number"
    && !Number.isNaN(toNumber(a)) && !Number.isNaN(toNumber(b));
}

function toNumber(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const num = Number(val);
    return Number.isNaN(num) ? NaN : num;
  }
  if (typeof val === "boolean") return val ? 1 : 0;
  return NaN;
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && (typeof expected === "string" || typeof expected === "number")) {
    return actual.toLowerCase().includes(String(expected).toLowerCase());
  }

  if (Array.isArray(actual)) {
    return actual.some((item) => isEqual(item, expected));
  }

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
