/**
 * Contract Test Helper
 *
 * Validates API response bodies against TypeBox schemas to ensure
 * the actual response shape matches the declared contract.
 *
 * Uses TypeBox's Value.Check() for boolean validation and Value.Errors()
 * for detailed field-level mismatch reporting.
 */

import { Value } from "@sinclair/typebox/value";
import type { TSchema } from "@sinclair/typebox";
import { expect } from "bun:test";

// ============================================================================
// Types
// ============================================================================

export interface ContractViolation {
  path: string;
  message: string;
  type: number;
  value: unknown;
  schema: Record<string, unknown>;
}

export interface ContractResult {
  valid: boolean;
  violations: ContractViolation[];
}

// ============================================================================
// Core Validation
// ============================================================================

/**
 * Validate a value against a TypeBox schema and return detailed results.
 *
 * @param schema  - The TypeBox schema to validate against
 * @param value   - The response body (parsed JSON) to check
 * @returns ContractResult with valid flag and detailed violations
 */
export function validateContract(schema: TSchema, value: unknown): ContractResult {
  const valid = Value.Check(schema, value);

  if (valid) {
    return { valid: true, violations: [] };
  }

  const violations: ContractViolation[] = [];
  const errors = Value.Errors(schema, value);

  for (const error of errors) {
    violations.push({
      path: error.path,
      message: error.message,
      type: error.type,
      value: error.value,
      schema: error.schema as Record<string, unknown>,
    });
  }

  return { valid: false, violations };
}

/**
 * Format contract violations into a human-readable report.
 * Useful for test failure messages.
 */
export function formatViolations(violations: ContractViolation[]): string {
  if (violations.length === 0) return "No violations";

  const lines = violations.map((v, i) => {
    const valuePreview =
      v.value === undefined
        ? "undefined"
        : typeof v.value === "object"
          ? JSON.stringify(v.value)?.slice(0, 80) + "..."
          : String(v.value);

    return [
      `  [${i + 1}] Path: ${v.path || "(root)"}`,
      `      Message: ${v.message}`,
      `      Got: ${valuePreview}`,
    ].join("\n");
  });

  return `Contract violations (${violations.length}):\n${lines.join("\n")}`;
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a value conforms to a TypeBox schema.
 * Throws with detailed violation report on failure.
 *
 * @param schema  - TypeBox schema defining the expected shape
 * @param value   - Actual value to validate
 * @param context - Optional context string for better error messages (e.g. "GET /api/v1/hr/employees")
 */
export function assertMatchesSchema(
  schema: TSchema,
  value: unknown,
  context?: string
): void {
  const result = validateContract(schema, value);

  if (!result.valid) {
    const prefix = context ? `${context}: ` : "";
    throw new Error(
      `${prefix}Response does not match schema.\n${formatViolations(result.violations)}`
    );
  }
}

/**
 * Assert that a paginated response has the correct envelope shape:
 * { items: T[], nextCursor: string | null, hasMore: boolean }
 *
 * Also validates that each item in the array matches the provided item schema.
 *
 * @param itemSchema - TypeBox schema for individual items in the list
 * @param body       - The parsed response body
 * @param context    - Optional context string for error messages
 */
export function assertPaginatedResponse(
  itemSchema: TSchema,
  body: unknown,
  context?: string
): void {
  const prefix = context ? `${context}: ` : "";

  // Check the envelope structure
  expect(body).toBeDefined();
  expect(typeof body).toBe("object");
  expect(body).not.toBeNull();

  const obj = body as Record<string, unknown>;

  // items must be an array
  expect(Array.isArray(obj.items)).toBe(true);

  // nextCursor must be string or null
  expect(
    obj.nextCursor === null || typeof obj.nextCursor === "string"
  ).toBe(true);

  // hasMore must be a boolean
  expect(typeof obj.hasMore).toBe("boolean");

  // Validate each item against the item schema
  const items = obj.items as unknown[];
  for (let i = 0; i < items.length; i++) {
    const itemResult = validateContract(itemSchema, items[i]);
    if (!itemResult.valid) {
      throw new Error(
        `${prefix}Item [${i}] does not match schema.\n${formatViolations(itemResult.violations)}`
      );
    }
  }
}

/**
 * Assert the standard error response shape:
 * { error: { code: string, message: string, details?: object } }
 */
export function assertErrorResponse(body: unknown, context?: string): void {
  const prefix = context ? `${context}: ` : "";

  expect(body).toBeDefined();
  expect(typeof body).toBe("object");
  expect(body).not.toBeNull();

  const obj = body as Record<string, unknown>;
  expect(obj.error).toBeDefined();
  expect(typeof obj.error).toBe("object");

  const error = obj.error as Record<string, unknown>;
  expect(typeof error.code).toBe("string");
  expect(typeof error.message).toBe("string");

  // If details is present, it must be an object
  if (error.details !== undefined) {
    expect(typeof error.details).toBe("object");
  }
}

/**
 * Assert that specific required fields are present and have the correct types.
 * This is a quick structural check without full schema validation.
 *
 * @param body   - The response body
 * @param fields - Map of field name to expected typeof value (e.g. { id: "string", status: "string" })
 * @param context - Optional context for error messages
 */
export function assertRequiredFields(
  body: unknown,
  fields: Record<string, string>,
  context?: string
): void {
  const prefix = context ? `${context}: ` : "";

  expect(body).toBeDefined();
  expect(typeof body).toBe("object");
  expect(body).not.toBeNull();

  const obj = body as Record<string, unknown>;

  for (const [field, expectedType] of Object.entries(fields)) {
    const value = obj[field];

    if (expectedType === "string|null") {
      expect(
        typeof value === "string" || value === null
      ).toBe(true);
    } else if (expectedType === "number|null") {
      expect(
        typeof value === "number" || value === null
      ).toBe(true);
    } else if (expectedType === "array") {
      expect(Array.isArray(value)).toBe(true);
    } else if (expectedType === "object|null") {
      expect(
        (typeof value === "object" && value !== null) || value === null
      ).toBe(true);
    } else {
      expect(typeof value).toBe(expectedType);
    }
  }
}
