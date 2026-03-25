"""
Script to write the global-mobility module files.
Run with: python3 scripts/write-global-mobility.py
"""
import os

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mod_dir = os.path.join(base, 'packages', 'api', 'src', 'modules', 'global-mobility')

# ============================================================================
# schemas.ts
# ============================================================================
schemas = '''/**
 * Global Mobility Module - TypeBox Schemas
 *
 * Defines validation schemas for international assignment tracking API endpoints.
 * Tables: international_assignments, assignment_costs
 */

import { t, type Static } from "elysia";

// =============================================================================
// Common Schemas
// =============================================================================

export const UuidSchema = t.String({
  format: "uuid",
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const DateSchema = t.String({
  format: "date",
  pattern: "^\\\\d{4}-\\\\d{2}-\\\\d{2}$",
});

export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

// =============================================================================
// Enums
// =============================================================================

export const AssignmentTypeSchema = t.Union([
  t.Literal("short_term"),
  t.Literal("long_term"),
  t.Literal("permanent_transfer"),
  t.Literal("commuter"),
]);
export type AssignmentType = Static<typeof AssignmentTypeSchema>;

export const AssignmentStatusSchema = t.Union([
  t.Literal("planned"),
  t.Literal("active"),
  t.Literal("extended"),
  t.Literal("completed"),
  t.Literal("cancelled"),
]);
export type AssignmentStatus = Static<typeof AssignmentStatusSchema>;

export const CostTypeSchema = t.Union([
  t.Literal("relocation"),
  t.Literal("housing"),
  t.Literal("education"),
  t.Literal("tax_equalisation"),
  t.Literal("travel"),
]);
export type CostType = Static<typeof CostTypeSchema>;

export const CostPeriodSchema = t.Union([
  t.Literal("one_off"),
  t.Literal("monthly"),
  t.Literal("annual"),
]);
export type CostPeriod = Static<typeof CostPeriodSchema>;

/** ISO 3166-1 alpha-2 country code */
export const CountryCodeSchema = t.String({
  minLength: 2,
  maxLength: 2,
  pattern: "^[A-Z]{2}$",
});

/** ISO 4217 currency code */
export const CurrencyCodeSchema = t.String({
  minLength: 3,
  maxLength: 3,
  pattern: "^[A-Z]{3}$",
});

// =============================================================================
// International Assignment Schemas
// =============================================================================

export const CreateAssignmentSchema = t.Object({
  employee_id: UuidSchema,
  assignment_type: AssignmentTypeSchema,
  home_country: CountryCodeSchema,
  host_country: CountryCodeSchema,
  start_date: DateSchema,
  expected_end_date: t.Optional(DateSchema),
  tax_equalisation: t.Optional(t.Boolean()),
  relocation_package: t.Optional(t.Record(t.String(), t.Unknown())),
  visa_required: t.Optional(t.Boolean()),
  visa_expiry: t.Optional(DateSchema),
  notes: t.Optional(t.String({ maxLength: 10000 })),
});
export type CreateAssignment = Static<typeof CreateAssignmentSchema>;

export const UpdateAssignmentSchema = t.Partial(
  t.Object({
    assignment_type: AssignmentTypeSchema,
    home_country: CountryCodeSchema,
    host_country: CountryCodeSchema,
    start_date: DateSchema,
    expected_end_date: t.Union([DateSchema, t.Null()]),
    actual_end_date: t.Union([DateSchema, t.Null()]),
    tax_equalisation: t.Boolean(),
    relocation_package: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
    visa_required: t.Boolean(),
    visa_expiry: t.Union([DateSchema, t.Null()]),
    notes: t.Union([t.String({ maxLength: 10000 }), t.Null()]),
  })
);
export type UpdateAssignment = Static<typeof UpdateAssignmentSchema>;

export const AssignmentStatusTransitionSchema = t.Object({
  status: AssignmentStatusSchema,
  expected_end_date: t.Optional(DateSchema),
  actual_end_date: t.Optional(DateSchema),
});
export type AssignmentStatusTransition = Static<typeof AssignmentStatusTransitionSchema>;

export const AssignmentResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  employee_id: UuidSchema,
  employee_name: t.Optional(t.String()),
  employee_number: t.Optional(t.String()),
  assignment_type: AssignmentTypeSchema,
  home_country: t.String(),
  host_country: t.String(),
  start_date: t.String(),
  expected_end_date: t.Union([t.String(), t.Null()]),
  actual_end_date: t.Union([t.String(), t.Null()]),
  tax_equalisation: t.Boolean(),
  relocation_package: t.Union([t.Record(t.String(), t.Unknown()), t.Null()]),
  visa_required: t.Boolean(),
  visa_expiry: t.Union([t.String(), t.Null()]),
  status: AssignmentStatusSchema,
  notes: t.Union([t.String(), t.Null()]),
  created_by: t.Union([UuidSchema, t.Null()]),
  created_at: t.String(),
  updated_at: t.String(),
});
export type AssignmentResponse = Static<typeof AssignmentResponseSchema>;

export const AssignmentFiltersSchema = t.Object({
  status: t.Optional(AssignmentStatusSchema),
  assignment_type: t.Optional(AssignmentTypeSchema),
  employee_id: t.Optional(UuidSchema),
  home_country: t.Optional(CountryCodeSchema),
  host_country: t.Optional(CountryCodeSchema),
  search: t.Optional(t.String({ minLength: 1 })),
});
export type AssignmentFilters = Static<typeof AssignmentFiltersSchema>;

export const ExpiringAssignmentsQuerySchema = t.Object({
  days: t.Optional(t.Number({ minimum: 1, maximum: 365, default: 30 })),
  cursor: t.Optional(t.String({ minLength: 1 })),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type ExpiringAssignmentsQuery = Static<typeof ExpiringAssignmentsQuerySchema>;

// =============================================================================
// Assignment Cost Schemas
// =============================================================================

export const CreateAssignmentCostSchema = t.Object({
  cost_type: CostTypeSchema,
  amount: t.Number({ minimum: 0 }),
  currency: t.Optional(CurrencyCodeSchema),
  period: t.Optional(CostPeriodSchema),
  description: t.Optional(t.String({ maxLength: 5000 })),
});
export type CreateAssignmentCost = Static<typeof CreateAssignmentCostSchema>;

export const AssignmentCostResponseSchema = t.Object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  assignment_id: UuidSchema,
  cost_type: CostTypeSchema,
  amount: t.Number(),
  currency: t.String(),
  period: CostPeriodSchema,
  description: t.Union([t.String(), t.Null()]),
  created_at: t.String(),
});
export type AssignmentCostResponse = Static<typeof AssignmentCostResponseSchema>;

// =============================================================================
// Dashboard Schemas
// =============================================================================

export const DashboardResponseSchema = t.Object({
  total_assignments: t.Number(),
  by_status: t.Object({
    planned: t.Number(),
    active: t.Number(),
    extended: t.Number(),
    completed: t.Number(),
    cancelled: t.Number(),
  }),
  by_type: t.Object({
    short_term: t.Number(),
    long_term: t.Number(),
    permanent_transfer: t.Number(),
    commuter: t.Number(),
  }),
  top_host_countries: t.Array(
    t.Object({
      country: t.String(),
      count: t.Number(),
    })
  ),
  expiring_soon: t.Number(),
  visa_expiring_soon: t.Number(),
  total_costs: t.Object({
    amount: t.Number(),
    currency: t.String(),
  }),
});
export type DashboardResponse = Static<typeof DashboardResponseSchema>;

// =============================================================================
// API Route Parameter Schemas
// =============================================================================

export const IdParamsSchema = t.Object({
  id: UuidSchema,
});
export type IdParams = Static<typeof IdParamsSchema>;

export const AssignmentIdParamsSchema = t.Object({
  id: UuidSchema,
});

export const OptionalIdempotencyHeaderSchema = t.Object({
  "idempotency-key": t.Optional(t.String({ minLength: 1, maxLength: 100 })),
});
export type OptionalIdempotencyHeader = Static<typeof OptionalIdempotencyHeaderSchema>;
'''

with open(os.path.join(mod_dir, 'schemas.ts'), 'w', newline='\n') as f:
    f.write(schemas)
print(f"schemas.ts written ({len(schemas)} chars)")

# ============================================================================
# repository.ts
# ============================================================================
repository = '''/**
 * Global Mobility Module - Repository Layer
 *
 * Database operations for international assignments and assignment costs.
 * All queries respect RLS through tenant context.
 * Uses cursor-based pagination for list operations.
 */

import type { DatabaseClient, TransactionSql, Row } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import type {
  CreateAssignment,
  UpdateAssignment,
  AssignmentFilters,
  PaginationQuery,
  ExpiringAssignmentsQuery,
  CreateAssignmentCost,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";

// =============================================================================
// Types
// =============================================================================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AssignmentRow extends Row {
  id: string;
  tenantId: string;
  employeeId: string;
  employeeName?: string;
  employeeNumber?: string;
  assignmentType: string;
  homeCountry: string;
  hostCountry: string;
  startDate: Date;
  expectedEndDate: Date | null;
  actualEndDate: Date | null;
  taxEqualisation: boolean;
  relocationPackage: Record<string, unknown> | null;
  visaRequired: boolean;
  visaExpiry: Date | null;
  status: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssignmentCostRow extends Row {
  id: string;
  tenantId: string;
  assignmentId: string;
  costType: string;
  amount: number;
  currency: string;
  period: string;
  description: string | null;
  createdAt: Date;
}

export interface DashboardRow extends Row {
  totalAssignments: number;
  planned: number;
  active: number;
  extended: number;
  completed: number;
  cancelled: number;
  shortTerm: number;
  longTerm: number;
  permanentTransfer: number;
  commuter: number;
  expiringSoon: number;
  visaExpiringSoon: number;
  totalCostsAmount: number;
}

export interface TopHostCountryRow extends Row {
  country: string;
  count: number;
}

// =============================================================================
// Repository
// =============================================================================

export class GlobalMobilityRepository {
  constructor(private db: DatabaseClient) {}

  // ---------------------------------------------------------------------------
  // Assignment CRUD
  // ---------------------------------------------------------------------------

  async listAssignments(
    ctx: TenantContext,
    filters: AssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentRow>> {
    const limit = pagination.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AssignmentRow[]>`
        SELECT
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.expected_end_date, ia.actual_end_date,
          ia.tax_equalisation,
          ia.relocation_package, ia.visa_required, ia.visa_expiry,
          ia.status, ia.notes, ia.created_by,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE 1=1
          ${filters.status ? tx`AND ia.status = ${filters.status}::app.international_assignment_status` : tx``}
          ${filters.assignment_type ? tx`AND ia.assignment_type = ${filters.assignment_type}::app.international_assignment_type` : tx``}
          ${filters.employee_id ? tx`AND ia.employee_id = ${filters.employee_id}::uuid` : tx``}
          ${filters.home_country ? tx`AND ia.home_country = ${filters.home_country}` : tx``}
          ${filters.host_country ? tx`AND ia.host_country = ${filters.host_country}` : tx``}
          ${filters.search ? tx`AND (
            e.first_name ILIKE ${"%" + filters.search + "%"}
            OR e.last_name ILIKE ${"%" + filters.search + "%"}
            OR e.employee_number ILIKE ${"%" + filters.search + "%"}
            OR ia.home_country ILIKE ${"%" + filters.search + "%"}
            OR ia.host_country ILIKE ${"%" + filters.search + "%"}
          )` : tx``}
          ${pagination.cursor ? tx`AND ia.id > ${pagination.cursor}::uuid` : tx``}
        ORDER BY ia.start_date DESC, ia.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  async getAssignmentById(
    ctx: TenantContext,
    id: string
  ): Promise<AssignmentRow | null> {
    const rows = await this.db.withTransaction(ctx, async (tx) => {
      return tx<AssignmentRow[]>`
        SELECT
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.expected_end_date, ia.actual_end_date,
          ia.tax_equalisation,
          ia.relocation_package, ia.visa_required, ia.visa_expiry,
          ia.status, ia.notes, ia.created_by,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE ia.id = ${id}::uuid
      `;
    });
    return rows[0] ?? null;
  }

  async getAssignmentByIdTx(
    id: string,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const rows = await tx<AssignmentRow[]>`
      SELECT
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, expected_end_date, actual_end_date,
        tax_equalisation,
        relocation_package, visa_required, visa_expiry,
        status, notes, created_by,
        created_at, updated_at
      FROM international_assignments
      WHERE id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment,
    createdBy: string | undefined,
    tx: TransactionSql
  ): Promise<AssignmentRow> {
    const [row] = await tx<AssignmentRow[]>`
      INSERT INTO international_assignments (
        tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, expected_end_date,
        tax_equalisation,
        relocation_package, visa_required, visa_expiry,
        notes, created_by
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${data.employee_id}::uuid,
        ${data.assignment_type}::app.international_assignment_type,
        ${data.home_country},
        ${data.host_country},
        ${data.start_date},
        ${data.expected_end_date ?? null},
        ${data.tax_equalisation ?? false},
        ${data.relocation_package ? JSON.stringify(data.relocation_package) : null}::jsonb,
        ${data.visa_required ?? false},
        ${data.visa_expiry ?? null},
        ${data.notes ?? null},
        ${createdBy ?? null}
      )
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, expected_end_date, actual_end_date,
        tax_equalisation,
        relocation_package, visa_required, visa_expiry,
        status, notes, created_by,
        created_at, updated_at
    `;
    return row;
  }

  async updateAssignment(
    id: string,
    data: UpdateAssignment,
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const [row] = await tx<AssignmentRow[]>`
      UPDATE international_assignments
      SET
        assignment_type = COALESCE(${data.assignment_type ?? null}::app.international_assignment_type, assignment_type),
        home_country = COALESCE(${data.home_country ?? null}, home_country),
        host_country = COALESCE(${data.host_country ?? null}, host_country),
        start_date = COALESCE(${data.start_date ?? null}::date, start_date),
        expected_end_date = CASE WHEN ${data.expected_end_date !== undefined} THEN ${data.expected_end_date ?? null}::date ELSE expected_end_date END,
        actual_end_date = CASE WHEN ${data.actual_end_date !== undefined} THEN ${data.actual_end_date ?? null}::date ELSE actual_end_date END,
        tax_equalisation = COALESCE(${data.tax_equalisation ?? null}::boolean, tax_equalisation),
        relocation_package = CASE WHEN ${data.relocation_package !== undefined} THEN ${data.relocation_package ? JSON.stringify(data.relocation_package) : null}::jsonb ELSE relocation_package END,
        visa_required = COALESCE(${data.visa_required ?? null}::boolean, visa_required),
        visa_expiry = CASE WHEN ${data.visa_expiry !== undefined} THEN ${data.visa_expiry ?? null}::date ELSE visa_expiry END,
        notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes ?? null} ELSE notes END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, expected_end_date, actual_end_date,
        tax_equalisation,
        relocation_package, visa_required, visa_expiry,
        status, notes, created_by,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async transitionStatus(
    id: string,
    newStatus: string,
    updates: {
      expectedEndDate?: string | null;
      actualEndDate?: string | null;
    },
    tx: TransactionSql
  ): Promise<AssignmentRow | null> {
    const [row] = await tx<AssignmentRow[]>`
      UPDATE international_assignments
      SET
        status = ${newStatus}::app.international_assignment_status,
        expected_end_date = CASE WHEN ${updates.expectedEndDate !== undefined} THEN ${updates.expectedEndDate ?? null}::date ELSE expected_end_date END,
        actual_end_date = CASE WHEN ${updates.actualEndDate !== undefined} THEN ${updates.actualEndDate ?? null}::date ELSE actual_end_date END
      WHERE id = ${id}::uuid
      RETURNING
        id, tenant_id, employee_id,
        assignment_type, home_country, host_country,
        start_date, expected_end_date, actual_end_date,
        tax_equalisation,
        relocation_package, visa_required, visa_expiry,
        status, notes, created_by,
        created_at, updated_at
    `;
    return row ?? null;
  }

  async listExpiringAssignments(
    ctx: TenantContext,
    query: ExpiringAssignmentsQuery
  ): Promise<PaginatedResult<AssignmentRow>> {
    const days = query.days || 30;
    const limit = query.limit || 20;
    const fetchLimit = limit + 1;

    return this.db.withTransaction(ctx, async (tx) => {
      const rows = await tx<AssignmentRow[]>`
        SELECT
          ia.id, ia.tenant_id, ia.employee_id,
          ia.assignment_type, ia.home_country, ia.host_country,
          ia.start_date, ia.expected_end_date, ia.actual_end_date,
          ia.tax_equalisation,
          ia.relocation_package, ia.visa_required, ia.visa_expiry,
          ia.status, ia.notes, ia.created_by,
          ia.created_at, ia.updated_at,
          CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
          e.employee_number
        FROM international_assignments ia
        JOIN employees e ON e.id = ia.employee_id AND e.tenant_id = ia.tenant_id
        WHERE ia.status IN ('active', 'extended')
          AND ia.expected_end_date IS NOT NULL
          AND ia.expected_end_date <= CURRENT_DATE + ${days}::integer
          AND ia.expected_end_date >= CURRENT_DATE
          ${query.cursor ? tx`AND ia.id > ${query.cursor}::uuid` : tx``}
        ORDER BY ia.expected_end_date ASC, ia.id ASC
        LIMIT ${fetchLimit}
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor =
        hasMore && items.length > 0 ? items[items.length - 1].id : null;

      return { items, nextCursor, hasMore };
    });
  }

  // ---------------------------------------------------------------------------
  // Assignment Costs
  // ---------------------------------------------------------------------------

  async listCostsByAssignment(
    ctx: TenantContext,
    assignmentId: string
  ): Promise<AssignmentCostRow[]> {
    return this.db.withTransaction(ctx, async (tx) => {
      return tx<AssignmentCostRow[]>`
        SELECT
          id, tenant_id, assignment_id,
          cost_type, amount, currency, period,
          description, created_at
        FROM assignment_costs
        WHERE assignment_id = ${assignmentId}::uuid
        ORDER BY created_at DESC
      `;
    });
  }

  async createCost(
    ctx: TenantContext,
    assignmentId: string,
    data: CreateAssignmentCost,
    tx: TransactionSql
  ): Promise<AssignmentCostRow> {
    const [row] = await tx<AssignmentCostRow[]>`
      INSERT INTO assignment_costs (
        tenant_id, assignment_id,
        cost_type, amount, currency, period,
        description
      ) VALUES (
        ${ctx.tenantId}::uuid,
        ${assignmentId}::uuid,
        ${data.cost_type}::app.assignment_cost_type,
        ${data.amount},
        ${data.currency ?? "GBP"},
        ${data.period ?? "one_off"}::app.assignment_cost_period,
        ${data.description ?? null}
      )
      RETURNING
        id, tenant_id, assignment_id,
        cost_type, amount, currency, period,
        description, created_at
    `;
    return row;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboardStats(
    ctx: TenantContext
  ): Promise<{
    stats: DashboardRow;
    topHostCountries: TopHostCountryRow[];
  }> {
    return this.db.withTransaction(ctx, async (tx) => {
      const [stats] = await tx<DashboardRow[]>`
        SELECT
          COUNT(*)::int AS total_assignments,
          COUNT(*) FILTER (WHERE status = 'planned')::int AS planned,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active,
          COUNT(*) FILTER (WHERE status = 'extended')::int AS extended,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE assignment_type = 'short_term')::int AS short_term,
          COUNT(*) FILTER (WHERE assignment_type = 'long_term')::int AS long_term,
          COUNT(*) FILTER (WHERE assignment_type = 'permanent_transfer')::int AS permanent_transfer,
          COUNT(*) FILTER (WHERE assignment_type = 'commuter')::int AS commuter,
          COUNT(*) FILTER (
            WHERE status IN ('active', 'extended')
              AND expected_end_date IS NOT NULL
              AND expected_end_date <= CURRENT_DATE + 30
              AND expected_end_date >= CURRENT_DATE
          )::int AS expiring_soon,
          COUNT(*) FILTER (
            WHERE status IN ('active', 'extended')
              AND visa_required = true
              AND visa_expiry IS NOT NULL
              AND visa_expiry <= CURRENT_DATE + 30
              AND visa_expiry >= CURRENT_DATE
          )::int AS visa_expiring_soon
        FROM international_assignments
      `;

      const topHostCountries = await tx<TopHostCountryRow[]>`
        SELECT
          host_country AS country,
          COUNT(*)::int AS count
        FROM international_assignments
        WHERE status IN ('active', 'extended')
        GROUP BY host_country
        ORDER BY count DESC
        LIMIT 10
      `;

      const [costsResult] = await tx<{ totalAmount: number }[]>`
        SELECT COALESCE(SUM(ac.amount), 0)::numeric AS total_amount
        FROM assignment_costs ac
        JOIN international_assignments ia ON ia.id = ac.assignment_id AND ia.tenant_id = ac.tenant_id
        WHERE ia.status IN ('active', 'extended')
      `;

      return {
        stats: {
          ...stats,
          totalCostsAmount: Number(costsResult?.totalAmount ?? 0),
        },
        topHostCountries,
      };
    });
  }
}
'''

with open(os.path.join(mod_dir, 'repository.ts'), 'w', newline='\n') as f:
    f.write(repository)
print(f"repository.ts written ({len(repository)} chars)")

# ============================================================================
# service.ts
# ============================================================================
service = '''/**
 * Global Mobility Module - Service Layer
 *
 * Business logic for international assignment management.
 * Enforces state machine transitions for assignment statuses.
 * Emits domain events via the outbox pattern for all mutations.
 */

import type { DatabaseClient } from "../../plugins/db";
import {
  GlobalMobilityRepository,
  type AssignmentRow,
  type AssignmentCostRow,
  type PaginatedResult,
} from "./repository";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";
import { emitDomainEvent } from "../../lib/outbox";
import type {
  CreateAssignment,
  UpdateAssignment,
  AssignmentStatusTransition,
  AssignmentFilters,
  AssignmentResponse,
  AssignmentCostResponse,
  AssignmentStatus,
  DashboardResponse,
  PaginationQuery,
  ExpiringAssignmentsQuery,
  CreateAssignmentCost,
} from "./schemas";

// =============================================================================
// State Machine
// =============================================================================

const VALID_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  planned: ["active", "cancelled"],
  active: ["extended", "completed", "cancelled"],
  extended: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// =============================================================================
// Mappers
// =============================================================================

function formatDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split("T")[0];
  return String(d);
}

function mapToResponse(row: AssignmentRow): AssignmentResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    employee_id: row.employeeId,
    employee_name: row.employeeName,
    employee_number: row.employeeNumber,
    assignment_type: row.assignmentType as AssignmentResponse["assignment_type"],
    home_country: row.homeCountry,
    host_country: row.hostCountry,
    start_date: formatDate(row.startDate) ?? "",
    expected_end_date: formatDate(row.expectedEndDate),
    actual_end_date: formatDate(row.actualEndDate),
    tax_equalisation: row.taxEqualisation,
    relocation_package: row.relocationPackage,
    visa_required: row.visaRequired,
    visa_expiry: formatDate(row.visaExpiry),
    status: row.status as AssignmentStatus,
    notes: row.notes,
    created_by: row.createdBy,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function mapCostToResponse(row: AssignmentCostRow): AssignmentCostResponse {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    assignment_id: row.assignmentId,
    cost_type: row.costType as AssignmentCostResponse["cost_type"],
    amount: Number(row.amount),
    currency: row.currency,
    period: row.period as AssignmentCostResponse["period"],
    description: row.description,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// =============================================================================
// Service
// =============================================================================

export class GlobalMobilityService {
  constructor(
    private repository: GlobalMobilityRepository,
    private db: DatabaseClient
  ) {}

  // ---------------------------------------------------------------------------
  // Assignment Operations
  // ---------------------------------------------------------------------------

  async listAssignments(
    ctx: TenantContext,
    filters: AssignmentFilters,
    pagination: PaginationQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listAssignments(ctx, filters, pagination);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async getAssignment(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<AssignmentResponse>> {
    const assignment = await this.repository.getAssignmentById(ctx, id);
    if (!assignment) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
      };
    }
    return { success: true, data: mapToResponse(assignment) };
  }

  async createAssignment(
    ctx: TenantContext,
    data: CreateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    // Validate that home and host countries differ
    if (data.home_country === data.host_country) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Home country and host country must be different",
          details: { home_country: data.home_country, host_country: data.host_country },
        },
      };
    }

    // Validate dates
    if (data.expected_end_date && data.expected_end_date < data.start_date) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Expected end date must be on or after start date",
          details: { start_date: data.start_date, expected_end_date: data.expected_end_date },
        },
      };
    }

    // Validate visa expiry requires visa_required
    if (data.visa_expiry && !data.visa_required) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Visa expiry date can only be set when visa is required",
          details: { visa_required: data.visa_required, visa_expiry: data.visa_expiry },
        },
      };
    }

    return await this.db.withTransaction(ctx, async (tx) => {
      const assignment = await this.repository.createAssignment(ctx, data, ctx.userId, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: assignment.id,
        eventType: "global_mobility.assignment.created",
        payload: { assignment: mapToResponse(assignment) },
        userId: ctx.userId,
      });

      return { success: true, data: mapToResponse(assignment) };
    });
  }

  async updateAssignment(
    ctx: TenantContext,
    id: string,
    data: UpdateAssignment
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
        };
      }

      // Only planned or active assignments can be edited
      if (existing.status !== "planned" && existing.status !== "active") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot edit an assignment in '${existing.status}' status. Only planned or active assignments can be edited.`,
            details: { status: existing.status },
          },
        };
      }

      // Validate countries differ if both are being changed
      const effectiveHome = data.home_country ?? existing.homeCountry;
      const effectiveHost = data.host_country ?? existing.hostCountry;
      if (effectiveHome === effectiveHost) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.VALIDATION_ERROR,
            message: "Home country and host country must be different",
            details: { home_country: effectiveHome, host_country: effectiveHost },
          },
        };
      }

      const updated = await this.repository.updateAssignment(id, data, tx);
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to update international assignment" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: id,
        eventType: "global_mobility.assignment.updated",
        payload: { assignment: mapToResponse(updated), changes: data },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }

  async transitionStatus(
    ctx: TenantContext,
    id: string,
    transition: AssignmentStatusTransition
  ): Promise<ServiceResult<AssignmentResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      const existing = await this.repository.getAssignmentByIdTx(id, tx);
      if (!existing) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id } },
        };
      }

      const currentStatus = existing.status as AssignmentStatus;
      const allowed = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(transition.status)) {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: `Cannot transition assignment from '${currentStatus}' to '${transition.status}'`,
            details: { currentStatus, requestedStatus: transition.status, allowedTransitions: allowed },
          },
        };
      }

      const updates: {
        expectedEndDate?: string | null;
        actualEndDate?: string | null;
      } = {};

      // When extending, a new expected_end_date should be provided
      if (transition.status === "extended" && transition.expected_end_date) {
        updates.expectedEndDate = transition.expected_end_date;
      }

      // When completing, set actual_end_date
      if (transition.status === "completed") {
        updates.actualEndDate = transition.actual_end_date ?? new Date().toISOString().split("T")[0];
      }

      const updated = await this.repository.transitionStatus(
        id,
        transition.status,
        updates,
        tx
      );
      if (!updated) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "Failed to transition assignment status" },
        };
      }

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: id,
        eventType: `global_mobility.assignment.status.${transition.status}`,
        payload: {
          assignment: mapToResponse(updated),
          previousStatus: currentStatus,
          newStatus: transition.status,
        },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapToResponse(updated) };
    });
  }

  async listExpiringAssignments(
    ctx: TenantContext,
    query: ExpiringAssignmentsQuery
  ): Promise<PaginatedResult<AssignmentResponse>> {
    const result = await this.repository.listExpiringAssignments(ctx, query);
    return {
      items: result.items.map(mapToResponse),
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  // ---------------------------------------------------------------------------
  // Cost Operations
  // ---------------------------------------------------------------------------

  async listCosts(
    ctx: TenantContext,
    assignmentId: string
  ): Promise<ServiceResult<AssignmentCostResponse[]>> {
    // First verify the assignment exists
    const assignment = await this.repository.getAssignmentById(ctx, assignmentId);
    if (!assignment) {
      return {
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id: assignmentId } },
      };
    }

    const costs = await this.repository.listCostsByAssignment(ctx, assignmentId);
    return { success: true, data: costs.map(mapCostToResponse) };
  }

  async addCost(
    ctx: TenantContext,
    assignmentId: string,
    data: CreateAssignmentCost
  ): Promise<ServiceResult<AssignmentCostResponse>> {
    return await this.db.withTransaction(ctx, async (tx) => {
      // Verify assignment exists
      const assignment = await this.repository.getAssignmentByIdTx(assignmentId, tx);
      if (!assignment) {
        return {
          success: false as const,
          error: { code: ErrorCodes.NOT_FOUND, message: "International assignment not found", details: { id: assignmentId } },
        };
      }

      // Cannot add costs to cancelled assignments
      if (assignment.status === "cancelled") {
        return {
          success: false as const,
          error: {
            code: ErrorCodes.STATE_MACHINE_VIOLATION,
            message: "Cannot add costs to a cancelled assignment",
            details: { status: assignment.status },
          },
        };
      }

      const cost = await this.repository.createCost(ctx, assignmentId, data, tx);

      await emitDomainEvent(tx, {
        tenantId: ctx.tenantId,
        aggregateType: "international_assignment",
        aggregateId: assignmentId,
        eventType: "global_mobility.assignment.cost_added",
        payload: { cost: mapCostToResponse(cost), assignmentId },
        userId: ctx.userId,
      });

      return { success: true as const, data: mapCostToResponse(cost) };
    });
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  async getDashboard(
    ctx: TenantContext
  ): Promise<ServiceResult<DashboardResponse>> {
    const { stats, topHostCountries } = await this.repository.getDashboardStats(ctx);

    return {
      success: true,
      data: {
        total_assignments: stats.totalAssignments,
        by_status: {
          planned: stats.planned,
          active: stats.active,
          extended: stats.extended,
          completed: stats.completed,
          cancelled: stats.cancelled,
        },
        by_type: {
          short_term: stats.shortTerm,
          long_term: stats.longTerm,
          permanent_transfer: stats.permanentTransfer,
          commuter: stats.commuter,
        },
        top_host_countries: topHostCountries.map((r) => ({
          country: r.country,
          count: r.count,
        })),
        expiring_soon: stats.expiringSoon,
        visa_expiring_soon: stats.visaExpiringSoon,
        total_costs: {
          amount: stats.totalCostsAmount,
          currency: "GBP",
        },
      },
    };
  }
}
'''

with open(os.path.join(mod_dir, 'service.ts'), 'w', newline='\n') as f:
    f.write(service)
print(f"service.ts written ({len(service)} chars)")

# ============================================================================
# routes.ts
# ============================================================================
routes = '''/**
 * Global Mobility Module - Elysia Routes
 *
 * Defines the API endpoints for international assignment tracking.
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 * - GET    /global-mobility/assignments              - List international assignments
 * - GET    /global-mobility/assignments/expiring      - List expiring assignments
 * - GET    /global-mobility/assignments/:id           - Get assignment by ID
 * - POST   /global-mobility/assignments               - Create assignment
 * - PATCH  /global-mobility/assignments/:id           - Update assignment
 * - POST   /global-mobility/assignments/:id/transition - Transition assignment status
 * - GET    /global-mobility/assignments/:id/costs     - List assignment costs
 * - POST   /global-mobility/assignments/:id/costs     - Add assignment cost
 * - GET    /global-mobility/dashboard                 - Active assignments overview
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { GlobalMobilityRepository } from "./repository";
import { GlobalMobilityService } from "./service";
import {
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  AssignmentStatusTransitionSchema,
  AssignmentFiltersSchema,
  PaginationQuerySchema,
  ExpiringAssignmentsQuerySchema,
  CreateAssignmentCostSchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PluginContext {
  globalMobilityService: GlobalMobilityService;
  tenantContext: { tenantId: string; userId?: string } | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  set: { status: number };
}

// =============================================================================
// Routes
// =============================================================================

export const globalMobilityRoutes = new Elysia({
  prefix: "/global-mobility",
  name: "global-mobility-routes",
})
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new GlobalMobilityRepository(db);
    const service = new GlobalMobilityService(repository, db);
    return { globalMobilityService: service };
  })

  // GET /global-mobility/dashboard - Active assignments overview
  .get(
    "/dashboard",
    async (ctx) => {
      const { globalMobilityService, tenantContext, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.getDashboard(tenantContext!);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Get global mobility dashboard",
        description: "Returns an overview of active international assignments including counts by status, type, top host countries, expiring assignments, and total costs.",
      },
    }
  )

  // GET /global-mobility/assignments - List international assignments
  .get(
    "/assignments",
    async (ctx) => {
      const { globalMobilityService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const { cursor, limit, ...filters } = query;
      const result = await globalMobilityService.listAssignments(
        tenantContext!,
        filters as Record<string, string | undefined>,
        {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      query: t.Intersect([PaginationQuerySchema, AssignmentFiltersSchema]),
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "List international assignments",
      },
    }
  )

  // GET /global-mobility/assignments/expiring - List assignments expiring within N days
  .get(
    "/assignments/expiring",
    async (ctx) => {
      const { globalMobilityService, tenantContext, query } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.listExpiringAssignments(
        tenantContext!,
        {
          days: query.days !== undefined && query.days !== null ? Number(query.days) : undefined,
          cursor: query.cursor,
          limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
        }
      );
      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      query: ExpiringAssignmentsQuerySchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "List expiring international assignments",
        description: "Returns active/extended assignments with end dates within the specified number of days (default 30).",
      },
    }
  )

  // GET /global-mobility/assignments/:id - Get assignment by ID
  .get(
    "/assignments/:id",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.getAssignment(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Get international assignment by ID",
      },
    }
  )

  // POST /global-mobility/assignments - Create assignment
  .post(
    "/assignments",
    async (ctx) => {
      const { globalMobilityService, tenantContext, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.createAssignment(
        tenantContext!,
        body as Parameters<GlobalMobilityService["createAssignment"]>[1]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      body: CreateAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Create international assignment",
      },
    }
  )

  // PATCH /global-mobility/assignments/:id - Update assignment
  .patch(
    "/assignments/:id",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.updateAssignment(
        tenantContext!,
        params.id,
        body as Parameters<GlobalMobilityService["updateAssignment"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateAssignmentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Update international assignment",
      },
    }
  )

  // POST /global-mobility/assignments/:id/transition - Transition assignment status
  .post(
    "/assignments/:id/transition",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.transitionStatus(
        tenantContext!,
        params.id,
        body as Parameters<GlobalMobilityService["transitionStatus"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: AssignmentStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Transition assignment status",
        description: "Valid transitions: planned->active/cancelled, active->extended/completed/cancelled, extended->completed/cancelled.",
      },
    }
  )

  // GET /global-mobility/assignments/:id/costs - List assignment costs
  .get(
    "/assignments/:id/costs",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.listCosts(tenantContext!, params.id);
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      return { items: result.data };
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("employees", "read")],
      detail: {
        tags: ["Global Mobility"],
        summary: "List assignment costs",
        description: "Returns all costs associated with an international assignment.",
      },
    }
  )

  // POST /global-mobility/assignments/:id/costs - Add assignment cost
  .post(
    "/assignments/:id/costs",
    async (ctx) => {
      const { globalMobilityService, tenantContext, params, body, set, requestId } =
        ctx as typeof ctx & PluginContext;
      const result = await globalMobilityService.addCost(
        tenantContext!,
        params.id,
        body as Parameters<GlobalMobilityService["addCost"]>[2]
      );
      if (!result.success) {
        return mapServiceError(result.error!, set, requestId);
      }
      set.status = 201;
      return result.data;
    },
    {
      params: IdParamsSchema,
      body: CreateAssignmentCostSchema,
      headers: OptionalIdempotencyHeaderSchema,
      beforeHandle: [requirePermission("employees", "write")],
      detail: {
        tags: ["Global Mobility"],
        summary: "Add assignment cost",
        description: "Add a cost record to an international assignment. Cannot add costs to cancelled assignments.",
      },
    }
  );

export type GlobalMobilityRoutes = typeof globalMobilityRoutes;
'''

with open(os.path.join(mod_dir, 'routes.ts'), 'w', newline='\n') as f:
    f.write(routes)
print(f"routes.ts written ({len(routes)} chars)")

# ============================================================================
# index.ts
# ============================================================================
index = '''/**
 * Global Mobility Module
 *
 * Provides international assignment tracking for global mobility management.
 * Supports short-term, long-term, permanent transfer, and commuter assignments
 * with visa tracking, tax equalisation, cost tracking, and relocation package management.
 *
 * Usage:
 * ```typescript
 * import { globalMobilityRoutes } from './modules/global-mobility';
 *
 * const app = new Elysia()
 *   .use(globalMobilityRoutes);
 * ```
 */

// Export routes
export { globalMobilityRoutes, type GlobalMobilityRoutes } from "./routes";

// Export service
export { GlobalMobilityService } from "./service";

// Export repository
export { GlobalMobilityRepository } from "./repository";

// Export schemas
export {
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  AssignmentStatusTransitionSchema,
  AssignmentResponseSchema,
  AssignmentFiltersSchema,
  ExpiringAssignmentsQuerySchema,
  CreateAssignmentCostSchema,
  AssignmentCostResponseSchema,
  DashboardResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateAssignment,
  type UpdateAssignment,
  type AssignmentStatusTransition,
  type AssignmentResponse,
  type AssignmentCostResponse,
  type DashboardResponse,
  type AssignmentFilters,
  type AssignmentStatus,
  type AssignmentType,
  type CostType,
  type CostPeriod,
  type ExpiringAssignmentsQuery,
  type CreateAssignmentCost,
  type IdParams,
  type OptionalIdempotencyHeader,
  type PaginationQuery,
} from "./schemas";
'''

with open(os.path.join(mod_dir, 'index.ts'), 'w', newline='\n') as f:
    f.write(index)
print(f"index.ts written ({len(index)} chars)")

print("\\nAll 4 module files written successfully!")
