import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  ListChecks,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
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

interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  category: string;
  default_balance: number | null;
  accrual_type: string | null;
  requires_approval: boolean;
  is_active: boolean;
  created_at: string;
}

interface LeaveTypeListResponse {
  items: LeaveType[];
  nextCursor: string | null;
  hasMore: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  annual: "primary",
  sick: "warning",
  personal: "info",
  parental: "success",
  bereavement: "secondary",
  unpaid: "default",
  compensatory: "outline",
};

const CATEGORY_LABELS: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  personal: "Personal",
  parental: "Parental",
  bereavement: "Bereavement",
  unpaid: "Unpaid",
  compensatory: "Compensatory",
};

const ACCRUAL_LABELS: Record<string, string> = {
  none: "None",
  monthly: "Monthly",
  biweekly: "Bi-weekly",
  annual: "Annual",
};

const CATEGORY_OPTIONS = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "parental", label: "Parental" },
  { value: "bereavement", label: "Bereavement" },
  { value: "unpaid", label: "Unpaid" },
  { value: "compensatory", label: "Compensatory" },
];

const ACCRUAL_OPTIONS = [
  { value: "none", label: "None" },
  { value: "monthly", label: "Monthly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "annual", label: "Annual" },
];

interface CreateLeaveTypeForm {
  name: string;
  code: string;
  description: string;
  category: string;
  default_balance: string;
  accrual_type: string;
  requires_approval: boolean;
}

const initialFormState: CreateLeaveTypeForm = {
  name: "",
  code: "",
  description: "",
  category: "annual",
  default_balance: "",
  accrual_type: "none",
  requires_approval: true,
};

export default function AdminLeaveTypesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateLeaveTypeForm>(initialFormState);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch leave types
  const { data: leaveTypesData, isLoading } = useQuery({
    queryKey: ["admin-leave-types", search, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (categoryFilter) params.set("category", categoryFilter);
      params.set("limit", "50");
      return api.get<LeaveTypeListResponse>(`/absence/leave-types?${params}`);
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/absence/leave-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-types"] });
      toast.success("Leave type created successfully");
      setShowCreateModal(false);
      setFormData(initialFormState);
    },
    onError: () => {
      toast.error("Failed to create leave type", {
        message: "Please try again or check your input.",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/absence/leave-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-types"] });
      toast.success("Leave type deleted successfully");
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Failed to delete leave type", {
        message: "This leave type may be in use by existing policies or requests.",
      });
      setDeleteId(null);
    },
  });

  const leaveTypes = leaveTypesData?.items ?? [];

  // Calculate stats
  const totalTypes = leaveTypes.length;
  const activeTypes = leaveTypes.filter((t) => t.is_active).length;
  const inactiveTypes = leaveTypes.filter((t) => !t.is_active).length;

  const handleCreateSubmit = () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.warning("Please fill in required fields");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      code: formData.code.trim(),
      description: formData.description.trim() || null,
      category: formData.category,
      default_balance: formData.default_balance
        ? Number(formData.default_balance)
        : null,
      accrual_type: formData.accrual_type,
      requires_approval: formData.requires_approval,
    });
  };

  const columns: ColumnDef<LeaveType>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <ListChecks className="h-5 w-5 text-blue-600" />
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
      id: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="text-sm font-mono text-gray-600">{row.code}</span>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge
          variant={
            (CATEGORY_COLORS[row.category] as
              | "primary"
              | "warning"
              | "info"
              | "success"
              | "secondary"
              | "default"
              | "outline") ?? "default"
          }
        >
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
      ),
    },
    {
      id: "default_balance",
      header: "Default Balance",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.default_balance != null ? `${row.default_balance} days` : "-"}
        </span>
      ),
    },
    {
      id: "accrual_type",
      header: "Accrual Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.accrual_type
            ? ACCRUAL_LABELS[row.accrual_type] || row.accrual_type
            : "-"}
        </span>
      ),
    },
    {
      id: "requires_approval",
      header: "Requires Approval",
      cell: ({ row }) => (
        <Badge variant={row.requires_approval ? "info" : "default"}>
          {row.requires_approval ? "Yes" : "No"}
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
                message: "Leave type editing will be available in a future update.",
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
          <h1 className="text-2xl font-bold text-gray-900">Leave Types</h1>
          <p className="text-gray-600">
            Configure the types of leave available to employees
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Leave Type
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <ListChecks className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Types</p>
              <p className="text-2xl font-bold">{totalTypes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{activeTypes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Inactive</p>
              <p className="text-2xl font-bold">{inactiveTypes}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search leave types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[
            { value: "", label: "All Categories" },
            ...CATEGORY_OPTIONS,
          ]}
        />
      </div>

      {/* Leave Types Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : leaveTypes.length === 0 ? (
            <div className="text-center py-12">
              <ListChecks className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No leave types found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || categoryFilter
                  ? "Try adjusting your filters"
                  : "Create your first leave type to get started"}
              </p>
              {!search && !categoryFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Leave Type
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={leaveTypes}
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
            <h3 className="text-lg font-semibold">Add Leave Type</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Name"
                  placeholder="e.g. Annual Leave"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
                <Input
                  label="Code"
                  placeholder="e.g. ANNUAL"
                  required
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                />
              </div>
              <Input
                label="Description"
                placeholder="Describe this leave type..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  options={CATEGORY_OPTIONS}
                />
                <Input
                  label="Default Balance (days)"
                  type="number"
                  placeholder="e.g. 20"
                  value={formData.default_balance}
                  onChange={(e) =>
                    setFormData({ ...formData, default_balance: e.target.value })
                  }
                  min={0}
                />
              </div>
              <Select
                label="Accrual Type"
                value={formData.accrual_type}
                onChange={(e) =>
                  setFormData({ ...formData, accrual_type: e.target.value })
                }
                options={ACCRUAL_OPTIONS}
              />
              <Checkbox
                label="Requires Approval"
                description="Leave requests of this type must be approved by a manager"
                checked={formData.requires_approval}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    requires_approval: (e.target as HTMLInputElement).checked,
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
                !formData.code.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Add Leave Type"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <Modal open onClose={() => setDeleteId(null)} size="sm">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Delete Leave Type</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-gray-600">
              Are you sure you want to delete this leave type? This action
              cannot be undone. Existing leave requests using this type will not
              be affected.
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
