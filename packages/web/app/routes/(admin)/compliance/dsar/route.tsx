export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Shield,
  Plus,
  Search,
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
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
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types matching the backend DsarRequestResponseSchema (camelCase from DB)
// ---------------------------------------------------------------------------

interface DsarRequest {
  id: string;
  tenantId: string;
  employeeId: string;
  requestedByUserId: string;
  requestType: string;
  status: string;
  receivedDate: string;
  deadlineDate: string;
  extendedDeadlineDate: string | null;
  extensionReason: string | null;
  completedDate: string | null;
  responseFormat: string;
  identityVerified: boolean;
  identityVerifiedDate: string | null;
  identityVerifiedBy: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DsarListResponse {
  items: DsarRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface DsarDashboard {
  totalOpen: number;
  totalCompleted: number;
  totalRejected: number;
  totalOverdue: number;
  avgResponseDays: number | null;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Status / Type label + badge variant mappings
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  received: "secondary",
  in_progress: "info",
  data_gathering: "warning",
  review: "warning",
  completed: "success",
  rejected: "error",
  extended: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Pending Verification",
  in_progress: "In Progress",
  data_gathering: "Gathering Data",
  review: "Under Review",
  completed: "Completed",
  rejected: "Rejected",
  extended: "Extended",
};

const TYPE_LABELS: Record<string, string> = {
  access: "Access",
  rectification: "Rectification",
  erasure: "Erasure",
  portability: "Portability",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isOverdue(request: DsarRequest): boolean {
  if (request.status === "completed" || request.status === "rejected") {
    return false;
  }
  const deadline = request.extendedDeadlineDate ?? request.deadlineDate;
  return new Date(deadline) < new Date();
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

interface CreateDsarForm {
  employeeId: string;
  requestType: string;
  responseFormat: string;
  notes: string;
}

const initialForm: CreateDsarForm = {
  employeeId: "",
  requestType: "access",
  responseFormat: "json",
  notes: "",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ComplianceDsarPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateDsarForm>(initialForm);

  // Dashboard stats
  const { data: dashboard } = useQuery({
    queryKey: ["compliance-dsar-dashboard"],
    queryFn: () => api.get<DsarDashboard>("/dsar/requests/dashboard"),
  });

  // Request list
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-dsar-requests", search, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("request_type", typeFilter);
      params.set("limit", "50");
      return api.get<DsarListResponse>(`/dsar/requests?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/dsar/requests", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-dsar-requests"] });
      queryClient.invalidateQueries({
        queryKey: ["compliance-dsar-dashboard"],
      });
      toast.success("DSAR request created successfully");
      setShowCreateModal(false);
      setForm(initialForm);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to create DSAR request";
      toast.error(message);
    },
  });

  const handleCreate = () => {
    if (!form.employeeId.trim()) {
      toast.error("Employee ID is required");
      return;
    }
    createMutation.mutate({
      employee_id: form.employeeId.trim(),
      request_type: form.requestType,
      response_format: form.responseFormat,
      notes: form.notes.trim() || undefined,
    });
  };

  const requests = data?.items ?? [];

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: ColumnDef<DsarRequest>[] = [
    {
      id: "employeeId",
      header: "Subject",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.employeeId.slice(0, 8)}...
        </div>
      ),
    },
    {
      id: "requestType",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline">
          {TYPE_LABELS[row.requestType] ?? row.requestType}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const overdue = isOverdue(row);
        if (overdue) {
          return <Badge variant="destructive">Overdue</Badge>;
        }
        return (
          <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
            {STATUS_LABELS[row.status] ?? row.status}
          </Badge>
        );
      },
    },
    {
      id: "receivedDate",
      header: "Request Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.receivedDate)}
        </div>
      ),
    },
    {
      id: "deadlineDate",
      header: "Deadline",
      cell: ({ row }) => {
        const deadline = row.extendedDeadlineDate ?? row.deadlineDate;
        const overdue = isOverdue(row);
        return (
          <div
            className={
              overdue
                ? "text-sm font-medium text-red-600 dark:text-red-400"
                : "text-sm text-gray-600 dark:text-gray-400"
            }
          >
            {formatDate(deadline)}
          </div>
        );
      },
    },
    {
      id: "extended",
      header: "Extended",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.extendedDeadlineDate ? "Yes" : "No"}
        </span>
      ),
    },
    {
      id: "identityVerified",
      header: "Verified",
      cell: ({ row }) => (
        <Badge variant={row.identityVerified ? "success" : "secondary"}>
          {row.identityVerified ? "Yes" : "No"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/compliance"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Compliance
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Data Subject Requests (DSAR)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage UK GDPR data subject access and rights requests (Articles
            15-20).
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Open Requests"
          value={dashboard?.totalOpen ?? 0}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Completed"
          value={dashboard?.totalCompleted ?? 0}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Overdue"
          value={dashboard?.totalOverdue ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Rejected"
          value={dashboard?.totalRejected ?? 0}
          icon={<XCircle className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search DSAR requests..."
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
            { value: "received", label: "Pending Verification" },
            { value: "in_progress", label: "In Progress" },
            { value: "data_gathering", label: "Gathering Data" },
            { value: "review", label: "Under Review" },
            { value: "completed", label: "Completed" },
            { value: "rejected", label: "Rejected" },
            { value: "extended", label: "Extended" },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "access", label: "Access" },
            { value: "rectification", label: "Rectification" },
            { value: "erasure", label: "Erasure" },
            { value: "portability", label: "Portability" },
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
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No DSAR requests found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter || typeFilter
                  ? "Try adjusting your filters"
                  : "Data subject requests will appear here when submitted."}
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

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            if (!createMutation.isPending) {
              setShowCreateModal(false);
              setForm(initialForm);
            }
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">New DSAR Request</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Employee ID"
                placeholder="UUID of the data subject"
                required
                value={form.employeeId}
                onChange={(e) =>
                  setForm({ ...form, employeeId: e.target.value })
                }
                id="dsar-employee-id"
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Request Type"
                  value={form.requestType}
                  onChange={(e) =>
                    setForm({ ...form, requestType: e.target.value })
                  }
                  options={[
                    { value: "access", label: "Access (Article 15)" },
                    {
                      value: "rectification",
                      label: "Rectification (Article 16)",
                    },
                    { value: "erasure", label: "Erasure (Article 17)" },
                    {
                      value: "portability",
                      label: "Portability (Article 20)",
                    },
                  ]}
                  id="dsar-request-type"
                />
                <Select
                  label="Response Format"
                  value={form.responseFormat}
                  onChange={(e) =>
                    setForm({ ...form, responseFormat: e.target.value })
                  }
                  options={[
                    { value: "json", label: "JSON" },
                    { value: "csv", label: "CSV" },
                    { value: "pdf", label: "PDF" },
                  ]}
                  id="dsar-response-format"
                />
              </div>
              <Input
                label="Notes"
                placeholder="Additional notes about this request"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                id="dsar-notes"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setForm(initialForm);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.employeeId.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Request"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
