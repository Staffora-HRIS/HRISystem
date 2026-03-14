/**
 * Training Budgets Module - TypeBox Schemas
 *
 * Validation schemas for training budget management and expense tracking.
 */

import { t, type Static } from "elysia";

// =============================================================================
// Shared Schemas
// =============================================================================

export const UuidSchema = t.String({ format: "uuid" });

// =============================================================================
// Training Budget Schemas
// =============================================================================

export const CreateBudgetSchema = t.Object({
  departmentId: t.Optional(UuidSchema),
  financialYear: t.String({ minLength: 4, maxLength: 9 }),
  totalBudget: t.Number({ minimum: 0 }),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
});
export type CreateBudget = Static<typeof CreateBudgetSchema>;

export const UpdateBudgetSchema = t.Partial(
  t.Object({
    totalBudget: t.Number({ minimum: 0 }),
    currency: t.String({ minLength: 3, maxLength: 3 }),
  })
);
export type UpdateBudget = Static<typeof UpdateBudgetSchema>;

// =============================================================================
// Training Expense Schemas
// =============================================================================

export const ExpenseStatusSchema = t.Union([
  t.Literal("pending"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("paid"),
]);

export const CreateExpenseSchema = t.Object({
  budgetId: UuidSchema,
  employeeId: UuidSchema,
  courseId: t.Optional(UuidSchema),
  description: t.String({ minLength: 1, maxLength: 2000 }),
  amount: t.Number({ minimum: 0.01 }),
  expenseDate: t.String({ format: "date" }),
  receiptKey: t.Optional(t.String({ maxLength: 500 })),
});
export type CreateExpense = Static<typeof CreateExpenseSchema>;

export const UpdateExpenseStatusSchema = t.Object({
  status: ExpenseStatusSchema,
});
export type UpdateExpenseStatus = Static<typeof UpdateExpenseStatusSchema>;

// =============================================================================
// Response Types
// =============================================================================

export interface BudgetResponse {
  id: string;
  tenantId: string;
  departmentId: string | null;
  financialYear: string;
  totalBudget: number;
  spent: number;
  committed: number;
  remaining: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseResponse {
  id: string;
  tenantId: string;
  budgetId: string;
  employeeId: string;
  courseId: string | null;
  description: string;
  amount: number;
  expenseDate: string;
  receiptKey: string | null;
  status: string;
  approvedBy: string | null;
  employeeName?: string;
  createdAt: string;
}

// =============================================================================
// Common Schemas
// =============================================================================

export const IdParamsSchema = t.Object({ id: UuidSchema });
export const PaginationQuerySchema = t.Object({
  cursor: t.Optional(t.String()),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
});
