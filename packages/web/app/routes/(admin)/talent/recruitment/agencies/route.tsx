export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Building2,
  Search,
  ChevronLeft,
  Star,
  Phone,
  Mail,
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

interface Agency {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  terms_agreed: boolean;
  fee_type: string | null;
  fee_amount: number | null;
  preferred: boolean;
  status: string;
  placements_count: number;
}

interface AgencyListResponse {
  items: Agency[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "default",
  blacklisted: "error",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  blacklisted: "Blacklisted",
};

function formatFee(feeType: string | null, feeAmount: number | null): string {
  if (!feeType || feeAmount === null) return "-";
  if (feeType === "percentage") return `${feeAmount}%`;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(feeAmount);
}

export default function AgenciesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-agencies", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<AgencyListResponse>(`/agencies?${params}`);
    },
  });

  const agencies = data?.items ?? [];

  const columns: ColumnDef<Agency>[] = [
    {
      id: "name",
      header: "Agency",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-600 font-medium">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium text-gray-900 flex items-center gap-2">
              {row.name}
              {row.preferred && (
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              )}
            </div>
            {row.contact_name && (
              <div className="text-sm text-gray-500">{row.contact_name}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: ({ row }) => (
        <div className="space-y-1">
          {row.email && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Mail className="h-3 w-3" />
              {row.email}
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-1 text-sm text-gray-600">
              <Phone className="h-3 w-3" />
              {row.phone}
            </div>
          )}
          {!row.email && !row.phone && (
            <span className="text-sm text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      id: "fee",
      header: "Fee",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatFee(row.fee_type, row.fee_amount)}
        </span>
      ),
    },
    {
      id: "placements",
      header: "Placements",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.placements_count ?? 0}
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
    {
      id: "terms",
      header: "Terms",
      cell: ({ row }) => (
        <Badge variant={row.terms_agreed ? "success" : "warning"}>
          {row.terms_agreed ? "Agreed" : "Pending"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/talent/recruitment"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Recruitment
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Recruitment Agencies
            </h1>
            <p className="text-gray-600">
              Manage recruitment agency relationships and track placements
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search agencies..."
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
            { value: "inactive", label: "Inactive" },
            { value: "blacklisted", label: "Blacklisted" },
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
          ) : agencies.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No agencies found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Add recruitment agencies to start tracking placements"}
              </p>
            </div>
          ) : (
            <DataTable
              data={agencies}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
