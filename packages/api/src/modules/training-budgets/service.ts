/**
 * Training Budgets Module - Service Layer
 *
 * Business logic for training budget management and expense tracking.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import { emitDomainEvent } from "../../lib/outbox";
import {
  withServiceErrorHandling,
  notFound,
  serviceSuccess,
  type ServiceResult,
} from "../../lib/service-errors";
import {
  TrainingBudgetRepository,
  type TenantContext,
  type PaginationParams,
} from "./repository";
import type {
  CreateBudget,
  UpdateBudget,
  CreateExpense,
  BudgetResponse,
  ExpenseResponse,
} from "./schemas";

export class TrainingBudgetService {
  constructor(
    private repository: TrainingBudgetRepository,
    private db: DatabaseClient
  ) {}

  // ===========================================================================
  // Budget Operations
  // ===========================================================================

  async listBudgets(
    ctx: TenantContext,
    filters: { financialYear?: string; departmentId?: string },
    pagination: PaginationParams
  ) {
    return this.repository.listBudgets(ctx, filters, pagination);
  }

  async getBudget(ctx: TenantContext, id: string): Promise<ServiceResult<BudgetResponse>> {
    return withServiceErrorHandling("fetching training budget", async () => {
      const budget = await this.repository.getBudgetById(ctx, id);
      if (!budget) return notFound("Training budget");
      return serviceSuccess(budget);
    });
  }

  async createBudget(
    ctx: TenantContext,
    data: CreateBudget
  ): Promise<ServiceResult<BudgetResponse>> {
    return withServiceErrorHandling("creating training budget", async () => {
      const budget = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createBudget(ctx, data, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "training_budget",
            aggregateId: result.id,
            eventType: "lms.training_budget.created",
            payload: { budget: result },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return serviceSuccess(budget);
    }, {
      "23505": { code: "DUPLICATE_BUDGET", message: "A budget already exists for this department and financial year" },
    });
  }

  async updateBudget(
    ctx: TenantContext,
    id: string,
    data: UpdateBudget
  ): Promise<ServiceResult<BudgetResponse>> {
    return withServiceErrorHandling("updating training budget", async () => {
      const existing = await this.repository.getBudgetById(ctx, id);
      if (!existing) return notFound("Training budget");

      const budget = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateBudget(ctx, id, data, tx);
          if (!result) return null;

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "training_budget",
            aggregateId: id,
            eventType: "lms.training_budget.updated",
            payload: { budget: result, previousValues: existing },
            userId: ctx.userId,
          });

          return result;
        }
      );

      if (!budget) return notFound("Training budget");
      return serviceSuccess(budget);
    });
  }

  // ===========================================================================
  // Expense Operations
  // ===========================================================================

  async listExpenses(
    ctx: TenantContext,
    filters: { budgetId?: string; employeeId?: string; status?: string },
    pagination: PaginationParams
  ) {
    return this.repository.listExpenses(ctx, filters, pagination);
  }

  async getExpense(ctx: TenantContext, id: string): Promise<ServiceResult<ExpenseResponse>> {
    return withServiceErrorHandling("fetching training expense", async () => {
      const expense = await this.repository.getExpenseById(ctx, id);
      if (!expense) return notFound("Training expense");
      return serviceSuccess(expense);
    });
  }

  async createExpense(
    ctx: TenantContext,
    data: CreateExpense
  ): Promise<ServiceResult<ExpenseResponse>> {
    return withServiceErrorHandling("creating training expense", async () => {
      // Verify budget exists
      const budget = await this.repository.getBudgetById(ctx, data.budgetId);
      if (!budget) return notFound("Training budget");

      const expense = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createExpense(ctx, data, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "training_expense",
            aggregateId: result.id,
            eventType: "lms.training_expense.created",
            payload: { expense: result, budgetId: data.budgetId },
            userId: ctx.userId,
          });

          return result;
        }
      );

      return serviceSuccess(expense);
    });
  }

  async updateExpenseStatus(
    ctx: TenantContext,
    id: string,
    status: string
  ): Promise<ServiceResult<ExpenseResponse>> {
    return withServiceErrorHandling("updating expense status", async () => {
      const existing = await this.repository.getExpenseById(ctx, id);
      if (!existing) return notFound("Training expense");

      const expense = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateExpenseStatus(
            ctx, id, status, ctx.userId, tx
          );
          if (!result) return null;

          // Recalculate budget spent/committed totals
          await this.repository.updateBudgetSpent(ctx, existing.budgetId, tx);

          await emitDomainEvent(tx, {
            tenantId: ctx.tenantId,
            aggregateType: "training_expense",
            aggregateId: id,
            eventType: "lms.training_expense.status_changed",
            payload: {
              expense: result,
              previousStatus: existing.status,
              newStatus: status,
            },
            userId: ctx.userId,
          });

          return result;
        }
      );

      if (!expense) return notFound("Training expense");
      return serviceSuccess(expense);
    });
  }
}
