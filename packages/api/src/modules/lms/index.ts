/**
 * LMS Module
 *
 * Learning Management System for courses, enrollments, and certifications.
 */

export { lmsRoutes, type LmsRoutes } from "./routes";
export { LMSRepository, type TenantContext, type PaginationOptions } from "./repository";
export { LMSService } from "./service";
export type { ServiceResult } from "../../types/service-result";
export * from "./schemas";
