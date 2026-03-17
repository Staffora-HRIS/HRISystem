export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Check,
  X,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  DataTable,
  type ColumnDef,
  Select,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  totalDays: number;
  status: string;
  reason: string | null;
  contactInfo: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeaveRequestListResponse {
  items: LeaveRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  draft: "secondary",
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "default",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

export default function AdminLeaveRequestsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "reject";
    requestId: string;
  } | null>(null);

  // Fetch leave requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["admin-leave-requests", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const qs = new URLSearchParams(params).toString();
      return api.get<LeaveRequestListResponse>(
        `/absence/requests${qs ? `?${qs}` : ""}`
      );
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/absence/requests/${id}/approve`, { action: "approve" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-requests"] });
      toast.success("Leave request approved");
      setConfirmAction(null);
    },
    onError: () => {
      toast.error("Failed to approve leave request", {
        message: "Please try again.",
      });
      setConfirmAction(null);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/absence/requests/${id}/approve`, { action: "reject" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-requests"] });
      toast.success("Leave request rejected");
      setConfirmAction(null);
    },
    onError: () => {
      toast.error("Failed to reject leave request", {
        message: "Please try again.",
      });
      setConfirmAction(null);
    },
  });

  const requests = requestsData?.items ?? [];

  // Calculate stats
  const { totalRequests, pendingRequests, approvedRequests, rejectedRequests } = useMemo(() => ({
    totalRequests: requests.length,
    pendingRequests: requests.filter((r) => r.status === "pending").length,
    approvedRequests: requests.filter((r) => r.status === "approved").length,
    rejectedRequests: requests.filter((r) => r.status === "rejected").length,
  }), [requests]);

  const columns = useMemo<ColumnDef<LeaveRequest>[]>(() => [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="text-sm font-medium text-gray-900">
          {row.employeeId.slice(0, 8)}...
        </div>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          <span>{formatDateShort(row.startDate)}</span>
          <span className="mx-1 text-gray-400">-</span>
          <span>{formatDateShort(row.endDate)}</span>
        </div>
      ),
    },
    {
      id: "days",
      header: "Days",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.totalDays}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 line-clamp-1">
          {row.reason || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            (STATUS_BADGE_VARIANTS[row.status] as
              | "secondary"
              | "warning"
              | "success"
              | "error"
              | "default") ?? "default"
          }
          dot
          rounded
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "submitted",
      header: "Submitted",
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {formatDate(row.submittedAt || row.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        if (row.status !== "pending") return null;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmAction({
                  type: "approve",
                  requestId: row.id,
                });
              }}
              aria-label="Approve leave request"
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmAction({
                  type: "reject",
                  requestId: row.id,
                });
              }}
              aria-label="Reject leave request"
            >
              <X className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        );
      },
    },
  ], [setConfirmAction]);

  const isActionPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-gray-600">
            Review and manage employee leave requests
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Requests</p>
              <p className="text-2xl font-bold">{totalRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{pendingRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-2xl font-bold">{approvedRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Rejected</p>
              <p className="text-2xl font-bold">{rejectedRequests}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "draft", label: "Draft" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      {/* Leave Requests Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No leave requests found
              </h3>
              <p className="text-gray-500 mb-4">
                {statusFilter
                  ? "Try adjusting your filters"
                  : "No leave requests have been submitted yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={requests}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Approve/Reject Confirmation Modal */}
      {confirmAction && (
        <Modal open onClose={() => setConfirmAction(null)} size="sm">
          <ModalHeader>
            <h3 className="text-lg font-semibold">
              {confirmAction.type === "approve"
                ? "Approve Leave Request"
                : "Reject Leave Request"}
            </h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-gray-600">
              {confirmAction.type === "approve"
                ? "Are you sure you want to approve this leave request?"
                : "Are you sure you want to reject this leave request? The employee will be notified."}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={isActionPending}
            >
              Cancel
            </Button>
            {confirmAction.type === "approve" ? (
              <Button
                onClick={() =>
                  approveMutation.mutate(confirmAction.requestId)
                }
                disabled={isActionPending}
              >
                {approveMutation.isPending ? "Approving..." : "Approve"}
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() =>
                  rejectMutation.mutate(confirmAction.requestId)
                }
                disabled={isActionPending}
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject"}
              </Button>
            )}
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
