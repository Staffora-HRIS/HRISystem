export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Minus,
  Search,
  Plus,
  FileText,
  CheckCircle,
  DollarSign,
  Percent,
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "~/components/ui";
import { api } from "~/lib/api-client";

// =============================================================================
// Types
// =============================================================================

interface DeductionType {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  category: string;
  is_statutory: boolean;
  calculation_method: string;
  created_at: string;
  updated_at: string;
}

interface DeductionTypeListResponse {
  items: DeductionType[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface EmployeeDeduction {
  id: string;
  tenant_id: string;
  employee_id: string;
  deduction_type_id: string;
  amount: number | null;
  percentage: number | null;
  effective_from: string;
  effective_to: string | null;
  reference: string | null;
  created_at: string;
  updated_at: string;
  deduction_type_name?: string;
  deduction_type_code?: string;
  deduction_category?: string;
}

interface EmployeeDeductionListResponse {
  items: EmployeeDeduction[];
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  tax: "Tax",
  ni: "National Insurance",
  pension: "Pension",
  student_loan: "Student Loan",
  attachment_of_earnings: "Attachment of Earnings",
  voluntary: "Voluntary",
  other: "Other",
};

const CATEGORY_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  tax: "error",
  ni: "warning",
  pension: "info",
  student_loan: "secondary",
  attachment_of_earnings: "error",
  voluntary: "success",
  other: "default",
};

const METHOD_LABELS: Record<string, string> = {
  fixed: "Fixed Amount",
  percentage: "Percentage",
  tiered: "Tiered",
};

// =============================================================================
// Forms
// =============================================================================

interface CreateTypeForm {
  name: string;
  code: string;
  category: string;
  is_statutory: boolean;
  calculation_method: string;
}

const INITIAL_TYPE_FORM: CreateTypeForm = {
  name: "",
  code: "",
  category: "voluntary",
  is_statutory: false,
  calculation_method: "fixed",
};

interface CreateDeductionForm {
  employee_id: string;
  deduction_type_id: string;
  amount: string;
  percentage: string;
  effective_from: string;
  effective_to: string;
  reference: string;
}

const INITIAL_DEDUCTION_FORM: CreateDeductionForm = {
  employee_id: "",
  deduction_type_id: "",
  amount: "",
  percentage: "",
  effective_from: new Date().toISOString().split("T")[0],
  effective_to: "",
  reference: "",
};

// =============================================================================
// Component
// =============================================================================

export default function AdminDeductionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("types");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showCreateDeductionModal, setShowCreateDeductionModal] = useState(false);
  const [typeForm, setTypeForm] = useState<CreateTypeForm>(INITIAL_TYPE_FORM);
  const [deductionForm, setDeductionForm] = useState<CreateDeductionForm>(INITIAL_DEDUCTION_FORM);

  // Deduction types query
  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ["admin-deduction-types"],
    queryFn: () =>
      api.get<DeductionTypeListResponse>("/deductions/types"),
  });

  // Employee deductions query
  const { data: deductionsData, isLoading: deductionsLoading } = useQuery({
    queryKey: ["admin-employee-deductions", employeeId],
    queryFn: () =>
      api.get<EmployeeDeductionListResponse>(
        `/deductions/employee/${employeeId}`
      ),
    enabled: !!employeeId,
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/deductions/types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deduction-types"] });
      toast.success("Deduction type created successfully");
      setShowCreateTypeModal(false);
      setTypeForm(INITIAL_TYPE_FORM);
    },
    onError: () => {
      toast.error("Failed to create deduction type");
    },
  });

  const createDeductionMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/deductions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-employee-deductions"] });
      toast.success("Employee deduction created successfully");
      setShowCreateDeductionModal(false);
      setDeductionForm(INITIAL_DEDUCTION_FORM);
    },
    onError: () => {
      toast.error("Failed to create employee deduction");
    },
  });

  // Filter deduction types
  const types = typesData?.items ?? [];
  const filteredTypes = types.filter((item) => {
    const matchesSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Filter employee deductions
  const deductions = deductionsData?.items ?? [];

  const totalTypes = types.length;
  const statutoryTypes = types.filter((t) => t.is_statutory).length;
  const voluntaryTypes = types.filter((t) => !t.is_statutory).length;

  const handleCreateTypeSubmit = () => {
    if (!typeForm.name.trim() || !typeForm.code.trim()) {
      toast.warning("Please fill in all required fields");
      return;
    }
    createTypeMutation.mutate({
      name: typeForm.name.trim(),
      code: typeForm.code.trim().toUpperCase(),
      category: typeForm.category,
      is_statutory: typeForm.is_statutory,
      calculation_method: typeForm.calculation_method,
    });
  };

  const handleCreateDeductionSubmit = () => {
    if (!deductionForm.employee_id.trim() || !deductionForm.deduction_type_id.trim()) {
      toast.warning("Please fill in all required fields");
      return;
    }

    const payload: Record<string, unknown> = {
      employee_id: deductionForm.employee_id.trim(),
      deduction_type_id: deductionForm.deduction_type_id.trim(),
      effective_from: deductionForm.effective_from,
    };
    if (deductionForm.amount) payload.amount = Number(deductionForm.amount);
    if (deductionForm.percentage) payload.percentage = Number(deductionForm.percentage);
    if (deductionForm.effective_to) payload.effective_to = deductionForm.effective_to;
    if (deductionForm.reference) payload.reference = deductionForm.reference;

    createDeductionMutation.mutate(payload);
  };

  // Columns for deduction types
  const typeColumns: ColumnDef<DeductionType>[] = [
    {
      id: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
            <Minus className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <span className="font-medium text-gray-900">{row.name}</span>
            <p className="text-sm text-gray-500 font-mono">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      cell: ({ row }) => (
        <Badge variant={CATEGORY_BADGE_VARIANTS[row.category] ?? "default"}>
          {CATEGORY_LABELS[row.category] || row.category}
        </Badge>
      ),
    },
    {
      id: "calculation_method",
      header: "Method",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {METHOD_LABELS[row.calculation_method] || row.calculation_method}
        </span>
      ),
    },
    {
      id: "is_statutory",
      header: "Type",
      cell: ({ row }) => (
        <Badge
          variant={row.is_statutory ? "warning" : "success"}
          dot
          rounded
        >
          {row.is_statutory ? "Statutory" : "Voluntary"}
        </Badge>
      ),
    },
  ];

  // Columns for employee deductions
  const deductionColumns: ColumnDef<EmployeeDeduction>[] = [
    {
      id: "type",
      header: "Deduction Type",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
            <Minus className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <span className="font-medium text-gray-900">
              {row.deduction_type_name || "Unknown"}
            </span>
            <p className="text-sm text-gray-500 font-mono">
              {row.deduction_type_code || row.deduction_type_id}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-900">
          {row.amount != null
            ? `\u00A3${Number(row.amount).toFixed(2)}`
            : row.percentage != null
              ? `${Number(row.percentage).toFixed(2)}%`
              : "-"}
        </span>
      ),
    },
    {
      id: "effective_from",
      header: "From",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {new Date(row.effective_from).toLocaleDateString("en-GB")}
        </span>
      ),
    },
    {
      id: "effective_to",
      header: "To",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">
          {row.effective_to
            ? new Date(row.effective_to).toLocaleDateString("en-GB")
            : "Current"}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Reference",
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.reference || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deductions</h1>
          <p className="text-gray-600">
            Manage deduction types and employee deduction assignments
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Types</p>
              <p className="text-2xl font-bold">{totalTypes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <CheckCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Statutory</p>
              <p className="text-2xl font-bold">{statutoryTypes}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Voluntary</p>
              <p className="text-2xl font-bold">{voluntaryTypes}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="types">Deduction Types</TabsTrigger>
          <TabsTrigger value="employee">Employee Deductions</TabsTrigger>
        </TabsList>

        {/* Deduction Types Tab */}
        <TabsContent value="types">
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search types..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                options={[
                  { value: "", label: "All Categories" },
                  { value: "tax", label: "Tax" },
                  { value: "ni", label: "National Insurance" },
                  { value: "pension", label: "Pension" },
                  { value: "student_loan", label: "Student Loan" },
                  { value: "attachment_of_earnings", label: "Attachment of Earnings" },
                  { value: "voluntary", label: "Voluntary" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Button onClick={() => setShowCreateTypeModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Type
              </Button>
            </div>

            <Card>
              <CardBody className="p-0">
                {typesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : filteredTypes.length === 0 ? (
                  <div className="text-center py-12">
                    <Minus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No deduction types found
                    </h3>
                    <p className="text-gray-500 mb-4">
                      Create your first deduction type to get started
                    </p>
                    <Button onClick={() => setShowCreateTypeModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Type
                    </Button>
                  </div>
                ) : (
                  <DataTable
                    data={filteredTypes}
                    columns={typeColumns}
                    getRowId={(row) => row.id}
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>

        {/* Employee Deductions Tab */}
        <TabsContent value="employee">
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="min-w-[200px] max-w-xs">
                <Input
                  placeholder="Employee ID"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
              </div>
              <Button onClick={() => setShowCreateDeductionModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Deduction
              </Button>
            </div>

            <Card>
              <CardBody className="p-0">
                {!employeeId ? (
                  <div className="text-center py-12">
                    <Percent className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      Enter an Employee ID
                    </h3>
                    <p className="text-gray-500">
                      Enter an employee ID to view their deduction assignments
                    </p>
                  </div>
                ) : deductionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                ) : deductions.length === 0 ? (
                  <div className="text-center py-12">
                    <Minus className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900">
                      No deductions found
                    </h3>
                    <p className="text-gray-500 mb-4">
                      No deductions for this employee yet
                    </p>
                    <Button onClick={() => setShowCreateDeductionModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Deduction
                    </Button>
                  </div>
                ) : (
                  <DataTable
                    data={deductions}
                    columns={deductionColumns}
                    getRowId={(row) => row.id}
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Type Modal */}
      {showCreateTypeModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateTypeModal(false);
            setTypeForm(INITIAL_TYPE_FORM);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Deduction Type</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Name"
                placeholder="e.g. PAYE Income Tax"
                required
                value={typeForm.name}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, name: e.target.value })
                }
              />
              <Input
                label="Code"
                placeholder="e.g. PAYE"
                required
                value={typeForm.code}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, code: e.target.value })
                }
              />
              <Select
                label="Category"
                value={typeForm.category}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, category: e.target.value })
                }
                options={[
                  { value: "tax", label: "Tax" },
                  { value: "ni", label: "National Insurance" },
                  { value: "pension", label: "Pension" },
                  { value: "student_loan", label: "Student Loan" },
                  { value: "attachment_of_earnings", label: "Attachment of Earnings" },
                  { value: "voluntary", label: "Voluntary" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Select
                label="Calculation Method"
                value={typeForm.calculation_method}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, calculation_method: e.target.value })
                }
                options={[
                  { value: "fixed", label: "Fixed Amount" },
                  { value: "percentage", label: "Percentage" },
                  { value: "tiered", label: "Tiered" },
                ]}
              />
              <Select
                label="Type"
                value={typeForm.is_statutory ? "true" : "false"}
                onChange={(e) =>
                  setTypeForm({ ...typeForm, is_statutory: e.target.value === "true" })
                }
                options={[
                  { value: "false", label: "Voluntary" },
                  { value: "true", label: "Statutory" },
                ]}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateTypeModal(false);
                setTypeForm(INITIAL_TYPE_FORM);
              }}
              disabled={createTypeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTypeSubmit}
              disabled={
                !typeForm.name.trim() ||
                !typeForm.code.trim() ||
                createTypeMutation.isPending
              }
            >
              {createTypeMutation.isPending ? "Creating..." : "Add Type"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Create Employee Deduction Modal */}
      {showCreateDeductionModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateDeductionModal(false);
            setDeductionForm(INITIAL_DEDUCTION_FORM);
          }}
          size="md"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Add Employee Deduction</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Employee ID"
                placeholder="UUID"
                required
                value={deductionForm.employee_id}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, employee_id: e.target.value })
                }
              />
              <Input
                label="Deduction Type ID"
                placeholder="UUID"
                required
                value={deductionForm.deduction_type_id}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, deduction_type_id: e.target.value })
                }
              />
              <Input
                label="Amount (fixed)"
                type="number"
                placeholder="0.00"
                value={deductionForm.amount}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, amount: e.target.value })
                }
                min={0}
                step="0.01"
              />
              <Input
                label="Percentage"
                type="number"
                placeholder="0.00"
                value={deductionForm.percentage}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, percentage: e.target.value })
                }
                min={0}
                max={100}
                step="0.01"
              />
              <Input
                label="Reference (optional)"
                placeholder="e.g. Court order number"
                value={deductionForm.reference}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, reference: e.target.value })
                }
              />
              <Input
                label="Effective From"
                type="date"
                required
                value={deductionForm.effective_from}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, effective_from: e.target.value })
                }
              />
              <Input
                label="Effective To (optional)"
                type="date"
                value={deductionForm.effective_to}
                onChange={(e) =>
                  setDeductionForm({ ...deductionForm, effective_to: e.target.value })
                }
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDeductionModal(false);
                setDeductionForm(INITIAL_DEDUCTION_FORM);
              }}
              disabled={createDeductionMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateDeductionSubmit}
              disabled={
                !deductionForm.employee_id.trim() ||
                !deductionForm.deduction_type_id.trim() ||
                createDeductionMutation.isPending
              }
            >
              {createDeductionMutation.isPending
                ? "Creating..."
                : "Add Deduction"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
