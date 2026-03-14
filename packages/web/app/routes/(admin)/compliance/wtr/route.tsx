export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Clock,
  Search,
  AlertTriangle,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Badge,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface WtrRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  averageWeeklyHours: number;
  referenceWeeks: number;
  optedOut: boolean;
  optOutDate: string | null;
  hasViolation: boolean;
  violationType: string | null;
  lastChecked: string;
}

interface WtrListResponse {
  items: WtrRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface WtrSummary {
  totalEmployees: number;
  optedOutCount: number;
  violationCount: number;
  averageHoursAcrossOrg: number;
}

const VIOLATION_LABELS: Record<string, string> = {
  weekly_hours_exceeded: "Weekly Hours Exceeded (48h)",
  rest_period_breach: "Rest Period Breach",
  night_work_limit: "Night Work Limit Exceeded",
  annual_leave_deficit: "Annual Leave Not Taken",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WorkingTimeRegulationsPage() {
  const [search, setSearch] = useState("");
  const [violationFilter, setViolationFilter] = useState("");
  const [optOutFilter, setOptOutFilter] = useState("");

  const { data: wtrData, isLoading } = useQuery({
    queryKey: ["compliance-wtr", search, violationFilter, optOutFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (violationFilter) params.set("hasViolation", violationFilter);
      if (optOutFilter) params.set("optedOut", optOutFilter);
      params.set("limit", "50");
      return api.get<WtrListResponse>(`/compliance/wtr?${params}`);
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ["compliance-wtr-summary"],
    queryFn: () => api.get<WtrSummary>("/compliance/wtr/summary"),
  });

  const records = wtrData?.items ?? [];
  const summary = summaryData ?? {
    totalEmployees: records.length,
    optedOutCount: records.filter((r) => r.optedOut).length,
    violationCount: records.filter((r) => r.hasViolation).length,
    averageHoursAcrossOrg: 0,
  };

  const columns: ColumnDef<WtrRecord>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.employeeName}
        </div>
      ),
    },
    {
      id: "averageWeeklyHours",
      header: "Avg Weekly Hours",
      cell: ({ row }) => {
        const isOver = row.averageWeeklyHours > 48 && !row.optedOut;
        return (
          <div
            className={`text-sm font-medium ${
              isOver
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {row.averageWeeklyHours.toFixed(1)}h
            {isOver && (
              <AlertTriangle className="inline ml-1 h-4 w-4 text-red-500" />
            )}
          </div>
        );
      },
    },
    {
      id: "referenceWeeks",
      header: "Reference Period",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.referenceWeeks} weeks
        </div>
      ),
    },
    {
      id: "optOut",
      header: "Opt-Out Status",
      cell: ({ row }) =>
        row.optedOut ? (
          <Badge variant="info">
            <CheckCircle className="h-3 w-3 mr-1" />
            Opted Out
          </Badge>
        ) : (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Not Opted Out
          </Badge>
        ),
    },
    {
      id: "optOutDate",
      header: "Opt-Out Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.optOutDate)}
        </div>
      ),
    },
    {
      id: "violation",
      header: "Violations",
      cell: ({ row }) =>
        row.hasViolation ? (
          <Badge variant="error">
            {VIOLATION_LABELS[row.violationType ?? ""] || "Violation"}
          </Badge>
        ) : (
          <Badge variant="success">Compliant</Badge>
        ),
    },
    {
      id: "lastChecked",
      header: "Last Checked",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.lastChecked)}
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
            Working Time Regulations
          </span>
        </nav>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Working Time Regulations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitor compliance with the Working Time Regulations 1998
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Employees"
          value={summary.totalEmployees}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Opted Out (48h)"
          value={summary.optedOutCount}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Violations"
          value={summary.violationCount}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Org Avg Hours/Week"
          value={
            summary.averageHoursAcrossOrg > 0
              ? `${summary.averageHoursAcrossOrg.toFixed(1)}h`
              : "-"
          }
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Key Limits Info */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Key WTR Limits
          </h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Maximum Weekly Hours
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                48 hours (averaged over 17 weeks)
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Unless employee has opted out in writing
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Minimum Daily Rest
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                11 consecutive hours
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Between each working day
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Minimum Weekly Rest
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                24 hours uninterrupted per 7 days
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Or 48 hours per 14-day period
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

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
          value={violationFilter}
          onChange={(e) => setViolationFilter(e.target.value)}
          options={[
            { value: "", label: "All Compliance" },
            { value: "true", label: "With Violations" },
            { value: "false", label: "Compliant Only" },
          ]}
        />
        <Select
          value={optOutFilter}
          onChange={(e) => setOptOutFilter(e.target.value)}
          options={[
            { value: "", label: "All Opt-Out Status" },
            { value: "true", label: "Opted Out" },
            { value: "false", label: "Not Opted Out" },
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
              <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No working time records found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || violationFilter || optOutFilter
                  ? "Try adjusting your filters"
                  : "Working time compliance data will appear once time records are processed"}
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
    </div>
  );
}
