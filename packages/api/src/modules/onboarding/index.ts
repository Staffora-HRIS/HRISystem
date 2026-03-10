/**
 * Onboarding Module
 *
 * Employee onboarding workflows, checklists, and task management.
 */

export { onboardingRoutes, type OnboardingRoutes } from "./routes";
export { OnboardingRepository, type TenantContext, type PaginationOptions } from "./repository";
export { OnboardingService } from "./service";
export type { ServiceResult } from "../../types/service-result";
export * from "./schemas";
