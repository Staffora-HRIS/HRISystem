export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Users,
  Plus,
  ChevronRight,
  Download,
  Calendar,
  ShieldCheck,
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
  Select,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface DiversityReport {
  id: string;
  reportingPeriod: string;
  snapshotDate: string;
  status: string;
  totalEmployees: number;
  responseRate: number;
  dimensionCount: number;
  createdAt: string;
  publishedDate: string | null;
}

interface DiversityListResponse {
  items: DiversityReport[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "secondary",
  collecting: "info",
  calculated: "warning",
  published: "success",
  archived: "default",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  collecting: "Collecting Data",
  calculated: "Calculated",
  published: "Published",
  archived: "Archived",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPercent(value: number): string {
  return value.toFixed(1) + "%";
}

export default function DiversityMonitoringPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    reportingPeriod: "",
    snapshotDate: "",
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/diversity/reports", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-diversity"] });
      toast.success("Diversity report created successfully");
      setShowCreateModal(false);
      setReportForm({ reportingPeriod: "", snapshotDate: "" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Failed to create report";
      toast.error(message);
    },
  });

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["compliance-diversity", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<DiversityListResponse>(
        "/diversity/reports?" + params
      );
    },
  });

  const reports = reportsData?.items ?? [];

  const latestReport = reports.length > 0 ? reports[0] : null;

  const stats = {
    totalReports: reports.length,
    totalEmployees: latestReport?.totalEmployees ?? 0,
    responseRate: latestReport?.responseRate ?? 0,
    latestPeriod: latestReport?.reportingPeriod ?? "-",
  };

  const handleExport = () => {
    if (reports.length === 0) {
      toast.error("No reports to export");
      return;
    }
    const headers = ["Reporting Period", "Snapshot Date", "Status", "Employees", "Response Rate", "Dimensions", "Published"];
    const rows = reports.map((r) => [
      r.reportingPeriod,
      r.snapshotDate,
      STATUS_LABELS[r.status] || r.status,
      String(r.totalEmployees),
      formatPercent(r.responseRate),
      String(r.dimensionCount),
      formatDate(r.publishedDate),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diversity-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const columns: ColumnDef<DiversityReport>[] = [
    {
      id: "reportingPeriod",
      header: "Reporting Period",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.reportingPeriod}
        </div>
      ),
    },
    {
      id: "snapshotDate",
      header: "Snapshot Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.snapshotDate)}
        </div>
      ),
    },
    {
      id: "totalEmployees",
      header: "Employees",
      cell: ({ row }) => (
        <div className="text-sm text-gray-900 dark:text-gray-100">
          {row.totalEmployees.toLocaleString()}
        </div>
      ),
    },
    {
      id: "responseRate",
      header: "Response Rate",
      cell: ({ row }) => {
        const rateClass =
          row.responseRate >= 80
            ? "text-green-600 dark:text-green-400"
            : row.responseRate >= 50
              ? "text-yellow-600 dark:text-yellow-400"
              : "text-red-600 dark:text-red-400";
        return (
          <div className={"text-sm font-medium " + rateClass}>
            {formatPercent(row.responseRate)}
          </div>
        );
      },
    },
    {
      id: "dimensionCount",
      header: "Dimensions",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.dimensionCount}
        </div>
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
      id: "publishedDate",
      header: "Published",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.publishedDate)}
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
            Diversity Monitoring
          </span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Diversity Monitoring
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Aggregate workforce diversity statistics and reporting
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Report
            </Button>
          </div>
        </div>
      </div>

      {/* Privacy Notice */}
      <Alert variant="info">
        <div className="flex items-start gap-2">
          <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Data Privacy</p>
            <p className="text-sm mt-1">
              Individual employee diversity data is anonymised to protect
              privacy. Categories with fewer than 5 respondents are suppressed
              to prevent identification. All data is collected on a voluntary,
              self-declaration basis in accordance with the Equality Act 2010.
            </p>
          </div>
        </div>
      </Alert>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Reports"
          value={stats.totalReports}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Employees Covered"
          value={stats.totalEmployees.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Response Rate"
          value={stats.responseRate > 0 ? formatPercent(stats.responseRate) : "-"}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Latest Period"
          value={stats.latestPeriod}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "draft", label: "Draft" },
            { value: "collecting", label: "Collecting Data" },
            { value: "calculated", label: "Calculated" },
            { value: "published", label: "Published" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      {/* Reports Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No diversity reports found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {statusFilter
                  ? "Try adjusting your filters"
                  : "Create your first diversity monitoring report to get started"}
              </p>
              {!statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Report
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={reports}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {showCreateModal && (
        <Modal open onClose={() => !createMutation.isPending && setShowCreateModal(false)}>
          <ModalHeader>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Diversity Report</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="report-period" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reporting Period <span className="text-red-500">*</span>
                </label>
                <Input
                  id="report-period"
                  value={reportForm.reportingPeriod}
                  onChange={(e) => setReportForm({ ...reportForm, reportingPeriod: e.target.value })}
                  placeholder="e.g. 2025-26"
                />
              </div>
              <div>
                <label htmlFor="snapshot-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Snapshot Date <span className="text-red-500">*</span>
                </label>
                <Input
                  id="snapshot-date"
                  type="date"
                  value={reportForm.snapshotDate}
                  onChange={(e) => setReportForm({ ...reportForm, snapshotDate: e.target.value })}
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
                if (!reportForm.reportingPeriod.trim() || !reportForm.snapshotDate) {
                  toast.error("Reporting period and snapshot date are required");
                  return;
                }
                createMutation.mutate({
                  reportingPeriod: reportForm.reportingPeriod.trim(),
                  snapshotDate: reportForm.snapshotDate,
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Report"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
