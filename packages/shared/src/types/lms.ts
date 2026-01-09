/**
 * Learning Management System Types
 *
 * Type definitions for courses, modules, assessments, learning paths,
 * assignments, completions, certificates, and skills.
 */

import type {
  UUID,
  DateString,
  TimestampString,
  TenantScopedEntity,
} from "./common";

// =============================================================================
// Course Types
// =============================================================================

/** Course status */
export type CourseStatus = "draft" | "published" | "archived" | "retired";

/** Course format */
export type CourseFormat =
  | "online"
  | "classroom"
  | "blended"
  | "virtual_classroom"
  | "self_paced"
  | "webinar"
  | "video";

/** Content type */
export type ContentType =
  | "video"
  | "document"
  | "scorm"
  | "html"
  | "quiz"
  | "assignment"
  | "external_link"
  | "live_session";

/**
 * Course definition.
 */
export interface Course extends TenantScopedEntity {
  /** Course code */
  code: string;
  /** Course title */
  title: string;
  /** Short description */
  shortDescription?: string;
  /** Full description */
  description?: string;
  /** Course status */
  status: CourseStatus;
  /** Course format */
  format: CourseFormat;
  /** Estimated duration in minutes */
  durationMinutes: number;
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /** Banner image URL */
  bannerUrl?: string;
  /** Course level */
  level?: "beginner" | "intermediate" | "advanced";
  /** Language code */
  language: string;
  /** Provider/vendor */
  provider?: string;
  /** External course URL */
  externalUrl?: string;
  /** Categories/tags */
  categories?: string[];
  /** Skills taught */
  skillIds?: UUID[];
  /** Competencies addressed */
  competencies?: string[];
  /** Prerequisites (course IDs) */
  prerequisiteIds?: UUID[];
  /** Whether certificate is issued */
  certificateEnabled: boolean;
  /** Certificate template ID */
  certificateTemplateId?: UUID;
  /** Whether course has expiration */
  hasExpiration: boolean;
  /** Expiration period in days */
  expirationDays?: number;
  /** Maximum attempts allowed */
  maxAttempts?: number;
  /** Passing score percentage */
  passingScore?: number;
  /** Published timestamp */
  publishedAt?: TimestampString;
  /** Published by user ID */
  publishedBy?: UUID;
  /** Version number */
  version: number;
  /** Created by user ID */
  createdBy: UUID;
  /** Average rating */
  averageRating?: number;
  /** Total ratings count */
  ratingsCount: number;
  /** Total enrollments */
  enrollmentsCount: number;
  /** Total completions */
  completionsCount: number;
}

/**
 * Course module (section/chapter).
 */
export interface CourseModule extends TenantScopedEntity {
  /** Course ID */
  courseId: UUID;
  /** Module title */
  title: string;
  /** Description */
  description?: string;
  /** Display order */
  sortOrder: number;
  /** Estimated duration in minutes */
  durationMinutes: number;
  /** Whether module is required */
  isRequired: boolean;
  /** Content items in this module */
  contentItems: ContentItem[];
  /** Unlock rules */
  unlockRules?: {
    type: "sequential" | "date" | "manual";
    unlockDate?: DateString;
    prerequisiteModuleIds?: UUID[];
  };
}

/**
 * Content item within a module.
 */
export interface ContentItem {
  /** Item ID */
  id: UUID;
  /** Item title */
  title: string;
  /** Content type */
  type: ContentType;
  /** Description */
  description?: string;
  /** Display order */
  sortOrder: number;
  /** Duration in minutes */
  durationMinutes?: number;
  /** Whether item is required */
  isRequired: boolean;
  /** Content URL or reference */
  contentUrl?: string;
  /** SCORM package details */
  scormPackage?: {
    entryPoint: string;
    version: "1.2" | "2004";
    masteryScore?: number;
  };
  /** Video details */
  videoDetails?: {
    provider: "internal" | "youtube" | "vimeo" | "wistia";
    videoId: string;
    duration: number;
  };
  /** Document details */
  documentDetails?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
  /** Quiz ID (if quiz type) */
  assessmentId?: UUID;
}

// =============================================================================
// Assessment Types
// =============================================================================

/** Assessment type */
export type AssessmentType = "quiz" | "exam" | "survey" | "practical";

/** Question type */
export type QuestionType =
  | "multiple_choice"
  | "multiple_select"
  | "true_false"
  | "short_answer"
  | "essay"
  | "matching"
  | "ordering"
  | "fill_blank";

/**
 * Assessment definition.
 */
export interface Assessment extends TenantScopedEntity {
  /** Course ID */
  courseId: UUID;
  /** Assessment title */
  title: string;
  /** Description */
  description?: string;
  /** Assessment type */
  type: AssessmentType;
  /** Time limit in minutes (0 = no limit) */
  timeLimitMinutes: number;
  /** Passing score percentage */
  passingScore: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Whether to randomize questions */
  randomizeQuestions: boolean;
  /** Number of questions to show (if randomizing) */
  questionsToShow?: number;
  /** Whether to show correct answers after */
  showCorrectAnswers: boolean;
  /** When to show correct answers */
  showAnswersWhen: "immediately" | "after_submit" | "after_deadline" | "never";
  /** Questions */
  questions: AssessmentQuestion[];
  /** Total points */
  totalPoints: number;
}

/**
 * Assessment question.
 */
export interface AssessmentQuestion {
  /** Question ID */
  id: UUID;
  /** Question type */
  type: QuestionType;
  /** Question text */
  text: string;
  /** Question explanation */
  explanation?: string;
  /** Points for this question */
  points: number;
  /** Display order */
  sortOrder: number;
  /** Options (for choice questions) */
  options?: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    feedback?: string;
  }>;
  /** Correct answer (for text questions) */
  correctAnswer?: string;
  /** Acceptable answers (for short answer) */
  acceptableAnswers?: string[];
  /** Matching pairs (for matching questions) */
  matchingPairs?: Array<{
    left: string;
    right: string;
  }>;
  /** Correct order (for ordering questions) */
  correctOrder?: string[];
  /** Required */
  isRequired: boolean;
}

// =============================================================================
// Learning Path Types
// =============================================================================

/** Learning path status */
export type LearningPathStatus = "draft" | "published" | "archived";

/**
 * Learning path (curriculum).
 */
export interface LearningPath extends TenantScopedEntity {
  /** Path code */
  code: string;
  /** Path title */
  title: string;
  /** Description */
  description?: string;
  /** Status */
  status: LearningPathStatus;
  /** Thumbnail URL */
  thumbnailUrl?: string;
  /** Estimated total duration in minutes */
  totalDurationMinutes: number;
  /** Categories */
  categories?: string[];
  /** Target roles */
  targetRoles?: string[];
  /** Skills developed */
  skillIds?: UUID[];
  /** Path items */
  items: LearningPathItem[];
  /** Certificate enabled */
  certificateEnabled: boolean;
  /** Certificate template ID */
  certificateTemplateId?: UUID;
  /** Published timestamp */
  publishedAt?: TimestampString;
  /** Published by */
  publishedBy?: UUID;
  /** Created by */
  createdBy: UUID;
}

/**
 * Learning path item.
 */
export interface LearningPathItem {
  /** Item ID */
  id: UUID;
  /** Item type */
  type: "course" | "assessment" | "external" | "milestone";
  /** Course ID (if course type) */
  courseId?: UUID;
  /** Assessment ID (if assessment type) */
  assessmentId?: UUID;
  /** Title (for external/milestone) */
  title?: string;
  /** Description */
  description?: string;
  /** External URL */
  externalUrl?: string;
  /** Display order */
  sortOrder: number;
  /** Whether item is required */
  isRequired: boolean;
  /** Estimated duration */
  durationMinutes?: number;
  /** Unlock rules */
  unlockRules?: {
    type: "sequential" | "date" | "manual";
    unlockDate?: DateString;
    prerequisiteItemIds?: string[];
  };
}

// =============================================================================
// Assignment Types
// =============================================================================

/** Learning assignment status */
export type LearningAssignmentStatus =
  | "assigned"
  | "not_started"
  | "in_progress"
  | "completed"
  | "failed"
  | "expired"
  | "waived";

/** Assignment source */
export type AssignmentSource =
  | "manual"
  | "manager"
  | "system"
  | "rule"
  | "onboarding"
  | "development_plan";

/**
 * Learning path assignment.
 */
export interface PathAssignment extends TenantScopedEntity {
  /** Learning path ID */
  learningPathId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Assignment status */
  status: LearningAssignmentStatus;
  /** Assignment source */
  source: AssignmentSource;
  /** Assigned by user ID */
  assignedBy?: UUID;
  /** Assigned timestamp */
  assignedAt: TimestampString;
  /** Due date */
  dueDate?: DateString;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Progress percentage */
  progressPercent: number;
  /** Items progress */
  itemsProgress: Array<{
    itemId: UUID;
    status: LearningAssignmentStatus;
    startedAt?: TimestampString;
    completedAt?: TimestampString;
  }>;
  /** Is mandatory */
  isMandatory: boolean;
  /** Certificate ID (if earned) */
  certificateId?: UUID;
  /** Notes */
  notes?: string;
}

/**
 * Course assignment.
 */
export interface CourseAssignment extends TenantScopedEntity {
  /** Course ID */
  courseId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Assignment status */
  status: LearningAssignmentStatus;
  /** Assignment source */
  source: AssignmentSource;
  /** Parent path assignment ID (if part of path) */
  pathAssignmentId?: UUID;
  /** Assigned by user ID */
  assignedBy?: UUID;
  /** Assigned timestamp */
  assignedAt: TimestampString;
  /** Due date */
  dueDate?: DateString;
  /** Started timestamp */
  startedAt?: TimestampString;
  /** Completed timestamp */
  completedAt?: TimestampString;
  /** Progress percentage */
  progressPercent: number;
  /** Time spent in minutes */
  timeSpentMinutes: number;
  /** Last accessed timestamp */
  lastAccessedAt?: TimestampString;
  /** Current module ID */
  currentModuleId?: UUID;
  /** Current content item ID */
  currentContentItemId?: UUID;
  /** Final score (if applicable) */
  finalScore?: number;
  /** Attempt number */
  attemptNumber: number;
  /** Is mandatory */
  isMandatory: boolean;
  /** Certificate ID (if earned) */
  certificateId?: UUID;
  /** Expiration date */
  expiresAt?: DateString;
  /** Notes */
  notes?: string;
}

// =============================================================================
// Completion Types
// =============================================================================

/**
 * Course completion record.
 */
export interface Completion extends TenantScopedEntity {
  /** Assignment ID */
  assignmentId: UUID;
  /** Course ID */
  courseId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Completion timestamp */
  completedAt: TimestampString;
  /** Final score */
  score?: number;
  /** Passed */
  passed: boolean;
  /** Time spent in minutes */
  timeSpentMinutes: number;
  /** Certificate ID */
  certificateId?: UUID;
  /** Expiration date */
  expiresAt?: DateString;
  /** Attempt number */
  attemptNumber: number;
}

/**
 * Learning certificate.
 */
export interface Certificate extends TenantScopedEntity {
  /** Certificate number */
  certificateNumber: string;
  /** Employee ID */
  employeeId: UUID;
  /** Course ID (if course certificate) */
  courseId?: UUID;
  /** Learning path ID (if path certificate) */
  learningPathId?: UUID;
  /** Certificate title */
  title: string;
  /** Issue date */
  issuedAt: TimestampString;
  /** Expiration date */
  expiresAt?: DateString;
  /** Certificate URL */
  certificateUrl?: string;
  /** Verification code */
  verificationCode: string;
  /** Score achieved */
  score?: number;
  /** Is revoked */
  isRevoked: boolean;
  /** Revoked reason */
  revokedReason?: string;
  /** Revoked timestamp */
  revokedAt?: TimestampString;
}

// =============================================================================
// Skill Types
// =============================================================================

/** Skill category */
export type SkillCategory =
  | "technical"
  | "soft"
  | "leadership"
  | "industry"
  | "certification"
  | "language"
  | "other";

/** Proficiency level */
export type ProficiencyLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "expert";

/**
 * Skill definition.
 */
export interface Skill extends TenantScopedEntity {
  /** Skill name */
  name: string;
  /** Description */
  description?: string;
  /** Category */
  category: SkillCategory;
  /** Parent skill ID (for hierarchy) */
  parentId?: UUID;
  /** Whether skill is active */
  isActive: boolean;
  /** Whether skill is verified through assessment */
  requiresVerification: boolean;
  /** Related course IDs */
  relatedCourseIds?: UUID[];
  /** Sort order */
  sortOrder: number;
}

/**
 * Employee skill record.
 */
export interface EmployeeSkill extends TenantScopedEntity {
  /** Employee ID */
  employeeId: UUID;
  /** Skill ID */
  skillId: UUID;
  /** Proficiency level */
  proficiencyLevel: ProficiencyLevel;
  /** Self-assessed level */
  selfAssessedLevel?: ProficiencyLevel;
  /** Manager-assessed level */
  managerAssessedLevel?: ProficiencyLevel;
  /** Verified through assessment */
  isVerified: boolean;
  /** Verification date */
  verifiedAt?: TimestampString;
  /** Verified by course completion ID */
  verifiedByCompletionId?: UUID;
  /** Years of experience */
  experienceYears?: number;
  /** Last used date */
  lastUsedDate?: DateString;
  /** Notes */
  notes?: string;
  /** Endorsed by employee IDs */
  endorsedBy?: UUID[];
  /** Endorsement count */
  endorsementCount: number;
}

// =============================================================================
// Course Rating Types
// =============================================================================

/**
 * Course rating/review.
 */
export interface CourseRating extends TenantScopedEntity {
  /** Course ID */
  courseId: UUID;
  /** Employee ID */
  employeeId: UUID;
  /** Completion ID */
  completionId: UUID;
  /** Rating (1-5) */
  rating: number;
  /** Review text */
  review?: string;
  /** Is anonymous */
  isAnonymous: boolean;
  /** Is approved (for moderation) */
  isApproved: boolean;
  /** Submitted timestamp */
  submittedAt: TimestampString;
}

// =============================================================================
// Catalog Types
// =============================================================================

/**
 * Learning catalog for organizing content.
 */
export interface LearningCatalog extends TenantScopedEntity {
  /** Catalog name */
  name: string;
  /** Description */
  description?: string;
  /** Is default catalog */
  isDefault: boolean;
  /** Included course IDs */
  courseIds: UUID[];
  /** Included learning path IDs */
  learningPathIds: UUID[];
  /** Target audience (org unit IDs, empty = all) */
  audienceOrgUnitIds?: UUID[];
  /** Target roles */
  audienceRoles?: string[];
  /** Is active */
  isActive: boolean;
}
