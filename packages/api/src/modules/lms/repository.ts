/**
 * LMS Module - Repository Layer
 *
 * Database operations for Learning Management System.
 * All queries respect RLS via tenant context.
 */

import type {
  CreateCourse,
  UpdateCourse,
  CourseResponse,
  CreateEnrollment,
  UpdateEnrollment,
  EnrollmentResponse,
  CreateLearningPath,
  LearningPathResponse,
} from "./schemas";
import type { TenantContext } from "../../types/service-result";

export type { TenantContext } from "../../types/service-result";

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class LMSRepository {
  constructor(private db: any) {}

  // ===========================================================================
  // Course Operations
  // ===========================================================================

  async listCourses(
    ctx: TenantContext,
    filters: {
      category?: string;
      status?: string;
      contentType?: string;
      isRequired?: boolean;
      search?: string;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<CourseResponse>> {
    const limit = pagination.limit ?? 20;

    const courses = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            (SELECT COUNT(*) FROM app.assignments a WHERE a.course_id = c.id) as enrollment_count,
            (SELECT COUNT(*) FROM app.assignments a WHERE a.course_id = c.id AND a.status = 'completed') as completion_count
          FROM app.courses c
          WHERE c.tenant_id = ${ctx.tenantId}::uuid
          ${filters.category ? tx`AND c.category = ${filters.category}` : tx``}
          ${filters.status ? tx`AND c.status = ${filters.status}` : tx``}
          ${filters.contentType ? tx`AND c.content_type = ${filters.contentType}` : tx``}
          ${filters.isRequired !== undefined ? tx`AND c.is_required = ${filters.isRequired}` : tx``}
          ${filters.search ? tx`AND (c.title ILIKE ${'%' + filters.search + '%'} OR c.description ILIKE ${'%' + filters.search + '%'})` : tx``}
          ${pagination.cursor ? tx`AND c.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY c.created_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = courses.length > limit;
    const items = hasMore ? courses.slice(0, limit) : courses;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapCourseRow),
      nextCursor,
      hasMore,
    };
  }

  async getCourseById(
    ctx: TenantContext,
    id: string
  ): Promise<CourseResponse | null> {
    const [course] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            c.*,
            (SELECT COUNT(*) FROM app.assignments a WHERE a.course_id = c.id) as enrollment_count,
            (SELECT COUNT(*) FROM app.assignments a WHERE a.course_id = c.id AND a.status = 'completed') as completion_count
          FROM app.courses c
          WHERE c.id = ${id}::uuid AND c.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return course ? this.mapCourseRow(course) : null;
  }

  async createCourse(
    ctx: TenantContext,
    data: CreateCourse
  ): Promise<CourseResponse> {
    const [course] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          INSERT INTO app.courses (
            id, tenant_id, title, description, category, estimated_duration_minutes,
            content_type, content_url, thumbnail_url, passing_score,
            is_required, status, created_by
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.title}, ${data.description || null},
            ${data.category || null}, ${data.durationMinutes || null},
            ${data.contentType || 'video'}, ${data.contentUrl || null},
            ${data.thumbnailUrl || null}, ${data.passingScore || 70},
            ${data.isRequired || false}, 'draft', ${ctx.userId}::uuid
          )
          RETURNING *
        `;
      }
    );

    return this.mapCourseRow(course);
  }

  async updateCourse(
    ctx: TenantContext,
    id: string,
    data: UpdateCourse
  ): Promise<CourseResponse | null> {
    const [course] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.courses SET
            title = COALESCE(${data.title}, title),
            description = COALESCE(${data.description}, description),
            category = COALESCE(${data.category}, category),
            estimated_duration_minutes = COALESCE(${data.durationMinutes}, estimated_duration_minutes),
            content_type = COALESCE(${data.contentType}, content_type),
            content_url = COALESCE(${data.contentUrl}, content_url),
            thumbnail_url = COALESCE(${data.thumbnailUrl}, thumbnail_url),
            passing_score = COALESCE(${data.passingScore}, passing_score),
            is_required = COALESCE(${data.isRequired}, is_required),
            status = COALESCE(${data.status}, status),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return course ? this.mapCourseRow(course) : null;
  }

  async deleteCourse(ctx: TenantContext, id: string): Promise<boolean> {
    const result = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.courses SET
            status = 'archived',
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING id
        `;
      }
    );

    return result.length > 0;
  }

  // ===========================================================================
  // Enrollment Operations
  // ===========================================================================

  async listEnrollments(
    ctx: TenantContext,
    filters: {
      courseId?: string;
      employeeId?: string;
      status?: string;
      isOverdue?: boolean;
    },
    pagination: PaginationOptions
  ): Promise<PaginatedResult<EnrollmentResponse>> {
    const limit = pagination.limit ?? 20;

    const enrollments = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            a.*,
            c.title as course_title,
            e.first_name || ' ' || e.last_name as employee_name
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id
          JOIN app.employees e ON e.id = a.employee_id
          WHERE a.tenant_id = ${ctx.tenantId}::uuid
          ${filters.courseId ? tx`AND a.course_id = ${filters.courseId}::uuid` : tx``}
          ${filters.employeeId ? tx`AND a.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.status ? tx`AND a.status = ${filters.status}` : tx``}
          ${filters.isOverdue ? tx`AND a.due_date < CURRENT_DATE AND a.status NOT IN ('completed', 'expired')` : tx``}
          ${pagination.cursor ? tx`AND a.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY a.assigned_at DESC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = enrollments.length > limit;
    const items = hasMore ? enrollments.slice(0, limit) : enrollments;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapEnrollmentRow),
      nextCursor,
      hasMore,
    };
  }

  async getEnrollmentById(
    ctx: TenantContext,
    id: string
  ): Promise<EnrollmentResponse | null> {
    const [enrollment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            a.*,
            c.title as course_title,
            e.first_name || ' ' || e.last_name as employee_name
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id
          JOIN app.employees e ON e.id = a.employee_id
          WHERE a.id = ${id}::uuid AND a.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return enrollment ? this.mapEnrollmentRow(enrollment) : null;
  }

  async getEmployeeEnrollments(
    ctx: TenantContext,
    employeeId: string
  ): Promise<EnrollmentResponse[]> {
    const enrollments = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            a.*,
            c.title as course_title,
            c.description as course_description,
            c.category,
            c.estimated_duration_minutes,
            c.thumbnail_url
          FROM app.assignments a
          JOIN app.courses c ON c.id = a.course_id
          WHERE a.employee_id = ${employeeId}::uuid AND a.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY
            CASE a.status WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END,
            a.due_date ASC NULLS LAST
        `;
      }
    );

    return enrollments.map(this.mapEnrollmentRow);
  }

  async createEnrollment(
    ctx: TenantContext,
    data: CreateEnrollment
  ): Promise<EnrollmentResponse> {
    const [enrollment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          INSERT INTO app.assignments (
            id, tenant_id, course_id, employee_id, status, assigned_at, due_date, assigned_by
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.courseId}::uuid,
            ${data.employeeId}::uuid, 'not_started', now(), ${data.dueDate || null}::date,
            ${data.assignedBy || ctx.userId}::uuid
          )
          RETURNING *
        `;
      }
    );

    return this.mapEnrollmentRow(enrollment);
  }

  async updateEnrollment(
    ctx: TenantContext,
    id: string,
    data: UpdateEnrollment
  ): Promise<EnrollmentResponse | null> {
    const [enrollment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.assignments SET
            status = COALESCE(${data.status}, status),
            due_date = COALESCE(${data.dueDate}::date, due_date),
            progress_percent = COALESCE(${data.progress}, progress_percent),
            score = COALESCE(${data.score}, score),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          RETURNING *
        `;
      }
    );

    return enrollment ? this.mapEnrollmentRow(enrollment) : null;
  }

  async startEnrollment(
    ctx: TenantContext,
    id: string
  ): Promise<EnrollmentResponse | null> {
    const [enrollment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.assignments SET
            status = 'in_progress',
            started_at = now(),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'not_started'
          RETURNING *
        `;
      }
    );

    return enrollment ? this.mapEnrollmentRow(enrollment) : null;
  }

  async completeEnrollment(
    ctx: TenantContext,
    id: string,
    score?: number
  ): Promise<EnrollmentResponse | null> {
    const [enrollment] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          UPDATE app.assignments SET
            status = 'completed',
            completed_at = now(),
            progress_percent = 100,
            score = COALESCE(${score}, score),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status IN ('not_started', 'in_progress')
          RETURNING *
        `;
      }
    );

    return enrollment ? this.mapEnrollmentRow(enrollment) : null;
  }

  // ===========================================================================
  // Learning Path Operations
  // ===========================================================================

  async listLearningPaths(
    ctx: TenantContext,
    pagination: PaginationOptions
  ): Promise<PaginatedResult<LearningPathResponse>> {
    const limit = pagination.limit ?? 20;

    const paths = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT lp.*
          FROM app.learning_paths lp
          WHERE lp.tenant_id = ${ctx.tenantId}::uuid
          ${pagination.cursor ? tx`AND lp.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY lp.name ASC
          LIMIT ${limit + 1}
        `;
      }
    );

    const hasMore = paths.length > limit;
    const items = hasMore ? paths.slice(0, limit) : paths;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map(this.mapLearningPathRow),
      nextCursor,
      hasMore,
    };
  }

  async getLearningPathById(
    ctx: TenantContext,
    id: string
  ): Promise<LearningPathResponse | null> {
    const [path] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT lp.*
          FROM app.learning_paths lp
          WHERE lp.id = ${id}::uuid AND lp.tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return path ? this.mapLearningPathRow(path) : null;
  }

  async createLearningPath(
    ctx: TenantContext,
    data: CreateLearningPath
  ): Promise<LearningPathResponse> {
    const id = crypto.randomUUID();
    const code = data.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 50);

    const path = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        const [row] = await tx<any[]>`
          INSERT INTO app.learning_paths (
            id, tenant_id, code, name, description, status, created_by
          ) VALUES (
            ${id}::uuid, ${ctx.tenantId}::uuid, ${code}, ${data.name},
            ${data.description || null}, 'draft', ${ctx.userId}::uuid
          )
          RETURNING *
        `;

        // Link courses to the path
        if (data.courseIds?.length) {
          for (let i = 0; i < data.courseIds.length; i++) {
            await tx`
              INSERT INTO app.learning_path_courses (
                id, tenant_id, learning_path_id, course_id, sort_order, is_required
              ) VALUES (
                ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
                ${id}::uuid, ${data.courseIds[i]}::uuid, ${i + 1}, ${data.isRequired ?? false}
              )
            `;
          }
        }

        await tx`
          INSERT INTO app.domain_outbox (
            id, tenant_id, aggregate_type, aggregate_id, event_type, payload
          ) VALUES (
            ${crypto.randomUUID()}::uuid, ${ctx.tenantId}::uuid,
            'learning_path', ${id}::uuid, 'lms.learning_path.created',
            ${JSON.stringify({ learningPathId: id, name: data.name })}::jsonb
          )
        `;

        return row;
      }
    );

    return this.mapLearningPathRow(path);
  }

  // ===========================================================================
  // Employee Lookup
  // ===========================================================================

  async getEmployeeIdByUserId(ctx: TenantContext): Promise<string | null> {
    const [employee] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT id FROM app.employees
          WHERE user_id = ${ctx.userId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
          LIMIT 1
        `;
      }
    );

    return employee?.id || null;
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getCourseAnalytics(ctx: TenantContext, courseId: string) {
    const [analytics] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            ${courseId}::uuid as course_id,
            COUNT(*) as total_enrollments,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
            AVG(score) FILTER (WHERE status = 'completed') as average_score,
            AVG(EXTRACT(DAY FROM (completed_at - assigned_at))) FILTER (WHERE status = 'completed') as average_completion_days
          FROM app.assignments
          WHERE course_id = ${courseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return {
      courseId,
      totalEnrollments: Number(analytics.totalEnrollments) || 0,
      completedCount: Number(analytics.completedCount) || 0,
      inProgressCount: Number(analytics.inProgressCount) || 0,
      averageScore: analytics.averageScore ? Number(analytics.averageScore) : null,
      averageCompletionDays: analytics.averageCompletionDays
        ? Number(analytics.averageCompletionDays)
        : null,
      completionRate:
        analytics.totalEnrollments > 0
          ? (Number(analytics.completedCount) / Number(analytics.totalEnrollments)) * 100
          : 0,
    };
  }

  async getEmployeeLearningStats(ctx: TenantContext, employeeId: string) {
    const [stats] = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: any) => {
        return tx`
          SELECT
            ${employeeId}::uuid as employee_id,
            COUNT(*) as total_enrollments,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
            COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'expired')) as overdue_count,
            AVG(score) FILTER (WHERE status = 'completed') as average_score
          FROM app.assignments
          WHERE employee_id = ${employeeId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return {
      employeeId,
      totalEnrollments: Number(stats.totalEnrollments) || 0,
      completedCount: Number(stats.completedCount) || 0,
      inProgressCount: Number(stats.inProgressCount) || 0,
      overdueCount: Number(stats.overdueCount) || 0,
      averageScore: stats.averageScore ? Number(stats.averageScore) : null,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapCourseRow(row: any): CourseResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      title: row.title,
      description: row.description,
      category: row.category,
      durationMinutes: row.estimatedDurationMinutes,
      contentType: row.contentType,
      contentUrl: row.contentUrl,
      thumbnailUrl: row.thumbnailUrl,
      passingScore: row.passingScore,
      isRequired: row.isRequired,
      status: row.status,
      enrollmentCount: row.enrollmentCount ? Number(row.enrollmentCount) : undefined,
      completionCount: row.completionCount ? Number(row.completionCount) : undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }

  private mapEnrollmentRow(row: any): EnrollmentResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      courseId: row.courseId,
      employeeId: row.employeeId,
      status: row.status,
      enrolledAt: row.assignedAt?.toISOString() || row.assignedAt,
      startedAt: row.startedAt?.toISOString() || row.startedAt,
      completedAt: row.completedAt?.toISOString() || row.completedAt,
      dueDate: row.dueDate?.toISOString()?.split("T")[0] || row.dueDate,
      progress: row.progressPercent || 0,
      score: row.score,
      assignedBy: row.assignedBy,
      courseTitle: row.courseTitle,
      employeeName: row.employeeName,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }

  private mapLearningPathRow(row: any): LearningPathResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      isRequired: row.isRequired,
      status: row.status,
      createdBy: row.createdBy,
      createdAt: row.createdAt?.toISOString() || row.createdAt,
      updatedAt: row.updatedAt?.toISOString() || row.updatedAt,
    };
  }
}
