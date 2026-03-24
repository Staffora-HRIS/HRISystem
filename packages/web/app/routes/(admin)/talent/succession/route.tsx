export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Users,
  AlertTriangle,
  Filter,
  Download,
  BarChart3,
  X,
} from "lucide-react";
import { Card, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { SuccessionPlanCard } from "~/components/succession";
import { api } from "~/lib/api-client";

interface Candidate {
  id: string;
  employeeId: string;
  employeeName: string;
  readinessLevel: "ready_now" | "ready_1_year" | "ready_2_years" | "development_needed";
  priority: number;
  developmentNotes: string | null;
}

interface SuccessionPlan {
  id: string;
  positionId: string;
  positionTitle: string;
  departmentName?: string;
  criticality: "critical" | "high" | "medium" | "low";
  riskLevel: "high" | "medium" | "low";
  status: "active" | "draft" | "archived";
  candidates: Candidate[];
  createdAt: string;
  updatedAt: string;
}

interface PipelineStats {
  totalCriticalPositions: number;
  coveredPositions: number;
  uncoveredPositions: number;
  readyNowCandidates: number;
  highRiskPositions: number;
}

interface CreatePlanFormData {
  positionTitle: string;
  criticality: string;
  riskLevel: string;
}

const initialCreateForm: CreatePlanFormData = {
  positionTitle: "",
  criticality: "medium",
  riskLevel: "medium",
};

export default function SuccessionPlanningPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePlanFormData>(initialCreateForm);

  const { data, isLoading } = useQuery({
    queryKey: ["succession-plans", criticalityFilter, riskFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (criticalityFilter) params.set("criticality", criticalityFilter);
      if (riskFilter) params.set("risk_level", riskFilter);
      return api.get<{ items: SuccessionPlan[] }>(`/succession/plans?${params}`);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["succession-stats"],
    queryFn: () => api.get<PipelineStats>("/succession/pipeline/stats"),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post("/succession/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["succession-plans"] });
      queryClient.invalidateQueries({ queryKey: ["succession-stats"] });
      toast.success("Succession plan created");
      setShowCreateModal(false);
      setCreateForm(initialCreateForm);
    },
    onError: () => {
      toast.error("Failed to create succession plan");
    },
  });

  const handleCreatePlan = () => {
    if (!createForm.positionTitle.trim()) {
      toast.warning("Please enter a position title");
      return;
    }
    createMutation.mutate({
      positionTitle: createForm.positionTitle.trim(),
      criticality: createForm.criticality,
      riskLevel: createForm.riskLevel,
    });
  };

  const plans = data?.items || [];
  const criticalPlans = plans.filter((p) => p.criticality === "critical");
  const highRiskPlans = plans.filter((p) => p.riskLevel === "high");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Succession Planning
          </h1>
          <p className="text-gray-600">
            Manage succession plans and identify future leaders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => toast.info("Export will download a CSV report of all succession plans")}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={() => toast.info("Gap analysis report will be available in a future update")}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Gap Analysis
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Plan
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-gray-900">
              {stats?.totalCriticalPositions || 0}
            </p>
            <p className="text-sm text-gray-500">Critical Positions</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats?.coveredPositions || 0}
            </p>
            <p className="text-sm text-gray-500">Covered</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {stats?.uncoveredPositions || 0}
            </p>
            <p className="text-sm text-gray-500">Uncovered</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {stats?.readyNowCandidates || 0}
            </p>
            <p className="text-sm text-gray-500">Ready Now</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {stats?.highRiskPositions || 0}
            </p>
            <p className="text-sm text-gray-500">High Risk</p>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <select
          value={criticalityFilter}
          onChange={(e) => setCriticalityFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          aria-label="Filter by criticality level"
        >
          <option value="">All Criticality Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          aria-label="Filter by risk level"
        >
          <option value="">All Risk Levels</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => toast.info("Additional filters will be available in a future update")}>
          <Filter className="h-4 w-4 mr-2" />
          More Filters
        </Button>
      </div>

      {/* Plans */}
      {isLoading ? (
        <div className="text-center py-8">Loading succession plans...</div>
      ) : plans.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">
              No succession plans
            </h3>
            <p className="text-gray-500 mb-4">
              Create succession plans to identify and develop future leaders.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Plan
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* High Risk Alert */}
          {highRiskPlans.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardBody className="flex items-center gap-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <div className="flex-1">
                  <p className="font-medium text-red-900">
                    {highRiskPlans.length} position
                    {highRiskPlans.length !== 1 ? "s" : ""} at high risk
                  </p>
                  <p className="text-sm text-red-700">
                    These positions need immediate attention due to lack of
                    ready successors.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setRiskFilter("high")}>
                  View High Risk
                </Button>
              </CardBody>
            </Card>
          )}

          {/* Critical Positions */}
          {criticalPlans.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Critical Positions
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {criticalPlans.map((plan) => (
                  <SuccessionPlanCard
                    key={plan.id}
                    plan={plan}
                    onViewDetails={(id) =>
                      navigate(`/admin/talent/succession/${id}`)
                    }
                    onAddCandidate={(id) =>
                      navigate(`/admin/talent/succession/${id}/candidates/new`)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Plans */}
          {plans.filter((p) => p.criticality !== "critical").length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Other Positions</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {plans
                  .filter((p) => p.criticality !== "critical")
                  .map((plan) => (
                    <SuccessionPlanCard
                      key={plan.id}
                      plan={plan}
                      onViewDetails={(id) =>
                        navigate(`/admin/talent/succession/${id}`)
                      }
                      onAddCandidate={(id) =>
                        navigate(
                          `/admin/talent/succession/${id}/candidates/new`
                        )
                      }
                    />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" role="dialog" aria-modal="true" aria-label="Create Succession Plan">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Create Succession Plan</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="plan-position" className="block text-sm font-medium text-gray-700 mb-1">Position Title *</label>
                <input
                  id="plan-position"
                  type="text"
                  value={createForm.positionTitle}
                  onChange={(e) => setCreateForm({ ...createForm, positionTitle: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Chief Technology Officer"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="plan-criticality" className="block text-sm font-medium text-gray-700 mb-1">Criticality</label>
                  <select
                    id="plan-criticality"
                    value={createForm.criticality}
                    onChange={(e) => setCreateForm({ ...createForm, criticality: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="plan-risk" className="block text-sm font-medium text-gray-700 mb-1">Risk Level</label>
                  <select
                    id="plan-risk"
                    value={createForm.riskLevel}
                    onChange={(e) => setCreateForm({ ...createForm, riskLevel: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreatePlan}
                disabled={!createForm.positionTitle.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Plan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
