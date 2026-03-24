export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  FileText,
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

interface ContractStatement {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  statementType: string;
  issueDate: string;
  effectiveDate: string;
  status: string;
  version: number | null;
}

interface ContractStatementListResponse {
  items: ContractStatement[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE: Record<string, BadgeVariant> = {
  draft: "secondary",
  issued: "info",
  acknowledged: "success",
  superseded: "default",
  revoked: "error",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  acknowledged: "Acknowledged",
  superseded: "Superseded",
  revoked: "Revoked",
};

const TYPE_LABELS: Record<string, string> = {
  initial: "Initial Statement",
  variation: "Variation",
  section_one: "Section 1 (Day One)",
  section_four: "Section 4 (Extended)",
  reissue: "Reissue",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CreateStatementFormState {
  employeeId: string;
  statementType: string;
  effectiveDate: string;
}

const INITIAL_STATEMENT_FORM: CreateStatementFormState = {
  employeeId: "",
  statementType: "",
  effectiveDate: "",
};

export default function ContractStatementsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateStatementFormState>(INITIAL_STATEMENT_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-contract-statements", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<ContractStatementListResponse>(`/contract-statements?${params}`);
    },
  });

  const createStatementMutation = useMutation({
    mutationFn: (formData: CreateStatementFormState) =>
      api.post("/contract-statements", {
        employee_id: formData.employeeId,
        statement_type: formData.statementType,
        effective_date: formData.effectiveDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hr-contract-statements"] });
      toast.success("Statement issued successfully");
      setShowCreateModal(false);
      setCreateForm(INITIAL_STATEMENT_FORM);
    },
    onError: (err) => {
      toast.error("Failed to issue statement", {
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    },
  });

  const handleCreateSubmit = () => {
    if (!createForm.employeeId || !createForm.statementType || !createForm.effectiveDate) return;
    createStatementMutation.mutate(createForm);
  };

  const statements = data?.items ?? [];

  const columns: ColumnDef<ContractStatement>[] = [
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
      id: "statementType",
      header: "Statement Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-900">
          {TYPE_LABELS[row.statementType] || row.statementType}
        </span>
      ),
    },
    {
      id: "issueDate",
      header: "Issue Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.issueDate)}</span>
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
      id: "version",
      header: "Version",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 font-mono">
          {row.version != null ? `v${row.version}` : "-"}
        </span>
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
            <h1 className="text-2xl font-bold text-gray-900">Written Statements of Employment</h1>
            <p className="text-gray-600">Manage statutory written statements and contract documentation</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Issue Statement
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
            { value: "issued", label: "Issued" },
            { value: "acknowledged", label: "Acknowledged" },
            { value: "superseded", label: "Superseded" },
            { value: "revoked", label: "Revoked" },
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
          ) : statements.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No statements found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No written statements have been issued"}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Issue Statement
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={statements}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Issue Statement Modal */}
      {showCreateModal && (
        <Modal open onClose={() => { setShowCreateModal(false); setCreateForm(INITIAL_STATEMENT_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Issue Written Statement</h3>
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
                label="Statement Type"
                required
                value={createForm.statementType}
                onChange={(e) => setCreateForm((f) => ({ ...f, statementType: e.target.value }))}
                options={[
                  { value: "", label: "Select statement type" },
                  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
                ]}
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
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setCreateForm(INITIAL_STATEMENT_FORM); }} disabled={createStatementMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!createForm.employeeId || !createForm.statementType || !createForm.effectiveDate || createStatementMutation.isPending}
              loading={createStatementMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {createStatementMutation.isPending ? "Issuing..." : "Issue Statement"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
