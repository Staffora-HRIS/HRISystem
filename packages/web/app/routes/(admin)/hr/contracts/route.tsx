export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Users,
  Search,
  FileText,
  AlertTriangle,
  Clock,
  Edit,
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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";
import { invalidationPatterns } from "~/lib/query-client";

interface EmployeeContract {
  id: string;
  employeeId: string;
  employeeName: string | null;
  employeeNumber: string;
  contractType: string;
  startDate: string;
  endDate: string | null;
  status: string;
  positionTitle: string | null;
  orgUnitName: string | null;
  salary: number | null;
  currency: string | null;
}

interface EmployeeRaw {
  id: string;
  employeeNumber: string;
  fullName: string;
  displayName: string;
  hireDate: string;
  terminationDate?: string | null;
  status: string;
  positionTitle: string | null;
  orgUnitName: string | null;
  employmentType?: string;
  contractType?: string;
  contractEndDate?: string | null;
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
  return new Date(dateString).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function deriveContractStatus(employee: EmployeeRaw): string {
  if (employee.status === "terminated") return "terminated";
  const endDate = employee.contractEndDate;
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
    employeeId: emp.id,
    employeeName: emp.displayName || emp.fullName || null,
    employeeNumber: emp.employeeNumber,
    contractType: emp.contractType || emp.employmentType || "full_time",
    startDate: emp.hireDate,
    endDate: emp.contractEndDate ?? null,
    status: deriveContractStatus(emp),
    positionTitle: emp.positionTitle,
    orgUnitName: emp.orgUnitName,
    salary: emp.salary ?? null,
    currency: emp.currency ?? null,
  };
}

export default function ContractsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [contractTypeFilter, setContractTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingContract, setEditingContract] = useState<EmployeeContract | null>(null);
  const [editContractType, setEditContractType] = useState("");
  const [editEmploymentType, setEditEmploymentType] = useState("");
  const [editEffectiveFrom, setEditEffectiveFrom] = useState("");

  // Update contract mutation (uses employee contract endpoint)
  const updateContractMutation = useMutation({
    mutationFn: (data: { employeeId: string; contractType: string; employmentType: string; effectiveFrom: string }) =>
      api.put(`/hr/employees/${data.employeeId}/contract`, {
        effective_from: data.effectiveFrom,
        contract_type: data.contractType,
        employment_type: data.employmentType,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-contracts"] });
      invalidationPatterns.employee(editingContract?.employeeId).forEach((key) =>
        qc.invalidateQueries({ queryKey: key })
      );
      toast.success("Contract updated successfully");
      setEditingContract(null);
    },
    onError: (err) => {
      toast.error("Failed to update contract", {
        message: err instanceof Error ? err.message : "Please try again.",
      });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-contracts", search, contractTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (contractTypeFilter) params.set("employmentType", contractTypeFilter);
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
    expiringSoon: contracts.filter((c) => isExpiringSoon(c.endDate)).length,
    expired: contracts.filter((c) => c.status === "expired").length,
  };

  const columns: ColumnDef<EmployeeContract>[] = [
    {
      id: "employeeNumber",
      header: "Employee (#)",
      cell: ({ row }) => (
        <div className="text-sm font-mono text-gray-500">
          {row.employeeNumber}
        </div>
      ),
    },
    {
      id: "name",
      header: "Name",
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
      id: "contractType",
      header: "Contract Type",
      cell: ({ row }) => (
        <Badge variant={CONTRACT_TYPE_BADGE_VARIANT[row.contractType] as any}>
          {CONTRACT_TYPE_LABELS[row.contractType] || row.contractType}
        </Badge>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {row.positionTitle || "-"}
        </div>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {row.orgUnitName || "-"}
        </div>
      ),
    },
    {
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => (
        <div className="text-sm text-gray-600">
          {formatDate(row.startDate)}
        </div>
      ),
    },
    {
      id: "endDate",
      header: "End Date",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-600">
            {formatDate(row.endDate)}
          </span>
          {isExpiringSoon(row.endDate) && (
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Edit contract"
            onClick={(e) => {
              e.stopPropagation();
              setEditingContract(row);
              setEditContractType(row.contractType);
              setEditEmploymentType(row.contractType === "full_time" || row.contractType === "part_time" ? row.contractType : "full_time");
              setEditEffectiveFrom(new Date().toISOString().split("T")[0]);
            }}
          >
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
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-gray-600">Employee contract management</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            if (!filteredContracts?.length) {
              toast.info("No contracts to export");
              return;
            }
            const headers = ["Employee Number", "Name", "Contract Type", "Position", "Department", "Start Date", "End Date", "Status"];
            const rows = filteredContracts.map((c) => [
              c.employeeNumber,
              c.employeeName || "",
              CONTRACT_TYPE_LABELS[c.contractType] || c.contractType,
              c.positionTitle || "",
              c.orgUnitName || "",
              c.startDate || "",
              c.endDate || "",
              STATUS_LABELS[c.status] || c.status,
            ]);
            const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `contracts-${new Date().toISOString().split("T")[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Contract data exported");
          }}
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
                navigate(`/admin/hr/employees/${row.employeeId}`)
              }
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Edit Contract Modal */}
      {editingContract && (
        <Modal open onClose={() => setEditingContract(null)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">
              Edit Contract: {editingContract.employeeName || editingContract.employeeNumber}
            </h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Select
                label="Contract Type"
                value={editContractType}
                onChange={(e) => setEditContractType(e.target.value)}
                options={[
                  { value: "permanent", label: "Permanent" },
                  { value: "fixed_term", label: "Fixed Term" },
                  { value: "contractor", label: "Contractor" },
                  { value: "intern", label: "Intern" },
                  { value: "temporary", label: "Temporary" },
                ]}
              />
              <Select
                label="Employment Type"
                value={editEmploymentType}
                onChange={(e) => setEditEmploymentType(e.target.value)}
                options={[
                  { value: "full_time", label: "Full Time" },
                  { value: "part_time", label: "Part Time" },
                ]}
              />
              <Input
                label="Effective From"
                type="date"
                required
                value={editEffectiveFrom}
                onChange={(e) => setEditEffectiveFrom(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setEditingContract(null)} disabled={updateContractMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!editContractType || !editEmploymentType || !editEffectiveFrom || updateContractMutation.isPending}
              loading={updateContractMutation.isPending}
              onClick={() =>
                updateContractMutation.mutate({
                  employeeId: editingContract.employeeId,
                  contractType: editContractType,
                  employmentType: editEmploymentType,
                  effectiveFrom: editEffectiveFrom,
                })
              }
            >
              {updateContractMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
