export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Users,
  Search,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface HeadcountPlan {
  id: string;
  name: string;
  financial_year: string;
  status: string;
  total_current: number;
  total_planned: number;
  total_variance: number;
  items_count: number;
  created_at: string;
}

interface PlanListResponse {
  items: HeadcountPlan[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  draft: "default",
  active: "info",
  approved: "success",
  closed: "error",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  approved: "Approved",
  closed: "Closed",
};

export default function HeadcountPlanningPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-headcount-plans", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<PlanListResponse>(
        `/headcount-planning/plans?${params}`
      );
    },
  });

  const plans = data?.items ?? [];

  const columns: ColumnDef<HeadcountPlan>[] = [
    {
      id: "name",
      header: "Plan Name",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900">{row.name}</div>
          <div className="text-sm text-gray-500">{row.financial_year}</div>
        </div>
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
    {
      id: "current",
      header: "Current",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.total_current ?? 0}
        </span>
      ),
    },
    {
      id: "planned",
      header: "Planned",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.total_planned ?? 0}
        </span>
      ),
    },
    {
      id: "variance",
      header: "Variance",
      cell: ({ row }) => {
        const variance = row.total_variance ?? 0;
        const Icon = variance > 0 ? TrendingUp : variance < 0 ? TrendingDown : Minus;
        const color = variance > 0 ? "text-green-600" : variance < 0 ? "text-red-600" : "text-gray-500";
        return (
          <span className={`inline-flex items-center gap-1 text-sm font-medium ${color}`}>
            <Icon className="h-4 w-4" />
            {variance > 0 ? `+${variance}` : variance}
          </span>
        );
      },
    },
    {
      id: "items",
      header: "Line Items",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.items_count ?? 0}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">
              Headcount Planning
            </h1>
            <p className="text-gray-600">
              Plan and manage workforce headcount across the organisation
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search plans..."
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
            { value: "draft", label: "Draft" },
            { value: "active", label: "Active" },
            { value: "approved", label: "Approved" },
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
          ) : plans.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No headcount plans found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Create a headcount plan to start workforce planning"}
              </p>
            </div>
          ) : (
            <DataTable
              data={plans}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
