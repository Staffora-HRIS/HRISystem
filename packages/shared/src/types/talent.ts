/**
 * Talent Management Types
 *
 * Type definitions for talent acquisition (requisitions, candidates, interviews, offers)
 * and performance management (cycles, goals, reviews, feedback).
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
  Money,
} from "./common";
import type { CandidateStage } from "../state-machines/recruitment";

// =============================================================================
// Requisition Types
// =============================================================================

/** Requisition status */
export type RequisitionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "open"
  | "on_hold"
  | "filled"
  | "cancelled"
  | "closed";

/** Requisition priority */
export type RequisitionPriority = "low" | "normal" | "high" | "urgent";

/**
 * Job requisition.
 */
export interface Requisition extends TenantScopedEntity {
  /** Requisition number */
  requisitionNumber: string;
  /** Job title */
  title: string;
  /** Job description */
  description?: string;
  /** Position ID (if filling existing position) */
  positionId?: UUID;
  /** Org unit ID */
  orgUnitId: UUID;
  /** Hiring manager employee ID */
  hiringManagerId: UUID;
  /** Recruiter user ID */
  recruiterId?: UUID;
  /** Requisition status */
  status: RequisitionStatus;
  /** Priority */
  priority: RequisitionPriority;
  /** Number of openings */
  openings: number;
  /** Number filled */
  filled: number;
  /** Location ID */
  locationId?: UUID;
  /** Remote work option */
  remoteOption: "onsite" | "hybrid" | "remote";
  /** Employment type */
  employmentType: string;
  /** Compensation range */
  compensationRange?: {
    min: Money;
    max: Money;
    currency: string;
  };
  /** Target hire date */
  targetHireDate?: DateString;
  /** Approved date */
  approvedAt?: TimestampString;
  /** Approved by user ID */
  approvedBy?: UUID;
  /** Posted date */
  postedAt?: TimestampString;
  /** Closed date */
  closedAt?: TimestampString;
  /** Close reason */
  closeReason?: string;
  /** Required skills */
  requiredSkills?: string[];
  /** Preferred skills */
  preferredSkills?: string[];
  /** Required experience years */
  requiredExperienceYears?: number;
  /** Required education */
  requiredEducation?: string;
  /** Job posting URL */
  postingUrl?: string;
  /** External job board IDs */
  externalPostings?: Array<{
    board: string;
    postingId: string;
    url: string;
    postedAt: TimestampString;
  }>;
  /** Cost center ID */
  costCenterId?: UUID;
  /** Budget code */
  budgetCode?: string;
  /** Interview stages configuration */
  interviewStages?: InterviewStageConfig[];
  /** Workflow instance ID */
  workflowInstanceId?: UUID;
}

/**
 * Interview stage configuration.
 */
export interface InterviewStageConfig {
  /** Stage order */
  order: number;
  /** Stage name */
  name: string;
  /** Interview type */
  type: "phone" | "video" | "onsite" | "technical" | "panel" | "final";
  /** Required interviewers */
  requiredInterviewers?: number;
  /** Interviewer role */
  interviewerRole?: string;
  /** Duration in minutes */
  durationMinutes: number;
  /** Required for all candidates */
  isRequired: boolean;
}

// =============================================================================
// Candidate Types
// =============================================================================

/** Candidate source */
export type CandidateSource =
  | "direct_apply"
  | "referral"
  | "linkedin"
  | "indeed"
  | "glassdoor"
  | "agency"
  | "career_fair"
  | "internal"
  | "other";

/**
 * Candidate record.
 */
export interface Candidate extends TenantScopedEntity {
  /** Requisition ID */
  requisitionId: UUID;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Email */
  email: string;
  /** Phone */
  phone?: string;
  /** Current stage */
  stage: string;
  /** Source */
  source: CandidateSource;
  /** Source details */
  sourceDetails?: string;
  /** Referrer employee ID */
  referredById?: UUID;
  /** Resume URL */
  resumeUrl?: string;
  /** Cover letter URL */
  coverLetterUrl?: string;
  /** LinkedIn profile URL */
  linkedinUrl?: string;
  /** Portfolio URL */
  portfolioUrl?: string;
  /** Current company */
  currentCompany?: string;
  /** Current title */
  currentTitle?: string;
  /** Years of experience */
  experienceYears?: number;
  /** Expected salary */
  expectedSalary?: Money;
  /** Available start date */
  availableStartDate?: DateString;
  /** Skills */
  skills?: string[];
  /** Education */
  education?: Array<{
    institution: string;
    degree: string;
    field: string;
    graduationYear?: number;
  }>;
  /** Work authorization */
  workAuthorization?: string;
  /** Requires sponsorship */
  requiresSponsorship?: boolean;
  /** Notes */
  notes?: string;
  /** Tags */
  tags?: string[];
  /** Overall rating (1-5) */
  overallRating?: number;
  /** Applied timestamp */
  appliedAt: TimestampString;
  /** Last activity timestamp */
  lastActivityAt: TimestampString;
  /** Rejection reason */
  rejectionReason?: string;
  /** Rejected timestamp */
  rejectedAt?: TimestampString;
  /** Hired employee ID (if hired) */
  hiredEmployeeId?: UUID;
}

/**
 * Candidate stage change event.
 */
export interface CandidateStageEvent extends TenantScopedEntity {
  /** Candidate ID */
  candidateId: UUID;
  /** Previous stage */
  fromStage: CandidateStage;
  /** New stage */
  toStage: CandidateStage;
  /** Changed by user ID */
  changedBy: UUID;
  /** Change timestamp */
  changedAt: TimestampString;
  /** Reason/notes */
  reason?: string;
}

// =============================================================================
// Interview Types
// =============================================================================

/** Interview status */
export type InterviewStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/**
 * Interview record.
 */
export interface Interview extends TenantScopedEntity {
  /** Candidate ID */
  candidateId: UUID;
  /** Requisition ID */
  requisitionId: UUID;
  /** Interview type */
  type: string;
  /** Stage name */
  stageName: string;
  /** Status */
  status: InterviewStatus;
  /** Scheduled start time */
  scheduledAt: TimestampString;
  /** Duration in minutes */
  durationMinutes: number;
  /** Location or meeting link */
  location?: string;
  /** Meeting link */
  meetingLink?: string;
  /** Interviewers */
  interviewerIds: UUID[];
  /** Organizer user ID */
  organizerId: UUID;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Calendar event ID */
  calendarEventId?: string;
  /** Interview notes */
  notes?: string;
  /** Cancellation reason */
  cancellationReason?: string;
}

/** Interview rating */
export type InterviewRating = 1 | 2 | 3 | 4 | 5;

/** Interview recommendation */
export type InterviewRecommendation =
  | "strong_hire"
  | "hire"
  | "no_decision"
  | "no_hire"
  | "strong_no_hire";

/**
 * Interview feedback from interviewer.
 */
export interface InterviewFeedback extends TenantScopedEntity {
  /** Interview ID */
  interviewId: UUID;
  /** Candidate ID */
  candidateId: UUID;
  /** Interviewer user ID */
  interviewerId: UUID;
  /** Overall rating */
  overallRating: InterviewRating;
  /** Recommendation */
  recommendation: InterviewRecommendation;
  /** Competency ratings */
  competencyRatings?: Array<{
    competency: string;
    rating: InterviewRating;
    notes?: string;
  }>;
  /** Strengths */
  strengths?: string;
  /** Areas for improvement */
  areasForImprovement?: string;
  /** Overall comments */
  comments?: string;
  /** Submitted timestamp */
  submittedAt: TimestampString;
  /** Is feedback private (visible only to recruiting team) */
  isPrivate: boolean;
}

// =============================================================================
// Offer Types
// =============================================================================

/** Offer status */
export type OfferStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn"
  | "countered";

/**
 * Job offer.
 */
export interface Offer extends TenantScopedEntity {
  /** Candidate ID */
  candidateId: UUID;
  /** Requisition ID */
  requisitionId: UUID;
  /** Offer status */
  status: OfferStatus;
  /** Position ID */
  positionId?: UUID;
  /** Job title */
  title: string;
  /** Org unit ID */
  orgUnitId: UUID;
  /** Location ID */
  locationId?: UUID;
  /** Manager employee ID */
  managerId: UUID;
  /** Proposed start date */
  startDate: DateString;
  /** Employment type */
  employmentType: string;
  /** Base salary */
  baseSalary: Money;
  /** Pay frequency */
  payFrequency: string;
  /** Sign-on bonus */
  signOnBonus?: Money;
  /** Annual bonus target percentage */
  bonusTargetPercent?: number;
  /** Equity grant */
  equityGrant?: {
    type: "options" | "rsu" | "shares";
    amount: number;
    vestingSchedule: string;
  };
  /** Other benefits description */
  otherBenefits?: string;
  /** Offer letter URL */
  offerLetterUrl?: string;
  /** Expiration date */
  expiresAt: TimestampString;
  /** Sent timestamp */
  sentAt?: TimestampString;
  /** Response timestamp */
  respondedAt?: TimestampString;
  /** Decline reason */
  declineReason?: string;
  /** Counter offer details */
  counterOffer?: {
    baseSalary?: Money;
    signOnBonus?: Money;
    startDate?: DateString;
    notes?: string;
  };
  /** Approved by user ID */
  approvedBy?: UUID;
  /** Approved timestamp */
  approvedAt?: TimestampString;
  /** Created by user ID */
  createdBy: UUID;
  /** Workflow instance ID */
  workflowInstanceId?: UUID;
}

// =============================================================================
// Performance Cycle Types
// =============================================================================

/** Performance cycle status */
export type PerformanceCycleStatus =
  | "draft"
  | "active"
  | "review"
  | "calibration"
  | "closed";

/** Cycle type */
export type PerformanceCycleType =
  | "annual"
  | "semi_annual"
  | "quarterly"
  | "continuous";

/**
 * Performance cycle.
 */
export interface PerformanceCycle extends TenantScopedEntity {
  /** Cycle name */
  name: string;
  /** Description */
  description?: string;
  /** Cycle type */
  type: PerformanceCycleType;
  /** Cycle status */
  status: PerformanceCycleStatus;
  /** Review period start */
  periodStart: DateString;
  /** Review period end */
  periodEnd: DateString;
  /** Goal setting deadline */
  goalSettingDeadline?: DateString;
  /** Self-assessment start */
  selfAssessmentStart?: DateString;
  /** Self-assessment deadline */
  selfAssessmentDeadline?: DateString;
  /** Manager review start */
  managerReviewStart?: DateString;
  /** Manager review deadline */
  managerReviewDeadline?: DateString;
  /** Calibration start */
  calibrationStart?: DateString;
  /** Calibration deadline */
  calibrationDeadline?: DateString;
  /** Results release date */
  resultsReleaseDate?: DateString;
  /** Rating scale configuration */
  ratingScale: RatingScaleConfig;
  /** Competencies to evaluate */
  competencies?: string[];
  /** Included employee IDs (empty = all) */
  includedEmployeeIds?: UUID[];
  /** Excluded employee IDs */
  excludedEmployeeIds?: UUID[];
  /** Minimum tenure days to participate */
  minTenureDays?: number;
  /** Created by user ID */
  createdBy: UUID;
}

/**
 * Rating scale configuration.
 */
export interface RatingScaleConfig {
  /** Scale levels */
  levels: Array<{
    value: number;
    label: string;
    description?: string;
    color?: string;
  }>;
  /** Whether to allow half ratings */
  allowHalf: boolean;
}

// =============================================================================
// Goal Types
// =============================================================================

/** Goal status */
export type GoalStatus =
  | "draft"
  | "active"
  | "completed"
  | "cancelled"
  | "deferred";

/** Goal type */
export type GoalType = "individual" | "team" | "department" | "company";

/**
 * Performance goal.
 */
export interface Goal extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Performance cycle ID */
  cycleId?: UUID;
  /** Parent goal ID (for cascading) */
  parentGoalId?: UUID;
  /** Goal title */
  title: string;
  /** Description */
  description?: string;
  /** Goal type */
  type: GoalType;
  /** Goal status */
  status: GoalStatus;
  /** Weight (percentage) */
  weight?: number;
  /** Target value (for measurable goals) */
  targetValue?: number;
  /** Current value */
  currentValue?: number;
  /** Unit of measurement */
  unit?: string;
  /** Start date */
  startDate: DateString;
  /** Due date */
  dueDate: DateString;
  /** Completed date */
  completedAt?: TimestampString;
  /** Progress percentage */
  progressPercent: number;
  /** Key results */
  keyResults?: Array<{
    id: UUID;
    title: string;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    completed: boolean;
  }>;
  /** Alignment tags */
  alignmentTags?: string[];
  /** Visibility */
  visibility: "private" | "manager" | "team" | "public";
  /** Created by user ID */
  createdBy: UUID;
  /** Last updated by user ID */
  updatedBy: UUID;
}

// =============================================================================
// Review Types
// =============================================================================

/** Review status */
export type ReviewStatus =
  | "not_started"
  | "self_assessment_in_progress"
  | "self_assessment_complete"
  | "manager_review_in_progress"
  | "manager_review_complete"
  | "in_calibration"
  | "finalized"
  | "acknowledged";

/**
 * Performance review.
 */
export interface Review extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Reviewer (manager) employee ID */
  reviewerId: UUID;
  /** Performance cycle ID */
  cycleId: UUID;
  /** Review status */
  status: ReviewStatus;
  /** Self-assessment content */
  selfAssessment?: {
    accomplishments?: string;
    challenges?: string;
    developmentAreas?: string;
    overallComments?: string;
    submittedAt?: TimestampString;
  };
  /** Goal ratings */
  goalRatings?: Array<{
    goalId: UUID;
    selfRating?: number;
    managerRating?: number;
    managerComments?: string;
  }>;
  /** Competency ratings */
  competencyRatings?: Array<{
    competency: string;
    selfRating?: number;
    managerRating?: number;
    managerComments?: string;
  }>;
  /** Manager assessment content */
  managerAssessment?: {
    strengths?: string;
    developmentAreas?: string;
    overallComments?: string;
    submittedAt?: TimestampString;
  };
  /** Overall self rating */
  overallSelfRating?: number;
  /** Overall manager rating */
  overallManagerRating?: number;
  /** Final calibrated rating */
  finalRating?: number;
  /** Calibration notes */
  calibrationNotes?: string;
  /** Calibrated by user ID */
  calibratedBy?: UUID;
  /** Calibrated timestamp */
  calibratedAt?: TimestampString;
  /** Employee acknowledgment timestamp */
  acknowledgedAt?: TimestampString;
  /** Employee acknowledgment comments */
  acknowledgmentComments?: string;
}

// =============================================================================
// Feedback Types
// =============================================================================

/** Feedback type */
export type FeedbackType = "praise" | "constructive" | "general";

/** Feedback visibility */
export type FeedbackVisibility = "private" | "manager_visible" | "public";

/**
 * Feedback item (continuous feedback).
 */
export interface FeedbackItem extends TenantScopedEntity {
  /** Recipient employee ID */
  recipientId: UUID;
  /** Provider user ID */
  providerId: UUID;
  /** Feedback type */
  type: FeedbackType;
  /** Feedback content */
  content: string;
  /** Visibility */
  visibility: FeedbackVisibility;
  /** Associated competency */
  competency?: string;
  /** Associated goal ID */
  goalId?: UUID;
  /** Whether provider is anonymous */
  isAnonymous: boolean;
  /** Read timestamp */
  readAt?: TimestampString;
  /** Request ID (if requested feedback) */
  requestId?: UUID;
}

// =============================================================================
// Development Plan Types
// =============================================================================

/** Development plan status */
export type DevelopmentPlanStatus = "draft" | "active" | "completed" | "cancelled";

/**
 * Individual development plan.
 */
export interface DevelopmentPlan extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Plan name */
  name: string;
  /** Description */
  description?: string;
  /** Status */
  status: DevelopmentPlanStatus;
  /** Start date */
  startDate: DateString;
  /** Target completion date */
  targetDate: DateString;
  /** Completed date */
  completedAt?: TimestampString;
  /** Development areas */
  developmentAreas: string[];
  /** Development activities */
  activities: Array<{
    id: UUID;
    title: string;
    description?: string;
    type: "course" | "project" | "mentoring" | "assignment" | "other";
    targetDate?: DateString;
    completed: boolean;
    completedAt?: TimestampString;
    relatedCourseId?: UUID;
    notes?: string;
  }>;
  /** Associated review ID */
  reviewId?: UUID;
  /** Manager employee ID */
  managerId?: UUID;
  /** Manager approved timestamp */
  managerApprovedAt?: TimestampString;
  /** Progress percentage */
  progressPercent: number;
}
