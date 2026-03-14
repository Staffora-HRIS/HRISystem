export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Search,
  Plus,
  FileText,
  CheckCircle,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface PaySchedule {
  id: string;
  name: string;
  frequency: "weekly" | "fortnightly" | "four_weekly" | "monthly";
  payDay: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PayScheduleListResponse {
  items: PaySchedule[];
  nextCursor: string | null;
  hasMore: boolean;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  four_weekly: "4-Weekly",
  monthly: "Monthly",
};

const STATUS_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  active: "success",
  inactive: "secondary",
};

interface CreateScheduleForm {
  name: string;
  frequency: string;
  payDay: string;
}

const INITIAL_FORM: CreateScheduleForm = {
  name: "",
  frequency: "monthly",
  payDay: "25",
};

export default function AdminPaySchedulesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateScheduleForm>(INITIAL_FORM);

  const { data: schedulesData, isLoading } = useQuery({
    queryKey: ["admin-pay-schedules", statusFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      return api.get<PayScheduleListResponse>("/payroll-config/schedules", {
        params,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/payroll-config/schedules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pay-schedules"] });
      toast.success("Pay schedule created successfully");
      setShowCreateModal(false);
      setFormData(INITIAL_FORM);
    },
    onError: () => {
      toast.error("Failed to create pay schedule");
    },
  });

  const items = schedulesData?.items ?? [];

  const filteredItems = search
    ? items.filter((item) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const totalSchedules = items.length;
  const activeSchedules = items.filter((s) => s.isActive).length;
  const inactiveSchedules = items.filter((s) => !s.isActive).length;

  const handleCreateSubmit = () => {
    if (!formData.name.trim()) {
      toast.warning("Please enter a schedule name");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      frequency: formData.frequency,
      payDay: Number(formData.payDay),
    });
  };

  const columns: ColumnDef<PaySchedule>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <CalendarClock className="h-5 w-5 text-blue-600" />
          </div>
          <span className="font-medium text-gray-900">{row.name}</span>
        </div>
      ),
    },
    {
      id: "frequency",
      header: "Frequency",
      cell: ({ row }) => (
        <Badge variant="info">
          {FREQUENCY_LABELS[row.frequency] || row.frequency}
        </Badge>
      ),
    },
    {
      id: "payDay",
      header: "Pay Day",
      cell: ({ row }) => {
        const suffix =
          row.payDay === 1
            ? "st"
            : row.payDay === 2
              ? "nd"
              : row.payDay === 3
                ? "rd"
                : "th";
        const label =
          row.frequency === "monthly"
            ? `${row.payDay}${suffix} of month`
            : row.payDay === 5
              ? "Friday"
              : `Day ${row.payDay}`;
        return <span className="text-sm text-gray-600">{label}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant={
            STATUS_BADGE_VARIANTS[row.isActive ? "active" : "inactive"] ??
            "default"
          }
          dot
          rounded
        >
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pay Schedules</h1>
          <p className="text-gray-600">
            Configure pay frequencies and pay day settings
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Schedule
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
              <p className="text-sm text-gray-500">Total Schedules</p>
              <p className="text-2xl font-bold">{totalSchedules}</p>
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
              <p className="text-2xl font-bold">{activeSchedules}</p>
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
              <p className="text-2xl font-bold">{inactiveSchedules}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search schedules..."
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
            { value: "inactive", label: "Inactive" },
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
              <CalendarClock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No pay schedules found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Create your first pay schedule to get started"}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Schedule
                </Button>
              )}
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

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(INITIAL_FORM);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Pay Schedule</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Schedule Name"
                placeholder="e.g. Monthly Salaried"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
              <Select
                label="Frequency"
                value={formData.frequency}
                onChange={(e) =>
                  setFormData({ ...formData, frequency: e.target.value })
                }
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "fortnightly", label: "Fortnightly" },
                  { value: "four_weekly", label: "4-Weekly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
              <Input
                label="Pay Day"
                type="number"
                placeholder={
                  formData.frequency === "monthly"
                    ? "Day of month (1-28)"
                    : "Day of cycle (1-7)"
                }
                value={formData.payDay}
                onChange={(e) =>
                  setFormData({ ...formData, payDay: e.target.value })
                }
                min={1}
                max={formData.frequency === "monthly" ? 28 : 7}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(INITIAL_FORM);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!formData.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Add Schedule"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
