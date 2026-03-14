export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Briefcase,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface Job {
  id: string;
  code: string;
  title: string;
  family: string | null;
  level: string | null;
  grade: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  status: string;
}

interface JobListResponse {
  items: Job[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  draft: "secondary",
  archived: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

function formatCurrency(min: number | null, max: number | null, currency: string | null): string {
  if (min == null && max == null) return "-";
  const cur = currency ?? "GBP";
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

export default function JobCatalogPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-jobs", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<JobListResponse>(`/hr/jobs?${params}`);
    },
  });

  const jobs = data?.items ?? [];

  const columns: ColumnDef<Job>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-600">{row.code}</span>
      ),
    },
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.title}</span>
      ),
    },
    {
      id: "family",
      header: "Family",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.family || "-"}</span>
      ),
    },
    {
      id: "level",
      header: "Level",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.level || "-"}</span>
      ),
    },
    {
      id: "grade",
      header: "Grade",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.grade || "-"}</span>
      ),
    },
    {
      id: "salaryRange",
      header: "Salary Range",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatCurrency(row.salaryMin, row.salaryMax, row.currency)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/hr"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to HR
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Catalog</h1>
            <p className="text-gray-600">Manage job definitions, families, and salary ranges</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Job
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search jobs..."
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
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
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
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No jobs found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Start by adding your first job definition"}
              </p>
              {!search && !statusFilter && (
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Job
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={jobs}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
