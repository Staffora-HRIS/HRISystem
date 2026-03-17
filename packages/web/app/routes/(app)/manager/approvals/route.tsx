import { useState, useCallback } from "react";
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
import { Button, Badge, Checkbox, toast } from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import {
  useBulkApprovalActions,
  type BulkApprovalItem,
  type BulkApprovalResult,
} from "~/hooks/use-manager";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const { bulkAction, isPending: isBulkPending } = useBulkApprovalActions();

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
        return api.post(`/absence/requests/${params.id}/approve`, { action: "approve" });
      }
      return api.post(`/time/timesheets/${params.id}/approve`, { action: "approve" });
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
        return api.post(`/absence/requests/${params.id}/approve`, { action: "reject", comments: "Rejected by manager" });
      }
      return api.post(`/time/timesheets/${params.id}/approve`, { action: "reject", comments: "Rejected by manager" });
    },
    onSuccess: () => {
      toast.success("Rejected successfully");
      queryClient.invalidateQueries({ queryKey: ["portal", "approvals"] });
    },
    onError: () => {
      toast.error("Failed to reject");
    },
  });

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (approvals: Approval[]) => {
      setSelectedIds((prev) => {
        const allIds = approvals.map((a) => a.id);
        const allSelected = allIds.every((id) => prev.has(id));
        if (allSelected) {
          return new Set();
        }
        return new Set(allIds);
      });
    },
    []
  );

  const handleBulkAction = useCallback(
    async (action: "approve" | "reject") => {
      if (!data || selectedIds.size === 0) return;

      const items: BulkApprovalItem[] = data.approvals
        .filter((a) => selectedIds.has(a.id))
        .map((a) => ({
          type: a.type,
          id: a.id,
          action,
        }));

      try {
        const result: BulkApprovalResult = await bulkAction(items);
        const approvedCount = result.approved.length;
        const failedCount = result.failed.length;

        if (failedCount === 0) {
          toast.success(
            `${approvedCount} item${approvedCount !== 1 ? "s" : ""} ${action === "approve" ? "approved" : "rejected"} successfully`
          );
        } else if (approvedCount === 0) {
          toast.error(
            `All ${failedCount} item${failedCount !== 1 ? "s" : ""} failed to ${action}`
          );
        } else {
          toast.warning(
            `${approvedCount} ${action === "approve" ? "approved" : "rejected"}, ${failedCount} failed`
          );
        }

        setSelectedIds(new Set());
        queryClient.invalidateQueries({ queryKey: ["portal", "approvals"] });
      } catch {
        toast.error(`Failed to ${action} selected items`);
      }
    },
    [data, selectedIds, bulkAction, queryClient]
  );

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

  const selectedCount = filteredApprovals.filter((a) => selectedIds.has(a.id)).length;
  const allFilteredSelected =
    filteredApprovals.length > 0 &&
    filteredApprovals.every((a) => selectedIds.has(a.id));

  const handleApprove = (type: string, id: string) => {
    approveMutation.mutate({ type, id });
  };

  const handleReject = (type: string, id: string) => {
    rejectMutation.mutate({ type, id });
  };

  const anyMutationPending =
    approveMutation.isPending || rejectMutation.isPending || isBulkPending;

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
      <div className="flex items-center justify-between flex-wrap gap-4">
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

        {/* Bulk Action Bar */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-blue-800">
              {selectedCount} selected
            </span>
            <Button
              size="sm"
              onClick={() => handleBulkAction("approve")}
              disabled={anyMutationPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Bulk Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction("reject")}
              disabled={anyMutationPending}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Bulk Reject
            </Button>
          </div>
        )}
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
          <>
            {/* Select All */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={allFilteredSelected}
                onChange={() => toggleSelectAll(filteredApprovals)}
                aria-label="Select all approvals"
              />
              <span className="text-sm text-gray-600">
                Select all ({filteredApprovals.length})
              </span>
            </div>

            {filteredApprovals.map((a) => (
              <Card key={`${a.type}:${a.id}`} className={`hover:shadow-md transition-shadow ${selectedIds.has(a.id) ? "ring-2 ring-blue-300 bg-blue-50/30" : ""}`}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div className="pt-1 shrink-0">
                      <Checkbox
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelection(a.id)}
                        aria-label={`Select approval from ${a.employeeName}`}
                      />
                    </div>
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
                        disabled={anyMutationPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(a.type, a.id)}
                        disabled={anyMutationPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
