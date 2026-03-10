import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/toast";
import { CompetencyCard } from "~/components/competencies";
import { api } from "~/lib/api-client";

interface EmployeeCompetency {
  id: string;
  competencyId: string;
  competencyName: string;
  competencyCategory: string;
  currentLevel: number | null;
  targetLevel: number | null;
  selfAssessmentLevel: number | null;
  managerAssessmentLevel: number | null;
  assessmentNotes: string | null;
  nextAssessmentDue: string | null;
}

interface CompetencyGap {
  competencyId: string;
  competencyName: string;
  competencyCategory: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  isRequired: boolean;
}

export default function MyCompetenciesPage() {
  const toast = useToast();

  const { data: competencies, isLoading: isLoadingCompetencies } = useQuery({
    queryKey: ["my-competencies"],
    queryFn: () => api.get<EmployeeCompetency[]>("/competencies/employees/me"),
  });

  const { data: gaps } = useQuery({
    queryKey: ["my-competency-gaps"],
    queryFn: () => api.get<CompetencyGap[]>("/competencies/employees/me/gaps"),
  });

  const assessedCount = competencies?.filter((c) => c.currentLevel != null).length || 0;
  const totalGaps = gaps?.reduce((sum, g) => sum + Math.max(0, g.gap), 0) || 0;
  const criticalGaps = gaps?.filter((g) => g.gap >= 2 && g.isRequired).length || 0;
  const upcomingAssessments = competencies?.filter(
    (c) => c.nextAssessmentDue && new Date(c.nextAssessmentDue) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  ).length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Competencies</h1>
        <p className="text-gray-600">
          Track your skills and development progress
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Award className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{assessedCount}</p>
                <p className="text-sm text-gray-500">Assessed Skills</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className={criticalGaps > 0 ? "border-red-200" : ""}>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${criticalGaps > 0 ? "bg-red-100" : "bg-green-100"}`}>
                {criticalGaps > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                )}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{criticalGaps}</p>
                <p className="text-sm text-gray-500">Critical Gaps</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalGaps}</p>
                <p className="text-sm text-gray-500">Total Gap Points</p>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{upcomingAssessments}</p>
                <p className="text-sm text-gray-500">Due for Review</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Gap Analysis */}
      {gaps && gaps.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-yellow-600" />
                Development Priorities
              </h3>
              <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Development plans will be available in a future update." })}>
                View Development Plan
              </Button>
            </div>
          </CardHeader>
          <CardBody className="p-4">
            <div className="space-y-3">
              {gaps
                .filter((g) => g.gap > 0)
                .sort((a, b) => b.gap - a.gap)
                .slice(0, 5)
                .map((gap) => (
                  <div
                    key={gap.competencyId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{gap.competencyName}</p>
                      <p className="text-sm text-gray-500">
                        Current: Level {gap.currentLevel} | Required: Level {gap.requiredLevel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded text-sm font-medium ${
                          gap.gap >= 2
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        Gap: {gap.gap}
                      </span>
                      {gap.isRequired && (
                        <span className="px-2 py-1 rounded text-xs bg-red-50 text-red-600">
                          Required
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* My Competencies */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" />
              My Assessed Competencies
            </h3>
            <Button variant="outline" size="sm" onClick={() => toast.info("Coming Soon", { message: "Self-assessment requests will be available in a future update." })}>
              Request Self-Assessment
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-4">
          {isLoadingCompetencies ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : competencies?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Award className="h-12 w-12 mx-auto text-gray-300 mb-2" />
              <p>No competency assessments yet</p>
              <p className="text-sm">Your manager will assess your competencies</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {competencies?.map((comp) => (
                <CompetencyCard
                  key={comp.id}
                  competency={{
                    id: comp.competencyId,
                    code: "",
                    name: comp.competencyName,
                    category: comp.competencyCategory,
                    currentLevel: comp.currentLevel,
                    targetLevel: comp.targetLevel,
                  }}
                  showAssessment
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
