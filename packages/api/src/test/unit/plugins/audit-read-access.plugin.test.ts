/**
 * Read Audit Logging (GDPR Article 30) Unit Tests
 *
 * Tests the automatic read audit logging feature that logs access
 * to sensitive personal data endpoints on successful GET requests.
 *
 * Covers:
 * - SENSITIVE_READ_ROUTES pattern matching
 * - matchSensitiveReadRoute helper
 * - isReadAuditEnabled gating
 * - AuditActions data access constants
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  AuditActions,
  SENSITIVE_READ_ROUTES,
  matchSensitiveReadRoute,
  isReadAuditEnabled,
} from "../../../plugins/audit";

// =============================================================================
// SENSITIVE_READ_ROUTES definition
// =============================================================================

describe("SENSITIVE_READ_ROUTES", () => {
  it("should contain entries for all required sensitive route patterns", () => {
    // Verify minimum expected routes are present
    const resourceTypes = SENSITIVE_READ_ROUTES.map((r) => r.resourceType);
    expect(resourceTypes).toContain("employee");
    expect(resourceTypes).toContain("diversity");
    expect(resourceTypes).toContain("emergency_contact");
    expect(resourceTypes).toContain("dsar");
    expect(resourceTypes).toContain("benefit_enrollment");
    expect(resourceTypes).toContain("absence");
    expect(resourceTypes).toContain("right_to_work");
  });

  it("should have valid pattern, resourceType, and action for each entry", () => {
    for (const route of SENSITIVE_READ_ROUTES) {
      expect(route.pattern).toBeInstanceOf(RegExp);
      expect(typeof route.resourceType).toBe("string");
      expect(route.resourceType.length).toBeGreaterThan(0);
      expect(typeof route.action).toBe("string");
      expect(route.action.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// matchSensitiveReadRoute
// =============================================================================

describe("matchSensitiveReadRoute", () => {
  // ---- Employee data ----
  it("should match individual employee endpoint", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/hr/employees/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("employee");
    expect(result!.action).toBe(AuditActions.EMPLOYEE_DATA_ACCESSED);
  });

  it("should NOT match employee list endpoint", () => {
    const result = matchSensitiveReadRoute("/api/v1/hr/employees");
    expect(result).toBeNull();
  });

  it("should NOT match employee sub-resources (trailing path)", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/hr/employees/550e8400-e29b-41d4-a716-446655440000/contracts"
    );
    expect(result).toBeNull();
  });

  // ---- Diversity data ----
  it("should match diversity endpoints", () => {
    const result = matchSensitiveReadRoute("/api/v1/diversity");
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("diversity");
    expect(result!.action).toBe(AuditActions.DIVERSITY_DATA_ACCESSED);
  });

  it("should match diversity sub-paths", () => {
    const result = matchSensitiveReadRoute("/api/v1/diversity/reports");
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("diversity");
  });

  // ---- Emergency contacts ----
  it("should match emergency contacts endpoints", () => {
    const result = matchSensitiveReadRoute("/api/v1/emergency-contacts");
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("emergency_contact");
    expect(result!.action).toBe(AuditActions.EMERGENCY_CONTACT_ACCESSED);
  });

  it("should match emergency contacts with ID", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/emergency-contacts/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("emergency_contact");
  });

  // ---- DSAR ----
  it("should match DSAR endpoints", () => {
    const result = matchSensitiveReadRoute("/api/v1/dsar");
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("dsar");
    expect(result!.action).toBe(AuditActions.DSAR_DATA_ACCESSED);
  });

  it("should match DSAR sub-paths", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/dsar/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("dsar");
  });

  // ---- Benefits enrollments ----
  it("should match individual benefit enrollment endpoint", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/benefits/enrollments/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("benefit_enrollment");
    expect(result!.action).toBe(AuditActions.BENEFITS_DATA_ACCESSED);
  });

  it("should NOT match benefits enrollment list", () => {
    const result = matchSensitiveReadRoute("/api/v1/benefits/enrollments");
    expect(result).toBeNull();
  });

  // ---- Absence data ----
  it("should match individual absence endpoint", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/absence/employees/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("absence");
    expect(result!.action).toBe(AuditActions.ABSENCE_DATA_ACCESSED);
  });

  it("should match absence sub-paths for an employee", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/absence/employees/550e8400-e29b-41d4-a716-446655440000/balances"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("absence");
  });

  // ---- Right to work ----
  it("should match right-to-work endpoints", () => {
    const result = matchSensitiveReadRoute("/api/v1/right-to-work");
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("right_to_work");
    expect(result!.action).toBe(AuditActions.RIGHT_TO_WORK_ACCESSED);
  });

  it("should match right-to-work sub-paths", () => {
    const result = matchSensitiveReadRoute(
      "/api/v1/right-to-work/550e8400-e29b-41d4-a716-446655440000"
    );
    expect(result).not.toBeNull();
    expect(result!.resourceType).toBe("right_to_work");
  });

  // ---- Non-sensitive routes ----
  it("should return null for non-sensitive routes", () => {
    expect(matchSensitiveReadRoute("/api/v1/time/events")).toBeNull();
    expect(matchSensitiveReadRoute("/api/v1/cases")).toBeNull();
    expect(matchSensitiveReadRoute("/api/v1/lms/courses")).toBeNull();
    expect(matchSensitiveReadRoute("/api/v1/workflows")).toBeNull();
    expect(matchSensitiveReadRoute("/health")).toBeNull();
    expect(matchSensitiveReadRoute("/api/v1/hr/employees")).toBeNull();
    expect(matchSensitiveReadRoute("/api/v1/dashboard")).toBeNull();
  });

  it("should return null for empty path", () => {
    expect(matchSensitiveReadRoute("")).toBeNull();
  });

  it("should return null for root path", () => {
    expect(matchSensitiveReadRoute("/")).toBeNull();
  });
});

// =============================================================================
// isReadAuditEnabled
// =============================================================================

describe("isReadAuditEnabled", () => {
  const originalEnv = process.env["AUDIT_READ_ACCESS"];

  afterEach(() => {
    // Restore original env value
    if (originalEnv === undefined) {
      delete process.env["AUDIT_READ_ACCESS"];
    } else {
      process.env["AUDIT_READ_ACCESS"] = originalEnv;
    }
  });

  it('should return true when AUDIT_READ_ACCESS is "true"', () => {
    process.env["AUDIT_READ_ACCESS"] = "true";
    expect(isReadAuditEnabled()).toBe(true);
  });

  it('should return false when AUDIT_READ_ACCESS is "false"', () => {
    process.env["AUDIT_READ_ACCESS"] = "false";
    expect(isReadAuditEnabled()).toBe(false);
  });

  it("should return false when AUDIT_READ_ACCESS is not set", () => {
    delete process.env["AUDIT_READ_ACCESS"];
    expect(isReadAuditEnabled()).toBe(false);
  });

  it("should return false for other truthy-looking values (1, yes, TRUE)", () => {
    process.env["AUDIT_READ_ACCESS"] = "1";
    expect(isReadAuditEnabled()).toBe(false);

    process.env["AUDIT_READ_ACCESS"] = "yes";
    expect(isReadAuditEnabled()).toBe(false);

    process.env["AUDIT_READ_ACCESS"] = "TRUE";
    expect(isReadAuditEnabled()).toBe(false);
  });

  it("should return false for empty string", () => {
    process.env["AUDIT_READ_ACCESS"] = "";
    expect(isReadAuditEnabled()).toBe(false);
  });
});

// =============================================================================
// AuditActions - GDPR data access constants
// =============================================================================

describe("AuditActions - GDPR data access", () => {
  it("should define all GDPR data access action constants", () => {
    expect(AuditActions.DATA_ACCESS).toBe("gdpr.data_access");
    expect(AuditActions.EMPLOYEE_DATA_ACCESSED).toBe("gdpr.employee_data.accessed");
    expect(AuditActions.DIVERSITY_DATA_ACCESSED).toBe("gdpr.diversity_data.accessed");
    expect(AuditActions.EMERGENCY_CONTACT_ACCESSED).toBe("gdpr.emergency_contact.accessed");
    expect(AuditActions.DSAR_DATA_ACCESSED).toBe("gdpr.dsar.accessed");
    expect(AuditActions.BENEFITS_DATA_ACCESSED).toBe("gdpr.benefits_data.accessed");
    expect(AuditActions.ABSENCE_DATA_ACCESSED).toBe("gdpr.absence_data.accessed");
    expect(AuditActions.RIGHT_TO_WORK_ACCESSED).toBe("gdpr.right_to_work.accessed");
  });

  it("should have unique action values for each GDPR data access type", () => {
    const gdprActions = [
      AuditActions.DATA_ACCESS,
      AuditActions.EMPLOYEE_DATA_ACCESSED,
      AuditActions.DIVERSITY_DATA_ACCESSED,
      AuditActions.EMERGENCY_CONTACT_ACCESSED,
      AuditActions.DSAR_DATA_ACCESSED,
      AuditActions.BENEFITS_DATA_ACCESSED,
      AuditActions.ABSENCE_DATA_ACCESSED,
      AuditActions.RIGHT_TO_WORK_ACCESSED,
    ];
    const uniqueActions = new Set(gdprActions);
    expect(uniqueActions.size).toBe(gdprActions.length);
  });

  it("should follow the gdpr.* namespace convention", () => {
    const gdprActions = [
      AuditActions.DATA_ACCESS,
      AuditActions.EMPLOYEE_DATA_ACCESSED,
      AuditActions.DIVERSITY_DATA_ACCESSED,
      AuditActions.EMERGENCY_CONTACT_ACCESSED,
      AuditActions.DSAR_DATA_ACCESSED,
      AuditActions.BENEFITS_DATA_ACCESSED,
      AuditActions.ABSENCE_DATA_ACCESSED,
      AuditActions.RIGHT_TO_WORK_ACCESSED,
    ];
    for (const action of gdprActions) {
      expect(action.startsWith("gdpr.")).toBe(true);
    }
  });
});

// =============================================================================
// SENSITIVE_READ_ROUTES - action mapping consistency
// =============================================================================

describe("SENSITIVE_READ_ROUTES action mapping", () => {
  it("should map each route to a valid AuditActions constant", () => {
    const allActionValues = Object.values(AuditActions);
    for (const route of SENSITIVE_READ_ROUTES) {
      expect(allActionValues).toContain(route.action);
    }
  });

  it("should only map to gdpr.* action values", () => {
    for (const route of SENSITIVE_READ_ROUTES) {
      expect(route.action.startsWith("gdpr.")).toBe(true);
    }
  });
});
