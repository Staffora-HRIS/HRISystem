/**
 * Announcements Module - Service Layer
 *
 * Business logic for announcement management.
 * Admin operations: full CRUD with outbox events.
 * Employee operations: filtered read of published, non-expired announcements.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  AnnouncementsRepository,
  type AnnouncementRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  AnnouncementFilters,
  PaginationQuery,
  AnnouncementResponse,
  CreateAnnouncement,
  UpdateAnnouncement,
} from "./schemas";

// =============================================================================
// Mappers
// =============================================================================

function mapAnnouncementToResponse(row: AnnouncementRow): AnnouncementResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    title: row.title,
    content: row.content,
    priority: row.priority as "info" | "important" | "urgent",
    published_at: row.publishedAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    author_id: row.authorId,
    author_name: row.authorName ?? null,
    target_departments: Array.isArray(row.targetDepartments)
      ? row.targetDepartments
      : [],
    target_roles: Array.isArray(row.targetRoles) ? row.targetRoles : [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// Service
// =============================================================================

export class AnnouncementsService {
  constructor(
    private repository: AnnouncementsRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Admin Operations
  // ===========================================================================

  /**
   * List all announcements (admin view)
   */
  async listAnnouncements(
    ctx: TenantContext,
    filters: AnnouncementFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AnnouncementResponse>> {
    const result = await this.repository.listAnnouncements(
      ctx,
      filters,
      pagination
    );

    return {
      items: result.items.map(mapAnnouncementToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get a single announcement by ID
   */
  async getAnnouncement(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AnnouncementResponse>> {
    const announcement = await this.repository.getAnnouncementById(ctx, id);

    if (!announcement) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Announcement not found",
        },
      };
    }

    return { success: true, data: mapAnnouncementToResponse(announcement) };
  }

  /**
   * Create a new announcement with outbox event
   */
  async createAnnouncement(
    ctx: TenantContext,
    data: CreateAnnouncement
  ): Promise<ServiceResult<AnnouncementResponse>> {
    // Validate expiry > published if both set
    if (data.published_at && data.expires_at) {
      const publishDate = new Date(data.published_at);
      const expiryDate = new Date(data.expires_at);
      if (expiryDate <= publishDate) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Expiry date must be after the publish date",
          },
        };
      }
    }

    const announcement = await this.db.withTransaction(ctx, async (tx) => {
      const created = await this.repository.createAnnouncement(
        ctx,
        { ...data, authorId: ctx.userId! },
        tx
      );

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'announcement',
          ${created.id},
          'announcement.created',
          ${JSON.stringify({
            announcementId: created.id,
            title: created.title,
            priority: created.priority,
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return created;
    });

    return { success: true, data: mapAnnouncementToResponse(announcement) };
  }

  /**
   * Update an existing announcement with outbox event
   */
  async updateAnnouncement(
    ctx: TenantContext,
    id: string,
    data: UpdateAnnouncement
  ): Promise<ServiceResult<AnnouncementResponse>> {
    // Validate expiry > published if both would be set
    if (data.published_at && data.expires_at) {
      const publishDate = new Date(data.published_at);
      const expiryDate = new Date(data.expires_at);
      if (expiryDate <= publishDate) {
        return {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Expiry date must be after the publish date",
          },
        };
      }
    }

    const announcement = await this.db.withTransaction(ctx, async (tx) => {
      const updated = await this.repository.updateAnnouncement(
        ctx,
        id,
        data,
        tx
      );

      if (!updated) {
        return null;
      }

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'announcement',
          ${id},
          'announcement.updated',
          ${JSON.stringify({
            announcementId: id,
            changes: Object.keys(data),
            actor: ctx.userId,
          })}::jsonb,
          now()
        )
      `;

      return updated;
    });

    if (!announcement) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Announcement not found",
        },
      };
    }

    return { success: true, data: mapAnnouncementToResponse(announcement) };
  }

  /**
   * Delete an announcement with outbox event
   */
  async deleteAnnouncement(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const deleted = await this.db.withTransaction(ctx, async (tx) => {
      const success = await this.repository.deleteAnnouncement(ctx, id, tx);

      if (success) {
        // Write outbox event in same transaction
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'announcement',
            ${id},
            'announcement.deleted',
            ${JSON.stringify({ announcementId: id, actor: ctx.userId })}::jsonb,
            now()
          )
        `;
      }

      return success;
    });

    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Announcement not found",
        },
      };
    }

    return { success: true, data: { deleted: true } };
  }

  /**
   * Publish an announcement immediately (set published_at to now)
   */
  async publishAnnouncement(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AnnouncementResponse>> {
    return this.updateAnnouncement(ctx, id, {
      published_at: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // Employee-Facing Operations
  // ===========================================================================

  /**
   * List active announcements visible to an employee
   */
  async listActiveAnnouncements(
    ctx: TenantContext,
    options: {
      departmentId?: string;
      roleNames?: string[];
      limit?: number;
      cursor?: string;
    }
  ): Promise<PaginatedResult<AnnouncementResponse>> {
    const result = await this.repository.listActiveAnnouncements(ctx, options);

    return {
      items: result.items.map(mapAnnouncementToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }
}
