/**
 * Cases Module
 *
 * HR Case Management for employee inquiries, issues, and support requests.
 */

export { casesRoutes, type CasesRoutes } from "./routes";
export { CasesRepository, type TenantContext, type PaginationOptions } from "./repository";
export { CasesService } from "./service";
export type { ServiceResult } from "../../types/service-result";
export * from "./schemas";
