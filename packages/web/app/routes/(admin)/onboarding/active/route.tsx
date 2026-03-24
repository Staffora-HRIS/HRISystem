import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Search,
  ClipboardList,
  CheckCircle,
  Clock,
  Mail,
  ArrowLeft,
  Plus,
  X,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  Button,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface OnboardingInstance {
  id: string;
  employeeId: string;
  employeeName: string | null;
  templateId: string;
  templateName: string | null;
  status: string;
  progress: number;
  startDate: string;
  targetCompletionDate: string | null;
  completedAt: string | null;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

interface OnboardingListResponse {
  instances: OnboardingInstance[];
  count: number;
  nextCursor: string | null;
  hasMore: boolean;
}

interface OnboardingChecklist {
  id: string;
  name: string;
}

interface OnboardingFormData {
  employeeId: string;
  checklistId: string;
  startDate: string;
}

const STATUS_BADGE_VARIANT: Record<string, string> = {
  not_started: "secondary",
  in_progress: "info",
  completed: "success",
  cancelled: "default",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
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

function getProgressColor(progress: number): string {
  if (progress >= 75) return "bg-green-500";
  if (progress >= 25) return "bg-yellow-500";
  return "bg-red-500";
}

const initialOnboardingForm: OnboardingFormData = {
  employeeId: "",
  checklistId: "",
  startDate: new Date().toISOString().split("T")[0],
};

export default function ActiveOnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [formData, setFormData] = useState<OnboardingFormData>(initialOnboardingForm);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-onboarding-instances", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<OnboardingListResponse>(`/onboarding/instances?${params}`);
    },
  });

  const { data: checklistsData } = useQuery({
    queryKey: ["onboarding-checklists"],
    queryFn: () => api.get<{ checklists: OnboardingChecklist[]; count: number }>("/onboarding/checklists"),
    enabled: showStartModal,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/onboarding/instances", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-onboarding-instances"] });
      toast.success("Onboarding started successfully");
      setShowStartModal(false);
      setFormData(initialOnboardingForm);
    },
    onError: () => {
      toast.error("Failed to start onboarding", {
        message: "Please check your input and try again.",
      });
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.post(`/onboarding/instances/${instanceId}/remind`),
    onSuccess: () => {
      toast.success("Reminder sent successfully");
    },
    onError: () => {
      toast.error("Failed to send reminder", {
        message: "Please try again in a moment.",
      });
    },
  });

  const handleStartOnboarding = () => {
    if (!formData.employeeId.trim()) {
      toast.warning("Please enter an employee ID");
      return;
    }
    if (!formData.checklistId) {
      toast.warning("Please select a checklist");
      return;
    }
    createMutation.mutate({
      employeeId: formData.employeeId.trim(),
      checklistId: formData.checklistId,
      startDate: formData.startDate,
    });
  };

  const instances = data?.instances ?? [];
  const checklists = checklistsData?.checklists ?? [];

  const stats = useMemo(() => ({
    total: instances.length,
    inProgress: instances.filter((i) => i.status === "in_progress").length,
    completed: instances.filter((i) => i.status === "completed").length,
    notStarted: instances.filter((i) => i.status === "not_started").length,
  }), [instances]);

  const columns = useMemo<ColumnDef<OnboardingInstance>[]>(() => [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => {
        const initials = (row.employeeName || "")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {initials || "?"}
            </div>
            <div className="font-medium text-gray-900">
              {row.employeeName || "Unknown"}
            </div>
          </div>
        );
      },
    },
    {
      id: "checklist",
      header: "Checklist",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {row.templateName || "-"}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE_VARIANT[row.status] as any}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      cell: ({ row }) => {
        const percentage =
          row.taskCount > 0
            ? Math.round((row.completedTaskCount / row.taskCount) * 100)
            : 0;
        return (
          <div className="min-w-[140px]">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>
                {row.completedTaskCount}/{row.taskCount} tasks
              </span>
              <span>{percentage}%</span>
            </div>
            <div
              className="h-2 w-full rounded-full bg-gray-200"
              role="progressbar"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${percentage}% complete`}
            >
              <div
                className={`h-2 rounded-full transition-all ${getProgressColor(percentage)}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">{formatDate(row.startDate)}</div>
      ),
    },
    {
      id: "targetDate",
      header: "Target Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {formatDate(row.targetCompletionDate)}
        </div>
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
              navigate(`/admin/onboarding/active/${row.id}`);
            }}
            aria-label={`View onboarding details for ${row.employeeName || "employee"}`}
          >
            <ClipboardList className="h-4 w-4" />
          </Button>
          {row.status !== "completed" && row.status !== "cancelled" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                sendReminderMutation.mutate(row.id);
              }}
              disabled={sendReminderMutation.isPending}
              aria-label={`Send reminder to ${row.employeeName || "employee"}`}
            >
              <Mail className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ], [navigate, sendReminderMutation]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/onboarding")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Active Onboarding</h1>
          <p className="text-gray-600">Track employee onboarding progress</p>
        </div>
        <Button onClick={() => setShowStartModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Start Onboarding
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100">
              <Clock className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <ClipboardList className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Not Started</p>
              <p className="text-2xl font-bold">{stats.notStarted}</p>
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
            { value: "not_started", label: "Not Started" },
            { value: "in_progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
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
          ) : instances.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No onboarding instances found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "No active onboarding processes yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={instances}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Start Onboarding Modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowStartModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" role="dialog" aria-modal="true" aria-label="Start Onboarding">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Start Onboarding</h3>
              <button type="button" onClick={() => setShowStartModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="ob-employee" className="block text-sm font-medium text-gray-700 mb-1">Employee ID *</label>
                <input
                  id="ob-employee"
                  type="text"
                  value={formData.employeeId}
                  onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Employee UUID"
                />
              </div>
              <div>
                <label htmlFor="ob-checklist" className="block text-sm font-medium text-gray-700 mb-1">Checklist *</label>
                <select
                  id="ob-checklist"
                  value={formData.checklistId}
                  onChange={(e) => setFormData({ ...formData, checklistId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="">Select a checklist...</option>
                  {checklists.map((cl) => (
                    <option key={cl.id} value={cl.id}>{cl.name}</option>
                  ))}
                </select>
                {checklists.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No checklists available. Create one first in the Onboarding settings.</p>
                )}
              </div>
              <div>
                <label htmlFor="ob-start-date" className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input
                  id="ob-start-date"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setShowStartModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleStartOnboarding}
                disabled={!formData.employeeId.trim() || !formData.checklistId || !formData.startDate || createMutation.isPending}
              >
                {createMutation.isPending ? "Starting..." : "Start Onboarding"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
