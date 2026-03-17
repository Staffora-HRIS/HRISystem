export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  Shield,
  Trash2,
  Edit,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
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

interface LeavePolicy {
  id: string;
  name: string;
  description: string | null;
  leaveTypeId: string;
  annualAllowance: number;
  maxCarryover: number;
  accrualFrequency: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  eligibleAfterMonths: number;
  appliesTo: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LeavePolicyListResponse {
  items: LeavePolicy[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface LeaveTypeOption {
  id: string;
  name: string;
  code: string;
}

interface CreatePolicyForm {
  name: string;
  description: string;
  leaveTypeId: string;
  annualAllowance: string;
  maxCarryover: string;
  accrualFrequency: string;
  effectiveFrom: string;
  effectiveTo: string;
  eligibleAfterMonths: string;
}

const ACCRUAL_OPTIONS = [
  { value: "", label: "None" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
  { value: "hire_anniversary", label: "Hire Anniversary" },
];

const ACCRUAL_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  hire_anniversary: "Hire Anniversary",
};

const initialFormState: CreatePolicyForm = {
  name: "",
  description: "",
  leaveTypeId: "",
  annualAllowance: "",
  maxCarryover: "0",
  accrualFrequency: "",
  effectiveFrom: new Date().toISOString().split("T")[0],
  effectiveTo: "",
  eligibleAfterMonths: "0",
};

export default function AdminLeavePoliciesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreatePolicyForm>(initialFormState);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [editFormData, setEditFormData] = useState<CreatePolicyForm>(initialFormState);

  // Fetch leave policies
  const { data: policiesData, isLoading } = useQuery({
    queryKey: ["admin-leave-policies", search],
    queryFn: () => api.get<LeavePolicyListResponse>("/absence/policies"),
  });

  // Fetch leave types for the dropdown
  const { data: leaveTypesData } = useQuery({
    queryKey: ["admin-leave-types-options"],
    queryFn: () =>
      api.get<{ items: LeaveTypeOption[] }>("/absence/leave-types"),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/absence/policies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-policies"] });
      toast.success("Leave policy created successfully");
      setShowCreateModal(false);
      setFormData(initialFormState);
    },
    onError: () => {
      toast.error("Failed to create leave policy", {
        message: "Please try again or check your input.",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/absence/policies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-policies"] });
      toast.success("Leave policy deleted successfully");
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Failed to delete leave policy", {
        message: "This policy may be in use.",
      });
      setDeleteId(null);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.put(`/absence/policies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-policies"] });
      toast.success("Leave policy updated successfully");
      setEditingPolicy(null);
      setEditFormData(initialFormState);
    },
    onError: () => {
      toast.error("Failed to update leave policy", {
        message: "Please try again or check your input.",
      });
    },
  });

  const policies = policiesData?.items ?? [];
  const leaveTypeOptions = leaveTypesData?.items ?? [];

  // Client-side search
  const filteredPolicies = search
    ? policies.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : policies;

  // Build leave type name lookup
  const leaveTypeMap = new Map(leaveTypeOptions.map((t) => [t.id, t.name]));

  const handleEditOpen = (policy: LeavePolicy) => {
    setEditingPolicy(policy);
    setEditFormData({
      name: policy.name,
      description: policy.description || "",
      leaveTypeId: policy.leaveTypeId,
      annualAllowance: String(policy.annualAllowance),
      maxCarryover: String(policy.maxCarryover),
      accrualFrequency: policy.accrualFrequency || "",
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo || "",
      eligibleAfterMonths: String(policy.eligibleAfterMonths),
    });
  };

  const handleEditSubmit = () => {
    if (!editingPolicy) return;
    if (!editFormData.name.trim() || !editFormData.leaveTypeId || !editFormData.annualAllowance) {
      toast.warning("Please fill in required fields");
      return;
    }
    updateMutation.mutate({
      id: editingPolicy.id,
      data: {
        name: editFormData.name.trim(),
        description: editFormData.description.trim() || undefined,
        leaveTypeId: editFormData.leaveTypeId,
        annualAllowance: Number(editFormData.annualAllowance),
        maxCarryover: editFormData.maxCarryover ? Number(editFormData.maxCarryover) : 0,
        accrualFrequency: editFormData.accrualFrequency || undefined,
        effectiveFrom: editFormData.effectiveFrom,
        effectiveTo: editFormData.effectiveTo || undefined,
        eligibleAfterMonths: editFormData.eligibleAfterMonths
          ? Number(editFormData.eligibleAfterMonths)
          : 0,
      },
    });
  };

  const handleCreateSubmit = () => {
    if (!formData.name.trim() || !formData.leaveTypeId || !formData.annualAllowance) {
      toast.warning("Please fill in required fields");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      leaveTypeId: formData.leaveTypeId,
      annualAllowance: Number(formData.annualAllowance),
      maxCarryover: formData.maxCarryover ? Number(formData.maxCarryover) : 0,
      accrualFrequency: formData.accrualFrequency || undefined,
      effectiveFrom: formData.effectiveFrom,
      effectiveTo: formData.effectiveTo || undefined,
      eligibleAfterMonths: formData.eligibleAfterMonths
        ? Number(formData.eligibleAfterMonths)
        : 0,
    });
  };

  const columns: ColumnDef<LeavePolicy>[] = [
    {
      id: "name",
      header: "Policy Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.name}</div>
            {row.description && (
              <div className="text-sm text-gray-500 line-clamp-1">
                {row.description}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "leaveType",
      header: "Leave Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {leaveTypeMap.get(row.leaveTypeId) || row.leaveTypeId}
        </span>
      ),
    },
    {
      id: "annualAllowance",
      header: "Annual Allowance",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.annualAllowance} days
        </span>
      ),
    },
    {
      id: "maxCarryover",
      header: "Max Carryover",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.maxCarryover > 0 ? `${row.maxCarryover} days` : "-"}
        </span>
      ),
    },
    {
      id: "accrual",
      header: "Accrual",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.accrualFrequency
            ? ACCRUAL_LABELS[row.accrualFrequency] || row.accrualFrequency
            : "-"}
        </span>
      ),
    },
    {
      id: "effective",
      header: "Effective",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.effectiveFrom}
          {row.effectiveTo ? ` to ${row.effectiveTo}` : " (ongoing)"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.isActive ? "success" : "secondary"} dot rounded>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleEditOpen(row);
            }}
            aria-label={`Edit ${row.name}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(row.id);
            }}
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Policies</h1>
          <p className="text-gray-600">
            Define accrual rules, allowances, and carry-over limits
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search policies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Policies Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredPolicies.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No leave policies found
              </h3>
              <p className="text-gray-500 mb-4">
                {search
                  ? "Try adjusting your search"
                  : "Create your first leave policy to define leave rules"}
              </p>
              {!search && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Policy
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={filteredPolicies}
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
            setFormData(initialFormState);
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Leave Policy</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Policy Name"
                placeholder="e.g. Standard Annual Leave Policy"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <Input
                label="Description"
                placeholder="Describe this policy..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <Select
                label="Leave Type"
                required
                value={formData.leaveTypeId}
                onChange={(e) =>
                  setFormData({ ...formData, leaveTypeId: e.target.value })
                }
                options={[
                  { value: "", label: "Select a leave type" },
                  ...leaveTypeOptions.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Annual Allowance (days)"
                  type="number"
                  placeholder="e.g. 20"
                  required
                  value={formData.annualAllowance}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      annualAllowance: e.target.value,
                    })
                  }
                  min={0}
                  max={365}
                />
                <Input
                  label="Max Carryover (days)"
                  type="number"
                  placeholder="e.g. 5"
                  value={formData.maxCarryover}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      maxCarryover: e.target.value,
                    })
                  }
                  min={0}
                  max={365}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Accrual Frequency"
                  value={formData.accrualFrequency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      accrualFrequency: e.target.value,
                    })
                  }
                  options={ACCRUAL_OPTIONS}
                />
                <Input
                  label="Eligible After (months)"
                  type="number"
                  placeholder="e.g. 3"
                  value={formData.eligibleAfterMonths}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      eligibleAfterMonths: e.target.value,
                    })
                  }
                  min={0}
                  max={24}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Effective From"
                  type="date"
                  required
                  value={formData.effectiveFrom}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      effectiveFrom: e.target.value,
                    })
                  }
                />
                <Input
                  label="Effective To (optional)"
                  type="date"
                  value={formData.effectiveTo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      effectiveTo: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(initialFormState);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={
                !formData.name.trim() ||
                !formData.leaveTypeId ||
                !formData.annualAllowance ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Create Policy"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingPolicy && (
        <Modal
          open
          onClose={() => {
            setEditingPolicy(null);
            setEditFormData(initialFormState);
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Edit Leave Policy</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Policy Name"
                placeholder="e.g. Standard Annual Leave Policy"
                required
                value={editFormData.name}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, name: e.target.value })
                }
              />
              <Input
                label="Description"
                placeholder="Describe this policy..."
                value={editFormData.description}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, description: e.target.value })
                }
              />
              <Select
                label="Leave Type"
                required
                value={editFormData.leaveTypeId}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, leaveTypeId: e.target.value })
                }
                options={[
                  { value: "", label: "Select a leave type" },
                  ...leaveTypeOptions.map((t) => ({
                    value: t.id,
                    label: t.name,
                  })),
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Annual Allowance (days)"
                  type="number"
                  placeholder="e.g. 20"
                  required
                  value={editFormData.annualAllowance}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      annualAllowance: e.target.value,
                    })
                  }
                  min={0}
                  max={365}
                />
                <Input
                  label="Max Carryover (days)"
                  type="number"
                  placeholder="e.g. 5"
                  value={editFormData.maxCarryover}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      maxCarryover: e.target.value,
                    })
                  }
                  min={0}
                  max={365}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Accrual Frequency"
                  value={editFormData.accrualFrequency}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      accrualFrequency: e.target.value,
                    })
                  }
                  options={ACCRUAL_OPTIONS}
                />
                <Input
                  label="Eligible After (months)"
                  type="number"
                  placeholder="e.g. 3"
                  value={editFormData.eligibleAfterMonths}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      eligibleAfterMonths: e.target.value,
                    })
                  }
                  min={0}
                  max={24}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Effective From"
                  type="date"
                  required
                  value={editFormData.effectiveFrom}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      effectiveFrom: e.target.value,
                    })
                  }
                />
                <Input
                  label="Effective To (optional)"
                  type="date"
                  value={editFormData.effectiveTo}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      effectiveTo: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingPolicy(null);
                setEditFormData(initialFormState);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={
                !editFormData.name.trim() ||
                !editFormData.leaveTypeId ||
                !editFormData.annualAllowance ||
                updateMutation.isPending
              }
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} size="sm">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Delete Leave Policy</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-gray-600">
              Are you sure you want to delete this leave policy? This action
              cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
