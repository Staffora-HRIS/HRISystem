/**
 * AdminLayout Component Tests
 *
 * Tests for the admin layout: sidebar navigation, header, breadcrumbs,
 * user menu, theme toggle, and responsive behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Mock hooks
const mockToggleTheme = vi.fn();
const mockLogout = vi.fn();

vi.mock("../../../lib/theme", () => ({
  useTheme: vi.fn(() => ({
    theme: "light",
    resolvedTheme: "light",
    toggleTheme: mockToggleTheme,
    setTheme: vi.fn(),
  })),
}));

vi.mock("../../../lib/auth", () => ({
  useSession: vi.fn(() => ({
    isAuthenticated: true,
    user: { id: "user-1", name: "Admin User", email: "admin@test.com" },
    session: { id: "session-1" },
    isLoading: false,
    error: null,
  })),
  useAuth: vi.fn(() => ({
    login: vi.fn(),
    logout: mockLogout,
    isLoggingOut: false,
  })),
}));

vi.mock("../../../hooks/use-permissions", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePermissions: vi.fn(() => ({
    hasPermission: () => true,
    can: () => true,
    canAny: () => true,
    canAll: () => true,
    hasRole: () => false,
    hasAnyRole: () => false,
    isAdmin: true,
    isManager: false,
    permissions: ["*"],
    roles: ["tenant_admin"],
    isLoading: false,
    error: null,
  })),
}));

import { AdminLayout } from "../../../components/layouts/admin-layout";

function renderWithRouter(ui: React.ReactElement, initialEntry = "/admin/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
  );
}

describe("AdminLayout Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders children in main content area", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Admin page content</p>
        </AdminLayout>
      );
      expect(screen.getByText("Admin page content")).toBeInTheDocument();
    });

    it("renders children inside a main element", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      const main = screen.getByRole("main");
      expect(within(main).getByText("Content")).toBeInTheDocument();
    });

    it("renders sidebar with Admin Console branding", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      // "Admin" appears in both sidebar branding and breadcrumbs
      const adminTexts = screen.getAllByText("Admin");
      expect(adminTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Console")).toBeInTheDocument();
    });

    it("renders Back to App link", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(screen.getByText("Back to App")).toBeInTheDocument();
    });
  });

  describe("Sidebar Navigation", () => {
    it("renders navigation groups", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      // Check for a few key nav group headers
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("HR Administration")).toBeInTheDocument();
      expect(screen.getByText("Security")).toBeInTheDocument();
    });

    it("renders nav items within groups", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(screen.getByText("Employees")).toBeInTheDocument();
      expect(screen.getByText("Positions")).toBeInTheDocument();
      expect(screen.getByText("Departments")).toBeInTheDocument();
    });

    it("has navigation links with correct hrefs", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      const employeesLink = screen.getByText("Employees").closest("a");
      expect(employeesLink).toHaveAttribute("href", "/admin/hr/employees");
    });
  });

  describe("Header", () => {
    it("renders the theme toggle button", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(
        screen.getByRole("button", { name: /switch to dark mode/i })
      ).toBeInTheDocument();
    });

    it("calls toggleTheme when theme button is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
      expect(mockToggleTheme).toHaveBeenCalledTimes(1);
    });

    it("renders notifications button", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(
        screen.getByRole("button", { name: "Notifications" })
      ).toBeInTheDocument();
    });

    it("renders mobile menu button", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(
        screen.getByRole("button", { name: "Open sidebar" })
      ).toBeInTheDocument();
    });
  });

  describe("User Menu", () => {
    it("renders user avatar with initials", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      expect(screen.getByText("AU")).toBeInTheDocument();
    });

    it("opens user menu on avatar click", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      // Click the user avatar button
      screen.getByRole("button", { expanded: false });
      const menuTrigger = Array.from(
        document.querySelectorAll('[aria-haspopup="true"]')
      ).find((el) => el.textContent?.includes("AU"));
      expect(menuTrigger).toBeTruthy();

      await user.click(menuTrigger as HTMLElement);
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });

    it("shows user name and email in dropdown", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      const menuTrigger = document.querySelector('[aria-haspopup="true"]')!;
      await user.click(menuTrigger as HTMLElement);

      // The menu shows user info
      expect(screen.getByText("Admin User")).toBeInTheDocument();
      expect(screen.getByText("admin@test.com")).toBeInTheDocument();
    });

    it("shows My Profile and Sign out links in dropdown", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      const menuTrigger = document.querySelector('[aria-haspopup="true"]')!;
      await user.click(menuTrigger as HTMLElement);

      expect(screen.getByRole("menuitem", { name: /my profile/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    });

    it("calls logout when Sign out is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );
      const menuTrigger = document.querySelector('[aria-haspopup="true"]')!;
      await user.click(menuTrigger as HTMLElement);
      await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Mobile Sidebar", () => {
    it("opens sidebar when mobile menu button is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );

      const sidebar = document.querySelector("aside");
      // Sidebar is hidden by default on mobile (has -translate-x-full)
      expect(sidebar?.className).toContain("-translate-x-full");

      await user.click(screen.getByRole("button", { name: "Open sidebar" }));
      // After clicking, sidebar should be visible (translate-x-0)
      expect(sidebar?.className).toContain("translate-x-0");
    });

    it("closes sidebar when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>
      );

      // Open sidebar first
      await user.click(screen.getByRole("button", { name: "Open sidebar" }));
      const sidebar = document.querySelector("aside");
      expect(sidebar?.className).toContain("translate-x-0");

      // Close it
      await user.click(screen.getByRole("button", { name: "Close sidebar" }));
      expect(sidebar?.className).toContain("-translate-x-full");
    });
  });

  describe("Breadcrumbs", () => {
    it("renders breadcrumbs based on route path", () => {
      renderWithRouter(
        <AdminLayout>
          <p>Content</p>
        </AdminLayout>,
        "/admin/hr/employees"
      );
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(within(nav).getByText("Admin")).toBeInTheDocument();
      expect(within(nav).getByText("Hr")).toBeInTheDocument();
      expect(within(nav).getByText("Employees")).toBeInTheDocument();
    });
  });
});
