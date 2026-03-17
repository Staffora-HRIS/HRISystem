export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Search,
  Users,
  Edit,
} from "lucide-react";
import {
  Card,
  CardBody,
  Button,
  Badge,
  DataTable,
  type ColumnDef,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { invalidationPatterns } from "~/lib/query-client";

interface CreatePositionFormState {
  title: string;
  code: string;
  orgUnitId: string;
  jobGrade: string;
  minSalary: string;
  maxSalary: string;
  headcount: string;
}

const INITIAL_POSITION_FORM: CreatePositionFormState = {
  title: "",
  code: "",
  orgUnitId: "",
  jobGrade: "",
  minSalary: "",
  maxSalary: "",
  headcount: "1",
};

interface Position {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string | null;
  orgUnitId: string | null;
  orgUnitName?: string;
  jobGrade: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  currency: string;
  isManager: boolean;
  headcount: number;
  currentHeadcount?: number;
  reportsToPositionId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PositionListResponse {
  items: Position[];
  nextCursor: string | null;
  hasMore: boolean;
}

function formatSalary(amount: number | null, currency: string): string {
  if (amount == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminPositionsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [posForm, setPosForm] = useState<CreatePositionFormState>(INITIAL_POSITION_FORM);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [editForm, setEditForm] = useState<CreatePositionFormState>(INITIAL_POSITION_FORM);

  const { data: positionsData, isLoading } = useQuery({
    queryKey: ["admin-positions", search, departmentFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (departmentFilter) params.set("orgUnitId", departmentFilter);
      params.set("limit", "100");
      return api.get<PositionListResponse>(`/hr/positions?${params}`);
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["admin-org-units-for-positions"],
    queryFn: () =>
      api.get<{ items: { id: string; name: string }[] }>("/hr/org-units?limit=100"),
  });

  // Create position mutation
  const createPositionMutation = useMutation({
    mutationFn: (data: CreatePositionFormState) =>
      api.post("/hr/positions", {
        title: data.title,
        code: data.code.toUpperCase(),
        org_unit_id: data.orgUnitId,
        ...(data.jobGrade ? { job_grade: data.jobGrade } : {}),
        ...(data.minSalary ? { min_salary: Number(data.minSalary) } : {}),
        ...(data.maxSalary ? { max_salary: Number(data.maxSalary) } : {}),
        headcount: Number(data.headcount) || 1,
      }),
    onSuccess: () => {
      invalidationPatterns.organization().forEach((key) =>
        qc.invalidateQueries({ queryKey: key })
      );
      qc.invalidateQueries({ queryKey: ["admin-positions"] });
      toast.success("Position created successfully");
      setShowCreateModal(false);
      setPosForm(INITIAL_POSITION_FORM);
    },
    onError: (err) => {
      toast.error("Failed to create position", {
        message: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  // Update position mutation
  const updatePositionMutation = useMutation({
    mutationFn: (data: { id: string; form: CreatePositionFormState }) =>
      api.put(`/hr/positions/${data.id}`, {
        title: data.form.title,
        code: data.form.code.toUpperCase(),
        org_unit_id: data.form.orgUnitId,
        ...(data.form.jobGrade ? { job_grade: data.form.jobGrade } : {}),
        ...(data.form.minSalary ? { min_salary: Number(data.form.minSalary) } : {}),
        ...(data.form.maxSalary ? { max_salary: Number(data.form.maxSalary) } : {}),
        headcount: Number(data.form.headcount) || 1,
      }),
    onSuccess: () => {
      invalidationPatterns.organization().forEach((key) =>
        qc.invalidateQueries({ queryKey: key })
      );
      qc.invalidateQueries({ queryKey: ["admin-positions"] });
      toast.success("Position updated successfully");
      setEditingPosition(null);
      setEditForm(INITIAL_POSITION_FORM);
    },
    onError: (err) => {
      toast.error("Failed to update position", {
        message: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const positions = positionsData?.items ?? [];

  // Calculate stats
  const totalPositions = positions.length;
  const filledPositions = positions.filter(
    (p) => (p.currentHeadcount ?? 0) >= p.headcount
  ).length;
  const openPositions = positions.reduce(
    (sum, p) => sum + Math.max(0, p.headcount - (p.currentHeadcount ?? 0)),
    0
  );

  const columns: ColumnDef<Position>[] = [
    {
      id: "title",
      header: "Position",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
            <Briefcase className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.title}</div>
            {row.code && (
              <div className="text-sm text-gray-500">{row.code}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-gray-600">{row.orgUnitName || "-"}</span>
      ),
    },
    {
      id: "grade",
      header: "Grade",
      cell: ({ row }) => (
        <span className="text-gray-600">{row.jobGrade || "-"}</span>
      ),
    },
    {
      id: "salary",
      header: "Salary Range",
      cell: ({ row }) => (
        <div className="text-sm">
          {row.minSalary != null || row.maxSalary != null ? (
            <span className="text-gray-600">
              {formatSalary(row.minSalary, row.currency)} -{" "}
              {formatSalary(row.maxSalary, row.currency)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      id: "headcount",
      header: "Headcount",
      cell: ({ row }) => {
        const current = row.currentHeadcount ?? 0;
        const target = row.headcount;
        return (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span
              className={
                current < target ? "text-orange-600" : "text-gray-600"
              }
            >
              {current} / {target}
            </span>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.isActive ? "success" : "secondary"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit position ${row.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setEditingPosition(row);
            setEditForm({
              title: row.title,
              code: row.code,
              orgUnitId: row.orgUnitId || "",
              jobGrade: row.jobGrade || "",
              minSalary: row.minSalary != null ? String(row.minSalary) : "",
              maxSalary: row.maxSalary != null ? String(row.maxSalary) : "",
              headcount: String(row.headcount),
            });
          }}
        >
          <Edit className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Positions</h1>
          <p className="text-gray-600">Manage job positions and headcount</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Position
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Briefcase className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Positions</p>
              <p className="text-2xl font-bold">{totalPositions}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Filled Positions</p>
              <p className="text-2xl font-bold">{filledPositions}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
              <Briefcase className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Open Slots</p>
              <p className="text-2xl font-bold">{openPositions}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search positions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          options={[
            { value: "", label: "All Departments" },
            ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
          ]}
        />
      </div>

      {/* Positions Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No positions found</h3>
              <p className="text-gray-500 mb-4">
                {search || departmentFilter
                  ? "Try adjusting your filters"
                  : "Create your first position to get started"}
              </p>
              {!search && !departmentFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Position
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={positions}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal open onClose={() => { setShowCreateModal(false); setPosForm(INITIAL_POSITION_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Position</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Title"
                placeholder="Enter position title"
                required
                value={posForm.title}
                onChange={(e) => setPosForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Input
                label="Position Code"
                placeholder="Enter position code (e.g., SWE01)"
                required
                value={posForm.code}
                onChange={(e) => setPosForm((f) => ({ ...f, code: e.target.value }))}
              />
              <Select
                label="Department"
                value={posForm.orgUnitId}
                onChange={(e) => setPosForm((f) => ({ ...f, orgUnitId: e.target.value }))}
                options={[
                  { value: "", label: "Select department" },
                  ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
                ]}
              />
              <Input
                label="Job Grade"
                placeholder="e.g., L5, Senior"
                value={posForm.jobGrade}
                onChange={(e) => setPosForm((f) => ({ ...f, jobGrade: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Salary"
                  type="number"
                  placeholder="0"
                  value={posForm.minSalary}
                  onChange={(e) => setPosForm((f) => ({ ...f, minSalary: e.target.value }))}
                />
                <Input
                  label="Max Salary"
                  type="number"
                  placeholder="0"
                  value={posForm.maxSalary}
                  onChange={(e) => setPosForm((f) => ({ ...f, maxSalary: e.target.value }))}
                />
              </div>
              <Input
                label="Target Headcount"
                type="number"
                value={posForm.headcount}
                onChange={(e) => setPosForm((f) => ({ ...f, headcount: e.target.value }))}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setShowCreateModal(false); setPosForm(INITIAL_POSITION_FORM); }} disabled={createPositionMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!posForm.title || !posForm.code || !posForm.orgUnitId || createPositionMutation.isPending}
              loading={createPositionMutation.isPending}
              onClick={() => createPositionMutation.mutate(posForm)}
            >
              {createPositionMutation.isPending ? "Creating..." : "Create Position"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Edit Position Modal */}
      {editingPosition && (
        <Modal open onClose={() => { setEditingPosition(null); setEditForm(INITIAL_POSITION_FORM); }} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Edit Position: {editingPosition.title}</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Title"
                placeholder="Enter position title"
                required
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Input
                label="Position Code"
                placeholder="Enter position code (e.g., SWE01)"
                required
                value={editForm.code}
                onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
              />
              <Select
                label="Department"
                value={editForm.orgUnitId}
                onChange={(e) => setEditForm((f) => ({ ...f, orgUnitId: e.target.value }))}
                options={[
                  { value: "", label: "Select department" },
                  ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
                ]}
              />
              <Input
                label="Job Grade"
                placeholder="e.g., L5, Senior"
                value={editForm.jobGrade}
                onChange={(e) => setEditForm((f) => ({ ...f, jobGrade: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Min Salary"
                  type="number"
                  placeholder="0"
                  value={editForm.minSalary}
                  onChange={(e) => setEditForm((f) => ({ ...f, minSalary: e.target.value }))}
                />
                <Input
                  label="Max Salary"
                  type="number"
                  placeholder="0"
                  value={editForm.maxSalary}
                  onChange={(e) => setEditForm((f) => ({ ...f, maxSalary: e.target.value }))}
                />
              </div>
              <Input
                label="Target Headcount"
                type="number"
                value={editForm.headcount}
                onChange={(e) => setEditForm((f) => ({ ...f, headcount: e.target.value }))}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => { setEditingPosition(null); setEditForm(INITIAL_POSITION_FORM); }} disabled={updatePositionMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!editForm.title || !editForm.code || !editForm.orgUnitId || updatePositionMutation.isPending}
              loading={updatePositionMutation.isPending}
              onClick={() => updatePositionMutation.mutate({ id: editingPosition.id, form: editForm })}
            >
              {updatePositionMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
