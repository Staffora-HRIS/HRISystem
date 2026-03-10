import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface TimePolicy {
  id: string;
  name: string;
  description: string | null;
  type: string;
  work_hours_per_day: number;
  work_days_per_week: number;
  overtime_enabled: boolean;
  overtime_threshold_daily: number | null;
  overtime_threshold_weekly: number | null;
  break_duration_minutes: number;
  is_default: boolean;
  is_active: boolean;
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
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: policiesData, isLoading } = useQuery({
    queryKey: ["admin-time-policies"],
    queryFn: async () => {
      // Mock data until API endpoint is available
      return {
        items: [
          {
            id: "tp-1",
            name: "Standard Office Hours",
            description: "Default 9-to-5 work schedule for office employees",
            type: "standard",
            work_hours_per_day: 8,
            work_days_per_week: 5,
            overtime_enabled: true,
            overtime_threshold_daily: 8,
            overtime_threshold_weekly: 40,
            break_duration_minutes: 60,
            is_default: true,
            is_active: true,
          },
          {
            id: "tp-2",
            name: "Flexible Remote",
            description: "Flexible schedule for remote employees",
            type: "flexible",
            work_hours_per_day: 8,
            work_days_per_week: 5,
            overtime_enabled: false,
            overtime_threshold_daily: null,
            overtime_threshold_weekly: null,
            break_duration_minutes: 30,
            is_default: false,
            is_active: true,
          },
        ] as TimePolicy[],
      };
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
        <span className="text-gray-700">{row.work_hours_per_day}h</span>
      ),
    },
    {
      id: "work_days",
      header: "Days/Week",
      cell: ({ row }) => (
        <span className="text-gray-700">{row.work_days_per_week}</span>
      ),
    },
    {
      id: "overtime",
      header: "Overtime",
      cell: ({ row }) => (
        <Badge variant={row.overtime_enabled ? "success" : "secondary"}>
          {row.overtime_enabled ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      id: "break",
      header: "Break (min)",
      cell: ({ row }) => (
        <span className="text-gray-700">{row.break_duration_minutes}</span>
      ),
    },
    {
      id: "default",
      header: "Default",
      cell: ({ row }) =>
        row.is_default ? (
          <Badge variant="primary">Default</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.is_active ? "success" : "default"} dot>
          {row.is_active ? "Active" : "Inactive"}
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
    toast.success("Policy created successfully");
    setShowCreateModal(false);
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
                {policies.filter((p) => p.is_active).length}
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
                {policies.find((p) => p.is_default)?.name ?? "None"}
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
