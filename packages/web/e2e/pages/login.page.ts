/**
 * Page Object Model: Login Page
 *
 * Encapsulates all selectors and interactions for the login page,
 * MFA verification page, and forgot password page.
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { ROUTES } from "../helpers/test-data";

export class LoginPage {
  readonly page: Page;

  // Login form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly forgotPasswordLink: Locator;

  // Page elements
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly errorAlert: Locator;
  readonly loadingSpinner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Form inputs use name attributes (matching the actual login route markup)
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.rememberMeCheckbox = page.locator('input[name="remember-me"]');
    this.forgotPasswordLink = page.locator('a[href="/forgot-password"]');

    // Page content
    this.heading = page.locator("h2", { hasText: "Sign in to Staffora" });
    this.subtitle = page.locator("text=Enter your credentials to access the platform");
    this.errorAlert = page.locator(".bg-red-50");
    this.loadingSpinner = page.locator('button[type="submit"]:has-text("Signing in...")');
  }

  /** Navigate to the login page */
  async goto(): Promise<void> {
    await this.page.goto(ROUTES.login);
    await this.emailInput.waitFor({ state: "visible" });
  }

  /** Fill in email and password fields */
  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  /** Submit the login form */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** Perform a full login flow: fill credentials and submit */
  async login(email: string, password: string): Promise<void> {
    await this.fillCredentials(email, password);
    await this.submit();
  }

  /** Assert that the login page is displayed */
  async expectVisible(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  /** Assert that an error message is displayed */
  async expectError(message?: string): Promise<void> {
    await expect(this.errorAlert).toBeVisible();
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  /** Assert that the submit button shows loading state */
  async expectLoading(): Promise<void> {
    await expect(this.loadingSpinner).toBeVisible();
  }

  /** Assert that the form is in an idle (not loading) state */
  async expectIdle(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await expect(this.submitButton).toContainText("Sign in");
  }

  /** Check the "Remember me" checkbox */
  async checkRememberMe(): Promise<void> {
    await this.rememberMeCheckbox.check();
  }

  /** Click the "Forgot password?" link */
  async clickForgotPassword(): Promise<void> {
    await this.forgotPasswordLink.click();
    await this.page.waitForURL((url) => url.pathname.includes("/forgot-password"));
  }
}

export class MfaPage {
  readonly page: Page;

  // TOTP code inputs (6 individual digit inputs)
  readonly codeInputs: Locator;
  readonly submitButton: Locator;
  readonly recoveryCodeLink: Locator;
  readonly recoveryCodeInput: Locator;
  readonly heading: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;

    // The MFA page uses individual inputs for each TOTP digit
    this.codeInputs = page.locator('input[type="text"][maxlength="1"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.recoveryCodeLink = page.locator("text=Use a recovery code");
    this.recoveryCodeInput = page.locator('input[placeholder*="recovery"]');
    this.heading = page.locator("h2", { hasText: "Two-Factor Authentication" });
    this.errorAlert = page.locator(".bg-red-50, .text-red-600, [role='alert']");
  }

  /** Assert that the MFA page is displayed */
  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/mfa/);
  }

  /** Enter a 6-digit TOTP code */
  async enterTotpCode(code: string): Promise<void> {
    const digits = code.split("");
    for (let i = 0; i < digits.length; i++) {
      await this.codeInputs.nth(i).fill(digits[i]);
    }
  }

  /** Switch to recovery code mode and enter a backup code */
  async enterRecoveryCode(code: string): Promise<void> {
    await this.recoveryCodeLink.click();
    await this.recoveryCodeInput.waitFor({ state: "visible" });
    await this.recoveryCodeInput.fill(code);
  }

  /** Submit the MFA form */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
