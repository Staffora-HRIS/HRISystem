export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Database,
  ArrowLeft,
  FileText,
  CheckCircle,
  Clock,
  Trash2,
  Sprout,
} from "lucide-react";
import {
  Card,
  CardBody,
  StatCard,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Button,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

// ---------------------------------------------------------------------------
// Types matching backend RetentionPolicyResponseSchema / dashboard
// ---------------------------------------------------------------------------

interface RetentionPolicy {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  dataCategory: string;
  retentionPeriodMonths: number;
  legalBasis: string;
  autoPurgeEnabled: boolean;
  notificationBeforePurgeDays: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface RetentionPolicyListResponse {
  items: RetentionPolicy[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface RetentionDashboard {
  totalPolicies: number;
  activePolicies: number;
  totalExceptions: number;
  activeExceptions: number;
  upcomingReviews: number;
  lastPurgeDate: string | null;
  policySummary: Array<{
    id: string;
    name: string;
    dataCategory: string;
    retentionPeriodMonths: number;
    status: string;
    autoPurgeEnabled: boolean;
    lastReviewDate: string | null;
    exceptionCount: number;
  }>;
}

interface SeedDefaultsResponse {
  created: number;
  skipped: number;
  policies: RetentionPolicy[];
}

// ---------------------------------------------------------------------------
// Label / badge mappings
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
};

const CATEGORY_LABELS: Record<string, string> = {
  employee_records: "Employee Records",
  payroll: "Payroll",
  tax: "Tax",
  time_entries: "Time Entries",
  leave_records: "Leave Records",
  performance_reviews: "Performance Reviews",
  training_records: "Training Records",
  recruitment: "Recruitment",
  cases: "Cases",
  audit_logs: "Audit Logs",
  documents: "Documents",
  medical: "Medical",
};

const LEGAL_BASIS_LABELS: Record<string, string> = {
  employment_law: "Employment Law",
  tax_law: "Tax Law",
  pension_law: "Pension Law",
  limitation_act: "Limitation Act",
  consent: "Consent",
  legitimate_interest: "Legitimate Interest",
};

function formatPeriod(months: number): string {
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const remaining = months % 12;
    if (remaining === 0) return `${years} year${years > 1 ? "s" : ""}`;
    return `${years}y ${remaining}m`;
  }
  return `${months} month${months > 1 ? "s" : ""}`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ComplianceDataRetentionPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Dashboard stats
  const { data: dashboard } = useQuery({
    queryKey: ["compliance-data-retention-dashboard"],
    queryFn: () =>
      api.get<RetentionDashboard>("/data-retention/dashboard"),
  });

  // Policy list
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-data-retention-policies"],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", "100");
      return api.get<RetentionPolicyListResponse>(
        `/data-retention/policies?${params}`
      );
    },
  });

  // Seed UK defaults mutation
  const seedMutation = useMutation({
    mutationFn: () =>
      api.post<SeedDefaultsResponse>(
        "/data-retention/policies/seed-defaults"
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["compliance-data-retention-policies"],
      });
      queryClient.invalidateQueries({
        queryKey: ["compliance-data-retention-dashboard"],
      });
      toast.success(
        `Seeded ${result.created} UK default policies (${result.skipped} already existed)`
      );
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to seed default policies";
      toast.error(message);
    },
  });

  const policies = data?.items ?? [];

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: ColumnDef<RetentionPolicy>[] = [
    {
      id: "name",
      header: "Policy Name",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.name}
        </div>
      ),
    },
    {
      id: "dataCategory",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant="outline">
          {CATEGORY_LABELS[row.dataCategory] ?? row.dataCategory}
        </Badge>
      ),
    },
    {
      id: "retentionPeriodMonths",
      header: "Period",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatPeriod(row.retentionPeriodMonths)}
        </div>
      ),
    },
    {
      id: "legalBasis",
      header: "Legal Basis",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {LEGAL_BASIS_LABELS[row.legalBasis] ?? row.legalBasis}
        </div>
      ),
    },
    {
      id: "autoPurgeEnabled",
      header: "Auto-Purge",
      cell: ({ row }) => (
        <Badge variant={row.autoPurgeEnabled ? "warning" : "secondary"}>
          {row.autoPurgeEnabled ? "Enabled" : "Disabled"}
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
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/admin/compliance"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Compliance
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Data Retention
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage data retention policies under UK GDPR Article 5(1)(e)
            storage limitation principle.
          </p>
        </div>
        <Button
          onClick={() => seedMutation.mutate()}
          disabled={seedMutation.isPending}
          variant="outline"
        >
          <Sprout className="h-4 w-4 mr-2" />
          {seedMutation.isPending ? "Seeding..." : "Seed UK Defaults"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Policies"
          value={dashboard?.totalPolicies ?? 0}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          title="Active Policies"
          value={dashboard?.activePolicies ?? 0}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Upcoming Reviews"
          value={dashboard?.upcomingReviews ?? 0}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          title="Active Exceptions"
          value={dashboard?.activeExceptions ?? 0}
          icon={<Trash2 className="h-5 w-5" />}
        />
      </div>

      {/* Policies Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : policies.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No retention policies found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Set up data retention policies to comply with GDPR storage
                limitation requirements.
              </p>
              <Button
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Sprout className="h-4 w-4 mr-2" />
                Seed UK Defaults
              </Button>
            </div>
          ) : (
            <DataTable
              data={policies}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
