/**
 * SSP (Statutory Sick Pay) Module - Elysia Routes
 *
 * Defines the API endpoints for Statutory Sick Pay management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - ssp:records: read, write
 * - ssp:eligibility: read
 *
 * Endpoints:
 * - GET    /ssp/records                         List SSP records
 * - GET    /ssp/records/:id                     Get SSP record detail
 * - POST   /ssp/records                         Start new SSP period
 * - PATCH  /ssp/records/:id                     Update SSP record
 * - POST   /ssp/records/:id/end                 End SSP period
 * - GET    /ssp/employees/:employeeId/entitlement  Check remaining entitlement
 * - GET    /ssp/employees/:employeeId/eligibility  Check SSP eligibility
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { SSPRepository } from "./repository";
import { SSPService } from "./service";
import {
  // Request schemas
  CreateSSPRecordSchema,
  UpdateSSPRecordSchema,
  EndSSPRecordSchema,
  SSPRecordFiltersSchema,
  // Response schemas
  SSPRecordResponseSchema,
  SSPRecordDetailResponseSchema,
  SSPEligibilityResponseSchema,
  SSPEntitlementResponseSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateSSPRecord,
  type UpdateSSPRecord,
  type EndSSPRecord,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & SSPPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface SSPPluginContext {
  sspService: SSPService;
  sspRepository: SSPRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  error: (status: number, body: unknown) => never;
}

/**
 * SSP module-specific error codes beyond the shared base set
 */
const sspErrorStatusMap: Record<string, number> = {
  SSP_RECORD_NOT_FOUND: 404,
  EMPLOYEE_NOT_FOUND: 404,
  SSP_ALREADY_ACTIVE: 409,
  SSP_EXHAUSTED: 409,
  SSP_INELIGIBLE: 400,
  INVALID_DATE_RANGE: 400,
};

/**
 * Create SSP routes plugin
 */
export const sspRoutes = new Elysia({ prefix: "/ssp", name: "ssp-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new SSPRepository(db);
    const service = new SSPService(repository, db);

    return { sspService: service, sspRepository: repository };
  })

  // ===========================================================================
  // SSP Record Routes
  // ===========================================================================

  // GET /records - List SSP records
  .get(
    "/records",
    async (ctx) => {
      const { sspService, query, tenantContext } = ctx as typeof ctx & SSPPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await sspService.listRecords(tenantContext, filters, {
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
      beforeHandle: [requirePermission("ssp:records", "read")],
      query: t.Composite([
        t.Partial(SSPRecordFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(SSPRecordResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["SSP"],
        summary: "List SSP records",
        description:
          "List Statutory Sick Pay records with optional filters and cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /records/:id - Get SSP record detail with daily log
  .get(
    "/records/:id",
    async (ctx) => {
      const { sspService, params, tenantContext, error } = ctx as typeof ctx & SSPPluginContext;
      const result = await sspService.getRecord(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "read")],
      params: IdParamsSchema,
      response: {
        200: SSPRecordDetailResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "Get SSP record by ID",
        description:
          "Get a single SSP record with its daily payment log",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /records - Start new SSP period
  .post(
    "/records",
    async (ctx) => {
      const {
        sspService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & SSPPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await sspService.startSSP(tenantContext, body as CreateSSPRecord);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "ssp.record.created",
          resourceType: "ssp_record",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "write")],
      body: CreateSSPRecordSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: SSPRecordResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "Start new SSP period",
        description:
          "Start a new Statutory Sick Pay period for an employee. Checks PIW linking and eligibility.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /records/:id - Update SSP record (notes, fit note, qualifying days)
  .patch(
    "/records/:id",
    async (ctx) => {
      const {
        sspService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & SSPPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await sspService.updateRecord(
        tenantContext,
        params.id,
        body as UpdateSSPRecord
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: "ssp.record.updated",
          resourceType: "ssp_record",
          resourceId: params.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, changes: body },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "write")],
      params: IdParamsSchema,
      body: UpdateSSPRecordSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SSPRecordResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "Update SSP record",
        description:
          "Update an SSP record's administrative fields (notes, fit note requirement, qualifying days pattern)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /records/:id/end - End SSP period (calculates payments)
  .post(
    "/records/:id/end",
    async (ctx) => {
      const {
        sspService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & SSPPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as EndSSPRecord;
      const result = await sspService.endSSP(tenantContext, params.id, typedBody);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the end of SSP
      if (audit) {
        await audit.log({
          action: "ssp.record.ended",
          resourceType: "ssp_record",
          resourceId: params.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            endDate: typedBody.end_date,
            totalDaysPaid: result.data!.total_days_paid,
            totalAmountPaid: result.data!.total_amount_paid,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "write")],
      params: IdParamsSchema,
      body: EndSSPRecordSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: SSPRecordDetailResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "End SSP period",
        description:
          "End an active SSP period. Calculates the full daily SSP breakdown including waiting days and payments.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee SSP Entitlement & Eligibility Routes
  // ===========================================================================

  // GET /employees/:employeeId/entitlement - Check remaining SSP entitlement
  .get(
    "/employees/:employeeId/entitlement",
    async (ctx) => {
      const { sspService, params, tenantContext, error } = ctx as typeof ctx & SSPPluginContext;

      const result = await sspService.getEntitlement(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: SSPEntitlementResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "Get SSP entitlement",
        description:
          "Check remaining SSP entitlement for an employee. Shows used/remaining weeks and qualifying days.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/eligibility - Check SSP eligibility
  .get(
    "/employees/:employeeId/eligibility",
    async (ctx) => {
      const { sspService, params, tenantContext, error } = ctx as typeof ctx & SSPPluginContext;

      const result = await sspService.checkEligibility(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          sspErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("ssp:records", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: SSPEligibilityResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["SSP"],
        summary: "Check SSP eligibility",
        description:
          "Check if an employee is eligible for Statutory Sick Pay. Verifies earnings against Lower Earnings Limit.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type SSPRoutes = typeof sspRoutes;
