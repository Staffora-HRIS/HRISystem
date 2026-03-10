import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function AdminPositionsPage() {
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

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
      cell: () => (
        <Button variant="ghost" size="sm">
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
        <Modal open onClose={() => setShowCreateModal(false)} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Position</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="Title" placeholder="Enter position title" required />
              <Input label="Position Code" placeholder="Enter position code" />
              <Select
                label="Department"
                options={[
                  { value: "", label: "Select department" },
                  ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
                ]}
              />
              <Input label="Job Grade" placeholder="e.g., L5, Senior" />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Min Salary" type="number" placeholder="0" />
                <Input label="Max Salary" type="number" placeholder="0" />
              </div>
              <Input label="Target Headcount" type="number" defaultValue="1" />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success("Position created successfully");
                setShowCreateModal(false);
              }}
            >
              Create Position
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
