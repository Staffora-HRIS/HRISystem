/**
 * Talent Pools Module
 *
 * Exports all components for the Talent Pools module including:
 * - Routes (Elysia plugin)
 * - Service (business logic)
 * - Repository (data access)
 * - Schemas (TypeBox validation schemas)
 */

export { talentPoolRoutes } from "./routes";
export { TalentPoolService } from "./service";
export { TalentPoolRepository } from "./repository";
export * from "./schemas";
