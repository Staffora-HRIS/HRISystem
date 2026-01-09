/**
 * Custom Assertion Helpers
 *
 * Extended assertion utilities for testing HRIS-specific functionality.
 */

import { expect } from "bun:test";

// =============================================================================
// Response Assertions
// =============================================================================

/**
 * Assert HTTP response status
 */
export function assertStatus(response: Response | { status: number }, expected: number): void {
  const actual = "status" in response ? response.status : (response as Response).status;
  if (actual !== expected) {
    throw new Error(`Expected status ${expected} but got ${actual}`);
  }
}

/**
 * Assert response is successful (2xx)
 */
export function assertSuccessResponse(response: Response | { status: number }): void {
  const status = "status" in response ? response.status : (response as Response).status;
  if (status < 200 || status >= 300) {
    throw new Error(`Expected success response (2xx) but got ${status}`);
  }
}

/**
 * Assert response is error with specific code
 */
export async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode?: string
): Promise<void> {
  assertStatus(response, expectedStatus);

  if (expectedCode) {
    const body = await response.json();
    if (body.error?.code !== expectedCode) {
      throw new Error(`Expected error code "${expectedCode}" but got "${body.error?.code}"`);
    }
  }
}

/**
 * Assert response contains specific error message
 */
export async function assertErrorMessage(
  response: Response,
  expectedMessage: string | RegExp
): Promise<void> {
  const body = await response.json();
  const message = body.error?.message ?? body.message ?? "";

  if (typeof expectedMessage === "string") {
    if (!message.includes(expectedMessage)) {
      throw new Error(`Expected error message to contain "${expectedMessage}" but got "${message}"`);
    }
  } else {
    if (!expectedMessage.test(message)) {
      throw new Error(`Expected error message to match ${expectedMessage} but got "${message}"`);
    }
  }
}

// =============================================================================
// Data Assertions
// =============================================================================

/**
 * Assert object has required properties
 */
export function assertHasProperties<T extends object>(
  obj: T,
  properties: (keyof T)[]
): void {
  for (const prop of properties) {
    if (!(prop in obj)) {
      throw new Error(`Expected object to have property "${String(prop)}"`);
    }
  }
}

/**
 * Assert object matches shape (subset match)
 */
export function assertMatchesShape<T extends object>(
  actual: T,
  expected: Partial<T>
): void {
  for (const [key, value] of Object.entries(expected)) {
    const actualValue = (actual as Record<string, unknown>)[key];
    if (actualValue !== value) {
      throw new Error(
        `Expected ${key} to be ${JSON.stringify(value)} but got ${JSON.stringify(actualValue)}`
      );
    }
  }
}

/**
 * Assert array has specific length
 */
export function assertArrayLength<T>(arr: T[], length: number): void {
  if (arr.length !== length) {
    throw new Error(`Expected array length ${length} but got ${arr.length}`);
  }
}

/**
 * Assert array contains item matching predicate
 */
export function assertArrayContains<T>(
  arr: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  const found = arr.some(predicate);
  if (!found) {
    throw new Error(message ?? "Expected array to contain matching item");
  }
}

/**
 * Assert array is sorted by property
 */
export function assertArraySortedBy<T>(
  arr: T[],
  property: keyof T,
  direction: "asc" | "desc" = "asc"
): void {
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1]![property];
    const curr = arr[i]![property];

    const isCorrectOrder = direction === "asc" ? prev <= curr : prev >= curr;
    if (!isCorrectOrder) {
      throw new Error(
        `Array not sorted by ${String(property)} in ${direction} order at index ${i}`
      );
    }
  }
}

// =============================================================================
// Date/Time Assertions
// =============================================================================

/**
 * Assert date is within range
 */
export function assertDateInRange(
  date: Date | string,
  start: Date | string,
  end: Date | string
): void {
  const d = new Date(date);
  const s = new Date(start);
  const e = new Date(end);

  if (d < s || d > e) {
    throw new Error(
      `Expected date ${d.toISOString()} to be between ${s.toISOString()} and ${e.toISOString()}`
    );
  }
}

/**
 * Assert date is in the past
 */
export function assertDateInPast(date: Date | string): void {
  const d = new Date(date);
  if (d > new Date()) {
    throw new Error(`Expected date ${d.toISOString()} to be in the past`);
  }
}

/**
 * Assert date is in the future
 */
export function assertDateInFuture(date: Date | string): void {
  const d = new Date(date);
  if (d < new Date()) {
    throw new Error(`Expected date ${d.toISOString()} to be in the future`);
  }
}

/**
 * Assert two dates are on the same day
 */
export function assertSameDay(date1: Date | string, date2: Date | string): void {
  const d1 = new Date(date1);
  const d2 = new Date(date2);

  if (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  ) {
    throw new Error(
      `Expected ${d1.toISOString()} and ${d2.toISOString()} to be on the same day`
    );
  }
}

// =============================================================================
// State Machine Assertions
// =============================================================================

/**
 * Assert valid employee status transition
 */
export function assertValidStatusTransition(
  from: string,
  to: string,
  validTransitions: Record<string, string[]>
): void {
  const allowed = validTransitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid status transition: ${from} → ${to}. Allowed: ${allowed.join(", ") || "none"}`
    );
  }
}

/**
 * Assert invalid employee status transition throws
 */
export async function assertInvalidStatusTransitionThrows(
  fn: () => Promise<unknown>,
  expectedCode?: string
): Promise<void> {
  try {
    await fn();
    throw new Error("Expected invalid status transition to throw");
  } catch (error) {
    if (error instanceof Error && error.message === "Expected invalid status transition to throw") {
      throw error;
    }
    if (expectedCode) {
      const errorObj = error as { code?: string };
      if (errorObj.code !== expectedCode) {
        throw new Error(`Expected error code "${expectedCode}" but got "${errorObj.code}"`);
      }
    }
  }
}

// =============================================================================
// RLS/Security Assertions
// =============================================================================

/**
 * Assert query throws RLS violation
 */
export async function assertRlsViolation(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    throw new Error("Expected RLS violation but query succeeded");
  } catch (error) {
    const message = String(error);
    const isRlsError =
      message.includes("permission denied") ||
      message.includes("violates row-level security") ||
      message.includes("new row violates");

    if (!isRlsError) {
      throw new Error(`Expected RLS violation but got: ${message}`);
    }
  }
}

/**
 * Assert cross-tenant access denied
 */
export async function assertCrossTenantAccessDenied(
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    const result = await fn();
    // If result is null/undefined or empty array, that's acceptable (not found)
    if (result === null || result === undefined) return;
    if (Array.isArray(result) && result.length === 0) return;
    throw new Error("Expected cross-tenant access to be denied");
  } catch (error) {
    // RLS errors are also acceptable
    const message = String(error);
    if (
      message.includes("permission denied") ||
      message.includes("violates row-level security")
    ) {
      return;
    }
    if (message.includes("Expected cross-tenant access to be denied")) {
      throw error;
    }
  }
}

/**
 * Assert user has permission
 */
export function assertHasPermission(
  permissions: Set<string> | string[],
  permission: string
): void {
  const perms = Array.isArray(permissions) ? new Set(permissions) : permissions;
  if (!perms.has(permission)) {
    throw new Error(`Expected user to have permission "${permission}"`);
  }
}

/**
 * Assert user lacks permission
 */
export function assertLacksPermission(
  permissions: Set<string> | string[],
  permission: string
): void {
  const perms = Array.isArray(permissions) ? new Set(permissions) : permissions;
  if (perms.has(permission)) {
    throw new Error(`Expected user to lack permission "${permission}"`);
  }
}

// =============================================================================
// Domain Event Assertions
// =============================================================================

/**
 * Assert domain event was emitted
 */
export function assertEventEmitted(
  events: Array<{ eventType: string; aggregateType?: string; aggregateId?: string }>,
  eventType: string,
  aggregateType?: string,
  aggregateId?: string
): void {
  const found = events.some(
    (e) =>
      e.eventType === eventType &&
      (aggregateType === undefined || e.aggregateType === aggregateType) &&
      (aggregateId === undefined || e.aggregateId === aggregateId)
  );

  if (!found) {
    throw new Error(
      `Expected event "${eventType}" to be emitted${
        aggregateType ? ` for ${aggregateType}` : ""
      }${aggregateId ? `:${aggregateId}` : ""}`
    );
  }
}

/**
 * Assert domain event was NOT emitted
 */
export function assertEventNotEmitted(
  events: Array<{ eventType: string }>,
  eventType: string
): void {
  const found = events.some((e) => e.eventType === eventType);

  if (found) {
    throw new Error(`Expected event "${eventType}" to NOT be emitted`);
  }
}

/**
 * Assert event payload matches expected shape
 */
export function assertEventPayload<T extends object>(
  events: Array<{ eventType: string; payload: unknown }>,
  eventType: string,
  expectedPayload: Partial<T>
): void {
  const event = events.find((e) => e.eventType === eventType);
  if (!event) {
    throw new Error(`Event "${eventType}" not found`);
  }

  assertMatchesShape(event.payload as T, expectedPayload);
}

// =============================================================================
// Audit Log Assertions
// =============================================================================

/**
 * Assert audit log entry exists
 */
export function assertAuditLogExists(
  logs: Array<{ action: string; resourceType?: string; resourceId?: string }>,
  action: string,
  resourceType?: string,
  resourceId?: string
): void {
  const found = logs.some(
    (log) =>
      log.action === action &&
      (resourceType === undefined || log.resourceType === resourceType) &&
      (resourceId === undefined || log.resourceId === resourceId)
  );

  if (!found) {
    throw new Error(
      `Expected audit log entry for action "${action}"${
        resourceType ? ` on ${resourceType}` : ""
      }${resourceId ? `:${resourceId}` : ""}`
    );
  }
}

/**
 * Assert audit log captures before/after values
 */
export function assertAuditLogCapturesChange(
  log: { oldValue?: unknown; newValue?: unknown },
  field: string,
  expectedOld: unknown,
  expectedNew: unknown
): void {
  const oldValue = (log.oldValue as Record<string, unknown>)?.[field];
  const newValue = (log.newValue as Record<string, unknown>)?.[field];

  if (oldValue !== expectedOld) {
    throw new Error(
      `Expected audit log oldValue.${field} to be ${JSON.stringify(expectedOld)} but got ${JSON.stringify(oldValue)}`
    );
  }

  if (newValue !== expectedNew) {
    throw new Error(
      `Expected audit log newValue.${field} to be ${JSON.stringify(expectedNew)} but got ${JSON.stringify(newValue)}`
    );
  }
}

// =============================================================================
// Performance Assertions
// =============================================================================

/**
 * Assert operation completes within time limit
 */
export async function assertCompletesWithin(
  fn: () => Promise<unknown>,
  maxMs: number
): Promise<void> {
  const start = performance.now();
  await fn();
  const duration = performance.now() - start;

  if (duration > maxMs) {
    throw new Error(
      `Expected operation to complete within ${maxMs}ms but took ${duration.toFixed(2)}ms`
    );
  }
}

/**
 * Assert operation completes within time limit and return result
 */
export async function assertCompletesWithinAndReturn<T>(
  fn: () => Promise<T>,
  maxMs: number
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;

  if (duration > maxMs) {
    throw new Error(
      `Expected operation to complete within ${maxMs}ms but took ${duration.toFixed(2)}ms`
    );
  }

  return { result, duration };
}

// =============================================================================
// Idempotency Assertions
// =============================================================================

/**
 * Assert idempotent operation returns same result
 */
export async function assertIdempotent<T>(
  fn: () => Promise<T>,
  compareFn: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
): Promise<void> {
  const result1 = await fn();
  const result2 = await fn();

  if (!compareFn(result1, result2)) {
    throw new Error(
      `Expected idempotent operation to return same result.\nFirst: ${JSON.stringify(result1)}\nSecond: ${JSON.stringify(result2)}`
    );
  }
}

// =============================================================================
// UUID Assertions
// =============================================================================

/**
 * Assert value is valid UUID
 */
export function assertValidUuid(value: unknown): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`Expected UUID string but got ${typeof value}`);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new Error(`Invalid UUID format: ${value}`);
  }
}

/**
 * Assert value is defined and not null
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected value to be defined");
  }
}

/**
 * Assert value is null or undefined
 */
export function assertNullish(value: unknown, message?: string): void {
  if (value !== null && value !== undefined) {
    throw new Error(message ?? `Expected null or undefined but got ${JSON.stringify(value)}`);
  }
}
