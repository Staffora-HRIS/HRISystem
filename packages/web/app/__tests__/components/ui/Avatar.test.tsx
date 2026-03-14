/**
 * Avatar Component Tests
 *
 * Tests for Avatar and AvatarGroup components.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarGroup } from "../../../components/ui/avatar";

describe("Avatar Component", () => {
  describe("Image avatar", () => {
    it("renders an image when src is provided", () => {
      render(<Avatar src="https://example.com/photo.jpg" name="John Doe" />);
      const img = screen.getByRole("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    });

    it("uses name as alt text", () => {
      render(<Avatar src="https://example.com/photo.jpg" name="Jane Smith" />);
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Jane Smith");
    });

    it("uses custom alt text when provided", () => {
      render(
        <Avatar src="https://example.com/photo.jpg" alt="Profile photo" name="Jane" />
      );
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Profile photo");
    });

    it("falls back to 'Avatar' alt text when no name or alt", () => {
      render(<Avatar src="https://example.com/photo.jpg" />);
      expect(screen.getByRole("img")).toHaveAttribute("alt", "Avatar");
    });
  });

  describe("Initials avatar (no image)", () => {
    it("renders initials from two-word name", () => {
      render(<Avatar name="John Doe" />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("renders initials from single-word name", () => {
      render(<Avatar name="John" />);
      expect(screen.getByText("JO")).toBeInTheDocument();
    });

    it("renders initials from three-word name (first and last)", () => {
      render(<Avatar name="John Michael Doe" />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("renders '?' when no name is provided", () => {
      render(<Avatar />);
      expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("trims whitespace from name", () => {
      render(<Avatar name="  Jane   Doe  " />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });
  });

  describe("Sizes", () => {
    it("applies xs size", () => {
      const { container } = render(<Avatar name="A B" size="xs" />);
      const avatar = container.querySelector(".h-6");
      expect(avatar).toBeInTheDocument();
    });

    it("applies md size by default", () => {
      const { container } = render(<Avatar name="A B" />);
      const avatar = container.querySelector(".h-10");
      expect(avatar).toBeInTheDocument();
    });

    it("applies xl size", () => {
      const { container } = render(<Avatar name="A B" size="xl" />);
      const avatar = container.querySelector(".h-16");
      expect(avatar).toBeInTheDocument();
    });

    it("applies 2xl size", () => {
      const { container } = render(<Avatar name="A B" size="2xl" />);
      const avatar = container.querySelector(".h-20");
      expect(avatar).toBeInTheDocument();
    });
  });

  describe("Status indicator", () => {
    it("does not show status by default", () => {
      const { container } = render(<Avatar name="John" />);
      // No status dot element
      const statusDot = container.querySelector(".bg-green-500, .bg-gray-400, .bg-yellow-500, .bg-red-500");
      expect(statusDot).not.toBeInTheDocument();
    });

    it("shows online status indicator", () => {
      const { container } = render(
        <Avatar name="John" showStatus status="online" />
      );
      const dot = container.querySelector(".bg-green-500");
      expect(dot).toBeInTheDocument();
    });

    it("shows offline status indicator", () => {
      const { container } = render(
        <Avatar name="John" showStatus status="offline" />
      );
      const dot = container.querySelector(".bg-gray-400");
      expect(dot).toBeInTheDocument();
    });

    it("shows away status indicator", () => {
      const { container } = render(
        <Avatar name="John" showStatus status="away" />
      );
      const dot = container.querySelector(".bg-yellow-500");
      expect(dot).toBeInTheDocument();
    });

    it("shows busy status indicator", () => {
      const { container } = render(
        <Avatar name="John" showStatus status="busy" />
      );
      const dot = container.querySelector(".bg-red-500");
      expect(dot).toBeInTheDocument();
    });
  });

  describe("Color generation", () => {
    it("generates consistent color for same name", () => {
      const { container: c1 } = render(<Avatar name="Test User" />);
      const { container: c2 } = render(<Avatar name="Test User" />);
      const bg1 = (c1.querySelector("[class*='bg-']") as HTMLElement)?.className;
      const bg2 = (c2.querySelector("[class*='bg-']") as HTMLElement)?.className;
      expect(bg1).toBe(bg2);
    });
  });
});

describe("AvatarGroup Component", () => {
  const avatars = [
    { name: "Alice A" },
    { name: "Bob B" },
    { name: "Charlie C" },
    { name: "Diana D" },
    { name: "Eve E" },
  ];

  it("renders up to max avatars (default 4)", () => {
    render(<AvatarGroup avatars={avatars} />);
    // Should show 4 avatars + 1 overflow
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
    expect(screen.getByText("CC")).toBeInTheDocument();
    expect(screen.getByText("DD")).toBeInTheDocument();
    expect(screen.queryByText("EE")).not.toBeInTheDocument();
  });

  it("shows overflow count", () => {
    render(<AvatarGroup avatars={avatars} max={3} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("does not show overflow when all avatars fit", () => {
    render(<AvatarGroup avatars={avatars.slice(0, 2)} max={4} />);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders with custom max", () => {
    render(<AvatarGroup avatars={avatars} max={2} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
    expect(screen.queryByText("CC")).not.toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("applies negative spacing class", () => {
    const { container } = render(<AvatarGroup avatars={avatars} />);
    expect((container.firstChild as HTMLElement).className).toContain("-space-x-2");
  });
});
