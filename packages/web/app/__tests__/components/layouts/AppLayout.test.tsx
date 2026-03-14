/**
 * AppLayout Component Tests
 *
 * Tests for the main app layout: sidebar, header, user menu, tenant switcher,
 * self-service navigation, manager section, and responsive behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Mock hooks
const mockToggleTheme = vi.fn();
const mockLogout = vi.fn();
const mockSwitchTenant = vi.fn();

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
    user: { id: "user-1", name: "Jane Smith", email: "jane@test.com" },
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
    roles: [],
    isLoading: false,
    error: null,
  })),
}));

vi.mock("../../../hooks/use-tenant", () => ({
  useTenant: vi.fn(() => ({
    tenant: { id: "tenant-1", name: "Acme Corp" },
    tenantId: "tenant-1",
    tenantName: "Acme Corp",
    isLoading: false,
    error: null,
  })),
  useUserTenants: vi.fn(() => ({
    tenants: [
      { id: "tenant-1", name: "Acme Corp" },
      { id: "tenant-2", name: "Other Corp" },
    ],
    hasMutipleTenants: true,
    isLoading: false,
    error: null,
  })),
  useSwitchTenant: vi.fn(() => ({
    switchTenant: mockSwitchTenant,
    isPending: false,
    error: null,
    isSuccess: false,
  })),
}));

// Mock GlobalEmployeeSearch to avoid pulling in real implementation
vi.mock("../../../components/employee/GlobalEmployeeSearch", () => ({
  GlobalEmployeeSearch: ({ placeholder }: { placeholder?: string }) => (
    <input type="search" placeholder={placeholder || "Search..."} data-testid="global-search" />
  ),
}));

import { AppLayout } from "../../../components/layouts/app-layout";

function renderWithRouter(ui: React.ReactElement, initialEntry = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
  );
}

describe("AppLayout Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders children in main content area", () => {
      renderWithRouter(
        <AppLayout>
          <p>Dashboard content</p>
        </AppLayout>
      );
      expect(screen.getByText("Dashboard content")).toBeInTheDocument();
    });

    it("renders children inside a main element", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      const main = screen.getByRole("main");
      expect(within(main).getByText("Content")).toBeInTheDocument();
    });

    it("renders Staffora branding in sidebar", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("Staffora")).toBeInTheDocument();
    });
  });

  describe("Sidebar Navigation", () => {
    it("renders Dashboard nav item", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      // "Dashboard" appears in nav and breadcrumbs
      const dashboardTexts = screen.getAllByText("Dashboard");
      expect(dashboardTexts.length).toBeGreaterThanOrEqual(1);
    });

    it("renders Self Service section", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("Self Service")).toBeInTheDocument();
    });

    it("renders self-service nav items", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("My Profile")).toBeInTheDocument();
      expect(screen.getByText("Leave Requests")).toBeInTheDocument();
      expect(screen.getByText("Benefits")).toBeInTheDocument();
      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("Learning")).toBeInTheDocument();
    });

    it("renders Admin Console link when user has admin permissions", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("Admin Console")).toBeInTheDocument();
    });

    it("has correct link hrefs", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      const profileLink = screen.getByText("My Profile").closest("a");
      expect(profileLink).toHaveAttribute("href", "/me/profile");
    });
  });

  describe("Header", () => {
    it("renders theme toggle button", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(
        screen.getByRole("button", { name: /switch to dark mode/i })
      ).toBeInTheDocument();
    });

    it("renders notifications button", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    });

    it("renders mobile menu button", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByRole("button", { name: "Open sidebar" })).toBeInTheDocument();
    });

    it("renders global employee search", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByTestId("global-search")).toBeInTheDocument();
    });
  });

  describe("User Menu", () => {
    it("renders user avatar with initials", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("JS")).toBeInTheDocument();
    });

    it("opens user menu on click and shows user info", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      // Find the user menu trigger by aria-haspopup
      const triggers = document.querySelectorAll('[aria-haspopup="true"]');
      // The user menu trigger contains the avatar initials "JS"
      const userTrigger = Array.from(triggers).find(
        (el) => el.textContent?.includes("JS")
      );
      expect(userTrigger).toBeTruthy();

      await user.click(userTrigger as HTMLElement);
      expect(screen.getByText("jane@test.com")).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /my profile/i })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
    });

    it("calls logout when Sign out is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      const userTrigger = Array.from(
        document.querySelectorAll('[aria-haspopup="true"]')
      ).find((el) => el.textContent?.includes("JS"));

      await user.click(userTrigger as HTMLElement);
      await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tenant Switcher", () => {
    it("renders tenant switcher when user has multiple tenants", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    });

    it("opens tenant menu on click", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );
      // Find the tenant switcher button
      const tenantTrigger = Array.from(
        document.querySelectorAll('[aria-haspopup="true"]')
      ).find((el) => el.textContent?.includes("Acme Corp"));
      expect(tenantTrigger).toBeTruthy();

      await user.click(tenantTrigger as HTMLElement);
      // Both tenants should be listed
      const menus = document.querySelectorAll('[role="menu"]');
      expect(menus.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole("menuitem", { name: /other corp/i })).toBeInTheDocument();
    });
  });

  describe("Mobile Sidebar", () => {
    it("opens sidebar on mobile menu click", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      const sidebar = document.querySelector("aside");
      expect(sidebar?.className).toContain("-translate-x-full");

      await user.click(screen.getByRole("button", { name: "Open sidebar" }));
      expect(sidebar?.className).toContain("translate-x-0");
    });

    it("closes sidebar on close button click", async () => {
      const user = userEvent.setup();
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>
      );

      await user.click(screen.getByRole("button", { name: "Open sidebar" }));
      const sidebar = document.querySelector("aside");
      expect(sidebar?.className).toContain("translate-x-0");

      await user.click(screen.getByRole("button", { name: "Close sidebar" }));
      expect(sidebar?.className).toContain("-translate-x-full");
    });
  });

  describe("Breadcrumbs", () => {
    it("renders breadcrumbs based on route path", () => {
      renderWithRouter(
        <AppLayout>
          <p>Content</p>
        </AppLayout>,
        "/me/profile"
      );
      const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
      expect(within(nav).getByText("Me")).toBeInTheDocument();
      expect(within(nav).getByText("Profile")).toBeInTheDocument();
    });
  });
});
