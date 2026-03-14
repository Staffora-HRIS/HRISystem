export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  AlertOctagon,
  Plus,
  Search,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
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
  Textarea,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types matching backend BreachResponseSchema (snake_case from backend)
// ---------------------------------------------------------------------------

interface BreachRecord {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  discovery_date: string;
  detected_by: string;
  severity: string;
  status: string;
  breach_category: string | null;
  breach_type: string | null;
  nature_of_breach: string | null;
  data_categories_affected: string[] | null;
  estimated_individuals_affected: number | null;
  likely_consequences: string | null;
  measures_taken: string | null;
  containment_actions: string | null;
  root_cause: string | null;
  risk_to_individuals: boolean | null;
  high_risk_to_individuals: boolean | null;
  ico_notification_required: boolean | null;
  subject_notification_required: boolean | null;
  assessment_notes: string | null;
  assessed_at: string | null;
  ico_notified: boolean;
  ico_notification_date: string | null;
  ico_reference: string | null;
  ico_deadline: string | null;
  ico_notified_within_72h: boolean | null;
  dpo_name: string | null;
  dpo_email: string | null;
  dpo_phone: string | null;
  individuals_notified: boolean;
  subject_notification_method: string | null;
  subjects_notified_count: number | null;
  subject_notification_content: string | null;
  subjects_notification_date: string | null;
  lessons_learned: string | null;
  remediation_plan: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  is_overdue: boolean;
  hours_remaining: number | null;
  created_at: string;
  updated_at: string;
}

interface BreachListResponse {
  items: BreachRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

interface BreachDashboard {
  open_breaches: number;
  overdue_ico_notifications: number;
  pending_ico_notifications: number;
  pending_subject_notifications: number;
  recently_closed: number;
  by_severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  by_status: Record<string, number>;
  avg_hours_to_ico_notification: number | null;
}

// ---------------------------------------------------------------------------
// Status / Severity label + badge variant mappings
// ---------------------------------------------------------------------------

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
  reported: "secondary",
  assessing: "warning",
  ico_notified: "info",
  subjects_notified: "info",
  remediation_only: "outline",
  closed: "success",
  // Legacy statuses
  detected: "secondary",
  investigating: "warning",
  contained: "info",
  notified_ico: "info",
  notified_individuals: "info",
  resolved: "success",
};

const STATUS_LABELS: Record<string, string> = {
  reported: "Reported",
  assessing: "Assessing",
  ico_notified: "ICO Notified",
  subjects_notified: "Subjects Notified",
  remediation_only: "Remediation Only",
  closed: "Closed",
  detected: "Detected",
  investigating: "Investigating",
  contained: "Contained",
  notified_ico: "ICO Notified",
  notified_individuals: "Individuals Notified",
  resolved: "Resolved",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Report Breach form
// ---------------------------------------------------------------------------

interface ReportBreachForm {
  title: string;
  description: string;
  discoveryDate: string;
  breachCategory: string;
  natureOfBreach: string;
  severity: string;
}

const initialForm: ReportBreachForm = {
  title: "",
  description: "",
  discoveryDate: new Date().toISOString().slice(0, 16),
  breachCategory: "confidentiality",
  natureOfBreach: "",
  severity: "medium",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ComplianceDataBreachPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showReportModal, setShowReportModal] = useState(false);
  const [form, setForm] = useState<ReportBreachForm>(initialForm);

  // Dashboard stats
  const { data: dashboard } = useQuery({
    queryKey: ["compliance-data-breach-dashboard"],
    queryFn: () => api.get<BreachDashboard>("/data-breach/dashboard"),
  });

  // Breach list
  const { data, isLoading } = useQuery({
    queryKey: [
      "compliance-data-breach-incidents",
      search,
      statusFilter,
      severityFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (severityFilter) params.set("severity", severityFilter);
      params.set("limit", "50");
      return api.get<BreachListResponse>(
        `/data-breach/incidents?${params}`
      );
    },
  });

  const reportMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/data-breach/incidents", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-data-breach-incidents"],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-data-breach-dashboard"],
      });
      toast.success("Data breach reported successfully");
      setShowReportModal(false);
      setForm(initialForm);
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to report data breach";
      toast.error(message);
    },
  });

  const handleReport = () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.natureOfBreach.trim()) {
      toast.error("Nature of breach is required");
      return;
    }
    reportMutation.mutate({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      discovery_date: new Date(form.discoveryDate).toISOString(),
      breach_category: form.breachCategory,
      nature_of_breach: form.natureOfBreach.trim(),
      severity: form.severity,
    });
  };

  const breaches = data?.items ?? [];

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: ColumnDef<BreachRecord>[] = [
    {
      id: "title",
      header: "Description",
      cell: ({ row }) => (
        <div className="max-w-xs truncate font-medium text-gray-900 dark:text-gray-100">
          {row.title}
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
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      id: "discoveryDate",
      header: "Discovery Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateTime(row.discovery_date)}
        </div>
      ),
    },
    {
      id: "icoDeadline",
      header: "ICO Deadline",
      cell: ({ row }) => {
        const overdue = row.is_overdue && !row.ico_notified;
        return (
          <div
            className={
              overdue
                ? "text-sm font-medium text-red-600 dark:text-red-400"
                : "text-sm text-gray-600 dark:text-gray-400"
            }
          >
            {row.ico_deadline ? formatDateTime(row.ico_deadline) : "-"}
            {overdue && (
              <span className="ml-1 text-xs">(OVERDUE)</span>
            )}
          </div>
        );
      },
    },
    {
      id: "icoNotified",
      header: "ICO Notified",
      cell: ({ row }) => (
        <Badge variant={row.ico_notified ? "success" : "secondary"}>
          {row.ico_notified ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      id: "affected",
      header: "Affected",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.estimated_individuals_affected != null
            ? row.estimated_individuals_affected.toLocaleString()
            : "-"}
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
            to="/admin/compliance"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Compliance
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Data Breach Tracking
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Log and manage data breach incidents with ICO notification tracking
            (UK GDPR Articles 33-34).
          </p>
        </div>
        <Button onClick={() => setShowReportModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Report Breach
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Open Breaches"
          value={dashboard?.open_breaches ?? 0}
          icon={<AlertOctagon className="h-5 w-5" />}
        />
        <StatCard
          title="Overdue ICO Notifications"
          value={dashboard?.overdue_ico_notifications ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Closed This Month"
          value={dashboard?.recently_closed ?? 0}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending ICO Notification"
          value={dashboard?.pending_ico_notifications ?? 0}
          icon={<Clock className="h-5 w-5" />}
        />
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
            { value: "reported", label: "Reported" },
            { value: "assessing", label: "Assessing" },
            { value: "ico_notified", label: "ICO Notified" },
            { value: "subjects_notified", label: "Subjects Notified" },
            { value: "remediation_only", label: "Remediation Only" },
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

      {/* Breaches Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : breaches.length === 0 ? (
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
              data={breaches}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Report Breach Modal */}
      {showReportModal && (
        <Modal
          open
          onClose={() => {
            if (!reportMutation.isPending) {
              setShowReportModal(false);
              setForm(initialForm);
            }
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Report Data Breach</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Title"
                placeholder="Brief summary of the breach"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                id="breach-title"
              />
              <Textarea
                label="Description"
                placeholder="Provide details about the breach..."
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={3}
                id="breach-description"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="breach-discovery-date"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Discovery Date/Time
                  </label>
                  <input
                    type="datetime-local"
                    id="breach-discovery-date"
                    value={form.discoveryDate}
                    onChange={(e) =>
                      setForm({ ...form, discoveryDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <Select
                  label="Category"
                  value={form.breachCategory}
                  onChange={(e) =>
                    setForm({ ...form, breachCategory: e.target.value })
                  }
                  options={[
                    { value: "confidentiality", label: "Confidentiality" },
                    { value: "integrity", label: "Integrity" },
                    { value: "availability", label: "Availability" },
                  ]}
                  id="breach-category"
                />
              </div>
              <Textarea
                label="Nature of Breach"
                placeholder="Describe the nature of the personal data involved..."
                required
                value={form.natureOfBreach}
                onChange={(e) =>
                  setForm({ ...form, natureOfBreach: e.target.value })
                }
                rows={3}
                id="breach-nature"
              />
              <Select
                label="Initial Severity"
                value={form.severity}
                onChange={(e) =>
                  setForm({ ...form, severity: e.target.value })
                }
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                  { value: "critical", label: "Critical" },
                ]}
                id="breach-severity"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowReportModal(false);
                setForm(initialForm);
              }}
              disabled={reportMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReport}
              disabled={
                !form.title.trim() ||
                !form.natureOfBreach.trim() ||
                reportMutation.isPending
              }
            >
              {reportMutation.isPending ? "Reporting..." : "Report Breach"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
