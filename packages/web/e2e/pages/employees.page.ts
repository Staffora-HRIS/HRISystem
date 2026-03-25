/**
 * Page Object Model: Employees Page
 *
 * Encapsulates selectors and interactions for the employee list page,
 * the hire employee modal, and the employee detail/edit page.
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { ROUTES } from "../helpers/test-data";

export class EmployeesListPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly subtitle: Locator;

  // Action buttons
  readonly hireButton: Locator;
  readonly exportButton: Locator;

  // Search and filters
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly departmentFilter: Locator;

  // Stats cards
  readonly totalEmployeesCard: Locator;
  readonly activeEmployeesCard: Locator;
  readonly onLeaveCard: Locator;
  readonly terminatedCard: Locator;

  // Table
  readonly employeeTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.locator("h1", { hasText: "Employees" });
    this.subtitle = page.locator("text=Manage your workforce");

    this.hireButton = page.locator("button", { hasText: "Hire Employee" });
    this.exportButton = page.locator("button", { hasText: "Export" });

    this.searchInput = page.locator('input[placeholder="Search employees..."]');
    this.statusFilter = page.locator("select").first();
    this.departmentFilter = page.locator("select").nth(1);

    this.totalEmployeesCard = page.locator("text=Total Employees").locator("..");
    this.activeEmployeesCard = page.locator("text=Active").locator("..");
    this.onLeaveCard = page.locator("text=On Leave").locator("..");
    this.terminatedCard = page.locator("text=Terminated").locator("..");

    this.employeeTable = page.locator("table");
    this.tableRows = page.locator("table tbody tr");
    this.emptyState = page.locator("text=No employees found");
    this.loadingSpinner = page.locator(".animate-spin");
  }

  /** Navigate to the employees list page */
  async goto(): Promise<void> {
    await this.page.goto(ROUTES.employees);
    await this.page.waitForLoadState("networkidle");
  }

  /** Assert the page loaded correctly */
  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.subtitle).toBeVisible();
  }

  /** Wait for employee data to finish loading */
  async waitForData(): Promise<void> {
    // Wait for either the table or the empty state to appear
    await this.page.waitForSelector(
      'table, :text("No employees found")',
      { state: "visible", timeout: 15_000 }
    );
  }

  /** Search for an employee by name or number */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for debounced search to trigger
    await this.page.waitForTimeout(500);
    await this.page.waitForLoadState("networkidle");
  }

  /** Filter by status */
  async filterByStatus(status: string): Promise<void> {
    await this.statusFilter.selectOption(status);
    await this.page.waitForLoadState("networkidle");
  }

  /** Click the "Hire Employee" button to open the modal */
  async clickHireEmployee(): Promise<void> {
    // The button may appear both in the header and empty state
    await this.hireButton.first().click();
  }

  /** Click on a specific employee row in the table */
  async clickEmployee(nameOrNumber: string): Promise<void> {
    const row = this.page.locator("table tbody tr", { hasText: nameOrNumber });
    await row.click();
    await this.page.waitForURL(/\/admin\/hr\/employees\/[a-f0-9-]+/);
  }

  /** Get the count of visible employee rows */
  async getRowCount(): Promise<number> {
    return await this.tableRows.count();
  }
}

export class HireEmployeeModal {
  readonly page: Page;

  // Modal container
  readonly modal: Locator;
  readonly modalTitle: Locator;

  // Form fields
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly hireDateInput: Locator;
  readonly departmentSelect: Locator;
  readonly employmentTypeSelect: Locator;

  // Action buttons
  readonly cancelButton: Locator;
  readonly hireButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.modal = page.locator('[role="dialog"], .modal');
    this.modalTitle = page.locator("h3", { hasText: "Hire New Employee" });

    this.firstNameInput = page.locator('input[placeholder="Enter first name"]');
    this.lastNameInput = page.locator('input[placeholder="Enter last name"]');
    this.emailInput = page.locator('input[placeholder="Enter email"]');
    this.hireDateInput = page.locator('input[type="date"]');
    this.departmentSelect = page.locator("select").nth(0);
    this.employmentTypeSelect = page.locator("select").nth(1);

    this.cancelButton = page.locator("button", { hasText: "Cancel" });
    this.hireButton = page.locator("button", { hasText: /^Hire Employee$|^Hiring...$/ });
  }

  /** Assert the hire modal is visible */
  async expectVisible(): Promise<void> {
    await expect(this.modalTitle).toBeVisible();
  }

  /** Fill in the hire employee form */
  async fillForm(data: {
    firstName: string;
    lastName: string;
    email: string;
    hireDate: string;
    departmentIndex?: number;
    employmentType?: string;
  }): Promise<void> {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.emailInput.fill(data.email);
    await this.hireDateInput.fill(data.hireDate);

    // Select department (first non-placeholder option if index not specified)
    if (data.departmentIndex !== undefined) {
      const options = await this.departmentSelect.locator("option").all();
      if (options.length > data.departmentIndex + 1) {
        await this.departmentSelect.selectOption({ index: data.departmentIndex + 1 });
      }
    } else {
      // Select first available department
      const options = await this.departmentSelect.locator("option").allTextContents();
      if (options.length > 1) {
        await this.departmentSelect.selectOption({ index: 1 });
      }
    }

    if (data.employmentType) {
      await this.employmentTypeSelect.selectOption(data.employmentType);
    }
  }

  /** Submit the hire form */
  async submit(): Promise<void> {
    await this.hireButton.click();
  }

  /** Cancel the hire form */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /** Assert the modal is closed */
  async expectClosed(): Promise<void> {
    await expect(this.modalTitle).not.toBeVisible();
  }
}

export class EmployeeDetailPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;
  readonly editButton: Locator;

  // Employee profile header
  readonly employeeName: Locator;
  readonly employeeNumber: Locator;
  readonly statusBadge: Locator;

  // Tab sections
  readonly personalTab: Locator;
  readonly contractTab: Locator;
  readonly documentsTab: Locator;

  // Edit modal
  readonly editModal: Locator;
  readonly saveButton: Locator;
  readonly cancelEditButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.backButton = page.locator('a[href="/admin/hr/employees"], button:has-text("Back")');
    this.editButton = page.locator("button", { hasText: "Edit" });

    // The employee name is displayed in a heading or prominent text
    this.employeeName = page.locator("h1, h2").first();
    this.employeeNumber = page.locator("text=/EMP-\\d+|#\\d+/");
    this.statusBadge = page.locator(".badge, [class*='badge']").first();

    this.personalTab = page.locator("text=Personal");
    this.contractTab = page.locator("text=Contract");
    this.documentsTab = page.locator("text=Documents");

    this.editModal = page.locator('[role="dialog"]');
    this.saveButton = page.locator("button", { hasText: /Save|Update/ });
    this.cancelEditButton = page.locator("button", { hasText: "Cancel" });
  }

  /** Assert that the employee detail page is displayed */
  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/admin\/hr\/employees\/[a-f0-9-]+/);
    // Wait for page content to load
    await this.page.waitForLoadState("networkidle");
  }

  /** Navigate back to the employees list */
  async goBack(): Promise<void> {
    await this.backButton.first().click();
    await this.page.waitForURL(/\/admin\/hr\/employees$/);
  }

  /** Click the edit button to open the edit modal or inline editing */
  async clickEdit(): Promise<void> {
    await this.editButton.first().click();
  }

  /** Get the displayed employee name */
  async getEmployeeName(): Promise<string> {
    return (await this.employeeName.textContent()) ?? "";
  }
}
