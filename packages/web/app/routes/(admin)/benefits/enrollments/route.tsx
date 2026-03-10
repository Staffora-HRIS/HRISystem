import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Search,
  Heart,
  Clock,
  Ban,
  MoreHorizontal,
  ArrowLeft,
  Download,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  Button,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface BenefitEnrollment {
  id: string;
  employeeId: string;
  employeeName: string | null;
  planId: string;
  planName: string | null;
  planType: string | null;
  coverageLevel: string;
  status: string;
  effectiveDate: string;
  terminationDate: string | null;
  employeeContribution: number | null;
  employerContribution: number | null;
  createdAt: string;
}

interface EnrollmentListResponse {
  items: BenefitEnrollment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANT: Record<string, string> = {
  active: "success",
  pending: "warning",
  waived: "secondary",
  terminated: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  waived: "Waived",
  terminated: "Terminated",
};

const PLAN_TYPE_BADGE_VARIANT: Record<string, string> = {
  medical: "info",
  dental: "primary",
  vision: "secondary",
  life: "success",
  disability: "warning",
  retirement: "default",
};

const PLAN_TYPE_LABELS: Record<string, string> = {
  medical: "Medical",
  dental: "Dental",
  vision: "Vision",
  life: "Life",
  disability: "Disability",
  retirement: "Retirement",
};

const COVERAGE_LABELS: Record<string, string> = {
  employee_only: "Employee Only",
  employee_spouse: "Employee + Spouse",
  employee_children: "Employee + Children",
  family: "Family",
};

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BenefitsEnrollmentsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-benefit-enrollments", search, statusFilter, planTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (planTypeFilter) params.set("planType", planTypeFilter);
      params.set("limit", "50");
      return api.get<EnrollmentListResponse>(`/benefits/enrollments?${params}`);
    },
  });

  const enrollments = data?.items ?? [];

  const stats = {
    total: enrollments.length,
    active: enrollments.filter((e) => e.status === "active").length,
    pending: enrollments.filter((e) => e.status === "pending").length,
    waived: enrollments.filter((e) => e.status === "waived").length,
  };

  const columns: ColumnDef<BenefitEnrollment>[] = [
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
            <div className="font-medium text-gray-900">
              {row.employeeName || "Unknown"}
            </div>
          </div>
        );
      },
    },
    {
      id: "plan",
      header: "Plan",
      cell: ({ row }) => (
        <div className="text-sm font-medium text-gray-900">
          {row.planName || "-"}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.planType || "unknown";
        return (
          <Badge variant={PLAN_TYPE_BADGE_VARIANT[type] as any}>
            {PLAN_TYPE_LABELS[type] || type}
          </Badge>
        );
      },
    },
    {
      id: "coverage",
      header: "Coverage Level",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {COVERAGE_LABELS[row.coverageLevel] || row.coverageLevel}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE_VARIANT[row.status] as any}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "effectiveDate",
      header: "Effective Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {formatDate(row.effectiveDate)}
        </div>
      ),
    },
    {
      id: "employeeCost",
      header: "Employee Cost",
      align: "right",
      cell: ({ row }) => (
        <div className="text-sm font-medium text-gray-900">
          {formatCurrency(row.employeeContribution)}
        </div>
      ),
    },
    {
      id: "employerCost",
      header: "Employer Cost",
      align: "right",
      cell: ({ row }) => (
        <div className="text-sm font-medium text-green-600">
          {formatCurrency(row.employerContribution)}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: () => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toast.info("Coming Soon", {
              message: "Enrollment detail view will be available in a future update.",
            });
          }}
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
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/admin/benefits")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Benefits Enrollments
            </h1>
            <p className="text-gray-600">
              Manage employee benefit enrollments
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            toast.info("Coming Soon", {
              message: "Enrollment export will be available in a future update.",
            })
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Enrollments</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Heart className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <Ban className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Waived</p>
              <p className="text-2xl font-bold">{stats.waived}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search enrollments..."
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
            { value: "pending", label: "Pending" },
            { value: "waived", label: "Waived" },
            { value: "terminated", label: "Terminated" },
          ]}
        />
        <Select
          value={planTypeFilter}
          onChange={(e) => setPlanTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Plan Types" },
            { value: "medical", label: "Medical" },
            { value: "dental", label: "Dental" },
            { value: "vision", label: "Vision" },
            { value: "life", label: "Life Insurance" },
            { value: "disability", label: "Disability" },
            { value: "retirement", label: "Retirement" },
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
          ) : enrollments.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No enrollments found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter || planTypeFilter
                  ? "Try adjusting your filters"
                  : "No benefit enrollments recorded yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={enrollments}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
