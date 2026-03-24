export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
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

interface BereavementLeave {
  id: string;
  employeeId: string;
  employeeName: string;
  childName: string;
  dateOfDeath: string;
  leaveStart: string;
  leaveEnd: string;
  spbpEligible: boolean;
  status: "pending" | "approved" | "active" | "completed" | "rejected";
  createdAt: string;
}

interface BereavementLeaveListResponse {
  items: BereavementLeave[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  pending: "warning",
  approved: "info",
  active: "success",
  completed: "secondary",
  rejected: "error",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  active: "Active",
  completed: "Completed",
  rejected: "Rejected",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface CreateBereavementForm {
  employeeId: string;
  relationship: string;
  dateOfBereavement: string;
  startDate: string;
  expectedReturnDate: string;
  notes: string;
}

const initialCreateForm: CreateBereavementForm = {
  employeeId: "",
  relationship: "",
  dateOfBereavement: "",
  startDate: "",
  expectedReturnDate: "",
  notes: "",
};

export default function AdminBereavementLeavePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateBereavementForm>(initialCreateForm);

  const createMutation = useMutation({
    mutationFn: (data: CreateBereavementForm) =>
      api.post("/bereavement/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bereavement-requests"] });
      toast.success("Bereavement leave request created successfully");
      setShowCreateModal(false);
      setFormData(initialCreateForm);
    },
    onError: () => {
      toast.error("Failed to create bereavement leave request", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreate = () => {
    if (
      !formData.employeeId.trim() ||
      !formData.relationship ||
      !formData.dateOfBereavement ||
      !formData.startDate ||
      !formData.expectedReturnDate
    ) {
      toast.warning("Please fill in all required fields");
      return;
    }
    createMutation.mutate(formData);
  };

  const { data: leaveData, isLoading } = useQuery({
    queryKey: ["admin-bereavement-requests", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<BereavementLeaveListResponse>("/bereavement/requests", {
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

  const totalRecords = items.length;
  const pendingRecords = items.filter((r) => r.status === "pending").length;
  const spbpEligibleCount = items.filter((r) => r.spbpEligible).length;

  const columns: ColumnDef<BereavementLeave>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900">{row.employeeName}</div>
      ),
    },
    {
      id: "childName",
      header: "Child Name",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.childName}</span>
      ),
    },
    {
      id: "dateOfDeath",
      header: "Date of Death",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.dateOfDeath)}
        </span>
      ),
    },
    {
      id: "leaveStart",
      header: "Leave Start",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.leaveStart)}
        </span>
      ),
    },
    {
      id: "leaveEnd",
      header: "Leave End",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatDate(row.leaveEnd)}
        </span>
      ),
    },
    {
      id: "spbpEligible",
      header: "SPBP Eligible",
      cell: ({ row }) => (
        <Badge variant={row.spbpEligible ? "success" : "secondary"}>
          {row.spbpEligible ? "Yes" : "No"}
        </Badge>
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
            Bereavement Leave
          </h1>
          <p className="text-gray-600">
            Manage bereavement leave requests and SPBP eligibility
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
              <p className="text-2xl font-bold">{totalRecords}</p>
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
              <p className="text-2xl font-bold">{pendingRecords}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">SPBP Eligible</p>
              <p className="text-2xl font-bold">{spbpEligibleCount}</p>
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
            { value: "active", label: "Active" },
            { value: "completed", label: "Completed" },
            { value: "rejected", label: "Rejected" },
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
              <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No bereavement leave requests found
              </h3>
              <p className="text-gray-500">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No bereavement leave requests have been submitted yet"}
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

      {/* Create Bereavement Leave Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(initialCreateForm);
          }}
          size="md"
          aria-label="Add bereavement leave request"
        >
          <ModalHeader title="Add Bereavement Leave Request" />
          <ModalBody>
            <form
              id="bereavement-create-form"
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
                label="Relationship to Deceased"
                required
                value={formData.relationship}
                onChange={(e) =>
                  setFormData({ ...formData, relationship: e.target.value })
                }
                options={[
                  { value: "", label: "Select relationship" },
                  { value: "child", label: "Child" },
                  { value: "spouse", label: "Spouse" },
                  { value: "parent", label: "Parent" },
                  { value: "sibling", label: "Sibling" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Input
                label="Date of Bereavement"
                type="date"
                required
                value={formData.dateOfBereavement}
                onChange={(e) =>
                  setFormData({ ...formData, dateOfBereavement: e.target.value })
                }
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
                  label="Expected Return Date"
                  type="date"
                  required
                  value={formData.expectedReturnDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expectedReturnDate: e.target.value })
                  }
                />
              </div>
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
              form="bereavement-create-form"
              disabled={
                !formData.employeeId.trim() ||
                !formData.relationship ||
                !formData.dateOfBereavement ||
                !formData.startDate ||
                !formData.expectedReturnDate ||
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
