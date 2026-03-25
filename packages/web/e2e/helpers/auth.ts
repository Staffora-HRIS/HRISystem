/**
 * Authentication Helpers for E2E Tests
 *
 * Provides login/logout utilities that can be used across test suites
 * to authenticate users before running test scenarios.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ADMIN_USER, ROUTES } from "./test-data";

interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Log in a user via the login page UI.
 *
 * Navigates to the login page, fills in credentials, submits the form,
 * and waits for navigation to complete (either to dashboard or MFA page).
 */
export async function login(
  page: Page,
  credentials: LoginCredentials = ADMIN_USER
): Promise<void> {
  // Navigate to login page
  await page.goto(ROUTES.login);

  // Wait for the login form to be ready
  await page.waitForSelector('input[name="email"]', { state: "visible" });

  // Fill in credentials
  await page.fill('input[name="email"]', credentials.email);
  await page.fill('input[name="password"]', credentials.password);

  // Submit the form
  await page.click('button[type="submit"]');

  // Wait for navigation away from login page
  // The app will redirect to either /dashboard, /admin/dashboard, or /mfa
  await page.waitForURL((url) => {
    const path = url.pathname;
    return (
      path.includes("/dashboard") ||
      path.includes("/mfa") ||
      path === "/"
    );
  }, { timeout: 15_000 });
}

/**
 * Log in as admin and navigate to the admin dashboard.
 *
 * Combines login with navigation to the admin console.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, ADMIN_USER);

  // If we landed on the employee dashboard, navigate to admin
  const currentUrl = page.url();
  if (!currentUrl.includes("/admin")) {
    await page.goto(ROUTES.adminDashboard);
    await page.waitForLoadState("networkidle");
  }
}

/**
 * Log out the current user.
 *
 * Clicks the user menu and then the "Sign out" button.
 */
export async function logout(page: Page): Promise<void> {
  // Open user menu (the avatar button in the header)
  const userMenuButton = page.locator('button[aria-haspopup="true"]');
  await userMenuButton.click();

  // Wait for the dropdown menu to appear
  const menu = page.locator('[role="menu"][aria-label="User menu"]');
  await expect(menu).toBeVisible();

  // Click "Sign out"
  const signOutButton = menu.locator('button:has-text("Sign out")');
  await signOutButton.click();

  // Wait for redirect to login page
  await page.waitForURL((url) => url.pathname.includes("/login"), {
    timeout: 10_000,
  });
}

/**
 * Check if the user is currently on a page that requires authentication.
 *
 * Returns true if redirected to login, false if page loaded normally.
 */
export async function isRedirectedToLogin(page: Page): Promise<boolean> {
  await page.waitForLoadState("networkidle");
  return page.url().includes("/login");
}

/**
 * Save authenticated session state to a file for reuse across tests.
 *
 * Usage in globalSetup:
 *   const browser = await chromium.launch();
 *   const page = await browser.newPage();
 *   await login(page, ADMIN_USER);
 *   await saveAuthState(page, 'e2e/.auth/admin.json');
 */
export async function saveAuthState(
  page: Page,
  path: string
): Promise<void> {
  await page.context().storageState({ path });
}
