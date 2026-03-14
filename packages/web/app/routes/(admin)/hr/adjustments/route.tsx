export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Accessibility,
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

interface Adjustment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  category: string;
  description: string | null;
  status: string;
  requestedDate: string;
  reviewDate: string | null;
}

interface AdjustmentListResponse {
  items: Adjustment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  requested: "info",
  under_review: "warning",
  approved: "success",
  implemented: "success",
  denied: "error",
  withdrawn: "default",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  under_review: "Under Review",
  approved: "Approved",
  implemented: "Implemented",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

const CATEGORY_LABELS: Record<string, string> = {
  physical: "Physical",
  ergonomic: "Ergonomic",
  schedule: "Schedule",
  workload: "Workload",
  communication: "Communication",
  technology: "Technology",
  other: "Other",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdjustmentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-adjustments", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<AdjustmentListResponse>(`/reasonable-adjustments?${params}`);
    },
  });

  const adjustments = data?.items ?? [];

  const columns: ColumnDef<Adjustment>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employeeName || "")
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
              <div className="font-medium text-gray-900">{row.employeeName}</div>
              <div className="text-sm text-gray-500">{row.employeeNumber}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline">
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
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
      id: "requestedDate",
      header: "Requested Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.requestedDate)}</span>
      ),
    },
    {
      id: "reviewDate",
      header: "Review Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.reviewDate)}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Reasonable Adjustments</h1>
            <p className="text-gray-600">Track and manage workplace adjustment requests</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Adjustment
          </Button>
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
            { value: "requested", label: "Requested" },
            { value: "under_review", label: "Under Review" },
            { value: "approved", label: "Approved" },
            { value: "implemented", label: "Implemented" },
            { value: "denied", label: "Denied" },
            { value: "withdrawn", label: "Withdrawn" },
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
          ) : adjustments.length === 0 ? (
            <div className="text-center py-12">
              <Accessibility className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No adjustments found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No reasonable adjustment requests recorded"}
              </p>
              {!search && !statusFilter && (
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Adjustment
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={adjustments}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
