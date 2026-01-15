import { Elysia } from "elysia";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  settings: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export const tenantRoutes = new Elysia({ prefix: "/tenant" })
  .get("/current", async (ctx) => {
    const { user, session, authService, tenant, db, set, requestId } = ctx as any;

    if (!user || !session) {
      set.status = 401;
      return {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId: requestId || "",
        },
      };
    }

    const tenantId = tenant?.id ?? (await authService.getSessionTenant(session.id, user.id));

    if (!tenantId) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "No tenant selected for current session",
          requestId: requestId || "",
        },
      };
    }

    const rows = await db.withSystemContext(async (tx: any) => {
      return await tx<TenantRow[]>`
        SELECT id, name, slug, status, settings, created_at, updated_at
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    const row = (rows as TenantRow[])[0];
    if (!row) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
          requestId: requestId || "",
        },
      };
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      settings: row.settings ?? {},
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    };
  })
  .get("/settings", async (ctx) => {
    const { user, session, authService, tenant, db, set, requestId } = ctx as any;

    if (!user || !session) {
      set.status = 401;
      return {
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          requestId: requestId || "",
        },
      };
    }

    const tenantId = tenant?.id ?? (await authService.getSessionTenant(session.id, user.id));

    if (!tenantId) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "No tenant selected for current session",
          requestId: requestId || "",
        },
      };
    }

    const rows = await db.withSystemContext(async (tx: any) => {
      return await tx<Array<{ settings: Record<string, unknown> }>>`
        SELECT settings
        FROM app.tenants
        WHERE id = ${tenantId}::uuid
        LIMIT 1
      `;
    });

    const row = (rows as Array<{ settings: Record<string, unknown> }>)[0];
    if (!row) {
      set.status = 404;
      return {
        error: {
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
          requestId: requestId || "",
        },
      };
    }

    return row.settings ?? {};
  });

export type TenantRoutes = typeof tenantRoutes;
