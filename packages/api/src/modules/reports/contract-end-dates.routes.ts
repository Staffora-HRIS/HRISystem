/**
 * Contract End Date Report - Elysia Routes
 *
 * GET /api/v1/reports/contract-end-dates
 *
 * Returns employees with non-permanent contracts (fixed_term, contractor,
 * intern, temporary) ending within a configurable look-ahead window.
 * Supports filtering by contract type and department, with cursor-based
 * pagination sorted by contract end date ascending.
 *
 * Status codes:
 *   200 - Success
 *   400 - Validation error (invalid cursor, invalid department_id)
 *   401 - Authentication required
 *   403 - Insufficient permissions (requires reports:read)
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { getHttpStatus } from "../../lib/route-errors";
import { ContractEndDateQuerySchema } from "./contract-end-dates.schemas";
import { queryContractEndDates } from "./contract-end-dates.service";

export const contractEndDateRoutes = new Elysia({ prefix: "/reports" })

  .get(
    "/contract-end-dates",
    async (ctx) => {
      const { tenantContext, requestId, query, db } = ctx as any;
      if (!tenantContext) {
        ctx.set.status = 401;
        return { error: { code: "UNAUTHORIZED", message: "Authentication required", requestId } };
      }

      const result = await queryContractEndDates(db, tenantContext, {
        daysAhead: query.days_ahead ? parseInt(query.days_ahead, 10) : undefined,
        contractType: query.contract_type,
        departmentId: query.department_id,
        cursor: query.cursor,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });

      if (!result.success) {
        const status = getHttpStatus(result.error!.code);
        ctx.set.status = status;
        return { error: { ...result.error, requestId } };
      }

      return {
        data: result.data!.items,
        nextCursor: result.data!.nextCursor,
        hasMore: result.data!.hasMore,
        total: result.data!.total,
      };
    },
    {
      beforeHandle: [requirePermission("reports", "read")],
      query: ContractEndDateQuerySchema,
      detail: {
        tags: ["Reports"],
        summary: "Contract end date report",
        description:
          "Returns employees with non-permanent contracts ending within the specified look-ahead window. " +
          "Supports filtering by contract type and department, with cursor-based pagination.",
      },
    }
  );
