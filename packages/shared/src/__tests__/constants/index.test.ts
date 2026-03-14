/**
 * Shared Constants Tests
 */

import { describe, test, expect } from "bun:test";
import {
  HttpStatus,
  PaginationDefaults,
  CacheTTL,
  RateLimits,
  SessionConfig,
  ValidationLimits,
  DateFormats,
  SystemRoles,
  AuditEventTypes,
} from "../../constants/index";

describe("Shared Constants", () => {
  // ---------------------------------------------------------------------------
  // HttpStatus
  // ---------------------------------------------------------------------------
  describe("HttpStatus", () => {
    test("defines success status codes", () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.ACCEPTED).toBe(202);
      expect(HttpStatus.NO_CONTENT).toBe(204);
    });

    test("defines client error status codes", () => {
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.UNAUTHORIZED).toBe(401);
      expect(HttpStatus.FORBIDDEN).toBe(403);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.METHOD_NOT_ALLOWED).toBe(405);
      expect(HttpStatus.CONFLICT).toBe(409);
      expect(HttpStatus.GONE).toBe(410);
      expect(HttpStatus.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HttpStatus.TOO_MANY_REQUESTS).toBe(429);
    });

    test("defines server error status codes", () => {
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HttpStatus.NOT_IMPLEMENTED).toBe(501);
      expect(HttpStatus.BAD_GATEWAY).toBe(502);
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503);
      expect(HttpStatus.GATEWAY_TIMEOUT).toBe(504);
    });

    test("defines redirection status codes", () => {
      expect(HttpStatus.MOVED_PERMANENTLY).toBe(301);
      expect(HttpStatus.FOUND).toBe(302);
      expect(HttpStatus.NOT_MODIFIED).toBe(304);
    });

    test("all values are positive integers", () => {
      for (const value of Object.values(HttpStatus)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    });

    test("all values are unique", () => {
      const values = Object.values(HttpStatus);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // ---------------------------------------------------------------------------
  // PaginationDefaults
  // ---------------------------------------------------------------------------
  describe("PaginationDefaults", () => {
    test("defines expected defaults", () => {
      expect(PaginationDefaults.PAGE).toBe(1);
      expect(PaginationDefaults.PAGE_SIZE).toBe(20);
      expect(PaginationDefaults.MAX_PAGE_SIZE).toBe(100);
    });

    test("PAGE_SIZE is less than or equal to MAX_PAGE_SIZE", () => {
      expect(PaginationDefaults.PAGE_SIZE).toBeLessThanOrEqual(
        PaginationDefaults.MAX_PAGE_SIZE
      );
    });

    test("PAGE starts at 1", () => {
      expect(PaginationDefaults.PAGE).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // CacheTTL
  // ---------------------------------------------------------------------------
  describe("CacheTTL", () => {
    test("defines all expected TTL values", () => {
      expect(CacheTTL.PERMISSIONS).toBeDefined();
      expect(CacheTTL.SESSION).toBeDefined();
      expect(CacheTTL.TENANT_SETTINGS).toBeDefined();
      expect(CacheTTL.USER_PROFILE).toBeDefined();
      expect(CacheTTL.ROLES).toBeDefined();
      expect(CacheTTL.SHORT).toBeDefined();
      expect(CacheTTL.MEDIUM).toBeDefined();
      expect(CacheTTL.LONG).toBeDefined();
    });

    test("all values are positive integers (in seconds)", () => {
      for (const value of Object.values(CacheTTL)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    });

    test("SHORT < MEDIUM < LONG", () => {
      expect(CacheTTL.SHORT).toBeLessThan(CacheTTL.MEDIUM);
      expect(CacheTTL.MEDIUM).toBeLessThan(CacheTTL.LONG);
    });

    test("PERMISSIONS is 15 minutes (900 seconds)", () => {
      expect(CacheTTL.PERMISSIONS).toBe(900);
    });

    test("SESSION is 24 hours (86400 seconds)", () => {
      expect(CacheTTL.SESSION).toBe(86400);
    });
  });

  // ---------------------------------------------------------------------------
  // RateLimits
  // ---------------------------------------------------------------------------
  describe("RateLimits", () => {
    test("defines all expected rate limits", () => {
      expect(RateLimits.DEFAULT).toBeDefined();
      expect(RateLimits.AUTH).toBeDefined();
      expect(RateLimits.SEARCH).toBeDefined();
      expect(RateLimits.REPORTS).toBeDefined();
      expect(RateLimits.UPLOADS).toBeDefined();
    });

    test("all values are positive integers", () => {
      for (const value of Object.values(RateLimits)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    });

    test("AUTH rate limit is stricter than DEFAULT", () => {
      expect(RateLimits.AUTH).toBeLessThan(RateLimits.DEFAULT);
    });

    test("REPORTS rate limit is stricter than DEFAULT", () => {
      expect(RateLimits.REPORTS).toBeLessThan(RateLimits.DEFAULT);
    });
  });

  // ---------------------------------------------------------------------------
  // SessionConfig
  // ---------------------------------------------------------------------------
  describe("SessionConfig", () => {
    test("defines cookie name", () => {
      expect(SessionConfig.COOKIE_NAME).toBe("staffora_session");
    });

    test("defines durations in milliseconds", () => {
      expect(SessionConfig.DURATION).toBeGreaterThan(0);
      expect(SessionConfig.REMEMBER_ME_DURATION).toBeGreaterThan(0);
      expect(SessionConfig.IDLE_TIMEOUT).toBeGreaterThan(0);
    });

    test("REMEMBER_ME_DURATION is longer than DURATION", () => {
      expect(SessionConfig.REMEMBER_ME_DURATION).toBeGreaterThan(
        SessionConfig.DURATION
      );
    });

    test("IDLE_TIMEOUT is shorter than DURATION", () => {
      expect(SessionConfig.IDLE_TIMEOUT).toBeLessThan(SessionConfig.DURATION);
    });

    test("DURATION is 24 hours in milliseconds", () => {
      expect(SessionConfig.DURATION).toBe(24 * 60 * 60 * 1000);
    });

    test("REMEMBER_ME_DURATION is 30 days in milliseconds", () => {
      expect(SessionConfig.REMEMBER_ME_DURATION).toBe(30 * 24 * 60 * 60 * 1000);
    });

    test("IDLE_TIMEOUT is 30 minutes in milliseconds", () => {
      expect(SessionConfig.IDLE_TIMEOUT).toBe(30 * 60 * 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // ValidationLimits
  // ---------------------------------------------------------------------------
  describe("ValidationLimits", () => {
    test("defines all expected limits", () => {
      expect(ValidationLimits.EMAIL_MAX).toBeDefined();
      expect(ValidationLimits.NAME_MAX).toBeDefined();
      expect(ValidationLimits.PASSWORD_MIN).toBeDefined();
      expect(ValidationLimits.PASSWORD_MAX).toBeDefined();
      expect(ValidationLimits.DESCRIPTION_MAX).toBeDefined();
      expect(ValidationLimits.NOTES_MAX).toBeDefined();
      expect(ValidationLimits.SLUG_MAX).toBeDefined();
      expect(ValidationLimits.SLUG_MIN).toBeDefined();
      expect(ValidationLimits.FILE_SIZE_MAX).toBeDefined();
    });

    test("PASSWORD_MIN < PASSWORD_MAX", () => {
      expect(ValidationLimits.PASSWORD_MIN).toBeLessThan(
        ValidationLimits.PASSWORD_MAX
      );
    });

    test("SLUG_MIN < SLUG_MAX", () => {
      expect(ValidationLimits.SLUG_MIN).toBeLessThan(ValidationLimits.SLUG_MAX);
    });

    test("FILE_SIZE_MAX is 10MB", () => {
      expect(ValidationLimits.FILE_SIZE_MAX).toBe(10 * 1024 * 1024);
    });

    test("all values are positive integers", () => {
      for (const value of Object.values(ValidationLimits)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DateFormats
  // ---------------------------------------------------------------------------
  describe("DateFormats", () => {
    test("defines all expected formats", () => {
      expect(DateFormats.ISO).toBeDefined();
      expect(DateFormats.DATE).toBeDefined();
      expect(DateFormats.TIME).toBeDefined();
      expect(DateFormats.DISPLAY_DATE).toBeDefined();
      expect(DateFormats.DISPLAY_DATETIME).toBeDefined();
    });

    test("all values are non-empty strings", () => {
      for (const value of Object.values(DateFormats)) {
        expect(typeof value).toBe("string");
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SystemRoles
  // ---------------------------------------------------------------------------
  describe("SystemRoles", () => {
    test("defines all expected roles", () => {
      expect(SystemRoles.SUPER_ADMIN).toBe("super_admin");
      expect(SystemRoles.TENANT_ADMIN).toBe("tenant_admin");
      expect(SystemRoles.HR_MANAGER).toBe("hr_manager");
      expect(SystemRoles.HR_STAFF).toBe("hr_staff");
      expect(SystemRoles.MANAGER).toBe("manager");
      expect(SystemRoles.EMPLOYEE).toBe("employee");
    });

    test("has exactly 6 roles", () => {
      expect(Object.keys(SystemRoles)).toHaveLength(6);
    });

    test("all values are unique", () => {
      const values = Object.values(SystemRoles);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    test("all values are lowercase strings", () => {
      for (const value of Object.values(SystemRoles)) {
        expect(value).toBe(value.toLowerCase());
      }
    });
  });

  // ---------------------------------------------------------------------------
  // AuditEventTypes
  // ---------------------------------------------------------------------------
  describe("AuditEventTypes", () => {
    test("defines auth events", () => {
      expect(AuditEventTypes.AUTH_LOGIN).toBe("auth.login");
      expect(AuditEventTypes.AUTH_LOGOUT).toBe("auth.logout");
      expect(AuditEventTypes.AUTH_LOGIN_FAILED).toBe("auth.login_failed");
      expect(AuditEventTypes.AUTH_PASSWORD_CHANGED).toBe("auth.password_changed");
      expect(AuditEventTypes.AUTH_MFA_ENABLED).toBe("auth.mfa_enabled");
      expect(AuditEventTypes.AUTH_MFA_DISABLED).toBe("auth.mfa_disabled");
    });

    test("defines user events", () => {
      expect(AuditEventTypes.USER_CREATED).toBe("user.created");
      expect(AuditEventTypes.USER_UPDATED).toBe("user.updated");
      expect(AuditEventTypes.USER_DELETED).toBe("user.deleted");
      expect(AuditEventTypes.USER_STATUS_CHANGED).toBe("user.status_changed");
    });

    test("defines employee events", () => {
      expect(AuditEventTypes.EMPLOYEE_CREATED).toBe("employee.created");
      expect(AuditEventTypes.EMPLOYEE_UPDATED).toBe("employee.updated");
      expect(AuditEventTypes.EMPLOYEE_TERMINATED).toBe("employee.terminated");
    });

    test("defines role events", () => {
      expect(AuditEventTypes.ROLE_ASSIGNED).toBe("role.assigned");
      expect(AuditEventTypes.ROLE_REVOKED).toBe("role.revoked");
      expect(AuditEventTypes.ROLE_CREATED).toBe("role.created");
      expect(AuditEventTypes.ROLE_UPDATED).toBe("role.updated");
      expect(AuditEventTypes.ROLE_DELETED).toBe("role.deleted");
    });

    test("defines tenant events", () => {
      expect(AuditEventTypes.TENANT_CREATED).toBe("tenant.created");
      expect(AuditEventTypes.TENANT_UPDATED).toBe("tenant.updated");
      expect(AuditEventTypes.TENANT_SUSPENDED).toBe("tenant.suspended");
      expect(AuditEventTypes.TENANT_ACTIVATED).toBe("tenant.activated");
    });

    test("all values follow namespace.action format", () => {
      for (const value of Object.values(AuditEventTypes)) {
        expect(value).toMatch(/^[a-z]+\.[a-z_]+$/);
      }
    });

    test("all values are unique", () => {
      const values = Object.values(AuditEventTypes);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });
});
