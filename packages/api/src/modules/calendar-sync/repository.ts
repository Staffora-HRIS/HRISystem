/**
 * Calendar Sync Module - Repository Layer
 *
 * Database operations for calendar connections and iCal feed data.
 * All queries respect RLS through tenant context.
 * The iCal feed lookup uses system context since the request is unauthenticated.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

/** Raw DB row shape for calendar_connections (after camelCase transform) */
export interface CalendarConnectionRow extends Row {
  id: string;
  tenantId: string;
  userId: string;
  provider: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  calendarId: string | null;
  icalToken: string | null;
  syncEnabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape returned by the iCal feed query — leave data for an employee */
export interface LeaveEventRow extends Row {
  id: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  startDate: string;   // date type comes as string from postgres.js
  endDate: string;
  startHalfDay: boolean;
  endHalfDay: boolean;
  status: string;
  duration: string;    // numeric comes as string
}

/** Information about the connection owner for the iCal feed */
export interface IcalConnectionInfo extends Row {
  connectionId: string;
  tenantId: string;
  userId: string;
  employeeId: string | null;
  syncEnabled: boolean;
}

// =============================================================================
// Repository
// =============================================================================

export class CalendarSyncRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Connection Operations
  // ===========================================================================

  /**
   * List all calendar connections for the current user
   */
  async listConnections(
    ctx: TenantContext,
    userId: string
  ): Promise<CalendarConnectionRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<CalendarConnectionRow[]>`
        SELECT
          id, tenant_id, user_id,
          provider, calendar_id,
          ical_token,
          sync_enabled, last_synced_at,
          created_at, updated_at
        FROM calendar_connections
        WHERE user_id = ${userId}
        ORDER BY created_at ASC
      `;
    });
  }

  /**
   * Get a calendar connection by provider for the current user
   */
  async getConnectionByProvider(
    ctx: TenantContext,
    userId: string,
    provider: string
  ): Promise<CalendarConnectionRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<CalendarConnectionRow[]>`
        SELECT
          id, tenant_id, user_id,
          provider, calendar_id,
          ical_token,
          sync_enabled, last_synced_at,
          created_at, updated_at
        FROM calendar_connections
        WHERE user_id = ${userId}
          AND provider = ${provider}
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Create an iCal connection with a generated token
   */
  async createIcalConnection(
    ctx: TenantContext,
    userId: string,
    icalToken: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<CalendarConnectionRow> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<CalendarConnectionRow[]>`
        INSERT INTO calendar_connections (
          tenant_id, user_id, provider, ical_token, sync_enabled
        )
        VALUES (
          ${ctx.tenantId}, ${userId}, 'ical', ${icalToken}, true
        )
        RETURNING
          id, tenant_id, user_id,
          provider, calendar_id,
          ical_token,
          sync_enabled, last_synced_at,
          created_at, updated_at
      `;
      return rows[0];
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Update the iCal token on an existing connection (regenerate)
   */
  async updateIcalToken(
    ctx: TenantContext,
    userId: string,
    newToken: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<CalendarConnectionRow | null> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const rows = await sql<CalendarConnectionRow[]>`
        UPDATE calendar_connections
        SET
          ical_token = ${newToken},
          sync_enabled = true,
          updated_at = now()
        WHERE user_id = ${userId}
          AND provider = 'ical'
        RETURNING
          id, tenant_id, user_id,
          provider, calendar_id,
          ical_token,
          sync_enabled, last_synced_at,
          created_at, updated_at
      `;
      return rows[0] ?? null;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  /**
   * Disable (delete) an iCal connection
   */
  async deleteIcalConnection(
    ctx: TenantContext,
    userId: string,
    tx?: TransactionSql<Record<string, unknown>>
  ): Promise<boolean> {
    const exec = async (sql: TransactionSql<Record<string, unknown>>) => {
      const result = await sql`
        DELETE FROM calendar_connections
        WHERE user_id = ${userId}
          AND provider = 'ical'
      `;
      return result.count > 0;
    };

    if (tx) return exec(tx);
    return this.db.withTransaction(ctx, exec);
  }

  // ===========================================================================
  // iCal Feed Operations (system context — unauthenticated access)
  // ===========================================================================

  /**
   * Look up a calendar connection by its iCal token.
   * Uses system context because the iCal feed endpoint is unauthenticated.
   * Also resolves the employee_id from the user_id.
   */
  async getConnectionByIcalToken(
    icalToken: string
  ): Promise<IcalConnectionInfo | null> {
    const rows = await this.db.withSystemContext(async (tx) => {
      return tx<IcalConnectionInfo[]>`
        SELECT
          cc.id AS connection_id,
          cc.tenant_id,
          cc.user_id,
          e.id AS employee_id,
          cc.sync_enabled
        FROM calendar_connections cc
        LEFT JOIN employees e
          ON e.user_id = cc.user_id
          AND e.tenant_id = cc.tenant_id
          AND e.status IN ('active', 'on_leave')
        WHERE cc.ical_token = ${icalToken}
          AND cc.provider = 'ical'
        LIMIT 1
      `;
    });
    return rows[0] ?? null;
  }

  /**
   * Get approved leave requests for an employee within a date window.
   * Uses system context since the iCal feed is unauthenticated.
   * Fetches leave from 90 days in the past to 365 days in the future.
   */
  async getLeaveEventsForEmployee(
    tenantId: string,
    employeeId: string
  ): Promise<LeaveEventRow[]> {
    return this.db.withSystemContext(async (tx) => {
      return tx<LeaveEventRow[]>`
        SELECT
          lr.id,
          lt.name AS leave_type_name,
          lt.code AS leave_type_code,
          lr.start_date,
          lr.end_date,
          lr.start_half_day,
          lr.end_half_day,
          lr.status,
          lr.duration
        FROM leave_requests lr
        INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.tenant_id = ${tenantId}
          AND lr.employee_id = ${employeeId}
          AND lr.status IN ('approved', 'pending')
          AND lr.end_date >= (CURRENT_DATE - INTERVAL '90 days')::date
          AND lr.start_date <= (CURRENT_DATE + INTERVAL '365 days')::date
        ORDER BY lr.start_date ASC
      `;
    });
  }

  /**
   * Update last_synced_at for a connection (called when iCal feed is served).
   * Uses system context since the feed endpoint is unauthenticated.
   */
  async updateLastSynced(connectionId: string): Promise<void> {
    await this.db.withSystemContext(async (tx) => {
      await tx`
        UPDATE calendar_connections
        SET last_synced_at = now()
        WHERE id = ${connectionId}
      `;
    });
  }
}
