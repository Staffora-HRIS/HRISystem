/**
 * Benefits Administration Module
 *
 * Exports all components for the Benefits module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { benefitsRoutes } from "./routes";
export { BenefitsService } from "./service";
export { BenefitsRepository } from "./repository";
export * from "./schemas";
