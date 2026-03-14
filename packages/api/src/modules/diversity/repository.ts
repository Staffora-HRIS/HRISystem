/**
 * Diversity Monitoring Module - Repository Layer
 *
 * Provides data access methods for diversity monitoring data.
 * All methods respect RLS through tenant context.
 *
 * IMPORTANT: Aggregate queries must never return individual-level data.
 * Only counts per category are returned for reporting (Equality Act 2010).
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface DiversityDataRow {
  id: string;
  tenantId: string;
  employeeId: string;
  ethnicity: string | null;
  ethnicityOther: string | null;
  disabilityStatus: string | null;
  disabilityDetails: string | null;
  religionBelief: string | null;
  religionOther: string | null;
  sexualOrientation: string | null;
  sexualOrientationOther: string | null;
  consentGiven: boolean;
  consentDate: Date | null;
  consentIp: string | null;
  dataCollectedAt: Date | null;
  updatedAt: Date | null;
}

export interface CategoryCount {
  value: string | null;
  count: number;
}

export interface AggregateStats {
  totalResponses: number;
  ethnicity: CategoryCount[];
  disabilityStatus: CategoryCount[];
  religionBelief: CategoryCount[];
  sexualOrientation: CategoryCount[];
}

export interface CompletionRate {
  totalEmployees: number;
  totalSubmissions: number;
  completionRate: number;
}

export type { TenantContext };

// =============================================================================
// Diversity Repository
// =============================================================================

export class DiversityRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Get by Employee (via user_id lookup)
  // ===========================================================================

  /**
   * Get diversity data for the authenticated employee (lookup by user_id).
   */
  async getByUserId(ctx: TenantContext): Promise<DiversityDataRow | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<DiversityDataRow[]>`
          SELECT dd.id,
                 dd.tenant_id,
                 dd.employee_id,
                 dd.ethnicity,
                 dd.ethnicity_other,
                 dd.disability_status,
                 dd.disability_details,
                 dd.religion_belief,
                 dd.religion_other,
                 dd.sexual_orientation,
                 dd.sexual_orientation_other,
                 dd.consent_given,
                 dd.consent_date,
                 dd.consent_ip,
                 dd.data_collected_at,
                 dd.updated_at
          FROM app.diversity_data dd
          INNER JOIN app.employees e
            ON e.id = dd.employee_id
            AND e.tenant_id = dd.tenant_id
          WHERE e.user_id = ${ctx.userId}::uuid
            AND e.tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return row || null;
  }

  // ===========================================================================
  // Resolve Employee ID from User ID
  // ===========================================================================

  /**
   * Resolve the employee_id for the current authenticated user.
   */
  async resolveEmployeeId(ctx: TenantContext): Promise<string | null> {
    const [row] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        return tx<{ id: string }[]>`
          SELECT id
          FROM app.employees
          WHERE user_id = ${ctx.userId}::uuid
            AND tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return row?.id || null;
  }

  // ===========================================================================
  // Upsert
  // ===========================================================================

  /**
   * Insert or update diversity data for an employee.
   * Uses ON CONFLICT on the unique (tenant_id, employee_id) constraint.
   */
  async upsert(
    tx: TransactionSql,
    ctx: TenantContext,
    employeeId: string,
    data: {
      ethnicity?: string | null;
      ethnicityOther?: string | null;
      disabilityStatus?: string | null;
      disabilityDetails?: string | null;
      religionBelief?: string | null;
      religionOther?: string | null;
      sexualOrientation?: string | null;
      sexualOrientationOther?: string | null;
      consentGiven: boolean;
      consentDate?: Date | null;
      consentIp?: string | null;
    }
  ): Promise<DiversityDataRow> {
    const [row] = await tx<DiversityDataRow[]>`
      INSERT INTO app.diversity_data (
        id,
        tenant_id,
        employee_id,
        ethnicity,
        ethnicity_other,
        disability_status,
        disability_details,
        religion_belief,
        religion_other,
        sexual_orientation,
        sexual_orientation_other,
        consent_given,
        consent_date,
        consent_ip,
        data_collected_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${ctx.tenantId}::uuid,
        ${employeeId}::uuid,
        ${data.ethnicity ?? null},
        ${data.ethnicityOther ?? null},
        ${data.disabilityStatus ?? null},
        ${data.disabilityDetails ?? null},
        ${data.religionBelief ?? null},
        ${data.religionOther ?? null},
        ${data.sexualOrientation ?? null},
        ${data.sexualOrientationOther ?? null},
        ${data.consentGiven},
        ${data.consentDate ?? null},
        ${data.consentIp ?? null},
        now(),
        now()
      )
      ON CONFLICT (tenant_id, employee_id) DO UPDATE SET
        ethnicity              = EXCLUDED.ethnicity,
        ethnicity_other        = EXCLUDED.ethnicity_other,
        disability_status      = EXCLUDED.disability_status,
        disability_details     = EXCLUDED.disability_details,
        religion_belief        = EXCLUDED.religion_belief,
        religion_other         = EXCLUDED.religion_other,
        sexual_orientation     = EXCLUDED.sexual_orientation,
        sexual_orientation_other = EXCLUDED.sexual_orientation_other,
        consent_given          = EXCLUDED.consent_given,
        consent_date           = EXCLUDED.consent_date,
        consent_ip             = EXCLUDED.consent_ip,
        updated_at             = now()
      RETURNING *
    `;

    return row;
  }

  // ===========================================================================
  // Delete (Withdraw Data)
  // ===========================================================================

  /**
   * Delete diversity data for the authenticated employee.
   * Used when an employee withdraws their data.
   */
  async deleteByEmployeeId(
    tx: TransactionSql,
    ctx: TenantContext,
    employeeId: string
  ): Promise<boolean> {
    const result = await tx`
      DELETE FROM app.diversity_data
      WHERE employee_id = ${employeeId}::uuid
        AND tenant_id = ${ctx.tenantId}::uuid
    `;

    return result.count > 0;
  }

  // ===========================================================================
  // Aggregate Statistics (admin reporting)
  // ===========================================================================

  /**
   * Get aggregate diversity statistics.
   * Returns counts per category only -- never individual records.
   */
  async getAggregateStats(ctx: TenantContext): Promise<AggregateStats> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        // Total responses
        const [totalRow] = await tx<{ count: number }[]>`
          SELECT count(*)::int as count
          FROM app.diversity_data
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND consent_given = true
        `;
        const totalResponses = totalRow?.count || 0;

        // Ethnicity breakdown
        const ethnicity = await tx<CategoryCount[]>`
          SELECT ethnicity as value, count(*)::int as count
          FROM app.diversity_data
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND consent_given = true
            AND ethnicity IS NOT NULL
          GROUP BY ethnicity
          ORDER BY count DESC
        `;

        // Disability status breakdown
        const disabilityStatus = await tx<CategoryCount[]>`
          SELECT disability_status as value, count(*)::int as count
          FROM app.diversity_data
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND consent_given = true
            AND disability_status IS NOT NULL
          GROUP BY disability_status
          ORDER BY count DESC
        `;

        // Religion/belief breakdown
        const religionBelief = await tx<CategoryCount[]>`
          SELECT religion_belief as value, count(*)::int as count
          FROM app.diversity_data
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND consent_given = true
            AND religion_belief IS NOT NULL
          GROUP BY religion_belief
          ORDER BY count DESC
        `;

        // Sexual orientation breakdown
        const sexualOrientation = await tx<CategoryCount[]>`
          SELECT sexual_orientation as value, count(*)::int as count
          FROM app.diversity_data
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND consent_given = true
            AND sexual_orientation IS NOT NULL
          GROUP BY sexual_orientation
          ORDER BY count DESC
        `;

        return {
          totalResponses,
          ethnicity: [...ethnicity],
          disabilityStatus: [...disabilityStatus],
          religionBelief: [...religionBelief],
          sexualOrientation: [...sexualOrientation],
        };
      }
    );
  }

  // ===========================================================================
  // Completion Rate (admin reporting)
  // ===========================================================================

  /**
   * Get diversity data completion rate.
   * Returns total active employees vs those who have submitted data.
   */
  async getCompletionRate(ctx: TenantContext): Promise<CompletionRate> {
    return this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        const [row] = await tx<{
          totalEmployees: number;
          totalSubmissions: number;
        }[]>`
          SELECT
            (SELECT count(*)::int FROM app.employees
             WHERE tenant_id = ${ctx.tenantId}::uuid
               AND status IN ('active', 'on_leave')
            ) as total_employees,
            (SELECT count(*)::int FROM app.diversity_data
             WHERE tenant_id = ${ctx.tenantId}::uuid
               AND consent_given = true
            ) as total_submissions
        `;

        const totalEmployees = row?.totalEmployees || 0;
        const totalSubmissions = row?.totalSubmissions || 0;
        const completionRate =
          totalEmployees > 0
            ? Math.round((totalSubmissions / totalEmployees) * 10000) / 100
            : 0;

        return { totalEmployees, totalSubmissions, completionRate };
      }
    );
  }
}
