/**
 * Client Portal Module - Repository Layer
 *
 * Database operations for the customer-facing portal.
 * Auth queries use withSystemContext (pre-authentication).
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

export interface PortalUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  passwordHash: string;
  isActive: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalSession {
  id: string;
  userId: string;
  tenantId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  lastActivityAt: Date;
  createdAt: Date;
}

export interface PasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
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
  createdById: string;
  createdByName?: string;
  assigneeId: string | null;
  assigneeName?: string | null;
  slaResponseDueAt: Date | null;
  slaResolutionDueAt: Date | null;
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
  content: string;
  isInternalNote: boolean;
  createdAt: Date;
}

export interface PortalDocument {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  documentType: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storageUrl: string | null;
  version: number;
  requiresAcknowledgement: boolean;
  publishedAt: Date | null;
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
  authorId: string;
  authorName?: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortalLicense {
  id: string;
  tenantId: string;
  tier: string;
  status: string;
  seatCount: number;
  seatsUsed: number;
  monthlyPriceGbp: number;
  billingCycleDay: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseModule {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
}

export interface PortalInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  status: string;
  issuedAt: Date;
  dueAt: Date;
  paidAt: Date | null;
  subtotalGbp: number;
  vatGbp: number;
  totalGbp: number;
  currency: string;
  createdAt: Date;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceGbp: number;
  totalGbp: number;
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  type: string;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  brand: string | null;
  isDefault: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class ClientPortalRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Auth Operations (System Context - no tenant RLS)
  // ===========================================================================

  async findUserByEmail(email: string): Promise<PortalUser | null> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        SELECT id, tenant_id, email, first_name, last_name, role,
               password_hash, is_active, failed_login_attempts,
               locked_until, last_login_at, created_at, updated_at
        FROM app.portal_users
        WHERE LOWER(email) = LOWER(${email})
        LIMIT 1
      `;
    });
    if (rows.length === 0) return null;
    return this.mapUserRow(rows[0]);
  }

  async createSession(
    userId: string,
    tenantId: string,
    tokenHash: string,
    ipAddress: string | null,
    userAgent: string | null,
    expiresAt: Date
  ): Promise<PortalSession> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_sessions (
          id, user_id, tenant_id, token_hash, ip_address, user_agent,
          expires_at, last_activity_at, created_at
        ) VALUES (
          gen_random_uuid(), ${userId}::uuid, ${tenantId}::uuid,
          ${tokenHash}, ${ipAddress}, ${userAgent},
          ${expiresAt}, now(), now()
        )
        RETURNING *
      `;
    });
    return rows[0] as PortalSession;
  }

  async findSessionByTokenHash(
    tokenHash: string
  ): Promise<(PortalSession & { user: PortalUser }) | null> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        SELECT
          s.id as session_id,
          s.user_id, s.tenant_id, s.token_hash, s.ip_address, s.user_agent,
          s.expires_at, s.last_activity_at, s.created_at as session_created_at,
          u.id as user_id_check, u.email, u.first_name, u.last_name,
          u.role, u.password_hash, u.is_active, u.failed_login_attempts,
          u.locked_until, u.last_login_at,
          u.created_at as user_created_at, u.updated_at as user_updated_at
        FROM app.portal_sessions s
        JOIN app.portal_users u ON u.id = s.user_id
        WHERE s.token_hash = ${tokenHash}
          AND s.expires_at > now()
        LIMIT 1
      `;
    });

    if (rows.length === 0) return null;

    const r = rows[0] as any;
    return {
      id: r.sessionId ?? r.session_id,
      userId: r.userId ?? r.user_id,
      tenantId: r.tenantId ?? r.tenant_id,
      tokenHash: r.tokenHash ?? r.token_hash,
      ipAddress: r.ipAddress ?? r.ip_address,
      userAgent: r.userAgent ?? r.user_agent,
      expiresAt: r.expiresAt ?? r.expires_at,
      lastActivityAt: r.lastActivityAt ?? r.last_activity_at,
      createdAt: r.sessionCreatedAt ?? r.session_created_at,
      user: {
        id: r.userId ?? r.user_id,
        tenantId: r.tenantId ?? r.tenant_id,
        email: r.email,
        firstName: r.firstName ?? r.first_name,
        lastName: r.lastName ?? r.last_name,
        role: r.role,
        passwordHash: r.passwordHash ?? r.password_hash,
        isActive: r.isActive ?? r.is_active ?? false,
        failedLoginAttempts: r.failedLoginAttempts ?? r.failed_login_attempts ?? 0,
        lockedUntil: r.lockedUntil ?? r.locked_until ?? null,
        lastLoginAt: r.lastLoginAt ?? r.last_login_at ?? null,
        createdAt: r.userCreatedAt ?? r.user_created_at,
        updatedAt: r.userUpdatedAt ?? r.user_updated_at,
      },
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        DELETE FROM app.portal_sessions WHERE id = ${sessionId}::uuid
      `;
    });
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        DELETE FROM app.portal_sessions WHERE user_id = ${userId}::uuid
      `;
    });
  }

  async extendSession(sessionId: string, newExpiresAt: Date): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_sessions
        SET last_activity_at = now(), expires_at = ${newExpiresAt}
        WHERE id = ${sessionId}::uuid
      `;
    });
  }

  async incrementFailedLogins(
    userId: string
  ): Promise<{ failedLoginAttempts: number }> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        UPDATE app.portal_users
        SET failed_login_attempts = failed_login_attempts + 1,
            updated_at = now()
        WHERE id = ${userId}::uuid
        RETURNING failed_login_attempts
      `;
    });
    return { failedLoginAttempts: Number(rows[0]?.failedLoginAttempts ?? 0) };
  }

  async lockAccount(userId: string, until: Date): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_users
        SET locked_until = ${until}, updated_at = now()
        WHERE id = ${userId}::uuid
      `;
    });
  }

  async resetFailedLogins(userId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_users
        SET failed_login_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE id = ${userId}::uuid
      `;
    });
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_users
        SET last_login_at = now(), updated_at = now()
        WHERE id = ${userId}::uuid
      `;
    });
  }

  async createPasswordReset(
    userId: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        INSERT INTO app.portal_password_resets (
          id, user_id, token_hash, expires_at, created_at
        ) VALUES (
          gen_random_uuid(), ${userId}::uuid, ${tokenHash}, ${expiresAt}, now()
        )
      `;
    });
  }

  async findPasswordReset(tokenHash: string): Promise<PasswordReset | null> {
    const rows = await this.db.withSystemContext(async (tx: TransactionSql) => {
      return tx`
        SELECT id, user_id, token_hash, expires_at, used_at, created_at
        FROM app.portal_password_resets
        WHERE token_hash = ${tokenHash}
          AND expires_at > now()
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
    });
    return rows.length > 0 ? (rows[0] as PasswordReset) : null;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_password_resets
        SET used_at = now()
        WHERE id = ${id}::uuid
      `;
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.withSystemContext(async (tx: TransactionSql) => {
      await tx`
        UPDATE app.portal_users
        SET password_hash = ${passwordHash}, updated_at = now()
        WHERE id = ${userId}::uuid
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
            au.first_name || ' ' || au.last_name as assignee_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by_id
          LEFT JOIN app.portal_users au ON au.id = t.assignee_id
          WHERE t.tenant_id = ${ctx.tenantId}::uuid
            AND t.created_by_id = ${ctx.userId}::uuid
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
            au.first_name || ' ' || au.last_name as assignee_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by_id
          LEFT JOIN app.portal_users au ON au.id = t.assignee_id
          WHERE t.tenant_id = ${ctx.tenantId}::uuid
            ${filters.status ? tx`AND t.status = ${filters.status}` : tx``}
            ${filters.priority ? tx`AND t.priority = ${filters.priority}` : tx``}
            ${filters.category ? tx`AND t.category = ${filters.category}` : tx``}
            ${filters.assigneeId ? tx`AND t.assignee_id = ${filters.assigneeId}::uuid` : tx``}
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
            au.first_name || ' ' || au.last_name as assignee_name
          FROM app.portal_tickets t
          LEFT JOIN app.portal_users cu ON cu.id = t.created_by_id
          LEFT JOIN app.portal_users au ON au.id = t.assignee_id
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
          category, priority, status, created_by_id,
          sla_response_due_at, sla_resolution_due_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.ticketNumber},
          ${data.subject}, ${data.description},
          ${data.category}, ${data.priority}, 'open', ${ctx.userId}::uuid,
          ${data.slaResponseDueAt}, ${data.slaResolutionDueAt},
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
          assignee_id = CASE
            WHEN ${data.assigneeId !== undefined} THEN ${data.assigneeId ?? null}::uuid
            ELSE assignee_id
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
          id, tenant_id, ticket_id, author_id, content, is_internal_note, created_at
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
        INSERT INTO app.portal_ticket_activity (
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
            AND (published_at IS NOT NULL AND published_at <= now())
            ${filters.documentType ? tx`AND document_type = ${filters.documentType}` : tx``}
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
          id, tenant_id, title, description, document_type,
          file_name, file_size, mime_type, storage_url,
          version, requires_acknowledgement, published_at,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.title}, ${data.description ?? null}, ${data.documentType},
          ${data.fileName ?? null}, ${data.fileSize ?? null},
          ${data.mimeType ?? null}, ${data.storageUrl ?? null},
          1, ${data.requiresAcknowledgement ?? false},
          ${data.publishedAt ? new Date(data.publishedAt) : null},
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
          document_type = COALESCE(${data.documentType ?? null}, document_type),
          file_name = COALESCE(${data.fileName ?? null}, file_name),
          file_size = COALESCE(${data.fileSize ?? null}, file_size),
          mime_type = COALESCE(${data.mimeType ?? null}, mime_type),
          storage_url = COALESCE(${data.storageUrl ?? null}, storage_url),
          requires_acknowledgement = COALESCE(${data.requiresAcknowledgement ?? null}, requires_acknowledgement),
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
          LEFT JOIN app.portal_users u ON u.id = n.author_id
          WHERE n.tenant_id = ${ctx.tenantId}::uuid
            AND n.status = 'published'
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
          LEFT JOIN app.portal_users u ON u.id = n.author_id
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
          author_id, status, published_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.title}, ${data.slug}, ${data.summary ?? null}, ${data.content},
          ${ctx.userId}::uuid, ${data.status ?? "draft"},
          ${data.publishedAt ? new Date(data.publishedAt) : data.status === "published" ? new Date() : null},
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
          status = COALESCE(${data.status ?? null}, status),
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
        INSERT INTO app.portal_news_reads (
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
            AND n.status = 'published'
            AND (n.published_at IS NULL OR n.published_at <= now())
            AND NOT EXISTS (
              SELECT 1 FROM app.portal_news_reads r
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
          SELECT module_key, module_name, enabled
          FROM app.portal_license_modules
          WHERE license_id = ${licenseId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          ORDER BY module_name ASC
        `;
      }
    );
    return rows.map((r: any) => ({
      moduleKey: r.moduleKey,
      moduleName: r.moduleName,
      enabled: r.enabled,
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
            ${pagination.cursor ? tx`AND issued_at < (SELECT issued_at FROM app.portal_invoices WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY issued_at DESC
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
      invoiceId: r.invoiceId,
      description: r.description,
      quantity: Number(r.quantity),
      unitPriceGbp: Number(r.unitPriceGbp),
      totalGbp: Number(r.totalGbp),
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
      last4: r.last4,
      expiryMonth: r.expiryMonth != null ? Number(r.expiryMonth) : null,
      expiryYear: r.expiryYear != null ? Number(r.expiryYear) : null,
      brand: r.brand,
      isDefault: r.isDefault,
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
          SELECT id, tenant_id, email, first_name, last_name, role,
                 is_active, failed_login_attempts, locked_until,
                 last_login_at, created_at, updated_at
          FROM app.portal_users
          WHERE tenant_id = ${ctx.tenantId}::uuid
            ${filters.role ? tx`AND role = ${filters.role}` : tx``}
            ${filters.isActive !== undefined ? tx`AND is_active = ${filters.isActive}` : tx``}
            ${filters.search ? tx`AND (email ILIKE ${"%" + filters.search + "%"} OR first_name ILIKE ${"%" + filters.search + "%"} OR last_name ILIKE ${"%" + filters.search + "%"})` : tx``}
            ${pagination.cursor ? tx`AND created_at < (SELECT created_at FROM app.portal_users WHERE id = ${pagination.cursor}::uuid)` : tx``}
          ORDER BY created_at DESC
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
          SELECT id, tenant_id, email, first_name, last_name, role,
                 is_active, failed_login_attempts, locked_until,
                 last_login_at, created_at, updated_at
          FROM app.portal_users
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );
    return rows.length > 0 ? this.mapUserRow(rows[0]) : null;
  }

  async createUser(
    ctx: TenantContext,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      passwordHash: string;
    },
    txOverride?: TransactionSql
  ): Promise<PortalUser> {
    const exec = async (tx: TransactionSql) => {
      return tx`
        INSERT INTO app.portal_users (
          id, tenant_id, email, first_name, last_name, role,
          password_hash, is_active, failed_login_attempts,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.tenantId}::uuid,
          ${data.email}, ${data.firstName}, ${data.lastName}, ${data.role},
          ${data.passwordHash}, true, 0,
          now(), now()
        )
        RETURNING id, tenant_id, email, first_name, last_name, role,
                  is_active, failed_login_attempts, locked_until,
                  last_login_at, created_at, updated_at
      `;
    };

    const [user] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return this.mapUserRow(user);
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
        RETURNING id, tenant_id, email, first_name, last_name, role,
                  is_active, failed_login_attempts, locked_until,
                  last_login_at, created_at, updated_at
      `;
    };

    const [user] = txOverride
      ? await exec(txOverride)
      : await this.db.withTransaction(
          { tenantId: ctx.tenantId, userId: ctx.userId },
          exec
        );

    return user ? this.mapUserRow(user) : null;
  }

  async findUserByEmailInTenant(
    ctx: TenantContext,
    email: string
  ): Promise<PortalUser | null> {
    const rows = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx`
          SELECT id, tenant_id, email, first_name, last_name, role,
                 is_active, failed_login_attempts, locked_until,
                 last_login_at, created_at, updated_at
          FROM app.portal_users
          WHERE LOWER(email) = LOWER(${email})
            AND tenant_id = ${ctx.tenantId}::uuid
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
                ${!isAdmin ? tx`AND created_by_id = ${userId}::uuid` : tx``}
            ) as open_tickets,
            (
              SELECT COUNT(*) FROM app.portal_tickets
              WHERE tenant_id = ${ctx.tenantId}::uuid
                AND status = 'awaiting_client'
                ${!isAdmin ? tx`AND created_by_id = ${userId}::uuid` : tx``}
            ) as awaiting_client_tickets,
            (
              SELECT COUNT(*) FROM app.portal_news n
              WHERE n.tenant_id = ${ctx.tenantId}::uuid
                AND n.status = 'published'
                AND (n.published_at IS NULL OR n.published_at <= now())
                AND NOT EXISTS (
                  SELECT 1 FROM app.portal_news_reads r
                  WHERE r.news_id = n.id AND r.user_id = ${userId}::uuid
                )
            ) as unread_news,
            (
              SELECT COUNT(*) FROM app.portal_documents d
              WHERE d.tenant_id = ${ctx.tenantId}::uuid
                AND d.requires_acknowledgement = true
                AND d.published_at IS NOT NULL AND d.published_at <= now()
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
            ${!isAdmin ? tx`AND created_by_id = ${userId}::uuid` : tx``}
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
      createdById: row.createdById,
      createdByName: row.createdByName ?? undefined,
      assigneeId: row.assigneeId ?? null,
      assigneeName: row.assigneeName ?? null,
      slaResponseDueAt: row.slaResponseDueAt ?? null,
      slaResolutionDueAt: row.slaResolutionDueAt ?? null,
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
      content: row.content,
      isInternalNote: row.isInternalNote,
      createdAt: row.createdAt,
    };
  }

  private mapDocumentRow(row: any): PortalDocument {
    return {
      id: row.id,
      tenantId: row.tenantId,
      title: row.title,
      description: row.description ?? null,
      documentType: row.documentType,
      fileName: row.fileName ?? null,
      fileSize: row.fileSize != null ? Number(row.fileSize) : null,
      mimeType: row.mimeType ?? null,
      storageUrl: row.storageUrl ?? null,
      version: Number(row.version),
      requiresAcknowledgement: row.requiresAcknowledgement ?? false,
      publishedAt: row.publishedAt ?? null,
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
      authorId: row.authorId,
      authorName: row.authorName ?? undefined,
      status: row.status,
      publishedAt: row.publishedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapLicenseRow(row: any): PortalLicense {
    return {
      id: row.id,
      tenantId: row.tenantId,
      tier: row.tier,
      status: row.status,
      seatCount: Number(row.seatCount),
      seatsUsed: Number(row.seatsUsed),
      monthlyPriceGbp: Number(row.monthlyPriceGbp),
      billingCycleDay: Number(row.billingCycleDay),
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      trialEndsAt: row.trialEndsAt ?? null,
      cancelledAt: row.cancelledAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapInvoiceRow(row: any): PortalInvoice {
    return {
      id: row.id,
      tenantId: row.tenantId,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      issuedAt: row.issuedAt,
      dueAt: row.dueAt,
      paidAt: row.paidAt ?? null,
      subtotalGbp: Number(row.subtotalGbp),
      vatGbp: Number(row.vatGbp),
      totalGbp: Number(row.totalGbp),
      currency: row.currency ?? "GBP",
      createdAt: row.createdAt,
    };
  }

  private mapUserRow(row: any): PortalUser {
    return {
      id: row.id,
      tenantId: row.tenantId ?? row.tenant_id,
      email: row.email,
      firstName: row.firstName ?? row.first_name,
      lastName: row.lastName ?? row.last_name,
      role: row.role,
      passwordHash: row.passwordHash ?? row.password_hash ?? "",
      isActive: row.isActive ?? row.is_active ?? false,
      failedLoginAttempts: Number(row.failedLoginAttempts ?? row.failed_login_attempts ?? 0),
      lockedUntil: row.lockedUntil ?? row.locked_until ?? null,
      lastLoginAt: row.lastLoginAt ?? row.last_login_at ?? null,
      createdAt: row.createdAt ?? row.created_at,
      updatedAt: row.updatedAt ?? row.updated_at,
    };
  }
}
