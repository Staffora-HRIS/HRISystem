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

export interface TenantContext {
  tenantId: string;
  userId: string;
}

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
            (SELECT COUNT(*) FROM app.course_enrollments ce WHERE ce.course_id = c.id) as enrollment_count,
            (SELECT COUNT(*) FROM app.course_enrollments ce WHERE ce.course_id = c.id AND ce.status = 'completed') as completion_count
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
            (SELECT COUNT(*) FROM app.course_enrollments ce WHERE ce.course_id = c.id) as enrollment_count,
            (SELECT COUNT(*) FROM app.course_enrollments ce WHERE ce.course_id = c.id AND ce.status = 'completed') as completion_count
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
            id, tenant_id, title, description, category, duration_minutes,
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
            duration_minutes = COALESCE(${data.durationMinutes}, duration_minutes),
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
            ce.*,
            c.title as course_title,
            e.first_name || ' ' || e.last_name as employee_name
          FROM app.course_enrollments ce
          JOIN app.courses c ON c.id = ce.course_id
          JOIN app.employees e ON e.id = ce.employee_id
          WHERE ce.tenant_id = ${ctx.tenantId}::uuid
          ${filters.courseId ? tx`AND ce.course_id = ${filters.courseId}::uuid` : tx``}
          ${filters.employeeId ? tx`AND ce.employee_id = ${filters.employeeId}::uuid` : tx``}
          ${filters.status ? tx`AND ce.status = ${filters.status}` : tx``}
          ${filters.isOverdue ? tx`AND ce.due_date < CURRENT_DATE AND ce.status NOT IN ('completed', 'cancelled')` : tx``}
          ${pagination.cursor ? tx`AND ce.id > ${pagination.cursor}::uuid` : tx``}
          ORDER BY ce.enrolled_at DESC
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
            ce.*,
            c.title as course_title,
            e.first_name || ' ' || e.last_name as employee_name
          FROM app.course_enrollments ce
          JOIN app.courses c ON c.id = ce.course_id
          JOIN app.employees e ON e.id = ce.employee_id
          WHERE ce.id = ${id}::uuid AND ce.tenant_id = ${ctx.tenantId}::uuid
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
            ce.*,
            c.title as course_title,
            c.description as course_description,
            c.category,
            c.duration_minutes,
            c.thumbnail_url
          FROM app.course_enrollments ce
          JOIN app.courses c ON c.id = ce.course_id
          WHERE ce.employee_id = ${employeeId}::uuid AND ce.tenant_id = ${ctx.tenantId}::uuid
          ORDER BY
            CASE ce.status WHEN 'in_progress' THEN 1 WHEN 'enrolled' THEN 2 ELSE 3 END,
            ce.due_date ASC NULLS LAST
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
          INSERT INTO app.course_enrollments (
            id, tenant_id, course_id, employee_id, status, enrolled_at, due_date, assigned_by
          ) VALUES (
            gen_random_uuid(), ${ctx.tenantId}::uuid, ${data.courseId}::uuid,
            ${data.employeeId}::uuid, 'enrolled', now(), ${data.dueDate || null}::date,
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
          UPDATE app.course_enrollments SET
            status = COALESCE(${data.status}, status),
            due_date = COALESCE(${data.dueDate}::date, due_date),
            progress = COALESCE(${data.progress}, progress),
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
          UPDATE app.course_enrollments SET
            status = 'in_progress',
            started_at = now(),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status = 'enrolled'
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
          UPDATE app.course_enrollments SET
            status = 'completed',
            completed_at = now(),
            progress = 100,
            score = COALESCE(${score}, score),
            updated_at = now()
          WHERE id = ${id}::uuid AND tenant_id = ${ctx.tenantId}::uuid
            AND status IN ('enrolled', 'in_progress')
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
            AVG(EXTRACT(DAY FROM (completed_at - enrolled_at))) FILTER (WHERE status = 'completed') as average_completion_days
          FROM app.course_enrollments
          WHERE course_id = ${courseId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return {
      courseId,
      totalEnrollments: Number(analytics.total_enrollments) || 0,
      completedCount: Number(analytics.completed_count) || 0,
      inProgressCount: Number(analytics.in_progress_count) || 0,
      averageScore: analytics.average_score ? Number(analytics.average_score) : null,
      averageCompletionDays: analytics.average_completion_days
        ? Number(analytics.average_completion_days)
        : null,
      completionRate:
        analytics.total_enrollments > 0
          ? (Number(analytics.completed_count) / Number(analytics.total_enrollments)) * 100
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
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('completed', 'cancelled')) as overdue_count,
            AVG(score) FILTER (WHERE status = 'completed') as average_score
          FROM app.course_enrollments
          WHERE employee_id = ${employeeId}::uuid AND tenant_id = ${ctx.tenantId}::uuid
        `;
      }
    );

    return {
      employeeId,
      totalEnrollments: Number(stats.total_enrollments) || 0,
      completedCount: Number(stats.completed_count) || 0,
      inProgressCount: Number(stats.in_progress_count) || 0,
      overdueCount: Number(stats.overdue_count) || 0,
      averageScore: stats.average_score ? Number(stats.average_score) : null,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private mapCourseRow(row: any): CourseResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      title: row.title,
      description: row.description,
      category: row.category,
      durationMinutes: row.duration_minutes,
      contentType: row.content_type,
      contentUrl: row.content_url,
      thumbnailUrl: row.thumbnail_url,
      passingScore: row.passing_score,
      isRequired: row.is_required,
      status: row.status,
      enrollmentCount: row.enrollment_count ? Number(row.enrollment_count) : undefined,
      completionCount: row.completion_count ? Number(row.completion_count) : undefined,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapEnrollmentRow(row: any): EnrollmentResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      courseId: row.course_id,
      employeeId: row.employee_id,
      status: row.status,
      enrolledAt: row.enrolled_at?.toISOString() || row.enrolled_at,
      startedAt: row.started_at?.toISOString() || row.started_at,
      completedAt: row.completed_at?.toISOString() || row.completed_at,
      dueDate: row.due_date?.toISOString()?.split("T")[0] || row.due_date,
      progress: row.progress || 0,
      score: row.score,
      assignedBy: row.assigned_by,
      courseTitle: row.course_title,
      employeeName: row.employee_name,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }

  private mapLearningPathRow(row: any): LearningPathResponse {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      isRequired: row.is_required,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || row.created_at,
      updatedAt: row.updated_at?.toISOString() || row.updated_at,
    };
  }
}
