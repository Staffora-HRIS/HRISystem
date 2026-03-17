/**
 * Family Leave Entitlement Data Hook
 *
 * Encapsulates all data fetching (queries) and mutations for the
 * family leave entitlement detail page.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import type {
  EntitlementDetail,
  PayScheduleData,
  EligibilityData,
} from "./types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const familyLeaveKeys = {
  all: () => ["family-leave"] as const,
  entitlement: (id: string) =>
    [...familyLeaveKeys.all(), "entitlement", id] as const,
  paySchedule: (id: string) =>
    [...familyLeaveKeys.all(), "pay-schedule", id] as const,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFamilyLeaveEntitlement(entitlementId: string | undefined) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // -- Entitlement detail query --
  const {
    data: entitlement,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: familyLeaveKeys.entitlement(entitlementId!),
    queryFn: () =>
      api.get<EntitlementDetail>(
        `/family-leave/entitlements/${entitlementId}`
      ),
    enabled: !!entitlementId,
  });

  // -- Pay schedule query --
  const { data: paySchedule, isLoading: payScheduleLoading } = useQuery({
    queryKey: familyLeaveKeys.paySchedule(entitlementId!),
    queryFn: () =>
      api.get<PayScheduleData>(
        `/family-leave/entitlements/${entitlementId}/pay-schedule`
      ),
    enabled: !!entitlementId,
  });

  // -- Invalidation helper --
  function invalidateEntitlement() {
    queryClient.invalidateQueries({
      queryKey: familyLeaveKeys.entitlement(entitlementId!),
    });
  }

  function invalidatePaySchedule() {
    queryClient.invalidateQueries({
      queryKey: familyLeaveKeys.paySchedule(entitlementId!),
    });
  }

  // -- Check eligibility mutation --
  const eligibilityMutation = useMutation({
    mutationFn: () =>
      api.post<EligibilityData>(
        `/family-leave/entitlements/${entitlementId}/check-eligibility`,
        { leave_type: entitlement?.leave_type }
      ),
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to check eligibility.";
      toast.error(message);
    },
  });

  // -- Calculate pay mutation --
  const calculatePayMutation = useMutation({
    mutationFn: () =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/calculate-pay`
      ),
    onSuccess: () => {
      invalidateEntitlement();
      invalidatePaySchedule();
      toast.success("Statutory pay calculated successfully");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to calculate statutory pay.";
      toast.error(message);
    },
  });

  // -- Record KIT day mutation --
  const kitDayMutation = useMutation({
    mutationFn: (payload: {
      work_date: string;
      hours_worked: number;
      notes?: string;
    }) =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/kit-day`,
        payload
      ),
    onSuccess: () => {
      invalidateEntitlement();
      toast.success("KIT day recorded");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to record KIT day.";
      toast.error(message);
    },
  });

  // -- Curtail mutation --
  const curtailMutation = useMutation({
    mutationFn: (payload: { curtailment_date: string }) =>
      api.patch(
        `/family-leave/entitlements/${entitlementId}/curtail`,
        payload
      ),
    onSuccess: () => {
      invalidateEntitlement();
      invalidatePaySchedule();
      toast.success("Leave curtailed for shared parental leave");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to curtail leave.";
      toast.error(message);
    },
  });

  // -- Record notice mutation --
  const noticeMutation = useMutation({
    mutationFn: (payload: {
      notice_type: string;
      notice_date: string;
      document_reference?: string;
      notes?: string;
    }) =>
      api.post(
        `/family-leave/entitlements/${entitlementId}/notices`,
        payload
      ),
    onSuccess: () => {
      invalidateEntitlement();
      toast.success("Notice recorded");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to record notice.";
      toast.error(message);
    },
  });

  return {
    // Query data
    entitlement,
    isLoading,
    isError,
    fetchError,
    paySchedule,
    payScheduleLoading,

    // Mutations
    eligibilityMutation,
    calculatePayMutation,
    kitDayMutation,
    curtailMutation,
    noticeMutation,
  };
}
