/**
 * Core HR Module - Elysia Routes
 *
 * Defines the API endpoints for Core HR operations.
 * All routes require authentication and appropriate permissions.
 *
 * Permission model:
 * - org_units: read, write, delete
 * - positions: read, write, delete
 * - employees: read, write, delete
 * - employees:compensation: read, write
 * - employees:history: read
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { AppError, NotFoundError, ConflictError } from "../../plugins/errors";
import { AuditActions } from "../../plugins/audit";
import { ErrorResponseSchema, DeleteSuccessSchema, mapErrorToStatus } from "../../lib/route-helpers";
import { HRRepository, type TenantContext } from "./repository";
import { HRService } from "./service";
import {
  // Schemas
  CreateOrgUnitSchema,
  UpdateOrgUnitSchema,
  OrgUnitResponseSchema,
  OrgUnitFiltersSchema,
  CreatePositionSchema,
  UpdatePositionSchema,
  PositionResponseSchema,
  PositionFiltersSchema,
  CreateEmployeeSchema,
  UpdateEmployeePersonalSchema,
  UpdateEmployeeContractSchema,
  UpdateEmployeePositionSchema,
  UpdateEmployeeCompensationSchema,
  UpdateEmployeeManagerSchema,
  EmployeeStatusTransitionSchema,
  EmployeeTerminationSchema,
  EmployeeResponseSchema,
  EmployeeListResponseSchema,
  EmployeeFiltersSchema,
  EmployeeHistoryResponseSchema,
  PaginationQuerySchema,
  IdParamsSchema,
  EmployeeNumberParamsSchema,
  HistoryDimensionParamsSchema,
  IdempotencyHeaderSchema,
  OptionalIdempotencyHeaderSchema,
  UuidSchema,
  DateSchema,
  HistoryDimensionSchema,
  type HistoryDimension,
} from "./schemas";

/**
 * HR module-specific error codes beyond the shared base set
 */
const hrErrorStatusMap: Record<string, number> = {
  INVALID_PARENT: 400,
  INACTIVE_PARENT: 400,
  CIRCULAR_HIERARCHY: 400,
  HAS_CHILDREN: 400,
  HAS_EMPLOYEES: 400,
  HAS_ASSIGNMENTS: 400,
  INVALID_ORG_UNIT: 400,
  INVALID_SALARY_RANGE: 400,
  POSITION_NOT_FOUND: 400,
  POSITION_OVERFILLED: 400,
  ORG_UNIT_NOT_FOUND: 400,
  MANAGER_NOT_FOUND: 400,
  INVALID_MANAGER: 400,
  TERMINATED: 400,
  CIRCULAR_REPORTING: 400,
  ALREADY_TERMINATED: 409,
  CANNOT_TERMINATE_PENDING: 400,
  INVALID_TERMINATION_DATE: 400,
  INVALID_DIMENSION: 400,
};

/**
 * Create HR routes plugin
 */
export const hrRoutes = new Elysia({ prefix: "/hr", name: "hr-routes" })
  // ===========================================================================
  // Plugin Setup - Service Instantiation
  // ===========================================================================
  .derive((ctx) => {
    const { db } = ctx as any;
    // Create repository and service with database client from db plugin
    const repository = new HRRepository(db);
    const service = new HRService(repository, db);

    return { hrService: service, hrRepository: repository };
  })

  // ===========================================================================
  // Org Unit Routes
  // ===========================================================================

  // GET /org-units - List org units
  .get(
    "/org-units",
    async (ctx) => {
      const { hrService, query, tenantContext, error } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await hrService.listOrgUnits(
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
      beforeHandle: [requirePermission("org", "read")],
      query: t.Composite([
        t.Partial(OrgUnitFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(OrgUnitResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Org Units"],
        summary: "List org units",
        description: "List org units with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /org-units/hierarchy - Get org unit hierarchy
  .get(
    "/org-units/hierarchy",
    async (ctx) => {
      const { hrService, query, tenantContext, error } = ctx as any;
      const result = await hrService.getOrgUnitHierarchy(tenantContext, query.root_id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("org", "read")],
      query: t.Object({
        root_id: t.Optional(UuidSchema),
      }),
      response: {
        200: t.Array(OrgUnitResponseSchema),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Units"],
        summary: "Get org unit hierarchy",
        description: "Get the full org unit hierarchy tree",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /org-units/:id - Get org unit by ID
  .get(
    "/org-units/:id",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getOrgUnit(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("org", "read")],
      params: IdParamsSchema,
      response: {
        200: OrgUnitResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Units"],
        summary: "Get org unit by ID",
        description: "Get a single org unit by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /org-units - Create org unit
  .post(
    "/org-units",
    async (ctx) => {
      const { hrService, body, headers, tenantContext, audit, requestId, error, set } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.createOrgUnit(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: AuditActions.ORG_UNIT_CREATED,
          resourceType: "org_unit",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("org", "write")],
      body: CreateOrgUnitSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        201: OrgUnitResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Units"],
        summary: "Create org unit",
        description: "Create a new organizational unit",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /org-units/:id - Update org unit
  .put(
    "/org-units/:id",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await hrService.getOrgUnit(tenantContext, params.id);

      const result = await hrService.updateOrgUnit(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: AuditActions.ORG_UNIT_UPDATED,
          resourceType: "org_unit",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("org", "write")],
      params: IdParamsSchema,
      body: UpdateOrgUnitSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: OrgUnitResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Units"],
        summary: "Update org unit",
        description: "Update an existing organizational unit",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /org-units/:id - Delete org unit
  .delete(
    "/org-units/:id",
    async (ctx) => {
      const { hrService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await hrService.getOrgUnit(tenantContext, params.id);

      const result = await hrService.deleteOrgUnit(tenantContext, params.id, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: AuditActions.ORG_UNIT_DELETED,
          resourceType: "org_unit",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Org unit deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("org", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Units"],
        summary: "Delete org unit",
        description: "Soft delete an organizational unit (deactivate)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Position Routes
  // ===========================================================================

  // GET /positions - List positions
  .get(
    "/positions",
    async (ctx) => {
      const { hrService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await hrService.listPositions(
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
      beforeHandle: [requirePermission("positions", "read")],
      query: t.Composite([
        t.Partial(PositionFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: t.Object({
        items: t.Array(PositionResponseSchema),
        nextCursor: t.Union([t.String(), t.Null()]),
        hasMore: t.Boolean(),
      }),
      detail: {
        tags: ["Positions"],
        summary: "List positions",
        description: "List positions with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /positions/:id - Get position by ID
  .get(
    "/positions/:id",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getPosition(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("positions", "read")],
      params: IdParamsSchema,
      response: {
        200: PositionResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Positions"],
        summary: "Get position by ID",
        description: "Get a single position by its ID",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /positions - Create position
  .post(
    "/positions",
    async (ctx) => {
      const { hrService, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.createPosition(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the creation
      if (audit) {
        await audit.log({
          action: AuditActions.POSITION_CREATED,
          resourceType: "position",
          resourceId: result.data!.id,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("positions", "write")],
      body: CreatePositionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PositionResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Positions"],
        summary: "Create position",
        description: "Create a new position",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /positions/:id - Update position
  .put(
    "/positions/:id",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await hrService.getPosition(tenantContext, params.id);

      const result = await hrService.updatePosition(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the update
      if (audit) {
        await audit.log({
          action: AuditActions.POSITION_UPDATED,
          resourceType: "position",
          resourceId: params.id,
          oldValues: oldResult.data,
          newValues: result.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("positions", "write")],
      params: IdParamsSchema,
      body: UpdatePositionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: PositionResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Positions"],
        summary: "Update position",
        description: "Update an existing position",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // DELETE /positions/:id - Delete position
  .delete(
    "/positions/:id",
    async (ctx) => {
      const { hrService, params, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // Get current state for audit
      const oldResult = await hrService.getPosition(tenantContext, params.id);

      const result = await hrService.deletePosition(tenantContext, params.id, idempotencyKey);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log the deletion
      if (audit) {
        await audit.log({
          action: AuditActions.POSITION_DELETED,
          resourceType: "position",
          resourceId: params.id,
          oldValues: oldResult.data,
          metadata: { idempotencyKey, requestId },
        });
      }

      return { success: true as const, message: "Position deleted successfully" };
    },
    {
      beforeHandle: [requirePermission("positions", "write")],
      params: IdParamsSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: DeleteSuccessSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Positions"],
        summary: "Delete position",
        description: "Soft delete a position (deactivate)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Employee Routes
  // ===========================================================================

  // GET /employees - List employees
  .get(
    "/employees",
    async (ctx) => {
      const { hrService, query, tenantContext } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const parsedLimit =
        limit !== undefined && limit !== null ? Number(limit) : undefined;
      const result = await hrService.listEmployees(
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
      beforeHandle: [requirePermission("employees", "read")],
      query: t.Composite([
        t.Partial(EmployeeFiltersSchema),
        t.Partial(PaginationQuerySchema),
      ]),
      response: EmployeeListResponseSchema,
      detail: {
        tags: ["Employees"],
        summary: "List employees",
        description: "List employees with optional filters and pagination",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/:id - Get employee by ID
  .get(
    "/employees/:id",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getEmployee(tenantContext, params.id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: IdParamsSchema,
      response: {
        200: EmployeeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Get employee by ID",
        description: "Get a single employee with full details",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /employees/by-number/:employeeNumber - Get employee by employee number
  .get(
    "/employees/by-number/:employeeNumber",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getEmployeeByNumber(tenantContext, params.employeeNumber);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: EmployeeNumberParamsSchema,
      response: {
        200: EmployeeResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Get employee by employee number",
        description: "Get a single employee by their employee number",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees - Hire employee
  .post(
    "/employees",
    async (ctx) => {
      const { hrService, body, headers, tenantContext, audit, requestId, error } = ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.hireEmployee(
        tenantContext,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log employee hire (sensitive operation)
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_CREATED,
          resourceType: "employee",
          resourceId: result.data!.id,
          newValues: {
            employee_number: result.data!.employee_number,
            hire_date: result.data!.hire_date,
            position: result.data!.position,
          },
          metadata: { idempotencyKey, requestId, operation: "hire" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      body: CreateEmployeeSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Hire employee",
        description: "Create a new employee with all required information",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:id/personal - Update personal info
  .put(
    "/employees/:id/personal",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.updateEmployeePersonal(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log personal info update
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_personal",
          resourceId: params.id,
          newValues: body as any,
          metadata: {
            idempotencyKey,
            requestId,
            effective_from: (body as any).effective_from,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: UpdateEmployeePersonalSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Update personal info",
        description: "Update employee personal information (effective-dated)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:id/contract - Update contract
  .put(
    "/employees/:id/contract",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.updateEmployeeContract(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log contract update
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_contract",
          resourceId: params.id,
          newValues: body as any,
          metadata: {
            idempotencyKey,
            requestId,
            effective_from: (body as any).effective_from,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: UpdateEmployeeContractSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Update contract",
        description: "Update employee contract information (effective-dated)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:id/position - Transfer/promote employee
  .put(
    "/employees/:id/position",
    async (ctx) => {
      const {
        hrService,
        params,
        body,
        query,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const idempotencyKey = headers["idempotency-key"];

      // Determine if this is a promotion or transfer based on query param
      const isPromotion = query.type === "promotion";

      const result = isPromotion
        ? await hrService.promoteEmployee(
            tenantContext,
            params.id,
            body as any,
            idempotencyKey
          )
        : await hrService.transferEmployee(
            tenantContext,
            params.id,
            body as any,
            idempotencyKey
          );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log transfer/promotion
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_position",
          resourceId: params.id,
          newValues: body as any,
          metadata: {
            idempotencyKey,
            requestId,
            operation: isPromotion ? "promotion" : "transfer",
            effective_from: (body as any).effective_from,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      query: t.Object({
        type: t.Optional(t.Union([t.Literal("transfer"), t.Literal("promotion")])),
      }),
      body: UpdateEmployeePositionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Transfer or promote employee",
        description: "Transfer employee to new position (use ?type=promotion for promotions)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:id/compensation - Change compensation
  .put(
    "/employees/:id/compensation",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.changeCompensation(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log compensation change (sensitive operation)
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_compensation",
          resourceId: params.id,
          newValues: {
            base_salary: (body as any).base_salary,
            currency: (body as any).currency,
            change_reason: (body as any).change_reason,
          },
          metadata: {
            idempotencyKey,
            requestId,
            effective_from: (body as any).effective_from,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("compensation", "write")],
      params: IdParamsSchema,
      body: UpdateEmployeeCompensationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Change compensation",
        description: "Update employee compensation (effective-dated). Requires employees:compensation:write permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // PUT /employees/:id/manager - Change manager
  .put(
    "/employees/:id/manager",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.changeManager(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log manager change
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_manager",
          resourceId: params.id,
          newValues: body as any,
          metadata: {
            idempotencyKey,
            requestId,
            effective_from: (body as any).effective_from,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: UpdateEmployeeManagerSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Change manager",
        description: "Update employee manager (effective-dated)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:id/status - Transition status
  .post(
    "/employees/:id/status",
    async (ctx) => {
      const { hrService, params, body, headers, tenantContext, audit, requestId, error } =
        ctx as any;
      const idempotencyKey = headers["idempotency-key"];

      // Get current status for audit trail
      const currentEmployee = await hrService.getEmployee(tenantContext, params.id);

      const result = await hrService.transitionStatus(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log status transition (sensitive operation)
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_UPDATED,
          resourceType: "employee_status",
          resourceId: params.id,
          oldValues: { status: currentEmployee.data?.status },
          newValues: {
            status: (body as any).to_status,
            reason: (body as any).reason,
          },
          metadata: {
            idempotencyKey,
            requestId,
            effective_date: (body as any).effective_date,
          },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "write")],
      params: IdParamsSchema,
      body: EmployeeStatusTransitionSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Transition status",
        description: "Transition employee status following the state machine (pending -> active -> on_leave/terminated)",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // POST /employees/:id/terminate - Terminate employee
  .post(
    "/employees/:id/terminate",
    async (ctx) => {
      const {
        hrService,
        params,
        body,
        headers,
        tenantContext,
        audit,
        requestId,
        error,
      } = ctx as any;

      const idempotencyKey = headers["idempotency-key"];

      const result = await hrService.terminateEmployee(
        tenantContext,
        params.id,
        body as any,
        idempotencyKey
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      // Audit log termination (highly sensitive operation)
      if (audit) {
        await audit.log({
          action: AuditActions.EMPLOYEE_TERMINATED,
          resourceType: "employee",
          resourceId: params.id,
          newValues: {
            termination_date: (body as any)?.termination_date,
            reason: (body as any)?.reason,
          },
          metadata: { idempotencyKey, requestId, operation: "termination" },
        });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("employees", "delete") as any],
      params: IdParamsSchema,
      body: EmployeeTerminationSchema,
      headers: OptionalIdempotencyHeaderSchema,
      response: {
        200: EmployeeResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        409: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Terminate employee",
        description: "Terminate an employee and close all active records. Requires employees:delete permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // Org Chart Routes
  // ===========================================================================

  // GET /org-chart - Get org chart data
  .get(
    "/org-chart",
    async (ctx) => {
      const { hrService, query, tenantContext, error } = ctx as any;
      const result = await hrService.getOrgChart(tenantContext, query.root_employee_id);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("org", "read")],
      query: t.Object({
        root_employee_id: t.Optional(UuidSchema),
      }),
      response: {
        200: t.Object({
          nodes: t.Array(t.Object({
            id: t.String(),
            employee_id: t.String(),
            name: t.String(),
            title: t.Optional(t.String()),
            department: t.Optional(t.String()),
            photo_url: t.Optional(t.String()),
            manager_id: t.Optional(t.String()),
            level: t.Number(),
            direct_reports_count: t.Number(),
          })),
          edges: t.Array(t.Object({
            from: t.String(),
            to: t.String(),
          })),
        }),
        400: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Chart"],
        summary: "Get org chart data",
        description: "Get organizational chart data with employee hierarchy",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /org-chart/direct-reports/:employeeId - Get direct reports
  .get(
    "/org-chart/direct-reports/:employeeId",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getDirectReports(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { items: result.data };
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: t.Object({ employeeId: UuidSchema }),
      response: {
        200: t.Object({
          items: t.Array(t.Object({
            id: t.String(),
            employee_id: t.String(),
            name: t.String(),
            title: t.Optional(t.String()),
            department: t.Optional(t.String()),
            photo_url: t.Optional(t.String()),
          })),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Chart"],
        summary: "Get direct reports",
        description: "Get list of employees who report directly to specified employee",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // GET /org-chart/reporting-chain/:employeeId - Get reporting chain
  .get(
    "/org-chart/reporting-chain/:employeeId",
    async (ctx) => {
      const { hrService, params, tenantContext, error } = ctx as any;
      const result = await hrService.getReportingChain(tenantContext, params.employeeId);

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return { chain: result.data };
    },
    {
      beforeHandle: [requirePermission("employees", "read")],
      params: t.Object({ employeeId: UuidSchema }),
      response: {
        200: t.Object({
          chain: t.Array(t.Object({
            id: t.String(),
            employee_id: t.String(),
            name: t.String(),
            title: t.Optional(t.String()),
            level: t.Number(),
          })),
        }),
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Org Chart"],
        summary: "Get reporting chain",
        description: "Get the full reporting chain from employee up to CEO",
        security: [{ bearerAuth: [] }],
      },
    }
  )

  // ===========================================================================
  // History Routes
  // ===========================================================================

  // GET /employees/:id/history/:dimension - Get employee history
  .get(
    "/employees/:id/history/:dimension",
    async (ctx) => {
      const { hrService, params, query, tenantContext, error } = ctx as any;
      const result = await hrService.getEmployeeHistory(
        tenantContext,
        params.id,
        params.dimension as HistoryDimension,
        { from: query.from, to: query.to }
      );

      if (!result.success) {
        const status = mapErrorToStatus(result.error?.code || "INTERNAL_ERROR", hrErrorStatusMap);
        return error(status, { error: result.error });
      }

      return {
        employee_id: params.id,
        dimension: params.dimension,
        records: result.data,
      };
    },
    {
      beforeHandle: [requirePermission("employees", "read") as any],
      params: t.Object({
        id: UuidSchema,
        dimension: HistoryDimensionSchema,
      }),
      query: t.Partial(PaginationQuerySchema),
      response: {
        200: EmployeeHistoryResponseSchema,
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: {
        tags: ["Employees"],
        summary: "Get employee history",
        description:
          "Get historical records for a specific dimension (personal, contract, position, compensation, manager, status). Requires employees:history:read permission.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type HRRoutes = typeof hrRoutes;
