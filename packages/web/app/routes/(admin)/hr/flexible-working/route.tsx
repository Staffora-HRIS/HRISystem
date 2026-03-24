export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Clock,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  type BadgeVariant,
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
import { api, ApiError } from "~/lib/api-client";

interface FlexibleWorkingRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  requestType: string;
  status: string;
  submittedDate: string;
  decisionDate: string | null;
  reason: string | null;
}

interface FlexibleWorkingListResponse {
  items: FlexibleWorkingRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  submitted: "info",
  under_review: "warning",
  approved: "success",
  denied: "error",
  withdrawn: "default",
  trial_period: "primary",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
  trial_period: "Trial Period",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  reduced_hours: "Reduced Hours",
  compressed_hours: "Compressed Hours",
  flexitime: "Flexitime",
  remote_working: "Remote Working",
  hybrid: "Hybrid Working",
  job_share: "Job Share",
  staggered_hours: "Staggered Hours",
  annualised_hours: "Annualised Hours",
  other: "Other",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FlexibleWorkingPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formRequestType, setFormRequestType] = useState("");
  const [formReason, setFormReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-flexible-working", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<FlexibleWorkingListResponse>(`/flexible-working/requests?${params}`);
    },
  });

  const requests = data?.items ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: {
      employeeId: string;
      requestType: string;
      reason: string;
    }) => api.post("/flexible-working/requests", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-hr-flexible-working"],
      });
      toast.success("Flexible working request created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to create flexible working request";
      toast.error(message);
    },
  });

  function resetForm() {
    setFormEmployeeId("");
    setFormRequestType("");
    setFormReason("");
  }

  function handleCreate() {
    const trimmedEmployeeId = formEmployeeId.trim();
    const trimmedReason = formReason.trim();

    if (!trimmedEmployeeId) {
      toast.error("Employee ID is required");
      return;
    }
    if (!formRequestType) {
      toast.error("Request type is required");
      return;
    }
    if (!trimmedReason) {
      toast.error("Reason is required");
      return;
    }

    createMutation.mutate({
      employeeId: trimmedEmployeeId,
      requestType: formRequestType,
      reason: trimmedReason,
    });
  }

  function handleCloseModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  const columns: ColumnDef<FlexibleWorkingRequest>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employeeName || "")
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
            <div>
              <div className="font-medium text-gray-900">{row.employeeName}</div>
              <div className="text-sm text-gray-500">{row.employeeNumber}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "requestType",
      header: "Request Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">
          {REQUEST_TYPE_LABELS[row.requestType] || row.requestType}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "submittedDate",
      header: "Submitted Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.submittedDate)}</span>
      ),
    },
    {
      id: "decisionDate",
      header: "Decision Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.decisionDate)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/hr"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to HR
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flexible Working Requests</h1>
            <p className="text-gray-600">Manage employee flexible working arrangements</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search employees..."
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
            { value: "submitted", label: "Submitted" },
            { value: "under_review", label: "Under Review" },
            { value: "approved", label: "Approved" },
            { value: "denied", label: "Denied" },
            { value: "withdrawn", label: "Withdrawn" },
            { value: "trial_period", label: "Trial Period" },
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
              <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No requests found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No flexible working requests submitted"}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Request
                </Button>
              )}
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

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={handleCloseModal} size="lg">
        <ModalHeader title="New Flexible Working Request" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Employee ID"
              placeholder="Enter employee ID"
              value={formEmployeeId}
              onChange={(e) => setFormEmployeeId(e.target.value)}
              required
              id="fw-employee-id"
            />
            <Select
              label="Request Type"
              value={formRequestType}
              onChange={(e) => setFormRequestType(e.target.value)}
              options={Object.entries(REQUEST_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              placeholder="Select request type"
              required
              id="fw-request-type"
            />
            <div>
              <label
                htmlFor="fw-reason"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="fw-reason"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={4}
                placeholder="Explain the reason for this flexible working request"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                required
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseModal}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !formEmployeeId.trim() ||
              !formRequestType ||
              !formReason.trim() ||
              createMutation.isPending
            }
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
