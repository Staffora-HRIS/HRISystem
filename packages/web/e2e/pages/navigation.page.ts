/**
 * Page Object Model: Navigation and Layout
 *
 * Encapsulates selectors and interactions for the admin sidebar,
 * header, breadcrumbs, and mobile navigation.
 */

import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export class AdminNavigation {
  readonly page: Page;

  // Sidebar
  readonly sidebar: Locator;
  readonly sidebarLogo: Locator;
  readonly backToAppLink: Locator;

  // Mobile sidebar controls
  readonly mobileMenuButton: Locator;
  readonly mobileSidebarCloseButton: Locator;
  readonly sidebarOverlay: Locator;

  // Header
  readonly header: Locator;
  readonly breadcrumbs: Locator;

  // Theme toggle
  readonly themeToggle: Locator;

  // Notifications
  readonly notificationsButton: Locator;
  readonly notificationBadge: Locator;

  // User menu
  readonly userMenuButton: Locator;
  readonly userMenuDropdown: Locator;
  readonly profileLink: Locator;
  readonly signOutButton: Locator;

  // Navigation groups (mapped from admin-layout.tsx)
  readonly navGroups: Record<string, Locator>;

  constructor(page: Page) {
    this.page = page;

    // Sidebar structure
    this.sidebar = page.locator("aside");
    this.sidebarLogo = page.locator('a[href="/admin/dashboard"]').first();
    this.backToAppLink = page.locator('a:has-text("Back to App")');

    // Mobile controls
    this.mobileMenuButton = page.locator('button[aria-label="Open sidebar"]');
    this.mobileSidebarCloseButton = page.locator('button[aria-label="Close sidebar"]');
    this.sidebarOverlay = page.locator(".fixed.inset-0.bg-black\\/50");

    // Header
    this.header = page.locator("header");
    this.breadcrumbs = page.locator('nav[aria-label="Breadcrumb"]');

    // Header actions
    this.themeToggle = page.locator('button[aria-label*="Switch to"]');
    this.notificationsButton = page.locator('button[aria-label="Notifications"]');
    this.notificationBadge = this.notificationsButton.locator("span.rounded-full");

    // User menu
    this.userMenuButton = page.locator('button[aria-haspopup="true"]');
    this.userMenuDropdown = page.locator('[role="menu"][aria-label="User menu"]');
    this.profileLink = page.locator('[role="menuitem"]:has-text("My Profile")');
    this.signOutButton = page.locator('[role="menuitem"]:has-text("Sign out")');

    // Navigation groups by section name
    this.navGroups = {
      overview: page.locator("h3:text-is('Overview')").locator(".."),
      hrAdministration: page.locator("h3:text-is('HR Administration')").locator(".."),
      timeAttendance: page.locator("h3:text-is('Time & Attendance')").locator(".."),
      leaveManagement: page.locator("h3:text-is('Leave Management')").locator(".."),
      benefits: page.locator("h3:text-is('Benefits')").locator(".."),
      talent: page.locator("h3:text-is('Talent')").locator(".."),
      cases: page.locator("h3:text-is('Cases')").locator(".."),
      onboarding: page.locator("h3:text-is('Onboarding')").locator(".."),
      documents: page.locator("h3:text-is('Documents')").locator(".."),
      learning: page.locator("h3:text-is('Learning')").locator(".."),
      workflows: page.locator("h3:text-is('Workflows')").locator(".."),
      security: page.locator("h3:text-is('Security')").locator(".."),
      analyticsReports: page.locator("h3:text-is('Analytics & Reports')").locator(".."),
      settings: page.locator("h3:text-is('Settings')").locator(".."),
    };
  }

  /** Click a navigation link by its visible text */
  async clickNavLink(linkText: string): Promise<void> {
    const link = this.sidebar.locator(`a:has-text("${linkText}")`);
    await link.click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Assert a navigation link exists in the sidebar */
  async expectNavLinkVisible(linkText: string): Promise<void> {
    const link = this.sidebar.locator(`a:has-text("${linkText}")`);
    await expect(link).toBeVisible();
  }

  /** Assert a navigation link is active (highlighted) */
  async expectNavLinkActive(linkText: string): Promise<void> {
    const link = this.sidebar.locator(`a:has-text("${linkText}")`);
    await expect(link).toHaveClass(/bg-primary/);
  }

  /** Get the breadcrumb text */
  async getBreadcrumbText(): Promise<string> {
    return (await this.breadcrumbs.textContent()) ?? "";
  }

  /** Assert breadcrumbs contain the expected segments */
  async expectBreadcrumbs(...segments: string[]): Promise<void> {
    for (const segment of segments) {
      await expect(this.breadcrumbs).toContainText(segment);
    }
  }

  /** Open the mobile sidebar */
  async openMobileSidebar(): Promise<void> {
    await this.mobileMenuButton.click();
    // The sidebar should become visible (translate-x-0 instead of -translate-x-full)
    await expect(this.sidebar).toBeVisible();
  }

  /** Close the mobile sidebar */
  async closeMobileSidebar(): Promise<void> {
    await this.mobileSidebarCloseButton.click();
  }

  /** Toggle the theme (dark/light) */
  async toggleTheme(): Promise<void> {
    await this.themeToggle.click();
  }

  /** Open the user menu */
  async openUserMenu(): Promise<void> {
    await this.userMenuButton.click();
    await expect(this.userMenuDropdown).toBeVisible();
  }

  /** Close the user menu */
  async closeUserMenu(): Promise<void> {
    // Press Escape to close
    await this.page.keyboard.press("Escape");
    await expect(this.userMenuDropdown).not.toBeVisible();
  }

  /** Click "My Profile" in the user menu */
  async goToProfile(): Promise<void> {
    await this.openUserMenu();
    await this.profileLink.click();
    await this.page.waitForURL(/\/me\/profile/);
  }

  /** Click "Sign out" in the user menu */
  async signOut(): Promise<void> {
    await this.openUserMenu();
    await this.signOutButton.click();
    await this.page.waitForURL(/\/login/);
  }

  /** Get the list of all visible navigation link texts */
  async getVisibleNavLinks(): Promise<string[]> {
    const links = this.sidebar.locator("nav a");
    return await links.allTextContents();
  }

  /** Assert the sidebar is visible (desktop) */
  async expectSidebarVisible(): Promise<void> {
    await expect(this.sidebar).toBeVisible();
  }

  /** Assert the header is visible */
  async expectHeaderVisible(): Promise<void> {
    await expect(this.header).toBeVisible();
  }
}
