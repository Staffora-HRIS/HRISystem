/**
 * Consent Management Module - Elysia Routes
 *
 * Defines the API endpoints for GDPR consent management.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - consent:purposes: read, write
 * - consent:records: read, write
 * - consent:dashboard: read
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import { ErrorResponseSchema, mapErrorToStatus } from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ConsentRepository } from "./repository";
import { ConsentService } from "./service";
import {
  // Purpose schemas
  CreateConsentPurposeSchema,
  UpdateConsentPurposeSchema,
  ConsentPurposeResponseSchema,
  ConsentPurposeFiltersSchema,
  // Record schemas
  GrantConsentSchema,
  WithdrawConsentSchema,
  ConsentRecordResponseSchema,
  ConsentRecordFiltersSchema,
  // Check schema
  ConsentCheckResponseSchema,
  ConsentCheckParamsSchema,
  // Dashboard
  ConsentDashboardResponseSchema,
  // Common
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  // Types
  type CreateConsentPurpose,
  type UpdateConsentPurpose,
  type GrantConsent,
  type WithdrawConsent,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as typeof ctx & ConsentPluginContext` to preserve Elysia's
 * native typing for body/params/query/error/set while adding the
 * plugin-derived properties.
 */
interface ConsentPluginContext {
  consentService: ConsentService;
  consentRepository: ConsentRepository;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
  request: Request;
  error: (status: number, body: unknown) => never;
}

/**
 * Consent module-specific error codes beyond the shared base set
 */
const consentErrorStatusMap: Record<string, number> = {
  INACTIVE_PURPOSE: 400,
  ALREADY_GRANTED: 409,
  ALREADY_WITHDRAWN: 400,
};

/**
 * Create Consent routes plugin
 */
export const consentRoutes = new Elysia({ prefix: "/consent", name: "consent-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ConsentRepository(db);
    const service = new ConsentService(repository, db);
    return { consentService: service, consentRepository: repository };
  })

  // ===========================================================================
  // Consent Purpose Routes
  // ===========================================================================

  // GET /purposes - List consent purposes
  .get(
    "/purposes",
    async (ctx) => {
      const { consentService, query, tenantContext } = ctx as typeof ctx & ConsentPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await consentService.listPurposes(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      query: t.Composite([
        t.Partial(ConsentPurposeFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(ConsentPurposeResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Consent"],
        summary: "List consent purposes",
        description: "List all consent purposes with optional filters and cursor pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /purposes/:id - Get purpose by ID
  .get(
    "/purposes/:id",
    async (ctx) => {
      const { consentService, params, tenantContext, error } = ctx as typeof ctx & ConsentPluginContext;
      const result = await consentService.getPurpose(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      params: IdParamsSchema,
      response: {
        200: ConsentPurposeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Get consent purpose",
        description: "Get a consent purpose by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /purposes - Create consent purpose
  .post(
    "/purposes",
    async (ctx) => {
      const { consentService, body, tenantContext, audit, requestId, error, set } = ctx as typeof ctx & ConsentPluginContext;

      const result = await consentService.createPurpose(tenantContext, body as unknown as CreateConsentPurpose);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "consent.purpose.created",
          resourceType: "consent_purpose",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "write")],
      body: CreateConsentPurposeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ConsentPurposeResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Create consent purpose",
        description: "Define a new consent purpose for GDPR data processing",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PATCH /purposes/:id - Update consent purpose (may bump version)
  .patch(
    "/purposes/:id",
    async (ctx) => {
      const { consentService, params, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & ConsentPluginContext;

      // Get current state for audit
      const oldResult = await consentService.getPurpose(tenantContext, params.id);

      const result = await consentService.updatePurpose(tenantContext, params.id, body as unknown as UpdateConsentPurpose);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "consent.purpose.updated",
          resourceType: "consent_purpose",
          resourceId: params.id,
          oldValues: oldResult.success ? oldResult.data : undefined,
          newValues: result.data,
          metadata: { requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "write")],
      params: IdParamsSchema,
      body: UpdateConsentPurposeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ConsentPurposeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Update consent purpose",
        description: "Update a consent purpose. Changes to name, description, data categories, or retention period will bump the version, potentially requiring re-consent from employees.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Consent Record Routes
  // ===========================================================================

  // GET /records - List consent records
  .get(
    "/records",
    async (ctx) => {
      const { consentService, query, tenantContext } = ctx as typeof ctx & ConsentPluginContext;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;

      const result = await consentService.listRecords(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      query: t.Composite([
        t.Partial(ConsentRecordFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(ConsentRecordResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Consent"],
        summary: "List consent records",
        description: "List consent records with optional filters (employee, purpose, status)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /records/grant - Grant consent
  .post(
    "/records/grant",
    async (ctx) => {
      const { consentService, body, tenantContext, audit, requestId, error, set, request } = ctx as typeof ctx & ConsentPluginContext;

      // Capture request metadata for GDPR proof of consent
      const ipAddress = request?.headers?.get?.("x-forwarded-for")
        || request?.headers?.get?.("x-real-ip")
        || null;
      const userAgent = request?.headers?.get?.("user-agent") || null;

      const typedBody = body as unknown as GrantConsent;
      const result = await consentService.grantConsent(
        tenantContext,
        typedBody.employee_id,
        typedBody.consent_purpose_id,
        typedBody.consent_method,
        {
          ipAddress,
          userAgent,
          expiresAt: typedBody.expires_at,
        }
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "consent.record.granted",
          resourceType: "consent_record",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            requestId,
            employeeId: typedBody.employee_id,
            purposeId: typedBody.consent_purpose_id,
            method: typedBody.consent_method,
          },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "write")],
      body: GrantConsentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ConsentRecordResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Grant consent",
        description: "Record that an employee has granted consent for a specific purpose. Captures IP address and user agent as proof of consent per GDPR requirements.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /records/withdraw - Withdraw consent
  .post(
    "/records/withdraw",
    async (ctx) => {
      const { consentService, body, tenantContext, audit, requestId, error } = ctx as typeof ctx & ConsentPluginContext;

      const typedBody = body as unknown as WithdrawConsent;
      const result = await consentService.withdrawConsent(
        tenantContext,
        typedBody.employee_id,
        typedBody.consent_purpose_id,
        typedBody.withdrawal_reason
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log
      if (audit) {
        await audit.log({
          action: "consent.record.withdrawn",
          resourceType: "consent_record",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: {
            requestId,
            employeeId: typedBody.employee_id,
            purposeId: typedBody.consent_purpose_id,
            reason: typedBody.withdrawal_reason,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "write")],
      body: WithdrawConsentSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ConsentRecordResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Withdraw consent",
        description: "Withdraw a previously granted consent. Per GDPR, withdrawal must be as easy as granting consent.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Consent Routes
  // ===========================================================================

  // GET /employees/:employeeId/consents - Employee consent overview
  .get(
    "/employees/:employeeId/consents",
    async (ctx) => {
      const { consentService, params, tenantContext, error } = ctx as typeof ctx & ConsentPluginContext;

      const result = await consentService.getEmployeeConsents(
        tenantContext,
        params.employeeId
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        200: t.Array(ConsentRecordResponseSchema),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Get employee consents",
        description: "Get all consent records for a specific employee, including purpose details and re-consent requirements",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:employeeId/check/:purposeCode - Quick consent check
  .get(
    "/employees/:employeeId/check/:purposeCode",
    async (ctx) => {
      const { consentService, params, tenantContext, error } = ctx as typeof ctx & ConsentPluginContext;

      const result = await consentService.checkConsent(
        tenantContext,
        params.employeeId,
        params.purposeCode
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      params: ConsentCheckParamsSchema,
      response: {
        200: ConsentCheckResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Check employee consent",
        description: "Quick check whether an employee has active consent for a specific purpose code. Returns consent status, re-consent requirements, and expiry information.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Dashboard & Stale Consents
  // ===========================================================================

  // GET /dashboard - Consent statistics
  .get(
    "/dashboard",
    async (ctx) => {
      const { consentService, tenantContext, error } = ctx as typeof ctx & ConsentPluginContext;

      const result = await consentService.getConsentDashboard(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      response: {
        200: ConsentDashboardResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Consent dashboard",
        description: "Get consent management statistics including counts by status, re-consent requirements, and expiring consents",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /stale - Consents requiring re-consent
  .get(
    "/stale",
    async (ctx) => {
      const { consentService, tenantContext, error } = ctx as typeof ctx & ConsentPluginContext;

      const result = await consentService.findStaleConsents(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", consentErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("consent", "read")],
      response: {
        200: t.Array(ConsentRecordResponseSchema),
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Consent"],
        summary: "Stale consents",
        description: "Find consent records that require re-consent because the purpose version has changed since consent was given",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ConsentRoutes = typeof consentRoutes;
