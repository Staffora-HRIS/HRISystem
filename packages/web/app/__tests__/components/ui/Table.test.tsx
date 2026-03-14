/**
 * Table / DataTable Component Tests
 *
 * Tests for DataTable (with sorting, pagination, selection) and simple Table components.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DataTable,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  type ColumnDef,
} from "../../../components/ui/table";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
interface Employee {
  id: string;
  name: string;
  department: string;
}

const columns: ColumnDef<Employee>[] = [
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => row.name,
    sortable: true,
  },
  {
    id: "department",
    header: "Department",
    cell: ({ row }) => row.department,
  },
];

const data: Employee[] = [
  { id: "1", name: "Alice", department: "Engineering" },
  { id: "2", name: "Bob", department: "Marketing" },
  { id: "3", name: "Charlie", department: "Engineering" },
];

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------
describe("DataTable Component", () => {
  describe("Rendering", () => {
    it("renders table headers", () => {
      render(<DataTable columns={columns} data={data} />);
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Department")).toBeInTheDocument();
    });

    it("renders all rows", () => {
      render(<DataTable columns={columns} data={data} />);
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("renders departments", () => {
      render(<DataTable columns={columns} data={data} />);
      expect(screen.getAllByText("Engineering")).toHaveLength(2);
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows default empty message when no data", () => {
      render(<DataTable columns={columns} data={[]} />);
      expect(screen.getByText("No data available")).toBeInTheDocument();
    });

    it("shows custom empty message", () => {
      render(
        <DataTable columns={columns} data={[]} emptyMessage="No employees found" />
      );
      expect(screen.getByText("No employees found")).toBeInTheDocument();
    });

    it("shows custom empty icon", () => {
      render(
        <DataTable
          columns={columns}
          data={[]}
          emptyIcon={<span data-testid="empty-icon">Empty</span>}
        />
      );
      expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner when loading with no data", () => {
      render(<DataTable columns={columns} data={[]} loading />);
      expect(screen.getByRole("status")).toBeInTheDocument();
      // "Loading..." appears in both the sr-only Spinner text and a visible label
      const matches = screen.getAllByText("Loading...");
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("shows loading overlay when loading with existing data", () => {
      const { container } = render(<DataTable columns={columns} data={data} loading />);
      // Data should still be visible
      expect(screen.getByText("Alice")).toBeInTheDocument();
      // Loading overlay should be present
      const overlay = container.querySelector(".absolute.inset-0");
      expect(overlay).toBeInTheDocument();
    });
  });

  describe("Sorting", () => {
    it("calls onSortingChange when sortable header is clicked", async () => {
      const user = userEvent.setup();
      const onSortingChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          onSortingChange={onSortingChange}
        />
      );
      await user.click(screen.getByText("Name"));
      expect(onSortingChange).toHaveBeenCalledWith({
        column: "name",
        direction: "asc",
      });
    });

    it("toggles sort direction on second click", async () => {
      const user = userEvent.setup();
      const onSortingChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          sorting={{ column: "name", direction: "asc" }}
          onSortingChange={onSortingChange}
        />
      );
      await user.click(screen.getByText("Name"));
      expect(onSortingChange).toHaveBeenCalledWith({
        column: "name",
        direction: "desc",
      });
    });

    it("does not sort on non-sortable column click", async () => {
      const user = userEvent.setup();
      const onSortingChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          onSortingChange={onSortingChange}
        />
      );
      await user.click(screen.getByText("Department"));
      expect(onSortingChange).not.toHaveBeenCalled();
    });

    it("shows sort indicator on sortable columns", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          sorting={{ column: "name", direction: "asc" }}
        />
      );
      // The sortable column header should contain the sort icon
      const nameHeader = screen.getByText("Name").closest("th");
      expect(nameHeader?.className).toContain("cursor-pointer");
    });
  });

  describe("Row selection", () => {
    it("renders select-all checkbox when selectable", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          selectable
          selectedRows={new Set()}
          onSelectionChange={vi.fn()}
        />
      );
      expect(screen.getByRole("checkbox", { name: "Select all rows" })).toBeInTheDocument();
    });

    it("renders row checkboxes when selectable", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          selectable
          selectedRows={new Set()}
          onSelectionChange={vi.fn()}
        />
      );
      // Select all + 3 row checkboxes
      const checkboxes = screen.getAllByRole("checkbox");
      expect(checkboxes).toHaveLength(4);
    });

    it("calls onSelectionChange when row checkbox clicked", async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          selectable
          selectedRows={new Set()}
          onSelectionChange={onSelectionChange}
        />
      );
      await user.click(screen.getByRole("checkbox", { name: "Select row 1" }));
      expect(onSelectionChange).toHaveBeenCalled();
      const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
      expect(newSelection.has("1")).toBe(true);
    });

    it("selects all rows when select-all is clicked", async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          selectable
          selectedRows={new Set()}
          onSelectionChange={onSelectionChange}
        />
      );
      await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
      expect(onSelectionChange).toHaveBeenCalled();
      const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
      expect(newSelection.size).toBe(3);
    });

    it("deselects all when all are selected and select-all is clicked", async () => {
      const user = userEvent.setup();
      const onSelectionChange = vi.fn();
      render(
        <DataTable
          columns={columns}
          data={data}
          selectable
          selectedRows={new Set(["1", "2", "3"])}
          onSelectionChange={onSelectionChange}
        />
      );
      await user.click(screen.getByRole("checkbox", { name: "Select all rows" }));
      expect(onSelectionChange).toHaveBeenCalled();
      const newSelection = onSelectionChange.mock.calls[0][0] as Set<string>;
      expect(newSelection.size).toBe(0);
    });
  });

  describe("Row click", () => {
    it("calls onRowClick when row is clicked", async () => {
      const user = userEvent.setup();
      const onRowClick = vi.fn();
      render(
        <DataTable columns={columns} data={data} onRowClick={onRowClick} />
      );
      await user.click(screen.getByText("Alice"));
      expect(onRowClick).toHaveBeenCalledWith(data[0], 0);
    });
  });

  describe("Pagination", () => {
    it("renders pagination when pagination prop is set", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          pagination={{ cursor: null, limit: 10 }}
        />
      );
      expect(screen.getByText(/Showing 3/)).toBeInTheDocument();
      expect(screen.getByLabelText("Per page:")).toBeInTheDocument();
    });

    it("shows total count when provided", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          pagination={{ cursor: null, limit: 10 }}
          totalCount={100}
        />
      );
      expect(screen.getByText("Showing 3 of 100 items")).toBeInTheDocument();
    });

    it("shows Load More button when hasMore=true", () => {
      render(
        <DataTable
          columns={columns}
          data={data}
          pagination={{ cursor: null, limit: 10 }}
          hasMore
        />
      );
      expect(screen.getByRole("button", { name: /Load More/i })).toBeInTheDocument();
    });
  });

  describe("Striped and compact modes", () => {
    it("applies compact padding when compact=true", () => {
      const { container } = render(
        <DataTable columns={columns} data={data} compact />
      );
      const cells = container.querySelectorAll("td");
      // compact uses px-3 py-2 instead of px-4 py-3
      expect(cells[0]?.className).toContain("px-3");
    });
  });
});

// ---------------------------------------------------------------------------
// Simple Table Components
// ---------------------------------------------------------------------------
describe("Simple Table Components", () => {
  it("renders a complete table structure", () => {
    render(
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>Name</TableHeader>
            <TableHeader>Role</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>Engineer</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });

  it("Table applies bordered class", () => {
    render(
      <Table bordered>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByRole("table").className).toContain("border");
  });

  it("TableRow applies hover styles", () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    const row = screen.getByRole("row");
    expect(row.className).toContain("hover:bg-gray-50");
  });
});
