import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Route,
  Search,
  BookOpen,
  FileText,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
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

interface LearningPath {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: string;
  course_count: number;
  estimated_hours: number | null;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
}

interface LearningPathsResponse {
  items: LearningPath[];
  nextCursor: string | null;
  hasMore: boolean;
}

const statusConfig: Record<string, { variant: "secondary" | "success" | "default"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  published: { variant: "success", label: "Published" },
  archived: { variant: "default", label: "Archived" },
};

const categoryConfig: Record<string, { color: string; label: string }> = {
  onboarding: { color: "bg-green-100 text-green-700", label: "Onboarding" },
  compliance: { color: "bg-red-100 text-red-700", label: "Compliance" },
  leadership: { color: "bg-purple-100 text-purple-700", label: "Leadership" },
  technical: { color: "bg-blue-100 text-blue-700", label: "Technical" },
  career: { color: "bg-orange-100 text-orange-700", label: "Career" },
};

const categoryOptions = [
  { value: "onboarding", label: "Onboarding" },
  { value: "compliance", label: "Compliance" },
  { value: "leadership", label: "Leadership" },
  { value: "technical", label: "Technical" },
  { value: "career", label: "Career" },
];

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export default function LearningPathsPage() {
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
  const [formCategory, setFormCategory] = useState("technical");
  const [formIsMandatory, setFormIsMandatory] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-learning-paths", search, statusFilter, categoryFilter],
    queryFn: () =>
      api.get<LearningPathsResponse>("/lms/learning-paths", {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        },
      }),
  });

  const createMutation = useMutation({
    mutationFn: (pathData: Record<string, unknown>) =>
      api.post("/lms/learning-paths", pathData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-learning-paths"] });
      toast.success("Learning path created successfully");
      resetForm();
      setShowCreateModal(false);
    },
    onError: () => {
      toast.error("Failed to create learning path");
    },
  });

  const paths = data?.items || [];

  const stats = {
    total: paths.length,
    published: paths.filter((p) => p.status === "published").length,
    draft: paths.filter((p) => p.status === "draft").length,
  };

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormCategory("technical");
    setFormIsMandatory(false);
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      title: formTitle,
      description: formDescription || undefined,
      category: formCategory,
      is_mandatory: formIsMandatory,
    });
  }

  const columns = useMemo<ColumnDef<LearningPath>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {row.title}
          </div>
        ),
      },
      {
        id: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate block max-w-xs">
            {row.description || "-"}
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
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const config = statusConfig[row.status];
          return config ? (
            <Badge variant={config.variant}>{config.label}</Badge>
          ) : (
            <Badge>{row.status}</Badge>
          );
        },
      },
      {
        id: "course_count",
        header: "Courses",
        align: "center",
        cell: ({ row }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {row.course_count}
          </span>
        ),
      },
      {
        id: "estimated_hours",
        header: "Est. Hours",
        align: "center",
        cell: ({ row }) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {row.estimated_hours != null ? `${row.estimated_hours}h` : "-"}
          </span>
        ),
      },
      {
        id: "is_mandatory",
        header: "Mandatory",
        align: "center",
        cell: ({ row }) =>
          row.is_mandatory ? (
            <Badge variant="warning">Yes</Badge>
          ) : (
            <Badge variant="secondary">No</Badge>
          ),
      },
      {
        id: "updated_at",
        header: "Last Updated",
        cell: ({ row }) => (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(row.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        align: "right",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.info("View path", { message: `Path: ${row.title}` })}
            >
              View
            </Button>
          </div>
        ),
      },
    ],
    [toast]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/lms")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Learning Paths</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Create and manage structured learning journeys for employees
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Path
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Route className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Paths</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <BookOpen className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Published</p>
              <p className="text-2xl font-bold">{stats.published}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <FileText className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Draft</p>
              <p className="text-2xl font-bold">{stats.draft}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader
          title="All Learning Paths"
          bordered
          action={
            <div className="flex items-center gap-3">
              <div className="w-64">
                <Input
                  placeholder="Search paths..."
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
            data={paths}
            loading={isLoading}
            emptyMessage="No learning paths found. Create your first path to get started."
            emptyIcon={<Route className="h-12 w-12 text-gray-300" />}
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
        size="md"
      >
        <form onSubmit={handleCreateSubmit}>
          <ModalHeader
            title="Create Learning Path"
            subtitle="Define a new structured learning journey"
          />
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Title"
                placeholder="Enter path title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
              />
              <Textarea
                label="Description"
                placeholder="Describe the learning path objectives and target audience..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={3}
              />
              <Select
                label="Category"
                options={categoryOptions}
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              />
              <Checkbox
                label="Mandatory"
                description="Require all applicable employees to complete this learning path"
                checked={formIsMandatory}
                onChange={(e) => setFormIsMandatory(e.target.checked)}
              />
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
            <Button
              type="submit"
              disabled={!formTitle.trim() || createMutation.isPending}
              loading={createMutation.isPending}
            >
              Create Path
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
