/**
 * SSP (Statutory Sick Pay) Module - Repository Layer
 *
 * Provides data access methods for SSP records, daily logs, and fit notes.
 * All methods respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type {
  SSPRecordStatus,
  SSPDayType,
  SSPFitNoteStatus,
  SSPRecordFilters,
  PaginationQuery,
} from "./schemas";

// =============================================================================
// Types
// =============================================================================

export interface SSPRecordRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
  qualifyingDaysPattern: number[];
  waitingDaysServed: number;
  totalDaysPaid: number;
  totalAmountPaid: string;
  weeklyRate: string;
  status: SSPRecordStatus;
  linkedPiwId: string | null;
  fitNoteRequired: boolean;
  notes: string | null;
  ineligibilityReason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SSPDailyLogRow extends Row {
  id: string;
  tenantId: string;
  sspRecordId: string;
  logDate: Date;
  dayType: SSPDayType;
  amount: string;
  createdAt: Date;
}

export interface SSPFitNoteRow extends Row {
  id: string;
  tenantId: string;
  sspRecordId: string;
  employeeId: string;
  status: SSPFitNoteStatus;
  coverFrom: Date;
  coverTo: Date | null;
  documentId: string | null;
  issuingDoctor: string | null;
  diagnosis: string | null;
  notes: string | null;
  mayBeFit: boolean;
  adjustments: string | null;
  receivedDate: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmployeeEarningsRow extends Row {
  id: string;
  status: string;
  baseSalary: string | null;
  payFrequency: string | null;
  currency: string | null;
}

export type { TenantContext } from "../../types/service-result";

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// =============================================================================
// SSP Repository
// =============================================================================

export class SSPRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // SSP Record Methods
  // ===========================================================================

  /**
   * Find SSP records with optional filters and cursor-based pagination
   */
  async findRecords(
    context: { tenantId: string; userId?: string },
    filters: SSPRecordFilters = {},
    pagination: PaginationQuery = {}
  ): Promise<PaginatedResult<SSPRecordRow>> {
    const { limit = 20, cursor } = pagination;
    const fetchLimit = limit + 1;

    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<SSPRecordRow[]>`
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM app.ssp_records
        WHERE 1=1
          ${filters.employee_id ? tx`AND employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.status ? tx`AND status = ${filters.status}::app.ssp_record_status` : tx``}
          ${filters.start_date_from ? tx`AND start_date >= ${filters.start_date_from}::date` : tx``}
          ${filters.start_date_to ? tx`AND start_date <= ${filters.start_date_to}::date` : tx``}
          ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY start_date DESC, id
        LIMIT ${fetchLimit}
      `;
      return rows;
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, limit) : result;
    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Find a single SSP record by ID
   */
  async findRecordById(
    context: { tenantId: string; userId?: string },
    id: string
  ): Promise<SSPRecordRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<SSPRecordRow[]>`
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM app.ssp_records
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Find active SSP records for an employee
   */
  async findActiveRecordsByEmployee(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<SSPRecordRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPRecordRow[]>`
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM app.ssp_records
        WHERE employee_id = ${employeeId}::uuid
          AND status = 'active'
        ORDER BY start_date DESC
      `;
    });
  }

  /**
   * Find SSP records that could link with a new PIW (within 8 weeks gap)
   * Returns completed/exhausted records that ended within 56 days before the new start date
   */
  async findLinkablePIWs(
    context: { tenantId: string; userId?: string },
    employeeId: string,
    newStartDate: string
  ): Promise<SSPRecordRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPRecordRow[]>`
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM app.ssp_records
        WHERE employee_id = ${employeeId}::uuid
          AND status IN ('completed', 'exhausted')
          AND end_date IS NOT NULL
          AND end_date >= (${newStartDate}::date - INTERVAL '56 days')::date
          AND end_date < ${newStartDate}::date
        ORDER BY end_date DESC
        LIMIT 1
      `;
    });
  }

  /**
   * Get total paid qualifying days across all linked PIW records for an employee.
   * Walks the PIW chain from the root to find all records in a linked series.
   * Used to calculate remaining SSP entitlement.
   */
  async getTotalPaidDaysInLinkedPIW(
    context: { tenantId: string; userId?: string },
    employeeId: string,
    linkedPiwId: string | null
  ): Promise<number> {
    const result = await this.db.withTransaction(context, async (tx) => {
      if (linkedPiwId) {
        // Sum paid days for all records in the same linked PIW chain
        const rows = await tx<{ total: string }[]>`
          WITH RECURSIVE piw_chain AS (
            -- Start from the root PIW
            SELECT id, linked_piw_id, total_days_paid
            FROM app.ssp_records
            WHERE id = ${linkedPiwId}::uuid
              AND employee_id = ${employeeId}::uuid

            UNION ALL

            -- Find records that link to the chain
            SELECT r.id, r.linked_piw_id, r.total_days_paid
            FROM app.ssp_records r
            INNER JOIN piw_chain pc ON r.linked_piw_id = pc.id
            WHERE r.employee_id = ${employeeId}::uuid
          )
          SELECT COALESCE(SUM(total_days_paid), 0)::text AS total
          FROM piw_chain
        `;
        return rows;
      } else {
        // No linked PIW - just return 0
        return [{ total: "0" }];
      }
    });

    return parseInt(result[0]?.total || "0", 10);
  }

  /**
   * Get all records in a PIW chain (for linking period queries).
   * Returns the root record and all records linked to it.
   */
  async getLinkedPIWChain(
    context: { tenantId: string; userId?: string },
    employeeId: string,
    rootPiwId: string
  ): Promise<SSPRecordRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPRecordRow[]>`
        WITH RECURSIVE piw_chain AS (
          SELECT id, tenant_id, employee_id, start_date, end_date,
                 qualifying_days_pattern, waiting_days_served,
                 total_days_paid, total_amount_paid, weekly_rate,
                 status, linked_piw_id, fit_note_required, notes,
                 ineligibility_reason, created_by, updated_by,
                 created_at, updated_at
          FROM app.ssp_records
          WHERE id = ${rootPiwId}::uuid
            AND employee_id = ${employeeId}::uuid

          UNION ALL

          SELECT r.id, r.tenant_id, r.employee_id, r.start_date, r.end_date,
                 r.qualifying_days_pattern, r.waiting_days_served,
                 r.total_days_paid, r.total_amount_paid, r.weekly_rate,
                 r.status, r.linked_piw_id, r.fit_note_required, r.notes,
                 r.ineligibility_reason, r.created_by, r.updated_by,
                 r.created_at, r.updated_at
          FROM app.ssp_records r
          INNER JOIN piw_chain pc ON r.linked_piw_id = pc.id
          WHERE r.employee_id = ${employeeId}::uuid
        )
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM piw_chain
        ORDER BY start_date ASC
      `;
    });
  }

  /**
   * Get all SSP records for an employee (for entitlement calculation)
   */
  async findAllRecordsByEmployee(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<SSPRecordRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPRecordRow[]>`
        SELECT id, tenant_id, employee_id, start_date, end_date,
               qualifying_days_pattern, waiting_days_served,
               total_days_paid, total_amount_paid, weekly_rate,
               status, linked_piw_id, fit_note_required, notes,
               ineligibility_reason, created_by, updated_by,
               created_at, updated_at
        FROM app.ssp_records
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY start_date DESC
      `;
    });
  }

  /**
   * Check employee existence, employment status, and current earnings.
   * Uses compensation_history table with pay_frequency to calculate
   * the annualised salary, then derives weekly earnings.
   */
  async getEmployeeEarnings(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<EmployeeEarningsRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<EmployeeEarningsRow[]>`
        SELECT
          e.id,
          e.status,
          ch.base_salary,
          ch.pay_frequency,
          ch.currency
        FROM app.employees e
        LEFT JOIN app.compensation_history ch
          ON ch.employee_id = e.id
          AND ch.effective_from <= CURRENT_DATE
          AND (ch.effective_to IS NULL OR ch.effective_to > CURRENT_DATE)
        WHERE e.id = ${employeeId}::uuid
        ORDER BY ch.effective_from DESC NULLS LAST
        LIMIT 1
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create a new SSP record within a transaction
   */
  async createRecord(
    tx: TransactionSql,
    context: { tenantId: string; userId?: string },
    data: {
      employeeId: string;
      startDate: string;
      qualifyingDaysPattern: number[];
      weeklyRate: number;
      status: SSPRecordStatus;
      linkedPiwId: string | null;
      waitingDaysServed: number;
      fitNoteRequired: boolean;
      notes: string | null;
      ineligibilityReason: string | null;
    }
  ): Promise<SSPRecordRow> {
    const rows = await tx<SSPRecordRow[]>`
      INSERT INTO app.ssp_records (
        tenant_id, employee_id, start_date,
        qualifying_days_pattern, weekly_rate, status,
        linked_piw_id, waiting_days_served,
        fit_note_required, notes, ineligibility_reason,
        created_by, updated_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.employeeId}::uuid,
        ${data.startDate}::date,
        ${JSON.stringify(data.qualifyingDaysPattern)}::jsonb,
        ${data.weeklyRate},
        ${data.status}::app.ssp_record_status,
        ${data.linkedPiwId ? tx`${data.linkedPiwId}::uuid` : tx`NULL`},
        ${data.waitingDaysServed},
        ${data.fitNoteRequired},
        ${data.notes},
        ${data.ineligibilityReason},
        ${context.userId || null}::uuid,
        ${context.userId || null}::uuid
      )
      RETURNING id, tenant_id, employee_id, start_date, end_date,
                qualifying_days_pattern, waiting_days_served,
                total_days_paid, total_amount_paid, weekly_rate,
                status, linked_piw_id, fit_note_required, notes,
                ineligibility_reason, created_by, updated_by,
                created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update an SSP record within a transaction
   */
  async updateRecord(
    tx: TransactionSql,
    _context: { tenantId: string; userId?: string },
    id: string,
    data: {
      endDate?: string | null;
      waitingDaysServed?: number;
      totalDaysPaid?: number;
      totalAmountPaid?: number;
      status?: SSPRecordStatus;
      fitNoteRequired?: boolean;
      notes?: string | null;
      qualifyingDaysPattern?: number[];
    }
  ): Promise<SSPRecordRow | null> {
    const rows = await tx<SSPRecordRow[]>`
      UPDATE app.ssp_records
      SET
        end_date = COALESCE(${data.endDate !== undefined ? data.endDate : null}::date, end_date),
        waiting_days_served = COALESCE(${data.waitingDaysServed ?? null}::integer, waiting_days_served),
        total_days_paid = COALESCE(${data.totalDaysPaid ?? null}::integer, total_days_paid),
        total_amount_paid = COALESCE(${data.totalAmountPaid ?? null}::numeric, total_amount_paid),
        status = COALESCE(${data.status ?? null}::app.ssp_record_status, status),
        fit_note_required = COALESCE(${data.fitNoteRequired ?? null}::boolean, fit_note_required),
        notes = COALESCE(${data.notes !== undefined ? data.notes : null}, notes),
        qualifying_days_pattern = COALESCE(
          ${data.qualifyingDaysPattern ? JSON.stringify(data.qualifyingDaysPattern) : null}::jsonb,
          qualifying_days_pattern
        ),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, employee_id, start_date, end_date,
                qualifying_days_pattern, waiting_days_served,
                total_days_paid, total_amount_paid, weekly_rate,
                status, linked_piw_id, fit_note_required, notes,
                ineligibility_reason, created_by, updated_by,
                created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // SSP Daily Log Methods
  // ===========================================================================

  /**
   * Get daily log entries for an SSP record
   */
  async getDailyLog(
    context: { tenantId: string; userId?: string },
    sspRecordId: string
  ): Promise<SSPDailyLogRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPDailyLogRow[]>`
        SELECT id, tenant_id, ssp_record_id, log_date, day_type, amount, created_at
        FROM app.ssp_daily_log
        WHERE ssp_record_id = ${sspRecordId}::uuid
        ORDER BY log_date ASC
      `;
    });
  }

  /**
   * Add a batch of daily log entries within a transaction
   */
  async addDailyLogEntries(
    tx: TransactionSql,
    context: { tenantId: string; userId?: string },
    entries: Array<{
      sspRecordId: string;
      logDate: string;
      dayType: SSPDayType;
      amount: number;
    }>
  ): Promise<SSPDailyLogRow[]> {
    if (entries.length === 0) return [];

    // Build VALUES clause for batch insert
    const allRows: SSPDailyLogRow[] = [];
    for (const entry of entries) {
      const rows = await tx<SSPDailyLogRow[]>`
        INSERT INTO app.ssp_daily_log (
          tenant_id, ssp_record_id, log_date, day_type, amount
        )
        VALUES (
          ${context.tenantId}::uuid,
          ${entry.sspRecordId}::uuid,
          ${entry.logDate}::date,
          ${entry.dayType}::app.ssp_day_type,
          ${entry.amount}
        )
        ON CONFLICT (ssp_record_id, log_date) DO UPDATE
        SET day_type = EXCLUDED.day_type,
            amount = EXCLUDED.amount
        RETURNING id, tenant_id, ssp_record_id, log_date, day_type, amount, created_at
      `;
      if (rows[0]) allRows.push(rows[0]);
    }

    return allRows;
  }

  /**
   * Delete daily log entries for an SSP record from a given date onwards
   * Used when recalculating SSP after an update
   */
  async deleteDailyLogFrom(
    tx: TransactionSql,
    _context: { tenantId: string; userId?: string },
    sspRecordId: string,
    fromDate: string
  ): Promise<void> {
    await tx`
      DELETE FROM app.ssp_daily_log
      WHERE ssp_record_id = ${sspRecordId}::uuid
        AND log_date >= ${fromDate}::date
    `;
  }

  // ===========================================================================
  // Fit Note Methods
  // ===========================================================================

  /**
   * Find fit notes for an SSP record
   */
  async findFitNotesByRecord(
    context: { tenantId: string; userId?: string },
    sspRecordId: string
  ): Promise<SSPFitNoteRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPFitNoteRow[]>`
        SELECT id, tenant_id, ssp_record_id, employee_id, status,
               cover_from, cover_to, document_id, issuing_doctor,
               diagnosis, notes, may_be_fit, adjustments, received_date,
               created_by, updated_by, created_at, updated_at
        FROM app.ssp_fit_notes
        WHERE ssp_record_id = ${sspRecordId}::uuid
        ORDER BY cover_from ASC
      `;
    });
  }

  /**
   * Find fit notes for an employee across all SSP records
   */
  async findFitNotesByEmployee(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<SSPFitNoteRow[]> {
    return await this.db.withTransaction(context, async (tx) => {
      return await tx<SSPFitNoteRow[]>`
        SELECT id, tenant_id, ssp_record_id, employee_id, status,
               cover_from, cover_to, document_id, issuing_doctor,
               diagnosis, notes, may_be_fit, adjustments, received_date,
               created_by, updated_by, created_at, updated_at
        FROM app.ssp_fit_notes
        WHERE employee_id = ${employeeId}::uuid
        ORDER BY cover_from DESC
      `;
    });
  }

  /**
   * Find a single fit note by ID
   */
  async findFitNoteById(
    context: { tenantId: string; userId?: string },
    id: string
  ): Promise<SSPFitNoteRow | null> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<SSPFitNoteRow[]>`
        SELECT id, tenant_id, ssp_record_id, employee_id, status,
               cover_from, cover_to, document_id, issuing_doctor,
               diagnosis, notes, may_be_fit, adjustments, received_date,
               created_by, updated_by, created_at, updated_at
        FROM app.ssp_fit_notes
        WHERE id = ${id}::uuid
      `;
      return rows;
    });

    return result[0] || null;
  }

  /**
   * Create a fit note within a transaction
   */
  async createFitNote(
    tx: TransactionSql,
    context: { tenantId: string; userId?: string },
    data: {
      sspRecordId: string;
      employeeId: string;
      status: SSPFitNoteStatus;
      coverFrom: string;
      coverTo: string | null;
      documentId: string | null;
      issuingDoctor: string | null;
      diagnosis: string | null;
      notes: string | null;
      mayBeFit: boolean;
      adjustments: string | null;
      receivedDate: string | null;
    }
  ): Promise<SSPFitNoteRow> {
    const rows = await tx<SSPFitNoteRow[]>`
      INSERT INTO app.ssp_fit_notes (
        tenant_id, ssp_record_id, employee_id, status,
        cover_from, cover_to, document_id, issuing_doctor,
        diagnosis, notes, may_be_fit, adjustments, received_date,
        created_by, updated_by
      )
      VALUES (
        ${context.tenantId}::uuid,
        ${data.sspRecordId}::uuid,
        ${data.employeeId}::uuid,
        ${data.status}::app.ssp_fit_note_status,
        ${data.coverFrom}::date,
        ${data.coverTo}::date,
        ${data.documentId}::uuid,
        ${data.issuingDoctor},
        ${data.diagnosis},
        ${data.notes},
        ${data.mayBeFit},
        ${data.adjustments},
        ${data.receivedDate}::date,
        ${context.userId || null}::uuid,
        ${context.userId || null}::uuid
      )
      RETURNING id, tenant_id, ssp_record_id, employee_id, status,
                cover_from, cover_to, document_id, issuing_doctor,
                diagnosis, notes, may_be_fit, adjustments, received_date,
                created_by, updated_by, created_at, updated_at
    `;

    return rows[0]!;
  }

  /**
   * Update a fit note within a transaction
   */
  async updateFitNote(
    tx: TransactionSql,
    _context: { tenantId: string; userId?: string },
    id: string,
    data: {
      status?: SSPFitNoteStatus;
      coverTo?: string | null;
      documentId?: string | null;
      issuingDoctor?: string | null;
      diagnosis?: string | null;
      notes?: string | null;
      mayBeFit?: boolean;
      adjustments?: string | null;
      receivedDate?: string | null;
    }
  ): Promise<SSPFitNoteRow | null> {
    const rows = await tx<SSPFitNoteRow[]>`
      UPDATE app.ssp_fit_notes
      SET
        status = COALESCE(${data.status ?? null}::app.ssp_fit_note_status, status),
        cover_to = COALESCE(${data.coverTo !== undefined ? data.coverTo : null}::date, cover_to),
        document_id = COALESCE(${data.documentId !== undefined ? data.documentId : null}::uuid, document_id),
        issuing_doctor = COALESCE(${data.issuingDoctor !== undefined ? data.issuingDoctor : null}, issuing_doctor),
        diagnosis = COALESCE(${data.diagnosis !== undefined ? data.diagnosis : null}, diagnosis),
        notes = COALESCE(${data.notes !== undefined ? data.notes : null}, notes),
        may_be_fit = COALESCE(${data.mayBeFit ?? null}::boolean, may_be_fit),
        adjustments = COALESCE(${data.adjustments !== undefined ? data.adjustments : null}, adjustments),
        received_date = COALESCE(${data.receivedDate !== undefined ? data.receivedDate : null}::date, received_date),
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id, tenant_id, ssp_record_id, employee_id, status,
                cover_from, cover_to, document_id, issuing_doctor,
                diagnosis, notes, may_be_fit, adjustments, received_date,
                created_by, updated_by, created_at, updated_at
    `;

    return rows[0] || null;
  }

  // ===========================================================================
  // Summary / Aggregation Methods
  // ===========================================================================

  /**
   * Get SSP summary for an employee - total paid days and amount across all records
   */
  async getEmployeeSSPSummary(
    context: { tenantId: string; userId?: string },
    employeeId: string
  ): Promise<{
    totalDaysPaid: number;
    totalAmountPaid: number;
    activeRecordId: string | null;
  }> {
    const result = await this.db.withTransaction(context, async (tx) => {
      const rows = await tx<{
        totalDaysPaid: string;
        totalAmountPaid: string;
        activeRecordId: string | null;
      }[]>`
        SELECT
          COALESCE(SUM(total_days_paid), 0)::text AS total_days_paid,
          COALESCE(SUM(total_amount_paid), 0)::text AS total_amount_paid,
          (
            SELECT id FROM app.ssp_records
            WHERE employee_id = ${employeeId}::uuid AND status = 'active'
            ORDER BY start_date DESC LIMIT 1
          ) AS active_record_id
        FROM app.ssp_records
        WHERE employee_id = ${employeeId}::uuid
          AND status IN ('active', 'completed', 'exhausted')
      `;
      return rows;
    });

    const row = result[0];
    return {
      totalDaysPaid: parseInt(row?.totalDaysPaid || "0", 10),
      totalAmountPaid: parseFloat(row?.totalAmountPaid || "0"),
      activeRecordId: row?.activeRecordId || null,
    };
  }
}
