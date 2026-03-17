import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  Textarea,
  useToast,
} from "~/components/ui";
import { CompetencyCard } from "~/components/competencies";
import { api, ApiError } from "~/lib/api-client";

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
  const queryClient = useQueryClient();

  // Development plan modal state
  const [showDevPlan, setShowDevPlan] = useState(false);

  // Self-assessment modal state
  const [assessingCompetency, setAssessingCompetency] = useState<EmployeeCompetency | null>(null);
  const [selfAssessmentLevel, setSelfAssessmentLevel] = useState("3");
  const [assessmentNotes, setAssessmentNotes] = useState("");

  // Self-assessment mutation
  const selfAssessmentMutation = useMutation({
    mutationFn: (data: {
      id: string;
      self_assessment_level: number;
      assessment_notes?: string;
    }) => {
      const { id, ...body } = data;
      return api.patch(`/competencies/employees/assessments/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-competencies"] });
      queryClient.invalidateQueries({ queryKey: ["my-competency-gaps"] });
      toast.success("Self-assessment submitted successfully");
      setAssessingCompetency(null);
      setSelfAssessmentLevel("3");
      setAssessmentNotes("");
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : "Failed to submit self-assessment";
      toast.error(message);
    },
  });

  function handleOpenSelfAssessment(comp: EmployeeCompetency) {
    setSelfAssessmentLevel(
      comp.selfAssessmentLevel !== null ? String(comp.selfAssessmentLevel) : "3"
    );
    setAssessmentNotes(comp.assessmentNotes || "");
    setAssessingCompetency(comp);
  }

  function handleSubmitSelfAssessment() {
    if (!assessingCompetency) return;
    selfAssessmentMutation.mutate({
      id: assessingCompetency.id,
      self_assessment_level: Number(selfAssessmentLevel),
      assessment_notes: assessmentNotes.trim() || undefined,
    });
  }

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
              <Button variant="outline" size="sm" onClick={() => setShowDevPlan(true)}>
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
            {competencies && competencies.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenSelfAssessment(competencies[0])}
              >
                Start Self-Assessment
              </Button>
            )}
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
                <div
                  key={comp.id}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenSelfAssessment(comp)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenSelfAssessment(comp);
                    }
                  }}
                  aria-label={`Self-assess ${comp.competencyName}`}
                >
                  <CompetencyCard
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
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
      {/* Development Plan Modal */}
      <Modal open={showDevPlan} onClose={() => setShowDevPlan(false)} size="lg">
        <ModalHeader title="Development Plan" />
        <ModalBody>
          {gaps && gaps.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Below are your competency gaps ordered by priority. Focus on closing critical
                gaps first to meet role requirements.
              </p>
              {gaps
                .filter((g) => g.gap > 0)
                .sort((a, b) => b.gap - a.gap)
                .map((gap) => (
                  <div
                    key={gap.competencyId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{gap.competencyName}</p>
                      <p className="text-sm text-gray-500">
                        {gap.competencyCategory} | Current: Level {gap.currentLevel} |
                        Required: Level {gap.requiredLevel}
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
          ) : (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
              <p>No competency gaps found. You are meeting all role requirements.</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowDevPlan(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Self-Assessment Modal */}
      <Modal
        open={assessingCompetency !== null}
        onClose={() => {
          if (!selfAssessmentMutation.isPending) {
            setAssessingCompetency(null);
          }
        }}
        size="lg"
      >
        <ModalHeader
          title={`Self-Assessment: ${assessingCompetency?.competencyName ?? ""}`}
        />
        <ModalBody>
          {assessingCompetency && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-sm">
                  <span className="font-medium">Category:</span>{" "}
                  {assessingCompetency.competencyCategory}
                </p>
                {assessingCompetency.currentLevel !== null && (
                  <p className="text-sm">
                    <span className="font-medium">Current Level:</span>{" "}
                    {assessingCompetency.currentLevel}
                  </p>
                )}
                {assessingCompetency.targetLevel !== null && (
                  <p className="text-sm">
                    <span className="font-medium">Target Level:</span>{" "}
                    {assessingCompetency.targetLevel}
                  </p>
                )}
                {assessingCompetency.managerAssessmentLevel !== null && (
                  <p className="text-sm">
                    <span className="font-medium">Manager Assessment:</span>{" "}
                    Level {assessingCompetency.managerAssessmentLevel}
                  </p>
                )}
              </div>
              <Select
                label="Your Self-Assessment Level"
                value={selfAssessmentLevel}
                onChange={(e) => setSelfAssessmentLevel(e.target.value)}
                options={[
                  { value: "1", label: "1 - Beginner" },
                  { value: "2", label: "2 - Developing" },
                  { value: "3", label: "3 - Competent" },
                  { value: "4", label: "4 - Advanced" },
                  { value: "5", label: "5 - Expert" },
                ]}
                id="self-assessment-level"
              />
              <Textarea
                label="Assessment Notes"
                placeholder="Describe your experience and evidence for this level..."
                value={assessmentNotes}
                onChange={(e) => setAssessmentNotes(e.target.value)}
                rows={4}
                id="assessment-notes"
              />
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (!selfAssessmentMutation.isPending) {
                setAssessingCompetency(null);
              }
            }}
            disabled={selfAssessmentMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitSelfAssessment}
            disabled={selfAssessmentMutation.isPending}
            loading={selfAssessmentMutation.isPending}
          >
            {selfAssessmentMutation.isPending ? "Submitting..." : "Submit Assessment"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
