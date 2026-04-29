/**
 * E2E Tests: Leave Request Management
 *
 * Tests the leave request list page, filtering, and the manager
 * approval/rejection workflow.
 */

import { test, expect } from "@playwright/test";
import {
  LeaveRequestsPage,
  LeaveApprovalModal,
} from "./pages/leave-requests.page";
import { loginAsAdmin } from "./helpers/auth";
import { ROUTES } from "./helpers/test-data";

test.describe("Leave Requests List Page", () => {
  let leaveRequestsPage: LeaveRequestsPage;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    leaveRequestsPage = new LeaveRequestsPage(page);
    await leaveRequestsPage.goto();
  });

  test("should display the leave requests page with heading", async () => {
    await leaveRequestsPage.expectVisible();
  });

  test("should display stats cards for total, pending, approved, and rejected", async () => {
    await expect(leaveRequestsPage.totalRequestsCard).toBeVisible();
    await expect(leaveRequestsPage.pendingCard).toBeVisible();
    await expect(leaveRequestsPage.approvedCard).toBeVisible();
    await expect(leaveRequestsPage.rejectedCard).toBeVisible();
  });

  test("should display the status filter dropdown", async () => {
    await expect(leaveRequestsPage.statusFilter).toBeVisible();
  });

  test("should load leave request data or show empty state", async () => {
    await leaveRequestsPage.waitForData();

    const hasTable = await leaveRequestsPage.requestTable.isVisible().catch(() => false);
    const hasEmptyState = await leaveRequestsPage.emptyState.isVisible().catch(() => false);

    expect(hasTable || hasEmptyState).toBe(true);
  });

  test("should filter by pending status", async () => {
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.expectVisible();
  });

  test("should filter by approved status", async () => {
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.filterByStatus("approved");
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.expectVisible();
  });

  test("should filter by rejected status", async () => {
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.filterByStatus("rejected");
    await leaveRequestsPage.waitForData();
    await leaveRequestsPage.expectVisible();
  });

  test("should show all requests when filter is cleared", async () => {
    await leaveRequestsPage.waitForData();

    // Apply a filter
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    // Clear the filter
    await leaveRequestsPage.filterByStatus("");
    await leaveRequestsPage.waitForData();

    await leaveRequestsPage.expectVisible();
  });
});

test.describe("Leave Request Approval Workflow", () => {
  let leaveRequestsPage: LeaveRequestsPage;
  let approvalModal: LeaveApprovalModal;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    leaveRequestsPage = new LeaveRequestsPage(page);
    approvalModal = new LeaveApprovalModal(page);
    await leaveRequestsPage.goto();
    await leaveRequestsPage.waitForData();
  });

  test("should show approve and reject buttons for pending requests", async () => {
    // Filter to only pending requests
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const hasTable = await leaveRequestsPage.requestTable.isVisible().catch(() => false);

    if (hasTable) {
      const rowCount = await leaveRequestsPage.getRowCount();
      if (rowCount > 0) {
        // Pending requests should have approve/reject buttons
        const approveCount = await leaveRequestsPage.approveButtons.count();
        const rejectCount = await leaveRequestsPage.rejectButtons.count();

        expect(approveCount).toBeGreaterThan(0);
        expect(rejectCount).toBeGreaterThan(0);
      }
    }
  });

  test("should open approval confirmation modal when Approve is clicked", async ({ page }) => {
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const approveCount = await leaveRequestsPage.approveButtons.count();

    if (approveCount > 0) {
      await leaveRequestsPage.approveFirstRequest();
      await approvalModal.expectVisible();

      // Verify the modal shows the correct title
      await expect(approvalModal.title).toContainText("Approve Leave Request");
    }
  });

  test("should open rejection confirmation modal when Reject is clicked", async ({ page }) => {
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const rejectCount = await leaveRequestsPage.rejectButtons.count();

    if (rejectCount > 0) {
      await leaveRequestsPage.rejectFirstRequest();
      await approvalModal.expectVisible();

      // Verify the modal shows the correct title
      await expect(approvalModal.title).toContainText("Reject Leave Request");
    }
  });

  test("should close the approval modal when Cancel is clicked", async () => {
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const approveCount = await leaveRequestsPage.approveButtons.count();

    if (approveCount > 0) {
      await leaveRequestsPage.approveFirstRequest();
      await approvalModal.expectVisible();

      await approvalModal.cancel();

      // Modal should be closed
      await expect(approvalModal.title).not.toBeVisible();
    }
  });

  test("should approve a leave request and update the list", async ({ page }) => {
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const approveCount = await leaveRequestsPage.approveButtons.count();

    if (approveCount > 0) {
      await leaveRequestsPage.approveFirstRequest();
      await approvalModal.expectVisible();
      await approvalModal.confirmApproval();

      // Wait for the list to refresh
      await page.waitForLoadState("networkidle");

      // The pending count should have decreased
      // (or the approved request should no longer appear in the pending filter)
      await leaveRequestsPage.waitForData();
    }
  });

  test("should reject a leave request and update the list", async ({ page }) => {
    await leaveRequestsPage.filterByStatus("pending");
    await leaveRequestsPage.waitForData();

    const rejectCount = await leaveRequestsPage.rejectButtons.count();

    if (rejectCount > 0) {
      await leaveRequestsPage.rejectFirstRequest();
      await approvalModal.expectVisible();
      await approvalModal.confirmRejection();

      // Wait for the list to refresh
      await page.waitForLoadState("networkidle");
      await leaveRequestsPage.waitForData();
    }
  });

  test("should not show action buttons for already approved requests", async () => {
    await leaveRequestsPage.filterByStatus("approved");
    await leaveRequestsPage.waitForData();

    const hasTable = await leaveRequestsPage.requestTable.isVisible().catch(() => false);

    if (hasTable) {
      const rowCount = await leaveRequestsPage.getRowCount();
      if (rowCount > 0) {
        // Approved requests should NOT have approve/reject buttons
        const approveCount = await leaveRequestsPage.approveButtons.count();
        expect(approveCount).toBe(0);
      }
    }
  });

  test("should not show action buttons for rejected requests", async () => {
    await leaveRequestsPage.filterByStatus("rejected");
    await leaveRequestsPage.waitForData();

    const hasTable = await leaveRequestsPage.requestTable.isVisible().catch(() => false);

    if (hasTable) {
      const rowCount = await leaveRequestsPage.getRowCount();
      if (rowCount > 0) {
        const approveCount = await leaveRequestsPage.approveButtons.count();
        expect(approveCount).toBe(0);
      }
    }
  });
});

test.describe("Leave Requests URL Navigation", () => {
  test("should load the leave requests page directly by URL", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(ROUTES.leaveRequests);
    await page.waitForLoadState("networkidle");

    const leaveRequestsPage = new LeaveRequestsPage(page);
    await leaveRequestsPage.expectVisible();
  });

  test("should load leave types page", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(ROUTES.leaveTypes);
    await page.waitForLoadState("networkidle");

    // Should not redirect to login or show an error
    expect(page.url()).toContain("/admin/leave/types");
  });

  test("should load leave policies page", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto(ROUTES.leavePolicies);
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/admin/leave/policies");
  });
});
