/**
 * AuthLayout Component Tests
 *
 * Tests for the auth layout: centered card, logo, title, theme toggle,
 * footer, AuthCard, AuthDivider, and SocialLoginButtons.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";

// Mock theme hook
const mockToggleTheme = vi.fn();
vi.mock("../../../lib/theme", () => ({
  useTheme: vi.fn(() => ({
    theme: "light",
    resolvedTheme: "light",
    toggleTheme: mockToggleTheme,
    setTheme: vi.fn(),
  })),
}));

import {
  AuthLayout,
  AuthCard,
  AuthDivider,
  SocialLoginButtons,
} from "../../../components/layouts/auth-layout";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("AuthLayout Component", () => {
  it("renders children", () => {
    renderWithRouter(
      <AuthLayout>
        <p>Login form</p>
      </AuthLayout>
    );
    expect(screen.getByText("Login form")).toBeInTheDocument();
  });

  it("renders the logo by default", () => {
    renderWithRouter(
      <AuthLayout>
        <p>Content</p>
      </AuthLayout>
    );
    expect(screen.getByText("Staffora")).toBeInTheDocument();
  });

  it("hides the logo when showLogo is false", () => {
    renderWithRouter(
      <AuthLayout showLogo={false}>
        <p>Content</p>
      </AuthLayout>
    );
    expect(screen.queryByText("Staffora")).not.toBeInTheDocument();
  });

  it("renders title and subtitle when provided", () => {
    renderWithRouter(
      <AuthLayout title="Sign In" subtitle="Enter your credentials">
        <p>Form</p>
      </AuthLayout>
    );
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Enter your credentials")).toBeInTheDocument();
  });

  it("renders heading as h1", () => {
    renderWithRouter(
      <AuthLayout title="Sign In">
        <p>Form</p>
      </AuthLayout>
    );
    const heading = screen.getByRole("heading", { level: 1, name: "Sign In" });
    expect(heading).toBeInTheDocument();
  });

  it("does not render title section when neither title nor subtitle is provided", () => {
    renderWithRouter(
      <AuthLayout>
        <p>Form</p>
      </AuthLayout>
    );
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders theme toggle button", () => {
    renderWithRouter(
      <AuthLayout>
        <p>Form</p>
      </AuthLayout>
    );
    expect(
      screen.getByRole("button", { name: /switch to dark mode/i })
    ).toBeInTheDocument();
  });

  it("calls toggleTheme when theme button is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <AuthLayout>
        <p>Form</p>
      </AuthLayout>
    );
    await user.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("renders the footer with copyright", () => {
    renderWithRouter(
      <AuthLayout>
        <p>Form</p>
      </AuthLayout>
    );
    expect(screen.getByText(/Staffora. All rights reserved/)).toBeInTheDocument();
  });

  it("applies max width classes", () => {
    const { container } = renderWithRouter(
      <AuthLayout maxWidth="sm">
        <p>Form</p>
      </AuthLayout>
    );
    expect(container.querySelector(".max-w-sm")).toBeInTheDocument();
  });
});

describe("AuthCard Component", () => {
  it("renders children", () => {
    render(<AuthCard>Card content</AuthCard>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("renders title and subtitle", () => {
    render(
      <AuthCard title="Card Title" subtitle="Card subtitle">
        Content
      </AuthCard>
    );
    expect(screen.getByText("Card Title")).toBeInTheDocument();
    expect(screen.getByText("Card subtitle")).toBeInTheDocument();
  });

  it("renders title as h2", () => {
    render(
      <AuthCard title="Login">
        Content
      </AuthCard>
    );
    expect(screen.getByRole("heading", { level: 2, name: "Login" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <AuthCard className="my-custom-class">Content</AuthCard>
    );
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});

describe("AuthDivider Component", () => {
  it("renders default text", () => {
    render(<AuthDivider />);
    expect(screen.getByText("Or continue with")).toBeInTheDocument();
  });

  it("renders custom text", () => {
    render(<AuthDivider text="Or sign up with" />);
    expect(screen.getByText("Or sign up with")).toBeInTheDocument();
  });
});

describe("SocialLoginButtons Component", () => {
  it("renders Google button when onGoogleClick is provided", () => {
    render(<SocialLoginButtons onGoogleClick={() => {}} />);
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("renders Microsoft button when onMicrosoftClick is provided", () => {
    render(<SocialLoginButtons onMicrosoftClick={() => {}} />);
    expect(screen.getByText("Microsoft")).toBeInTheDocument();
  });

  it("renders both buttons", () => {
    render(<SocialLoginButtons onGoogleClick={() => {}} onMicrosoftClick={() => {}} />);
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Microsoft")).toBeInTheDocument();
  });

  it("does not render buttons when callbacks are not provided", () => {
    const { container } = render(<SocialLoginButtons />);
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("calls onGoogleClick when Google button is clicked", async () => {
    const user = userEvent.setup();
    const onGoogleClick = vi.fn();
    render(<SocialLoginButtons onGoogleClick={onGoogleClick} />);
    await user.click(screen.getByText("Google"));
    expect(onGoogleClick).toHaveBeenCalledTimes(1);
  });

  it("calls onMicrosoftClick when Microsoft button is clicked", async () => {
    const user = userEvent.setup();
    const onMicrosoftClick = vi.fn();
    render(<SocialLoginButtons onMicrosoftClick={onMicrosoftClick} />);
    await user.click(screen.getByText("Microsoft"));
    expect(onMicrosoftClick).toHaveBeenCalledTimes(1);
  });

  it("disables buttons when disabled=true", () => {
    render(
      <SocialLoginButtons
        onGoogleClick={() => {}}
        onMicrosoftClick={() => {}}
        disabled
      />
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
