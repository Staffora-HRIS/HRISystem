export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  Briefcase,
  Plus,
  Search,
  ChevronLeft,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  type BadgeVariant,
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

interface Job {
  id: string;
  code: string;
  title: string;
  family: string | null;
  level: string | null;
  grade: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  status: string;
}

interface JobListResponse {
  items: Job[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CreateJobFormState {
  code: string;
  title: string;
  family: string;
  level: string;
  grade: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
}

const INITIAL_JOB_FORM: CreateJobFormState = {
  code: "",
  title: "",
  family: "",
  level: "",
  grade: "",
  salaryMin: "",
  salaryMax: "",
  currency: "GBP",
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  draft: "secondary",
  archived: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  draft: "Draft",
  archived: "Archived",
};

function formatCurrency(min: number | null, max: number | null, currency: string | null): string {
  if (min == null && max == null) return "-";
  const cur = currency ?? "GBP";
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(v);
  if (min != null && max != null) return `${fmt(min)} - ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

export default function JobCatalogPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [jobForm, setJobForm] = useState<CreateJobFormState>(INITIAL_JOB_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-hr-jobs", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("limit", "50");
      return api.get<JobListResponse>(`/hr/jobs?${params}`);
    },
  });

  const createJobMutation = useMutation({
    mutationFn: (formData: CreateJobFormState) =>
      api.post("/hr/jobs", {
        code: formData.code,
        title: formData.title,
        ...(formData.family ? { family: formData.family } : {}),
        ...(formData.level ? { level: formData.level } : {}),
        ...(formData.grade ? { grade: formData.grade } : {}),
        ...(formData.salaryMin ? { salary_min: Number(formData.salaryMin) } : {}),
        ...(formData.salaryMax ? { salary_max: Number(formData.salaryMax) } : {}),
        currency: formData.currency || "GBP",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-hr-jobs"] });
      toast.success("Job created successfully");
      setShowCreateModal(false);
      setJobForm(INITIAL_JOB_FORM);
    },
    onError: (err) => {
      toast.error("Failed to create job", {
        message: err instanceof ApiError ? err.message : "Please try again.",
      });
    },
  });

  const jobs = data?.items ?? [];

  const columns: ColumnDef<Job>[] = [
    {
      id: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-gray-600">{row.code}</span>
      ),
    },
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.title}</span>
      ),
    },
    {
      id: "family",
      header: "Family",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.family || "-"}</span>
      ),
    },
    {
      id: "level",
      header: "Level",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.level || "-"}</span>
      ),
    },
    {
      id: "grade",
      header: "Grade",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{row.grade || "-"}</span>
      ),
    },
    {
      id: "salaryRange",
      header: "Salary Range",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {formatCurrency(row.salaryMin, row.salaryMax, row.currency)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_BADGE[row.status] ?? "default"}>
          {STATUS_LABELS[row.status] || row.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to="/admin/hr"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to HR
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Catalog</h1>
            <p className="text-gray-600">Manage job definitions, families, and salary ranges</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Job
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search jobs..."
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
            { value: "draft", label: "Draft" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>

      {/* Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No jobs found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter
                  ? "Try adjusting your filters"
                  : "Start by adding your first job definition"}
              </p>
              {!search && !statusFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Job
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={jobs}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Job Modal */}
      {showCreateModal && (
        <Modal open onClose={() => { setShowCreateModal(false); setJobForm(INITIAL_JOB_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Job</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Job Code"
                placeholder="e.g., SWE-001"
                required
                value={jobForm.code}
                onChange={(e) => setJobForm((f) => ({ ...f, code: e.target.value }))}
              />
              <Input
                label="Title"
                placeholder="Enter job title"
                required
                value={jobForm.title}
                onChange={(e) => setJobForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Input
                label="Family"
                placeholder="e.g., Engineering, Finance"
                value={jobForm.family}
                onChange={(e) => setJobForm((f) => ({ ...f, family: e.target.value }))}
              />
              <Input
                label="Level"
                placeholder="e.g., Senior, Junior"
                value={jobForm.level}
                onChange={(e) => setJobForm((f) => ({ ...f, level: e.target.value }))}
              />
              <Input
                label="Grade"
                placeholder="e.g., L5, Band 3"
                value={jobForm.grade}
                onChange={(e) => setJobForm((f) => ({ ...f, grade: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Salary"
                  type="number"
                  placeholder="0"
                  value={jobForm.salaryMin}
                  onChange={(e) => setJobForm((f) => ({ ...f, salaryMin: e.target.value }))}
                />
                <Input
                  label="Max Salary"
                  type="number"
                  placeholder="0"
                  value={jobForm.salaryMax}
                  onChange={(e) => setJobForm((f) => ({ ...f, salaryMax: e.target.value }))}
                />
              </div>
              <Input
                label="Currency"
                placeholder="GBP"
                value={jobForm.currency}
                onChange={(e) => setJobForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setJobForm(INITIAL_JOB_FORM); }} disabled={createJobMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!jobForm.code || !jobForm.title || createJobMutation.isPending}
              loading={createJobMutation.isPending}
              onClick={() => createJobMutation.mutate(jobForm)}
            >
              {createJobMutation.isPending ? "Creating..." : "Create Job"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
