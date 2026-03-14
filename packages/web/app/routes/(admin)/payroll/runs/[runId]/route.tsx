export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Calculator,
  CheckCircle,
  Download,
  PoundSterling,
  Users,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Button,
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

type PaymentMethod = "bacs" | "faster_payments" | "cheque" | "cash";

interface PayrollLine {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName?: string;
  employeeNumber?: string;
  basicPay: string;
  overtimePay: string;
  bonusPay: string;
  totalGross: string;
  taxDeduction: string;
  niEmployee: string;
  niEmployer: string;
  pensionEmployee: string;
  pensionEmployer: string;
  studentLoan: string;
  otherDeductions: string;
  totalDeductions: string;
  netPay: string;
  taxCode: string | null;
  niCategory: string | null;
  paymentMethod: PaymentMethod;
}

interface PayrollRunDetail {
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
  lines: PayrollLine[];
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PayrollRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Fetch payroll run detail
  const {
    data: run,
    isLoading,
    isError,
    error: fetchError,
  } = useQuery({
    queryKey: queryKeys.payroll.run(runId!),
    queryFn: () => api.get<PayrollRunDetail>(`/payroll/runs/${runId}`),
    enabled: !!runId,
  });

  // Calculate mutation
  const calculateMutation = useMutation({
    mutationFn: () => api.post(`/payroll/runs/${runId}/calculate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.run(runId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.runs() });
      toast.success("Payroll calculated successfully. Run is now in review.");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to calculate payroll";
      toast.error(message);
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: () => api.patch(`/payroll/runs/${runId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.run(runId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.payroll.runs() });
      toast.success("Payroll run approved successfully");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to approve payroll run";
      toast.error(message);
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<string>(
        `/payroll/runs/${runId}/export`,
        { format: "csv" },
      );
      return response;
    },
    onSuccess: (csvContent) => {
      // Download the CSV
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payroll-run-${runId}-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Payroll data exported successfully");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to export payroll data";
      toast.error(message);
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Error state
  if (isError || !run) {
    return (
      <div className="text-center py-24">
        <AlertTriangle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">
          Failed to load payroll run
        </h3>
        <p className="text-gray-500 mb-4">
          {fetchError instanceof ApiError
            ? fetchError.message
            : "The payroll run could not be found or an error occurred."}
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/payroll/runs")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Payroll Runs
        </Button>
      </div>
    );
  }

  const statusBadge = STATUS_BADGE[run.status];
  const lines = run.lines ?? [];
  const isAnyMutating =
    calculateMutation.isPending ||
    approveMutation.isPending ||
    exportMutation.isPending;

  const columns: ColumnDef<PayrollLine>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-gray-900">
            {row.employeeName || "-"}
          </div>
          <div className="text-sm text-gray-500">
            {row.employeeNumber || "-"}
          </div>
        </div>
      ),
    },
    {
      id: "basicPay",
      header: "Basic Pay",
      cell: ({ row }) => (
        <span className="text-sm">{formatCurrency(row.basicPay)}</span>
      ),
    },
    {
      id: "overtimePay",
      header: "Overtime",
      cell: ({ row }) => (
        <span className="text-sm">{formatCurrency(row.overtimePay)}</span>
      ),
    },
    {
      id: "bonusPay",
      header: "Bonus",
      cell: ({ row }) => (
        <span className="text-sm">{formatCurrency(row.bonusPay)}</span>
      ),
    },
    {
      id: "totalGross",
      header: "Gross",
      cell: ({ row }) => (
        <span className="text-sm font-medium">{formatCurrency(row.totalGross)}</span>
      ),
    },
    {
      id: "taxDeduction",
      header: "Tax",
      cell: ({ row }) => (
        <span className="text-sm text-red-600">{formatCurrency(row.taxDeduction)}</span>
      ),
    },
    {
      id: "niEmployee",
      header: "NI",
      cell: ({ row }) => (
        <span className="text-sm text-red-600">{formatCurrency(row.niEmployee)}</span>
      ),
    },
    {
      id: "pensionEmployee",
      header: "Pension",
      cell: ({ row }) => (
        <span className="text-sm text-red-600">
          {formatCurrency(row.pensionEmployee)}
        </span>
      ),
    },
    {
      id: "netPay",
      header: "Net Pay",
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-green-700">
          {formatCurrency(row.netPay)}
        </span>
      ),
    },
  ];

  // Compute totals for the summary row
  const sumLines = (field: keyof PayrollLine) =>
    lines.reduce((acc, line) => acc + parseFloat((line[field] as string) || "0"), 0);

  return (
    <div className="space-y-6">
      {/* Back Link + Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/payroll/runs")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Run Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {RUN_TYPE_LABELS[run.runType] || run.runType} Payroll
            </h1>
            <Badge variant={statusBadge?.variant ?? "secondary"} dot rounded>
              {statusBadge?.label ?? run.status}
            </Badge>
          </div>
          <p className="text-gray-600 mt-1">
            {formatPeriod(run.payPeriodStart, run.payPeriodEnd)}
            {" | "}Pay date: {formatDate(run.payDate)}
          </p>
          {run.notes && (
            <p className="text-sm text-gray-500 mt-1">{run.notes}</p>
          )}
          {run.approvedAt && (
            <p className="text-sm text-gray-500 mt-1">
              Approved on {formatDate(run.approvedAt)}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {run.status === "draft" && (
            <Button
              onClick={() => calculateMutation.mutate()}
              disabled={isAnyMutating}
            >
              <Calculator className="h-4 w-4 mr-2" />
              {calculateMutation.isPending ? "Calculating..." : "Calculate"}
            </Button>
          )}
          {run.status === "review" && (
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={isAnyMutating}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {approveMutation.isPending ? "Approving..." : "Approve"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={isAnyMutating}
          >
            <Download className="h-4 w-4 mr-2" />
            {exportMutation.isPending ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Employees</p>
              <p className="text-lg font-bold">{run.employeeCount}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <PoundSterling className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Gross</p>
              <p className="text-lg font-bold">{formatCurrency(run.totalGross)}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <PoundSterling className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Deductions</p>
              <p className="text-lg font-bold">
                {formatCurrency(run.totalDeductions)}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <PoundSterling className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Net Pay</p>
              <p className="text-lg font-bold text-green-700">
                {formatCurrency(run.totalNet)}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Payroll Lines Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            Employee Breakdown
          </h2>
        </CardHeader>
        <CardBody className="p-0">
          {lines.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No payroll lines yet
              </h3>
              <p className="text-gray-500">
                {run.status === "draft"
                  ? "Calculate the payroll to generate employee line items."
                  : "No employee data is available for this run."}
              </p>
            </div>
          ) : (
            <>
              <DataTable
                data={lines}
                columns={columns}
                getRowId={(row) => row.id}
              />
              {/* Summary Totals Row */}
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                <div className="grid grid-cols-9 gap-2 text-sm font-semibold">
                  <div className="text-gray-700">Totals</div>
                  <div>{formatCurrency(sumLines("basicPay"))}</div>
                  <div>{formatCurrency(sumLines("overtimePay"))}</div>
                  <div>{formatCurrency(sumLines("bonusPay"))}</div>
                  <div>{formatCurrency(sumLines("totalGross"))}</div>
                  <div className="text-red-600">
                    {formatCurrency(sumLines("taxDeduction"))}
                  </div>
                  <div className="text-red-600">
                    {formatCurrency(sumLines("niEmployee"))}
                  </div>
                  <div className="text-red-600">
                    {formatCurrency(sumLines("pensionEmployee"))}
                  </div>
                  <div className="text-green-700">
                    {formatCurrency(sumLines("netPay"))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Employer Costs Card */}
      {lines.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Employer Costs
            </h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-gray-500">Employer NI</p>
                <p className="text-xl font-bold">
                  {formatCurrency(sumLines("niEmployer"))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Employer Pension</p>
                <p className="text-xl font-bold">
                  {formatCurrency(sumLines("pensionEmployer"))}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Employer Costs</p>
                <p className="text-xl font-bold text-blue-700">
                  {formatCurrency(run.totalEmployerCosts)}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
