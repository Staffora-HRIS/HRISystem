export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Search,
  Heart,
  Clock,
  Ban,
  ArrowLeft,
  Download,
  Plus,
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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

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
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

const COVERAGE_OPTIONS = [
  { value: "employee_only", label: "Employee Only" },
  { value: "employee_spouse", label: "Employee + Spouse" },
  { value: "employee_children", label: "Employee + Children" },
  { value: "family", label: "Family" },
];

const ENROLLMENT_TYPE_OPTIONS = [
  { value: "new_hire", label: "New Hire" },
  { value: "open_enrollment", label: "Open Enrollment" },
  { value: "life_event", label: "Life Event" },
];

interface CreateEnrollmentForm {
  employeeId: string;
  planId: string;
  coverageLevel: string;
  effectiveFrom: string;
  enrollmentType: string;
}

const initialEnrollmentForm: CreateEnrollmentForm = {
  employeeId: "",
  planId: "",
  coverageLevel: "employee_only",
  effectiveFrom: new Date().toISOString().split("T")[0],
  enrollmentType: "new_hire",
};

interface PlanOption {
  id: string;
  name: string;
  category: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BenefitsEnrollmentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [enrollForm, setEnrollForm] = useState<CreateEnrollmentForm>(initialEnrollmentForm);

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

  // Fetch plans for the enrollment form dropdown
  const { data: plansData } = useQuery({
    queryKey: ["admin-benefit-plans-options"],
    queryFn: () => api.get<{ items: PlanOption[] }>("/benefits/plans"),
    enabled: showCreateModal,
  });

  const planOptions = plansData?.items ?? [];

  // Create enrollment mutation
  const createEnrollmentMutation = useMutation({
    mutationFn: (data: {
      employee_id: string;
      plan_id: string;
      coverage_level: string;
      effective_from: string;
      enrollment_type?: string;
    }) => api.post("/benefits/enrollments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-benefit-enrollments"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.benefits.enrollments() });
      toast.success("Employee enrolled successfully");
      setShowCreateModal(false);
      setEnrollForm(initialEnrollmentForm);
    },
    onError: () => {
      toast.error("Failed to create enrollment", {
        message: "Please check your input and try again.",
      });
    },
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk approve pending enrollments
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          api.put(`/benefits/enrollments/${id}`, { status: "active" })
        )
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`${failed} of ${ids.length} activations failed`);
      }
      return results;
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["admin-benefit-enrollments"] });
      toast.success(`${ids.length} enrollment${ids.length > 1 ? "s" : ""} activated`);
      setSelectedIds(new Set());
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ["admin-benefit-enrollments"] });
      toast.error("Some activations failed", {
        message: error instanceof Error ? error.message : "Please try again.",
      });
      setSelectedIds(new Set());
    },
  });

  const handleCreateEnrollment = () => {
    if (!enrollForm.employeeId.trim()) {
      toast.warning("Please enter an employee ID");
      return;
    }
    if (!enrollForm.planId) {
      toast.warning("Please select a plan");
      return;
    }
    if (!enrollForm.effectiveFrom) {
      toast.warning("Please select an effective date");
      return;
    }
    createEnrollmentMutation.mutate({
      employee_id: enrollForm.employeeId.trim(),
      plan_id: enrollForm.planId,
      coverage_level: enrollForm.coverageLevel,
      effective_from: enrollForm.effectiveFrom,
      enrollment_type: enrollForm.enrollmentType || undefined,
    });
  };

  const enrollments = data?.items ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkActivate = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkApproveMutation.mutate(ids);
  };

  const handleExportEnrollments = useCallback(() => {
    if (!enrollments.length) {
      toast.info("No data to export");
      return;
    }
    const headers = [
      "Employee Name",
      "Plan Name",
      "Plan Type",
      "Coverage Level",
      "Status",
      "Effective Date",
      "Termination Date",
      "Employee Contribution",
      "Employer Contribution",
      "Created At",
    ];
    const rows = enrollments.map((e) => [
      e.employeeName ?? "",
      e.planName ?? "",
      e.planType ?? "",
      COVERAGE_LABELS[e.coverageLevel] || e.coverageLevel,
      STATUS_LABELS[e.status] || e.status,
      e.effectiveDate,
      e.terminationDate ?? "",
      e.employeeContribution !== null ? String(e.employeeContribution) : "",
      e.employerContribution !== null ? String(e.employerContribution) : "",
      e.createdAt,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `benefits-enrollments-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Enrollments data exported");
  }, [enrollments, toast]);

  const stats = useMemo(() => ({
    total: enrollments.length,
    active: enrollments.filter((e) => e.status === "active").length,
    pending: enrollments.filter((e) => e.status === "pending").length,
    waived: enrollments.filter((e) => e.status === "waived").length,
  }), [enrollments]);

  const columns = useMemo<ColumnDef<BenefitEnrollment>[]>(() => [
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
      id: "select",
      header: "",
      cell: ({ row }) => {
        if (row.status !== "pending") return null;
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleSelect(row.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select enrollment for ${row.employeeName || "employee"}`}
            className="rounded border-gray-300"
          />
        );
      },
    },
  ], [selectedIds, toggleSelect]);

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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              onClick={handleBulkActivate}
              disabled={bulkApproveMutation.isPending}
            >
              {bulkApproveMutation.isPending
                ? "Activating..."
                : `Activate ${selectedIds.size} Selected`}
            </Button>
          )}
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Enroll Employee
          </Button>
          <Button variant="outline" onClick={handleExportEnrollments}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
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

      {/* Enroll Employee Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setEnrollForm(initialEnrollmentForm);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Enroll Employee in Benefit Plan</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Employee ID"
                placeholder="Enter employee UUID"
                required
                value={enrollForm.employeeId}
                onChange={(e) =>
                  setEnrollForm({ ...enrollForm, employeeId: e.target.value })
                }
              />
              <Select
                label="Benefit Plan"
                required
                value={enrollForm.planId}
                onChange={(e) =>
                  setEnrollForm({ ...enrollForm, planId: e.target.value })
                }
                options={[
                  { value: "", label: "Select a plan" },
                  ...planOptions.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.category})`,
                  })),
                ]}
              />
              <Select
                label="Coverage Level"
                required
                value={enrollForm.coverageLevel}
                onChange={(e) =>
                  setEnrollForm({ ...enrollForm, coverageLevel: e.target.value })
                }
                options={COVERAGE_OPTIONS}
              />
              <Input
                label="Effective From"
                type="date"
                required
                value={enrollForm.effectiveFrom}
                onChange={(e) =>
                  setEnrollForm({ ...enrollForm, effectiveFrom: e.target.value })
                }
              />
              <Select
                label="Enrollment Type"
                value={enrollForm.enrollmentType}
                onChange={(e) =>
                  setEnrollForm({ ...enrollForm, enrollmentType: e.target.value })
                }
                options={ENROLLMENT_TYPE_OPTIONS}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setEnrollForm(initialEnrollmentForm);
              }}
              disabled={createEnrollmentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEnrollment}
              disabled={
                !enrollForm.employeeId.trim() ||
                !enrollForm.planId ||
                !enrollForm.effectiveFrom ||
                createEnrollmentMutation.isPending
              }
            >
              {createEnrollmentMutation.isPending ? "Enrolling..." : "Enroll Employee"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
