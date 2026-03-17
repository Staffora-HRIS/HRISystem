/**
 * Client Portal Module - TypeBox Schemas
 *
 * Validation schemas for the customer-facing portal on staffora.co.uk.
 * Covers tickets, documents, news, billing, and user management.
 *
 * Auth schemas (Login, ForgotPassword, ResetPassword) have been removed.
 * Authentication is now handled by BetterAuth at /api/auth/*.
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
// Portal Me Response (replaces LoginResponseSchema)
// =============================================================================

export const PortalMeResponseSchema = t.Object({
  user: t.Object({
    id: UuidSchema,
    tenantId: UuidSchema,
    userId: UuidSchema,
    email: t.String(),
    firstName: t.String(),
    lastName: t.String(),
    avatarUrl: t.Union([t.String(), t.Null()]),
    role: t.String(),
    isActive: t.Boolean(),
    lastLoginAt: t.Union([t.String(), t.Null()]),
    createdAt: t.String(),
    updatedAt: t.String(),
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
  t.Literal("bug_report"),
  t.Literal("feature_request"),
  t.Literal("billing_inquiry"),
  t.Literal("account_issue"),
  t.Literal("data_request"),
  t.Literal("integration_help"),
  t.Literal("general_question"),
  t.Literal("urgent_issue"),
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
  createdBy: UuidSchema,
  createdByName: t.Optional(t.String()),
  assignedTo: t.Union([UuidSchema, t.Null()]),
  assignedToName: t.Union([t.String(), t.Null()]),
  slaDueAt: t.Union([t.String(), t.Null()]),
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
  message: t.String(),
  isInternalNote: t.Boolean(),
  attachments: t.Array(t.Any()),
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
  category: t.String(),
  fileName: t.Union([t.String(), t.Null()]),
  fileSize: t.Union([t.Number(), t.Null()]),
  mimeType: t.Union([t.String(), t.Null()]),
  storagePath: t.Union([t.String(), t.Null()]),
  version: t.Number(),
  previousVersionId: t.Union([UuidSchema, t.Null()]),
  isPublished: t.Boolean(),
  publishedAt: t.Union([t.String(), t.Null()]),
  publishedBy: t.Union([UuidSchema, t.Null()]),
  visibility: t.String(),
  downloadCount: t.Number(),
  requiresAcknowledgement: t.Boolean(),
  createdBy: t.Union([UuidSchema, t.Null()]),
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
  category: t.Union([t.String(), t.Null()]),
  severity: t.Union([t.String(), t.Null()]),
  isPinned: t.Boolean(),
  isPublished: t.Boolean(),
  publishedAt: t.Union([t.String(), t.Null()]),
  publishedBy: t.Union([UuidSchema, t.Null()]),
  coverImageUrl: t.Union([t.String(), t.Null()]),
  tags: t.Array(t.String()),
  viewCount: t.Number(),
  createdBy: UuidSchema,
  createdByName: t.Optional(t.String()),
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
  t.Literal("expired"),
]);

export const LicenseResponseSchema = t.Object({
  id: UuidSchema,
  tenantId: UuidSchema,
  planTier: t.String(),
  status: t.String(),
  employeeLimit: t.Number(),
  storageLimitGb: t.Number(),
  adminLimit: t.Number(),
  currentPeriodStart: t.String(),
  currentPeriodEnd: t.String(),
  trialEndsAt: t.Union([t.String(), t.Null()]),
  autoRenew: t.Boolean(),
  modules: t.Array(
    t.Object({
      moduleKey: t.String(),
      isEnabled: t.Boolean(),
      pricePerMonth: t.Union([t.Number(), t.Null()]),
      pricePerYear: t.Union([t.Number(), t.Null()]),
      addedAt: t.String(),
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
  licenseId: t.Union([UuidSchema, t.Null()]),
  periodStart: t.Union([t.String(), t.Null()]),
  periodEnd: t.Union([t.String(), t.Null()]),
  subtotal: t.Number(),
  taxRate: t.Number(),
  taxAmount: t.Number(),
  total: t.Number(),
  currency: t.String(),
  status: t.String(),
  dueDate: t.String(),
  paidAt: t.Union([t.String(), t.Null()]),
  paymentMethod: t.Union([t.String(), t.Null()]),
  paymentReference: t.Union([t.String(), t.Null()]),
  pdfUrl: t.Union([t.String(), t.Null()]),
  notes: t.Union([t.String(), t.Null()]),
  lines: t.Array(
    t.Object({
      id: UuidSchema,
      tenantId: UuidSchema,
      invoiceId: UuidSchema,
      description: t.String(),
      moduleKey: t.Union([t.String(), t.Null()]),
      quantity: t.Number(),
      unitPrice: t.Number(),
      lineTotal: t.Number(),
      createdAt: t.String(),
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
  cardLastFour: t.Union([t.String(), t.Null()]),
  cardBrand: t.Union([t.String(), t.Null()]),
  cardExpMonth: t.Union([t.Number(), t.Null()]),
  cardExpYear: t.Union([t.Number(), t.Null()]),
  bankName: t.Union([t.String(), t.Null()]),
  accountLastFour: t.Union([t.String(), t.Null()]),
  billingEmail: t.Union([t.String(), t.Null()]),
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
      planTier: t.String(),
      status: t.String(),
      employeeLimit: t.Number(),
      storageLimitGb: t.Number(),
      adminLimit: t.Number(),
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

export type CreateTicketInput = typeof CreateTicketSchema.static;
export type UpdateTicketInput = typeof UpdateTicketSchema.static;
export type CreateTicketMessageInput = typeof CreateTicketMessageSchema.static;
export type CreateDocumentInput = typeof CreateDocumentSchema.static;
export type UpdateDocumentInput = typeof UpdateDocumentSchema.static;
export type CreateNewsInput = typeof CreateNewsSchema.static;
export type UpdateNewsInput = typeof UpdateNewsSchema.static;
export type CreateUserInput = typeof CreateUserSchema.static;
export type UpdateUserInput = typeof UpdateUserSchema.static;
