import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type PortalMeResponse = {
  user: { id: string; email: string; firstName?: string | null; lastName?: string | null };
  employee: { id: string; firstName: string; lastName: string } | null;
  tenant: { id: string; name: string };
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
};

type LeaveRequestsResponse = {
  items: LeaveRequest[];
  cursor: string | null;
  hasMore: boolean;
};

export default function MyLeavePage() {
  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => api.get<PortalMeResponse>("/portal/me"),
  });

  const employeeId = me?.employee?.id ?? null;

  const {
    data: requests,
    isLoading: requestsLoading,
    error: requestsError,
  } = useQuery({
    queryKey: ["absence", "requests", { employeeId }],
    enabled: Boolean(employeeId),
    queryFn: () =>
      api.get<LeaveRequestsResponse>("/absence/requests", {
        params: { employeeId: employeeId as string, limit: 20 },
      }),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return false;
      return failureCount < 2;
    },
  });

  if (meLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!me) {
    const message =
      meError instanceof ApiError
        ? meError.message
        : meError instanceof Error
          ? meError.message
          : "Unable to load your profile.";
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Leave</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  if (!me.employee) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">My Leave</h1>
        <p className="text-gray-500">No employee profile is linked to your account.</p>
      </div>
    );
  }

  const items = requests?.items ?? [];
  const pending = items.filter((r) => r.status === "pending").length;
  const approved = items.filter((r) => r.status === "approved").length;

  const requestsMessage = (() => {
    if (!requestsError) return null;
    if (requestsError instanceof ApiError && requestsError.status === 403) {
      return "You don’t have access to self-service leave requests yet.";
    }
    if (requestsError instanceof ApiError && requestsError.status === 401) {
      return "Please sign in again to view leave requests.";
    }
    return requestsError instanceof Error ? requestsError.message : "Unable to load leave requests.";
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Leave</h1>
        <p className="text-gray-500">
          {me.employee.firstName} {me.employee.lastName}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Requests (last 20)" value={String(items.length)} />
        <StatCard title="Pending" value={String(pending)} />
        <StatCard title="Approved" value={String(approved)} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Recent requests</div>
          {requestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : requestsMessage ? (
            <div className="text-sm text-gray-600">{requestsMessage}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-600">No leave requests found.</div>
          ) : (
            <div className="space-y-2">
              {items.map((r) => (
                <div key={r.id} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.status.replace("_", " ")}</div>
                    <div className="text-sm text-gray-500">{r.totalDays} day(s)</div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
