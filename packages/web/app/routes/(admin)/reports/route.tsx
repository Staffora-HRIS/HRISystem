import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  BarChart3,
  Table2,
  PieChart,
  Grid3X3,
  FileText,
  Play,
  Clock,
  Layout,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  Spinner,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface ReportDef {
  id: string;
  name: string;
  description: string | null;
  reportType: string;
  status: string;
  category: string | null;
  tags: string[];
  isScheduled: boolean;
  isPublic: boolean;
  isSystem: boolean;
  createdBy: string;
  lastRunAt: string | null;
  runCount: number;
  avgExecutionMs: number | null;
  createdAt: string;
  updatedAt: string;
}

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  tabular: Table2,
  summary: BarChart3,
  cross_tab: Grid3X3,
  chart: PieChart,
  dashboard_widget: Layout,
  headcount: BarChart3,
  turnover: BarChart3,
  compliance: FileText,
};

const typeLabels: Record<string, string> = {
  tabular: "Table",
  summary: "Summary",
  cross_tab: "Pivot",
  chart: "Chart",
  dashboard_widget: "Widget",
  headcount: "Headcount",
  turnover: "Turnover",
  compliance: "Compliance",
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
};

export default function ReportsLibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const {
    data: reportsResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [...queryKeys.reports.list(), search, categoryFilter, typeFilter],
    queryFn: () =>
      api.get<{ data: ReportDef[]; total: number }>("/api/v1/reports", {
        params: {
          ...(search && { search }),
          ...(categoryFilter && { category: categoryFilter }),
          ...(typeFilter && { type: typeFilter }),
        },
      }),
  });

  const reports = reportsResponse?.data ?? [];

  // Get unique categories from reports for the filter dropdown
  const categories = [
    ...new Set(reports.map((r) => r.category).filter(Boolean)),
  ] as string[];

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">
            Build, run, and schedule reports across all HR data
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 font-medium">Failed to load reports</p>
          <p className="text-sm text-gray-500">
            {error instanceof ApiError ? error.message : "An unexpected error occurred."}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600">
            Build, run, and schedule reports across all HR data
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => navigate("/admin/reports/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Report
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        )}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">All Types</option>
          <option value="tabular">Table</option>
          <option value="summary">Summary</option>
          <option value="chart">Chart</option>
          <option value="cross_tab">Pivot</option>
        </select>
      </div>

      {/* Report Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12" role="status">
          <Spinner size="lg" />
          <span className="sr-only">Loading reports...</span>
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No reports found
            </h3>
            <p className="text-gray-500 mb-4">
              {search || categoryFilter || typeFilter
                ? "No reports match your current filters. Try adjusting your search criteria."
                : "Create your first report to get started."}
            </p>
            {!search && !categoryFilter && !typeFilter && (
              <Button
                variant="primary"
                onClick={() => navigate("/admin/reports/new")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Report
              </Button>
            )}
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => {
            const TypeIcon = typeIcons[report.reportType] ?? FileText;
            return (
              <Card
                key={report.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/reports/${report.id}`)}
              >
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                        <TypeIcon className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {report.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${statusColors[report.status] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {report.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {typeLabels[report.reportType] ?? report.reportType}
                          </span>
                          {report.isSystem && (
                            <span className="text-xs text-purple-600 font-medium">
                              System
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {report.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {report.description}
                    </p>
                  )}

                  {report.category && (
                    <div>
                      <Badge variant="default" size="sm">
                        {report.category}
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {report.runCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Play className="h-3 w-3" />
                          {report.runCount} runs
                        </span>
                      )}
                      {report.isScheduled && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Clock className="h-3 w-3" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/reports/${report.id}`);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
