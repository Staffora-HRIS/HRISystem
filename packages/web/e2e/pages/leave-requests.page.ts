/**
 * Page Object Model: Leave Requests Page
 *
 * Encapsulates selectors and interactions for the admin leave requests page,
 * including the approval/rejection workflow.
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { ROUTES } from "../helpers/test-data";

export class LeaveRequestsPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly subtitle: Locator;

  // Stats cards
  readonly totalRequestsCard: Locator;
  readonly pendingCard: Locator;
  readonly approvedCard: Locator;
  readonly rejectedCard: Locator;

  // Filters
  readonly statusFilter: Locator;

  // Table
  readonly requestTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly loadingSpinner: Locator;

  // Approve/Reject action buttons within table rows
  readonly approveButtons: Locator;
  readonly rejectButtons: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.locator("h1", { hasText: "Leave Requests" });
    this.subtitle = page.locator("text=Review and manage employee leave requests");

    this.totalRequestsCard = page.locator("text=Total Requests").locator("..");
    this.pendingCard = page.locator("text=Pending").locator("..");
    this.approvedCard = page.locator("p:text-is('Approved')").locator("..");
    this.rejectedCard = page.locator("p:text-is('Rejected')").locator("..");

    this.statusFilter = page.locator("select").first();

    this.requestTable = page.locator("table");
    this.tableRows = page.locator("table tbody tr");
    this.emptyState = page.locator("text=No leave requests found");
    this.loadingSpinner = page.locator(".animate-spin");

    this.approveButtons = page.locator('button[aria-label="Approve leave request"]');
    this.rejectButtons = page.locator('button[aria-label="Reject leave request"]');
  }

  /** Navigate to the leave requests page */
  async goto(): Promise<void> {
    await this.page.goto(ROUTES.leaveRequests);
    await this.page.waitForLoadState("networkidle");
  }

  /** Assert the page loaded correctly */
  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }

  /** Wait for leave request data to finish loading */
  async waitForData(): Promise<void> {
    await this.page.waitForSelector(
      'table, :text("No leave requests found")',
      { state: "visible", timeout: 15_000 }
    );
  }

  /** Filter by status */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.page.waitForLoadState("networkidle");
  }

  /** Get the count of visible request rows */
  async getRowCount(): Promise<number> {
    return await this.tableRows.count();
  }

  /** Click the approve button on the first pending request */
  async approveFirstRequest(): Promise<void> {
    await this.approveButtons.first().click();
  }

  /** Click the reject button on the first pending request */
  async rejectFirstRequest(): Promise<void> {
    await this.rejectButtons.first().click();
  }

  /** Get the status badge text for a specific row */
  async getRowStatus(rowIndex: number): Promise<string> {
    const row = this.tableRows.nth(rowIndex);
    const badge = row.locator(".badge, [class*='badge'], span[class*='rounded']");
    return (await badge.textContent()) ?? "";
  }
}

export class LeaveApprovalModal {
  readonly page: Page;

  // Modal elements
  readonly modal: Locator;
  readonly title: Locator;
  readonly message: Locator;
  readonly cancelButton: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.modal = page.locator('[role="dialog"], .modal');
    this.title = page.locator("h3").filter({
      hasText: /Approve Leave Request|Reject Leave Request/,
    });
    this.message = page.locator("text=Are you sure you want to");
    this.cancelButton = page.locator("button", { hasText: "Cancel" });
    this.approveButton = page.locator("button", { hasText: /^Approve$|^Approving...$/ });
    this.rejectButton = page.locator("button", { hasText: /^Reject$|^Rejecting...$/ });
  }

  /** Assert the approval confirmation modal is visible */
  async expectVisible(): Promise<void> {
    await expect(this.title).toBeVisible();
    await expect(this.message).toBeVisible();
  }

  /** Confirm the approval */
  async confirmApproval(): Promise<void> {
    await this.approveButton.click();
    // Wait for the modal to close
    await expect(this.title).not.toBeVisible({ timeout: 10_000 });
  }

  /** Confirm the rejection */
  async confirmRejection(): Promise<void> {
    await this.rejectButton.click();
    await expect(this.title).not.toBeVisible({ timeout: 10_000 });
  }

  /** Cancel the action */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await expect(this.title).not.toBeVisible();
  }
}
