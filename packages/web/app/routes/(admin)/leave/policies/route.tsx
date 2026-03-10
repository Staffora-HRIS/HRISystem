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
  Checkbox,
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
  leave_type_id: string;
  leave_type_name: string | null;
  max_days_per_year: number | null;
  max_consecutive_days: number | null;
  min_notice_days: number;
  allow_negative_balance: boolean;
  carry_over_days: number | null;
  is_active: boolean;
  created_at: string;
}

interface LeavePolicyListResponse {
  items: LeavePolicy[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface LeaveTypeOption {
  id: string;
  name: string;
}

interface CreatePolicyForm {
  name: string;
  description: string;
  leave_type_id: string;
  max_days_per_year: string;
  max_consecutive_days: string;
  min_notice_days: string;
  allow_negative_balance: boolean;
  carry_over_days: string;
}

const initialFormState: CreatePolicyForm = {
  name: "",
  description: "",
  leave_type_id: "",
  max_days_per_year: "",
  max_consecutive_days: "",
  min_notice_days: "0",
  allow_negative_balance: false,
  carry_over_days: "",
};

export default function AdminLeavePoliciesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreatePolicyForm>(initialFormState);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch leave policies
  const { data: policiesData, isLoading } = useQuery({
    queryKey: ["admin-leave-policies", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", "50");
      return api.get<LeavePolicyListResponse>(`/absence/policies?${params}`);
    },
  });

  // Fetch leave types for the dropdown
  const { data: leaveTypesData } = useQuery({
    queryKey: ["admin-leave-types-options"],
    queryFn: () =>
      api.get<{ items: LeaveTypeOption[] }>("/absence/leave-types?limit=100"),
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

  const policies = policiesData?.items ?? [];
  const leaveTypeOptions = leaveTypesData?.items ?? [];

  const handleCreateSubmit = () => {
    if (!formData.name.trim() || !formData.leave_type_id) {
      toast.warning("Please fill in required fields");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      leave_type_id: formData.leave_type_id,
      max_days_per_year: formData.max_days_per_year
        ? Number(formData.max_days_per_year)
        : null,
      max_consecutive_days: formData.max_consecutive_days
        ? Number(formData.max_consecutive_days)
        : null,
      min_notice_days: Number(formData.min_notice_days) || 0,
      allow_negative_balance: formData.allow_negative_balance,
      carry_over_days: formData.carry_over_days
        ? Number(formData.carry_over_days)
        : null,
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
      id: "leave_type",
      header: "Leave Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.leave_type_name || "-"}
        </span>
      ),
    },
    {
      id: "max_days_per_year",
      header: "Max Days/Year",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.max_days_per_year != null ? row.max_days_per_year : "-"}
        </span>
      ),
    },
    {
      id: "max_consecutive",
      header: "Max Consecutive",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.max_consecutive_days != null ? row.max_consecutive_days : "-"}
        </span>
      ),
    },
    {
      id: "min_notice",
      header: "Min Notice",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.min_notice_days} {row.min_notice_days === 1 ? "day" : "days"}
        </span>
      ),
    },
    {
      id: "carry_over",
      header: "Carry Over",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.carry_over_days != null
            ? `${row.carry_over_days} days`
            : "-"}
        </span>
      ),
    },
    {
      id: "negative_balance",
      header: "Negative Balance",
      cell: ({ row }) => (
        <Badge variant={row.allow_negative_balance ? "warning" : "default"}>
          {row.allow_negative_balance ? "Allowed" : "No"}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.is_active ? "success" : "secondary"} dot rounded>
          {row.is_active ? "Active" : "Inactive"}
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
              toast.info("Coming Soon", {
                message:
                  "Policy editing will be available in a future update.",
              });
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
            Define rules and limits for each leave type
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
          ) : policies.length === 0 ? (
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
              data={policies}
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
                value={formData.leave_type_id}
                onChange={(e) =>
                  setFormData({ ...formData, leave_type_id: e.target.value })
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
                  label="Max Days Per Year"
                  type="number"
                  placeholder="e.g. 20"
                  value={formData.max_days_per_year}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_days_per_year: e.target.value,
                    })
                  }
                  min={0}
                />
                <Input
                  label="Max Consecutive Days"
                  type="number"
                  placeholder="e.g. 10"
                  value={formData.max_consecutive_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_consecutive_days: e.target.value,
                    })
                  }
                  min={0}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Notice Days"
                  type="number"
                  placeholder="e.g. 3"
                  value={formData.min_notice_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min_notice_days: e.target.value,
                    })
                  }
                  min={0}
                />
                <Input
                  label="Carry Over Days"
                  type="number"
                  placeholder="e.g. 5"
                  value={formData.carry_over_days}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      carry_over_days: e.target.value,
                    })
                  }
                  min={0}
                />
              </div>
              <Checkbox
                label="Allow Negative Balance"
                description="Allow employees to take leave even if they have no remaining balance"
                checked={formData.allow_negative_balance}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    allow_negative_balance: (e.target as HTMLInputElement)
                      .checked,
                  })
                }
              />
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
                !formData.leave_type_id ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Create Policy"}
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
