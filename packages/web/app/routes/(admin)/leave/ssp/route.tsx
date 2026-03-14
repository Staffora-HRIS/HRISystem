export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  Search,
  FileText,
  Clock,
  PoundSterling,
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

interface SspRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  absenceStart: string;
  qualifyingDays: number;
  waitingDays: number;
  sspDays: number;
  weeklyRate: number;
  status: "pending" | "active" | "exhausted" | "closed";
  createdAt: string;
}

interface SspListResponse {
  items: SspRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  active: "success",
  exhausted: "error",
  closed: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  exhausted: "Exhausted",
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

export default function AdminSspTrackingPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data: sspData, isLoading } = useQuery({
    queryKey: ["admin-ssp-records", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<SspListResponse>("/ssp/records", { params });
    },
  });

  const items = sspData?.items ?? [];

  const filteredItems = search
    ? items.filter((item) =>
        item.employeeName.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalRecords = items.length;
  const activeRecords = items.filter((r) => r.status === "active").length;
  const totalSspDays = items.reduce((sum, r) => sum + r.sspDays, 0);

  const columns: ColumnDef<SspRecord>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.employeeName}</div>
      ),
    },
    {
      id: "absenceStart",
      header: "Absence Start",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.absenceStart)}
        </span>
      ),
    },
    {
      id: "qualifyingDays",
      header: "Qualifying Days",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.qualifyingDays}
        </span>
      ),
    },
    {
      id: "waitingDays",
      header: "Waiting Days",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.waitingDays}</span>
      ),
    },
    {
      id: "sspDays",
      header: "SSP Days",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.sspDays}
        </span>
      ),
    },
    {
      id: "weeklyRate",
      header: "Weekly Rate",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatCurrency(row.weeklyRate)}
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
          <h1 className="text-2xl font-bold text-gray-900">
            Statutory Sick Pay
          </h1>
          <p className="text-gray-600">
            Track Statutory Sick Pay records and entitlements
          </p>
        </div>
        <Button disabled title="Coming soon">
          <Plus className="h-4 w-4 mr-2" />
          Add Record
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
              <p className="text-sm text-gray-500">Total Records</p>
              <p className="text-2xl font-bold">{totalRecords}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Currently Active</p>
              <p className="text-2xl font-bold">{activeRecords}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <PoundSterling className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total SSP Days</p>
              <p className="text-2xl font-bold">{totalSspDays}</p>
            </div>
          </CardBody>
        </Card>
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
            { value: "pending", label: "Pending" },
            { value: "active", label: "Active" },
            { value: "exhausted", label: "Exhausted" },
            { value: "closed", label: "Closed" },
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
              <Stethoscope className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No SSP records found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No Statutory Sick Pay records have been created yet"}
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
