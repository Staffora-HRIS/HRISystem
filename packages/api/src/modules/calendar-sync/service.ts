/**
 * Calendar Sync Module - Service Layer
 *
 * Business logic for calendar connection management and iCal feed generation.
 * The iCal feed generates RFC 5545-compliant VCALENDAR output containing
 * the user's approved and pending leave requests.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  CalendarSyncRepository,
  type CalendarConnectionRow,
  type IcalConnectionInfo,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import type {
  CalendarConnectionResponse,
  IcalEnableResponse,
} from "./schemas";

// =============================================================================
// Constants
// =============================================================================

/** Product identifier for VCALENDAR PRODID field */
const ICAL_PRODID = "-//Staffora//HRIS Calendar//EN";

/** Calendar display name */
const ICAL_CALNAME = "Staffora Leave Calendar";

// =============================================================================
// Mappers
// =============================================================================

function mapConnectionToResponse(
  row: CalendarConnectionRow
): CalendarConnectionResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    user_id: row.userId,
    provider: row.provider as "google" | "outlook" | "ical",
    calendar_id: row.calendarId,
    sync_enabled: row.syncEnabled,
    last_synced_at: row.lastSyncedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function mapConnectionToIcalResponse(
  row: CalendarConnectionRow,
  baseUrl: string
): IcalEnableResponse {
  return {
    id: row.id,
    provider: "ical",
    sync_enabled: row.syncEnabled,
    feed_url: `${baseUrl}/api/v1/calendar/ical/${row.icalToken}`,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// =============================================================================
// iCal Generation Helpers
// =============================================================================

/**
 * Generate a cryptographically secure hex token for iCal feed URLs.
 * 32 random bytes = 64 hex characters.
 */
function generateIcalToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Format a date string (YYYY-MM-DD) as iCal VALUE=DATE format (YYYYMMDD).
 */
function formatIcalDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

/**
 * Format a Date object as iCal DTSTAMP (UTC timestamp): YYYYMMDDTHHmmSSZ
 */
function formatIcalTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Increment a date string (YYYY-MM-DD) by one day.
 * iCal DTEND for VALUE=DATE is exclusive, so for an inclusive end_date
 * we need to add 1 day.
 */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Fold long lines per RFC 5545 Section 3.1:
 * Lines longer than 75 octets should be folded by inserting CRLF + space.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    parts.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return parts.join("\r\n");
}

// =============================================================================
// Service
// =============================================================================

export class CalendarSyncService {
  constructor(
    private repository: CalendarSyncRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  /**
   * List all calendar connections for the current user
   */
  async listConnections(
    ctx: TenantContext,
    userId: string
  ): Promise<CalendarConnectionResponse[]> {
    const rows = await this.repository.listConnections(ctx, userId);
    return rows.map(mapConnectionToResponse);
  }

  /**
   * Enable iCal feed for the current user.
   * Generates a unique token and creates a calendar_connections record.
   * If one already exists, returns the existing connection.
   */
  async enableIcalFeed(
    ctx: TenantContext,
    userId: string,
    baseUrl: string
  ): Promise<ServiceResult<IcalEnableResponse>> {
    // Check if an iCal connection already exists
    const existing = await this.repository.getConnectionByProvider(
      ctx,
      userId,
      "ical"
    );

    if (existing) {
      return {
        success: true,
        data: mapConnectionToIcalResponse(existing, baseUrl),
      };
    }

    // Generate a unique token and create the connection
    const icalToken = generateIcalToken();

    const connection = await this.db.withTransaction(ctx, async (tx) => {
      const conn = await this.repository.createIcalConnection(
        ctx,
        userId,
        icalToken,
        tx
      );

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'calendar_connection',
          ${conn.id},
          'calendar.ical.enabled',
          ${JSON.stringify({ connectionId: conn.id, userId, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return conn;
    });

    return {
      success: true,
      data: mapConnectionToIcalResponse(connection, baseUrl),
    };
  }

  /**
   * Regenerate the iCal feed token. Invalidates the previous URL.
   */
  async regenerateIcalToken(
    ctx: TenantContext,
    userId: string,
    baseUrl: string
  ): Promise<ServiceResult<IcalEnableResponse>> {
    const newToken = generateIcalToken();

    const connection = await this.db.withTransaction(ctx, async (tx) => {
      const conn = await this.repository.updateIcalToken(
        ctx,
        userId,
        newToken,
        tx
      );

      if (!conn) {
        return null;
      }

      // Write outbox event in same transaction
      await tx`
        INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
        VALUES (
          ${crypto.randomUUID()},
          ${ctx.tenantId},
          'calendar_connection',
          ${conn.id},
          'calendar.ical.token_regenerated',
          ${JSON.stringify({ connectionId: conn.id, userId, actor: ctx.userId })}::jsonb,
          now()
        )
      `;

      return conn;
    });

    if (!connection) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message:
            "No iCal feed is currently enabled. Enable it first with POST /calendar/ical/enable.",
        },
      };
    }

    return {
      success: true,
      data: mapConnectionToIcalResponse(connection, baseUrl),
    };
  }

  /**
   * Disable the iCal feed by removing the connection.
   */
  async disableIcalFeed(
    ctx: TenantContext,
    userId: string
  ): Promise<ServiceResult<{ deleted: boolean }>> {
    const deleted = await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getConnectionByProvider(
        ctx,
        userId,
        "ical"
      );

      if (!existing) return false;

      const success = await this.repository.deleteIcalConnection(
        ctx,
        userId,
        tx
      );

      if (success) {
        await tx`
          INSERT INTO domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
          VALUES (
            ${crypto.randomUUID()},
            ${ctx.tenantId},
            'calendar_connection',
            ${existing.id},
            'calendar.ical.disabled',
            ${JSON.stringify({ connectionId: existing.id, userId, actor: ctx.userId })}::jsonb,
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
          message: "No iCal feed is currently enabled.",
        },
      };
    }

    return { success: true, data: { deleted: true } };
  }

  // ===========================================================================
  // iCal Feed Generation
  // ===========================================================================

  /**
   * Generate an RFC 5545 iCal feed for the given token.
   *
   * This is the core function serving GET /calendar/ical/:token.
   * It runs without authentication (the token IS the credential).
   *
   * Returns null if the token is invalid or the connection is disabled.
   */
  async generateIcalFeed(
    icalToken: string
  ): Promise<ServiceResult<string>> {
    // 1. Look up the connection by token (system context)
    const info: IcalConnectionInfo | null =
      await this.repository.getConnectionByIcalToken(icalToken);

    if (!info) {
      return {
        success: false,
        error: {
          code: ErrorCodes.NOT_FOUND,
          message: "Invalid or expired calendar feed token.",
        },
      };
    }

    if (!info.syncEnabled) {
      return {
        success: false,
        error: {
          code: ErrorCodes.FORBIDDEN,
          message: "This calendar feed has been disabled.",
        },
      };
    }

    if (!info.employeeId) {
      // User exists but has no active employee record
      return {
        success: true,
        data: this.buildEmptyCalendar(),
      };
    }

    // 2. Fetch leave events
    const events = await this.repository.getLeaveEventsForEmployee(
      info.tenantId,
      info.employeeId
    );

    // 3. Build the VCALENDAR
    const now = new Date();
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${ICAL_PRODID}`,
      `X-WR-CALNAME:${ICAL_CALNAME}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      // Suggest a 1-hour refresh interval for subscribing calendar apps
      "X-PUBLISHED-TTL:PT1H",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ];

    for (const evt of events) {
      const statusPrefix =
        evt.status === "pending" ? "[Pending] " : "";
      const summary = `${statusPrefix}${evt.leaveTypeName}`;

      // Determine time description
      let description = `${evt.leaveTypeName} (${evt.duration} day${Number(evt.duration) !== 1 ? "s" : ""})`;
      if (evt.startHalfDay) {
        description += " - starts half-day (PM only)";
      }
      if (evt.endHalfDay) {
        description += " - ends half-day (AM only)";
      }
      if (evt.status === "pending") {
        description += " [Awaiting approval]";
      }

      // iCal VALUE=DATE: DTEND is exclusive, so add 1 day to inclusive end_date
      const dtStart = formatIcalDate(evt.startDate);
      const dtEnd = formatIcalDate(nextDay(evt.endDate));
      const dtstamp = formatIcalTimestamp(now);

      // Use leave request ID as UID for stable identity
      const uid = `${evt.id}@staffora.co.uk`;

      lines.push("BEGIN:VEVENT");
      lines.push(foldLine(`UID:${uid}`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(foldLine(`SUMMARY:${summary}`));
      lines.push(foldLine(`DESCRIPTION:${description}`));
      lines.push("STATUS:CONFIRMED");
      lines.push("TRANSP:OPAQUE");
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsContent = lines.join("\r\n") + "\r\n";

    // 4. Update last_synced_at (fire-and-forget, non-blocking)
    this.repository.updateLastSynced(info.connectionId).catch(() => {
      // Swallow errors — updating last_synced_at is not critical
    });

    return { success: true, data: icsContent };
  }

  /**
   * Build a minimal empty calendar for users with no employee record.
   */
  private buildEmptyCalendar(): string {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:${ICAL_PRODID}`,
      `X-WR-CALNAME:${ICAL_CALNAME}`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-PUBLISHED-TTL:PT1H",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "END:VCALENDAR",
    ];
    return lines.join("\r\n") + "\r\n";
  }
}
