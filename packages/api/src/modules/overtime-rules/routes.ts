/**
 * Overtime Rules Module - Routes
 *
 * Elysia routes for overtime rule configuration and overtime calculations.
 *
 * Endpoints:
 *   POST   /overtime-rules                              - Create an overtime rule
 *   GET    /overtime-rules                              - List overtime rules
 *   GET    /overtime-rules/:id                          - Get an overtime rule by ID
 *   PUT    /overtime-rules/:id                          - Update an overtime rule
 *   DELETE /overtime-rules/:id                          - Delete an overtime rule
 *
 *   POST   /overtime-rules/calculate/:employeeId       - Calculate overtime for one employee
 *   POST   /overtime-rules/calculate/batch              - Batch calculate overtime for all employees
 *   GET    /overtime-rules/calculations                 - List overtime calculations
 *   GET    /overtime-rules/calculations/:id             - Get an overtime calculation by ID
 *   POST   /overtime-rules/calculations/:id/approve     - Approve an overtime calculation
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { OvertimeRulesRepository } from "./repository";
import { OvertimeRulesService, OvertimeRuleErrorCodes } from "./service";
import {
  CreateOvertimeRuleSchema,
  UpdateOvertimeRuleSchema,
  OvertimeRuleFiltersSchema,
  OvertimeCalculationFiltersSchema,
  CalculateOvertimeQuerySchema,
  BatchCalculateOvertimeSchema,
  ApproveOvertimeCalculationSchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
  IdempotencyHeaderSchema,
} from "./schemas";

/** Map error codes to HTTP status codes */
function errorStatus(code?: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "EFFECTIVE_DATE_OVERLAP":
    case "STATE_MACHINE_VIOLATION":
      return 409;
    case "INVALID_DATE_RANGE":
    case "NO_ACTIVE_RULES":
      return 400;
    default:
      return 500;
  }
}

export const overtimeRulesRoutes = new Elysia({ prefix: "/overtime-rules" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repo = new OvertimeRulesRepository(db);
    const service = new OvertimeRulesService(repo);
    return { overtimeRulesService: service };
  })

  // ===========================================================================
  // POST /overtime-rules - Create an overtime rule
  // ===========================================================================
  .post(
    "/",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, body, set } = ctx as any;

      const result = await overtimeRulesService.createRule(
        { tenantId: tenant.id, userId: user.id },
        body
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: CreateOvertimeRuleSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Create an overtime rule",
        description:
          "Creates a new overtime rule with effective dating, threshold hours, and rate multiplier.",
      },
    }
  )

  // ===========================================================================
  // GET /overtime-rules - List overtime rules
  // ===========================================================================
  .get(
    "/",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, query, set } = ctx as any;

      const result = await overtimeRulesService.listRules(
        { tenantId: tenant.id, userId: user.id },
        query || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      query: OvertimeRuleFiltersSchema,
      beforeHandle: [requirePermission("overtime_rules", "read")],
      detail: {
        tags: ["Time"],
        summary: "List overtime rules",
        description:
          "Returns a paginated list of overtime rules. Filterable by active status and effective date.",
      },
    }
  )

  // ===========================================================================
  // GET /overtime-rules/calculations - List overtime calculations
  // (placed before /:id to avoid route conflict)
  // ===========================================================================
  .get(
    "/calculations",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, query, set } = ctx as any;

      const result = await overtimeRulesService.listCalculations(
        { tenantId: tenant.id, userId: user.id },
        query || {}
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      query: OvertimeCalculationFiltersSchema,
      beforeHandle: [requirePermission("overtime_rules", "read")],
      detail: {
        tags: ["Time"],
        summary: "List overtime calculations",
        description:
          "Returns a paginated list of overtime calculations. Filterable by employee, status, and period.",
      },
    }
  )

  // ===========================================================================
  // GET /overtime-rules/calculations/:id - Get an overtime calculation
  // ===========================================================================
  .get(
    "/calculations/:id",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, set } = ctx as any;

      const result = await overtimeRulesService.getCalculationById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("overtime_rules", "read")],
      detail: {
        tags: ["Time"],
        summary: "Get overtime calculation by ID",
      },
    }
  )

  // ===========================================================================
  // POST /overtime-rules/calculations/:id/approve - Approve a calculation
  // ===========================================================================
  .post(
    "/calculations/:id/approve",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, body, set } =
        ctx as any;

      const result = await overtimeRulesService.approveCalculation(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body?.notes
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: ApproveOvertimeCalculationSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Approve an overtime calculation",
        description:
          "Approves a calculated overtime record. Only calculations in 'calculated' status can be approved.",
      },
    }
  )

  // ===========================================================================
  // POST /overtime-rules/calculate/batch - Batch calculate overtime
  // (placed before /calculate/:employeeId to avoid route conflict)
  // ===========================================================================
  .post(
    "/calculate/batch",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, body, set } = ctx as any;

      const result = await overtimeRulesService.batchCalculate(
        { tenantId: tenant.id, userId: user.id },
        body
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: BatchCalculateOvertimeSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Batch calculate overtime",
        description:
          "Calculates overtime for all active employees in the specified period using active overtime rules.",
      },
    }
  )

  // ===========================================================================
  // POST /overtime-rules/calculate/:employeeId - Calculate for one employee
  // ===========================================================================
  .post(
    "/calculate/:employeeId",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, body, set } =
        ctx as any;

      const result = await overtimeRulesService.calculateForEmployee(
        { tenantId: tenant.id, userId: user.id },
        params.employeeId,
        body.periodStart,
        body.periodEnd,
        body.hourlyRate
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 201;
      return result.data;
    },
    {
      params: EmployeeIdParamsSchema,
      body: CalculateOvertimeQuerySchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Calculate overtime for an employee",
        description:
          "Calculates overtime for a specific employee in the given period. " +
          "Uses active overtime rules and the employee's timesheet hours.",
      },
    }
  )

  // ===========================================================================
  // GET /overtime-rules/:id - Get an overtime rule by ID
  // ===========================================================================
  .get(
    "/:id",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, set } = ctx as any;

      const result = await overtimeRulesService.getRuleById(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      beforeHandle: [requirePermission("overtime_rules", "read")],
      detail: {
        tags: ["Time"],
        summary: "Get overtime rule by ID",
      },
    }
  )

  // ===========================================================================
  // PUT /overtime-rules/:id - Update an overtime rule
  // ===========================================================================
  .put(
    "/:id",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, body, set } =
        ctx as any;

      const result = await overtimeRulesService.updateRule(
        { tenantId: tenant.id, userId: user.id },
        params.id,
        body
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      return result.data;
    },
    {
      params: IdParamsSchema,
      body: UpdateOvertimeRuleSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Update an overtime rule",
        description:
          "Partially update an existing overtime rule. Validates effective date range and overlap.",
      },
    }
  )

  // ===========================================================================
  // DELETE /overtime-rules/:id - Delete an overtime rule
  // ===========================================================================
  .delete(
    "/:id",
    async (ctx) => {
      const { overtimeRulesService, tenant, user, params, set } = ctx as any;

      const result = await overtimeRulesService.deleteRule(
        { tenantId: tenant.id, userId: user.id },
        params.id
      );

      if (!result.success) {
        set.status = errorStatus(result.error?.code);
        return { error: { ...result.error, requestId: "" } };
      }

      set.status = 204;
      return null;
    },
    {
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      beforeHandle: [requirePermission("overtime_rules", "write")],
      detail: {
        tags: ["Time"],
        summary: "Delete an overtime rule",
        description:
          "Permanently deletes an overtime rule. This action cannot be undone.",
      },
    }
  );

export type OvertimeRulesRoutes = typeof overtimeRulesRoutes;
