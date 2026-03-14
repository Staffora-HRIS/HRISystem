export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Shield, Search, ArrowLeft } from "lucide-react";
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

interface DsarRequest {
  id: string;
  requestDate: string;
  requesterName: string;
  type: string;
  status: string;
  deadline: string;
  assignedTo: string | null;
}

interface DsarListResponse {
  items: DsarRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  access: "Access",
  rectification: "Rectification",
  erasure: "Erasure",
  portability: "Portability",
  restriction: "Restriction",
  objection: "Objection",
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  received: "secondary",
  in_progress: "warning",
  completed: "success",
  rejected: "error",
  overdue: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
  overdue: "Overdue",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DsarManagementPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["privacy-dsar", search, statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type", typeFilter);
      params.set("limit", "50");
      return api.get<DsarListResponse>(`/privacy/dsar?${params}`);
    },
  });

  const requests = data?.items ?? [];

  const columns: ColumnDef<DsarRequest>[] = [
    {
      id: "requestDate",
      header: "Request Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.requestDate)}
        </div>
      ),
    },
    {
      id: "requesterName",
      header: "Requester",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.requesterName}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant="outline">
          {TYPE_LABELS[row.type] ?? row.type}
        </Badge>
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
      id: "deadline",
      header: "Deadline",
      cell: ({ row }) => {
        const isOverdue =
          row.status !== "completed" &&
          row.status !== "rejected" &&
          new Date(row.deadline) < new Date();
        return (
          <div
            className={
              isOverdue
                ? "text-sm font-medium text-red-600 dark:text-red-400"
                : "text-sm text-gray-600 dark:text-gray-400"
            }
          >
            {formatDate(row.deadline)}
          </div>
        );
      },
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.assignedTo ?? "Unassigned"}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/privacy"
          className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Privacy & GDPR
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Data Subject Requests (DSAR)
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage data subject access and rights requests under GDPR.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by requester..."
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
            { value: "received", label: "Received" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
            { value: "rejected", label: "Rejected" },
            { value: "overdue", label: "Overdue" },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "access", label: "Access" },
            { value: "rectification", label: "Rectification" },
            { value: "erasure", label: "Erasure" },
            { value: "portability", label: "Portability" },
            { value: "restriction", label: "Restriction" },
            { value: "objection", label: "Objection" },
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
          ) : requests.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No DSAR requests found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter || typeFilter
                  ? "Try adjusting your filters"
                  : "Data subject requests will appear here when submitted."}
              </p>
            </div>
          ) : (
            <DataTable
              data={requests}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
