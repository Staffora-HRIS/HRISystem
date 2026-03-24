import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ArrowLeft, Plus, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Select,
  Textarea,
  useToast,
  type ColumnDef,
} from "~/components/ui";
import { api, ApiError } from "~/lib/api-client";

interface Delegation {
  delegationId: string;
  delegateName: string;
  scope: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  usageCount: number;
}

interface DelegationsResponse {
  items: Delegation[];
}

const SCOPE_LABELS: Record<string, string> = {
  all: "All",
  leave: "Leave",
  expenses: "Expenses",
  time: "Time",
  purchase: "Purchase",
};

const SCOPE_VARIANTS: Record<string, "primary" | "info" | "warning" | "secondary" | "success"> = {
  all: "primary",
  leave: "success",
  expenses: "warning",
  time: "info",
  purchase: "secondary",
};

interface DelegationFormData {
  delegatorId: string;
  delegateId: string;
  scope: string;
  startDate: string;
  endDate: string;
  reason: string;
}

const initialDelegationForm: DelegationFormData = {
  delegatorId: "",
  delegateId: "",
  scope: "all",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "",
  reason: "",
};

export default function DelegationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<DelegationFormData>(initialDelegationForm);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/delegations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-delegations"] });
      toast.success("Delegation created successfully");
      setShowCreateModal(false);
      setFormData(initialDelegationForm);
    },
    onError: (err) => {
      toast.error("Failed to create delegation", {
        message: err instanceof ApiError ? err.message : "Please check your input and try again.",
      });
    },
  });

  const handleCreateDelegation = () => {
    if (!formData.delegatorId.trim()) {
      toast.warning("Please enter a delegator employee ID");
      return;
    }
    if (!formData.delegateId.trim()) {
      toast.warning("Please enter a delegate employee ID");
      return;
    }
    if (!formData.startDate) {
      toast.warning("Please select a start date");
      return;
    }
    if (!formData.endDate) {
      toast.warning("Please select an end date");
      return;
    }
    if (new Date(formData.endDate) <= new Date(formData.startDate)) {
      toast.warning("End date must be after start date");
      return;
    }
    createMutation.mutate({
      delegatorId: formData.delegatorId.trim(),
      delegateId: formData.delegateId.trim(),
      scope: formData.scope,
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason.trim() || undefined,
    });
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-delegations"],
    queryFn: () => api.get<DelegationsResponse>("/delegations"),
  });

  const delegations = data?.items ?? [];

  const columns = useMemo<ColumnDef<Delegation>[]>(
    () => [
      {
        id: "delegateName",
        header: "Delegate",
        cell: ({ row }) => (
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {row.delegateName}
          </span>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge variant={SCOPE_VARIANTS[row.scope] ?? "secondary"}>
            {SCOPE_LABELS[row.scope] ?? row.scope}
          </Badge>
        ),
      },
      {
        id: "startDate",
        header: "Start Date",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {new Date(row.startDate).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "endDate",
        header: "End Date",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {new Date(row.endDate).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.isActive ? "success" : "secondary"} dot>
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "usageCount",
        header: "Usage",
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {row.usageCount}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/security")}
          aria-label="Back to Security"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Authority Delegations
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage approval authority delegations between users
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} aria-label="Add delegation">
          <Plus className="h-4 w-4 mr-2" />
          Add Delegation
        </Button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-red-400" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            Failed to load delegations
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {error instanceof ApiError
              ? error.message
              : "An unexpected error occurred."}
          </p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold">All Delegations</h2>
            </div>
          </CardHeader>
          <CardBody padding="none">
            <DataTable
              columns={columns}
              data={delegations}
              loading={isLoading}
              emptyMessage="No delegations found"
              emptyIcon={
                <ShieldCheck className="h-12 w-12 text-gray-300 mb-2" />
              }
            />
          </CardBody>
        </Card>
      )}

      {/* Create Delegation Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="md"
        aria-label="Add Delegation"
      >
        <ModalHeader
          title="Add Delegation"
          subtitle="Grant approval authority to another user for a specific period"
        />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label htmlFor="del-delegator" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Delegator (Employee ID) *
              </label>
              <Input
                id="del-delegator"
                type="text"
                value={formData.delegatorId}
                onChange={(e) => setFormData({ ...formData, delegatorId: e.target.value })}
                placeholder="Employee ID of the person delegating authority"
              />
            </div>
            <div>
              <label htmlFor="del-delegate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Delegate (Employee ID) *
              </label>
              <Input
                id="del-delegate"
                type="text"
                value={formData.delegateId}
                onChange={(e) => setFormData({ ...formData, delegateId: e.target.value })}
                placeholder="Employee ID of the person receiving authority"
              />
            </div>
            <div>
              <label htmlFor="del-scope" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Permission Scope *
              </label>
              <Select
                id="del-scope"
                value={formData.scope}
                onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                options={[
                  { value: "all", label: "All" },
                  { value: "leave", label: "Leave" },
                  { value: "expenses", label: "Expenses" },
                  { value: "time", label: "Time" },
                  { value: "purchase", label: "Purchase" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="del-start-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date *
                </label>
                <Input
                  id="del-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="del-end-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date *
                </label>
                <Input
                  id="del-end-date"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label htmlFor="del-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason
              </label>
              <Textarea
                id="del-reason"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g. Annual leave cover, Parental leave cover"
                rows={3}
              />
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateDelegation}
            disabled={
              !formData.delegatorId.trim() ||
              !formData.delegateId.trim() ||
              !formData.startDate ||
              !formData.endDate ||
              createMutation.isPending
            }
            loading={createMutation.isPending}
          >
            Create Delegation
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
