export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  PoundSterling,
  Plus,
  Calendar,
  Users,
  Banknote,
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
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PayrollRunStatus =
  | "draft"
  | "calculating"
  | "review"
  | "approved"
  | "submitted"
  | "paid";

type PayrollRunType = "monthly" | "weekly" | "supplemental";

interface PayrollRun {
  id: string;
  tenantId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  status: PayrollRunStatus;
  runType: PayrollRunType;
  employeeCount: number;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  totalEmployerCosts: string;
  approvedBy: string | null;
  approvedAt: string | null;
  submittedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollRunListResponse {
  items: PayrollRun[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CreateRunForm {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  runType: PayrollRunType;
  notes: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<PayrollRunStatus, { variant: BadgeVariant; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  calculating: { variant: "info", label: "Calculating" },
  review: { variant: "warning", label: "Review" },
  approved: { variant: "success", label: "Approved" },
  submitted: { variant: "primary", label: "Submitted" },
  paid: { variant: "success", label: "Paid" },
};

const RUN_TYPE_LABELS: Record<PayrollRunType, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  supplemental: "Supplemental",
};

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "\u00A30.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(num);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  const e = new Date(end).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${s} - ${e}`;
}

function getDefaultPeriod(): { start: string; end: string; payDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const payDate = new Date(year, month, 25);
  // If pay date is past or in a weekend, push to next valid day
  if (payDate < now) {
    payDate.setMonth(payDate.getMonth() + 1);
  }
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    payDate: payDate.toISOString().split("T")[0],
  };
}

const defaults = getDefaultPeriod();

const INITIAL_FORM: CreateRunForm = {
  payPeriodStart: defaults.start,
  payPeriodEnd: defaults.end,
  payDate: defaults.payDate,
  runType: "monthly",
  notes: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PayrollRunsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateRunForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CreateRunForm, string>>>({});

  // Fetch payroll runs
  const { data: runsData, isLoading } = useQuery({
    queryKey: queryKeys.payroll.runs({ status: statusFilter, type: typeFilter }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("run_type", typeFilter);
      params.set("limit", "50");
      return api.get<PayrollRunListResponse>(`/payroll/runs?${params}`);
    },
  });

  // Create run mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateRunForm) =>
      api.post("/payroll/runs", {
        pay_period_start: data.payPeriodStart,
        pay_period_end: data.payPeriodEnd,
        pay_date: data.payDate,
        run_type: data.runType,
        notes: data.notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.all() });
      toast.success("Payroll run created successfully");
      setShowCreateModal(false);
      setFormData(INITIAL_FORM);
      setFormErrors({});
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to create payroll run";
      toast.error(message);
    },
  });

  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof CreateRunForm, string>> = {};
    if (!formData.payPeriodStart) errors.payPeriodStart = "Period start is required";
    if (!formData.payPeriodEnd) errors.payPeriodEnd = "Period end is required";
    if (!formData.payDate) errors.payDate = "Pay date is required";
    if (
      formData.payPeriodStart &&
      formData.payPeriodEnd &&
      formData.payPeriodStart >= formData.payPeriodEnd
    ) {
      errors.payPeriodEnd = "Period end must be after period start";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleCreateSubmit = useCallback(() => {
    if (!validateForm()) return;
    createMutation.mutate(formData);
  }, [validateForm, createMutation, formData]);

  const runs = runsData?.items ?? [];

  // Compute summary stats
  const totalRuns = runs.length;
  const draftRuns = runs.filter((r) => r.status === "draft").length;
  const reviewRuns = runs.filter((r) => r.status === "review").length;
  const totalNetAll = runs.reduce((sum, r) => sum + parseFloat(r.totalNet || "0"), 0);

  const columns: ColumnDef<PayrollRun>[] = [
    {
      id: "period",
      header: "Period",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900">
            {formatPeriod(row.payPeriodStart, row.payPeriodEnd)}
          </div>
          <div className="text-sm text-gray-500">
            Pay date: {formatDate(row.payDate)}
          </div>
        </div>
      ),
    },
    {
      id: "runType",
      header: "Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-700 capitalize">
          {RUN_TYPE_LABELS[row.runType] || row.runType}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const badge = STATUS_BADGE[row.status];
        return (
          <Badge variant={badge?.variant ?? "secondary"} dot rounded>
            {badge?.label ?? row.status}
          </Badge>
        );
      },
    },
    {
      id: "employeeCount",
      header: "Employees",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.employeeCount}</span>
      ),
    },
    {
      id: "totalGross",
      header: "Total Gross",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {formatCurrency(row.totalGross)}
        </span>
      ),
    },
    {
      id: "totalNet",
      header: "Total Net",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-green-700">
          {formatCurrency(row.totalNet)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Runs</h1>
          <p className="text-gray-600">
            Create, calculate, and approve payroll runs
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Run
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <PoundSterling className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Runs</p>
              <p className="text-2xl font-bold">{totalRuns}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <Calendar className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Draft</p>
              <p className="text-2xl font-bold">{draftRuns}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Users className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Awaiting Review</p>
              <p className="text-2xl font-bold">{reviewRuns}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Banknote className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Net Pay</p>
              <p className="text-2xl font-bold">{formatCurrency(totalNetAll)}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "draft", label: "Draft" },
            { value: "calculating", label: "Calculating" },
            { value: "review", label: "Review" },
            { value: "approved", label: "Approved" },
            { value: "submitted", label: "Submitted" },
            { value: "paid", label: "Paid" },
          ]}
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "monthly", label: "Monthly" },
            { value: "weekly", label: "Weekly" },
            { value: "supplemental", label: "Supplemental" },
          ]}
        />
      </div>

      {/* Payroll Runs Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12">
              <PoundSterling className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No payroll runs found
              </h3>
              <p className="text-gray-500 mb-4">
                {statusFilter || typeFilter
                  ? "Try adjusting your filters"
                  : "Create your first payroll run to get started"}
              </p>
              {!statusFilter && !typeFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Run
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={runs}
              columns={columns}
              onRowClick={(row) => navigate(`/admin/payroll/runs/${row.id}`)}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Run Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            if (!createMutation.isPending) {
              setShowCreateModal(false);
              setFormData(INITIAL_FORM);
              setFormErrors({});
            }
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Payroll Run</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-gray-600 mb-4">
              Define the pay period and pay date for this payroll run.
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Period Start"
                  type="date"
                  required
                  value={formData.payPeriodStart}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, payPeriodStart: e.target.value }))
                  }
                  error={formErrors.payPeriodStart}
                />
                <Input
                  label="Period End"
                  type="date"
                  required
                  value={formData.payPeriodEnd}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, payPeriodEnd: e.target.value }))
                  }
                  error={formErrors.payPeriodEnd}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Pay Date"
                  type="date"
                  required
                  value={formData.payDate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, payDate: e.target.value }))
                  }
                  error={formErrors.payDate}
                />
                <Select
                  label="Run Type"
                  value={formData.runType}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      runType: e.target.value as PayrollRunType,
                    }))
                  }
                  options={[
                    { value: "monthly", label: "Monthly" },
                    { value: "weekly", label: "Weekly" },
                    { value: "supplemental", label: "Supplemental" },
                  ]}
                />
              </div>
              <div>
                <label
                  htmlFor="run-notes"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Notes
                </label>
                <textarea
                  id="run-notes"
                  rows={2}
                  placeholder="Optional notes for this payroll run..."
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(INITIAL_FORM);
                setFormErrors({});
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Run"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
