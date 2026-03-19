/**
 * Contract End Date Report - Service Layer
 *
 * Business logic for the contract end date reporting endpoint.
 * Validates input, parses cursors, and delegates to the repository.
 */

import type { DatabaseClient } from "../../plugins/db";
import type { ServiceResult, TenantContext } from "../../types/service-result";
import { getContractsEndingSoon } from "./contract-end-dates.repository";

// =============================================================================
// Types
// =============================================================================

export interface ContractEndDateResult {
  items: Array<{
    employeeId: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    departmentId: string | null;
    departmentName: string | null;
    contractType: string;
    contractEndDate: string;
    daysRemaining: number;
    contractId: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export interface ContractEndDateParams {
  daysAhead?: number;
  contractType?: string;
  departmentId?: string;
  cursor?: string;
  limit?: number;
}

// =============================================================================
// Service
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function queryContractEndDates(
  db: DatabaseClient,
  ctx: TenantContext,
  params: ContractEndDateParams
): Promise<ServiceResult<ContractEndDateResult>> {
  // Validate and clamp days_ahead (default 90, max 365, min 1)
  const daysAhead = Math.min(Math.max(params.daysAhead ?? 90, 1), 365);

  // Validate and clamp limit (default 50, max 100, min 1)
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

  // Parse cursor if provided: format is "YYYY-MM-DD|uuid"
  let parsedCursor: { endDate: string; contractId: string } | undefined;
  if (params.cursor) {
    const parts = params.cursor.split("|");
    if (parts.length !== 2) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid cursor format. Expected format: YYYY-MM-DD|uuid",
        },
      };
    }
    const [endDate, contractId] = parts;
    if (!DATE_RE.test(endDate)) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid cursor: date component must be YYYY-MM-DD",
        },
      };
    }
    if (!UUID_RE.test(contractId)) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid cursor: id component must be a valid UUID",
        },
      };
    }
    parsedCursor = { endDate, contractId };
  }

  // Validate department_id UUID format if provided
  if (params.departmentId && !UUID_RE.test(params.departmentId)) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "department_id must be a valid UUID",
      },
    };
  }

  return db.withTransaction(ctx, async (tx) => {
    const { rows, total } = await getContractsEndingSoon(tx, {
      daysAhead,
      contractType: params.contractType,
      departmentId: params.departmentId,
      cursor: parsedCursor,
      limit: limit + 1, // Fetch one extra to determine hasMore
    });

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Build next cursor from the last row in the page
    let nextCursor: string | null = null;
    if (hasMore && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      // postgres.js returns date columns as Date objects at runtime
      const rawDate = lastRow.contractEndDate as unknown;
      const endDateStr =
        rawDate && typeof (rawDate as Date).toISOString === "function"
          ? (rawDate as Date).toISOString().split("T")[0]
          : String(lastRow.contractEndDate);
      nextCursor = `${endDateStr}|${lastRow.contractId}`;
    }

    const items = pageRows.map((row) => {
      const rawDate = row.contractEndDate as unknown;
      const endDateStr =
        rawDate && typeof (rawDate as Date).toISOString === "function"
          ? (rawDate as Date).toISOString().split("T")[0]
          : String(row.contractEndDate);

      return {
        employeeId: row.employeeId,
        employeeNumber: row.employeeNumber,
        firstName: row.firstName ?? "",
        lastName: row.lastName ?? "",
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        contractType: row.contractType,
        contractEndDate: endDateStr,
        daysRemaining: row.daysRemaining,
        contractId: row.contractId,
      };
    });

    return {
      success: true,
      data: { items, nextCursor, hasMore, total },
    };
  });
}
