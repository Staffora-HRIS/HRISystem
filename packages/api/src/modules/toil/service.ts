/**
 * Time Off In Lieu (TOIL) Service
 *
 * Business logic for TOIL balance and transaction management.
 *
 * Business rules:
 *  - Balance cannot go negative (used_hours + expired_hours cannot exceed accrued_hours)
 *  - Accruals add to the employee TOIL balance
 *  - Usage deducts from the available balance; rejected if insufficient
 *  - Manual adjustments require a mandatory reason
 *  - All mutations emit domain events via the outbox pattern
 */

import {
  ToilRepository,
  type TenantContext,
  type ToilBalanceRow,
  type ToilTransactionRow,
} from "./repository";
import type {
  AccrueToil,
  UseToil,
  AdjustToil,
  ToilTransactionFilters,
  ToilBalanceResponse,
  ToilTransactionResponse,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

// =============================================================================
// Error codes
// =============================================================================

export const ToilErrorCodes = {
  BALANCE_NOT_FOUND: "TOIL_BALANCE_NOT_FOUND",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_TOIL_BALANCE",
  ZERO_ADJUSTMENT: "TOIL_ZERO_ADJUSTMENT",
} as const;

// =============================================================================
// Service
// =============================================================================

export class ToilService {
  constructor(private repo: ToilRepository) {}

  // ---------------------------------------------------------------------------
  // Get balance for employee
  // ---------------------------------------------------------------------------

  async getBalance(
    ctx: TenantContext,
    employeeId: string
  ): Promise<ServiceResult<ToilBalanceResponse>> {
    try {
      const balance = await this.repo.getBalance(ctx, employeeId);
      if (!balance) {
        return {
          success: true,
          data: {
            id: "00000000-0000-0000-0000-000000000000",
            tenantId: ctx.tenantId,
            employeeId,
            accruedHours: 0,
            usedHours: 0,
            expiredHours: 0,
            balanceHours: 0,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      return { success: true, data: this.formatBalance(balance) };
    } catch (error) {
      console.error("Error fetching TOIL balance:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to fetch TOIL balance" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Get transaction history (cursor-paginated)
  // ---------------------------------------------------------------------------

  async getTransactions(
    ctx: TenantContext,
    employeeId: string,
    filters: ToilTransactionFilters
  ): Promise<ServiceResult<{ items: ToilTransactionResponse[]; cursor: string | null; hasMore: boolean }>> {
    try {
      const result = await this.repo.getTransactions(ctx, employeeId, {
        type: filters.type,
        cursor: filters.cursor,
        limit: filters.limit,
      });

      return {
        success: true,
        data: {
          items: result.data.map((row) => this.formatTransaction(row)),
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

  // ---------------------------------------------------------------------------
  // Accrue TOIL from overtime
  // ---------------------------------------------------------------------------

  async accrue(
    ctx: TenantContext,
    input: AccrueToil
  ): Promise<ServiceResult<{ transaction: ToilTransactionResponse; balance: ToilBalanceResponse }>> {
    try {
      const result = await this.repo.accrue(ctx, {
        employeeId: input.employeeId,
        hours: input.hours,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.userId ?? null,
      });

      return {
        success: true,
        data: {
          transaction: this.formatTransaction(result.transaction),
          balance: this.formatBalance(result.balance),
        },
      };
    } catch (error) {
      console.error("Error accruing TOIL:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to accrue TOIL" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Use TOIL (take time off)
  // ---------------------------------------------------------------------------

  async use(
    ctx: TenantContext,
    input: UseToil
  ): Promise<ServiceResult<{ transaction: ToilTransactionResponse; balance: ToilBalanceResponse }>> {
    try {
      const balance = await this.repo.getBalance(ctx, input.employeeId);
      const availableHours = balance
        ? Number(balance.accruedHours) - Number(balance.usedHours) - Number(balance.expiredHours)
        : 0;

      if (input.hours > availableHours) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.INSUFFICIENT_BALANCE,
            message: `Insufficient TOIL balance. Requested ${input.hours} hours but only ${availableHours} hours available.`,
            details: {
              requestedHours: input.hours,
              availableHours,
              accruedHours: balance ? Number(balance.accruedHours) : 0,
              usedHours: balance ? Number(balance.usedHours) : 0,
              expiredHours: balance ? Number(balance.expiredHours) : 0,
            },
          },
        };
      }

      const result = await this.repo.use(ctx, {
        employeeId: input.employeeId,
        hours: input.hours,
        referenceId: input.referenceId ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.userId ?? null,
      });

      return {
        success: true,
        data: {
          transaction: this.formatTransaction(result.transaction),
          balance: this.formatBalance(result.balance),
        },
      };
    } catch (error) {
      console.error("Error using TOIL:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to use TOIL" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Manual adjustment
  // ---------------------------------------------------------------------------

  async adjust(
    ctx: TenantContext,
    input: AdjustToil
  ): Promise<ServiceResult<{ transaction: ToilTransactionResponse; balance: ToilBalanceResponse }>> {
    try {
      if (input.hours === 0) {
        return {
          success: false,
          error: {
            code: ToilErrorCodes.ZERO_ADJUSTMENT,
            message: "Adjustment hours must be non-zero.",
          },
        };
      }

      if (input.hours < 0) {
        const balance = await this.repo.getBalance(ctx, input.employeeId);
        const availableHours = balance
          ? Number(balance.accruedHours) - Number(balance.usedHours) - Number(balance.expiredHours)
          : 0;

        if (Math.abs(input.hours) > availableHours) {
          return {
            success: false,
            error: {
              code: ToilErrorCodes.INSUFFICIENT_BALANCE,
              message: `Cannot deduct ${Math.abs(input.hours)} hours. Only ${availableHours} hours available.`,
              details: { requestedDeduction: Math.abs(input.hours), availableHours },
            },
          };
        }
      }

      const result = await this.repo.adjust(ctx, {
        employeeId: input.employeeId,
        hours: input.hours,
        notes: input.notes,
        createdBy: ctx.userId ?? null,
      });

      return {
        success: true,
        data: {
          transaction: this.formatTransaction(result.transaction),
          balance: this.formatBalance(result.balance),
        },
      };
    } catch (error) {
      console.error("Error adjusting TOIL:", error);
      return {
        success: false,
        error: { code: ErrorCodes.INTERNAL_ERROR, message: "Failed to adjust TOIL" },
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Formatters
  // ---------------------------------------------------------------------------

  private formatBalance(balance: ToilBalanceRow): ToilBalanceResponse {
    return {
      id: balance.id,
      tenantId: balance.tenantId,
      employeeId: balance.employeeId,
      accruedHours: Number(balance.accruedHours),
      usedHours: Number(balance.usedHours),
      expiredHours: Number(balance.expiredHours),
      balanceHours: Number(balance.balanceHours),
      updatedAt:
        balance.updatedAt instanceof Date
          ? balance.updatedAt.toISOString()
          : String(balance.updatedAt),
    };
  }

  private formatTransaction(txn: ToilTransactionRow): ToilTransactionResponse {
    return {
      id: txn.id,
      tenantId: txn.tenantId,
      employeeId: txn.employeeId,
      type: txn.type as ToilTransactionResponse["type"],
      hours: Number(txn.hours),
      referenceId: txn.referenceId,
      notes: txn.notes,
      createdBy: txn.createdBy,
      createdAt:
        txn.createdAt instanceof Date
          ? txn.createdAt.toISOString()
          : String(txn.createdAt),
    };
  }
}
