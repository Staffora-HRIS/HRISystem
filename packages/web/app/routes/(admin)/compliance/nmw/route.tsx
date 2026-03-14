export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  PoundSterling,
  Search,
  AlertTriangle,
  ChevronRight,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  StatCard,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface NmwCheck {
  id: string;
  employeeId: string;
  employeeName: string;
  ageGroup: string;
  hourlyRate: number;
  minimumRate: number;
  status: string;
  checkDate: string;
  payPeriod: string;
  hoursWorked: number;
  totalPay: number;
}

interface NmwListResponse {
  items: NmwCheck[];
  nextCursor: string | null;
  hasMore: boolean;
}

const AGE_GROUP_LABELS: Record<string, string> = {
  apprentice: "Apprentice",
  under_18: "Under 18",
  "18_to_20": "18-20",
  "21_to_22": "21-22",
  "23_and_over": "23 and Over (NLW)",
};

// Current NMW/NLW rates (April 2025)
const CURRENT_RATES: Record<string, number> = {
  apprentice: 7.55,
  under_18: 7.55,
  "18_to_20": 10.0,
  "21_to_22": 10.0,
  "23_and_over": 12.21,
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  compliant: "success",
  non_compliant: "error",
  review_required: "warning",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  compliant: "Compliant",
  non_compliant: "Non-Compliant",
  review_required: "Review Required",
  pending: "Pending Check",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function NationalMinimumWagePage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [ageGroupFilter, setAgeGroupFilter] = useState("");

  const { data: checksData, isLoading } = useQuery({
    queryKey: ["compliance-nmw", search, statusFilter, ageGroupFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (ageGroupFilter) params.set("ageGroup", ageGroupFilter);
      params.set("limit", "50");
      return api.get<NmwListResponse>(`/compliance/nmw?${params}`);
    },
  });

  const checks = checksData?.items ?? [];

  const stats = {
    total: checks.length,
    compliant: checks.filter((c) => c.status === "compliant").length,
    nonCompliant: checks.filter((c) => c.status === "non_compliant").length,
    reviewRequired: checks.filter((c) => c.status === "review_required").length,
  };

  const columns: ColumnDef<NmwCheck>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.employeeName}
        </div>
      ),
    },
    {
      id: "ageGroup",
      header: "Age Group",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {AGE_GROUP_LABELS[row.ageGroup] || row.ageGroup}
        </div>
      ),
    },
    {
      id: "hourlyRate",
      header: "Hourly Rate",
      cell: ({ row }) => {
        const isBelow = row.hourlyRate < row.minimumRate;
        return (
          <div
            className={`text-sm font-medium ${
              isBelow
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {formatCurrency(row.hourlyRate)}
            {isBelow && (
              <AlertTriangle className="inline ml-1 h-4 w-4 text-red-500" />
            )}
          </div>
        );
      },
    },
    {
      id: "minimumRate",
      header: "Minimum Rate",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatCurrency(row.minimumRate)}
        </div>
      ),
    },
    {
      id: "payPeriod",
      header: "Pay Period",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.payPeriod}
        </div>
      ),
    },
    {
      id: "hoursWorked",
      header: "Hours Worked",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.hoursWorked.toFixed(1)}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "checkDate",
      header: "Check Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.checkDate)}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link
            to="/admin/compliance"
            className="hover:text-gray-700 dark:hover:text-gray-300"
          >
            Compliance
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-900 dark:text-white font-medium">
            National Minimum Wage
          </span>
        </nav>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            National Minimum Wage
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            NMW and National Living Wage compliance checks
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Checks"
          value={stats.total}
          icon={<PoundSterling className="h-5 w-5" />}
        />
        <StatCard
          title="Compliant"
          value={stats.compliant}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Non-Compliant"
          value={stats.nonCompliant}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Review Required"
          value={stats.reviewRequired}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Current Rates Reference */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Current NMW / NLW Rates (April 2025)
          </h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(CURRENT_RATES).map(([group, rate]) => (
              <div key={group}>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {AGE_GROUP_LABELS[group]}
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(rate)}/hr
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

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
            { value: "compliant", label: "Compliant" },
            { value: "non_compliant", label: "Non-Compliant" },
            { value: "review_required", label: "Review Required" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <Select
          value={ageGroupFilter}
          onChange={(e) => setAgeGroupFilter(e.target.value)}
          options={[
            { value: "", label: "All Age Groups" },
            { value: "apprentice", label: "Apprentice" },
            { value: "under_18", label: "Under 18" },
            { value: "18_to_20", label: "18-20" },
            { value: "21_to_22", label: "21-22" },
            { value: "23_and_over", label: "23 and Over (NLW)" },
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
          ) : checks.length === 0 ? (
            <div className="text-center py-12">
              <PoundSterling className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No NMW checks found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter || ageGroupFilter
                  ? "Try adjusting your filters"
                  : "NMW compliance checks will appear once payroll data is processed"}
              </p>
            </div>
          ) : (
            <DataTable
              data={checks}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
