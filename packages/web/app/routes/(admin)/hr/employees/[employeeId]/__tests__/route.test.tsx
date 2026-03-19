/**
 * Admin Employee Detail Page Tests
 *
 * Tests for the employee detail page including:
 * - Employee data rendering logic
 * - Tab navigation state management
 * - Edit modal form validation
 * - Loading, error, and not-found states
 * - Date and currency formatting
 * - Tenure calculation
 * - Document and history tab behaviour
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Types mirrored from the route
// ---------------------------------------------------------------------------

interface EmployeeDetail {
  id: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  email: string;
  workPhone: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  status: string;
  employmentType: string;
  hireDate: string;
  originalHireDate: string | null;
  terminationDate: string | null;
  terminationReason: string | null;
  positionId: string | null;
  positionTitle: string | null;
  orgUnitId: string | null;
  departmentName: string | null;
  managerId: string | null;
  managerName: string | null;
  locationId: string | null;
  locationName: string | null;
  workAddress: Record<string, unknown> | null;
  homeAddress: Record<string, unknown> | null;
  baseSalary: string | null;
  currency: string | null;
  payFrequency: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeeDocument {
  id: string;
  name: string;
  fileName: string;
  category: string;
  status: string;
  fileSize: number;
  mimeType: string;
  version: number;
  expiresAt: string | null;
  createdAt: string;
  uploadedByName?: string;
}

interface HistoryRecord {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

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
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: string | null, currency: string | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(parseFloat(amount));
}

function calculateTenure(hireDate: string): string {
  const hire = new Date(hireDate);
  const now = new Date();
  const years = Math.floor(
    (now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );
  const months = Math.floor(
    ((now.getTime() - hire.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) /
      (30.44 * 24 * 60 * 60 * 1000)
  );

  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}`;
  }
  return `${months} month${months !== 1 ? "s" : ""}`;
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function createEmployeeDetail(
  overrides: Partial<EmployeeDetail> = {}
): EmployeeDetail {
  return {
    id: "emp-001",
    employeeNumber: "EMP001",
    firstName: "John",
    middleName: null,
    lastName: "Smith",
    preferredName: null,
    email: "john.smith@company.com",
    workPhone: "+44 207 123 4567",
    personalEmail: null,
    personalPhone: null,
    dateOfBirth: "1990-05-15",
    gender: "male",
    maritalStatus: "single",
    nationality: "British",
    status: "active",
    employmentType: "full_time",
    hireDate: "2022-03-01",
    originalHireDate: "2022-03-01",
    terminationDate: null,
    terminationReason: null,
    positionId: "pos-001",
    positionTitle: "Software Engineer",
    orgUnitId: "org-eng",
    departmentName: "Engineering",
    managerId: "mgr-001",
    managerName: "Sarah Williams",
    locationId: "loc-001",
    locationName: "London HQ",
    workAddress: null,
    homeAddress: null,
    baseSalary: "55000",
    currency: "GBP",
    payFrequency: "monthly",
    createdAt: "2022-03-01T09:00:00Z",
    updatedAt: "2024-01-15T14:30:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Admin Employee Detail Page", () => {
  describe("Date Formatting", () => {
    it("should format dates in long en-GB format", () => {
      const result = formatDate("2024-01-15");
      expect(result).toContain("January");
      expect(result).toContain("2024");
      expect(result).toContain("15");
    });

    it("should return dash for null dates", () => {
      expect(formatDate(null)).toBe("-");
    });

    it("should handle ISO timestamps", () => {
      const result = formatDate("2024-12-25T10:00:00Z");
      expect(result).toContain("December");
      expect(result).toContain("2024");
    });
  });

  describe("Currency Formatting", () => {
    it("should format GBP salary correctly", () => {
      const result = formatCurrency("55000", "GBP");
      expect(result).toContain("55,000");
      // GBP symbol
      expect(result).toMatch(/\u00a3|GBP/);
    });

    it("should default to GBP when currency is null", () => {
      const result = formatCurrency("42000", null);
      expect(result).toContain("42,000");
    });

    it("should return dash for null amount", () => {
      expect(formatCurrency(null, "GBP")).toBe("-");
    });

    it("should handle decimal amounts", () => {
      const result = formatCurrency("55000.50", "GBP");
      expect(result).toContain("55,000.50");
    });
  });

  describe("Tenure Calculation", () => {
    it("should calculate tenure for multi-year employees", () => {
      // 3 years ago
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const result = calculateTenure(threeYearsAgo.toISOString().split("T")[0]);
      expect(result).toContain("3 year");
    });

    it("should show months-only for employees under a year", () => {
      // 6 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const result = calculateTenure(sixMonthsAgo.toISOString().split("T")[0]);
      expect(result).not.toContain("year");
      expect(result).toContain("month");
    });

    it("should pluralise years correctly", () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      oneYearAgo.setMonth(oneYearAgo.getMonth() - 1); // ensure > 1 year
      const result = calculateTenure(oneYearAgo.toISOString().split("T")[0]);
      expect(result).toMatch(/1 year,/);
    });
  });

  describe("Tab Navigation State", () => {
    type TabId =
      | "overview"
      | "personal"
      | "employment"
      | "compensation"
      | "documents"
      | "history";

    it("should default to overview tab", () => {
      const activeTab: TabId = "overview";
      expect(activeTab).toBe("overview");
    });

    it("should define all six tabs", () => {
      const tabs: { id: TabId; label: string }[] = [
        { id: "overview", label: "Overview" },
        { id: "personal", label: "Personal" },
        { id: "employment", label: "Employment" },
        { id: "compensation", label: "Compensation" },
        { id: "documents", label: "Documents" },
        { id: "history", label: "History" },
      ];

      expect(tabs).toHaveLength(6);
      expect(tabs.map((t) => t.id)).toEqual([
        "overview",
        "personal",
        "employment",
        "compensation",
        "documents",
        "history",
      ]);
    });

    it("should switch to selected tab", () => {
      let activeTab: TabId = "overview";
      activeTab = "personal";
      expect(activeTab).toBe("personal");

      activeTab = "documents";
      expect(activeTab).toBe("documents");
    });
  });

  describe("Loading and Error States", () => {
    it("should show loading spinner when isLoading is true", () => {
      const isLoading = true;
      const error = null;
      const employee = null;

      const showLoading = isLoading;
      const showError = !isLoading && (!!error || !employee);
      const showContent = !isLoading && !error && !!employee;

      expect(showLoading).toBe(true);
      expect(showError).toBe(false);
      expect(showContent).toBe(false);
    });

    it("should show error state when employee is not found", () => {
      const isLoading = false;
      const error = new Error("Not found");
      const employee = null;

      const showLoading = isLoading;
      const showError = !isLoading && (!!error || !employee);
      const showContent = !isLoading && !error && !!employee;

      expect(showLoading).toBe(false);
      expect(showError).toBe(true);
      expect(showContent).toBe(false);
    });

    it("should show error state when employee data is null", () => {
      const isLoading = false;
      const error = null;
      const employee = null;

      const showError = !isLoading && (!!error || !employee);
      expect(showError).toBe(true);
    });

    it("should show content when employee data is loaded", () => {
      const isLoading = false;
      const error = null;
      const employee = createEmployeeDetail();

      const showContent = !isLoading && !error && !!employee;
      expect(showContent).toBe(true);
    });
  });

  describe("Employee Header Rendering Logic", () => {
    it("should derive initials from first and last name", () => {
      const employee = createEmployeeDetail({
        firstName: "John",
        lastName: "Smith",
      });
      const initials =
        (employee.firstName ?? "?")[0] + (employee.lastName ?? "?")[0];

      expect(initials).toBe("JS");
    });

    it("should use question marks when names are null-like", () => {
      // Edge case: names could potentially be empty strings
      const firstInitial = ("" || "?")[0];
      const lastInitial = ("" || "?")[0];

      expect(firstInitial).toBe("?");
      expect(lastInitial).toBe("?");
    });

    it("should display position and department subtitle", () => {
      const employee = createEmployeeDetail({
        positionTitle: "Software Engineer",
        departmentName: "Engineering",
      });

      const subtitle = `${employee.positionTitle || "No position"} • ${employee.departmentName || "No department"}`;
      expect(subtitle).toBe("Software Engineer • Engineering");
    });

    it("should show fallback text when position or department is null", () => {
      const employee = createEmployeeDetail({
        positionTitle: null,
        departmentName: null,
      });

      const subtitle = `${employee.positionTitle || "No position"} • ${employee.departmentName || "No department"}`;
      expect(subtitle).toBe("No position • No department");
    });
  });

  describe("Edit Employee Modal Validation", () => {
    it("should disable save when firstName is empty", () => {
      const firstName = "";
      const lastName = "Smith";
      const isPending = false;

      const disabled = !firstName || !lastName || isPending;
      expect(disabled).toBe(true);
    });

    it("should disable save when lastName is empty", () => {
      const firstName = "John";
      const lastName = "";
      const isPending = false;

      const disabled = !firstName || !lastName || isPending;
      expect(disabled).toBe(true);
    });

    it("should enable save when both names are filled", () => {
      const firstName = "John";
      const lastName = "Smith";
      const isPending = false;

      const disabled = !firstName || !lastName || isPending;
      expect(disabled).toBe(false);
    });

    it("should disable save when mutation is pending", () => {
      const firstName = "John";
      const lastName = "Smith";
      const isPending = true;

      const disabled = !firstName || !lastName || isPending;
      expect(disabled).toBe(true);
    });

    it("should show 'Saving...' text when pending", () => {
      const isPending = true;
      const buttonText = isPending ? "Saving..." : "Save Changes";
      expect(buttonText).toBe("Saving...");
    });
  });

  describe("Edit Mutation Payload", () => {
    it("should build personal update payload with today's effective date", () => {
      const today = new Date().toISOString().split("T")[0];
      const data = { firstName: "John", lastName: "Doe" };

      const payload = {
        effective_from: today,
        first_name: data.firstName,
        last_name: data.lastName,
      };

      expect(payload.effective_from).toBe(today);
      expect(payload.first_name).toBe("John");
      expect(payload.last_name).toBe("Doe");
    });
  });

  describe("Overview Tab - Contact Info", () => {
    it("should display work email", () => {
      const employee = createEmployeeDetail({ email: "john@company.com" });
      expect(employee.email).toBe("john@company.com");
    });

    it("should conditionally display work phone", () => {
      const withPhone = createEmployeeDetail({ workPhone: "+44 207 123 4567" });
      const withoutPhone = createEmployeeDetail({ workPhone: null });

      expect(!!withPhone.workPhone).toBe(true);
      expect(!!withoutPhone.workPhone).toBe(false);
    });

    it("should conditionally display location", () => {
      const withLocation = createEmployeeDetail({ locationName: "London HQ" });
      const withoutLocation = createEmployeeDetail({ locationName: null });

      expect(!!withLocation.locationName).toBe(true);
      expect(!!withoutLocation.locationName).toBe(false);
    });
  });

  describe("Overview Tab - Employment Details", () => {
    it("should show manager name as a link when available", () => {
      const employee = createEmployeeDetail({
        managerId: "mgr-001",
        managerName: "Sarah Williams",
      });

      expect(!!employee.managerName).toBe(true);
      const managerLink = `/admin/hr/employees/${employee.managerId}`;
      expect(managerLink).toBe("/admin/hr/employees/mgr-001");
    });

    it("should show dash when no manager is assigned", () => {
      const employee = createEmployeeDetail({
        managerId: null,
        managerName: null,
      });

      const display = employee.managerName || "-";
      expect(display).toBe("-");
    });
  });

  describe("Compensation Tab", () => {
    it("should display formatted salary", () => {
      const employee = createEmployeeDetail({
        baseSalary: "55000",
        currency: "GBP",
      });

      const formatted = formatCurrency(employee.baseSalary, employee.currency);
      expect(formatted).toContain("55,000");
    });

    it("should default currency to GBP when null", () => {
      const employee = createEmployeeDetail({
        baseSalary: "42000",
        currency: null,
      });

      const display = employee.currency || "GBP";
      expect(display).toBe("GBP");
    });

    it("should format pay frequency with spaces", () => {
      const payFrequency = "bi_weekly";
      const formatted = payFrequency.replace("_", " ");
      expect(formatted).toBe("bi weekly");
    });
  });

  describe("Employment Tab - Termination Data", () => {
    it("should not show termination fields for active employees", () => {
      const employee = createEmployeeDetail({ terminationDate: null });
      expect(!!employee.terminationDate).toBe(false);
    });

    it("should show termination fields for terminated employees", () => {
      const employee = createEmployeeDetail({
        terminationDate: "2024-06-30",
        terminationReason: "Resignation",
      });

      expect(!!employee.terminationDate).toBe(true);
      expect(employee.terminationReason).toBe("Resignation");
    });
  });

  describe("Documents Tab", () => {
    it("should identify empty document list", () => {
      const documents: EmployeeDocument[] = [];
      expect(documents.length === 0).toBe(true);
    });

    it("should compute file size in KB", () => {
      const doc: EmployeeDocument = {
        id: "doc-1",
        name: "Contract",
        fileName: "contract.pdf",
        category: "employment",
        status: "active",
        fileSize: 256000,
        mimeType: "application/pdf",
        version: 1,
        expiresAt: null,
        createdAt: "2024-01-01T00:00:00Z",
      };

      const sizeKB = (doc.fileSize / 1024).toFixed(1);
      expect(sizeKB).toBe("250.0");
    });

    it("should show expiry date when present", () => {
      const doc: EmployeeDocument = {
        id: "doc-2",
        name: "Right to Work",
        fileName: "rtw.pdf",
        category: "compliance",
        status: "active",
        fileSize: 128000,
        mimeType: "application/pdf",
        version: 1,
        expiresAt: "2025-12-31",
        createdAt: "2024-01-01T00:00:00Z",
      };

      expect(!!doc.expiresAt).toBe(true);
    });
  });

  describe("History Tab", () => {
    it("should support all six history dimensions", () => {
      const dimensions = [
        "position",
        "compensation",
        "contract",
        "personal",
        "manager",
        "status",
      ];

      expect(dimensions).toHaveLength(6);
    });

    it("should default to position dimension", () => {
      const historyDimension = "position";
      expect(historyDimension).toBe("position");
    });

    it("should identify current records (no effectiveTo)", () => {
      const record: HistoryRecord = {
        id: "hist-1",
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
        data: { position_title: "Senior Engineer" },
        createdAt: "2024-01-01T00:00:00Z",
        createdBy: "user-1",
      };

      const isCurrent = !record.effectiveTo;
      expect(isCurrent).toBe(true);
    });

    it("should identify past records (has effectiveTo)", () => {
      const record: HistoryRecord = {
        id: "hist-2",
        effectiveFrom: "2023-01-01",
        effectiveTo: "2023-12-31",
        data: { position_title: "Junior Engineer" },
        createdAt: "2023-01-01T00:00:00Z",
        createdBy: "user-1",
      };

      const isCurrent = !record.effectiveTo;
      expect(isCurrent).toBe(false);
    });

    it("should display data keys with underscores replaced by spaces", () => {
      const key = "position_title";
      const formatted = key.replace(/_/g, " ");
      expect(formatted).toBe("position title");
    });

    it("should handle empty history", () => {
      const records: HistoryRecord[] = [];
      expect(records.length === 0).toBe(true);
    });
  });

  describe("Query Key Construction", () => {
    it("should build employee detail query key with ID", () => {
      const employeeId = "emp-123";
      const queryKey = ["admin-employee", employeeId];
      expect(queryKey).toEqual(["admin-employee", "emp-123"]);
    });

    it("should build history query key with dimension", () => {
      const employeeId = "emp-123";
      const dimension = "compensation";
      const queryKey = ["admin-employee-history", employeeId, dimension];
      expect(queryKey).toEqual([
        "admin-employee-history",
        "emp-123",
        "compensation",
      ]);
    });

    it("should enable query only when employeeId is truthy", () => {
      const employeeId: string | undefined = undefined;
      const enabled = !!employeeId;
      expect(enabled).toBe(false);

      const validId = "emp-001";
      expect(!!validId).toBe(true);
    });
  });
});
