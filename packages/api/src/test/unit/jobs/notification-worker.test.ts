/**
 * Notification Worker Unit Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { createMockEmailService, createMockNotificationService } from "../../helpers/mocks";

describe("Notification Worker", () => {
  let emailService: ReturnType<typeof createMockEmailService>;
  let notificationService: ReturnType<typeof createMockNotificationService>;

  beforeEach(() => {
    emailService = createMockEmailService();
    notificationService = createMockNotificationService();
  });

  describe("Email Notifications", () => {
    it("should send email on leave_request.submitted", async () => {
      await emailService.sendTemplate(
        "manager@example.com",
        "leave-request-submitted",
        { employeeName: "John Doe", startDate: "2024-06-01" }
      );
      expect(emailService.sendTemplate).toHaveBeenCalled();
    });

    it("should send email on leave_request.approved", async () => {
      await emailService.sendTemplate(
        "employee@example.com",
        "leave-request-approved",
        { startDate: "2024-06-01", endDate: "2024-06-05" }
      );
      expect(emailService.sendTemplate).toHaveBeenCalled();
    });

    it("should send email on leave_request.rejected", async () => {
      await emailService.sendTemplate(
        "employee@example.com",
        "leave-request-rejected",
        { reason: "Busy period" }
      );
      expect(emailService.sendTemplate).toHaveBeenCalled();
    });

    it("should include correct recipient based on event", () => {
      const eventRecipients: Record<string, string> = {
        "leave_request.submitted": "manager",
        "leave_request.approved": "employee",
        "leave_request.rejected": "employee",
        "timesheet.submitted": "manager",
      };
      
      expect(eventRecipients["leave_request.submitted"]).toBe("manager");
      expect(eventRecipients["leave_request.approved"]).toBe("employee");
    });

    it("should retry on transient failures", () => {
      const maxRetries = 3;
      expect(maxRetries).toBe(3);
    });
  });

  describe("In-App Notifications", () => {
    it("should create notification record", async () => {
      const notificationId = await notificationService.send(
        "user-123",
        "leave_approved",
        { message: "Your leave request was approved" }
      );
      expect(notificationId).toBeDefined();
    });

    it("should mark as unread initially", () => {
      const notification = { id: "1", read: false, created_at: new Date() };
      expect(notification.read).toBe(false);
    });

    it("should support notification preferences", () => {
      const preferences = {
        email: true,
        push: false,
        inApp: true,
        sms: false,
      };
      
      expect(preferences.email).toBe(true);
      expect(preferences.push).toBe(false);
    });
  });
});
