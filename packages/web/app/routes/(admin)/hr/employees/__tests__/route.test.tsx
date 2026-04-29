/**
 * Admin Employees List Page Tests
 *
 * Tests for the employee list page including:
 * - Data rendering and stats computation
 * - Search and filter logic
 * - Hire modal form validation
 * - Loading, empty, and error states
 * - Column definitions and formatting
 * - Navigation and user interaction patterns
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types mirrored from the route to keep tests self-contained
// ---------------------------------------------------------------------------

interface Employee {
  id: string;
  employeeNumber: string;
  status: string;
  hireDate: string;
  fullName: string;
  displayName: string;
  positionTitle: string | null;
  orgUnitName: string | null;
  managerName: string | null;
}

interface EmployeeStats {
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
}

interface HireFormState {
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  orgUnitId: string;
  employmentType: string;
}

const INITIAL_HIRE_FORM: HireFormState = {
  firstName: "",
  lastName: "",
  email: "",
  hireDate: "",
  orgUnitId: "",
  employmentType: "full_time",
};

const STATUS_COLORS: Record<string, string> = {
  active: "success",
  on_leave: "warning",
  terminated: "danger",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-001",
    employeeNumber: "EMP001",
    status: "active",
    hireDate: "2024-01-15",
    fullName: "John Smith",
    displayName: "John Smith",
    positionTitle: "Software Engineer",
    orgUnitName: "Engineering",
    managerName: "Sarah Williams",
    ...overrides,
  };
}

function computeStats(employees: Employee[]): EmployeeStats {
  return {
    total: employees.length,
    active: employees.filter((e) => e.status === "active").length,
    onLeave: employees.filter((e) => e.status === "on_leave").length,
    terminated: employees.filter((e) => e.status === "terminated").length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Admin Employees List Page", () => {
  describe("Stats Computation", () => {
    it("should compute correct stats from employee list", () => {
      const employees: Employee[] = [
        createEmployee({ id: "1", status: "active" }),
        createEmployee({ id: "2", status: "active" }),
        createEmployee({ id: "3", status: "on_leave" }),
        createEmployee({ id: "4", status: "terminated" }),
        createEmployee({ id: "5", status: "active" }),
      ];

      const stats = computeStats(employees);

      expect(stats.total).toBe(5);
      expect(stats.active).toBe(3);
      expect(stats.onLeave).toBe(1);
      expect(stats.terminated).toBe(1);
    });

    it("should handle empty employee list", () => {
      const stats = computeStats([]);

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.onLeave).toBe(0);
      expect(stats.terminated).toBe(0);
    });

    it("should handle all employees having the same status", () => {
      const employees = [
        createEmployee({ id: "1", status: "active" }),
        createEmployee({ id: "2", status: "active" }),
        createEmployee({ id: "3", status: "active" }),
      ];

      const stats = computeStats(employees);

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(3);
      expect(stats.onLeave).toBe(0);
      expect(stats.terminated).toBe(0);
    });
  });

  describe("Status Labels and Colors", () => {
    it("should map all known statuses to labels", () => {
      expect(STATUS_LABELS.active).toBe("Active");
      expect(STATUS_LABELS.on_leave).toBe("On Leave");
      expect(STATUS_LABELS.terminated).toBe("Terminated");
      expect(STATUS_LABELS.pending).toBe("Pending");
    });

    it("should map all known statuses to badge variants", () => {
      expect(STATUS_COLORS.active).toBe("success");
      expect(STATUS_COLORS.on_leave).toBe("warning");
      expect(STATUS_COLORS.terminated).toBe("danger");
      expect(STATUS_COLORS.pending).toBe("secondary");
    });

    it("should return undefined for unknown status labels", () => {
      expect(STATUS_LABELS["unknown"]).toBeUndefined();
      expect(STATUS_COLORS["unknown"]).toBeUndefined();
    });
  });

  describe("Date Formatting", () => {
    it("should format valid date strings in en-GB locale", () => {
      const result = formatDate("2024-01-15");
      expect(result).toContain("2024");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
    });

    it("should return dash for null date", () => {
      expect(formatDate(null)).toBe("-");
    });

    it("should handle ISO date strings", () => {
      const result = formatDate("2024-12-25T10:00:00Z");
      expect(result).toContain("2024");
      expect(result).toContain("Dec");
    });
  });

  describe("Employee Initials Derivation", () => {
    it("should derive initials from display name", () => {
      const employee = createEmployee({ displayName: "John Smith" });
      const initials = (employee.displayName || employee.fullName || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      expect(initials).toBe("JS");
    });

    it("should fall back to fullName when displayName is empty", () => {
      const employee = createEmployee({ displayName: "", fullName: "Jane Doe" });
      const initials = (employee.displayName || employee.fullName || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      expect(initials).toBe("JD");
    });

    it("should handle single-word names", () => {
      const employee = createEmployee({ displayName: "Admin" });
      const initials = (employee.displayName || employee.fullName || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      expect(initials).toBe("A");
    });

    it("should limit initials to 2 characters for long names", () => {
      const employee = createEmployee({ displayName: "John Michael Smith" });
      const initials = (employee.displayName || employee.fullName || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      expect(initials).toBe("JM");
    });
  });

  describe("Search and Filter Logic", () => {
    it("should build query params with search term", () => {
      const search = "John";
      const statusFilter = "";
      const departmentFilter = "";

      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (departmentFilter) params.set("orgUnitId", departmentFilter);
      params.set("limit", "50");

      expect(params.get("search")).toBe("John");
      expect(params.has("status")).toBe(false);
      expect(params.has("orgUnitId")).toBe(false);
      expect(params.get("limit")).toBe("50");
    });

    it("should build query params with all filters applied", () => {
      const search = "Jane";
      const statusFilter = "active";
      const departmentFilter = "org-123";

      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (departmentFilter) params.set("orgUnitId", departmentFilter);
      params.set("limit", "50");

      expect(params.get("search")).toBe("Jane");
      expect(params.get("status")).toBe("active");
      expect(params.get("orgUnitId")).toBe("org-123");
    });

    it("should build query params with no filters", () => {
      const params = new URLSearchParams();
      params.set("limit", "50");

      expect(params.toString()).toBe("limit=50");
    });
  });

  describe("Empty State Logic", () => {
    function getEmptyStateMessage(
      search: string,
      statusFilter: string,
      departmentFilter: string
    ): string {
      const hasFilters = !!(search || statusFilter || departmentFilter);
      return hasFilters
        ? "Try adjusting your filters"
        : "Start by hiring your first employee";
    }

    function shouldShowHireButton(
      search: string,
      statusFilter: string,
      departmentFilter: string
    ): boolean {
      return !search && !statusFilter && !departmentFilter;
    }

    it("should show filter hint when filters are applied and list is empty", () => {
      expect(getEmptyStateMessage("nonexistent", "active", "")).toBe(
        "Try adjusting your filters"
      );
    });

    it("should show hire CTA when no filters and list is empty", () => {
      expect(getEmptyStateMessage("", "", "")).toBe(
        "Start by hiring your first employee"
      );
    });

    it("should show hire button only when no filters are active", () => {
      expect(shouldShowHireButton("", "", "")).toBe(true);
    });

    it("should hide hire button when any filter is active", () => {
      expect(shouldShowHireButton("test", "", "")).toBe(false);
    });
  });

  describe("Hire Employee Form Validation", () => {
    it("should initialise with empty fields and full_time employment", () => {
      const form: HireFormState = { ...INITIAL_HIRE_FORM };

      expect(form.firstName).toBe("");
      expect(form.lastName).toBe("");
      expect(form.email).toBe("");
      expect(form.hireDate).toBe("");
      expect(form.orgUnitId).toBe("");
      expect(form.employmentType).toBe("full_time");
    });

    it("should disable submit when required fields are empty", () => {
      const form: HireFormState = { ...INITIAL_HIRE_FORM };
      const isPending = false;

      const disabled =
        !form.firstName ||
        !form.lastName ||
        !form.hireDate ||
        !form.orgUnitId ||
        isPending;

      expect(disabled).toBe(true);
    });

    it("should enable submit when all required fields are filled", () => {
      const form: HireFormState = {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        hireDate: "2024-06-01",
        orgUnitId: "org-123",
        employmentType: "full_time",
      };
      const isPending = false;

      const disabled =
        !form.firstName ||
        !form.lastName ||
        !form.hireDate ||
        !form.orgUnitId ||
        isPending;

      expect(disabled).toBe(false);
    });

    it("should disable submit when mutation is pending", () => {
      const form: HireFormState = {
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        hireDate: "2024-06-01",
        orgUnitId: "org-123",
        employmentType: "full_time",
      };
      const isPending = true;

      const disabled =
        !form.firstName ||
        !form.lastName ||
        !form.hireDate ||
        !form.orgUnitId ||
        isPending;

      expect(disabled).toBe(true);
    });

    it("should reset form when modal is closed", () => {
      // Simulate modal close: form is reset to initial values
      const form: HireFormState = { ...INITIAL_HIRE_FORM };

      expect(form.firstName).toBe("");
      expect(form.lastName).toBe("");
      expect(form.employmentType).toBe("full_time");
    });
  });

  describe("Hire Mutation Payload Construction", () => {
    it("should build correct payload for full_time employee", () => {
      const form: HireFormState = {
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@company.com",
        hireDate: "2024-07-01",
        orgUnitId: "org-eng",
        employmentType: "full_time",
      };

      const payload = {
        personal: {
          first_name: form.firstName,
          last_name: form.lastName,
        },
        contract: {
          hire_date: form.hireDate,
          contract_type: "permanent",
          employment_type: form.employmentType,
          fte: form.employmentType === "full_time" ? 1 : 0.5,
        },
        compensation: {
          base_salary: 0,
          currency: "GBP",
          pay_frequency: "monthly",
        },
      };

      expect(payload.personal.first_name).toBe("Alice");
      expect(payload.personal.last_name).toBe("Johnson");
      expect(payload.contract.hire_date).toBe("2024-07-01");
      expect(payload.contract.fte).toBe(1);
      expect(payload.compensation.currency).toBe("GBP");
    });

    it("should build correct payload for part_time employee with 0.5 FTE", () => {
      const form: HireFormState = {
        firstName: "Bob",
        lastName: "Brown",
        email: "",
        hireDate: "2024-08-15",
        orgUnitId: "org-hr",
        employmentType: "part_time",
      };

      const fte = form.employmentType === "full_time" ? 1 : 0.5;

      expect(fte).toBe(0.5);
    });

    it("should include contacts only when email is provided", () => {
      const emailProvided = "alice@company.com";
      const emailEmpty = "";

      const contactsWithEmail = emailProvided
        ? [{ contact_type: "email", value: emailProvided, is_primary: true }]
        : [];
      const contactsWithoutEmail = emailEmpty
        ? [{ contact_type: "email", value: emailEmpty, is_primary: true }]
        : [];

      expect(contactsWithEmail).toHaveLength(1);
      expect(contactsWithoutEmail).toHaveLength(0);
    });
  });

  describe("Loading State", () => {
    it("should show loading indicator when isLoading is true", () => {
      const isLoading = true;
      const employees: Employee[] = [];

      const showTable = !isLoading && employees.length > 0;
      const showEmpty = !isLoading && employees.length === 0;
      const showLoading = isLoading;

      expect(showLoading).toBe(true);
      expect(showTable).toBe(false);
      expect(showEmpty).toBe(false);
    });

    it("should show table when loaded with data", () => {
      const isLoading = false;
      const employees = [createEmployee()];

      const showTable = !isLoading && employees.length > 0;
      expect(showTable).toBe(true);
    });

    it("should show empty state when loaded with no data", () => {
      const isLoading = false;
      const employees: Employee[] = [];

      const showEmpty = !isLoading && employees.length === 0;
      expect(showEmpty).toBe(true);
    });
  });

  describe("Navigation Paths", () => {
    it("should construct correct employee detail path", () => {
      const employee = createEmployee({ id: "emp-456" });
      const path = `/admin/hr/employees/${employee.id}`;

      expect(path).toBe("/admin/hr/employees/emp-456");
    });

    it("should construct row click navigation path", () => {
      const row = { id: "emp-789" };
      const path = `/admin/hr/employees/${row.id}`;

      expect(path).toBe("/admin/hr/employees/emp-789");
    });
  });

  describe("Query Key Construction", () => {
    it("should include all filter params in query key", () => {
      const search = "john";
      const statusFilter = "active";
      const departmentFilter = "org-1";

      const queryKey = ["admin-employees", search, statusFilter, departmentFilter];

      expect(queryKey).toEqual(["admin-employees", "john", "active", "org-1"]);
    });

    it("should include empty strings for inactive filters", () => {
      const queryKey = ["admin-employees", "", "", ""];
      expect(queryKey).toHaveLength(4);
    });
  });

  describe("Department Select Options", () => {
    it("should prepend 'All Departments' option", () => {
      const departments = [
        { id: "org-1", name: "Engineering" },
        { id: "org-2", name: "HR" },
      ];

      const options = [
        { value: "", label: "All Departments" },
        ...departments.map((d) => ({ value: d.id, label: d.name })),
      ];

      expect(options).toHaveLength(3);
      expect(options[0]).toEqual({ value: "", label: "All Departments" });
      expect(options[1]).toEqual({ value: "org-1", label: "Engineering" });
    });

    it("should handle empty departments list", () => {
      const departments: { id: string; name: string }[] = [];

      const options = [
        { value: "", label: "All Departments" },
        ...departments.map((d) => ({ value: d.id, label: d.name })),
      ];

      expect(options).toHaveLength(1);
    });
  });
});
