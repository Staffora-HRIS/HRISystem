/**
 * Payroll Period Lock Routes (TODO-234)
 *
 * Defines API endpoints for enhanced payroll period locking:
 * - GET  /api/v1/payroll/periods       - List periods with lock status
 * - POST /api/v1/payroll/periods/:id/lock     - Lock a period
 * - POST /api/v1/payroll/periods/:id/unlock   - Unlock with reason
 * - POST /api/v1/payroll/periods/:id/finalize - Permanently finalize
 *
 * These routes are registered as an Elysia plugin and mounted alongside
 * the existing payroll routes in app.ts.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { mapServiceError } from "../../lib/route-errors";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { PayrollRepository } from "./repository";
import { PayrollService } from "./service";
import {
  LockPayrollPeriodSchema,
  UnlockPayrollPeriodSchema,
  FinalizePayrollPeriodSchema,
  PeriodLockStatusQuerySchema,
  PeriodLockResponseSchema,
  type LockPayrollPeriod,
  type UnlockPayrollPeriod,
  type FinalizePayrollPeriod,
} from "./period-lock.schemas";
import {
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
} from "./schemas";
import {
  finalizePayrollPeriod,
  mapPeriodLockToEnhancedResponse,
  listPeriodLocksEnhanced,
} from "./period-lock.service";

// =============================================================================
// Route Context Types
// =============================================================================

interface PeriodLockPluginContext {
  payrollService: PayrollService;
  payrollRepository: PayrollRepository;
  db: DatabaseClient;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number; headers: Record<string, string> };
  error: (status: number, body: unknown) => never;
}

/**
 * Module-specific error code to HTTP status overrides
 */
const periodLockErrorOverrides: Record<string, number> = {
  PAYROLL_PERIOD_LOCKED: 423,
  PAYROLL_PERIOD_FINALIZED: 423,
  STATE_MACHINE_VIOLATION: 409,
};

/**
 * Payroll Period Lock routes plugin (TODO-234)
 */
export const periodLockRoutes = new Elysia({
  prefix: "/payroll",
  name: "payroll-period-lock-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new PayrollRepository(db);
    const service = new PayrollService(repository, db);
    return { payrollService: service, payrollRepository: repository, db };
  })

  // ===========================================================================
  // GET /periods - List periods with lock status (cursor-based pagination)
  // ===========================================================================
  .get(
    "/periods",
    async (ctx) => {
      const { payrollRepository, query, tenantContext, requestId, set } =
        ctx as typeof ctx & PeriodLockPluginContext;

      const filters = {
        periodStart: query.period_start as string | undefined,
        periodEnd: query.period_end as string | undefined,
        payScheduleId: query.pay_schedule_id as string | undefined,
        status: query.status as string | undefined,
        activeOnly: query.active_only === "true",
        cursor: query.cursor as string | undefined,
        limit: query.limit !== undefined ? Number(query.limit) : undefined,
      };

      const result = await listPeriodLocksEnhanced(
        payrollRepository,
        tenantContext!,
        filters
      );

      if (!result.success) {
        return mapServiceError(
          result.error!,
          set,
          requestId,
          periodLockErrorOverrides
        );
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      query: t.Partial(PeriodLockStatusQuerySchema),
      response: {
        200: t.Object({
          items: t.Array(PeriodLockResponseSchema),
          nextCursor: t.Union([t.String(), t.Null()]),
          hasMore: t.Boolean(),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "List payroll periods with lock status",
        description:
          "List payroll period locks with optional filters for status, " +
          "pay_schedule_id, and date range. Supports cursor-based pagination. " +
          "Use active_only=true to see only locked/finalized periods.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /periods/:id/lock - Lock a period
  // ===========================================================================
  .post(
    "/periods/:id/lock",
    async (ctx) => {
      const {
        payrollService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PeriodLockPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.lockPayrollPeriod(
        tenantContext!,
        body as unknown as LockPayrollPeriod,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(
          result.error!,
          set,
          requestId,
          periodLockErrorOverrides
        );
      }

      if (audit) {
        await audit.log({
          action: "payroll.period.locked",
          resourceType: "payroll_period_lock",
          resourceId: result.data!.id,
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return mapPeriodLockToEnhancedResponse(result.data as any);
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      body: LockPayrollPeriodSchema,
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PeriodLockResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Lock a payroll period",
        description:
          "Lock a payroll period to prevent modifications to time entries, " +
          "absence records, and compensation changes within the locked date range. " +
          "Optionally scope to a specific pay schedule. Status transitions to 'locked'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /periods/:id/unlock - Unlock with reason (audit trail)
  // ===========================================================================
  .post(
    "/periods/:id/unlock",
    async (ctx) => {
      const {
        payrollService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PeriodLockPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await payrollService.unlockPayrollPeriod(
        tenantContext!,
        params.id,
        body as unknown as UnlockPayrollPeriod,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(
          result.error!,
          set,
          requestId,
          periodLockErrorOverrides
        );
      }

      if (audit) {
        await audit.log({
          action: "payroll.period.unlocked",
          resourceType: "payroll_period_lock",
          resourceId: result.data!.id,
          oldValues: { status: "locked" },
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: {
            unlock_reason: (body as unknown as UnlockPayrollPeriod)
              .unlock_reason,
            idempotencyKey,
            requestId,
          },
        });
      }

      return mapPeriodLockToEnhancedResponse(result.data as any);
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      body: UnlockPayrollPeriodSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PeriodLockResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Unlock a payroll period",
        description:
          "Unlock a previously locked payroll period. Requires a mandatory reason " +
          "for audit purposes. Finalized periods cannot be unlocked. " +
          "Status transitions from 'locked' to 'open'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /periods/:id/finalize - Permanently finalize (cannot unlock)
  // ===========================================================================
  .post(
    "/periods/:id/finalize",
    async (ctx) => {
      const {
        payrollRepository,
        db,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        set,
      } = ctx as typeof ctx & PeriodLockPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await finalizePayrollPeriod(
        payrollRepository,
        db,
        tenantContext!,
        params.id,
        body as unknown as FinalizePayrollPeriod,
        idempotencyKey
      );

      if (!result.success) {
        return mapServiceError(
          result.error!,
          set,
          requestId,
          periodLockErrorOverrides
        );
      }

      if (audit) {
        await audit.log({
          action: "payroll.period.finalized",
          resourceType: "payroll_period_lock",
          resourceId: result.data!.id,
          oldValues: { status: "locked" },
          newValues: result.data as unknown as Record<string, unknown>,
          metadata: {
            notes: (body as unknown as FinalizePayrollPeriod).notes,
            idempotencyKey,
            requestId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "write")],
      params: IdParamsSchema,
      body: FinalizePayrollPeriodSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PeriodLockResponseSchema,
        400: ErrorResponseSchema,
        401: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        423: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Finalize a payroll period (permanent)",
        description:
          "Permanently finalize a locked payroll period. Once finalized, " +
          "the period cannot be unlocked. This is an irreversible operation. " +
          "Only periods with 'locked' status can be finalized. " +
          "Status transitions from 'locked' to 'finalized'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /periods/:id - Get a single period lock by ID
  // ===========================================================================
  .get(
    "/periods/:id",
    async (ctx) => {
      const { payrollRepository, params, tenantContext, requestId, set } =
        ctx as typeof ctx & PeriodLockPluginContext;

      const row = await payrollRepository.findPeriodLockById(
        tenantContext!,
        params.id
      );

      if (!row) {
        return mapServiceError(
          {
            code: "NOT_FOUND",
            message: `Payroll period lock ${params.id} not found`,
          },
          set,
          requestId,
          periodLockErrorOverrides
        );
      }

      return mapPeriodLockToEnhancedResponse(row);
    },
    {
      beforeHandle: [requirePermission("payroll:runs", "read")],
      params: IdParamsSchema,
      response: {
        200: PeriodLockResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Payroll"],
        summary: "Get period lock by ID",
        description: "Get a single payroll period lock record by its ID.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type PeriodLockRoutes = typeof periodLockRoutes;
