/**
 * Deductions — shared types, constants, and form defaults
 */

import type { BadgeVariant } from "~/components/ui";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface DeductionType {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  category: string;
  is_statutory: boolean;
  calculation_method: string;
  created_at: string;
  updated_at: string;
}

export interface DeductionTypeListResponse {
  items: DeductionType[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface EmployeeDeduction {
  id: string;
  tenant_id: string;
  employee_id: string;
  deduction_type_id: string;
  amount: number | null;
  percentage: number | null;
  effective_from: string;
  effective_to: string | null;
  reference: string | null;
  created_at: string;
  updated_at: string;
  deduction_type_name?: string;
  deduction_type_code?: string;
  deduction_category?: string;
}

export interface EmployeeDeductionListResponse {
  items: EmployeeDeduction[];
}

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

export interface CreateTypeForm {
  name: string;
  code: string;
  category: string;
  is_statutory: boolean;
  calculation_method: string;
}

export const INITIAL_TYPE_FORM: CreateTypeForm = {
  name: "",
  code: "",
  category: "voluntary",
  is_statutory: false,
  calculation_method: "fixed",
};

export interface CreateDeductionForm {
  employee_id: string;
  deduction_type_id: string;
  amount: string;
  percentage: string;
  effective_from: string;
  effective_to: string;
  reference: string;
}

export const INITIAL_DEDUCTION_FORM: CreateDeductionForm = {
  employee_id: "",
  deduction_type_id: "",
  amount: "",
  percentage: "",
  effective_from: new Date().toISOString().split("T")[0],
  effective_to: "",
  reference: "",
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CATEGORY_LABELS: Record<string, string> = {
  tax: "Tax",
  ni: "National Insurance",
  pension: "Pension",
  student_loan: "Student Loan",
  attachment_of_earnings: "Attachment of Earnings",
  voluntary: "Voluntary",
  other: "Other",
};

export const CATEGORY_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  tax: "error",
  ni: "warning",
  pension: "info",
  student_loan: "secondary",
  attachment_of_earnings: "error",
  voluntary: "success",
  other: "default",
};

export const METHOD_LABELS: Record<string, string> = {
  fixed: "Fixed Amount",
  percentage: "Percentage",
  tiered: "Tiered",
};

export const CATEGORY_OPTIONS = [
  { value: "tax", label: "Tax" },
  { value: "ni", label: "National Insurance" },
  { value: "pension", label: "Pension" },
  { value: "student_loan", label: "Student Loan" },
  { value: "attachment_of_earnings", label: "Attachment of Earnings" },
  { value: "voluntary", label: "Voluntary" },
  { value: "other", label: "Other" },
];

export const METHOD_OPTIONS = [
  { value: "fixed", label: "Fixed Amount" },
  { value: "percentage", label: "Percentage" },
  { value: "tiered", label: "Tiered" },
];
