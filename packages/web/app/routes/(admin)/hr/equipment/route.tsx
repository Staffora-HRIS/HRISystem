export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Monitor,
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

interface Equipment {
  id: string;
  assetTag: string;
  type: string;
  description: string | null;
  assignedToName: string | null;
  assignedToId: string | null;
  status: string;
  assignedDate: string | null;
}

interface EquipmentListResponse {
  items: Equipment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  available: "success",
  assigned: "info",
  maintenance: "warning",
  retired: "default",
  lost: "error",
};

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
  lost: "Lost",
};

const TYPE_LABELS: Record<string, string> = {
  laptop: "Laptop",
  desktop: "Desktop",
  monitor: "Monitor",
  phone: "Phone",
  headset: "Headset",
  keyboard: "Keyboard",
  mouse: "Mouse",
  chair: "Chair",
  desk: "Desk",
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

export default function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-equipment", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<EquipmentListResponse>(`/equipment/assignments?${params}`);
    },
  });

  const items = data?.items ?? [];

  const columns: ColumnDef<Equipment>[] = [
    {
      id: "assetTag",
      header: "Asset Tag",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-600">{row.assetTag}</span>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">
          {TYPE_LABELS[row.type] || row.type}
        </span>
      ),
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      cell: ({ row }) => {
        if (!row.assignedToName) {
          return <span className="text-sm text-gray-400 italic">Unassigned</span>;
        }
        const initials = row.assignedToName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xs font-medium">
              {initials}
            </div>
            <span className="text-sm text-gray-900">{row.assignedToName}</span>
          </div>
        );
      },
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
      id: "assignedDate",
      header: "Assigned Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.assignedDate)}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Equipment Provisioning</h1>
            <p className="text-gray-600">Track and manage employee equipment assignments</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Equipment
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search equipment..."
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
            { value: "available", label: "Available" },
            { value: "assigned", label: "Assigned" },
            { value: "maintenance", label: "Maintenance" },
            { value: "retired", label: "Retired" },
            { value: "lost", label: "Lost" },
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
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Monitor className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No equipment found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Start by adding your first equipment item"}
              </p>
              {!search && !statusFilter && (
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Equipment
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={items}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
