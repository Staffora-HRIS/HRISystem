import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Target,
  Search,
  CheckCircle,
  AlertTriangle,
  Edit,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  type ColumnDef,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Textarea,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  employeeId: string;
  employeeName: string | null;
  category: string;
  status: string;
  priority: string;
  targetDate: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

interface GoalsResponse {
  items: Goal[];
  nextCursor: string | null;
  hasMore: boolean;
}

const statusConfig: Record<string, { variant: "secondary" | "info" | "success"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  active: { variant: "info", label: "Active" },
  completed: { variant: "success", label: "Completed" },
  cancelled: { variant: "secondary", label: "Cancelled" },
};

const categoryConfig: Record<string, { color: string; label: string }> = {
  performance: { color: "bg-blue-100 text-blue-700", label: "Performance" },
  development: { color: "bg-purple-100 text-purple-700", label: "Development" },
  project: { color: "bg-green-100 text-green-700", label: "Project" },
  team: { color: "bg-orange-100 text-orange-700", label: "Team" },
};

const priorityConfig: Record<string, { variant: "default" | "info" | "warning"; label: string }> = {
  low: { variant: "default", label: "Low" },
  medium: { variant: "info", label: "Medium" },
  high: { variant: "warning", label: "High" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function isOverdue(goal: Goal): boolean {
  if (!goal.targetDate) return false;
  if (goal.status === "completed" || goal.status === "cancelled") return false;
  return new Date(goal.targetDate) < new Date();
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color =
    clamped >= 75
      ? "bg-green-500"
      : clamped >= 25
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{clamped}%</span>
    </div>
  );
}

const categoryOptions = [
  { value: "performance", label: "Performance" },
  { value: "development", label: "Development" },
  { value: "project", label: "Project" },
  { value: "team", label: "Team" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function GoalsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("performance");
  const [formPriority, setFormPriority] = useState("medium");
  const [formTargetDate, setFormTargetDate] = useState("");
  const [formEmployeeId, setFormEmployeeId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-goals", search, statusFilter, categoryFilter],
    queryFn: () =>
      api.get<GoalsResponse>("/talent/goals", {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        },
      }),
  });

  const createMutation = useMutation({
    mutationFn: (goalData: Record<string, unknown>) =>
      api.post("/talent/goals", goalData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-goals"] });
      toast.success("Goal created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to create goal");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (goalId: string) => api.delete(`/talent/goals/${goalId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-goals"] });
      toast.success("Goal deleted");
    },
    onError: () => {
      toast.error("Failed to delete goal");
    },
  });

  const goals = data?.items || [];

  const stats = {
    total: goals.length,
    active: goals.filter((g) => g.status === "active").length,
    completed: goals.filter((g) => g.status === "completed").length,
    overdue: goals.filter(isOverdue).length,
  };

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("performance");
    setFormPriority("medium");
    setFormTargetDate("");
    setFormEmployeeId("");
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      title: formTitle,
      description: formDescription || undefined,
      category: formCategory,
      priority: formPriority,
      targetDate: formTargetDate || undefined,
      employeeId: formEmployeeId || undefined,
    });
  }

  const columns = useMemo<ColumnDef<Goal>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {row.title}
            </div>
            {row.description && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                {row.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "employee",
        header: "Employee",
        cell: ({ row }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.employeeName || "-"}
          </span>
        ),
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => {
          const config = categoryConfig[row.category];
          return config ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
            >
              {config.label}
            </span>
          ) : (
            <Badge variant="secondary">{row.category}</Badge>
          );
        },
      },
      {
        id: "priority",
        header: "Priority",
        cell: ({ row }) => {
          const config = priorityConfig[row.priority];
          return config ? (
            <Badge variant={config.variant}>{config.label}</Badge>
          ) : (
            <Badge>{row.priority}</Badge>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          if (isOverdue(row)) {
            return <Badge variant="warning">Overdue</Badge>;
          }
          const config = statusConfig[row.status];
          return config ? (
            <Badge variant={config.variant}>{config.label}</Badge>
          ) : (
            <Badge>{row.status}</Badge>
          );
        },
      },
      {
        id: "progress",
        header: "Progress",
        cell: ({ row }) => <ProgressBar value={row.progress} />,
      },
      {
        id: "targetDate",
        header: "Target Date",
        cell: ({ row }) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {row.targetDate ? formatDate(row.targetDate) : "-"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.info("Edit goal", { message: `Edit: ${row.title}` })}
              aria-label={`Edit ${row.title}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate(row.id)}
              disabled={deleteMutation.isPending}
              aria-label={`Delete ${row.title}`}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteMutation, toast]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Goals</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track and manage employee goals across the organization
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Goal
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Target className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Goals</p>
              <p className="text-2xl font-bold">{stats.total}</p>
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
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold">{stats.completed}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Overdue</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.overdue}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader
          title="All Goals"
          bordered
          action={
            <div className="flex items-center gap-3">
              <div className="w-64">
                <Input
                  placeholder="Search goals..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                aria-label="Filter by category"
              >
                <option value="">All Categories</option>
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          }
        />
        <CardBody padding="none">
          <DataTable
            columns={columns}
            data={goals}
            loading={isLoading}
            emptyMessage="No goals found. Create your first goal to get started."
            emptyIcon={<Target className="h-12 w-12 text-gray-300" />}
          />
        </CardBody>
      </Card>

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetForm();
        }}
        size="lg"
      >
        <form onSubmit={handleCreateSubmit}>
          <ModalHeader title="Create Goal" subtitle="Define a new goal for an employee" />
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Title"
                placeholder="Enter goal title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
              />
              <Textarea
                label="Description"
                placeholder="Describe the goal objectives and expected outcomes..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Category"
                  options={categoryOptions}
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                />
                <Select
                  label="Priority"
                  options={priorityOptions}
                  value={formPriority}
                  onChange={(e) => setFormPriority(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Target Date"
                  type="date"
                  value={formTargetDate}
                  onChange={(e) => setFormTargetDate(e.target.value)}
                />
                <Input
                  label="Employee ID"
                  placeholder="Employee UUID"
                  value={formEmployeeId}
                  onChange={(e) => setFormEmployeeId(e.target.value)}
                  hint="Leave blank to assign later"
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!formTitle.trim() || createMutation.isPending} loading={createMutation.isPending}>
              Create Goal
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
