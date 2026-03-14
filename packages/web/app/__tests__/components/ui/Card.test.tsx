/**
 * Card Component Tests
 *
 * Tests for Card, CardHeader, CardBody, CardFooter, StatCard, ListCard.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  StatCard,
  ListCard,
} from "../../../components/ui/card";

describe("Card Component", () => {
  describe("Rendering", () => {
    it("renders with children", () => {
      render(<Card>Card content</Card>);
      expect(screen.getByText("Card content")).toBeInTheDocument();
    });

    it("applies default variant styles", () => {
      const { container } = render(<Card>Default</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("bg-white");
      expect((container.firstChild as HTMLElement).className).toContain("shadow-sm");
    });

    it("applies bordered variant", () => {
      const { container } = render(<Card variant="bordered">Bordered</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("border-2");
    });

    it("applies elevated variant", () => {
      const { container } = render(<Card variant="elevated">Elevated</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("shadow-lg");
    });

    it("applies flat variant", () => {
      const { container } = render(<Card variant="flat">Flat</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("bg-gray-50");
    });
  });

  describe("Padding", () => {
    it("applies no padding by default", () => {
      const { container } = render(<Card>No pad</Card>);
      const el = container.firstChild as HTMLElement;
      expect(el.className).not.toContain("p-4");
      expect(el.className).not.toContain("p-6");
      expect(el.className).not.toContain("p-8");
    });

    it("applies sm padding", () => {
      const { container } = render(<Card padding="sm">Sm</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("p-4");
    });

    it("applies md padding", () => {
      const { container } = render(<Card padding="md">Md</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("p-6");
    });

    it("applies lg padding", () => {
      const { container } = render(<Card padding="lg">Lg</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("p-8");
    });
  });

  describe("Interactive states", () => {
    it("applies hover effect when hoverable=true", () => {
      const { container } = render(<Card hoverable>Hover</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("cursor-pointer");
      expect((container.firstChild as HTMLElement).className).toContain("hover:shadow-md");
    });

    it("applies click effect when clickable=true", () => {
      const { container } = render(<Card clickable>Click</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("cursor-pointer");
    });

    it("applies selected ring when selected=true", () => {
      const { container } = render(<Card selected>Selected</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("ring-2");
      expect((container.firstChild as HTMLElement).className).toContain("ring-primary-500");
    });
  });

  describe("Custom className and ref", () => {
    it("applies custom className", () => {
      const { container } = render(<Card className="my-card">C</Card>);
      expect((container.firstChild as HTMLElement).className).toContain("my-card");
    });
  });
});

describe("CardHeader Component", () => {
  it("renders title", () => {
    render(<CardHeader title="My Title" />);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(<CardHeader title="Title" subtitle="Subtitle" />);
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(<CardHeader title="Title" action={<button>Edit</button>} />);
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("renders children when no title/subtitle/action", () => {
    render(<CardHeader>Custom header content</CardHeader>);
    expect(screen.getByText("Custom header content")).toBeInTheDocument();
  });

  it("renders border when bordered=true", () => {
    const { container } = render(<CardHeader title="T" bordered />);
    expect((container.firstChild as HTMLElement).className).toContain("border-b");
  });
});

describe("CardBody Component", () => {
  it("renders children", () => {
    render(<CardBody>Body content</CardBody>);
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("applies md padding by default", () => {
    const { container } = render(<CardBody>Body</CardBody>);
    expect((container.firstChild as HTMLElement).className).toContain("px-6");
  });

  it("applies no padding when padding='none'", () => {
    const { container } = render(<CardBody padding="none">Body</CardBody>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).not.toContain("px-6");
    expect(el.className).not.toContain("px-4");
  });
});

describe("CardFooter Component", () => {
  it("renders children", () => {
    render(<CardFooter>Footer content</CardFooter>);
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("renders border when bordered=true", () => {
    const { container } = render(<CardFooter bordered>Footer</CardFooter>);
    expect((container.firstChild as HTMLElement).className).toContain("border-t");
  });

  it("applies justify-end by default", () => {
    const { container } = render(<CardFooter>Footer</CardFooter>);
    expect((container.firstChild as HTMLElement).className).toContain("justify-end");
  });

  it("applies justify-between when specified", () => {
    const { container } = render(<CardFooter justify="between">Footer</CardFooter>);
    expect((container.firstChild as HTMLElement).className).toContain("justify-between");
  });
});

describe("StatCard Component", () => {
  it("renders title and value", () => {
    render(<StatCard title="Total Employees" value={150} />);
    expect(screen.getByText("Total Employees")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<StatCard title="Revenue" value="$1.2M" />);
    expect(screen.getByText("$1.2M")).toBeInTheDocument();
  });

  it("renders change indicator", () => {
    render(
      <StatCard
        title="Growth"
        value={42}
        change={{ value: 12, type: "increase" }}
      />
    );
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("renders description", () => {
    render(
      <StatCard title="Users" value={100} description="Active this month" />
    );
    expect(screen.getByText("Active this month")).toBeInTheDocument();
  });

  it("renders icon", () => {
    render(
      <StatCard
        title="Users"
        value={100}
        icon={<span data-testid="stat-icon">I</span>}
      />
    );
    expect(screen.getByTestId("stat-icon")).toBeInTheDocument();
  });
});

describe("ListCard Component", () => {
  it("renders title and items", () => {
    const items = ["Item 1", "Item 2", "Item 3"];
    render(
      <ListCard
        title="My List"
        items={items}
        renderItem={(item) => <span>{item}</span>}
      />
    );
    expect(screen.getByText("My List")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("shows empty message when items are empty", () => {
    render(
      <ListCard
        title="Empty List"
        items={[]}
        renderItem={() => null}
        emptyMessage="Nothing here"
      />
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("shows default empty message", () => {
    render(
      <ListCard title="List" items={[]} renderItem={() => null} />
    );
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("limits items when maxItems is set", () => {
    const items = ["A", "B", "C", "D", "E"];
    render(
      <ListCard
        title="Limited"
        items={items}
        renderItem={(item) => <span>{item}</span>}
        maxItems={3}
      />
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more items")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(
      <ListCard
        title="List"
        items={["A"]}
        renderItem={(item) => <span>{item}</span>}
        action={<button>View All</button>}
      />
    );
    expect(screen.getByRole("button", { name: "View All" })).toBeInTheDocument();
  });
});
