export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { UserX, Search, ArrowLeft, Plus } from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface ErasureRequest {
  id: string;
  requestDate: string;
  employeeName: string;
  reason: string;
  status: string;
  scheduledDate: string | null;
}

interface ErasureListResponse {
  items: ErasureRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  pending: "secondary",
  approved: "info",
  in_progress: "warning",
  completed: "success",
  rejected: "error",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DataErasurePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [requestForm, setRequestForm] = useState({
    employeeId: "",
    reason: "",
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/data-erasure/requests", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacy-data-erasure"] });
      toast.success("Erasure request created successfully");
      setShowCreateModal(false);
      setRequestForm({ employeeId: "", reason: "" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to create erasure request";
      toast.error(message);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["privacy-data-erasure", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<ErasureListResponse>(
        `/data-erasure/requests?${params}`
      );
    },
  });

  const requests = data?.items ?? [];

  const columns: ColumnDef<ErasureRequest>[] = [
    {
      id: "requestDate",
      header: "Request Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.requestDate)}
        </div>
      ),
    },
    {
      id: "employeeName",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.employeeName}
        </div>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <div className="max-w-xs truncate text-sm text-gray-600 dark:text-gray-400">
          {row.reason}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      id: "scheduledDate",
      header: "Scheduled Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.scheduledDate)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/privacy"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Privacy & GDPR
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Data Erasure
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Process and track right-to-be-forgotten requests.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee..."
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
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </div>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <UserX className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No erasure requests found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Data erasure requests will appear here when submitted."}
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

      {showCreateModal && (
        <Modal open onClose={() => !createMutation.isPending && setShowCreateModal(false)}>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Erasure Request</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="erasure-employee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee ID <span className="text-red-500">*</span>
                </label>
                <Input
                  id="erasure-employee"
                  value={requestForm.employeeId}
                  onChange={(e) => setRequestForm({ ...requestForm, employeeId: e.target.value })}
                  placeholder="Enter employee ID"
                />
              </div>
              <div>
                <label htmlFor="erasure-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="erasure-reason"
                  rows={3}
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                  placeholder="Reason for data erasure request..."
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!requestForm.employeeId.trim() || !requestForm.reason.trim()) {
                  toast.error("Employee ID and reason are required");
                  return;
                }
                createMutation.mutate({
                  employeeId: requestForm.employeeId.trim(),
                  reason: requestForm.reason.trim(),
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
