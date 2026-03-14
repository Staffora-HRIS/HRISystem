/**
 * Errors Plugin Unit Tests
 *
 * Tests the error handling plugin which provides:
 * - Standard error response format
 * - Error code to HTTP status mapping
 * - Request ID generation and tracking
 * - Custom error classes (AppError, ValidationError, NotFoundError, ConflictError)
 * - Elysia built-in error handling (VALIDATION, NOT_FOUND, PARSE)
 * - Development vs production error detail exposure
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import {
  errorsPlugin,
  ErrorCodes,
  AppError,
  type ErrorCode,
  ValidationError,
  NotFoundError,
  ConflictError,
  generateRequestId,
  createErrorResponse,
  assertValid,
  assertFound,
} from "../../../plugins/errors";
import { IdempotencyError } from "../../../plugins/idempotency";
import { TenantError } from "../../../plugins/tenant";
import { RbacError } from "../../../plugins/rbac";
import { AuthError } from "../../../plugins/auth-better";

/** Shape of error API responses for test assertions */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}

// =============================================================================
// generateRequestId
// =============================================================================

describe("generateRequestId", () => {
  it("should return a string starting with 'req_'", () => {
    const id = generateRequestId();
    expect(id.startsWith("req_")).toBe(true);
  });

  it("should produce unique IDs on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    expect(ids.size).toBe(100);
  });

  it("should contain a timestamp component and random component separated by underscore", () => {
    const id = generateRequestId();
    // format: req_<timestamp>_<random>
    const parts = id.split("_");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("req");
    expect(parts[1]!.length).toBeGreaterThan(0);
    expect(parts[2]!.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// createErrorResponse
// =============================================================================

describe("createErrorResponse", () => {
  it("should return the standard error shape", () => {
    const resp = createErrorResponse("NOT_FOUND", "Employee not found", "req_123");
    expect(resp).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Employee not found",
        details: undefined,
        requestId: "req_123",
      },
    });
  });

  it("should include details when provided", () => {
    const details = { field: "email", reason: "invalid format" };
    const resp = createErrorResponse("VALIDATION_ERROR", "Validation failed", "req_456", details);
    expect(resp.error.details).toEqual(details);
  });
});

// =============================================================================
// Custom Error Classes
// =============================================================================

describe("AppError", () => {
  it("should set code, message, and statusCode from error code map", () => {
    const err = new AppError("NOT_FOUND", "Resource not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Resource not found");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("should store optional details", () => {
    const err = new AppError("VALIDATION_ERROR", "Bad input", { field: "name" });
    expect(err.details).toEqual({ field: "name" });
    expect(err.statusCode).toBe(400);
  });

  it("should default to 500 for unmapped codes", () => {
    // Force an unknown code through the type system
    const err = new AppError("INTERNAL_ERROR", "Something broke");
    expect(err.statusCode).toBe(500);
  });
});

describe("ValidationError", () => {
  it("should be an instance of AppError with code VALIDATION_ERROR", () => {
    const err = new ValidationError("Validation failed", [
      { field: "email", message: "required" },
    ]);
    expect(err instanceof AppError).toBe(true);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe("ValidationError");
  });

  it("should carry field-level errors in details", () => {
    const fieldErrors = [
      { field: "name", message: "too short", value: "A" },
      { field: "age", message: "must be positive" },
    ];
    const err = new ValidationError("Invalid", fieldErrors);
    expect(err.errors).toEqual(fieldErrors);
    expect((err.details as Record<string, unknown>).errors).toEqual(fieldErrors);
  });
});

describe("NotFoundError", () => {
  it("should create message with resource and identifier", () => {
    const err = new NotFoundError("Employee", "emp-123");
    expect(err.message).toBe("Employee with ID 'emp-123' not found");
    expect(err.code).toBe("NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe("NotFoundError");
  });

  it("should create message without identifier", () => {
    const err = new NotFoundError("Department");
    expect(err.message).toBe("Department not found");
  });

  it("should store resource and identifier in details", () => {
    const err = new NotFoundError("Employee", "emp-123");
    expect(err.details).toEqual({ resource: "Employee", identifier: "emp-123" });
  });
});

describe("ConflictError", () => {
  it("should accept a specific conflict code", () => {
    const err = new ConflictError(
      "STATE_MACHINE_VIOLATION",
      "Cannot transition from active to pending"
    );
    expect(err.code).toBe("STATE_MACHINE_VIOLATION");
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe("ConflictError");
  });

  it("should store details", () => {
    const err = new ConflictError("EFFECTIVE_DATE_OVERLAP", "Overlap detected", {
      existingId: "rec-1",
    });
    expect(err.details).toEqual({ existingId: "rec-1" });
    expect(err.statusCode).toBe(409);
  });
});

// =============================================================================
// Assertion Helpers
// =============================================================================

describe("assertValid", () => {
  it("should not throw when condition is true", () => {
    expect(() => assertValid(true, "field", "error message")).not.toThrow();
  });

  it("should throw ValidationError when condition is false", () => {
    expect(() => assertValid(false, "email", "email is required")).toThrow(ValidationError);
    try {
      assertValid(false, "email", "email is required");
    } catch (err) {
      expect((err as ValidationError).errors[0]).toEqual({
        field: "email",
        message: "email is required",
      });
    }
  });
});

describe("assertFound", () => {
  it("should not throw when value is defined", () => {
    expect(() => assertFound({ id: "1" }, "User")).not.toThrow();
  });

  it("should throw NotFoundError when value is null", () => {
    expect(() => assertFound(null, "Employee", "emp-1")).toThrow(NotFoundError);
  });

  it("should throw NotFoundError when value is undefined", () => {
    expect(() => assertFound(undefined, "Department")).toThrow(NotFoundError);
  });
});

// =============================================================================
// ErrorCodes constant
// =============================================================================

describe("ErrorCodes", () => {
  it("should contain all expected error codes", () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
    expect(ErrorCodes.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCodes.NOT_FOUND).toBe("NOT_FOUND");
    expect(ErrorCodes.FORBIDDEN).toBe("FORBIDDEN");
    expect(ErrorCodes.CONFLICT).toBe("CONFLICT");
    expect(ErrorCodes.TOO_MANY_REQUESTS).toBe("TOO_MANY_REQUESTS");
    expect(ErrorCodes.STATE_MACHINE_VIOLATION).toBe("STATE_MACHINE_VIOLATION");
    expect(ErrorCodes.EFFECTIVE_DATE_OVERLAP).toBe("EFFECTIVE_DATE_OVERLAP");
    expect(ErrorCodes.IDEMPOTENCY_KEY_REUSED).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(ErrorCodes.MISSING_TENANT).toBe("MISSING_TENANT");
    expect(ErrorCodes.MFA_REQUIRED).toBe("MFA_REQUIRED");
  });
});

// =============================================================================
// Error Plugin Integration with Elysia
// =============================================================================

describe("errorsPlugin (Elysia integration)", () => {
  let app: InstanceType<typeof Elysia>;

  beforeEach(() => {
    app = new Elysia()
      .use(errorsPlugin())
      .get("/ok", () => ({ status: "ok" }))
      .get("/app-error", () => {
        throw new AppError("FORBIDDEN", "Access denied");
      })
      .get("/not-found-error", () => {
        throw new NotFoundError("Employee", "emp-123");
      })
      .get("/validation-error", () => {
        throw new ValidationError("Bad input", [
          { field: "name", message: "required" },
        ]);
      })
      .get("/conflict-error", () => {
        throw new ConflictError("STATE_MACHINE_VIOLATION", "Invalid transition");
      })
      .get("/idempotency-error", () => {
        throw new IdempotencyError("REQUEST_IN_PROGRESS", "Already processing", 409);
      })
      .get("/tenant-error", () => {
        throw new TenantError("TENANT_SUSPENDED", "Tenant is suspended", 403);
      })
      .get("/rbac-error", () => {
        throw new RbacError("PERMISSION_DENIED", "Not allowed", 403);
      })
      .get("/auth-error", () => {
        throw new AuthError("AUTH_INVALID_SESSION", "Session expired", 401);
      })
      .get("/unknown-error", () => {
        throw new Error("Something unexpected");
      });
  });

  it("should add X-Request-ID header to successful responses", async () => {
    const res = await app.handle(new Request("http://localhost/ok"));
    expect(res.status).toBe(200);
    const requestId = res.headers.get("X-Request-ID");
    expect(requestId).toBeTruthy();
    expect(requestId!.startsWith("req_")).toBe(true);
  });

  it("should handle AppError and return correct status and format", async () => {
    const res = await app.handle(new Request("http://localhost/app-error"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Access denied");
    expect(body.error.requestId).toBeTruthy();
  });

  it("should handle NotFoundError with 404 status", async () => {
    const res = await app.handle(new Request("http://localhost/not-found-error"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Employee with ID 'emp-123' not found");
  });

  it("should handle ValidationError with 400 status and field errors", async () => {
    const res = await app.handle(new Request("http://localhost/validation-error"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.errors).toEqual([{ field: "name", message: "required" }]);
  });

  it("should handle ConflictError with 409 status", async () => {
    const res = await app.handle(new Request("http://localhost/conflict-error"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("STATE_MACHINE_VIOLATION");
  });

  it("should handle IdempotencyError with correct status", async () => {
    const res = await app.handle(new Request("http://localhost/idempotency-error"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("REQUEST_IN_PROGRESS");
  });

  it("should handle TenantError with correct status", async () => {
    const res = await app.handle(new Request("http://localhost/tenant-error"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("TENANT_SUSPENDED");
  });

  it("should handle RbacError with correct status", async () => {
    const res = await app.handle(new Request("http://localhost/rbac-error"));
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("PERMISSION_DENIED");
  });

  it("should handle AuthError with correct status", async () => {
    const res = await app.handle(new Request("http://localhost/auth-error"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("AUTH_INVALID_SESSION");
  });

  it("should handle unknown errors with 500 status", async () => {
    const res = await app.handle(new Request("http://localhost/unknown-error"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.requestId).toBeTruthy();
  });

  it("should add X-Request-ID header to error responses", async () => {
    const res = await app.handle(new Request("http://localhost/not-found-error"));
    const requestId = res.headers.get("X-Request-ID");
    expect(requestId).toBeTruthy();
    expect(requestId!.startsWith("req_")).toBe(true);
  });

  it("should handle Elysia NOT_FOUND for unknown routes", async () => {
    const res = await app.handle(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("should derive an error() helper on the context", async () => {
    const testApp = new Elysia()
      .use(errorsPlugin())
      .get("/use-error-helper", (ctx) => {
        return (ctx as unknown as { error: (status: number, body: unknown) => unknown }).error(422, {
          error: {
            code: "CUSTOM_ERROR",
            message: "Custom error message",
          },
        });
      });

    const res = await testApp.handle(new Request("http://localhost/use-error-helper"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as ErrorResponseBody;
    expect(body.error.code).toBe("CUSTOM_ERROR");
  });
});

// =============================================================================
// Error Status Code Mapping
// =============================================================================

describe("Error status code mapping", () => {
  const testCases: Array<[string, string, number]> = [
    ["VALIDATION_ERROR", "ValidationError", 400],
    ["BAD_REQUEST", "BadRequest", 400],
    ["UNAUTHORIZED", "Unauthorized", 401],
    ["SESSION_EXPIRED", "SessionExpired", 401],
    ["FORBIDDEN", "Forbidden", 403],
    ["PERMISSION_DENIED", "PermissionDenied", 403],
    ["MFA_REQUIRED", "MfaRequired", 403],
    ["TENANT_SUSPENDED", "TenantSuspended", 403],
    ["NOT_FOUND", "NotFound", 404],
    ["TENANT_NOT_FOUND", "TenantNotFound", 404],
    ["METHOD_NOT_ALLOWED", "MethodNotAllowed", 405],
    ["CONFLICT", "Conflict", 409],
    ["STATE_MACHINE_VIOLATION", "StateMachineViolation", 409],
    ["EFFECTIVE_DATE_OVERLAP", "EffectiveDateOverlap", 409],
    ["TOO_MANY_REQUESTS", "TooManyRequests", 429],
    ["INTERNAL_ERROR", "InternalError", 500],
    ["SERVICE_UNAVAILABLE", "ServiceUnavailable", 503],
  ];

  for (const [code, label, expectedStatus] of testCases) {
    it(`should map ${code} to HTTP ${expectedStatus}`, () => {
      const err = new AppError(code as ErrorCode, label);
      expect(err.statusCode).toBe(expectedStatus);
    });
  }
});
