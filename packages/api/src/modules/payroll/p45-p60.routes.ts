/**
 * P45/P60 Statutory Document Routes (TODO-129, TODO-130)
 *
 * API endpoints for generating and managing P45 (leaver) and P60 (end-of-year)
 * statutory tax documents as required by HMRC.
 *
 * Admin Endpoints:
 *   GET  /p45-p60/p45/:employeeId   - Generate P45 for a leaver
 *   GET  /p45-p60/p60/:employeeId   - Generate P60 for an employee
 *   GET  /p45-p60/p60/bulk          - Generate P60s for all employees in a tax year
 *
 * Portal (Employee Self-Service) Endpoints:
 *   GET  /portal/p45-p60/my-documents - List own P45/P60 documents
 *   GET  /portal/p45-p60/:id/download - Download a specific document
 *
 * Permission model:
 *   Admin: payroll:write (generate), payroll:read (view)
 *   Portal: employee self-service (own documents only)
 */

import { Elysia } from "elysia";
import { requirePermission } from "../../plugins/rbac";

// =============================================================================
// Admin Routes
// =============================================================================

export const p45P60AdminRoutes = new Elysia({
  prefix: "/p45-p60",
  name: "p45-p60-admin-routes",
})
  // GET /p45-p60/documents - List generated P45/P60 documents
  .get(
    "/documents",
    async () => {
      // TODO-129, TODO-130: Implement P45/P60 document listing
      return { items: [], nextCursor: null, hasMore: false };
    },
    {
      beforeHandle: [requirePermission("payroll", "read")],
      detail: {
        tags: ["Payroll - P45/P60"],
        summary: "List P45/P60 documents",
        description:
          "List generated P45 and P60 statutory documents with optional filters.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type P45P60AdminRoutes = typeof p45P60AdminRoutes;

// =============================================================================
// Portal (Employee Self-Service) Routes
// =============================================================================

export const p45P60PortalRoutes = new Elysia({
  prefix: "/portal/p45-p60",
  name: "p45-p60-portal-routes",
})
  // GET /portal/p45-p60/my-documents - List own P45/P60 documents
  .get(
    "/my-documents",
    async () => {
      // TODO-129, TODO-130: Implement employee self-service P45/P60 listing
      return { items: [], nextCursor: null, hasMore: false };
    },
    {
      detail: {
        tags: ["Portal - P45/P60"],
        summary: "List my P45/P60 documents",
        description:
          "List P45 and P60 documents for the authenticated employee.",
        security: [{ bearerAuth: [] }],
      },
    }
  );

export type P45P60PortalRoutes = typeof p45P60PortalRoutes;
