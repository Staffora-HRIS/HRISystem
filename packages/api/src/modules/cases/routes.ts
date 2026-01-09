/**
 * Cases Module Routes
 *
 * HR Cases/Tickets management
 */

import { Elysia, t } from "elysia";

const UuidSchema = t.String({ format: "uuid" });

export const casesRoutes = new Elysia({ prefix: "/cases" })

  .get("/", async (ctx) => {
    const { tenant, user, db, query, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const cases = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT c.*, e.first_name || ' ' || e.last_name as requester_name,
                 a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.employees e ON e.id = c.requester_id
          LEFT JOIN app.users a ON a.id = c.assignee_id
          WHERE c.tenant_id = ${tenant.id}::uuid
          ${query.category ? tx`AND c.category = ${query.category}` : tx``}
          ${query.status ? tx`AND c.status = ${query.status}` : tx``}
          ${query.priority ? tx`AND c.priority = ${query.priority}` : tx``}
          ${query.assigneeId ? tx`AND c.assignee_id = ${query.assigneeId}::uuid` : tx``}
          ORDER BY 
            CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
            c.created_at DESC
          LIMIT ${query.limit !== undefined && query.limit !== null ? Number(query.limit) : 20}
        `;
      });
      return { cases, count: cases.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      category: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      assigneeId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    detail: { tags: ["Cases"], summary: "List cases" }
  })

  .post("/", async (ctx) => {
    const { tenant, user, db, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [hrCase] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        const caseNumber = `CASE-${Date.now().toString(36).toUpperCase()}`;
        return tx`
          INSERT INTO app.cases (
            id, tenant_id, case_number, requester_id, category, subject,
            description, priority, status, created_by
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${caseNumber},
            ${(body as any).requesterId}::uuid, ${(body as any).category}, ${(body as any).subject},
            ${(body as any).description || null}, ${(body as any).priority || 'medium'}, 'open', ${user.id}::uuid
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return hrCase;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    body: t.Object({
      requesterId: UuidSchema,
      category: t.String({ minLength: 1, maxLength: 50 }),
      subject: t.String({ minLength: 1, maxLength: 200 }),
      description: t.Optional(t.String({ maxLength: 5000 })),
      priority: t.Optional(t.Union([
        t.Literal("low"),
        t.Literal("medium"),
        t.Literal("high"),
        t.Literal("urgent"),
      ])),
    }),
    detail: { tags: ["Cases"], summary: "Create case" }
  })

  .get("/:id", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [hrCase] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT c.*, e.first_name || ' ' || e.last_name as requester_name,
                 a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.employees e ON e.id = c.requester_id
          LEFT JOIN app.users a ON a.id = c.assignee_id
          WHERE c.id = ${params.id}::uuid AND c.tenant_id = ${tenant.id}::uuid
        `;
      });

      if (!hrCase) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Case not found" } };
      }
      return hrCase;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["Cases"], summary: "Get case by ID" }
  })

  .patch("/:id", async (ctx) => {
    const { tenant, user, db, params, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [hrCase] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          UPDATE app.cases SET
            status = COALESCE(${(body as any).status}, status),
            priority = COALESCE(${(body as any).priority}, priority),
            assignee_id = COALESCE(${(body as any).assigneeId}::uuid, assignee_id),
            resolution = COALESCE(${(body as any).resolution}, resolution),
            resolved_at = CASE WHEN ${(body as any).status} = 'resolved' THEN now() ELSE resolved_at END,
            closed_at = CASE WHEN ${(body as any).status} = 'closed' THEN now() ELSE closed_at END,
            updated_at = now()
          WHERE id = ${params.id}::uuid AND tenant_id = ${tenant.id}::uuid
          RETURNING *
        `;
      });

      if (!hrCase) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Case not found" } };
      }
      return hrCase;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      assigneeId: t.Optional(UuidSchema),
      resolution: t.Optional(t.String()),
    }),
    detail: { tags: ["Cases"], summary: "Update case" }
  })

  // Case Comments
  .get("/:id/comments", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const comments = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT cc.*, u.first_name || ' ' || u.last_name as author_name
          FROM app.case_comments cc
          JOIN app.users u ON u.id = cc.author_id
          WHERE cc.case_id = ${params.id}::uuid
          ORDER BY cc.created_at ASC
        `;
      });
      return { comments, count: comments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["Cases"], summary: "Get case comments" }
  })

  .post("/:id/comments", async (ctx) => {
    const { tenant, user, db, params, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [comment] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          INSERT INTO app.case_comments (
            id, case_id, author_id, content, is_internal
          ) VALUES (
            gen_random_uuid(), ${params.id}::uuid, ${user.id}::uuid,
            ${(body as any).content}, ${(body as any).isInternal || false}
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return comment;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Object({
      content: t.String({ minLength: 1, maxLength: 5000 }),
      isInternal: t.Optional(t.Boolean()),
    }),
    detail: { tags: ["Cases"], summary: "Add case comment" }
  })

  // My Cases
  .get("/my-cases", async (ctx) => {
    const { tenant, user, db, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [employee] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`SELECT id FROM app.employees WHERE user_id = ${user.id}::uuid AND tenant_id = ${tenant.id}::uuid`;
      });

      if (!employee) {
        return { cases: [], count: 0 };
      }

      const cases = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT c.*, a.first_name || ' ' || a.last_name as assignee_name
          FROM app.cases c
          LEFT JOIN app.users a ON a.id = c.assignee_id
          WHERE c.requester_id = ${employee.id}::uuid AND c.tenant_id = ${tenant.id}::uuid
          ORDER BY c.created_at DESC
        `;
      });

      return { cases, count: cases.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["Cases"], summary: "Get my cases" }
  });

export type CasesRoutes = typeof casesRoutes;
