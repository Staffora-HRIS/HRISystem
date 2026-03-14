export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Search,
  Plus,
  Hash,
  CheckCircle,
  Clock,
} from "lucide-react";
import {
  Card,
  CardBody,
  Badge,
  type BadgeVariant,
  DataTable,
  type ColumnDef,
  Input,
  Select,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

interface TaxCode {
  id: string;
  tenant_id: string;
  employee_id: string;
  tax_code: string;
  is_cumulative: boolean;
  week1_month1: boolean;
  effective_from: string;
  effective_to: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

interface TaxCodeListResponse {
  items: TaxCode[];
}

const SOURCE_LABELS: Record<string, string> = {
  hmrc: "HMRC",
  manual: "Manual",
};

const SOURCE_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  hmrc: "info",
  manual: "secondary",
};

interface CreateTaxCodeForm {
  employee_id: string;
  tax_code: string;
  is_cumulative: boolean;
  week1_month1: boolean;
  effective_from: string;
  effective_to: string;
  source: string;
}

const INITIAL_FORM: CreateTaxCodeForm = {
  employee_id: "",
  tax_code: "",
  is_cumulative: true,
  week1_month1: false,
  effective_from: new Date().toISOString().split("T")[0],
  effective_to: "",
  source: "manual",
};

export default function AdminTaxCodesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<CreateTaxCodeForm>(INITIAL_FORM);

  const { data: taxCodesData, isLoading } = useQuery({
    queryKey: ["admin-tax-codes", employeeId],
    queryFn: () =>
      api.get<TaxCodeListResponse>(
        `/tax-codes/employee/${employeeId}`
      ),
    enabled: !!employeeId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/tax-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tax-codes"] });
      toast.success("Tax code created successfully");
      setShowCreateModal(false);
      setFormData(INITIAL_FORM);
    },
    onError: () => {
      toast.error("Failed to create tax code");
    },
  });

  const items = taxCodesData?.items ?? [];

  const filteredItems = items.filter((item) => {
    const matchesSearch = !search ||
      item.tax_code.toLowerCase().includes(search.toLowerCase());
    const matchesSource = !sourceFilter || item.source === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const totalCodes = items.length;
  const hmrcCodes = items.filter((c) => c.source === "hmrc").length;
  const cumulativeCodes = items.filter((c) => c.is_cumulative).length;

  const handleCreateSubmit = () => {
    if (!formData.employee_id.trim()) {
      toast.warning("Please enter an employee ID");
      return;
    }
    if (!formData.tax_code.trim()) {
      toast.warning("Please enter a tax code");
      return;
    }

    const payload: Record<string, unknown> = {
      employee_id: formData.employee_id.trim(),
      tax_code: formData.tax_code.trim().toUpperCase(),
      is_cumulative: formData.is_cumulative,
      week1_month1: formData.week1_month1,
      effective_from: formData.effective_from,
      source: formData.source,
    };
    if (formData.effective_to) {
      payload.effective_to = formData.effective_to;
    }

    createMutation.mutate(payload);
  };

  const columns: ColumnDef<TaxCode>[] = [
    {
      id: "tax_code",
      header: "Tax Code",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Hash className="h-5 w-5 text-orange-600" />
          </div>
          <span className="font-mono font-semibold text-gray-900">
            {row.tax_code}
          </span>
        </div>
      ),
    },
    {
      id: "basis",
      header: "Basis",
      cell: ({ row }) => (
        <Badge variant={row.is_cumulative ? "success" : "warning"}>
          {row.is_cumulative ? "Cumulative" : "Week 1/Month 1"}
        </Badge>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => (
        <Badge
          variant={SOURCE_BADGE_VARIANTS[row.source] ?? "default"}
          dot
          rounded
        >
          {SOURCE_LABELS[row.source] || row.source}
        </Badge>
      ),
    },
    {
      id: "effective_from",
      header: "Effective From",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {new Date(row.effective_from).toLocaleDateString("en-GB")}
        </span>
      ),
    },
    {
      id: "effective_to",
      header: "Effective To",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.effective_to
            ? new Date(row.effective_to).toLocaleDateString("en-GB")
            : "Current"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Codes</h1>
          <p className="text-gray-600">
            Manage employee HMRC tax code assignments
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tax Code
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Tax Codes</p>
              <p className="text-2xl font-bold">{totalCodes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">HMRC Sourced</p>
              <p className="text-2xl font-bold">{hmrcCodes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Cumulative</p>
              <p className="text-2xl font-bold">{cumulativeCodes}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="min-w-[200px] max-w-xs">
          <Input
            placeholder="Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tax codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={[
            { value: "", label: "All Sources" },
            { value: "hmrc", label: "HMRC" },
            { value: "manual", label: "Manual" },
          ]}
        />
      </div>

      {/* Data Table */}
      <Card>
        <CardBody className="p-0">
          {!employeeId ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                Enter an Employee ID
              </h3>
              <p className="text-gray-500">
                Enter an employee ID above to view their tax code history
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Hash className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900">
                No tax codes found
              </h3>
              <p className="text-gray-500 mb-4">
                {search || sourceFilter
                  ? "Try adjusting your filters"
                  : "No tax codes for this employee yet"}
              </p>
              {!search && !sourceFilter && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Tax Code
                </Button>
              )}
            </div>
          ) : (
            <DataTable
              data={filteredItems}
              columns={columns}
              getRowId={(row) => row.id}
            />
          )}
        </CardBody>
      </Card>

      {/* Create Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setFormData(INITIAL_FORM);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Tax Code</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Employee ID"
                placeholder="UUID"
                required
                value={formData.employee_id}
                onChange={(e) =>
                  setFormData({ ...formData, employee_id: e.target.value })
                }
              />
              <Input
                label="Tax Code"
                placeholder="e.g. 1257L, BR, D0"
                required
                value={formData.tax_code}
                onChange={(e) =>
                  setFormData({ ...formData, tax_code: e.target.value })
                }
              />
              <Select
                label="Source"
                value={formData.source}
                onChange={(e) =>
                  setFormData({ ...formData, source: e.target.value })
                }
                options={[
                  { value: "manual", label: "Manual Entry" },
                  { value: "hmrc", label: "HMRC Notification" },
                ]}
              />
              <Select
                label="Tax Basis"
                value={formData.is_cumulative ? "cumulative" : "week1month1"}
                onChange={(e) => {
                  const isCumulative = e.target.value === "cumulative";
                  setFormData({
                    ...formData,
                    is_cumulative: isCumulative,
                    week1_month1: !isCumulative,
                  });
                }}
                options={[
                  { value: "cumulative", label: "Cumulative" },
                  { value: "week1month1", label: "Week 1/Month 1" },
                ]}
              />
              <Input
                label="Effective From"
                type="date"
                required
                value={formData.effective_from}
                onChange={(e) =>
                  setFormData({ ...formData, effective_from: e.target.value })
                }
              />
              <Input
                label="Effective To (optional)"
                type="date"
                value={formData.effective_to}
                onChange={(e) =>
                  setFormData({ ...formData, effective_to: e.target.value })
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setFormData(INITIAL_FORM);
              }}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={
                !formData.employee_id.trim() ||
                !formData.tax_code.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending ? "Creating..." : "Add Tax Code"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
