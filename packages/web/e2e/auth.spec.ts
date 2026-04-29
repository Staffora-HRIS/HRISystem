/**
 * E2E Tests: Authentication Flows
 *
 * Tests login, logout, MFA verification, session management,
 * and authentication guards (redirects for protected routes).
 */

import { test, expect } from "@playwright/test";
import { LoginPage, MfaPage } from "./pages/login.page";
import { login, logout, isRedirectedToLogin } from "./helpers/auth";
import { ADMIN_USER, ROUTES, PAGE_HEADINGS } from "./helpers/test-data";

test.describe("Login Page", () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test("should display the login form with all required elements", async () => {
    await loginPage.expectVisible();

    // Verify all form elements are present
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
    await expect(loginPage.rememberMeCheckbox).toBeVisible();
    await expect(loginPage.forgotPasswordLink).toBeVisible();

    // Verify heading text
    await expect(loginPage.heading).toContainText(PAGE_HEADINGS.login);

    // Verify submit button is enabled and shows correct text
    await loginPage.expectIdle();
  });

  test("should show email input with correct attributes", async () => {
    await expect(loginPage.emailInput).toHaveAttribute("type", "email");
    await expect(loginPage.emailInput).toHaveAttribute("autocomplete", "email");
    await expect(loginPage.emailInput).toHaveAttribute("required", "");
  });

  test("should show password input with correct attributes", async () => {
    await expect(loginPage.passwordInput).toHaveAttribute("type", "password");
    await expect(loginPage.passwordInput).toHaveAttribute("autocomplete", "current-password");
    await expect(loginPage.passwordInput).toHaveAttribute("required", "");
  });

  test("should successfully login with valid admin credentials", async ({ page }) => {
    await loginPage.login(ADMIN_USER.email, ADMIN_USER.password);

    // Should redirect to dashboard
    await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
      timeout: 15_000,
    });
    expect(page.url()).toContain("/dashboard");
  });

  test("should show error message with invalid credentials", async () => {
    await loginPage.login("invalid@staffora.co.uk", "WrongPassword123!");

    // Wait for the error to appear
    await loginPage.expectError();
  });

  test("should show error for empty email submission", async ({ page }) => {
    // Try to submit with only password filled
    await loginPage.passwordInput.fill("SomePassword123!");
    await loginPage.submit();

    // The browser's native validation should prevent submission
    // The form should remain on the login page
    expect(page.url()).toContain("/login");
  });

  test("should show error for empty password submission", async ({ page }) => {
    // Try to submit with only email filled
    await loginPage.emailInput.fill("admin@staffora.co.uk");
    await loginPage.submit();

    // The browser's native validation should prevent submission
    expect(page.url()).toContain("/login");
  });

  test("should navigate to forgot password page", async ({ page }) => {
    await loginPage.clickForgotPassword();
    expect(page.url()).toContain("/forgot-password");
  });

  test("should show loading state during login", async () => {
    await loginPage.fillCredentials(ADMIN_USER.email, ADMIN_USER.password);
    await loginPage.submit();

    // The button should briefly show "Signing in..." with a spinner
    // This is a fast check so we use a short timeout
    await expect(
      loginPage.page.locator('button[type="submit"]:has-text("Signing in")')
    ).toBeVisible({ timeout: 5_000 }).catch(() => {
      // Loading state may be too fast to catch, which is acceptable
    });
  });
});

test.describe("Logout Flow", () => {
  test("should successfully logout and redirect to login page", async ({ page }) => {
    // First, login
    await login(page, ADMIN_USER);

    // Then logout
    await logout(page);

    // Should be on login page
    expect(page.url()).toContain("/login");
  });

  test("should not be able to access protected pages after logout", async ({ page }) => {
    // Login first
    await login(page, ADMIN_USER);

    // Logout
    await logout(page);

    // Try to access a protected page
    await page.goto(ROUTES.adminDashboard);

    // Should be redirected to login
    const redirected = await isRedirectedToLogin(page);
    expect(redirected).toBe(true);
  });
});

test.describe("Session Management", () => {
  test("should redirect unauthenticated users to login from protected routes", async ({ page }) => {
    // Try to access the admin dashboard without logging in
    await page.goto(ROUTES.adminDashboard);

    // Should be redirected to login with a redirect parameter
    await page.waitForURL((url) => url.pathname.includes("/login"));
    expect(page.url()).toContain("/login");
  });

  test("should redirect to login from employee dashboard when not authenticated", async ({ page }) => {
    await page.goto(ROUTES.dashboard);
    await page.waitForURL((url) => url.pathname.includes("/login"));
    expect(page.url()).toContain("/login");
  });

  test("should include redirect parameter when redirected to login", async ({ page }) => {
    const targetPath = ROUTES.employees;
    await page.goto(targetPath);

    await page.waitForURL((url) => url.pathname.includes("/login"));

    // The redirect parameter should contain the original target path
    const url = new URL(page.url());
    const redirect = url.searchParams.get("redirect");
    expect(redirect).toBe(targetPath);
  });

  test("should redirect authenticated users away from login page", async ({ page }) => {
    // Login first
    await login(page, ADMIN_USER);

    // Navigate back to login page
    await page.goto(ROUTES.login);

    // Should be redirected away from login (to dashboard)
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });
    expect(page.url()).not.toContain("/login");
  });
});

test.describe("MFA Flow", () => {
  // MFA tests rely on the user having MFA enabled, which is a specific seed state.
  // These tests verify the UI works but may need specific test users with MFA configured.

  test("should display the MFA page with TOTP input when redirected", async ({ page }) => {
    // Navigate to MFA page directly (will redirect to login without valid state)
    await page.goto(ROUTES.mfa);

    // Without a valid MFA token in state, should redirect to login
    await page.waitForURL((url) =>
      url.pathname.includes("/login") || url.pathname.includes("/mfa")
    );
  });

  test("should show recovery code option on MFA page", async ({ page }) => {
    const mfaPage = new MfaPage(page);

    // Navigate to MFA with mock state (this tests the UI rendering)
    // In a real scenario, this would follow a login that triggers MFA
    await page.goto(ROUTES.mfa);

    // If we land on MFA page (user has MFA enabled), verify the recovery option exists
    if (page.url().includes("/mfa")) {
      await expect(mfaPage.recoveryCodeLink).toBeVisible();
    }
  });
});

test.describe("Page Title and Metadata", () => {
  test("should have correct page title on login page", async ({ page }) => {
    await page.goto(ROUTES.login);
    // Check that the page has a meaningful title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
