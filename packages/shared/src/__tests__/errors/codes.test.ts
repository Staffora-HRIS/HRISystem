/**
 * Error Codes and Messages Tests
 */

import { describe, test, expect } from "bun:test";
import {
  GenericErrorCodes,
  AuthErrorCodes,
  TenantErrorCodes,
  HRErrorCodes,
  TimeErrorCodes,
  AbsenceErrorCodes,
  WorkflowErrorCodes,
  TalentErrorCodes,
  LMSErrorCodes,
  CaseErrorCodes,
  ErrorCodes,
} from "../../errors/codes";
import { ErrorMessages, getErrorMessage } from "../../errors/messages";
import {
  AppError,
  createError,
  createValidationError,
  createNotFoundError,
  createForbiddenError,
  createUnauthorizedError,
  createConflictError,
  isAppError,
  isOperationalError,
} from "../../errors/index";

describe("Error Codes", () => {
  // ---------------------------------------------------------------------------
  // Module-specific error codes
  // ---------------------------------------------------------------------------
  describe("GenericErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(GenericErrorCodes.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
      expect(GenericErrorCodes.NOT_FOUND).toBe("NOT_FOUND");
      expect(GenericErrorCodes.FORBIDDEN).toBe("FORBIDDEN");
      expect(GenericErrorCodes.UNAUTHORIZED).toBe("UNAUTHORIZED");
      expect(GenericErrorCodes.CONFLICT).toBe("CONFLICT");
      expect(GenericErrorCodes.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
      expect(GenericErrorCodes.SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("AuthErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(AuthErrorCodes.INVALID_CREDENTIALS).toBe("INVALID_CREDENTIALS");
      expect(AuthErrorCodes.SESSION_EXPIRED).toBe("SESSION_EXPIRED");
      expect(AuthErrorCodes.MFA_REQUIRED).toBe("MFA_REQUIRED");
      expect(AuthErrorCodes.MFA_INVALID).toBe("MFA_INVALID");
      expect(AuthErrorCodes.ACCOUNT_LOCKED).toBe("ACCOUNT_LOCKED");
      expect(AuthErrorCodes.ACCOUNT_SUSPENDED).toBe("ACCOUNT_SUSPENDED");
    });
  });

  describe("TenantErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(TenantErrorCodes.TENANT_NOT_FOUND).toBe("TENANT_NOT_FOUND");
      expect(TenantErrorCodes.TENANT_SUSPENDED).toBe("TENANT_SUSPENDED");
      expect(TenantErrorCodes.TENANT_ACCESS_DENIED).toBe("TENANT_ACCESS_DENIED");
    });
  });

  describe("HRErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(HRErrorCodes.EFFECTIVE_DATE_OVERLAP).toBe("EFFECTIVE_DATE_OVERLAP");
      expect(HRErrorCodes.INVALID_LIFECYCLE_TRANSITION).toBe("INVALID_LIFECYCLE_TRANSITION");
      expect(HRErrorCodes.TERMINATION_DATE_BEFORE_HIRE).toBe("TERMINATION_DATE_BEFORE_HIRE");
      expect(HRErrorCodes.POSITION_ALREADY_FILLED).toBe("POSITION_ALREADY_FILLED");
      expect(HRErrorCodes.EMPLOYEE_NOT_FOUND).toBe("EMPLOYEE_NOT_FOUND");
      expect(HRErrorCodes.ORG_UNIT_HAS_CHILDREN).toBe("ORG_UNIT_HAS_CHILDREN");
      expect(HRErrorCodes.CIRCULAR_REPORTING_LINE).toBe("CIRCULAR_REPORTING_LINE");
    });
  });

  describe("TimeErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(TimeErrorCodes.TIMESHEET_ALREADY_APPROVED).toBe("TIMESHEET_ALREADY_APPROVED");
      expect(TimeErrorCodes.CLOCK_EVENT_OUT_OF_SEQUENCE).toBe("CLOCK_EVENT_OUT_OF_SEQUENCE");
      expect(TimeErrorCodes.INVALID_TIME_ENTRY).toBe("INVALID_TIME_ENTRY");
      expect(TimeErrorCodes.SCHEDULE_CONFLICT).toBe("SCHEDULE_CONFLICT");
    });
  });

  describe("AbsenceErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(AbsenceErrorCodes.INSUFFICIENT_LEAVE_BALANCE).toBe("INSUFFICIENT_LEAVE_BALANCE");
      expect(AbsenceErrorCodes.BLACKOUT_PERIOD_VIOLATION).toBe("BLACKOUT_PERIOD_VIOLATION");
      expect(AbsenceErrorCodes.LEAVE_REQUEST_OVERLAP).toBe("LEAVE_REQUEST_OVERLAP");
      expect(AbsenceErrorCodes.POLICY_NOT_FOUND).toBe("POLICY_NOT_FOUND");
    });
  });

  describe("WorkflowErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(WorkflowErrorCodes.INVALID_WORKFLOW_TRANSITION).toBe("INVALID_WORKFLOW_TRANSITION");
      expect(WorkflowErrorCodes.TASK_ALREADY_COMPLETED).toBe("TASK_ALREADY_COMPLETED");
      expect(WorkflowErrorCodes.WORKFLOW_NOT_FOUND).toBe("WORKFLOW_NOT_FOUND");
    });
  });

  describe("TalentErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(TalentErrorCodes.REQUISITION_CLOSED).toBe("REQUISITION_CLOSED");
      expect(TalentErrorCodes.CANDIDATE_ALREADY_EXISTS).toBe("CANDIDATE_ALREADY_EXISTS");
      expect(TalentErrorCodes.OFFER_EXPIRED).toBe("OFFER_EXPIRED");
    });
  });

  describe("LMSErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(LMSErrorCodes.COURSE_NOT_FOUND).toBe("COURSE_NOT_FOUND");
      expect(LMSErrorCodes.PREREQUISITE_NOT_MET).toBe("PREREQUISITE_NOT_MET");
      expect(LMSErrorCodes.ASSIGNMENT_ALREADY_COMPLETED).toBe("ASSIGNMENT_ALREADY_COMPLETED");
    });
  });

  describe("CaseErrorCodes", () => {
    test("defines all expected codes", () => {
      expect(CaseErrorCodes.CASE_CLOSED).toBe("CASE_CLOSED");
      expect(CaseErrorCodes.RESTRICTED_ACCESS).toBe("RESTRICTED_ACCESS");
    });
  });

  // ---------------------------------------------------------------------------
  // Combined ErrorCodes
  // ---------------------------------------------------------------------------
  describe("ErrorCodes (combined)", () => {
    test("contains all generic codes", () => {
      for (const code of Object.values(GenericErrorCodes)) {
        expect(Object.values(ErrorCodes)).toContain(code);
      }
    });

    test("contains all auth codes", () => {
      for (const code of Object.values(AuthErrorCodes)) {
        expect(Object.values(ErrorCodes)).toContain(code);
      }
    });

    test("contains all tenant codes", () => {
      for (const code of Object.values(TenantErrorCodes)) {
        expect(Object.values(ErrorCodes)).toContain(code);
      }
    });

    test("contains all HR codes", () => {
      for (const code of Object.values(HRErrorCodes)) {
        expect(Object.values(ErrorCodes)).toContain(code);
      }
    });

    test("all error code values are unique", () => {
      const values = Object.values(ErrorCodes);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    test("all error code values are uppercase strings", () => {
      for (const code of Object.values(ErrorCodes)) {
        expect(typeof code).toBe("string");
        expect(code).toBe(code.toUpperCase());
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Error Messages
  // ---------------------------------------------------------------------------
  describe("ErrorMessages", () => {
    test("has a message for every error code", () => {
      for (const code of Object.values(ErrorCodes)) {
        expect(ErrorMessages[code]).toBeDefined();
        expect(typeof ErrorMessages[code]).toBe("string");
        expect(ErrorMessages[code].length).toBeGreaterThan(0);
      }
    });

    test("messages are user-friendly (no internal jargon)", () => {
      for (const message of Object.values(ErrorMessages)) {
        // Should not contain stack traces or internal references
        expect(message).not.toContain("undefined");
        expect(message).not.toContain("null");
        expect(message).not.toContain("TypeError");
      }
    });
  });

  describe("getErrorMessage", () => {
    test("returns correct message for known code", () => {
      const message = getErrorMessage("NOT_FOUND");
      expect(message).toBe(ErrorMessages.NOT_FOUND);
    });

    test("returns correct message for all known codes", () => {
      for (const [, code] of Object.entries(ErrorCodes)) {
        const message = getErrorMessage(code);
        expect(message).toBe(ErrorMessages[code]);
      }
    });

    test("returns fallback message for unknown code", () => {
      const message = getErrorMessage("UNKNOWN_CODE_THAT_DOES_NOT_EXIST");
      expect(message).toBe("An unexpected error occurred. Please try again later.");
    });
  });

  // ---------------------------------------------------------------------------
  // AppError
  // ---------------------------------------------------------------------------
  describe("AppError", () => {
    test("creates error with code and default message", () => {
      const error = new AppError("NOT_FOUND");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe(ErrorMessages.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.isOperational).toBe(true);
    });

    test("creates error with custom message", () => {
      const error = new AppError("NOT_FOUND", {
        message: "Employee not found",
      });
      expect(error.message).toBe("Employee not found");
    });

    test("creates error with custom status code", () => {
      const error = new AppError("VALIDATION_ERROR", { statusCode: 422 });
      expect(error.statusCode).toBe(422);
    });

    test("creates error with details", () => {
      const error = new AppError("NOT_FOUND", {
        details: { employeeId: "123" },
      });
      expect(error.details).toEqual({ employeeId: "123" });
    });

    test("creates error with field errors", () => {
      const error = new AppError("VALIDATION_ERROR", {
        fieldErrors: { email: ["Invalid format"] },
      });
      expect(error.fieldErrors).toEqual({ email: ["Invalid format"] });
    });

    test("creates non-operational error", () => {
      const error = new AppError("INTERNAL_ERROR", { isOperational: false });
      expect(error.isOperational).toBe(false);
    });

    test("toJSON returns structured error details", () => {
      const error = new AppError("NOT_FOUND", {
        message: "Employee not found",
        details: { id: "123" },
      });
      const json = error.toJSON();
      expect(json.code).toBe("NOT_FOUND");
      expect(json.message).toBe("Employee not found");
      expect(json.details).toEqual({ id: "123" });
      expect(json.statusCode).toBe(404);
    });

    test("toJSON omits undefined details and fieldErrors", () => {
      const error = new AppError("NOT_FOUND");
      const json = error.toJSON();
      expect(json).not.toHaveProperty("details");
      expect(json).not.toHaveProperty("fieldErrors");
    });

    test("is instance of Error", () => {
      const error = new AppError("NOT_FOUND");
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    test("name is AppError", () => {
      const error = new AppError("NOT_FOUND");
      expect(error.name).toBe("AppError");
    });

    test("supports cause chain", () => {
      const cause = new Error("original error");
      const error = new AppError("INTERNAL_ERROR", { cause });
      expect(error.cause).toBe(cause);
    });
  });

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------
  describe("createError", () => {
    test("creates an AppError instance", () => {
      const error = createError("NOT_FOUND");
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe("NOT_FOUND");
    });

    test("passes options through", () => {
      const error = createError("NOT_FOUND", {
        message: "Custom message",
        details: { key: "value" },
      });
      expect(error.message).toBe("Custom message");
      expect(error.details).toEqual({ key: "value" });
    });
  });

  describe("createValidationError", () => {
    test("creates validation error with field errors", () => {
      const error = createValidationError({
        email: ["Invalid format"],
        name: ["Required"],
      });
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.statusCode).toBe(400);
      expect(error.fieldErrors).toEqual({
        email: ["Invalid format"],
        name: ["Required"],
      });
    });

    test("uses custom message when provided", () => {
      const error = createValidationError(
        { email: ["Invalid"] },
        "Custom validation message"
      );
      expect(error.message).toBe("Custom validation message");
    });

    test("uses default message when not provided", () => {
      const error = createValidationError({ email: ["Invalid"] });
      expect(error.message).toContain("Validation failed");
    });
  });

  describe("createNotFoundError", () => {
    test("creates not found error with resource type and ID", () => {
      const error = createNotFoundError("Employee", "emp-123");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.statusCode).toBe(404);
      expect(error.message).toContain("Employee");
      expect(error.message).toContain("emp-123");
      expect(error.details).toEqual({
        resourceType: "Employee",
        resourceId: "emp-123",
      });
    });

    test("creates not found error without resource ID", () => {
      const error = createNotFoundError("Employee");
      expect(error.message).toContain("Employee");
      expect(error.message).not.toContain("with ID");
    });
  });

  describe("createForbiddenError", () => {
    test("creates forbidden error with action and resource", () => {
      const error = createForbiddenError("delete", "employee");
      expect(error.code).toBe("FORBIDDEN");
      expect(error.statusCode).toBe(403);
      expect(error.message).toContain("delete");
      expect(error.message).toContain("employee");
    });

    test("creates generic forbidden error without arguments", () => {
      const error = createForbiddenError();
      expect(error.code).toBe("FORBIDDEN");
      expect(error.message).toContain("permission");
    });
  });

  describe("createUnauthorizedError", () => {
    test("creates unauthorized error with default message", () => {
      const error = createUnauthorizedError();
      expect(error.code).toBe("UNAUTHORIZED");
      expect(error.statusCode).toBe(401);
      expect(error.message).toContain("Authentication");
    });

    test("creates unauthorized error with custom message", () => {
      const error = createUnauthorizedError("Token expired");
      expect(error.message).toBe("Token expired");
    });
  });

  describe("createConflictError", () => {
    test("creates conflict error with message", () => {
      const error = createConflictError("Resource already exists");
      expect(error.code).toBe("CONFLICT");
      expect(error.statusCode).toBe(409);
      expect(error.message).toBe("Resource already exists");
    });

    test("creates conflict error with details", () => {
      const error = createConflictError("Duplicate", { field: "email" });
      expect(error.details).toEqual({ field: "email" });
    });
  });

  // ---------------------------------------------------------------------------
  // Type Guards
  // ---------------------------------------------------------------------------
  describe("isAppError", () => {
    test("returns true for AppError instances", () => {
      expect(isAppError(new AppError("NOT_FOUND"))).toBe(true);
    });

    test("returns false for plain Error", () => {
      expect(isAppError(new Error("test"))).toBe(false);
    });

    test("returns false for non-error values", () => {
      expect(isAppError("string")).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
      expect(isAppError(42)).toBe(false);
    });
  });

  describe("isOperationalError", () => {
    test("returns true for operational AppError", () => {
      const error = new AppError("NOT_FOUND");
      expect(isOperationalError(error)).toBe(true);
    });

    test("returns false for non-operational AppError", () => {
      const error = new AppError("INTERNAL_ERROR", { isOperational: false });
      expect(isOperationalError(error)).toBe(false);
    });

    test("returns false for plain Error", () => {
      expect(isOperationalError(new Error("test"))).toBe(false);
    });

    test("returns false for non-error values", () => {
      expect(isOperationalError(null)).toBe(false);
      expect(isOperationalError("string")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Status Code Mapping
  // ---------------------------------------------------------------------------
  describe("status code mapping", () => {
    test("VALIDATION_ERROR maps to 400", () => {
      expect(new AppError("VALIDATION_ERROR").statusCode).toBe(400);
    });

    test("UNAUTHORIZED maps to 401", () => {
      expect(new AppError("UNAUTHORIZED").statusCode).toBe(401);
    });

    test("FORBIDDEN maps to 403", () => {
      expect(new AppError("FORBIDDEN").statusCode).toBe(403);
    });

    test("NOT_FOUND maps to 404", () => {
      expect(new AppError("NOT_FOUND").statusCode).toBe(404);
    });

    test("CONFLICT maps to 409", () => {
      expect(new AppError("CONFLICT").statusCode).toBe(409);
    });

    test("INTERNAL_ERROR maps to 500", () => {
      expect(new AppError("INTERNAL_ERROR").statusCode).toBe(500);
    });

    test("SERVICE_UNAVAILABLE maps to 503", () => {
      expect(new AppError("SERVICE_UNAVAILABLE").statusCode).toBe(503);
    });

    test("INVALID_CREDENTIALS maps to 401", () => {
      expect(new AppError("INVALID_CREDENTIALS").statusCode).toBe(401);
    });

    test("ACCOUNT_LOCKED maps to 403", () => {
      expect(new AppError("ACCOUNT_LOCKED").statusCode).toBe(403);
    });

    test("EMPLOYEE_NOT_FOUND maps to 404", () => {
      expect(new AppError("EMPLOYEE_NOT_FOUND").statusCode).toBe(404);
    });

    test("POSITION_ALREADY_FILLED maps to 409", () => {
      expect(new AppError("POSITION_ALREADY_FILLED").statusCode).toBe(409);
    });

    test("CASE_CLOSED maps to 410", () => {
      expect(new AppError("CASE_CLOSED").statusCode).toBe(410);
    });

    test("unknown code defaults to 500", () => {
      expect(new AppError("SOME_UNKNOWN_CODE").statusCode).toBe(500);
    });
  });
});
