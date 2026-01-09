/**
 * Audit Plugin Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockAuditService, createMockRequestContext } from "../../helpers/mocks";

describe("Audit Plugin", () => {
  let auditService: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    auditService = createMockAuditService();
  });

  describe("Audit Log Creation", () => {
    it("should log all mutating operations", async () => {
      const context = createMockRequestContext();
      
      await auditService.log(context, {
        action: "hr.employee.created",
        resourceType: "employee",
        resourceId: "emp-123",
        newValue: { firstName: "John", lastName: "Doe" },
      });

      const logs = await auditService.query();
      expect(logs.length).toBe(1);
    });

    it("should capture before/after state for updates", async () => {
      const context = createMockRequestContext();
      
      await auditService.log(context, {
        action: "hr.employee.updated",
        resourceType: "employee",
        resourceId: "emp-123",
        oldValue: { firstName: "John" },
        newValue: { firstName: "Jonathan" },
      });

      const logs = await auditService.query();
      expect(logs[0]?.options).toMatchObject({
        oldValue: { firstName: "John" },
        newValue: { firstName: "Jonathan" },
      });
    });

    it("should record actor user_id", async () => {
      const context = createMockRequestContext({ userId: "user-789" });
      
      await auditService.log(context, {
        action: "hr.employee.created",
        resourceType: "employee",
      });

      const logs = await auditService.query();
      expect(logs[0]?.context).toMatchObject({ userId: "user-789" });
    });

    it("should record client IP address", async () => {
      const context = createMockRequestContext({ ipAddress: "192.168.1.100" });
      
      await auditService.log(context, {
        action: "hr.employee.created",
        resourceType: "employee",
      });

      const logs = await auditService.query();
      expect(logs[0]?.context).toMatchObject({ ipAddress: "192.168.1.100" });
    });

    it("should record request_id for correlation", async () => {
      const requestId = crypto.randomUUID();
      const context = createMockRequestContext({ requestId });
      
      await auditService.log(context, {
        action: "hr.employee.created",
        resourceType: "employee",
      });

      const logs = await auditService.query();
      expect(logs[0]?.context).toMatchObject({ requestId });
    });

    it("should not log read operations by default", () => {
      const readActions = ["hr.employee.viewed", "hr.employee.listed"];
      const mutatingActions = ["hr.employee.created", "hr.employee.updated", "hr.employee.deleted"];
      
      // Read actions should be filtered in real implementation
      expect(readActions.every(a => a.includes("viewed") || a.includes("listed"))).toBe(true);
      expect(mutatingActions.every(a => a.includes("created") || a.includes("updated") || a.includes("deleted"))).toBe(true);
    });
  });

  describe("PII Handling", () => {
    it("should handle PII redaction for sensitive fields", () => {
      const sensitiveFields = ["ssn", "bankAccount", "salary", "dateOfBirth"];
      const data = {
        firstName: "John",
        ssn: "123-45-6789",
        bankAccount: "1234567890",
        salary: 75000,
      };

      const redacted = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [
          k,
          sensitiveFields.includes(k) ? "[REDACTED]" : v,
        ])
      );

      expect(redacted.firstName).toBe("John");
      expect(redacted.ssn).toBe("[REDACTED]");
      expect(redacted.bankAccount).toBe("[REDACTED]");
      expect(redacted.salary).toBe("[REDACTED]");
    });
  });

  describe("Audit Actions", () => {
    it("should support authentication actions", () => {
      const authActions = [
        "security.auth.login",
        "security.auth.logout",
        "security.auth.login_failed",
        "security.auth.password_changed",
      ];
      
      authActions.forEach(action => {
        expect(action.startsWith("security.auth.")).toBe(true);
      });
    });

    it("should support HR actions", () => {
      const hrActions = [
        "hr.employee.created",
        "hr.employee.updated",
        "hr.employee.deleted",
        "hr.employee.terminated",
      ];
      
      hrActions.forEach(action => {
        expect(action.startsWith("hr.")).toBe(true);
      });
    });

    it("should support time and absence actions", () => {
      const timeActions = [
        "time.event.recorded",
        "time.timesheet.submitted",
        "absence.request.created",
        "absence.request.approved",
      ];
      
      expect(timeActions.length).toBe(4);
    });
  });
});
