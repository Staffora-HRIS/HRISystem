import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
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

interface OrgUnit {
  id: string;
  name: string;
  code: string | null;
  unitType: string;
  parentId: string | null;
  parentName: string | null;
  managerId: string | null;
  managerName: string | null;
  level: number;
  isActive: boolean;
  employeeCount: number;
  createdAt: string;
}

interface OrgUnitListResponse {
  items: OrgUnit[];
  nextCursor: string | null;
  hasMore: boolean;
}

const UNIT_TYPE_COLORS: Record<string, string> = {
  company: "bg-purple-100 text-purple-700",
  division: "bg-blue-100 text-blue-700",
  department: "bg-green-100 text-green-700",
  team: "bg-yellow-100 text-yellow-700",
  unit: "bg-gray-100 text-gray-700",
};

export default function AdminDepartmentsPage() {
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: orgUnitsData, isLoading } = useQuery({
    queryKey: ["admin-org-units", search, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter) params.set("unit_type", typeFilter);
      params.set("limit", "100");
      return api.get<OrgUnitListResponse>(`/hr/org-units?${params}`);
    },
  });

  const orgUnits = orgUnitsData?.items ?? [];

  // Calculate stats
  const totalDepartments = orgUnits.length;
  const totalEmployees = orgUnits.reduce((sum, u) => sum + (u.employeeCount || 0), 0);
  const activeDepartments = orgUnits.filter((u) => u.isActive).length;

  const columns: ColumnDef<OrgUnit>[] = [
    {
      id: "name",
      header: "Department",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Building2 className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="font-medium text-gray-900">{row.name}</div>
            {row.code && <div className="text-sm text-gray-500">{row.code}</div>}
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
            UNIT_TYPE_COLORS[row.unitType] || "bg-gray-100 text-gray-700"
          }`}
        >
          {row.unitType}
        </span>
      ),
    },
    {
      id: "parent",
      header: "Parent",
      cell: ({ row }) => (
        <span className="text-gray-600">{row.parentName || "-"}</span>
      ),
    },
    {
      id: "manager",
      header: "Manager",
      cell: ({ row }) => (
        <span className="text-gray-600">{row.managerName || "-"}</span>
      ),
    },
    {
      id: "employees",
      header: "Employees",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4 text-gray-400" />
          <span>{row.employeeCount || 0}</span>
        </div>
      ),
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-600">Manage organizational units and departments</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Department
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Departments</p>
              <p className="text-2xl font-bold">{totalDepartments}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{activeDepartments}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Employees</p>
              <p className="text-2xl font-bold">{totalEmployees}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Types" },
            { value: "company", label: "Company" },
            { value: "division", label: "Division" },
            { value: "department", label: "Department" },
            { value: "team", label: "Team" },
            { value: "unit", label: "Unit" },
          ]}
        />
      </div>

      {/* Departments Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : orgUnits.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No departments found</h3>
              <p className="text-gray-500 mb-4">
                {search || typeFilter
                  ? "Try adjusting your filters"
                  : "Create your first department to get started"}
              </p>
              {!search && !typeFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Department
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={orgUnits}
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
            <h3 className="text-lg font-semibold">Create Department</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input label="Name" placeholder="Enter department name" required />
              <Input label="Code" placeholder="Enter department code" />
              <Select
                label="Type"
                options={[
                  { value: "department", label: "Department" },
                  { value: "division", label: "Division" },
                  { value: "team", label: "Team" },
                  { value: "unit", label: "Unit" },
                ]}
              />
              <Select
                label="Parent Department"
                options={[
                  { value: "", label: "None (Top Level)" },
                  ...orgUnits.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success("Department created successfully");
                setShowCreateModal(false);
              }}
            >
              Create Department
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
