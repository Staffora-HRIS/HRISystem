export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  HardHat,
  Search,
  Plus,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
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

interface Incident {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  type: string;
  location: string;
  severity: string;
  status: string;
  description: string | null;
  reportedBy: string | null;
  riddorRef: string | null;
}

interface IncidentListResponse {
  items: Incident[];
  nextCursor: string | null;
  hasMore: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  accident: "Accident",
  near_miss: "Near Miss",
  riddor: "RIDDOR Reportable",
  dangerous_occurrence: "Dangerous Occurrence",
  occupational_disease: "Occupational Disease",
};

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
  accident: "error",
  near_miss: "warning",
  riddor: "destructive",
  dangerous_occurrence: "error",
  occupational_disease: "warning",
};

const SEVERITY_LABELS: Record<string, string> = {
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  fatal: "Fatal",
};

const SEVERITY_VARIANTS: Record<string, BadgeVariant> = {
  minor: "default",
  moderate: "warning",
  major: "error",
  fatal: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  reported: "Reported",
  under_investigation: "Under Investigation",
  action_required: "Action Required",
  closed: "Closed",
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  reported: "info",
  under_investigation: "warning",
  action_required: "error",
  closed: "secondary",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function HealthSafetyPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    type: "accident",
    severity: "minor",
    location: "",
    description: "",
    employeeId: "",
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/compliance/health-safety/incidents", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-health-safety"] });
      toast.success("Incident reported successfully");
      setShowCreateModal(false);
      setIncidentForm({ type: "accident", severity: "minor", location: "", description: "", employeeId: "" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to report incident";
      toast.error(message);
    },
  });

  const { data: incidentsData, isLoading } = useQuery({
    queryKey: [
      "compliance-health-safety",
      search,
      typeFilter,
      severityFilter,
      statusFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("type", typeFilter);
      if (severityFilter) params.set("severity", severityFilter);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<IncidentListResponse>(
        `/compliance/health-safety/incidents?${params}`
      );
    },
  });

  const incidents = incidentsData?.items ?? [];

  const stats = {
    total: incidents.length,
    open: incidents.filter(
      (i) => i.status !== "closed"
    ).length,
    riddor: incidents.filter((i) => i.type === "riddor").length,
    actionRequired: incidents.filter(
      (i) => i.status === "action_required"
    ).length,
  };

  const columns: ColumnDef<Incident>[] = [
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
          {formatDate(row.date)}
        </div>
      ),
    },
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {row.employeeName}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant={TYPE_VARIANTS[row.type] ?? "default"}>
          {TYPE_LABELS[row.type] || row.type}
        </Badge>
      ),
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.location}
        </div>
      ),
    },
    {
      id: "severity",
      header: "Severity",
      cell: ({ row }) => (
        <Badge variant={SEVERITY_VARIANTS[row.severity] ?? "default"}>
          {SEVERITY_LABELS[row.severity] || row.severity}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "riddorRef",
      header: "RIDDOR Ref",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.riddorRef || "-"}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link
            to="/admin/compliance"
            className="hover:text-gray-700 dark:hover:text-gray-300"
          >
            Compliance
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-white font-medium">
            Health & Safety
          </span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Health & Safety
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Workplace incidents, accidents, and RIDDOR reporting
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Report Incident
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Incidents"
          value={stats.total}
          icon={<HardHat className="h-5 w-5" />}
        />
        <StatCard
          title="Open Incidents"
          value={stats.open}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="RIDDOR Reports"
          value={stats.riddor}
          icon={<HardHat className="h-5 w-5" />}
        />
        <StatCard
          title="Action Required"
          value={stats.actionRequired}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "accident", label: "Accident" },
            { value: "near_miss", label: "Near Miss" },
            { value: "riddor", label: "RIDDOR Reportable" },
            { value: "dangerous_occurrence", label: "Dangerous Occurrence" },
            { value: "occupational_disease", label: "Occupational Disease" },
          ]}
        />
        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          options={[
            { value: "", label: "All Severities" },
            { value: "minor", label: "Minor" },
            { value: "moderate", label: "Moderate" },
            { value: "major", label: "Major" },
            { value: "fatal", label: "Fatal" },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "reported", label: "Reported" },
            { value: "under_investigation", label: "Under Investigation" },
            { value: "action_required", label: "Action Required" },
            { value: "closed", label: "Closed" },
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
          ) : incidents.length === 0 ? (
            <div className="text-center py-12">
              <HardHat className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No incidents recorded
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || typeFilter || severityFilter || statusFilter
                  ? "Try adjusting your filters"
                  : "No workplace incidents have been reported"}
              </p>
            </div>
          ) : (
            <DataTable
              data={incidents}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Incident Modal */}
      {showCreateModal && (
        <Modal open onClose={() => !createMutation.isPending && setShowCreateModal(false)}>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Incident</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="incident-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Incident Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="incident-type"
                  value={incidentForm.type}
                  onChange={(e) => setIncidentForm({ ...incidentForm, type: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="accident">Accident</option>
                  <option value="near_miss">Near Miss</option>
                  <option value="riddor">RIDDOR Reportable</option>
                  <option value="dangerous_occurrence">Dangerous Occurrence</option>
                  <option value="occupational_disease">Occupational Disease</option>
                </select>
              </div>
              <div>
                <label htmlFor="incident-severity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Severity <span className="text-red-500">*</span>
                </label>
                <select
                  id="incident-severity"
                  value={incidentForm.severity}
                  onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="minor">Minor</option>
                  <option value="moderate">Moderate</option>
                  <option value="major">Major</option>
                  <option value="fatal">Fatal</option>
                </select>
              </div>
              <div>
                <label htmlFor="incident-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Location <span className="text-red-500">*</span>
                </label>
                <Input
                  id="incident-location"
                  value={incidentForm.location}
                  onChange={(e) => setIncidentForm({ ...incidentForm, location: e.target.value })}
                  placeholder="e.g. Warehouse floor, Office B2"
                />
              </div>
              <div>
                <label htmlFor="incident-employee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Employee ID
                </label>
                <Input
                  id="incident-employee"
                  value={incidentForm.employeeId}
                  onChange={(e) => setIncidentForm({ ...incidentForm, employeeId: e.target.value })}
                  placeholder="Employee involved (if applicable)"
                />
              </div>
              <div>
                <label htmlFor="incident-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="incident-description"
                  rows={3}
                  value={incidentForm.description}
                  onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                  placeholder="Describe what happened..."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
                if (!incidentForm.location.trim() || !incidentForm.description.trim()) {
                  toast.error("Location and description are required");
                  return;
                }
                createMutation.mutate({
                  type: incidentForm.type,
                  severity: incidentForm.severity,
                  location: incidentForm.location.trim(),
                  description: incidentForm.description.trim(),
                  employeeId: incidentForm.employeeId.trim() || undefined,
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Reporting..." : "Report Incident"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
