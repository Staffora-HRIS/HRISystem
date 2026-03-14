/**
 * Contract Statements Module - Elysia Routes
 *
 * API endpoints for generating and managing UK Written Statements
 * of Employment Particulars (Employment Rights Act 1996 s.1-7B).
 *
 * Since 6 April 2020, all UK employees must receive a written statement
 * on or before their first day of work containing all 12 legally required
 * particulars.
 *
 * Permission model:
 * - employees: read  (viewing statements, compliance report)
 * - employees: write (generating, issuing, acknowledging statements)
 *
 * Endpoints:
 * - POST  /contract-statements/generate/:employeeId  - Generate a statement
 * - GET   /contract-statements                        - List all statements (tenant-wide)
 * - GET   /contract-statements/compliance             - Compliance status report
 * - GET   /contract-statements/:id                    - Get a single statement
 * - PATCH /contract-statements/:id/issue              - Issue a statement
 * - PATCH /contract-statements/:id/acknowledge        - Acknowledge a statement
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import type { AuditHelper } from "../../plugins/audit";
import {
  ErrorResponseSchema,
  mapErrorToStatus,
} from "../../lib/route-helpers";
import type { DatabaseClient } from "../../plugins/db";
import { ContractStatementsRepository } from "./repository";
import { ContractStatementsService } from "./service";
import {
  GenerateStatementBodySchema,
  IssueStatementSchema,
  AcknowledgeStatementSchema,
  ContractStatementResponseSchema,
  StatementListResponseSchema,
  ComplianceStatusResponseSchema,
  AllStatementsFiltersSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  OptionalIdempotencyHeaderSchema,
  type GenerateStatementBody,
  type IssueStatement as IssueStatementType,
  type AcknowledgeStatement as AcknowledgeStatementType,
  type AllStatementsFilters,
} from "./schemas";

// =============================================================================
// Route Context Types
// =============================================================================

/**
 * Plugin-injected properties that Elysia's type system cannot infer.
 * Used via `ctx as unknown as ContractStatementsRouteContext` to preserve
 * Elysia's native typing for body/params/query/error/set while adding
 * the plugin-derived properties.
 */
interface ContractStatementsPluginContext {
  contractStatementsService: ContractStatementsService;
  tenantContext: { tenantId: string; userId?: string } | null;
  audit: AuditHelper | null;
  requestId: string;
  error: (status: number, body: unknown) => never;
}

interface ContractStatementsRouteContext extends ContractStatementsPluginContext {
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  headers: Record<string, string | undefined>;
  set: { status: number };
}

/**
 * Module-specific error code to HTTP status mapping
 */
const errorStatusMap: Record<string, number> = {
  STATEMENT_ALREADY_ISSUED: 409,
  STATEMENT_ALREADY_ACKNOWLEDGED: 409,
  STATEMENT_NOT_ISSUED: 400,
};

/**
 * Contract Statements routes
 */
export const contractStatementsRoutes = new Elysia({
  prefix: "/contract-statements",
  name: "contract-statements-routes",
})

  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as unknown as { db: DatabaseClient };
    const repository = new ContractStatementsRepository(db);
    const service = new ContractStatementsService(repository, db);

    return { contractStatementsService: service };
  })

  // ===========================================================================
  // POST /generate/:employeeId - Generate a written statement
  // ===========================================================================
  .post(
    "/generate/:employeeId",
    async (ctx) => {
      const {
        contractStatementsService,
        body,
        params,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
        set,
      } = ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as GenerateStatementBody;

      const result = await contractStatementsService.generateStatement(
        tenantContext,
        params.employeeId,
        typedBody,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          errorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the generation
      if (audit) {
        await audit.log({
          action: "hr.contract_statement.generated",
          resourceType: "contract_statement",
          resourceId: result.data!.id,
          newValues: {
            employee_id: params.employeeId,
            contract_id: result.data!.contract_id,
            statement_type: result.data!.statement_type,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: EmployeeIdParamsSchema,
      body: GenerateStatementBodySchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: ContractStatementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "Generate written statement for employee",
        description:
          "Generate a UK Written Statement of Employment Particulars for an employee. " +
          "Gathers all 12 legally required Section 1 particulars from employee, contract, " +
          "position, compensation, and leave records. If no contract_id is provided in the " +
          "body, the current effective contract is used automatically.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /compliance - Compliance status report
  // ===========================================================================
  // NOTE: This must be defined BEFORE /:id to avoid route conflicts
  .get(
    "/compliance",
    async (ctx) => {
      const {
        contractStatementsService,
        tenantContext,
        error,
      } = ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const result =
        await contractStatementsService.checkComplianceStatus(tenantContext);

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          errorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      response: {
        200: ComplianceStatusResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "Compliance status report",
        description:
          "Get a compliance status report showing which employees have received " +
          "their day-one written statement as required by UK law since 6 April 2020. " +
          "Returns counts, compliance percentage, and a list of overdue employees.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET / - List all statements (tenant-wide with optional filters)
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const {
        contractStatementsService,
        query,
        tenantContext,
        error,
      } = ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const { cursor, limit, ...filters } = query;
      const result = await contractStatementsService.listAllStatements(
        tenantContext,
        filters as unknown as AllStatementsFilters,
        {
          cursor: cursor as string | undefined,
          limit:
            limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      query: t.Intersect([PaginationQuerySchema, AllStatementsFiltersSchema]),
      response: {
        200: StatementListResponseSchema,
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "List all statements",
        description:
          "List all written statements for the tenant with optional filters " +
          "(employee_id, statement_type, issued, acknowledged) and cursor-based pagination.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // GET /:id - Get a single statement
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { contractStatementsService, params, tenantContext, error } =
        ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const result = await contractStatementsService.getStatement(
        tenantContext,
        params.id
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          errorStatusMap
        );
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: IdParamsSchema,
      response: {
        200: ContractStatementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "Get statement by ID",
        description:
          "Get a single written statement with full content including all " +
          "12 legally required particulars.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/issue - Issue a statement to the employee
  // ===========================================================================
  .patch(
    "/:id/issue",
    async (ctx) => {
      const {
        contractStatementsService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as IssueStatementType | undefined;

      const result = await contractStatementsService.issueStatement(
        tenantContext,
        params.id,
        typedBody?.issued_at,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          errorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the issuance
      if (audit) {
        await audit.log({
          action: "hr.contract_statement.issued",
          resourceType: "contract_statement",
          resourceId: params.id,
          newValues: {
            issued_at: result.data!.issued_at,
            employee_id: result.data!.employee_id,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: IssueStatementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ContractStatementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "Issue statement",
        description:
          "Mark a written statement as formally issued to the employee. " +
          "UK law requires this happens on or before the employee's first day.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // PATCH /:id/acknowledge - Acknowledge receipt of statement
  // ===========================================================================
  .patch(
    "/:id/acknowledge",
    async (ctx) => {
      const {
        contractStatementsService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as unknown as ContractStatementsRouteContext;

      if (!tenantContext) {
        return error(400, {
          error: { code: "MISSING_TENANT", message: "Tenant context required" },
        });
      }

      const idempotencyKey = headers["idempotency-key"];
      const typedBody = body as unknown as AcknowledgeStatementType | undefined;

      const result = await contractStatementsService.markAcknowledged(
        tenantContext,
        params.id,
        typedBody?.acknowledged_at,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(
          result.error?.code || "INTERNAL_ERROR",
          errorStatusMap
        );
        return error(status, { error: result.error });
      }

      // Audit log the acknowledgement
      if (audit) {
        await audit.log({
          action: "hr.contract_statement.acknowledged",
          resourceType: "contract_statement",
          resourceId: params.id,
          newValues: {
            acknowledged_at: result.data!.acknowledged_at,
            employee_id: result.data!.employee_id,
          },
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: AcknowledgeStatementSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: ContractStatementResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Contract Statements"],
        summary: "Acknowledge statement",
        description:
          "Mark a written statement as acknowledged by the employee. " +
          "The statement must be issued first before it can be acknowledged.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type ContractStatementsRoutes = typeof contractStatementsRoutes;
