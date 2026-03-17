/**
 * Data Import Module - Elysia Routes
 *
 * Defines the API endpoints for structured CSV data import.
 * All routes require authentication and the 'data_import:write' or 'data_import:read'
 * permission.
 *
 * Endpoints:
 * - POST   /data-import/upload         - Upload a CSV file and create an import job
 * - POST   /data-import/:id/validate   - Validate rows against schema (dry run)
 * - POST   /data-import/:id/execute    - Commit validated rows to the database
 * - GET    /data-import                - List import jobs (cursor-based pagination)
 * - GET    /data-import/:id            - Get a single import job's status
 * - GET    /data-import/:id/errors     - Get detailed per-row error information
 *
 * Status codes:
 * - 200  Success (GET, POST execute/validate)
 * - 201  Created (POST upload)
 * - 400  Validation error (bad CSV, missing columns, bad params)
 * - 404  Job not found
 * - 409  Invalid state transition (e.g., execute on pending job)
 * - 500  Internal server error
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapServiceError } from "../../lib/route-errors";
import type { DatabaseClient } from "../../plugins/db";
import { DataImportRepository } from "./repository";
import { DataImportService } from "./service";
import {
  ImportJobIdParamsSchema,
  ListImportJobsQuerySchema,
  ImportErrorsQuerySchema,
  ImportJobResponseSchema,
  ImportJobListResponseSchema,
  ImportErrorsResponseSchema,
  ImportValidationResultSchema,
  ImportExecutionResultSchema,
  IdempotencyHeaderSchema,
  ImportTypeSchema,
} from "./schemas";
import { ErrorResponseSchema } from "../../lib/route-helpers";

// =============================================================================
// Routes
// =============================================================================

export const dataImportRoutes = new Elysia({
  prefix: "/data-import",
  name: "data-import-routes",
})
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new DataImportRepository(db);
    const service = new DataImportService(repository);
    return { importService: service };
  })

  // ===========================================================================
  // POST /data-import/upload - Upload CSV and create import job
  // ===========================================================================
  .post(
    "/upload",
    async (ctx) => {
      const { importService, tenantContext, body, set, requestId } = ctx as any;

      const result = await importService.uploadCsv(
        tenantContext!,
        body.import_type,
        body.file
      );

      if (!result.success) {
        return mapServiceError(result.error, set, requestId);
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_import", "write")],
      body: t.Object({
        import_type: ImportTypeSchema,
        file: t.File({
          maxSize: 5 * 1024 * 1024, // 5MB
        }),
      }),
      response: {
        201: ImportJobResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      type: "multipart/form-data",
      detail: {
        tags: ["Data Import"],
        summary: "Upload CSV for import",
        description:
          "Upload a CSV file to create a new data import job. The job starts " +
          "in 'pending' status. Call POST /data-import/:id/validate to validate rows " +
          "before committing. Maximum file size: 5MB, maximum rows: 5000.",
      },
    }
  )

  // ===========================================================================
  // POST /data-import/:id/validate - Validate import job rows
  // ===========================================================================
  .post(
    "/:id/validate",
    async (ctx) => {
      const { importService, tenantContext, params, body, set, requestId } = ctx as any;

      // Read the file content for validation
      let fileContent: string;
      try {
        fileContent = await body.file.text();
      } catch {
        set.status = 400;
        return {
          error: {
            code: "VALIDATION_ERROR",
            message: "Failed to read uploaded file for validation",
            requestId,
          },
        };
      }

      const result = await importService.validateJob(
        tenantContext!,
        params.id,
        fileContent
      );

      if (!result.success) {
        return mapServiceError(result.error, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_import", "write")],
      params: ImportJobIdParamsSchema,
      body: t.Object({
        file: t.File({ maxSize: 5 * 1024 * 1024 }),
      }),
      response: {
        200: ImportValidationResultSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      type: "multipart/form-data",
      detail: {
        tags: ["Data Import"],
        summary: "Validate import job",
        description:
          "Parse and validate each row of the CSV against the import type schema. " +
          "The CSV file must be re-uploaded for validation. Returns per-row errors. " +
          "If all rows are valid, job moves to 'validated' status. " +
          "If no valid rows exist, job moves to 'failed'.",
      },
    }
  )

  // ===========================================================================
  // POST /data-import/:id/execute - Execute (commit) validated import
  // ===========================================================================
  .post(
    "/:id/execute",
    async (ctx) => {
      const { importService, tenantContext, params, set, requestId } = ctx as any;

      const result = await importService.executeJob(tenantContext!, params.id);

      if (!result.success) {
        return mapServiceError(result.error, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_import", "write")],
      params: ImportJobIdParamsSchema,
      response: {
        200: ImportExecutionResultSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      headers: IdempotencyHeaderSchema,
      detail: {
        tags: ["Data Import"],
        summary: "Execute validated import",
        description:
          "Commit all validated rows from the import job to the database. " +
          "Only jobs in 'validated' status can be executed. " +
          "All rows are inserted within a single transaction with outbox events. " +
          "On success, job moves to 'completed'. On total failure, 'failed'.",
      },
    }
  )

  // ===========================================================================
  // GET /data-import - List import jobs
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { importService, tenantContext, query } = ctx as any;

      const result = await importService.listJobs(tenantContext!, {
        cursor: query.cursor,
        limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
        status: query.status,
        import_type: query.import_type,
      });

      return result;
    },
    {
      beforeHandle: [requirePermission("data_import", "read")],
      query: ListImportJobsQuerySchema,
      response: {
        200: ImportJobListResponseSchema,
      },
      detail: {
        tags: ["Data Import"],
        summary: "List import jobs",
        description:
          "List import jobs for the current tenant with cursor-based pagination. " +
          "Filter by status and/or import_type.",
      },
    }
  )

  // ===========================================================================
  // GET /data-import/:id - Get import job status
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { importService, tenantContext, params, set, requestId } = ctx as any;

      const result = await importService.getJob(tenantContext!, params.id);

      if (!result.success) {
        return mapServiceError(result.error, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_import", "read")],
      params: ImportJobIdParamsSchema,
      response: {
        200: ImportJobResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Import"],
        summary: "Get import job status",
        description:
          "Retrieve the current status and summary of an import job, " +
          "including row counts and error count.",
      },
    }
  )

  // ===========================================================================
  // GET /data-import/:id/errors - Get import job errors
  // ===========================================================================
  .get(
    "/:id/errors",
    async (ctx) => {
      const { importService, tenantContext, params, query, set, requestId } = ctx as any;

      const result = await importService.getJobErrors(tenantContext!, params.id, {
        cursor: query.cursor,
        limit: query.limit !== undefined && query.limit !== null ? Number(query.limit) : undefined,
      });

      if (!result.success) {
        return mapServiceError(result.error, set, requestId);
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("data_import", "read")],
      params: ImportJobIdParamsSchema,
      query: ImportErrorsQuerySchema,
      response: {
        200: ImportErrorsResponseSchema,
        404: ErrorResponseSchema,
      },
      detail: {
        tags: ["Data Import"],
        summary: "Get import job errors",
        description:
          "Retrieve per-row error details for an import job with cursor-based pagination. " +
          "Useful for displaying validation errors to the user before executing the import.",
      },
    }
  );

export type DataImportRoutes = typeof dataImportRoutes;
