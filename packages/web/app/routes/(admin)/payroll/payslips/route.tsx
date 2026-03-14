export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Receipt,
  Plus,
  FileText,
  CheckCircle,
  Clock,
  Send,
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
import { api } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

interface Payslip {
  id: string;
  tenant_id: string;
  employee_id: string;
  pay_period_id: string | null;
  gross_pay: number;
  net_pay: number;
  tax_deducted: number;
  ni_employee: number;
  ni_employer: number;
  pension_employee: number;
  pension_employer: number;
  other_deductions: Record<string, unknown>[];
  other_additions: Record<string, unknown>[];
  payment_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PayslipListResponse {
  items: Payslip[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  issued: "Issued",
};

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  draft: "secondary",
  approved: "warning",
  issued: "success",
};

// =============================================================================
// Forms
// =============================================================================

interface CreatePayslipForm {
  employee_id: string;
  pay_period_id: string;
  gross_pay: string;
  net_pay: string;
  tax_deducted: string;
  ni_employee: string;
  ni_employer: string;
  pension_employee: string;
  pension_employer: string;
  payment_date: string;
}

const INITIAL_FORM: CreatePayslipForm = {
  employee_id: "",
  pay_period_id: "",
  gross_pay: "",
  net_pay: "",
  tax_deducted: "",
  ni_employee: "",
  ni_employer: "",
  pension_employee: "0",
  pension_employer: "0",
  payment_date: new Date().toISOString().split("T")[0],
};

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

// =============================================================================
// Component
// =============================================================================

export default function AdminPayslipsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [employeeId, setEmployeeId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreatePayslipForm>(INITIAL_FORM);

  const { data: payslipsData, isLoading } = useQuery({
    queryKey: ["admin-payslips", employeeId, statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<PayslipListResponse>(
        `/payslips/employee/${employeeId}`,
        { params }
      );
    },
    enabled: !!employeeId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/payslips", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payslips"] });
      toast.success("Payslip created successfully");
      setShowCreateModal(false);
      setFormData(INITIAL_FORM);
    },
    onError: () => {
      toast.error("Failed to create payslip");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/payslips/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payslips"] });
      toast.success("Payslip status updated");
    },
    onError: () => {
      toast.error("Failed to update payslip status");
    },
  });

  const items = payslipsData?.items ?? [];

  const totalPayslips = items.length;
  const draftPayslips = items.filter((p) => p.status === "draft").length;
  const issuedPayslips = items.filter((p) => p.status === "issued").length;

  const handleCreateSubmit = () => {
    if (!formData.employee_id.trim()) {
      toast.warning("Please enter an employee ID");
      return;
    }
    if (!formData.gross_pay || !formData.net_pay || !formData.tax_deducted || !formData.ni_employee || !formData.ni_employer) {
      toast.warning("Please fill in all required pay fields");
      return;
    }

    const payload: Record<string, unknown> = {
      employee_id: formData.employee_id.trim(),
      gross_pay: Number(formData.gross_pay),
      net_pay: Number(formData.net_pay),
      tax_deducted: Number(formData.tax_deducted),
      ni_employee: Number(formData.ni_employee),
      ni_employer: Number(formData.ni_employer),
      pension_employee: Number(formData.pension_employee || 0),
      pension_employer: Number(formData.pension_employer || 0),
      payment_date: formData.payment_date,
    };
    if (formData.pay_period_id) {
      payload.pay_period_id = formData.pay_period_id.trim();
    }

    createMutation.mutate(payload);
  };

  const columns: ColumnDef<Payslip>[] = [
    {
      id: "payment_date",
      header: "Payment Date",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
            <Receipt className="h-5 w-5 text-green-600" />
          </div>
          <span className="font-medium text-gray-900">
            {new Date(row.payment_date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      ),
    },
    {
      id: "gross_pay",
      header: "Gross Pay",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {formatCurrency(row.gross_pay)}
        </span>
      ),
    },
    {
      id: "deductions",
      header: "Deductions",
      cell: ({ row }) => {
        const totalDeductions = row.tax_deducted + row.ni_employee + row.pension_employee;
        return (
          <span className="text-sm text-red-600">
            -{formatCurrency(totalDeductions)}
          </span>
        );
      },
    },
    {
      id: "net_pay",
      header: "Net Pay",
      cell: ({ row }) => (
        <span className="text-sm font-bold text-green-700">
          {formatCurrency(row.net_pay)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={STATUS_BADGE_VARIANTS[row.status] ?? "default"}
          dot
          rounded
        >
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        if (row.status === "draft") {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                statusMutation.mutate({ id: row.id, status: "approved" })
              }
              disabled={statusMutation.isPending}
            >
              Approve
            </Button>
          );
        }
        if (row.status === "approved") {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                statusMutation.mutate({ id: row.id, status: "issued" })
              }
              disabled={statusMutation.isPending}
            >
              <Send className="h-3 w-3 mr-1" />
              Issue
            </Button>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
          <p className="text-gray-600">
            Generate and manage employee payslips
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Generate Payslip
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Payslips</p>
              <p className="text-2xl font-bold">{totalPayslips}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Draft</p>
              <p className="text-2xl font-bold">{draftPayslips}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Issued</p>
              <p className="text-2xl font-bold">{issuedPayslips}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="min-w-[200px] max-w-xs">
          <Input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "draft", label: "Draft" },
            { value: "approved", label: "Approved" },
            { value: "issued", label: "Issued" },
          ]}
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {!employeeId ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                Enter an Employee ID
              </h3>
              <p className="text-gray-500">
                Enter an employee ID above to view their payslips
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No payslips found
              </h3>
              <p className="text-gray-500 mb-4">
                No payslips for this employee yet
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Generate Payslip
              </Button>
            </div>
          ) : (
            <DataTable
              data={items}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(INITIAL_FORM);
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Generate Payslip</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Employee ID"
                  placeholder="UUID"
                  required
                  value={formData.employee_id}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_id: e.target.value })
                  }
                />
                <Input
                  label="Pay Period ID (optional)"
                  placeholder="UUID"
                  value={formData.pay_period_id}
                  onChange={(e) =>
                    setFormData({ ...formData, pay_period_id: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Gross Pay"
                  type="number"
                  placeholder="0.00"
                  required
                  value={formData.gross_pay}
                  onChange={(e) =>
                    setFormData({ ...formData, gross_pay: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
                <Input
                  label="Net Pay"
                  type="number"
                  placeholder="0.00"
                  required
                  value={formData.net_pay}
                  onChange={(e) =>
                    setFormData({ ...formData, net_pay: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Input
                  label="Tax (PAYE)"
                  type="number"
                  placeholder="0.00"
                  required
                  value={formData.tax_deducted}
                  onChange={(e) =>
                    setFormData({ ...formData, tax_deducted: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
                <Input
                  label="NI (Employee)"
                  type="number"
                  placeholder="0.00"
                  required
                  value={formData.ni_employee}
                  onChange={(e) =>
                    setFormData({ ...formData, ni_employee: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
                <Input
                  label="NI (Employer)"
                  type="number"
                  placeholder="0.00"
                  required
                  value={formData.ni_employer}
                  onChange={(e) =>
                    setFormData({ ...formData, ni_employer: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Pension (Employee)"
                  type="number"
                  placeholder="0.00"
                  value={formData.pension_employee}
                  onChange={(e) =>
                    setFormData({ ...formData, pension_employee: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
                <Input
                  label="Pension (Employer)"
                  type="number"
                  placeholder="0.00"
                  value={formData.pension_employer}
                  onChange={(e) =>
                    setFormData({ ...formData, pension_employer: e.target.value })
                  }
                  min={0}
                  step="0.01"
                />
              </div>

              <Input
                label="Payment Date"
                type="date"
                required
                value={formData.payment_date}
                onChange={(e) =>
                  setFormData({ ...formData, payment_date: e.target.value })
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(INITIAL_FORM);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={
                !formData.employee_id.trim() ||
                !formData.gross_pay ||
                !formData.net_pay ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Generating..." : "Generate Payslip"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
