import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface Delegation {
  delegationId: string;
  delegateName: string;
  scope: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  usageCount: number;
}

interface DelegationsResponse {
  items: Delegation[];
}

const SCOPE_LABELS: Record<string, string> = {
  all: "All",
  leave: "Leave",
  expenses: "Expenses",
  time: "Time",
  purchase: "Purchase",
};

const SCOPE_VARIANTS: Record<string, "primary" | "info" | "warning" | "secondary" | "success"> = {
  all: "primary",
  leave: "success",
  expenses: "warning",
  time: "info",
  purchase: "secondary",
};

export default function DelegationsPage() {
  const navigate = useNavigate();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-delegations"],
    queryFn: () => api.get<DelegationsResponse>("/delegations"),
  });

  const delegations = data?.items ?? [];

  const columns = useMemo<ColumnDef<Delegation>[]>(
    () => [
      {
        id: "delegateName",
        header: "Delegate",
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {row.delegateName}
          </span>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge variant={SCOPE_VARIANTS[row.scope] ?? "secondary"}>
            {SCOPE_LABELS[row.scope] ?? row.scope}
          </Badge>
        ),
      },
      {
        id: "startDate",
        header: "Start Date",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {new Date(row.startDate).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "endDate",
        header: "End Date",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {new Date(row.endDate).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.isActive ? "success" : "secondary"} dot>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "usageCount",
        header: "Usage",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {row.usageCount}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/security")}
          aria-label="Back to Security"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Authority Delegations
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage approval authority delegations between users
          </p>
        </div>
        <Button disabled aria-label="Add delegation (coming soon)">
          <Plus className="h-4 w-4 mr-2" />
          Add Delegation
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Failed to load delegations
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error instanceof ApiError
              ? error.message
              : "An unexpected error occurred."}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold">All Delegations</h2>
            </div>
          </CardHeader>
          <CardBody padding="none">
            <DataTable
              columns={columns}
              data={delegations}
              loading={isLoading}
              emptyMessage="No delegations found"
              emptyIcon={
                <ShieldCheck className="h-12 w-12 text-gray-300 mb-2" />
              }
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
