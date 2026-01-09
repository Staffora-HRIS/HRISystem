/**
 * LMS (Learning Management System) Routes
 *
 * Courses, enrollments, completions
 */

import { Elysia, t } from "elysia";

const UuidSchema = t.String({ format: "uuid" });

export const lmsRoutes = new Elysia({ prefix: "/lms" })

  // Courses
  .get("/courses", async (ctx) => {
    const { tenant, user, db, query, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const courses = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT c.*, 
            (SELECT COUNT(*) FROM app.course_enrollments WHERE course_id = c.id) as enrollment_count
          FROM app.courses c
          WHERE c.tenant_id = ${tenant.id}::uuid
          ${query.category ? tx`AND c.category = ${query.category}` : tx``}
          ${query.status ? tx`AND c.status = ${query.status}` : tx``}
          ORDER BY c.created_at DESC
          LIMIT ${query.limit !== undefined && query.limit !== null ? Number(query.limit) : 20}
        `;
      });
      return { courses, count: courses.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      category: t.Optional(t.String()),
      status: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    detail: { tags: ["LMS"], summary: "List courses" }
  })

  .post("/courses", async (ctx) => {
    const { tenant, user, db, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [course] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          INSERT INTO app.courses (
            id, tenant_id, title, description, category, duration_minutes,
            content_type, content_url, thumbnail_url, status, created_by
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${(body as any).title}, ${(body as any).description || null},
            ${(body as any).category || null}, ${(body as any).durationMinutes || null},
            ${(body as any).contentType || 'video'}, ${(body as any).contentUrl || null},
            ${(body as any).thumbnailUrl || null}, 'draft', ${user.id}::uuid
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return course;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    body: t.Object({
      title: t.String({ minLength: 1, maxLength: 200 }),
      description: t.Optional(t.String({ maxLength: 2000 })),
      category: t.Optional(t.String()),
      durationMinutes: t.Optional(t.Number()),
      contentType: t.Optional(t.String()),
      contentUrl: t.Optional(t.String()),
      thumbnailUrl: t.Optional(t.String()),
    }),
    detail: { tags: ["LMS"], summary: "Create course" }
  })

  .get("/courses/:id", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [course] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT c.*,
            (SELECT COUNT(*) FROM app.course_enrollments WHERE course_id = c.id) as enrollment_count,
            (SELECT COUNT(*) FROM app.course_enrollments WHERE course_id = c.id AND status = 'completed') as completion_count
          FROM app.courses c
          WHERE c.id = ${params.id}::uuid AND c.tenant_id = ${tenant.id}::uuid
        `;
      });

      if (!course) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Course not found" } };
      }
      return course;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["LMS"], summary: "Get course by ID" }
  })

  // Enrollments
  .get("/enrollments", async (ctx) => {
    const { tenant, user, db, query, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const enrollments = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT ce.*, c.title as course_title, e.first_name || ' ' || e.last_name as employee_name
          FROM app.course_enrollments ce
          JOIN app.courses c ON c.id = ce.course_id
          JOIN app.employees e ON e.id = ce.employee_id
          WHERE ce.tenant_id = ${tenant.id}::uuid
          ${query.employeeId ? tx`AND ce.employee_id = ${query.employeeId}::uuid` : tx``}
          ${query.courseId ? tx`AND ce.course_id = ${query.courseId}::uuid` : tx``}
          ${query.status ? tx`AND ce.status = ${query.status}` : tx``}
          ORDER BY ce.enrolled_at DESC
          LIMIT ${query.limit !== undefined && query.limit !== null ? Number(query.limit) : 20}
        `;
      });
      return { enrollments, count: enrollments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    query: t.Object({
      employeeId: t.Optional(UuidSchema),
      courseId: t.Optional(UuidSchema),
      status: t.Optional(t.String()),
      cursor: t.Optional(t.String()),
      limit: t.Optional(t.Number()),
    }),
    detail: { tags: ["LMS"], summary: "List enrollments" }
  })

  .post("/enrollments", async (ctx) => {
    const { tenant, user, db, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [enrollment] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          INSERT INTO app.course_enrollments (
            id, tenant_id, course_id, employee_id, status, enrolled_at, due_date
          ) VALUES (
            gen_random_uuid(), ${tenant.id}::uuid, ${(body as any).courseId}::uuid,
            ${(body as any).employeeId}::uuid, 'enrolled', now(), ${(body as any).dueDate || null}::date
          )
          RETURNING *
        `;
      });
      set.status = 201;
      return enrollment;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    body: t.Object({
      courseId: UuidSchema,
      employeeId: UuidSchema,
      dueDate: t.Optional(t.String({ format: "date" })),
    }),
    detail: { tags: ["LMS"], summary: "Create enrollment" }
  })

  .post("/enrollments/:id/start", async (ctx) => {
    const { tenant, user, db, params, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [enrollment] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          UPDATE app.course_enrollments SET
            status = 'in_progress',
            started_at = now(),
            updated_at = now()
          WHERE id = ${params.id}::uuid AND tenant_id = ${tenant.id}::uuid
          RETURNING *
        `;
      });

      if (!enrollment) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Enrollment not found" } };
      }
      return enrollment;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    detail: { tags: ["LMS"], summary: "Start course" }
  })

  .post("/enrollments/:id/complete", async (ctx) => {
    const { tenant, user, db, params, body, set } = ctx as any;
    if (!tenant || !user) {
      set.status = 401;
      return { error: { code: "UNAUTHORIZED", message: "Authentication required" } };
    }

    try {
      const [enrollment] = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          UPDATE app.course_enrollments SET
            status = 'completed',
            completed_at = now(),
            score = ${(body as any)?.score || null},
            updated_at = now()
          WHERE id = ${params.id}::uuid AND tenant_id = ${tenant.id}::uuid
          RETURNING *
        `;
      });

      if (!enrollment) {
        set.status = 404;
        return { error: { code: "NOT_FOUND", message: "Enrollment not found" } };
      }
      return enrollment;
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    params: t.Object({ id: UuidSchema }),
    body: t.Optional(t.Object({
      score: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
    })),
    detail: { tags: ["LMS"], summary: "Complete course" }
  })

  // My Learning
  .get("/my-learning", async (ctx) => {
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
        return { enrollments: [], count: 0 };
      }

      const enrollments = await db.withTransaction({ tenantId: tenant.id, userId: user.id }, async (tx: any) => {
        return tx`
          SELECT ce.*, c.title, c.description, c.category, c.duration_minutes, c.thumbnail_url
          FROM app.course_enrollments ce
          JOIN app.courses c ON c.id = ce.course_id
          WHERE ce.employee_id = ${employee.id}::uuid AND ce.tenant_id = ${tenant.id}::uuid
          ORDER BY 
            CASE ce.status WHEN 'in_progress' THEN 1 WHEN 'enrolled' THEN 2 ELSE 3 END,
            ce.due_date ASC NULLS LAST
        `;
      });

      return { enrollments, count: enrollments.length };
    } catch (error: any) {
      set.status = 500;
      return { error: { code: "INTERNAL_ERROR", message: error.message } };
    }
  }, {
    detail: { tags: ["LMS"], summary: "Get my learning" }
  });

export type LmsRoutes = typeof lmsRoutes;
