/**
 * Pension Management Data Hook
 *
 * Encapsulates all data fetching (queries) and mutations for the
 * pension auto-enrolment management page.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "~/components/ui/toast";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";
import type {
  PensionScheme,
  PensionEnrolment,
  ComplianceSummary,
  PaginatedResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys (pension-specific, scoped under payroll)
// ---------------------------------------------------------------------------

const pensionKeys = {
  all: () => [...queryKeys.payroll.all(), "pension"] as const,
  schemes: () => [...pensionKeys.all(), "schemes"] as const,
  enrolments: (status?: string) =>
    [...pensionKeys.all(), "enrolments", status] as const,
  compliance: () => [...pensionKeys.all(), "compliance"] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePensionManagement(statusFilter: string) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  const {
    data: compliance,
    isLoading: complianceLoading,
    isError: complianceError,
    refetch: refetchCompliance,
  } = useQuery({
    queryKey: pensionKeys.compliance(),
    queryFn: () => api.get<ComplianceSummary>("/pension/compliance"),
  });

  const {
    data: schemesData,
    isLoading: schemesLoading,
    isError: schemesError,
    refetch: refetchSchemes,
  } = useQuery({
    queryKey: pensionKeys.schemes(),
    queryFn: () =>
      api.get<PaginatedResponse<PensionScheme>>("/pension/schemes"),
  });

  const {
    data: enrolmentsData,
    isLoading: enrolmentsLoading,
    isError: enrolmentsError,
    refetch: refetchEnrolments,
  } = useQuery({
    queryKey: pensionKeys.enrolments(statusFilter || undefined),
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      const qs = params.toString();
      return api.get<PaginatedResponse<PensionEnrolment>>(
        `/pension/enrolments${qs ? `?${qs}` : ""}`
      );
    },
  });

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  const createSchemeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<PensionScheme>("/pension/schemes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
      toast.success("Pension scheme created successfully");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to create pension scheme";
      toast.error(message);
    },
  });

  const assessMutation = useMutation({
    mutationFn: (employeeId: string) =>
      api.post<Record<string, unknown>>(`/pension/assess/${employeeId}`),
    onSuccess: (data) => {
      toast.success(
        `Assessment complete. Worker category: ${(data as Record<string, unknown>).worker_category}`
      );
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to assess employee eligibility";
      toast.error(message);
    },
  });

  const enrolMutation = useMutation({
    mutationFn: (employeeId: string) =>
      api.post<PensionEnrolment>(`/pension/enrol/${employeeId}`),
    onSuccess: () => {
      toast.success("Employee enrolled into pension scheme");
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to enrol employee";
      toast.error(message);
    },
  });

  const reEnrolmentMutation = useMutation({
    mutationFn: () =>
      api.post<{ re_enrolled_count: number; skipped_count: number }>(
        "/pension/re-enrolment"
      ),
    onSuccess: (data) => {
      toast.success(
        `Re-enrolment complete: ${data.re_enrolled_count} re-enrolled, ${data.skipped_count} skipped`
      );
      queryClient.invalidateQueries({ queryKey: pensionKeys.all() });
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to trigger re-enrolment";
      toast.error(message);
    },
  });

  return {
    // Compliance
    compliance,
    complianceLoading,
    complianceError,
    refetchCompliance,

    // Schemes
    schemes: schemesData?.items ?? [],
    schemesLoading,
    schemesError,
    refetchSchemes,

    // Enrolments
    enrolments: enrolmentsData?.items ?? [],
    enrolmentsLoading,
    enrolmentsError,
    refetchEnrolments,

    // Mutations
    createSchemeMutation,
    assessMutation,
    enrolMutation,
    reEnrolmentMutation,
  };
}
