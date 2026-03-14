/**
 * Notifications Service Unit Tests
 *
 * Tests for notification management business logic including:
 * - Notification response mapping
 * - Push token response mapping
 * - Notification type validation
 * - Expiry and read/dismiss state logic
 *
 * NOTE: Business logic is extracted inline to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/notifications/service.ts)
// =============================================================================

interface NotificationRow {
  id: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  actionUrl: string | null;
  actionText: string | null;
  icon: string | null;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  dismissedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PushTokenRow {
  id: string;
  userId: string;
  token: string;
  platform: string;
  deviceName: string | null;
  deviceModel: string | null;
  enabled: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationResponse {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  action_url: string | null;
  action_text: string | null;
  icon: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  dismissed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapNotificationToResponse(row: NotificationRow): NotificationResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    user_id: row.userId,
    title: row.title,
    message: row.message,
    type: row.type,
    action_url: row.actionUrl,
    action_text: row.actionText,
    icon: row.icon,
    data: row.data,
    read_at: row.readAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapPushTokenToResponse(row: PushTokenRow) {
  return {
    id: row.id,
    user_id: row.userId,
    token: row.token,
    platform: row.platform as "ios" | "android" | "web",
    device_name: row.deviceName,
    device_model: row.deviceModel,
    enabled: row.enabled,
    expires_at: row.expiresAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const NOTIFICATION_TYPES = [
  "info", "warning", "error", "success",
  "leave_request", "leave_approved", "leave_rejected",
  "task_assigned", "task_completed",
  "employee_terminated", "employee_onboarded",
  "payroll_ready", "payroll_submitted",
  "document_shared", "document_signed",
] as const;

function isValidNotificationType(type: string): boolean {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

function isNotificationExpired(notification: { expiresAt: Date | null }): boolean {
  if (!notification.expiresAt) return false;
  return notification.expiresAt < new Date();
}

function isNotificationRead(notification: { readAt: Date | null }): boolean {
  return notification.readAt !== null;
}

function isNotificationDismissed(notification: { dismissedAt: Date | null }): boolean {
  return notification.dismissedAt !== null;
}

// =============================================================================
// Helper
// =============================================================================

function createMockNotificationRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "notif-1",
    tenantId: "tenant-1",
    userId: "user-1",
    title: "Test Notification",
    message: "This is a test notification",
    type: "info",
    actionUrl: null,
    actionText: null,
    icon: null,
    data: null,
    readAt: null,
    dismissedAt: null,
    expiresAt: null,
    createdAt: new Date("2025-01-01T10:00:00Z"),
    updatedAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

function createMockPushTokenRow(overrides: Partial<PushTokenRow> = {}): PushTokenRow {
  return {
    id: "token-1",
    userId: "user-1",
    token: "ExponentPushToken[abc123]",
    platform: "ios",
    deviceName: "iPhone 15",
    deviceModel: "iPhone15,4",
    enabled: true,
    expiresAt: null,
    createdAt: new Date("2025-01-01T10:00:00Z"),
    updatedAt: new Date("2025-01-01T10:00:00Z"),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("NotificationsService", () => {
  describe("mapNotificationToResponse", () => {
    it("maps all fields correctly", () => {
      const row = createMockNotificationRow();
      const response = mapNotificationToResponse(row);

      expect(response.id).toBe("notif-1");
      expect(response.tenant_id).toBe("tenant-1");
      expect(response.user_id).toBe("user-1");
      expect(response.title).toBe("Test Notification");
      expect(response.message).toBe("This is a test notification");
      expect(response.type).toBe("info");
      expect(response.action_url).toBeNull();
      expect(response.action_text).toBeNull();
      expect(response.icon).toBeNull();
      expect(response.data).toBeNull();
      expect(response.read_at).toBeNull();
      expect(response.dismissed_at).toBeNull();
      expect(response.expires_at).toBeNull();
      expect(response.created_at).toBe("2025-01-01T10:00:00.000Z");
      expect(response.updated_at).toBe("2025-01-01T10:00:00.000Z");
    });

    it("maps readAt to ISO string", () => {
      const row = createMockNotificationRow({
        readAt: new Date("2025-01-02T12:00:00Z"),
      });
      const response = mapNotificationToResponse(row);
      expect(response.read_at).toBe("2025-01-02T12:00:00.000Z");
    });

    it("maps dismissedAt to ISO string", () => {
      const row = createMockNotificationRow({
        dismissedAt: new Date("2025-01-03T15:00:00Z"),
      });
      const response = mapNotificationToResponse(row);
      expect(response.dismissed_at).toBe("2025-01-03T15:00:00.000Z");
    });

    it("maps expiresAt to ISO string", () => {
      const row = createMockNotificationRow({
        expiresAt: new Date("2025-06-01T00:00:00Z"),
      });
      const response = mapNotificationToResponse(row);
      expect(response.expires_at).toBe("2025-06-01T00:00:00.000Z");
    });

    it("preserves action URL and text", () => {
      const row = createMockNotificationRow({
        actionUrl: "/leave/requests/123",
        actionText: "View Request",
      });
      const response = mapNotificationToResponse(row);
      expect(response.action_url).toBe("/leave/requests/123");
      expect(response.action_text).toBe("View Request");
    });

    it("preserves arbitrary data payload", () => {
      const row = createMockNotificationRow({
        data: { employeeId: "emp-1", leaveType: "annual" },
      });
      const response = mapNotificationToResponse(row);
      expect(response.data).toEqual({ employeeId: "emp-1", leaveType: "annual" });
    });
  });

  describe("mapPushTokenToResponse", () => {
    it("maps all fields correctly", () => {
      const row = createMockPushTokenRow();
      const response = mapPushTokenToResponse(row);

      expect(response.id).toBe("token-1");
      expect(response.user_id).toBe("user-1");
      expect(response.token).toBe("ExponentPushToken[abc123]");
      expect(response.platform).toBe("ios");
      expect(response.device_name).toBe("iPhone 15");
      expect(response.device_model).toBe("iPhone15,4");
      expect(response.enabled).toBe(true);
      expect(response.expires_at).toBeNull();
    });

    it("maps web platform", () => {
      const row = createMockPushTokenRow({ platform: "web" });
      const response = mapPushTokenToResponse(row);
      expect(response.platform).toBe("web");
    });

    it("maps disabled token", () => {
      const row = createMockPushTokenRow({ enabled: false });
      const response = mapPushTokenToResponse(row);
      expect(response.enabled).toBe(false);
    });

    it("maps token with expiry", () => {
      const row = createMockPushTokenRow({
        expiresAt: new Date("2026-01-01T00:00:00Z"),
      });
      const response = mapPushTokenToResponse(row);
      expect(response.expires_at).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("Notification type validation", () => {
    it("accepts valid notification types", () => {
      expect(isValidNotificationType("info")).toBe(true);
      expect(isValidNotificationType("warning")).toBe(true);
      expect(isValidNotificationType("leave_request")).toBe(true);
      expect(isValidNotificationType("payroll_ready")).toBe(true);
    });

    it("rejects invalid notification types", () => {
      expect(isValidNotificationType("")).toBe(false);
      expect(isValidNotificationType("unknown")).toBe(false);
      expect(isValidNotificationType("CRITICAL")).toBe(false);
    });
  });

  describe("Notification state helpers", () => {
    it("detects expired notifications", () => {
      const past = new Date(Date.now() - 86400000); // yesterday
      expect(isNotificationExpired({ expiresAt: past })).toBe(true);
    });

    it("detects non-expired notifications", () => {
      const future = new Date(Date.now() + 86400000); // tomorrow
      expect(isNotificationExpired({ expiresAt: future })).toBe(false);
    });

    it("treats null expiry as not expired", () => {
      expect(isNotificationExpired({ expiresAt: null })).toBe(false);
    });

    it("detects read notifications", () => {
      expect(isNotificationRead({ readAt: new Date() })).toBe(true);
      expect(isNotificationRead({ readAt: null })).toBe(false);
    });

    it("detects dismissed notifications", () => {
      expect(isNotificationDismissed({ dismissedAt: new Date() })).toBe(true);
      expect(isNotificationDismissed({ dismissedAt: null })).toBe(false);
    });
  });
});
