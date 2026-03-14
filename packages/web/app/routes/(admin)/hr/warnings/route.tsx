export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  AlertTriangle,
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

interface Warning {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  level: string;
  issuedDate: string;
  expiryDate: string | null;
  status: string;
  issuedByName: string | null;
  reason: string | null;
}

interface WarningListResponse {
  items: Warning[];
  nextCursor: string | null;
  hasMore: boolean;
}

const LEVEL_BADGE: Record<string, BadgeVariant> = {
  verbal: "info",
  first_written: "warning",
  final_written: "error",
};

const LEVEL_LABELS: Record<string, string> = {
  verbal: "Verbal",
  first_written: "First Written",
  final_written: "Final Written",
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "error",
  expired: "default",
  appealed: "warning",
  revoked: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  appealed: "Appealed",
  revoked: "Revoked",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WarningsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-warnings", search, statusFilter, levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (levelFilter) params.set("level", levelFilter);
      params.set("limit", "50");
      return api.get<WarningListResponse>(`/warnings?${params}`);
    },
  });

  const warnings = data?.items ?? [];

  const columns: ColumnDef<Warning>[] = [
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
      id: "level",
      header: "Warning Level",
      cell: ({ row }) => (
        <Badge variant={LEVEL_BADGE[row.level] ?? "default"}>
          {LEVEL_LABELS[row.level] || row.level}
        </Badge>
      ),
    },
    {
      id: "issuedDate",
      header: "Issued Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.issuedDate)}</span>
      ),
    },
    {
      id: "expiryDate",
      header: "Expiry Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.expiryDate)}</span>
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
      id: "issuedBy",
      header: "Issued By",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.issuedByName || "-"}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Employee Warnings</h1>
            <p className="text-gray-600">Manage disciplinary warnings and records</p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Issue Warning
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
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "appealed", label: "Appealed" },
            { value: "revoked", label: "Revoked" },
          ]}
        />
        <Select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          options={[
            { value: "", label: "All Levels" },
            { value: "verbal", label: "Verbal" },
            { value: "first_written", label: "First Written" },
            { value: "final_written", label: "Final Written" },
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
          ) : warnings.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No warnings found</h3>
              <p className="text-gray-500">
                {search || statusFilter || levelFilter
                  ? "Try adjusting your filters"
                  : "No employee warnings recorded"}
              </p>
            </div>
          ) : (
            <DataTable
              data={warnings}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
