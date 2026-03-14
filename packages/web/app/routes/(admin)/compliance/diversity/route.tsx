export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "~/components/ui";
import { api } from "~/lib/api-client";

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
  const [statusFilter, setStatusFilter] = useState("");

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
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button>
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
                <Button>
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
    </div>
  );
}
