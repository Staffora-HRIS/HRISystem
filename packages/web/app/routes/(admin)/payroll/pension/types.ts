/**
 * Pension Auto-Enrolment Types
 *
 * Shared type definitions, constants, and helpers for the pension
 * management page and its extracted components.
 */

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface PensionScheme {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  scheme_type: "defined_contribution" | "master_trust";
  employer_contribution_pct: number;
  employee_contribution_pct: number;
  qualifying_earnings_lower: number;
  qualifying_earnings_upper: number;
  is_default: boolean;
  status: "active" | "closed" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface PensionEnrolment {
  id: string;
  tenant_id: string;
  employee_id: string;
  scheme_id: string;
  worker_category:
    | "eligible_jobholder"
    | "non_eligible_jobholder"
    | "entitled_worker"
    | "not_applicable";
  status:
    | "eligible"
    | "enrolled"
    | "opted_out"
    | "ceased"
    | "re_enrolled"
    | "postponed";
  enrolment_date: string | null;
  opt_out_deadline: string | null;
  opted_out_at: string | null;
  opt_out_reason: string | null;
  re_enrolment_date: string | null;
  postponement_end_date: string | null;
  contributions_start_date: string | null;
  assessed_annual_earnings: number | null;
  assessed_age: number | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  scheme_name?: string;
}

export interface ComplianceSummary {
  total_employees: number;
  eligible_count: number;
  enrolled_count: number;
  opted_out_count: number;
  postponed_count: number;
  ceased_count: number;
  re_enrolled_count: number;
  pending_re_enrolment_count: number;
  total_employer_contributions: number;
  total_employee_contributions: number;
  schemes_count: number;
  compliance_rate: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

export interface CreateSchemeForm {
  name: string;
  provider: string;
  scheme_type: "defined_contribution" | "master_trust";
  employer_contribution_pct: string;
  employee_contribution_pct: string;
  qualifying_earnings_lower: string;
  qualifying_earnings_upper: string;
  is_default: boolean;
}

export const initialSchemeForm: CreateSchemeForm = {
  name: "",
  provider: "",
  scheme_type: "defined_contribution",
  employer_contribution_pct: "3",
  employee_contribution_pct: "5",
  qualifying_earnings_lower: "",
  qualifying_earnings_upper: "",
  is_default: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert pence (integer) to pounds with currency symbol */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

/** Format a percentage value */
export function formatPct(value: number): string {
  return `${value}%`;
}

/** Format a date string for display */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Enrolment status to badge variant mapping */
export function getEnrolmentBadgeVariant(
  status: PensionEnrolment["status"]
): "info" | "success" | "warning" | "secondary" {
  switch (status) {
    case "eligible":
      return "info";
    case "enrolled":
    case "re_enrolled":
      return "success";
    case "opted_out":
      return "warning";
    case "ceased":
      return "secondary";
    case "postponed":
      return "info";
    default:
      return "secondary";
  }
}

/** Scheme status to badge variant mapping */
export function getSchemeBadgeVariant(
  status: PensionScheme["status"]
): "success" | "secondary" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "closed":
      return "secondary";
    case "suspended":
      return "warning";
    default:
      return "secondary";
  }
}

/** Human-readable label for enrolment status */
export function formatEnrolmentStatus(status: PensionEnrolment["status"]): string {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "enrolled":
      return "Enrolled";
    case "opted_out":
      return "Opted Out";
    case "ceased":
      return "Ceased";
    case "re_enrolled":
      return "Re-enrolled";
    case "postponed":
      return "Postponed";
    default:
      return status;
  }
}

/** Human-readable label for scheme type */
export function formatSchemeType(type: PensionScheme["scheme_type"]): string {
  switch (type) {
    case "defined_contribution":
      return "Defined Contribution";
    case "master_trust":
      return "Master Trust";
    default:
      return type;
  }
}
