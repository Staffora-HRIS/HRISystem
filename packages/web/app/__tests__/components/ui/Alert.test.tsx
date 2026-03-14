/**
 * Alert Component Tests
 *
 * Tests for Alert and AlertBanner components.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Alert, AlertBanner } from "../../../components/ui/alert";

describe("Alert Component", () => {
  describe("Rendering", () => {
    it("renders with children content", () => {
      render(<Alert>Something happened.</Alert>);
      expect(screen.getByText("Something happened.")).toBeInTheDocument();
    });

    it("has role='alert'", () => {
      render(<Alert>Message</Alert>);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("renders title when provided", () => {
      render(<Alert title="Important">Details here.</Alert>);
      expect(screen.getByText("Important")).toBeInTheDocument();
      expect(screen.getByText("Details here.")).toBeInTheDocument();
    });

    it("defaults to info variant", () => {
      render(<Alert>Info alert</Alert>);
      const alert = screen.getByRole("alert");
      expect(alert.className).toContain("bg-blue-50");
    });
  });

  describe("Variants", () => {
    it("applies success variant styles", () => {
      render(<Alert variant="success">Success</Alert>);
      expect(screen.getByRole("alert").className).toContain("bg-green-50");
    });

    it("applies error variant styles", () => {
      render(<Alert variant="error">Error</Alert>);
      expect(screen.getByRole("alert").className).toContain("bg-red-50");
    });

    it("applies warning variant styles", () => {
      render(<Alert variant="warning">Warning</Alert>);
      expect(screen.getByRole("alert").className).toContain("bg-yellow-50");
    });

    it("applies info variant styles", () => {
      render(<Alert variant="info">Info</Alert>);
      expect(screen.getByRole("alert").className).toContain("bg-blue-50");
    });
  });

  describe("Dismissible", () => {
    it("does not show dismiss button by default", () => {
      render(<Alert>Message</Alert>);
      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    });

    it("shows dismiss button when dismissible=true and onDismiss provided", () => {
      render(
        <Alert dismissible onDismiss={vi.fn()}>
          Message
        </Alert>
      );
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Alert dismissible onDismiss={onDismiss}>
          Closable
        </Alert>
      );
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("does not show dismiss button when dismissible=true but no onDismiss", () => {
      render(<Alert dismissible>Message</Alert>);
      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    });
  });

  describe("Custom icon", () => {
    it("renders custom icon when provided", () => {
      render(
        <Alert icon={<span data-testid="custom-icon">!</span>}>
          With custom icon
        </Alert>
      );
      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    });
  });

  describe("Custom className", () => {
    it("applies custom className", () => {
      render(<Alert className="my-alert">Styled</Alert>);
      expect(screen.getByRole("alert").className).toContain("my-alert");
    });
  });
});

describe("AlertBanner Component", () => {
  it("renders with children content", () => {
    render(<AlertBanner>Banner message</AlertBanner>);
    expect(screen.getByText("Banner message")).toBeInTheDocument();
  });

  it("has role='alert'", () => {
    render(<AlertBanner>Banner</AlertBanner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<AlertBanner title="Notice">Details</AlertBanner>);
    expect(screen.getByText("Notice")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(
      <AlertBanner action={<button>Retry</button>}>
        Something failed.
      </AlertBanner>
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders dismiss button when dismissible with onDismiss", () => {
    render(
      <AlertBanner dismissible onDismiss={vi.fn()}>
        Dismissible banner
      </AlertBanner>
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("calls onDismiss when clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <AlertBanner dismissible onDismiss={onDismiss}>
        Close me
      </AlertBanner>
    );
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
