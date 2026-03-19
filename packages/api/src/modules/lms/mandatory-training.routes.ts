/**
 * Mandatory Training Routes
 *
 * CRUD for mandatory training rules and assignment listing/bulk-assign.
 * All routes delegate to MandatoryTrainingService for business logic.
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { ErrorCodes } from "../../plugins/errors";
import { MandatoryTrainingRepository } from "./mandatory-training.repository";
import { MandatoryTrainingService } from "./mandatory-training.service";
import {
  CreateMandatoryTrainingRuleSchema,
  UpdateMandatoryTrainingRuleSchema,
  MandatoryRuleListQuerySchema,
  MandatoryAssignmentListQuerySchema,
} from "./mandatory-training.schemas";
import { mapErrorToStatus } from "../../lib/route-helpers";

const UuidSchema = t.String({ format: "uuid" });

/** Module-specific error code overrides */
const MT_ERROR_CODES: Record<string, number> = {
  COURSE_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
};

export const mandatoryTrainingRoutes = new Elysia({ prefix: "/lms/mandatory-rules" })

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new MandatoryTrainingRepository(db);
    const service = new MandatoryTrainingService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { mtService: service, mtRepository: repository, tenantContext };
  })

  // =========================================================================
  // Rules CRUD
  // =========================================================================

  // List mandatory training rules
  .get("/", async (ctx) => {
    const { mtService, tenantContext, query, set } = ctx as any;

    try {
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit ? Number(limit) : undefined;

      const result = await mtService.listRules(
        tenantContext,
        {
          ...filters,
          isActive: filters.isActive === "true" ? true : filters.isActive === "false" ? false : undefined,
        },
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: MandatoryRuleListQuerySchema,
    beforeHandle: [requirePermission("lms", "read")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "List mandatory training rules",
      description: "Returns all mandatory training rules for the current tenant with optional filters.",
    },
  })

  // Get a single mandatory training rule
  .get("/:id", async (ctx) => {
    const { mtService, tenantContext, params, set } = ctx as any;

    const result = await mtService.getRule(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, MT_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Get mandatory training rule by ID",
    },
  })

  // Create a mandatory training rule
  .post("/", async (ctx) => {
    const { mtService, tenantContext, body, set } = ctx as any;

    const result = await mtService.createRule(tenantContext, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, MT_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    body: CreateMandatoryTrainingRuleSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Create mandatory training rule",
      description: "Create a new rule that defines which course is mandatory for which group of employees.",
    },
  })

  // Update a mandatory training rule
  .patch("/:id", async (ctx) => {
    const { mtService, tenantContext, params, body, set } = ctx as any;

    const result = await mtService.updateRule(tenantContext, params.id, body);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, MT_ERROR_CODES);
      return { error: result.error };
    }

    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    body: UpdateMandatoryTrainingRuleSchema,
    beforeHandle: [requirePermission("lms", "write")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Update mandatory training rule",
    },
  })

  // Delete a mandatory training rule
  .delete("/:id", async (ctx) => {
    const { mtService, tenantContext, params, set } = ctx as any;

    const result = await mtService.deleteRule(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, MT_ERROR_CODES);
      return { error: result.error };
    }

    return { success: true, message: "Mandatory training rule deleted" };
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Delete mandatory training rule",
      description: "Deletes the rule and cascades to all associated assignments.",
    },
  })

  // =========================================================================
  // Bulk Assignment
  // =========================================================================

  // Assign a rule to all matching employees
  .post("/:id/assign", async (ctx) => {
    const { mtService, tenantContext, params, set } = ctx as any;

    const result = await mtService.bulkAssign(tenantContext, params.id);

    if (!result.success) {
      set.status = mapErrorToStatus(result.error.code, MT_ERROR_CODES);
      return { error: result.error };
    }

    set.status = 201;
    return result.data;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "write")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Bulk assign mandatory training to matching employees",
      description: "Finds all employees matching the rule scope (all/department/role) and creates assignments. Skips employees who already have an active assignment for this rule.",
    },
  });

// =========================================================================
// Mandatory Training Assignments Routes (separate prefix)
// =========================================================================

export const mandatoryAssignmentRoutes = new Elysia({ prefix: "/lms/mandatory-assignments" })

  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new MandatoryTrainingRepository(db);
    const service = new MandatoryTrainingService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { mtService: service, mtRepository: repository, tenantContext };
  })

  // List mandatory training assignments
  .get("/", async (ctx) => {
    const { mtService, tenantContext, query, set } = ctx as any;

    try {
      const { cursor, limit, ...filters } = query;
      const parsedLimit = limit ? Number(limit) : undefined;

      const result = await mtService.listAssignments(
        tenantContext,
        filters,
        { cursor, limit: parsedLimit }
      );

      return {
        items: result.items,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }, {
    query: MandatoryAssignmentListQuerySchema,
    beforeHandle: [requirePermission("lms", "read")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "List mandatory training assignments",
      description: "Returns mandatory training assignments with optional filters by rule, employee, course, or status.",
    },
  })

  // Get a single mandatory training assignment
  .get("/:id", async (ctx) => {
    const { mtRepository, tenantContext, params, set } = ctx as any;

    const assignment = await mtRepository.getAssignmentById(tenantContext, params.id);

    if (!assignment) {
      set.status = 404;
      return { error: { code: ErrorCodes.NOT_FOUND, message: "Assignment not found" } };
    }

    return assignment;
  }, {
    params: t.Object({ id: UuidSchema }),
    beforeHandle: [requirePermission("lms", "read")],
    detail: {
      tags: ["LMS", "Mandatory Training"],
      summary: "Get mandatory training assignment by ID",
    },
  });

export type MandatoryTrainingRoutes = typeof mandatoryTrainingRoutes;
export type MandatoryAssignmentRoutes = typeof mandatoryAssignmentRoutes;
