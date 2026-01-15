import { useQuery } from "@tanstack/react-query";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { api, ApiError } from "~/lib/api-client";

type Approval =
  | {
      id: string;
      type: "leave_request";
      employeeId: string;
      employeeName: string;
      details: {
        leaveType: string;
        startDate: string;
        endDate: string;
        totalDays: number;
        reason?: string | null;
      };
      createdAt: string;
    }
  | {
      id: string;
      type: "timesheet";
      employeeId: string;
      employeeName: string;
      details: {
        periodStart: string;
        periodEnd: string;
        totalHours: number;
      };
      createdAt: string;
    };

type ApprovalsResponse = {
  approvals: Approval[];
  count: number;
};

export default function ManagerApprovalsPage() {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portal", "approvals"],
    queryFn: () => api.get<ApprovalsResponse>("/portal/approvals"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to load approvals.";

    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-gray-500">{message}</p>
      </div>
    );
  }

  const leave = data.approvals.filter((a) => a.type === "leave_request").length;
  const timesheets = data.approvals.filter((a) => a.type === "timesheet").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-gray-500">Pending approvals assigned to you</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total pending" value={String(data.count)} />
        <StatCard title="Leave requests" value={String(leave)} />
        <StatCard title="Timesheets" value={String(timesheets)} />
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="font-medium">Queue</div>
          {data.approvals.length === 0 ? (
            <div className="text-sm text-gray-600">No pending approvals.</div>
          ) : (
            <div className="space-y-2">
              {data.approvals.map((a) => (
                <div key={`${a.type}:${a.id}`} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {a.type === "leave_request" ? "Leave request" : "Timesheet"} · {a.employeeName}
                      </div>
                      {a.type === "leave_request" ? (
                        <div className="text-sm text-gray-500">
                          {a.details.leaveType} · {new Date(a.details.startDate).toLocaleDateString()} –{" "}
                          {new Date(a.details.endDate).toLocaleDateString()} · {a.details.totalDays} day(s)
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          {new Date(a.details.periodStart).toLocaleDateString()} –{" "}
                          {new Date(a.details.periodEnd).toLocaleDateString()} · {a.details.totalHours} hours
                        </div>
                      )}
                      <div className="text-xs text-gray-400">Created {new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-sm text-gray-500 shrink-0">{a.type.replace("_", " ")}</div>
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
