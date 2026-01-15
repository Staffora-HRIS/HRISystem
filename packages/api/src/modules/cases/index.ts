/**
 * Cases Module
 *
 * HR Case Management for employee inquiries, issues, and support requests.
 */

export { casesRoutes, type CasesRoutes } from "./routes";
export { CasesRepository, type TenantContext, type PaginationOptions } from "./repository";
export { CasesService, type ServiceResult } from "./service";
export * from "./schemas";
