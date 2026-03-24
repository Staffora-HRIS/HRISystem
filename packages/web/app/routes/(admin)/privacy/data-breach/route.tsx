export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { AlertOctagon, Search, ArrowLeft, Plus } from "lucide-react";
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

interface DataBreachRecord {
  id: string;
  dateDiscovered: string;
  severity: string;
  affectedCount: number;
  status: string;
  icoNotified: boolean;
  description: string;
}

interface DataBreachListResponse {
  items: DataBreachRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

const SEVERITY_VARIANTS: Record<string, BadgeVariant> = {
  low: "secondary",
  medium: "warning",
  high: "error",
  critical: "destructive",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  identified: "secondary",
  investigating: "warning",
  contained: "info",
  resolved: "success",
  closed: "default",
};

const STATUS_LABELS: Record<string, string> = {
  identified: "Identified",
  investigating: "Investigating",
  contained: "Contained",
  resolved: "Resolved",
  closed: "Closed",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DataBreachPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [breachForm, setBreachForm] = useState({
    severity: "medium",
    description: "",
    affectedCount: "",
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/data-breach/incidents", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["privacy-data-breach"] });
      toast.success("Breach reported successfully");
      setShowCreateModal(false);
      setBreachForm({ severity: "medium", description: "", affectedCount: "" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to report breach";
      toast.error(message);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["privacy-data-breach", search, statusFilter, severityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (severityFilter) params.set("severity", severityFilter);
      params.set("limit", "50");
      return api.get<DataBreachListResponse>(
        `/data-breach/incidents?${params}`
      );
    },
  });

  const records = data?.items ?? [];

  const columns: ColumnDef<DataBreachRecord>[] = [
    {
      id: "dateDiscovered",
      header: "Date Discovered",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.dateDiscovered)}
        </div>
      ),
    },
    {
      id: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-xs truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {row.description}
        </div>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <Badge variant={SEVERITY_VARIANTS[row.severity] ?? "default"}>
          {SEVERITY_LABELS[row.severity] ?? row.severity}
        </Badge>
      ),
    },
    {
      id: "affectedCount",
      header: "Affected",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.affectedCount.toLocaleString()}
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
      id: "icoNotified",
      header: "ICO Notified",
      cell: ({ row }) => (
        <Badge variant={row.icoNotified ? "success" : "secondary"}>
          {row.icoNotified ? "Yes" : "No"}
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
            to="/admin/privacy"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Privacy & GDPR
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Data Breach Notifications
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Log and manage data breach incidents with ICO notification tracking.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Breach
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search breaches..."
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
            { value: "identified", label: "Identified" },
            { value: "investigating", label: "Investigating" },
            { value: "contained", label: "Contained" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          options={[
            { value: "", label: "All Severities" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
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
          ) : records.length === 0 ? (
            <div className="text-center py-12">
              <AlertOctagon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No breach records found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter || severityFilter
                  ? "Try adjusting your filters"
                  : "Data breach incidents will be logged here."}
              </p>
            </div>
          ) : (
            <DataTable
              data={records}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {showCreateModal && (
        <Modal open onClose={() => !createMutation.isPending && setShowCreateModal(false)}>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Data Breach</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="breach-severity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Severity <span className="text-red-500">*</span>
                </label>
                <select
                  id="breach-severity"
                  value={breachForm.severity}
                  onChange={(e) => setBreachForm({ ...breachForm, severity: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label htmlFor="breach-affected" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Number of Individuals Affected
                </label>
                <Input
                  id="breach-affected"
                  type="number"
                  min="0"
                  value={breachForm.affectedCount}
                  onChange={(e) => setBreachForm({ ...breachForm, affectedCount: e.target.value })}
                  placeholder="Estimated number"
                />
              </div>
              <div>
                <label htmlFor="breach-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <Textarea
                  id="breach-description"
                  rows={3}
                  value={breachForm.description}
                  onChange={(e) => setBreachForm({ ...breachForm, description: e.target.value })}
                  placeholder="Describe the breach..."
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
                if (!breachForm.description.trim()) {
                  toast.error("Description is required");
                  return;
                }
                createMutation.mutate({
                  severity: breachForm.severity,
                  description: breachForm.description.trim(),
                  affectedCount: breachForm.affectedCount ? Number(breachForm.affectedCount) : 0,
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Reporting..." : "Report Breach"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
