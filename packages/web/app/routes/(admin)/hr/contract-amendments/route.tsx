export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  FilePenLine,
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
  Select,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface ContractAmendment {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  amendmentType: string;
  reason: string | null;
  effectiveDate: string;
  status: string;
  createdAt: string;
}

interface ContractAmendmentListResponse {
  items: ContractAmendment[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  draft: "secondary",
  pending: "warning",
  approved: "success",
  applied: "success",
  rejected: "error",
  cancelled: "default",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  applied: "Applied",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const TYPE_LABELS: Record<string, string> = {
  role_change: "Role Change",
  salary_change: "Salary Change",
  hours_change: "Hours Change",
  location_change: "Location Change",
  department_transfer: "Department Transfer",
  promotion: "Promotion",
  demotion: "Demotion",
  terms_update: "Terms Update",
  other: "Other",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CreateAmendmentFormState {
  employeeId: string;
  amendmentType: string;
  reason: string;
  effectiveDate: string;
}

const INITIAL_AMENDMENT_FORM: CreateAmendmentFormState = {
  employeeId: "",
  amendmentType: "",
  reason: "",
  effectiveDate: "",
};

export default function ContractAmendmentsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAmendmentFormState>(INITIAL_AMENDMENT_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-contract-amendments", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<ContractAmendmentListResponse>(`/contract-amendments?${params}`);
    },
  });

  const createAmendmentMutation = useMutation({
    mutationFn: (formData: CreateAmendmentFormState) =>
      api.post("/contract-amendments", {
        employee_id: formData.employeeId,
        amendment_type: formData.amendmentType,
        reason: formData.reason,
        effective_date: formData.effectiveDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hr-contract-amendments"] });
      toast.success("Contract amendment created successfully");
      setShowCreateModal(false);
      setCreateForm(INITIAL_AMENDMENT_FORM);
    },
    onError: (err) => {
      toast.error("Failed to create amendment", {
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    },
  });

  const handleCreateSubmit = () => {
    if (!createForm.employeeId || !createForm.amendmentType || !createForm.effectiveDate) return;
    createAmendmentMutation.mutate(createForm);
  };

  const amendments = data?.items ?? [];

  const columns: ColumnDef<ContractAmendment>[] = [
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
      id: "amendmentType",
      header: "Amendment Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">
          {TYPE_LABELS[row.amendmentType] || row.amendmentType}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 truncate max-w-[200px] block">
          {row.reason || "-"}
        </span>
      ),
    },
    {
      id: "effectiveDate",
      header: "Effective Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.effectiveDate)}</span>
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
    {
      id: "createdAt",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.createdAt)}</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Contract Amendments</h1>
            <p className="text-gray-600">Manage changes to employee contracts and terms</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Amendment
          </Button>
        </div>
      </div>

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
            { value: "draft", label: "Draft" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "applied", label: "Applied" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
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
          ) : amendments.length === 0 ? (
            <div className="text-center py-12">
              <FilePenLine className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No contract amendments found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No contract amendments have been created"}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Amendment
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={amendments}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Amendment Modal */}
      {showCreateModal && (
        <Modal open onClose={() => { setShowCreateModal(false); setCreateForm(INITIAL_AMENDMENT_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">New Contract Amendment</h3>
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
              <Select
                label="Amendment Type"
                required
                value={createForm.amendmentType}
                onChange={(e) => setCreateForm((f) => ({ ...f, amendmentType: e.target.value }))}
                options={[
                  { value: "", label: "Select amendment type" },
                  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
                ]}
              />
              <Input
                label="Reason"
                placeholder="Reason for the amendment"
                value={createForm.reason}
                onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
              />
              <Input
                label="Effective Date"
                type="date"
                required
                value={createForm.effectiveDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setCreateForm(INITIAL_AMENDMENT_FORM); }} disabled={createAmendmentMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!createForm.employeeId || !createForm.amendmentType || !createForm.effectiveDate || createAmendmentMutation.isPending}
              loading={createAmendmentMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {createAmendmentMutation.isPending ? "Creating..." : "Create Amendment"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
