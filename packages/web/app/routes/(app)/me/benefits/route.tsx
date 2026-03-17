import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Heart, Calendar, AlertCircle, Check, Clock, FileText } from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { PlanCard, EnrollmentWizard } from "~/components/benefits";
import { api } from "~/lib/api-client";

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
  enrollmentStatus?: "enrolled" | "pending" | "not_enrolled" | "waived";
}

interface Enrollment {
  id: string;
  planId: string;
  planName: string;
  planType: string;
  coverageLevel: string;
  employeeContribution: number;
  status: "active" | "pending" | "terminated";
  effectiveFrom: string;
  effectiveTo: string | null;
}

interface LifeEvent {
  id: string;
  eventType: string;
  eventDate: string;
  status: "pending" | "approved" | "rejected" | "expired";
  enrollmentWindowEnd: string;
}

const LIFE_EVENT_TYPES = [
  { value: "marriage", label: "Marriage" },
  { value: "divorce", label: "Divorce" },
  { value: "birth", label: "Birth of Child" },
  { value: "adoption", label: "Adoption" },
  { value: "death", label: "Death of Dependent" },
  { value: "loss_of_coverage", label: "Loss of Coverage" },
];

export default function MyBenefitsPage() {
  const [activeTab, setActiveTab] = useState<"current" | "available" | "history">("current");
  const [selectedPlan, setSelectedPlan] = useState<BenefitPlan | null>(null);
  const [showLifeEventModal, setShowLifeEventModal] = useState(false);

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["my-enrollments"],
    queryFn: () => api.get<{ items: Enrollment[] }>("/benefits/my-enrollments"),
  });

  const { data: availablePlans, isLoading: plansLoading } = useQuery({
    queryKey: ["available-plans"],
    queryFn: () => api.get<{ items: BenefitPlan[] }>("/benefits/plans"),
    enabled: activeTab === "available",
  });

  const { data: lifeEvents } = useQuery({
    queryKey: ["my-life-events"],
    queryFn: () => api.get<{ items: LifeEvent[] }>("/benefits/my-life-events"),
  });

  const activeEnrollments = enrollments?.items.filter((e) => e.status === "active") || [];
  const pendingEnrollments = enrollments?.items.filter((e) => e.status === "pending") || [];
  const pendingLifeEvents = lifeEvents?.items.filter((e) => e.status === "pending") || [];

  const totalMonthlyCost = activeEnrollments.reduce(
    (sum, e) => sum + e.employeeContribution,
    0
  );

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(amount);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Benefits</h1>
          <p className="text-gray-600">
            View and manage your benefit enrollments
          </p>
        </div>
        <Button onClick={() => setShowLifeEventModal(true)}>
          <FileText className="h-4 w-4 mr-2" />
          Report Life Event
        </Button>
      </div>

      {/* Alerts */}
      {pendingLifeEvents.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardBody className="flex items-center gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div className="flex-1">
              <p className="font-medium text-yellow-900">
                Open Enrollment Window
              </p>
              <p className="text-sm text-yellow-700">
                You have a life event that allows you to make benefit changes.
                Window closes{" "}
                {new Date(
                  pendingLifeEvents[0].enrollmentWindowEnd
                ).toLocaleDateString()}
                .
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setActiveTab("available")}>
              View Options
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Heart className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Enrollments</p>
              <p className="text-2xl font-bold">{activeEnrollments.length}</p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Monthly Deduction</p>
              <p className="text-2xl font-bold">
                {formatCurrency(totalMonthlyCost)}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-100">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">{pendingEnrollments.length}</p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("current")}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === "current"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Current Benefits
          </button>
          <button
            onClick={() => setActiveTab("available")}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === "available"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Available Plans
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === "history"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            History
          </button>
        </nav>
      </div>

      {/* Current Benefits Tab */}
      {activeTab === "current" && (
        <div className="space-y-4">
          {enrollmentsLoading ? (
            <div className="text-center py-8">Loading enrollments...</div>
          ) : activeEnrollments.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No active benefits
                </h3>
                <p className="text-gray-500 mb-4">
                  You're not currently enrolled in any benefit plans.
                </p>
                <Button onClick={() => setActiveTab("available")}>
                  View Available Plans
                </Button>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {activeEnrollments.map((enrollment) => (
                <Card key={enrollment.id}>
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                          {enrollment.planType}
                        </span>
                        <h3 className="font-semibold mt-2">
                          {enrollment.planName}
                        </h3>
                        <p className="text-sm text-gray-500 capitalize">
                          {enrollment.coverageLevel.replace(/_/g, " ")}
                        </p>
                      </div>
                      <Badge variant="success">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                    <div className="mt-4 pt-4 border-t flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        Monthly Deduction
                      </span>
                      <span className="font-medium">
                        {formatCurrency(enrollment.employeeContribution)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>Effective</span>
                      <span>
                        {new Date(enrollment.effectiveFrom).toLocaleDateString()}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {/* Pending Enrollments */}
          {pendingEnrollments.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">
                Pending Enrollments
              </h2>
              <div className="space-y-2">
                {pendingEnrollments.map((enrollment) => (
                  <Card key={enrollment.id} className="border-yellow-200">
                    <CardBody className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{enrollment.planName}</h3>
                        <p className="text-sm text-gray-500">
                          Effective{" "}
                          {new Date(
                            enrollment.effectiveFrom
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="warning">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Available Plans Tab */}
      {activeTab === "available" && (
        <div className="space-y-4">
          {plansLoading ? (
            <div className="text-center py-8">Loading available plans...</div>
          ) : availablePlans?.items.length === 0 ? (
            <Card>
              <CardBody className="text-center py-12">
                <Heart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No plans available
                </h3>
                <p className="text-gray-500">
                  There are no benefit plans available for enrollment at this
                  time.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {availablePlans?.items.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onEnroll={(id) => {
                    const p = availablePlans.items.find((p) => p.id === id);
                    if (p) setSelectedPlan(p);
                  }}
                  onViewDetails={() => {
                    // Could open a detail modal
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <Card>
          <CardBody className="text-center py-12 text-gray-500">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p>Enrollment history will appear here.</p>
          </CardBody>
        </Card>
      )}

      {/* Enrollment Wizard Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <EnrollmentWizard
            plan={selectedPlan}
            onComplete={() => setSelectedPlan(null)}
            onCancel={() => setSelectedPlan(null)}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          />
        </div>
      )}

      {/* Life Event Modal */}
      {showLifeEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h3 className="font-semibold">Report Life Event</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                A qualifying life event may allow you to make changes to your
                benefits outside of the normal enrollment period.
              </p>
              <div className="space-y-3">
                {LIFE_EVENT_TYPES.map((event) => (
                  <button
                    key={event.value}
                    className="w-full text-left rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
                  >
                    {event.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowLifeEventModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
