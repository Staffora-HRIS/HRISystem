/**
 * Client Portal Module - Repository Layer
 *
 * Database operations for the customer-facing portal.
 * Auth operations (sessions, passwords, login tracking) have been removed.
 * Authentication is now handled by BetterAuth.
 *
 * Portal user lookup by BetterAuth user_id uses withSystemContext (pre-tenant).
 * All other queries use withTransaction with tenant context (post-authentication).
 */

import type { TransactionSql } from "postgres";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Portal user profile. No longer contains password_hash or auth fields.
 * Links to BetterAuth via the user_id column.
 */
export interface PortalUser {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalTicket {
  id: string;
  tenantId: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdBy: string;
  createdByName?: string;
  assignedTo: string | null;
  assignedToName?: string | null;
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalTicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName?: string;
  message: string;
  isInternalNote: boolean;
  attachments: unknown[];
  createdAt: Date;
}

export interface PortalDocument {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storagePath: string | null;
  version: number;
  previousVersionId: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
  publishedBy: string | null;
  visibility: string;
  downloadCount: number;
  requiresAcknowledgement: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentAcknowledgement {
  id: string;
  documentId: string;
  userId: string;
  userName?: string;
  acknowledgedAt: Date;
  ipAddress: string | null;
}

export interface NewsArticle {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  category: string | null;
  severity: string | null;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: Date | null;
  publishedBy: string | null;
  coverImageUrl: string | null;
  tags: string[];
  viewCount: number;
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalLicense {
  id: string;
  tenantId: string;
  planTier: string;
  employeeLimit: number;
  storageLimitGb: number;
  adminLimit: number;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseModule {
  moduleKey: string;
  isEnabled: boolean;
  pricePerMonth: number | null;
  pricePerYear: number | null;
  addedAt: Date;
}

export interface PortalInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  licenseId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: string;
  dueDate: Date;
  paidAt: Date | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  pdfUrl: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface InvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  description: string;
  moduleKey: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: Date;
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  type: string;
  isDefault: boolean;
  cardLastFour: string | null;
  cardBrand: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  bankName: string | null;
  accountLastFour: string | null;
  billingEmail: string | null;
  billingAddress: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class ClientPortalRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Portal User Lookup (System Context - no tenant RLS)
  // ===========================================================================

  /**
   * Find portal user profile by BetterAuth user_id.
   * Uses system context because this runs before tenant context is established.
   */
  async findPortalProfileByUserId(userId: string): Promise<PortalUser | null> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        SELECT pu.id, pu.tenant_id, pu.user_id, u.email,
               pu.first_name, pu.last_name, pu.avatar_url,
               pu.role, pu.is_active, pu.last_login_at,
               pu.created_at, pu.updated_at
        FROM app.portal_users pu
        JOIN app.users u ON u.id = pu.user_id
        WHERE pu.user_id = ${userId}::uuid
        LIMIT 1
      `;
    });
    if (rows.length === 0) return null;
    return this.mapUserRow(rows[0]);
  }

  /**
   * Update last_login_at for a portal user.
   */
  async updateLastLogin(portalUserId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_users
        SET last_login_at = now(), updated_at = now()
        WHERE id = ${portalUserId}::uuid
      `;
    });
  }

  // ===========================================================================
  // Ticket Operations (Tenant Context)
  // ===========================================================================

  async listTickets(
    ctx: TenantContext,
    filters: {
      status?: string;
      priority?: string;
      category?: string;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<PortalTicket>> {
    const limit = pagination.limit ?? 20;

    const tickets = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            t.*,
            cu.first_name || ' ' || cu.last_name as created_by_name,
            au.first_name || ' ' || au.last_name as assigned_to_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by
          LEFT JOIN app.portal_users au ON au.id = t.assigned_to
          WHERE t.tenant_id = ${ctx.tenantId}::uuid
            AND t.created_by = ${ctx.userId}::uuid
            ${filters.status ? tx`AND t.status = ${filters.status}` : tx``}
            ${filters.priority ? tx`AND t.priority = ${filters.priority}` : tx``}
            ${filters.category ? tx`AND t.category = ${filters.category}` : tx``}
            ${filters.search ? tx`AND (t.subject ILIKE ${"%" + filters.search + "%"} OR t.ticket_number ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND t.created_at < (SELECT created_at FROM app.portal_tickets WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY t.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = tickets.length > limit;
    const items = hasMore ? tickets.slice(0, limit) : tickets;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapTicketRow),
      nextCursor,
      hasMore,
    };
  }

  async listAllTickets(
    ctx: TenantContext,
    filters: {
      status?: string;
      priority?: string;
      category?: string;
      assigneeId?: string;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<PortalTicket>> {
    const limit = pagination.limit ?? 20;

    const tickets = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            t.*,
            cu.first_name || ' ' || cu.last_name as created_by_name,
            au.first_name || ' ' || au.last_name as assigned_to_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by
          LEFT JOIN app.portal_users au ON au.id = t.assigned_to
          WHERE t.tenant_id = ${ctx.tenantId}::uuid
            ${filters.status ? tx`AND t.status = ${filters.status}` : tx``}
            ${filters.priority ? tx`AND t.priority = ${filters.priority}` : tx``}
            ${filters.category ? tx`AND t.category = ${filters.category}` : tx``}
            ${filters.assigneeId ? tx`AND t.assigned_to = ${filters.assigneeId}::uuid` : tx``}
            ${filters.search ? tx`AND (t.subject ILIKE ${"%" + filters.search + "%"} OR t.ticket_number ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND t.created_at < (SELECT created_at FROM app.portal_tickets WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY
            CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            t.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = tickets.length > limit;
    const items = hasMore ? tickets.slice(0, limit) : tickets;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapTicketRow),
      nextCursor,
      hasMore,
    };
  }

  async getTicketById(
    ctx: TenantContext,
    id: string
  ): Promise<PortalTicket | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            t.*,
            cu.first_name || ' ' || cu.last_name as created_by_name,
            au.first_name || ' ' || au.last_name as assigned_to_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by
          LEFT JOIN app.portal_users au ON au.id = t.assigned_to
          WHERE t.id = ${id}::uuid AND t.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapTicketRow(rows[0]) : null;
  }

  async createTicket(
    ctx: TenantContext,
    data: {
      ticketNumber: string;
      subject: string;
      description: string;
      category: string;
      priority: string;
      slaResponseDueAt: Date;
      slaResolutionDueAt: Date;
    },
    txOverride?: TransactionSql
  ): Promise<PortalTicket> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_tickets (
          id, tenant_id, ticket_number, subject, description,
          category, priority, status, created_by,
          sla_due_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.ticketNumber},
          ${data.subject}, ${data.description},
          ${data.category}, ${data.priority}, 'open', ${ctx.userId}::uuid,
          ${data.slaResponseDueAt},
          now(), now()
        )
        RETURNING *
      `;
    };

    const [ticket] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapTicketRow(ticket);
  }

  async updateTicket(
    ctx: TenantContext,
    id: string,
    data: {
      status?: string;
      priority?: string;
      category?: string;
      assigneeId?: string | null;
    },
    txOverride?: TransactionSql
  ): Promise<PortalTicket | null> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        UPDATE app.portal_tickets SET
          status = COALESCE(${data.status ?? null}, status),
          priority = COALESCE(${data.priority ?? null}, priority),
          category = COALESCE(${data.category ?? null}, category),
          assigned_to = CASE
            WHEN ${data.assigneeId !== undefined} THEN ${data.assigneeId ?? null}::uuid
            ELSE assigned_to
          END,
          first_response_at = CASE
            WHEN first_response_at IS NULL AND ${data.status ?? null} IS NOT NULL AND ${data.status ?? null} != 'open'
            THEN now()
            ELSE first_response_at
          END,
          resolved_at = CASE
            WHEN ${data.status ?? null} = 'resolved' AND resolved_at IS NULL THEN now()
            ELSE resolved_at
          END,
          closed_at = CASE
            WHEN ${data.status ?? null} = 'closed' AND closed_at IS NULL THEN now()
            ELSE closed_at
          END,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [ticket] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return ticket ? this.mapTicketRow(ticket) : null;
  }

  async createTicketMessage(
    ctx: TenantContext,
    ticketId: string,
    data: { content: string; isInternalNote: boolean },
    txOverride?: TransactionSql
  ): Promise<PortalTicketMessage> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_ticket_messages (
          id, tenant_id, ticket_id, author_id, message, is_internal_note, created_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${ticketId}::uuid,
          ${ctx.userId}::uuid, ${data.content}, ${data.isInternalNote}, now()
        )
        RETURNING *
      `;
    };

    const [message] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapMessageRow(message);
  }

  async listTicketMessages(
    ctx: TenantContext,
    ticketId: string,
    showInternalNotes: boolean
  ): Promise<PortalTicketMessage[]> {
    const messages = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            m.*,
            u.first_name || ' ' || u.last_name as author_name
          FROM app.portal_ticket_messages m
          LEFT JOIN app.portal_users u ON u.id = m.author_id
          WHERE m.ticket_id = ${ticketId}::uuid
            AND m.tenant_id = ${ctx.tenantId}::uuid
            ${!showInternalNotes ? tx`AND m.is_internal_note = false` : tx``}
          ORDER BY m.created_at ASC
        `;
      }
    );
    return messages.map(this.mapMessageRow);
  }

  async logTicketActivity(
    ctx: TenantContext,
    ticketId: string,
    actorId: string,
    action: string,
    oldValue?: string | null,
    newValue?: string | null,
    txOverride?: TransactionSql
  ): Promise<void> {
    const exec = async (tx: TransactionSql) => {
      await tx`
        INSERT INTO app.portal_ticket_activity_log (
          id, tenant_id, ticket_id, actor_id, action,
          old_value, new_value, created_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${ticketId}::uuid,
          ${actorId}::uuid, ${action},
          ${oldValue ?? null}, ${newValue ?? null}, now()
        )
      `;
    };

    if (txOverride) {
      await exec(txOverride);
    } else {
      await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        exec
      );
    }
  }

  // ===========================================================================
  // Document Operations (Tenant Context)
  // ===========================================================================

  async listDocuments(
    ctx: TenantContext,
    filters: { documentType?: string; search?: string },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<PortalDocument>> {
    const limit = pagination.limit ?? 20;

    const docs = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT *
          FROM app.portal_documents
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND is_published = true
            ${filters.documentType ? tx`AND category = ${filters.documentType}` : tx``}
            ${filters.search ? tx`AND (title ILIKE ${"%" + filters.search + "%"} OR description ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND created_at < (SELECT created_at FROM app.portal_documents WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapDocumentRow),
      nextCursor,
      hasMore,
    };
  }

  async getDocumentById(
    ctx: TenantContext,
    id: string
  ): Promise<PortalDocument | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_documents
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapDocumentRow(rows[0]) : null;
  }

  async createDocument(
    ctx: TenantContext,
    data: {
      title: string;
      description?: string;
      documentType: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      storageUrl?: string;
      requiresAcknowledgement?: boolean;
      publishedAt?: string;
    },
    txOverride?: TransactionSql
  ): Promise<PortalDocument> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_documents (
          id, tenant_id, title, description, category,
          file_name, file_size, mime_type, storage_path,
          version, requires_acknowledgement, is_published,
          published_at, published_by, created_by,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.title}, ${data.description ?? null}, ${data.documentType},
          ${data.fileName ?? null}, ${data.fileSize ?? null},
          ${data.mimeType ?? null}, ${data.storageUrl ?? null},
          1, ${data.requiresAcknowledgement ?? false},
          ${!!data.publishedAt},
          ${data.publishedAt ? new Date(data.publishedAt) : null},
          ${data.publishedAt ? ctx.userId : null}::uuid,
          ${ctx.userId}::uuid,
          now(), now()
        )
        RETURNING *
      `;
    };

    const [doc] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapDocumentRow(doc);
  }

  async updateDocument(
    ctx: TenantContext,
    id: string,
    data: {
      title?: string;
      description?: string;
      documentType?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
      storageUrl?: string;
      requiresAcknowledgement?: boolean;
      publishedAt?: string;
    },
    txOverride?: TransactionSql
  ): Promise<PortalDocument | null> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        UPDATE app.portal_documents SET
          title = COALESCE(${data.title ?? null}, title),
          description = COALESCE(${data.description ?? null}, description),
          category = COALESCE(${data.documentType ?? null}, category),
          file_name = COALESCE(${data.fileName ?? null}, file_name),
          file_size = COALESCE(${data.fileSize ?? null}, file_size),
          mime_type = COALESCE(${data.mimeType ?? null}, mime_type),
          storage_path = COALESCE(${data.storageUrl ?? null}, storage_path),
          requires_acknowledgement = COALESCE(${data.requiresAcknowledgement ?? null}, requires_acknowledgement),
          is_published = COALESCE(${data.publishedAt !== undefined ? !!data.publishedAt : null}, is_published),
          published_at = COALESCE(${data.publishedAt ? new Date(data.publishedAt) : null}, published_at),
          version = version + 1,
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [doc] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return doc ? this.mapDocumentRow(doc) : null;
  }

  async deleteDocument(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          DELETE FROM app.portal_documents
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id
        `;
      }
    );
    return rows.length > 0;
  }

  async acknowledgeDocument(
    ctx: TenantContext,
    documentId: string,
    userId: string,
    ipAddress: string | null
  ): Promise<void> {
    await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        await tx`
          INSERT INTO app.portal_document_acknowledgements (
            id, tenant_id, document_id, user_id, acknowledged_at, ip_address
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid,
            ${documentId}::uuid, ${userId}::uuid, now(), ${ipAddress}
          )
          ON CONFLICT (document_id, user_id) DO NOTHING
        `;
      }
    );
  }

  async getDocumentAcknowledgements(
    ctx: TenantContext,
    documentId: string
  ): Promise<DocumentAcknowledgement[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            a.*,
            u.first_name || ' ' || u.last_name as user_name
          FROM app.portal_document_acknowledgements a
          JOIN app.portal_users u ON u.id = a.user_id
          WHERE a.document_id = ${documentId}::uuid
            AND a.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY a.acknowledged_at DESC
        `;
      }
    );
    return rows.map((r: any) => ({
      id: r.id,
      documentId: r.documentId,
      userId: r.userId,
      userName: r.userName,
      acknowledgedAt: r.acknowledgedAt?.toISOString?.() ?? r.acknowledgedAt,
      ipAddress: r.ipAddress,
    }));
  }

  // ===========================================================================
  // News Operations (Tenant Context)
  // ===========================================================================

  async listNews(
    ctx: TenantContext,
    filters: { status?: string; search?: string },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<NewsArticle>> {
    const limit = pagination.limit ?? 20;

    const articles = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            n.*,
            u.first_name || ' ' || u.last_name as author_name
          FROM app.portal_news n
          LEFT JOIN app.portal_users u ON u.id = n.created_by
          WHERE n.tenant_id = ${ctx.tenantId}::uuid
            AND n.is_published = true
            AND (n.published_at IS NULL OR n.published_at <= now())
            ${filters.search ? tx`AND (n.title ILIKE ${"%" + filters.search + "%"} OR n.summary ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND n.published_at < (SELECT published_at FROM app.portal_news WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY n.published_at DESC NULLS LAST
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = articles.length > limit;
    const items = hasMore ? articles.slice(0, limit) : articles;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapNewsRow),
      nextCursor,
      hasMore,
    };
  }

  async getNewsBySlug(
    ctx: TenantContext,
    slug: string
  ): Promise<NewsArticle | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            n.*,
            u.first_name || ' ' || u.last_name as author_name
          FROM app.portal_news n
          LEFT JOIN app.portal_users u ON u.id = n.created_by
          WHERE n.slug = ${slug}
            AND n.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapNewsRow(rows[0]) : null;
  }

  async createNews(
    ctx: TenantContext,
    data: {
      title: string;
      slug: string;
      summary?: string;
      content: string;
      status?: string;
      publishedAt?: string;
    },
    txOverride?: TransactionSql
  ): Promise<NewsArticle> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_news (
          id, tenant_id, title, slug, summary, content,
          created_by, is_published, published_at, published_by, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.title}, ${data.slug}, ${data.summary ?? null}, ${data.content},
          ${ctx.userId}::uuid, ${data.status === "published"},
          ${data.publishedAt ? new Date(data.publishedAt) : data.status === "published" ? new Date() : null},
          ${data.status === "published" ? ctx.userId : null}::uuid,
          now(), now()
        )
        RETURNING *
      `;
    };

    const [article] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapNewsRow(article);
  }

  async updateNews(
    ctx: TenantContext,
    id: string,
    data: {
      title?: string;
      slug?: string;
      summary?: string;
      content?: string;
      status?: string;
      publishedAt?: string;
    },
    txOverride?: TransactionSql
  ): Promise<NewsArticle | null> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        UPDATE app.portal_news SET
          title = COALESCE(${data.title ?? null}, title),
          slug = COALESCE(${data.slug ?? null}, slug),
          summary = COALESCE(${data.summary ?? null}, summary),
          content = COALESCE(${data.content ?? null}, content),
          is_published = COALESCE(${data.status !== undefined ? data.status === "published" : null}, is_published),
          published_at = COALESCE(
            ${data.publishedAt ? new Date(data.publishedAt) : null},
            CASE WHEN ${data.status ?? null} = 'published' AND published_at IS NULL THEN now() ELSE published_at END
          ),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [article] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return article ? this.mapNewsRow(article) : null;
  }

  async deleteNews(ctx: TenantContext, id: string): Promise<boolean> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          DELETE FROM app.portal_news
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id
        `;
      }
    );
    return rows.length > 0;
  }

  async markNewsRead(userId: string, newsId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        INSERT INTO app.portal_news_read_status (
          id, user_id, news_id, read_at
        ) VALUES (
          gen_random_uuid(), ${userId}::uuid, ${newsId}::uuid, now()
        )
        ON CONFLICT (user_id, news_id) DO NOTHING
      `;
    });
  }

  async getUnreadNewsCount(
    ctx: TenantContext,
    userId: string
  ): Promise<number> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT COUNT(*) as count
          FROM app.portal_news n
          WHERE n.tenant_id = ${ctx.tenantId}::uuid
            AND n.is_published = true
            AND (n.published_at IS NULL OR n.published_at <= now())
            AND NOT EXISTS (
              SELECT 1 FROM app.portal_news_read_status r
              WHERE r.news_id = n.id AND r.user_id = ${userId}::uuid
            )
        `;
      }
    );
    return Number(rows[0]?.count ?? 0);
  }

  // ===========================================================================
  // Billing Operations (Tenant Context)
  // ===========================================================================

  async getLicense(ctx: TenantContext): Promise<PortalLicense | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_licenses
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }
    );
    return rows.length > 0 ? this.mapLicenseRow(rows[0]) : null;
  }

  async getLicenseModules(
    ctx: TenantContext,
    licenseId: string
  ): Promise<LicenseModule[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT module_key, is_enabled, price_per_month, price_per_year, added_at
          FROM app.portal_license_modules
          WHERE license_id = ${licenseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY module_key ASC
        `;
      }
    );
    return rows.map((r: any) => ({
      moduleKey: r.moduleKey,
      isEnabled: r.isEnabled,
      pricePerMonth: r.pricePerMonth != null ? Number(r.pricePerMonth) : null,
      pricePerYear: r.pricePerYear != null ? Number(r.pricePerYear) : null,
      addedAt: r.addedAt,
    }));
  }

  async listInvoices(
    ctx: TenantContext,
    filters: { status?: string },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<PortalInvoice>> {
    const limit = pagination.limit ?? 20;

    const invoices = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_invoices
          WHERE tenant_id = ${ctx.tenantId}::uuid
            ${filters.status ? tx`AND status = ${filters.status}` : tx``}
            ${pagination.cursor ? tx`AND created_at < (SELECT created_at FROM app.portal_invoices WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = invoices.length > limit;
    const items = hasMore ? invoices.slice(0, limit) : invoices;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapInvoiceRow),
      nextCursor,
      hasMore,
    };
  }

  async getInvoiceById(
    ctx: TenantContext,
    id: string
  ): Promise<PortalInvoice | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_invoices
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapInvoiceRow(rows[0]) : null;
  }

  async getInvoiceLines(
    ctx: TenantContext,
    invoiceId: string
  ): Promise<InvoiceLine[]> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_invoice_lines
          WHERE invoice_id = ${invoiceId}::uuid
          ORDER BY id ASC
        `;
      }
    );
    return rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenantId,
      invoiceId: r.invoiceId,
      description: r.description,
      moduleKey: r.moduleKey ?? null,
      quantity: Number(r.quantity),
      unitPrice: Number(r.unitPrice),
      lineTotal: Number(r.lineTotal),
      createdAt: r.createdAt,
    }));
  }

  async getPaymentMethod(
    ctx: TenantContext
  ): Promise<PaymentMethod | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT * FROM app.portal_payment_methods
          WHERE tenant_id = ${ctx.tenantId}::uuid AND is_default = true
          LIMIT 1
        `;
      }
    );
    if (rows.length === 0) return null;
    const r = rows[0] as any;
    return {
      id: r.id,
      tenantId: r.tenantId,
      type: r.type,
      isDefault: r.isDefault,
      cardLastFour: r.cardLastFour ?? null,
      cardBrand: r.cardBrand ?? null,
      cardExpMonth: r.cardExpMonth != null ? Number(r.cardExpMonth) : null,
      cardExpYear: r.cardExpYear != null ? Number(r.cardExpYear) : null,
      bankName: r.bankName ?? null,
      accountLastFour: r.accountLastFour ?? null,
      billingEmail: r.billingEmail ?? null,
      billingAddress: r.billingAddress ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  // ===========================================================================
  // User Management Operations (Tenant Context)
  // ===========================================================================

  async listUsers(
    ctx: TenantContext,
    filters: { role?: string; isActive?: boolean; search?: string },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<PortalUser>> {
    const limit = pagination.limit ?? 20;

    const users = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT pu.id, pu.tenant_id, pu.user_id, u.email,
                 pu.first_name, pu.last_name, pu.avatar_url,
                 pu.role, pu.is_active,
                 pu.last_login_at, pu.created_at, pu.updated_at
          FROM app.portal_users pu
          JOIN app.users u ON u.id = pu.user_id
          WHERE pu.tenant_id = ${ctx.tenantId}::uuid
            ${filters.role ? tx`AND pu.role = ${filters.role}` : tx``}
            ${filters.isActive !== undefined ? tx`AND pu.is_active = ${filters.isActive}` : tx``}
            ${filters.search ? tx`AND (u.email ILIKE ${"%" + filters.search + "%"} OR pu.first_name ILIKE ${"%" + filters.search + "%"} OR pu.last_name ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND pu.created_at < (SELECT created_at FROM app.portal_users WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY pu.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapUserRow),
      nextCursor,
      hasMore,
    };
  }

  async getUserById(
    ctx: TenantContext,
    id: string
  ): Promise<PortalUser | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT pu.id, pu.tenant_id, pu.user_id, u.email,
                 pu.first_name, pu.last_name, pu.avatar_url,
                 pu.role, pu.is_active,
                 pu.last_login_at, pu.created_at, pu.updated_at
          FROM app.portal_users pu
          JOIN app.users u ON u.id = pu.user_id
          WHERE pu.id = ${id}::uuid AND pu.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapUserRow(rows[0]) : null;
  }

  /**
   * Create a portal user profile linked to a BetterAuth user.
   * The BetterAuth user (app.users + app."user") must already exist.
   */
  async createUser(
    ctx: TenantContext,
    data: {
      userId: string;
      firstName: string;
      lastName: string;
      role: string;
    },
    txOverride?: TransactionSql
  ): Promise<PortalUser> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_users (
          id, tenant_id, user_id, first_name, last_name, role,
          is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.userId}::uuid,
          ${data.firstName}, ${data.lastName}, ${data.role},
          true, now(), now()
        )
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    // We need to fetch the email from app.users since portal_users no longer has it
    const emailRows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`SELECT email FROM app.users WHERE id = ${data.userId}::uuid`;
    });
    const email = emailRows[0]?.email ?? "";

    return {
      id: row.id,
      tenantId: row.tenantId ?? row.tenant_id,
      userId: row.userId ?? row.user_id ?? data.userId,
      email,
      firstName: row.firstName ?? row.first_name,
      lastName: row.lastName ?? row.last_name,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      role: row.role,
      isActive: row.isActive ?? row.is_active ?? true,
      lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
    };
  }

  async updateUser(
    ctx: TenantContext,
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: string;
      isActive?: boolean;
    },
    txOverride?: TransactionSql
  ): Promise<PortalUser | null> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        UPDATE app.portal_users SET
          first_name = COALESCE(${data.firstName ?? null}, first_name),
          last_name = COALESCE(${data.lastName ?? null}, last_name),
          role = COALESCE(${data.role ?? null}, role),
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        RETURNING *
      `;
    };

    const [row] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    if (!row) return null;

    // Fetch email from users table
    const userId = row.userId ?? row.user_id;
    const emailRows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`SELECT email FROM app.users WHERE id = ${userId}::uuid`;
    });
    const email = emailRows[0]?.email ?? "";

    return {
      id: row.id,
      tenantId: row.tenantId ?? row.tenant_id,
      userId: userId,
      email,
      firstName: row.firstName ?? row.first_name,
      lastName: row.lastName ?? row.last_name,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      role: row.role,
      isActive: row.isActive ?? row.is_active ?? false,
      lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
    };
  }

  async findUserByEmailInTenant(
    ctx: TenantContext,
    email: string
  ): Promise<PortalUser | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT pu.id, pu.tenant_id, pu.user_id, u.email,
                 pu.first_name, pu.last_name, pu.avatar_url,
                 pu.role, pu.is_active,
                 pu.last_login_at, pu.created_at, pu.updated_at
          FROM app.portal_users pu
          JOIN app.users u ON u.id = pu.user_id
          WHERE LOWER(u.email) = LOWER(${email})
            AND pu.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );
    return rows.length > 0 ? this.mapUserRow(rows[0]) : null;
  }

  // ===========================================================================
  // Dashboard Aggregation
  // ===========================================================================

  async getDashboardStats(
    ctx: TenantContext,
    userId: string,
    isAdmin: boolean
  ): Promise<{
    openTickets: number;
    awaitingClientTickets: number;
    unreadNews: number;
    unacknowledgedDocuments: number;
  }> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT
            (
              SELECT COUNT(*) FROM app.portal_tickets
              WHERE tenant_id = ${ctx.tenantId}::uuid
                AND status NOT IN ('resolved', 'closed')
                ${!isAdmin ? tx`AND created_by = ${userId}::uuid` : tx``}
            ) as open_tickets,
            (
              SELECT COUNT(*) FROM app.portal_tickets
              WHERE tenant_id = ${ctx.tenantId}::uuid
                AND status = 'awaiting_client'
                ${!isAdmin ? tx`AND created_by = ${userId}::uuid` : tx``}
            ) as awaiting_client_tickets,
            (
              SELECT COUNT(*) FROM app.portal_news n
              WHERE n.tenant_id = ${ctx.tenantId}::uuid
                AND n.is_published = true
                AND (n.published_at IS NULL OR n.published_at <= now())
                AND NOT EXISTS (
                  SELECT 1 FROM app.portal_news_read_status r
                  WHERE r.news_id = n.id AND r.user_id = ${userId}::uuid
                )
            ) as unread_news,
            (
              SELECT COUNT(*) FROM app.portal_documents d
              WHERE d.tenant_id = ${ctx.tenantId}::uuid
                AND d.requires_acknowledgement = true
                AND d.is_published = true
                AND NOT EXISTS (
                  SELECT 1 FROM app.portal_document_acknowledgements a
                  WHERE a.document_id = d.id AND a.user_id = ${userId}::uuid
                )
            ) as unacknowledged_documents
        `;
      }
    );

    const r = rows[0] as any;
    return {
      openTickets: Number(r.openTickets ?? 0),
      awaitingClientTickets: Number(r.awaitingClientTickets ?? 0),
      unreadNews: Number(r.unreadNews ?? 0),
      unacknowledgedDocuments: Number(r.unacknowledgedDocuments ?? 0),
    };
  }

  async getRecentTickets(
    ctx: TenantContext,
    userId: string,
    isAdmin: boolean,
    limit: number = 5
  ): Promise<
    Array<{
      id: string;
      ticketNumber: string;
      subject: string;
      status: string;
      priority: string;
      updatedAt: string;
    }>
  > {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT id, ticket_number, subject, status, priority, updated_at
          FROM app.portal_tickets
          WHERE tenant_id = ${ctx.tenantId}::uuid
            ${!isAdmin ? tx`AND created_by = ${userId}::uuid` : tx``}
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `;
      }
    );
    return rows.map((r: any) => ({
      id: r.id,
      ticketNumber: r.ticketNumber,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      updatedAt: r.updatedAt?.toISOString?.() ?? r.updatedAt,
    }));
  }

  // ===========================================================================
  // Row Mappers
  // ===========================================================================

  private mapTicketRow(row: any): PortalTicket {
    return {
      id: row.id,
      tenantId: row.tenantId,
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      createdBy: row.createdBy,
      createdByName: row.createdByName ?? undefined,
      assignedTo: row.assignedTo ?? null,
      assignedToName: row.assignedToName ?? null,
      slaDueAt: row.slaDueAt ?? null,
      firstResponseAt: row.firstResponseAt ?? null,
      resolvedAt: row.resolvedAt ?? null,
      closedAt: row.closedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapMessageRow(row: any): PortalTicketMessage {
    return {
      id: row.id,
      ticketId: row.ticketId,
      authorId: row.authorId,
      authorName: row.authorName ?? undefined,
      message: row.message,
      isInternalNote: row.isInternalNote,
      attachments: row.attachments ?? [],
      createdAt: row.createdAt,
    };
  }

  private mapDocumentRow(row: any): PortalDocument {
    return {
      id: row.id,
      tenantId: row.tenantId,
      title: row.title,
      description: row.description ?? null,
      category: row.category,
      fileName: row.fileName ?? null,
      fileSize: row.fileSize != null ? Number(row.fileSize) : null,
      mimeType: row.mimeType ?? null,
      storagePath: row.storagePath ?? null,
      version: Number(row.version),
      previousVersionId: row.previousVersionId ?? null,
      isPublished: row.isPublished ?? false,
      publishedAt: row.publishedAt ?? null,
      publishedBy: row.publishedBy ?? null,
      visibility: row.visibility ?? "all_clients",
      downloadCount: Number(row.downloadCount ?? 0),
      requiresAcknowledgement: row.requiresAcknowledgement ?? false,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapNewsRow(row: any): NewsArticle {
    return {
      id: row.id,
      tenantId: row.tenantId,
      title: row.title,
      slug: row.slug,
      summary: row.summary ?? null,
      content: row.content,
      category: row.category ?? null,
      severity: row.severity ?? null,
      isPinned: row.isPinned ?? false,
      isPublished: row.isPublished ?? false,
      publishedAt: row.publishedAt ?? null,
      publishedBy: row.publishedBy ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      tags: row.tags ?? [],
      viewCount: Number(row.viewCount ?? 0),
      createdBy: row.createdBy,
      createdByName: row.authorName ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapLicenseRow(row: any): PortalLicense {
    return {
      id: row.id,
      tenantId: row.tenantId,
      planTier: row.planTier,
      employeeLimit: Number(row.employeeLimit),
      storageLimitGb: Number(row.storageLimitGb),
      adminLimit: Number(row.adminLimit),
      status: row.status,
      trialEndsAt: row.trialEndsAt ?? null,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      autoRenew: row.autoRenew ?? false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapInvoiceRow(row: any): PortalInvoice {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceNumber: row.invoiceNumber,
      licenseId: row.licenseId ?? null,
      periodStart: row.periodStart ?? null,
      periodEnd: row.periodEnd ?? null,
      subtotal: Number(row.subtotal),
      taxRate: Number(row.taxRate),
      taxAmount: Number(row.taxAmount),
      total: Number(row.total),
      currency: row.currency ?? "GBP",
      status: row.status,
      dueDate: row.dueDate,
      paidAt: row.paidAt ?? null,
      paymentMethod: row.paymentMethod ?? null,
      paymentReference: row.paymentReference ?? null,
      pdfUrl: row.pdfUrl ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt,
    };
  }

  private mapUserRow(row: any): PortalUser {
    return {
      id: row.id,
      tenantId: row.tenantId ?? row.tenant_id,
      userId: row.userId ?? row.user_id ?? "",
      email: row.email ?? "",
      firstName: row.firstName ?? row.first_name,
      lastName: row.lastName ?? row.last_name,
      avatarUrl: row.avatarUrl ?? row.avatar_url ?? null,
      role: row.role,
      isActive: row.isActive ?? row.is_active ?? false,
      lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
    };
  }
}
