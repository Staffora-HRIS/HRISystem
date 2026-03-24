/**
 * Lookup Values Module Routes
 *
 * Tenant-configurable lookup categories and values.
 *
 * Endpoints:
 *  GET    /lookup-values/categories                          - List categories
 *  POST   /lookup-values/categories                          - Create category
 *  GET    /lookup-values/categories/:id                      - Get category by ID
 *  PATCH  /lookup-values/categories/:id                      - Update category
 *  DELETE /lookup-values/categories/:id                      - Delete category
 *  GET    /lookup-values/categories/:id/values       - List values in category
 *  POST   /lookup-values/categories/:id/values       - Create value
 *  GET    /lookup-values/values/:id                          - Get value by ID
 *  PATCH  /lookup-values/values/:id                          - Update value
 *  DELETE /lookup-values/values/:id                          - Delete value
 *  GET    /lookup-values/by-code/:code                       - Get values by category code
 *  POST   /lookup-values/seed                                - Seed default categories
 */

import { Elysia, t } from "elysia";
import { requirePermission } from "../../plugins/rbac";
import { mapErrorToStatus } from "../../lib/route-helpers";
import { LookupValuesRepository } from "./repository";
import { LookupValuesService } from "./service";

const UuidSchema = t.String({ format: "uuid" });

/** Module-specific error code overrides */
const LOOKUP_ERROR_CODES: Record<string, number> = {
  DUPLICATE_CODE: 409,
  CREATE_FAILED: 500,
  UPDATE_FAILED: 500,
  DELETE_FAILED: 500,
  SEED_FAILED: 500,
};

export const lookupValuesRoutes = new Elysia({
  prefix: "/lookup-values",
  name: "lookup-values-routes",
})

  // Wire up service and repository via derive
  .derive((ctx) => {
    const { db } = ctx as any;
    const repository = new LookupValuesRepository(db);
    const service = new LookupValuesService(repository, db);

    const { tenant, user } = ctx as any;
    const tenantContext = {
      tenantId: tenant?.id || "",
      userId: user?.id,
    };

    return { lookupService: service, tenantContext };
  })

  // ===========================================================================
  // Category Routes
  // ===========================================================================

  .get(
    "/categories",
    async (ctx) => {
      const { lookupService, tenantContext, query } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const result = await lookupService.listCategories(
        tenantContext,
        filters,
        {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );
      return result;
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePermission("settings", "read")],
      detail: {
        tags: ["Settings"],
        summary: "List lookup categories",
        description: "List all lookup categories for the current tenant",
      },
    }
  )

  .post(
    "/categories",
    async (ctx) => {
      const { lookupService, tenantContext, body, set } = ctx as any;

      const result = await lookupService.createCategory(tenantContext, body);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      body: t.Object({
        code: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z][a-z0-9_]*$" }),
        name: t.String({ minLength: 1, maxLength: 200 }),
        description: t.Optional(t.String({ maxLength: 1000 })),
      }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Create lookup category",
        description: "Create a new tenant-specific lookup category",
      },
    }
  )

  .get(
    "/categories/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, set } = ctx as any;

      const result = await lookupService.getCategory(tenantContext, params.id);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePermission("settings", "read")],
      detail: {
        tags: ["Settings"],
        summary: "Get lookup category",
      },
    }
  )

  .patch(
    "/categories/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, body, set } = ctx as any;

      const result = await lookupService.updateCategory(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
        isActive: t.Optional(t.Boolean()),
      }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Update lookup category",
      },
    }
  )

  .delete(
    "/categories/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, set } = ctx as any;

      const result = await lookupService.deleteCategory(tenantContext, params.id);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Delete lookup category",
        description:
          "Delete a custom lookup category. System categories cannot be deleted.",
      },
    }
  )

  // ===========================================================================
  // Value Routes (nested under category)
  // ===========================================================================

  .get(
    "/categories/:id/values",
    async (ctx) => {
      const { lookupService, tenantContext, params, query } = ctx as any;
      const { cursor, limit, ...filters } = query;
      const result = await lookupService.listValues(
        tenantContext,
        params.id,
        filters,
        {
          cursor,
          limit: limit !== undefined && limit !== null ? Number(limit) : undefined,
        }
      );
      return result;
    },
    {
      params: t.Object({ id: UuidSchema }),
      query: t.Object({
        search: t.Optional(t.String()),
        isActive: t.Optional(t.Boolean()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
      beforeHandle: [requirePermission("settings", "read")],
      detail: {
        tags: ["Settings"],
        summary: "List lookup values for category",
      },
    }
  )

  .post(
    "/categories/:id/values",
    async (ctx) => {
      const { lookupService, tenantContext, params, body, set } = ctx as any;

      const result = await lookupService.createValue(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      set.status = 201;
      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: t.Object({
        code: t.String({ minLength: 1, maxLength: 100, pattern: "^[a-z][a-z0-9_]*$" }),
        label: t.String({ minLength: 1, maxLength: 200 }),
        description: t.Optional(t.String({ maxLength: 1000 })),
        sortOrder: t.Optional(t.Number({ minimum: 0 })),
        isDefault: t.Optional(t.Boolean()),
        metadata: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Create lookup value",
        description: "Add a new value to a lookup category",
      },
    }
  )

  // ===========================================================================
  // Value Routes (direct access)
  // ===========================================================================

  .get(
    "/values/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, set } = ctx as any;

      const result = await lookupService.getValue(tenantContext, params.id);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePermission("settings", "read")],
      detail: {
        tags: ["Settings"],
        summary: "Get lookup value by ID",
      },
    }
  )

  .patch(
    "/values/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, body, set } = ctx as any;

      const result = await lookupService.updateValue(
        tenantContext,
        params.id,
        body
      );

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      body: t.Object({
        label: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        description: t.Optional(t.Union([t.String({ maxLength: 1000 }), t.Null()])),
        sortOrder: t.Optional(t.Number({ minimum: 0 })),
        isDefault: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
        metadata: t.Optional(t.Union([t.Record(t.String(), t.Unknown()), t.Null()])),
      }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Update lookup value",
      },
    }
  )

  .delete(
    "/values/:id",
    async (ctx) => {
      const { lookupService, tenantContext, params, set } = ctx as any;

      const result = await lookupService.deleteValue(tenantContext, params.id);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      params: t.Object({ id: UuidSchema }),
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Delete lookup value",
      },
    }
  )

  // ===========================================================================
  // Convenience Routes
  // ===========================================================================

  .get(
    "/by-code/:code",
    async (ctx) => {
      const { lookupService, tenantContext, params, query } = ctx as any;
      const activeOnly = query.activeOnly !== false;
      const values = await lookupService.getValuesByCode(
        tenantContext,
        params.code,
        activeOnly
      );
      return { items: values, count: values.length };
    },
    {
      params: t.Object({ code: t.String({ minLength: 1, maxLength: 100 }) }),
      query: t.Object({
        activeOnly: t.Optional(t.Boolean()),
      }),
      beforeHandle: [requirePermission("settings", "read")],
      detail: {
        tags: ["Settings"],
        summary: "Get values by category code",
        description:
          "Get all values for a lookup category by its code. Useful for populating dropdowns.",
      },
    }
  )

  .post(
    "/seed",
    async (ctx) => {
      const { lookupService, tenantContext, set } = ctx as any;

      const result = await lookupService.seedDefaults(tenantContext);

      if (!result.success) {
        set.status = mapErrorToStatus(result.error!.code, LOOKUP_ERROR_CODES);
        return { error: result.error };
      }

      return result.data;
    },
    {
      beforeHandle: [requirePermission("settings", "write")],
      detail: {
        tags: ["Settings"],
        summary: "Seed default lookup categories",
        description:
          "Seed the default system lookup categories and values (employment_type, contract_type, etc.). Idempotent -- safe to call multiple times.",
      },
    }
  );

export type LookupValuesRoutes = typeof lookupValuesRoutes;
