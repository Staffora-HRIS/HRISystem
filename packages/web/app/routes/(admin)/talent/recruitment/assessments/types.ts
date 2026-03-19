/**
 * Assessments — shared types and constants
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface AssessmentTemplate {
  id: string;
  name: string;
  type: "skills_test" | "psychometric" | "technical" | "situational" | "presentation";
  description: string | null;
  timeLimitMinutes: number | null;
  passMark: number | null;
  active: boolean;
  createdAt: string;
}

export interface CandidateAssessment {
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

// ---------------------------------------------------------------------------
// Form types
// ---------------------------------------------------------------------------

export interface CreateTemplateData {
  name: string;
  type: string;
  description: string;
  timeLimitMinutes: string;
  passMark: string;
}

export interface ScheduleAssessmentData {
  candidateId: string;
  templateId: string;
  scheduledAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const emptyTemplateForm: CreateTemplateData = {
  name: "",
  type: "skills_test",
  description: "",
  timeLimitMinutes: "",
  passMark: "",
};

export const emptyScheduleForm: ScheduleAssessmentData = {
  candidateId: "",
  templateId: "",
  scheduledAt: "",
};

export const typeLabels: Record<string, string> = {
  skills_test: "Skills Test",
  psychometric: "Psychometric",
  technical: "Technical",
  situational: "Situational",
  presentation: "Presentation",
};

export const typeColors: Record<string, string> = {
  skills_test: "bg-blue-100 text-blue-700",
  psychometric: "bg-purple-100 text-purple-700",
  technical: "bg-orange-100 text-orange-700",
  situational: "bg-teal-100 text-teal-700",
  presentation: "bg-pink-100 text-pink-700",
};

export const assessmentStatusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const assessmentStatusColors: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
};
