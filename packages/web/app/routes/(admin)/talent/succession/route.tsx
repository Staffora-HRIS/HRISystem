import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  Users,
  AlertTriangle,
  Filter,
  Download,
  BarChart3,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { SuccessionPlanCard } from "~/components/succession";
import { api } from "~/lib/api-client";

interface Candidate {
  id: string;
  employee_id: string;
  employee_name: string;
  readiness_level: "ready_now" | "ready_1_year" | "ready_2_years" | "development_needed";
  priority: number;
  development_notes: string | null;
}

interface SuccessionPlan {
  id: string;
  position_id: string;
  position_title: string;
  department_name?: string;
  criticality: "critical" | "high" | "medium" | "low";
  risk_level: "high" | "medium" | "low";
  status: "active" | "draft" | "archived";
  candidates: Candidate[];
  created_at: string;
  updated_at: string;
}

interface PipelineStats {
  total_critical_positions: number;
  covered_positions: number;
  uncovered_positions: number;
  ready_now_candidates: number;
  high_risk_positions: number;
}

export default function SuccessionPlanningPage() {
  const navigate = useNavigate();
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  const plans = data?.items || [];
  const criticalPlans = plans.filter((p) => p.criticality === "critical");
  const highRiskPlans = plans.filter((p) => p.risk_level === "high");

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
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline">
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
              {stats?.total_critical_positions || 0}
            </p>
            <p className="text-sm text-gray-500">Critical Positions</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats?.covered_positions || 0}
            </p>
            <p className="text-sm text-gray-500">Covered</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {stats?.uncovered_positions || 0}
            </p>
            <p className="text-sm text-gray-500">Uncovered</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {stats?.ready_now_candidates || 0}
            </p>
            <p className="text-sm text-gray-500">Ready Now</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {stats?.high_risk_positions || 0}
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
        >
          <option value="">All Risk Levels</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
        <Button variant="outline" size="sm">
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
                <Button variant="outline" size="sm">
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

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="font-semibold">Create Succession Plan</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-gray-600">
                Succession plan creation form would go here.
              </p>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setShowCreateModal(false)}
                >
                  Create
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
