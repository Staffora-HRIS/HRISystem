/**
 * Family Leave Entitlement Types
 *
 * Shared type definitions for the family leave entitlement detail page
 * and its extracted components.
 */

import type { BadgeVariant } from "~/components/ui";

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

export interface PayPeriod {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  rate_type: string;
  amount: number;
}

export interface KITDay {
  id: string;
  leave_record_id: string;
  work_date: string;
  hours_worked: number;
  notes: string | null;
  created_at: string;
}

export interface Notice {
  id: string;
  leave_record_id: string;
  employee_id: string;
  notice_type: string;
  notice_date: string;
  received_date: string | null;
  acknowledged_by: string | null;
  acknowledged_date: string | null;
  document_reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface EntitlementDetail {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type: "maternity" | "paternity" | "shared_parental" | "adoption";
  expected_date: string;
  actual_date: string | null;
  start_date: string;
  end_date: string;
  total_weeks: number;
  status: "planned" | "active" | "completed" | "cancelled";
  average_weekly_earnings: number | null;
  qualifies_for_statutory_pay: boolean;
  earnings_above_lel: boolean;
  notice_given_date: string | null;
  qualifying_week: string | null;
  matb1_received: boolean;
  matb1_date: string | null;
  partner_employee_id: string | null;
  curtailment_date: string | null;
  paternity_block_number: number | null;
  spl_weeks_available: number | null;
  spl_pay_weeks_available: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  kit_days_used?: number;
  kit_days_remaining?: number;
  pay_periods?: PayPeriod[];
  kit_days?: KITDay[];
  notices?: Notice[];
}

export interface PayScheduleData {
  leave_record_id: string;
  leave_type: string;
  total_weeks: number;
  paid_weeks: number;
  unpaid_weeks: number;
  total_statutory_pay: number;
  periods: PayPeriod[];
}

export interface EligibilityData {
  employee_id: string;
  leave_type: string;
  eligible: boolean;
  continuous_service_weeks: number;
  required_weeks: number;
  qualifying_week: string | null;
  earnings_above_lel: boolean | null;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  maternity: "Maternity",
  paternity: "Paternity",
  shared_parental: "Shared Parental",
  adoption: "Adoption",
};

export const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  planned: "secondary",
  active: "success",
  completed: "default",
  cancelled: "error",
};

export const STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RATE_TYPE_LABELS: Record<string, string> = {
  earnings_related: "90% of AWE",
  flat_rate: "Flat Rate",
  nil: "Unpaid",
};

export const NOTICE_TYPE_LABELS: Record<string, string> = {
  maternity_notification: "Maternity Notification",
  maternity_leave_dates: "Maternity Leave Dates",
  maternity_return_early: "Early Return Notice",
  matb1_certificate: "MATB1 Certificate",
  paternity_notification: "Paternity Notification",
  spl_opt_in: "ShPL Opt-in Notice",
  spl_period_of_leave: "ShPL Period of Leave Notice",
  spl_curtailment: "Curtailment Notice",
  adoption_notification: "Adoption Notification",
  adoption_matching_cert: "Matching Certificate",
};

export const NOTICE_TYPE_OPTIONS = [
  { value: "", label: "Select notice type..." },
  { value: "maternity_notification", label: "Maternity Notification" },
  { value: "maternity_leave_dates", label: "Maternity Leave Dates" },
  { value: "maternity_return_early", label: "Early Return Notice" },
  { value: "matb1_certificate", label: "MATB1 Certificate" },
  { value: "paternity_notification", label: "Paternity Notification (SC3)" },
  { value: "spl_opt_in", label: "ShPL Opt-in Notice" },
  { value: "spl_period_of_leave", label: "ShPL Period of Leave Notice" },
  { value: "spl_curtailment", label: "Curtailment Notice" },
  { value: "adoption_notification", label: "Adoption Notification" },
  { value: "adoption_matching_cert", label: "Matching Certificate" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}
