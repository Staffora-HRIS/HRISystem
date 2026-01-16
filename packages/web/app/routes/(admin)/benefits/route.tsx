import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Plus,
  Heart,
  Users,
  Calendar,
  Filter,
  Download,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { api } from "~/lib/api-client";

interface BenefitPlan {
  id: string;
  plan_type: string;
  name: string;
  description: string | null;
  provider: string | null;
  coverage_level: string;
  employee_contribution: number;
  employer_contribution: number;
  effective_from: string;
  effective_to: string | null;
  enrollment_start: string | null;
  enrollment_end: string | null;
  is_active: boolean;
  enrolled_count?: number;
}

interface EnrollmentStats {
  total_employees: number;
  enrolled_employees: number;
  pending_enrollments: number;
  pending_life_events: number;
}

const PLAN_TYPE_COLORS: Record<string, string> = {
  medical: "bg-blue-100 text-blue-700",
  dental: "bg-cyan-100 text-cyan-700",
  vision: "bg-purple-100 text-purple-700",
  life: "bg-green-100 text-green-700",
  disability: "bg-orange-100 text-orange-700",
  retirement: "bg-yellow-100 text-yellow-700",
  hsa: "bg-teal-100 text-teal-700",
  fsa: "bg-indigo-100 text-indigo-700",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function BenefitsAdminPage() {
  const navigate = useNavigate();
  const [planTypeFilter, setPlanTypeFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["admin-benefit-plans", planTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (planTypeFilter) params.set("plan_type", planTypeFilter);
      return api.get<{ items: BenefitPlan[] }>(`/benefits/plans?${params}`);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-benefit-stats"],
    queryFn: () => api.get<EnrollmentStats>("/benefits/stats"),
  });

  const activePlans = plans?.items.filter((p) => p.is_active) || [];
  const inactivePlans = plans?.items.filter((p) => !p.is_active) || [];

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
          <Button variant="outline">
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
                {stats?.total_employees || 0}
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
                {stats?.enrolled_employees || 0}
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
                {stats?.pending_enrollments || 0}
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
                {stats?.pending_life_events || 0}
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
          <option value="hsa">HSA</option>
          <option value="fsa">FSA</option>
        </select>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          More Filters
        </Button>
      </div>

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
                            PLAN_TYPE_COLORS[plan.plan_type] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {plan.plan_type}
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
                            {formatCurrency(plan.employee_contribution)}/mo
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Employer Cost</p>
                          <p className="font-medium text-green-600">
                            {formatCurrency(plan.employer_contribution)}/mo
                          </p>
                        </div>
                      </div>
                      {plan.enrolled_count !== undefined && (
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Enrolled
                          </span>
                          <span className="font-medium">
                            {plan.enrolled_count}
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
                          {plan.plan_type}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {plan.provider || "-"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary">Inactive</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="outline" size="sm">
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

      {/* Create Modal Placeholder */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="font-semibold">Create Benefit Plan</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-gray-600">
                Benefit plan creation form would go here.
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
