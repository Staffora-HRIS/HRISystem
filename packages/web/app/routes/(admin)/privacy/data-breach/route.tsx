export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "~/components/ui";
import { api } from "~/lib/api-client";

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

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
        <Button>
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
    </div>
  );
}
