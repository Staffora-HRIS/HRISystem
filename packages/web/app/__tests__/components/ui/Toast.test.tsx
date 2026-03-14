/**
 * Toast Component Tests
 *
 * Tests for ToastProvider, useToast hook, and ToastViewport.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, ToastViewport, useToast } from "../../../components/ui/toast";

// Helper component that uses the toast hook
function ToastTester() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success("Success message")}>Show Success</button>
      <button onClick={() => toast.error("Error message")}>Show Error</button>
      <button onClick={() => toast.warning("Warning message")}>Show Warning</button>
      <button onClick={() => toast.info("Info message")}>Show Info</button>
      <button
        onClick={() =>
          toast.custom({
            type: "info",
            title: "Custom",
            message: "Custom message",
            duration: 0,
            dismissible: true,
          })
        }
      >
        Show Custom
      </button>
      <button onClick={() => toast.clearAll()}>Clear All</button>
      <span data-testid="toast-count">{toast.toasts.length}</span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <ToastTester />
      <ToastViewport />
    </ToastProvider>
  );
}

describe("Toast System", () => {
  describe("useToast hook", () => {
    it("throws when used outside ToastProvider", () => {
      // Suppress console error
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        render(<ToastTester />);
      }).toThrow("useToast must be used within a ToastProvider");
      consoleError.mockRestore();
    });
  });

  describe("Showing toasts", () => {
    it("shows a success toast", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Success"));
      expect(screen.getByText("Success message")).toBeInTheDocument();
    });

    it("shows an error toast", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Error"));
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });

    it("shows a warning toast", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Warning"));
      expect(screen.getByText("Warning message")).toBeInTheDocument();
    });

    it("shows an info toast", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Info"));
      expect(screen.getByText("Info message")).toBeInTheDocument();
    });

    it("shows toast with custom message", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Custom"));
      expect(screen.getByText("Custom")).toBeInTheDocument();
      expect(screen.getByText("Custom message")).toBeInTheDocument();
    });
  });

  describe("Toast count tracking", () => {
    it("tracks toast count", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      expect(screen.getByTestId("toast-count")).toHaveTextContent("0");
      await user.click(screen.getByText("Show Success"));
      expect(screen.getByTestId("toast-count")).toHaveTextContent("1");
      await user.click(screen.getByText("Show Error"));
      expect(screen.getByTestId("toast-count")).toHaveTextContent("2");
    });
  });

  describe("Clearing toasts", () => {
    it("clears all toasts", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Success"));
      await user.click(screen.getByText("Show Error"));
      expect(screen.getByTestId("toast-count")).toHaveTextContent("2");

      await user.click(screen.getByText("Clear All"));
      expect(screen.getByTestId("toast-count")).toHaveTextContent("0");
    });
  });

  describe("Dismissing toasts", () => {
    it("dismisses a toast when dismiss button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Custom"));
      expect(screen.getByText("Custom")).toBeInTheDocument();

      // Find and click dismiss button
      const dismissBtn = screen.getByRole("button", { name: "Dismiss" });
      await user.click(dismissBtn);

      expect(screen.queryByText("Custom")).not.toBeInTheDocument();
    });
  });

  describe("Max toasts", () => {
    it("limits the number of visible toasts", async () => {
      const user = userEvent.setup();
      render(
        <ToastProvider maxToasts={2}>
          <ToastTester />
          <ToastViewport />
        </ToastProvider>
      );

      await user.click(screen.getByText("Show Success"));
      await user.click(screen.getByText("Show Error"));
      await user.click(screen.getByText("Show Warning"));

      // Only 2 should be visible
      expect(screen.getByTestId("toast-count")).toHaveTextContent("2");
    });
  });

  describe("Toast accessibility", () => {
    it("toasts have role='alert'", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Success"));
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("viewport has role='region' with aria-label", async () => {
      const user = userEvent.setup();
      renderWithProvider();

      await user.click(screen.getByText("Show Success"));
      expect(screen.getByRole("region")).toHaveAttribute("aria-label", "Notifications");
    });
  });
});
