export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
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
  Checkbox,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";

interface ReturnToWorkInterview {
  id: string;
  employeeId: string;
  employeeName: string;
  absenceType: string;
  absenceStart: string;
  absenceEnd: string;
  interviewDate: string | null;
  conductedBy: string | null;
  fitForWork: boolean | null;
  adjustmentsRequired: boolean;
  status: "scheduled" | "completed" | "overdue" | "cancelled";
  createdAt: string;
}

interface ReturnToWorkListResponse {
  items: ReturnToWorkInterview[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  scheduled: "info",
  completed: "success",
  overdue: "error",
  cancelled: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  overdue: "Overdue",
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

interface CreateReturnToWorkForm {
  employeeId: string;
  interviewDate: string;
  conductedBy: string;
  absenceType: string;
  fitForWork: boolean;
  adjustmentsNeeded: string;
  notes: string;
}

const initialCreateForm: CreateReturnToWorkForm = {
  employeeId: "",
  interviewDate: "",
  conductedBy: "",
  absenceType: "",
  fitForWork: false,
  adjustmentsNeeded: "",
  notes: "",
};

export default function AdminReturnToWorkPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateReturnToWorkForm>(initialCreateForm);

  const createMutation = useMutation({
    mutationFn: (data: CreateReturnToWorkForm) =>
      api.post("/return-to-work/interviews", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-return-to-work"] });
      toast.success("Return to work interview scheduled successfully");
      setShowCreateModal(false);
      setFormData(initialCreateForm);
    },
    onError: () => {
      toast.error("Failed to schedule interview", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreate = () => {
    if (
      !formData.employeeId.trim() ||
      !formData.interviewDate ||
      !formData.conductedBy.trim() ||
      !formData.absenceType
    ) {
      toast.warning("Please fill in all required fields");
      return;
    }
    createMutation.mutate(formData);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-return-to-work", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<ReturnToWorkListResponse>("/return-to-work/interviews", {
        params,
      });
    },
  });

  const items = data?.items ?? [];

  const filteredItems = search
    ? items.filter((item) =>
        item.employeeName.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalRecords = items.length;
  const pendingRecords = items.filter(
    (r) => r.status === "scheduled" || r.status === "overdue"
  ).length;
  const completedRecords = items.filter((r) => r.status === "completed").length;

  const columns: ColumnDef<ReturnToWorkInterview>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="font-medium text-gray-900 dark:text-gray-100">
          {row.employeeName}
        </div>
      ),
    },
    {
      id: "absenceType",
      header: "Absence Type",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.absenceType}
        </span>
      ),
    },
    {
      id: "absencePeriod",
      header: "Absence Period",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.absenceStart)} – {formatDate(row.absenceEnd)}
        </span>
      ),
    },
    {
      id: "interviewDate",
      header: "Interview Date",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDate(row.interviewDate)}
        </span>
      ),
    },
    {
      id: "conductedBy",
      header: "Conducted By",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.conductedBy ?? "-"}
        </span>
      ),
    },
    {
      id: "fitForWork",
      header: "Fit for Work",
      cell: ({ row }) =>
        row.fitForWork === null ? (
          <span className="text-sm text-gray-400">-</span>
        ) : (
          <Badge variant={row.fitForWork ? "success" : "warning"}>
            {row.fitForWork ? "Yes" : "No"}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Return to Work
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage return to work interviews following employee absences
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Schedule Interview
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Interviews
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {totalRecords}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pending / Overdue
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {pendingRecords}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Completed
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {completedRecords}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

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
            { value: "scheduled", label: "Scheduled" },
            { value: "completed", label: "Completed" },
            { value: "overdue", label: "Overdue" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </div>

      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                No return to work interviews found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No return to work interviews have been scheduled yet"}
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

      {/* Schedule Return to Work Interview Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(initialCreateForm);
          }}
          size="md"
          aria-label="Schedule return to work interview"
        >
          <ModalHeader title="Schedule Return to Work Interview" />
          <ModalBody>
            <form
              id="rtw-create-form"
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
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Interview Date"
                  type="date"
                  required
                  value={formData.interviewDate}
                  onChange={(e) =>
                    setFormData({ ...formData, interviewDate: e.target.value })
                  }
                />
                <Input
                  label="Interviewer Name"
                  placeholder="Name of interviewer"
                  required
                  value={formData.conductedBy}
                  onChange={(e) =>
                    setFormData({ ...formData, conductedBy: e.target.value })
                  }
                />
              </div>
              <Select
                label="Absence Type"
                required
                value={formData.absenceType}
                onChange={(e) =>
                  setFormData({ ...formData, absenceType: e.target.value })
                }
                options={[
                  { value: "", label: "Select absence type" },
                  { value: "sickness", label: "Sickness" },
                  { value: "maternity", label: "Maternity" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Checkbox
                label="Fit for work"
                checked={formData.fitForWork}
                onChange={(e) =>
                  setFormData({ ...formData, fitForWork: e.target.checked })
                }
              />
              <Textarea
                label="Adjustments Needed"
                placeholder="Any workplace adjustments required (optional)"
                value={formData.adjustmentsNeeded}
                onChange={(e) =>
                  setFormData({ ...formData, adjustmentsNeeded: e.target.value })
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
              form="rtw-create-form"
              disabled={
                !formData.employeeId.trim() ||
                !formData.interviewDate ||
                !formData.conductedBy.trim() ||
                !formData.absenceType ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Scheduling..." : "Schedule Interview"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
