export { RouteErrorBoundary as ErrorBoundary } from "~/components/ui/RouteErrorBoundary";
import { useState } from "react";
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
import { Button } from "~/components/ui/button";

import type { CandidateAssessment } from "./types";
import {
  typeLabels,
  typeColors,
  assessmentStatusLabels,
  assessmentStatusColors,
} from "./types";
import { useAssessments } from "./use-assessments";
import { CreateTemplateModal } from "./CreateTemplateModal";
import { ScheduleAssessmentModal } from "./ScheduleAssessmentModal";
import { AssessmentDetailModal } from "./AssessmentDetailModal";

export default function AssessmentsPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"templates" | "assessments">("templates");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState<CandidateAssessment | null>(null);

  const {
    templates,
    assessments,
    templatesLoading,
    assessmentsLoading,
    createTemplateMutation,
    scheduleMutation,
    recordResultMutation,
    cancelMutation,
  } = useAssessments({
    activeTab,
    search,
    typeFilter,
    statusFilter,
    onTemplateCreated: () => setShowCreateTemplateModal(false),
    onAssessmentScheduled: () => setShowScheduleModal(false),
    onResultRecorded: () => setSelectedAssessment(null),
    onAssessmentCancelled: () => setSelectedAssessment(null),
  });

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

      {/* Modals */}
      <CreateTemplateModal
        open={showCreateTemplateModal}
        onClose={() => setShowCreateTemplateModal(false)}
        onSubmit={(data) => createTemplateMutation.mutate(data)}
        isPending={createTemplateMutation.isPending}
      />

      <ScheduleAssessmentModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSubmit={(data) => scheduleMutation.mutate(data)}
        isPending={scheduleMutation.isPending}
      />

      {selectedAssessment && (
        <AssessmentDetailModal
          assessment={selectedAssessment}
          onClose={() => setSelectedAssessment(null)}
          onRecordResult={(data) =>
            recordResultMutation.mutate({ id: selectedAssessment.id, data })
          }
          onCancel={() => cancelMutation.mutate(selectedAssessment.id)}
          isRecordingResult={recordResultMutation.isPending}
          isCancelling={cancelMutation.isPending}
        />
      )}
    </div>
  );
}
