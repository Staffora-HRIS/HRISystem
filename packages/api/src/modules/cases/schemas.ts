/**
 * Cases Module - TypeBox Schemas
 *
 * Validation schemas for HR Case Management endpoints.
 */

import { t } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Case Status & Priority
// =============================================================================

export const CaseStatusSchema = t.Union([
  t.Literal("open"),
  t.Literal("in_progress"),
  t.Literal("pending_info"),
  t.Literal("escalated"),
  t.Literal("resolved"),
  t.Literal("appealed"),
  t.Literal("closed"),
  t.Literal("cancelled"),
]);

export const CasePrioritySchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("urgent"),
]);

export const CaseCategorySchema = t.Union([
  t.Literal("general_inquiry"),
  t.Literal("payroll"),
  t.Literal("benefits"),
  t.Literal("leave"),
  t.Literal("performance"),
  t.Literal("workplace_issue"),
  t.Literal("policy_question"),
  t.Literal("technical_support"),
  t.Literal("complaint"),
  t.Literal("other"),
]);

// =============================================================================
// Case Schemas
// =============================================================================

export const CreateCaseSchema = t.Object({
  requesterId: UuidSchema,
  category: t.String({ minLength: 1, maxLength: 50 }),
  subject: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  priority: t.Optional(CasePrioritySchema),
  assigneeId: t.Optional(UuidSchema),
  dueDate: t.Optional(t.String({ format: "date" })),
  tags: t.Optional(t.Array(t.String())),
});

export const UpdateCaseSchema = t.Partial(
  t.Object({
    subject: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ maxLength: 5000 }),
    category: t.String({ minLength: 1, maxLength: 50 }),
    priority: CasePrioritySchema,
    status: CaseStatusSchema,
    assigneeId: UuidSchema,
    resolution: t.String({ maxLength: 5000 }),
    dueDate: t.String({ format: "date" }),
    tags: t.Array(t.String()),
  })
);

export const CaseResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  caseNumber: t.String(),
  requesterId: UuidSchema,
  requesterName: t.Optional(t.String()),
  category: t.String(),
  subject: t.String(),
  description: t.Union([t.String(), t.Null()]),
  priority: CasePrioritySchema,
  status: CaseStatusSchema,
  assigneeId: t.Union([UuidSchema, t.Null()]),
  assigneeName: t.Optional(t.String()),
  resolution: t.Union([t.String(), t.Null()]),
  dueDate: t.Union([t.String(), t.Null()]),
  resolvedAt: t.Union([t.String(), t.Null()]),
  closedAt: t.Union([t.String(), t.Null()]),
  firstResponseAt: t.Union([t.String(), t.Null()]),
  slaBreached: t.Optional(t.Boolean()),
  tags: t.Optional(t.Array(t.String())),
  createdBy: UuidSchema,
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CaseFiltersSchema = t.Object({
  category: t.Optional(t.String()),
  status: t.Optional(CaseStatusSchema),
  priority: t.Optional(CasePrioritySchema),
  assigneeId: t.Optional(UuidSchema),
  requesterId: t.Optional(UuidSchema),
  isOverdue: t.Optional(t.Boolean()),
  search: t.Optional(t.String()),
});

// =============================================================================
// Case Comment Schemas
// =============================================================================

export const CreateCommentSchema = t.Object({
  content: t.String({ minLength: 1, maxLength: 5000 }),
  isInternal: t.Optional(t.Boolean()),
});

export const CommentResponseSchema = t.Object({
  id: UuidSchema,
  caseId: UuidSchema,
  authorId: UuidSchema,
  authorName: t.Optional(t.String()),
  content: t.String(),
  isInternal: t.Boolean(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

// =============================================================================
// Case Attachment Schemas
// =============================================================================

export const AttachmentResponseSchema = t.Object({
  id: UuidSchema,
  caseId: UuidSchema,
  fileName: t.String(),
  fileSize: t.Number(),
  mimeType: t.String(),
  storageUrl: t.String(),
  uploadedBy: UuidSchema,
  uploadedByName: t.Optional(t.String()),
  createdAt: t.String(),
});

// =============================================================================
// Case Assignment Schemas
// =============================================================================

export const AssignCaseSchema = t.Object({
  assigneeId: UuidSchema,
  note: t.Optional(t.String({ maxLength: 500 })),
});

export const EscalateCaseSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 500 }),
  escalateTo: t.Optional(UuidSchema),
});

export const ResolveCaseSchema = t.Object({
  resolution: t.String({ minLength: 1, maxLength: 5000 }),
});

export const CloseCaseSchema = t.Object({
  closeReason: t.Optional(t.String({ maxLength: 500 })),
  satisfactionRating: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
});

export const AppealCaseSchema = t.Object({
  reason: t.String({ minLength: 1, maxLength: 5000 }),
  appealReviewerId: t.Optional(UuidSchema),
});

export const AppealResponseSchema = t.Object({
  id: UuidSchema,
  caseId: UuidSchema,
  appealedBy: UuidSchema,
  reason: t.String(),
  reviewerId: t.Union([UuidSchema, t.Null()]),
  status: t.Union([t.Literal("pending"), t.Literal("upheld"), t.Literal("overturned"), t.Literal("partially_upheld")]),
  outcome: t.Union([t.String(), t.Null()]),
  decidedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
});

// =============================================================================
// SLA Schemas
// =============================================================================

export const SLAConfigSchema = t.Object({
  priority: CasePrioritySchema,
  firstResponseHours: t.Number({ minimum: 1 }),
  resolutionHours: t.Number({ minimum: 1 }),
});

// =============================================================================
// Analytics Schemas
// =============================================================================

export const CaseAnalyticsResponseSchema = t.Object({
  totalCases: t.Number(),
  openCases: t.Number(),
  resolvedCases: t.Number(),
  averageResolutionHours: t.Union([t.Number(), t.Null()]),
  slaBreachCount: t.Number(),
  byCategory: t.Array(
    t.Object({
      category: t.String(),
      count: t.Number(),
    })
  ),
  byPriority: t.Array(
    t.Object({
      priority: t.String(),
      count: t.Number(),
    })
  ),
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

export const CaseListResponseSchema = t.Object({
  items: t.Array(CaseResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const CommentListResponseSchema = t.Object({
  items: t.Array(CommentResponseSchema),
  count: t.Number(),
});

// Export types
export type CaseStatus = typeof CaseStatusSchema.static;
export type CasePriority = typeof CasePrioritySchema.static;
export type CreateCase = typeof CreateCaseSchema.static;
export type UpdateCase = typeof UpdateCaseSchema.static;
export type CaseResponse = typeof CaseResponseSchema.static;
export type CreateComment = typeof CreateCommentSchema.static;
export type CommentResponse = typeof CommentResponseSchema.static;
