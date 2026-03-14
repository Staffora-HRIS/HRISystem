/**
 * Training Budgets Module - Repository Layer
 *
 * Database operations for training budgets and expenses.
 * All queries respect RLS via tenant context.
 */

import type { TransactionSql } from "postgres";
import type { DatabaseClient } from "../../plugins/db";
import type { TenantContext } from "../../types/service-result";
import {
  parsePaginationParams,
  buildPaginatedResult,
  type PaginationParams,
  type PaginatedResult,
} from "../../lib/pagination";
import type {
  CreateBudget,
  UpdateBudget,
  CreateExpense,
  BudgetResponse,
  ExpenseResponse,
} from "./schemas";

export type { TenantContext } from "../../types/service-result";
export type { PaginationParams, PaginatedResult } from "../../lib/pagination";

// =============================================================================
// DB Row Shapes
// =============================================================================

interface BudgetDbRow {
  id: string;
  tenantId: string;
  departmentId: string | null;
  financialYear: string;
  totalBudget: string;
  spent: string;
  committed: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ExpenseDbRow {
  id: string;
  tenantId: string;
  budgetId: string;
  employeeId: string;
  courseId: string | null;
  description: string;
  amount: string;
  expenseDate: Date;
  receiptKey: string | null;
  status: string;
  approvedBy: string | null;
  employeeName?: string;
  createdAt: Date;
}

// =============================================================================
// Repository
// =============================================================================

export class TrainingBudgetRepository {
  constructor(private db: DatabaseClient) {}

  // ===========================================================================
  // Budget Operations
  // ===========================================================================

  async listBudgets(
    ctx: TenantContext,
    filters: { financialYear?: string; departmentId?: string },
    pagination: PaginationParams
  ): Promise<PaginatedResult<BudgetResponse>> {
    const { limit, cursor } = parsePaginationParams(pagination);
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<BudgetDbRow[]>`
        SELECT id, tenant_id, department_id, financial_year, total_budget,
               spent, committed, currency, created_at, updated_at
        FROM app.training_budgets
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ${filters.financialYear ? tx`AND financial_year = ${filters.financialYear}` : tx``}
        ${filters.departmentId ? tx`AND department_id = ${filters.departmentId}::uuid` : tx``}
        ${cursor ? tx`AND id > ${cursor}::uuid` : tx``}
        ORDER BY financial_year DESC, created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const result = buildPaginatedResult(rows, limit);
    return {
      ...result,
      items: result.items.map(this.mapBudgetRow),
    };
  }

  async getBudgetById(ctx: TenantContext, id: string): Promise<BudgetResponse | null> {
    const [row] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<BudgetDbRow[]>`
        SELECT id, tenant_id, department_id, financial_year, total_budget,
               spent, committed, currency, created_at, updated_at
        FROM app.training_budgets
        WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    return row ? this.mapBudgetRow(row) : null;
  }

  async createBudget(
    ctx: TenantContext,
    data: CreateBudget,
    tx: TransactionSql
  ): Promise<BudgetResponse> {
    const [row] = await tx<BudgetDbRow[]>`
      INSERT INTO app.training_budgets (
        id, tenant_id, department_id, financial_year, total_budget, currency
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid,
        ${data.departmentId || null}::uuid,
        ${data.financialYear}, ${data.totalBudget},
        ${data.currency || 'GBP'}
      )
      RETURNING id, tenant_id, department_id, financial_year, total_budget,
                spent, committed, currency, created_at, updated_at
    `;

    return this.mapBudgetRow(row);
  }

  async updateBudget(
    ctx: TenantContext,
    id: string,
    data: UpdateBudget,
    tx: TransactionSql
  ): Promise<BudgetResponse | null> {
    const [row] = await tx<BudgetDbRow[]>`
      UPDATE app.training_budgets SET
        total_budget = COALESCE(${data.totalBudget ?? null}, total_budget),
        currency = COALESCE(${data.currency ?? null}, currency),
        updated_at = now()
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING id, tenant_id, department_id, financial_year, total_budget,
                spent, committed, currency, created_at, updated_at
    `;

    return row ? this.mapBudgetRow(row) : null;
  }

  // ===========================================================================
  // Expense Operations
  // ===========================================================================

  async listExpenses(
    ctx: TenantContext,
    filters: { budgetId?: string; employeeId?: string; status?: string },
    pagination: PaginationParams
  ): Promise<PaginatedResult<ExpenseResponse>> {
    const { limit, cursor } = parsePaginationParams(pagination);
    const fetchLimit = limit + 1;

    const rows = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ExpenseDbRow[]>`
        SELECT te.id, te.tenant_id, te.budget_id, te.employee_id, te.course_id,
               te.description, te.amount, te.expense_date, te.receipt_key,
               te.status, te.approved_by, te.created_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.training_expenses te
        JOIN app.employees e ON e.id = te.employee_id
        WHERE te.tenant_id = ${ctx.tenantId}::uuid
        ${filters.budgetId ? tx`AND te.budget_id = ${filters.budgetId}::uuid` : tx``}
        ${filters.employeeId ? tx`AND te.employee_id = ${filters.employeeId}::uuid` : tx``}
        ${filters.status ? tx`AND te.status = ${filters.status}` : tx``}
        ${cursor ? tx`AND te.id > ${cursor}::uuid` : tx``}
        ORDER BY te.expense_date DESC, te.created_at DESC
        LIMIT ${fetchLimit}
      `;
    });

    const result = buildPaginatedResult(rows, limit);
    return {
      ...result,
      items: result.items.map(this.mapExpenseRow),
    };
  }

  async getExpenseById(ctx: TenantContext, id: string): Promise<ExpenseResponse | null> {
    const [row] = await this.db.withTransaction(ctx, async (tx: TransactionSql) => {
      return tx<ExpenseDbRow[]>`
        SELECT te.id, te.tenant_id, te.budget_id, te.employee_id, te.course_id,
               te.description, te.amount, te.expense_date, te.receipt_key,
               te.status, te.approved_by, te.created_at,
               e.first_name || ' ' || e.last_name as employee_name
        FROM app.training_expenses te
        JOIN app.employees e ON e.id = te.employee_id
        WHERE te.id = ${id}::uuid AND te.tenant_id = ${ctx.tenantId}::uuid
      `;
    });

    return row ? this.mapExpenseRow(row) : null;
  }

  async createExpense(
    ctx: TenantContext,
    data: CreateExpense,
    tx: TransactionSql
  ): Promise<ExpenseResponse> {
    const [row] = await tx<ExpenseDbRow[]>`
      INSERT INTO app.training_expenses (
        id, tenant_id, budget_id, employee_id, course_id,
        description, amount, expense_date, receipt_key
      ) VALUES (
        gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.budgetId}::uuid,
        ${data.employeeId}::uuid, ${data.courseId || null}::uuid,
        ${data.description}, ${data.amount}, ${data.expenseDate}::date,
        ${data.receiptKey || null}
      )
      RETURNING id, tenant_id, budget_id, employee_id, course_id,
                description, amount, expense_date, receipt_key,
                status, approved_by, created_at
    `;

    return this.mapExpenseRow(row);
  }

  async updateExpenseStatus(
    ctx: TenantContext,
    id: string,
    status: string,
    approvedBy: string | undefined,
    tx: TransactionSql
  ): Promise<ExpenseResponse | null> {
    const [row] = await tx<ExpenseDbRow[]>`
      UPDATE app.training_expenses SET
        status = ${status}::app.training_expense_status,
        approved_by = ${approvedBy || null}::uuid
      WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
      RETURNING id, tenant_id, budget_id, employee_id, course_id,
                description, amount, expense_date, receipt_key,
                status, approved_by, created_at
    `;

    return row ? this.mapExpenseRow(row) : null;
  }

  async updateBudgetSpent(
    ctx: TenantContext,
    budgetId: string,
    tx: TransactionSql
  ): Promise<void> {
    await tx`
      UPDATE app.training_budgets SET
        spent = COALESCE((
          SELECT SUM(amount)
          FROM app.training_expenses
          WHERE budget_id = ${budgetId}::uuid AND status = 'paid'
        ), 0),
        committed = COALESCE((
          SELECT SUM(amount)
          FROM app.training_expenses
          WHERE budget_id = ${budgetId}::uuid AND status = 'approved'
        ), 0),
        updated_at = now()
      WHERE id = ${budgetId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
    `;
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapBudgetRow(row: BudgetDbRow): BudgetResponse {
    const total = Number(row.totalBudget);
    const spent = Number(row.spent);
    const committed = Number(row.committed);
    return {
      id: row.id,
      tenantId: row.tenantId,
      departmentId: row.departmentId,
      financialYear: row.financialYear,
      totalBudget: total,
      spent,
      committed,
      remaining: total - spent - committed,
      currency: row.currency,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString() || String(row.updatedAt),
    };
  }

  private mapExpenseRow(row: ExpenseDbRow): ExpenseResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      budgetId: row.budgetId,
      employeeId: row.employeeId,
      courseId: row.courseId,
      description: row.description,
      amount: Number(row.amount),
      expenseDate: row.expenseDate instanceof Date
        ? row.expenseDate.toISOString().split("T")[0]
        : String(row.expenseDate),
      receiptKey: row.receiptKey,
      status: row.status,
      approvedBy: row.approvedBy,
      employeeName: row.employeeName,
      createdAt: row.createdAt?.toISOString() || String(row.createdAt),
    };
  }
}
