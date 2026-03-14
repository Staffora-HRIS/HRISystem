/**
 * Bank Holiday Module - Elysia Routes
 *
 * Defines the API endpoints for bank holiday configuration.
 * All routes require authentication and the 'bank_holidays' permission.
 *
 * Permission model:
 * - bank_holidays: read, write, delete
 *
 * Endpoints:
 * - GET    /bank-holidays          List bank holidays (paginated)
 * - GET    /bank-holidays/:id      Get bank holiday by ID
 * - POST   /bank-holidays          Create bank holiday
 * - PUT    /bank-holidays/:id      Update bank holiday
 * - DELETE /bank-holidays/:id      Delete bank holiday
 * - POST   /bank-holidays/import   Bulk import bank holidays
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { BankHolidayRepository } from "./repository";
import { BankHolidayService } from "./service";
import {
  CreateBankHolidaySchema,
  UpdateBankHolidaySchema,
  BulkImportBankHolidaysSchema,
  BankHolidayResponseSchema,
  BulkImportResponseSchema,
  BankHolidayFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateBankHoliday,
  type UpdateBankHoliday,
  type BulkImportBankHolidays,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as unknown as BankHolidayRouteContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface BankHolidayPluginContext {
  bankHolidayService: BankHolidayService;
  bankHolidayRepository: BankHolidayRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface BankHolidayRouteContext extends BankHolidayPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Module-specific error codes beyond the shared base set
 */
const bankHolidayErrorStatusMap: Record<string, number> = {
  DUPLICATE_HOLIDAY: 409,
};

/**
 * Create bank holiday routes plugin
 */
export const bankHolidayRoutes = new Elysia({
  prefix: "/bank-holidays",
  name: "bank-holiday-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new BankHolidayRepository(db);
    const service = new BankHolidayService(repository, db);

    return { bankHolidayService: service, bankHolidayRepository: repository };
  })

  // ===========================================================================
  // GET /bank-holidays - List bank holidays
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { bankHolidayService, query, tenantContext } = ctx as unknown as BankHolidayRouteContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await bankHolidayService.list(tenantContext, filters, {
        cursor,
        limit: parsedLimit,
      });

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "read")],
      query: t.Composite([
        t.Partial(BankHolidayFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(BankHolidayResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Bank Holidays"],
        summary: "List bank holidays",
        description:
          "List bank holidays with optional filters (country_code, region, year, search) and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /bank-holidays/:id - Get bank holiday by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { bankHolidayService, params, tenantContext, error } = ctx as unknown as BankHolidayRouteContext;
      const result = await bankHolidayService.getById(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bankHolidayErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "read")],
      params: IdParamsSchema,
      response: {
        200: BankHolidayResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bank Holidays"],
        summary: "Get bank holiday by ID",
        description: "Get a single bank holiday by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /bank-holidays - Create bank holiday
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const {
        bankHolidayService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as BankHolidayRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bankHolidayService.create(
        tenantContext,
        body as unknown as CreateBankHoliday,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bankHolidayErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "bank_holidays.created",
          resourceType: "bank_holiday",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "write")],
      body: CreateBankHolidaySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BankHolidayResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bank Holidays"],
        summary: "Create bank holiday",
        description:
          "Create a new bank holiday entry. Defaults to country_code 'GB' if not specified.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PUT /bank-holidays/:id - Update bank holiday
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const {
        bankHolidayService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as BankHolidayRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bankHolidayService.getById(
        tenantContext,
        params.id
      );

      const result = await bankHolidayService.update(
        tenantContext,
        params.id,
        body as unknown as UpdateBankHoliday,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bankHolidayErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "bank_holidays.updated",
          resourceType: "bank_holiday",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "write")],
      params: IdParamsSchema,
      body: UpdateBankHolidaySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BankHolidayResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bank Holidays"],
        summary: "Update bank holiday",
        description: "Update an existing bank holiday entry",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // DELETE /bank-holidays/:id - Delete bank holiday
  // ===========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const {
        bankHolidayService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as BankHolidayRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await bankHolidayService.getById(
        tenantContext,
        params.id
      );

      const result = await bankHolidayService.delete(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bankHolidayErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: "bank_holidays.deleted",
          resourceType: "bank_holiday",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return {
        success: true as const,
        message: "Bank holiday deleted successfully",
      };
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bank Holidays"],
        summary: "Delete bank holiday",
        description:
          "Permanently delete a bank holiday entry. This is a hard delete since bank holidays are configuration data.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // POST /bank-holidays/import - Bulk import bank holidays
  // ===========================================================================
  .post(
    "/import",
    async (ctx) => {
      const {
        bankHolidayService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as BankHolidayRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await bankHolidayService.bulkImport(
        tenantContext,
        body as unknown as BulkImportBankHolidays,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          bankHolidayErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the bulk import
      if (audit) {
        await audit.log({
          action: "bank_holidays.bulk_imported",
          resourceType: "bank_holiday",
          newValues: {
            imported: result.data!.imported,
            skipped: result.data!.skipped,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("bank_holidays", "write")],
      body: BulkImportBankHolidaysSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: BulkImportResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Bank Holidays"],
        summary: "Bulk import bank holidays",
        description:
          "Import multiple bank holidays at once. Duplicates (same date, country_code, and region) are silently skipped. " +
          "Useful for importing UK government bank holiday data. Maximum 200 items per request.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type BankHolidayRoutes = typeof bankHolidayRoutes;
