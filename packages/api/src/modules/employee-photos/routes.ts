/**
 * Employee Photos Module - Elysia Routes
 *
 * Defines the API endpoints for employee photo management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - employees: read  (for viewing photo metadata)
 * - employees: write (for uploading, updating, and deleting photos)
 *
 * Data model note:
 * The employee_photos table enforces a single photo per employee via
 * UNIQUE (tenant_id, employee_id). Upload performs an upsert (create or replace).
 *
 * Routes:
 * - GET    /employees/:employeeId/photos  - Get current photo metadata
 * - POST   /employees/:employeeId/photos  - Upload (create/replace) photo
 * - PATCH  /employees/:employeeId/photos  - Update photo metadata (same as upload, partial)
 * - DELETE /employees/:employeeId/photos  - Delete photo
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AuditActions } from "../../plugins/audit";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { EmployeePhotosRepository } from "./repository";
import { EmployeePhotosService } from "./service";
import {
  UploadPhotoSchema,
  PhotoResponseSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type UploadPhoto,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

interface PhotoPluginContext {
  photoService: EmployeePhotosService;
  photoRepository: EmployeePhotosRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface PhotoRouteContext extends PhotoPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Create Employee Photo routes plugin
 */
export const employeePhotoRoutes = new Elysia({ name: "employee-photo-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new EmployeePhotosRepository(db);
    const service = new EmployeePhotosService(repository, db);

    return { photoService: service, photoRepository: repository };
  })

  // ===========================================================================
  // Routes
  // ===========================================================================

  // GET /employees/:employeeId/photos - Get current photo metadata
  .get(
    "/employees/:employeeId/photos",
    async (ctx) => {
      const { photoService, params, tenantContext, error } = ctx as unknown as PhotoRouteContext;

      const result = await photoService.getPhoto(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: PhotoResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Get employee photo metadata",
        description:
          "Returns the current profile photo metadata for the specified employee. " +
          "Each employee can have at most one photo.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:employeeId/photos - Upload (create/replace) photo
  .post(
    "/employees/:employeeId/photos",
    async (ctx) => {
      const { photoService, params, body, headers, tenantContext, audit, requestId, error, set } =
        ctx as unknown as PhotoRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      const result = await photoService.uploadPhoto(
        tenantContext,
        params.employeeId,
        body as unknown as UploadPhoto
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_photo",
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
      body: UploadPhotoSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: PhotoResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Upload an employee photo",
        description:
          "Upload or replace the profile photo metadata for the specified employee. " +
          "The actual file upload is handled externally (e.g. via a presigned URL); " +
          "this endpoint stores the file reference metadata. " +
          "If a photo already exists, it will be replaced.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /employees/:employeeId/photos - Update photo metadata
  .patch(
    "/employees/:employeeId/photos",
    async (ctx) => {
      const { photoService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as PhotoRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit diff
      const oldResult = await photoService.getPhoto(tenantContext, params.employeeId);

      const result = await photoService.uploadPhoto(
        tenantContext,
        params.employeeId,
        body as unknown as UploadPhoto
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_photo",
          resourceId: result.data!.id,
          oldValues: oldResult.success ? oldResult.data : undefined,
          newValues: result.data,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: EmployeeIdParamsSchema,
      body: UploadPhotoSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PhotoResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Update employee photo metadata",
        description:
          "Update the profile photo metadata for the specified employee. " +
          "This performs an upsert; if no photo exists, one will be created.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /employees/:employeeId/photos - Delete photo
  .delete(
    "/employees/:employeeId/photos",
    async (ctx) => {
      const { photoService, params, headers, tenantContext, audit, requestId, error } =
        ctx as unknown as PhotoRouteContext;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await photoService.getPhoto(tenantContext, params.employeeId);

      const result = await photoService.deletePhoto(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR");
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_photo",
          resourceId: oldResult.data?.id ?? params.employeeId,
          oldValues: oldResult.success ? oldResult.data : undefined,
          metadata: {
            idempotencyKey,
            requestId,
            employeeId: params.employeeId,
          },
        });
      }

      return { success: true as const, message: "Employee photo deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: EmployeeIdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["HR"],
        summary: "Delete an employee photo",
        description: "Permanently delete the profile photo metadata for the specified employee",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type EmployeePhotoRoutes = typeof employeePhotoRoutes;
