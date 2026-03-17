/**
 * TOIL (Time Off In Lieu) Service
 *
 * Business logic for TOIL balance and transaction management.
 *
 * Business rules:
 *  - TOIL has a configurable expiry period (default 3 months / 90 days)
 *  - Balance cannot go negative (used_hours cannot exceed accrued_hours)
 *  - Accruals are authorised by a manager
 *  - Usage is requested by an employee against an existing balance
 */

import { ToilRepository, type TenantContext, type ToilBalanceRow, type ToilTransactionRow } from "./repository";
import type { CreateToilBalance, CreateToilAccrual, CreateToilUsage, ToilBalanceQuery, ToilTransactionQuery } from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Error codes
// =============================================================================

export const ToilErrorCodes = {
  BALANCE_NOT_FOUND: "TOIL_BALANCE_NOT_FOUND",
  TRANSACTION_NOT_FOUND: "TOIL_TRANSACTION_NOT_FOUND",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_TOIL_BALANCE",
  PERIOD_EXPIRED: "TOIL_PERIOD_EXPIRED",
  ACCRUAL_REASON_REQUIRED: "TOIL_ACCRUAL_REASON_REQUIRED",
  DATE_OUTSIDE_PERIOD: "TOIL_DATE_OUTSIDE_PERIOD",
} as const;

// =============================================================================
// Service
// =============================================================================

export class ToilService {
  constructor(private repo: ToilRepository) {}

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async createBalance(
    ctx: TenantContext,
    input: CreateToilBalance
  ): Promise<ServiceResult<unknown>> {
    try {
      const balance = await this.repo.createBalance(ctx, {
        employeeId: input.employeeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        expiryDays: input.expiryDays,
      });
      return { success: true, data: this.formatBalance(balance) };
    } catch (error) {
      console.error("Error creating TOIL balance:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create TOIL balance" },
      };
    }
  }

  async getBalance(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const balance = await this.repo.getEmployeeBalance(ctx, employeeId);
      if (!balance) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.BALANCE_NOT_FOUND,
            message: "No active TOIL balance found for this employee",
          },
        };
      }

      // Calculate expired hours for informational purposes
      const { totalExpiredHours } = await this.repo.getExpiredAccruals(ctx, balance.id);
      const effectiveBalance = Math.max(0, balance.balanceHours - totalExpiredHours);

      return {
        success: true,
        data: {
          ...this.formatBalance(balance),
          expiredHours: totalExpiredHours,
          effectiveBalanceHours: effectiveBalance,
        },
      };
    } catch (error) {
      console.error("Error fetching TOIL balance:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch TOIL balance" },
      };
    }
  }

  async getBalanceById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const balance = await this.repo.getBalanceById(ctx, id);
      if (!balance) {
        return {
          success: false,
          error: { code: ToilErrorCodes.BALANCE_NOT_FOUND, message: "TOIL balance not found" },
        };
      }

      const { totalExpiredHours } = await this.repo.getExpiredAccruals(ctx, balance.id);
      const effectiveBalance = Math.max(0, balance.balanceHours - totalExpiredHours);

      return {
        success: true,
        data: {
          ...this.formatBalance(balance),
          expiredHours: totalExpiredHours,
          effectiveBalanceHours: effectiveBalance,
        },
      };
    } catch (error) {
      console.error("Error fetching TOIL balance:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch TOIL balance" },
      };
    }
  }

  async listBalances(
    ctx: TenantContext,
    query: ToilBalanceQuery
  ): Promise<ServiceResult<{ items: unknown[]; cursor: string | null; hasMore: boolean }>> {
    try {
      const result = await this.repo.getBalances(ctx, {
        employeeId: query.employeeId,
        activeOnly: query.activeOnly === "true",
        cursor: query.cursor,
        limit: query.limit,
      });
      return {
        success: true,
        data: {
          items: result.data.map(this.formatBalance),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error listing TOIL balances:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list TOIL balances" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Accrual (manager adds TOIL for overtime worked)
  // ---------------------------------------------------------------------------

  async createAccrual(
    ctx: TenantContext,
    input: CreateToilAccrual
  ): Promise<ServiceResult<unknown>> {
    try {
      // Validate balance exists
      const balance = await this.repo.getBalanceById(ctx, input.balanceId);
      if (!balance) {
        return {
          success: false,
          error: { code: ToilErrorCodes.BALANCE_NOT_FOUND, message: "TOIL balance not found" },
        };
      }

      // Validate the balance belongs to the specified employee
      if (balance.employeeId !== input.employeeId) {
        return {
          success: false,
          error: { code: ToilErrorCodes.BALANCE_NOT_FOUND, message: "TOIL balance does not belong to this employee" },
        };
      }

      // Validate date falls within the balance period
      const txnDate = new Date(input.date);
      const periodStart = new Date(balance.periodStart);
      const periodEnd = new Date(balance.periodEnd);
      if (txnDate < periodStart || txnDate > periodEnd) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.DATE_OUTSIDE_PERIOD,
            message: `Accrual date ${input.date} is outside the balance period (${balance.periodStart} to ${balance.periodEnd})`,
          },
        };
      }

      // Calculate expiry date from the accrual date + balance expiry_days
      const expiresAt = new Date(txnDate);
      expiresAt.setDate(expiresAt.getDate() + balance.expiryDays);
      const expiresAtStr = expiresAt.toISOString().split("T")[0] as string;

      // Validate reason is provided (required for accruals)
      if (!input.reason || input.reason.trim().length === 0) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.ACCRUAL_REASON_REQUIRED,
            message: "A reason describing the overtime worked is required for TOIL accruals",
          },
        };
      }

      const result = await this.repo.createAccrual(ctx, {
        employeeId: input.employeeId,
        balanceId: input.balanceId,
        hours: input.hours,
        reason: input.reason,
        date: input.date,
        authorizedBy: ctx.userId!,
        expiresAt: expiresAtStr,
      });

      return {
        success: true,
        data: {
          transaction: this.formatTransaction(result.transaction),
          balance: this.formatBalance(result.balance),
        },
      };
    } catch (error) {
      console.error("Error creating TOIL accrual:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create TOIL accrual" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Usage (employee requests to use TOIL)
  // ---------------------------------------------------------------------------

  async createUsage(
    ctx: TenantContext,
    input: CreateToilUsage
  ): Promise<ServiceResult<unknown>> {
    try {
      // Validate balance exists
      const balance = await this.repo.getBalanceById(ctx, input.balanceId);
      if (!balance) {
        return {
          success: false,
          error: { code: ToilErrorCodes.BALANCE_NOT_FOUND, message: "TOIL balance not found" },
        };
      }

      // Validate the balance belongs to the specified employee
      if (balance.employeeId !== input.employeeId) {
        return {
          success: false,
          error: { code: ToilErrorCodes.BALANCE_NOT_FOUND, message: "TOIL balance does not belong to this employee" },
        };
      }

      // Check the period has not expired
      const now = new Date();
      const periodEnd = new Date(balance.periodEnd);
      if (now > periodEnd) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.PERIOD_EXPIRED,
            message: "The TOIL balance period has expired",
          },
        };
      }

      // Calculate effective balance accounting for expired accruals
      const { totalExpiredHours } = await this.repo.getExpiredAccruals(ctx, balance.id);
      const effectiveBalance = Math.max(0, balance.balanceHours - totalExpiredHours);

      // Validate sufficient balance (balance cannot go negative)
      if (input.hours > effectiveBalance) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.INSUFFICIENT_BALANCE,
            message: `Insufficient TOIL balance. Requested ${input.hours} hours but only ${effectiveBalance} hours available (${totalExpiredHours} hours expired)`,
            details: {
              requestedHours: input.hours,
              availableHours: effectiveBalance,
              expiredHours: totalExpiredHours,
              totalAccrued: balance.accruedHours,
              totalUsed: balance.usedHours,
            },
          },
        };
      }

      const result = await this.repo.createUsage(ctx, {
        employeeId: input.employeeId,
        balanceId: input.balanceId,
        hours: input.hours,
        reason: input.reason || null,
        date: input.date,
        authorizedBy: ctx.userId || null,
      });

      return {
        success: true,
        data: {
          transaction: this.formatTransaction(result.transaction),
          balance: this.formatBalance(result.balance),
        },
      };
    } catch (error) {
      console.error("Error creating TOIL usage:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to create TOIL usage" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  async getTransactions(
    ctx: TenantContext,
    query: ToilTransactionQuery
  ): Promise<ServiceResult<{ items: unknown[]; cursor: string | null; hasMore: boolean }>> {
    try {
      const result = await this.repo.getTransactions(ctx, {
        employeeId: query.employeeId,
        balanceId: query.balanceId,
        type: query.type,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        cursor: query.cursor,
        limit: query.limit,
      });
      return {
        success: true,
        data: {
          items: result.data.map(this.formatTransaction),
          cursor: result.cursor,
          hasMore: result.hasMore,
        },
      };
    } catch (error) {
      console.error("Error listing TOIL transactions:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to list TOIL transactions" },
      };
    }
  }

  async getTransactionById(
    ctx: TenantContext,
    id: string
  ): Promise<ServiceResult<unknown>> {
    try {
      const txn = await this.repo.getTransactionById(ctx, id);
      if (!txn) {
        return {
          success: false,
          error: { code: ToilErrorCodes.TRANSACTION_NOT_FOUND, message: "TOIL transaction not found" },
        };
      }
      return { success: true, data: this.formatTransaction(txn) };
    } catch (error) {
      console.error("Error fetching TOIL transaction:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch TOIL transaction" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Formatters
  // ---------------------------------------------------------------------------

  private formatBalance(balance: ToilBalanceRow) {
    return {
      id: balance.id,
      tenantId: balance.tenantId,
      employeeId: balance.employeeId,
      accruedHours: Number(balance.accruedHours),
      usedHours: Number(balance.usedHours),
      balanceHours: Number(balance.balanceHours),
      periodStart:
        balance.periodStart instanceof Date
          ? balance.periodStart.toISOString().split("T")[0]
          : balance.periodStart,
      periodEnd:
        balance.periodEnd instanceof Date
          ? balance.periodEnd.toISOString().split("T")[0]
          : balance.periodEnd,
      expiryDays: balance.expiryDays,
      createdAt:
        balance.createdAt instanceof Date
          ? balance.createdAt.toISOString()
          : balance.createdAt,
      updatedAt:
        balance.updatedAt instanceof Date
          ? balance.updatedAt.toISOString()
          : balance.updatedAt,
    };
  }

  private formatTransaction(txn: ToilTransactionRow) {
    return {
      id: txn.id,
      tenantId: txn.tenantId,
      employeeId: txn.employeeId,
      balanceId: txn.balanceId,
      type: txn.type,
      hours: Number(txn.hours),
      reason: txn.reason,
      authorizedBy: txn.authorizedBy,
      date:
        txn.date instanceof Date
          ? txn.date.toISOString().split("T")[0]
          : txn.date,
      expiresAt:
        txn.expiresAt instanceof Date
          ? txn.expiresAt.toISOString().split("T")[0]
          : txn.expiresAt,
      createdAt:
        txn.createdAt instanceof Date
          ? txn.createdAt.toISOString()
          : txn.createdAt,
    };
  }
}
