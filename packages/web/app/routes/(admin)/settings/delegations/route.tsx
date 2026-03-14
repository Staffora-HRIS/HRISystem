import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCheck,
  Plus,
  Search,
  MoreHorizontal,
  Clock,
  CheckCircle,
  XCircle,
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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface Delegation {
  id: string;
  delegatorId: string;
  delegatorName: string;
  delegateId: string;
  delegateName: string;
  scope: string;
  startDate: string;
  endDate: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DelegationListResponse {
  items: Delegation[];
  nextCursor: string | null;
  hasMore: boolean;
}

const SCOPE_LABELS: Record<string, string> = {
  leave_approval: "Leave Approval",
  expense_approval: "Expense Approval",
  timesheet_approval: "Timesheet Approval",
  case_management: "Case Management",
  all: "All Approvals",
};

const SCOPE_BADGE_VARIANTS: Record<string, string> = {
  leave_approval: "info",
  expense_approval: "warning",
  timesheet_approval: "primary",
  case_management: "secondary",
  all: "error",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  expired: "Expired",
  revoked: "Revoked",
};

const STATUS_BADGE_VARIANTS: Record<string, string> = {
  active: "success",
  pending: "warning",
  expired: "secondary",
  revoked: "error",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "No end date";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function DelegationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formDelegatorName, setFormDelegatorName] = useState("");
  const [formDelegateName, setFormDelegateName] = useState("");
  const [formScope, setFormScope] = useState("leave_approval");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formReason, setFormReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-delegations", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<DelegationListResponse>(
        `/security/delegations?${params}`
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      delegatorName: string;
      delegateName: string;
      scope: string;
      startDate: string;
      endDate?: string;
      reason?: string;
    }) => api.post("/security/delegations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-delegations"],
      });
      toast.success("Delegation created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to create delegation");
    },
  });

  const delegations = data?.items ?? [];

  const stats = {
    total: delegations.length,
    active: delegations.filter((d) => d.status === "active").length,
    pending: delegations.filter((d) => d.status === "pending").length,
  };

  function resetForm() {
    setFormDelegatorName("");
    setFormDelegateName("");
    setFormScope("leave_approval");
    setFormStartDate("");
    setFormEndDate("");
    setFormReason("");
  }

  function handleCreate() {
    if (!formDelegatorName.trim()) {
      toast.error("Delegator name is required");
      return;
    }
    if (!formDelegateName.trim()) {
      toast.error("Delegate name is required");
      return;
    }
    if (!formStartDate) {
      toast.error("Start date is required");
      return;
    }
    createMutation.mutate({
      delegatorName: formDelegatorName.trim(),
      delegateName: formDelegateName.trim(),
      scope: formScope,
      startDate: formStartDate,
      endDate: formEndDate || undefined,
      reason: formReason.trim() || undefined,
    });
  }

  function handleCloseModal() {
    if (!createMutation.isPending) {
      setShowCreateModal(false);
      resetForm();
    }
  }

  const columns: ColumnDef<Delegation>[] = [
    {
      id: "delegator",
      header: "Delegator",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.delegatorName}
        </div>
      ),
    },
    {
      id: "delegate",
      header: "Delegate",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.delegateName}
        </div>
      ),
    },
    {
      id: "scope",
      header: "Scope",
      cell: ({ row }) => (
        <Badge
          variant={
            (SCOPE_BADGE_VARIANTS[row.scope] || "secondary") as BadgeVariant
          }
        >
          {SCOPE_LABELS[row.scope] || row.scope}
        </Badge>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.startDate)}
        </div>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.endDate)}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            (STATUS_BADGE_VARIANTS[row.status] || "secondary") as BadgeVariant
          }
        >
          {row.status === "active" && (
            <CheckCircle className="h-3 w-3 mr-1" />
          )}
          {row.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
          {row.status === "revoked" && <XCircle className="h-3 w-3 mr-1" />}
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`Delegation: ${row.delegatorName} to ${row.delegateName}`, {
              message: `Scope: ${SCOPE_LABELS[row.scope] || row.scope} | Status: ${STATUS_LABELS[row.status] || row.status}`,
            });
          }}
          aria-label={`View details for delegation from ${row.delegatorName} to ${row.delegateName}`}
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Approval Delegations
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage approval delegations between employees
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Delegation
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Delegations"
          value={stats.total}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <StatCard
          title="Active"
          value={stats.active}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          title="Pending"
          value={stats.pending}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search delegations..."
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
            { value: "expired", label: "Expired" },
            { value: "revoked", label: "Revoked" },
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
          ) : delegations.length === 0 ? (
            <div className="text-center py-12">
              <UserCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                No delegations found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Create a delegation to allow another user to approve on someone's behalf."}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Delegation
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={delegations}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Delegation Modal */}
      <Modal open={showCreateModal} onClose={handleCloseModal} size="lg">
        <ModalHeader title="Create Delegation" />
        <ModalBody>
          <div className="space-y-4">
            <Input
              label="Delegator (From)"
              placeholder="Name of the person delegating approval authority"
              value={formDelegatorName}
              onChange={(e) => setFormDelegatorName(e.target.value)}
              required
              id="delegation-delegator"
            />
            <Input
              label="Delegate (To)"
              placeholder="Name of the person receiving approval authority"
              value={formDelegateName}
              onChange={(e) => setFormDelegateName(e.target.value)}
              required
              id="delegation-delegate"
            />
            <Select
              label="Scope"
              value={formScope}
              onChange={(e) => setFormScope(e.target.value)}
              options={[
                { value: "leave_approval", label: "Leave Approval" },
                { value: "expense_approval", label: "Expense Approval" },
                { value: "timesheet_approval", label: "Timesheet Approval" },
                { value: "case_management", label: "Case Management" },
                { value: "all", label: "All Approvals" },
              ]}
              id="delegation-scope"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                required
                id="delegation-start-date"
              />
              <Input
                label="End Date (Optional)"
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                id="delegation-end-date"
              />
            </div>
            <Input
              label="Reason (Optional)"
              placeholder="e.g. Annual leave cover"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              id="delegation-reason"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={handleCloseModal}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !formDelegatorName.trim() ||
              !formDelegateName.trim() ||
              !formStartDate ||
              createMutation.isPending
            }
            loading={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create Delegation"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
