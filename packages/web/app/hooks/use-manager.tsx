/**
 * Manager Hooks
 *
 * Provides hooks for the Manager Portal functionality.
 * Features:
 * - useIsManager() - check if current user is a manager
 * - useTeam() - get direct reports
 * - useAllSubordinates() - get all subordinates (direct and indirect)
 * - usePendingApprovals() - get pending approval requests
 * - useTeamAbsence() - get team absence calendar
 * - useApprovalActions() - approve/reject requests
 */

import { useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import { queryKeys } from "../lib/query-client";
import { useSession } from "../lib/auth";

// =============================================================================
// Types
// =============================================================================

export interface TeamMember {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  jobTitle: string | null;
  department: string | null;
  photoUrl: string | null;
  hireDate: string;
  status: string;
}

export interface TeamMemberDetails extends TeamMember {
  middleName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  managerId: string | null;
  managerName: string | null;
  location: string | null;
  positionId: string | null;
  positionTitle: string | null;
  orgUnitId: string | null;
  orgUnitName: string | null;
  costCenter: string | null;
  terminationDate: string | null;
}

export type ApprovalType = "leave" | "timesheet" | "expense" | "document" | "workflow";
export type ApprovalAction = "approve" | "reject";

export interface PendingApproval {
  id: string;
  type: ApprovalType;
  title: string;
  description: string | null;
  requesterId: string;
  requesterName: string;
  requesterPhotoUrl: string | null;
  createdAt: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  metadata: Record<string, any>;
}

export interface TeamOverview {
  totalDirectReports: number;
  totalSubordinates: number;
  pendingApprovals: number;
  teamOnLeave: number;
  upcomingLeave: number;
}

export interface TeamAbsenceEntry {
  employeeId: string;
  employeeName: string;
  photoUrl: string | null;
  date: string;
  leaveType: string;
  status: string;
  isHalfDay: boolean;
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchIsManager(): Promise<boolean> {
  const response = await api.get<{ isManager: boolean }>("/manager/is-manager");
  return response.isManager ?? false;
}

async function fetchTeamOverview(): Promise<TeamOverview> {
  return api.get<TeamOverview>("/manager/overview");
}

async function fetchDirectReports(): Promise<TeamMember[]> {
  const response = await api.get<{ team: TeamMember[] }>("/manager/team");
  return response.team ?? [];
}

async function fetchAllSubordinates(maxDepth?: number): Promise<TeamMember[]> {
  const url = maxDepth ? `/manager/team/all?maxDepth=${maxDepth}` : "/manager/team/all";
  const response = await api.get<{ team: TeamMember[] }>(url);
  return response.team ?? [];
}

async function fetchTeamMember(employeeId: string): Promise<TeamMemberDetails | null> {
  try {
    return await api.get<TeamMemberDetails>(`/manager/team/${employeeId}`);
  } catch {
    return null;
  }
}

async function checkIsSubordinate(employeeId: string): Promise<boolean> {
  const response = await api.get<{ isSubordinate: boolean }>(
    `/manager/team/${employeeId}/is-subordinate`
  );
  return response.isSubordinate ?? false;
}

async function fetchPendingApprovals(type?: ApprovalType): Promise<PendingApproval[]> {
  const url = type ? `/manager/approvals?type=${type}` : "/manager/approvals";
  const response = await api.get<{ approvals: PendingApproval[] }>(url);
  return response.approvals ?? [];
}

async function approveRequest(
  id: string,
  type: ApprovalType,
  comment?: string
): Promise<{ success: boolean }> {
  return api.post(`/manager/approvals/${id}/approve`, { type, comment });
}

async function rejectRequest(
  id: string,
  type: ApprovalType,
  comment?: string
): Promise<{ success: boolean }> {
  return api.post(`/manager/approvals/${id}/reject`, { type, comment });
}

async function fetchTeamAbsenceCalendar(
  startDate: string,
  endDate: string
): Promise<TeamAbsenceEntry[]> {
  const response = await api.get<{ entries: TeamAbsenceEntry[] }>(
    `/manager/absence/calendar?startDate=${startDate}&endDate=${endDate}`
  );
  return response.entries ?? [];
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Check if current user is a manager
 */
export function useIsManager() {
  const { isAuthenticated } = useSession();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.isManager(),
    queryFn: fetchIsManager,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    isManager: data ?? false,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get team overview/dashboard data
 */
export function useTeamOverview() {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.overview(),
    queryFn: fetchTeamOverview,
    enabled: isAuthenticated && isManager,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    overview: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get direct reports
 */
export function useDirectReports() {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.directReports(),
    queryFn: fetchDirectReports,
    enabled: isAuthenticated && isManager,
    staleTime: 5 * 60 * 1000,
  });

  return {
    team: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get all subordinates (direct and indirect)
 */
export function useAllSubordinates(maxDepth?: number) {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.allSubordinates(maxDepth),
    queryFn: () => fetchAllSubordinates(maxDepth),
    enabled: isAuthenticated && isManager,
    staleTime: 5 * 60 * 1000,
  });

  return {
    team: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get a specific team member's details
 */
export function useTeamMember(employeeId: string | undefined) {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.teamMember(employeeId ?? ""),
    queryFn: () => fetchTeamMember(employeeId!),
    enabled: isAuthenticated && isManager && !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    member: data,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Check if an employee is a subordinate
 */
export function useIsSubordinate(employeeId: string | undefined) {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.manager.isSubordinate(employeeId ?? ""),
    queryFn: () => checkIsSubordinate(employeeId!),
    enabled: isAuthenticated && isManager && !!employeeId,
    staleTime: 10 * 60 * 1000,
  });

  return {
    isSubordinate: data ?? false,
    isLoading,
    error,
  };
}

/**
 * Get pending approvals
 */
export function usePendingApprovals(type?: ApprovalType) {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.pendingApprovals(type),
    queryFn: () => fetchPendingApprovals(type),
    enabled: isAuthenticated && isManager,
    staleTime: 1 * 60 * 1000, // 1 minute - more frequent for approvals
  });

  return {
    approvals: data ?? [],
    isLoading,
    error,
    refetch,
  };
}

/**
 * Approve or reject requests
 */
export function useApprovalActions() {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: ({ id, type, comment }: { id: string; type: ApprovalType; comment?: string }) =>
      approveRequest(id, type, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, type, comment }: { id: string; type: ApprovalType; comment?: string }) =>
      rejectRequest(id, type, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: queryKeys.manager.overview() });
    },
  });

  return {
    approve: approveMutation.mutate,
    reject: rejectMutation.mutate,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
    approveError: approveMutation.error,
    rejectError: rejectMutation.error,
  };
}

/**
 * Get team absence calendar
 */
export function useTeamAbsence(startDate: string, endDate: string) {
  const { isAuthenticated } = useSession();
  const { isManager } = useIsManager();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.manager.teamAbsence(startDate, endDate),
    queryFn: () => fetchTeamAbsenceCalendar(startDate, endDate),
    enabled: isAuthenticated && isManager && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000,
  });

  // Group entries by date
  const entriesByDate = useMemo(() => {
    const grouped: Record<string, TeamAbsenceEntry[]> = {};
    for (const entry of data ?? []) {
      if (!grouped[entry.date]) {
        grouped[entry.date] = [];
      }
      grouped[entry.date].push(entry);
    }
    return grouped;
  }, [data]);

  // Group entries by employee
  const entriesByEmployee = useMemo(() => {
    const grouped: Record<string, TeamAbsenceEntry[]> = {};
    for (const entry of data ?? []) {
      if (!grouped[entry.employeeId]) {
        grouped[entry.employeeId] = [];
      }
      grouped[entry.employeeId].push(entry);
    }
    return grouped;
  }, [data]);

  return {
    entries: data ?? [],
    entriesByDate,
    entriesByEmployee,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to get current month's absence for team
 */
export function useCurrentMonthTeamAbsence() {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  return useTeamAbsence(startDate, endDate);
}

// =============================================================================
// Query Key Extensions
// =============================================================================

declare module "../lib/query-client" {
  interface QueryKeys {
    manager: {
      isManager: () => readonly ["manager", "is-manager"];
      overview: () => readonly ["manager", "overview"];
      directReports: () => readonly ["manager", "direct-reports"];
      allSubordinates: (maxDepth?: number) => readonly ["manager", "all-subordinates", number | undefined];
      teamMember: (id: string) => readonly ["manager", "team-member", string];
      isSubordinate: (id: string) => readonly ["manager", "is-subordinate", string];
      pendingApprovals: (type?: ApprovalType) => readonly ["manager", "pending-approvals", ApprovalType | undefined];
      teamAbsence: (startDate: string, endDate: string) => readonly ["manager", "team-absence", string, string];
    };
  }
}

// Add query keys if not already present
if (!queryKeys.manager) {
  (queryKeys as any).manager = {
    isManager: () => ["manager", "is-manager"] as const,
    overview: () => ["manager", "overview"] as const,
    directReports: () => ["manager", "direct-reports"] as const,
    allSubordinates: (maxDepth?: number) => ["manager", "all-subordinates", maxDepth] as const,
    teamMember: (id: string) => ["manager", "team-member", id] as const,
    isSubordinate: (id: string) => ["manager", "is-subordinate", id] as const,
    pendingApprovals: (type?: ApprovalType) => ["manager", "pending-approvals", type] as const,
    teamAbsence: (startDate: string, endDate: string) =>
      ["manager", "team-absence", startDate, endDate] as const,
  };
}
