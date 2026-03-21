export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
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
  isPaid: boolean;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  maxConsecutiveDays: number | null;
  minNoticeDays: number;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LeaveTypeListResponse {
  items: LeaveType[];
  nextCursor: string | null;
  hasMore: boolean;
}

const LEAVE_TYPE_CATEGORIES = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal" },
  { value: "parental", label: "Parental" },
  { value: "bereavement", label: "Bereavement" },
  { value: "jury_duty", label: "Jury Duty" },
  { value: "military", label: "Military" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
] as const;

interface CreateLeaveTypeForm {
  name: string;
  code: string;
  category: string;
  description: string;
  isPaid: boolean;
  requiresApproval: boolean;
  requiresAttachment: boolean;
  maxConsecutiveDays: string;
  minNoticeDays: string;
  color: string;
}

const initialFormState: CreateLeaveTypeForm = {
  name: "",
  code: "",
  category: "other",
  description: "",
  isPaid: true,
  requiresApproval: true,
  requiresAttachment: false,
  maxConsecutiveDays: "",
  minNoticeDays: "0",
  color: "#3B82F6",
};

export default function AdminLeaveTypesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateLeaveTypeForm>(initialFormState);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Fetch leave types
  const { data: leaveTypesData, isLoading } = useQuery({
    queryKey: ["admin-leave-types", search],
    queryFn: () => api.get<LeaveTypeListResponse>("/absence/leave-types"),
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.put(`/absence/leave-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-leave-types"] });
      toast.success("Leave type updated successfully");
      setShowCreateModal(false);
      setEditingId(null);
      setFormData(initialFormState);
    },
    onError: () => {
      toast.error("Failed to update leave type", {
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

  // Client-side search filter
  const filteredTypes = search
    ? leaveTypes.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.code.toLowerCase().includes(search.toLowerCase())
      )
    : leaveTypes;

  // Calculate stats
  const totalTypes = leaveTypes.length;
  const activeTypes = leaveTypes.filter((t) => t.isActive).length;
  const inactiveTypes = leaveTypes.filter((t) => !t.isActive).length;

  const handleFormSubmit = () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.warning("Please fill in required fields");
      return;
    }
    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
      category: formData.category || "other",
      description: formData.description.trim() || undefined,
      isPaid: formData.isPaid,
      requiresApproval: formData.requiresApproval,
      requiresAttachment: formData.requiresAttachment,
      maxConsecutiveDays: formData.maxConsecutiveDays
        ? Number(formData.maxConsecutiveDays)
        : undefined,
      minNoticeDays: formData.minNoticeDays
        ? Number(formData.minNoticeDays)
        : 0,
      color: formData.color || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEditClick = (leaveType: LeaveType) => {
    setEditingId(leaveType.id);
    setFormData({
      name: leaveType.name,
      code: leaveType.code,
      category: (leaveType as any).category ?? "other",
      description: leaveType.description ?? "",
      isPaid: leaveType.isPaid,
      requiresApproval: leaveType.requiresApproval,
      requiresAttachment: leaveType.requiresAttachment,
      maxConsecutiveDays: leaveType.maxConsecutiveDays != null ? String(leaveType.maxConsecutiveDays) : "",
      minNoticeDays: String(leaveType.minNoticeDays),
      color: leaveType.color ?? "#3B82F6",
    });
    setShowCreateModal(true);
  };

  const columns: ColumnDef<LeaveType>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: row.color ? `${row.color}20` : "#EFF6FF" }}
          >
            <ListChecks
              className="h-5 w-5"
              style={{ color: row.color || "#2563EB" }}
            />
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
      id: "isPaid",
      header: "Paid",
      cell: ({ row }) => (
        <Badge variant={row.isPaid ? "success" : "secondary"}>
          {row.isPaid ? "Paid" : "Unpaid"}
        </Badge>
      ),
    },
    {
      id: "maxConsecutiveDays",
      header: "Max Days",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.maxConsecutiveDays != null ? `${row.maxConsecutiveDays} days` : "-"}
        </span>
      ),
    },
    {
      id: "requiresApproval",
      header: "Requires Approval",
      cell: ({ row }) => (
        <Badge variant={row.requiresApproval ? "info" : "default"}>
          {row.requiresApproval ? "Yes" : "No"}
        </Badge>
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
              handleEditClick(row);
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
      </div>

      {/* Leave Types Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="text-center py-12">
              <ListChecks className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No leave types found
              </h3>
              <p className="text-gray-500 mb-4">
                {search
                  ? "Try adjusting your search"
                  : "Create your first leave type to get started"}
              </p>
              {!search && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Leave Type
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={filteredTypes}
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
            setEditingId(null);
            setFormData(initialFormState);
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">{editingId ? "Edit Leave Type" : "Add Leave Type"}</h3>
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
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                    })
                  }
                />
              </div>
              <Select
                label="Category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                options={LEAVE_TYPE_CATEGORIES.map((c) => ({
                  value: c.value,
                  label: c.label,
                }))}
              />
              <Input
                label="Description"
                placeholder="Describe this leave type..."
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Max Consecutive Days"
                  type="number"
                  placeholder="e.g. 20"
                  value={formData.maxConsecutiveDays}
                  onChange={(e) =>
                    setFormData({ ...formData, maxConsecutiveDays: e.target.value })
                  }
                  min={0}
                />
                <Input
                  label="Min Notice Days"
                  type="number"
                  placeholder="e.g. 3"
                  value={formData.minNoticeDays}
                  onChange={(e) =>
                    setFormData({ ...formData, minNoticeDays: e.target.value })
                  }
                  min={0}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Color"
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                />
              </div>
              <Checkbox
                label="Paid Leave"
                description="This leave type counts as paid time off"
                checked={formData.isPaid}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    isPaid: (e.target as HTMLInputElement).checked,
                  })
                }
              />
              <Checkbox
                label="Requires Approval"
                description="Leave requests of this type must be approved by a manager"
                checked={formData.requiresApproval}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    requiresApproval: (e.target as HTMLInputElement).checked,
                  })
                }
              />
              <Checkbox
                label="Requires Attachment"
                description="Employees must upload supporting documents"
                checked={formData.requiresAttachment}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    requiresAttachment: (e.target as HTMLInputElement).checked,
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
                setEditingId(null);
                setFormData(initialFormState);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFormSubmit}
              disabled={
                !formData.name.trim() ||
                !formData.code.trim() ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending)
                ? (editingId ? "Saving..." : "Creating...")
                : (editingId ? "Save Changes" : "Add Leave Type")}
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
