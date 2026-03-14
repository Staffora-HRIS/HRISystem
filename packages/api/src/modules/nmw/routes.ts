/**
 * NMW (National Minimum Wage) Module - Elysia Routes
 *
 * Defines the API endpoints for NMW/NLW compliance management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - nmw:rates: read, write
 * - nmw:compliance: read, write
 *
 * Endpoints:
 * - GET    /nmw/rates                        List current NMW/NLW rates
 * - POST   /nmw/rates                        Create tenant-specific rate
 * - POST   /nmw/check/:employeeId            Check single employee compliance
 * - POST   /nmw/check-all                    Bulk check all active employees
 * - GET    /nmw/compliance-report            Get compliance report with filters
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { NMWRepository } from "./repository";
import { NMWService } from "./service";
import {
  // Request schemas
  CreateNMWRateSchema,
  NMWRateFiltersSchema,
  ComplianceReportFiltersSchema,
  // Response schemas
  NMWRateResponseSchema,
  ComplianceCheckResponseSchema,
  BulkComplianceResponseSchema,
  ComplianceReportResponseSchema,
  // Common
  PaginationQuerySchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateNMWRate,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & NMWPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface NMWPluginContext {
  nmwService: NMWService;
  nmwRepository: NMWRepository;
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
 * NMW module-specific error codes beyond the shared base set
 */
const nmwErrorStatusMap: Record<string, number> = {
  NMW_RATE_NOT_FOUND: 404,
  EMPLOYEE_NOT_FOUND: 404,
  NMW_VIOLATION: 409,
};

/**
 * Create NMW routes plugin
 */
export const nmwRoutes = new Elysia({ prefix: "/nmw", name: "nmw-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new NMWRepository(db);
    const service = new NMWService(repository, db);

    return { nmwService: service, nmwRepository: repository };
  })

  // ===========================================================================
  // NMW Rate Routes
  // ===========================================================================

  // GET /rates - List current NMW/NLW rates
  .get(
    "/rates",
    async (ctx) => {
      const { nmwService, query, tenantContext, error } = ctx as typeof ctx & NMWPluginContext;
      const result = await nmwService.listRates(tenantContext, query);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          nmwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { rates: result.data };
    },
    {
      beforeHandle: [requirePermission("nmw:rates", "read")],
      query: t.Partial(NMWRateFiltersSchema),
      response: {
        200: t.Object({
          rates: t.Array(NMWRateResponseSchema),
        }),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["NMW"],
        summary: "List NMW/NLW rates",
        description:
          "List all National Minimum Wage / National Living Wage rates visible to the current tenant, including system-wide defaults and any tenant-specific overrides.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /rates - Create tenant-specific rate
  .post(
    "/rates",
    async (ctx) => {
      const {
        nmwService,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as typeof ctx & NMWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await nmwService.createRate(tenantContext, body as CreateNMWRate);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          nmwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: "nmw.rate.created",
          resourceType: "nmw_rate",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("nmw:rates", "write")],
      body: CreateNMWRateSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: NMWRateResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["NMW"],
        summary: "Create tenant-specific NMW rate",
        description:
          "Create a tenant-specific NMW/NLW rate override. Tenant rates take precedence over system-wide defaults when checking compliance.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Compliance Check Routes
  // ===========================================================================

  // POST /check/:employeeId - Check single employee NMW compliance
  .post(
    "/check/:employeeId",
    async (ctx) => {
      const {
        nmwService,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & NMWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await nmwService.checkEmployee(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          nmwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the compliance check
      if (audit) {
        await audit.log({
          action: "nmw.compliance.checked",
          resourceType: "nmw_compliance_check",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
            compliant: result.data!.compliant,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("nmw:compliance", "write")],
      params: EmployeeIdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ComplianceCheckResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["NMW"],
        summary: "Check employee NMW compliance",
        description:
          "Check whether a single employee's hourly rate meets the applicable National Minimum Wage / National Living Wage rate based on their age. Records the result for audit purposes.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /check-all - Bulk check all active employees
  .post(
    "/check-all",
    async (ctx) => {
      const {
        nmwService,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as typeof ctx & NMWPluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await nmwService.checkAll(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          nmwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the bulk check
      if (audit) {
        await audit.log({
          action: "nmw.compliance.bulk_checked",
          resourceType: "nmw_compliance",
          resourceId: tenantContext.tenantId,
          newValues: {
            totalChecked: result.data!.totalChecked,
            compliant: result.data!.compliant,
            nonCompliant: result.data!.nonCompliant,
            skipped: result.data!.skipped,
            checkDate: result.data!.checkDate,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("nmw:compliance", "write")],
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: BulkComplianceResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["NMW"],
        summary: "Bulk check NMW compliance",
        description:
          "Check NMW/NLW compliance for all active employees in the tenant. Employees without date of birth or compensation data are skipped. Each individual check is recorded for audit.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /compliance-report - Get compliance report
  .get(
    "/compliance-report",
    async (ctx) => {
      const { nmwService, query, tenantContext, error } = ctx as typeof ctx & NMWPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await nmwService.getComplianceReport(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          nmwErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("nmw:compliance", "read")],
      query: t.Composite([
        t.Partial(ComplianceReportFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: {
        200: ComplianceReportResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["NMW"],
        summary: "Get NMW compliance report",
        description:
          "Retrieve a paginated compliance report showing all NMW/NLW checks with optional filtering by date range, compliance status, and employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type NMWRoutes = typeof nmwRoutes;
