/**
 * Login Route Tests
 *
 * Tests the login page with real component rendering,
 * form validation, submission, error handling.
 *
 * Note: Route files under (auth)/ use parenthesized directory names which
 * Vite's import resolver cannot handle in dynamic imports. We import via
 * the alias path instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock better-auth
const mockSignIn = vi.fn();
const mockGetCurrentSession = vi.fn();
vi.mock("~/lib/better-auth", () => ({
  authClient: {},
  signInWithEmail: (...args: unknown[]) => mockSignIn(...args),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
  useSession: vi.fn(() => ({ data: null, isPending: false })),
  twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn() },
}));

// Import the component directly using the tilde alias
import LoginPage from "~/routes/(auth)/login/route";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/login"] }, children)
    );
  };
}

describe("Login Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the login form", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByText("Sign in to Staffora")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders remember me checkbox", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByLabelText("Remember me")).toBeInTheDocument();
  });

  it("renders forgot password link", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
  });

  it("allows typing in email and password fields", async () => {
    const user = userEvent.setup();
    render(createElement(LoginPage), { wrapper: createWrapper() });

    const emailInput = screen.getByLabelText("Email address");
    const passwordInput = screen.getByLabelText("Password");

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "secret123");

    expect(emailInput).toHaveValue("test@example.com");
    expect(passwordInput).toHaveValue("secret123");
  });

  it("shows error message when login fails", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({
      error: { message: "Invalid credentials" },
    });

    render(createElement(LoginPage), { wrapper: createWrapper() });

    await user.type(screen.getByLabelText("Email address"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("shows loading state during submission", async () => {
    const user = userEvent.setup();
    // Make sign-in hang to see loading state
    mockSignIn.mockImplementation(() => new Promise(() => {}));

    render(createElement(LoginPage), { wrapper: createWrapper() });

    await user.type(screen.getByLabelText("Email address"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "pass123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByText("Signing in...")).toBeInTheDocument();
    });

    // Button should be disabled during submission
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("has correct input types", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("has autocomplete attributes for accessibility", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });

  it("requires email and password fields", () => {
    render(createElement(LoginPage), { wrapper: createWrapper() });

    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
  });
});
