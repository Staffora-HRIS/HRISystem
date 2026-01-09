/**
 * Onboarding Module Routes
 *
 * Onboarding checklists and tasks management
 */

import { Elysia, t } from "elysia";

const UuidSchema = t.String({ format: "uuid" });

export const onboardingRoutes = new Elysia({ prefix: "/onboarding" })

  // Checklists (Templates)
  .get("/checklists", async (ctx) => {
    const { tenant, user, db, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const checklists = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT * FROM app.onboarding_checklists
          WHERE tenant_id = ${tenant.id}::uuid
          ORDER BY name ASC
        `;
      });
      return { checklists, count: checklists.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["Onboarding"], summary: "List onboarding checklists" }
  })

  .post("/checklists", async (ctx) => {
    const { tenant, user, db, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [checklist] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          INSERT INTO app.onboarding_checklists (
            id, tenant_id, name, description, department_id, position_id, tasks, status
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${(body as any).name}, ${(body as any).description || null},
            ${(body as any).departmentId || null}::uuid, ${(body as any).positionId || null}::uuid,
            ${JSON.stringify((body as any).tasks || [])}::jsonb, 'active'
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return checklist;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 1, maxLength: 100 }),
      description: t.Optional(t.String({ maxLength: 1000 })),
      departmentId: t.Optional(UuidSchema),
      positionId: t.Optional(UuidSchema),
      tasks: t.Optional(t.Array(t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        assigneeType: t.Optional(t.String()),
        daysFromStart: t.Optional(t.Number()),
        required: t.Optional(t.Boolean()),
      }))),
    }),
    detail: { tags: ["Onboarding"], summary: "Create onboarding checklist" }
  })

  // Employee Onboarding Instances
  .get("/instances", async (ctx) => {
    const { tenant, user, db, query, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const instances = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT oi.*, e.first_name || ' ' || e.last_name as employee_name,
                 oc.name as checklist_name
          FROM app.onboarding_instances oi
          JOIN app.employees e ON e.id = oi.employee_id
          JOIN app.onboarding_checklists oc ON oc.id = oi.checklist_id
          WHERE oi.tenant_id = ${tenant.id}::uuid
          ${query.status ? tx`AND oi.status = ${query.status}` : tx``}
          ${query.employeeId ? tx`AND oi.employee_id = ${query.employeeId}::uuid` : tx``}
          ORDER BY oi.start_date DESC
          LIMIT ${query.limit !== undefined && query.limit !== null ? Number(query.limit) : 20}
        `;
      });
      return { instances, count: instances.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
      employeeId: t.Optional(UuidSchema),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    detail: { tags: ["Onboarding"], summary: "List onboarding instances" }
  })

  .post("/instances", async (ctx) => {
    const { tenant, user, db, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      // Get checklist tasks
      const [checklist] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`SELECT tasks FROM app.onboarding_checklists WHERE id = ${(body as any).checklistId}::uuid`;
      });

      const tasks = (checklist?.tasks || []).map((task: any, index: number) => ({
        ...task,
        taskId: `task-${index}`,
        status: 'pending',
        completedAt: null,
        completedBy: null,
      }));

      const [instance] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          INSERT INTO app.onboarding_instances (
            id, tenant_id, employee_id, checklist_id, start_date, buddy_id, tasks, status
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${(body as any).employeeId}::uuid,
            ${(body as any).checklistId}::uuid, ${(body as any).startDate}::date, ${(body as any).buddyId || null}::uuid,
            ${JSON.stringify(tasks)}::jsonb, 'in_progress'
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return instance;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    body: t.Object({
      employeeId: UuidSchema,
      checklistId: UuidSchema,
      startDate: t.String({ format: "date" }),
      buddyId: t.Optional(UuidSchema),
    }),
    detail: { tags: ["Onboarding"], summary: "Start onboarding for employee" }
  })

  .get("/instances/:id", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [instance] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT oi.*, e.first_name || ' ' || e.last_name as employee_name,
                 oc.name as checklist_name, b.first_name || ' ' || b.last_name as buddy_name
          FROM app.onboarding_instances oi
          JOIN app.employees e ON e.id = oi.employee_id
          JOIN app.onboarding_checklists oc ON oc.id = oi.checklist_id
          LEFT JOIN app.employees b ON b.id = oi.buddy_id
          WHERE oi.id = ${params.id}::uuid AND oi.tenant_id = ${tenant.id}::uuid
        `;
      });

      if (!instance) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Onboarding instance not found" } };
      }
      return instance;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["Onboarding"], summary: "Get onboarding instance" }
  })

  .post("/instances/:id/tasks/:taskId/complete", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      // Get current instance
      const [instance] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`SELECT tasks FROM app.onboarding_instances WHERE id = ${params.id}::uuid`;
      });

      if (!instance) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Onboarding instance not found" } };
      }

      const tasks = (instance.tasks || []).map((task: any) => {
        if (task.taskId === params.taskId) {
          return { ...task, status: 'completed', completedAt: new Date().toISOString(), completedBy: user.id };
        }
        return task;
      });

      const allCompleted = tasks.every((t: any) => t.status === 'completed');

      const [updated] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          UPDATE app.onboarding_instances SET
            tasks = ${JSON.stringify(tasks)}::jsonb,
            status = ${allCompleted ? 'completed' : 'in_progress'},
            completed_at = ${allCompleted ? tx`now()` : tx`NULL`},
            updated_at = now()
          WHERE id = ${params.id}::uuid AND tenant_id = ${tenant.id}::uuid
          RETURNING *
        `;
      });

      return updated;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema, taskId: t.String() }),
    detail: { tags: ["Onboarding"], summary: "Complete onboarding task" }
  })

  // My Onboarding
  .get("/my-onboarding", async (ctx) => {
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
        return { instance: null };
      }

      const [instance] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT oi.*, oc.name as checklist_name, b.first_name || ' ' || b.last_name as buddy_name
          FROM app.onboarding_instances oi
          JOIN app.onboarding_checklists oc ON oc.id = oi.checklist_id
          LEFT JOIN app.employees b ON b.id = oi.buddy_id
          WHERE oi.employee_id = ${employee.id}::uuid AND oi.status != 'completed'
          ORDER BY oi.start_date DESC
          LIMIT 1
        `;
      });

      return { instance };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["Onboarding"], summary: "Get my onboarding" }
  });

export type OnboardingRoutes = typeof onboardingRoutes;
