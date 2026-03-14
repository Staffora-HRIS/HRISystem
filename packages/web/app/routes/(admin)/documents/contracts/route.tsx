import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSignature,
  Search,
  MoreHorizontal,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Button,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface ContractStatement {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  amendmentType: string;
  effectiveDate: string;
  notificationStatus: string;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ContractStatementListResponse {
  items: ContractStatement[];
  nextCursor: string | null;
  hasMore: boolean;
}

const AMENDMENT_TYPE_LABELS: Record<string, string> = {
  new_contract: "New Contract",
  salary_change: "Salary Change",
  role_change: "Role Change",
  hours_change: "Hours Change",
  location_change: "Location Change",
  terms_update: "Terms Update",
  extension: "Extension",
};

const AMENDMENT_TYPE_BADGE_VARIANTS: Record<string, string> = {
  new_contract: "primary",
  salary_change: "success",
  role_change: "info",
  hours_change: "warning",
  location_change: "secondary",
  terms_update: "secondary",
  extension: "info",
};

const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
};

const NOTIFICATION_BADGE_VARIANTS: Record<string, string> = {
  pending: "warning",
  sent: "success",
  failed: "error",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ContractStatementsPage() {
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [amendmentFilter, setAmendmentFilter] = useState("");
  const [notificationFilter, setNotificationFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: [
      "admin-contract-statements",
      search,
      amendmentFilter,
      notificationFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (amendmentFilter) params.set("amendmentType", amendmentFilter);
      if (notificationFilter)
        params.set("notificationStatus", notificationFilter);
      params.set("limit", "50");
      return api.get<ContractStatementListResponse>(
        `/documents/contract-statements?${params}`
      );
    },
  });

  const statements = data?.items ?? [];

  const stats = {
    total: statements.length,
    acknowledged: statements.filter((s) => s.acknowledgedAt !== null).length,
    pendingNotification: statements.filter(
      (s) => s.notificationStatus === "pending"
    ).length,
  };

  const columns: ColumnDef<ContractStatement>[] = [
    {
      id: "employeeName",
      header: "Employee",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {row.employeeName}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {row.employeeNumber}
          </div>
        </div>
      ),
    },
    {
      id: "amendmentType",
      header: "Amendment Type",
      cell: ({ row }) => (
        <Badge
          variant={
            (AMENDMENT_TYPE_BADGE_VARIANTS[row.amendmentType] ||
              "secondary") as BadgeVariant
          }
        >
          {AMENDMENT_TYPE_LABELS[row.amendmentType] || row.amendmentType}
        </Badge>
      ),
    },
    {
      id: "effectiveDate",
      header: "Effective Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.effectiveDate)}
        </div>
      ),
    },
    {
      id: "notificationStatus",
      header: "Notification",
      cell: ({ row }) => (
        <Badge
          variant={
            (NOTIFICATION_BADGE_VARIANTS[row.notificationStatus] ||
              "secondary") as BadgeVariant
          }
        >
          {row.notificationStatus === "sent" && (
            <CheckCircle className="h-3 w-3 mr-1" />
          )}
          {row.notificationStatus === "pending" && (
            <Clock className="h-3 w-3 mr-1" />
          )}
          {row.notificationStatus === "failed" && (
            <AlertCircle className="h-3 w-3 mr-1" />
          )}
          {NOTIFICATION_STATUS_LABELS[row.notificationStatus] ||
            row.notificationStatus}
        </Badge>
      ),
    },
    {
      id: "acknowledged",
      header: "Acknowledged",
      cell: ({ row }) =>
        row.acknowledgedAt ? (
          <div className="flex items-center gap-1 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span>{formatDate(row.acknowledgedAt)}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">Not yet</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`Statement for ${row.employeeName}`, {
              message: `Amendment: ${AMENDMENT_TYPE_LABELS[row.amendmentType] || row.amendmentType} | Effective: ${formatDate(row.effectiveDate)}`,
            });
          }}
          aria-label={`View details for ${row.employeeName}'s contract statement`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Contract Statements & Amendments
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track contract amendments, notifications, and employee
            acknowledgements
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Statements"
          value={stats.total}
          icon={<FileSignature className="h-5 w-5" />}
        />
        <StatCard
          title="Acknowledged"
          value={stats.acknowledged}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending Notification"
          value={stats.pendingNotification}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by employee name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={amendmentFilter}
          onChange={(e) => setAmendmentFilter(e.target.value)}
          options={[
            { value: "", label: "All Amendment Types" },
            { value: "new_contract", label: "New Contract" },
            { value: "salary_change", label: "Salary Change" },
            { value: "role_change", label: "Role Change" },
            { value: "hours_change", label: "Hours Change" },
            { value: "location_change", label: "Location Change" },
            { value: "terms_update", label: "Terms Update" },
            { value: "extension", label: "Extension" },
          ]}
        />
        <Select
          value={notificationFilter}
          onChange={(e) => setNotificationFilter(e.target.value)}
          options={[
            { value: "", label: "All Notifications" },
            { value: "pending", label: "Pending" },
            { value: "sent", label: "Sent" },
            { value: "failed", label: "Failed" },
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
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <FileSignature className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No contract statements found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || amendmentFilter || notificationFilter
                  ? "Try adjusting your filters"
                  : "Contract statements will appear here when amendments are made."}
              </p>
            </div>
          ) : (
            <DataTable
              data={statements}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
