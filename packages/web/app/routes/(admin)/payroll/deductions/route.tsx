export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import {
  Card,
  CardBody,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useToast,
} from "~/components/ui";
import { api } from "~/lib/api-client";

import type {
  DeductionTypeListResponse,
  EmployeeDeductionListResponse,
  CreateTypeForm,
  CreateDeductionForm,
} from "./types";
import { CreateTypeModal } from "./CreateTypeModal";
import { CreateDeductionModal } from "./CreateDeductionModal";
import { DeductionTypesTab } from "./DeductionTypesTab";
import { EmployeeDeductionsTab } from "./EmployeeDeductionsTab";

export default function AdminDeductionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("types");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showCreateDeductionModal, setShowCreateDeductionModal] = useState(false);

  // Deduction types query
  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ["admin-deduction-types"],
    queryFn: () => api.get<DeductionTypeListResponse>("/deductions/types"),
  });

  // Employee deductions query
  const { data: deductionsData, isLoading: deductionsLoading } = useQuery({
    queryKey: ["admin-employee-deductions", employeeId],
    queryFn: () => api.get<EmployeeDeductionListResponse>(`/deductions/employee/${employeeId}`),
    enabled: !!employeeId,
  });

  const createTypeMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/deductions/types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-deduction-types"] });
      toast.success("Deduction type created successfully");
      setShowCreateTypeModal(false);
    },
    onError: () => {
      toast.error("Failed to create deduction type");
    },
  });

  const createDeductionMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/deductions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-employee-deductions"] });
      toast.success("Employee deduction created successfully");
      setShowCreateDeductionModal(false);
    },
    onError: () => {
      toast.error("Failed to create employee deduction");
    },
  });

  const types = typesData?.items ?? [];
  const deductions = deductionsData?.items ?? [];

  const totalTypes = types.length;
  const statutoryTypes = types.filter((t) => t.is_statutory).length;
  const voluntaryTypes = types.filter((t) => !t.is_statutory).length;

  const handleCreateTypeSubmit = (form: CreateTypeForm) => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.warning("Please fill in all required fields");
      return;
    }
    createTypeMutation.mutate({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      category: form.category,
      is_statutory: form.is_statutory,
      calculation_method: form.calculation_method,
    });
  };

  const handleCreateDeductionSubmit = (form: CreateDeductionForm) => {
    if (!form.employee_id.trim() || !form.deduction_type_id.trim()) {
      toast.warning("Please fill in all required fields");
      return;
    }
    if (!form.amount && !form.percentage) {
      toast.error("Either amount or percentage is required");
      return;
    }

    const payload: Record<string, unknown> = {
      employee_id: form.employee_id.trim(),
      deduction_type_id: form.deduction_type_id.trim(),
      effective_from: form.effective_from,
    };
    if (form.amount) payload.amount = Number(form.amount);
    if (form.percentage) payload.percentage = Number(form.percentage);
    if (form.effective_to) payload.effective_to = form.effective_to;
    if (form.reference) payload.reference = form.reference;

    createDeductionMutation.mutate(payload);
  };

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

        <TabsContent value="types">
          <DeductionTypesTab
            types={types}
            isLoading={typesLoading}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            onCreateClick={() => setShowCreateTypeModal(true)}
          />
        </TabsContent>

        <TabsContent value="employee">
          <EmployeeDeductionsTab
            deductions={deductions}
            isLoading={deductionsLoading}
            employeeId={employeeId}
            onEmployeeIdChange={setEmployeeId}
            onCreateClick={() => setShowCreateDeductionModal(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      {showCreateTypeModal && (
        <CreateTypeModal
          onClose={() => setShowCreateTypeModal(false)}
          onSubmit={handleCreateTypeSubmit}
          isPending={createTypeMutation.isPending}
        />
      )}

      {showCreateDeductionModal && (
        <CreateDeductionModal
          onClose={() => setShowCreateDeductionModal(false)}
          onSubmit={handleCreateDeductionSubmit}
          isPending={createDeductionMutation.isPending}
        />
      )}
    </div>
  );
}
