export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  FileCheck,
  Search,
  Plus,
  AlertTriangle,
  ChevronRight,
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
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface RightToWorkCheck {
  id: string;
  employeeId: string;
  employeeName: string;
  documentType: string;
  checkDate: string;
  expiryDate: string | null;
  status: string;
  checkedBy: string | null;
}

interface RightToWorkListResponse {
  items: RightToWorkCheck[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  valid: "success",
  expiring_soon: "warning",
  expired: "error",
  pending: "secondary",
  not_checked: "default",
};

const STATUS_LABELS: Record<string, string> = {
  valid: "Valid",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  pending: "Pending Review",
  not_checked: "Not Checked",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  uk_passport: "UK Passport",
  biometric_residence_permit: "Biometric Residence Permit",
  share_code: "Share Code (Online Check)",
  right_to_work_visa: "Right to Work Visa",
  settled_status: "Settled Status",
  pre_settled_status: "Pre-Settled Status",
  eu_passport: "EU Passport",
  birth_certificate: "UK Birth Certificate",
  other: "Other Document",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function RightToWorkPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("");

  const { data: checksData, isLoading } = useQuery({
    queryKey: ["compliance-right-to-work", search, statusFilter, documentTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (documentTypeFilter) params.set("documentType", documentTypeFilter);
      params.set("limit", "50");
      return api.get<RightToWorkListResponse>(
        `/compliance/right-to-work?${params}`
      );
    },
  });

  const checks = checksData?.items ?? [];

  const stats = {
    total: checks.length,
    valid: checks.filter((c) => c.status === "valid").length,
    expiringSoon: checks.filter((c) => c.status === "expiring_soon").length,
    expired: checks.filter((c) => c.status === "expired").length,
  };

  const columns: ColumnDef<RightToWorkCheck>[] = [
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
      id: "documentType",
      header: "Document Type",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {DOCUMENT_TYPE_LABELS[row.documentType] || row.documentType}
        </div>
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
    {
      id: "expiryDate",
      header: "Expiry Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.expiryDate ? formatDate(row.expiryDate) : "No expiry"}
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
      id: "checkedBy",
      header: "Checked By",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {row.checkedBy || "-"}
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
            Right to Work
          </span>
        </nav>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Right to Work
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Employee right-to-work verification and document tracking
            </p>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Check
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Checks"
          value={stats.total}
          icon={<FileCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Valid"
          value={stats.valid}
          icon={<FileCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Expiring Soon"
          value={stats.expiringSoon}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          title="Expired"
          value={stats.expired}
          icon={<AlertTriangle className="h-5 w-5" />}
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "valid", label: "Valid" },
            { value: "expiring_soon", label: "Expiring Soon" },
            { value: "expired", label: "Expired" },
            { value: "pending", label: "Pending Review" },
            { value: "not_checked", label: "Not Checked" },
          ]}
        />
        <Select
          value={documentTypeFilter}
          onChange={(e) => setDocumentTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Document Types" },
            { value: "uk_passport", label: "UK Passport" },
            { value: "biometric_residence_permit", label: "Biometric Residence Permit" },
            { value: "share_code", label: "Share Code" },
            { value: "right_to_work_visa", label: "Right to Work Visa" },
            { value: "settled_status", label: "Settled Status" },
            { value: "pre_settled_status", label: "Pre-Settled Status" },
            { value: "birth_certificate", label: "UK Birth Certificate" },
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
              <FileCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No right-to-work checks found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || statusFilter || documentTypeFilter
                  ? "Try adjusting your filters"
                  : "Record your first right-to-work check to get started"}
              </p>
              {!search && !statusFilter && !documentTypeFilter && (
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Check
                </Button>
              )}
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
