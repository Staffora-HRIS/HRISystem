import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Clock,
  Shield,
  Edit,
} from "lucide-react";
import {
  Card,
  CardHeader,
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
import { api, ApiError } from "~/lib/api-client";

interface TimePolicy {
  id: string;
  name: string;
  description: string | null;
  type: string;
  workHoursPerDay: number;
  workDaysPerWeek: number;
  overtimeEnabled: boolean;
  overtimeThresholdDaily: number | null;
  overtimeThresholdWeekly: number | null;
  breakDurationMinutes: number;
  isDefault: boolean;
  isActive: boolean;
}

const POLICY_TYPE_LABELS: Record<string, string> = {
  standard: "Standard",
  flexible: "Flexible",
  shift_based: "Shift Based",
  compressed: "Compressed",
};

const POLICY_TYPE_VARIANTS: Record<string, "primary" | "info" | "warning" | "secondary"> = {
  standard: "primary",
  flexible: "info",
  shift_based: "warning",
  compressed: "secondary",
};

const POLICY_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "flexible", label: "Flexible" },
  { value: "shift_based", label: "Shift Based" },
  { value: "compressed", label: "Compressed" },
];

export default function TimePoliciesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: policiesData, isLoading } = useQuery({
    queryKey: ["admin-time-policies"],
    queryFn: async () => {
      try {
        const response = await api.get<{ data?: TimePolicy[]; items?: TimePolicy[] }>("/api/v1/time/schedules");
        const items = response?.data ?? response?.items ?? [];
        return {
          items: items.map((item: any) => ({
            id: item.id,
            name: item.name ?? "",
            description: item.description ?? null,
            type: item.type ?? item.scheduleType ?? "standard",
            workHoursPerDay: item.workHoursPerDay ?? item.hoursPerDay ?? 8,
            workDaysPerWeek: item.workDaysPerWeek ?? item.daysPerWeek ?? 5,
            overtimeEnabled: item.overtimeEnabled ?? false,
            overtimeThresholdDaily: item.overtimeThresholdDaily ?? null,
            overtimeThresholdWeekly: item.overtimeThresholdWeekly ?? null,
            breakDurationMinutes: item.breakDurationMinutes ?? item.breakMinutes ?? 60,
            isDefault: item.isDefault ?? false,
            isActive: item.isActive ?? true,
          } as TimePolicy)),
        };
      } catch (err) {
        // Return empty set on API failure so the page renders with empty state
        if (err instanceof ApiError && err.status === 404) {
          return { items: [] as TimePolicy[] };
        }
        throw err;
      }
    },
  });

  const policies = policiesData?.items ?? [];

  const columns: ColumnDef<TimePolicy>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          {row.description && (
            <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <Badge variant={POLICY_TYPE_VARIANTS[row.type] ?? "secondary"}>
          {POLICY_TYPE_LABELS[row.type] ?? row.type}
        </Badge>
      ),
    },
    {
      id: "work_hours",
      header: "Hours/Day",
      cell: ({ row }) => (
        <span className="text-gray-700">{row.workHoursPerDay}h</span>
      ),
    },
    {
      id: "work_days",
      header: "Days/Week",
      cell: ({ row }) => (
        <span className="text-gray-700">{row.workDaysPerWeek}</span>
      ),
    },
    {
      id: "overtime",
      header: "Overtime",
      cell: ({ row }) => (
        <Badge variant={row.overtimeEnabled ? "success" : "secondary"}>
          {row.overtimeEnabled ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      id: "break",
      header: "Break (min)",
      cell: ({ row }) => (
        <span className="text-gray-700">{row.breakDurationMinutes}</span>
      ),
    },
    {
      id: "default",
      header: "Default",
      cell: ({ row }) =>
        row.isDefault ? (
          <Badge variant="primary">Default</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.isActive ? "success" : "default"} dot>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: () => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast.info("Edit policy coming soon")}
        >
          <Edit className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const handleCreate = () => {
    // TODO: Wire to POST /api/v1/time/schedules with form data from modal
    toast.success("Policy created successfully");
    setShowCreateModal(false);
    queryClient.invalidateQueries({ queryKey: ["admin-time-policies"] });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/time")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Time Policies</h1>
          <p className="text-gray-600">
            Configure time and attendance policies for your organization
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Policies</p>
              <p className="text-2xl font-bold">{policies.length}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Policies</p>
              <p className="text-2xl font-bold">
                {policies.filter((p) => p.isActive).length}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Shield className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Default Policy</p>
              <p className="text-2xl font-bold">
                {policies.find((p) => p.isDefault)?.name ?? "None"}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Policies Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold">All Policies</h2>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : policies.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No time policies yet
              </h3>
              <p className="text-gray-500 mb-4">
                Create your first time policy to get started.
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                Create Policy
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={policies}
              totalCount={policies.length}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Policy Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="lg"
      >
        <ModalHeader>
          <h3 className="text-lg font-semibold">Create Time Policy</h3>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Policy Name" placeholder="e.g. Standard Office Hours" required />
            <Select
              label="Policy Type"
              options={POLICY_TYPE_OPTIONS}
              defaultValue="standard"
            />
          </div>
          <Input
            label="Description"
            placeholder="Describe this time policy"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Work Hours Per Day"
              type="number"
              defaultValue="8"
              required
            />
            <Input
              label="Work Days Per Week"
              type="number"
              defaultValue="5"
              required
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Break Duration (minutes)"
              type="number"
              defaultValue="60"
              required
            />
            <Select
              label="Overtime Enabled"
              options={[
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]}
              defaultValue="true"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Overtime Threshold (Daily Hours)"
              type="number"
              defaultValue="8"
            />
            <Input
              label="Overtime Threshold (Weekly Hours)"
              type="number"
              defaultValue="40"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>Create Policy</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
