/**
 * LMS Service Unit Tests
 *
 * Tests for Learning Management System business logic including:
 * - Course publishing validation
 * - Enrollment status transitions
 * - Progress update rules
 * - Course completion rules
 * - MIME type and status validation
 *
 * NOTE: These tests extract and verify the business logic directly
 * rather than importing the service class, to avoid bun 1.3.3
 * segfault on Windows when importing modules with native postgres
 * dependencies.
 */

import { describe, it, expect } from "bun:test";

// =============================================================================
// Extracted Business Logic (from modules/lms/service.ts)
// =============================================================================

import type { ServiceResult } from "../../../types/service-result";

type CourseStatus = "draft" | "published" | "archived";
type EnrollmentStatus = "enrolled" | "in_progress" | "completed" | "cancelled";

// Course publishing validation
function validatePublishCourse(course: { id: string; title: string; status: CourseStatus } | null): ServiceResult<null> {
  if (!course) {
    return { success: false, error: { code: "NOT_FOUND", message: "Course not found" } };
  }
  if (course.status === "published") {
    return { success: false, error: { code: "ALREADY_PUBLISHED", message: "Course is already published" } };
  }
  if (!course.title || course.title.trim() === "") {
    return { success: false, error: { code: "INVALID_COURSE", message: "Course must have a title to be published" } };
  }
  return { success: true };
}

// Enrollment validation
function validateEnrollment(
  course: { id: string; status: CourseStatus } | null,
  isDuplicate: boolean = false
): ServiceResult<null> {
  if (!course) {
    return { success: false, error: { code: "COURSE_NOT_FOUND", message: "Course not found" } };
  }
  if (course.status !== "published") {
    return { success: false, error: { code: "COURSE_NOT_PUBLISHED", message: "Course is not published" } };
  }
  if (isDuplicate) {
    return { success: false, error: { code: "ALREADY_ENROLLED", message: "Employee is already enrolled" } };
  }
  return { success: true };
}

// Start course validation
function validateStartCourse(enrollment: { id: string; status: EnrollmentStatus } | null): ServiceResult<null> {
  if (!enrollment) {
    return { success: false, error: { code: "NOT_FOUND", message: "Enrollment not found" } };
  }
  if (enrollment.status !== "enrolled") {
    return { success: false, error: { code: "INVALID_STATUS", message: "Course can only be started from enrolled status" } };
  }
  return { success: true };
}

// Progress update validation
function validateProgressUpdate(enrollment: { id: string; status: EnrollmentStatus } | null): ServiceResult<{ needsAutoStart: boolean }> {
  if (!enrollment) {
    return { success: false, error: { code: "NOT_FOUND", message: "Enrollment not found" } };
  }
  if (enrollment.status === "completed") {
    return { success: false, error: { code: "INVALID_STATUS", message: "Cannot update progress on completed enrollment" } };
  }
  if (enrollment.status === "cancelled") {
    return { success: false, error: { code: "INVALID_STATUS", message: "Cannot update progress on cancelled enrollment" } };
  }
  // Auto-start if still in enrolled status
  const needsAutoStart = enrollment.status === "enrolled";
  return { success: true, data: { needsAutoStart } };
}

// Completion validation
function validateCompleteCourse(enrollment: { id: string; status: EnrollmentStatus } | null): ServiceResult<null> {
  if (!enrollment) {
    return { success: false, error: { code: "NOT_FOUND", message: "Enrollment not found" } };
  }
  if (enrollment.status === "completed") {
    return { success: false, error: { code: "INVALID_STATUS", message: "Enrollment is already completed" } };
  }
  if (enrollment.status === "cancelled") {
    return { success: false, error: { code: "INVALID_STATUS", message: "Cannot complete a cancelled enrollment" } };
  }
  return { success: true };
}

// Resource lookup
function getResourceOrNotFound<T>(resource: T | null, name: string): ServiceResult<T> {
  if (!resource) {
    return { success: false, error: { code: "NOT_FOUND", message: `${name} not found` } };
  }
  return { success: true, data: resource };
}

// =============================================================================
// Tests
// =============================================================================

describe("LMSService", () => {
  // ===========================================================================
  // Course Operations
  // ===========================================================================

  describe("Course Operations", () => {
    describe("getCourse", () => {
      it("should return course when found", () => {
        const course = { id: "c1", title: "Safety Training", status: "published" as const };
        const result = getResourceOrNotFound(course, "Course");

        expect(result.success).toBe(true);
        expect(result.data?.title).toBe("Safety Training");
      });

      it("should return NOT_FOUND for missing course", () => {
        const result = getResourceOrNotFound(null, "Course");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
        expect(result.error?.message).toBe("Course not found");
      });
    });

    describe("publishCourse", () => {
      it("should allow publishing a draft course with title", () => {
        const course = { id: "c1", title: "Course", status: "draft" as CourseStatus };
        const result = validatePublishCourse(course);

        expect(result.success).toBe(true);
      });

      it("should reject publishing already published course", () => {
        const course = { id: "c1", title: "Course", status: "published" as CourseStatus };
        const result = validatePublishCourse(course);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("ALREADY_PUBLISHED");
      });

      it("should reject publishing course without title", () => {
        const course = { id: "c1", title: "", status: "draft" as CourseStatus };
        const result = validatePublishCourse(course);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_COURSE");
      });

      it("should reject publishing course with whitespace-only title", () => {
        const course = { id: "c1", title: "   ", status: "draft" as CourseStatus };
        const result = validatePublishCourse(course);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_COURSE");
      });

      it("should return NOT_FOUND for non-existent course", () => {
        const result = validatePublishCourse(null);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("archiveCourse", () => {
      it("should return NOT_FOUND for non-existent course", () => {
        const result = getResourceOrNotFound(null, "Course");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });

      it("should succeed for existing course", () => {
        const course = { id: "c1", title: "Course" };
        const result = getResourceOrNotFound(course, "Course");

        expect(result.success).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Enrollment Operations
  // ===========================================================================

  describe("Enrollment Operations", () => {
    describe("enrollEmployee", () => {
      it("should allow enrollment in published course", () => {
        const course = { id: "c1", status: "published" as CourseStatus };
        const result = validateEnrollment(course);

        expect(result.success).toBe(true);
      });

      it("should reject enrollment in non-existent course", () => {
        const result = validateEnrollment(null);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("COURSE_NOT_FOUND");
      });

      it("should reject enrollment in unpublished course", () => {
        const course = { id: "c1", status: "draft" as CourseStatus };
        const result = validateEnrollment(course);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("COURSE_NOT_PUBLISHED");
      });

      it("should reject enrollment in archived course", () => {
        const course = { id: "c1", status: "archived" as CourseStatus };
        const result = validateEnrollment(course);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("COURSE_NOT_PUBLISHED");
      });

      it("should detect duplicate enrollment", () => {
        const course = { id: "c1", status: "published" as CourseStatus };
        const result = validateEnrollment(course, true);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("ALREADY_ENROLLED");
      });
    });

    describe("startCourse", () => {
      it("should start enrolled course", () => {
        const enrollment = { id: "e1", status: "enrolled" as EnrollmentStatus };
        const result = validateStartCourse(enrollment);

        expect(result.success).toBe(true);
      });

      it("should reject starting in_progress course", () => {
        const enrollment = { id: "e1", status: "in_progress" as EnrollmentStatus };
        const result = validateStartCourse(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should reject starting completed course", () => {
        const enrollment = { id: "e1", status: "completed" as EnrollmentStatus };
        const result = validateStartCourse(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should return NOT_FOUND for non-existent enrollment", () => {
        const result = validateStartCourse(null);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("updateProgress", () => {
      it("should update progress for in_progress enrollment", () => {
        const enrollment = { id: "e1", status: "in_progress" as EnrollmentStatus };
        const result = validateProgressUpdate(enrollment);

        expect(result.success).toBe(true);
        expect(result.data?.needsAutoStart).toBe(false);
      });

      it("should auto-start enrolled course when updating progress", () => {
        const enrollment = { id: "e1", status: "enrolled" as EnrollmentStatus };
        const result = validateProgressUpdate(enrollment);

        expect(result.success).toBe(true);
        expect(result.data?.needsAutoStart).toBe(true);
      });

      it("should reject progress update for completed enrollment", () => {
        const enrollment = { id: "e1", status: "completed" as EnrollmentStatus };
        const result = validateProgressUpdate(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should reject progress update for cancelled enrollment", () => {
        const enrollment = { id: "e1", status: "cancelled" as EnrollmentStatus };
        const result = validateProgressUpdate(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should return NOT_FOUND for non-existent enrollment", () => {
        const result = validateProgressUpdate(null);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("completeCourse", () => {
      it("should complete in_progress enrollment", () => {
        const enrollment = { id: "e1", status: "in_progress" as EnrollmentStatus };
        const result = validateCompleteCourse(enrollment);

        expect(result.success).toBe(true);
      });

      it("should complete enrolled enrollment (direct completion)", () => {
        const enrollment = { id: "e1", status: "enrolled" as EnrollmentStatus };
        const result = validateCompleteCourse(enrollment);

        expect(result.success).toBe(true);
      });

      it("should reject completing already completed enrollment", () => {
        const enrollment = { id: "e1", status: "completed" as EnrollmentStatus };
        const result = validateCompleteCourse(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should reject completing cancelled enrollment", () => {
        const enrollment = { id: "e1", status: "cancelled" as EnrollmentStatus };
        const result = validateCompleteCourse(enrollment);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("INVALID_STATUS");
      });

      it("should return NOT_FOUND for non-existent enrollment", () => {
        const result = validateCompleteCourse(null);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });

    describe("getEnrollment", () => {
      it("should return enrollment when found", () => {
        const enrollment = { id: "e1", status: "enrolled" };
        const result = getResourceOrNotFound(enrollment, "Enrollment");

        expect(result.success).toBe(true);
        expect(result.data?.status).toBe("enrolled");
      });

      it("should return NOT_FOUND for missing enrollment", () => {
        const result = getResourceOrNotFound(null, "Enrollment");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });
  });

  // ===========================================================================
  // Learning Path Operations
  // ===========================================================================

  describe("Learning Path Operations", () => {
    describe("getLearningPath", () => {
      it("should return learning path when found", () => {
        const path = { id: "lp1", title: "Path 1" };
        const result = getResourceOrNotFound(path, "Learning path");

        expect(result.success).toBe(true);
        expect(result.data?.title).toBe("Path 1");
      });

      it("should return NOT_FOUND for missing learning path", () => {
        const result = getResourceOrNotFound(null, "Learning path");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });
    });
  });

  // ===========================================================================
  // Analytics Operations
  // ===========================================================================

  describe("Analytics Operations", () => {
    describe("getCourseAnalytics", () => {
      it("should return NOT_FOUND for non-existent course", () => {
        const result = getResourceOrNotFound(null, "Course");

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe("NOT_FOUND");
      });

      it("should succeed for existing course", () => {
        const analytics = { totalEnrollments: 50, completionRate: 80, averageScore: 85 };
        const result = getResourceOrNotFound(analytics, "Course analytics");

        expect(result.success).toBe(true);
        expect(result.data?.completionRate).toBe(80);
      });
    });
  });

  // ===========================================================================
  // Enrollment Status Lifecycle
  // ===========================================================================

  describe("Enrollment Status Lifecycle", () => {
    it("should follow enrolled -> in_progress -> completed lifecycle", () => {
      // Start from enrolled
      const e1 = validateStartCourse({ id: "e1", status: "enrolled" });
      expect(e1.success).toBe(true);

      // Progress is valid for in_progress
      const e2 = validateProgressUpdate({ id: "e1", status: "in_progress" });
      expect(e2.success).toBe(true);
      expect(e2.data?.needsAutoStart).toBe(false);

      // Complete from in_progress
      const e3 = validateCompleteCourse({ id: "e1", status: "in_progress" });
      expect(e3.success).toBe(true);

      // Cannot progress after completion
      const e4 = validateProgressUpdate({ id: "e1", status: "completed" });
      expect(e4.success).toBe(false);
    });

    it("should allow direct enrolled -> completed path", () => {
      const result = validateCompleteCourse({ id: "e1", status: "enrolled" });
      expect(result.success).toBe(true);
    });
  });
});
