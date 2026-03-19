/**
 * LMS Module - Service Layer
 *
 * Business logic for Learning Management System.
 * Handles validation, domain rules, and outbox events.
 */

import type { TransactionSql } from "postgres";
import { LMSRepository, type TenantContext, type PaginationOptions } from "./repository";
import type {
  CreateCourse,
  UpdateCourse,
  CourseResponse,
  CreateEnrollment,
  UpdateEnrollment,
  EnrollmentResponse,
  CoursePrerequisiteResponse,
} from "./schemas";
import type { ServiceResult } from "../../types/service-result";
import { ErrorCodes } from "../../plugins/errors";

export class LMSService {
  constructor(
    private repository: LMSRepository,
    private db: any
  ) {}

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
  ) {
    return this.repository.listCourses(ctx, filters, pagination);
  }

  async getCourse(ctx: TenantContext, id: string): Promise<ServiceResult<CourseResponse>> {
    const course = await this.repository.getCourseById(ctx, id);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    return { success: true, data: course };
  }

  async createCourse(ctx: TenantContext, data: CreateCourse, idempotencyKey?: string): Promise<ServiceResult<CourseResponse>> {
    try {
      const course = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createCourse(ctx, data, tx);
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "course",
            aggregateId: result.id,
            eventType: "lms.course.created",
            payload: { course: result, actor: ctx.userId },
          });
          return result;
        }
      );
      return { success: true, data: course };
    } catch (error: any) {
      return { success: false, error: { code: "CREATE_FAILED", message: error.message || "Failed to create course" } };
    }
  }

  async updateCourse(ctx: TenantContext, id: string, data: UpdateCourse, idempotencyKey?: string): Promise<ServiceResult<CourseResponse>> {
    const existing = await this.repository.getCourseById(ctx, id);
    if (!existing) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    try {
      const course = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.updateCourse(ctx, id, data, tx);
          if (!result) return null;
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "course",
            aggregateId: result.id,
            eventType: "lms.course.updated",
            payload: { course: result, previousValues: existing, actor: ctx.userId },
          });
          return result;
        }
      );
      if (!course) {
        return { success: false, error: { code: "UPDATE_FAILED", message: "Failed to update course" } };
      }
      return { success: true, data: course };
    } catch (error: any) {
      return { success: false, error: { code: "UPDATE_FAILED", message: error.message || "Failed to update course" } };
    }
  }

  async publishCourse(ctx: TenantContext, id: string): Promise<ServiceResult<CourseResponse>> {
    const course = await this.repository.getCourseById(ctx, id);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    if (course.status === "published") {
      return { success: false, error: { code: "ALREADY_PUBLISHED", message: "Course is already published" } };
    }
    if (!course.title) {
      return { success: false, error: { code: "INVALID_COURSE", message: "Course must have a title before publishing" } };
    }
    return this.updateCourse(ctx, id, { status: "published" });
  }

  async archiveCourse(ctx: TenantContext, id: string): Promise<ServiceResult<boolean>> {
    const course = await this.repository.getCourseById(ctx, id);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    const deleted = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        const result = await this.repository.deleteCourse(ctx, id, tx);
        if (result) {
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "course",
            aggregateId: id,
            eventType: "lms.course.archived",
            payload: { courseId: id, actor: ctx.userId },
          });
        }
        return result;
      }
    );
    return { success: deleted, data: deleted };
  }

  // ===========================================================================
  // Enrollment Operations
  // ===========================================================================

  async listEnrollments(
    ctx: TenantContext,
    filters: { courseId?: string; employeeId?: string; status?: string; isOverdue?: boolean },
    pagination: PaginationOptions
  ) {
    return this.repository.listEnrollments(ctx, filters, pagination);
  }

  async getEnrollment(ctx: TenantContext, id: string): Promise<ServiceResult<EnrollmentResponse>> {
    const enrollment = await this.repository.getEnrollmentById(ctx, id);
    if (!enrollment) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Enrollment not found" } };
    }
    return { success: true, data: enrollment };
  }

  async getMyLearning(ctx: TenantContext, employeeId: string): Promise<EnrollmentResponse[]> {
    return this.repository.getEmployeeEnrollments(ctx, employeeId);
  }

  async enrollEmployee(
    ctx: TenantContext,
    data: CreateEnrollment,
    idempotencyKey?: string
  ): Promise<ServiceResult<EnrollmentResponse>> {
    // Verify course exists and is published
    const course = await this.repository.getCourseById(ctx, data.courseId);
    if (!course) {
      return { success: false, error: { code: "COURSE_NOT_FOUND", message: "Course not found" } };
    }
    if (course.status !== "published") {
      return { success: false, error: { code: "COURSE_NOT_PUBLISHED", message: "Cannot enroll in unpublished course" } };
    }

    // Check mandatory prerequisites are completed before enrollment (TODO-245)
    const prerequisiteCheck = await this.checkPrerequisitesForEnrollment(ctx, data.courseId, data.employeeId);
    if (!prerequisiteCheck.success) {
      return prerequisiteCheck as ServiceResult<EnrollmentResponse>;
    }

    try {
      const enrollment = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.createEnrollment(ctx, data, tx);
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "enrollment",
            aggregateId: result.id,
            eventType: "lms.employee.enrolled",
            payload: { enrollment: result, courseId: data.courseId, employeeId: data.employeeId, actor: ctx.userId },
          });
          return result;
        }
      );
      return { success: true, data: enrollment };
    } catch (error: any) {
      if (error.message?.includes("duplicate") || error.code === "23505") {
        return { success: false, error: { code: "ALREADY_ENROLLED", message: "Employee is already enrolled in this course" } };
      }
      return { success: false, error: { code: "ENROLLMENT_FAILED", message: error.message || "Failed to enroll employee" } };
    }
  }

  async startCourse(ctx: TenantContext, enrollmentId: string): Promise<ServiceResult<EnrollmentResponse>> {
    const enrollment = await this.repository.getEnrollmentById(ctx, enrollmentId);
    if (!enrollment) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Enrollment not found" } };
    }
    if (enrollment.status !== "enrolled") {
      return { success: false, error: { code: "INVALID_STATUS", message: `Cannot start course from status: ${enrollment.status}` } };
    }
    const updated = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        const result = await this.repository.startEnrollment(ctx, enrollmentId, tx);
        if (!result) return null;
        await this.emitDomainEvent(tx, ctx, {
          aggregateType: "enrollment",
          aggregateId: enrollmentId,
          eventType: "lms.course.started",
          payload: { enrollmentId, courseId: enrollment.courseId, employeeId: enrollment.employeeId, actor: ctx.userId },
        });
        return result;
      }
    );
    if (!updated) {
      return { success: false, error: { code: "START_FAILED", message: "Failed to start course" } };
    }
    return { success: true, data: updated };
  }

  async updateProgress(ctx: TenantContext, enrollmentId: string, progress: number): Promise<ServiceResult<EnrollmentResponse>> {
    const enrollment = await this.repository.getEnrollmentById(ctx, enrollmentId);
    if (!enrollment) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Enrollment not found" } };
    }
    if (!["enrolled", "in_progress"].includes(enrollment.status)) {
      return { success: false, error: { code: "INVALID_STATUS", message: `Cannot update progress for status: ${enrollment.status}` } };
    }
    let currentEnrollment = enrollment;
    if (enrollment.status === "enrolled") {
      const started = await this.repository.startEnrollment(ctx, enrollmentId);
      if (started) currentEnrollment = started;
    }
    const updated = await this.repository.updateEnrollment(ctx, enrollmentId, { progress });
    return { success: true, data: updated || currentEnrollment };
  }

  async completeCourse(ctx: TenantContext, enrollmentId: string, score?: number): Promise<ServiceResult<EnrollmentResponse>> {
    const enrollment = await this.repository.getEnrollmentById(ctx, enrollmentId);
    if (!enrollment) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Enrollment not found" } };
    }
    if (!["enrolled", "in_progress"].includes(enrollment.status)) {
      return { success: false, error: { code: "INVALID_STATUS", message: `Cannot complete course from status: ${enrollment.status}` } };
    }
    const updated = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        const result = await this.repository.completeEnrollment(ctx, enrollmentId, score, tx);
        if (!result) return null;
        await this.emitDomainEvent(tx, ctx, {
          aggregateType: "enrollment",
          aggregateId: enrollmentId,
          eventType: "lms.course.completed",
          payload: { enrollmentId, courseId: enrollment.courseId, employeeId: enrollment.employeeId, score, actor: ctx.userId },
        });
        return result;
      }
    );
    if (!updated) {
      return { success: false, error: { code: "COMPLETE_FAILED", message: "Failed to complete course" } };
    }
    return { success: true, data: updated };
  }

  // ===========================================================================
  // Learning Path Operations
  // ===========================================================================

  async createLearningPath(ctx: TenantContext, data: any): Promise<ServiceResult<any>> {
    try {
      const path = await this.repository.createLearningPath(ctx, data);
      return { success: true, data: path };
    } catch (error: any) {
      console.error("Error creating learning path:", error);
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message } };
    }
  }

  async listLearningPaths(
    ctx: TenantContext,
    filters: { search?: string; status?: string; category?: string } = {},
    pagination: PaginationOptions = {}
  ) {
    return this.repository.listLearningPaths(ctx, pagination);
  }

  async getLearningPath(ctx: TenantContext, id: string): Promise<ServiceResult<any>> {
    const path = await this.repository.getLearningPathById(ctx, id);
    if (!path) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Learning path not found" } };
    }
    return { success: true, data: path };
  }

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  async getCourseAnalytics(ctx: TenantContext, courseId: string) {
    const course = await this.repository.getCourseById(ctx, courseId);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    const analytics = await this.repository.getCourseAnalytics(ctx, courseId);
    return { success: true, data: analytics };
  }

  async getEmployeeLearningStats(ctx: TenantContext, employeeId: string) {
    const stats = await this.repository.getEmployeeLearningStats(ctx, employeeId);
    return { success: true, data: stats };
  }

  // ===========================================================================
  // Compliance Report Operations
  // ===========================================================================

  async getComplianceReport(
    ctx: TenantContext,
    filters: { courseId?: string; orgUnitId?: string; includeArchived?: boolean } = {}
  ): Promise<ServiceResult<any>> {
    try {
      const courseRows = await this.repository.getMandatoryCourseCompliance(ctx, {
        courseId: filters.courseId, includeArchived: filters.includeArchived,
      });
      const courses = courseRows.map((row: any) => {
        const totalAssigned = Number(row.totalAssigned) || 0;
        const completedCount = Number(row.completedCount) || 0;
        return {
          courseId: row.courseId, courseName: row.courseName, category: row.category || null,
          isMandatory: row.isMandatory,
          mandatoryDueDays: row.mandatoryDueDays ? Number(row.mandatoryDueDays) : null,
          totalAssigned, completedCount,
          inProgressCount: Number(row.inProgressCount) || 0,
          notStartedCount: Number(row.notStartedCount) || 0,
          overdueCount: Number(row.overdueCount) || 0,
          completionRate: totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 10000) / 100 : 0,
        };
      });
      const deptRows = await this.repository.getDepartmentCompliance(ctx, {
        courseId: filters.courseId, orgUnitId: filters.orgUnitId, includeArchived: filters.includeArchived,
      });
      const departments = deptRows.map((row: any) => {
        const totalAssigned = Number(row.totalAssigned) || 0;
        const completedCount = Number(row.completedCount) || 0;
        return {
          orgUnitId: row.orgUnitId, orgUnitName: row.orgUnitName,
          totalAssigned, completedCount,
          inProgressCount: Number(row.inProgressCount) || 0,
          notStartedCount: Number(row.notStartedCount) || 0,
          overdueCount: Number(row.overdueCount) || 0,
          completionRate: totalAssigned > 0 ? Math.round((completedCount / totalAssigned) * 10000) / 100 : 0,
        };
      });
      const summary = courses.reduce(
        (acc: any, c: any) => ({
          totalMandatoryCourses: acc.totalMandatoryCourses + 1,
          totalAssignments: acc.totalAssignments + c.totalAssigned,
          totalCompleted: acc.totalCompleted + c.completedCount,
          totalInProgress: acc.totalInProgress + c.inProgressCount,
          totalNotStarted: acc.totalNotStarted + c.notStartedCount,
          totalOverdue: acc.totalOverdue + c.overdueCount,
          overallCompletionRate: 0,
        }),
        { totalMandatoryCourses: 0, totalAssignments: 0, totalCompleted: 0, totalInProgress: 0, totalNotStarted: 0, totalOverdue: 0, overallCompletionRate: 0 }
      );
      summary.overallCompletionRate = summary.totalAssignments > 0
        ? Math.round((summary.totalCompleted / summary.totalAssignments) * 10000) / 100 : 0;
      return { success: true, data: { generatedAt: new Date().toISOString(), summary, courses, departments } };
    } catch (error: any) {
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message || "Failed to generate compliance report" } };
    }
  }

  // ===========================================================================
  // Course Prerequisite Operations (TODO-245)
  // ===========================================================================

  async listCoursePrerequisites(
    ctx: TenantContext,
    courseId: string
  ): Promise<ServiceResult<{ items: CoursePrerequisiteResponse[]; count: number }>> {
    const course = await this.repository.getCourseById(ctx, courseId);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    const rows = await this.repository.listCoursePrerequisites(ctx, courseId);
    const items = rows.map((row: any) => this.mapPrerequisiteRow(row));
    return { success: true, data: { items, count: items.length } };
  }

  async addCoursePrerequisite(
    ctx: TenantContext,
    courseId: string,
    prerequisiteCourseId: string,
    isMandatory: boolean = true
  ): Promise<ServiceResult<CoursePrerequisiteResponse>> {
    if (courseId === prerequisiteCourseId) {
      return { success: false, error: { code: ErrorCodes.VALIDATION_ERROR, message: "A course cannot be a prerequisite of itself" } };
    }
    const course = await this.repository.getCourseById(ctx, courseId);
    if (!course) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course not found" } };
    }
    const prereqCourse = await this.repository.getCourseById(ctx, prerequisiteCourseId);
    if (!prereqCourse) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Prerequisite course not found" } };
    }

    // Detect circular dependency
    const wouldCycle = await this.detectCircularDependency(ctx, courseId, prerequisiteCourseId);
    if (wouldCycle) {
      return {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: `Adding this prerequisite would create a circular dependency. Course "${prereqCourse.title}" already depends on "${course.title}".`,
          details: { courseId, prerequisiteCourseId },
        },
      };
    }

    try {
      const row = await this.db.withTransaction(
        { tenantId: ctx.tenantId, userId: ctx.userId },
        async (tx: TransactionSql) => {
          const result = await this.repository.addCoursePrerequisite(ctx, courseId, prerequisiteCourseId, isMandatory, tx);
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "course",
            aggregateId: courseId,
            eventType: "lms.course.prerequisite_added",
            payload: { courseId, prerequisiteCourseId, isMandatory, actor: ctx.userId },
          });
          return result;
        }
      );
      const prereq = await this.repository.getCoursePrerequisiteById(ctx, row.id);
      return { success: true, data: this.mapPrerequisiteRow(prereq || row) };
    } catch (error: any) {
      if (error.message?.includes("duplicate") || error.code === "23505") {
        return { success: false, error: { code: ErrorCodes.CONFLICT, message: "This prerequisite relationship already exists" } };
      }
      return { success: false, error: { code: ErrorCodes.INTERNAL_ERROR, message: error.message || "Failed to add course prerequisite" } };
    }
  }

  async removeCoursePrerequisite(ctx: TenantContext, courseId: string, prereqId: string): Promise<ServiceResult<boolean>> {
    const existing = await this.repository.getCoursePrerequisiteById(ctx, prereqId);
    if (!existing) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course prerequisite not found" } };
    }
    if (existing.courseId !== courseId) {
      return { success: false, error: { code: ErrorCodes.NOT_FOUND, message: "Course prerequisite not found for this course" } };
    }
    const removed = await this.db.withTransaction(
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx: TransactionSql) => {
        const result = await this.repository.removeCoursePrerequisite(ctx, prereqId, tx);
        if (result) {
          await this.emitDomainEvent(tx, ctx, {
            aggregateType: "course",
            aggregateId: courseId,
            eventType: "lms.course.prerequisite_removed",
            payload: { courseId, prerequisiteCourseId: existing.prerequisiteCourseId, prereqId, actor: ctx.userId },
          });
        }
        return result;
      }
    );
    return { success: true, data: removed };
  }

  private async checkPrerequisitesForEnrollment(ctx: TenantContext, courseId: string, employeeId: string): Promise<ServiceResult<void>> {
    const prereqs = await this.repository.getMandatoryPrerequisitesWithStatus(ctx, courseId, employeeId);
    if (prereqs.length === 0) return { success: true };
    const unmet = prereqs.filter((p: any) => p.enrollmentStatus !== "completed");
    if (unmet.length === 0) return { success: true };
    const unmetDetails = unmet.map((p: any) => ({
      courseId: p.courseId, courseTitle: p.courseTitle || "Unknown", isMandatory: p.isMandatory, status: p.enrollmentStatus,
    }));
    const courseNames = unmetDetails.map((d: any) => d.courseTitle).join(", ");
    return {
      success: false,
      error: {
        code: ErrorCodes.PREREQUISITE_NOT_MET,
        message: `Cannot enroll: ${unmet.length} mandatory prerequisite(s) not completed. Required courses: ${courseNames}`,
        details: { unmetPrerequisites: unmetDetails },
      },
    };
  }

  private async detectCircularDependency(ctx: TenantContext, courseId: string, prerequisiteCourseId: string): Promise<boolean> {
    const transitivePrereqs = await this.repository.getTransitivePrerequisites(ctx, prerequisiteCourseId);
    return transitivePrereqs.includes(courseId);
  }

  private mapPrerequisiteRow(row: any): CoursePrerequisiteResponse {
    return {
      id: row.id,
      tenantId: row.tenantId,
      courseId: row.courseId,
      prerequisiteCourseId: row.prerequisiteCourseId,
      prerequisiteCourseTitle: row.prerequisiteCourseTitle || undefined,
      isMandatory: row.isMandatory,
      createdAt: row.createdAt?.toISOString?.() || row.createdAt,
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private async emitDomainEvent(
    tx: TransactionSql,
    ctx: TenantContext,
    event: { aggregateType: string; aggregateId: string; eventType: string; payload: Record<string, unknown> }
  ): Promise<void> {
    await tx`
      INSERT INTO app.domain_outbox (id, tenant_id, aggregate_type, aggregate_id, event_type, payload, created_at)
      VALUES (gen_random_uuid(), ${ctx.tenantId}::uuid, ${event.aggregateType},
        ${event.aggregateId}::uuid, ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb, now())
    `;
  }
}
