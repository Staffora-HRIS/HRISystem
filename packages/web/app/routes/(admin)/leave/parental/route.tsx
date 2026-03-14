export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Search,
  FileText,
  Clock,
  CheckCircle,
  Plus,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  Button,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface ParentalLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  childName: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
}

interface ParentalLeaveListResponse {
  items: ParentalLeaveRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
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

export default function AdminParentalLeavePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: leaveData, isLoading } = useQuery({
    queryKey: ["admin-parental-leave-requests", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<ParentalLeaveListResponse>("/parental-leave/requests", {
        params,
      });
    },
  });

  const items = leaveData?.items ?? [];

  const filteredItems = search
    ? items.filter(
        (item) =>
          item.employeeName.toLowerCase().includes(search.toLowerCase()) ||
          item.childName.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalRequests = items.length;
  const pendingRequests = items.filter((r) => r.status === "pending").length;
  const approvedRequests = items.filter((r) => r.status === "approved").length;

  const columns: ColumnDef<ParentalLeaveRequest>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.employeeName}</div>
      ),
    },
    {
      id: "childName",
      header: "Child Name",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.childName}</span>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.startDate)}
        </span>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      id: "totalWeeks",
      header: "Weeks",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.totalWeeks}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={STATUS_BADGE_VARIANTS[row.status] ?? "default"}
          dot
          rounded
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parental Leave</h1>
          <p className="text-gray-600">
            Manage parental leave requests and entitlements
          </p>
        </div>
        <Button disabled title="Coming soon">
          <Plus className="h-4 w-4 mr-2" />
          Add Request
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Requests</p>
              <p className="text-2xl font-bold">{totalRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Approval</p>
              <p className="text-2xl font-bold">{pendingRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-2xl font-bold">{approvedRequests}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee or child name..."
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
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No parental leave requests found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No parental leave requests have been submitted yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
