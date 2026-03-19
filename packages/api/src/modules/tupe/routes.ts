/**
 * TUPE Transfers Module - Elysia Routes
 *
 * Defines the API endpoints for TUPE (Transfer of Undertakings Protection of
 * Employment) transfer management.
 *
 * All routes require authentication and appropriate permissions.
 *
 * Endpoints:
 *   GET    /tupe/transfers                              - List transfers
 *   GET    /tupe/transfers/:id                          - Get transfer by ID
 *   POST   /tupe/transfers                              - Create a new transfer
 *   PATCH  /tupe/transfers/:id                          - Update a transfer
 *   DELETE /tupe/transfers/:id                          - Delete (planning only)
 *   GET    /tupe/transfers/:id/history                  - Status transition history
 *   GET    /tupe/transfers/:id/employees                - List affected employees
 *   POST   /tupe/transfers/:id/employees                - Add affected employee
 *   PUT    /tupe/transfers/:id/employees/:empId/consent - Update consent/objection
 *   DELETE /tupe/transfers/:id/employees/:empId         - Remove affected employee
 *
 * Permission model:
 *   - hr: read, write (reuses Core HR permission scope)
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { TupeRepository } from "./repository";
import { TupeService } from "./service";
import {
  CreateTupeTransferSchema,
  UpdateTupeTransferSchema,
  TupeTransferResponseSchema,
  TupeTransferListResponseSchema,
  TupeTransferFiltersSchema,
  TupeAffectedEmployeeResponseSchema,
  TupeAffectedEmployeeListResponseSchema,
  AddAffectedEmployeeSchema,
  UpdateConsentSchema,
  StatusHistoryEntrySchema,
  IdParamsSchema,
  TransferEmployeeParamsSchema,
  PaginationQuerySchema,
  OptionalIdempotencyHeaderSchema,
  UuidSchema,
  // Types
  type CreateTupeTransfer,
  type UpdateTupeTransfer,
  type AddAffectedEmployee,
  type UpdateConsent,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface TupePluginContext {
  tupeService: TupeService;
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

// =============================================================================
// Error Code Mapping
// =============================================================================

const tupeErrorStatusMap: Record<string, number> = {
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  STATE_MACHINE_VIOLATION: 409,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
};

// =============================================================================
// Routes
// =============================================================================

export const tupeRoutes = new Elysia({
  prefix: "/tupe/transfers",
  name: "tupe-routes",
})

  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new TupeRepository(db);
    const service = new TupeService(repository, db);

    return { tupeService: service };
  })

  // ===========================================================================
  // List TUPE Transfers
  // ===========================================================================

  .get(
    "/",
    async (ctx) => {
      const { tupeService, query, tenantContext } =
        ctx as typeof ctx & TupePluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await tupeService.listTransfers(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items as any[],
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("hr", "read")],
      query: t.Composite([
        t.Partial(TupeTransferFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: TupeTransferListResponseSchema,
      detail: {
        tags: ["HR"],
        summary: "List TUPE transfers",
        description:
          "List TUPE transfers with optional filters (status, search) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Get TUPE Transfer by ID
  // ===========================================================================

  .get(
    "/:id",
    async (ctx) => {
      const { tupeService, params, tenantContext, error } =
        ctx as typeof ctx & TupePluginContext;

      const result = await tupeService.getTransfer(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get TUPE transfer by ID",
        description:
          "Get a single TUPE transfer with full details.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Create TUPE Transfer
  // ===========================================================================

  .post(
    "/",
    async (ctx) => {
      const { tupeService, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tupeService.createTransfer(
        tenantContext,
        body as unknown as CreateTupeTransfer,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "TUPE_TRANSFER_CREATED",
          resourceType: "tupe_transfer",
          resourceId: result.data!.id as string,
          newValues: {
            transfer_name: result.data!.transferName,
            transferor_org: result.data!.transferorOrg,
            transferee_org: result.data!.transfereeOrg,
            transfer_date: result.data!.transferDate,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      body: CreateTupeTransferSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Create a new TUPE transfer",
        description:
          "Create a new TUPE transfer for tracking a business transfer under " +
          "the Transfer of Undertakings (Protection of Employment) Regulations 2006. " +
          "Created in 'planning' status.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Update TUPE Transfer
  // ===========================================================================

  .patch(
    "/:id",
    async (ctx) => {
      const { tupeService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as UpdateTupeTransfer;
      const result = await tupeService.updateTransfer(
        tenantContext,
        params.id,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TUPE_TRANSFER_UPDATED",
          resourceType: "tupe_transfer",
          resourceId: params.id,
          newValues: typedBody,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      params: IdParamsSchema,
      body: UpdateTupeTransferSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Update a TUPE transfer",
        description:
          "Update TUPE transfer details including status transitions. " +
          "Valid transitions: planning -> consultation -> in_progress -> completed. " +
          "Transfers can also be cancelled from consultation or in_progress states. " +
          "Terminal states (completed, cancelled) only allow notes updates.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Delete TUPE Transfer
  // ===========================================================================

  .delete(
    "/:id",
    async (ctx) => {
      const { tupeService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tupeService.deleteTransfer(
        tenantContext,
        params.id,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TUPE_TRANSFER_DELETED",
          resourceType: "tupe_transfer",
          resourceId: params.id,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Delete a TUPE transfer",
        description:
          "Delete a TUPE transfer. Only transfers in 'planning' status can be deleted.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Status Transition History
  // ===========================================================================

  .get(
    "/:id/history",
    async (ctx) => {
      const { tupeService, params, tenantContext, error } =
        ctx as typeof ctx & TupePluginContext;

      const result = await tupeService.getStatusHistory(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return { history: result.data, count: result.data!.length };
    },
    {
      beforeHandle: [requirePermission("hr", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get TUPE transfer status history",
        description:
          "Get the full status transition history for a TUPE transfer, " +
          "ordered chronologically.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // List Affected Employees
  // ===========================================================================

  .get(
    "/:id/employees",
    async (ctx) => {
      const { tupeService, params, query, tenantContext, error } =
        ctx as typeof ctx & TupePluginContext;
      const { cursor, limit } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await tupeService.listAffectedEmployees(
        tenantContext,
        params.id,
        { cursor, limit: parsedLimit }
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "read")],
      params: IdParamsSchema,
      query: t.Partial(PaginationQuerySchema),
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "List affected employees for a TUPE transfer",
        description:
          "List all employees affected by a TUPE transfer with cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Add Affected Employee
  // ===========================================================================

  .post(
    "/:id/employees",
    async (ctx) => {
      const { tupeService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tupeService.addAffectedEmployee(
        tenantContext,
        params.id,
        body as unknown as AddAffectedEmployee,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TUPE_EMPLOYEE_ADDED",
          resourceType: "tupe_affected_employee",
          resourceId: result.data!.id as string,
          newValues: {
            transfer_id: params.id,
            employee_id: result.data!.employeeId,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      ctx.set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      params: IdParamsSchema,
      body: AddAffectedEmployeeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Add affected employee to TUPE transfer",
        description:
          "Add an employee to the list of those affected by a TUPE transfer. " +
          "Employee consent status is initially set to 'pending'.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Update Employee Consent
  // ===========================================================================

  .put(
    "/:id/employees/:empId/consent",
    async (ctx) => {
      const { tupeService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const typedBody = body as unknown as UpdateConsent;
      const result = await tupeService.updateConsent(
        tenantContext,
        params.id,
        params.empId,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TUPE_CONSENT_UPDATED",
          resourceType: "tupe_affected_employee",
          resourceId: `${params.id}:${params.empId}`,
          newValues: {
            consent_status: typedBody.consentStatus,
            new_terms_accepted: typedBody.newTermsAccepted,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      params: TransferEmployeeParamsSchema,
      body: UpdateConsentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Update employee consent for TUPE transfer",
        description:
          "Record an employee's consent or objection to a TUPE transfer. " +
          "Under TUPE Regulation 4(7), an employee may object to the transfer of " +
          "their employment. If they object, their employment terminates with the " +
          "transferor on the transfer date.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Remove Affected Employee
  // ===========================================================================

  .delete(
    "/:id/employees/:empId",
    async (ctx) => {
      const { tupeService, params, headers, tenantContext, audit, requestId, error } =
        ctx as typeof ctx & TupePluginContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await tupeService.removeAffectedEmployee(
        tenantContext,
        params.id,
        params.empId,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          tupeErrorStatusMap
        );
        return error(status, { error: result.error });
      }

      if (audit) {
        await audit.log({
          action: "TUPE_EMPLOYEE_REMOVED",
          resourceType: "tupe_affected_employee",
          resourceId: `${params.id}:${params.empId}`,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("hr", "write")],
      params: TransferEmployeeParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Remove affected employee from TUPE transfer",
        description:
          "Remove an employee from the list of those affected by a TUPE transfer. " +
          "Cannot remove employees from completed or cancelled transfers.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type TupeRoutes = typeof tupeRoutes;
