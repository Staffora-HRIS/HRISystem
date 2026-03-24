export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Landmark,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface BankDetail {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumberMasked: string;
  isPrimary: boolean;
  status: string;
}

interface BankDetailListResponse {
  items: BankDetail[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  pending_verification: "warning",
  inactive: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_verification: "Pending Verification",
  inactive: "Inactive",
};

function formatSortCode(sortCode: string): string {
  if (!sortCode) return "-";
  const cleaned = sortCode.replace(/\D/g, "");
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 4)}-${cleaned.slice(4, 6)}`;
  }
  return sortCode;
}

interface CreateBankDetailFormState {
  employeeId: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  isPrimary: boolean;
}

const INITIAL_BANK_DETAIL_FORM: CreateBankDetailFormState = {
  employeeId: "",
  bankName: "",
  accountName: "",
  sortCode: "",
  accountNumber: "",
  isPrimary: false,
};

export default function BankDetailsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBankDetailFormState>(INITIAL_BANK_DETAIL_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-bank-details", employeeIdFilter, search],
    queryFn: async () => {
      if (!employeeIdFilter.trim()) return { items: [], nextCursor: null, hasMore: false } as BankDetailListResponse;
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<BankDetailListResponse>(`/employees/${employeeIdFilter.trim()}/bank-details?${params}`);
    },
    enabled: !!employeeIdFilter.trim(),
  });

  const createBankDetailMutation = useMutation({
    mutationFn: (formData: CreateBankDetailFormState) =>
      api.post(`/employees/${formData.employeeId}/bank-details`, {
        bank_name: formData.bankName,
        account_name: formData.accountName,
        sort_code: formData.sortCode,
        account_number: formData.accountNumber,
        is_primary: formData.isPrimary,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hr-bank-details"] });
      toast.success("Bank details added successfully");
      setShowCreateModal(false);
      setCreateForm(INITIAL_BANK_DETAIL_FORM);
    },
    onError: (err) => {
      toast.error("Failed to add bank details", {
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    },
  });

  const handleCreateSubmit = () => {
    if (!createForm.employeeId || !createForm.bankName || !createForm.accountName || !createForm.sortCode || !createForm.accountNumber) return;
    createBankDetailMutation.mutate(createForm);
  };

  const bankDetails = data?.items ?? [];

  const columns: ColumnDef<BankDetail>[] = [
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
            <div>
              <div className="font-medium text-gray-900">{row.employeeName}</div>
              <div className="text-sm text-gray-500">{row.employeeNumber}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: "bankName",
      header: "Bank",
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">{row.bankName}</span>
      ),
    },
    {
      id: "accountName",
      header: "Account Name",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.accountName}</span>
      ),
    },
    {
      id: "sortCode",
      header: "Sort Code",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">{formatSortCode(row.sortCode)}</span>
      ),
    },
    {
      id: "accountNumber",
      header: "Account No.",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">{row.accountNumberMasked}</span>
      ),
    },
    {
      id: "isPrimary",
      header: "Primary",
      cell: ({ row }) => (
        <Badge variant={row.isPrimary ? "info" : "default"}>
          {row.isPrimary ? "Primary" : "Secondary"}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/hr"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to HR
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bank Details</h1>
            <p className="text-gray-600">Manage employee bank account information for payroll</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Bank Details
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <Input
          placeholder="Employee ID"
          value={employeeIdFilter}
          onChange={(e) => setEmployeeIdFilter(e.target.value)}
          className="max-w-[280px]"
        />
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : bankDetails.length === 0 ? (
            <div className="text-center py-12">
              <Landmark className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No bank details found</h3>
              <p className="text-gray-500 mb-4">
                {!employeeIdFilter.trim()
                  ? "Enter an employee ID above to view bank details"
                  : search
                    ? "Try adjusting your search"
                    : "No bank details found for this employee"}
              </p>
              {!search && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bank Details
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={bankDetails}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Add Bank Details Modal */}
      {showCreateModal && (
        <Modal open onClose={() => { setShowCreateModal(false); setCreateForm(INITIAL_BANK_DETAIL_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Bank Details</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Employee ID"
                placeholder="Enter employee ID"
                required
                value={createForm.employeeId}
                onChange={(e) => setCreateForm((f) => ({ ...f, employeeId: e.target.value }))}
              />
              <Input
                label="Bank Name"
                placeholder="Enter bank name"
                required
                value={createForm.bankName}
                onChange={(e) => setCreateForm((f) => ({ ...f, bankName: e.target.value }))}
              />
              <Input
                label="Account Name"
                placeholder="Enter account holder name"
                required
                value={createForm.accountName}
                onChange={(e) => setCreateForm((f) => ({ ...f, accountName: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Sort Code"
                  placeholder="00-00-00"
                  required
                  value={createForm.sortCode}
                  onChange={(e) => setCreateForm((f) => ({ ...f, sortCode: e.target.value }))}
                />
                <Input
                  label="Account Number"
                  placeholder="12345678"
                  required
                  value={createForm.accountNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, accountNumber: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.isPrimary}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Set as primary bank account</span>
              </label>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setCreateForm(INITIAL_BANK_DETAIL_FORM); }} disabled={createBankDetailMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!createForm.employeeId || !createForm.bankName || !createForm.accountName || !createForm.sortCode || !createForm.accountNumber || createBankDetailMutation.isPending}
              loading={createBankDetailMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {createBankDetailMutation.isPending ? "Adding..." : "Add Bank Details"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
