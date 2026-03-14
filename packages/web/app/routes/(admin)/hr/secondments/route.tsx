export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  ArrowLeftRight,
  Search,
  ChevronLeft,
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

interface Secondment {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_number: string;
  from_org_unit_name: string;
  to_org_unit_name: string;
  to_external_org: string | null;
  start_date: string;
  expected_end_date: string;
  actual_end_date: string | null;
  status: string;
}

interface SecondmentListResponse {
  items: Secondment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  proposed: "default",
  approved: "info",
  active: "success",
  extended: "warning",
  completed: "default",
  cancelled: "error",
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  approved: "Approved",
  active: "Active",
  extended: "Extended",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SecondmentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-secondments", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<SecondmentListResponse>(`/secondments?${params}`);
    },
  });

  const secondments = data?.items ?? [];

  const columns: ColumnDef<Secondment>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employee_name || "")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {initials || "?"}
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {row.employee_name}
              </div>
              <div className="text-sm text-gray-500">{row.employee_number}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "transfer",
      header: "From / To",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">{row.from_org_unit_name}</span>
          <ArrowLeftRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-gray-900 font-medium">
            {row.to_external_org || row.to_org_unit_name}
          </span>
        </div>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.start_date)}
        </span>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.actual_end_date || row.expected_end_date)}
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
            <h1 className="text-2xl font-bold text-gray-900">Secondments</h1>
            <p className="text-gray-600">
              Manage internal and external secondment arrangements
            </p>
          </div>
        </div>
      </div>

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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "proposed", label: "Proposed" },
            { value: "approved", label: "Approved" },
            { value: "active", label: "Active" },
            { value: "extended", label: "Extended" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
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
          ) : secondments.length === 0 ? (
            <div className="text-center py-12">
              <ArrowLeftRight className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No secondments found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No secondment arrangements to display"}
              </p>
            </div>
          ) : (
            <DataTable
              data={secondments}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
