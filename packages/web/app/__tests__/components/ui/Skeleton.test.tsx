/**
 * Skeleton Component Tests
 *
 * Tests for Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonAvatar.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonAvatar,
} from "../../../components/ui/skeleton";

describe("Skeleton Component", () => {
  it("renders a div element", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInstanceOf(HTMLDivElement);
  });

  it("applies animate-pulse by default", () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain("animate-pulse");
  });

  it("does not animate when animate=false", () => {
    const { container } = render(<Skeleton animate={false} />);
    expect((container.firstChild as HTMLElement).className).not.toContain("animate-pulse");
  });

  it("applies custom width as number (px)", () => {
    const { container } = render(<Skeleton width={200} />);
    expect((container.firstChild as HTMLElement).style.width).toBe("200px");
  });

  it("applies custom width as string", () => {
    const { container } = render(<Skeleton width="50%" />);
    expect((container.firstChild as HTMLElement).style.width).toBe("50%");
  });

  it("applies custom height as number (px)", () => {
    const { container } = render(<Skeleton height={40} />);
    expect((container.firstChild as HTMLElement).style.height).toBe("40px");
  });

  it("applies custom height as string", () => {
    const { container } = render(<Skeleton height="2rem" />);
    expect((container.firstChild as HTMLElement).style.height).toBe("2rem");
  });

  it("applies rounded variants", () => {
    const { container, rerender } = render(<Skeleton rounded="none" />);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-none");

    rerender(<Skeleton rounded="sm" />);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-sm");

    rerender(<Skeleton rounded="full" />);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-full");
  });

  it("defaults to rounded-md", () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain("rounded-md");
  });

  it("applies custom className", () => {
    const { container } = render(<Skeleton className="my-skel" />);
    expect((container.firstChild as HTMLElement).className).toContain("my-skel");
  });

  it("applies gray background", () => {
    const { container } = render(<Skeleton />);
    expect((container.firstChild as HTMLElement).className).toContain("bg-gray-200");
  });
});

describe("SkeletonText Component", () => {
  it("renders 3 lines by default", () => {
    const { container } = render(<SkeletonText />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    expect(skeletons).toHaveLength(3);
  });

  it("renders custom number of lines", () => {
    const { container } = render(<SkeletonText lines={5} />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    expect(skeletons).toHaveLength(5);
  });

  it("makes the last line shorter (75% width)", () => {
    const { container } = render(<SkeletonText lines={2} />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    expect((skeletons[1] as HTMLElement).style.width).toBe("75%");
  });

  it("makes non-last lines full width", () => {
    const { container } = render(<SkeletonText lines={3} />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    expect((skeletons[0] as HTMLElement).style.width).toBe("100%");
    expect((skeletons[1] as HTMLElement).style.width).toBe("100%");
  });
});

describe("SkeletonCard Component", () => {
  it("renders avatar, title, and body skeleton placeholders", () => {
    const { container } = render(<SkeletonCard />);
    // Should contain multiple skeleton elements
    const skeletons = container.querySelectorAll(".bg-gray-200");
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });

  it("renders a circular skeleton for avatar", () => {
    const { container } = render(<SkeletonCard />);
    const circle = container.querySelector(".rounded-full");
    expect(circle).toBeInTheDocument();
  });
});

describe("SkeletonTable Component", () => {
  it("renders default 5 rows and 4 columns", () => {
    const { container } = render(<SkeletonTable />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    // Header: 4 columns + Body: 5 rows * 4 columns = 24
    expect(skeletons).toHaveLength(4 + 5 * 4);
  });

  it("renders custom rows and columns", () => {
    const { container } = render(<SkeletonTable rows={3} columns={2} />);
    const skeletons = container.querySelectorAll(".bg-gray-200");
    // Header: 2 + Body: 3 * 2 = 8
    expect(skeletons).toHaveLength(2 + 3 * 2);
  });

  it("renders header border", () => {
    const { container } = render(<SkeletonTable />);
    const header = container.querySelector(".border-b");
    expect(header).toBeInTheDocument();
  });
});

describe("SkeletonAvatar Component", () => {
  it("renders a circular skeleton", () => {
    const { container } = render(<SkeletonAvatar />);
    const circle = container.querySelector(".rounded-full");
    expect(circle).toBeInTheDocument();
  });

  it("applies md size by default (40px)", () => {
    const { container } = render(<SkeletonAvatar />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
  });

  it("applies sm size (32px)", () => {
    const { container } = render(<SkeletonAvatar size="sm" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("32px");
    expect(el.style.height).toBe("32px");
  });

  it("applies lg size (48px)", () => {
    const { container } = render(<SkeletonAvatar size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("48px");
    expect(el.style.height).toBe("48px");
  });

  it("applies xl size (64px)", () => {
    const { container } = render(<SkeletonAvatar size="xl" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("64px");
    expect(el.style.height).toBe("64px");
  });
});
