import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  Plus,
  ClipboardCheck,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Award,
} from "lucide-react";
import { Card, CardHeader, CardBody } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/components/ui/toast";
import { Button } from "~/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "~/components/ui/modal";
import { api, ApiError } from "~/lib/api-client";

interface AssessmentTemplate {
  id: string;
  name: string;
  type: "skills_test" | "psychometric" | "technical" | "situational" | "presentation";
  description: string | null;
  timeLimitMinutes: number | null;
  passMark: number | null;
  active: boolean;
  createdAt: string;
}

interface CandidateAssessment {
  id: string;
  candidateId: string;
  templateId: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  assessorId: string | null;
  feedback: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  templateName?: string;
  templateType?: string;
}

interface CreateTemplateData {
  name: string;
  type: string;
  description: string;
  timeLimitMinutes: string;
  passMark: string;
}

interface ScheduleAssessmentData {
  candidateId: string;
  templateId: string;
  scheduledAt: string;
}

const emptyTemplateForm: CreateTemplateData = {
  name: "",
  type: "skills_test",
  description: "",
  timeLimitMinutes: "",
  passMark: "",
};

const emptyScheduleForm: ScheduleAssessmentData = {
  candidateId: "",
  templateId: "",
  scheduledAt: "",
};

const typeLabels: Record<string, string> = {
  skills_test: "Skills Test",
  psychometric: "Psychometric",
  technical: "Technical",
  situational: "Situational",
  presentation: "Presentation",
};

const typeColors: Record<string, string> = {
  skills_test: "bg-blue-100 text-blue-700",
  psychometric: "bg-purple-100 text-purple-700",
  technical: "bg-orange-100 text-orange-700",
  situational: "bg-teal-100 text-teal-700",
  presentation: "bg-pink-100 text-pink-700",
};

const assessmentStatusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const assessmentStatusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
};

export default function AssessmentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"templates" | "assessments">("templates");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [templateForm, setTemplateForm] = useState<CreateTemplateData>({ ...emptyTemplateForm });
  const [scheduleForm, setScheduleForm] = useState<ScheduleAssessmentData>({ ...emptyScheduleForm });
  const [selectedAssessment, setSelectedAssessment] = useState<CandidateAssessment | null>(null);
  const [showRecordResultModal, setShowRecordResultModal] = useState(false);
  const [resultData, setResultData] = useState({ score: "", passed: true, feedback: "" });

  // Templates query
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["admin-assessment-templates", search, typeFilter],
    queryFn: () =>
      api.get<{ templates: AssessmentTemplate[]; count: number }>(
        "/assessments/templates",
        {
          params: {
            search: search || undefined,
            type: typeFilter || undefined,
            active: "true",
          },
        }
      ),
    enabled: activeTab === "templates",
  });

  // Candidate assessments query
  const { data: assessmentsData, isLoading: assessmentsLoading } = useQuery({
    queryKey: ["admin-candidate-assessments", search, statusFilter],
    queryFn: () =>
      api.get<{ assessments: CandidateAssessment[]; count: number }>(
        "/assessments/candidate-assessments",
        {
          params: {
            search: search || undefined,
            status: statusFilter || undefined,
          },
        }
      ),
    enabled: activeTab === "assessments",
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: CreateTemplateData) =>
      api.post("/assessments/templates", {
        name: data.name,
        type: data.type,
        description: data.description || undefined,
        timeLimitMinutes: data.timeLimitMinutes ? Number(data.timeLimitMinutes) : undefined,
        passMark: data.passMark ? Number(data.passMark) : undefined,
      }),
    onSuccess: () => {
      toast.success("Assessment template created");
      queryClient.invalidateQueries({ queryKey: ["admin-assessment-templates"] });
      setShowCreateTemplateModal(false);
      setTemplateForm({ ...emptyTemplateForm });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to create template");
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (data: ScheduleAssessmentData) =>
      api.post("/assessments/candidate-assessments", {
        candidateId: data.candidateId,
        templateId: data.templateId,
        scheduledAt: data.scheduledAt || undefined,
      }),
    onSuccess: () => {
      toast.success("Assessment scheduled");
      queryClient.invalidateQueries({ queryKey: ["admin-candidate-assessments"] });
      setShowScheduleModal(false);
      setScheduleForm({ ...emptyScheduleForm });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to schedule assessment");
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { score: number; passed: boolean; feedback?: string } }) =>
      api.post(`/assessments/candidate-assessments/${id}/record-result`, data),
    onSuccess: () => {
      toast.success("Assessment result recorded");
      queryClient.invalidateQueries({ queryKey: ["admin-candidate-assessments"] });
      setShowRecordResultModal(false);
      setSelectedAssessment(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to record result");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/assessments/candidate-assessments/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success("Assessment cancelled");
      queryClient.invalidateQueries({ queryKey: ["admin-candidate-assessments"] });
      setSelectedAssessment(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel assessment");
    },
  });

  const templates = templatesData?.templates || [];
  const assessments = assessmentsData?.assessments || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate("/admin/talent/recruitment")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
          <p className="text-gray-600">
            Manage assessment templates and candidate assessments
          </p>
        </div>
        {activeTab === "templates" ? (
          <Button onClick={() => setShowCreateTemplateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        ) : (
          <Button onClick={() => setShowScheduleModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Schedule Assessment
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => { setActiveTab("templates"); setSearch(""); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "templates"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => { setActiveTab("assessments"); setSearch(""); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "assessments"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Candidate Assessments
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === "templates" ? "Search templates..." : "Search assessments..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
            {activeTab === "templates" ? (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="">All Types</option>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            ) : (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="">All Statuses</option>
                {Object.entries(assessmentStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Templates List */}
      {activeTab === "templates" && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-blue-600" />
                Assessment Templates
              </h3>
              <span className="text-sm text-gray-500">{templates.length} templates</span>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {templatesLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ClipboardCheck className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p>No assessment templates found</p>
                <p className="text-sm">Create a template to start scheduling assessments</p>
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((template) => (
                  <div key={template.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[template.type]}`}>
                            {typeLabels[template.type]}
                          </span>
                          {template.timeLimitMinutes && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {template.timeLimitMinutes} min
                            </span>
                          )}
                          {template.passMark !== null && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Award className="h-3 w-3" />
                              Pass: {template.passMark}%
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant={template.active ? "success" : "secondary"}>
                        {template.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Candidate Assessments List */}
      {activeTab === "assessments" && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                Candidate Assessments
              </h3>
              <span className="text-sm text-gray-500">{assessments.length} assessments</span>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {assessmentsLoading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : assessments.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Award className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p>No candidate assessments found</p>
                <p className="text-sm">Schedule an assessment for a candidate</p>
              </div>
            ) : (
              <div className="divide-y">
                {assessments.map((assessment) => (
                  <div
                    key={assessment.id}
                    className="p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedAssessment(assessment)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {assessment.templateName || "Assessment"}
                        </h4>
                        <div className="flex items-center gap-3 mt-1">
                          {assessment.templateType && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[assessment.templateType] || "bg-gray-100"}`}>
                              {typeLabels[assessment.templateType] || assessment.templateType}
                            </span>
                          )}
                          {assessment.scheduledAt && (
                            <span className="text-xs text-gray-500">
                              Scheduled: {new Date(assessment.scheduledAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {assessment.score !== null && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm font-medium">Score: {assessment.score}</span>
                            {assessment.passed !== null && (
                              assessment.passed ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-600" />
                              )
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${assessmentStatusColors[assessment.status]}`}>
                          {assessmentStatusLabels[assessment.status]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(assessment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
        <Modal open onClose={() => setShowCreateTemplateModal(false)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">New Assessment Template</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="tmpl-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="tmpl-name"
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Technical Interview Assessment"
                />
              </div>
              <div>
                <label htmlFor="tmpl-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="tmpl-type"
                  value={templateForm.type}
                  onChange={(e) => setTemplateForm({ ...templateForm, type: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tmpl-desc" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="tmpl-desc"
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  rows={3}
                  placeholder="Describe the assessment..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="tmpl-time" className="block text-sm font-medium text-gray-700 mb-1">
                    Time Limit (minutes)
                  </label>
                  <input
                    id="tmpl-time"
                    type="number"
                    value={templateForm.timeLimitMinutes}
                    onChange={(e) => setTemplateForm({ ...templateForm, timeLimitMinutes: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    min="1"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label htmlFor="tmpl-pass" className="block text-sm font-medium text-gray-700 mb-1">
                    Pass Mark (%)
                  </label>
                  <input
                    id="tmpl-pass"
                    type="number"
                    value={templateForm.passMark}
                    onChange={(e) => setTemplateForm({ ...templateForm, passMark: e.target.value })}
                    className="w-full rounded-md border border-gray-300 p-2"
                    min="0"
                    max="100"
                    placeholder="70"
                  />
                </div>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateTemplateModal(false)} disabled={createTemplateMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createTemplateMutation.mutate(templateForm)}
              disabled={!templateForm.name.trim() || createTemplateMutation.isPending}
            >
              {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Schedule Assessment Modal */}
      {showScheduleModal && (
        <Modal open onClose={() => setShowScheduleModal(false)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Schedule Assessment</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="sched-candidate" className="block text-sm font-medium text-gray-700 mb-1">
                  Candidate ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="sched-candidate"
                  type="text"
                  value={scheduleForm.candidateId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, candidateId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Enter candidate UUID"
                />
              </div>
              <div>
                <label htmlFor="sched-template" className="block text-sm font-medium text-gray-700 mb-1">
                  Template ID <span className="text-red-500">*</span>
                </label>
                <input
                  id="sched-template"
                  type="text"
                  value={scheduleForm.templateId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, templateId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  placeholder="Enter template UUID"
                />
              </div>
              <div>
                <label htmlFor="sched-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Scheduled Date/Time
                </label>
                <input
                  id="sched-date"
                  type="datetime-local"
                  value={scheduleForm.scheduledAt}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledAt: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowScheduleModal(false)} disabled={scheduleMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => scheduleMutation.mutate(scheduleForm)}
              disabled={
                !scheduleForm.candidateId.trim() ||
                !scheduleForm.templateId.trim() ||
                scheduleMutation.isPending
              }
            >
              {scheduleMutation.isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Assessment Detail Modal */}
      {selectedAssessment && !showRecordResultModal && (
        <Modal open onClose={() => setSelectedAssessment(null)} size="md">
          <ModalHeader>
            <h3 className="text-lg font-semibold">{selectedAssessment.templateName || "Assessment"}</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${assessmentStatusColors[selectedAssessment.status]}`}>
                  {assessmentStatusLabels[selectedAssessment.status]}
                </span>
                {selectedAssessment.templateType && (
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[selectedAssessment.templateType] || "bg-gray-100"}`}>
                    {typeLabels[selectedAssessment.templateType] || selectedAssessment.templateType}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {selectedAssessment.scheduledAt && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Scheduled</div>
                    <div className="text-sm">{new Date(selectedAssessment.scheduledAt).toLocaleString()}</div>
                  </div>
                )}
                {selectedAssessment.completedAt && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Completed</div>
                    <div className="text-sm">{new Date(selectedAssessment.completedAt).toLocaleString()}</div>
                  </div>
                )}
                {selectedAssessment.score !== null && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Score</div>
                    <div className="text-sm font-medium">{selectedAssessment.score}</div>
                  </div>
                )}
                {selectedAssessment.passed !== null && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Result</div>
                    <div className={`text-sm font-medium ${selectedAssessment.passed ? "text-green-600" : "text-red-600"}`}>
                      {selectedAssessment.passed ? "Passed" : "Failed"}
                    </div>
                  </div>
                )}
              </div>

              {selectedAssessment.feedback && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Feedback</div>
                  <div className="text-sm">{selectedAssessment.feedback}</div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t pt-4 flex flex-wrap gap-2">
                {(selectedAssessment.status === "scheduled" || selectedAssessment.status === "in_progress") && (
                  <>
                    <Button
                      onClick={() => {
                        setResultData({ score: "", passed: true, feedback: "" });
                        setShowRecordResultModal(true);
                      }}
                    >
                      Record Result
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => cancelMutation.mutate(selectedAssessment.id)}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending ? "Cancelling..." : "Cancel Assessment"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setSelectedAssessment(null)}>Close</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Record Result Modal */}
      {showRecordResultModal && selectedAssessment && (
        <Modal open onClose={() => setShowRecordResultModal(false)} size="sm">
          <ModalHeader>
            <h3 className="text-lg font-semibold">Record Assessment Result</h3>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label htmlFor="res-score" className="block text-sm font-medium text-gray-700 mb-1">
                  Score <span className="text-red-500">*</span>
                </label>
                <input
                  id="res-score"
                  type="number"
                  value={resultData.score}
                  onChange={(e) => setResultData({ ...resultData, score: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  min="0"
                  placeholder="85"
                />
              </div>
              <div>
                <label htmlFor="res-passed" className="block text-sm font-medium text-gray-700 mb-1">
                  Result <span className="text-red-500">*</span>
                </label>
                <select
                  id="res-passed"
                  value={resultData.passed ? "true" : "false"}
                  onChange={(e) => setResultData({ ...resultData, passed: e.target.value === "true" })}
                  className="w-full rounded-md border border-gray-300 p-2"
                >
                  <option value="true">Passed</option>
                  <option value="false">Failed</option>
                </select>
              </div>
              <div>
                <label htmlFor="res-feedback" className="block text-sm font-medium text-gray-700 mb-1">
                  Feedback
                </label>
                <textarea
                  id="res-feedback"
                  value={resultData.feedback}
                  onChange={(e) => setResultData({ ...resultData, feedback: e.target.value })}
                  className="w-full rounded-md border border-gray-300 p-2"
                  rows={3}
                  placeholder="Assessor feedback..."
                />
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowRecordResultModal(false)} disabled={recordResultMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                recordResultMutation.mutate({
                  id: selectedAssessment.id,
                  data: {
                    score: Number(resultData.score),
                    passed: resultData.passed,
                    feedback: resultData.feedback || undefined,
                  },
                })
              }
              disabled={!resultData.score || recordResultMutation.isPending}
            >
              {recordResultMutation.isPending ? "Recording..." : "Record Result"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
