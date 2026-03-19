/**
 * Assessments Data Hook
 *
 * Encapsulates all data fetching (queries) and mutations for the
 * assessments admin page — templates and candidate assessments.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "~/components/ui/toast";
import { api, ApiError } from "~/lib/api-client";
import type {
  AssessmentTemplate,
  CandidateAssessment,
  CreateTemplateData,
  ScheduleAssessmentData,
} from "./types";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAssessments(options: {
  activeTab: "templates" | "assessments";
  search: string;
  typeFilter: string;
  statusFilter: string;
  onTemplateCreated: () => void;
  onAssessmentScheduled: () => void;
  onResultRecorded: () => void;
  onAssessmentCancelled: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Templates query
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ["admin-assessment-templates", options.search, options.typeFilter],
    queryFn: () =>
      api.get<{ templates: AssessmentTemplate[]; count: number }>(
        "/assessments/templates",
        {
          params: {
            search: options.search || undefined,
            type: options.typeFilter || undefined,
            active: "true",
          },
        }
      ),
    enabled: options.activeTab === "templates",
  });

  // Candidate assessments query
  const { data: assessmentsData, isLoading: assessmentsLoading } = useQuery({
    queryKey: ["admin-candidate-assessments", options.search, options.statusFilter],
    queryFn: () =>
      api.get<{ assessments: CandidateAssessment[]; count: number }>(
        "/assessments/candidate-assessments",
        {
          params: {
            search: options.search || undefined,
            status: options.statusFilter || undefined,
          },
        }
      ),
    enabled: options.activeTab === "assessments",
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
      options.onTemplateCreated();
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
      options.onAssessmentScheduled();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to schedule assessment");
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { score: number; passed: boolean; feedback?: string };
    }) => api.post(`/assessments/candidate-assessments/${id}/record-result`, data),
    onSuccess: () => {
      toast.success("Assessment result recorded");
      queryClient.invalidateQueries({ queryKey: ["admin-candidate-assessments"] });
      options.onResultRecorded();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to record result");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/assessments/candidate-assessments/${id}/cancel`, {}),
    onSuccess: () => {
      toast.success("Assessment cancelled");
      queryClient.invalidateQueries({ queryKey: ["admin-candidate-assessments"] });
      options.onAssessmentCancelled();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to cancel assessment");
    },
  });

  return {
    // Data
    templates: templatesData?.templates || [],
    assessments: assessmentsData?.assessments || [],
    templatesLoading,
    assessmentsLoading,
    // Mutations
    createTemplateMutation,
    scheduleMutation,
    recordResultMutation,
    cancelMutation,
  };
}
