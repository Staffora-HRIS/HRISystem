export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Plus,
  Heart,
  Users,
  Calendar,
  Filter,
  Download,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "~/components/ui/modal";
import { Input, Select } from "~/components/ui/input";
import { useToast } from "~/components/ui/toast";
import { api } from "~/lib/api-client";
import { queryKeys } from "~/lib/query-client";

interface BenefitPlan {
  id: string;
  planType: string;
  name: string;
  description: string | null;
  provider: string | null;
  coverageLevel: string;
  employeeContribution: number;
  employerContribution: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
  isActive: boolean;
  enrolledCount?: number;
}

interface EnrollmentStats {
  totalEmployees: number;
  enrolledEmployees: number;
  pendingEnrollments: number;
  pendingLifeEvents: number;
}

const PLAN_TYPE_COLORS: Record<string, string> = {
  medical: "bg-blue-100 text-blue-700",
  dental: "bg-cyan-100 text-cyan-700",
  vision: "bg-purple-100 text-purple-700",
  life: "bg-green-100 text-green-700",
  disability: "bg-orange-100 text-orange-700",
  retirement: "bg-yellow-100 text-yellow-700",
  childcare_vouchers: "bg-teal-100 text-teal-700",
  cycle_to_work: "bg-indigo-100 text-indigo-700",
};

const BENEFIT_CATEGORIES = [
  { value: "health", label: "Health" },
  { value: "dental", label: "Dental" },
  { value: "vision", label: "Vision" },
  { value: "life", label: "Life Insurance" },
  { value: "disability", label: "Disability" },
  { value: "retirement", label: "Retirement" },
  { value: "childcare_vouchers", label: "Childcare Vouchers" },
  { value: "cycle_to_work", label: "Cycle to Work" },
  { value: "wellness", label: "Wellness" },
  { value: "other", label: "Other" },
];

const CONTRIBUTION_TYPES = [
  { value: "shared", label: "Shared (Employee + Employer)" },
  { value: "employee_only", label: "Employee Only" },
  { value: "employer_only", label: "Employer Only" },
  { value: "voluntary", label: "Voluntary" },
];

interface CreatePlanForm {
  name: string;
  category: string;
  description: string;
  contributionType: string;
  effectiveFrom: string;
  effectiveTo: string;
  waitingPeriodDays: string;
}

const initialCreatePlanForm: CreatePlanForm = {
  name: "",
  category: "",
  description: "",
  contributionType: "shared",
  effectiveFrom: new Date().toISOString().split("T")[0],
  effectiveTo: "",
  waitingPeriodDays: "0",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

export default function BenefitsAdminPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePlanForm>(initialCreatePlanForm);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    search: "",
    status: "",
    enrollmentStart: "",
    enrollmentEnd: "",
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["admin-benefit-plans", planTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (planTypeFilter) params.set("planType", planTypeFilter);
      return api.get<{ items: BenefitPlan[] }>(`/benefits/plans?${params}`);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-benefit-stats"],
    queryFn: () => api.get<EnrollmentStats>("/benefits/stats"),
  });

  // Create plan mutation
  const createPlanMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/benefits/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-benefit-plans"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.benefits.plans() });
      toast.success("Benefit plan created successfully");
      setShowCreateModal(false);
      setCreateForm(initialCreatePlanForm);
    },
    onError: () => {
      toast.error("Failed to create benefit plan", {
        message: "Please check your input and try again.",
      });
    },
  });

  const handleCreatePlan = () => {
    if (!createForm.name.trim()) {
      toast.warning("Please enter a plan name");
      return;
    }
    if (!createForm.category) {
      toast.warning("Please select a benefit category");
      return;
    }
    if (!createForm.effectiveFrom) {
      toast.warning("Please select an effective date");
      return;
    }
    createPlanMutation.mutate({
      name: createForm.name.trim(),
      category: createForm.category,
      description: createForm.description.trim() || undefined,
      contribution_type: createForm.contributionType,
      effective_from: createForm.effectiveFrom,
      effective_to: createForm.effectiveTo || undefined,
      waiting_period_days: createForm.waitingPeriodDays
        ? Number(createForm.waitingPeriodDays)
        : 0,
    });
  };

  const handleExportPlans = useCallback(() => {
    const allPlans = plans?.items;
    if (!allPlans?.length) {
      toast.info("No data to export");
      return;
    }
    const headers = [
      "Name",
      "Plan Type",
      "Provider",
      "Coverage Level",
      "Employee Contribution",
      "Employer Contribution",
      "Effective From",
      "Effective To",
      "Enrollment Start",
      "Enrollment End",
      "Active",
      "Enrolled Count",
    ];
    const rows = allPlans.map((plan) => [
      plan.name,
      plan.planType,
      plan.provider ?? "",
      plan.coverageLevel,
      String(plan.employeeContribution),
      String(plan.employerContribution),
      plan.effectiveFrom,
      plan.effectiveTo ?? "",
      plan.enrollmentStart ?? "",
      plan.enrollmentEnd ?? "",
      plan.isActive ? "Yes" : "No",
      plan.enrolledCount !== undefined ? String(plan.enrolledCount) : "",
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `benefits-plans-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Benefits data exported");
  }, [plans, toast]);

  // Apply advanced filters on top of the already-fetched plans
  const filteredPlans = (plans?.items || []).filter((plan) => {
    if (advancedFilters.search) {
      const searchLower = advancedFilters.search.toLowerCase();
      const nameMatch = plan.name.toLowerCase().includes(searchLower);
      const providerMatch = plan.provider?.toLowerCase().includes(searchLower);
      if (!nameMatch && !providerMatch) return false;
    }
    if (advancedFilters.status === "active" && !plan.isActive) return false;
    if (advancedFilters.status === "inactive" && plan.isActive) return false;
    if (advancedFilters.enrollmentStart && plan.enrollmentStart) {
      if (plan.enrollmentStart < advancedFilters.enrollmentStart) return false;
    }
    if (advancedFilters.enrollmentEnd && plan.enrollmentEnd) {
      if (plan.enrollmentEnd > advancedFilters.enrollmentEnd) return false;
    }
    return true;
  });

  const activePlans = filteredPlans.filter((p) => p.isActive);
  const inactivePlans = filteredPlans.filter((p) => !p.isActive);

  const hasActiveAdvancedFilters =
    advancedFilters.search ||
    advancedFilters.status ||
    advancedFilters.enrollmentStart ||
    advancedFilters.enrollmentEnd;

  const clearAdvancedFilters = () => {
    setAdvancedFilters({ search: "", status: "", enrollmentStart: "", enrollmentEnd: "" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Benefits Administration
          </h1>
          <p className="text-gray-600">
            Manage benefit plans and enrollments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportPlans}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
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
              <p className="text-sm text-gray-500">Total Eligible</p>
              <p className="text-2xl font-bold">
                {stats?.totalEmployees || 0}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Heart className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Enrolled</p>
              <p className="text-2xl font-bold">
                {stats?.enrolledEmployees || 0}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Calendar className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Enrollments</p>
              <p className="text-2xl font-bold">
                {stats?.pendingEnrollments || 0}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Life Events</p>
              <p className="text-2xl font-bold">
                {stats?.pendingLifeEvents || 0}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={planTypeFilter}
          onChange={(e) => setPlanTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">All Plan Types</option>
          <option value="medical">Medical</option>
          <option value="dental">Dental</option>
          <option value="vision">Vision</option>
          <option value="life">Life Insurance</option>
          <option value="disability">Disability</option>
          <option value="retirement">Retirement</option>
          <option value="childcare_vouchers">Childcare Vouchers</option>
          <option value="cycle_to_work">Cycle to Work</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          aria-expanded={showAdvancedFilters}
          aria-controls="advanced-filters-panel"
        >
          <Filter className="h-4 w-4 mr-2" />
          More Filters
          {showAdvancedFilters ? (
            <ChevronUp className="h-4 w-4 ml-1" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-1" />
          )}
        </Button>
        {hasActiveAdvancedFilters && (
          <Button variant="ghost" size="sm" onClick={clearAdvancedFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvancedFilters && (
        <div
          id="advanced-filters-panel"
          className="rounded-lg border border-gray-200 bg-gray-50 p-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              label="Search by name or provider"
              placeholder="e.g. Premium Health"
              value={advancedFilters.search}
              onChange={(e) =>
                setAdvancedFilters({ ...advancedFilters, search: e.target.value })
              }
            />
            <Select
              label="Plan Status"
              value={advancedFilters.status}
              onChange={(e) =>
                setAdvancedFilters({ ...advancedFilters, status: e.target.value })
              }
              options={[
                { value: "", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            <Input
              label="Enrollment Start (from)"
              type="date"
              value={advancedFilters.enrollmentStart}
              onChange={(e) =>
                setAdvancedFilters({
                  ...advancedFilters,
                  enrollmentStart: e.target.value,
                })
              }
            />
            <Input
              label="Enrollment End (to)"
              type="date"
              value={advancedFilters.enrollmentEnd}
              onChange={(e) =>
                setAdvancedFilters({
                  ...advancedFilters,
                  enrollmentEnd: e.target.value,
                })
              }
            />
          </div>
        </div>
      )}

      {/* Active Plans */}
      {plansLoading ? (
        <div className="text-center py-8">Loading plans...</div>
      ) : activePlans.length === 0 && inactivePlans.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              No benefit plans
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first benefit plan to get started.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          {activePlans.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Active Plans</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {activePlans.map((plan) => (
                  <Card
                    key={plan.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() =>
                      navigate(`/admin/benefits/plans/${plan.id}`)
                    }
                  >
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            PLAN_TYPE_COLORS[plan.planType] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {plan.planType}
                        </span>
                        <h3 className="font-semibold mt-2">{plan.name}</h3>
                        {plan.provider && (
                          <p className="text-sm text-gray-500">
                            {plan.provider}
                          </p>
                        )}
                      </div>
                      <Badge variant="success">Active</Badge>
                    </CardHeader>
                    <CardBody className="pt-0">
                      {plan.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-4">
                          {plan.description}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Employee Cost</p>
                          <p className="font-medium">
                            {formatCurrency(plan.employeeContribution)}/mo
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Employer Cost</p>
                          <p className="font-medium text-green-600">
                            {formatCurrency(plan.employerContribution)}/mo
                          </p>
                        </div>
                      </div>
                      {plan.enrolledCount !== undefined && (
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Enrolled
                          </span>
                          <span className="font-medium">
                            {plan.enrolledCount}
                          </span>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {inactivePlans.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Inactive Plans</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Plan
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Provider
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {inactivePlans.map((plan) => (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">
                            {plan.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 capitalize">
                          {plan.planType}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {plan.provider || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary">Inactive</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/benefits/plans/${plan.id}`)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <Modal
          open
          onClose={() => {
            setShowCreateModal(false);
            setCreateForm(initialCreatePlanForm);
          }}
          size="lg"
        >
          <ModalHeader>
            <h3 className="text-lg font-semibold">Create Benefit Plan</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <Input
                label="Plan Name"
                placeholder="e.g. Premium Health Plan"
                required
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
              />
              <Select
                label="Category"
                required
                value={createForm.category}
                onChange={(e) =>
                  setCreateForm({ ...createForm, category: e.target.value })
                }
                options={[
                  { value: "", label: "Select a category" },
                  ...BENEFIT_CATEGORIES,
                ]}
              />
              <Input
                label="Description"
                placeholder="Describe this benefit plan..."
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
              />
              <Select
                label="Contribution Type"
                required
                value={createForm.contributionType}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    contributionType: e.target.value,
                  })
                }
                options={CONTRIBUTION_TYPES}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Effective From"
                  type="date"
                  required
                  value={createForm.effectiveFrom}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      effectiveFrom: e.target.value,
                    })
                  }
                />
                <Input
                  label="Effective To (optional)"
                  type="date"
                  value={createForm.effectiveTo}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      effectiveTo: e.target.value,
                    })
                  }
                />
              </div>
              <Input
                label="Waiting Period (days)"
                type="number"
                placeholder="0"
                value={createForm.waitingPeriodDays}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    waitingPeriodDays: e.target.value,
                  })
                }
                min={0}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setCreateForm(initialCreatePlanForm);
              }}
              disabled={createPlanMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePlan}
              disabled={
                !createForm.name.trim() ||
                !createForm.category ||
                !createForm.effectiveFrom ||
                createPlanMutation.isPending
              }
            >
              {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
