/**
 * Emergency Contacts Module - Elysia Routes
 *
 * Defines the API endpoints for emergency contact operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - employees: read  (for listing/viewing emergency contacts)
 * - employees: write (for creating/updating/deleting emergency contacts)
 *
 * Routes:
 * - GET    /employees/:employeeId/emergency-contacts     - List contacts for employee
 * - POST   /employees/:employeeId/emergency-contacts     - Create contact for employee
 * - PATCH  /emergency-contacts/:id                       - Update a contact
 * - DELETE /emergency-contacts/:id                       - Delete a contact
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { EmergencyContactRepository } from "./repository";
import { EmergencyContactService } from "./service";
import {
  CreateEmergencyContactSchema,
  UpdateEmergencyContactSchema,
  EmergencyContactResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type CreateEmergencyContact,
  type UpdateEmergencyContact,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface EmergencyContactPluginContext {
  ecService: EmergencyContactService;
  ecRepository: EmergencyContactRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface EmergencyContactRouteContext extends EmergencyContactPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Create Emergency Contact routes plugin
 */
export const emergencyContactRoutes = new Elysia({ name: "emergency-contact-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new EmergencyContactRepository(db);
    const service = new EmergencyContactService(repository, db);

    return { ecService: service, ecRepository: repository };
  })

  // ===========================================================================
  // Employee-Scoped Routes
  // ===========================================================================

  // GET /employees/:employeeId/emergency-contacts - List contacts for employee
  .get(
    "/employees/:employeeId/emergency-contacts",
    async (ctx) => {
      const { ecService, params, query, tenantContext } = ctx as unknown as EmergencyContactRouteContext;
      const { cursor, limit } = query;

      const result = await ecService.listByEmployee(
        tenantContext,
        params.employeeId,
        { cursor, limit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: EmployeeIdParamsSchema,
      query: t.Partial(PaginationQuerySchema),
      response: t.Object({
        items: t.Array(EmergencyContactResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["HR"],
        summary: "List emergency contacts for an employee",
        description:
          "Returns all emergency contacts for the specified employee with cursor-based pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/emergency-contacts - Create contact
  .post(
    "/employees/:employeeId/emergency-contacts",
    async (ctx) => {
      const { ecService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as EmergencyContactRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await ecService.create(
        tenantContext,
        params.employeeId,
        body as unknown as CreateEmergencyContact,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "emergency_contact",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId, employeeId: params.employeeId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: EmployeeIdParamsSchema,
      body: CreateEmergencyContactSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: EmergencyContactResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Create an emergency contact",
        description:
          "Create a new emergency contact for the specified employee. " +
          "If is_primary is true, the primary flag on any existing primary contact is cleared.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Contact-Scoped Routes
  // ===========================================================================

  // PATCH /emergency-contacts/:id - Update a contact
  .patch(
    "/emergency-contacts/:id",
    async (ctx) => {
      const { ecService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as EmergencyContactRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await ecService.getById(tenantContext, params.id);

      const result = await ecService.update(
        tenantContext,
        params.id,
        body as unknown as UpdateEmergencyContact,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "emergency_contact",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: result.data?.employeeId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: UpdateEmergencyContactSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmergencyContactResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Update an emergency contact",
        description:
          "Update fields on an existing emergency contact. " +
          "If is_primary is set to true, the primary flag on other contacts for the same employee is cleared.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /emergency-contacts/:id - Delete a contact
  .delete(
    "/emergency-contacts/:id",
    async (ctx) => {
      const { ecService, params, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as EmergencyContactRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await ecService.getById(tenantContext, params.id);

      const result = await ecService.delete(tenantContext, params.id, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "emergency_contact",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: oldResult.data?.employeeId,
          },
        });
      }

      return { success: true as const, message: "Emergency contact deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Delete an emergency contact",
        description: "Permanently delete an emergency contact record",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type EmergencyContactRoutes = typeof emergencyContactRoutes;
