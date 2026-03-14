/**
 * useManager Hook Tests
 *
 * Tests for manager hooks: useIsManager, useTeamOverview, useDirectReports,
 * usePendingApprovals, useApprovalActions, and useTeamAbsence.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock api-client
vi.mock("../../lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    getTenantId: vi.fn(() => "test-tenant"),
  },
}));

// Mock auth
vi.mock("../../lib/auth", () => ({
  useSession: vi.fn(() => ({
    isAuthenticated: true,
    user: { id: "user-1" },
    session: { id: "session-1" },
    isLoading: false,
    error: null,
  })),
}));

// Mock better-auth
vi.mock("../../lib/better-auth", () => ({
  authClient: {},
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  signOutUser: vi.fn(),
  getCurrentSession: vi.fn(),
  twoFactor: { enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn() },
}));

// Mock query-client
vi.mock("../../lib/query-client", () => ({
  queryKeys: {
    _tenantScope: () => "test-tenant",
    auth: {
      all: () => ["auth"],
      session: () => ["auth", "session", "test-tenant"],
      permissions: () => ["auth", "permissions", "test-tenant"],
      me: () => ["auth", "me", "test-tenant"],
      mfaStatus: () => ["auth", "mfa-status", "test-tenant"],
    },
    manager: {
      all: () => ["manager", "test-tenant"],
      isManager: () => ["manager", "test-tenant", "is-manager"],
      overview: () => ["manager", "test-tenant", "overview"],
      team: () => ["manager", "test-tenant", "team"],
      directReports: () => ["manager", "test-tenant", "team", "direct-reports"],
      allSubordinates: (maxDepth?: number) => ["manager", "test-tenant", "all-subordinates", maxDepth],
      teamMember: (id: string) => ["manager", "test-tenant", "team-member", id],
      isSubordinate: (id: string) => ["manager", "test-tenant", "is-subordinate", id],
      approvals: () => ["manager", "test-tenant", "approvals"],
      pendingApprovals: (type?: string) => ["manager", "test-tenant", "approvals", "pending", type],
      teamAbsence: (start: string, end: string) => ["manager", "test-tenant", "team-absence", start, end],
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useIsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when user is a manager", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ isManager: true });

    const { useIsManager } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useIsManager(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isManager).toBe(true);
  });

  it("returns false when user is not a manager", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ isManager: false });

    const { useIsManager } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useIsManager(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isManager).toBe(false);
  });

  it("returns false when API call fails", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const { useIsManager } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useIsManager(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isManager).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});

describe("useTeamOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns team overview data when user is a manager", async () => {
    const { api } = await import("../../lib/api-client");
    const overviewData = {
      totalDirectReports: 5,
      totalSubordinates: 12,
      pendingApprovals: 3,
      teamOnLeave: 1,
      upcomingLeave: 2,
    };

    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/manager/is-manager")) return Promise.resolve({ isManager: true });
      if (url.includes("/manager/overview")) return Promise.resolve(overviewData);
      return Promise.resolve(null);
    });

    const { useTeamOverview } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useTeamOverview(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.overview).toBeDefined();
    });

    expect(result.current.overview?.totalDirectReports).toBe(5);
    expect(result.current.overview?.pendingApprovals).toBe(3);
  });
});

describe("useDirectReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns team members when user is a manager", async () => {
    const { api } = await import("../../lib/api-client");
    const teamData = [
      {
        employeeId: "emp-1",
        employeeNumber: "E001",
        firstName: "Alice",
        lastName: "Smith",
        displayName: "Alice Smith",
        email: "alice@test.com",
        jobTitle: "Developer",
        department: "Engineering",
        photoUrl: null,
        hireDate: "2023-01-01",
        status: "active",
      },
    ];

    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/manager/is-manager")) return Promise.resolve({ isManager: true });
      if (url.includes("/manager/team")) return Promise.resolve({ team: teamData });
      return Promise.resolve(null);
    });

    const { useDirectReports } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useDirectReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.team.length).toBeGreaterThan(0);
    });

    expect(result.current.team).toHaveLength(1);
    expect(result.current.team[0].firstName).toBe("Alice");
  });

  it("returns empty array when user is not a manager", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ isManager: false });

    const { useDirectReports } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useDirectReports(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.team).toEqual([]);
  });
});

describe("usePendingApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pending approvals", async () => {
    const { api } = await import("../../lib/api-client");
    const approvalsData = [
      {
        id: "a-1",
        type: "leave",
        title: "Annual Leave Request",
        description: null,
        requesterId: "emp-1",
        requesterName: "Bob Jones",
        requesterPhotoUrl: null,
        createdAt: "2024-01-10",
        dueDate: null,
        priority: "medium",
        metadata: {},
      },
    ];

    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/manager/is-manager")) return Promise.resolve({ isManager: true });
      if (url.includes("/manager/approvals")) return Promise.resolve({ approvals: approvalsData });
      return Promise.resolve(null);
    });

    const { usePendingApprovals } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => usePendingApprovals(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.approvals.length).toBeGreaterThan(0);
    });

    expect(result.current.approvals).toHaveLength(1);
    expect(result.current.approvals[0].type).toBe("leave");
  });

  it("returns empty array when no approvals", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isManager: true })
      .mockResolvedValueOnce({ approvals: [] });

    const { usePendingApprovals } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => usePendingApprovals(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.approvals).toEqual([]);
  });
});

describe("useApprovalActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides approve and reject functions", async () => {
    const { useApprovalActions } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useApprovalActions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.approve).toBeDefined();
    expect(result.current.reject).toBeDefined();
    expect(result.current.isApproving).toBe(false);
    expect(result.current.isRejecting).toBe(false);
  });

  it("calls approve API when approve is called", async () => {
    const { api } = await import("../../lib/api-client");
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { useApprovalActions } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useApprovalActions(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.approve({ id: "a-1", type: "leave" as const, comment: "Approved" });
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/manager/approvals/a-1/approve", {
        type: "leave",
        comment: "Approved",
      });
    });
  });

  it("calls reject API when reject is called", async () => {
    const { api } = await import("../../lib/api-client");
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { useApprovalActions } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useApprovalActions(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.reject({ id: "a-1", type: "leave" as const, comment: "Denied" });
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/manager/approvals/a-1/reject", {
        type: "leave",
        comment: "Denied",
      });
    });
  });
});

describe("useTeamAbsence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides entriesByDate and entriesByEmployee groupings", async () => {
    // useTeamAbsence depends on useIsManager, which in turn depends on
    // useSession. Both call api.get. We test the grouping logic by
    // verifying the useMemo outputs once both queries have resolved.
    const { api } = await import("../../lib/api-client");
    const absenceEntries = [
      {
        employeeId: "emp-1",
        employeeName: "Alice Smith",
        photoUrl: null,
        date: "2024-01-15",
        leaveType: "Annual",
        status: "approved",
        isHalfDay: false,
      },
      {
        employeeId: "emp-2",
        employeeName: "Bob Jones",
        photoUrl: null,
        date: "2024-01-15",
        leaveType: "Sick",
        status: "approved",
        isHalfDay: false,
      },
      {
        employeeId: "emp-1",
        employeeName: "Alice Smith",
        photoUrl: null,
        date: "2024-01-16",
        leaveType: "Annual",
        status: "approved",
        isHalfDay: false,
      },
    ];

    // Reset api.get to clear any leftover mockResolvedValueOnce from prior tests
    // (vi.clearAllMocks does not clear queued once-values).
    (api.get as ReturnType<typeof vi.fn>).mockReset();
    // Route responses by URL so both queries resolve correctly.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/manager/is-manager")) return Promise.resolve({ isManager: true });
      if (url.includes("/manager/absence")) return Promise.resolve({ entries: absenceEntries });
      return Promise.resolve(null);
    });

    const { useTeamAbsence } = await import("../../hooks/use-manager");

    // Create a query client and pre-seed the isManager query data so
    // the absence query's enabled condition is immediately true.
    // The query key must match what queryKeys.manager.isManager() returns.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    queryClient.setQueryData(["manager", "test-tenant", "is-manager"], true);

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useTeamAbsence("2024-01-01", "2024-01-31"), {
      wrapper,
    });

    await waitFor(
      () => {
        expect(result.current.entries.length).toBe(3);
      },
      { timeout: 3000 }
    );

    // Grouped by date
    expect(result.current.entriesByDate["2024-01-15"]).toHaveLength(2);
    expect(result.current.entriesByDate["2024-01-16"]).toHaveLength(1);

    // Grouped by employee
    expect(result.current.entriesByEmployee["emp-1"]).toHaveLength(2);
    expect(result.current.entriesByEmployee["emp-2"]).toHaveLength(1);
  });

  it("returns empty data when no entries", async () => {
    const { api } = await import("../../lib/api-client");
    (api.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isManager: true })
      .mockResolvedValueOnce({ entries: [] });

    const { useTeamAbsence } = await import("../../hooks/use-manager");
    const { result } = renderHook(() => useTeamAbsence("2024-01-01", "2024-01-31"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.entries).toEqual([]);
    expect(result.current.entriesByDate).toEqual({});
    expect(result.current.entriesByEmployee).toEqual({});
  });
});
