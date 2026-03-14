/**
 * Badge Component Tests
 *
 * Tests for Badge, StatusBadge, CountBadge, PriorityBadge, TypeBadge, BadgeGroup.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Badge,
  StatusBadge,
  CountBadge,
  PriorityBadge,
  TypeBadge,
  BadgeGroup,
} from "../../../components/ui/badge";

describe("Badge Component", () => {
  describe("Rendering", () => {
    it("renders with children text", () => {
      render(<Badge>Label</Badge>);
      expect(screen.getByText("Label")).toBeInTheDocument();
    });

    it("applies default variant styles", () => {
      render(<Badge>Default</Badge>);
      const badge = screen.getByText("Default");
      expect(badge.className).toContain("bg-gray-100");
    });

    it("applies variant styles correctly", () => {
      const { rerender } = render(<Badge variant="success">OK</Badge>);
      expect(screen.getByText("OK").className).toContain("bg-success-100");

      rerender(<Badge variant="error">Err</Badge>);
      expect(screen.getByText("Err").className).toContain("bg-error-100");

      rerender(<Badge variant="warning">Warn</Badge>);
      expect(screen.getByText("Warn").className).toContain("bg-warning-100");

      rerender(<Badge variant="primary">Primary</Badge>);
      expect(screen.getByText("Primary").className).toContain("bg-primary-100");

      rerender(<Badge variant="outline">Outline</Badge>);
      expect(screen.getByText("Outline").className).toContain("border");
    });

    it("applies size styles", () => {
      const { rerender } = render(<Badge size="sm">Small</Badge>);
      expect(screen.getByText("Small").className).toContain("text-xs");

      rerender(<Badge size="lg">Large</Badge>);
      expect(screen.getByText("Large").className).toContain("text-sm");
    });

    it("applies rounded-full when rounded=true", () => {
      render(<Badge rounded>Rounded</Badge>);
      expect(screen.getByText("Rounded").className).toContain("rounded-full");
    });

    it("applies rounded-md when rounded=false", () => {
      render(<Badge rounded={false}>Square</Badge>);
      expect(screen.getByText("Square").className).toContain("rounded-md");
    });

    it("applies custom className", () => {
      render(<Badge className="extra">Cls</Badge>);
      expect(screen.getByText("Cls").className).toContain("extra");
    });
  });

  describe("Dot indicator", () => {
    it("shows dot when dot=true", () => {
      const { container } = render(<Badge dot>With Dot</Badge>);
      const dot = container.querySelector(".rounded-full.h-1\\.5");
      expect(dot).toBeInTheDocument();
    });

    it("does not show dot by default", () => {
      const { container } = render(<Badge>No Dot</Badge>);
      const dot = container.querySelector(".h-1\\.5.w-1\\.5");
      expect(dot).not.toBeInTheDocument();
    });
  });

  describe("Removable", () => {
    it("shows remove button when removable=true", () => {
      render(<Badge removable>Removable</Badge>);
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    it("does not show remove button by default", () => {
      render(<Badge>Not Removable</Badge>);
      expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    });

    it("calls onRemove when remove button is clicked", async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(
        <Badge removable onRemove={onRemove}>
          Tag
        </Badge>
      );
      await user.click(screen.getByRole("button", { name: "Remove" }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });
  });
});

describe("StatusBadge Component", () => {
  it("renders the correct label for each status", () => {
    const statuses = [
      { status: "active" as const, label: "Active" },
      { status: "inactive" as const, label: "Inactive" },
      { status: "pending" as const, label: "Pending" },
      { status: "approved" as const, label: "Approved" },
      { status: "rejected" as const, label: "Rejected" },
      { status: "draft" as const, label: "Draft" },
      { status: "completed" as const, label: "Completed" },
      { status: "failed" as const, label: "Failed" },
      { status: "cancelled" as const, label: "Cancelled" },
    ];

    for (const { status, label } of statuses) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders with dot indicator", () => {
    const { container } = render(<StatusBadge status="active" />);
    const dot = container.querySelector(".rounded-full.h-1\\.5");
    expect(dot).toBeInTheDocument();
  });

  it("is pill-shaped (rounded-full)", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("Active").className).toContain("rounded-full");
  });
});

describe("CountBadge Component", () => {
  it("renders the count", () => {
    render(<CountBadge count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("returns null when count is 0", () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when count is negative", () => {
    const { container } = render(<CountBadge count={-1} />);
    expect(container.firstChild).toBeNull();
  });

  it("caps display at max value with + suffix", () => {
    render(<CountBadge count={150} max={99} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("shows exact count when under max", () => {
    render(<CountBadge count={50} max={99} />);
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("uses custom max", () => {
    render(<CountBadge count={15} max={10} />);
    expect(screen.getByText("10+")).toBeInTheDocument();
  });
});

describe("PriorityBadge Component", () => {
  it("renders correct label for each priority", () => {
    const priorities = [
      { priority: "low" as const, label: "Low" },
      { priority: "medium" as const, label: "Medium" },
      { priority: "high" as const, label: "High" },
      { priority: "urgent" as const, label: "Urgent" },
    ];

    for (const { priority, label } of priorities) {
      const { unmount } = render(<PriorityBadge priority={priority} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("TypeBadge Component", () => {
  it("renders the type text", () => {
    render(<TypeBadge type="Feature" />);
    expect(screen.getByText("Feature")).toBeInTheDocument();
  });

  it("is pill-shaped", () => {
    render(<TypeBadge type="Bug" />);
    expect(screen.getByText("Bug").className).toContain("rounded-full");
  });
});

describe("BadgeGroup Component", () => {
  it("renders children badges", () => {
    render(
      <BadgeGroup>
        <Badge>One</Badge>
        <Badge>Two</Badge>
      </BadgeGroup>
    );
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  it("applies flex-wrap layout", () => {
    const { container } = render(
      <BadgeGroup>
        <Badge>A</Badge>
      </BadgeGroup>
    );
    expect((container.firstChild as HTMLElement).className).toContain("flex-wrap");
  });
});
