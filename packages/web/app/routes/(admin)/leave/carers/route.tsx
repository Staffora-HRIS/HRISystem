export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HandHelping,
  Search,
  FileText,
  Clock,
  CheckCircle,
  Plus,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  Button,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Textarea,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface CarersLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
}

interface CarersLeaveListResponse {
  items: CarersLeaveRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  approved: "success",
  rejected: "error",
  cancelled: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CreateCarersLeaveForm {
  employeeId: string;
  careRecipientRelationship: string;
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
}

const initialCreateForm: CreateCarersLeaveForm = {
  employeeId: "",
  careRecipientRelationship: "",
  startDate: "",
  endDate: "",
  reason: "",
  notes: "",
};

export default function AdminCarersLeavePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateCarersLeaveForm>(initialCreateForm);

  const createMutation = useMutation({
    mutationFn: (data: CreateCarersLeaveForm) =>
      api.post("/carers-leave/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-carers-leave-requests"] });
      toast.success("Carer's leave request created successfully");
      setShowCreateModal(false);
      setFormData(initialCreateForm);
    },
    onError: () => {
      toast.error("Failed to create carer's leave request", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreate = () => {
    if (
      !formData.employeeId.trim() ||
      !formData.careRecipientRelationship ||
      !formData.startDate ||
      !formData.endDate ||
      !formData.reason.trim()
    ) {
      toast.warning("Please fill in all required fields");
      return;
    }
    createMutation.mutate(formData);
  };

  const { data: leaveData, isLoading } = useQuery({
    queryKey: ["admin-carers-leave-requests", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<CarersLeaveListResponse>("/carers-leave/requests", {
        params,
      });
    },
  });

  const items = leaveData?.items ?? [];

  const filteredItems = search
    ? items.filter((item) =>
        item.employeeName.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalRequests = items.length;
  const pendingRequests = items.filter((r) => r.status === "pending").length;
  const approvedRequests = items.filter((r) => r.status === "approved").length;

  const columns: ColumnDef<CarersLeaveRequest>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.employeeName}</div>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.startDate)}
        </span>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.endDate)}
        </span>
      ),
    },
    {
      id: "totalDays",
      header: "Days",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.totalDays}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 line-clamp-1">
          {row.reason || "-"}
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
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Carer&apos;s Leave
          </h1>
          <p className="text-gray-600">
            Manage carer&apos;s leave requests and entitlements
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Request
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
              <p className="text-sm text-gray-500">Total Requests</p>
              <p className="text-2xl font-bold">{totalRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Approval</p>
              <p className="text-2xl font-bold">{pendingRequests}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Approved</p>
              <p className="text-2xl font-bold">{approvedRequests}</p>
            </div>
          </CardBody>
        </Card>
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
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
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
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <HandHelping className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No carer&apos;s leave requests found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No carer's leave requests have been submitted yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Carer's Leave Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(initialCreateForm);
          }}
          size="md"
          aria-label="Add carer's leave request"
        >
          <ModalHeader title="Add Carer's Leave Request" />
          <ModalBody>
            <form
              id="carers-create-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="space-y-4"
            >
              <Input
                label="Employee"
                placeholder="Employee ID or name"
                required
                value={formData.employeeId}
                onChange={(e) =>
                  setFormData({ ...formData, employeeId: e.target.value })
                }
              />
              <Select
                label="Care Recipient Relationship"
                required
                value={formData.careRecipientRelationship}
                onChange={(e) =>
                  setFormData({ ...formData, careRecipientRelationship: e.target.value })
                }
                options={[
                  { value: "", label: "Select relationship" },
                  { value: "parent", label: "Parent" },
                  { value: "spouse", label: "Spouse" },
                  { value: "child", label: "Child" },
                  { value: "other", label: "Other" },
                ]}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  type="date"
                  required
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
                <Input
                  label="End Date"
                  type="date"
                  required
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
              <Textarea
                label="Reason"
                placeholder="Reason for carer's leave"
                required
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
              />
              <Textarea
                label="Notes"
                placeholder="Any additional details..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </form>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(initialCreateForm);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="carers-create-form"
              disabled={
                !formData.employeeId.trim() ||
                !formData.careRecipientRelationship ||
                !formData.startDate ||
                !formData.endDate ||
                !formData.reason.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Add Request"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
