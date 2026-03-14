/**
 * Spinner Component Tests
 *
 * Tests for Spinner, FullPageSpinner, InlineSpinner, OverlaySpinner, ButtonSpinner.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Spinner,
  FullPageSpinner,
  InlineSpinner,
  OverlaySpinner,
  ButtonSpinner,
} from "../../../components/ui/spinner";

describe("Spinner Component", () => {
  it("renders with role='status'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has default aria-label 'Loading...'", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading...");
  });

  it("accepts custom aria-label via label prop", () => {
    render(<Spinner label="Saving data..." />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Saving data...");
  });

  it("renders screen reader text", () => {
    render(<Spinner label="Processing..." />);
    expect(screen.getByText("Processing...")).toBeInTheDocument();
    // Screen reader text should be visually hidden
    expect(screen.getByText("Processing...")).toHaveClass("sr-only");
  });

  it("applies size classes correctly", () => {
    const { rerender } = render(<Spinner size="xs" />);
    expect(screen.getByRole("status").className).toContain("h-3");

    rerender(<Spinner size="sm" />);
    expect(screen.getByRole("status").className).toContain("h-4");

    rerender(<Spinner size="md" />);
    expect(screen.getByRole("status").className).toContain("h-6");

    rerender(<Spinner size="lg" />);
    expect(screen.getByRole("status").className).toContain("h-8");

    rerender(<Spinner size="xl" />);
    expect(screen.getByRole("status").className).toContain("h-12");
  });

  it("applies variant classes correctly", () => {
    const { rerender } = render(<Spinner variant="primary" />);
    expect(screen.getByRole("status").className).toContain("border-t-primary-600");

    rerender(<Spinner variant="white" />);
    expect(screen.getByRole("status").className).toContain("border-t-white");

    rerender(<Spinner variant="gray" />);
    expect(screen.getByRole("status").className).toContain("border-t-gray-600");
  });

  it("applies animate-spin class", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").className).toContain("animate-spin");
  });

  it("applies custom className", () => {
    render(<Spinner className="my-spinner" />);
    expect(screen.getByRole("status").className).toContain("my-spinner");
  });
});

describe("FullPageSpinner Component", () => {
  it("renders with default label", () => {
    render(<FullPageSpinner />);
    // "Loading..." appears twice: once as sr-only inside the Spinner and once as the visible label
    const matches = screen.getAllByText("Loading...");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<FullPageSpinner label="Initializing..." />);
    // There will be two instances of the text: one in the spinner sr-only and one as the visible label
    const texts = screen.getAllByText("Initializing...");
    expect(texts.length).toBeGreaterThanOrEqual(1);
  });

  it("uses xl size spinner", () => {
    render(<FullPageSpinner />);
    expect(screen.getByRole("status").className).toContain("h-12");
  });

  it("is centered vertically", () => {
    const { container } = render(<FullPageSpinner />);
    expect((container.firstChild as HTMLElement).className).toContain("min-h-screen");
    expect((container.firstChild as HTMLElement).className).toContain("items-center");
    expect((container.firstChild as HTMLElement).className).toContain("justify-center");
  });
});

describe("InlineSpinner Component", () => {
  it("renders spinner and label together", () => {
    render(<InlineSpinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    // The visible inline label
    const inlineLabels = screen.getAllByText("Loading...");
    expect(inlineLabels.length).toBeGreaterThanOrEqual(1);
  });

  it("renders with custom label", () => {
    render(<InlineSpinner label="Fetching..." />);
    const labels = screen.getAllByText("Fetching...");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("uses sm size by default", () => {
    render(<InlineSpinner />);
    expect(screen.getByRole("status").className).toContain("h-4");
  });

  it("uses gray variant", () => {
    render(<InlineSpinner />);
    expect(screen.getByRole("status").className).toContain("border-t-gray-600");
  });
});

describe("OverlaySpinner Component", () => {
  it("renders with overlay background", () => {
    const { container } = render(<OverlaySpinner />);
    expect((container.firstChild as HTMLElement).className).toContain("absolute");
    expect((container.firstChild as HTMLElement).className).toContain("inset-0");
  });

  it("renders spinner and default label", () => {
    render(<OverlaySpinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<OverlaySpinner label="Saving..." />);
    const labels = screen.getAllByText("Saving...");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ButtonSpinner Component", () => {
  it("renders a small white spinner", () => {
    render(<ButtonSpinner />);
    const spinner = screen.getByRole("status");
    expect(spinner.className).toContain("h-4"); // sm size
    expect(spinner.className).toContain("border-t-white"); // white variant
  });
});
