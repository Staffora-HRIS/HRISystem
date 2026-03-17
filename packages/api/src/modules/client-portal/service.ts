/**
 * Client Portal Module - Service Layer
 *
 * Business logic for the customer-facing portal.
 * Handles authentication, ticket management with state machine,
 * document/news CRUD, billing queries, and user administration.
 */

import type { TransactionSql } from "postgres";
import {
  ClientPortalRepository,
  type TenantContext,
  type PaginationOptions,
  type PortalUser,
} from "./repository";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type { TicketStatus } from "./schemas";

// =============================================================================
// Constants
// =============================================================================

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_TTL_HOURS = 24;
const SESSION_REMEMBER_ME_DAYS = 30;
const PASSWORD_RESET_TTL_HOURS = 1;
const REOPEN_WINDOW_DAYS = 30;

/**
 * Ticket status state machine transitions.
 * Key = current status, Value = array of valid target statuses.
 */
const VALID_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "closed"],
  in_progress: [
    "awaiting_client",
    "awaiting_internal",
    "on_hold",
    "resolved",
  ],
  awaiting_client: ["in_progress"],
  awaiting_internal: ["in_progress"],
  on_hold: ["in_progress"],
  resolved: ["closed", "reopened"],
  reopened: ["in_progress"],
  closed: ["reopened"],
};

/**
 * SLA targets per priority (in hours).
 */
const SLA_TARGETS: Record<
  string,
  { firstResponseHours: number; resolutionHours: number }
> = {
  critical: { firstResponseHours: 2, resolutionHours: 8 },
  high: { firstResponseHours: 4, resolutionHours: 24 },
  medium: { firstResponseHours: 8, resolutionHours: 48 },
  low: { firstResponseHours: 24, resolutionHours: 120 }, // 5 business days ~= 120h
};

// =============================================================================
// Service
// =============================================================================

export class ClientPortalService {
  constructor(
    private repository: ClientPortalRepository,
    private db: any
  ) {}

  // ===========================================================================
  // Auth Operations
  // ===========================================================================

  async login(
    email: string,
    password: string,
    rememberMe: boolean,
    ipAddress: string | null,
    userAgent: string | null
  ): Promise<ServiceResult<{ token: string; user: Record<string, unknown> }>> {
    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      return {
        success: false,
        error: {
          code: ErrorCodes.INVALID_CREDENTIALS,
          message: "Invalid email or password",
        },
      };
    }

    if (!user.isActive) {
      return {
        success: false,
        error: {
          code: "ACCOUNT_DISABLED",
          message: "This account has been deactivated",
        },
      };
    }

    // Check lockout
    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const minutesRemaining = Math.ceil(
        (new Date(user.lockedUntil).getTime() - Date.now()) / 60000
      );
      return {
        success: false,
        error: {
          code: "ACCOUNT_LOCKED",
          message: `Account is locked. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? "" : "s"}.`,
        },
      };
    }

    // Verify password using Bun's built-in bcrypt
    const passwordValid = await Bun.password.verify(
      password,
      user.passwordHash
    );
    if (!passwordValid) {
      const { failedLoginAttempts } =
        await this.repository.incrementFailedLogins(user.id);

      if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(
          Date.now() + LOCKOUT_MINUTES * 60 * 1000
        );
        await this.repository.lockAccount(user.id, lockUntil);
        return {
          success: false,
          error: {
            code: "ACCOUNT_LOCKED",
            message: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
          },
        };
      }

      return {
        success: false,
        error: {
          code: ErrorCodes.INVALID_CREDENTIALS,
          message: "Invalid email or password",
        },
      };
    }

    // Successful login: reset failed attempts, update last login
    await this.repository.resetFailedLogins(user.id);
    await this.repository.updateLastLogin(user.id);

    // Create session
    const rawToken = crypto.randomUUID();
    const tokenHash = await this.hashToken(rawToken);
    const expiresAt = rememberMe
      ? new Date(
          Date.now() + SESSION_REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
        )
      : new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    await this.repository.createSession(
      user.id,
      user.tenantId,
      tokenHash,
      ipAddress,
      userAgent,
      expiresAt
    );

    return {
      success: true,
      data: {
        token: rawToken,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          lastLoginAt: user.lastLoginAt?.toISOString?.() ?? null,
        },
      },
    };
  }

  async logout(sessionId: string): Promise<ServiceResult<void>> {
    await this.repository.deleteSession(sessionId);
    return { success: true };
  }

  async forgotPassword(email: string): Promise<ServiceResult<void>> {
    // Always return success to prevent email enumeration
    const user = await this.repository.findUserByEmail(email);

    if (user && user.isActive) {
      const rawToken = crypto.randomUUID();
      const tokenHash = await this.hashToken(rawToken);
      const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000
      );

      await this.repository.createPasswordReset(
        user.id,
        tokenHash,
        expiresAt
      );

      // In production, send email via notification worker with the rawToken.
      // For now, we emit a domain event that can be picked up by the outbox processor.
      await this.db.withSystemContext(async (tx: TransactionSql) => {
        await this.emitDomainEventSystem(tx, user.tenantId, {
          aggregateType: "portal_user",
          aggregateId: user.id,
          eventType: "client-portal.password-reset.requested",
          payload: {
            userId: user.id,
            email: user.email,
            resetToken: rawToken,
          },
        });
      });
    }

    return { success: true };
  }

  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<ServiceResult<void>> {
    const tokenHash = await this.hashToken(token);
    const reset = await this.repository.findPasswordReset(tokenHash);

    if (!reset) {
      return {
        success: false,
        error: {
          code: ErrorCodes.BAD_REQUEST,
          message: "Invalid or expired reset token",
        },
      };
    }

    const passwordHash = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 12,
    });

    await this.repository.updatePassword(reset.userId, passwordHash);
    await this.repository.markPasswordResetUsed(reset.id);
    await this.repository.deleteUserSessions(reset.userId);

    return { success: true };
  }

  // ===========================================================================
  // Ticket Operations
  // ===========================================================================

  async listMyTickets(
    ctx: TenantContext,
    filters: {
      status?: string;
      priority?: string;
      category?: string;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listTickets(
      ctx,
      filters,
      pagination
    );
    return {
      success: true,
      data: {
        tickets: result.items.map(this.formatTicket),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
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
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listAllTickets(
      ctx,
      filters,
      pagination
    );
    return {
      success: true,
      data: {
        tickets: result.items.map(this.formatTicket),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async getTicket(
    ctx: TenantContext,
    id: string,
    userRole: string
  ): Promise<ServiceResult<any>> {
    const ticket = await this.repository.getTicketById(ctx, id);

    if (!ticket) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Ticket not found",
        },
      };
    }

    const showInternalNotes =
      userRole === "admin" || userRole === "super_admin";
    const messages = await this.repository.listTicketMessages(
      ctx,
      id,
      showInternalNotes
    );

    return {
      success: true,
      data: {
        ...this.formatTicket(ticket),
        messages: messages.map(this.formatMessage),
      },
    };
  }

  async createTicket(
    ctx: TenantContext,
    data: {
      subject: string;
      description: string;
      category: string;
      priority?: string;
    }
  ): Promise<ServiceResult<any>> {
    const priority = data.priority ?? "medium";
    const slaTarget = SLA_TARGETS[priority] ?? SLA_TARGETS.medium;
    const now = new Date();

    const ticketNumber = `TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const slaResponseDueAt = new Date(
      now.getTime() + slaTarget.firstResponseHours * 60 * 60 * 1000
    );
    const slaResolutionDueAt = new Date(
      now.getTime() + slaTarget.resolutionHours * 60 * 60 * 1000
    );

    try {
      const ticket = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createTicket(
            ctx,
            {
              ticketNumber,
              subject: data.subject,
              description: data.description,
              category: data.category,
              priority,
              slaResponseDueAt,
              slaResolutionDueAt,
            },
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_ticket",
            aggregateId: result.id,
            eventType: "client-portal.ticket.created",
            payload: {
              ticket: result,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.formatTicket(ticket) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create ticket",
        },
      };
    }
  }

  async replyToTicket(
    ctx: TenantContext,
    ticketId: string,
    message: string,
    isInternalNote: boolean
  ): Promise<ServiceResult<any>> {
    const ticket = await this.repository.getTicketById(ctx, ticketId);

    if (!ticket) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Ticket not found",
        },
      };
    }

    if (ticket.status === "closed") {
      return {
        success: false,
        error: {
          code: "TICKET_CLOSED",
          message: "Cannot reply to a closed ticket",
        },
      };
    }

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const msg = await this.repository.createTicketMessage(
            ctx,
            ticketId,
            { content: message, isInternalNote },
            tx
          );

          await this.repository.logTicketActivity(
            ctx,
            ticketId,
            ctx.userId!,
            isInternalNote ? "internal_note_added" : "reply_added",
            undefined,
            undefined,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_ticket",
            aggregateId: ticketId,
            eventType: "client-portal.ticket.reply",
            payload: {
              ticketId,
              messageId: msg.id,
              isInternalNote,
              actor: ctx.userId,
            },
          });

          return msg;
        }
      );

      return { success: true, data: this.formatMessage(result) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "REPLY_FAILED",
          message: error.message || "Failed to add reply",
        },
      };
    }
  }

  async updateTicketStatus(
    ctx: TenantContext,
    ticketId: string,
    newStatus: TicketStatus
  ): Promise<ServiceResult<any>> {
    const ticket = await this.repository.getTicketById(ctx, ticketId);

    if (!ticket) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Ticket not found",
        },
      };
    }

    const currentStatus = ticket.status as TicketStatus;
    const validTransitions = VALID_TICKET_TRANSITIONS[currentStatus] ?? [];

    if (!validTransitions.includes(newStatus)) {
      return {
        success: false,
        error: {
          code: ErrorCodes.STATE_MACHINE_VIOLATION,
          message: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
          details: { validTransitions },
        },
      };
    }

    // Enforce reopen window for closed tickets
    if (currentStatus === "closed" && newStatus === "reopened") {
      const closedAt = ticket.closedAt
        ? new Date(ticket.closedAt)
        : null;
      if (closedAt) {
        const daysSinceClosed = Math.floor(
          (Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceClosed > REOPEN_WINDOW_DAYS) {
          return {
            success: false,
            error: {
              code: ErrorCodes.STATE_MACHINE_VIOLATION,
              message: `Cannot reopen a ticket that was closed more than ${REOPEN_WINDOW_DAYS} days ago`,
            },
          };
        }
      }
    }

    try {
      const updated = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateTicket(
            ctx,
            ticketId,
            { status: newStatus },
            tx
          );

          await this.repository.logTicketActivity(
            ctx,
            ticketId,
            ctx.userId!,
            "status_changed",
            currentStatus,
            newStatus,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_ticket",
            aggregateId: ticketId,
            eventType: "client-portal.ticket.status-changed",
            payload: {
              ticketId,
              previousStatus: currentStatus,
              newStatus,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update ticket status",
          },
        };
      }

      return { success: true, data: this.formatTicket(updated) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update ticket status",
        },
      };
    }
  }

  async assignTicket(
    ctx: TenantContext,
    ticketId: string,
    assigneeId: string
  ): Promise<ServiceResult<any>> {
    const ticket = await this.repository.getTicketById(ctx, ticketId);

    if (!ticket) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Ticket not found",
        },
      };
    }

    if (ticket.status === "closed") {
      return {
        success: false,
        error: {
          code: "TICKET_CLOSED",
          message: "Cannot assign a closed ticket",
        },
      };
    }

    try {
      const updated = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateTicket(
            ctx,
            ticketId,
            { assigneeId },
            tx
          );

          await this.repository.logTicketActivity(
            ctx,
            ticketId,
            ctx.userId!,
            "assigned",
            ticket.assignedTo ?? undefined,
            assigneeId,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_ticket",
            aggregateId: ticketId,
            eventType: "client-portal.ticket.assigned",
            payload: {
              ticketId,
              previousAssignedTo: ticket.assignedTo,
              assigneeId,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to assign ticket",
          },
        };
      }

      return { success: true, data: this.formatTicket(updated) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to assign ticket",
        },
      };
    }
  }

  async updateTicketAdmin(
    ctx: TenantContext,
    ticketId: string,
    data: {
      status?: string;
      priority?: string;
      category?: string;
      assigneeId?: string | null;
    }
  ): Promise<ServiceResult<any>> {
    const ticket = await this.repository.getTicketById(ctx, ticketId);

    if (!ticket) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Ticket not found",
        },
      };
    }

    // If status is changing, validate state machine
    if (data.status && data.status !== ticket.status) {
      const currentStatus = ticket.status as TicketStatus;
      const newStatus = data.status as TicketStatus;
      const validTransitions = VALID_TICKET_TRANSITIONS[currentStatus] ?? [];

      if (!validTransitions.includes(newStatus)) {
        return {
          success: false,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
            details: { validTransitions },
          },
        };
      }

      // Enforce reopen window
      if (currentStatus === "closed" && newStatus === "reopened") {
        const closedAt = ticket.closedAt
          ? new Date(ticket.closedAt)
          : null;
        if (closedAt) {
          const daysSinceClosed = Math.floor(
            (Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceClosed > REOPEN_WINDOW_DAYS) {
            return {
              success: false,
              error: {
                code: ErrorCodes.STATE_MACHINE_VIOLATION,
                message: `Cannot reopen a ticket that was closed more than ${REOPEN_WINDOW_DAYS} days ago`,
              },
            };
          }
        }
      }
    }

    try {
      const updated = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateTicket(
            ctx,
            ticketId,
            data,
            tx
          );

          if (data.status && data.status !== ticket.status) {
            await this.repository.logTicketActivity(
              ctx,
              ticketId,
              ctx.userId!,
              "status_changed",
              ticket.status,
              data.status,
              tx
            );
          }
          if (data.priority && data.priority !== ticket.priority) {
            await this.repository.logTicketActivity(
              ctx,
              ticketId,
              ctx.userId!,
              "priority_changed",
              ticket.priority,
              data.priority,
              tx
            );
          }
          if (
            data.assigneeId !== undefined &&
            data.assigneeId !== ticket.assignedTo
          ) {
            await this.repository.logTicketActivity(
              ctx,
              ticketId,
              ctx.userId!,
              "assigned",
              ticket.assignedTo ?? undefined,
              data.assigneeId ?? undefined,
              tx
            );
          }

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_ticket",
            aggregateId: ticketId,
            eventType: "client-portal.ticket.updated",
            payload: {
              ticketId,
              changes: data,
              previousStatus: ticket.status,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!updated) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update ticket",
          },
        };
      }

      return { success: true, data: this.formatTicket(updated) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update ticket",
        },
      };
    }
  }

  // ===========================================================================
  // Document Operations
  // ===========================================================================

  async listDocuments(
    ctx: TenantContext,
    filters: { documentType?: string; search?: string },
    pagination: PaginationOptions
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listDocuments(
      ctx,
      filters,
      pagination
    );
    return {
      success: true,
      data: {
        documents: result.items.map(this.formatDocument),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async getDocument(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<any>> {
    const doc = await this.repository.getDocumentById(ctx, id);

    if (!doc) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
        },
      };
    }

    return { success: true, data: this.formatDocument(doc) };
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
    }
  ): Promise<ServiceResult<any>> {
    try {
      const doc = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createDocument(ctx, data, tx);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_document",
            aggregateId: result.id,
            eventType: "client-portal.document.created",
            payload: {
              document: result,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.formatDocument(doc) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create document",
        },
      };
    }
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
    }
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getDocumentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
        },
      };
    }

    try {
      const doc = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateDocument(
            ctx,
            id,
            data,
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_document",
            aggregateId: id,
            eventType: "client-portal.document.updated",
            payload: {
              documentId: id,
              changes: data,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      if (!doc) {
        return {
          success: false,
          error: {
            code: "UPDATE_FAILED",
            message: "Failed to update document",
          },
        };
      }

      return { success: true, data: this.formatDocument(doc) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update document",
        },
      };
    }
  }

  async deleteDocument(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const existing = await this.repository.getDocumentById(ctx, id);
    if (!existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
        },
      };
    }

    const deleted = await this.repository.deleteDocument(ctx, id);
    if (!deleted) {
      return {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: "Failed to delete document",
        },
      };
    }

    return { success: true };
  }

  async acknowledgeDocument(
    ctx: TenantContext,
    documentId: string,
    userId: string,
    ipAddress: string | null
  ): Promise<ServiceResult<void>> {
    const doc = await this.repository.getDocumentById(ctx, documentId);
    if (!doc) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Document not found",
        },
      };
    }

    if (!doc.requiresAcknowledgement) {
      return {
        success: false,
        error: {
          code: ErrorCodes.BAD_REQUEST,
          message: "This document does not require acknowledgement",
        },
      };
    }

    await this.repository.acknowledgeDocument(
      ctx,
      documentId,
      userId,
      ipAddress
    );
    return { success: true };
  }

  // ===========================================================================
  // News Operations
  // ===========================================================================

  async listNews(
    ctx: TenantContext,
    filters: { search?: string },
    pagination: PaginationOptions
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listNews(ctx, filters, pagination);
    return {
      success: true,
      data: {
        articles: result.items.map(this.formatNews),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async getNewsBySlug(
    ctx: TenantContext,
    slug: string,
    userId: string
  ): Promise<ServiceResult<any>> {
    const article = await this.repository.getNewsBySlug(ctx, slug);

    if (!article) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Article not found",
        },
      };
    }

    // Mark as read for this user
    await this.repository.markNewsRead(userId, article.id);

    return { success: true, data: this.formatNews(article) };
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
    }
  ): Promise<ServiceResult<any>> {
    try {
      const article = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createNews(ctx, data, tx);

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_news",
            aggregateId: result.id,
            eventType: "client-portal.news.created",
            payload: {
              article: result,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.formatNews(article) };
    } catch (error: any) {
      if (error.message?.includes("unique") || error.code === "23505") {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "A news article with this slug already exists",
          },
        };
      }
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create news article",
        },
      };
    }
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
    }
  ): Promise<ServiceResult<any>> {
    const existing = await this.repository.getNewsBySlug(ctx, id);
    // Try by ID instead
    let article: any = null;

    try {
      const result = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const updated = await this.repository.updateNews(ctx, id, data, tx);

          if (!updated) return null;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_news",
            aggregateId: id,
            eventType: "client-portal.news.updated",
            payload: {
              articleId: id,
              changes: data,
              actor: ctx.userId,
            },
          });

          return updated;
        }
      );

      article = result;
    } catch (error: any) {
      if (error.message?.includes("unique") || error.code === "23505") {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "A news article with this slug already exists",
          },
        };
      }
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update news article",
        },
      };
    }

    if (!article) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "News article not found",
        },
      };
    }

    return { success: true, data: this.formatNews(article) };
  }

  async deleteNews(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<void>> {
    const deleted = await this.repository.deleteNews(ctx, id);
    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "News article not found",
        },
      };
    }
    return { success: true };
  }

  // ===========================================================================
  // Billing Operations
  // ===========================================================================

  async getBillingOverview(ctx: TenantContext): Promise<ServiceResult<any>> {
    const license = await this.repository.getLicense(ctx);

    if (!license) {
      return {
        success: true,
        data: {
          license: null,
          paymentMethod: null,
        },
      };
    }

    const modules = await this.repository.getLicenseModules(
      ctx,
      license.id
    );
    const paymentMethod = await this.repository.getPaymentMethod(ctx);

    return {
      success: true,
      data: {
        license: {
          id: license.id,
          tenantId: license.tenantId,
          planTier: license.planTier,
          status: license.status,
          employeeLimit: license.employeeLimit,
          storageLimitGb: license.storageLimitGb,
          adminLimit: license.adminLimit,
          currentPeriodStart:
            license.currentPeriodStart?.toISOString?.() ??
            license.currentPeriodStart,
          currentPeriodEnd:
            license.currentPeriodEnd?.toISOString?.() ??
            license.currentPeriodEnd,
          trialEndsAt:
            license.trialEndsAt?.toISOString?.() ?? null,
          autoRenew: license.autoRenew,
          modules,
          createdAt:
            license.createdAt?.toISOString?.() ?? license.createdAt,
          updatedAt:
            license.updatedAt?.toISOString?.() ?? license.updatedAt,
        },
        paymentMethod: paymentMethod
          ? {
              id: paymentMethod.id,
              type: paymentMethod.type,
              cardLastFour: paymentMethod.cardLastFour,
              cardBrand: paymentMethod.cardBrand,
              cardExpMonth: paymentMethod.cardExpMonth,
              cardExpYear: paymentMethod.cardExpYear,
              bankName: paymentMethod.bankName,
              accountLastFour: paymentMethod.accountLastFour,
              billingEmail: paymentMethod.billingEmail,
              isDefault: paymentMethod.isDefault,
            }
          : null,
      },
    };
  }

  async listInvoices(
    ctx: TenantContext,
    filters: { status?: string },
    pagination: PaginationOptions
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listInvoices(
      ctx,
      filters,
      pagination
    );

    // Fetch lines for each invoice
    const invoicesWithLines = await Promise.all(
      result.items.map(async (inv) => {
        const lines = await this.repository.getInvoiceLines(ctx, inv.id);
        return {
          id: inv.id,
          tenantId: inv.tenantId,
          invoiceNumber: inv.invoiceNumber,
          licenseId: inv.licenseId,
          periodStart: inv.periodStart?.toISOString?.() ?? inv.periodStart ?? null,
          periodEnd: inv.periodEnd?.toISOString?.() ?? inv.periodEnd ?? null,
          subtotal: inv.subtotal,
          taxRate: inv.taxRate,
          taxAmount: inv.taxAmount,
          total: inv.total,
          currency: inv.currency,
          status: inv.status,
          dueDate: inv.dueDate?.toISOString?.() ?? inv.dueDate,
          paidAt: inv.paidAt?.toISOString?.() ?? null,
          paymentMethod: inv.paymentMethod,
          paymentReference: inv.paymentReference,
          pdfUrl: inv.pdfUrl,
          notes: inv.notes,
          lines,
          createdAt: inv.createdAt?.toISOString?.() ?? inv.createdAt,
        };
      })
    );

    return {
      success: true,
      data: {
        invoices: invoicesWithLines,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async getInvoice(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<any>> {
    const invoice = await this.repository.getInvoiceById(ctx, id);

    if (!invoice) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Invoice not found",
        },
      };
    }

    const lines = await this.repository.getInvoiceLines(ctx, id);

    return {
      success: true,
      data: {
        id: invoice.id,
        tenantId: invoice.tenantId,
        invoiceNumber: invoice.invoiceNumber,
        licenseId: invoice.licenseId,
        periodStart: invoice.periodStart?.toISOString?.() ?? invoice.periodStart ?? null,
        periodEnd: invoice.periodEnd?.toISOString?.() ?? invoice.periodEnd ?? null,
        subtotal: invoice.subtotal,
        taxRate: invoice.taxRate,
        taxAmount: invoice.taxAmount,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        dueDate: invoice.dueDate?.toISOString?.() ?? invoice.dueDate,
        paidAt: invoice.paidAt?.toISOString?.() ?? null,
        paymentMethod: invoice.paymentMethod,
        paymentReference: invoice.paymentReference,
        pdfUrl: invoice.pdfUrl,
        notes: invoice.notes,
        lines,
        createdAt: invoice.createdAt?.toISOString?.() ?? invoice.createdAt,
      },
    };
  }

  // ===========================================================================
  // User Management Operations
  // ===========================================================================

  async listUsers(
    ctx: TenantContext,
    filters: { role?: string; isActive?: boolean; search?: string },
    pagination: PaginationOptions
  ): Promise<ServiceResult<any>> {
    const result = await this.repository.listUsers(
      ctx,
      filters,
      pagination
    );
    return {
      success: true,
      data: {
        users: result.items.map(this.formatUser),
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  async getUser(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<any>> {
    const user = await this.repository.getUserById(ctx, id);

    if (!user) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "User not found",
        },
      };
    }

    return { success: true, data: this.formatUser(user) };
  }

  async createUser(
    ctx: TenantContext,
    data: {
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      password: string;
    }
  ): Promise<ServiceResult<any>> {
    // Check for duplicate email in tenant
    const existing = await this.repository.findUserByEmailInTenant(
      ctx,
      data.email
    );
    if (existing) {
      return {
        success: false,
        error: {
          code: ErrorCodes.CONFLICT,
          message: "A user with this email already exists in this account",
        },
      };
    }

    const passwordHash = await Bun.password.hash(data.password, {
      algorithm: "bcrypt",
      cost: 12,
    });

    try {
      const user = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createUser(
            ctx,
            {
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
              role: data.role,
              passwordHash,
            },
            tx
          );

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_user",
            aggregateId: result.id,
            eventType: "client-portal.user.created",
            payload: {
              userId: result.id,
              email: data.email,
              role: data.role,
              actor: ctx.userId,
            },
          });

          return result;
        }
      );

      return { success: true, data: this.formatUser(user) };
    } catch (error: any) {
      if (error.message?.includes("unique") || error.code === "23505") {
        return {
          success: false,
          error: {
            code: ErrorCodes.CONFLICT,
            message: "A user with this email already exists",
          },
        };
      }
      return {
        success: false,
        error: {
          code: "CREATE_FAILED",
          message: error.message || "Failed to create user",
        },
      };
    }
  }

  async updateUser(
    ctx: TenantContext,
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      role?: string;
      isActive?: boolean;
    }
  ): Promise<ServiceResult<any>> {
    try {
      const user = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateUser(
            ctx,
            id,
            data,
            tx
          );

          if (!result) return null;

          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "portal_user",
            aggregateId: id,
            eventType: "client-portal.user.updated",
            payload: {
              userId: id,
              changes: data,
              actor: ctx.userId,
            },
          });

          // If deactivating, invalidate their sessions
          if (data.isActive === false) {
            await this.repository.deleteUserSessions(id);
          }

          return result;
        }
      );

      if (!user) {
        return {
          success: false,
          error: {
            code: ErrorCodes.NOT_FOUND,
            message: "User not found",
          },
        };
      }

      return { success: true, data: this.formatUser(user) };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: "UPDATE_FAILED",
          message: error.message || "Failed to update user",
        },
      };
    }
  }

  // ===========================================================================
  // Dashboard
  // ===========================================================================

  async getDashboard(
    ctx: TenantContext,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<any>> {
    const isAdmin = userRole === "admin" || userRole === "super_admin";

    const [stats, recentTickets, license] = await Promise.all([
      this.repository.getDashboardStats(ctx, userId, isAdmin),
      this.repository.getRecentTickets(ctx, userId, isAdmin),
      this.repository.getLicense(ctx),
    ]);

    return {
      success: true,
      data: {
        openTickets: stats.openTickets,
        awaitingClientTickets: stats.awaitingClientTickets,
        unreadNews: stats.unreadNews,
        unacknowledgedDocuments: stats.unacknowledgedDocuments,
        license: license
          ? {
              planTier: license.planTier,
              status: license.status,
              employeeLimit: license.employeeLimit,
              storageLimitGb: license.storageLimitGb,
              adminLimit: license.adminLimit,
              currentPeriodEnd:
                license.currentPeriodEnd?.toISOString?.() ??
                license.currentPeriodEnd,
            }
          : null,
        recentTickets,
      },
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }

  private async emitDomainEventSystem(
    tx: TransactionSql,
    tenantId: string,
    event: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (
        id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at
      ) VALUES (
        gen_random_uuid(), ${tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb, now()
      )
    `;
  }

  private formatTicket(ticket: any): Record<string, unknown> {
    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      createdBy: ticket.createdBy,
      createdByName: ticket.createdByName ?? undefined,
      assignedTo: ticket.assignedTo ?? null,
      assignedToName: ticket.assignedToName ?? null,
      slaDueAt:
        ticket.slaDueAt?.toISOString?.() ??
        ticket.slaDueAt ??
        null,
      firstResponseAt:
        ticket.firstResponseAt?.toISOString?.() ??
        ticket.firstResponseAt ??
        null,
      resolvedAt:
        ticket.resolvedAt?.toISOString?.() ?? ticket.resolvedAt ?? null,
      closedAt:
        ticket.closedAt?.toISOString?.() ?? ticket.closedAt ?? null,
      createdAt:
        ticket.createdAt?.toISOString?.() ?? ticket.createdAt,
      updatedAt:
        ticket.updatedAt?.toISOString?.() ?? ticket.updatedAt,
    };
  }

  private formatMessage(msg: any): Record<string, unknown> {
    return {
      id: msg.id,
      ticketId: msg.ticketId,
      authorId: msg.authorId,
      authorName: msg.authorName ?? undefined,
      message: msg.message,
      isInternalNote: msg.isInternalNote,
      attachments: msg.attachments ?? [],
      createdAt:
        msg.createdAt?.toISOString?.() ?? msg.createdAt,
    };
  }

  private formatDocument(doc: any): Record<string, unknown> {
    return {
      id: doc.id,
      tenantId: doc.tenantId,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      storagePath: doc.storagePath,
      version: doc.version,
      previousVersionId: doc.previousVersionId ?? null,
      isPublished: doc.isPublished,
      publishedAt:
        doc.publishedAt?.toISOString?.() ?? doc.publishedAt ?? null,
      publishedBy: doc.publishedBy ?? null,
      visibility: doc.visibility,
      downloadCount: doc.downloadCount,
      requiresAcknowledgement: doc.requiresAcknowledgement,
      createdBy: doc.createdBy ?? null,
      createdAt: doc.createdAt?.toISOString?.() ?? doc.createdAt,
      updatedAt: doc.updatedAt?.toISOString?.() ?? doc.updatedAt,
    };
  }

  private formatNews(article: any): Record<string, unknown> {
    return {
      id: article.id,
      tenantId: article.tenantId,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      content: article.content,
      category: article.category ?? null,
      severity: article.severity ?? null,
      isPinned: article.isPinned,
      isPublished: article.isPublished,
      publishedAt:
        article.publishedAt?.toISOString?.() ??
        article.publishedAt ??
        null,
      publishedBy: article.publishedBy ?? null,
      coverImageUrl: article.coverImageUrl ?? null,
      tags: article.tags ?? [],
      viewCount: article.viewCount,
      createdBy: article.createdBy,
      createdByName: article.createdByName ?? undefined,
      createdAt:
        article.createdAt?.toISOString?.() ?? article.createdAt,
      updatedAt:
        article.updatedAt?.toISOString?.() ?? article.updatedAt,
    };
  }

  private formatUser(user: PortalUser): Record<string, unknown> {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt:
        user.lastLoginAt?.toISOString?.() ?? user.lastLoginAt ?? null,
      createdAt: user.createdAt?.toISOString?.() ?? user.createdAt,
      updatedAt: user.updatedAt?.toISOString?.() ?? user.updatedAt,
    };
  }
}
