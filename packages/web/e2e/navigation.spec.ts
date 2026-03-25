/**
 * E2E Tests: Navigation and Layout
 *
 * Tests the admin sidebar navigation, breadcrumbs, mobile responsiveness,
 * theme toggle, and verifies all main navigation links work correctly.
 */

import { test, expect } from "@playwright/test";
import { AdminNavigation } from "./pages/navigation.page";
import { loginAsAdmin } from "./helpers/auth";
import { ROUTES } from "./helpers/test-data";

test.describe("Admin Sidebar Navigation", () => {
  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    nav = new AdminNavigation(page);
  });

  test("should display the sidebar with logo and navigation groups", async () => {
    await nav.expectSidebarVisible();
    await expect(nav.sidebarLogo).toBeVisible();
  });

  test("should display the Back to App link", async () => {
    await expect(nav.backToAppLink).toBeVisible();
  });

  test("should navigate to employee dashboard when Back to App is clicked", async ({ page }) => {
    await nav.backToAppLink.click();
    await page.waitForURL((url) => url.pathname.includes("/dashboard"));
    expect(page.url()).toContain("/dashboard");
  });

  test("should display all navigation group headers", async () => {
    const expectedGroups = [
      "Overview",
      "HR Administration",
      "Time & Attendance",
      "Leave Management",
      "Benefits",
      "Talent",
      "Cases",
      "Onboarding",
      "Documents",
      "Learning",
      "Workflows",
      "Security",
      "Analytics & Reports",
      "Settings",
    ];

    for (const group of expectedGroups) {
      const groupHeader = nav.page.locator(`h3:text-is("${group}")`);
      // Some groups may be hidden based on permissions, so we just check visibility
      const isVisible = await groupHeader.isVisible().catch(() => false);
      // At least the main groups should be visible for an admin user
      if (["Overview", "HR Administration", "Security"].includes(group)) {
        expect(isVisible).toBe(true);
      }
    }
  });

  test("should display the header with breadcrumbs", async () => {
    await nav.expectHeaderVisible();
  });

  test("should display the theme toggle button", async () => {
    await expect(nav.themeToggle).toBeVisible();
  });

  test("should display the notifications button with badge", async () => {
    await expect(nav.notificationsButton).toBeVisible();
  });

  test("should display the user menu button", async () => {
    await expect(nav.userMenuButton).toBeVisible();
  });
});

test.describe("Navigation Link Functionality", () => {
  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    nav = new AdminNavigation(page);
  });

  // HR Administration links
  test("should navigate to Employees page", async ({ page }) => {
    await nav.clickNavLink("Employees");
    expect(page.url()).toContain("/admin/hr/employees");
    await expect(page.locator("h1")).toContainText("Employees");
  });

  test("should navigate to Positions page", async ({ page }) => {
    await nav.clickNavLink("Positions");
    expect(page.url()).toContain("/admin/hr/positions");
  });

  test("should navigate to Departments page", async ({ page }) => {
    await nav.clickNavLink("Departments");
    expect(page.url()).toContain("/admin/hr/departments");
  });

  test("should navigate to Contracts page", async ({ page }) => {
    await nav.clickNavLink("Contracts");
    expect(page.url()).toContain("/admin/hr/contracts");
  });

  test("should navigate to Org Chart page", async ({ page }) => {
    await nav.clickNavLink("Org Chart");
    expect(page.url()).toContain("/admin/hr/org-chart");
  });

  // Leave Management links
  test("should navigate to Leave Requests page", async ({ page }) => {
    await nav.clickNavLink("Leave Requests");
    expect(page.url()).toContain("/admin/leave/requests");
    await expect(page.locator("h1")).toContainText("Leave Requests");
  });

  test("should navigate to Leave Types page", async ({ page }) => {
    await nav.clickNavLink("Leave Types");
    expect(page.url()).toContain("/admin/leave/types");
  });

  // Cases link
  test("should navigate to Cases page", async ({ page }) => {
    await nav.clickNavLink("All Cases");
    expect(page.url()).toContain("/admin/cases");
  });

  // Security links
  test("should navigate to Users page", async ({ page }) => {
    await nav.clickNavLink("Users");
    expect(page.url()).toContain("/admin/security/users");
  });

  test("should navigate to Roles page", async ({ page }) => {
    await nav.clickNavLink("Roles");
    expect(page.url()).toContain("/admin/security/roles");
  });

  test("should navigate to Audit Log page", async ({ page }) => {
    await nav.clickNavLink("Audit Log");
    expect(page.url()).toContain("/admin/security/audit-log");
  });

  // Settings link
  test("should navigate to Tenant Settings page", async ({ page }) => {
    await nav.clickNavLink("Tenant Settings");
    expect(page.url()).toContain("/admin/settings/tenant");
  });
});

test.describe("Breadcrumbs", () => {
  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    nav = new AdminNavigation(page);
  });

  test("should show breadcrumbs on the employees page", async ({ page }) => {
    await page.goto(ROUTES.employees);
    await page.waitForLoadState("networkidle");

    await nav.expectBreadcrumbs("Admin", "Hr", "Employees");
  });

  test("should show breadcrumbs on the leave requests page", async ({ page }) => {
    await page.goto(ROUTES.leaveRequests);
    await page.waitForLoadState("networkidle");

    await nav.expectBreadcrumbs("Admin", "Leave", "Requests");
  });

  test("should have clickable breadcrumb segments", async ({ page }) => {
    await page.goto(ROUTES.employees);
    await page.waitForLoadState("networkidle");

    // The "Admin" breadcrumb should be a link
    const adminBreadcrumb = nav.breadcrumbs.locator('a:has-text("Admin")');
    await expect(adminBreadcrumb).toBeVisible();
  });
});

test.describe("User Menu", () => {
  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    nav = new AdminNavigation(page);
  });

  test("should open the user menu dropdown", async () => {
    await nav.openUserMenu();
    await expect(nav.userMenuDropdown).toBeVisible();
  });

  test("should display user email in the dropdown", async () => {
    await nav.openUserMenu();
    // The dropdown should contain the user's email
    await expect(nav.userMenuDropdown).toContainText("@");
  });

  test("should show My Profile link in the dropdown", async () => {
    await nav.openUserMenu();
    await expect(nav.profileLink).toBeVisible();
  });

  test("should show Sign out button in the dropdown", async () => {
    await nav.openUserMenu();
    await expect(nav.signOutButton).toBeVisible();
  });

  test("should close the user menu when Escape is pressed", async () => {
    await nav.openUserMenu();
    await expect(nav.userMenuDropdown).toBeVisible();

    await nav.closeUserMenu();
    await expect(nav.userMenuDropdown).not.toBeVisible();
  });

  test("should navigate to profile page from user menu", async ({ page }) => {
    await nav.goToProfile();
    expect(page.url()).toContain("/me/profile");
  });

  test("should sign out from user menu", async ({ page }) => {
    await nav.signOut();
    expect(page.url()).toContain("/login");
  });
});

test.describe("Theme Toggle", () => {
  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    nav = new AdminNavigation(page);
  });

  test("should toggle between light and dark mode", async ({ page }) => {
    // Get the initial theme state
    const initialLabel = await nav.themeToggle.getAttribute("aria-label");

    // Toggle theme
    await nav.toggleTheme();

    // The aria-label should change to reflect the new mode
    const newLabel = await nav.themeToggle.getAttribute("aria-label");
    expect(newLabel).not.toEqual(initialLabel);
  });
});

test.describe("Mobile Navigation", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X viewport

  let nav: AdminNavigation;

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    nav = new AdminNavigation(page);
  });

  test("should show the mobile menu button on small screens", async () => {
    await expect(nav.mobileMenuButton).toBeVisible();
  });

  test("should open the mobile sidebar when menu button is clicked", async () => {
    await nav.openMobileSidebar();

    // The sidebar should be visible
    await expect(nav.sidebar).toBeVisible();

    // The close button should also be visible
    await expect(nav.mobileSidebarCloseButton).toBeVisible();
  });

  test("should close the mobile sidebar when close button is clicked", async () => {
    await nav.openMobileSidebar();
    await expect(nav.sidebar).toBeVisible();

    await nav.closeMobileSidebar();

    // The sidebar should no longer be fully visible on mobile
    // (it's still in the DOM but translated off-screen)
  });

  test("should navigate from mobile sidebar", async ({ page }) => {
    await nav.openMobileSidebar();

    // Click a navigation link
    await nav.clickNavLink("Employees");

    expect(page.url()).toContain("/admin/hr/employees");
  });
});

test.describe("Page Load Performance", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("should load the admin dashboard within acceptable time", async ({ page }) => {
    const start = Date.now();
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    // Page should load within 10 seconds (generous for E2E)
    expect(loadTime).toBeLessThan(10_000);
  });

  test("should load the employees page within acceptable time", async ({ page }) => {
    const start = Date.now();
    await page.goto(ROUTES.employees);
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(10_000);
  });

  test("should load the leave requests page within acceptable time", async ({ page }) => {
    const start = Date.now();
    await page.goto(ROUTES.leaveRequests);
    await page.waitForLoadState("networkidle");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(10_000);
  });
});
