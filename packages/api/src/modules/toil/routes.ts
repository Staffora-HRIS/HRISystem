/**
 * TOIL (Time Off In Lieu) Routes
 *
 * Endpoints:
 *  GET    /toil/balances                  — List TOIL balances (cursor-paginated)
 *  POST   /toil/balances                  — Create a new TOIL balance period
 *  GET    /toil/balances/:id              — Get a specific TOIL balance
 *  GET    /toil/balances/employee/:employeeId — Get current active balance for employee
 *  POST   /toil/accruals                  — Accrue TOIL hours (manager action)
 *  POST   /toil/usage                     — Use TOIL hours (employee request)
 *  GET    /toil/transactions              — List TOIL transactions (cursor-paginated)
 *  GET    /toil/transactions/:id          — Get a specific transaction
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorResponseSchema } from "../../lib/route-helpers";
import { ToilRepository } from "./repository";
import { ToilService, ToilErrorCodes } from "./service";
import {
  CreateToilBalanceSchema,
  CreateToilAccrualSchema,
  CreateToilUsageSchema,
  ToilBalanceQuerySchema,
  ToilTransactionQuerySchema,
  IdParamsSchema,
  EmployeeIdParamsSchema,
} from "./schemas";

export const toilRoutes = new Elysia({ prefix: "/toil", name: "toil-routes" })
  .derive((ctx) => {
    const { db } = ctx as any;
    const repo = new ToilRepository(db);
    const service = new ToilService(repo);
    return { toilService: service };
  })

  // =========================================================================
  // Balances
  // =========================================================================

  .get(
    "/balances",
    async (ctx) => {
      const { toilService, tenantContext, query } = ctx as any;
      const result = await toilService.listBalances(tenantContext, query);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to list TOIL balances");
      }
      const { items, cursor, hasMore } = result.data!;
      return { items, nextCursor: cursor, hasMore };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      query: t.Partial(ToilBalanceQuerySchema),
      detail: { tags: ["Absence"], summary: "List TOIL balances" },
    }
  )

  .post(
    "/balances",
    async (ctx) => {
      const { toilService, tenantContext, body, set } = ctx as any;
      const result = await toilService.createBalance(tenantContext, body as any);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to create TOIL balance");
      }
      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateToilBalanceSchema,
      detail: { tags: ["Absence"], summary: "Create TOIL balance period" },
    }
  )

  .get(
    "/balances/:id",
    async (ctx) => {
      const { toilService, tenantContext, params, error } = ctx as any;
      const result = await toilService.getBalanceById(tenantContext, params.id);
      if (!result.success) {
        return error(
          result.error?.code === ToilErrorCodes.BALANCE_NOT_FOUND ? 404 : 500,
          { error: result.error }
        );
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Get TOIL balance by ID" },
    }
  )

  .get(
    "/balances/employee/:employeeId",
    async (ctx) => {
      const { toilService, tenantContext, params, error } = ctx as any;
      const result = await toilService.getBalance(tenantContext, params.employeeId);
      if (!result.success) {
        return error(
          result.error?.code === ToilErrorCodes.BALANCE_NOT_FOUND ? 404 : 500,
          { error: result.error }
        );
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: EmployeeIdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Get current TOIL balance for employee" },
    }
  )

  // =========================================================================
  // Accruals (manager action)
  // =========================================================================

  .post(
    "/accruals",
    async (ctx) => {
      const { toilService, tenantContext, body, error, set } = ctx as any;
      const result = await toilService.createAccrual(tenantContext, body as any);
      if (!result.success) {
        const statusCode =
          result.error?.code === ToilErrorCodes.BALANCE_NOT_FOUND
            ? 404
            : result.error?.code === ToilErrorCodes.DATE_OUTSIDE_PERIOD
              ? 400
              : result.error?.code === ToilErrorCodes.ACCRUAL_REASON_REQUIRED
                ? 400
                : 500;
        return error(statusCode, { error: result.error });
      }
      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateToilAccrualSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Accrue TOIL hours for overtime worked" },
    }
  )

  // =========================================================================
  // Usage (employee request)
  // =========================================================================

  .post(
    "/usage",
    async (ctx) => {
      const { toilService, tenantContext, body, error, set } = ctx as any;
      const result = await toilService.createUsage(tenantContext, body as any);
      if (!result.success) {
        const statusCode =
          result.error?.code === ToilErrorCodes.BALANCE_NOT_FOUND
            ? 404
            : result.error?.code === ToilErrorCodes.INSUFFICIENT_BALANCE
              ? 400
              : result.error?.code === ToilErrorCodes.PERIOD_EXPIRED
                ? 400
                : 500;
        return error(statusCode, { error: result.error });
      }
      set.status = 201;
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "write")],
      body: CreateToilUsageSchema,
      response: {
        400: ErrorResponseSchema,
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Request to use TOIL hours" },
    }
  )

  // =========================================================================
  // Transactions
  // =========================================================================

  .get(
    "/transactions",
    async (ctx) => {
      const { toilService, tenantContext, query } = ctx as any;
      const result = await toilService.getTransactions(tenantContext, query);
      if (!result.success) {
        throw new Error(result.error?.message || "Failed to list TOIL transactions");
      }
      const { items, cursor, hasMore } = result.data!;
      return { items, nextCursor: cursor, hasMore };
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      query: t.Partial(ToilTransactionQuerySchema),
      detail: { tags: ["Absence"], summary: "List TOIL transactions" },
    }
  )

  .get(
    "/transactions/:id",
    async (ctx) => {
      const { toilService, tenantContext, params, error } = ctx as any;
      const result = await toilService.getTransactionById(tenantContext, params.id);
      if (!result.success) {
        return error(
          result.error?.code === ToilErrorCodes.TRANSACTION_NOT_FOUND ? 404 : 500,
          { error: result.error }
        );
      }
      return result.data;
    },
    {
      beforeHandle: [requirePermission("absence", "read")],
      params: IdParamsSchema,
      response: {
        404: ErrorResponseSchema,
        500: ErrorResponseSchema,
      },
      detail: { tags: ["Absence"], summary: "Get TOIL transaction by ID" },
    }
  );

export type ToilRoutes = typeof toilRoutes;
