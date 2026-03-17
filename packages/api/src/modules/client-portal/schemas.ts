/**
 * Client Portal Module - TypeBox Schemas
 *
 * Validation schemas for the customer-facing portal on staffora.co.uk.
 * Covers authentication, tickets, documents, news, billing, and user management.
 */

import { t } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

// =============================================================================
// Portal User Role & Status
// =============================================================================

export const PortalUserRoleSchema = t.Union([
  t.Literal("super_admin"),
  t.Literal("admin"),
  t.Literal("member"),
  t.Literal("viewer"),
]);

export const PortalUserStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("inactive"),
  t.Literal("locked"),
]);

// =============================================================================
// Auth Schemas
// =============================================================================

export const LoginSchema = t.Object({
  email: t.String({ format: "email", maxLength: 255 }),
  password: t.String({ minLength: 1, maxLength: 128 }),
  rememberMe: t.Optional(t.Boolean()),
});

export const ForgotPasswordSchema = t.Object({
  email: t.String({ format: "email", maxLength: 255 }),
});

export const ResetPasswordSchema = t.Object({
  token: t.String({ minLength: 1, maxLength: 512 }),
  newPassword: t.String({ minLength: 8, maxLength: 128 }),
});

export const LoginResponseSchema = t.Object({
  user: t.Object({
    id: UuidSchema,
    tenantId: UuidSchema,
    email: t.String(),
    firstName: t.String(),
    lastName: t.String(),
    role: PortalUserRoleSchema,
    lastLoginAt: t.Union([t.String(), t.Null()]),
  }),
});

// =============================================================================
// Ticket Status & Priority
// =============================================================================

export const TicketStatusSchema = t.Union([
  t.Literal("open"),
  t.Literal("in_progress"),
  t.Literal("awaiting_client"),
  t.Literal("awaiting_internal"),
  t.Literal("on_hold"),
  t.Literal("resolved"),
  t.Literal("reopened"),
  t.Literal("closed"),
]);

export const TicketPrioritySchema = t.Union([
  t.Literal("low"),
  t.Literal("medium"),
  t.Literal("high"),
  t.Literal("critical"),
]);

export const TicketCategorySchema = t.Union([
  t.Literal("technical"),
  t.Literal("billing"),
  t.Literal("feature_request"),
  t.Literal("bug_report"),
  t.Literal("account"),
  t.Literal("data"),
  t.Literal("integration"),
  t.Literal("training"),
  t.Literal("other"),
]);

// =============================================================================
// Ticket Schemas
// =============================================================================

export const CreateTicketSchema = t.Object({
  subject: t.String({ minLength: 1, maxLength: 200 }),
  description: t.String({ minLength: 1, maxLength: 10000 }),
  category: TicketCategorySchema,
  priority: t.Optional(TicketPrioritySchema),
});

export const UpdateTicketSchema = t.Partial(
  t.Object({
    status: TicketStatusSchema,
    priority: TicketPrioritySchema,
    category: TicketCategorySchema,
    assigneeId: t.Union([UuidSchema, t.Null()]),
  })
);

export const TicketResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  ticketNumber: t.String(),
  subject: t.String(),
  description: t.String(),
  category: t.String(),
  priority: t.String(),
  status: t.String(),
  createdById: UuidSchema,
  createdByName: t.Optional(t.String()),
  assigneeId: t.Union([UuidSchema, t.Null()]),
  assigneeName: t.Union([t.String(), t.Null()]),
  slaResponseDueAt: t.Union([t.String(), t.Null()]),
  slaResolutionDueAt: t.Union([t.String(), t.Null()]),
  firstResponseAt: t.Union([t.String(), t.Null()]),
  resolvedAt: t.Union([t.String(), t.Null()]),
  closedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const TicketMessageSchema = t.Object({
  id: UuidSchema,
  ticketId: UuidSchema,
  authorId: UuidSchema,
  authorName: t.Optional(t.String()),
  content: t.String(),
  isInternalNote: t.Boolean(),
  createdAt: t.String(),
});

export const CreateTicketMessageSchema = t.Object({
  content: t.String({ minLength: 1, maxLength: 10000 }),
  isInternalNote: t.Optional(t.Boolean()),
});

export const TicketFiltersSchema = t.Object({
  status: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  category: t.Optional(t.String()),
  assigneeId: t.Optional(UuidSchema),
  search: t.Optional(t.String()),
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});

export const TicketListResponseSchema = t.Object({
  tickets: t.Array(TicketResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Document Schemas
// =============================================================================

export const DocumentTypeSchema = t.Union([
  t.Literal("policy"),
  t.Literal("guide"),
  t.Literal("release_note"),
  t.Literal("sla"),
  t.Literal("contract"),
  t.Literal("training"),
  t.Literal("other"),
]);

export const DocumentResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  title: t.String(),
  description: t.Union([t.String(), t.Null()]),
  documentType: t.String(),
  fileName: t.Union([t.String(), t.Null()]),
  fileSize: t.Union([t.Number(), t.Null()]),
  mimeType: t.Union([t.String(), t.Null()]),
  storageUrl: t.Union([t.String(), t.Null()]),
  version: t.Number(),
  requiresAcknowledgement: t.Boolean(),
  publishedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CreateDocumentSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  description: t.Optional(t.String({ maxLength: 5000 })),
  documentType: DocumentTypeSchema,
  fileName: t.Optional(t.String({ maxLength: 255 })),
  fileSize: t.Optional(t.Number({ minimum: 0 })),
  mimeType: t.Optional(t.String({ maxLength: 100 })),
  storageUrl: t.Optional(t.String({ maxLength: 1024 })),
  requiresAcknowledgement: t.Optional(t.Boolean()),
  publishedAt: t.Optional(t.String()),
});

export const UpdateDocumentSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    description: t.String({ maxLength: 5000 }),
    documentType: DocumentTypeSchema,
    fileName: t.String({ maxLength: 255 }),
    fileSize: t.Number({ minimum: 0 }),
    mimeType: t.String({ maxLength: 100 }),
    storageUrl: t.String({ maxLength: 1024 }),
    requiresAcknowledgement: t.Boolean(),
    publishedAt: t.String(),
  })
);

export const DocumentListResponseSchema = t.Object({
  documents: t.Array(DocumentResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const DocumentAcknowledgementSchema = t.Object({
  id: UuidSchema,
  documentId: UuidSchema,
  userId: UuidSchema,
  userName: t.Optional(t.String()),
  acknowledgedAt: t.String(),
  ipAddress: t.Union([t.String(), t.Null()]),
});

// =============================================================================
// News Schemas
// =============================================================================

export const NewsStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("published"),
  t.Literal("archived"),
]);

export const NewsResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  title: t.String(),
  slug: t.String(),
  summary: t.Union([t.String(), t.Null()]),
  content: t.String(),
  authorId: UuidSchema,
  authorName: t.Optional(t.String()),
  status: t.String(),
  publishedAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CreateNewsSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 200 }),
  slug: t.String({ minLength: 1, maxLength: 200 }),
  summary: t.Optional(t.String({ maxLength: 500 })),
  content: t.String({ minLength: 1, maxLength: 50000 }),
  status: t.Optional(NewsStatusSchema),
  publishedAt: t.Optional(t.String()),
});

export const UpdateNewsSchema = t.Partial(
  t.Object({
    title: t.String({ minLength: 1, maxLength: 200 }),
    slug: t.String({ minLength: 1, maxLength: 200 }),
    summary: t.String({ maxLength: 500 }),
    content: t.String({ minLength: 1, maxLength: 50000 }),
    status: NewsStatusSchema,
    publishedAt: t.String(),
  })
);

export const NewsListResponseSchema = t.Object({
  articles: t.Array(NewsResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Billing Schemas
// =============================================================================

export const LicenseTierSchema = t.Union([
  t.Literal("starter"),
  t.Literal("professional"),
  t.Literal("enterprise"),
]);

export const LicenseStatusSchema = t.Union([
  t.Literal("active"),
  t.Literal("trial"),
  t.Literal("suspended"),
  t.Literal("cancelled"),
]);

export const LicenseResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  tier: t.String(),
  status: t.String(),
  seatCount: t.Number(),
  seatsUsed: t.Number(),
  monthlyPriceGbp: t.Number(),
  billingCycleDay: t.Number(),
  currentPeriodStart: t.String(),
  currentPeriodEnd: t.String(),
  trialEndsAt: t.Union([t.String(), t.Null()]),
  cancelledAt: t.Union([t.String(), t.Null()]),
  modules: t.Array(
    t.Object({
      moduleKey: t.String(),
      moduleName: t.String(),
      enabled: t.Boolean(),
    })
  ),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const InvoiceStatusSchema = t.Union([
  t.Literal("draft"),
  t.Literal("sent"),
  t.Literal("paid"),
  t.Literal("overdue"),
  t.Literal("void"),
  t.Literal("refunded"),
]);

export const InvoiceResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  invoiceNumber: t.String(),
  status: t.String(),
  issuedAt: t.String(),
  dueAt: t.String(),
  paidAt: t.Union([t.String(), t.Null()]),
  subtotalGbp: t.Number(),
  vatGbp: t.Number(),
  totalGbp: t.Number(),
  currency: t.String(),
  lines: t.Array(
    t.Object({
      id: UuidSchema,
      description: t.String(),
      quantity: t.Number(),
      unitPriceGbp: t.Number(),
      totalGbp: t.Number(),
    })
  ),
  createdAt: t.String(),
});

export const InvoiceListResponseSchema = t.Object({
  invoices: t.Array(InvoiceResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

export const PaymentMethodResponseSchema = t.Object({
  id: UuidSchema,
  type: t.String(),
  last4: t.Union([t.String(), t.Null()]),
  expiryMonth: t.Union([t.Number(), t.Null()]),
  expiryYear: t.Union([t.Number(), t.Null()]),
  brand: t.Union([t.String(), t.Null()]),
  isDefault: t.Boolean(),
});

// =============================================================================
// User Management Schemas (Admin)
// =============================================================================

export const CreateUserSchema = t.Object({
  email: t.String({ format: "email", maxLength: 255 }),
  firstName: t.String({ minLength: 1, maxLength: 100 }),
  lastName: t.String({ minLength: 1, maxLength: 100 }),
  role: PortalUserRoleSchema,
  password: t.String({ minLength: 8, maxLength: 128 }),
});

export const UpdateUserSchema = t.Partial(
  t.Object({
    firstName: t.String({ minLength: 1, maxLength: 100 }),
    lastName: t.String({ minLength: 1, maxLength: 100 }),
    role: PortalUserRoleSchema,
    isActive: t.Boolean(),
  })
);

export const UserResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  email: t.String(),
  firstName: t.String(),
  lastName: t.String(),
  role: t.String(),
  isActive: t.Boolean(),
  lastLoginAt: t.Union([t.String(), t.Null()]),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const UserListResponseSchema = t.Object({
  users: t.Array(UserResponseSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
  hasMore: t.Boolean(),
});

// =============================================================================
// Dashboard Schemas
// =============================================================================

export const DashboardResponseSchema = t.Object({
  openTickets: t.Number(),
  awaitingClientTickets: t.Number(),
  unreadNews: t.Number(),
  unacknowledgedDocuments: t.Number(),
  license: t.Union([
    t.Object({
      tier: t.String(),
      status: t.String(),
      seatsUsed: t.Number(),
      seatCount: t.Number(),
      currentPeriodEnd: t.String(),
    }),
    t.Null(),
  ]),
  recentTickets: t.Array(
    t.Object({
      id: UuidSchema,
      ticketNumber: t.String(),
      subject: t.String(),
      status: t.String(),
      priority: t.String(),
      updatedAt: t.String(),
    })
  ),
});

// =============================================================================
// Exported Types
// =============================================================================

export type PortalUserRole = typeof PortalUserRoleSchema.static;
export type TicketStatus = typeof TicketStatusSchema.static;
export type TicketPriority = typeof TicketPrioritySchema.static;
export type TicketCategory = typeof TicketCategorySchema.static;
export type DocumentType = typeof DocumentTypeSchema.static;
export type NewsStatus = typeof NewsStatusSchema.static;
export type LicenseTier = typeof LicenseTierSchema.static;
export type LicenseStatus = typeof LicenseStatusSchema.static;
export type InvoiceStatus = typeof InvoiceStatusSchema.static;

export type LoginInput = typeof LoginSchema.static;
export type ForgotPasswordInput = typeof ForgotPasswordSchema.static;
export type ResetPasswordInput = typeof ResetPasswordSchema.static;
export type CreateTicketInput = typeof CreateTicketSchema.static;
export type UpdateTicketInput = typeof UpdateTicketSchema.static;
export type CreateTicketMessageInput = typeof CreateTicketMessageSchema.static;
export type CreateDocumentInput = typeof CreateDocumentSchema.static;
export type UpdateDocumentInput = typeof UpdateDocumentSchema.static;
export type CreateNewsInput = typeof CreateNewsSchema.static;
export type UpdateNewsInput = typeof UpdateNewsSchema.static;
export type CreateUserInput = typeof CreateUserSchema.static;
export type UpdateUserInput = typeof UpdateUserSchema.static;
