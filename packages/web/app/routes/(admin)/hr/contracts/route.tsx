import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Search,
  FileText,
  AlertTriangle,
  Clock,
  MoreHorizontal,
  Download,
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

interface EmployeeContract {
  id: string;
  employee_id: string;
  employee_name: string | null;
  employee_number: string;
  contract_type: string;
  start_date: string;
  end_date: string | null;
  status: string;
  position_title: string | null;
  org_unit_name: string | null;
  salary: number | null;
  currency: string | null;
}

interface EmployeeRaw {
  id: string;
  employee_number: string;
  full_name: string;
  display_name: string;
  hire_date: string;
  termination_date?: string | null;
  status: string;
  position_title: string | null;
  org_unit_name: string | null;
  employment_type?: string;
  contract_type?: string;
  contract_end_date?: string | null;
  salary?: number | null;
  currency?: string | null;
}

interface EmployeeListResponse {
  items: EmployeeRaw[];
  nextCursor: string | null;
  hasMore: boolean;
}

const CONTRACT_TYPE_BADGE_VARIANT: Record<string, string> = {
  full_time: "success",
  part_time: "info",
  contractor: "warning",
  intern: "secondary",
  temporary: "default",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contractor: "Contractor",
  intern: "Intern",
  temporary: "Temporary",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  active: "success",
  expired: "warning",
  terminated: "default",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function deriveContractStatus(employee: EmployeeRaw): string {
  if (employee.status === "terminated") return "terminated";
  const endDate = employee.contract_end_date;
  if (endDate && new Date(endDate) < new Date()) return "expired";
  return "active";
}

function isExpiringSoon(endDate: string | null): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);
  return end > now && end <= thirtyDaysFromNow;
}

function mapToContract(emp: EmployeeRaw): EmployeeContract {
  return {
    id: emp.id,
    employee_id: emp.id,
    employee_name: emp.display_name || emp.full_name || null,
    employee_number: emp.employee_number,
    contract_type: emp.contract_type || emp.employment_type || "full_time",
    start_date: emp.hire_date,
    end_date: emp.contract_end_date ?? null,
    status: deriveContractStatus(emp),
    position_title: emp.position_title,
    org_unit_name: emp.org_unit_name,
    salary: emp.salary ?? null,
    currency: emp.currency ?? null,
  };
}

export default function ContractsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-contracts", search, contractTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (contractTypeFilter) params.set("employment_type", contractTypeFilter);
      params.set("limit", "50");
      return api.get<EmployeeListResponse>(`/hr/employees?${params}`);
    },
  });

  const contracts = (data?.items ?? []).map(mapToContract);

  const filteredContracts = statusFilter
    ? contracts.filter((c) => c.status === statusFilter)
    : contracts;

  const stats = {
    total: contracts.length,
    active: contracts.filter((c) => c.status === "active").length,
    expiringSoon: contracts.filter((c) => isExpiringSoon(c.end_date)).length,
    expired: contracts.filter((c) => c.status === "expired").length,
  };

  const columns: ColumnDef<EmployeeContract>[] = [
    {
      id: "employeeNumber",
      header: "Employee (#)",
      cell: ({ row }) => (
        <div className="text-sm font-mono text-gray-500">
          {row.employee_number}
        </div>
      ),
    },
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => {
        const initials = (row.employee_name || "")
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
              {row.employee_name || "Unknown"}
            </div>
          </div>
        );
      },
    },
    {
      id: "contractType",
      header: "Contract Type",
      cell: ({ row }) => (
        <Badge variant={CONTRACT_TYPE_BADGE_VARIANT[row.contract_type] as any}>
          {CONTRACT_TYPE_LABELS[row.contract_type] || row.contract_type}
        </Badge>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {row.position_title || "-"}
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {row.org_unit_name || "-"}
        </div>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {formatDate(row.start_date)}
        </div>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-600">
            {formatDate(row.end_date)}
          </span>
          {isExpiringSoon(row.end_date) && (
            <AlertTriangle
              className="h-4 w-4 text-yellow-500"
              aria-label="Expiring soon"
            />
          )}
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
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/hr/employees/${row.employee_id}`);
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
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-gray-600">Employee contract management</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            toast.info("Coming Soon", {
              message: "Contract export will be available in a future update.",
            })
          }
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Contracts</p>
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
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expiring Soon</p>
              <p className="text-2xl font-bold">{stats.expiringSoon}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <Clock className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expired</p>
              <p className="text-2xl font-bold">{stats.expired}</p>
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
          value={contractTypeFilter}
          onChange={(e) => setContractTypeFilter(e.target.value)}
          options={[
            { value: "", label: "All Contract Types" },
            { value: "full_time", label: "Full Time" },
            { value: "part_time", label: "Part Time" },
            { value: "contractor", label: "Contractor" },
            { value: "intern", label: "Intern" },
            { value: "temporary", label: "Temporary" },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "", label: "All Statuses" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "terminated", label: "Terminated" },
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
          ) : filteredContracts.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No contracts found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || contractTypeFilter || statusFilter
                  ? "Try adjusting your filters"
                  : "No employee contracts recorded yet"}
              </p>
            </div>
          ) : (
            <DataTable
              data={filteredContracts}
              columns={columns}
              onRowClick={(row) =>
                navigate(`/admin/hr/employees/${row.employee_id}`)
              }
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
