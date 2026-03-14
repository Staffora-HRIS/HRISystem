export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  BarChart3,
  ChevronRight,
  Download,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Button,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface GenderPayGapReport {
  id: string;
  reportingPeriod: string;
  snapshotDate: string;
  status: string;
  meanPayGap: number;
  medianPayGap: number;
  meanBonusGap: number;
  medianBonusGap: number;
  maleBonusProportion: number;
  femaleBonusProportion: number;
  employeeCount: number;
  publishedDate: string | null;
}

interface GenderPayGapListResponse {
  items: GenderPayGapReport[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface PayQuartile {
  quartile: string;
  malePercent: number;
  femalePercent: number;
}

interface GenderPayGapSummary {
  currentMeanGap: number;
  currentMedianGap: number;
  previousMeanGap: number | null;
  previousMedianGap: number | null;
  quartiles: PayQuartile[];
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "secondary",
  calculated: "info",
  reviewed: "warning",
  published: "success",
  archived: "default",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  calculated: "Calculated",
  reviewed: "Under Review",
  published: "Published",
  archived: "Archived",
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GenderPayGapPage() {
  const [statusFilter, setStatusFilter] = useState("");

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["compliance-gender-pay-gap", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<GenderPayGapListResponse>(
        `/compliance/gender-pay-gap?${params}`
      );
    },
  });

  const { data: summaryData } = useQuery({
    queryKey: ["compliance-gender-pay-gap-summary"],
    queryFn: () =>
      api.get<GenderPayGapSummary>("/compliance/gender-pay-gap/summary"),
  });

  const reports = reportsData?.items ?? [];
  const summary = summaryData ?? {
    currentMeanGap: 0,
    currentMedianGap: 0,
    previousMeanGap: null,
    previousMedianGap: null,
    quartiles: [],
  };

  const columns: ColumnDef<GenderPayGapReport>[] = [
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
      id: "meanPayGap",
      header: "Mean Pay Gap",
      cell: ({ row }) => (
        <div
          className={`text-sm font-medium ${
            row.meanPayGap > 0
              ? "text-orange-600 dark:text-orange-400"
              : row.meanPayGap < 0
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {formatPercent(row.meanPayGap)}
        </div>
      ),
    },
    {
      id: "medianPayGap",
      header: "Median Pay Gap",
      cell: ({ row }) => (
        <div
          className={`text-sm font-medium ${
            row.medianPayGap > 0
              ? "text-orange-600 dark:text-orange-400"
              : row.medianPayGap < 0
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-900 dark:text-gray-100"
          }`}
        >
          {formatPercent(row.medianPayGap)}
        </div>
      ),
    },
    {
      id: "employeeCount",
      header: "Employees",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.employeeCount.toLocaleString()}
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

  const gapChangeDirection =
    summary.previousMeanGap !== null
      ? summary.currentMeanGap < summary.previousMeanGap
        ? "decrease"
        : summary.currentMeanGap > summary.previousMeanGap
          ? "increase"
          : "neutral"
      : undefined;

  const gapChangeValue =
    summary.previousMeanGap !== null
      ? Math.abs(summary.currentMeanGap - summary.previousMeanGap)
      : undefined;

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
            Gender Pay Gap
          </span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Gender Pay Gap
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gender pay gap reporting under the Equality Act 2010
            </p>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Mean Pay Gap"
          value={formatPercent(summary.currentMeanGap)}
          icon={<BarChart3 className="h-5 w-5" />}
          change={
            gapChangeDirection && gapChangeValue !== undefined
              ? {
                  value: parseFloat(gapChangeValue.toFixed(1)),
                  type: gapChangeDirection as "increase" | "decrease" | "neutral",
                }
              : undefined
          }
        />
        <StatCard
          title="Median Pay Gap"
          value={formatPercent(summary.currentMedianGap)}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          title="Reports Generated"
          value={reports.length}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Latest Period"
          value={reports.length > 0 ? reports[0].reportingPeriod : "-"}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Pay Quartiles */}
      {summary.quartiles.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Pay Quartiles
            </h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {summary.quartiles.map((q) => (
                <div key={q.quartile}>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                    {q.quartile}
                  </p>
                  <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                    <div
                      className="bg-blue-500 transition-all"
                      style={{ width: `${q.malePercent}%` }}
                      title={`Male: ${q.malePercent.toFixed(1)}%`}
                    />
                    <div
                      className="bg-pink-500 transition-all"
                      style={{ width: `${q.femalePercent}%` }}
                      title={`Female: ${q.femalePercent.toFixed(1)}%`}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>Male: {q.malePercent.toFixed(1)}%</span>
                    <span>Female: {q.femalePercent.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "draft", label: "Draft" },
            { value: "calculated", label: "Calculated" },
            { value: "reviewed", label: "Under Review" },
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
              <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No reports found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {statusFilter
                  ? "Try adjusting your filters"
                  : "Gender pay gap reports will appear once calculations are run"}
              </p>
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
