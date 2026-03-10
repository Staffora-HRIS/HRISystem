import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Plus,
  Search,
  Download,
  MoreHorizontal,
  Calendar,
  Mail,
  Phone,
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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  workPhone: string | null;
  status: string;
  employmentType: string;
  hireDate: string;
  terminationDate: string | null;
  positionTitle: string | null;
  departmentName: string | null;
  managerName: string | null;
  locationName: string | null;
  createdAt: string;
}

interface EmployeeListResponse {
  items: Employee[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface EmployeeStats {
  total: number;
  active: number;
  onLeave: number;
  terminated: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "success",
  on_leave: "warning",
  terminated: "danger",
  pending: "secondary",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_leave: "On Leave",
  terminated: "Terminated",
  pending: "Pending",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminEmployeesPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [showHireModal, setShowHireModal] = useState(false);

  // Fetch employees
  const { data: employeesData, isLoading } = useQuery({
    queryKey: ["admin-employees", search, statusFilter, departmentFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (departmentFilter) params.set("org_unit_id", departmentFilter);
      params.set("limit", "50");
      return api.get<EmployeeListResponse>(`/hr/employees?${params}`);
    },
  });

  // Fetch departments for filter
  const { data: departments } = useQuery({
    queryKey: ["admin-org-units"],
    queryFn: () =>
      api.get<{ items: { id: string; name: string }[] }>("/hr/org-units?limit=100"),
  });

  // Calculate stats from data
  const stats: EmployeeStats = {
    total: employeesData?.items.length ?? 0,
    active: employeesData?.items.filter((e) => e.status === "active").length ?? 0,
    onLeave: employeesData?.items.filter((e) => e.status === "on_leave").length ?? 0,
    terminated: employeesData?.items.filter((e) => e.status === "terminated").length ?? 0,
  };

  const employees = employeesData?.items ?? [];

  const columns: ColumnDef<Employee>[] = [
    {
      id: "employee",
      header: "Employee",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
            {row.firstName[0]}
            {row.lastName[0]}
          </div>
          <div>
            <div className="font-medium text-gray-900">
              {row.firstName} {row.lastName}
            </div>
            <div className="text-sm text-gray-500">{row.employeeNumber}</div>
          </div>
        </div>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.positionTitle || "-"}</div>
          <div className="text-sm text-gray-500">{row.departmentName || "-"}</div>
        </div>
      ),
    },
    {
      id: "contact",
      header: "Contact",
      cell: ({ row }) => (
        <div className="text-sm">
          <div className="flex items-center gap-1 text-gray-600">
            <Mail className="h-3 w-3" />
            {row.email}
          </div>
          {row.workPhone && (
            <div className="flex items-center gap-1 text-gray-500">
              <Phone className="h-3 w-3" />
              {row.workPhone}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "hireDate",
      header: "Hire Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">{formatDate(row.hireDate)}</div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={STATUS_COLORS[row.status] as any}>
          {STATUS_LABELS[row.status] || row.status}
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
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/hr/employees/${row.id}`);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-600">Manage your workforce</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => toast.info("Coming Soon", { message: "Employee export will be available in a future update." })}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowHireModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Hire Employee
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Employees</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Users className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Calendar className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">On Leave</p>
              <p className="text-2xl font-bold">{stats.onLeave}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <Users className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Terminated</p>
              <p className="text-2xl font-bold">{stats.terminated}</p>
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
            { value: "active", label: "Active" },
            { value: "on_leave", label: "On Leave" },
            { value: "terminated", label: "Terminated" },
            { value: "pending", label: "Pending" },
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          options={[
            { value: "", label: "All Departments" },
            ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
          ]}
        />
      </div>

      {/* Employee Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No employees found</h3>
              <p className="text-gray-500 mb-4">
                {search || statusFilter || departmentFilter
                  ? "Try adjusting your filters"
                  : "Start by hiring your first employee"}
              </p>
              {!search && !statusFilter && !departmentFilter && (
                <Button onClick={() => setShowHireModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Hire Employee
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={employees}
              columns={columns}
              onRowClick={(row) => navigate(`/admin/hr/employees/${row.id}`)}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Hire Modal */}
      {showHireModal && (
        <Modal open onClose={() => setShowHireModal(false)} size="lg">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Hire New Employee</h3>
          </ModalHeader>
          <ModalBody>
            <p className="text-gray-600 mb-4">
              Fill in the details below to hire a new employee.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="First Name" placeholder="Enter first name" required />
              <Input label="Last Name" placeholder="Enter last name" required />
              <Input label="Email" type="email" placeholder="Enter email" required />
              <Input label="Hire Date" type="date" required />
              <Select
                label="Department"
                options={[
                  { value: "", label: "Select department" },
                  ...(departments?.items.map((d) => ({ value: d.id, label: d.name })) ?? []),
                ]}
              />
              <Select
                label="Employment Type"
                options={[
                  { value: "full_time", label: "Full Time" },
                  { value: "part_time", label: "Part Time" },
                  { value: "contractor", label: "Contractor" },
                  { value: "intern", label: "Intern" },
                ]}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowHireModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.info("Coming Soon", { message: "Employee creation via this form will be available in a future update." });
                setShowHireModal(false);
              }}
            >
              Hire Employee
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
