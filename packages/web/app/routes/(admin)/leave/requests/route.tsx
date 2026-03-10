import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
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
  Input,
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
  employee_id: string;
  employee_name: string | null;
  leave_type_id: string;
  leave_type_name: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  reason: string | null;
  reviewer_name: string | null;
  created_at: string;
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
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function AdminLeaveRequestsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "reject";
    requestId: string;
    employeeName: string | null;
  } | null>(null);

  // Fetch leave requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["admin-leave-requests", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<LeaveRequestListResponse>(`/absence/requests?${params}`);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/absence/requests/${id}/approve`, { action: "approve" }),
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
    mutationFn: (id: string) => api.post(`/absence/requests/${id}/approve`, { action: "reject" }),
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
  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const approvedRequests = requests.filter(
    (r) => r.status === "approved"
  ).length;
  const rejectedRequests = requests.filter(
    (r) => r.status === "rejected"
  ).length;

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employee_name || "")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {initials || "?"}
            </div>
            <div className="font-medium text-gray-900">
              {row.employee_name || "Unknown"}
            </div>
          </div>
        );
      },
    },
    {
      id: "leave_type",
      header: "Leave Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.leave_type_name || "-"}
        </span>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          <span>{formatDateShort(row.start_date)}</span>
          <span className="mx-1 text-gray-400">-</span>
          <span>{formatDateShort(row.end_date)}</span>
        </div>
      ),
    },
    {
      id: "days",
      header: "Days",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.days_requested}
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
          {formatDate(row.created_at)}
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
                  employeeName: row.employee_name,
                });
              }}
              aria-label={`Approve leave request for ${row.employee_name || "employee"}`}
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
                  employeeName: row.employee_name,
                });
              }}
              aria-label={`Reject leave request for ${row.employee_name || "employee"}`}
            >
              <X className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        );
      },
    },
  ];

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
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
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
                {search || statusFilter
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
              {confirmAction.type === "approve" ? (
                <>
                  Are you sure you want to approve the leave request from{" "}
                  <span className="font-medium text-gray-900">
                    {confirmAction.employeeName || "this employee"}
                  </span>
                  ?
                </>
              ) : (
                <>
                  Are you sure you want to reject the leave request from{" "}
                  <span className="font-medium text-gray-900">
                    {confirmAction.employeeName || "this employee"}
                  </span>
                  ? The employee will be notified.
                </>
              )}
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
