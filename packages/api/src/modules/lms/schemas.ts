/**
 * LMS Module - TypeBox Schemas
 *
 * Validation schemas for Learning Management System endpoints.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });
export const DateSchema = t.String({ format: "date" });

// =============================================================================
// Course Schemas
// =============================================================================

export const CourseStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("published"),
  t.Literal("archived"),
]);

export const ContentTypeSchema = t.Union([
  t.Literal("video"),
  t.Literal("document"),
  t.Literal("scorm"),
  t.Literal("link"),
  t.Literal("quiz"),
]);

export const CreateCourseSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String({ maxLength: 100 })),
  durationMinutes: t.Optional(t.Number({ minimum: 1 })),
  contentType: t.Optional(ContentTypeSchema),
  contentUrl: t.Optional(t.String({ maxLength: 500 })),
  thumbnailUrl: t.Optional(t.String({ maxLength: 500 })),
  passingScore: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  isRequired: t.Optional(t.Boolean()),
  tags: t.Optional(t.Array(t.String())),
});

export const UpdateCourseSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ maxLength: 2000 }),
    category: t.String({ maxLength: 100 }),
    durationMinutes: t.Number({ minimum: 1 }),
    contentType: ContentTypeSchema,
    contentUrl: t.String({ maxLength: 500 }),
    thumbnailUrl: t.String({ maxLength: 500 }),
    passingScore: t.Number({ minimum: 0, maximum: 100 }),
    isRequired: t.Boolean(),
    status: CourseStatusSchema,
    tags: t.Array(t.String()),
  })
);

export const CourseResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  category: t.Union([t.String(), t.Null()]),
  durationMinutes: t.Union([t.Number(), t.Null()]),
  contentType: t.Union([ContentTypeSchema, t.Null()]),
  contentUrl: t.Union([t.String(), t.Null()]),
  thumbnailUrl: t.Union([t.String(), t.Null()]),
  passingScore: t.Union([t.Number(), t.Null()]),
  isRequired: t.Boolean(),
  status: CourseStatusSchema,
  enrollmentCount: t.Optional(t.Number()),
  completionCount: t.Optional(t.Number()),
  createdBy: UuidSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CourseFiltersSchema = t.Object({
  category: t.Optional(t.String()),
  status: t.Optional(CourseStatusSchema),
  contentType: t.Optional(ContentTypeSchema),
  isRequired: t.Optional(t.Boolean()),
  search: t.Optional(t.String()),
});

// =============================================================================
// Enrollment Schemas
// =============================================================================

export const EnrollmentStatusSchema = t.Union([
  t.Literal("enrolled"),
  t.Literal("in_progress"),
  t.Literal("completed"),
  t.Literal("expired"),
  t.Literal("cancelled"),
]);

export const CreateEnrollmentSchema = t.Object({
  courseId: UuidSchema,
  employeeId: UuidSchema,
  dueDate: t.Optional(DateSchema),
  assignedBy: t.Optional(UuidSchema),
});

export const BulkEnrollmentSchema = t.Object({
  courseId: UuidSchema,
  employeeIds: t.Array(UuidSchema, { minItems: 1, maxItems: 100 }),
  dueDate: t.Optional(DateSchema),
});

export const UpdateEnrollmentSchema = t.Partial(
  t.Object({
    status: EnrollmentStatusSchema,
    dueDate: DateSchema,
    progress: t.Number({ minimum: 0, maximum: 100 }),
    score: t.Number({ minimum: 0, maximum: 100 }),
  })
);

export const EnrollmentResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  courseId: UuidSchema,
  employeeId: UuidSchema,
  status: EnrollmentStatusSchema,
  enrolledAt: t.String(),
  startedAt: t.Union([t.String(), t.Null()]),
  completedAt: t.Union([t.String(), t.Null()]),
  dueDate: t.Union([t.String(), t.Null()]),
  progress: t.Number(),
  score: t.Union([t.Number(), t.Null()]),
  assignedBy: t.Union([UuidSchema, t.Null()]),
  courseTitle: t.Optional(t.String()),
  employeeName: t.Optional(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const EnrollmentFiltersSchema = t.Object({
  courseId: t.Optional(UuidSchema),
  employeeId: t.Optional(UuidSchema),
  status: t.Optional(EnrollmentStatusSchema),
  isOverdue: t.Optional(t.Boolean()),
});

// =============================================================================
// Learning Path Schemas
// =============================================================================

export const CreateLearningPathSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  courseIds: t.Array(UuidSchema, { minItems: 1 }),
  isRequired: t.Optional(t.Boolean()),
});

export const UpdateLearningPathSchema = t.Partial(
  t.Object({
    name: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ maxLength: 2000 }),
    courseIds: t.Array(UuidSchema),
    isRequired: t.Boolean(),
    status: t.Union([t.Literal("active"), t.Literal("inactive")]),
  })
);

export const LearningPathResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  name: t.String(),
  description: t.Union([t.String(), t.Null()]),
  isRequired: t.Boolean(),
  status: t.String(),
  courses: t.Optional(t.Array(CourseResponseSchema)),
  createdBy: UuidSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

// =============================================================================
// Certificate Schemas
// =============================================================================

export const CertificateResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  enrollmentId: UuidSchema,
  employeeId: UuidSchema,
  courseId: UuidSchema,
  issuedAt: t.String(),
  expiresAt: t.Union([t.String(), t.Null()]),
  certificateNumber: t.String(),
  pdfUrl: t.Union([t.String(), t.Null()]),
});

// =============================================================================
// Progress Schemas
// =============================================================================

export const UpdateProgressSchema = t.Object({
  progress: t.Number({ minimum: 0, maximum: 100 }),
  timeSpentMinutes: t.Optional(t.Number({ minimum: 0 })),
  lastPosition: t.Optional(t.String()),
});

export const CompleteEnrollmentSchema = t.Object({
  score: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
  timeSpentMinutes: t.Optional(t.Number({ minimum: 0 })),
});

// =============================================================================
// Analytics Schemas
// =============================================================================

export const CourseAnalyticsResponseSchema = t.Object({
  courseId: UuidSchema,
  totalEnrollments: t.Number(),
  completedCount: t.Number(),
  inProgressCount: t.Number(),
  averageScore: t.Union([t.Number(), t.Null()]),
  averageCompletionDays: t.Union([t.Number(), t.Null()]),
  completionRate: t.Number(),
});

export const EmployeeLearningResponseSchema = t.Object({
  employeeId: UuidSchema,
  totalEnrollments: t.Number(),
  completedCount: t.Number(),
  inProgressCount: t.Number(),
  overdueCount: t.Number(),
  averageScore: t.Union([t.Number(), t.Null()]),
});

// =============================================================================
// Pagination & Common Schemas
// =============================================================================

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});

export const IdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.String(),
});

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String()),
});

// =============================================================================
// List Response Schemas
// =============================================================================

export const CourseListResponseSchema = t.Object({
  items: t.Array(CourseResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const EnrollmentListResponseSchema = t.Object({
  items: t.Array(EnrollmentResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Compliance Report Schemas
// =============================================================================

export const MandatoryCourseComplianceSchema = t.Object({
  courseId: UuidSchema,
  courseName: t.String(),
  category: t.Union([t.String(), t.Null()]),
  isMandatory: t.Boolean(),
  mandatoryDueDays: t.Union([t.Number(), t.Null()]),
  totalAssigned: t.Number(),
  completedCount: t.Number(),
  inProgressCount: t.Number(),
  notStartedCount: t.Number(),
  overdueCount: t.Number(),
  completionRate: t.Number(),
});

export const DepartmentComplianceSchema = t.Object({
  orgUnitId: UuidSchema,
  orgUnitName: t.String(),
  totalAssigned: t.Number(),
  completedCount: t.Number(),
  inProgressCount: t.Number(),
  notStartedCount: t.Number(),
  overdueCount: t.Number(),
  completionRate: t.Number(),
});

export const ComplianceReportResponseSchema = t.Object({
  generatedAt: t.String(),
  summary: t.Object({
    totalMandatoryCourses: t.Number(),
    totalAssignments: t.Number(),
    totalCompleted: t.Number(),
    totalInProgress: t.Number(),
    totalNotStarted: t.Number(),
    totalOverdue: t.Number(),
    overallCompletionRate: t.Number(),
  }),
  courses: t.Array(MandatoryCourseComplianceSchema),
  departments: t.Array(DepartmentComplianceSchema),
});

export const ComplianceReportQuerySchema = t.Object({
  courseId: t.Optional(UuidSchema),
  orgUnitId: t.Optional(UuidSchema),
  includeArchived: t.Optional(t.String()),
});

// Export types
export type CreateCourse = typeof CreateCourseSchema.static;
export type UpdateCourse = typeof UpdateCourseSchema.static;
export type CourseResponse = typeof CourseResponseSchema.static;
export type CreateEnrollment = typeof CreateEnrollmentSchema.static;
export type UpdateEnrollment = typeof UpdateEnrollmentSchema.static;
export type EnrollmentResponse = typeof EnrollmentResponseSchema.static;
export type CreateLearningPath = typeof CreateLearningPathSchema.static;
export type LearningPathResponse = typeof LearningPathResponseSchema.static;
export type ComplianceReport = typeof ComplianceReportResponseSchema.static;
export type MandatoryCourseCompliance = typeof MandatoryCourseComplianceSchema.static;
export type DepartmentCompliance = typeof DepartmentComplianceSchema.static;
