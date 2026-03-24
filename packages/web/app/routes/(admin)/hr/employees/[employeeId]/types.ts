/**
 * Employee Detail — shared types, constants, and utilities
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface EmployeeDocument {
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

export interface DocumentListResponse {
  items: EmployeeDocument[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HistoryRecord {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string | null;
}

export interface HistoryResponse {
  employeeId: string;
  dimension: string;
  records: HistoryRecord[];
}

export interface EmployeeDetail {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, string> = {
  active: "success",
  on_leave: "warning",
  terminated: "danger",
  pending: "secondary",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatCurrency(amount: string | null, currency: string | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(parseFloat(amount));
}

export function calculateTenure(hireDate: string): string {
  const hire = new Date(hireDate);
  const now = new Date();
  const years = Math.floor((now.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor(((now.getTime() - hire.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));

  if (years > 0) {
    return `${years} year${years > 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}`;
  }
  return `${months} month${months !== 1 ? "s" : ""}`;
}
