import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  FileText,
  Filter,
} from "lucide-react";
import { Card, CardBody, StatCard } from "~/components/ui/card";
import { Spinner } from "~/components/ui/spinner";
import { Button, Badge, toast } from "~/components/ui";
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
  const [filter, setFilter] = useState<"all" | "leave_request" | "timesheet">("all");
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["portal", "approvals"],
    queryFn: () => api.get<ApprovalsResponse>("/portal/approvals"),
  });

  const approveMutation = useMutation({
    mutationFn: (params: { type: string; id: string }) => {
      if (params.type === "leave_request") {
        return api.post(`/absence/requests/${params.id}/approve`, {});
      }
      return api.post(`/time/timesheets/${params.id}/approve`, {});
    },
    onSuccess: () => {
      toast.success("Approved successfully");
      queryClient.invalidateQueries({ queryKey: ["portal", "approvals"] });
    },
    onError: () => {
      toast.error("Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (params: { type: string; id: string }) => {
      if (params.type === "leave_request") {
        return api.post(`/absence/requests/${params.id}/reject`, { reason: "Rejected by manager" });
      }
      return api.post(`/time/timesheets/${params.id}/reject`, { reason: "Rejected by manager" });
    },
    onSuccess: () => {
      toast.success("Rejected successfully");
      queryClient.invalidateQueries({ queryKey: ["portal", "approvals"] });
    },
    onError: () => {
      toast.error("Failed to reject");
    },
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

  const filteredApprovals = filter === "all"
    ? data.approvals
    : data.approvals.filter((a) => a.type === filter);

  const handleApprove = (type: string, id: string) => {
    approveMutation.mutate({ type, id });
  };

  const handleReject = (type: string, id: string) => {
    rejectMutation.mutate({ type, id });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
        <p className="text-gray-600">Pending approvals assigned to you</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Pending"
          value={String(data.count)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Leave Requests"
          value={String(leave)}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Timesheets"
          value={String(timesheets)}
          icon={<FileText className="h-5 w-5" />}
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-500" />
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All ({data.count})
          </Button>
          <Button
            variant={filter === "leave_request" ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter("leave_request")}
          >
            Leave ({leave})
          </Button>
          <Button
            variant={filter === "timesheet" ? "primary" : "outline"}
            size="sm"
            onClick={() => setFilter("timesheet")}
          >
            Timesheets ({timesheets})
          </Button>
        </div>
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {filteredApprovals.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
              <p className="text-gray-500">No pending approvals in this category.</p>
            </CardBody>
          </Card>
        ) : (
          filteredApprovals.map((a) => (
            <Card key={`${a.type}:${a.id}`} className="hover:shadow-md transition-shadow">
              <CardBody>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900">{a.employeeName}</span>
                      <Badge variant={a.type === "leave_request" ? "info" : "secondary"}>
                        {a.type === "leave_request" ? "Leave Request" : "Timesheet"}
                      </Badge>
                    </div>
                    {a.type === "leave_request" ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge variant="outline">{a.details.leaveType}</Badge>
                          <span className="text-gray-600">
                            {new Date(a.details.startDate).toLocaleDateString()} –{" "}
                            {new Date(a.details.endDate).toLocaleDateString()}
                          </span>
                          <span className="text-gray-500">({a.details.totalDays} days)</span>
                        </div>
                        {a.details.reason && (
                          <p className="text-sm text-gray-600">Reason: {a.details.reason}</p>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">
                        Period: {new Date(a.details.periodStart).toLocaleDateString()} –{" "}
                        {new Date(a.details.periodEnd).toLocaleDateString()} · {a.details.totalHours} hours
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-2">
                      Submitted {new Date(a.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReject(a.type, a.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleApprove(a.type, a.id)}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
